# Implementation Plan — Fix Conversational Intelligence & Eliminate Repetitive Greetings in Aoede

## 1. Goal
Eliminate repetitive hardcoded greeting loops in the Student AI Agent and build a responsive, multi-turn conversational intelligence engine in `/api/student-ai` that recognizes greetings, social inquiries ("how are you"), affirmations, homework questions, and conversational memory without repeating phrases.

## 2. What it read
- `AGENTS.md` (Workflow rules, design system, zero disturbance to existing features)
- User uploaded screenshot `media_1792505062310.png` showing Aoede repeating the exact same initial greeting after "HY" and "HOW ARE U".
- `vite.config.ts` lines 195–235 (Identified root cause: catch-all `else` branch unconditionally outputting the initial welcome string for any unrecognized input).

## 3. Assumptions & Root Cause Analysis
- **Root Cause:** In `vite.config.ts`, when an external LLM key is absent, the fallback logic only had simple pattern matching for "assignment" and math equations. Any social inquiry ("how are u", "hy", "who are you", "ok", "tell me a tip") fell into the default `else` block, which unconditionally returned:
  `Hello Najib, I am Aoede, your study companion for English. What topic or homework problem would you like to explore together right now?`
  This caused repetitive, robotic loops.
- **Solution:**
  1. Build a rich conversational intent router in `/api/student-ai` covering:
     - **Social Greetings & Check-ins:** "hy", "hello", "hey", "how are you", "how's your day", "who are you", "what can you do", "thank you", "thanks".
     - **Affirmations & Conversational Continuations:** "yes", "no", "ok", "i understand", "i don't understand", "tell me more", "what next".
     - **Subject-Specific Guidance for English:** reading comprehension, essays, grammar, vocabulary, sentence structure, punctuation.
     - **Subject-Specific Guidance for Mathematics & Sciences:** equations, steps, formulas, concepts.
  2. Implement **Conversation History & Non-Repetition Guard:**
     - The engine inspects past assistant messages in the thread and guarantees it **never** repeats the previous assistant reply or the introductory greeting once the conversation has started.
  3. Ensure 100% symbol-free human dialogue.

## 4. Task Flow
```
Task 1: Comprehensive Multi-Turn Conversational Intent Engine in `vite.config.ts`
  ├── Add intent classifiers for social greetings, check-ins ("how are you"), gratitude, and clarifications
  ├── Add contextual awareness for English (essay writing, grammar, vocabulary) and all enrolled subjects
  └── Implement history deduplication guard ensuring zero consecutive repeated responses

Task 2: Contextual Dialogue Memory in `src/hooks/useStudentAI.ts`
  ├── Pass full conversation history (`messages`) to the API
  └── Maintain natural conversational flow across multiple turns

Task 3: Verification & Quality Checks
  ├── Run typecheck (`tsc --noEmit`) and build (`npm run build`)
  └── Verify "hy" -> greeting, "how are u" -> personal social response without repeating greeting
```

## 5. Files that will change
- `vite.config.ts` — Upgrade `/api/student-ai` with multi-turn intent classification, social conversation handling, and non-repetition guards.
- `src/hooks/useStudentAI.ts` — Ensure message context array is clean and passed properly.

## 6. Implementation Requirements
- When the student says "hy" or "hello", Aoede responds with a friendly, natural greeting.
- When the student asks "how are u", Aoede responds warmly to the personal inquiry: "I am doing great, thank you for asking! I am excited to help you learn today. How are you doing, and what can we tackle in your studies?"
- No two consecutive responses from Aoede may be identical.
- All responses remain 100% free of markdown symbols (`*`, `#`, bullets).

## 7. Technology / Library Recommendations
- Native Node.js request handler in Vite middleware. Zero new npm packages.

## 8. API / Integration Strategy
- `/api/student-ai` receives `{ messages, subject, studentName, activeAssignment, detectedAssignments }`.
- Returns `{ reply, detectedAssignment }` with dynamic, non-repetitive prose.

## 9. Architecture Implications
- Preserves 100% of the existing database, frontend, and Stream provider.
- Immediately provides high-intelligence conversation even without third-party API keys, and scales seamlessly when keys are added.

## 10. Security Requirements
- All data stays within the local development and client boundary.

## 11. Acceptance Criteria
- [ ] Texting "hy" or "hello" receives an encouraging, natural welcome.
- [ ] Texting "how are u" receives a thoughtful, direct reply to the question instead of the repeated greeting.
- [ ] Asking questions about the subject (e.g. English or Math) provides direct, relevant guidance.
- [ ] Zero symbols (`*`, `#`, bullets) in all outputs.
- [ ] `tsc --noEmit` and `npm run build` pass with 0 errors.

## 12. Checks to run
1. `cmd.exe /c npx.cmd tsc --noEmit`
2. `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open student dashboard (`/student-dashboard`).
2. Click **AI Study Buddy**.
3. Type: *"hy"*. Verify Aoede greets you.
4. Type: *"how are u"*. Verify Aoede responds to how she is doing and asks how your day is, **without repeating the previous message**.
5. Type: *"can you help me with an essay?"*. Verify Aoede gives step-by-step guidance on structuring an essay.
