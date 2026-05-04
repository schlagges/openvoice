# OpenVoice

OpenVoice ist ein vollständig self-hostbares, browserbasiertes Voice-/Chat-/Video-Tool.
Die Umsetzung erfolgt phasenweise nach `PLANS.md`; das verbindliche Lastenheft liegt in
`docs/lastenheft.md`.

Phase 0 richtet ausschließlich das technische Monorepo-Fundament ein. Produktfeatures wie Auth,
Chat, Voice, Video und Workspace-Logik sind noch nicht implementiert.

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

Die Phase-0-Compose-Datei startet PostgreSQL und Valkey:

```bash
docker compose --env-file .env.example -f infra/docker-compose.yml up -d
```

Die Beispielwerte in `.env.example` sind Platzhalter für lokale Entwicklung. Produktive Secrets
dürfen nicht in Git gespeichert werden.

## Dokumentation

- `AGENTS.md`: Arbeitsregeln für Codex
- `PLANS.md`: phasenweiser Umsetzungsplan
- `docs/lastenheft.md`: verbindliche Produkt- und Technikvorgaben
- `docs/decision-log.md`: dokumentierte technische Entscheidungen
