CREATE TABLE bans (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idx_bans_workspace_user_active
ON bans(workspace_id, user_id)
WHERE revoked_at IS NULL;

CREATE INDEX idx_bans_workspace_created
ON bans(workspace_id, created_at DESC);

CREATE TABLE member_timeouts (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timed_out_until TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_member_timeouts_active
ON member_timeouts(workspace_id, timed_out_until DESC);
