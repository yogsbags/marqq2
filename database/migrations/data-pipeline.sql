-- ============================================================================
-- DATA PIPELINE — PHASE 6 SCHEMA FOUNDATION
-- ============================================================================
-- Run in Supabase Dashboard → SQL Editor
-- Phase 6: raw connector snapshots, agent-safe KPI rows, and anomaly records

-- ─── connector_raw_snapshots ────────────────────────────────────────────────
-- Append-only storage for raw connector payloads before SQL aggregation.
-- Raw payload JSONB is backend-only. Agents and public API must read
-- company_kpi_daily instead of querying raw connector payloads directly.

CREATE TABLE IF NOT EXISTS connector_raw_snapshots (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         TEXT        NOT NULL,
  connector_name     TEXT        NOT NULL,
  source_type        TEXT        NOT NULL,
  snapshot_date      DATE        NOT NULL,
  grain              TEXT        NOT NULL DEFAULT 'day',
  currency           TEXT,
  payload            JSONB       NOT NULL DEFAULT '{}',
  triggered_by_run_id TEXT,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_raw_snapshots_company_date
  ON connector_raw_snapshots (company_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_connector_raw_snapshots_company_connector_date
  ON connector_raw_snapshots (company_id, connector_name, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_connector_raw_snapshots_payload
  ON connector_raw_snapshots USING gin (payload);

ALTER TABLE connector_raw_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_raw_snapshots_service_insert"
  ON connector_raw_snapshots
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "connector_raw_snapshots_service_select"
  ON connector_raw_snapshots
  FOR SELECT
  USING (auth.role() = 'service_role');

-- service_role bypasses RLS, so append-only must be enforced in the database.
CREATE OR REPLACE FUNCTION prevent_connector_raw_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'connector_raw_snapshots is append-only; updates and deletes are not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_connector_raw_snapshots_append_only
  ON connector_raw_snapshots;

CREATE TRIGGER trg_connector_raw_snapshots_append_only
  BEFORE UPDATE OR DELETE ON connector_raw_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prevent_connector_raw_snapshot_mutation();

COMMENT ON TABLE connector_raw_snapshots IS
  'Append-only raw connector payloads. Backend-only storage; agents and public API must read company_kpi_daily.';

COMMENT ON COLUMN connector_raw_snapshots.payload IS
  'Opaque connector JSONB payload. Never expose directly to agents or public API consumers.';

-- ─── company_kpi_daily ──────────────────────────────────────────────────────
-- Agent-safe analytical surface for daily KPI rows.
-- This is a real table, not a PostgreSQL view, so aggregation can upsert facts.

CREATE TABLE IF NOT EXISTS company_kpi_daily (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          TEXT        NOT NULL,
  metric_date         DATE        NOT NULL,
  source_scope        TEXT        NOT NULL DEFAULT 'blended',
  currency            TEXT,
  spend               NUMERIC,
  revenue             NUMERIC,
  impressions         NUMERIC,
  clicks              NUMERIC,
  leads               NUMERIC,
  conversions         NUMERIC,
  ctr                 NUMERIC,
  cpc                 NUMERIC,
  cpl                 NUMERIC,
  cpa                 NUMERIC,
  roas                NUMERIC,
  source_snapshot_ids JSONB       NOT NULL DEFAULT '[]',
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_kpi_daily_company_date_scope_unique
    UNIQUE (company_id, metric_date, source_scope)
);

CREATE INDEX IF NOT EXISTS idx_company_kpi_daily_company_date
  ON company_kpi_daily (company_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_company_kpi_daily_scope_date
  ON company_kpi_daily (source_scope, metric_date DESC);

ALTER TABLE company_kpi_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_kpi_daily_service_only"
  ON company_kpi_daily
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE company_kpi_daily IS
  'Agent-safe KPI fact table. Agents and public API must read here, never from connector_raw_snapshots payload JSONB.';

-- ─── company_anomalies ──────────────────────────────────────────────────────
-- Durable anomaly history and severity-gating control plane.

CREATE TABLE IF NOT EXISTS company_anomalies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       TEXT        NOT NULL,
  metric_date      DATE        NOT NULL,
  metric_name      TEXT        NOT NULL,
  severity         TEXT        NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  current_value    NUMERIC,
  baseline_7d      NUMERIC,
  baseline_30d     NUMERIC,
  delta_vs_7d_pct  NUMERIC,
  delta_vs_30d_pct NUMERIC,
  direction        TEXT
    CHECK (direction IN ('up', 'down', 'flat')),
  status           TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'narrated', 'dismissed')),
  narration_required BOOLEAN   NOT NULL DEFAULT FALSE,
  narration_run_id TEXT,
  narrated_at      TIMESTAMPTZ,
  context          JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_anomalies_company_date_metric_unique
    UNIQUE (company_id, metric_date, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_company_anomalies_company_date
  ON company_anomalies (company_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_company_anomalies_severity_status
  ON company_anomalies (severity, status, created_at DESC);

ALTER TABLE company_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_anomalies_service_only"
  ON company_anomalies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE company_anomalies IS
  'Anomaly history derived from company_kpi_daily. Narration logic must use aggregated KPIs and anomaly summaries only.';
