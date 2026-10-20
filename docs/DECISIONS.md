# YadaLearn — Decision Log

Record approved architectural/technology decisions and explicitly rejected approaches so future agents do not re-propose the same mistakes.

Format:
YYYY-MM-DD — Short title
Status: Approved | Rejected
Context: …
Decision: …
Rationale: …

---

## 2026-08-07 — Auth provider truth

**Status:** Approved (align docs with code)

**Context:** README lists Clerk; implementation uses Supabase Auth throughout AuthContext and client setup.

**Decision:** Supabase Auth is the sole authentication system for YadaLearn. Do not introduce Clerk or alternate auth providers without a new explicit approval.

**Rationale:** Code and schema are already built around Supabase `auth.users` and profiles RLS.

---

## 2026-08-07 — Primary video provider

**Status:** Approved (current state)

**Context:** Both Stream Video and LiveKit appear in dependencies and source.

**Decision:** Stream Video is the primary Meeting experience (`/meeting/:id`, StreamProvider, token middleware). LiveKit remains limited to existing Join Class modal paths unless a future decision changes this.

**Rationale:** Meeting page and StreamProvider form the main live-session path; token signing is already wired for Stream.

---

## 2026-08-07 — No second global state library

**Status:** Approved

**Context:** State is handled via React Context (Auth, Stream) and local/hook state.

**Decision:** Do not introduce Redux, Zustand, or similar without explicit approval.

**Rationale:** Existing patterns are sufficient; extra global stores increase complexity without current need.

---

## 2026-08-07 — Design system ownership

**Status:** Approved

**Context:** Custom pastel/lavender tokens + Tailwind + shadcn-style primitives.

**Decision:** New UI must extend the existing design language. Do not adopt a competing UI kit (MUI, Chakra, etc.) as a replacement.

**Rationale:** Visual consistency across student/teacher/parent surfaces.

---

## 2026-10-21 — Google Gemini Multimodal Live API Voice Architecture

**Status:** Approved

**Context:** The legacy voice flow relied on sequential browser `webkitSpeechRecognition` → REST `/api/student-ai` → REST `/api/tts` (Aoede), resulting in 3,000–6,000ms latency, high failure rates on mobile Safari/Chrome, and lack of real-time interruption handling.

**Decision:** The voice assistant uses the Google Gemini Multimodal Live API (`models/gemini-2.5-flash-native-audio-latest`) over a persistent WebSocket gateway (`/api/gemini-live-ws`) with bidirectional streaming:
1. Microphone audio is continuously resampled to 16kHz 16-bit linear PCM and streamed via `realtimeInput.mediaChunks`.
2. Speech output streams back as 24kHz 16-bit linear PCM chunks scheduled on `AudioContext` with zero latency.
3. Server-side VAD interruption events (`serverContent.interrupted`) immediately halt client playback for natural barge-in.
4. Function calling (`tools`) is handled dynamically by the backend gateway for weather and student data.
5. All secrets (`GEMINI_API_KEY`) stay server-side.

**Rationale:** Achieves true full-duplex conversational intelligence, <800ms first-audio latency, and consistent cross-platform reliability across desktop and mobile devices.
