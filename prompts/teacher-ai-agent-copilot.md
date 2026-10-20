# Implementation Plan — Phase 2: Teacher AI Agent (Co-Pilot, Formative Grading Assistant & Lesson Planner)

## 1. Goal
Empower teachers with a native AI Teaching Co-Pilot that provides instant formative submission grading assistance, interactive lesson planning and Socratic discussion starters, and real-time student engagement radar analytics without disrupting any existing features.

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` (Workflow, build-order, security, and approval rules)
- `docs/PROJECT_STATE.md` (Recent state: Phase 1 Student AI complete, Gemini Aoede neural voice active, verified clean build)
- `docs/DECISIONS.md` (Supabase truth, Stream primary video, design tokens, no extra global store)
- `src/pages/TeacherDashboard.tsx` (Teacher layout, quick actions grid, modal management, state)
- `src/features/teacher/quick-actions/ReviewSubmissionsModal.tsx` (Submissions queue, submission viewer, grading controls, feedback input)
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` (Session creation, subject selector, title, description, scheduling)
- `src/features/teacher/quick-actions/StudentOverviewModal.tsx` (Student listing, stats, parent links, individual performance breakdown)
- `vite.config.ts` (Existing `/api/student-ai` and `/api/tts` endpoints powered by Gemini)

## 3. Assumptions
- **Intelligence Model**: Use the existing server-side Gemini integration (`gemini-2.0-flash` with the configured `GEMINI_API_KEY`) via a dedicated `/api/teacher-ai` endpoint.
- **Workflow Integration**: Rather than forcing teachers to leave their normal grading and scheduling workflow, the Teacher AI will be deeply integrated directly where teachers need it:
  1. Inside `ReviewSubmissionsModal.tsx` as an **AI Formative Grading Assistant** that analyzes the student's submission against assignment goals to draft structured feedback and a suggested score.
  2. Inside `CreateSessionModal.tsx` as an **AI Lesson Outline & Discussion Builder** that generates lesson milestones, icebreakers, and Socratic discussion prompts based on the subject and topic.
  3. Inside `TeacherDashboard.tsx` / `StudentOverviewModal.tsx` as a **Student Engagement Radar** providing insights and personalized intervention ideas for individual students.
  4. On `TeacherDashboard.tsx` quick actions as a dedicated **AI Teaching Co-Pilot** card.
- **Tone & Symbol Stripping**: Symbol stripping applied to all natural output; professional, encouraging, and constructive pedagogical tone.
- **Zero Disruption**: All manual controls (manual grading, manual topic inputs, existing calendar and real-time broadcasts) remain completely functional and untouched.

## 4. Task Flow
1. **Task 1: Server-Side API Endpoint (`/api/teacher-ai` in `vite.config.ts`)**
   - *Purpose*: Handle teacher AI tasks (`grading_assistant`, `lesson_planner`, `engagement_insights`, `general_copilot`) server-side using `gemini-2.0-flash` with the secured `GEMINI_API_KEY`.
   - *Dependencies*: None.
   - *Files Affected*: `vite.config.ts`.
   - *Risks*: Missing or invalid Gemini API key handled gracefully with intelligent pedagogical heuristic fallbacks.
   - *Verification Gate*: Test `/api/teacher-ai` with curl/fetch for each action type.

2. **Task 2: Teacher AI Hook & Service (`src/hooks/useTeacherAI.ts`)**
   - *Purpose*: Provide a clean, typed React hook for components to invoke grading assistance, lesson planning, and student insights with loading and error states.
   - *Dependencies*: Task 1.
   - *Files Affected*: `src/hooks/useTeacherAI.ts`, `src/types/ai.ts`.
   - *Risks*: Network latency during grading request; handled via responsive loading spinners.
   - *Verification Gate*: TypeScript compilation check (`tsc --noEmit`).

3. **Task 3: AI Formative Grading Assistant in `ReviewSubmissionsModal.tsx`**
   - *Purpose*: Add a "✨ AI Formative Review" button above grading controls that analyzes student submission text, presents praise, areas for growth, and a suggested score with a single "Apply Suggestion" button.
   - *Dependencies*: Task 2.
   - *Files Affected*: `src/features/teacher/quick-actions/ReviewSubmissionsModal.tsx`.
   - *Risks*: Overwriting teacher's existing unsaved notes; ask or preserve until teacher clicks apply.
   - *Verification Gate*: Open Review Submissions modal, click AI Review, verify generated grade and feedback preview.

4. **Task 4: AI Lesson Planner & Discussion Builder in `CreateSessionModal.tsx`**
   - *Purpose*: Add a "✨ AI Lesson Outline" trigger next to the lesson description that crafts structured objectives, a 3-stage timeline (Hook, Interactive Exploration, Socratic Wrap-up), and discussion questions.
   - *Dependencies*: Task 2.
   - *Files Affected*: `src/features/teacher/quick-actions/CreateSessionModal.tsx`.
   - *Risks*: Cluttering the modal; render as a clean expandable panel or populate the description.
   - *Verification Gate*: Select Subject, enter Title, click AI Lesson Outline, verify generation.

5. **Task 5: Quick Action Card & Co-Pilot Workspace in `TeacherDashboard.tsx` & `StudentOverviewModal.tsx`**
   - *Purpose*: Add the "AI Co-Pilot" card in the Teacher Dashboard quick-actions grid and student engagement recommendations in `StudentOverviewModal.tsx`.
   - *Dependencies*: Task 2, 3, 4.
   - *Files Affected*: `src/pages/TeacherDashboard.tsx`, `src/features/teacher/quick-actions/StudentOverviewModal.tsx`.
   - *Risks*: Visual consistency with pastel/peach palette; match existing teacher theme (`#FF7D46` / amber / orange / pastel).
   - *Verification Gate*: Dashboard quick action triggers AI modal; Student Overview shows engagement recommendations.

6. **Task 6: Verification & Project State Update**
   - *Purpose*: Run full TypeScript and Vite build checks, update `docs/PROJECT_STATE.md`.
   - *Dependencies*: All previous tasks.
   - *Files Affected*: `docs/PROJECT_STATE.md`.
   - *Verification Gate*: `npx tsc --noEmit` 0 errors, `npm run build` 0 errors.

## 5. Files that will change
- `vite.config.ts` (Add `/api/teacher-ai` endpoint handler)
- `src/types/ai.ts` (Add types for Teacher AI requests, grading recommendations, lesson outlines)
- `src/hooks/useTeacherAI.ts` (New hook for teacher AI actions)
- `src/features/teacher/quick-actions/ReviewSubmissionsModal.tsx` (Add AI Formative Grading Assistant card & apply button)
- `src/features/teacher/quick-actions/CreateSessionModal.tsx` (Add AI Lesson Planner & Discussion Builder)
- `src/features/teacher/quick-actions/StudentOverviewModal.tsx` (Add AI Engagement Insights per student)
- `src/pages/TeacherDashboard.tsx` (Add AI Co-Pilot quick action card and modal trigger)
- `docs/PROJECT_STATE.md` (Update project state upon completion)

## 6. Implementation Requirements
- **Rubric-Based Formative Grading**:
  - Analyzes assignment title and student submission text.
  - Suggests a fair score (0–100) based on comprehension, clarity, and depth.
  - Generates positive reinforcement followed by constructive improvement tips.
  - Clean one-click "Apply to Grade & Feedback" that populates the native input fields.
- **Lesson Planner & Discussion Starter**:
  - Contextual to the selected subject (e.g. Mathematics, Physics, English, Chemistry).
  - Outlines key learning goals, an engaging icebreaker hook, and 3 open-ended discussion questions.
- **Student Engagement Radar**:
  - Highlights whether student attendance or assignment completion is lagging.
  - Suggests a tailored check-in message or pedagogical intervention for the teacher.
- **Visual Design**:
  - Strictly adhere to the teacher surface theme (`#FF7D46` accents, warm peach/orange glows, soft glass cards, rounded corners `rounded-2xl` / `rounded-[2rem]`).
  - Mobile-responsive and accessible.

## 7. Technology / Library Recommendations
- **Existing Stack**: No new dependencies required. Uses existing `@google/genai` or direct Gemini REST endpoint in `vite.config.ts`, React state, and Tailwind design tokens.

## 8. API / Integration Strategy
- Endpoint: `/api/teacher-ai` in Vite middleware (mirrors `/api/student-ai`).
- Methods: POST with JSON payload `{ action: 'grade' | 'lesson' | 'engagement' | 'chat', data: { ... } }`.
- Client vs Server: Gemini API key remains strictly server-side in `.env`.
- Error handling: Graceful fallback messages if network or quota issues arise.

## 9. Architecture Implications
- Zero changes to existing database tables or schema.
- Non-destructive: enhances existing teacher workflows without breaking manual entry.
- Reusable hooks and standard Tailwind components.

## 10. Security Requirements
- `GEMINI_API_KEY` never sent to the browser bundle.
- Only authenticated teacher session requests are processed.
- No student PII beyond first name and submission content transmitted to the model.

## 11. Acceptance Criteria
- [ ] Teacher can click "✨ AI Review" on any student submission in `ReviewSubmissionsModal.tsx` and receive an instant formative assessment with suggested grade and feedback.
- [ ] Clicking "Apply Suggestion" fills the grade and feedback fields cleanly.
- [ ] Teacher can click "✨ AI Lesson Planner" in `CreateSessionModal.tsx` to generate an outline and discussion starters for their session.
- [ ] `StudentOverviewModal.tsx` provides quick AI engagement insights for the selected student.
- [ ] `TeacherDashboard.tsx` includes an intuitive AI Co-Pilot quick-action card.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm run build` succeeds cleanly.

## 12. Checks to run
- `npx tsc --noEmit`
- `npm run build`

## 13. How to verify
1. Log in as a teacher or open `/teacher-dashboard`.
2. Click "Review Assignments" in quick actions -> click a submission in the queue -> click "✨ AI Review" -> confirm grade and feedback suggestions appear and populate properly upon clicking "Apply Suggestion".
3. Click "Create Session" -> enter a topic and subject -> click "✨ AI Lesson Planner" -> verify structured lesson plan and discussion questions appear.
4. Click "Students" -> view a student -> check the AI engagement advice.
5. Verify on mobile screen sizes to ensure responsive layout without overflow.
