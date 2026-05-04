# PLANS.md

## Ziel

OpenVoice wird phasenweise aus dem Lastenheft in `docs/lastenheft.md` umgesetzt.

Codex soll immer kleine, prüfbare Schritte bauen und nicht mehrere Phasen unkontrolliert vermischen.

---

## Phase 0: Repository-Fundament

Ziel: Monorepo und Entwicklungsgrundlage.

Aufgaben:

- Monorepo einrichten.
- Package Manager festlegen, bevorzugt pnpm.
- TypeScript einrichten.
- Linting einrichten.
- Formatting einrichten.
- Test-Framework einrichten.
- Docker Compose Grundstruktur anlegen.
- Ordnerstruktur gemäß Lastenheft erstellen.
- `packages/shared` für gemeinsame Typen anlegen.
- `.env.example` anlegen.
- Grundlegende README ergänzen.

Akzeptanz:

- `pnpm install` funktioniert.
- `pnpm lint` funktioniert.
- `pnpm test` funktioniert.
- `pnpm build` funktioniert oder ist als Platzhalter sauber definiert.
- Docker Compose startet mindestens PostgreSQL und Redis/Valkey.

---

## Phase 1: Auth, User, Workspace, Rollen

Ziel: Solides Backend-Fundament.

Aufgaben:

- User-Modell.
- Registrierung.
- Login.
- Logout.
- Session-Modell.
- Passwort-Hashing mit Argon2id.
- Workspace-Modell.
- Workspace erstellen.
- Workspace-Member-Modell.
- Rollenmodell.
- Default-Rollen.
- Permission-Bitset.
- Permission Engine.
- Audit-Log-Basis.

Akzeptanz:

- User kann sich registrieren und anmelden.
- User kann Workspace erstellen.
- Owner wird korrekt gesetzt.
- Default-Rolle wird angelegt.
- Permission Engine hat ausführliche Unit Tests.
- Audit-Log kann Einträge schreiben.

---

## Phase 2: Channel-Baum und Rechte-Overrides

Ziel: Discord-ähnliche Channel-Struktur.

Aufgaben:

- Channel Node Modell.
- Channel-Typen: Category, Text, Voice, Combined.
- Parent/Child-Struktur.
- Max Tiefe 5.
- Sortierung über `position`.
- Reorder Endpoint.
- Permission Overrides für Rollen.
- Permission Overrides für Member.
- Effektive Rechte pro Channel berechnen.
- Frontend-Ansicht für Channel Tree.

Akzeptanz:

- Kategorien und Channels können erstellt werden.
- Channels können verschoben werden.
- Zyklen werden serverseitig verhindert.
- Nicht sichtbare Channels werden nicht ausgeliefert.
- Rechte werden in API und UI korrekt berücksichtigt.

---

## Phase 3: Persistenter Chat

Ziel: Textchat in Text- und Combined-Channels.

Aufgaben:

- Message-Modell.
- Message Create.
- Message Edit.
- Message Soft Delete.
- Cursor Pagination.
- WebSocket Event `MESSAGE_CREATE`.
- WebSocket Event `MESSAGE_UPDATE`.
- WebSocket Event `MESSAGE_DELETE`.
- Markdown-Subset.
- Sanitizing/Escaping.
- Rate Limits.
- Chat UI.

Akzeptanz:

- User mit Recht kann schreiben.
- User ohne Recht bekommt 403.
- Nachrichten erscheinen live.
- History funktioniert cursorbasiert.
- Deletes sind Soft Deletes.
- Message-Rechte sind getestet.

---

## Phase 4: WebSocket Gateway und Presence

Ziel: Realtime-Grundlage.

Aufgaben:

- Gateway Endpoint.
- HELLO/IDENTIFY/READY.
- Heartbeat.
- Resume-Grundlage.
- Presence Status.
- Workspace Event Dispatch.
- Channel Event Dispatch.
- Permission Update Events.
- Redis/Valkey PubSub.

Akzeptanz:

- Mehrere Browser sehen Events live.
- Disconnect wird erkannt.
- Presence leakt keine privaten Channels.
- Gateway kann horizontal vorbereitet werden.

---

## Phase 5: Voice MVP

Ziel: Voice Channel mit WebRTC und SFU.

Aufgaben:

- MediaProvider Interface.
- LiveKit Provider implementieren.
- Voice Join Endpoint.
- Voice Leave Endpoint.
- Voice State Modell.
- SFU Join Token erzeugen.
- coturn in Docker Compose ergänzen.
- TURN REST Credentials erzeugen.
- ICE Server Endpoint.
- Client verbindet zu Voice Room.
- Self Mute.
- Self Deafen.
- Server Mute.
- Server Deafen.
- Speaking Indicator.

Akzeptanz:

- Zwei Browser können einem Voice Channel beitreten.
- Audio funktioniert.
- Mute/Deafen funktionieren.
- Server Mute erzwingt Zustand.
- TURN Credentials sind kurzlebig.
- Keine statischen TURN-Secrets im Frontend.
- Voice Join prüft Rechte serverseitig.

---

## Phase 6: Kamera und Screenshare

Ziel: Video, Kamera und Screenshare.

Aufgaben:

- Kamera aktivieren/deaktivieren.
- Kamera Preview.
- Screenshare über Browser API.
- Screenshare Preview.
- Screen Stop Handling.
- Qualitätsprofile 720p, 1080p, 1440p, 4K.
- 4K-Profil nur bei Permission `SHARE_SCREEN_4K`.
- Adaptive Subscription.
- Video Grid.
- Focus View.

Akzeptanz:

- Kamera funktioniert.
- Screenshare funktioniert.
- 4K-Profil wird angefragt.
- Bei schlechter Verbindung wird degradiert.
- Audio bleibt priorisiert.
- Nicht sichtbare Streams werden nicht unnötig hoch abonniert.

---

## Phase 7: Moderation

Ziel: Nutzbare Admin- und Moderationsfunktionen.

Aufgaben:

- Kick.
- Ban.
- Unban.
- Timeout.
- Move Voice Member.
- Disconnect Voice Member.
- Mute Member.
- Deafen Member.
- Audit Log UI.
- Role Hierarchy Checks.

Akzeptanz:

- Moderatoren können nur erlaubte Aktionen ausführen.
- Owner ist geschützt.
- Alle Aktionen erzeugen Audit Logs.
- Gesperrte Nutzer können nicht über Invite wieder beitreten.

---

## Phase 8: Observability und Betrieb

Ziel: Produktionsnahe Betriebsfähigkeit.

Aufgaben:

- Prometheus Metriken.
- Grafana Dashboards.
- Health Checks.
- Readiness Checks.
- WebRTC Stats Collection.
- TURN Metrics.
- SFU Metrics.
- Gateway Metrics.
- Error Logging.
- Docker Compose finalisieren.

Akzeptanz:

- System Health ist sichtbar.
- Voice Quality ist sichtbar.
- TURN Relay Ratio ist sichtbar.
- Voice Join Failures sind sichtbar.
- Alerts sind dokumentiert.

---

## Phase 9: Hardening

Ziel: Sicherheit, Stabilität, Cleanup.

Aufgaben:

- CSP.
- CSRF.
- CORS.
- Secure Cookies.
- Rate Limits vervollständigen.
- Dependency License Check.
- Security Headers.
- Backup/Restore Doku.
- Datenschutz-Retention dokumentieren.
- E2E Testmatrix dokumentieren.

Akzeptanz:

- Keine bekannten kritischen Sicherheitslücken.
- Keine Secrets im Repo.
- Basis-E2E-Flows laufen.
- Deployment ist dokumentiert.
