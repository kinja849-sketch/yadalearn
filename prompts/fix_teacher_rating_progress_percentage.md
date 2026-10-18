# Implementation Plan: Fix Teacher Rating Progress Percentage Calculation

Implement substantial percentage-based calculation for Today's Rating Progress in the Teacher Dashboard so that a single student's 4-star rating contributes proportionately rather than instantly jumping to 80%.

---

## 1. Goal
Calculate the teacher's "Today's Rating Progress" as a cumulative percentage of maximum possible rating points across registered students (e.g. 4 points out of 15 max points for 3 students = 27%), displaying the accurate percentage in the center dial.

---

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Workflow rules and approval requirements
- User request:
  > "Instead of using 0.5 or 0.4 for the rating, I want it to be done in percentage. If one student has rated the teacher with a 4-star rating, that rating should be substantial to the percentage, meaning that it shouldn't jump to 80% immediately since it's from one student. This is what I'm speaking about. That is the implementation of the idea that I'm going for, so let's just focus on that. Make sure that it's reflected and nothing else is touched or changed."
- Source files:
  - `src/hooks/useTeacherDashboardData.ts` — `todayProgressPercent` calculation and `stats`
  - `src/pages/TeacherDashboard.tsx` — Liquid wave widget and center percentage rendering

---

## 3. Assumptions
- **Percentage Progress Calculation**:
  - The teacher's daily rating progress represents progress towards the maximum rating points achievable today.
  - Maximum points target is based on the teacher's student volume: `targetStudentCount = Math.max(studentsList.length, 1)`.
  - Max possible rating points: `maxPossiblePoints = targetStudentCount * 5`.
  - Points earned today: `sum = todayRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0)`.
  - Percentage: `todayProgressPercent = Math.min(100, Math.round((sum / maxPossiblePoints) * 100))`.
  - Example: For a teacher with 3 registered students (as shown on the dashboard), if 1 student submits a 4-star rating:
    - Earned: 4
    - Max possible: 3 * 5 = 15
    - Progress: `(4 / 15) * 100 = 27%`.
    - It does not jump to 80% immediately from just one student, but accurately reflects that one student's substantial portion.
  - If 0 ratings today (after 12:00 AM reset): `0%`.
- **UI Display**:
  - The center of the circular liquid widget displays `{Math.round(stats.todayProgressPercent || 0)}%` with the `Rating` subtitle.
  - The animated liquid wave fills to `stats.todayProgressPercent%`.
  - The top summary continues to show the all-time 5-star course average: `Avg. Course Rating: 4.0`.
- **Scope**:
  - Only update `useTeacherDashboardData.ts` and `TeacherDashboard.tsx` for this percentage calculation and display.
  - Nothing else is touched or changed.

---

## 4. Task Flow

1. **Task 1: Update `todayProgressPercent` in `src/hooks/useTeacherDashboardData.ts`**
   - **Purpose**: Calculate `todayProgressPercent` based on total earned rating points vs `totalStudents * 5` maximum points.
   - **Dependencies**: None
   - **Files affected**: `src/hooks/useTeacherDashboardData.ts`
   - **Verification Gate**: 1 student rating 4 stars for a teacher with 3 students yields `27%` instead of `80%`.

2. **Task 2: Update Widget Center Display in `src/pages/TeacherDashboard.tsx`**
   - **Purpose**: Render `{Math.round(stats.todayProgressPercent || 0)}%` in the center of the circular dial with the `Rating` label.
   - **Dependencies**: Task 1
   - **Files affected**: `src/pages/TeacherDashboard.tsx`
   - **Verification Gate**: Dial displays `27%` (or current calculated percentage) and liquid wave sits at 27% height.

3. **Task 3: Typecheck and Verification**
   - **Purpose**: Verify compile cleanliness via `cmd /c npx tsc --noEmit`.
   - **Dependencies**: Tasks 1–2
   - **Files affected**: None
   - **Verification Gate**: 0 TypeScript errors.

---

## 5. Files That Will Change
- `src/hooks/useTeacherDashboardData.ts` [MODIFY] — Compute cumulative percentage based on total possible student rating points.
- `src/pages/TeacherDashboard.tsx` [MODIFY] — Render `{Math.round(stats.todayProgressPercent || 0)}%` in center of widget.

---

## 6. Implementation Requirements

### `src/hooks/useTeacherDashboardData.ts`
```ts
// Calculate cumulative rating progress percentage towards max possible points
const targetStudentCount = Math.max(studentsList.length, 1);
const maxPossiblePoints = targetStudentCount * 5;

let todayAvg = 0;
let todayProgressPercent = 0;
let todayCount = 0;

if (todayRatings && todayRatings.length > 0) {
    todayCount = todayRatings.length;
    const sum = todayRatings.reduce((acc: number, curr: any) => acc + (curr.rating || 0), 0);
    todayAvg = Math.round((sum / todayRatings.length) * 10) / 10;
    todayProgressPercent = Math.min(100, Math.round((sum / maxPossiblePoints) * 100));
}
```

### `src/pages/TeacherDashboard.tsx`
```tsx
{/* Rating Percentage Center Value */}
<div className="relative z-10 flex flex-col items-center justify-center select-none text-center">
  <span className="text-4xl font-black text-slate-800 dark:text-white drop-shadow-sm leading-none">
    {Math.round(stats.todayProgressPercent || 0)}%
  </span>
  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mt-1.5">Rating</span>
</div>
```

---

## 7. Technology / Library Recommendations
No new libraries. Uses existing state and hooks.

---

## 8. API / Integration Strategy
Preserves existing Supabase queries and realtime subscriptions.

---

## 9. Architecture Implications
Zero breaking changes or schema migrations.

---

## 10. Security Requirements
No secrets or security boundaries modified.

---

## 11. Acceptance Criteria
- [ ] Center of teacher liquid dial displays a percentage value (`%`).
- [ ] For a teacher with 3 registered students, 1 student rating 4 stars results in `27%` progress (not `80%`).
- [ ] With 0 ratings today (or after 12:00 AM reset), progress is `0%`.
- [ ] Liquid wave animation fills accurately to the percentage level.
- [ ] `cmd /c npx tsc --noEmit` compiles with 0 errors.

---

## 12. Checks to Run
- `cmd /c npx tsc --noEmit`

---

## 13. How to Verify
1. Open `http://localhost:5173/teacher-dashboard`.
2. Inspect the "Today's Rating Progress" circular widget:
   - Verify it displays a percentage (e.g. `27%` when 1 student of 3 rated 4 stars, or `0%` when reset).
   - Verify liquid wave aligns with the percentage.
