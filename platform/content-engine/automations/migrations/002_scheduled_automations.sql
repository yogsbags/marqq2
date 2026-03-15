CREATE TABLE IF NOT EXISTS scheduled_automations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id text NOT NULL,
  automation_id text NOT NULL,
  cron text NOT NULL,
  params jsonb DEFAULT '{}',
  active boolean DEFAULT true,
  next_run timestamptz,
  last_run timestamptz,
  created_by_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_automations_due
  ON scheduled_automations(active, next_run)
  WHERE active = true;
