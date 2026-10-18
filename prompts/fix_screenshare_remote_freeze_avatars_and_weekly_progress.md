# Implementation Plan: Fix Remote Video Freeze During Screen Share, Camera-Off Avatars, and Saturday-Only Student Progress

Completely resolve the three user-specified behaviors:
1. Prevent the remote video feed from freezing when either the teacher or student is sharing their screen by setting incoming video resolution overrides on `call` and replacing competing `display: none` participant mounts in `DedicatedScreenShareLayout` with a single responsive flex strip.
2. Ensure authentic profile avatars display on both sides when camera is turned off by directly querying Supabase `profiles.avatar_url` by `participant.userId` in `CustomVideoPlaceholder`.
3. Eliminate the 100% course progress jump when rating a teacher, enforcing that student course progress remains strictly at 0% unless rated by the teacher on Saturday when the week ends.

## 1. Goal
Ensure seamless two-way video rendering during screen sharing without remote participant freeze, load authentic profile images for camera-off audio states, and strictly confine student course progress to Saturday teacher ratings (defaulting to 0%).

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Mandatory workflow, checklist, and approval rules.
- `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` — Active state, architectural constraints.
- `src/pages/Meeting.tsx` — `DedicatedScreenShareLayout`, `CustomVideoPlaceholder`, `joinCall`.
- `src/pages/StudentDashboard.tsx` — Course progress calculation, `weeklyProgress`, `totalCount`.
- `node_modules/@stream-io/video-client/dist/index.es.js` — `TrackSubscriptionManager.setOverrides`, `DynascaleManager.bindVideoElement`, `requestTrackWithDimensions`.
- Supabase database `profiles` — Confirmed `avatar_url` holds authentic base64 image data for both Najib Abdirahman and Phyu sin Yadanar Thein.

## 3. Assumptions
- **Remote Video Freeze During Screen Share**:
  - In `DedicatedScreenShareLayout`, rendering two participant blocks (`hidden md:grid` and `flex md:hidden`) causes the hidden container (which has `display: none`) to measure `0x0`. Stream Video SDK's `DynascaleManager` treats `0x0` as an unsubscription command, setting `p.videoDimension = undefined` and prompting the SFU to cut off video transmission to the remote viewer.
  - Furthermore, `call.setPreferredIncomingVideoResolution({ width: 1280, height: 720 })` guarantees the SFU maintains incoming video tracks for all session participants even under dynamic layout changes.
- **Camera-Off Profile Avatar**:
  - Stream's WebSocket drops base64 data URLs to avoid exceeding the 5KB metadata limit.
  - `CustomVideoPlaceholder` must query `profiles.avatar_url` directly from Supabase for `participant.userId` and cache it in `profileAvatarCache`. Both student and teacher will immediately see each other's genuine profile photo when camera is off.
- **Student Course Progress**:
  - Remove `(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0)` fallback from `StudentDashboard.tsx`.
  - Student course progress must strictly be `0%` on any day other than Saturday. On Saturday, it queries for a rating submitted by the teacher for this student and displays `(rating / 5.0) * 100` (or 0% if not yet rated). Rating the teacher in `RateTeacher.tsx` will no longer jump student course progress to 100%.

## 4. Task Flow
1. **Task 1: Fix Remote Video Freeze in `Meeting.tsx`**
   - **Purpose**: In `joinCall`, call `callObj.setPreferredIncomingVideoResolution({ width: 1280, height: 720 })` so the SFU never drops remote incoming video tracks during screen sharing. In `DedicatedScreenShareLayout`, unify the participant strip into a single responsive flex container (`flex flex-row md:flex-col`) so that elements never have `0x0` dimensions or trigger unsubscriptions.
   - **Dependencies**: None.
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: None.
   - **Verification Gate**: Remote video feeds stay active and fluid without freezing when screen sharing in both directions.

2. **Task 2: Fix Camera-Off Avatars in `CustomVideoPlaceholder`**
   - **Purpose**: In `CustomVideoPlaceholder`, directly query `profiles.avatar_url` from Supabase for `participant.userId` and store in `profileAvatarCache`. Render the actual user avatar for both local and remote participants without falling back to Dicebear cartoon SVGs.
   - **Dependencies**: Task 1.
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: None.
   - **Verification Gate**: Toggling camera off shows the authentic profile photo on both student and teacher screens.

3. **Task 3: Enforce Saturday-Only Student Course Progress in `StudentDashboard.tsx`**
   - **Purpose**: Eliminate the completed-session percentage fallback. Strictly set `progressPercent` to 0% unless today is Saturday (`now.getDay() === 6`) AND a teacher rating exists for the student for this week.
   - **Dependencies**: None.
   - **Files affected**: `src/pages/StudentDashboard.tsx`
   - **Risks**: None.
   - **Verification Gate**: When a session finishes and is rated, student course progress remains 0% until Saturday teacher review.

4. **Task 4: Build & Typecheck Verification**
   - **Purpose**: Run `npx tsc --noEmit` and `npm run build` to verify 0 errors.
   - **Dependencies**: Tasks 1-3.
   - **Files affected**: None.
   - **Risks**: None.
   - **Verification Gate**: Clean build with exit code 0.

## 5. Files that will change
- `src/pages/Meeting.tsx` [MODIFY] — Unify `DedicatedScreenShareLayout` participant strip, set incoming video resolution override, and resolve authentic profile avatars for camera-off placeholders.
- `src/pages/StudentDashboard.tsx` [MODIFY] — Restrict student course progress strictly to Saturday teacher ratings (default 0%).

## 6. Implementation Requirements
- **Meeting.tsx**:
  ```tsx
  // DedicatedScreenShareLayout single responsive strip
  <div className="w-full md:w-64 lg:w-72 shrink-0 h-28 md:h-full min-h-0 bg-[#202124]/90 p-2 rounded-xl border border-white/10 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden scrollbar-none">
    {participants.map((p) => (
      <div
        key={p.sessionId || p.userId}
        className="relative shrink-0 w-28 md:w-full h-full md:h-auto md:min-h-[90px] md:aspect-video rounded-lg overflow-hidden bg-[#202124] border border-white/10 flex items-center justify-center"
      >
        <ParticipantView
          participant={p}
          VideoPlaceholder={CustomVideoPlaceholder}
          ParticipantViewUI={CustomParticipantViewUI}
          className="w-full h-full object-cover"
        />
      </div>
    ))}
  </div>
  ```
  ```tsx
  // In joinCall:
  try {
    callObj.setPreferredIncomingVideoResolution({ width: 1280, height: 720 });
  } catch (e) {
    console.warn('Failed to set preferred incoming video resolution:', e);
  }
  ```
  ```tsx
  // In CustomVideoPlaceholder:
  // Directly query Supabase profiles by participant.userId to display authentic avatar
  ```
- **StudentDashboard.tsx**:
  ```tsx
  // In fetchWeeklyRating:
  const now = new Date();
  const isSaturday = now.getDay() === 6;

  if (!isSaturday) {
    setWeeklyProgress(0);
    return;
  }
  ```
  ```tsx
  const progressPercent = weeklyProgress ?? 0;
  ```

## 7. Technology / library recommendations
- None.

## 8. API / integration strategy
- No external APIs or schema changes.

## 9. Architecture implications
- Strictly adheres to existing Supabase and Stream Video SDK patterns.

## 10. Security requirements
- None altered.

## 11. Acceptance criteria
- [ ] When teacher shares screen, the student sees the teacher and screen share without freezing; when student shares screen, teacher sees student and screen share without freezing.
- [ ] Turning camera off displays the user's authentic profile image on both the local and remote screens.
- [ ] Student course progress remains strictly at 0% unless today is Saturday and a teacher rating exists. Completing a session does not cause course progress to jump to 100%.
- [ ] Zero TypeScript errors and clean production build.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open a teacher meeting window and student meeting window.
2. Share screen from teacher: verify student sees screen and active camera feeds without freeze; share screen from student: verify teacher sees screen and active camera feeds without freeze.
3. Turn off camera on either side: verify the authentic user profile avatar photo appears on both viewports.
4. Complete session and submit teacher rating as student: check student dashboard to confirm Course Progress stays at 0%.
