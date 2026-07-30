-- ============================================================================
-- MKG FOUNDATION — DATABASE SCHEMA
-- ============================================================================
-- Run in Supabase Dashboard → SQL Editor
-- Phase 1: Marketing Knowledge Graph persistence + agent run output log

-- ─── company_mkg ────────────────────────────────────────────────────────────
-- Stores the full MKG envelope per company as JSONB.
-- Source of truth is disk (platform/agent-runtime/memory/{companyId}/mkg.json).
-- This table is a sync replica: backend writes here after every patch().

CREATE TABLE IF NOT EXISTS company_mkg (
  company_id   TEXT        PRIMARY KEY,
  mkg_data     JSONB       NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query by update time (find companies with stale MKG)
CREATE INDEX IF NOT EXISTS idx_company_mkg_updated
  ON company_mkg (updated_at DESC);

-- JSONB index for field-level queries (e.g. confidence checks)
CREATE INDEX IF NOT EXISTS idx_company_mkg_data
  ON company_mkg USING gin (mkg_data);

ALTER TABLE company_mkg ENABLE ROW LEVEL SECURITY;

-- Backend uses service role (bypasses RLS). Anon/user access blocked for now.
-- When frontend reads are needed, add a workspace-scoped SELECT policy.
CREATE POLICY "company_mkg_service_only"
  ON company_mkg
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── agent_run_outputs ──────────────────────────────────────────────────────
-- Append-only log of every agent run's structured output.
-- Enables the Phase 2 AgentRunOutput contract and Phase 8 Outcome Ledger.
-- Rows are never updated — new run = new row.

CREATE TABLE IF NOT EXISTS agent_run_outputs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         TEXT        NOT NULL UNIQUE,          -- caller-supplied idempotency key
  company_id     TEXT        NOT NULL,
  agent          TEXT        NOT NULL,
  task           TEXT,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  artifact       JSONB       NOT NULL DEFAULT '{}',    -- { type, content, confidence }
  context_patch  JSONB       NOT NULL DEFAULT '{}',    -- fields written to MKG
  handoff_notes  TEXT,
  missing_data   JSONB       NOT NULL DEFAULT '[]',    -- array of missing field names
  tasks_created  JSONB       NOT NULL DEFAULT '[]',    -- follow-up tasks spawned
  raw_output     TEXT,                                 -- full LLM response for debugging
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_outputs_company
  ON agent_run_outputs (company_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_run_outputs_agent
  ON agent_run_outputs (agent, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_run_outputs_run_id
  ON agent_run_outputs (run_id);

ALTER TABLE agent_run_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_run_outputs_service_only"
  ON agent_run_outputs
  FOR ALL
  USING (auth.role() = 'service_role');
