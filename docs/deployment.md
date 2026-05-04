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

---

## 2. Ports

| Port | Protokoll | Zweck |
|---|---|---|
| 443 | TCP | Web, API, WSS |
| 3478 | UDP | STUN/TURN |
| 3478 | TCP | TURN TCP Fallback |
| 5349 | TCP | TURNS |
| 5349 | UDP | TURN DTLS, falls genutzt |
| 49152-65535 | UDP | TURN Relay Range, oder eigene Range |
| 7880 | TCP | LiveKit API/WebSocket, falls direkt exponiert |
| 7881 | TCP | LiveKit RTC TCP, falls genutzt |
| 50000-60000 | UDP | LiveKit RTC UDP Range, Beispiel |

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
