# Implementation Plan: Fix Unload Violation, Stream Credentials Handling, and Dynamic Session Title/Subject Sync

Resolve three critical issues:
1. Modern browser Permissions Policy violation on `unload` in `AuthContext.tsx`.
2. Stream Video API key and secret validation in `StreamProvider.tsx`, `vite.config.ts`, and `Meeting.tsx` to prevent 401 Unauthorized (`AccessKeyError`) and connection crash loops when credentials in `.env` are unconfigured or placeholder.
3. Hardcoded "Mathematics Class" in `CreateSessionModal.tsx`, `StartClassModal.tsx`, and `TeacherDashboard.tsx`, ensuring the modal reflects the teacher's actual teaching subject (e.g., English), dynamically updates the session title when changing subjects, and correctly saves the user's title and subject to `live_classes` and `bookings`.

## 1. Goal
Replace the deprecated `unload` event listener with `pagehide`, safeguard Stream Video initialization against placeholder credentials with clear in-app guidance, and dynamically bind session title and subject to the teacher's profile and subject selector to prevent sessions from defaulting to or saving as "Mathematics Class".

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Mandatory workflow, checklist standards, and project constraints
- `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` — Architectural rules (Supabase Auth, Stream Video as primary provider, no new state libraries)
- `src/contexts/AuthContext.tsx` — Line 151 `window.addEventListener('unload', handleUnload)`
- `src/contexts/StreamProvider.tsx` — Stream client initialization and `VITE_STREAM_API_KEY` verification
- `vite.config.ts` — `/api/get-stream-token` middleware and `STREAM_SECRET`
- `src/pages/Meeting.tsx` — Connection error state and unconfigured credentials screen
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` — Lines 25–48, 151–198, 235–272 where "Mathematics" is hardcoded and subject switching does not update title
- `src/features/teacher/quick-actions/StartClassModal.tsx` — Ad-hoc session defaults and live class startup
- `src/pages/TeacherDashboard.tsx` — Lines 141, 970–1035, 1176–1184 where `nextEvent` is passed to `StartClassModal`
- Attached screenshots (`media_1792075454919.png` and `media_1792076279075.png`)

## 3. Assumptions
- The teacher's actual subjects are available from `user.subjects` / `subjects` in `useAuth()` (e.g. `['English']`).
- When `CreateSessionModal` opens, if the user has not manually customized the title, the subject and title must default to the teacher's primary subject (`${subject} Class`, e.g. "English Class").
- When the teacher clicks a different subject in the subject pills, the title should automatically update to match (`${newSubject} Class`), unless the user explicitly typed a custom title.
- On saving/scheduling:
  - `live_classes.title` must be set to `formData.title.trim() || `${formData.subject} Class``.
  - `live_classes.subject` must be set to `formData.subject`.
  - `bookings.subject` must be set to `formData.subject`.
  - Chat messages and alerts must use the matching title and subject.
- In `TeacherDashboard.tsx`, `nextEvent` must be automatically derived from `teacherSchedule` via `getNextUpcomingEvent(teacherSchedule)` so `StartClassModal` receives the actual upcoming session instead of null.
- In modern browsers, `pagehide` replaces `unload` to comply with the Permissions Policy.
- Stream Video API keys and secrets stored in `.env` must be validated so placeholder values (`YOUR_STREAM_API_KEY`) do not trigger 401 network floods or unhandled WebSocket errors.

## 4. Task Flow
1. **Task 1: Fix Permissions Policy Unload Violation in `AuthContext.tsx`**
   - **Purpose**: Replace `unload` with `pagehide` while maintaining the offline PATCH beacon.
   - **Dependencies**: None
   - **Files affected**: `src/contexts/AuthContext.tsx`
   - **Risks**: None; `pagehide` is W3C standard.
   - **Verification Gate**: Console produces zero `[Violation] Permissions policy violation: unload` errors.

2. **Task 2: Fix Dynamic Title & Subject Binding in `CreateSessionModal.tsx`**
   - **Purpose**: Eliminate hardcoded "Mathematics Class" default. Sync modal initial state to teacher's actual subject(s), auto-update title when teacher clicks another subject pill, and save `formData.title` and `formData.subject` properly into `live_classes` and `bookings`.
   - **Dependencies**: None
   - **Files affected**: `src/features/teacher/quick-actions/CreateSessionModal.tsx`
   - **Risks**: Preserving user-typed custom titles when they type one intentionally.
   - **Verification Gate**: Opening modal with English teacher defaults to "English Class" and "English"; clicking another subject updates both subject and title; submitting writes the correct title and subject to Supabase.

3. **Task 3: Sync `nextEvent` and Start Class Session Defaults in `TeacherDashboard.tsx` & `StartClassModal.tsx`**
   - **Purpose**: Ensure `TeacherDashboard.tsx` dynamically calculates `nextEvent` from `teacherSchedule` and passes it to `StartClassModal`. In `StartClassModal.tsx`, default ad-hoc sessions to the teacher's primary subject instead of generic fallbacks.
   - **Dependencies**: Task 2
   - **Files affected**: `src/pages/TeacherDashboard.tsx`, `src/features/teacher/quick-actions/StartClassModal.tsx`
   - **Risks**: None.
   - **Verification Gate**: "Start Class" correctly presents the upcoming or teacher-specific subject rather than generic/hardcoded fallback.

4. **Task 4: Harden Stream Credentials Validation in `StreamProvider.tsx`, `vite.config.ts`, and `Meeting.tsx`**
   - **Purpose**: Safely detect placeholder credentials (`YOUR_STREAM_API_KEY` / `YOUR_STREAM_SECRET`), prevent unauthorized WebSocket/HTTP loops, and show a clear configuration banner in `Meeting.tsx` instructing the user where to supply real Stream keys in `.env`.
   - **Dependencies**: None
   - **Files affected**: `src/contexts/StreamProvider.tsx`, `vite.config.ts`, `src/pages/Meeting.tsx`
   - **Risks**: Ensure valid Stream keys continue to work seamlessly when provided in `.env`.
   - **Verification Gate**: No 401 console spam; meeting page shows helpful configuration instructions if keys are placeholder, or joins call when valid keys are provided.

5. **Task 5: Typecheck & Build Verification**
   - **Purpose**: Verify with `npx tsc --noEmit` and `npm run build`.
   - **Dependencies**: Tasks 1–4
   - **Files affected**: None
   - **Verification Gate**: TypeScript exits with 0 errors.

## 5. Files that will change
- `src/contexts/AuthContext.tsx` [MODIFY] — Replace `unload` listener with `pagehide`
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` [MODIFY] — Dynamic teacher subject and title synchronization
- `src/features/teacher/quick-actions/StartClassModal.tsx` [MODIFY] — Subject and title synchronization for instant sessions
- `src/pages/TeacherDashboard.tsx` [MODIFY] — Derive `nextEvent` from `teacherSchedule`
- `src/contexts/StreamProvider.tsx` [MODIFY] — Validate API key is not a placeholder before connecting
- `vite.config.ts` [MODIFY] — Validate `STREAM_SECRET` is not placeholder in `/api/get-stream-token`
- `src/pages/Meeting.tsx` [MODIFY] — Clean unconfigured state and error sanitization

## 6. Implementation Requirements
- **In `AuthContext.tsx`**:
  ```tsx
  window.addEventListener('beforeunload', handlePageHide);
  window.addEventListener('pagehide', handlePageHide);
  ```
- **In `CreateSessionModal.tsx`**:
  - Compute teacher's primary subject:
    `const teacherPrimarySubject = (subjects && subjects.length > 0) ? subjects[0] : (user?.subjects && user.subjects.length > 0) ? user.subjects[0] : 'English';`
  - When modal opens (`isOpen`), synchronize form state if untouched.
  - Track `isCustomTitle`: if false (or title matches `${subject} Class`), switching subject updates title to `${newSubject} Class`.
  - When submitting:
    - `live_classes.insert({ title: finalTitle, subject: formData.subject, ... })`
    - `bookings.insert({ subject: formData.subject, ... })`
- **In `TeacherDashboard.tsx`**:
  - `useEffect(() => { setNextEvent(getNextUpcomingEvent(teacherSchedule)); }, [teacherSchedule]);`
- **In `StreamProvider.tsx` & `vite.config.ts`**:
  - Flag placeholder keys (`YOUR_STREAM_API_KEY`, `YOUR_STREAM_SECRET`).
  - Do not initialize WebSocket client if key is placeholder or missing.
  - Expose `isStreamConfigured` in `StreamContext`.
- **In `Meeting.tsx`**:
  - Display helpful guidance card if `!isStreamConfigured` instead of raw JSON connection error.

## 7. Technology / Library Recommendations
- Existing stack only. No new dependencies.

## 8. API / Integration Strategy
- Preserves Supabase schema and Stream Video integration.
- Correctly writes to `live_classes` and `bookings`.

## 9. Architecture Implications
- Maintains strict client-server boundary for secrets.
- Fully backwards-compatible with student and parent views.

## 10. Security Requirements for This Task
- Secrets (`STREAM_SECRET`) remain server-side in Vite/Netlify functions and `.env`.
- No sensitive keys committed or exposed.

## 11. Acceptance Criteria
- [ ] No `unload` violation in console.
- [ ] In "Create Session" modal, title defaults to teacher's actual subject (e.g., "English Class" for an English teacher).
- [ ] Clicking a subject pill in "Create Session" updates both the subject and the title automatically.
- [ ] Submitting the session writes the correct title and subject to `live_classes` and `bookings` (no hardcoded "Mathematics Class").
- [ ] `TeacherDashboard` correctly identifies the upcoming `nextEvent`.
- [ ] No 401 network flood or raw JSON `AccessKeyError` crash when Stream credentials are placeholders.
- [ ] `npx tsc --noEmit` passes with 0 errors.

## 12. Checks to Run
- `npx tsc --noEmit`
- Localhost dev server verification

## 13. How to Verify
1. Open teacher dashboard at `http://localhost:5173/teacher-dashboard`.
2. Click "Create Session".
3. Verify title and subject reflect the teacher's subject ("English Class" / "English").
4. Click another subject (e.g., "Physics") and verify title updates to "Physics Class".
5. Schedule a session and confirm it appears in the schedule with the correct title and subject.
6. Open browser console and verify zero `unload` Permissions Policy violations.
7. Open `/meeting/test-room` and verify the clean configuration message without 401 spam.
