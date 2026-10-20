# Two-Way Continuous Voice-to-Voice Dialogue with Interruption & Vibrating Cyber-Sphere Design

## 1. Goal
Implement a fully continuous, hands-free two-way voice-to-voice dialogue in the AI Study Buddy with instant voice activity detection (VAD), seamless user interruption (barge-in), and replace the old circular logo avatar with an authentic vibrating neon cyber-sphere on a clean white canvas.

## 2. What it read
- `AGENTS.md` (§1 to §19)
- `docs/PROJECT_STATE.md`
- User uploaded images:
  - `media_1792513234828.png` (current UI with circular logo and manual mic tap)
  - `media_1792513272208.png` (cybernetic wireframe neon blue/purple sphere mesh with particle aura)
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx`
- `src/hooks/useStudentAI.ts`
- `vite.config.ts` (`/api/student-ai` and `/api/tts`)

## 3. Assumptions & Architecture Plan
1. **Continuous Voice Detection (No Mic Tapping Required)**:
   - Configure `SpeechRecognition` with `continuous = true` and `interimResults = true`.
   - When Voice Call mode is opened, speech recognition starts automatically and continuously listens.
   - If the browser speech recognition engine times out or ends (`onend`), it immediately and automatically restarts if Voice Call mode is active.
   - Silence detection: When the student pauses speaking for ~750ms after speech input, the utterance is automatically sent to Aoede without requiring any button taps.
2. **Instant Interruption (Barge-in)**:
   - When Aoede is speaking (`isSpeaking === true` or audio is playing), any detected speech from the student (via interim speech events) instantly triggers `stopSpeaking()`, silencing Aoede immediately so the student can clarify, correct, or interrupt naturally.
3. **Voice Response Latency Optimization**:
   - Spoken responses in voice mode are concise (1–2 sentences) so Google Gemini TTS (`/api/tts`) synthesizes the audio buffer rapidly (< 1s).
   - Instant visual feedback: The cyber-sphere immediately activates state transitions upon speech detection so the user experiences zero perceptual delay.
4. **New Cyber-Sphere Design & Vibration Animation**:
   - Base asset `public/aoede-sphere.png` (copied directly from the uploaded reference image).
   - Rendered on a pure white background (`bg-white`) inside the Voice Call view.
   - Dynamic CSS keyframe animations:
     - **Idle / Listening**: Soft organic breathing scale and gentle neon gradient aura.
     - **User Speaking**: Reactive glowing cyan wave displacement.
     - **Aoede Speaking**: **High-energy rhythmic vibration, harmonic scale pulsation, and multi-chromatic neon wave ripples** matching the voice playback.
5. **UI Controls**:
   - Replace the manual "Tap microphone" button with a sleek "End Call" phone button and mute toggle.

## 4. Task Flow
1. **Task 1: Cyber-Sphere Asset & Vibration Animation Component**
   - Purpose: Create `AoedeCyberSphere.tsx` (or integrate in `AIStudyBuddyModal.tsx`) featuring the cyber-sphere image (`/aoede-sphere.png`), responsive white background container, glowing neon cyan/magenta drop-shadows, and dynamic vibration keyframes for speaking, listening, and idle states.
   - Files: `src/features/student/quick-actions/AIStudyBuddyModal.tsx` (and CSS in `src/index.css` if needed)
   - Dependencies: None
   - Verification Gate: Visual check confirming pure white background and animated sphere.
2. **Task 2: Continuous Hands-Free VAD & Barge-in Interruption in `useStudentAI.ts`**
   - Purpose: Upgrade `useStudentAI.ts` with continuous speech recognition (`continuous = true`, `interimResults = true`), automatic restart on end, silence debounce detection for hands-free turn completion, and immediate `stopSpeaking()` on user speech detection.
   - Files: `src/hooks/useStudentAI.ts`
   - Dependencies: Task 1
   - Verification Gate: Code review confirming continuous listening loop and barge-in triggers.
3. **Task 3: Concise Voice Response Shaping for Ultra-Fast Audio Generation**
   - Purpose: In `/api/student-ai` ([vite.config.ts](file:///c:/Users/acer/Desktop/yadalearn-main/vite.config.ts)), format voice-mode replies to be direct, conversational, and punchy (1-2 sentences), cutting TTS synthesis time to well under 1 second.
   - Files: `vite.config.ts`, `src/hooks/useStudentAI.ts`
   - Dependencies: Task 2
   - Verification Gate: TTS benchmark confirming rapid audio generation.
4. **Task 4: Voice Call View Overhaul in `AIStudyBuddyModal.tsx`**
   - Purpose: Replace the old circular logo avatar and mic tap button with the new cyber-sphere, live status indicators ("Listening...", "Aoede is speaking..."), clean white background, and an intuitive "End Call" action.
   - Files: `src/features/student/quick-actions/AIStudyBuddyModal.tsx`
   - Dependencies: Tasks 1-3
   - Verification Gate: UI renders properly with zero visual clipping.
5. **Task 5: Compilation, Build, and Verification**
   - Purpose: Run TypeScript compiler and production build to guarantee 0 regressions or errors.
   - Files: None
   - Dependencies: Tasks 1-4
   - Verification Gate: `npx tsc --noEmit` and `npm run build` both exit with code 0.
6. **Task 6: Update Persistent Project State**
   - Purpose: Document changes in `docs/PROJECT_STATE.md`.
   - Files: `docs/PROJECT_STATE.md`
   - Dependencies: Task 5
   - Verification Gate: Documentation matches the implementation.

## 5. Files that will change
- `src/hooks/useStudentAI.ts` (modify)
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` (modify)
- `vite.config.ts` (modify)
- `src/index.css` (modify - add vibration keyframes)
- `docs/PROJECT_STATE.md` (modify)

## 6. Implementation requirements
- **Continuous Listening**: Zero manual mic tapping required during voice call mode. Conversation must be two-way and continuous.
- **Interruption**: User speaking immediately silences Aoede's audio playback.
- **Visual Design**: Pure white background with the neon wireframe cyber-sphere, actively vibrating when Aoede speaks.
- **Response Speed**: Instantaneous turn-taking with short, focused spoken responses.

## 7. Technology / library recommendations
- Native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with `continuous = true` and `interimResults = true`.
- Native HTML5 Audio and CSS3 keyframe animations. Zero new external dependencies.

## 8. API / integration strategy
- Speech-to-text operates locally via the browser's speech recognition pipeline.
- Socratic text response returns in < 15ms via `/api/student-ai`.
- Audio stream synthesizes via `/api/tts` with Google Gemini `gemini-3.8-flash-tts` in `Aoede` voice.

## 9. Architecture implications
- Keeps state clean in `useStudentAI.ts` and isolates voice call interactions to the full-screen modal without global store pollution.

## 10. Security requirements
- Preserves all client/server boundaries and keeps API keys protected on the server side.

## 11. Acceptance criteria
- [ ] No manual mic tapping needed: speech is detected automatically.
- [ ] User speaking interrupts Aoede instantly if Aoede is currently speaking.
- [ ] Old circular logo replaced with the new neon cyber-sphere on a pure white background.
- [ ] Cyber-sphere visibly vibrates and pulses when Aoede is speaking.
- [ ] Spoken responses are concise, natural, and generated with minimal delay.
- [ ] `cmd.exe /c npx.cmd tsc --noEmit` passes with 0 errors.
- [ ] `cmd.exe /c npm.cmd run build` completes with 0 errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open the Student Dashboard and launch **AI Study Buddy**.
2. Tap **Voice Call**:
   - The screen switches to a clean white background featuring the glowing neon cyber-sphere.
   - Microphone starts listening immediately without clicking any mic button.
3. Speak any question:
   - Notice speech is transcribed automatically.
   - When you pause, Aoede responds.
   - While Aoede is speaking, the cyber-sphere vibrates and pulses with glowing neon waves.
4. While Aoede is speaking, speak a word:
   - Aoede stops speaking immediately (interruption), and begins listening to your new statement.
