-- Migration 004: Add intelligence JSONB column to youtube_videos
-- Stores structured AI-extracted data from Supadata /extract endpoint:
--   { summary, topics, key_messages, content_type, sentiment, entities, cta }

ALTER TABLE youtube_videos
  ADD COLUMN IF NOT EXISTS intelligence jsonb;

CREATE INDEX IF NOT EXISTS idx_youtube_videos_intelligence
  ON youtube_videos USING gin (intelligence)
  WHERE intelligence IS NOT NULL;
