# Implementation Plan — Fix Student "Join Class" Highlighting, Activation, and Direct Join

## 1. Goal
Ensure the "Join Class" quick action on the Student Dashboard prominently highlights and becomes fully functional immediately when a teacher creates a session, redirecting directly into that meeting room upon click, and remaining deactivated when no session has been created.

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` (Workflow rules, zero scope creep, mandatory order)
- `docs/PROJECT_STATE.md` (Video and meeting architecture, Supabase Auth)
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` (Session creation inserting into `live_classes`, `bookings`, and `chat_messages`)
- `src/pages/StudentDashboard.tsx` (`fetchLiveClass`, Quick Actions "Join Class" rendering, active vs disabled styling)
- `supabase_schema_update.sql` (RLS policies on `live_classes` requiring `teacher_student_links` with `status = 'accepted'`)
- Live Supabase inspection of `bookings` and `teacher_student_links`

## 3. Assumptions
- When a teacher creates a session in `CreateSessionModal` (or starts one in `TeacherDashboard`), a session exists for the student.
- The reason `fetchLiveClass` was returning empty on the student side is twofold:
  1. The Supabase RLS policy on `live_classes` requires an accepted row in `teacher_student_links`, but previous scheduling flows only inserted into `bookings` without ensuring `teacher_student_links` existed.
  2. `fetchLiveClass` in `StudentDashboard.tsx` relied on `.like('message', '%/meeting/%')` on `chat_messages` which can fail due to wildcard matching differences or timing before messages sync.
- The "Join Class" icon must be visually **highlighted** when functional: a vibrant purple/indigo gradient, elevated shadow, active badge/ring, and pulsating videocam icon, in contrast to the muted/grayscale disabled state when no session is active.
- When clicked, it navigates directly to `/meeting/${room_id}` without opening any modal dialog.

## 4. Task Flow

### Task 1: Ensure Teacher-Student Link & Broadcast in `CreateSessionModal.tsx`
- **Purpose**: When a teacher creates/schedules a session, ensure `teacher_student_links` is upserted with `{ teacher_id: user.id, student_id: studentId, status: 'accepted' }` for all selected students so that Supabase RLS permits students to read `live_classes`. Also broadcast `session_created` with `{ roomId, teacherId: user.id }` over a realtime channel.
- **Dependencies**: None.
- **Files Affected**: `src/features/teacher/quick-actions/CreateSessionModal.tsx`
- **Risks**: None.
- **Verification Gate**: Upon creating a session, `teacher_student_links` contains the accepted link and the broadcast is sent.

### Task 2: Multi-Source Session Resolution & Realtime Sync in `StudentDashboard.tsx`
- **Purpose**:
  1. Refactor `fetchLiveClass` to check all valid sources:
     - `live_classes` table (`status in ('active', 'scheduled')`).
     - Student's recent messages containing `/meeting/` from `lastMessages` and `chat_messages`.
     - Student's confirmed bookings for today/upcoming with linked teacher room.
  2. Subscribe to real-time events on `live_classes`, `chat_messages`, and `student-live-session-${user.id}` broadcast channel.
  3. Ensure `user?.id` dependency triggers re-fetch the moment auth is resolved.
- **Dependencies**: Task 1.
- **Files Affected**: `src/pages/StudentDashboard.tsx`
- **Risks**: None.
- **Verification Gate**: `liveClassInfo` is immediately populated when a session is created.

### Task 3: Prominent Highlighting and Direct Redirect for "Join Class"
- **Purpose**:
  1. In `StudentDashboard.tsx`, render the "Join Class" quick action with a standout highlighted appearance when `liveClassInfo` is active:
     - Vibrant gradient container with lavender/purple glow and border.
     - Animated pulsing videocam icon with prominent gradient badge.
     - Green "Live / Ready" indicator pill.
     - Clear cursor-pointer and hover scale.
  2. When clicked, immediately executes `navigate('/meeting/' + liveClassInfo.room_id)`.
  3. When `liveClassInfo` is null, retains the dimmed grayscale, disabled `pointer-events-none` state.
- **Dependencies**: Task 2.
- **Files Affected**: `src/pages/StudentDashboard.tsx`
- **Risks**: None.
- **Verification Gate**: The Join Class card visibly lights up when a session is created and clicking it immediately enters `/meeting/:roomId`.

## 5. Files that will change
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` (modify)
- `src/pages/StudentDashboard.tsx` (modify)

## 6. Implementation Requirements
- **Strict Scope Control**: No other files or features modified.
- **Highlighting**: When a teacher creates a session, the student's Join Class icon is visibly highlighted and distinct from the inactive buttons.
- **Direct Joining**: Clicking the highlighted icon navigates straight to `/meeting/${room_id}` without any intermediate modal.
- **Inactivity**: Remains completely disabled and grayscale when no session has been created.

## 7. Technology / library recommendations
- None. Utilizing only existing React, Lucide/Material symbols, Tailwind CSS tokens, and Supabase client.

## 8. API / integration strategy
- Direct Supabase PostgREST queries + Realtime broadcast channel (`student-live-session-${studentId}`).

## 9. Architecture implications
- None; adheres to existing Stream Video meeting route and Supabase Auth.

## 10. Security requirements
- Row-level security preserved; public anon key only.

## 11. Acceptance Criteria
- [ ] When a teacher creates a session via "Create Session", `teacher_student_links` is maintained so students can read `live_classes`.
- [ ] On the Student Dashboard, the "Join Class" quick action icon is prominently highlighted with an active gradient, glowing ring, and live indicator when a teacher-created session exists.
- [ ] Clicking the highlighted "Join Class" icon redirects directly into `/meeting/${roomId}`.
- [ ] When no session has been created by the teacher (or all created sessions are completed/ended), the "Join Class" icon remains disabled and grayscale.
- [ ] TypeScript check (`tsc --noEmit`) and build (`npm run build`) pass cleanly with 0 errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. On the Teacher Dashboard, open "Create Session", select a student, and click "Schedule Session".
2. Open or switch to the Student Dashboard.
3. Observe that the "Join Class" icon under Quick Actions immediately highlights with a glowing purple gradient and active indicator.
4. Click "Join Class" and verify that it redirects straight to `/meeting/${roomId}`.
5. Once the session concludes or is cancelled, observe that "Join Class" returns to its disabled, grayscale state.
