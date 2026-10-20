# Implementation Plan — Native Google Gemini "Aoede" Neural Voice Integration

## 1. Goal
Connect the Student AI voice synthesis engine (`/api/tts`) directly to Google Gemini's native audio model (`gemini-2.0-flash`) using the configured `GEMINI_API_KEY` and prebuilt voice `"Aoede"`, delivering ultra-realistic, expressive human voice audio with zero robotic browser synthesis.

## 2. What it read
- `AGENTS.md` (Workflow rules, security: never log keys, client/server boundary)
- Google Gemini API specification for `speechConfig` and `prebuiltVoiceConfig.voiceName = "Aoede"`
- `.env` and `vite.config.ts`
- `src/hooks/useStudentAI.ts` (Audio playback pipeline)

## 3. Assumptions & Strategy
- **API Key Security:** The key provided by the user is saved securely into `.env` as `GEMINI_API_KEY`. It is never checked into git or sent to the browser bundle.
- **Gemini Aoede Audio Pipeline:**
  - Call `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}` with `responseModalities: ["AUDIO"]` and `voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }`.
  - Process the returned audio payload (`inlineData.data` and `inlineData.mimeType`).
  - If the audio is 24kHz PCM, wrap it in a standard 44-byte RIFF/WAV container so it plays instantly and natively in any browser via HTML5 Audio.
- **Zero Browser Robot Synthesis:**
  - In Voice Mode, audio playback plays the authentic Gemini Aoede audio stream.
  - If a temporary network failure occurs, the app gracefully prompts to retry rather than falling back to robotic computer speech.

## 4. Task Flow
```
Task 1: Secure Environment Variable Configuration
  └── Add GEMINI_API_KEY securely into `.env` (protected by .gitignore)

Task 2: Native Gemini Aoede Audio Generation in `vite.config.ts`
  ├── Connect `/api/tts` to Gemini 2.0 Flash Audio with `voiceName: "Aoede"`
  ├── Implement WAV header wrapper for raw 24kHz PCM audio streams
  └── Return clean base64 audio data URL to the client

Task 3: Client Audio Player Optimization in `useStudentAI.ts`
  ├── Ensure client plays the Gemini Aoede audio buffer seamlessly
  └── Synchronize speaking animation state with the audio playback duration

Task 4: Verification & Quality Checks
  ├── Run typecheck (`tsc --noEmit`) and build (`npm run build`)
  └── Test voice generation to confirm authentic, expressive human Aoede speech
```

## 5. Files that will change
- `.env` — Add `GEMINI_API_KEY`.
- `vite.config.ts` — Wire `/api/tts` to Gemini 2.0 Flash Audio API with Aoede voice specification and WAV packaging.
- `src/hooks/useStudentAI.ts` — Play Gemini audio data directly with error handling.

## 6. Implementation Requirements
- The voice played must be the official Google Gemini neural **Aoede** voice.
- Zero robotic browser `SpeechSynthesisUtterance` when Gemini Aoede audio is available.
- Audio plays smoothly with natural human prosody, breath, and inflection.

## 7. Technology / Library Recommendations
- Google Gemini REST API (`gemini-2.0-flash` audio modality). Built-in standard Node.js buffer utilities in Vite server.

## 8. API / Integration Strategy
- `/api/tts` (POST) receives `{ text: string }`.
- Calls Gemini 2.0 Flash with `voiceName: "Aoede"`.
- Returns `{ audioContent: string, mimeType: string, voice: "Aoede" }`.

## 9. Security Requirements
- Key stored only on server (`.env` & `process.env`).
- Never exposed in frontend client bundles.

## 10. Acceptance Criteria
- [ ] Gemini Aoede voice generates real neural audio and plays back in the browser.
- [ ] Voice sounds distinctly human, warm, and natural—not robotic.
- [ ] `tsc --noEmit` and `npm run build` pass with 0 errors.

## 11. Checks to run
1. `cmd.exe /c npx.cmd tsc --noEmit`
2. `cmd.exe /c npm.cmd run build`

## 12. How to verify
1. Open student dashboard (`/student-dashboard`).
2. Click **AI Study Buddy** $\to$ switch to **Voice Call** mode.
3. Speak: *"Hello Aoede, how are you?"*
4. Listen to the audio response: confirm it is Google's authentic, expressive, ultra-lifelike human **Aoede** voice.
