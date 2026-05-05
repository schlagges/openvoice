# OpenVoice

OpenVoice ist ein vollständig self-hostbares, browserbasiertes Voice-/Chat-/Video-Tool.
Die Umsetzung erfolgt phasenweise nach `PLANS.md`; das verbindliche Lastenheft liegt in
`docs/lastenheft.md`.

Die Umsetzung ist aktuell bis Phase 4 vorbereitet: Monorepo-Fundament, Auth/Workspaces,
Channel-Baum mit Rechte-Overrides, persistenter Chat sowie WebSocket Gateway und Presence. Voice,
Video und Screenshare sind noch nicht implementiert.

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

Die Compose-Datei baut API und Web-App und startet PostgreSQL sowie Valkey:

```bash
docker compose --env-file .env.example -f infra/docker-compose.yml up --build
```

Die API führt Migrationen beim Containerstart aus. Für lokale Migrationen ohne Container läuft:

```bash
pnpm db:migrate
```

Nach dem Compose-Start sind die Web-App unter `http://localhost:5173` und die API unter
`http://localhost:3000` erreichbar.

Die Beispielwerte in `.env.example` sind Platzhalter für lokale Entwicklung. Produktive Secrets
dürfen nicht in Git gespeichert werden.

## Dokumentation

- `AGENTS.md`: Arbeitsregeln für Codex
- `PLANS.md`: phasenweiser Umsetzungsplan
- `docs/lastenheft.md`: verbindliche Produkt- und Technikvorgaben
- `docs/decision-log.md`: dokumentierte technische Entscheidungen
