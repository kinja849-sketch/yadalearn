# Fix 3D Canvas Cyber-Sphere, UI Clutter Elimination, React Error & Acoustic Echo Prevention

## 1. Goal
Fix the React lifecycle error (`Should have a queue`), eliminate the acoustic feedback loop where the AI hears its own speaker output and responds to itself, replace the image with a true 3D Canvas wireframe cyber-sphere with calm idle rotation and energetic speaking vibration, remove pre-written welcome messages in voice mode, replace the call end button with an X button, and strip out all unnecessary status text labels.

## 2. What it read
- `AGENTS.md` (§1 to §19)
- `docs/PROJECT_STATE.md`
- User feedback and screenshot `media_1792514122358.png`
- Console error stack trace:
  - `chunk-WRD5HZVH.js:11730 Uncaught (in promise) Error: Should have a queue. This is likely a bug in React.` at `useStudentAI` / `AIStudyBuddyModal`
- `src/hooks/useStudentAI.ts`
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx`

## 3. Assumptions & Architecture Plan
1. **Acoustic Self-Echo Elimination (Preventing the AI from Responding to Itself)**:
   - When Aoede speaks aloud through device speakers, the microphone naturally picks up the speaker audio. The Web Speech API transcribes Aoede's own voice, erroneously sending it back to the AI as a new student question and causing an infinite self-response loop.
   - **Solution**:
     - **Turn-Taking State Machine**: Define strict turn states: `'IDLE_LISTENING'`, `'AI_GENERATING'`, `'AI_SPEAKING'`, and `'ECHO_COOLDOWN'`.
     - **Self-Speech Transcript Filter**: Store the active text being spoken by Aoede. Any transcript captured while Aoede is speaking or during the 500ms trailing reverberation window is checked against Aoede's text. If the recognized words overlap or match what Aoede is speaking, it is discarded as speaker echo.
     - **Genuine Interruption**: If the user says distinct interruptive words (e.g. "wait", "stop", "no", or asks a new question not in Aoede's current sentence), Aoede immediately silences herself and transitions to user speaking.
     - **Post-Playback Cooldown**: When Aoede finishes speaking, ignore mic transcripts for 500ms to allow room reverberation to settle.
2. **React "Should have a queue" Lifecycle Error**:
   - `startContinuousVoiceDialogue` was recreated on every state update because it had `sendMessage` in its dependency array, which changed on every message addition. This caused the `useEffect` to execute continuously in a loop, firing state updates during active render cycles.
   - **Solution**: Decouple `sendMessage` using a stable `useRef` (`sendMessageRef.current = sendMessage`). Stabilize all hook callbacks and effect hooks.
3. **Start When User Speaks (Zero Pre-written Messages)**:
   - In Voice Mode, the stage and captions must start completely clean. No pre-written welcome message is displayed. The conversation starts only when the user speaks.
4. **True 3D Interactive Cyber-Sphere (Canvas-based)**:
   - Build a native 3D Canvas component (`AoedeCyberSphere3D.tsx`) rendering an organic 3D wireframe cyber-sphere:
     - 3D latitude/longitude mesh and particle nodes with neon cyan-to-magenta gradient.
     - **When Idle**: Perfectly calm, smooth 3D rotation with zero vibration.
     - **When Speaking**: Vibrant 3D mesh surface vertex displacement and audio-reactive vibration matching Aoede's speech.
     - Transparent canvas seamlessly on the pure white background—zero square black borders.
5. **UI Clutter Elimination**:
   - Remove "Live Two-Way Call" badge.
   - Remove "Aoede" title text from voice mode.
   - Remove "Listening continuously. Speak anytime without tapping." text.
   - Remove "Voice-to-Voice Call" header text.
   - Remove footer text below the buttons ("Two-way voice dialogue active in...").
   - Replace the red circular phone button with a clean **X** button.

## 4. Task Flow
1. **Task 1: Resolve React Lifecycle Error & Echo Prevention Engine in `useStudentAI.ts`**
   - Purpose: Stabilize `startContinuousVoiceDialogue` and `stopContinuousVoiceDialogue` with refs. Implement the acoustic self-echo filter, turn-taking lock, and 500ms post-playback cooldown so Aoede never hears herself or creates a feedback loop.
   - Files: `src/hooks/useStudentAI.ts`
   - Dependencies: None
   - Verification Gate: Code review confirming self-echo filtering and stable effect dependencies.
2. **Task 2: Build Native 3D Cyber-Sphere Component (`AoedeCyberSphere3D.tsx`)**
   - Purpose: Create an organic 3D wireframe cyber-sphere rendered on an HTML5 Canvas:
     - High-density 3D latitude/longitude mesh and particle nodes with neon cyan-to-magenta gradient.
     - Zero vibration during idle.
     - Energetic 3D wave displacement and vibration when Aoede is speaking (`isSpeaking === true`).
   - Files: `src/features/student/quick-actions/AoedeCyberSphere3D.tsx` (new)
   - Dependencies: Task 1
   - Verification Gate: Visual check confirming pure 3D canvas rendering without black image borders.
3. **Task 3: Redesign Voice Mode Screen in `AIStudyBuddyModal.tsx`**
   - Purpose:
     - Remove "Live Two-Way Call", "Aoede", "Listening continuously...", "Voice-to-Voice Call" subtext, and bottom dialogue text.
     - Remove pre-written initial message: start conversation purely when user speaks.
     - Replace call end button with an **X** button.
     - Embed the new `AoedeCyberSphere3D`.
   - Files: `src/features/student/quick-actions/AIStudyBuddyModal.tsx`
   - Dependencies: Tasks 1-2
   - Verification Gate: Clean, minimal white UI with only the 3D sphere, live user transcript when speaking, and control buttons with X.
4. **Task 4: Compilation, Build, and Verification**
   - Purpose: Run TypeScript compiler and production build to ensure 0 errors.
   - Files: None
   - Dependencies: Tasks 1-3
   - Verification Gate: `npx tsc --noEmit` and `npm run build` both exit with 0 errors.
5. **Task 5: Update Persistent Project State**
   - Purpose: Document changes in `docs/PROJECT_STATE.md`.
   - Files: `docs/PROJECT_STATE.md`
   - Dependencies: Task 4
   - Verification Gate: `docs/PROJECT_STATE.md` is updated.

## 5. Files that will change
- `src/hooks/useStudentAI.ts` (modify)
- `src/features/student/quick-actions/AoedeCyberSphere3D.tsx` (create)
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` (modify)
- `docs/PROJECT_STATE.md` (modify)

## 6. Implementation requirements
- **No Self-Responding Loops**: The AI must never transcribe its own voice from the speakers and answer itself.
- **Zero Pre-written Message**: Voice mode begins completely clean; the conversation starts when the student speaks.
- **True 3D Wireframe Sphere**: Pure canvas 3D sphere with calm idle rotation and speaking vibration. No image file with black square borders.
- **Minimalist Clean UI**: Pure white background, no cluttering status labels, X button instead of phone hang up.
- **Zero React Errors**: Absolute zero `Should have a queue` or render queue errors.

## 7. Acceptance criteria
- [ ] No `Should have a queue` React error in console.
- [ ] No acoustic echo feedback loops: AI never responds to its own speaker voice.
- [ ] No pre-written welcome message appears in voice mode; stage is clean until the user speaks.
- [ ] 3D cyber-sphere renders with transparent background on white canvas (no black square border).
- [ ] 3D sphere is calm when idle and vibrates dynamically when Aoede is speaking.
- [ ] All requested text labels ("Live Two-Way Call", "Aoede", "Listening continuously...", etc.) are removed.
- [ ] Call end button replaced with an **X** button.
- [ ] `cmd.exe /c npx.cmd tsc --noEmit` passes with 0 errors.
- [ ] `cmd.exe /c npm.cmd run build` completes with 0 errors.

## 8. How to verify
1. Open Student Dashboard and launch AI Study Buddy.
2. Switch to Voice Call mode:
   - Confirm pure white screen with true 3D rotating cyber-sphere.
   - Confirm no black box image borders.
   - Confirm no pre-written message in the caption area.
   - Confirm no cluttered text labels ("Live Two-Way Call", "Listening continuously...", etc.).
   - Confirm an "X" button is present to exit.
3. Speak a question:
   - Speech is detected and displayed in live captions.
   - Aoede responds with human voice and the 3D sphere vibrates during speech.
   - While idle, the sphere rotates calmly with zero vibration.
   - When Aoede speaks through speakers, verify that her own voice is NOT transcribed as a new question and the AI does NOT loop on itself.
