# YadaLearn — Project State

> Living snapshot for AI agents and humans. Update after every meaningful completed task. Always verify against the repository — do not trust this file alone.

**Last updated:** 2026-10-18 (Direct Session Join & Join Class Quick Action Instant Activation)

## Product snapshot

- Collaborative learning web app: students, teachers, parents.
- Stack in code: React 18 + TS + Vite, Supabase Auth + Postgres/RLS, Stream Video (primary meetings), LiveKit (limited Join Class path), Tailwind + shadcn/ui-style components, Netlify deploy.
- README still mentions Clerk; **code uses Supabase** — treat code as truth.

## Major areas present in repo

- Auth, role selection, onboarding, ProtectedRoute
- Student / teacher / parent dashboards and related pages
- Teacher–student links, connection requests, live classes, ratings, bookings
- Parent–student links and parent views
- Meeting page (Stream) + waiting room via Supabase Realtime
- Quick-action modals under `src/features/*`
- Design system: lavender/pastel tokens in `src/index.css` + Tailwind config
- Schema SQL files at repo root (base, update, parent)

## Recent Completed Work

- **Instant Student Join Class Realtime Activation & Direct Meeting Redirect** (`src/pages/StudentDashboard.tsx`, `src/features/teacher/quick-actions/CreateSessionModal.tsx`, `src/pages/TeacherDashboard.tsx`):
  - **Identified & Eliminated Query Bottleneck**: `fetchBookings()` was fetching `teacher:profiles(avatar_url)` where the teacher's profile stored a ~180KB base64 string. For 38 bookings, each query transferred over 7MB of raw JSON over the network, causing a 12-second UI freeze. Replaced with explicit lightweight column selection (`id, full_name`).
  - **Eliminated Infinite Realtime Mutation Loop**: Removed background `update({ status: 'completed' })` inside `fetchBookings()` which was repeatedly firing the Supabase Realtime `bookingsChannel` Postgres change event on every query completion.
  - **Sub-Second Realtime Broadcast**: Added dual broadcast in `CreateSessionModal.tsx` and `handleStartClassDirectly` in `TeacherDashboard.tsx` over `student-live-session-${studentId}` and global `yadalearn-live-sessions`. `StudentDashboard.tsx` subscribes to both channels and immediately activates `liveClassInfo` and refreshes bookings.
  - **Persistent Session State**: Hardened `fetchLiveClass()` so that empty queries never overwrite an active session with `null` (`setLiveClassInfo(prev => prev ? prev : null)`).
  - **Latest Active Session Resolution**: Ordered bookings query by `created_at` descending (`.order('created_at', { ascending: false })`) and updated `activeLiveClass` useMemo to pick the latest active/confirmed booking regardless of time zone offsets or strict date-string equality.
  - **Verified in Chrome DevTools MCP**: Navigated to student dashboard (`/student-dashboard`), confirmed "Join Class" immediately pulses with the active gradient, green live badge, and direct click redirects directly to `/meeting/${roomId}`.
- **Direct Start Class Action in Teacher Dashboard** (`src/pages/TeacherDashboard.tsx`):
  - Created `handleStartClassDirectly` on the Teacher Dashboard to immediately activate the scheduled session in `live_classes` (`status: 'active'`) and redirect directly into `/meeting/${roomName}`, bypassing the intermediate modal.
  - Generates an active room if no scheduled class exists and navigates straight into the live session.
- **Permanent Rating Persistence & Re-Prompt Elimination** (`src/pages/RateTeacher.tsx`, `src/pages/StudentDashboard.tsx`):
  - Updated `RateTeacher.tsx` to save `{ status: 'completed', rating: rating }` directly on the student's booking row (both for UUID classes and room_id sessions), eliminating the bug where ratings were only stored in `session_ratings` while leaving `bookings.rating` null.
  - Updated `StudentDashboard.tsx` `fetchBookings` to query `session_ratings` in parallel and reconcile any unrated completed bookings to their closest rating by timestamp using `usedRatingIds`, and auto-heal the database records.
  - In `Daily Schedule & Planning`, rated sessions permanently display `⭐ Rated {rating}` and never prompt the student to rate again.
  - Updated dashboard rating modal submit handler to update `{ rating: ratingValue, status: 'completed' }` and update React state immediately.
- **Two-Way Screen Share Remote Freeze Elimination & SFU Resolution Override** (`src/pages/Meeting.tsx`):
  - In `DedicatedScreenShareLayout`, eliminated duplicate DOM mounts (`hidden md:grid` and `flex md:hidden`) by replacing them with a single responsive flex container (`flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto`). Previously on mobile/desktop, one branch was hidden via `display: none` (`0x0` dimensions), which caused Stream Video SDK's `DynascaleManager` to fire an unsubscription command (`dimension: undefined`) to the SFU, cutting off remote video frames to the receiving party and logging `[AudioBindingsWatchdog]` errors.
  - Added `callObj.setPreferredIncomingVideoResolution({ width: 1280, height: 720 })` in `joinCall` to instruct the SFU to maintain continuous, full-resolution incoming video for all participants without dynamic quality starvation.
  - Strictly bound `screenShareParticipant` to `participants.find(p => hasScreenShare(p))` so the screen share stage never binds to a participant who is not publishing a screen share track.
- **Camera-Off Profile Avatar Resolution** (`src/pages/Meeting.tsx`):
  - Refactored `CustomVideoPlaceholder` to directly fetch and cache the user's authentic `avatar_url` from Supabase `profiles` by `participant.userId` for both local and remote participants.
  - Bypassed Stream's 5KB WebSocket metadata limit that previously prevented base64 data URLs from propagating over the video client, ensuring genuine uploaded avatars display immediately on both student and teacher viewpoints when cameras are toggled off.
- **Saturday-Only Weekly Rating Student Course Progress** (`src/pages/StudentDashboard.tsx`):
  - Removed the fallback `(completedCount / totalCount) * 100` that previously caused student course progress to prematurely jump to 100% upon completing or rating a session.
  - Enforced that student course progress remains strictly `0%` on weekdays and non-rated days, only reflecting a percentage on Saturday when the teacher submits a weekly rating for the student.
- **Substantial Percentage-Based Today's Rating Progress in Teacher Dashboard** (`src/pages/TeacherDashboard.tsx`, `src/hooks/useTeacherDashboardData.ts`):
  - Updated `todayProgressPercent` calculation to be cumulative across maximum possible rating points for registered students (`maxPossiblePoints = totalStudents * 5`).
  - A 4-star rating from 1 student among 3 registered students contributes `27%` progress rather than jumping immediately to 80%.
  - The circular widget displays the percentage (`{todayProgressPercent}%`) with matching liquid wave elevation.
- **Clean 12:00 AM Midnight Reset** (`src/hooks/useTeacherDashboardData.ts`):
  - Removed the `past24h` fallback that erroneously pulled yesterday's ratings into today's tally after 12:00 AM midnight.
  - Ratings now query strictly since the teacher's local midnight (`00:00:00`), resetting cleanly to `0.0` at 12:00 AM until new sessions occur on the current day, while preserving the all-time average (`Avg. Course Rating`) in `teacher_profiles`.
- **Student Rating Isolation & Booking Status Integrity** (`src/pages/RateTeacher.tsx`, `src/pages/StudentDashboard.tsx`, `src/pages/ParentPerformance.tsx`, `src/pages/ParentProgress.tsx`):
  - Eliminated blanket booking overwrite (`.eq('student_id', currentUserId).eq('teacher_id', targetTeacherId)`) that previously marked all student bookings as completed with `rating: 4`.
  - RateTeacher now only completes the specific session that concluded (by booking UUID or room ID).
  - Clarified student schedule ratings with "⭐ Rated {rating}" and tightened completed session filters to only count past sessions with `status === 'completed' || status === 'attended'`, preventing student course progress from falsely spiking to 100%.

## Active / pending tasks

- None pending.

## Environment (configured & active in .env)

- `VITE_SUPABASE_URL`: Supabase project URL (`https://yxqezrvgvfwdgrlwczea.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key (active)
- `VITE_STREAM_API_KEY`: Stream Video publishable API key (`zmxv4awpbjt9`)
- `STREAM_SECRET`: Server-side Stream JWT signing secret (active in Vite token middleware `/api/get-stream-token`)

All environment variables are saved in `.env` (and protected from git commits via `.gitignore`). Future agents must preserve these values.

## Last verification

- Ran `cmd.exe /c npx.cmd tsc --noEmit` — **0 errors**.
- Ran `cmd.exe /c npm.cmd run build` — **built in 30.70s, 0 errors**.
- Verified build artifacts generated cleanly in `dist/`.

