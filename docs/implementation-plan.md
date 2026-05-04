# Implementation Plan

Dieses Dokument ergänzt `PLANS.md` mit praktischen Codex-Hinweisen.

---

## Arbeitsweise

Codex soll immer phasenweise arbeiten:

1. Anforderungen aus `docs/lastenheft.md` lesen.
2. Nur die aktuelle Phase aus `PLANS.md` umsetzen.
3. Kleine, überprüfbare Diffs erzeugen.
4. Tests ergänzen.
5. Dokumentation aktualisieren.
6. Build/Test/Lint ausführen.
7. Zusammenfassung der Änderung schreiben.

---

## Phase 0 Deliverables

- Monorepo-Struktur.
- `apps/web`.
- `apps/api`.
- `packages/shared`.
- `infra`.
- `migrations`.
- pnpm Workspace.
- TypeScript Config.
- Lint/Format/Test-Basis.
- Docker Compose mit PostgreSQL und Redis/Valkey.

Codex darf in Phase 0 noch keine Voice- oder Chat-Funktionen implementieren.

---

## Phase 1 Deliverables

- User Entity.
- Session Entity.
- Workspace Entity.
- Workspace Member Entity.
- Role Entity.
- Permission Enum.
- Permission Engine.
- AuditLog Entity.
- Auth Endpoints.
- Workspace Create Endpoint.
- Unit Tests für Permission Engine.

---

## Phase 2 Deliverables

- Channel Node Entity.
- Channel Types.
- Tree Validation.
- Reorder Endpoint.
- Permission Overrides.
- Effective Permission Endpoint.
- Channel Tree UI.

---

## Phase 3 Deliverables

- Message Entity.
- Chat API.
- WebSocket Message Events.
- Markdown-Subset.
- Rate Limits.
- Chat UI.

---

## Phase 4 Deliverables

- Gateway Protocol.
- Heartbeat.
- Resume Grundlage.
- Presence.
- Redis/Valkey PubSub.

---

## Phase 5 Deliverables

- MediaProvider Interface.
- LiveKit Provider.
- Voice Join API.
- TURN Credential Generator.
- coturn Config.
- Voice UI.
- Mute/Deafen.

---

## Phase 6 Deliverables

- Camera publish/unpublish.
- Screenshare publish/unpublish.
- 4K quality profile.
- Adaptive subscription.
- Video Grid.
- Focus View.
- RTC Stats Anzeige.

---

## Phase 7 Deliverables

- Kick.
- Ban.
- Timeout.
- Voice move/disconnect.
- Audit Log UI.
- Role hierarchy enforcement.

---

## Phase 8 Deliverables

- Prometheus Metrics.
- Grafana Dashboards.
- Health/Readiness Checks.
- WebRTC Quality Samples.
- TURN Relay Ratio.

---

## Phase 9 Deliverables

- Security Headers.
- CSP.
- CSRF.
- CORS.
- Cookie Hardening.
- Dependency License Check.
- Backup/Restore Doku.
- Final E2E Matrix.
