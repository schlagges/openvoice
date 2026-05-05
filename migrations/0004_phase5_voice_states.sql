CREATE TABLE voice_states (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channel_nodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  self_muted BOOLEAN NOT NULL DEFAULT false,
  self_deafened BOOLEAN NOT NULL DEFAULT false,
  server_muted BOOLEAN NOT NULL DEFAULT false,
  server_deafened BOOLEAN NOT NULL DEFAULT false,
  speaking BOOLEAN NOT NULL DEFAULT false,
  camera_enabled BOOLEAN NOT NULL DEFAULT false,
  screen_share_enabled BOOLEAN NOT NULL DEFAULT false,
  audio_mode TEXT NOT NULL DEFAULT 'voice' CHECK (audio_mode IN ('voice', 'low_latency', 'music')),
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_voice_states_channel
ON voice_states(workspace_id, channel_id, connected_at ASC);

CREATE INDEX idx_voice_states_session
ON voice_states(session_id);
