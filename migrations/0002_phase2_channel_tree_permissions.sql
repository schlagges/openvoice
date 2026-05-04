CREATE TABLE channel_nodes (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id UUID NULL REFERENCES channel_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('category', 'text', 'voice', 'combined')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  position INTEGER NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0 AND depth <= 5),
  path TEXT NOT NULL,
  inherits_permissions BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX idx_channel_nodes_root_slug
ON channel_nodes(workspace_id, slug)
WHERE parent_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_channel_nodes_parent_slug
ON channel_nodes(workspace_id, parent_id, slug)
WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_channel_nodes_workspace_parent_position
ON channel_nodes(workspace_id, parent_id, position);

CREATE INDEX idx_channel_nodes_path
ON channel_nodes(workspace_id, path);

CREATE TABLE permission_overrides (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channel_nodes(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('role', 'member')),
  target_id UUID NOT NULL,
  allow NUMERIC(40, 0) NOT NULL DEFAULT 0,
  deny NUMERIC(40, 0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(channel_id, target_type, target_id)
);

CREATE INDEX idx_permission_overrides_channel
ON permission_overrides(channel_id);
