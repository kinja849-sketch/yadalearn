# Implementation Plan — Fix Human Voice Integration & Auto-Cancel Expired Classes

## 1. Goal
Fix the Study Buddy voice by replacing the deprecated 404 Gemini endpoint with the active `gemini-3.8-flash-tts` neural voice model to eliminate robotic browser synthesis, and automatically cancel and nullify links for any class session that does not take place within 1 hour of its scheduled time.

## 2. What it read
- `AGENTS.md` & `.agents/AGENTS.md` (Workflow rules, approval gate, build standards)
- `vite.config.ts` (TTS endpoint `/api/tts`, `/api/student-ai`, `/api/teacher-ai`)
- `src/hooks/useStudentAI.ts` (`speakAoedeVoice`, audio playback, `speechSynthesis` fallback)
- `src/pages/StudentDashboard.tsx` (`fetchLiveClass`, `bookings` query, unrated booking fallback, session status check)
- `src/pages/TeacherDashboard.tsx` (`getNextUpcomingEvent`, `handleStartClassDirectly`, `live_classes` query)
- Live API Model Inspection: Verified `gemini-2.0-flash` returns **HTTP 404** (deprecated), while `gemini-3.8-flash-tts` returns **HTTP 200** with high-fidelity `audio/wav` data, and `gemini-3.8-flash` returns **HTTP 200** for text generation.

## 3. Assumptions
- **Aoede Neural Voice Model**: The verified working Google Gemini endpoint for neural speech is `models/gemini-3.8-flash-tts` (which generates direct `audio/wav` buffers natively playable by the browser), with `models/gemini-2.5-flash-preview-tts` as a 24kHz PCM fallback.
- **No Robotic Fallback**: When in Voice Call mode, browser `window.speechSynthesis` will be disabled to ensure only authentic human neural audio is played, preventing robotic computer voices.
- **1-Hour Auto-Cancellation Rule**:
  - A scheduled class or booking is considered expired/cancelled if `now > scheduled_time + 60 minutes` and it has not concluded (`status !== 'completed'` and `status !== 'attended'`).
  - When this condition is met:
    1. The class status in Supabase `live_classes` is updated to `status: 'cancelled'` and `room_id: null` (link nullified).
    2. The booking in Supabase `bookings` is updated to `status: 'cancelled'`.
    3. Neither student nor teacher dashboard will show the session as active or joinable.
    4. In schedule lists, it displays "Cancelled" with no join link.

## 4. Task Flow
1. **Task 1: Update Server-Side Audio & Text Endpoints in `vite.config.ts`**
   - *Purpose*: Point `/api/tts` to `gemini-3.8-flash-tts` (and `gemini-2.5-flash-preview-tts` fallback), and update `/api/student-ai` & `/api/teacher-ai` to `gemini-3.8-flash`.
   - *Files Affected*: `vite.config.ts`.
   - *Verification Gate*: Run live node script against `/api/tts` to verify it returns valid base64 audio and status 200.

2. **Task 2: Harden Audio Playback in `src/hooks/useStudentAI.ts`**
   - *Purpose*: Streamline HTML5 Audio playback of the base64 WAV buffer returned from `gemini-3.8-flash-tts`, and remove the robotic `window.speechSynthesis` fallback.
   - *Files Affected*: `src/hooks/useStudentAI.ts`.
   - *Verification Gate*: Verify clean TypeScript compilation (`tsc --noEmit`).

3. **Task 3: Implement 1-Hour Session Auto-Cancellation & Link Nullification**
   - *Purpose*: 
     - In `StudentDashboard.tsx` (`fetchLiveClass` & `fetchBookings`): Check scheduled timestamps. If a session or booking start time is older than 60 minutes and never took place, update `status: 'cancelled'`, nullify `room_id`, and prevent `liveClassInfo` from activating.
     - In `TeacherDashboard.tsx` (`getNextUpcomingEvent` & `handleStartClassDirectly`): Do not treat sessions older than 60 minutes as upcoming/active; auto-cancel them in the database and nullify room links.
   - *Files Affected*: `src/pages/StudentDashboard.tsx`, `src/pages/TeacherDashboard.tsx`.
   - *Verification Gate*: Verify that bookings and live classes older than 1 hour are filtered, cancelled in database, and link is null.

4. **Task 4: Build Verification & Project State Update**
   - *Purpose*: Run `npx tsc --noEmit` and `npm run build`, update `docs/PROJECT_STATE.md`.
   - *Files Affected*: `docs/PROJECT_STATE.md`.
   - *Verification Gate*: `tsc` 0 errors, `npm run build` succeeds cleanly.

## 5. Files that will change
- `vite.config.ts` (Fix TTS model to `gemini-3.8-flash-tts` and text model to `gemini-3.8-flash`)
- `src/hooks/useStudentAI.ts` (Streamline neural audio playback, eliminate robotic fallback)
- `src/pages/StudentDashboard.tsx` (Auto-cancel sessions older than 1 hour, nullify room links, eliminate zombie booking link generation)
- `src/pages/TeacherDashboard.tsx` (Filter and auto-cancel sessions older than 1 hour, nullify room links)
- `docs/PROJECT_STATE.md` (Update project state upon completion)

## 6. Implementation Requirements
- **Human Voice Quality**:
  - Request audio directly from `gemini-3.8-flash-tts` with voice name `Aoede`.
  - Handle direct `audio/wav` and PCM buffers.
  - Return base64 WAV payload to frontend.
  - Frontend plays audio natively via `HTMLAudioElement`.
  - Zero robotic speech synthesis fallback.
- **Session Auto-Cancellation & Link Nullification**:
  - Exact time comparison: `new Date(sessionStartTime).getTime() + 60 * 60 * 1000 < Date.now()`.
  - If true and session was not completed:
    - Update `live_classes` row: `{ status: 'cancelled', room_id: null }`.
    - Update `bookings` row: `{ status: 'cancelled' }`.
    - Set state so join button is not active and link is null.

## 7. Technology / Library Recommendations
- Existing stack: HTML5 Audio, Supabase client, Google Gemini API key already present in `.env`.

## 8. API / Integration Strategy
- Endpoint: `/api/tts` in `vite.config.ts` calls Google Gemini `gemini-3.8-flash-tts:generateContent`.
- Supabase queries: auto-update expired rows where `status in ('scheduled', 'confirmed', 'active')` and `start_time + 1hr < now`.

## 9. Architecture Implications
- Zero schema changes required.
- Hardens existing `live_classes` and `bookings` integrity.

## 10. Security Requirements
- `GEMINI_API_KEY` remains server-side in `.env`.
- Database updates conform to existing RLS policies.

## 11. Acceptance Criteria
- [ ] `/api/tts` returns valid neural WAV audio from `gemini-3.8-flash-tts` (HTTP 200).
- [ ] Study Buddy plays the human Aoede voice in Voice Call mode without falling back to a robot voice.
- [ ] Any session or booking older than 1 hour past scheduled start time that did not take place is automatically marked `cancelled`.
- [ ] The link for any expired session is nullified (`room_id: null`).
- [ ] Neither teacher nor student can join or see active links for sessions older than 1 hour.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm run build` succeeds cleanly.

## 12. Checks to run
- `npx tsc --noEmit`
- `npm run build`

## 13. How to verify
1. Open Study Buddy in Student Dashboard (`/student-dashboard`). Switch to Voice Call mode. Speak or send a voice message $\to$ verify authentic human voice audio playback without robot voice.
2. Check student and teacher schedule: any session scheduled over 1 hour ago is marked Cancelled with no join link.
