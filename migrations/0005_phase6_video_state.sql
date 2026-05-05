ALTER TABLE voice_states
  ADD COLUMN camera_quality TEXT NOT NULL DEFAULT '720p' CHECK (camera_quality IN ('auto', '720p', '1080p', '1440p', '4k')),
  ADD COLUMN screen_share_quality TEXT NOT NULL DEFAULT '1080p' CHECK (screen_share_quality IN ('auto', '720p', '1080p', '1440p', '4k')),
  ADD COLUMN screen_share_content_mode TEXT NOT NULL DEFAULT 'detail' CHECK (screen_share_content_mode IN ('detail', 'motion'));
