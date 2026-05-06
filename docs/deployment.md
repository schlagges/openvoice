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

Der aktuelle rc1-Compose-Stand in `infra/docker-compose.yml` startet Web, API, PostgreSQL,
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
- `AUDIT_IP_HASH_SECRET`
- `TURN_SHARED_SECRET`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- Datenbankpasswort

Für lokale Entwicklung enthält `.env.example` keine nutzbaren Werte fuer sensible Secrets. Der
Compose-Stack bricht bei fehlenden Pflicht-Secrets hart ab; echte Werte muessen lokal oder ueber
ein externes Secret-Management gesetzt werden.

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
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

`.env` muss aus `.env.example` abgeleitet und mit echten lokalen Secrets befuellt werden. Diese
Datei darf nicht ins Repository committed werden.

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
- `TRUSTED_PROXY_IPS`: kommaseparierte IPs oder IPv4-CIDRs von Reverse Proxies, deren
  `x-forwarded-for` fuer Rate Limits und Audit-IP-Ermittlung vertraut wird. Leer lassen, wenn die
  API direkt erreichbar ist.
- `AUDIT_IP_HASH_SECRET`: runtime-only HMAC-Secret fuer datenschutzkonforme `ip_hash`-Werte im
  Audit Log.

Die aktive coturn-Compose-Konfiguration blockiert private und Multicast-Zielnetze mit
`denied-peer-ip`, damit ein public erreichbarer TURN-Dienst nicht als Relay in interne Netze
missbraucht werden kann.

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

## 9. Reverse Proxy fuer `voice.schnick-schnack.info`

Wenn der externe Host-Nginx `https://voice.schnick-schnack.info` auf den lokalen Docker-Port
`3000` weiterleitet, muss Port `3000` dem `web`-Service gehoeren. Der Web-Container liefert die
SPA aus und proxyt `/api/` sowie WebSocket-Upgrades intern an den API-Container.

Die temporaere Domain `schnick-schnack.info.w00ac711.kasserver.com` kann parallel auf denselben
OpenVoice-Web-Port zeigen. Beide Origins muessen dann in `CORS_ALLOWED_ORIGINS` stehen.

Empfohlene `.env`-Werte fuer diesen Host:

```dotenv
APP_PUBLIC_URL=https://voice.schnick-schnack.info
API_PUBLIC_URL=https://voice.schnick-schnack.info/api
GATEWAY_PUBLIC_URL=wss://voice.schnick-schnack.info/api/v1/gateway
VITE_API_BASE_URL=/api/v1

WEB_PORT=127.0.0.1:3000
API_PORT=127.0.0.1:3002
CORS_ALLOWED_ORIGINS=https://voice.schnick-schnack.info,https://schnick-schnack.info.w00ac711.kasserver.com
ENABLE_HSTS=true
SESSION_COOKIE_SECURE=true
TRUSTED_PROXY_IPS=172.16.0.0/12

TURN_REALM=voice.schnick-schnack.info
TURN_URL=voice.schnick-schnack.info
LIVEKIT_URL=wss://voice.schnick-schnack.info/livekit
```

`API_PORT=127.0.0.1:3002` bindet die API nur lokal und vermeidet den Konflikt mit dem Web-Port
`3000`. Der oeffentliche Zugriff sollte ueber den Web-Nginx und dessen `/api/`-Proxy laufen.
`TRUSTED_PROXY_IPS=172.16.0.0/12` vertraut Docker-Bridge-Proxies fuer `x-forwarded-for`; fuer
haertere Produktionsprofile kann die konkrete Docker-Netz-CIDR oder Container-IP eingetragen
werden.

Der externe Host-Nginx muss mindestens diese Pfade weiterleiten:

- `/` an `http://127.0.0.1:3000`.
- `/api/` inklusive WebSocket-Upgrade an `http://127.0.0.1:3000`.

Fuer LiveKit muss entweder ein separater TLS-vHost auf den exponierten LiveKit-Port zeigen oder der
Host-Nginx muss `/livekit` inklusive WebSocket-Upgrade an den LiveKit-Service weiterleiten. Der
Wert von `LIVEKIT_URL` muss exakt zu diesem browserseitig erreichbaren WebSocket-Endpunkt passen.
Wenn die Temp-Domain fuer RTC-Medientests genutzt werden soll, muss `LIVEKIT_URL` temporaer auf
`wss://schnick-schnack.info.w00ac711.kasserver.com/livekit` zeigen oder LiveKit muss unter einer
separaten Domain mit gueltigem TLS-Zertifikat erreichbar sein.

Wenn die Weboberflaeche per Basic Auth geschuetzt ist, muss der Host-Nginx fuer `/livekit/` den
automatisch vom Browser mitgesendeten Basic-Auth-Header entfernen. LiveKit authentifiziert den
Signal-WebSocket ueber den kurzlebigen Join-Token in der Query und lehnt sonst den Basic-Header ab.

```nginx
location /livekit/ {
    proxy_pass http://127.0.0.1:7880/;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Authorization "";
    proxy_buffering off;
    proxy_read_timeout 3600;
}
```

TURN/TURNS laufen nicht ueber den HTTP-Reverse-Proxy. Firewall und DNS muessen die in Abschnitt 2
dokumentierten TURN-Ports direkt auf den coturn-Container weiterleiten. Fuer produktive TURNS
muessen gueltige Zertifikate in `infra/certs` bereitgestellt oder der coturn-Zertifikatspfad
deploymentseitig angepasst werden.

## 10. Image-basiertes Zielsystem ohne Source-Build

Fuer Zielsysteme soll der Anwendungscode nicht gebaut werden. Der Zielserver bekommt nur fertige
Docker-Images, `infra/docker-compose.prod.yml`, die benoetigten `infra/`-Konfigurationsdateien,
coturn-Zertifikate und eine runtime-only `.env`.

Build und Export auf der Entwicklungsmaschine:

```bash
pnpm docker:export 0.1.0-rc1
scp dist/openvoice-images-0.1.0-rc1.tar.gz ki-maschine:/home/schlagges/
```

Import auf dem Zielserver:

```bash
ssh ki-maschine
gunzip -c /home/schlagges/openvoice-images-0.1.0-rc1.tar.gz | docker load
```

Minimal benoetigte Dateien auf dem Zielserver:

```text
/home/schlagges/openvoice-deploy/.env
/home/schlagges/openvoice-deploy/infra/docker-compose.prod.yml
/home/schlagges/openvoice-deploy/infra/prometheus.yml
/home/schlagges/openvoice-deploy/infra/prometheus-alerts.yml
/home/schlagges/openvoice-deploy/infra/grafana/
/home/schlagges/openvoice-deploy/infra/certs/
```

Wichtige `.env`-Image-Werte:

```dotenv
OPENVOICE_API_IMAGE=openvoice-api:0.1.0-rc1
OPENVOICE_WEB_IMAGE=openvoice-web:0.1.0-rc1
```

Der Web-Container schützt die öffentliche Oberfläche zusätzlich mit HTTP Basic Auth. Die Werte
kommen aus der runtime-only `.env`:

```dotenv
OPENVOICE_SITE_USER=openvoice
OPENVOICE_SITE_PASSWORD=keins
```

Der Basic-Auth-Schutz liegt vor der SPA und vor `/api/`. Der Web-Container entfernt
`Authorization: Basic ...` vor dem internen API-Proxy, damit die vorgelagerte Site-Auth nicht mit
OpenVoice-App-Auth kollidiert. `/livekit/` wird am Host-Nginx separat direkt zur SFU
weitergeleitet und ist nicht Teil dieses Basic-Auth-Schutzes.

Passwortwechsel auf dem Zielserver:

```bash
cd /home/schlagges/openvoice-deploy
$EDITOR .env
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d web
```

Start auf dem Zielserver:

```bash
cd /home/schlagges/openvoice-deploy
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d
```

Wenn nur die Anwendung aktualisiert wird:

```bash
gunzip -c /home/schlagges/openvoice-images-0.1.0-rc1.tar.gz | docker load
cd /home/schlagges/openvoice-deploy
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d api web
```

`infra/docker-compose.yml` bleibt fuer lokale Entwicklung und Build-on-host-Tests verfuegbar.
`infra/docker-compose.prod.yml` ist der bevorzugte Zielsystem-Pfad, weil er keine `build:`-Bloeke
enthaelt.

## 11. Deployment-Smoke-Checks

Nach jedem Image-Update sollten mindestens diese Checks laufen:

```bash
curl -I https://voice.schnick-schnack.info
curl -I -u openvoice:keins https://voice.schnick-schnack.info
curl -i -u openvoice:keins https://voice.schnick-schnack.info/api/v1/me
curl -i https://voice.schnick-schnack.info/livekit/
```

Erwartung:

- Ohne Basic Auth liefert die Weboberflaeche `401`.
- Mit Basic Auth liefert die Weboberflaeche `200`.
- `/api/v1/me` liefert mit Basic Auth, aber ohne OpenVoice-Session, ein JSON-`401` der App.
- `/livekit/` darf nicht vom Web-Basic-Auth-Schutz blockiert werden. Ein HTTP-`401` von LiveKit
  ist ohne Join-Token normal, darf aber nicht durch einen weitergeleiteten Basic-Auth-Header
  verursacht werden.

Das ausgelieferte Web-Bundle darf fuer die API nicht `http://localhost:3000/api/v1` enthalten. Fuer
oeffentliche Deployments muss die API relativ ueber `/api/v1` laufen.
