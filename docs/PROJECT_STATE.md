# YadaLearn — Project State

> Living snapshot for AI agents and humans. Update after every meaningful completed task. Always verify against the repository — do not trust this file alone.

**Last updated:** 2026-10-18 (Fixed Two-Way Screen Share Freeze, Camera-Off Avatars, and Saturday-Only Student Progress)

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
- Ran `cmd.exe /c npm.cmd run build` — **built in 36s, 0 errors**.
- Verified Vite dev server running at `http://localhost:5173/`.

