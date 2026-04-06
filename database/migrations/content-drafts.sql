-- content-drafts.sql
-- Stores content distribution drafts created from AgentRunPanel.
-- Supports LinkedIn, Facebook/Instagram, and website/blog (Google Docs) drafts.
-- Schedule mode stores publish_at for deferred review.

CREATE TABLE IF NOT EXISTS content_drafts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('linkedin', 'facebook_instagram', 'website_blog')),
  mode          text NOT NULL DEFAULT 'publish' CHECK (mode IN ('publish', 'schedule')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  title         text,
  post          text,
  cta           text,
  hashtags      jsonb DEFAULT '[]',
  payload       jsonb DEFAULT '{}',
  publish_at    timestamptz,
  published_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_drafts_company   ON content_drafts (company_id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_platform  ON content_drafts (company_id, platform);
CREATE INDEX IF NOT EXISTS idx_content_drafts_status    ON content_drafts (company_id, status);
CREATE INDEX IF NOT EXISTS idx_content_drafts_publish_at ON content_drafts (publish_at) WHERE status = 'scheduled';

ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_content_drafts" ON content_drafts
  FOR ALL USING (auth.role() = 'service_role');

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
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c
      WHERE c.workspace_id IN (
        SELECT wm.workspace_id FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );
