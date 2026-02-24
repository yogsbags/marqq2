-- ============================================================================
-- AUTONOMOUS AI DIGITAL EMPLOYEES — DATABASE SCHEMA
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor
-- After running: enable real-time on agent_notifications table in
--   Database → Replication → Supabase Realtime → agent_notifications

-- Agent run results (one row per scheduled or on-demand run)
CREATE TABLE IF NOT EXISTS agent_notifications (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name   TEXT    NOT NULL,
  agent_role   TEXT,
  task_type    TEXT,
  title        TEXT    NOT NULL,
  summary      TEXT    NOT NULL,
  full_output  JSONB,
  action_items JSONB,
  status       TEXT    NOT NULL DEFAULT 'success'
                       CHECK (status IN ('success', 'error', 'running')),
  duration_ms  INTEGER,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_user_created
  ON agent_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_unread
  ON agent_notifications (user_id, read) WHERE read = FALSE;

-- Live task registry (what is running or scheduled right now)
CREATE TABLE IF NOT EXISTS agent_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL,
  task_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'running', 'done', 'failed')),
  scheduled_for TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persistent cross-run agent memory (mirrors filesystem, queryable)
CREATE TABLE IF NOT EXISTS agent_memory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name   TEXT NOT NULL,
  memory_type  TEXT NOT NULL
               CHECK (memory_type IN ('long_term', 'daily_log', 'client_context')),
  content      TEXT NOT NULL,
  date         DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, agent_name, memory_type, date)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory        ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own rows
CREATE POLICY "agent_notifications_own" ON agent_notifications
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "agent_tasks_own" ON agent_tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "agent_memory_own" ON agent_memory
  FOR ALL USING (auth.uid() = user_id);

-- Service role (used by Python scheduler) bypasses RLS — no extra policy needed.
-- The scheduler uses SUPABASE_SERVICE_KEY which has full access.
