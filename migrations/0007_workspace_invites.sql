CREATE TABLE invites (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_invites_workspace_created
ON invites(workspace_id, created_at DESC);

CREATE INDEX idx_invites_active_code
ON invites(code_hash, expires_at)
WHERE revoked_at IS NULL;
