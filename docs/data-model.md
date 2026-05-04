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
```
