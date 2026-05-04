CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user_active
ON sessions(user_id, expires_at)
WHERE revoked_at IS NULL;

CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_workspaces_owner
ON workspaces(owner_id);

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE roles (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(workspace_id, key),
  UNIQUE(workspace_id, position)
);

CREATE INDEX idx_roles_workspace_position
ON roles(workspace_id, position);

CREATE TABLE member_roles (
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_member_id, role_id)
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID NULL REFERENCES users(id),
  event TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NULL,
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_audit_log_workspace_created
ON audit_log(workspace_id, created_at DESC);

