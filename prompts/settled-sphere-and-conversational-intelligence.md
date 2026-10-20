# Implementation Plan: Settled Pristine 3D Sphere Reconstruction & Conversational Intelligence Optimization

## 1. Goal
Reconstruct the 3D sphere so that when settled (idle) it forms a pristine, mathematically perfect round sphere of luminous dots matching `media_1792521134534.png` while vibrating into magnetic resonance ferrofluid spikes during speech, and overhaul Aoede's conversational engine with real date/time awareness, proactive assignment awareness (asking *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"* when assignments are empty), and dynamic open-ended task handling without repetitive loops.

## 2. What it read
- User request, uploaded images (`media_1792521134534.png` showing pristine round point-lattice sphere when settled, `media_1792521143631.png` showing repetitive canned responses).
- Pinterest link (`https://id.pinterest.com/pin/939845016017296372/`) metadata: *"Magnetic Resonance | Audio-Reactive Ferrofluid + Crystal Geometry — The outer shell behaves like a ferrofluid field, stretching and forming magnetic spikes in response to sustained violin frequencies"*.
- `src/features/student/quick-actions/AoedeCyberSphere3D.tsx`
- `src/features/student/quick-actions/sphereShaders.ts`
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx`
- `src/hooks/useStudentAI.ts`
- `vite.config.ts` (`/api/student-ai` and `/api/tts` endpoints)
- `docs/PROJECT_STATE.md` and `AGENTS.md`

## 3. Assumptions
- When settled / idle (no voice playback), the sphere must be **completely round** without any irregular bumps, lumps, or idle noise distortion, matching the user's reference image `media_1792521134534.png`.
- The sphere visual architecture should combine a dense coordinate grid of luminous circular point sprites (dot matrix) with bright edge/rim fresnel glow and subtle wireframe geometry.
- When audio plays, the point matrix and shell deform dynamically along normal vectors into ferrofluid magnetic spikes based on real-time Web Audio API frequency analysis (bass and mid formants).
- When the student has 0 assignments, Aoede should proactively ask: *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*
- When the user asks "what date is it", Aoede answers with the exact current date (e.g. Wednesday, October 21, 2026).
- When the user assigns any custom task (writing, math, brainstorming, summarization, research), Aoede directly helps them through that task rather than repeating generic tutoring catchphrases.

## 4. Task Flow
1. **Task 1: Overhaul Shaders & Geometry for Pristine Round Settled Dot Sphere**
   - In `src/features/student/quick-actions/sphereShaders.ts`:
     - Eliminate idle distortion: ensure base displacement when `rms == 0` and `bass == 0` is `0.0`.
     - Update vertex shader to compute a pristine unit sphere base geometry `p * 1.0` when idle.
     - Add smooth interpolation for audio-driven magnetic ferrofluid displacement: as audio RMS/bass increases, vertices dynamically shoot outward along magnetic field lines (`spikeField1`, `spikeField2`), forming sharp organic spikes and acoustic ripples.
     - Add dedicated point sprite fragment shader with soft circular gaussian disc falloff and luminous cyan-to-magenta/white color scheme.
   - In `src/features/student/quick-actions/AoedeCyberSphere3D.tsx`:
     - Render the spherical point grid using `gl.POINTS` alongside subtle connecting lines so each coordinate vertex appears as a bright glowing point matching `media_1792521134534.png`.
     - Ensure the settled sphere is immaculate, circular, and centered with soft rim glow.
2. **Task 2: Inject Date/Time & Assignment Awareness in Client**
   - In `src/hooks/useStudentAI.ts`:
     - Pass current local date and time string in the payload to `/api/student-ai`.
     - Detect assignment count (`detectedAssignments.length`). If 0, mark `hasAssignments: false`.
     - When starting a new conversation or resetting history, generate an initial proactive greeting:
       - If no assignments: *"Hello [Name]! Since today you don't have assignments, is there something that is on your mind that you want to work on?"*
       - If assignments exist: *"Hello [Name]! I see you have [Assignment] for [Course]. Shall we work on that, or is there something else on your mind?"*
3. **Task 3: Overhaul `/api/student-ai` Backend Engine in `vite.config.ts`**
   - Multi-Model LLM Pipeline:
     - Update model list with verified working models (`gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.7-flash`) with resilient timeout (3.5s).
     - Provide full system prompt with real date/time, assignment status, and instructions:
       - If no assignments, invite the student to work on anything on their mind.
       - Answer date/time questions accurately and directly.
       - Handle any user task (writing, problem solving, brainstorming) directly and intelligently.
   - Comprehensive Local Fallback Intelligence Engine:
     - Date & time recognition: handles "what date is it", "what day is today", "what's the time", returning the real current date.
     - Assignment queries: handles "do I have homework", "what assignments do I have". If none, explicitly states: *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*
     - Open-ended task handler: accepts writing, calculating, researching, explaining, brainstorming tasks with intelligent multi-sentence or step-by-step guidance.
     - Dynamic anti-repetition: tracks recent assistant replies and guarantees non-repetitive phrasing across conversation turns.
4. **Task 4: Checks & Verification**
   - Run `npx tsc --noEmit` and `npm run build`.
   - Verify visually in browser that the settled sphere is 100% round and dot-gridded as shown in `media_1792521134534.png`.
   - Verify that asking "what date is it" returns the real date.
   - Verify that when no assignments exist, Aoede asks *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*.

## 5. Files that will change
- `src/features/student/quick-actions/sphereShaders.ts` (Modify: idle displacement = 0, pristine round settled geometry, magnetic spike dynamics, point sprite rendering)
- `src/features/student/quick-actions/AoedeCyberSphere3D.tsx` (Modify: render spherical point lattice with glowing rim matching reference)
- `src/hooks/useStudentAI.ts` (Modify: date/time context injection, assignment awareness greeting)
- `vite.config.ts` (Modify: `/api/student-ai` Gemini model waterfall + comprehensive intelligent fallback engine)
- `docs/PROJECT_STATE.md` (Modify: update project state)

## 6. Implementation requirements
- Settled sphere MUST be visually round, clean, and without idle lumps/wobbles, matching `media_1792521134534.png`.
- Spoken audio MUST trigger real-time magnetic resonance spikes deforming outward from the sphere surface.
- Date and time inquiries MUST return real date and time values.
- Zero-assignment state MUST trigger the proactive prompt: *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*.
- Any general task assigned by the student MUST be processed and assisted without canned repetition.

## 7. Technology / library recommendations
- No new external libraries needed. Uses existing WebGL API, Web Audio API, and Gemini API / Node middleware.

## 8. API / integration strategy
- `/api/student-ai` receives `currentDate`, `hasAssignments`, `detectedAssignments`, `messages`, `subject`, `studentName`.
- Tries `gemini-3.5-flash` with a 3.5s timeout. If unavailable (503/timeout), seamlessly executes the comprehensive local engine.

## 9. Architecture implications
- Keeps state in `useStudentAI` and server logic in Vite middleware. Transparent to production builds.

## 10. Security requirements
- Public environment variables only in client; API keys remain server-side in Vite middleware.
- Input sanitization via `stripSymbols`.

## 11. Acceptance criteria
- [ ] When voice is settled (idle), sphere is completely round with an evenly distributed point lattice and glowing rim matching `media_1792521134534.png`.
- [ ] During AI speech, the sphere deforms into magnetic spikes corresponding to voice frequencies, then smoothly settles back into a round sphere.
- [ ] Asking "what date is it" returns the real current date.
- [ ] When no assignments exist, Aoede asks: *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*.
- [ ] Repetitive canned responses are completely eliminated.
- [ ] `npx tsc --noEmit` and `npm run build` pass with 0 errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open `http://localhost:5174/` and navigate to Student Dashboard -> Aoede.
2. Observe the sphere in Voice mode: verify it is perfectly round, composed of glowing points with a luminous rim, exactly like `media_1792521134534.png`.
3. In chat or voice, ask: *"what date is it?"* -> Verify Aoede provides the accurate current date.
4. If no assignments are pending, verify Aoede asks: *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*.
5. Provide a custom task (e.g. *"Help me outline a 3-paragraph essay on solar energy"*): verify Aoede engages directly and intelligently with the task.
