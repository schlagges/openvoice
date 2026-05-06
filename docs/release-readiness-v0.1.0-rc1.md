# OpenVoice v0.1.0-rc1 Release Readiness

Datum: 2026-05-05

Status: **releasefaehig als API-/Backend-RC nach P0-Scope-Klaerung und Security-P0-Fixes**.

Dieser Report bewertet den Stand von `main` im Release-Candidate-Modus. Der rc1-Scope ist bewusst
auf API, Backend, lokale Infrastruktur und Security-Stabilisierung begrenzt. Eine voll nutzbare
Produkt-UI ist nicht Bestandteil von `v0.1.0-rc1`.

## Pruefgrundlage

Gelesene Vorgaben:

- `AGENTS.md`
- `PLANS.md`
- `docs/lastenheft.md`
- `docs/testing.md`
- `docs/security.md`
- `docs/rtc.md`
- `docs/deployment.md`
- `docs/observability.md`

Ausgefuehrte Checks:

- `pnpm install --frozen-lockfile`: bestanden.
- `pnpm lint`: bestanden.
- `pnpm test`: bestanden, 17 Testdateien, 72 Tests.
- `pnpm build`: bestanden.
- `pnpm format:check`: aktuell mit bereits bestehenden Formatwarnungen in mehreren
  Arbeitsbaum-Dateien fehlgeschlagen; die in diesem Durchlauf geaenderten Dateien bestehen einen
  gezielten Prettier-Check.
- `pnpm license:check`: bestanden, 214 Package-Manifeste geprueft.
- `pnpm audit`: bestanden mit Netzwerkzugriff, keine bekannten Vulnerabilities.
- `docker compose -f infra/docker-compose.yml config` mit expliziten Dummy-Secrets: bestanden.

Zusaetzlich wurde der laufende Phase-9-Stack manuell/API-seitig geprüft:

- Register, `/me`, Workspace Create.
- Channel Create, Message Create, Duplicate-Erkennung, History, Edit, Soft Delete.
- Channel Tree, Audit Log.
- CSRF-Origin-Block fuer fremden Origin.
- CORS Preflight fuer erlaubten Origin.
- Security Headers.
- `/readyz`, `/metrics`, Prometheus und Grafana Health.

## Gesamtbewertung

Der technische Backend-Kern ist fuer viele Phase-0-bis-Phase-9-Anforderungen vorhanden und die
lokalen Unit-/Integration-Checks sind gruen. `v0.1.0-rc1` ist explizit ein API-/Backend-RC. Damit
blockieren fehlende Produkt-UI, Playwright-UI-E2E und nicht vollstaendig dokumentierte manuelle
RTC-Medientests diesen RC nicht mehr als P0. Diese Punkte bleiben P1-Gates fuer Closed Beta oder
einen nutzbaren Browser-RC.

Die wichtigsten Einschraenkungen sind:

- Keine UI fuer Registrierung, Login, Workspace-Auswahl/-Erstellung, Channel-Erstellung oder
  vollstaendige Workspace-/Rollen-/Channel-Verwaltung. Ein technischer Schnellstart fuer lokale
  Browser-Tests ist vorhanden.
- Keine automatisierten Playwright-E2E-Tests fuer die geforderten UI-Kernfluesse.
- Keine dokumentiert bestandenen manuellen WebRTC-/TURN-/SFU-Medientests fuer Audio, Kamera,
  Screenshare, 4K und TURN-Fallback.
- Deployment ist lokal lauffaehig, aber produktionsnahe Anforderungen wie TLS/Reverse Proxy,
  echte Secret-Verwaltung, Backup-Restore-Test und SFU/TURN-Kapazitaet sind nicht verifiziert.

## Lastenheft-Anforderungen

### Erfuellt

| Bereich                                                                      | Bewertung                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------- |
| Monorepo, pnpm, TypeScript, Lint, Format, Tests, Build                       | Erfuellt.                                      |
| PostgreSQL Datenmodell fuer Phasen 1-7                                       | Erfuellt fuer vorhandene Tabellen/Migrationen. |
| Valkey/Redis-kompatible Grundlage                                            | Erfuellt fuer PubSub/Presence-Grundlage.       |
| Argon2id Passwort-Hashing                                                    | Erfuellt.                                      |
| Session-Cookie mit HttpOnly/SameSite und konfigurierbarem Secure Flag        | Erfuellt.                                      |
| CSRF-Schutz fuer cookie-authentifizierte unsafe Requests                     | Erfuellt.                                      |
| Permission-Bitset und zentrale Permission Engine                             | Erfuellt, mit Unit Tests.                      |
| Channel-Baum mit Typen, Tiefe, Sortierung, Reorder und Overrides             | Backend-seitig erfuellt.                       |
| Persistenter Chat mit Create/Edit/Soft Delete/Pagination/Duplicate-Schutz    | Backend-seitig erfuellt.                       |
| Gateway-Grundlage mit HELLO/IDENTIFY/READY/Heartbeat/Presence/PubSub         | Backend-seitig erfuellt.                       |
| SFU-Abstraktion und LiveKit Provider                                         | Erfuellt.                                      |
| coturn im Docker Compose und kurzlebige TURN Credentials                     | Erfuellt.                                      |
| Kamera-/Screenshare-Profile inklusive 4K-Rechtepruefung                      | API/Client-Helfer vorhanden.                   |
| Moderation Kick/Ban/Unban/Timeout/Voice Moderation, Rollen-Hierarchie, Audit | Backend-seitig erfuellt.                       |
| Prometheus/Grafana/Health/Readiness/Metrics                                  | Erfuellt fuer lokalen Compose-Stack.           |
| Security Headers, CORS Allowlist, HSTS-Konfiguration                         | Erfuellt.                                      |
| License Check und Third-Party-Notices                                        | Erfuellt.                                      |
| Backup/Restore-, Retention- und E2E-Testmatrix-Doku                          | Erfuellt als Dokumentation.                    |

### Teilweise Erfuellt

| Bereich                           | Bewertung                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browserbasierter Nutzerfluss      | Teilweise. Web-App rendert Shell/Chat/Voice/Audit und bietet einen technischen Schnellstart, aber keine vollstaendige Produkt-Auth-/Workspace-Verwaltung.     |
| Chat senden/empfangen im Browser  | Teilweise. API funktioniert; UI-Komposer kann senden, ist aber noch nicht per E2E gegen Gateway/Mehrbrowser-Flows abgesichert.                                |
| Channel Tree im UI                | Teilweise. Rendering-Komponente existiert, aber keine API-Ladung oder Bedienung.                                                                              |
| Voice Join/Mute/Deafen im Browser | Teilweise. Client-Code und UI-Bedienung existieren; reale Mehrbrowser-/Netzwerk-Akzeptanz muss weiter dokumentiert werden.                                    |
| Kamera/Screenshare/4K             | Teilweise. Client- und API-Grundlagen existieren, aber keine dokumentiert bestandenen manuellen Browser-Media-Tests im aktuellen RC-Stack.                    |
| Realtime Events                   | Teilweise. Gateway und Message-Events sind getestet, aber keine Browser-E2E-Flows.                                                                            |
| Observability                     | Teilweise. Basis-Dashboards/Metriken vorhanden; SFU-CPU, TURN Allocation Failure, DB-Slow-Query und echte RTC-Qualitaetsdaten sind noch nicht voll abgedeckt. |
| Deployment                        | Teilweise. Lokales Compose funktioniert; produktionsnaher Betrieb ist dokumentiert, aber nicht als Release-Runbook verifiziert.                               |
| Datenschutz/Retention             | Teilweise. Dokumentiert, aber keine automatische Retention/Pseudonymisierung implementiert.                                                                   |

### Nicht Erfuellt

| Bereich                                                              | Bewertung                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Passwort-Reset Endpunkte aus Lastenheft/API-Doku                     | Nicht implementiert.                                                   |
| Invite-System                                                        | Nicht implementiert.                                                   |
| Workspace CRUD vollstaendig (`GET/PATCH/DELETE`, Members-Liste)      | Nicht implementiert.                                                   |
| Rollen-CRUD und Rollen-Zuweisung API                                 | Nicht implementiert, abseits Default-Rollen und interner Datenmodelle. |
| Channel `GET/PATCH/DELETE`                                           | Nicht implementiert.                                                   |
| UI fuer Auth, Workspace, Channel, Rollen, Permissions, Moderation    | Nicht implementiert oder nur Skeleton.                                 |
| Automatisierte Playwright-E2E-Tests                                  | Nicht vorhanden.                                                       |
| Produktive TLS-/Reverse-Proxy-Konfiguration inklusive HTTPS Redirect | Nicht implementiert.                                                   |
| Produktive Backup-Automatisierung und dokumentierter Restore-Test    | Nicht verifiziert.                                                     |
| SFU-Reconnect und Media-Qualitaets-Akzeptanzziele                    | Nicht verifiziert.                                                     |
| TURN UDP/TCP/TLS-Fallback-Tests in restriktiven Netzwerken           | Nicht verifiziert.                                                     |

## Kritische Risiken

| Prioritaet | Risiko                                                                  | Auswirkung                                                                         |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1         | UI hat keinen Auth-/Workspace-/Channel-Nutzerfluss.                     | Browser-RC fuer nicht-technische Tester ist nicht sinnvoll nutzbar.                |
| P1         | Keine automatisierten E2E-Tests fuer Lastenheft-Akzeptanzfluesse.       | Regressionen in zentralen Nutzerflows werden nicht erkannt.                        |
| P1         | Keine bestandenen manuellen RTC-/TURN-/SFU-Akzeptanztests dokumentiert. | Voice/Video/Screenshare koennen trotz gruenem Build im Browser/Netzwerk scheitern. |
| P1         | API-Doku listet rc1-nicht-implementierte Endpunkte, aber markiert sie.  | Integratoren muessen die rc1-Einschraenkungen beachten.                            |
| P2         | Lokale In-Memory Rate Limits sind nicht clusterweit.                    | Fuer Multi-Instanz-Betrieb muessen Limits nach Redis/Valkey wandern.               |
| P1         | Compose nutzt weiterhin `latest` Images fuer Infrastruktur.             | Produktionsdeployments sind nicht voll reproduzierbar.                             |

## Fehlende Tests

P0:

- Keine offenen P0-Tests fuer den API-/Backend-RC-Scope. Die Security-P0-Regressionen sind in
  `apps/api/tests/api-phase3.test.ts`, `apps/api/tests/api-phase4.test.ts` und
  `apps/api/tests/api-phase9.test.ts` abgedeckt.

P1:

- Playwright E2E: Registrierung, Login, Logout.
- Playwright E2E: Workspace erstellen, Channel erstellen, Channel Tree anzeigen.
- Playwright E2E: Nachricht senden, History laden, Edit/Delete.
- Playwright E2E: Rechte verweigern, mindestens `VIEW_CHANNEL`, `SEND_MESSAGES`,
  `CONNECT_VOICE`.
- Manuelle RTC-Matrix fuer zwei Browser: Voice Join, Audio, Self Mute, Self Deafen, Server Mute,
  Server Deafen.
- TURN UDP/TCP/TLS-Fallback-Test in restriktiver Netzwerkumgebung.
- PostgreSQL-Migrationstest gegen frische DB und gegen bereits migrierte DB.
- Restore-Test nach `docs/backup-restore.md`.
- Gateway-Resume-Verhalten und Reconnect nach Netzwechsel.
- Kamera 720p/1080p und Screenshare 1080p/4K manuell mit Dokumentation.
- CORS/CSRF/Security-Headers als E2E oder Integration auf produktionsnaher Origin-Konfiguration.

P2:

- Load-/Soak-Tests fuer Gateway, Chat, Voice Join und Metrics.
- Prometheus Alert-Regeltests.
- Accessibility Checks fuer UI-Shell und spaetere Forms.

## Security-Risiken

- `SESSION_COOKIE_SECURE=false` in `.env.example` ist fuer lokale Entwicklung korrekt, aber fuer
  Release-Betrieb muss die produktive Konfiguration zwingend `true` sein.
- HSTS ist nur optional ueber `ENABLE_HSTS=true`; produktiver Reverse Proxy/TLS ist nicht
  umgesetzt.
- API-CORS/CSRF ist vorhanden, aber UI-Auth fehlt; echte Browser-E2E-Abdeckung fehlt.
- Passwort-Reset ist in Lastenheft/API-Doku aufgefuehrt, aber in `docs/api.md` als nicht in
  `v0.1.0-rc1` markiert.
- In-Memory Rate Limits sind fuer Single-Node-Compose ausreichend, aber nicht horizontal sicher.
- `x-forwarded-for` wird nur hinter explizit konfigurierten `TRUSTED_PROXY_IPS` akzeptiert.
- Audit-Logs koennen Request-IPs per `AUDIT_IP_HASH_SECRET` als HMAC-SHA256-Hash speichern.
- Keine automatische Retention/Pseudonymisierung fuer geloeschte Nutzer/Audit/IP-Daten.
- Secret-Pflichtwerte sind dokumentiert; ein externes Secret-Management-Verfahren bleibt
  deploymentspezifisch.

## WebRTC-/TURN-/SFU-Risiken

- LiveKit und coturn starten lokal, aber echte Browser-Medienfluesse sind nicht automatisiert und
  nicht als bestanden dokumentiert.
- TURN REST Credentials sind an aktive Voice-Sessions gebunden; TURN-only und TCP/TLS-Fallback
  wurden nicht im aktuellen RC-Stack verifiziert.
- TURNS erfordert produktive Zertifikate; Compose hat keine produktive Zertifikatsverdrahtung.
- SFU-Kapazitaet, CPU, Drain/Restart-Verhalten und Reconnect sind nicht benchmarked.
- 4K-Screenshare kann angefragt werden, aber Akzeptanzwerte fuer 4K-Display/Netz/GPU sind nicht
  manuell belegt.
- RTC-Stats werden aggregiert ingestiert, aber echte Client-Samples und Dashboard-Aussagekraft
  brauchen laengere manuelle Tests.

## Deployment-Risiken

- `docs/deployment.md` ist fuer rc1-Compose, Secret-Pflichtwerte, `TRUSTED_PROXY_IPS` und
  `AUDIT_IP_HASH_SECRET` aktualisiert.
- Compose nutzt mehrere `latest` Images (`coturn/coturn`, `livekit/livekit-server`,
  `prom/prometheus`, `grafana/grafana-oss`) und ist damit nicht voll reproduzierbar.
- Host-Reverse-Proxy fuer `voice.schnick-schnack.info` und die Temp-Domain
  `schnick-schnack.info.w00ac711.kasserver.com` ist dokumentiert, aber TLS,
  `X-Forwarded-Proto`, LiveKit-WebSocket-Forwarding und TURN-Portfreigaben muessen auf dem Host
  final gesetzt und getestet werden.
- Keine CI-Pipeline im Repo ersichtlich, die Checks, License Check, Audit und Docker Build
  erzwingt.
- Backup/Restore ist dokumentiert, aber nicht automatisiert und nicht als erfolgreich getestet.
- Grafana Default-Credentials sind lokale Platzhalter; produktive Secret-Injektion muss extern
  erfolgen.

## Datenbank-/Migration-Risiken

- Migration Runner existiert und laeuft im API-Container vor Serverstart.
- Migrationen sind SQL-Dateien und werden ueber `schema_migrations` getrackt.
- Es gibt keinen automatisierten Integrationstest, der Migrationen gegen eine echte PostgreSQL-DB
  frisch und idempotent ausfuehrt.
- Es gibt keine Down-Migrations oder dokumentierte Rollback-Strategie.
- Invite-Tabelle aus Lastenheft fehlt, weil Invite-System nicht implementiert ist.
- Datenretention/Pseudonymisierung ist dokumentiert, aber nicht technisch durchgesetzt.

## Fix-Liste

### P0

Keine offenen P0-Punkte fuer den API-/Backend-RC-Scope.

Erledigt:

1. Release-Scope explizit als API-/Backend-RC deklariert; UI-/Playwright-/manuelle RTC-Gates sind
   P1 fuer Closed Beta oder nutzbaren Browser-RC.
2. API-Doku fuer rc1 korrigiert: nicht implementierte Endpunkte sind als
   `(nicht in v0.1.0-rc1)` markiert.
3. Security-P0s aus `docs/audit/security-permissions-rtc-audit.md` sind behoben und getestet.
4. Doku-Regressionstest `apps/api/tests/docs-release.test.ts` ergaenzt, damit offene
   P0-Release-Gaps und unmarkierte rc1-API-Luecken nicht wieder eingefuehrt werden.
5. Closed-Beta-P1-Security-Funde aus `docs/audit/security-permissions-rtc-audit.md` sind behoben:
   Voice-Moderationssichtbarkeit, WebSocket-Rate-Limits, Trusted-Proxy-IP-Handling,
   TURN-Credential-Kontext, coturn private Peer Blocks, Audit-IP-Hash und Regressionstests.

### P1

1. Playwright-Basis-E2E einrichten und fuer Schnellstart, Auth, Workspace, Channel, Chat, Voice
   und Rechteverweigerung
   gruen machen.
2. Manuelle RTC-Release-Matrix ausfuehren und dokumentieren: zwei Browser Audio, Mute/Deafen,
   Server Mute/Deafen, Kamera, Screenshare, TURN UDP/TCP/TLS.
3. Host-Deployment fuer `voice.schnick-schnack.info` und
   `schnick-schnack.info.w00ac711.kasserver.com` final testen: TLS, HSTS, Secure Cookies,
   WebSocket-Upgrades, LiveKit, TURN UDP/TCP/TLS.
4. Rollen-/Permission-Verwaltungs-API und/oder klare Nichtverfuegbarkeit im rc1 dokumentieren.
5. Workspace/Channel CRUD-Luecken entweder implementieren oder fuer rc1 explizit ausschliessen.
6. Migrationstest gegen echte PostgreSQL-DB automatisieren.
7. Docker Images pinnen und produktionsnahe `.env`-/Secret-Runbook-Beispiele ergaenzen.
8. Restore-Test einmal gegen lokale Compose-DB ausfuehren und Ergebnis dokumentieren.
9. Security-Defaults fuer produktive Profile schaerfen: `SESSION_COOKIE_SECURE=true`,
   `ENABLE_HSTS=true`, enge `CORS_ALLOWED_ORIGINS`.

### P2

1. Gateway Resume/Reconnect vertiefen und Tests ergaenzen.
2. Redis/Valkey-gestuetzte Rate Limits fuer Horizontalbetrieb vorbereiten.
3. Observability um SFU-CPU, TURN Allocation Failures und DB-Metriken erweitern.
4. Load-/Soak-Tests fuer Gateway, Chat und Voice Join definieren.
5. Accessibility- und Responsive-Checks fuer die UI einfuehren.
6. Automatische Datenretention/Pseudonymisierung planen und testen.

## Release-Gate-Empfehlung

`v0.1.0-rc1` kann nur als **API-/Backend-RC ohne nutzbare Produkt-UI** geschnitten werden.

Wenn der RC fuer reale Nutzer oder nicht-technische Tester gedacht ist, ist der aktuelle Stand nicht
ausreichend. Wenn der RC nur fuer technische API-/Infrastruktur-Validierung gedacht ist, kann er mit
klarer Einschränkung und dokumentierten manuellen API-Testschritten als Vorab-RC betrachtet werden.
