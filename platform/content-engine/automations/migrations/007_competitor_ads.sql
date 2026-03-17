-- Migration 007: competitor_ads
-- Stores ads scraped from LinkedIn Ad Library, Facebook Ads, and Google Ads
-- for competitor intelligence and budget optimization context.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS competitor_ads (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid NOT NULL,               -- Marqq customer (who is tracking)
  competitor_name text NOT NULL,               -- e.g. 'Zerodha', 'Groww'
  platform        text NOT NULL CHECK (platform IN ('linkedin', 'facebook', 'google')),
  ad_id           text,                        -- platform-native ad ID
  advertiser      text,                        -- advertiser name as returned by scraper
  headline        text,
  body            text,
  cta_text        text,
  destination_url text,
  media_type      text,                        -- image, video, carousel, text
  media_url       text,
  targeting       jsonb,                       -- audience targeting info if available
  impressions_min bigint,
  impressions_max bigint,
  spend_min       numeric,
  spend_max       numeric,
  currency        text DEFAULT 'INR',
  start_date      date,
  end_date        date,
  is_active       boolean,
  raw_data        jsonb,                       -- full raw object from Apify
  scraped_at      timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (company_id, platform, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_ads_company    ON competitor_ads (company_id);
CREATE INDEX IF NOT EXISTS idx_competitor_ads_platform   ON competitor_ads (company_id, platform);
CREATE INDEX IF NOT EXISTS idx_competitor_ads_competitor ON competitor_ads (company_id, competitor_name);
CREATE INDEX IF NOT EXISTS idx_competitor_ads_active     ON competitor_ads (company_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_competitor_ads_scraped    ON competitor_ads (company_id, scraped_at DESC);

ALTER TABLE competitor_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_competitor_ads" ON competitor_ads
  FOR ALL USING (auth.role() = 'service_role');
