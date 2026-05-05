# Third Party Notices

OpenVoice is licensed as `AGPL-3.0-or-later`. This file lists the direct third-party runtime and
tooling dependencies intentionally used by the monorepo. Transitive dependency licenses are checked
locally with:

```bash
pnpm license:check
```

## Runtime Dependencies

| Package              | License    | Purpose                                        |
| -------------------- | ---------- | ---------------------------------------------- |
| `argon2`             | MIT        | Argon2id password hashing                      |
| `livekit-client`     | Apache-2.0 | Browser client for the self-hosted LiveKit SFU |
| `livekit-server-sdk` | Apache-2.0 | API-side LiveKit room/token integration        |
| `pg`                 | MIT        | PostgreSQL client                              |
| `ws`                 | MIT        | WebSocket server/client primitives             |

## Development Dependencies

| Package             | License    | Purpose                            |
| ------------------- | ---------- | ---------------------------------- |
| `@eslint/js`        | MIT        | ESLint JavaScript rules            |
| `@types/node`       | MIT        | Node.js TypeScript types           |
| `@types/pg`         | MIT        | PostgreSQL client TypeScript types |
| `@types/ws`         | MIT        | WebSocket TypeScript types         |
| `eslint`            | MIT        | Linting                            |
| `prettier`          | MIT        | Formatting                         |
| `typescript`        | Apache-2.0 | TypeScript compiler                |
| `typescript-eslint` | MIT        | TypeScript ESLint integration      |
| `vite`              | MIT        | Web build tooling                  |
| `vitest`            | MIT        | Unit and integration test runner   |
