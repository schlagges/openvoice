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
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
GET  /api/v1/me
```

---

## Workspaces

```http
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
PATCH  /api/v1/workspaces/:workspaceId
DELETE /api/v1/workspaces/:workspaceId
GET    /api/v1/workspaces/:workspaceId/members
GET    /api/v1/workspaces/:workspaceId/tree
GET    /api/v1/workspaces/:workspaceId/audit-log
```

---

## Channels

```http
POST   /api/v1/workspaces/:workspaceId/channels
GET    /api/v1/channels/:channelId
PATCH  /api/v1/channels/:channelId
DELETE /api/v1/channels/:channelId
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

---

## Roles

```http
GET    /api/v1/workspaces/:workspaceId/roles
POST   /api/v1/workspaces/:workspaceId/roles
PATCH  /api/v1/roles/:roleId
DELETE /api/v1/roles/:roleId
POST   /api/v1/workspaces/:workspaceId/roles/reorder
PUT    /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId
DELETE /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId
```

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
POST   /api/v1/voice/channels/:channelId/join
POST   /api/v1/voice/leave
PATCH  /api/v1/voice/state
POST   /api/v1/voice/channels/:channelId/move-member
POST   /api/v1/voice/mute-member
POST   /api/v1/voice/deafen-member
POST   /api/v1/voice/disconnect-member
GET    /api/v1/turn/credentials
```
