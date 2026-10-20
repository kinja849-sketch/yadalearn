# Implementation Plan — Student AI Agent (Socratic Study Buddy & Cognitive Mentor)

## 1. Goal
Implement Phase 1 of the YadaLearn AI Ecosystem: transform the Student AI Study Buddy into an interactive Socratic learning companion and assignment deconstructor with context-aware hinting, multi-subject support, and resilient server-side streaming, while preserving 100% of existing functionality.

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` (Workflow, build order, security, client/server boundary)
- `docs/PROJECT_STATE.md` (Product snapshot, recent screen share and ratings fixes, zero pending tasks)
- `docs/DECISIONS.md` (Supabase Auth truth, Stream Video primary, no 2nd global store, pastel design system)
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` (Current static modal implementation)
- `src/pages/AIFeatures.tsx` (Current standalone AI page implementation)
- `src/pages/StudentDashboard.tsx` (Student schedule, bookings, courses, quick actions)
- `src/contexts/AuthContext.tsx` (User role, subjects, user ID)
- `vite.config.ts` (Dev server middleware `/api/*` pattern for server-side secret isolation)
- `netlify.toml` (`/api/*` rewrite configuration for production)
- `supabase_schema.sql`, `supabase_schema_update.sql`, `supabase_schema_parent.sql`

## 3. Assumptions
- **Inference Strategy:** To keep YadaLearn immediately functional without requiring external paid keys upfront, the agent backend will implement an intelligent pedagogical Socratic engine on the server `/api/student-ai` that supports both LLM streaming (when `GEMINI_API_KEY` or `OPENAI_API_KEY` is present in `.env`) and a robust heuristic Socratic pedagogical engine when running without an external key.
- **Zero Breaking Changes:** Existing tables (`profiles`, `courses`, `assignments`, `submissions`, `bookings`) remain untouched. Any conversation persistence uses client session state and non-breaking Supabase table storage if available.
- **Pedagogical Guardrail:** The Student AI must NEVER directly do the student's homework. It must follow the Socratic method: guiding with questions, conceptual analogies, and step-by-step verification.

## 4. Task Flow
```
Task 1: AI Agent Gateway & Socratic Engine
  ├── Create server middleware in vite.config.ts for `/api/student-ai`
  └── Support Socratic system prompt, assignment breakdown, and quiz generation

Task 2: Student AI Hook (`src/hooks/useStudentAI.ts`)
  ├── Encapsulate message state, streaming responses, and subject context
  └── Provide specialized actions: askSocraticHint, generateMicroTasks, createQuickQuiz

Task 3: Modernize `AIStudyBuddyModal.tsx`
  ├── Connect to `useStudentAI`
  ├── Add subject selector dropdown based on student's actual enrolled subjects
  ├── Add interactive quick-action chips (Quiz Me, Break Down Topic, Socratic Hint)
  └── Preserve mobile-responsive layout and lavender/purple design tokens

Task 4: Update `AIFeatures.tsx`
  └── Align the full-page AI Study Buddy with the unified `useStudentAI` hook

Task 5: Verification & Quality Checks
  ├── Run typecheck (`tsc --noEmit`) and build (`npm run build`)
  └── Verify modal in desktop and mobile viewports
```

## 5. Files that will change
- **Create:**
  - `src/hooks/useStudentAI.ts` — React hook managing student AI conversation, streaming, and Socratic actions.
  - `src/types/ai.ts` — TypeScript definitions for AI messages, suggestions, and learning goals.
- **Modify:**
  - `vite.config.ts` — Add `/api/student-ai` development middleware with Socratic intelligence pipeline.
  - `src/features/student/quick-actions/AIStudyBuddyModal.tsx` — Integrate dynamic Socratic messaging, subject filtering, and action chips.
  - `src/pages/AIFeatures.tsx` — Connect to `useStudentAI` for a unified experience.

## 6. Implementation Requirements
- **Socratic Inquiry Pipeline:** When a student enters a problem (e.g. "What is 2x + 6 = 14?"), the AI must not reply "x = 4". It must ask: "To find x, we need to isolate it. What can we do to both sides to eliminate the +6 first?".
- **Context Injection:** The prompt injected into the engine must include the student's selected subject and name, adapting the explanation complexity to high-school / intermediate level.
- **Quick Action Triggers:**
  - `🎯 Quiz Me`: Generates a 3-question conceptual quiz on the selected subject.
  - `🧩 Break Down Topic`: Generates a 4-step actionable study roadmap for the current topic.
  - `💡 Give Me a Hint`: Provides a hint without giving the answer.
  - `📖 Summarize`: Explains the concept using real-world analogies.
- **UI & Accessibility:** Retain full pastel styling (`#5B4A9F`, lavender borders, smooth scroll, mobile keyboard-safe input, accessible dialog titles).

## 7. Technology / Library Recommendations
- **Existing Stack Only:** Use existing React 18, Vite middleware, Lucide / Material Symbols, Tailwind CSS. No new external libraries needed.

## 8. API / Integration Strategy
- **Path:** `/api/student-ai` (POST)
- **Request Body:** `{ messages: [{ role, content }], subject: string, studentName: string, actionType?: string }`
- **Response:** JSON streaming or structured JSON response with `{ reply: string, suggestions: string[] }`.
- **Environment:** Reads optional `GEMINI_API_KEY` or `OPENAI_API_KEY` from `process.env`. If absent, gracefully executes the built-in Socratic reasoning engine.

## 9. Architecture Implications
- Clean separation between client presentation (`AIStudyBuddyModal.tsx`) and agent intelligence logic (`useStudentAI.ts`).
- Server-side token / key protection: frontend never sees any AI API keys.
- Completely compatible with existing Netlify deploy setup via standard `/api/*` rewrite.

## 10. Security Requirements
- No student PII (passwords, email addresses, phone numbers) sent to external endpoints.
- All requests gated to authenticated sessions.
- Student AI operates exclusively within the student's own context.

## 11. Acceptance Criteria
- [ ] Student can open `AIStudyBuddyModal` from Student Dashboard and select any of their subjects.
- [ ] Sending a query receives a contextual Socratic response rather than a static placeholder.
- [ ] Clicking action chips ("Quiz Me", "Break Down Topic", "Give Me a Hint") triggers tailored study workflows.
- [ ] No regression or breakage to existing `StudentDashboard.tsx`, `Meeting.tsx`, or any other functional page.
- [ ] `tsc --noEmit` and `npm run build` pass with 0 errors.

## 12. Checks to run
1. `cmd.exe /c npx.cmd tsc --noEmit`
2. `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Log in as a student (`/student-dashboard`).
2. Click the **"AI Study Buddy"** quick-action button in the Quick Actions bar.
3. Verify the modal opens with the student's actual enrolled subject in the title header.
4. Type a question: *"Explain how Newton's second law works"*.
5. Observe the Socratic, encouraging response that invites the student to reason through $F = ma$.
6. Click the **"🎯 Quiz Me"** chip and confirm an interactive quiz question is presented.
7. Click the **"🧩 Break Down Topic"** chip and verify a 4-step structured study plan is provided.
