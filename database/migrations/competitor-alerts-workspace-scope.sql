-- ============================================================================
-- COMPETITOR ALERTS — WORKSPACE SCOPE
-- ============================================================================
-- The notifications panel filters alerts by workspace. competitor-alerts.sql
-- predates workspaces, so add the column (nullable = backward compatible).

ALTER TABLE competitor_alerts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE competitor_monitoring_config
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_competitor_alerts_workspace
  ON competitor_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_competitor_monitoring_config_workspace
  ON competitor_monitoring_config(workspace_id);
