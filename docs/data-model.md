# Datenmodell Kurzreferenz

Die verbindliche Datenmodellbeschreibung steht in `docs/lastenheft.md`.

---

## Haupttabellen

- `users`
- `sessions`
- `workspaces`
- `workspace_members`
- `roles`
- `member_roles`
- `channel_nodes`
- `permission_overrides`
- `messages`
- `voice_states`
- `bans`
- `member_timeouts`
- `invites`
- `audit_log`

---

## Designregeln

- Alle Tabellen nutzen UUID oder ULID IDs.
- Alle Zeiten sind `TIMESTAMPTZ`.
- Deletes sind, wo sinnvoll, Soft Deletes.
- Chat-Nachrichten werden nicht hart gelöscht, außer Datenschutz/Admin-Sonderfall.
- Permission-Bitsets werden als numerischer Wert gespeichert.
- Channelbaum muss Zyklen verhindern.
- Message Pagination ist cursorbasiert.
- Reordering muss atomar erfolgen.
- `voice_states` speichert nur aktuelle Voice-/Media-Zustände, keine Medieninhalte.

## `voice_states`

Phase 6 ergänzt die laufenden Voice-Zustände um Kamera- und Screenshare-Status:

- `camera_enabled`
- `camera_quality`: `auto`, `720p`, `1080p`, `1440p`, `4k`
- `screen_share_enabled`
- `screen_share_quality`: `auto`, `720p`, `1080p`, `1440p`, `4k`
- `screen_share_content_mode`: `detail`, `motion`

Phase 7 nutzt `voice_states` auch als aktuellen Server-Mute/Deafen-, Move- und Disconnect-Zustand.
Moderationsaktionen speichern keine Medieninhalte.

## `bans`

Phase 7 ergänzt aktive Workspace-Bans:

- `workspace_id`
- `user_id`
- `banned_by`
- `reason`
- `revoked_at`
- `revoked_by`
- `created_at`

Pro Workspace/User darf höchstens ein nicht aufgehobener Ban existieren. Die Tabelle ist die
serverseitige Grundlage, damit spätere Invite-Joins aktive Bans ablehnen können.

## `member_timeouts`

Phase 7 speichert temporäre Einschränkungen pro Workspace/User:

- `workspace_id`
- `user_id`
- `timed_out_until`
- `created_by`
- `reason`
- `created_at`
- `updated_at`

Aktive Timeouts verhindern serverseitig das Schreiben von Chat-Nachrichten und Audio-Publish.

---

## Kritische Indizes

```sql
CREATE INDEX idx_messages_channel_created
ON messages(channel_id, created_at DESC);

CREATE INDEX idx_channel_nodes_workspace_parent_position
ON channel_nodes(workspace_id, parent_id, position);

CREATE INDEX idx_audit_log_workspace_created
ON audit_log(workspace_id, created_at DESC);

CREATE INDEX idx_voice_states_channel
ON voice_states(workspace_id, channel_id);

CREATE INDEX idx_roles_workspace_position
ON roles(workspace_id, position);

CREATE UNIQUE INDEX idx_bans_workspace_user_active
ON bans(workspace_id, user_id)
WHERE revoked_at IS NULL;

CREATE INDEX idx_member_timeouts_active
ON member_timeouts(workspace_id, timed_out_until DESC);
```
