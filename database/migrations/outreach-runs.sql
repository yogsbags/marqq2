-- database/migrations/outreach-runs.sql
-- Structured lead outreach: Apollo fetch → copy → Gmail draft/schedule → send → replies.
-- Backend: platform/content-engine/outreach-service.js

-- ============================================================================
-- OUTREACH RUNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.outreach_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT        NOT NULL,
  -- No FK: companies.id is UUID in the live DB but outreach can reference
  -- either a workspace id or a company id, so this stays loose TEXT.
  company_id    TEXT,
  company_name  TEXT,
  question      TEXT,
  channel       TEXT        NOT NULL DEFAULT 'email',
  target        TEXT        NOT NULL DEFAULT 'decision',
  goal          TEXT        NOT NULL DEFAULT 'reply',
  source        TEXT,
  campaigns     JSONB       NOT NULL DEFAULT '[]',
  replies       JSONB       NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_runs_workspace
  ON public.outreach_runs (workspace_id);

CREATE INDEX IF NOT EXISTS idx_outreach_runs_workspace_created
  ON public.outreach_runs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_runs_company
  ON public.outreach_runs (company_id)
  WHERE company_id IS NOT NULL;

-- ============================================================================
-- OUTREACH PROSPECTS (≤100 per run)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.outreach_prospects (
  id               TEXT        NOT NULL,
  run_id           UUID        NOT NULL REFERENCES public.outreach_runs(id) ON DELETE CASCADE,
  full_name        TEXT,
  first_name       TEXT,
  last_name        TEXT,
  title            TEXT,
  company          TEXT,
  industry         TEXT,
  email            TEXT,
  linkedin_url     TEXT,
  city             TEXT,
  state            TEXT,
  seniority        TEXT,
  status           TEXT        NOT NULL DEFAULT 'fetched',
  subject          TEXT,
  body             TEXT,
  scheduled_for    TIMESTAMPTZ,
  gmail_draft_id   TEXT,
  gmail_thread_id  TEXT,
  sent_at          TIMESTAMPTZ,
  send_error       TEXT,
  send_meta        JSONB,
  replies          JSONB       NOT NULL DEFAULT '[]',
  raw              JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_run
  ON public.outreach_prospects (run_id);

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_scheduled
  ON public.outreach_prospects (scheduled_for)
  WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_sent
  ON public.outreach_prospects (run_id, status)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_email_lower
  ON public.outreach_prospects (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.outreach_runs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_runs_updated_at ON public.outreach_runs;
CREATE TRIGGER outreach_runs_updated_at
  BEFORE UPDATE ON public.outreach_runs
  FOR EACH ROW EXECUTE FUNCTION public.outreach_runs_set_updated_at();

CREATE OR REPLACE FUNCTION public.outreach_prospects_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_prospects_updated_at ON public.outreach_prospects;
CREATE TRIGGER outreach_prospects_updated_at
  BEFORE UPDATE ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.outreach_prospects_set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Backend writes use the service role. Member policies cast all id columns to
-- text because live companies.id / companies.workspace_id may be uuid while
-- outreach stores them as text.
ALTER TABLE public.outreach_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_outreach_runs" ON public.outreach_runs;
CREATE POLICY "service_role_all_outreach_runs" ON public.outreach_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_outreach_prospects" ON public.outreach_prospects;
CREATE POLICY "service_role_all_outreach_prospects" ON public.outreach_prospects
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "workspace_members_select_outreach_runs" ON public.outreach_runs;
CREATE POLICY "workspace_members_select_outreach_runs" ON public.outreach_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = outreach_runs.workspace_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = c.workspace_id::text
      WHERE wm.user_id = auth.uid()
        AND (
          c.id::text = outreach_runs.company_id
          OR c.id::text = outreach_runs.workspace_id
        )
    )
  );

DROP POLICY IF EXISTS "workspace_members_manage_outreach_runs" ON public.outreach_runs;
CREATE POLICY "workspace_members_manage_outreach_runs" ON public.outreach_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = outreach_runs.workspace_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = c.workspace_id::text
      WHERE wm.user_id = auth.uid()
        AND (
          c.id::text = outreach_runs.company_id
          OR c.id::text = outreach_runs.workspace_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = outreach_runs.workspace_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = c.workspace_id::text
      WHERE wm.user_id = auth.uid()
        AND (
          c.id::text = outreach_runs.company_id
          OR c.id::text = outreach_runs.workspace_id
        )
    )
  );

DROP POLICY IF EXISTS "workspace_members_select_outreach_prospects" ON public.outreach_prospects;
CREATE POLICY "workspace_members_select_outreach_prospects" ON public.outreach_prospects
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.outreach_runs r
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = r.workspace_id
      WHERE r.id = outreach_prospects.run_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.outreach_runs r
      JOIN public.companies c
        ON c.id::text = r.company_id OR c.id::text = r.workspace_id
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = c.workspace_id::text
      WHERE r.id = outreach_prospects.run_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_members_manage_outreach_prospects" ON public.outreach_prospects;
CREATE POLICY "workspace_members_manage_outreach_prospects" ON public.outreach_prospects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.outreach_runs r
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = r.workspace_id
      WHERE r.id = outreach_prospects.run_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.outreach_runs r
      JOIN public.companies c
        ON c.id::text = r.company_id OR c.id::text = r.workspace_id
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = c.workspace_id::text
      WHERE r.id = outreach_prospects.run_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.outreach_runs r
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = r.workspace_id
      WHERE r.id = outreach_prospects.run_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.outreach_runs r
      JOIN public.companies c
        ON c.id::text = r.company_id OR c.id::text = r.workspace_id
      JOIN public.workspace_members wm
        ON wm.workspace_id::text = c.workspace_id::text
      WHERE r.id = outreach_prospects.run_id
        AND wm.user_id = auth.uid()
    )
  );
