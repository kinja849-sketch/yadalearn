# Implementation Plan: Fix Rating Calculation Accuracy, Student Rating Isolation, and 12:00 AM Midnight Reset

Comprehensive resolution for the three reported issues:
1. Teacher rating calculation displaying 80% instead of accurate 4-star rating (e.g. 4.0).
2. Student ratings spiking up and receiving teacher ratings when rating the teacher after a session.
3. Teacher's daily rating progress not resetting to 0.0 at 12:00 AM (still showing yesterday's ratings due to past-24h fallback).

---

## 1. Goal
Ensure teacher session ratings calculate and display accurately on a 5-star scale (e.g., 4.0 instead of 80%), completely isolate teacher ratings so they never apply to student profiles or spike student course progress, and enforce a clean 12:00 AM midnight reset for daily ratings based on the teacher's timezone without loading stale ratings.

---

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Workflow rules, stack boundaries, and verification instructions
- `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` — Current project state, env keys, and architectural decisions
- `prompts/fix_meeting_layout_calendar_ratings_bottomnav.md` — Previous plan regarding ratings and schedules
- User uploaded reference screenshot:
  - `media_1792297328991.png` — Split view: Teacher dashboard showing `80% RATING / TODAY'S RATING PROGRESS` with `Avg. Course Rating: 4.0`, and Student dashboard showing `100% COMPLETED / COURSE PROGRESS` with `Active Classes: 0`.
- Source code inspected:
  - `src/pages/TeacherDashboard.tsx` — Liquid rating progress widget and stat displays
  - `src/hooks/useTeacherDashboardData.ts` — Daily rating query, midnight calculation, and past-24h fallback
  - `src/pages/RateTeacher.tsx` — Post-session rating submission, session resolution, and booking status updates
  - `src/pages/StudentDashboard.tsx` — Course progress calculation, booking status filtering, and rating modal
  - `src/hooks/useDashboardData.ts` — Upcoming and unrated classes query
  - `src/features/teacher/quick-actions/RateStudentModal.tsx` — Teacher's weekly student evaluation persistence
  - `src/utils/geo.ts` — Geolocation and IP detection utility
  - `supabase_schema.sql` and `supabase_schema_update.sql` — `session_ratings`, `teacher_profiles`, `student_profiles`, and `bookings` schemas

---

## 3. Assumptions
- **Accurate Rating Display**:
  - The teacher's "Today's Rating Progress" circular widget should display the accurate rating score (e.g., `4.0` out of 5) rather than converting 4.0 into `80%`.
  - The liquid wave inside the widget will still rise smoothly to reflect the rating progress (`(todayAvg / 5.0) * 100%`), but the center typography must show `{stats.todayAvg ? Number(stats.todayAvg).toFixed(1) : "0.0"}` with an appropriate label (e.g. `★ Rating` or `${todayCount} ${todayCount === 1 ? 'Review' : 'Reviews'}`).
  - If no ratings have been submitted today (after 12:00 AM reset), it displays `0.0` with empty liquid.
- **Student Rating Isolation & Progress Integrity**:
  - When a student completes a session and submits feedback in `RateTeacher.tsx`, the rating is strictly for the teacher (`rated_as: 'teacher'`).
  - `RateTeacher.tsx` must NEVER execute a blanket update like `.eq('student_id', currentUserId).eq('teacher_id', targetTeacherId)` on `bookings`, which previously set `status: 'completed'` and `rating: 4` on ALL student bookings.
  - Only the single specific session that concluded (matching booking `id` or `room_id`) is marked completed. Future or other bookings must remain untouched (`status: 'confirmed'`).
  - In `StudentDashboard.tsx`, student course progress must only measure truly completed sessions without falsely counting uncompleted bookings, and session ratings given to teachers must not be branded as the student's own rating.
- **12:00 AM Midnight Reset**:
  - The teacher's daily rating progress must reset to `0.0` at 12:00 AM based on the teacher's local timezone (derived from the browser/IP location).
  - The fallback `if (!todayRatings || todayRatings.length === 0) { ... past24h ... }` in `useTeacherDashboardData.ts` must be removed, as it was directly causing yesterday's old ratings to continue showing after 12:00 AM.
  - The all-time average rating (`Avg. Course Rating`) remains in `teacher_profiles.rating` and displays the overall rating across all sessions, while the daily widget strictly reflects ratings received since 12:00 AM today.

---

## 4. Task Flow

1. **Task 1: Fix Teacher Rating Display & Calculation in `src/pages/TeacherDashboard.tsx` and `src/hooks/useTeacherDashboardData.ts`**
   - **Purpose**: Present the daily rating accurately as `4.0` (on 5-star scale) instead of `80%`.
   - **Dependencies**: None
   - **Files affected**: `src/pages/TeacherDashboard.tsx`, `src/hooks/useTeacherDashboardData.ts`
   - **Verification Gate**: A 4-star rating renders as `4.0` in the center of the liquid dial with 80% liquid fill, never displaying `80%`.

2. **Task 2: Fix 12:00 AM Midnight Reset in `src/hooks/useTeacherDashboardData.ts`**
   - **Purpose**: Calculate local midnight (12:00 AM) based on the teacher's timezone and eliminate the past-24h fallback that kept yesterday's ratings alive.
   - **Dependencies**: Task 1
   - **Files affected**: `src/hooks/useTeacherDashboardData.ts`
   - **Verification Gate**: When no ratings exist for the current calendar day (after 12:00 AM), `todayAvg` is `0.0`, `todayCount` is `0`, and the widget resets cleanly to `0.0`.

3. **Task 3: Eliminate Blanket Booking Overwrite & Isolate Student Ratings in `src/pages/RateTeacher.tsx`**
   - **Purpose**: Stop `RateTeacher.tsx` from updating all bookings for a student. Only complete the specific session that ended, and never assign the teacher rating to the student or to future bookings.
   - **Dependencies**: None
   - **Files affected**: `src/pages/RateTeacher.tsx`
   - **Verification Gate**: Submitting a rating at `/rate-teacher/:id` updates only the ended session and the teacher's ratings; student's other bookings and active classes remain active.

4. **Task 4: Fix Student Dashboard Progress & Schedule Rating Display in `src/pages/StudentDashboard.tsx`**
   - **Purpose**: Ensure student course progress reflects genuine completed sessions without spiking to 100%, and clarify session rating indicators.
   - **Dependencies**: Task 3
   - **Files affected**: `src/pages/StudentDashboard.tsx`
   - **Verification Gate**: Student dashboard accurately reflects active classes count and genuine course progress percentage.

5. **Task 5: Restore Database Integrity for Corrupted Student Bookings**
   - **Purpose**: Reset future bookings (e.g., date `2026-10-16` / upcoming) that were inadvertently marked `completed` back to `confirmed` status with `rating: null`.
   - **Dependencies**: Task 3
   - **Files affected**: Supabase data
   - **Verification Gate**: Active Classes count on student dashboard accurately reflects upcoming sessions.

6. **Task 6: Verification & TypeScript Check**
   - **Purpose**: Run TypeScript compiler checks and verify both dashboards.
   - **Dependencies**: Tasks 1–5
   - **Files affected**: None
   - **Verification Gate**: `cmd /c npx tsc --noEmit` passes with 0 errors.

---

## 5. Files That Will Change
- `src/pages/TeacherDashboard.tsx` [MODIFY] — Change center dial display from `stats.todayProgressPercent%` to accurate rating `4.0`, maintaining proportional wave animation.
- `src/hooks/useTeacherDashboardData.ts` [MODIFY] — Remove past-24h fallback so ratings reset cleanly to 0.0 at 12:00 AM; calculate local midnight using the user's timezone.
- `src/pages/RateTeacher.tsx` [MODIFY] — Remove blanket `.eq('student_id', currentUserId).eq('teacher_id', targetTeacherId)` booking update; only update the specific class/booking that ended.
- `src/pages/StudentDashboard.tsx` [MODIFY] — Ensure course progress calculation does not spike upon rating a teacher; preserve active classes and proper session completion logic.

---

## 6. Implementation Requirements

### A. Accurate Teacher Rating Display (`src/pages/TeacherDashboard.tsx`)
```tsx
{/* Rating Center Value */}
<div className="relative z-10 flex flex-col items-center justify-center select-none text-center">
  <span className="text-4xl font-black text-slate-800 dark:text-white drop-shadow-sm leading-none">
    {stats.todayAvg ? Number(stats.todayAvg).toFixed(1) : "0.0"}
  </span>
  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mt-1.5 flex items-center justify-center gap-1">
    <span className="material-symbols-outlined text-[13px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
    {stats.todayCount > 0 ? `${stats.todayCount} ${stats.todayCount === 1 ? 'Rating' : 'Ratings'}` : 'Rating'}
  </span>
</div>
```
The liquid wave level uses `(stats.todayAvg ? (stats.todayAvg / 5.0) * 100 : 0)` so it visually fills up to 80% for a 4.0 rating and 0% when reset.

### B. Accurate 12:00 AM Midnight Reset (`src/hooks/useTeacherDashboardData.ts`)
```ts
// Calculate 12:00 AM (midnight) of current day in local timezone
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

// Query today's ratings strictly since local midnight
const { data: todayRatings } = await supabase
    .from('session_ratings')
    .select('rating')
    .eq('rated_id', userId)
    .eq('rated_as', 'teacher')
    .gte('created_at', todayStart.toISOString());

// NO fallback to past 24 hours! If todayRatings is empty, it resets cleanly to 0
let todayAvg = 0;
let todayProgressPercent = 0;
let todayCount = 0;

if (todayRatings && todayRatings.length > 0) {
    todayCount = todayRatings.length;
    const sum = todayRatings.reduce((acc: number, curr: any) => acc + (curr.rating || 0), 0);
    todayAvg = Math.round((sum / todayRatings.length) * 10) / 10;
    todayProgressPercent = Math.round((todayAvg / 5.0) * 100);
}
```

### C. Eliminate Blanket Booking Overwrite (`src/pages/RateTeacher.tsx`)
```ts
// ONLY update the specific session that concluded:
if (id) {
  if (isUuidClass) {
    // Check whether id is a booking or live_classes record
    await supabase
      .from('bookings')
      .update({ status: 'completed' })
      .eq('id', id);
    await supabase
      .from('live_classes')
      .update({ status: 'completed' })
      .eq('id', id);
  } else {
    // If id is room_id (e.g. class-teacherId-timestamp)
    await supabase
      .from('live_classes')
      .update({ status: 'completed' })
      .eq('room_id', id);
  }
}
// NEVER run: supabase.from('bookings').update(...).eq('student_id', currentUserId).eq('teacher_id', targetTeacherId)
```

---

## 7. Technology / Library Recommendations
No new packages or libraries are required. All fixes rely on standard JavaScript `Date` / `Intl` APIs and existing Supabase client methods.

---

## 8. API / Integration Strategy
- **Supabase**: Existing `session_ratings`, `teacher_profiles`, and `bookings` tables.
- **Client/Server boundary**: Client uses anon key for queries; no secrets exposed.

---

## 9. Architecture Implications
- Retains existing database schema without migrations.
- Preserves the separation between teacher profiles (which hold `rating`) and student profiles (which do not hold a teacher rating).
- Eliminates side-effects between rating a teacher and student dashboard course progress.

---

## 10. Security Requirements
- Strictly preserve RLS policies and authenticated user tokens.
- No secrets exposed.

---

## 11. Acceptance Criteria
- [ ] In `/teacher-dashboard`, a 4-star session rating displays as `4.0` (with star icon/count), not `80%`.
- [ ] Liquid wave inside the circular widget visually represents the rating progress (e.g. 80% for 4.0), but typography shows `4.0`.
- [ ] At/after 12:00 AM midnight (when no ratings have been submitted today), the teacher's daily rating progress resets to `0.0` and empty liquid, without resurrecting yesterday's ratings.
- [ ] In `/rate-teacher/:id`, submitting feedback for a teacher never modifies unrelated bookings, never marks future bookings as completed, and does not assign the rating to the student.
- [ ] In `/student-dashboard`, student's Active Classes count and Course Progress dial reflect genuine session status without spiking to 100% when rating a teacher.
- [ ] `npx tsc --noEmit` completes with 0 errors.

---

## 12. Checks to Run
- `cmd /c npx tsc --noEmit` for TypeScript compile cleanliness.
- Verify teacher dashboard UI and student dashboard UI in browser.

---

## 13. How to Verify
1. Open `http://localhost:5173/teacher-dashboard` in teacher role.
2. Observe the "Today's Rating Progress" dial:
   - Verify it displays `4.0` (or `0.0` if after midnight reset) and not `80%`.
   - Verify `Avg. Course Rating` shows `4.0`.
3. Open `http://localhost:5173/student-dashboard` in student role:
   - Verify Active Classes count is accurate.
   - Verify Course Progress does not falsely jump to 100%.
4. Complete a test rating flow and confirm only the target teacher receives the rating and no unrelated bookings are corrupted.
