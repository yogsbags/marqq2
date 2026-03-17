-- Migration 006: social_posts
-- Stores Supadata-extracted intelligence from social posts per company.
-- Run in Supabase SQL Editor after 005_social_accounts.sql.

CREATE TABLE IF NOT EXISTS social_posts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   uuid NOT NULL,
  account_id   uuid REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform     text NOT NULL,
  handle       text NOT NULL,
  account_type text NOT NULL DEFAULT 'competitor',
  post_url     text NOT NULL,
  posted_at    timestamptz,             -- when the post was published (if discoverable)
  intelligence jsonb,                   -- { summary, topics, key_messages, content_type, sentiment, entities, cta }
  raw_data     jsonb,                   -- raw metadata from discovery step (likes, views, etc.)
  fetched_at   timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (company_id, post_url)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_company    ON social_posts (company_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform   ON social_posts (company_id, platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_account    ON social_posts (account_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_fetched    ON social_posts (company_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_intel      ON social_posts USING gin (intelligence) WHERE intelligence IS NOT NULL;

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_social_posts" ON social_posts
  FOR ALL USING (auth.role() = 'service_role');
