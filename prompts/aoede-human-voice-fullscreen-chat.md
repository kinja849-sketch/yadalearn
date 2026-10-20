# Implementation Plan — Aoede Human Voice, Fullscreen Immersion & Distinct Text/Voice Modes

## 1. Goal
Refactor the Student AI interface into a full-screen immersive experience with distinct text-only (silent) and voice-to-voice modes, utilizing the authentic Aoede human voice model with zero-delay playback and assignment grounding.

## 2. What it read
- `AGENTS.md` (Workflow rules, design tokens, zero disturbance to existing features)
- User feedback:
  1. Voice must be the genuine **Aoede human voice**, not robotic browser TTS.
  2. The chat/conversation interface must take **full screen** (`fixed inset-0 w-full h-full`).
  3. When texting, reply strictly in text (silent).
  4. Only in Voice Mode does voice-to-voice conversation take place.
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx`
- `src/hooks/useStudentAI.ts`
- `vite.config.ts` (`/api/student-ai` and `/api/tts` for Aoede voice synthesis)

## 3. Assumptions & Strategy
- **Fullscreen Experience:** Replace the popup dialog with a full-screen viewport (`fixed inset-0 w-full h-screen z-[1001] bg-background`), giving the student a distraction-free, dedicated learning environment.
- **Text vs. Voice Segregation:**
  - **Text Mode:** When the student types and hits send, Aoede generates an intelligent, symbol-free textual response and does **NOT** speak.
  - **Voice Mode:** When the student enters Voice Mode (tapping the live mic or Voice Call button), the student speaks, Aoede listens, and Aoede replies with audio voice playback (Aoede human voice) accompanied by live captions.
- **Aoede Human Voice Pipeline:**
  - Create a dedicated `/api/tts` endpoint in `vite.config.ts` supporting Google Cloud / Gemini TTS with voice `"Aoede"`.
  - When an external API key is present, it returns high-fidelity neural audio for `"Aoede"`.
  - When running locally, it selects the highest-clarity natural human voice profile with human-like prosody, pitch modulation, and zero-delay streaming playback.
- **Assignment Auto-Detection:** Preserves real Supabase assignment grounding without symbols.

## 4. Task Flow
```
Task 1: Fullscreen Interface Architecture in `AIStudyBuddyModal.tsx`
  ├── Convert modal container to full-screen: `fixed inset-0 w-screen h-screen z-[1001]`
  ├── Implement dedicated Voice-to-Voice Call Stage vs. Text Chat Stage
  └── Add seamless toggle between Text Mode and Voice Call Mode

Task 2: Separate Text vs. Voice Response Dispatch in `useStudentAI.ts`
  ├── Track message input origin: `source: 'text' | 'voice'`
  ├── When source is 'text': mute speech synthesis completely
  └── When source is 'voice': trigger zero-delay Aoede voice audio response

Task 3: Aoede Human Voice Engine in `vite.config.ts` & `useStudentAI.ts`
  ├── Add `/api/tts` endpoint in `vite.config.ts` configured for Google/Gemini "Aoede" voice
  └── Provide instant audio playback buffer for voice-to-voice sessions

Task 4: Verification & Quality Checks
  ├── Run typecheck (`tsc --noEmit`) and build (`npm run build`)
  └── Verify fullscreen layout, silent text replies, and voice-to-voice audio
```

## 5. Files that will change
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` — Fullscreen layout and voice-mode UI.
- `src/hooks/useStudentAI.ts` — Voice vs. text dispatch logic and Aoede audio streaming.
- `vite.config.ts` — Add `/api/tts` endpoint for Aoede human voice synthesis.

## 6. Implementation Requirements
- **Fullscreen:** Modal covers 100% of the viewport on both mobile and desktop.
- **Silent Text Mode:** Typing a message produces a text-only response (0 audio played).
- **Voice-to-Voice Mode:** Activating voice mode listens to student speech and speaks back in the Aoede voice.
- **No Symbols:** All responses remain 100% free of markdown symbols (`*`, `#`, bullets).
- **Application Logo Profile:** Chat avatar remains `/logo (2).png`.

## 7. Technology / Library Recommendations
- Native Web Speech API & HTML5 Audio / fetch audio streaming. Zero new npm packages.

## 8. API / Integration Strategy
- `/api/student-ai` for text reasoning.
- `/api/tts` for generating or streaming the Aoede voice.

## 9. Acceptance Criteria
- [ ] Conversation takes the full screen (100% width and height).
- [ ] Texting in the chat replies in text only without speaking.
- [ ] Voice mode enables real-time voice-to-voice conversation with Aoede human voice.
- [ ] Chat profile uses `/logo (2).png`.
- [ ] `tsc --noEmit` and `npm run build` pass with 0 errors.

## 10. Checks to run
1. `cmd.exe /c npx.cmd tsc --noEmit`
2. `cmd.exe /c npm.cmd run build`

## 11. How to verify
1. Open student dashboard (`/student-dashboard`).
2. Click **AI Study Buddy**.
3. Confirm the interface opens in **full screen**.
4. Type a question: *"Explain what an angle is"* $\to$ confirm it replies in text only without any audio.
5. Tap **Start Voice Mode** or the Voice Call button, speak: *"Help me with my assignment"* $\to$ confirm Aoede replies back in human voice.
