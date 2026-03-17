-- Migration 005: social_accounts
-- Stores competitor and own social handles per company across platforms.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS social_accounts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('instagram','twitter','facebook','youtube','linkedin')),
  handle        text NOT NULL,          -- e.g. 'zerodhaonline' (no @)
  display_name  text,                   -- e.g. 'Zerodha'
  profile_url   text,                   -- full profile URL
  account_type  text NOT NULL DEFAULT 'competitor' CHECK (account_type IN ('own','competitor')),
  active        boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (company_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_company ON social_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_active  ON social_accounts (company_id, active) WHERE active = true;

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_social_accounts" ON social_accounts
  FOR ALL USING (auth.role() = 'service_role');
