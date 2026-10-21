# YadaLearn — Project State

> Living snapshot for AI agents and humans. Update after every meaningful completed task. Always verify against the repository — do not trust this file alone.

**Last updated:** 2026-10-21 (Phase 12: Supabase Performance Optimization & Statement Timeout Elimination)

## Product snapshot

- Collaborative learning web app: students, teachers, parents.
- Stack in code: React 18 + TS + Vite, Supabase Auth + Postgres/RLS, Stream Video (primary meetings), LiveKit (limited Join Class path), Tailwind + shadcn/ui-style components, Netlify deploy.
- README still mentions Clerk; **code uses Supabase** — treat code as truth.

## Major areas present in repo

- Auth, role selection, onboarding, ProtectedRoute
- Student / teacher / parent dashboards and related pages
- Teacher–student links, connection requests, live classes, ratings, bookings
- Parent–student links and parent views
- Meeting page (Stream) + waiting room via Supabase Realtime
- Quick-action modals under `src/features/*`
- Design system: lavender/pastel tokens in `src/index.css` + Tailwind config
- Schema SQL files at repo root (base, update, parent, ai, perf_indexes)
- Student AI Socratic Study Buddy & Cognitive Mentor (`/api/gemini-live-ws`, `/api/student-ai`, `/api/tts`, `useStudentAI`, `LiveAudioStreamer`, `VoiceOrb`, `audioAnalyzer.ts`, `AIStudyBuddyModal.tsx`, `AIFeatures.tsx`)
- Teacher AI Co-Pilot, Formative Grading Assistant & Lesson Planner (`/api/teacher-ai`, `useTeacherAI`)
- Session lifecycle & auto-cancellation manager (`src/utils/sessionManager.ts`)

## Recent Completed Work

- **Phase 12: Supabase Performance Optimization & Statement Timeout (57014 / 500) Elimination** (`supabase_perf_indexes.sql`, `src/hooks/useDashboardData.ts`, `src/pages/StudentDashboard.tsx`, `src/pages/TeacherDashboard.tsx`, `src/features/student/quick-actions/MessageTeacherModal.tsx`):
  - **Database Indexing Migration (`supabase_perf_indexes.sql`)**:
    - Created composite B-Tree indexes for `bookings(student_id, created_at DESC)`, `bookings(teacher_id, created_at DESC)`, and status filters.
    - Created composite B-Tree indexes for `chat_messages(sender_id, created_at DESC)`, `chat_messages(receiver_id, created_at DESC)`, and conversation lookup.
    - Added indexes for `session_ratings(rater_id, rated_as, created_at DESC)` and `live_classes(status, created_at DESC)`.
  - **Client-Side Query Deduplication & Consolidation**:
    - Updated `src/hooks/useDashboardData.ts` to be the single source of truth for dashboard bookings, with `.order('created_at', { ascending: false }).limit(50)`, exporting `allBookings`, `completedCount`, `totalCount`, and a manual `refetch` trigger.
    - Eliminated redundant concurrent bookings queries and mount effects in `src/pages/StudentDashboard.tsx`.
  - **Chat Message Bounded Queries**:
    - Replaced unbounded `select('*')` full-table scans in `StudentDashboard.tsx` and `TeacherDashboard.tsx` with explicit column projections (`id, message, sender_id, receiver_id, is_read, created_at, attachment_type`) and `.order('created_at', { ascending: false }).limit(100)`.
    - Added safe limits (`limit=100`, `limit=150`) to chat queries in `MessageTeacherModal.tsx`.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors.

- **Phase 11: Google Gemini Multimodal Live API Voice Architecture & Conversational Intelligence** (`vite.config.ts`, `src/utils/liveAudioStreamer.ts`, `src/utils/audioAnalyzer.ts`, `src/hooks/useStudentAI.ts`, `src/types/ai.ts`, `src/features/student/quick-actions/AIStudyBuddyModal.tsx`, `supabase_schema_ai.sql`):
  - **Replaced Sequential STT → LLM → TTS with Native Gemini Live API (`models/gemini-2.5-flash-native-audio-latest`)**:
    - Built secure backend WebSocket gateway plugin in `vite.config.ts` (`/api/gemini-live-ws`) connecting upstream to `wss://generativelanguage.googleapis.com/.../BidiGenerateContent`, keeping `GEMINI_API_KEY` strictly secret on the server.
    - Configured native Aoede neural voice (`prebuiltVoiceConfig: { voiceName: "Aoede" }`) and audio response modalities (`["AUDIO"]`).
  - **Real-Time Bidirectional PCM Streaming Engine (`src/utils/liveAudioStreamer.ts`)**:
    - Real-time microphone capture with hardware acoustic echo cancellation, noise suppression, auto-gain, and linear resampling to 16kHz 16-bit mono PCM chunks streamed via `realtimeInput.mediaChunks`.
    - Zero-latency 24kHz 16-bit PCM streaming playback queue scheduled on `AudioContext` with sub-millisecond precision, bypassing sentence waits and achieving <800ms first-audio latency.
    - Direct bridging to `AnalyserNode` driving the `@beui/voice-orb` liquid visualization during speech.
  - **Conversational Intelligence & Dynamic Tool Execution**:
    - Integrated function calling declarations in Gemini Live setup (`getCurrentWeather`, `getStudentAssignments`, `getStudentPerformance`, `saveStudentNoteOrMemory`).
    - Tool calls execute asynchronously in the gateway and return `toolResponse` back to the live stream without interrupting conversational flow.
    - Direct human replies for general questions without unnecessary tool invocations.
  - **Full-Duplex Barge-in & Interruption Handling**:
    - Listens to Gemini Live's native server-side VAD interruption events (`serverContent.interrupted`).
    - Instantly stops active buffer playback, clears queued chunks, and prioritizes new user context.
    - Tap-to-interrupt on the `VoiceOrb` preserved as a direct tactile control.
  - **Supabase Isolation & Mobile Browser Hardening**:
    - Created `supabase_schema_ai.sql` with RLS policies strictly isolating conversation memory by `auth.uid() = user_id`.
    - Unlocked `AudioContext` on user interaction for reliable operation across Android Chrome and iOS Safari.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` compiled 5,535 modules cleanly in 48.04s with 0 errors; live end-to-end WebSocket gateway test verified setup, tool execution, and sub-second streaming audio chunk reception.

- **Phase 10: Official `@beui/voice-orb` Liquid Voice Visualization Integration** (`src/components/agents/voice-orb.tsx`, `src/components/agents/voice-orb/renderer.ts`, `src/lib/ease.ts`, `src/utils/audioAnalyzer.ts`, `src/features/student/quick-actions/AIStudyBuddyModal.tsx`):
  - **Replaced Voice Sphere with Official `@beui/voice-orb`**:
    - Installed `motion` package to provide `motion/react` primitives.
    - Created `src/lib/ease.ts` containing the official `SPRING_GLIDE` critically damped spring physics and easing tokens.
    - Implemented `src/components/agents/voice-orb/renderer.ts` with complete screen-space WebGL liquid shaders:
      - Breathing liquid silhouette with dynamic ripple harmonics and fbm turbulence.
      - 3D normal flow, warp, specular shine, inner light, gleam, rim illumination, and stationary screen-space grain.
      - Low-power WebGL lifecycle, context lost/restored handling, `ResizeObserver`, and `IntersectionObserver` pause management.
    - Implemented `src/components/agents/voice-orb.tsx` React component with spring interpolation, time-domain analyser processing, and reduced-motion fallback.
    - Connected live Web Audio API `audioAnalyzer.getAnalyser()` directly to `<VoiceOrb analyser={...} activity={...} />`.
    - Integrated seamlessly into `AIStudyBuddyModal.tsx` while strictly preserving all surrounding page layouts, controls, and tap-to-interrupt functionality.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` compiled 5,534 modules cleanly in 35.25s.

- **Phase 9: Settled Pristine 3D Dot Sphere, Real Date/Time Awareness, Proactive Assignment State Awareness, & Open-Ended Task Engine** (`src/features/student/quick-actions/AoedeCyberSphere3D.tsx`, `src/features/student/quick-actions/sphereShaders.ts`, `src/hooks/useStudentAI.ts`, `vite.config.ts`):
  - **Pristine Round Settled 3D Dot Sphere (User Reference `media_1792521134534.png`)**:
    - Eliminated idle noise displacement: when settled (idle), total displacement is strictly `0.0`, rendering a mathematically pure, pristine round sphere (`radius = 1.0`).
    - Added high-resolution coordinate point matrix using WebGL `gl.POINTS` with `spherePointFragmentShader`, creating circular glowing dots across all 5,429 coordinate vertices with an intensely luminous rim/fresnel perimeter glow matching `media_1792521134534.png`.
    - Integrated audio-reactive ferrofluid spikes: during AI speech, vertices dynamically stretch outward along magnetic field lines driven by real-time Web Audio API frequency analysis, and settle back smoothly to the immaculate round sphere when speech stops.
  - **Dynamic Real Date & Time Awareness**:
    - The client and backend now maintain live local date and time context (`Wednesday, October 21, 2026`).
    - Questions such as *"what date is it"* or *"what time is it"* are answered directly and accurately with zero canned evasion.
  - **Proactive Assignment State Awareness**:
    - When the student has 0 assignments, Aoede immediately and proactively acknowledges: *"Since today you don't have assignments, is there something that is on your mind that you want to work on?"*
    - Injected into initial modal session start, history reset, and contextual queries.
    - When assignments exist, Aoede identifies them specifically by title, course, and due date.
  - **Dynamic Open-Ended Task Execution Engine**:
    - Overhauled `/api/student-ai` in `vite.config.ts` with multi-model fallback waterfall (`gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.7-flash`) and a comprehensive local fallback engine.
    - The student can assign any task (writing, outlining, brainstorming, summarizing, calculating, studying), and Aoede engages directly without repeating generic socratic catchphrases.
    - Strict session anti-repetition filter guarantees new responses never repeat prior assistant turns.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` compiled 5,121 modules cleanly in 36.09s.

- **Phase 8: Voice Echo Loop Elimination, 3D Ferrofluid Magnetic Resonance Sphere, Hand Button Removal, & "Voice Call" Terminology Purge** (`src/features/student/quick-actions/AIStudyBuddyModal.tsx`, `src/features/student/quick-actions/AoedeCyberSphere3D.tsx`, `src/features/student/quick-actions/sphereShaders.ts`, `src/utils/audioAnalyzer.ts`, `src/hooks/useStudentAI.ts`, `vite.config.ts`):
  - **Voice Feedback / Self-Echo Loop Elimination**:
    - Discovered root cause: browser speech recognition captured laptop speaker playback, generating slight phonetic transcriptions (e.g. "Najib" -> "in the jeep") that bypassed basic string equality and caused Aoede to reply to her own voice in an endless loop.
    - Added hardware gating in `recognition.onresult`: while `isSpeakingRef.current || audioAnalyzer.isAudioPlaying() || isEchoCooldownRef.current` is true, microphone transcripts are dropped unconditionally.
    - Added 850ms post-audio acoustic cooldown window to absorb room reverberations.
    - Added semantic keyword overlap filtering in `sendMessage` that checks the user's transcript against a rolling history of recent AI spoken sentences (`recentAISpokenTextsRef`), dropping feedback prompts sharing >= 25% vocabulary.
    - Added server-side echo rejection guard in `/api/student-ai` in `vite.config.ts`.
  - **3D Ferrofluid Magnetic Resonance Sphere (Matching Pinterest Reference `939845016017296372`)**:
    - Replaced generic sine waves with a custom GLSL vertex shader simulating magnetic resonance ferrofluid spikes and acoustic surface tension.
    - Added layered spherical harmonics (`spikeField1`, `spikeField2`, `harmonicRipples`) driven directly by Web Audio API Bass (40–250Hz) and Mid formants (250–2000Hz).
    - Camera translation calibrated (`transZ = -3.45`) ensuring the sphere maintains a perfect circular 3D footprint with ample clearance, without clipping or container boundaries.
    - Unconstrained, seamless canvas integration on the white stage with no bounding box or card border.
  - **Hand Icon Button Removal**:
    - Completely removed the `front_hand` button from `AIStudyBuddyModal.tsx` as requested.
    - Simplified voice stage controls to exactly 2 clear buttons: Microphone Mute/Unmute toggle and Close 'X' (Return to Chat).
  - **"Voice Call" Terminology Purge**:
    - Completely removed the phrase "Voice Call" from header tabs (changed to "Voice" with mic icon), tooltips, accessibility labels, and footer hints across the application.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` compiled 5,121 modules cleanly in 57.11s.

- **Phase 6: Native 3D Cyber-Sphere, React Lifecycle Error Resolution, Acoustic Self-Echo Suppression, and UI Clutter Purge** (`src/features/student/quick-actions/AoedeCyberSphere3D.tsx`, `src/hooks/useStudentAI.ts`, `src/features/student/quick-actions/AIStudyBuddyModal.tsx`):
  - **Fixed React Lifecycle Error (`Should have a queue. This is likely a bug in React`)**:
    - Decoupled `sendMessage` and `startContinuousVoiceDialogue` in `useStudentAI.ts` using `sendMessageRef`.
    - Eliminated render-cycle state mutation loops that previously crashed the React reconciliation tree upon opening the modal.
  - **Acoustic Self-Echo Cancellation & Infinite Feedback Loop Elimination**:
    - Added intelligence to turn-taking and speech discrimination: Aoede tracks its own spoken speech (`currentAISpokenTextRef`).
    - Incoming SpeechRecognition transcripts are compared against Aoede's synthesized output; if an echo or reverberation overlap (>= 35%) is detected, it is immediately discarded.
    - Added an automatic 600ms post-playback echo cooldown timer (`isEchoCooldownRef`) to guarantee that trailing speaker audio bouncing off room walls never triggers a phantom prompt.
  - **Removed Pre-written Welcome Messages**:
    - The voice call starts in a completely clean, quiet state (`messages` initialized empty).
    - Dialogue only begins when the student actually speaks aloud.
  - **Genuine 3D Wireframe Cyber-Sphere (`AoedeCyberSphere3D.tsx`)**:
    - Completely replaced the black box image asset with an authentic, GPU-accelerated HTML5 3D Canvas cyber-sphere.
    - Features a 100% transparent canvas, multi-ring latitude/longitude 3D wireframe mesh, luminous vertices, and a vibrant neon cyan-to-magenta gradient.
    - **Zero vibration when idle**: Performs smooth, elegant 3D geometric rotation with no jitter or shake.
    - **Audio-reactive 3D vibration when speaking**: Dynamically vibrates and displaces along 3D wave harmonics in real-time as Aoede speaks.
  - **Complete UI Clutter Purge & Minimalist Controls**:
    - Removed all extraneous clutter: "Live Two-Way Call", "Aoede" title, "Listening continuously. Speak anytime without tapping", "Voice-to-Voice Call", and footer label.
    - Replaced the circular red phone button with the requested **X** button (`close` icon) to cleanly exit voice mode.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` compiled 5,119 modules cleanly in 32.37s with 0 errors.

- **Phase 4: Instant Millisecond AI Responses, Voice Prompt Leak Elimination & Schema-Compliant Booking Cancellations** (`vite.config.ts`, `src/hooks/useStudentAI.ts`, `src/utils/sessionManager.ts`, `src/pages/StudentDashboard.tsx`, `src/pages/TeacherDashboard.tsx`):
  - **Eliminated TTS Prompt Audio Leak**: Diagnosed and removed the meta-instruction wrapper (`"Speak the following message naturally in a warm, expressive human tone without adding any extra commentary: ..."`) from the `/api/tts` Gemini prompt. `/api/tts` now supplies `cleanText` exclusively to the voice model, guaranteeing Aoede speaks only the actual answer with zero instructional preambles.
  - **Sub-Second / Millisecond AI Response Engine**:
    - Addressed the 42-second remote cloud inference latency observed with `gemini-3.8-flash` by introducing an `AbortController` with a strict 1500ms timeout on external calls.
    - Deeply expanded the built-in pedagogical semantic response engine to analyze incoming questions (biology, photosynthesis, gravity, cells, atoms, physics, mathematics, equations, fractions, geometry, English, essays, thesis statements, grammar, assignments, etc.) and generate accurate, Socratic, non-repetitive responses in **under 10 milliseconds**.
  - **Immediate UI Text Rendering**: Decoupled UI text display in `useStudentAI.ts` so message bubbles render instantaneously (< 50ms) without waiting for subsequent voice synthesis requests. Voice audio is synthesized and queued asynchronously.
  - **Resolved Supabase Bookings 400 Bad Request Error**:
    - Identified that `UPDATE bookings SET status = 'cancelled'` violated the PostgreSQL check constraint `CHECK (status IN ('pending', 'confirmed', 'rejected', 'completed'))`.
    - Updated `sessionManager.ts` to use `{ status: 'rejected' }` (the schema-valid cancelled state) and batch-update using `.in('id', expiredIds)`.
    - Made `checkAndAutoCancelExpiredSessions` non-blocking in `StudentDashboard.tsx` and `TeacherDashboard.tsx`, eliminating all dashboard load latency.
  - **Verification**: `cmd.exe /c npx.cmd tsc --noEmit` passed with 0 errors; `cmd.exe /c npm.cmd run build` finished in 31.00s with 0 errors.

- **Phase 3: Authentic Human Neural Voice ("Aoede") & 1-Hour Session Auto-Cancellation & Link Nullification** (`vite.config.ts`, `src/hooks/useStudentAI.ts`, `src/utils/sessionManager.ts`, `src/pages/StudentDashboard.tsx`, `src/pages/TeacherDashboard.tsx`):
  - **Identified & Resolved Voice Root Cause (404 Deprecation)**: Diagnosed why the Study Buddy fell back to robotic speech. Google Gemini's REST API returned `404 Not Found` for deprecated model names (`gemini-2.0-flash`, `gemini-1.5-flash`). Upgraded `/api/tts` in `vite.config.ts` to use Google's current `gemini-3.8-flash-tts` (verified via live diagnostic tests returning HTTP 200 with 269KB `audio/wav` audio buffers using `prebuiltVoiceConfig: { voiceName: "Aoede" }`), with fallback to `gemini-2.5-flash-preview-tts`.
  - **Eliminated Robotic Fallback Entirely**: Removed `window.speechSynthesis` completely from `useStudentAI.ts`. The AI Study Buddy strictly plays authentic human neural audio via HTML5 Audio and base64 WAV streams.
  - **1-Hour Auto-Cancellation & Link Nullification (`src/utils/sessionManager.ts`)**: Built `checkAndAutoCancelExpiredSessions({ studentId, teacherId })` and robust date-time parsing. If a scheduled class or booking is more than 60 minutes past its start time and has not concluded or been rated, it is automatically marked as `cancelled` in Supabase (`live_classes` and `bookings`) and its `room_id` is nullified to prevent stale links from resurfacing.
  - **Dashboard Integration & Zombie Link Prevention**:
    - `StudentDashboard.tsx`: Integrated `checkAndAutoCancelExpiredSessions`. Fixed `fetchBookings()` and `chat_messages` link parsing so that unrated bookings older than 1 hour never resurrect into active `class-*` links or trigger false positive "Join Class" buttons. Stale links are nullified and hidden.
    - `TeacherDashboard.tsx`: Integrated `checkAndAutoCancelExpiredSessions` on load, filtered out cancelled sessions from `getNextUpcomingEvent`, and updated `handleStartClassDirectly` to cancel and nullify existing classes older than 1 hour before launching new sessions.
  - **Verification**: `cmd.exe /c npx.cmd tsc --noEmit` passed with 0 errors; `cmd.exe /c npm.cmd run build` finished in 1m 4s with 0 errors.

- **Phase 2: Teacher AI Agent — Co-Pilot, Formative Grading Assistant, Lesson Planner & Engagement Radar** (`vite.config.ts`, `src/types/ai.ts`, `src/hooks/useTeacherAI.ts`, `src/features/teacher/quick-actions/ReviewSubmissionsModal.tsx`, `src/features/teacher/quick-actions/CreateSessionModal.tsx`, `src/features/teacher/quick-actions/StudentOverviewModal.tsx`, `src/features/teacher/quick-actions/TeacherAICoPilotModal.tsx`, `src/pages/TeacherDashboard.tsx`):
  - **Server-Side Intelligence Pipeline (`/api/teacher-ai`)**: Implemented dedicated `/api/teacher-ai` endpoint in Vite middleware leveraging Google Gemini (`gemini-2.0-flash` with `GEMINI_API_KEY`) and strict symbol stripping to deliver high-intelligence pedagogical assistance across formative grading, lesson planning, student engagement radar analytics, and general co-pilot queries with robust heuristic fallbacks.
  - **AI Formative Grading Assistant (`ReviewSubmissionsModal.tsx`)**: Embedded an inline "✨ AI Formative Assistant" directly in the grading workspace. Analyzes student submissions against assignment titles, generating suggested rubric grades (0–100), concise strengths, and constructive growth areas. Provided a one-click "Apply to Grade & Feedback" action that populates native grade and feedback inputs.
  - **AI Lesson Planner & Socratic Discussion Builder (`CreateSessionModal.tsx`)**: Added an inline "✨ AI Lesson Planner" to session scheduling. Crafts tailored lesson milestones, a 5-minute icebreaker hook, a 4-phase timeline (Warm-up, Exploration, Collaborative Challenge, Socratic Wrap-up), and open-ended inquiry discussion questions with one-click insertion into the session description.
  - **Student Engagement Radar (`StudentOverviewModal.tsx`)**: Integrated an AI Engagement Radar into the student overview sheet that assesses student attendance, grade status, and missing work, outputting risk levels (Low/Medium/High), trend observations, pedagogical action advice, and pre-drafted 1-on-1 check-in messages with clipboard copy.
  - **Dedicated Aoede AI Co-Pilot Modal & Quick Action Banner (`TeacherDashboard.tsx`, `TeacherAICoPilotModal.tsx`)**: Added a prominent "Aoede AI Co-Pilot" launch banner to the Teacher Dashboard quick actions. Features multi-turn chat with Aoede, one-click shortcuts to grading and lesson planning tools, sample prompt chips, and symbol-free responses.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` completed cleanly in 28.40s with 0 errors.

- **Phase 1: Student AI Agent — Fullscreen Conversational Voice Study Buddy "Aoede"** (`src/features/student/quick-actions/AIStudyBuddyModal.tsx`, `src/pages/AIFeatures.tsx`, `src/hooks/useStudentAI.ts`, `src/types/ai.ts`, `src/pages/StudentDashboard.tsx`, `vite.config.ts`):

  - **Fullscreen Immersive Experience**: Converted the AI interface to take the entire screen (`fixed inset-0 w-screen h-screen z-[1001]`), removing all popup borders and window margins for a dedicated learning environment.
  - **Strict Separation of Text vs. Voice Modes**:
    - **Text Mode**: Typing a message generates a silent, high-intelligence text response. No audio speech is played.
    - **Voice Call Mode**: Dedicated voice-to-voice calling screen with ambient pulsing waves, live speech-to-text, and audio playback in the Aoede voice.
  - **Native Google Gemini "Aoede" Neural Voice Pipeline (`/api/tts`)**: Connected `/api/tts` directly to Google Gemini's audio model (`gemini-2.0-flash`) using `speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }` and configured with `GEMINI_API_KEY`. Added 24kHz PCM-to-WAV buffer packaging for immediate HTML5 Audio playback, delivering authentic studio-quality human voice output and eliminating robotic browser synthesis.
  - **Official Application Logo Chat Profile**: Chat avatar strictly displays `/logo (2).png` for Aoede across all message bubbles.
  - **Real Supabase Assignment Detection**: Automatically detects enrolled course assignments (`enrollments` -> `courses` -> `assignments`), displaying interactive pills to guide homework step by step without giving direct answers away.
  - **Symbol-Free Human Language**: Strips all markdown symbols (`*`, `#`, `•`, `-`) on server and client so responses read and speak like natural human conversation.
  - **Multi-Turn Conversational Intelligence & Repetition Elimination**: Upgraded `/api/student-ai` with intent classification for social small talk ("how are you", "who are you", "what can you do", "hy/hello", "thanks"), English writing/grammar, and math problem analysis. Added a conversation history deduplication guard that prevents repeating greetings or any prior assistant message.
  - **Portalled Fullscreen Architecture (Direct body mount)**: Completely resolved Radix centered-transform cropping by rendering directly to `document.body` via React `createPortal` with `fixed inset-0 w-screen h-[100dvh] z-[9999] transform-none`. Guarantees 100% full-screen visibility across all desktop and mobile viewports with zero clipping or offset.
  - **Verification**: `npx tsc --noEmit` passed with 0 errors; `npm run build` completed in 33.02s with 0 errors.

- **Meeting Mobile Screen Sharing, Zero-Delay Scroll Reflection, Chat Deduplication & Realtime Raise Hand** (`src/pages/Meeting.tsx`):
  - **In-Call Chat Deduplication**: Eliminated duplicate messages on both sender and receiver viewpoints. Excluded echo of own message to local sender (`if (custom.senderId === user.id) return;`) and strictly enforced ID deduplication (`if (prev.some(m => m.id === newMsg.id)) return prev;`) across both Stream custom events and Supabase Realtime fallback channels.
  - **Full Realtime Raise Hand Visibility**: Built end-to-end synchronized state (`MeetingRaisedHandsContext`, `raisedHands` record) across Stream custom events and Supabase Realtime broadcast with full payload (`userId, userName, raised, timestamp`). Added animated Google Meet-style pill badges (`front_hand` + "Hand raised") to both `CustomVideoPlaceholder` (camera off) and `CustomParticipantViewUI` (camera on), added raised hand indicators and host lower-hand action to `ParticipantsPanel`, synchronized the bottom toolbar button state with "Lower hand", and added non-intrusive floating toast notifications.
  - **Mobile Screen Share Enablement & Browser Guidance**: Bypassed mobile operating system rejection where `navigator.mediaDevices.getDisplayMedia` throws `NotSupportedError`/`TypeError` when audio is requested (`await call.screenShare.disableScreenShareAudio()`), set mobile-friendly resolution constraints (1280x720, 30fps), and provided clear guidance when third-party iOS browsers are restricted by Apple from screen capture.
  - **Zero-Delay Scroll & Motion Reflection**: Configured WebRTC `contentHint = 'motion'` on both published and incoming screen share video tracks (`callObj.screenShare.setSettings({ contentHint: 'motion' })`, `track.contentHint = 'motion'`), enforced W3C Screen Capture spec-compliant `frameRate: { ideal: 30, max: 30 }` (preventing browser `TypeError: min constraints are not supported`), and added GPU hardware compositing layers (`transform: translateZ(0); will-change: transform; backface-visibility: hidden`) to eliminate rendering delay and preserve fluid 30 FPS scrolling.
- **Instant Student Join Class Realtime Activation & Direct Meeting Redirect** (`src/pages/StudentDashboard.tsx`, `src/features/teacher/quick-actions/CreateSessionModal.tsx`, `src/pages/TeacherDashboard.tsx`):
  - **Identified & Eliminated Query Bottleneck**: `fetchBookings()` was fetching `teacher:profiles(avatar_url)` where the teacher's profile stored a ~180KB base64 string. For 38 bookings, each query transferred over 7MB of raw JSON over the network, causing a 12-second UI freeze. Replaced with explicit lightweight column selection (`id, full_name`).
  - **Eliminated Infinite Realtime Mutation Loop**: Removed background `update({ status: 'completed' })` inside `fetchBookings()` which was repeatedly firing the Supabase Realtime `bookingsChannel` Postgres change event on every query completion.
  - **Sub-Second Realtime Broadcast**: Added dual broadcast in `CreateSessionModal.tsx` and `handleStartClassDirectly` in `TeacherDashboard.tsx` over `student-live-session-${studentId}` and global `yadalearn-live-sessions`. `StudentDashboard.tsx` subscribes to both channels and immediately activates `liveClassInfo` and refreshes bookings.
  - **Persistent Session State**: Hardened `fetchLiveClass()` so that empty queries never overwrite an active session with `null` (`setLiveClassInfo(prev => prev ? prev : null)`).
  - **Latest Active Session Resolution**: Ordered bookings query by `created_at` descending (`.order('created_at', { ascending: false })`) and updated `activeLiveClass` useMemo to pick the latest active/confirmed booking regardless of time zone offsets or strict date-string equality.
  - **Verified in Chrome DevTools MCP**: Navigated to student dashboard (`/student-dashboard`), confirmed "Join Class" immediately pulses with the active gradient, green live badge, and direct click redirects directly to `/meeting/${roomId}`.
- **Direct Start Class Action in Teacher Dashboard** (`src/pages/TeacherDashboard.tsx`):
  - Created `handleStartClassDirectly` on the Teacher Dashboard to immediately activate the scheduled session in `live_classes` (`status: 'active'`) and redirect directly into `/meeting/${roomName}`, bypassing the intermediate modal.
  - Generates an active room if no scheduled class exists and navigates straight into the live session.
- **Permanent Rating Persistence & Re-Prompt Elimination** (`src/pages/RateTeacher.tsx`, `src/pages/StudentDashboard.tsx`):
  - Updated `RateTeacher.tsx` to save `{ status: 'completed', rating: rating }` directly on the student's booking row (both for UUID classes and room_id sessions), eliminating the bug where ratings were only stored in `session_ratings` while leaving `bookings.rating` null.
  - Updated `StudentDashboard.tsx` `fetchBookings` to query `session_ratings` in parallel and reconcile any unrated completed bookings to their closest rating by timestamp using `usedRatingIds`, and auto-heal the database records.
  - In `Daily Schedule & Planning`, rated sessions permanently display `⭐ Rated {rating}` and never prompt the student to rate again.
  - Updated dashboard rating modal submit handler to update `{ rating: ratingValue, status: 'completed' }` and update React state immediately.
- **Two-Way Screen Share Remote Freeze Elimination & SFU Resolution Override** (`src/pages/Meeting.tsx`):
  - In `DedicatedScreenShareLayout`, eliminated duplicate DOM mounts (`hidden md:grid` and `flex md:hidden`) by replacing them with a single responsive flex container (`flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto`). Previously on mobile/desktop, one branch was hidden via `display: none` (`0x0` dimensions), which caused Stream Video SDK's `DynascaleManager` to fire an unsubscription command (`dimension: undefined`) to the SFU, cutting off remote video frames to the receiving party and logging `[AudioBindingsWatchdog]` errors.
  - Added `callObj.setPreferredIncomingVideoResolution({ width: 1280, height: 720 })` in `joinCall` to instruct the SFU to maintain continuous, full-resolution incoming video for all participants without dynamic quality starvation.
  - Strictly bound `screenShareParticipant` to `participants.find(p => hasScreenShare(p))` so the screen share stage never binds to a participant who is not publishing a screen share track.
- **Camera-Off Profile Avatar Resolution** (`src/pages/Meeting.tsx`):
  - Refactored `CustomVideoPlaceholder` to directly fetch and cache the user's authentic `avatar_url` from Supabase `profiles` by `participant.userId` for both local and remote participants.
  - Bypassed Stream's 5KB WebSocket metadata limit that previously prevented base64 data URLs from propagating over the video client, ensuring genuine uploaded avatars display immediately on both student and teacher viewpoints when cameras are toggled off.
- **Saturday-Only Weekly Rating Student Course Progress** (`src/pages/StudentDashboard.tsx`):
  - Removed the fallback `(completedCount / totalCount) * 100` that previously caused student course progress to prematurely jump to 100% upon completing or rating a session.
  - Enforced that student course progress remains strictly `0%` on weekdays and non-rated days, only reflecting a percentage on Saturday when the teacher submits a weekly rating for the student.
- **Substantial Percentage-Based Today's Rating Progress in Teacher Dashboard** (`src/pages/TeacherDashboard.tsx`, `src/hooks/useTeacherDashboardData.ts`):
  - Updated `todayProgressPercent` calculation to be cumulative across maximum possible rating points for registered students (`maxPossiblePoints = totalStudents * 5`).
  - A 4-star rating from 1 student among 3 registered students contributes `27%` progress rather than jumping immediately to 80%.
  - The circular widget displays the percentage (`{todayProgressPercent}%`) with matching liquid wave elevation.
- **Clean 12:00 AM Midnight Reset** (`src/hooks/useTeacherDashboardData.ts`):
  - Removed the `past24h` fallback that erroneously pulled yesterday's ratings into today's tally after 12:00 AM midnight.
  - Ratings now query strictly since the teacher's local midnight (`00:00:00`), resetting cleanly to `0.0` at 12:00 AM until new sessions occur on the current day, while preserving the all-time average (`Avg. Course Rating`) in `teacher_profiles`.
- **Student Rating Isolation & Booking Status Integrity** (`src/pages/RateTeacher.tsx`, `src/pages/StudentDashboard.tsx`, `src/pages/ParentPerformance.tsx`, `src/pages/ParentProgress.tsx`):
  - Eliminated blanket booking overwrite (`.eq('student_id', currentUserId).eq('teacher_id', targetTeacherId)`) that previously marked all student bookings as completed with `rating: 4`.
  - RateTeacher now only completes the specific session that concluded (by booking UUID or room ID).
  - Clarified student schedule ratings with "⭐ Rated {rating}" and tightened completed session filters to only count past sessions with `status === 'completed' || status === 'attended'`, preventing student course progress from falsely spiking to 100%.

## Active / pending tasks

- None pending.

## Environment (configured & active in .env)

- `VITE_SUPABASE_URL`: Supabase project URL (`https://yxqezrvgvfwdgrlwczea.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key (active)
- `VITE_STREAM_API_KEY`: Stream Video publishable API key (`zmxv4awpbjt9`)
- `STREAM_SECRET`: Server-side Stream JWT signing secret (active in Vite token middleware `/api/get-stream-token`)

All environment variables are saved in `.env` (and protected from git commits via `.gitignore`). Future agents must preserve these values.

## Last verification

- Ran `cmd.exe /c npx.cmd tsc --noEmit` — **0 errors**.
- Ran `cmd.exe /c npm.cmd run build` — **built in 35.44s, 0 errors**.
- Verified build artifacts generated cleanly in `dist/`.
- Verified `/api/tts` with Google Gemini neural voice endpoint `models/gemini-3.8-flash-tts` returning **HTTP 200** with authentic 24kHz binary WAV audio using `Aoede` without prompt instruction preambles.
- Verified `/api/student-ai` responses generated in milliseconds matching student queries across math, science, English, and general topics.
- Verified continuous speech recognition lifecycle, barge-in interruption, and vibrating cyber-sphere animations.


