# Decision Log

## 2026-05-04: Phase 0 Tooling

- Package manager: `pnpm`, because the project requires a TypeScript-oriented monorepo with workspace support and deterministic installs.
- Runtime language: TypeScript for all application packages, matching the repository guidance.
- Web tooling: Vite with vanilla TypeScript for Phase 0. This avoids deciding React or Svelte before UI work is in scope.
- API tooling: plain TypeScript package for Phase 0. No HTTP framework is introduced before API endpoints are in scope.
- Test framework: Vitest, because it supports TypeScript projects with minimal setup.
- Formatting and linting: Prettier and ESLint with `typescript-eslint`.
- Cache/PubSub service for local Compose: Valkey, because it is Redis-compatible and explicitly allowed by the architecture.

## Dependency License Check

Direct Phase 0 dependencies are documented in `THIRD_PARTY_NOTICES.md`. They use MIT or Apache-2.0 licenses, both OSI-compatible.

## 2026-05-04: Phase 1 API Foundation

- API framework: no Express/Fastify dependency in Phase 1. The API uses the Node.js HTTP server and a small local fetch-style router to avoid adding a web framework before route volume requires it.
- Input validation: local validators for Phase 1 request bodies. This keeps validation explicit and avoids introducing a schema library before shared API schemas are broader.
- Password hashing: `argon2` with Argon2id, because the security requirements explicitly require Argon2id password hashing.
- Database client: `pg`, because PostgreSQL is required and Phase 1 needs migrations plus persistence without introducing an ORM before query patterns are clearer.
- Session cookies: cookies are `HttpOnly` and `SameSite=Lax`; `Secure` is enabled by default in production and configurable for local HTTP development through `SESSION_COOKIE_SECURE`.
- CSRF: authenticated unsafe cookie requests require an `x-openvoice-csrf-token` header. Register and login return the token once a session is created.
- Permission constants: implemented as a TypeScript `const` object plus union type instead of a native `enum`, because TypeScript does not allow BigInt enum members. The public usage remains `Permission.NAME`, and masks remain `bigint` as required.

## Phase 1 Dependency License Check

Additional direct Phase 1 dependencies are documented in `THIRD_PARTY_NOTICES.md`. `argon2`, `pg`, and `@types/pg` use MIT licenses, which are OSI-compatible.

## 2026-05-05: Phase 2 Channel Tree

- Channel depth: top-level channel nodes use `depth = 0`; `MAX_CHANNEL_DEPTH = 5` is the maximum stored node depth.
- Member permission override target IDs use the global user ID. This matches the permission pseudocode in the specification, which looks up user-specific overrides by `user.id`.
- Visible tree responses omit invisible nodes. If a visible child is explicitly allowed below an invisible parent, the response exposes the child as a top-level item to avoid leaking the hidden parent ID.
- Docker runtime: a single multi-stage Dockerfile builds API and web targets. The API image runs migrations before starting the server so local Compose remains self-contained.
- Compose scope: Phase 2 Compose includes API, web, PostgreSQL and Valkey only. coturn, SFU and media services remain out of scope until their planned phases.

## 2026-05-05: Phase 3 Persistent Chat

- Message transport: Phase 3 adds a narrow channel-scoped WebSocket endpoint at `/api/v1/channels/:channelId/messages/ws` for `MESSAGE_CREATE`, `MESSAGE_UPDATE` and `MESSAGE_DELETE`. The full Gateway protocol with `HELLO`/`IDENTIFY`/`READY`, heartbeat, resume, presence and Redis/Valkey PubSub remains Phase 4 scope.
- WebSocket dependency: `ws` is used because Node.js does not provide a production WebSocket server, while Phase 3 explicitly requires live WebSocket message events. `ws` and `@types/ws` are MIT licensed and documented in `THIRD_PARTY_NOTICES.md`.
- Message content: message HTML is never stored as raw HTML. The server stores escaped text with a constrained Markdown subset and strips unsafe links/images. Link previews, embeds, GIFs, stickers and reactions remain out of scope.
- Message length: Phase 3 uses a default maximum message length of 4000 characters until channel-specific text settings are implemented.
- Rate limits: Phase 3 rate limits are in-process token buckets. Distributed Redis/Valkey-backed limits are deferred to the Gateway/operations phases where horizontal coordination is introduced.

## 2026-05-05: Phase 4 Gateway and Presence

- Gateway endpoint: `/api/v1/gateway` is the primary realtime endpoint from Phase 4 onward. The Phase 3 channel-scoped message socket remains for compatibility, but new realtime dispatch uses the Gateway envelope.
- Heartbeat ACK: the Gateway uses an explicit `HEARTBEAT_ACK` op. The Lastenheft requires an ACK response but only listed the initial envelope ops; the explicit op avoids overloading client-to-server `HEARTBEAT` messages.
- Identify auth: Gateway `IDENTIFY` accepts either a `sessionToken` in the payload or the existing HttpOnly session cookie/Bearer token from the WebSocket upgrade. Cookie auth avoids exposing the session token to browser JavaScript.
- Resume foundation: Phase 4 issues in-memory resume tokens and preserves the last sequence number/status for a short timeout. Event replay is not implemented yet and remains future work.
- Redis/Valkey integration: PubSub and temporary presence state use a small internal RESP client instead of adding a Redis npm dependency. This keeps dependencies unchanged while covering the limited Phase 4 commands (`PUBLISH`, `SUBSCRIBE`, `SET`, `SADD`, `SREM`, `SCARD`, `PEXPIRE`, `DEL`).
- Permission updates: `PERMISSION_UPDATE` dispatches workspace-scoped refresh events without channel IDs. This avoids leaking private channel IDs to members who cannot currently see a channel.

## 2026-05-05: Phase 5 Voice MVP

- Media provider: Phase 5 introduces a narrow `MediaProvider` interface and a LiveKit implementation. LiveKit is self-hosted and keeps the SFU replaceable in later phases.
- LiveKit URLs: `LIVEKIT_URL` is the browser-facing WebSocket URL returned to clients; `LIVEKIT_INTERNAL_URL` is the API-to-SFU HTTP URL used for room control. Docker Compose therefore works without exposing internal service names to browsers.
- TURN credentials: the API generates coturn REST credentials with HMAC-SHA1, short TTL and no frontend-shipped shared secret. The ICE endpoint returns STUN, TURN UDP, TURN TCP and TURNS entries.
- Server mute enforcement: server mute/deafen is stored in `voice_states`, dispatched through the Gateway and enforced against LiveKit by updating participant publish permissions and muting existing microphone tracks when the participant is connected.
- Phase boundary: camera, screenshare, recording and bots remain unimplemented. The voice client only publishes microphone audio.
- Docker images: the Phase 5 Compose file adds LiveKit and coturn with placeholder development credentials. Production deployments must replace all placeholders and provide proper TLS/TURNS configuration.

## Phase 5 Dependency License Check

`livekit-client` and `livekit-server-sdk` are Apache-2.0 licensed. The license is OSI-compatible and documented in `THIRD_PARTY_NOTICES.md`.

## 2026-05-05: Phase 6 Camera and Screenshare

- Media permissions: LiveKit publish grants are source-based. Phase 6 issues microphone, camera,
  screen share and screen share audio source permissions from server-side OpenVoice permission
  checks. The 4K profile is enforced at the OpenVoice API state boundary through
  `SHARE_SCREEN_4K`; LiveKit does not provide a token-level maximum-resolution grant.
- Video profiles: the client requests 720p, 1080p, 1440p or 4K profiles and relies on LiveKit
  adaptive stream, dynacast and simulcast layers for degradation. Audio remains prioritized by
  keeping video encodings low priority and by using detail-mode degradation that preserves
  resolution before FPS.
- Screenshare stop handling: browser-level screen stop is handled by observing the local
  screenshare track ending and then clearing the server-side voice state.
- Dependencies: no new direct dependencies were introduced in Phase 6, so the Phase 5 LiveKit
  license assessment remains unchanged.

## 2026-05-05: Phase 7 Moderation

- Timeout limit: member timeouts are capped at 28 days. The Lastenheft requires a bounded timeout
  but does not define a concrete value; 28 days is long enough for MVP moderation while avoiding
  accidental permanent bans through timeout.
- Role hierarchy: lower numeric role positions are higher rank. Non-owner moderators may only
  moderate members whose best role position is lower priority than their own; equal-rank actions
  are denied. The workspace owner is always protected.
- Voice move permissions: moving a member requires `MOVE_MEMBERS` on both the source and
  destination voice channel. The destination must be `voice` or `combined`, and the target member
  must still have `VIEW_CHANNEL` and `CONNECT_VOICE` for the destination.
- Invite boundary: Phase 7 does not implement invites. Active bans are stored and enforced in
  workspace/channel access checks so a future invite join can reject banned users without changing
  the ban data model.
- Dependencies: no new direct dependencies were introduced in Phase 7, so no additional license
  assessment was required.
