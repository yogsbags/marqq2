-- content-drafts.sql
-- Stores content distribution drafts created from AgentRunPanel / B2C Organic.
-- Platforms: LinkedIn, Instagram, Facebook, X, combined FB/IG, website/blog.
-- Schedule mode stores publish_at for Marketing Calendar.

CREATE TABLE IF NOT EXISTS content_drafts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL,
  platform      text NOT NULL,
  mode          text NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft', 'publish', 'schedule', 'approve')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled', 'publishing', 'published', 'failed')),
  title         text,
  post          text,
  cta           text,
  hashtags      jsonb DEFAULT '[]',
  payload       jsonb DEFAULT '{}',
  publish_at    timestamptz,
  approved_at   timestamptz,
  published_at  timestamptz,
  connector     text,
  external_post_id text,
  external_url  text,
  last_error    text,
  metrics       jsonb DEFAULT '{}',
  campaign_id   text,
  content_pillar text,
  goal          text,
  priority      text DEFAULT 'normal',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Widen platform allow-list for existing deployments that still have the old CHECK.
DO $$
BEGIN
  ALTER TABLE content_drafts DROP CONSTRAINT IF EXISTS content_drafts_platform_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE content_drafts
  DROP CONSTRAINT IF EXISTS content_drafts_platform_check;

ALTER TABLE content_drafts
  ADD CONSTRAINT content_drafts_platform_check
  CHECK (platform IN (
    'linkedin',
    'facebook_instagram',
    'website_blog',
    'instagram',
    'facebook',
    'twitter',
    'x',
    'reddit',
    'youtube'
  ));

ALTER TABLE content_drafts DROP CONSTRAINT IF EXISTS content_drafts_mode_check;
ALTER TABLE content_drafts ADD CONSTRAINT content_drafts_mode_check
  CHECK (mode IN ('draft', 'publish', 'schedule', 'approve'));
ALTER TABLE content_drafts DROP CONSTRAINT IF EXISTS content_drafts_status_check;
ALTER TABLE content_drafts ADD CONSTRAINT content_drafts_status_check
  CHECK (status IN ('draft', 'approved', 'scheduled', 'publishing', 'published', 'failed'));
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS connector text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS external_post_id text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS metrics jsonb DEFAULT '{}';
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS campaign_id text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS content_pillar text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS goal text;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_content_drafts_company   ON content_drafts (company_id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_platform  ON content_drafts (company_id, platform);
CREATE INDEX IF NOT EXISTS idx_content_drafts_status    ON content_drafts (company_id, status);
CREATE INDEX IF NOT EXISTS idx_content_drafts_publish_at ON content_drafts (publish_at) WHERE status = 'scheduled';

ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_content_drafts" ON content_drafts;
CREATE POLICY "service_role_all_content_drafts" ON content_drafts
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "workspace_members_manage_content_drafts" ON content_drafts;
CREATE POLICY "workspace_members_manage_content_drafts" ON content_drafts
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.workspace_id IN (
        SELECT wm.workspace_id FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );
