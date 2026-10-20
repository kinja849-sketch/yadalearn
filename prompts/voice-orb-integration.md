# Implementation Plan: Voice Orb Integration (@beui/voice-orb)

## 1. Goal
Replace the existing AI voice sphere in `AIStudyBuddyModal.tsx` with the official `@beui/voice-orb` WebGL breathing liquid voice visualization component from `beui.dev`, connecting it directly to real-time audio and voice activity while strictly preserving all surrounding page layouts, controls, and conversational intelligence.

## 2. What it read
- User request with complete component specification and source from `https://beui.dev/components/agents/voice-orb` and registry JSON at `https://beui.dev/r/voice-orb`.
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx`
- `src/utils/audioAnalyzer.ts`
- `package.json`
- `docs/PROJECT_STATE.md` and `AGENTS.md`

## 3. Assumptions
- The user explicitly requested to replace the existing sphere with `Voice Orb` without changing or distorting anything else: *"Replace this sphere with this. Do not distort or change anything at all. Just make sure that the task given to you is completely fulfilled. Don't change anything that is not asked of you."*
- All surrounding UI in `AIStudyBuddyModal.tsx` (top navigation, subject selector, reset button, assignments banner, activity status badge, live captions card, and bottom controls: mic toggle & close button) remains intact and unchanged.
- `motion` package will be installed via `cmd.exe /c npm.cmd install motion` to satisfy the official `@beui/voice-orb` dependency for `motion/react` (`useSpring`, `useTransform`, `useMotionValue`, `useReducedMotion`).
- The liquid orb WebGL renderer from `beui.dev` will be placed in `src/components/agents/voice-orb/renderer.ts`, easing constants in `src/lib/ease.ts`, and the React component in `src/components/agents/voice-orb.tsx`.
- Real-time audio reactivity: `audioAnalyzer` will expose `getAnalyser()` to feed the caller-owned `AnalyserNode` directly to `<VoiceOrb analyser={...} />`. In addition, normalized `activity` will be passed during speech and listening states so the liquid silhouette swells and ripples responsively with voice playback.

## 4. Task Flow
1. **Task 1: Install `motion` Dependency**
   - Run `cmd.exe /c npm.cmd install motion` to install `motion` (providing `motion/react`).
2. **Task 2: Create Easing Tokens (`src/lib/ease.ts`)**
   - Implement `SPRING_GLIDE`, `SPRING_PRESS`, `SPRING_PANEL`, `EASE_OUT` exactly as defined in the official `beui.dev` registry.
3. **Task 3: Implement WebGL Liquid Orb Renderer (`src/components/agents/voice-orb/renderer.ts`)**
   - Create `createOrbRenderer` with full screen-space WebGL shaders:
     - Breathing liquid silhouette with organic folds, noise, and fbm.
     - Flow vectors, warp, fold displacement, normal calculation, and shadow/color blending.
     - Specular shine, inner light, gleam, rim lighting, and stationary screen-space grain.
     - Low-power WebGL context management, context loss/restore listeners, `ResizeObserver`, and `IntersectionObserver` pause handling.
4. **Task 4: Implement React Component (`src/components/agents/voice-orb.tsx`)**
   - Implement `VoiceOrb` component supporting `activity`, `analyser`, `colors`, `speed`, and `active` props.
   - Animate the liquid orb with `useSpring(target, SPRING_GLIDE)` and `translate3d`/`scale` morphing.
5. **Task 5: Expose `getAnalyser()` on Audio Analyzer Bridge**
   - In `src/utils/audioAnalyzer.ts`: expose `getAnalyser(): AnalyserNode | null { return this.analyser; }`.
6. **Task 6: Wire `VoiceOrb` into `AIStudyBuddyModal.tsx`**
   - In `src/features/student/quick-actions/AIStudyBuddyModal.tsx`: replace `<AoedeCyberSphere3D ... />` with `<VoiceOrb ... />`.
   - Pass live `analyser={audioAnalyzer.getAnalyser()}` and compute `activity` based on live RMS energy when speaking, while preserving tap-to-interrupt functionality and exact container dimensions (`w-72 sm:w-80 md:w-96`).
7. **Task 7: Checks & Verification**
   - Run `cmd.exe /c npx.cmd tsc --noEmit` and `cmd.exe /c npm.cmd run build`.
   - Update `docs/PROJECT_STATE.md`.
   - Verify visually in browser that the liquid voice orb renders with smooth breathing, flowing highlights, and voice reactivity.

## 5. Files that will change
- `package.json` (Add `motion`)
- `src/lib/ease.ts` (Create)
- `src/components/agents/voice-orb/renderer.ts` (Create)
- `src/components/agents/voice-orb.tsx` (Create)
- `src/utils/audioAnalyzer.ts` (Modify: add `getAnalyser()`)
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` (Modify: replace sphere with `VoiceOrb`)
- `docs/PROJECT_STATE.md` (Modify: update project state)

## 6. Implementation requirements
- Faithfully implement the official `@beui/voice-orb` without distortion or missing features.
- Connect to live voice playback through both `analyser` and normalized `activity`.
- Preserve existing tap-to-interrupt behavior on the orb container.
- Do not alter or distort any other UI, styles, routes, or conversational features.

## 7. Technology / library recommendations
- `motion`: Required by `@beui/voice-orb` for high-performance spring animation and `motion/react` primitives. MIT licensed.

## 8. API / integration strategy
- Audio pipeline: `audioAnalyzer` feeds its existing Web Audio API `AnalyserNode` directly to the `analyser` prop of `VoiceOrb`.
- No server or database changes needed.

## 9. Architecture implications
- Placed in standard component structure `src/components/agents/voice-orb.tsx`, cleanly encapsulated and reusable across the application.

## 10. Security requirements
- Purely client-side WebGL canvas rendering. No external network requests, cookies, or privileged APIs accessed.

## 11. Acceptance criteria
- [ ] `motion` dependency installed and imported without type errors.
- [ ] `VoiceOrb` renders in `AIStudyBuddyModal.tsx` with flowing liquid highlights, breathing silhouette, and custom pigments.
- [ ] Orb reacts in real time to Aoede's spoken audio via live analyser and activity.
- [ ] Tap-to-interrupt on the orb continues to work when speaking.
- [ ] All surrounding modal layout, header tabs, captions card, and controls are completely preserved.
- [ ] `npx tsc --noEmit` and `npm run build` pass with 0 errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open `http://localhost:5174/` and open **Aoede (AI Study Buddy)** from the Student Dashboard.
2. Switch to **Voice** mode:
   - Observe the new **Voice Orb**: a breathing liquid sphere with flowing highlights and smooth animated pigments.
   - Verify that there is no clipping and the orb is cleanly centered.
3. Speak a prompt (e.g. *"Hello Aoede"*):
   - When Aoede responds, observe the orb's liquid surface swelling and flowing dynamically with her voice.
   - When speech pauses, observe it smoothly settling back into calm liquid breathing.
4. Tap the orb while Aoede speaks $\to$ verify it interrupts speech as expected.
