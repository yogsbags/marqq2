-- Normalized first-party content performance and evidence-gated course corrections.
CREATE TABLE IF NOT EXISTS content_performance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  platform text NOT NULL,
  external_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'own' CHECK (source_type IN ('own', 'competitor')),
  account_id uuid,
  title text,
  url text,
  published_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}',
  raw_metrics jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_content_performance_company ON content_performance (company_id, platform, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_performance_source ON content_performance (company_id, source_type, fetched_at DESC);

CREATE TABLE IF NOT EXISTS content_course_corrections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  source text NOT NULL,
  recommendation jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_content_course_corrections_company ON content_course_corrections (company_id, status, created_at DESC);

ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_course_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_content_performance" ON content_performance;
CREATE POLICY "service_role_all_content_performance" ON content_performance FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_content_course_corrections" ON content_course_corrections;
CREATE POLICY "service_role_all_content_course_corrections" ON content_course_corrections FOR ALL USING (auth.role() = 'service_role');
