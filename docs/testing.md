# Testing

Dieses Dokument ist die Test-Kurzreferenz für Codex.

---

## Unit Tests

Pflicht:

- Permission Evaluation.
- Role Hierarchy.
- Channel Tree Validation.
- Invite Validation.
- Message Sanitizing.
- Rate Limits.
- TURN Credential Generation.
- Media Token Claims.
- Audit Log Writer.

---

## Integration Tests

Pflicht:

- Auth + Session.
- Workspace CRUD.
- Channel CRUD.
- Message CRUD.
- Role Assignment.
- Permission Overrides.
- Voice Join Token.
- Ban/Timeout Enforcement.
- WebSocket Dispatch.
- Redis/Valkey PubSub.
- PostgreSQL Migrations.

---

## E2E Tests

Mit Playwright:

- Login.
- Workspace erstellen.
- Channel erstellen.
- Nachricht senden.
- Rechte verweigern.
- Voice Join UI.
- Mute Button.
- Channel Reorder.
- Role Editor.

---

## Manuelle RTC Tests

Phase-5-spezifische Schritte stehen in `docs/manual-voice-tests.md`.
Phase-6-spezifische Kamera- und Screenshare-Schritte stehen in `docs/manual-video-tests.md`.

- 2 Nutzer Audio.
- 5 Nutzer Audio.
- 20 Nutzer Audio.
- Kamera 720p.
- Kamera 1080p.
- Screenshare 1080p.
- Screenshare 4K.
- TURN UDP.
- TURN TCP/TLS.
- Paketverlust 1/3/5 %.
- RTT 50/100/200 ms.
