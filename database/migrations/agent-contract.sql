-- ============================================================================
-- AGENT CONTRACT STANDARD — agent_tasks schema additions
-- ============================================================================
-- Phase 2: Agent Contract Standard
-- Run in Supabase Dashboard → SQL Editor after agent-employees.sql has been applied.

-- 1. Add new columns needed for CONTRACT-05 (tasks_created FK chain)
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS triggered_by_run_id TEXT,
  ADD COLUMN IF NOT EXISTS company_id          TEXT,
  ADD COLUMN IF NOT EXISTS description         TEXT,
  ADD COLUMN IF NOT EXISTS priority            TEXT
    DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high'));

-- 2. Make user_id nullable so system-generated tasks (no human initiator) can be inserted
--    agent_run_outputs are created by the server itself; no auth.users row to reference.
ALTER TABLE agent_tasks
  ALTER COLUMN user_id DROP NOT NULL;

-- 3. Indexes for querying tasks by run and by company
CREATE INDEX IF NOT EXISTS idx_agent_tasks_run_id
  ON agent_tasks (triggered_by_run_id)
  WHERE triggered_by_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_company
  ON agent_tasks (company_id, created_at DESC)
  WHERE company_id IS NOT NULL;
