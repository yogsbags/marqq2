-- database/migrations/companies-core.sql
-- Core companies and company_artifacts tables.
-- Run BEFORE companies-workspace-scope.sql (which ALTERs these tables).

-- ============================================================================
-- COMPANIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id            TEXT        PRIMARY KEY,
  workspace_id  UUID        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_name  TEXT        NOT NULL DEFAULT '',
  website_url   TEXT,
  profile       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_workspace
  ON public.companies (workspace_id);

CREATE INDEX IF NOT EXISTS idx_companies_name
  ON public.companies (company_name);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.companies_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_updated_at ON public.companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_set_updated_at();

-- RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (backend writes)
CREATE POLICY "service_role_all" ON public.companies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Workspace members can CRUD their own companies
CREATE POLICY "workspace_members_select" ON public.companies
  FOR SELECT USING (
    workspace_id IS NULL
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_insert" ON public.companies
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_update" ON public.companies
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_delete" ON public.companies
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMPANY ARTIFACTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.company_artifacts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    TEXT        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id  UUID        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  artifact_type TEXT        NOT NULL,
  data          JSONB       NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_company_artifact UNIQUE (company_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_company_artifacts_company
  ON public.company_artifacts (company_id);

CREATE INDEX IF NOT EXISTS idx_company_artifacts_workspace
  ON public.company_artifacts (workspace_id);

CREATE INDEX IF NOT EXISTS idx_company_artifacts_type
  ON public.company_artifacts (artifact_type);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.company_artifacts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_artifacts_updated_at ON public.company_artifacts;
CREATE TRIGGER company_artifacts_updated_at
  BEFORE UPDATE ON public.company_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.company_artifacts_set_updated_at();

-- RLS
ALTER TABLE public.company_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.company_artifacts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "workspace_members_select" ON public.company_artifacts
  FOR SELECT USING (
    workspace_id IS NULL
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_insert" ON public.company_artifacts
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_update" ON public.company_artifacts
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_delete" ON public.company_artifacts
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );
