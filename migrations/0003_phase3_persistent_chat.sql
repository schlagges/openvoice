CREATE TABLE messages (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channel_nodes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  client_message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown' CHECK (content_format IN ('plain', 'markdown')),
  edited_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  deleted_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (channel_id, author_id, client_message_id)
);

CREATE INDEX idx_messages_channel_created
ON messages(channel_id, created_at DESC, id DESC);

CREATE INDEX idx_messages_workspace_channel
ON messages(workspace_id, channel_id);
