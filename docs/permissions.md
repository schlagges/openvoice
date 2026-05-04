# Permissions

Dieses Dokument ist die Kurzreferenz für das Rechtekonzept. Die verbindliche Version steht in `docs/lastenheft.md`.

---

## Grundregeln

1. Rechte sind bitbasiert.
2. Rollen enthalten Rechte.
3. Nutzer können mehrere Rollen haben.
4. Channel erben Rechte entlang der Baumstruktur.
5. Channel können Overrides für Rollen und einzelne Member haben.
6. Explizites Deny schlägt Allow auf gleicher Ebene.
7. User Overrides schlagen Role Overrides auf gleicher Ebene.
8. Tiefere Channel-Ebene schlägt geerbte Parent-Ebene.
9. `ADMINISTRATOR` umgeht normale Checks, aber keine Owner-only-Aktionen.
10. Das Backend ist alleinige Sicherheitsautorität.

---

## Permission Enum

```ts
export enum Permission {
  ADMINISTRATOR          = 1n << 0n,
  MANAGE_WORKSPACE       = 1n << 1n,
  MANAGE_ROLES           = 1n << 2n,
  MANAGE_CHANNELS        = 1n << 3n,
  MANAGE_INVITES         = 1n << 4n,
  VIEW_AUDIT_LOG         = 1n << 5n,
  KICK_MEMBERS           = 1n << 6n,
  BAN_MEMBERS            = 1n << 7n,
  TIMEOUT_MEMBERS        = 1n << 8n,
  VIEW_CHANNEL           = 1n << 9n,
  READ_MESSAGE_HISTORY   = 1n << 10n,
  SEND_MESSAGES          = 1n << 11n,
  EDIT_OWN_MESSAGES      = 1n << 12n,
  DELETE_OWN_MESSAGES    = 1n << 13n,
  MANAGE_MESSAGES        = 1n << 14n,
  MENTION_MEMBERS        = 1n << 15n,
  MENTION_EVERYONE       = 1n << 16n,
  CONNECT_VOICE          = 1n << 17n,
  SPEAK                  = 1n << 18n,
  USE_VAD                = 1n << 19n,
  USE_PUSH_TO_TALK       = 1n << 20n,
  STREAM_CAMERA          = 1n << 21n,
  SHARE_SCREEN           = 1n << 22n,
  SHARE_SCREEN_4K        = 1n << 23n,
  PRIORITY_AUDIO         = 1n << 24n,
  MUTE_MEMBERS           = 1n << 25n,
  DEAFEN_MEMBERS         = 1n << 26n,
  MOVE_MEMBERS           = 1n << 27n,
  DISCONNECT_MEMBERS     = 1n << 28n,
  MANAGE_CHANNEL_PERMS   = 1n << 29n,
  VIEW_CHANNEL_STATS     = 1n << 30n,
}
```

---

## Permission Evaluation Pseudocode

```ts
function hasPermission(user, workspace, channelNode, permission): boolean {
  if (user.isSystemAdmin) return true;
  if (workspace.ownerId === user.id) return true;

  const base = calculateWorkspaceRolePermissions(user, workspace);
  if (base.has(Permission.ADMINISTRATOR)) return true;

  const path = getPathFromRootToNode(channelNode);
  let state = createPermissionState(base);

  for (const node of path) {
    applyRoleOverrides(state, user.roles, node);
    applyUserOverride(state, user.id, node);
  }

  return state.has(permission);
}
```

---

## Pflicht-Tests

- Owner hat alle Rechte.
- Administrator hat alle normalen Rechte.
- Admin darf Owner nicht entfernen.
- Nutzer ohne `VIEW_CHANNEL` sieht Channel nicht.
- Nutzer ohne `SEND_MESSAGES` kann nicht schreiben.
- Nutzer ohne `CONNECT_VOICE` kann Voice nicht joinen.
- Nutzer ohne `SHARE_SCREEN_4K` kann kein 4K-Profil nutzen.
- Role Deny schlägt Role Allow auf gleicher Ebene.
- User Allow schlägt Role Deny auf gleicher Ebene.
- Tiefere Overrides schlagen Parent-Ergebnis.
- Permission Cache wird bei Rollenänderung invalidiert.
