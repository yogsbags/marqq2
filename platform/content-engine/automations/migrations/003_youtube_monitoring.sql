-- Migration 003: YouTube Monitoring
-- Tracks YouTube channels per workspace and stores fetched video data.
-- Run in Supabase SQL Editor.

-- Channels to monitor per workspace (own + competitor)
CREATE TABLE IF NOT EXISTS youtube_channels (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   uuid NOT NULL,
  channel_url  text NOT NULL,
  channel_id   text,          -- YouTube channel ID extracted by yt-dlp
  channel_name text,
  type         text NOT NULL CHECK (type IN ('own', 'competitor')),
  is_active    boolean DEFAULT true,
  last_fetched_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (company_id, channel_url)
);

CREATE INDEX IF NOT EXISTS idx_youtube_channels_company ON youtube_channels (company_id);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_active  ON youtube_channels (company_id, is_active);

-- Videos fetched from tracked channels
CREATE TABLE IF NOT EXISTS youtube_videos (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       uuid NOT NULL,
  channel_id       text NOT NULL,   -- YouTube channel ID
  video_id         text NOT NULL,   -- YouTube video ID (yt unique key)
  channel_name     text,
  channel_type     text,            -- 'own' or 'competitor'
  title            text,
  description      text,
  tags             text[],
  view_count       bigint,
  like_count       bigint,
  comment_count    bigint,
  duration_secs    integer,
  upload_date      date,
  thumbnail_url    text,
  transcript       text,            -- cleaned plain-text transcript
  transcript_lang  text,
  scraped_at       timestamptz DEFAULT now(),
  UNIQUE (company_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_youtube_videos_company      ON youtube_videos (company_id);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_channel      ON youtube_videos (company_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_upload_date  ON youtube_videos (company_id, upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_type         ON youtube_videos (company_id, channel_type);

-- Enable RLS
ALTER TABLE youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_videos   ENABLE ROW LEVEL SECURITY;

-- Service role bypass (backend uses service role key)
CREATE POLICY "service_role_all_youtube_channels" ON youtube_channels
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_youtube_videos" ON youtube_videos
  FOR ALL USING (auth.role() = 'service_role');
