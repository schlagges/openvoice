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
