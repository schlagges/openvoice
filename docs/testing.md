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
- Phase 7: Kick/Ban/Unban/Timeout, Voice-Move/Disconnect, Role-Hierarchy und Audit-Log-Zugriff.
- Phase 8: Health/Readiness, Prometheus-Metrics, Message-/Voice-Zähler und RTC-Stats-Ingest mit
  serverseitiger Channel-Sichtbarkeitsprüfung.
- Phase 9: Security Headers, CORS-Preflight-Allowlist, CSRF-Origin-Pruefung und requestweite
  Rate Limits.

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

Die vollstaendige Phase-9-Matrix steht in `docs/e2e-test-matrix.md`.

Lokaler Mehrnutzer-Smoke-Test:

```bash
OPENVOICE_E2E_BASE_URL=http://localhost:55180 pnpm e2e
```

Der Test nutzt zwei getrennte Browser-Kontexte, erstellt einen Testnutzer mit Workspace/Channel,
laesst einen zweiten Testnutzer per Invite beitreten und prueft Chat-Live-Sync sowie chronologische
Nachrichtenanzeige. Fuer lokale und E2E-Laeufe kann `RATE_LIMITS_ENABLED=false` gesetzt werden,
damit Setup-Aktionen nicht durch produktive Rate Limits blockiert werden.

---

## Manuelle RTC Tests

Phase-5-spezifische Schritte stehen in `docs/manual-voice-tests.md`.
Phase-6-spezifische Kamera- und Screenshare-Schritte stehen in `docs/manual-video-tests.md`.
Phase-8-spezifisch müssen Prometheus-Scrapes, Grafana-Dashboard-Import und Alert-Regeln über
Docker Compose geprüft werden.

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
