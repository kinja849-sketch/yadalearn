# Implementation Plan: Fix Video Feed Freeze During Screen Sharing

Resolve the video feed freeze when screen sharing in `src/pages/Meeting.tsx` by using the SDK function `hasScreenShare(p)` to correctly bind the active screen-sharing stream and removing the WebRTC `contentHint: 'detail'` encoder lockup, leaving the ParticipantView layout untouched.

## 1. Goal
Ensure the video feed updates fluidly and never freezes upon sharing a screen by using `hasScreenShare(p)` to identify the active screen share participant, ensuring clean WebRTC track binding with a unique session key, and removing the `contentHint: 'detail'` encoder freeze in `src/pages/Meeting.tsx`.

## 2. What it read
- `AGENTS.md` and `.agents/AGENTS.md` — Mandatory workflow, checklist, and scope control.
- `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` — Current project state and architecture guidelines.
- `src/pages/Meeting.tsx` — Implementation of `DedicatedScreenShareLayout`, screen share settings, and participant lookups.
- `node_modules/@stream-io/video-client/dist/index.es.js` — SDK `hasScreenShare` implementation: `const hasScreenShare = (p) => p.publishedTracks.includes(TrackType.SCREEN_SHARE);`.
- W3C WebRTC specification & Chromium issue tracker on `contentHint: 'detail'` causing 0 fps / frame dropping freeze during screen capture.
- User instruction: Do not alter or touch the ParticipantView lists or layout; isolate the fix strictly to ensuring the screen share video feed does not freeze.

## 3. Assumptions
- The ParticipantView list structure in `DedicatedScreenShareLayout` (desktop and mobile strips) is preserved completely without modification.
- The root causes of the video freeze upon screen sharing are:
  1. `screenShareParticipant` used `(p) => p.hasScreenShare`. Because `hasScreenShare` is an SDK utility function (`hasScreenShare(p)`) and not an object property, `find` failed and defaulted to `participants[0]`. When `participants[0]` was not the screen-sharing participant, `ParticipantView` attempted to play `screenShareTrack` on a user with no screen track, completely freezing the viewpoint.
  2. The WebRTC settings forced `contentHint: 'detail'`. In Chromium, `contentHint: 'detail'` prioritizes static text over motion and instructs the encoder to aggressively drop framerates (often down to 0 fps) unless massive screen differences occur, resulting in a frozen video stream.
  3. The screen share `ParticipantView` lacked an explicit track/session key, causing DOM node recycling across stream states.

## 4. Task Flow
1. **Task 1: Import `hasScreenShare` and Fix Participant Resolution in `Meeting.tsx`**
   - **Purpose**: Import `hasScreenShare` from `@stream-io/video-react-sdk`. In `DedicatedScreenShareLayout`, update `screenShareParticipant` to use `hasScreenShare(p)`. Add key `key={`${screenShareParticipant.sessionId || screenShareParticipant.userId}-screenshare`}` on the screen share `ParticipantView` for clean WebRTC track binding.
   - **Dependencies**: None.
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: None.
   - **Verification Gate**: `screenShareParticipant` correctly identifies the active presenter publishing the screen share track.

2. **Task 2: Remove `contentHint: 'detail'` Encoder Lockup**
   - **Purpose**: In `joinCall`, remove `contentHint: 'detail'` from `callObj.screenShare.setSettings` so Chromium does not throttle or freeze video frames during screen share capture.
   - **Dependencies**: Task 1.
   - **Files affected**: `src/pages/Meeting.tsx`
   - **Risks**: None.
   - **Verification Gate**: Chromium streams screen share frames at full fluidity without capture pause.

3. **Task 3: Build & TypeScript Verification**
   - **Purpose**: Run `npx tsc --noEmit` and `npm run build` to verify 0 type or build errors.
   - **Dependencies**: Tasks 1 and 2.
   - **Files affected**: None.
   - **Risks**: None.
   - **Verification Gate**: Build exits with code 0.

## 5. Files that will change
- `src/pages/Meeting.tsx` [MODIFY] — Import `hasScreenShare`, fix `screenShareParticipant` resolution and key, and remove `contentHint: 'detail'`.

## 6. Implementation Requirements
- In `src/pages/Meeting.tsx`:
  - Add `hasScreenShare` to import from `@stream-io/video-react-sdk`:
    ```tsx
    import { 
      StreamCall, 
      StreamTheme, 
      SpeakerLayout, 
      useCallStateHooks,
      useCall,
      Call,
      StreamParticipant,
      ParticipantView,
      useParticipantViewContext,
      hasAudio,
      hasScreenShare
    } from '@stream-io/video-react-sdk';
    ```
  - In `DedicatedScreenShareLayout`:
    ```tsx
    const screenShareParticipant = participants.find((p) => hasScreenShare(p)) || participants[0];
    ```
    And on the main stage:
    ```tsx
    <ParticipantView
      key={`${screenShareParticipant.sessionId || screenShareParticipant.userId}-screenshare`}
      participant={screenShareParticipant}
      trackType="screenShareTrack"
      VideoPlaceholder={CustomVideoPlaceholder}
      ParticipantViewUI={() => null}
      className="w-full h-full object-contain screen-share-video rounded-lg"
    />
    ```
  - In `joinCall`:
    Remove `contentHint: 'detail'` so Chromium's encoder does not freeze frame updates:
    ```tsx
    try {
      callObj.screenShare.setSettings({
        maxFramerate: 30,
      });
    } catch (e) {
      console.warn('Failed to set screenShare settings:', e);
    }
    ```
  - Do NOT touch or modify any other part of the file or the ParticipantView strips.

## 7. Technology / library recommendations
- None.

## 8. API / integration strategy
- No API changes.

## 9. Architecture implications
- Strictly adheres to Stream Video SDK's WebRTC model.

## 10. Security requirements
- None altered.

## 11. Acceptance criteria
- [ ] Screen sharing immediately displays the active presenter's screen without freezing.
- [ ] Interacting or scrolling on the shared tab updates the screen share feed continuously in real time.
- [ ] ParticipantView layout is untouched.
- [ ] Zero TypeScript or bundling errors.

## 12. Checks to run
- `cmd.exe /c npx.cmd tsc --noEmit`
- `cmd.exe /c npm.cmd run build`

## 13. How to verify
1. Join a meeting session at `/meeting/:id`.
2. Start screen sharing a browser tab or window.
3. Verify the screen share feed displays the active presenter's view immediately and continues rendering updates smoothly when scrolling or navigating on the shared tab.
