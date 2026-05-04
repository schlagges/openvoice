# AGENTS.md

## Projekt

Dieses Repository enthält **OpenVoice**, ein vollständig Open-Source, browserbasiertes Voice-/Chat-/Video-Tool ähnlich Discord, aber ohne unnötige Zusatzfeatures.

Das verbindliche Lastenheft liegt in:

- `docs/lastenheft.md`

Der Umsetzungsplan liegt in:

- `PLANS.md`

Codex muss vor jeder größeren Änderung diese Dateien lesen.

---

## Harte Produktregeln

- Das System muss vollständig self-hostbar sein.
- Keine proprietären RTC-SaaS-Dienste verwenden.
- WebRTC ist Pflicht für Audio, Video und Screenshare.
- SFU statt Peer-to-Peer-Mesh.
- coturn ist Pflicht für STUN/TURN.
- PostgreSQL ist die persistente Datenbank.
- Redis oder Valkey wird für PubSub, Presence und temporäre Zustände verwendet.
- Der Browser ist der primäre Client.
- Audioqualität und niedrige Latenz haben Vorrang vor Videoqualität.
- 4K-Screenshare muss unterstützt werden, aber adaptiv degradieren.
- Rechteprüfung muss immer serverseitig erfolgen.
- Frontend-Rechte sind nur UI-Komfort, keine Sicherheitsgrenze.
- Keine Sticker, GIF-Suche, Bots, Threads, Payments, Server-Boosts oder Social-Schnickschnack im MVP.

---

## Architektur

Die Zielarchitektur besteht aus:

- Web Frontend
- API Backend
- WebSocket Gateway
- PostgreSQL
- Redis/Valkey
- SFU, bevorzugt LiveKit self-hosted im MVP
- coturn
- Prometheus
- Grafana
- Docker Compose für lokale und erste produktionsnahe Installation

Die Media-Integration muss über ein internes Interface abstrahiert werden, damit LiveKit später durch mediasoup oder eine andere Open-Source-SFU ersetzt werden kann.

---

## Codequalität

- TypeScript bevorzugen, wenn nicht anders entschieden.
- Keine ungeprüften `any`-Typen.
- Keine Secrets im Repository.
- Keine TODOs ohne Ticket- oder Kontextverweis.
- Jede sicherheitsrelevante Aktion braucht serverseitige Prüfung.
- Jede relevante Moderationsaktion braucht Audit-Log.
- Neue API-Endpunkte müssen validierte Input-Schemas haben.
- Fehler müssen ein einheitliches Fehlerformat verwenden.
- Datenbankänderungen brauchen Migrationen.
- Öffentliche Typen gehören nach `packages/shared`.
- Domänenlogik gehört nicht direkt in Controller oder React-Komponenten.
- Permission-Checks müssen zentral implementiert und getestet werden.
- Media-Tokens und TURN-Credentials dürfen nie im Frontend hardcodiert werden.

---

## Tests

Für jede Phase müssen passende Tests ergänzt werden:

- Permission Engine: Unit Tests
- Channel Tree: Unit Tests und Integration Tests
- Auth: Integration Tests
- Chat: Integration und E2E
- Voice Join Token: Integration Tests
- TURN Credential Generation: Unit Tests
- WebSocket Gateway: Integration Tests
- UI-Kernflows: Playwright E2E

Vor Abschluss einer Aufgabe müssen, soweit vorhanden, ausgeführt werden:

```bash
pnpm lint
pnpm test
pnpm build
```

Falls diese Befehle noch nicht existieren, müssen sie in der jeweiligen Phase eingerichtet werden.

---

## Umsetzung

Arbeite phasenweise gemäß `PLANS.md`.

Nicht versuchen, das komplette Produkt in einem einzigen riesigen Diff umzusetzen.

Bevor neue große Dependencies eingeführt werden:

1. Prüfen, ob sie wirklich nötig sind.
2. Lizenz prüfen.
3. Alternative bewerten.
4. Entscheidung kurz dokumentieren.

---

## Definition of Done

Eine Aufgabe ist nur fertig, wenn:

- Code implementiert ist.
- Rechte serverseitig geprüft werden.
- Tests ergänzt wurden.
- Build erfolgreich ist.
- Relevante Dokumentation aktualisiert wurde.
- Keine Secrets oder privaten Schlüssel enthalten sind.
- Keine Anforderungen aus `docs/lastenheft.md` verletzt werden.
