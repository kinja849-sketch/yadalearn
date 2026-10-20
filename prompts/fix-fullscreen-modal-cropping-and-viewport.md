# Implementation Plan — Fix Fullscreen Modal Cropping, Viewport Geometry & Complete Visibility

## 1. Goal
Eliminate the screen cropping and misalignment in the Student AI Study Buddy by portalling the fullscreen interface directly to `document.body` with `fixed inset-0 w-screen h-screen z-[9999]`, removing Radix transform conflicts (`left-50% translate-50%`), and ensuring 100% of all UI components (header, chat, voice avatar, input bar) are fully visible without any cropping across all screen sizes.

## 2. What it read
- `AGENTS.md` (Workflow rules, design system, zero disturbance to existing features)
- User uploaded screenshots `media_1792504452763.png` and `media_1792504500765.png` showing the interface shifted into the top-left quadrant and cropped.
- `src/components/ui/dialog.tsx` (Identified root cause: Radix `DialogContent` has hardcoded `fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]` and slide-in animations that conflict with fullscreen `inset-0`).
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx`

## 3. Assumptions & Root Cause Analysis
- **Root Cause:** In `dialog.tsx`, `DialogContent` applies `left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]`. When combined with `w-screen h-screen inset-0`, the CSS transform anchors the center of the dialog to the top-left of the viewport, pushing half the UI off-screen and cropping out the header and right side.
- **Solution:** Render the fullscreen Aoede interface using React `createPortal(..., document.body)` with an explicit reset of CSS transforms (`top: 0; left: 0; right: 0; bottom: 0; transform: none; width: 100vw; height: 100vh; position: fixed; z-index: 9999`).
- **Visibility Guarantee:** The header, detected assignments bar, chat/voice canvas, and bottom input bar are all constrained within safe viewport bounds (`h-full flex flex-col justify-between overflow-hidden`) with responsive padding.

## 4. Task Flow
```
Task 1: Portal Fullscreen Architecture in `AIStudyBuddyModal.tsx`
  ├── Replace Radix DialogContent transform wrapper with React createPortal directly into document.body
  ├── Apply clean CSS reset: `fixed inset-0 w-screen h-screen z-[9999] m-0 p-0 transform-none`
  └── Enforce flex-col layout: shrink-0 header, flex-1 scrollable body, shrink-0 footer

Task 2: Responsive Viewport Protection & Escape Handling
  ├── Add ESC key listener and backdrop cleanup when modal unmounts
  ├── Ensure message list has max-w-3xl or max-w-4xl centered container with no side clipping
  └── Test Voice Mode visualizer layout to guarantee 100% centered visibility

Task 3: Verification & Quality Checks
  ├── Run typecheck (`tsc --noEmit`) and build (`npm run build`)
  └── Confirm zero cropping on mobile, tablet, and desktop viewports
```

## 5. Files that will change
- `src/features/student/quick-actions/AIStudyBuddyModal.tsx` — Portalled fullscreen layout with zero CSS transform conflicts.

## 6. Implementation Requirements
- The UI must occupy exactly 100% of the viewport (`100vw`, `100vh`) with `left: 0; top: 0; margin: 0; padding: 0`.
- Nothing is shifted or cropped out.
- Header, assignments banner, messages list, and bottom input are 100% visible.
- Close button (`arrow_back` / `close`) and ESC key smoothly exit the study buddy.

## 7. Technology / Library Recommendations
- React native `createPortal` (built-in to `react-dom`). Zero new packages.

## 8. API / Integration Strategy
- Preserves all existing `/api/student-ai` and `/api/tts` connections and Supabase assignment detection.

## 9. Architecture Implications
- Completely decouples the fullscreen study companion from parent containers or dashboard wrappers.
- No impact on any other page or modal.

## 10. Security Requirements
- All user context and Supabase sessions remain isolated and protected.

## 11. Acceptance Criteria
- [ ] No part of the Aoede Study Buddy is cropped or pushed off-screen on desktop or mobile.
- [ ] The entire header, back button, title, mode tabs, chat messages, and input bar are 100% visible.
- [ ] Voice Call mode and Chat mode both fit the viewport naturally.
- [ ] `tsc --noEmit` and `npm run build` pass with 0 errors.

## 12. Checks to run
1. `cmd.exe /c npx.cmd tsc --noEmit`
2. `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Open student dashboard (`/student-dashboard`).
2. Click **AI Study Buddy**.
3. Verify the screen is **completely full and centered**—no cropping, no shifting to the top-left, full header and input bar visible.
4. Switch between **Chat** and **Voice Call** tabs; verify both stages render centered and intact.
