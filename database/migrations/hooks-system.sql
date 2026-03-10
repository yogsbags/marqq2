-- ============================================================================
-- HOOKS SYSTEM — SIGNAL PERSISTENCE
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor after the Phase 1/2 migrations.

CREATE TABLE IF NOT EXISTS agent_signals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         TEXT NOT NULL,
  signal_type        TEXT NOT NULL,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'triggered', 'ignored', 'failed')),
  observed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at       TIMESTAMPTZ,
  triggered_hook_ids JSONB,
  error_message      TEXT,
  dedupe_key         TEXT,
  created_by_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_signals_status_observed
  ON agent_signals (status, observed_at);

CREATE INDEX IF NOT EXISTS idx_agent_signals_company_signal_dedupe
  ON agent_signals (company_id, signal_type, dedupe_key);

ALTER TABLE agent_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_signals_service_role" ON agent_signals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
