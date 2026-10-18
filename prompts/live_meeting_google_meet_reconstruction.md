# Implementation Plan: Complete Reconstruction and Functional Correction of Live Video Streaming Interface

Reconstruct the live video streaming interface in `src/pages/Meeting.tsx` to faithfully reproduce the visual layout principles, participant-grid geometry, bottom control center, meeting timer, integrated real-time chat, and participant management demonstrated in the Google Meet reference screenshots (`media_1792072528595.png` and `media_1792072531962.png`).

## 1. Goal
Reconstruct the live video streaming interface in `src/pages/Meeting.tsx` with a responsive, dynamically calculated participant grid, authentic Google Meet-style compact bottom control toolbar, persistent meeting timer, integrated real-time chat panel, participant management panel, and accurate active speaker indicators.

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Mandatory workflow, checklist standards, and project constraints
- `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` — Architectural rules (Supabase Auth, Stream Video as primary provider, no new state libraries)
- `src/pages/Meeting.tsx` — Current implementation of Stream video meeting, controls, layouts, and waiting room
- `src/contexts/StreamProvider.tsx` — Stream Video client initialization and token fetch
- Reference screenshots:
  - `media_1792072528595.png` — Google Meet 49-participant dense gallery, bottom bar (time, room code, center controls, right utility icons, overflow tile `47 lainnya`, active speaker blue highlight)
  - `media_1792072531962.png` — Google Meet 49-participant grid, active speaker tile border (`Pankaj Bhetwal`), muted mic icons, bottom toolbar layout
- `package.json` — Available dependencies (`@stream-io/video-react-sdk`, `@supabase/supabase-js`, `lucide-react`, `date-fns`, etc.)

## 3. Assumptions
- Stream Video SDK (`@stream-io/video-react-sdk`) remains the primary video meeting provider, controlling real media tracks (`call.microphone`, `call.camera`, `call.screenShare`).
- Meeting room background uses Google Meet dark theme: stage background `#131314` / `#1e1f20`, participant tiles `#202124` / `#282a2d`, bottom bar `#202124`.
- The top header bar in `Meeting.tsx` (`Live Classroom`, back arrow) will be removed from the main call layout to maximize screen real estate, moving the room title, timer, and room code to the bottom-left area matching Google Meet.
- Opening side panels (Chat or Participants) flexes the main container (`flex-1 min-w-0`), smoothly shrinking the gallery area and triggering dynamic grid recalculation without overflow or clipping.
- In-meeting chat transmits messages in real time using Supabase Realtime channel broadcast on `room-${id}` and Stream custom events (`call.sendCustomEvent`), persisting chronological order during the call.
- Disciplinary actions (mute audio, mute video, remove participant, pin) are preserved for teachers/hosts within the Participants panel and more-options menu.

## 4. Task Flow
1. **Task 1: Build the Dynamic Mathematical Participant Grid & Tile Components**
   - **Purpose**: Calculate optimal rows and columns dynamically based on container dimensions $(W, H)$ and participant count $N$ to preserve ~16:9 rectangular proportions without stretching or vertical scrolling; render Google Meet tile styling (dark `#202124` background, subtle rounded corners, bottom-left name pill, top-right mic status icon, centered circular profile avatar or initials circle for camera-off, and blue active-speaker border `border-2 border-[#8ab4f8]` with sound indicator).
   - **Dependencies**: `src/pages/Meeting.tsx`
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: Ensuring correct CSS containment and aspect ratio handling so video elements don't overflow when participant counts change.
   - **Verification Gate**: Dynamic grid scales from 1, 2, 4, 9, 16, 25 up to 49 participants with correct compact rectangular geometry and zero visual distortion.

2. **Task 2: Build Authoritative Meeting Timer & Bottom-Left Session Info**
   - **Purpose**: Display accurate elapsed meeting time (`HH:MM:SS` or `MM:SS`) alongside room code (`| {id}`) in bottom-left corner; persist start timestamp in `sessionStorage` or database so time does not reset on component re-renders or page reloads; provide click-to-copy meeting link.
   - **Dependencies**: `src/pages/Meeting.tsx`
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: Timer re-renders must not re-render video tiles.
   - **Verification Gate**: Timer ticks every second smoothly without causing video tile remounts; room code is clearly visible and readable.

3. **Task 3: Reconstruct Google Meet Bottom Control Center**
   - **Purpose**: Construct full-width 72px bottom toolbar (`bg-[#202124]`) divided into three sections:
     - Left: Time / Timer + Room Code
     - Center: Microphone toggle (red when muted, dark grey when active), Camera toggle (red when off, dark grey when active), Raise Hand toggle (`back_hand`), Screen Share toggle (`present_to_all`), More Options dropdown (`more_vert`: view switcher, device settings, fullscreen), and End Call button (distinct red pill `call_end`).
     - Right: Meeting info icon (`info`), People icon (`group`) with live count badge, In-call chat icon (`chat`) with unread badge, and Host management icon (`security`/`gavel`).
   - **Dependencies**: `Task 1`
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: Media track actions must accurately manipulate real hardware tracks and propagate presence.
   - **Verification Gate**: Clicking mic, camera, screen share, and end call triggers actual media session changes; visual states match Google Meet screenshots.

4. **Task 4: Implement Integrated Real-Time Meeting Chat Side Panel**
   - **Purpose**: Provide a slide-in side panel from the right utility chat icon displaying chronological in-call messages with sender name, avatar/initials, and timestamp; allow text input with Enter to send; sync messages in real time across participants via Supabase Realtime channel and Stream custom events; display unread count indicator on chat icon when panel is closed.
   - **Dependencies**: `Task 3`
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: Opening chat must smoothly recalculate participant grid width without horizontal scrollbars or tile distortion.
   - **Verification Gate**: Sending a message appears immediately; receiving a message when closed shows unread badge; opening/closing panel resizes grid smoothly.

5. **Task 5: Implement Integrated Participants & Host Disciplinary Management Side Panel**
   - **Purpose**: Provide a dedicated "People" side panel displaying all connected users, host badge, (You) indicator, microphone and camera states; integrate search filter; preserve teacher/host moderator controls (Mute all, mute student audio, disable student video, spotlight/pin, kick/remove).
   - **Dependencies**: `Task 3`, `Task 4`
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: Moderator actions must only be accessible to host/teacher.
   - **Verification Gate**: Real-time participant list matches meeting population; host actions function properly without permission leaks.

6. **Task 6: Responsive Layout & Screen Share Stage Adaptation**
   - **Purpose**: Adapt layout for mobile viewports (portrait and landscape) with compact toolbar and responsive grid; preserve dedicated screen-share stage layout when screen sharing is active (dominant presentation on left + participant column on right).
   - **Dependencies**: `Task 1` - `Task 5`
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: Mobile controls must not overlap or clip screen content.
   - **Verification Gate**: Responsive checks on mobile, tablet, and desktop viewports pass cleanly.

7. **Task 7: Build & TypeScript Verification**
   - **Purpose**: Run `npx tsc --noEmit` and `npm run build` to verify zero type errors or bundle issues.
   - **Dependencies**: `Task 6`
   - **Files affected**: None
   - **Risks**: None
   - **Verification Gate**: Clean build with exit code 0.

## 5. Files that will change
- `src/pages/Meeting.tsx` [MODIFY] — Complete reconstruction of meeting gallery, tiles, bottom bar, timer, chat panel, participants panel, and layout container.

## 6. Implementation Requirements
- **Participant Tile Geometry & Styling**:
  - Proportions: Compact rectangular tiles (approx 16:9 ratio, `aspect-[16/9] max-w-full max-h-full`).
  - Spacing: 4px to 8px gap between tiles (`gap-1.5 sm:gap-2 md:gap-2.5`).
  - Background: Neutral dark `#202124` / `#282a2d`.
  - Border radius: Subtle rounded corners (`rounded-xl` / `12px`).
  - Active speaker highlight: Bold blue border `border-2 border-[#8ab4f8]` with subtle shadow, accompanied by blue audio waveform/speaking indicator.
  - Camera-off placeholder: Centered circular profile picture (`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg`) or color-coded initials circle. No redundant center name text.
  - Name label: Bottom-left corner pill (`bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-md font-medium truncate max-w-[80%] select-none`). Local participant labeled `(You)`.
  - Mute indicator: Top-right corner circular pill (`bg-black/60 backdrop-blur-sm w-6 h-6 rounded-full flex items-center justify-center text-white/90`) showing `mic_off` icon.
- **Dynamic Grid Sizing**:
  - Grid automatically computes optimal `columns` and `rows` based on participant count $N$ and container aspect ratio:
    - $N = 1$: 1 column $\times$ 1 row
    - $N = 2$: 2 columns $\times$ 1 row (or 1 col $\times$ 2 rows in portrait)
    - $N = 3 \dots 4$: 2 columns $\times$ 2 rows
    - $N = 5 \dots 6$: 3 columns $\times$ 2 rows
    - $N = 7 \dots 9$: 3 columns $\times$ 3 rows
    - $N = 10 \dots 12$: 4 columns $\times$ 3 rows
    - $N = 13 \dots 16$: 4 columns $\times$ 4 rows
    - $N = 17 \dots 20$: 5 columns $\times$ 4 rows
    - $N = 21 \dots 25$: 5 columns $\times$ 5 rows
    - $N = 26 \dots 35$: 6 columns $\times$ 5 or 6 rows
    - $N = 36 \dots 49$: 7 columns $\times$ 7 rows (as in reference screenshot 1 & 2)
    - $N > 49$: Overflow indicator tile (`+N lainnya` / `+N more`) or gallery pagination.
- **Bottom Control Center**:
  - Full width fixed bar, `h-[72px] bg-[#202124] border-t border-white/10 px-4 flex items-center justify-between`.
  - Left: Timer (`HH:MM:SS` / `MM:SS`) + `|` + Room Code. Copy link action.
  - Center:
    - Mic button: `size-11 sm:size-12 rounded-full flex items-center justify-center transition-all`. Dark grey when unmuted (`bg-[#3c4043] hover:bg-[#474a4d]`), Red when muted (`bg-[#ea4335] hover:bg-[#d93025]`).
    - Camera button: `size-11 sm:size-12 rounded-full`. Dark grey when unmuted (`bg-[#3c4043] hover:bg-[#474a4d]`), Red when off (`bg-[#ea4335] hover:bg-[#d93025]`).
    - Raise Hand button: `size-11 sm:size-12 rounded-full`. Dark grey or blue when raised.
    - Screen Share button: `size-11 sm:size-12 rounded-full`. Highlighted when active.
    - More Options: `size-11 sm:size-12 rounded-full bg-[#3c4043] hover:bg-[#474a4d]` opening options menu (switch layout, audio/video devices, full screen).
    - End Call: Red oval pill button `bg-[#ea4335] hover:bg-[#d93025] text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-full flex items-center gap-1.5 shadow-md`.
  - Right:
    - Info icon (`info`): Meeting details dialog.
    - People icon (`group`): with total count badge e.g. `49`. Toggles Participants drawer.
    - Chat icon (`chat`): with unread badge. Toggles Chat drawer.
    - Host/Security icon (`security`): Host tools drawer for teachers.
- **Integrated Real-Time Chat**:
  - Drawer width `w-80 sm:w-96`, height `100%`, `bg-[#202124] border-l border-white/10`.
  - Header: "In-call messages" + close button.
  - Messages list: sender name, timestamp, message body.
  - Message input with send icon button and Enter key submission.
  - Real-time broadcast over Supabase Realtime channel and Stream custom events.
- **Participants Panel**:
  - Lists all active participants with live presence, audio/video state, host badges.
  - Moderator disciplinary controls for teachers: Mute all, mute user mic, mute user video, pin spotlight, kick user.

## 7. Technology / Library Recommendations
- Reuse existing `@stream-io/video-react-sdk` and `@supabase/supabase-js`.
- No new third-party libraries needed.

## 8. API / Integration Strategy
- Media tracks managed through Stream `call.microphone`, `call.camera`, `call.screenShare`.
- Real-time chat sync uses existing Supabase Realtime channel `room-${id}` (`broadcast: { event: 'chat-message' }`) and Stream `call.sendCustomEvent({ type: 'chat-message' })`.
- Presence updates synchronize with `call.state.participants$`.

## 9. Architecture Implications
- Concentrated inside `src/pages/Meeting.tsx`.
- Removes non-standard floating buttons and top header bar, replacing them with standard Google Meet 3-part layout (Stage + Bottom Bar + Right Drawer).
- Keeps client/server boundaries intact (no secret leaks).

## 10. Security Requirements
- Client-side visual and control corrections only.
- Host disciplinary actions gated on user role (`role === 'teacher'`).
- No API keys or secrets exposed in client bundles.

## 11. Acceptance Criteria
- [ ] Participant gallery uses dynamically calculated grid with compact rectangular proportions (~16:9), dark neutral background (`#202124`), and rounded corners matching reference screenshots.
- [ ] Camera-off state displays centered circular avatar (or color initials circle) without duplicate centered name.
- [ ] Participant name appears cleanly at bottom-left corner of each tile with high contrast.
- [ ] Microphone status indicator appears at top-right corner of each tile.
- [ ] Active speaker displays subtle, high-visibility blue border (`border-[#8ab4f8]`) and speaking indicator.
- [ ] Bottom toolbar follows Google Meet structure: bottom-left timer & room code, bottom-center circular controls & red end-call button, bottom-right utility buttons.
- [ ] Microphone, camera, screen share, and end call controls operate on actual media tracks and sessions.
- [ ] Meeting timer accurately displays elapsed duration without resetting on re-renders.
- [ ] In-call chat panel opens smoothly on right without breaking or overflowing the participant grid.
- [ ] Messages send and receive in real time across participants.
- [ ] Participants panel displays connected users with live count and host disciplinary actions.
- [ ] Responsive behavior verified on desktop, tablet, and mobile.

## 12. Checks to run
- `cmd /c npx tsc --noEmit` — Type check.
- `cmd /c npm run build` — Production build check.

## 13. How to verify
1. Open live meeting route in browser: `/meeting/demo-room`.
2. Inspect the gallery: verify compact rectangular tile proportions, `#202124` backgrounds, centered circular avatars, bottom-left names, top-right mute badges, and blue active-speaker border.
3. Test bottom toolbar controls:
   - Toggle microphone: verify mute icon toggles and real track mutes/unmutes.
   - Toggle camera: verify video turns off and circular avatar displays.
   - Toggle screen share: verify screen share workflow initiates.
   - Click End Call: verify meeting leaves cleanly.
4. Verify meeting timer in bottom-left counts up smoothly (`00:00:01`, etc.).
5. Click Chat icon in bottom-right: verify in-call chat panel slides in from the right, the participant grid smoothly shrinks without overflow, messages send and display chronologically in real time.
6. Click People icon: verify participants list displays with live count badge and host controls.
7. Test viewport responsiveness by resizing to mobile and tablet screen widths.
