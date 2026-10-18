# Implementation Plan — Direct Session Join/Start & Rating Persistence

## 1. Goal
Enable immediate, direct session redirects on both Student and Teacher dashboards ("Join Class" on student dashboard and "Start Class" on teacher dashboard) while ensuring submitted teacher ratings permanently reflect on the student's daily schedule without re-prompting.

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` (Workflow rules, tech stack constraints, direct execution upon user approval)
- `docs/PROJECT_STATE.md` (Recent state, video architecture via Stream Video, Supabase Auth)
- `docs/DECISIONS.md` (Stream Video as primary meeting provider, no global state additions)
- `src/pages/TeacherDashboard.tsx` (Teacher Quick Actions: "Start Class" action, `nextEvent`, session handling)
- `src/features/teacher/quick-actions/StartClassModal.tsx` (Prior intermediate modal with `roomName` resolution, `live_classes` update to `active`, and navigation to `/meeting/:id`)
- `src/pages/StudentDashboard.tsx` (Student Quick Actions: "Join Class", `showJoinCTA`, `liveClassInfo`, `studentSchedule`, `fetchBookings`, `isRatingModalOpen`, rating submission flow)
- `src/pages/RateTeacher.tsx` (Post-meeting rating submission, booking status update, missing `rating` column update)
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` (Teacher session creation inserting into `live_classes` with `status: 'scheduled'`, `bookings`, and `chat_messages` containing `/meeting/:roomId`)
- `src/hooks/useDashboardData.ts` (Bookings and unrated classes query)
- `supabase_schema*.sql` (Schema for `bookings`, `live_classes`, `session_ratings`, `teacher_student_links`)
- Live Supabase database inspection (`bookings`, `live_classes`, `session_ratings`, confirming unrated booking status for previously submitted ratings)

## 3. Assumptions
- When the teacher clicks "Start Class" on the Teacher Dashboard, it should NOT open an intermediate preview modal; it should immediately begin the scheduled session (or create an active session if none is scheduled), set `status = 'active'` in `live_classes`, and navigate straight to `/meeting/${room_id}`.
- When a session has been created/scheduled by the teacher, "Join Class" under Quick Actions on the Student Dashboard becomes activated. Clicking it redirects directly to `/meeting/${room_id}`. When no session has been created or when all created sessions are completed/ended, it remains deactivated.
- In the student daily schedule, once a teacher has been rated for a session (either via `/rate-teacher/:id` after a meeting or via the in-dashboard rating modal), the session must display `⭐ Rated {rating}` and never revert to showing the "Rate Teacher" button.

## 4. Task Flow

### Task 1: Fix Rating Persistence in `RateTeacher.tsx`
- **Purpose**: Ensure that rating a teacher after a session immediately updates the corresponding booking in `bookings` with `{ status: 'completed', rating: rating }`, so it never appears unrated on the dashboard.
- **Dependencies**: None.
- **Files Affected**: `src/pages/RateTeacher.tsx`
- **Risks**: Ensuring correct booking row is targeted when `id` is a `room_id` string rather than a booking UUID.
- **Verification Gate**: When a rating is submitted via `/rate-teacher/:id`, the student's booking is updated with both `status = 'completed'` and `rating = rating`.

### Task 2: Reconcile and Display Persisted Ratings in `StudentDashboard.tsx`
- **Purpose**: 
  1. In `fetchBookings`, query `session_ratings` for the student so that any past ratings submitted by the student immediately populate `session.rating` even if previously saved with `rating: null` on the booking.
  2. Also auto-repair the booking row in `bookings` if `b.rating` is null but a corresponding rating exists in `session_ratings`.
  3. Ensure the daily schedule renders `⭐ Rated {session.rating}` and hides the "Rate Teacher" button.
  4. In the dashboard's rating modal handler, ensure `bookings` is updated with `{ status: 'completed', rating: ratingValue }` and local state `allBookings` is updated instantaneously.
- **Dependencies**: Task 1.
- **Files Affected**: `src/pages/StudentDashboard.tsx`
- **Risks**: None.
- **Verification Gate**: The user's sessions on 2026-10-18 (16:15 and 16:40) that were already rated immediately display `⭐ Rated 3` and `⭐ Rated 1` instead of the orange "Rate Teacher" button.

### Task 3: Detect Teacher Sessions & Direct "Join Class" Redirect in `StudentDashboard.tsx`
- **Purpose**:
  1. Expand `fetchLiveClass` in `StudentDashboard.tsx` to detect teacher-created sessions (checking `live_classes` for `status in ('active', 'scheduled')` for linked teachers, and checking the latest session booking/chat message with `/meeting/:roomId`).
  2. Maintain real-time sync via `live_classes` and `chat_messages` channel so that the moment a teacher schedules or starts a class, `liveClassInfo` is populated.
  3. Activate "Join Class" in Quick Actions strictly when `!!liveClassInfo` is true.
  4. Make clicking "Join Class" directly execute `navigate('/meeting/' + liveClassInfo.room_id)`.
  5. When no session has been created (or when a session ends/completes), "Join Class" is deactivated and disabled.
- **Dependencies**: None.
- **Files Affected**: `src/pages/StudentDashboard.tsx`
- **Risks**: None.
- **Verification Gate**: "Join Class" activates immediately when a session is created by the teacher, and clicking it navigates directly to `/meeting/${room_id}`.

### Task 4: Immediate "Start Class" Direct Begin in `TeacherDashboard.tsx`
- **Purpose**:
  1. In `TeacherDashboard.tsx`, replace opening `StartClassModal` from the "Start Class" quick action with a direct `handleStartClassDirectly` function.
  2. `handleStartClassDirectly` checks for the teacher's scheduled session (from `live_classes` with `status in ('scheduled', 'active')` or `nextEvent`), sets `status: 'active'` in `live_classes`, and navigates directly to `/meeting/${roomName}`.
  3. If no session is currently scheduled in `live_classes`, generate `roomName = class-${user.id}-${Date.now()}`, insert the active class row in `live_classes`, and immediately navigate to `/meeting/${roomName}`.
- **Dependencies**: None.
- **Files Affected**: `src/pages/TeacherDashboard.tsx`
- **Risks**: None.
- **Verification Gate**: Clicking "Start Class" on the teacher dashboard immediately enters the meeting `/meeting/${roomName}` and activates the session.

### Task 5: Fix Historical Database Records for Immediate Resolution
- **Purpose**: Update the student's two specific bookings for today (16:15 and 16:40) with the ratings (3 and 1) that were already recorded in `session_ratings` so the user sees immediate rectification upon loading.
- **Dependencies**: Tasks 1-4.
- **Files Affected**: Database via Supabase client helper.
- **Risks**: Low.
- **Verification Gate**: Querying `bookings` shows `rating: 3` and `rating: 1` on the completed bookings.

## 5. Files that will change
- `src/pages/RateTeacher.tsx` (modify)
- `src/pages/StudentDashboard.tsx` (modify)
- `src/pages/TeacherDashboard.tsx` (modify)

## 6. Implementation Requirements
- **Strict Scope Control**: No edits to any other files or components.
- **Direct Teacher Start**: "Start Class" on Teacher Dashboard immediately activates the scheduled class and navigates to `/meeting/${roomName}`.
- **Direct Student Join**: "Join Class" on Student Dashboard is active when a teacher session exists, and clicking it navigates directly to `/meeting/${room_id}` without opening `JoinClassModal`.
- **Accurate Student Activation**: "Join Class" is only clickable and styled active when `liveClassInfo` (a session created by the teacher) is present.
- **No Duplicate Rating Prompts**: Whenever a session has been rated, Daily Schedule & Planning must show `⭐ Rated {rating}` and never show "Rate Teacher".

## 7. Technology / library recommendations
- None. Utilizing only existing React, React Router (`useNavigate`), and Supabase JS client already in the repository.

## 8. API / integration strategy
- Direct Supabase PostgREST queries using existing client (`src/lib/supabase.ts`).
- Real-time subscriptions via existing `supabase.channel()` on `live_classes`.

## 9. Architecture implications
- No architectural changes; aligns both dashboards directly with the existing `/meeting/:id` Stream Video route.

## 10. Security requirements
- Public anon key only; all queries respect row-level security and `auth.uid()`.

## 11. Acceptance Criteria
- [ ] On the Teacher Dashboard, clicking "Start Class" immediately activates the scheduled session in `live_classes` and redirects directly to `/meeting/:roomId`.
- [ ] In Quick Actions on the Student Dashboard, "Join Class" is active only when a session created by the teacher exists.
- [ ] Clicking the activated "Join Class" quick action redirects directly to `/meeting/:roomId`.
- [ ] When no session has been created by the teacher (or all created sessions are completed/ended), "Join Class" is deactivated, disabled, and cannot be clicked.
- [ ] Submitting a teacher rating (either in `/rate-teacher/:id` or in the dashboard modal) permanently saves the rating and marks the session as rated.
- [ ] The Daily Schedule & Planning section on the Student Dashboard shows `⭐ Rated {rating}` for rated sessions and never prompts to rate them again.
- [ ] TypeScript type checks (`tsc --noEmit`) and build (`npm run build`) pass cleanly with 0 errors.

## 12. Checks to run
- `npx tsc --noEmit`
- `npm run build`

## 13. How to verify
1. On the Teacher Dashboard (`/teacher-dashboard`), click "Start Class" and verify that it immediately transitions into `/meeting/:roomName` without displaying the modal.
2. On the Student Dashboard (`/student-dashboard`), verify that under "Calendar & Planning" -> "Daily Schedule & Planning", the rated sessions (16:15 and 16:40) show `⭐ Rated 3` and `⭐ Rated 1` instead of "Rate Teacher".
3. When a teacher creates a session via "Create Session" or starts a class in the Teacher Dashboard, return to the Student Dashboard and observe that "Join Class" under Quick Actions is actively illuminated.
4. Click "Join Class" and confirm it redirects straight to `/meeting/${roomId}` without any intermediate modal.
5. In an unrated session, click "Rate Teacher", submit a rating, and confirm it instantly changes to `⭐ Rated {rating}` and persists upon page refresh.
