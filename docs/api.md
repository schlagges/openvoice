# API Kurzreferenz

Die verbindliche API-Spezifikation steht in `docs/lastenheft.md`. Diese Datei ist eine kompakte Arbeitsreferenz für Codex.

---

## Konventionen

- Basis: `/api/v1`
- Format: JSON
- Auth: Secure HttpOnly Cookie oder Bearer Token
- Fehler: einheitliches Fehlerformat
- Zeiten: ISO 8601 UTC
- IDs: UUID oder ULID
- CORS: Allowlist-basiert ueber `CORS_ALLOWED_ORIGINS`
- CSRF: Cookie-authentifizierte unsafe Requests brauchen `x-openvoice-csrf-token`; vorhandene
  `Origin`/`Referer` muessen zur Allowlist passen

## v0.1.0-rc1 Scope

`v0.1.0-rc1` ist ein API-/Backend-Release-Candidate. Diese Kurzreferenz markiert Endpunkte, die im
aktuellen RC noch nicht implementiert sind, explizit mit `(nicht in v0.1.0-rc1)`.

---

## Fehlerformat

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Missing permission: CONNECT_VOICE",
    "requestId": "req_123",
    "details": {
      "permission": "CONNECT_VOICE"
    }
  }
}
```

---

## Auth

```http
GET  /api/v1/auth/config
GET  /api/v1/auth/oidc/login
GET  /api/v1/auth/oidc/callback
POST /api/v1/auth/oidc/link-start
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/password-reset/request (nicht in v0.1.0-rc1)
POST /api/v1/auth/password-reset/confirm (nicht in v0.1.0-rc1)
GET  /api/v1/me
```

`GET /auth/config` liefert die aktuelle Login-Konfiguration fuer das Frontend, inklusive
Keycloak/OIDC-Issuer und Client-ID. Fuer den geplanten Keycloak-Betrieb zeigt
`localPasswordAuthEnabled=false`, dass lokale E-Mail/Passwort-Registrierung und Login abgeschaltet
sind. Bis zur vollstaendigen OIDC- und Gast-Token-Migration bleiben lokale Passwort-Endpunkte fuer
Entwicklung und bestehende Tests aktivierbar.
`GET /auth/oidc/login` startet den Backend-OIDC-Flow mit PKCE und State-Cookie.
`GET /auth/oidc/callback` tauscht den Code gegen ein Keycloak-Token, verifiziert Signatur,
Issuer, Audience und Client-Rolle und setzt danach die OpenVoice-Session. `POST
/auth/oidc/link-start` startet denselben Flow aus einer bestehenden OpenVoice-Session heraus,
damit ein per Invite beigetretener Gast sein Keycloak-Konto verknuepfen kann.

## Observability

```http
GET  /healthz
GET  /readyz
GET  /metrics
POST /api/v1/rtc/stats
```

`/metrics` liefert Prometheus-Textformat. `POST /rtc/stats` benötigt Auth und CSRF, prüft
`VIEW_CHANNEL` serverseitig und akzeptiert aggregierte WebRTC-Quality-Samples ohne
clientseitig vertrauenswürdige User-ID.

---

## Workspaces

```http
POST   /api/v1/workspaces
GET    /api/v1/workspaces
POST   /api/v1/workspaces/:workspaceId/join-global
GET    /api/v1/workspaces/:workspaceId (nicht in v0.1.0-rc1)
PATCH  /api/v1/workspaces/:workspaceId (nicht in v0.1.0-rc1)
DELETE /api/v1/workspaces/:workspaceId (nicht in v0.1.0-rc1)
GET    /api/v1/workspaces/:workspaceId/members
GET    /api/v1/workspaces/:workspaceId/tree
GET    /api/v1/workspaces/:workspaceId/audit-log
POST   /api/v1/workspaces/:workspaceId/invites
POST   /api/v1/workspaces/:workspaceId/invites/keycloak
POST   /api/v1/invites/join
POST   /api/v1/invites/:code/guest-join
GET    /api/v1/keycloak/users/search?q=:query
```

`GET /workspaces` benötigt Auth und liefert nur Workspaces, in denen der aktuelle User Mitglied
ist. Jeder Workspace enthält `memberCount` für die sichtbare Workspace-Liste. Es gibt absichtlich
keine serverweite Workspace-Auflistung, damit private Workspace-Namen nicht an andere eingeloggte
User leaken.
Workspaces enthalten `accessMode` mit `private` oder `global_authenticated`.
`POST /workspaces/:workspaceId/join-global` benötigt einen registrierten, mit Keycloak verknüpften
User und weist die Default-Rolle `member` zu. Gäste dürfen globale Workspaces weder per Invite noch
per Join-Endpoint betreten.
`POST /workspaces` lehnt neue Workspaces ab, wenn der normalisierte Name bereits existiert.

`GET /audit-log` benötigt `VIEW_AUDIT_LOG` und liefert die neuesten Einträge mit `limit` 1-100.
`POST /workspaces/:workspaceId/invites` benötigt `MANAGE_INVITES` und gibt den Invite-Code nur
einmal im Response zurück. Gespeichert wird ausschließlich ein SHA-256-Hash des Codes. Invite-Codes
laufen standardmäßig nach 5 Minuten ab (`INVITE_TTL_SECONDS=300`).
`POST /workspaces/:workspaceId/invites/keycloak` erstellt denselben kurzlebigen Invite-Link,
adressiert ihn aber an einen Keycloak-User aus der serverseitigen Suche und verschickt ihn per
Slack-DM. Die Slack-/Keycloak-Credentials liegen ausschließlich in der Server-Umgebung.
`GET /keycloak/users/search` benötigt einen registrierten Keycloak-User und liefert Vorschläge aus
der Keycloak Admin API.
`POST /invites/join` benötigt Auth und CSRF, lehnt aktive Bans ab und weist die Default-Rolle
`member` zu. `POST /invites/:code/guest-join` ist der direkte Gastzugang ohne bestehende
OpenVoice-Session. Der Request enthält nur `displayName`, erzeugt einen Gast-User, weist die
Default-Rolle `guest` zu und gibt einen kurzlebigen Bearer-Session-Token zurück.

---

## Channels

```http
POST   /api/v1/workspaces/:workspaceId/channels
GET    /api/v1/channels/:channelId (nicht in v0.1.0-rc1)
PATCH  /api/v1/channels/:channelId (nicht in v0.1.0-rc1)
DELETE /api/v1/channels/:channelId (nicht in v0.1.0-rc1)
POST   /api/v1/workspaces/:workspaceId/channels/reorder
```

---

## Messages

```http
GET    /api/v1/channels/:channelId/messages?before=&after=&limit=
POST   /api/v1/channels/:channelId/messages
PATCH  /api/v1/messages/:messageId
DELETE /api/v1/messages/:messageId
WS     /api/v1/channels/:channelId/messages/ws
```

Der channel-spezifische Message-WebSocket bleibt als Phase-3-Kompatibilität bestehen. Neue
Realtime-Clients sollen den Gateway-Endpunkt verwenden.

---

## Gateway

```http
WS     /api/v1/gateway
```

Gateway-Konventionen:

- Server sendet nach Verbindungsaufbau `HELLO { heartbeatIntervalMs, resumeTimeoutMs }`.
- Client identifiziert sich mit `IDENTIFY`; Cookie-Auth aus dem Upgrade-Request wird akzeptiert,
  alternativ `d.sessionToken`.
- Server antwortet mit `READY { user, workspaces, resumeToken, resumed, heartbeatIntervalMs }`.
- Client sendet `HEARTBEAT`; Server antwortet mit `HEARTBEAT_ACK`.
- Client-Presence läuft über `DISPATCH` mit `t: "PRESENCE_UPDATE"` und `d.status`.
- Server-Events nutzen ein einheitliches Envelope mit `op`, `t`, `s` und `d`.
- Channel- und Message-Events werden serverseitig pro Empfänger gegen `VIEW_CHANNEL` gefiltert.
- Voice-Events `VOICE_STATE_UPDATE` und `SPEAKING_UPDATE` werden ebenfalls channel-scoped
  ausgeliefert und serverseitig gegen `VIEW_CHANNEL` gefiltert.

---

## Roles

```http
GET    /api/v1/workspaces/:workspaceId/roles (nicht in v0.1.0-rc1)
POST   /api/v1/workspaces/:workspaceId/roles (nicht in v0.1.0-rc1)
PATCH  /api/v1/roles/:roleId (nicht in v0.1.0-rc1)
DELETE /api/v1/roles/:roleId (nicht in v0.1.0-rc1)
POST   /api/v1/workspaces/:workspaceId/roles/reorder (nicht in v0.1.0-rc1)
PUT    /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId (nicht in v0.1.0-rc1)
DELETE /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId (nicht in v0.1.0-rc1)
```

## Moderation

```http
POST   /api/v1/workspaces/:workspaceId/members/:userId/kick
POST   /api/v1/workspaces/:workspaceId/members/:userId/ban
POST   /api/v1/workspaces/:workspaceId/members/:userId/unban
POST   /api/v1/workspaces/:workspaceId/members/:userId/timeout
```

Kick benötigt `KICK_MEMBERS`, Ban/Unban benötigt `BAN_MEMBERS`, Timeout benötigt
`TIMEOUT_MEMBERS`. Alle Aktionen prüfen die Rollen-Hierarchie serverseitig; der Owner ist vor
Moderationsaktionen geschützt. Bodies können optional `reason` enthalten. Timeout akzeptiert
zusätzlich `durationSeconds` zwischen 60 Sekunden und 28 Tagen.

---

## Permissions

```http
GET    /api/v1/channels/:channelId/permission-overrides
PUT    /api/v1/channels/:channelId/permission-overrides/:targetType/:targetId
DELETE /api/v1/channels/:channelId/permission-overrides/:targetType/:targetId
GET    /api/v1/channels/:channelId/effective-permissions/me
```

---

## Voice / Media

```http
POST   /api/v1/channels/:channelId/voice/join
POST   /api/v1/workspaces/:workspaceId/voice/leave
PATCH  /api/v1/workspaces/:workspaceId/voice/state
POST   /api/v1/workspaces/:workspaceId/voice/server-mute
POST   /api/v1/workspaces/:workspaceId/voice/server-deafen
POST   /api/v1/workspaces/:workspaceId/voice/move
POST   /api/v1/workspaces/:workspaceId/voice/disconnect
GET    /api/v1/turn/credentials
```

Voice Join prüft `VIEW_CHANNEL` und `CONNECT_VOICE`. Audio-Publish wird über `SPEAK`,
Self-Deafen und Server-Mute/Deafen im LiveKit-Token eingeschränkt. Kamera-Publish nutzt
`STREAM_CAMERA`; Screenshare nutzt `SHARE_SCREEN`; das 4K-Screenshare-Profil nutzt zusätzlich
`SHARE_SCREEN_4K`.

`PATCH /voice/state` akzeptiert neben Audio-Flags auch:

- `cameraEnabled`
- `cameraQuality`: `auto`, `720p`, `1080p`, `1440p`, `4k`
- `screenShareEnabled`
- `screenShareQuality`: `auto`, `720p`, `1080p`, `1440p`, `4k`
- `screenShareContentMode`: `detail` oder `motion`

Die API lehnt Kamera-, Screenshare- und 4K-Statusänderungen ohne passende Rechte mit `403` ab.
Der TURN-Endpunkt liefert kurzlebige REST-Credentials und niemals das gemeinsame TURN-Secret.
Server-Mute, Server-Deafen, Voice-Move und Voice-Disconnect prüfen zusätzlich die Rollen-Hierarchie
und schreiben Audit-Log-Einträge.
