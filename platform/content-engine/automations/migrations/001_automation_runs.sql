CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id text,
  run_id text,
  automation_id text NOT NULL,
  automation_name text,
  status text NOT NULL DEFAULT 'pending',
  params jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}',
  triggered_by_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_company_id_idx ON automation_runs(company_id);
CREATE INDEX IF NOT EXISTS automation_runs_run_id_idx ON automation_runs(run_id);
