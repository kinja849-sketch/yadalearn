# Implementation Plan: Fix Student Join Class Highlighting and Direct Meeting Redirect

## 1. Goal
Ensure that whenever a teacher creates or starts a session with a student included, the student's "Join Class" button on the Student Dashboard immediately activates and highlights (pulsing videocam, glowing purple ring, green live dot), and clicking it routes directly into the created meeting room (`/meeting/${roomId}`), remaining completely disabled and grayscale when no session has been created.

---

## 2. What Was Read & Inspected
- `AGENTS.md` and `.agents/AGENTS.md`: Mandatory engineering rules, workflow, and plan template requirements.
- `docs/PROJECT_STATE.md`: Recent updates on meeting routing, ratings, and state handling.
- `src/pages/StudentDashboard.tsx`: Quick action buttons, `fetchLiveClass`, `fetchBookings`, `studentSchedule`, `nextEvent`, and realtime channels (`live-classes-student`, `student-bookings-${studentId}`, `student-session-msgs-${studentId}`).
- `src/features/teacher/quick-actions/CreateSessionModal.tsx`: Teacher scheduling logic, room ID format, student linking upsert failure on `teacher_student_links`, `bookings` insert, chat notification, and broadcast.
- `src/pages/TeacherDashboard.tsx`: Direct "Start Class" action, deterministic room naming, and status setting.
- `src/hooks/useDashboardData.ts`: 24h vs 12h time regex bug preventing `time: '18:30'` from populating upcoming classes.
- `supabase_schema.sql` and `supabase_schema_update.sql`: Table definitions, CHECK constraints (`live_classes.status` in `'scheduled'`, `'live'`, `'ended'`, `'cancelled'`), and RLS policies on `live_classes` and `teacher_student_links`.
- Live Supabase database state: Inspected existing bookings, profiles, and RLS behavior via Node scripts.

---

## 3. Assumptions & Root Cause Analysis
1. **Broken `teacher_student_links` Upsert**: `CreateSessionModal.tsx` ran `.upsert(..., { onConflict: 'teacher_id,student_id' })`, but `teacher_student_links` has no unique constraint on those two columns. This threw a Postgres error, preventing accepted link rows from being created. Without an accepted link, Supabase RLS policy `Linked students view classes` blocked students from reading `live_classes` or receiving realtime `live_classes` changes.
2. **Disconnected Quick Action State in `StudentDashboard.tsx`**: The "Join Class" quick action card was bound purely to a single state variable `liveClassInfo` (`useState`). If `fetchLiveClass()` encountered RLS blocks or finished after bookings, it called `setLiveClassInfo(null)`, keeping the button greyed out and disabled.
3. **Mismatched Room IDs**: `CreateSessionModal.tsx` generated `class-${teacherId}-${Date.now()}` while `TeacherDashboard.tsx` and `StudentDashboard.tsx` used `class-${teacherId}-${date}`.
4. **Premature Auto-Reconciliation of Bookings**: In `fetchBookings()`, newly scheduled classes whose scheduled time was slightly in the past (e.g. scheduled at 18:30, viewed at 18:35) were erroneously classified as completed due to `bookingTime <= now` and matched to old `session_ratings` records.
5. **Realtime Booking Listener Gap**: In `StudentDashboard.tsx`, the `bookings` realtime listener only invoked `fetchLiveClass()` and did not reload `allBookings`.

---

## 4. Task Flow
1. **Task 1: Fix Link Integrity and Room ID Consistency in Teacher Session Creation**
   - **Files**: `src/features/teacher/quick-actions/CreateSessionModal.tsx`, `src/pages/TeacherDashboard.tsx`
   - **Action**: Replace failing upsert on `teacher_student_links` with explicit check-and-insert/update. Align room format to deterministic `class-${teacherId}-${sessionDate}` so teacher and student enter identical rooms. On "Start Class" in Teacher Dashboard, broadcast session start to linked students and set `status: 'live'`.
   - **Verification Gate**: Session creation succeeds without console errors and writes both link and booking.

2. **Task 2: Fix Time Parsing in `useDashboardData.ts`**
   - **Files**: `src/hooks/useDashboardData.ts`
   - **Action**: Support both 24-hour (`HH:MM`) and 12-hour (`hh:mm AM/PM`) formats so 24-hour time values (like `18:30`) are parsed accurately instead of defaulting to Jan 1, 1970.
   - **Verification Gate**: Scheduled classes with 24h format appear in `upcomingClasses`.

3. **Task 3: Unify Session Derivation and Direct Highlighting in `StudentDashboard.tsx`**
   - **Files**: `src/pages/StudentDashboard.tsx`
   - **Action**: 
     - Resolve `studentId` immediately with fallback to cached user so hooks and subscriptions never initialize with `undefined`.
     - Compute `activeLiveClass` using `useMemo` combining `liveClassInfo`, `allBookings` (today's unrated confirmed/active booking, or any recent unrated confirmed booking), and `nextEvent`.
     - Stop premature completion of `confirmed` bookings in `fetchBookings()`.
     - Trigger both `fetchLiveClass()` and `fetchBookings()` on realtime booking updates.
     - Bind the "Join Class" card rendering, pulsing animation, live dot, and `onClick` directly to `activeLiveClass`.
   - **Verification Gate**: Button highlights purple with live dot whenever a booking exists for the student; clicking routes to `/meeting/${room_id}`.

4. **Task 4: Build Verification & End-to-End Checks**
   - **Commands**: `npx tsc --noEmit`, `npm run build`
   - **Verification Gate**: Zero TypeScript or build errors.

---

## 5. Files That Will Change
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` (modify)
- `src/pages/TeacherDashboard.tsx` (modify)
- `src/hooks/useDashboardData.ts` (modify)
- `src/pages/StudentDashboard.tsx` (modify)

---

## 6. Implementation Requirements
- **Immediate Visual Activation**: When a teacher creates a session for a student or clicks start class, the student dashboard's "Join Class" quick action card MUST visually activate (purple gradient border, glowing ring, pulsing videocam icon with gradient badge, green live pulse indicator).
- **Direct Navigation**: Clicking the highlighted card navigates directly to `/meeting/${roomId}` without any intermediate modal or prompt.
- **Strict Inactivity**: When no session has been created for the student, or when the session has concluded and was rated, the card must remain disabled, grayscale (`opacity-50 cursor-not-allowed pointer-events-none grayscale`).
- **No Side Effects**: Strictly preserve existing layouts, charts, navigation, and other quick actions.

---

## 7. Technology / Library Recommendations
- No new libraries needed; uses existing React 18 hooks, Supabase JS client, and Tailwind CSS.

---

## 8. API / Integration Strategy
- Uses Supabase client for queries and Postgres realtime subscriptions on `bookings` and `live_classes`.
- Uses deterministic room naming `class-${teacherId}-${date}` across teacher start and student join.

---

## 9. Architecture Implications
- Preserves client-side React architecture and existing Supabase RLS security policies.
- Removes single-point-of-failure dependency on ephemeral broadcast events by backing state with persistent database queries and memoized derivation.

---

## 10. Security Requirements
- All database operations respect user auth tokens.
- No secrets exposed to the client.

---

## 11. Acceptance Criteria
- [ ] When a teacher schedules a session selecting a student, the student dashboard detects the session and highlights "Join Class".
- [ ] When a teacher clicks "Start Class" on the teacher dashboard, the student dashboard detects the session and highlights "Join Class".
- [ ] Clicking the highlighted "Join Class" card immediately routes to `/meeting/${roomId}` for both teacher and student.
- [ ] When no session exists for the student, "Join Class" is disabled and greyed out.
- [ ] Rating a session marks it complete and deactivates "Join Class".
- [ ] `npx tsc --noEmit` and `npm run build` pass with 0 errors.

---

## 12. Checks to Run
- `npx tsc --noEmit`
- `npm run build`

---

## 13. How to Verify
1. Log in as teacher (`Su Myat Yadanar Thein` or `Phyu sin Yadanar Thein`).
2. Open "Create Session", select a student (e.g. `Najib Abdirahman`), and schedule a class.
3. Open Student Dashboard as that student (`/student-dashboard`).
4. Verify the "Join Class" quick action icon is highlighted with purple pulsing videocam and green live pulse dot.
5. Click "Join Class" and verify it navigates directly to `/meeting/class-${teacherId}-${sessionDate}`.
6. Verify on a student account with no scheduled sessions that "Join Class" is greyed out, disabled, and non-clickable.
