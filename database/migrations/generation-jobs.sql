-- database/migrations/generation-jobs.sql
-- Tracks per-company artifact generation job status.
-- Used by backend-server.js to report progress of "generate all" runs.

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    TEXT        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  artifact_type TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Only one job per company+artifact_type at a time
  CONSTRAINT unique_generation_job UNIQUE (company_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_company
  ON public.generation_jobs (company_id);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status
  ON public.generation_jobs (status);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.generation_jobs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generation_jobs_updated_at ON public.generation_jobs;
CREATE TRIGGER generation_jobs_updated_at
  BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.generation_jobs_set_updated_at();

-- RLS: backend (service role) manages all rows; frontend reads status for their companies
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.generation_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can read jobs for companies in their workspaces
CREATE POLICY "workspace_members_select" ON public.generation_jobs
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM public.companies c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );
