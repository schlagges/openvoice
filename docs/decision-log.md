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
