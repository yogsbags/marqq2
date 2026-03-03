-- ============================================================================
-- COMPETITOR ACTIVITY MONITORING SCHEMA
-- ============================================================================
-- Tables for tracking competitor activities, news, alerts, and monitoring config

-- Competitor Alerts Table
-- Stores alerts generated from competitor news/activities
CREATE TABLE IF NOT EXISTS competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Alert Content
  competitor_name TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('news', 'funding', 'product_launch', 'pricing_change', 'acquisition', 'partnership', 'leadership_change', 'other')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_content TEXT,

  -- Source & Metadata
  source_url TEXT NOT NULL,
  source_domain TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Sentiment & Priority
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  -- Alert State
  read BOOLEAN DEFAULT FALSE,
  dismissed BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Deduplication
  content_hash TEXT UNIQUE, -- SHA-256 hash of title + source_url for deduplication

  -- Indexes
  CONSTRAINT unique_alert UNIQUE (user_id, content_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_user_id ON competitor_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_competitor ON competitor_alerts(competitor_name);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_created ON competitor_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_read ON competitor_alerts(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_hash ON competitor_alerts(content_hash);

-- Competitor Monitoring Configuration Table
-- User preferences for which competitors to monitor and how
CREATE TABLE IF NOT EXISTS competitor_monitoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Competitor Info
  competitor_name TEXT NOT NULL,
  competitor_domain TEXT,
  industry TEXT,

  -- Monitoring Settings
  enabled BOOLEAN DEFAULT TRUE,
  alert_types TEXT[] DEFAULT ARRAY['news', 'funding', 'product_launch', 'pricing_change', 'acquisition', 'partnership']::TEXT[],
  keywords TEXT[], -- Additional keywords to monitor (e.g., product names, executives)

  -- Alert Preferences
  email_alerts BOOLEAN DEFAULT FALSE,
  push_alerts BOOLEAN DEFAULT TRUE,
  alert_frequency TEXT DEFAULT 'realtime' CHECK (alert_frequency IN ('realtime', 'daily_digest', 'weekly_digest')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_checked_at TIMESTAMP WITH TIME ZONE,

  -- Unique constraint: one config per user per competitor
  CONSTRAINT unique_monitoring_config UNIQUE (user_id, competitor_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monitoring_config_user_id ON competitor_monitoring_config(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_config_enabled ON competitor_monitoring_config(enabled) WHERE enabled = TRUE;

-- Alert Deduplication Tracking Table
-- Tracks seen URLs/headlines to prevent duplicate alerts (global, not per-user)
CREATE TABLE IF NOT EXISTS alert_deduplication (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT UNIQUE NOT NULL,
  competitor_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  seen_count INTEGER DEFAULT 1,

  -- Auto-cleanup: delete records older than 90 days
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_deduplication_hash ON alert_deduplication(content_hash);
CREATE INDEX IF NOT EXISTS idx_deduplication_created ON alert_deduplication(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_monitoring_config ENABLE ROW LEVEL SECURITY;
-- alert_deduplication is global, no RLS needed

-- Competitor Alerts Policies
CREATE POLICY "Users can view their own alerts"
  ON competitor_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts"
  ON competitor_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON competitor_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON competitor_alerts FOR DELETE
  USING (auth.uid() = user_id);

-- Monitoring Config Policies
CREATE POLICY "Users can view their own monitoring config"
  ON competitor_monitoring_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own monitoring config"
  ON competitor_monitoring_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitoring config"
  ON competitor_monitoring_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitoring config"
  ON competitor_monitoring_config FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_competitor_alerts_updated_at
  BEFORE UPDATE ON competitor_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monitoring_config_updated_at
  BEFORE UPDATE ON competitor_monitoring_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Cleanup old deduplication records (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_old_deduplication_records()
RETURNS void AS $$
BEGIN
  DELETE FROM alert_deduplication
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================
-- Uncomment to insert sample monitoring config for testing
/*
INSERT INTO competitor_monitoring_config (user_id, competitor_name, competitor_domain, industry, enabled, keywords)
VALUES
  ((SELECT id FROM auth.users LIMIT 1), 'HubSpot', 'hubspot.com', 'B2B Marketing Technology', TRUE, ARRAY['Sales Hub', 'Marketing Hub', 'Brian Halligan']),
  ((SELECT id FROM auth.users LIMIT 1), 'Salesforce', 'salesforce.com', 'B2B Marketing Technology', TRUE, ARRAY['Sales Cloud', 'Marketing Cloud', 'Marc Benioff']),
  ((SELECT id FROM auth.users LIMIT 1), 'Marketo', 'marketo.com', 'B2B Marketing Technology', TRUE, ARRAY['Engagement Platform'])
ON CONFLICT (user_id, competitor_name) DO NOTHING;
*/
