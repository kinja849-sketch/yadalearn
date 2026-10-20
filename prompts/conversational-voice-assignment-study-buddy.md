# Implementation Plan — Conversational Voice Study Buddy ("Aoede") with Zero-Delay Voice, Assignment Detection & Application Logo

## 1. Goal
Upgrade the Student AI Study Buddy into **Aoede**, a zero-delay voice-to-voice and text conversational companion using the official application logo (`/logo (2).png`), real Supabase assignment auto-detection, pure symbol-free human speech, and complete suppression of the bottom navigation while active.

## 2. What it read
- `AGENTS.md` (Workflow rules, design tokens, zero disturbance to existing features)
- User feedback and screenshot `media_1792500994052.png`
- `index.html` (Application logo is `/logo (2).png`)
- `src/pages/StudentDashboard.tsx` (BottomNav & modal rendering)
- `src/components/BottomNav.tsx` (Z-index and portal structure)
- `src/features/student/quick-actions/AssignmentsModal.tsx` (Supabase query schema for courses, assignments, and submissions)
- `src/hooks/useStudentAI.ts` and `vite.config.ts`

## 3. Assumptions & Refinements
- **Voice Persona ("Aoede"):** The voice mentor is strictly named **Aoede** across the project and styled with a pulsing audio visualizer when speaking/listening.
- **Chat Profile:** The avatar for Aoede in all message threads is the authentic application logo `/logo (2).png`.
- **Zero-Delay Voice-to-Voice:** Uses browser-level `webkitSpeechRecognition` / `SpeechRecognition` configured for rapid speech-end dispatch and immediate `window.speechSynthesis` audio playback, bypassing round-trip transcription lag.
- **Strictly Zero Symbols:** System prompt and server sanitizer enforce 100% human prose: no asterisks (`*`), hashtags (`#`), bullets (`•`), or dashes (`-`).
- **Real Assignment Detection:** Queries Supabase `enrollments` -> `courses` -> `assignments` and `submissions` for the student. When the student asks about assignments or math homework, Aoede identifies the exact assignment and guides them step by step.
- **Bottom Navigation Isolation:** In `StudentDashboard.tsx`, `<BottomNav />` is completely hidden when `activeModal === 'ai-buddy'`.

## 4. Task Flow
```
Task 1: Assignment Detection & Zero-Delay Voice Engine in `src/hooks/useStudentAI.ts`
  ├── Fetch real enrolled assignments from Supabase (`enrollments`, `courses`, `assignments`, `submissions`)
  ├── Build zero-delay voice-to-voice engine using Web Speech API with instantaneous audio synthesis
  └── Provide voice state (isListening, isSpeaking, toggleVoice, stopSpeaking) and Aoede persona

Task 2: Strict No-Symbols Human Scaffolding in `vite.config.ts`
  ├── Update `/api/student-ai` to detect specific student assignments
  ├── Formulate pure conversational human prose (zero markdown symbols: *, #, bullets)
  └── Implement regex sanitizer ensuring no symbol leaks through

Task 3: Modernize `AIStudyBuddyModal.tsx` as "Aoede"
  ├── Use `/logo (2).png` for Aoede's chat profile avatar
  ├── Add real assignment detection banner with 1-click select
  ├── Add instant Voice-to-Voice mode with live wave animation and instant mic
  ├── Remove static step chips in favor of fluid natural conversation
  └── Set dialog overlay to z-[1001]

Task 4: Bottom Navigation Elimination in `StudentDashboard.tsx`
  └── Conditionally render `{activeModal !== 'ai-buddy' && <BottomNav />}`

Task 5: Verification & Quality Checks
  ├── Run typecheck (`tsc --noEmit`) and build (`npm run build`)
  └── Verify zero BottomNav interference, symbol-free output, and voice responsiveness
```

## 5. Files that will change
- `src/hooks/useStudentAI.ts` — Add Supabase assignments fetching, voice recognition, and instantaneous speech synthesis.
- `vite.config.ts` — Update `/api/student-ai` with assignment awareness, step-by-step guidance, and strict symbol sanitization.
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` — Integrate Aoede persona, `/logo (2).png` chat profile, voice controls, and assignment pills.
- `src/pages/StudentDashboard.tsx` — Suppress BottomNav when `activeModal === 'ai-buddy'`.

## 6. Implementation Requirements
- **Aoede Persona & Logo:** Aoede is prominently displayed as the AI mentor, with `/logo (2).png` as the chat avatar.
- **Zero-Delay Voice-to-Voice:** Speech ends $\to$ instant transcription $\to$ immediate AI processing $\to$ instant vocalization with `speechSynthesis`.
- **Assignment Auto-Detection:** Automatically inspects the student's real enrolled assignments in Supabase and presents active assignments clearly.
- **Step-by-Step Guidance:** Guides through problems one step at a time without revealing the final answer.
- **No Symbols:** Absolutely no `*`, `#`, or bullets.
- **BottomNav Hidden:** Disappears completely while modal is open.

## 7. Technology / Library Recommendations
- Browser native Web Speech API (`SpeechRecognition`, `SpeechSynthesis`). Zero new external libraries.

## 8. API / Integration Strategy
- `/api/student-ai` receives `{ messages, subject, studentName, assignmentContext }`.
- Responds with symbol-free human text.

## 9. Architecture Implications
- Preserves existing database schema and auth state.
- Completely clean integration into the existing React components.

## 10. Security Requirements
- Queries filtered by `student_id = auth.uid()`.
- No sensitive user secrets transmitted.

## 11. Acceptance Criteria
- [ ] Bottom navigation is completely hidden when Aoede Study Buddy is open.
- [ ] Chat profile uses the application logo `/logo (2).png`.
- [ ] The voice avatar and persona is named **Aoede**.
- [ ] Voice-to-voice interaction has zero delay and natural speech playback.
- [ ] Real assignments from Supabase are detected and visible to the student.
- [ ] All AI responses are 100% symbol-free (no `*`, `#`, or bullets).
- [ ] Step-by-step guidance is provided for homework help without giving direct answers.
- [ ] `tsc --noEmit` and `npm run build` pass with 0 errors.

## 12. Checks to run
1. `cmd.exe /c npx.cmd tsc --noEmit`
2. `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Go to `/student-dashboard`.
2. Click **AI Study Buddy**.
3. Verify `BottomNav` is completely invisible.
4. Verify Aoede's avatar is the application logo `/logo (2).png`.
5. Check that detected assignments are shown.
6. Click the microphone, speak: *"I don't understand this mathematics assignment, I want you to help me"*.
7. Confirm Aoede replies instantly with voice and text, completely free of any `*` or `#` symbols, guiding you through the first step.
