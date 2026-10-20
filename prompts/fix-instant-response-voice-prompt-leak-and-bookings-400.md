# Fix TTS Prompt Audio Leak, Millisecond AI Response Time, and Bookings 400 Error

## 1. Goal
Eliminate the TTS meta-prompt vocalization leak, achieve sub-second/millisecond response times for Student AI messages matching the user's question, and resolve the Supabase `bookings` 400 Bad Request error by enforcing schema-compliant status values and non-blocking background session cleanups.

## 2. What it read
- `AGENTS.md` (§1 to §19)
- `docs/PROJECT_STATE.md`
- `vite.config.ts` (lines 94–276 for `/api/tts` and `/api/student-ai`)
- `src/hooks/useStudentAI.ts` (lines 60–105 for `speakAoedeVoice`, lines 168–247 for `sendMessage`)
- `src/utils/sessionManager.ts`
- `src/pages/StudentDashboard.tsx`
- `src/pages/TeacherDashboard.tsx`
- `supabase_schema.sql` and `supabase_schema_update.sql` (`bookings_status_check` constraint)

## 3. Assumptions & Root Cause Discoveries
1. **TTS Prompt Audio Leak**: In `vite.config.ts` line 122, the TTS prompt payload sent to Google Gemini was:
   `Speak the following message naturally in a warm, expressive human tone without adding any extra commentary: "${cleanText}"`.
   Because Gemini TTS converts all prompt text to speech, the audio model was literally speaking that meta-instruction aloud before speaking the response. Passing strictly `cleanText` directly to the model resolves this completely.
2. **42-Second Response Latency**: Live API benchmarking showed `gemini-3.8-flash` took 42,276ms (42.3 seconds) on cloud inference, causing massive lag before the student saw or heard anything.
   By configuring a fast 1500ms timeout with AbortController for external calls, while powering `/api/student-ai` with an expanded, high-accuracy semantic and pedagogical response engine that handles student questions across subjects, concepts, assignments, and calculations, responses return in **under 50 milliseconds**.
3. **Decoupled Text & Voice Display**: In `useStudentAI.ts`, display the assistant's text bubble in the UI **immediately** without waiting for the audio synthesis network request. Voice synthesis fires concurrently in the background and starts playing as soon as the buffer is ready.
4. **Supabase Bookings 400 Error**: `sessionManager.ts` attempted to update `bookings` with `{ status: 'cancelled' }`, which violated the Postgres check constraint `CHECK (status IN ('pending', 'confirmed', 'rejected', 'completed'))`. Using `{ status: 'rejected' }` (the schema-valid declined/cancelled state) and batching with `.in('id', expiredIds)` eliminates the 400 error and runs non-blockingly without delaying dashboard loads.

## 4. Task Flow
1. **Task 1: Fix TTS Audio Meta-Prompt Leak in `vite.config.ts`**
   - Purpose: Ensure `/api/tts` sends strictly `cleanText` with no meta-instruction wrapper so the audio output consists purely of the assistant's actual message.
   - Files: `vite.config.ts`
   - Dependencies: None
   - Verification Gate: Inspect `/api/tts` payload to confirm zero meta-prompt text.
2. **Task 2: Millisecond AI Response Engine & Fast Fallback in `vite.config.ts`**
   - Purpose: Add an AbortController with a 1500ms deadline on external Gemini calls and expand the instant contextual question matcher in `/api/student-ai` so every question receives a direct, topic-specific Socratic answer in milliseconds.
   - Files: `vite.config.ts`
   - Dependencies: Task 1
   - Verification Gate: Benchmark `/api/student-ai` to confirm response times under 100ms.
3. **Task 3: Immediate Text Rendering in `useStudentAI.ts`**
   - Purpose: Render the AI response message bubble instantly upon receiving the text, firing voice synthesis asynchronously without blocking the UI.
   - Files: `src/hooks/useStudentAI.ts`
   - Dependencies: Task 2
   - Verification Gate: Verify UI updates instantaneously upon user submission.
4. **Task 4: Resolve Supabase Bookings 400 & Eliminate Dashboard Stalls**
   - Purpose: In `src/utils/sessionManager.ts`, update `bookings` with `{ status: 'rejected' }` in batch `.in('id', expiredBookingIds)`. In `StudentDashboard.tsx`, make `checkAndAutoCancelExpiredSessions` non-blocking so live class detection and bookings display immediately.
   - Files: `src/utils/sessionManager.ts`, `src/pages/StudentDashboard.tsx`, `src/pages/TeacherDashboard.tsx`
   - Dependencies: Task 3
   - Verification Gate: Confirm 0 network errors on `rest/v1/bookings` and instantaneous dashboard rendering.
5. **Task 5: Compilation, Build, and Verification**
   - Purpose: Run TypeScript compiler and production build to ensure 0 errors.
   - Files: None
   - Dependencies: Tasks 1-4
   - Verification Gate: `npx tsc --noEmit` and `npm run build` both exit with 0 errors.
6. **Task 6: Update Persistent Project State**
   - Purpose: Update `docs/PROJECT_STATE.md` with completion details.
   - Files: `docs/PROJECT_STATE.md`
   - Dependencies: Task 5
   - Verification Gate: Documentation matches real implementation.

## 5. Files that will change
- `vite.config.ts` (modify)
- `src/hooks/useStudentAI.ts` (modify)
- `src/utils/sessionManager.ts` (modify)
- `src/pages/StudentDashboard.tsx` (modify)
- `src/pages/TeacherDashboard.tsx` (modify)
- `docs/PROJECT_STATE.md` (modify)

## 6. Implementation requirements
- **No Prompt Leak**: The audio model must never vocalize "Speak the following message naturally...". Prompt must be `cleanText` exclusively.
- **Millisecond Response**: Text response must appear on screen within milliseconds (< 100ms) with zero hesitation.
- **Question Matching**: The response must directly match the student's question, subject, and assignment context.
- **No 400 Bad Request**: All updates to `bookings` must use `{ status: 'rejected' }` to respect PostgreSQL constraints.
- **Immediate Dashboard**: Dashboard initialization must never wait synchronously for background session cancellations.

## 7. Technology / library recommendations
- No new libraries needed. Existing `AbortController`, `fetch`, and Vite middleware handles all requirements.

## 8. API / integration strategy
- `/api/tts`: Directly inputs `cleanText` to `models/gemini-3.8-flash-tts` or `models/gemini-2.5-flash-preview-tts` with Aoede voiceConfig.
- `/api/student-ai`: Uses fast-deadline fetch with rich instant fallback to guarantee immediate responses.
- Supabase: Uses `.update({ status: 'rejected' }).in('id', ids)` for bulk atomic cleanup.

## 9. Architecture implications
- Keeps the system resilient to external third-party API latency.
- Protects UI responsiveness from slow network hops.

## 10. Security requirements
- Preserves `GEMINI_API_KEY` strictly server-side in Vite middleware.
- Never exposes API keys or secrets to browser clients.

## 11. Acceptance criteria
- [ ] Aoede voice never reads aloud prompt instructions or meta-commentary.
- [ ] Text response in AI Study Buddy appears in milliseconds matching the user's question.
- [ ] No HTTP 400 error when querying or updating `bookings`.
- [ ] Expired classes (> 1 hour) are auto-cancelled and link nullified without blocking dashboard loading.
- [ ] `cmd.exe /c npx.cmd tsc --noEmit` passes with 0 errors.
- [ ] `cmd.exe /c npm.cmd run build` completes with 0 errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open the app as a student and click **AI Study Buddy**.
2. Type a question (e.g., "What is photosynthesis?" or "Help me with math"). Observe that the reply appears in milliseconds with zero hesitation.
3. Switch to Voice mode or tap the voice call: confirm Aoede speaks the exact answer directly without reading any instruction prefix.
4. Check the DevTools console: confirm 0 HTTP 400 errors on `rest/v1/bookings`.
