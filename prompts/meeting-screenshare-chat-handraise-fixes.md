# Implementation Plan: Meeting Mobile Screen Share, Scroll Lag, Chat Duplication & Raise Hand Fixes

## 1. Goal
Strategically rectify 4 core live meeting issues in `src/pages/Meeting.tsx`: (1) enable mobile screen sharing by bypassing unsupported mobile audio constraints and handling mobile browser restrictions, (2) eliminate scrolling lag during screen share using WebRTC `contentHint: 'motion'`, 30 FPS ideal framerate, and GPU compositing, (3) eliminate in-call chat message duplication across sender and receiver clients, and (4) implement full visibility and real-time state synchronization for participant raised hands across video tiles, participants list, control bar, and notifications.

---

## 2. What it read
- `AGENTS.md` & `.agents/AGENTS.md` (mandatory workflow, zero-unapproved code changes rule)
- `docs/PROJECT_STATE.md` & `docs/DECISIONS.md`
- `src/pages/Meeting.tsx` (timer, placeholders, overlays, gallery grid, screen share stage, chat panel, participants panel, control bar, layout, stream setup)
- `@stream-io/video-client` source files: `ScreenShareManager`, `ScreenShareState`, `getScreenShareStream`, `TrackSubscriptionManager`, `DynascaleManager`
- WebRTC specifications for `getDisplayMedia` mobile audio constraints and `MediaStreamTrack.contentHint` ('motion' vs 'detail')

---

## 3. Assumptions
1. Mobile devices (iOS Safari, Android Chrome) do not support audio capture in `navigator.mediaDevices.getDisplayMedia`. Stream Video SDK's default `audioEnabled: true` causes `getDisplayMedia` to reject with `NotSupportedError`/`TypeError`. Disabling screen share audio on mobile enables the native OS screen capture prompt ("Start broadcast" / "Start now").
2. Browsers on iOS other than Apple Safari (e.g. Chrome on iOS, Edge on iOS) are restricted by Apple's WebKit WKWebView policies from calling `getDisplayMedia`. A clear, actionable user notification must guide them to open the session in Safari rather than silently failing.
3. Chat duplication occurs because messages are sent over two transports (Stream `call.sendCustomEvent` and Supabase Realtime broadcast) without sender exclusion or ID deduplication on the receiver.
4. Raise hand was only toggling a local state variable inside `GoogleMeetControlBar` with an incomplete custom event payload and zero listeners or UI badges anywhere in the application.

---

## 4. Task Flow
```
Task 1: Chat Deduplication Fix
   - Exclude local sender from custom event & broadcast listeners
   - Enforce ID-based deduplication on both Stream custom and Supabase Realtime message streams
   - Risk: None. Files: src/pages/Meeting.tsx. Gate: Verified sender & receiver see single message.

Task 2: Full Realtime Raise Hand Implementation
   - Add `raisedHands` state map in CallLayout
   - Wire custom events & Supabase broadcast with full payload (userId, userName, raised, timestamp)
   - Add raised hand badges to CustomVideoPlaceholder (camera off) & CustomParticipantViewUI (camera on)
   - Add raised hand indicators & host lower-hand action to ParticipantsPanel
   - Sync GoogleMeetControlBar button with real-time state
   - Add floating toast notification when another participant raises hand
   - Risk: None. Files: src/pages/Meeting.tsx. Gate: Both attendees see raised hand badges & list status.

Task 3: Mobile Screen Share Enablement & Browser Guidance
   - Add mobile detection and `isScreenShareSupported` checks
   - Call `callObj.screenShare.disableScreenShareAudio()` on mobile to prevent `NotSupportedError`
   - Provide informative alert for iOS Chrome/third-party WebViews directing them to Safari
   - Set mobile-friendly video resolution constraints (1280x720 ideal, 30fps)
   - Risk: None. Files: src/pages/Meeting.tsx. Gate: Native OS screen sharing prompt triggers cleanly.

Task 4: Zero-Delay Scroll & Motion Optimization for Screen Share
   - Set `contentHint: 'motion'` via `callObj.screenShare.setSettings({ contentHint: 'motion' })`
   - Directly configure published video track `track.contentHint = 'motion'`
   - Enforce `frameRate: { ideal: 30, min: 25 }` in `setDefaultConstraints`
   - Apply GPU hardware acceleration CSS (`transform: translateZ(0); will-change: transform`) to video stage
   - Risk: None. Files: src/pages/Meeting.tsx. Gate: Scrolling text & documents reflect smoothly at 30fps without lag.

Task 5: Verification & Quality Checks
   - Run typecheck (`tsc --noEmit`) and build (`npm run build`)
   - Test in Chrome DevTools MCP with multi-viewport verification
   - Update docs/PROJECT_STATE.md
```

---

## 5. Files that will change
- `src/pages/Meeting.tsx` (modify only the relevant Meeting components: `CustomVideoPlaceholder`, `CustomParticipantViewUI`, `ParticipantsPanel`, `GoogleMeetControlBar`, `CallLayout`, `Meeting`)

---

## 6. Implementation Requirements

### Requirement A: In-Call Chat Deduplication
1. In `handleSendMessage`:
   - Keep optimistic local state update with unique `id`.
   - Send via `call.sendCustomEvent` and Supabase Realtime broadcast.
2. In `call.on('custom')` listener:
   - Check `if (custom.senderId === user.id) return;` (ignore own message echo).
   - Check `if (prev.some(m => m.id === newMsg.id)) return prev;` before appending.
3. In Supabase Realtime listener:
   - Check `if (payload.senderId === user.id) return;`.
   - Check `if (prev.some(m => m.id === payload.id)) return prev;`.

### Requirement B: Complete Realtime Raise Hand
1. In `CallLayout`:
   - Maintain `raisedHands: Record<string, { raised: boolean; raisedAt: number; userName: string }>` state.
   - Listen for `{ type: 'hand-raise', userId, userName, raised, timestamp }` in both `call.on('custom')` and Supabase broadcast.
   - Maintain floating toast state for new hand raises: `latestHandRaiseToast: { userName: string } | null`.
2. In `GoogleMeetControlBar`:
   - Accept `raisedHands`, `isSelfHandRaised`, and `onToggleHandRaise` from `CallLayout`.
   - Toggle broadcasts `{ type: 'hand-raise', userId, userName, raised, timestamp }` over both Stream and Supabase.
   - Button reflects active status: blue background `#8ab4f8`, icon `back_hand`, title "Lower hand".
3. In `CustomVideoPlaceholder` & `CustomParticipantViewUI`:
   - Check if `raisedHands[participant.userId]?.raised === true`.
   - Render an animated upper-left badge: `front_hand` icon + "Hand raised" pill with shadow and `#8ab4f8` styling.
4. In `ParticipantsPanel`:
   - Check if `raisedHands[p.userId]?.raised === true`.
   - Render a hand badge next to their name.
   - For teachers/hosts: provide a "Lower hand" button that broadcasts `{ type: 'hand-raise', userId: p.userId, raised: false }`.

### Requirement C: Mobile Screen Share Enablement
1. Device capability detection:
   - Check `navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function'`.
   - If missing on iOS (e.g. Chrome on iOS): show modal/alert advising the user to open the class in Apple Safari.
2. Prevent mobile browser rejection:
   - When mobile device is detected (`/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)`):
     Call `await call.screenShare.disableScreenShareAudio()`.
   - Set mobile default constraints:
     `{ video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30 } } }`.
3. In `toggleScreenShare`:
   - Wrap in informative try/catch: handle user cancellation (`NotAllowedError`) gracefully without error banners, and provide descriptive guidance if permission is blocked.

### Requirement D: Zero-Delay Scroll & Motion Reflection
1. WebRTC `contentHint`:
   - Call `callObj.screenShare.setSettings({ contentHint: 'motion' })`.
   - On publication of screen share track: set `track.contentHint = 'motion'`.
2. Constraints:
   - Call `callObj.screenShare.setDefaultConstraints({ video: { frameRate: { ideal: 30, min: 25 }, width: { max: 1920 }, height: { max: 1080 } } })`.
3. CSS Hardware Acceleration:
   - In `<style>` overrides, add `transform: translateZ(0); will-change: transform; backface-visibility: hidden;` to `.str-video__screen-share-video`.

---

## 7. Technology / Library Recommendations
- Reuse existing `@stream-io/video-react-sdk` and `@stream-io/video-client` capabilities already present in the codebase.
- No new packages or external dependencies required.

---

## 8. API / Integration Strategy
- Transport: Dual Stream custom events + Supabase Realtime channel for instant real-time synchronization with automatic fallback.
- Client-only execution; all secrets remain secure on the server.

---

## 9. Architecture Implications
- Preserves the existing React Context, StreamProvider, and Meeting component layout.
- Strictly adheres to the user's directive: **"do not touch anything or alter anything at all except these issues that I've mentioned here."**

---

## 10. Security Requirements
- Client secrets (`STREAM_SECRET`, Supabase service keys) remain untouched and server-side.
- All real-time broadcasts scoped to the specific `meetingId` room.

---

## 11. Acceptance Criteria
- [ ] Chat messages sent by either student or teacher appear exactly once on both the sender's and receiver's screen (no duplication).
- [ ] Clicking "Raise hand" shows an active state on the button ("Lower hand"), displays a prominent animated badge on the participant's video tile (both camera-on and camera-off), shows the hand icon in the People list, and notifies attendees.
- [ ] Clicking "Lower hand" or teacher lowering hand clears the badge immediately across all screens.
- [ ] Mobile screen sharing disables system audio requests so mobile browsers do not throw `NotSupportedError`, and non-Safari iOS users receive clear guidance.
- [ ] Screen sharing uses `contentHint: 'motion'` and 30fps ideal framerate with GPU compositing, reflecting scrolling immediately without lag or delay.
- [ ] No regression or alteration of unrelated components, styling, or routing.

---

## 12. Checks to Run
- `npx tsc --noEmit`
- `npm run build`

---

## 13. How to Verify
1. Open two browser sessions (one Student, one Teacher) joined to `/meeting/class-1bda8f47-7f16-48...`.
2. In Chat: send "Hello from teacher" and "Hello from student". Verify each message appears exactly once on both screens.
3. In Meeting: click "Raise hand" on Student. Verify:
   - Student's control bar button turns blue with "Lower hand".
   - Student's video tile displays the animated "Hand raised" badge on both Student and Teacher screens.
   - Teacher's People panel shows the raised hand badge next to the student's name.
   - Click "Lower hand" (or teacher lowers it) and verify the badge disappears from all screens.
4. Screen share: verify motion optimization and mobile screen share parameters trigger without error.
