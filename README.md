# OpenVoice

OpenVoice ist ein vollständig self-hostbares, browserbasiertes Voice-/Chat-/Video-Tool.
Die Umsetzung erfolgt phasenweise nach `PLANS.md`; das verbindliche Lastenheft liegt in
`docs/lastenheft.md`.

Die Umsetzung ist aktuell bis Phase 7 vorbereitet: Monorepo-Fundament, Auth/Workspaces,
Channel-Baum mit Rechte-Overrides, persistenter Chat, WebSocket Gateway/Presence sowie ein Voice
MVP mit LiveKit-SFU, coturn, TURN REST Credentials, Kamera-Video, Screenshare-Basisprofilen und
Moderationsaktionen inklusive Audit-Log-Grundansicht.

## Struktur

```text
openvoice/
  apps/
    web/
    api/
  packages/
    shared/
  docs/
  infra/
    docker-compose.yml
  migrations/
```

## Voraussetzungen

- Node.js 22 oder neuer
- pnpm 10 oder neuer
- Docker mit Docker Compose

## Entwicklung

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

## Lokale Infrastruktur

Die Compose-Datei baut API und Web-App und startet PostgreSQL, Valkey, LiveKit und coturn:

```bash
docker compose --env-file .env.example -f infra/docker-compose.yml up --build
```

Die API führt Migrationen beim Containerstart aus. Für lokale Migrationen ohne Container läuft:

```bash
pnpm db:migrate
```

Nach dem Compose-Start sind die Web-App unter `http://localhost:5173`, die API unter
`http://localhost:3000`, PostgreSQL unter `localhost:55436`, LiveKit unter
`ws://localhost:7880` und coturn auf `localhost:3478` / `localhost:5349` erreichbar.

Die Beispielwerte in `.env.example` sind Platzhalter für lokale Entwicklung. Produktive Secrets
dürfen nicht in Git gespeichert werden.

## Dokumentation

- `AGENTS.md`: Arbeitsregeln für Codex
- `PLANS.md`: phasenweiser Umsetzungsplan
- `docs/lastenheft.md`: verbindliche Produkt- und Technikvorgaben
- `docs/decision-log.md`: dokumentierte technische Entscheidungen
- `docs/manual-voice-tests.md`: manuelle Phase-5-Voice-Prüfschritte
- `docs/manual-video-tests.md`: manuelle Phase-6-Kamera- und Screenshare-Prüfschritte
