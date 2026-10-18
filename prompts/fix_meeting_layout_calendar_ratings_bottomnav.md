# Implementation Plan: Fix Meeting Mute Icon, Mobile/Desktop Layout Measurements, Fixed BottomNav, Calendar Plans Sync, and Rating/Progress Flow

Comprehensive resolution for the 5 reported issues:
1. False-positive mute icon in live meetings when mic is actually unmuted.
2. Equal 50/50 vertical stretch meeting layout on mobile and desktop (aligning measurements with Google Meet & Zoom standards).
3. Bottom navigation bar moving with scroll on mobile instead of being fixed/glued to the viewport bottom.
4. Calendar not reflecting scheduled sessions and plans in Teacher Dashboard and Calendar views.
5. Rating flow and progress updates: Teacher session ratings not appearing on Today's Rating Progress after sessions, and Student Course Progress weekly evaluation persistence.

---

## 1. Goal
Align meeting video gallery layout geometry with Google Meet and Zoom mobile/desktop standards, fix the microphone mute state detection, glue BottomNav permanently to the mobile viewport using portal mounting, unify calendar events across `live_classes` and `bookings` with visual date dots, and persist teacher-student ratings so that post-session ratings and weekly course progress update accurately.

---

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Mandatory workflow, tech stack, and verification requirements
- `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` — Architectural rules and active environment keys
- Web search on Google Meet and Zoom mobile 2-participant portrait/landscape behaviors
- User uploaded reference screenshots:
  - `media_1792083681815.png` — Teacher dashboard with 0% Rating and BottomNav overlapping cards
  - `media_1792083697530.png` — Meeting screen with 2 participants squeezed into two 50% vertical columns in portrait, both showing false-positive mic-mute icons
  - `media_1792083720237.png` & `media_1792083727912.png` — Google Meet 49-participant dense grid reference
  - `media_1792083832418.png` — Calendar with Day 16 showing "No Scheduled Plans" despite active student bookings, and BottomNav floating
- Source files inspected:
  - `src/pages/Meeting.tsx` — `CustomVideoPlaceholder`, `CustomParticipantViewUI`, and `DynamicMeetGalleryGrid`
  - `src/components/BottomNav.tsx` — Bottom navigation bar positioning
  - `src/pages/TeacherDashboard.tsx` — Calendar widget, `todayProgressPercent`, and layout container
  - `src/pages/TeacherCalendar.tsx` — Calendar events fetch
  - `src/hooks/useTeacherDashboardData.ts` — `teacherSchedule`, `todayRatings`, and stats
  - `src/pages/RateTeacher.tsx` — Teacher rating submission and teacherId extraction
  - `src/features/teacher/quick-actions/RateStudentModal.tsx` — Weekly student rating submission
  - `src/pages/StudentDashboard.tsx` — Student progress percentage

---

## 3. Assumptions
- **Mute Icon**: A participant's mic status must use `useMicrophoneState()` for the local participant and `hasAudio(participant)` from `@stream-io/video-client` for remote participants, rather than `!participant.isAudioEnabled` which defaults to false.
- **Meeting Geometry (Google Meet & Zoom Standard)**:
  - On mobile portrait (width < height): 2 participants must be stacked vertically (1 column, 2 rows) with ~16:9 or ~4:3 widescreen video aspect ratios and centered layout, rather than split into two 50% vertical columns.
  - On desktop/landscape (width >= height): 2 participants must sit side-by-side (2 columns, 1 row) with authentic ~16:9 ratio centered on the stage (`max-w-[calc(50%-8px)] max-h-[85%] aspect-video`).
  - Video elements use `object-cover` with `aspect-video` containment so faces are centered without vertical distortion.
- **BottomNav Glued to Bottom**:
  - `BottomNav` must be mounted using React `createPortal(..., document.body)` so it escapes any ancestor scroll, flex, or transform contexts and stays permanently glued to `position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); z-index: 999;` on mobile.
- **Calendar & Planning**:
  - `TeacherDashboard.tsx` and `TeacherCalendar.tsx` must unify both `live_classes` and `bookings` into the schedule.
  - Dates with scheduled sessions must display an orange indicator dot under the day number.
  - Clicking any date displays the unified scheduled plans for that date.
- **Ratings & Course Progress**:
  - In `RateTeacher.tsx`, extracting `teacherId` from room IDs formatted like `class-[uuid]-[timestamp]` must properly match the 36-character UUID pattern `([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})` rather than `id.split('-')`.
  - In `useTeacherDashboardData.ts`, `todayRatings` must query all ratings where `rated_id = userId` and `rated_as = 'teacher'` within the current 24-hour cycle and update `todayProgressPercent` immediately.
  - In `RateStudentModal.tsx`, weekly student evaluation must insert real rows into `session_ratings` (`rated_as: 'student'`) and update the student's weekly progress.

---

## 4. Task Flow

1. **Task 1: Fix False-Positive Mute Icon in `src/pages/Meeting.tsx`**
   - **Purpose**: Ensure the mute badge (`mic_off`) only shows when the participant's microphone is truly muted.
   - **Dependencies**: None
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Verification Gate**: Unmuted participants (local and remote) do not display the red/grey `mic_off` icon.

2. **Task 2: Align Meeting Video Gallery Geometry with Google Meet & Zoom Standards**
   - **Purpose**: Calculate responsive column/row layout and aspect-ratio containment based on container dimensions $(W, H)$:
     - In portrait mode: 2 participants stack vertically (1 col $\times$ 2 rows).
     - In landscape mode: 2 participants sit side-by-side (2 cols $\times$ 1 row).
     - Tiles maintain authentic ~16:9 / 4:3 widescreen proportions centered on the stage without stretching into vertical pillars.
   - **Dependencies**: Task 1
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Verification Gate**: Portrait mobile viewport displays 2 stacked 16:9 tiles; desktop landscape displays 2 side-by-side 16:9 tiles.

3. **Task 3: Permanently Glue `BottomNav` to Viewport Bottom**
   - **Purpose**: Render `BottomNav` via `createPortal(..., document.body)` with `fixed bottom-4 md:hidden z-[999]`.
   - **Dependencies**: None
   - **Files affected**: `src/components/BottomNav.tsx`, `src/pages/TeacherDashboard.tsx`
   - **Verification Gate**: Scrolling the teacher or student dashboard leaves `BottomNav` permanently pinned to the bottom of the screen.

4. **Task 4: Unify Calendar Events and Add Date Indicators**
   - **Purpose**: In `useTeacherDashboardData.ts` and `TeacherCalendar.tsx`, combine `live_classes` and `bookings`. In `TeacherDashboard.tsx`, show dot indicators under dates with scheduled sessions and display sessions when clicking any date.
   - **Dependencies**: None
   - **Files affected**: `src/hooks/useTeacherDashboardData.ts`, `src/pages/TeacherDashboard.tsx`, `src/pages/TeacherCalendar.tsx`
   - **Verification Gate**: Scheduled classes appear under the selected calendar date, and the calendar numbers show orange dots for dates with events.

5. **Task 5: Fix Rating Resolution and Progress Calculation**
   - **Purpose**: Fix regex UUID extraction in `RateTeacher.tsx` so ratings persist to `session_ratings` for the correct teacher. In `useTeacherDashboardData.ts`, recalculate `todayProgressPercent` immediately. In `RateStudentModal.tsx`, write student evaluations to Supabase.
   - **Dependencies**: None
   - **Files affected**: `src/pages/RateTeacher.tsx`, `src/hooks/useTeacherDashboardData.ts`, `src/features/teacher/quick-actions/RateStudentModal.tsx`, `src/pages/StudentDashboard.tsx`
   - **Verification Gate**: Completing a rating as student immediately updates the teacher's "Today's Rating Progress" percentage; teacher submitting weekly student evaluation records progress.

6. **Task 6: TypeScript Typecheck & Runtime Verification**
   - **Purpose**: Verify compile cleanliness via `cmd /c npx tsc --noEmit`.
   - **Dependencies**: Tasks 1–5
   - **Files affected**: None
   - **Verification Gate**: 0 TypeScript errors.

---

## 5. Files That Will Change
- `src/pages/Meeting.tsx` [MODIFY] — Mute status detection and responsive Google Meet/Zoom video tile geometry
- `src/components/BottomNav.tsx` [MODIFY] — Portal-mount fixed bottom navigation
- `src/pages/TeacherDashboard.tsx` [MODIFY] — Calendar date indicators and unified event filtering
- `src/hooks/useTeacherDashboardData.ts` [MODIFY] — Unify `live_classes` and `bookings` into `teacherSchedule`, fix daily rating query
- `src/pages/TeacherCalendar.tsx` [MODIFY] — Fetch both `live_classes` and `bookings`
- `src/pages/RateTeacher.tsx` [MODIFY] — Regex extraction of teacher UUID from room IDs and session linking
- `src/features/teacher/quick-actions/RateStudentModal.tsx` [MODIFY] — Persist weekly evaluations to `session_ratings`
- `src/pages/StudentDashboard.tsx` [MODIFY] — Reflect weekly evaluation in student progress

---

## 6. Implementation Requirements
- **Mute Detection**:
  ```tsx
  import { hasAudio } from '@stream-io/video-client';
  const { isMute: isLocalMicMuted } = useMicrophoneState();
  const isMuted = isSelf ? isLocalMicMuted : !hasAudio(participant);
  ```
- **Responsive Video Gallery**:
  - Measure container with `ResizeObserver` / `useMemo`.
  - If `isPortrait` ($W < H$):
    - 1 participant: 1 col $\times$ 1 row
    - 2 participants: 1 col $\times$ 2 rows (vertical stack)
    - 3–4 participants: 2 cols $\times$ 2 rows
  - If `isLandscape` ($W \ge H$):
    - 1 participant: 1 col $\times$ 1 row
    - 2 participants: 2 cols $\times$ 1 row (horizontal side-by-side with 16:9 ratio)
    - 3–4 participants: 2 cols $\times$ 2 rows
    - 5–6 participants: 3 cols $\times$ 2 rows
- **BottomNav Portal**:
  ```tsx
  import { createPortal } from 'react-dom';
  return createPortal(
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-md ... z-[999]">...</nav>,
    document.body
  );
  ```
- **Calendar Dots & Unified Events**:
  - `teacherSchedule`: merge records from `live_classes` and confirmed `bookings` (deduplicating by room/id).
  - Add dot: `{hasEvents && <span className="w-1 h-1 rounded-full bg-orange-500 ..."></span>}`.
- **Teacher Rating Resolution**:
  - Match UUID regex: `id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)`.
  - Set `targetTeacherId = match[1]`.
  - Recalculate and update `teacher_profiles.rating` and `session_ratings`.

---

## 7. Technology / Library Recommendations
- Existing dependencies only (`react-dom`, `@stream-io/video-client`, `@stream-io/video-react-sdk`, Lucide, Supabase).

## 8. API / Integration Strategy
- Uses Supabase Postgres tables (`session_ratings`, `bookings`, `live_classes`, `teacher_profiles`).
- Real-time broadcast channel `teacher-ratings-${userId}` triggers instant dashboard recalculation.

## 9. Architecture Implications
- Preserves client-server boundary and all existing design tokens.
- No database migrations required (uses existing columns).

## 10. Security Requirements
- All database queries scoped to authenticated `user.id`.
- Secrets remain server-side in `.env`.

---

## 11. Acceptance Criteria
- [ ] In meetings, the `mic_off` icon disappears when the participant's microphone is turned on.
- [ ] On mobile portrait viewports, 2 participants stack vertically (one top, one bottom) preserving widescreen 16:9 proportions.
- [ ] On desktop/landscape viewports, 2 participants sit side-by-side with 16:9 aspect ratio and do not stretch vertically.
- [ ] Bottom navigation bar is permanently fixed to the viewport bottom on mobile and never moves with scrolling.
- [ ] Calendar in Teacher Dashboard and Calendar view displays scheduled classes for the selected date and shows date dots for days with plans.
- [ ] Rating a teacher after a session immediately updates "Today's Rating Progress" percentage on the Teacher Dashboard.
- [ ] Weekly student evaluation in `RateStudentModal` persists to Supabase and updates student course progress.
- [ ] `cmd /c npx tsc --noEmit` exits with 0 errors.

---

## 12. Checks to Run
- `cmd /c npx tsc --noEmit`
- Local dev server verification on mobile and desktop viewports

## 13. How to Verify
1. Open [http://localhost:5173/meeting/test-session](http://localhost:5173/meeting/test-session) in mobile device emulation mode (portrait): verify 2 participants are stacked vertically with 16:9 ratio and mic icon reflects real mic state.
2. Rotate to landscape or test on desktop: verify 2 participants are side-by-side with 16:9 ratio.
3. Open [http://localhost:5173/teacher-dashboard](http://localhost:5173/teacher-dashboard) on mobile viewport: scroll down and verify `BottomNav` stays glued to the bottom of the screen.
4. Check the calendar in Teacher Dashboard: verify scheduled dates have indicator dots and clicking Day 15 or 16 shows the scheduled session.
5. Submit a rating at [http://localhost:5173/rate-teacher/test-session](http://localhost:5173/rate-teacher/test-session) and verify Today's Rating Progress updates on the dashboard.
