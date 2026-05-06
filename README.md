# OpenVoice

OpenVoice ist ein vollständig self-hostbares, browserbasiertes Voice-/Chat-/Video-Tool.
Die Umsetzung erfolgt phasenweise nach `PLANS.md`; das verbindliche Lastenheft liegt in
`docs/lastenheft.md`.

Die Umsetzung ist aktuell bis Phase 9 vorbereitet: Monorepo-Fundament, Auth/Workspaces,
Channel-Baum mit Rechte-Overrides, persistenter Chat, WebSocket Gateway/Presence, Voice/Video mit
LiveKit-SFU und coturn, Moderationsaktionen inklusive Audit-Log-Grundansicht sowie
Observability-Grundlagen mit Prometheus, Grafana, Health Checks und RTC-Quality-Metriken plus
Basis-Hardening fuer Security Headers, CORS/CSRF, Rate Limits und License Checks.

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
pnpm e2e
pnpm license:check
```

## Lokale Infrastruktur

Die Compose-Datei baut API und Web-App und startet PostgreSQL, Valkey, LiveKit, coturn,
Prometheus und Grafana:

```bash
pnpm env:local
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

Die API führt Migrationen beim Containerstart aus. Für lokale Migrationen ohne Container läuft:

```bash
pnpm db:migrate
```

Für den aktuellen lokalen Teststack wird die Web-App unter `http://localhost:55180/` und die API
unter `http://localhost:53010` betrieben. Die Site ist per Basic Auth geschützt; lokal wird
`openvoice` als Benutzer und das in `.env` gesetzte `OPENVOICE_SITE_PASSWORD` verwendet. Für den
Browser-Testlauf wird aktuell `keins` als lokales Testpasswort genutzt.

Die Standardwerte in `.env.example` bleiben auf einfache Entwicklungsports gesetzt:
Web-App `http://localhost:5173`, API `http://localhost:3000`, PostgreSQL `localhost:55436`,
LiveKit `ws://localhost:7880`, coturn `localhost:3478` / `localhost:5349`, Prometheus
`http://localhost:9090` und Grafana `http://localhost:3001`.

Observability-Endpunkte:

- `GET /healthz`: Liveness.
- `GET /readyz`: Readiness für PostgreSQL, Valkey und LiveKit.
- `GET /metrics`: Prometheus-Metriken.

Die Beispielwerte in `.env.example` sind Platzhalter für lokale Entwicklung. Produktive Secrets
dürfen nicht in Git gespeichert werden.

Für lokale Mehrnutzer-Tests kann `RATE_LIMITS_ENABLED=false` in `.env` gesetzt werden. Der
Produktionsdefault bleibt `true`.

## Aktueller öffentlicher Host

Die öffentliche Testinstanz läuft hinter `https://voice.schnick-schnack.info`.

- DNS: `voice.schnick-schnack.info` zeigt auf `217.160.175.231`.
- TLS: Let's Encrypt Zertifikat auf dem Host, Terminierung in Nginx.
- Reverse Proxy: Nginx leitet die öffentliche URL an die lokal laufende Docker-Web-App weiter.
- Docker-Zielport: die App soll auf dem Host hinter Port `3000` laufen.
- Interne Dienste: API, LiveKit, coturn, PostgreSQL, Valkey, Prometheus und Grafana bleiben hinter
  Docker/Nginx und werden nicht als öffentliche App-Oberfläche exponiert.

## Manueller Mehrnutzer-Test

1. `http://localhost:55180/` öffnen und mit Basic Auth anmelden.
2. `Testnutzer` öffnen, Testnutzer mit Workspace und Channel erstellen.
3. Im selben Dialog `Invite erstellen` klicken und den Code kopieren.
4. Zweiten Browser oder Inkognito-Profil öffnen.
5. Dort einen zweiten Testnutzer registrieren und mit dem Invite-Code beitreten.
6. In beiden Browsern denselben Channel anklicken.
7. Nachrichten senden und prüfen, ob sie live und in richtiger Reihenfolge erscheinen.

Der automatisierte Browser-Test führt diesen Ablauf mit zwei getrennten Browser-Kontexten aus:

```bash
OPENVOICE_E2E_BASE_URL=http://localhost:55180 pnpm e2e
```

## Dokumentation

- `AGENTS.md`: Arbeitsregeln für Codex
- `PLANS.md`: phasenweiser Umsetzungsplan
- `docs/lastenheft.md`: verbindliche Produkt- und Technikvorgaben
- `docs/decision-log.md`: dokumentierte technische Entscheidungen
- `docs/manual-voice-tests.md`: manuelle Phase-5-Voice-Prüfschritte
- `docs/manual-video-tests.md`: manuelle Phase-6-Kamera- und Screenshare-Prüfschritte
- `docs/observability.md`: Phase-8-Metriken, Dashboards und Alert-Regeln
- `docs/backup-restore.md`: Backup-/Restore-Mindeststandard
- `docs/data-retention.md`: Datenschutz- und Retention-Regeln
- `docs/e2e-test-matrix.md`: E2E-Basis-Testmatrix
