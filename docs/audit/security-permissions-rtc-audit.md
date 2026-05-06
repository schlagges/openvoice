# Security, Permissions und RTC Audit

Datum: 2026-05-05

Scope: kritischer Code-Review des aktuellen Release-Branches mit Fokus auf Auth, Sessions,
Passwort-Hashing, CSRF, CORS, Rate Limits, Permission Engine, Channel Overrides, Voice Join,
TURN-Credentials, SFU Token Claims, WebSocket-Leaks, private Channel Leaks, Audit Log, Secrets,
Dependencies, Tests und Migrationen.

Es wurden keine Code-Fixes vorgenommen.

## Gepruefte Artefakte

- `AGENTS.md`
- `PLANS.md`
- `docs/lastenheft.md`
- `docs/security.md`
- `docs/permissions.md`
- `docs/rtc.md`
- `docs/deployment.md`
- `docs/testing.md`
- `docs/api.md`
- `docs/data-model.md`
- `apps/api/src/**`
- `apps/web/src/**`
- `packages/shared/src/**`
- `migrations/*.sql`
- `infra/docker-compose.yml`
- `infra/livekit.yaml`
- `.env.example`
- `package.json`
- `pnpm-lock.yaml`

## Ausgefuehrte Checks

- `pnpm test`: bestanden, 16 Testdateien, 55 Tests.
- `pnpm license:check`: bestanden, 214 Package-Manifeste geprueft.
- `pnpm audit --audit-level moderate`: erster Lauf ohne Netzwerkzugriff mit `EAI_AGAIN`
  fehlgeschlagen; erneuter Lauf mit Netzwerkzugriff bestanden, keine bekannten Vulnerabilities.
- `docker compose --env-file .env.example -f infra/docker-compose.yml config`: bestanden.

## Zusammenfassung

Der Backend-Kern ist funktional breit abgedeckt und die wichtigsten HTTP-Pfade nutzen zentrale
Auth-, CSRF- und Permission-Pruefungen. Release-blockierend sind aber mehrere Security-Gaps:
WebSocket-Upgrades umgehen die HTTP-Origin-Pruefung, Message-Edit erzwingt keine
`VIEW_CHANNEL`-Pruefung, und die lauffaehige Compose-Konfiguration enthaelt vorhersehbare
Default-Secrets. Diese Funde betreffen direkt die Release-Faehigkeit.

## Fix-Status

- P0-1: behoben. Gateway- und Legacy-Message-WebSocket pruefen `Origin` gegen die
  CORS-Allowlist; cookie-authentifizierte Upgrades ohne `Origin` werden abgelehnt. Regressionstest
  in `apps/api/tests/api-phase4.test.ts`.
- P0-2: behoben. Message Edit erzwingt nun vor der Mutation `VIEW_CHANNEL`. Regressionstest in
  `apps/api/tests/api-phase3.test.ts`.
- P0-3: behoben. Release-Compose verlangt echte Secrets per Environment; `.env.example` enthaelt
  fuer sensible Werte keine nutzbaren Platzhalter; LiveKit Runtime-Config wird aus Environment
  generiert. Regressionstest in `apps/api/tests/api-phase9.test.ts`.
- P1-1: behoben. Voice Move, Disconnect, Server Mute und Server Deafen erzwingen jetzt fuer den
  Actor zusaetzlich `VIEW_CHANNEL`. Regressionstest in `apps/api/tests/api-phase7.test.ts`.
- P1-2: behoben. Gateway-Upgrades, Legacy-Message-WebSocket-Upgrades und Gateway-Frames haben
  In-Memory-Rate-Limits pro Client-IP/User. Regressionstest in
  `apps/api/tests/api-phase4.test.ts`.
- P1-3: behoben. `x-forwarded-for` wird nur noch bei explizit konfigurierten
  `TRUSTED_PROXY_IPS` ausgewertet; direkte Clients werden nach Socket-IP limitiert.
  Regressionstest in `apps/api/tests/api-phase9.test.ts`.
- P1-4: behoben. Der globale TURN-Credential-Endpunkt verlangt jetzt einen aktiven Voice-State und
  prueft `VIEW_CHANNEL` sowie `CONNECT_VOICE`; Voice Join liefert weiterhin die benoetigten ICE
  Server. Regressionstest in `apps/api/tests/api-phase5.test.ts`.
- P1-5: behoben. Die aktive coturn-Compose-Konfiguration enthaelt die privaten und Multicast
  `denied-peer-ip`-Bereiche analog zur Example-Config. Regressionstest in
  `apps/api/tests/api-phase9.test.ts`.
- P1-6: behoben. Audit-Log-Inserts schreiben einen HMAC-SHA256-IP-Hash aus dem Request-Kontext,
  wenn `AUDIT_IP_HASH_SECRET` konfiguriert ist; das Secret bleibt runtime-only. Regressionstest in
  `apps/api/tests/api-phase9.test.ts`.
- P1-7: behoben fuer die auditrelevanten Security-Regressionen. Ergaenzt wurden Tests fuer
  WebSocket-Origin, Message-Edit-Sichtbarkeit, Voice-Moderation-Sichtbarkeit,
  `x-forwarded-for`-Spoofing, TURN ohne aktiven Voice-State, Compose-Secret-Defaults und
  Audit-IP-Hash.
- Closed-Beta Deployment-P1: behoben. `TRUSTED_PROXY_IPS` akzeptiert IPv4-CIDRs fuer Docker
  Bridge-Proxies, sodass Rate Limits und Audit-IP-Hashes hinter dem Web-Container korrekt mit
  `x-forwarded-for` arbeiten koennen. Regressionstest in `apps/api/tests/api-phase9.test.ts`.

Checks nach P0-1:

- `pnpm lint`: bestanden.
- `pnpm test`: bestanden, 16 Testdateien, 56 Tests.
- `pnpm build`: bestanden.

Checks nach P0-3:

- `pnpm lint`: bestanden.
- `pnpm test`: bestanden, 16 Testdateien, 58 Tests.
- `pnpm build`: bestanden.
- `docker compose -f infra/docker-compose.yml config` mit expliziten Dummy-Secrets: bestanden.

Checks nach P0-2:

- `pnpm lint`: bestanden.
- `pnpm test`: bestanden, 16 Testdateien, 57 Tests.
- `pnpm build`: bestanden.

Checks nach P1-Fixes:

- `pnpm lint`: bestanden.
- `pnpm test`: bestanden, 17 Testdateien, 65 Tests.
- `pnpm build`: bestanden.

Checks nach Closed-Beta Deployment-P1:

- `pnpm exec vitest run apps/api/tests/api-phase9.test.ts`: bestanden, 7 Tests.
- `pnpm lint`: bestanden.
- `pnpm test`: bestanden, 17 Testdateien, 72 Tests.
- `pnpm build`: bestanden.
- Gezielter Prettier-Check fuer die in diesem Durchlauf geaenderten Dateien: bestanden.

## P0: blockiert Release

### P0-1: WebSocket-Upgrades pruefen `Origin` nicht

Betroffen:

- `apps/api/src/modules/gateway/websocket.ts:18-23`
- `apps/api/src/modules/messages/websocket.ts:52-84`
- `apps/api/src/modules/messages/websocket.ts:87-104`
- `apps/api/src/modules/gateway/service.ts:183-191`

Status: behoben.

HTTP-Requests nutzen eine CORS-Allowlist und CSRF-Origin-Pruefung, WebSocket-Upgrades aber nicht.
Gateway und Legacy-Message-WebSocket akzeptieren Upgrades anhand des Pfads und authentifizieren
dann Cookie/Bearer-Token, ohne `Origin` gegen `CORS_ALLOWED_ORIGINS` zu validieren. Der Gateway
akzeptiert zudem `sessionToken` im `IDENTIFY`-Payload.

Risiko:

Ein fremder Origin kann versuchen, eine WebSocket-Verbindung mit vorhandenen Browser-Cookies zu
oeffnen. Je nach Browser-/SameSite-/Deployment-Konfiguration kann das zu Cross-Site WebSocket
Hijacking fuehren. Betroffen waeren Presence, Workspace-Metadaten im `READY`-Payload und
channel-scoped Events. Das ist eine direkte Umgehung der HTTP-CSRF/CORS-Haertung.

Erwartung:

Alle WebSocket-Upgrades muessen dieselbe Origin-Allowlist wie HTTP verwenden. Cookie-basierte
Gateway-Authentifizierung darf nur fuer erlaubte Origins akzeptiert werden. Ein Test muss
untrusted `Origin` fuer Gateway und Message-WebSocket ablehnen.

### P0-2: Message Edit kann ohne `VIEW_CHANNEL` moeglich sein

Betroffen:

- `apps/api/src/modules/messages/service.ts:175-190`

Status: behoben.

`createMessage`, `listMessages` und `deleteMessage` pruefen explizit `VIEW_CHANNEL`. `updateMessage`
prueft nur `EDIT_OWN_MESSAGES` und die Autorenschaft. Wenn ein User die Nachricht-ID kennt und
ueber Workspace-/Rollenrechte `EDIT_OWN_MESSAGES` hat, ein Channel Override aber `VIEW_CHANNEL`
denied, wird die Sichtbarkeit beim Edit nicht erneut erzwungen.

Risiko:

Private-Channel-Isolation ist inkonsistent. Ein nicht mehr sichtbarer eigener Beitrag in einem
privaten Channel kann weiterhin veraendert und ein `MESSAGE_UPDATE`-Event ausgeloest werden. Das
ist ein serverseitiger Permission-Bypass und widerspricht der Vorgabe, dass nicht sichtbare
Channels keine nutzbare Daten-/Aktionsflaeche bieten duerfen.

Erwartung:

`updateMessage` muss vor der Mutation `VIEW_CHANNEL` fuer den Message-Channel pruefen. Ein Test
muss belegen, dass ein User mit `EDIT_OWN_MESSAGES`, aber ohne `VIEW_CHANNEL`, `403` erhaelt.

### P0-3: Ausfuehrbares Compose nutzt vorhersehbare Default-Secrets

Betroffen:

- `infra/docker-compose.yml:19-39`
- `infra/docker-compose.yml:66-72`
- `infra/docker-compose.yml:103-113`
- `infra/livekit.yaml:14-15`

Status: behoben.

Die produktnahe Compose-Datei ist direkt lauffaehig und setzt fuer Sessions, CSRF, Passwort-Pepper,
TURN, LiveKit, PostgreSQL und Grafana statische Fallback-Werte. `infra/livekit.yaml` enthaelt dazu
eine konkrete `devkey`-Zuordnung mit vorhersehbarem Secret.

Risiko:

Ein Self-Hoster kann den Release-Stack ohne echte Secrets starten. Dann sind Session-HMAC,
CSRF-HMAC, TURN REST Credentials und LiveKit Tokens mit oeffentlich bekannten Werten ableitbar
oder missbrauchbar. Das ist kein versehentlich geleaktes produktives Secret, aber ein
release-blockierender Security-Default.

Erwartung:

Der produktnahe Compose-Pfad darf fuer sicherheitskritische Werte keine stillen Fallback-Secrets
haben. Entweder muss Compose bei fehlenden Secrets hart fehlschlagen oder klar in eine getrennte
Development-Datei ausgelagert werden. Tests/Checks sollten verhindern, dass bekannte Platzhalter in
der releasefaehigen Compose-Konfiguration als effektive Runtime-Werte landen.

## P1: muss vor Closed Beta behoben werden

### P1-1: Voice-Moderation prueft Aktionsrechte, aber nicht immer `VIEW_CHANNEL`

Status: behoben.

Betroffen:

- `apps/api/src/modules/voice/service.ts:295-333`
- `apps/api/src/modules/voice/service.ts:367-379`
- `apps/api/src/modules/voice/service.ts:418-427`

Voice Move, Disconnect, Server Mute und Server Deafen pruefen die jeweilige Moderationspermission
auf dem aktuellen Channel. Sie erzwingen aber nicht konsequent, dass der Actor den betroffenen
Channel auch sehen darf. Da Channel Overrides einzelne Rechte unabhaengig von `VIEW_CHANNEL`
veraendern koennen, ist das eine aehnliche Inkonsistenz wie bei Message Edit.

Risiko:

Ein User mit geerbten Moderationsrechten kann bei speziellen Override-Kombinationen Voice-Aktionen
in einem fuer ihn unsichtbaren Channel ausfuehren oder zumindest aus Fehlverhalten Rueckschluesse
auf aktive Voice States ziehen.

Erwartung:

Channel-scoped Voice-Moderation sollte fuer Actor und Zielkontext klare Sichtbarkeitschecks
erzwingen. Tests muessen `VIEW_CHANNEL`-Deny plus verbleibende Moderationspermission abdecken.

### P1-2: WebSocket-Rate-Limits fehlen

Status: behoben.

Betroffen:

- `apps/api/src/modules/gateway/service.ts`
- `apps/api/src/modules/messages/websocket.ts`

HTTP hat requestweite Rate Limits. Gateway-Frames, `IDENTIFY`, `PRESENCE_UPDATE`, Heartbeats und
Legacy-Message-WebSocket-Upgrades sind nicht rate-limitiert.

Risiko:

Ein authentifizierter Client kann Presence-Updates, fehlerhafte Payloads oder Verbindungsversuche
in hoher Frequenz erzeugen. Das kann Event-Loop, Presence Store und PubSub belasten.

Erwartung:

Connection-, Identify- und Frame-Rate-Limits pro IP/User/Session ergaenzen und testen.

### P1-3: Rate-Limit-Key vertraut `x-forwarded-for` ungeprueft

Status: behoben.

Betroffen:

- `apps/api/src/http/request-rate-limit.ts:96-103`

Der Rate-Limit-Key nutzt `x-forwarded-for`, wenn vorhanden. Ohne Trusted-Proxy-Konfiguration kann
ein direkt erreichbarer Client diesen Header selbst setzen und Limits umgehen.

Risiko:

Login/Register/TURN/Voice/API-Limits sind bei direkter Exponierung spoofbar.

Erwartung:

Nur hinter explizit konfigurierten Trusted Proxies `x-forwarded-for` akzeptieren; sonst Remote-IP
des Sockets verwenden. Tests fuer gespoofte Header ergaenzen.

### P1-4: TURN-Credentials sind nur global authentifiziert

Status: behoben.

Betroffen:

- `apps/api/src/http/app.ts:186-194`
- `apps/api/src/modules/turn/credentials.ts:26-55`

`GET /api/v1/turn/credentials` gibt jedem authentifizierten User TURN REST Credentials. Es gibt
keinen Workspace-/Channel-Kontext und keine Pruefung, ob der User aktuell Voice nutzen darf.

Risiko:

Jedes Konto kann den TURN-Dienst als Relay-Resource beanspruchen, auch ohne Workspace oder Voice
Channel. Das ist kein Private-Channel-Leak, aber ein Missbrauchs- und Kosten-/Kapazitaetsrisiko.

Erwartung:

Entweder den globalen ICE-Endpunkt auf aktive Voice-Flows beschraenken oder separate strengere
Limits/Quotas und Monitoring fuer TURN-Credential-Issuance einziehen.

### P1-5: Aktive coturn-Compose-Konfiguration blockiert private Peer-Netze nicht

Status: behoben.

Betroffen:

- `infra/docker-compose.yml:103-121`
- Positivbeispiel: `infra/turnserver.example.conf`

Die Beispielkonfiguration enthaelt `denied-peer-ip`-Regeln fuer private Netze. Die aktive
Compose-Konfiguration enthaelt diese Regeln nicht.

Risiko:

Bei public erreichbarem TURN kann Relay-Verkehr in interne/private Zielnetze moeglich werden, je
nach Netzwerkumgebung und coturn-Verhalten.

Erwartung:

Die aktive Compose-Konfiguration sollte die privaten/multicast Zielbereiche analog zur
Example-Config blockieren oder das Produktionsprofil muss zwingend auf die gehärtete Datei
verweisen.

### P1-6: Audit Log speichert kein IP-Hash/Kuerzung trotz Datenmodellfeld

Status: behoben.

Betroffen:

- `apps/api/src/db/postgres-repository.ts:1243-1246`
- `apps/api/src/db/postgres-repository.ts:1433-1436`

Alle Audit-Log-Inserts setzen `ip_hash` auf `null`. Das Feld existiert und die Security-Doku
fordert gehashte oder gekuerzte IP-Adressen.

Risiko:

Forensische Nachvollziehbarkeit fuer sicherheitsrelevante Aktionen ist eingeschraenkt. Gleichzeitig
ist das Datenschutzkonzept nicht technisch umgesetzt.

Erwartung:

Request-IP datenschutzkonform hashen oder kuerzen, Salt/Secret nicht ins Repo, und Audit-Writer
testen. Alternativ fuer rc1 bewusst dokumentieren, dass IP-Erfassung deaktiviert ist.

### P1-7: Auth- und Permission-Tests decken relevante Edge-Cases nicht ab

Status: behoben fuer die P0/P1-Security-Regressionen aus diesem Audit.

Fehlende Tests:

- WebSocket-Upgrades mit untrusted `Origin`.
- Message Edit bei `VIEW_CHANNEL`-Deny.
- Voice-Moderation bei `VIEW_CHANNEL`-Deny.
- Gespooftes `x-forwarded-for` gegen Rate Limits.
- TURN Credential Endpoint ohne Workspace/Voice-Kontext.
- Echte PostgreSQL-Migration gegen frische DB und zweiter idempotenter Lauf.
- Produktionsnahe Compose-Config ohne Platzhalter-Secrets.

Risiko:

Die aktuell gruenen 55 Tests decken viele Phase-Flows ab, aber nicht die sicherheitskritischen
Regressionen aus diesem Audit.

## P2: kann nach v0.1.0 behoben werden

### P2-1: Argon2id-Parameter sind funktional, aber nicht dokumentiert begruendet

Betroffen:

- `apps/api/src/security/password.ts:15-21`

Argon2id wird korrekt verwendet. Die Parameter `memoryCost=19456`, `timeCost=2`,
`parallelism=1` sind aber nicht in `docs/decision-log.md` gegen Zielhardware/Latency-Budget
begruendet.

Risiko:

Parameter koennen fuer produktive Hardware zu schwach oder fuer kleine Hosts zu teuer sein, ohne
dass eine bewusste Kalibrierung dokumentiert ist.

Erwartung:

Kalibrierung dokumentieren und optional konfigurierbar machen.

### P2-2: Migrationen haben keine Rollback-Strategie

Betroffen:

- `migrations/*.sql`

Migrationen sind vorwaertsgerichtet und werden ueber `schema_migrations` getrackt. Es gibt keine
Down-Migrations oder dokumentierte Rollback-Strategie.

Risiko:

Fehlerhafte Deployments sind schwerer zurueckzunehmen.

Erwartung:

Rollback-Runbook oder Down-Migration-Konzept fuer Beta/Produktivbetrieb dokumentieren.

### P2-3: Infrastruktur-Images sind nicht versionsgepinnt

Betroffen:

- `infra/docker-compose.yml`

`coturn/coturn:latest`, `livekit/livekit-server:latest`, `prom/prometheus:latest` und
`grafana/grafana-oss:latest` sind nicht reproduzierbar.

Risiko:

Spaetere Deployments koennen sich ohne Codeaenderung anders verhalten.

Erwartung:

Images pinnen, Renovate/Update-Prozess oder manuelles Update-Runbook dokumentieren.

### P2-4: Gateway Resume ist Grundlage, aber kein Event Replay

Betroffen:

- `apps/api/src/modules/gateway/service.ts:200-213`

Resume Token und Sequenz werden verwaltet, aber Events werden nicht replayed.

Risiko:

Nach Verbindungsabbruechen koennen Clients Events verlieren und muessen voll neu synchronisieren.

Erwartung:

Als bekannte rc1-Einschraenkung dokumentieren; spaeter Event Replay oder deterministische
Resync-Flows umsetzen.

## Positive Befunde

- Passwort-Hashing nutzt Argon2id mit Pepper.
- Session-Tokens und CSRF-Tokens werden zufaellig erzeugt und nur gehasht gespeichert.
- Session-Cookie ist `HttpOnly`, `SameSite=Lax` und `Secure` ist konfigurierbar.
- Cookie-authentifizierte unsafe HTTP-Requests erzwingen CSRF-Token und Origin/Referer-Allowlist.
- Permission Engine ist zentral, bitbasiert und hat Unit Tests fuer Owner, Administrator,
  Overrides und Vererbung.
- Channel Tree API filtert nicht sichtbare Channels vor dem Response.
- Voice Join prueft `VIEW_CHANNEL` und `CONNECT_VOICE` serverseitig.
- LiveKit-Token Claims beschraenken Publish-Sources auf die serverseitig berechneten Rechte.
- TURN Credentials sind kurzlebig und geben das Shared Secret nicht an den Client.
- Message Content wird serverseitig sanitisiert; Raw HTML wird escaped.
- License Check und Vulnerability Audit zeigen aktuell keine bekannten Dependency-Blocker.

## Release-Empfehlung

Die P0-Funde und die fuer Closed Beta relevanten P1-Security-Funde aus diesem Audit sind behoben
und durch Regressionstests abgedeckt. Offene Punkte fuer nachgelagerte Stabilisierung stehen unter
P2, insbesondere Argon2id-Kalibrierung, Rollback-Runbook, Image-Pinning und Gateway-Event-Replay.
