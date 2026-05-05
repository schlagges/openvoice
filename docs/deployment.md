# Deployment

Dieses Dokument beschreibt die Zielvorgaben für lokale und produktionsnahe Deployments.

---

## 1. MVP Deployment

MVP-Ziel:

- Docker Compose.
- PostgreSQL.
- Redis/Valkey.
- API.
- Web Frontend.
- LiveKit oder mediasoup SFU.
- coturn.
- Prometheus.
- Grafana.

Beispiel siehe:

- `infra/docker-compose.example.yml`
- `infra/turnserver.example.conf`
- `infra/livekit.example.yaml`

Der aktuelle Phase-8-Compose-Stand in `infra/docker-compose.yml` startet Web, API, PostgreSQL,
Valkey, LiveKit, coturn, Prometheus und Grafana. Prometheus scrapt die API unter `/metrics` und
coturn unter `:9641`; Grafana lädt ein OpenVoice-Overview-Dashboard per Provisioning.

---

## 2. Ports

| Port        | Protokoll | Zweck                                                  |
| ----------- | --------- | ------------------------------------------------------ |
| 443         | TCP       | Web, API, WSS                                          |
| 3478        | UDP       | STUN/TURN                                              |
| 3478        | TCP       | TURN TCP Fallback                                      |
| 5349        | TCP       | TURNS                                                  |
| 5349        | UDP       | TURN DTLS, falls genutzt                               |
| 49152-65535 | UDP       | TURN Relay Range, oder eigene Range                    |
| 7880        | TCP       | LiveKit API/WebSocket, falls direkt exponiert          |
| 7881        | TCP       | LiveKit RTC TCP, falls genutzt                         |
| 50000-50100 | UDP       | LiveKit RTC UDP Range, lokaler Phase-5-Compose-Default |
| 49152-49200 | UDP       | coturn Relay Range, lokaler Phase-5-Compose-Default    |
| 9090        | TCP       | Prometheus UI, lokaler Phase-8-Compose-Default         |
| 3001        | TCP       | Grafana UI, lokaler Phase-8-Compose-Default            |

---

## 3. Secrets

Secrets dürfen nie im Git liegen.

Pflicht-Secrets:

- `SESSION_SECRET`
- `CSRF_SECRET`
- `PASSWORD_PEPPER`
- `TURN_SHARED_SECRET`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- Datenbankpasswort

Für lokale Entwicklung enthält `.env.example` nur Platzhalterwerte. Diese Werte dürfen nicht für
öffentlich erreichbare Deployments verwendet werden.

---

## 4. Produktionsanforderungen

- TLS-Zertifikate automatisch erneuern.
- HTTP -> HTTPS Redirect.
- HSTS.
- Secure Cookies.
- DB-Backups.
- Restore-Test.
- Health Checks.
- Readiness Checks.
- Graceful Shutdown.
- Logs strukturiert.
- Metrics exportieren.
- TURN-Port-Range dokumentieren.
- SFU-Kapazität benchmarken.

---

## 5. Backup und Restore

MVP-Pflicht:

- tägliches PostgreSQL Backup.
- Backup verschlüsseln.
- Retention konfigurieren.
- Restore-Anleitung dokumentieren.
- Restore-Test mindestens einmal vor Produktivbetrieb.

---

## 6. Deployment-Reihenfolge

1. PostgreSQL starten.
2. Redis/Valkey starten.
3. Migrations ausführen.
4. coturn starten.
5. SFU starten.
6. API starten.
7. Web Frontend starten.
8. Prometheus/Grafana starten.
9. Health Checks prüfen.
10. Test-Voice-Join durchführen.

---

## 7. Aktueller Compose-Stand

Lokaler Start:

```bash
docker compose --env-file .env.example -f infra/docker-compose.yml up --build
```

Der lokale PostgreSQL-Host-Port ist standardmäßig `55436`, damit Compose nicht mit häufig bereits
laufenden lokalen PostgreSQL-Instanzen auf `5432` kollidiert. Container-intern bleibt PostgreSQL
weiterhin auf `postgres:5432` erreichbar.

Lokale Observability:

- API Health: `http://localhost:3000/healthz`.
- API Readiness: `http://localhost:3000/readyz`.
- API Metrics: `http://localhost:3000/metrics`.
- Prometheus: `http://localhost:9090`.
- Grafana: `http://localhost:3001`.

Wichtige Voice-Variablen:

- `LIVEKIT_URL`: Browser-facing WebSocket URL, lokal `ws://localhost:7880`.
- `LIVEKIT_INTERNAL_URL`: API-to-LiveKit URL, in Compose `http://livekit:7880`.
- `TURN_URL`: Hostname, den Browser als ICE-Server verwenden.
- `TURN_SHARED_SECRET`: gemeinsames coturn REST-Secret, nur serverseitig verwenden.
- `TURN_TTL_SECONDS`: TTL der temporären TURN Credentials.

Für produktive TURNS-Nutzung müssen gültige TLS-Zertifikate in coturn konfiguriert werden.
Für produktive Grafana-Nutzung muss `GRAFANA_ADMIN_PASSWORD` durch ein echtes Secret ersetzt und
außerhalb des Repositories verwaltet werden.

## 8. Phase-9-Hardening

Die API setzt Security Headers inklusive CSP, `X-Content-Type-Options`, restriktiver
Frame-Einbettung, `Referrer-Policy`, `Permissions-Policy` und optional HSTS. HSTS wird ueber
`ENABLE_HSTS=true` aktiviert und ist fuer produktive HTTPS-Deployments Pflicht.

CORS ist Allowlist-basiert. `CORS_ALLOWED_ORIGINS` enthaelt kommaseparierte Origins, zum Beispiel:

```text
CORS_ALLOWED_ORIGINS=https://voice.example.com
```

Cookie-authentifizierte schreibende Requests muessen weiterhin den CSRF-Header
`x-openvoice-csrf-token` senden. Wenn `Origin` oder `Referer` vorhanden sind, muessen sie zur
CORS-Allowlist passen.

Backup- und Restore-Schritte stehen in `docs/backup-restore.md`.
