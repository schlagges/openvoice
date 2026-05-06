ALTER TABLE workspaces
ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'private';

ALTER TABLE workspaces
ADD CONSTRAINT workspaces_access_mode_check
CHECK (access_mode IN ('private', 'global_authenticated'));

CREATE INDEX idx_workspaces_access_mode
ON workspaces(access_mode);
