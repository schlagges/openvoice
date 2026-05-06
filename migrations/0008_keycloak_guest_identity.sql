ALTER TABLE users
ADD COLUMN kind TEXT NOT NULL DEFAULT 'registered',
ADD COLUMN keycloak_subject TEXT NULL,
ADD COLUMN created_from_invite_id UUID NULL REFERENCES invites(id),
ADD COLUMN linked_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX idx_users_keycloak_subject
ON users(keycloak_subject)
WHERE keycloak_subject IS NOT NULL;

CREATE INDEX idx_users_kind
ON users(kind);
