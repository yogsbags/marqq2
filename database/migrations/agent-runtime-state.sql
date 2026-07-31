-- Durable runtime state for schedulers, artifacts, and approval workflows.
-- The JSON payload keeps the current agent contract extensible while the
-- indexed columns support workspace/status/time queries.
CREATE TABLE IF NOT EXISTS public.agent_deployments (
  id TEXT PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id TEXT,
  status TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_agent_deployments_due ON public.agent_deployments(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_agent_deployments_workspace ON public.agent_deployments(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_artifacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  data JSONB NOT NULL DEFAULT '{}',
  handoff_notes TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_company ON public.agent_artifacts(company_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS public.draft_approvals (
  id TEXT PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_draft_approvals_workspace ON public.draft_approvals(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_approvals_status ON public.draft_approvals(status, scheduled_for);

ALTER TABLE public.agent_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runtime_service_role ON public.agent_deployments;
DROP POLICY IF EXISTS agent_artifacts_service_role ON public.agent_artifacts;
DROP POLICY IF EXISTS draft_approvals_service_role ON public.draft_approvals;
CREATE POLICY agent_runtime_service_role ON public.agent_deployments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY agent_artifacts_service_role ON public.agent_artifacts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY draft_approvals_service_role ON public.draft_approvals FOR ALL USING (auth.role() = 'service_role');
