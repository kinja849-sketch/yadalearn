# Fix Bookings Status 400 Error and Eliminate UI Latency for Immediate Response

## 1. Goal
Resolve the HTTP 400 Bad Request error returned when updating expired bookings in Supabase by adhering to the PostgreSQL `bookings_status_check` constraint (`status: 'rejected'`), batching database operations, and running background session cleanups non-blockingly to guarantee zero UI latency and immediate dashboard responses.

## 2. What it read
- `AGENTS.md` (§1 to §19)
- `docs/PROJECT_STATE.md`
- `supabase_schema.sql` (line 184: `status TEXT CHECK (status IN ('pending', 'confirmed', 'rejected'))`)
- `supabase_schema_update.sql` (line 11: `ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'rejected', 'completed'))`)
- `src/utils/sessionManager.ts`
- `src/pages/StudentDashboard.tsx`
- `src/pages/TeacherDashboard.tsx`

## 3. Assumptions
- In Supabase, the `bookings` table enforces a CHECK constraint `bookings_status_check` allowing only `'pending'`, `'confirmed'`, `'rejected'`, and `'completed'`. Setting `status = 'cancelled'` on `bookings` causes PostgreSQL to throw a check constraint violation resulting in HTTP 400 Bad Request (`Failed to load resource: the server responded with a status of 400`).
- The canonical cancelled/declined status for `bookings` in this database schema is `'rejected'` (as used in `TeacherDashboard.tsx` line 515: `update({ status: 'rejected' })`).
- In `StudentDashboard.tsx` and `TeacherDashboard.tsx`, session filtering already handles both `'cancelled'` and `'rejected'` (`b.status !== 'cancelled' && b.status !== 'rejected'`).
- The perceived UI delay was caused by `StudentDashboard.tsx` synchronously awaiting `checkAndAutoCancelExpiredSessions` before querying active classes, combined with sequential per-record updates in a `for` loop. Decoupling this cleanup into a non-blocking background task with batch `.in('id', ids)` updates delivers an immediate response.

## 4. Task Flow
1. **Task 1: Schema-Compliant Status & Batching in `sessionManager.ts`**
   - Purpose: Update `src/utils/sessionManager.ts` to update `bookings` with `{ status: 'rejected' }` instead of `'cancelled'`, eliminating the 400 Bad Request error. Collect expired IDs and batch-update using `.in('id', expiredIds)` to make network execution instant.
   - Files: `src/utils/sessionManager.ts`
   - Dependencies: None
   - Verification Gate: Code review confirming no `'cancelled'` status written to `bookings`, and `.in('id', ...)` batching in place.
2. **Task 2: Non-Blocking Execution in `StudentDashboard.tsx` & `TeacherDashboard.tsx`**
   - Purpose: Remove the blocking `await` on `checkAndAutoCancelExpiredSessions` in `fetchLiveClass` so `live_classes` is queried and rendered immediately with 0ms delay. Batch any expired session cleanups in `TeacherDashboard.tsx` as well.
   - Files: `src/pages/StudentDashboard.tsx`, `src/pages/TeacherDashboard.tsx`
   - Dependencies: Task 1
   - Verification Gate: Code review confirming `fetchLiveClass` runs without blocking on background cleanup.
3. **Task 3: Compilation, Build & Quality Checks**
   - Purpose: Run TypeScript compiler and production build to guarantee 0 regressions or type errors.
   - Files: None (verification step)
   - Dependencies: Task 1 and Task 2
   - Verification Gate: `npx tsc --noEmit` exits with 0 errors; `npm run build` exits with 0 errors.
4. **Task 4: Update Persistent Documentation**
   - Purpose: Record changes and verification results in `docs/PROJECT_STATE.md`.
   - Files: `docs/PROJECT_STATE.md`
   - Dependencies: Task 3
   - Verification Gate: `docs/PROJECT_STATE.md` accurately describes the fix.

## 5. Files that will change
- `src/utils/sessionManager.ts` (modify)
- `src/pages/StudentDashboard.tsx` (modify)
- `src/pages/TeacherDashboard.tsx` (modify)
- `docs/PROJECT_STATE.md` (modify)

## 6. Implementation requirements
- **Status Value**: `bookings.update({ status: 'rejected' })` strictly used for expired bookings. Never write `status: 'cancelled'` to `bookings`.
- **Immediate Response**:
  - `fetchLiveClass` in `StudentDashboard.tsx` must trigger `checkAndAutoCancelExpiredSessions` as a background task (`checkAndAutoCancelExpiredSessions(...).catch(...)`) without blocking the live class query or UI render.
  - In `sessionManager.ts`, all expired class IDs and booking IDs must be accumulated into arrays and updated in batch via `.in('id', ids)`.
- **Zero Regressions**: Existing 1-hour auto-cancellation logic and link nullification must remain intact.

## 7. Technology / library recommendations
- No new libraries needed; existing Supabase JS client and React state hooks are used.

## 8. API / integration strategy
- Direct Supabase PostgREST queries over client HTTPS.
- Batch `.update(...).in('id', ids)` minimizes HTTP requests to a single batch call.
- Status values strictly adhere to the database CHECK constraint `bookings_status_check`.

## 9. Architecture implications
- Keeps the client-database boundary clean and respects PostgreSQL constraints.
- Prevents UI blocking during background maintenance tasks.

## 10. Security requirements
- Preserves existing RLS policies on `bookings` and `live_classes`.
- Uses authenticated user context for queries.

## 11. Acceptance criteria
- [ ] No HTTP 400 error on `yxqezrvgvfwdgrlwczea.supabase.co/rest/v1/bookings?id=eq...`.
- [ ] Expired bookings older than 60 minutes are marked with `status: 'rejected'` in Supabase in a single batch request.
- [ ] Student Dashboard loads active live classes immediately without delay.
- [ ] `cmd.exe /c npx.cmd tsc --noEmit` compiles with 0 errors.
- [ ] `cmd.exe /c npm.cmd run build` completes with 0 errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open the browser DevTools Console and Network tab.
2. Load the Student Dashboard (`/student-dashboard`).
3. Verify that the dashboard loads immediately with zero delay.
4. Verify that no 400 Bad Request error occurs on `rest/v1/bookings`.
5. Confirm that expired bookings or classes older than 1 hour are not shown as active.
