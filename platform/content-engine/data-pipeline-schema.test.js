import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../../database/migrations/data-pipeline.sql", import.meta.url);

async function loadMigration() {
  return readFile(migrationPath, "utf8");
}

test("migration creates required Phase 6 tables and enables RLS on each", async () => {
  const sql = await loadMigration();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS connector_raw_snapshots/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS company_kpi_daily/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS company_anomalies/i);

  assert.match(sql, /ALTER TABLE connector_raw_snapshots ENABLE ROW LEVEL SECURITY;/i);
  assert.match(sql, /ALTER TABLE company_kpi_daily ENABLE ROW LEVEL SECURITY;/i);
  assert.match(sql, /ALTER TABLE company_anomalies ENABLE ROW LEVEL SECURITY;/i);
});

test("migration defines required uniqueness, indexes, and anomaly checks", async () => {
  const sql = await loadMigration();

  assert.match(sql, /UNIQUE\s*\(company_id,\s*metric_date,\s*source_scope\)/i);
  assert.match(sql, /UNIQUE\s*\(company_id,\s*metric_date,\s*metric_name\)/i);

  assert.match(sql, /idx_connector_raw_snapshots_company_date/i);
  assert.match(sql, /idx_connector_raw_snapshots_company_connector_date/i);
  assert.match(sql, /idx_connector_raw_snapshots_payload/i);
  assert.match(sql, /idx_company_kpi_daily_company_date/i);
  assert.match(sql, /idx_company_anomalies_company_date/i);

  assert.match(sql, /CHECK\s*\(severity IN \('low', 'medium', 'high', 'critical'\)\)/i);
  assert.match(sql, /CHECK\s*\(status IN \('open', 'narrated', 'dismissed'\)\)/i);
});

test("migration documents and enforces append-only raw snapshot boundaries", async () => {
  const sql = await loadMigration();

  assert.match(sql, /append-only storage for raw connector payloads/i);
  assert.match(sql, /agents and public API must read company_kpi_daily/i);
  assert.match(sql, /CREATE POLICY "connector_raw_snapshots_service_insert"/i);
  assert.match(sql, /CREATE POLICY "connector_raw_snapshots_service_select"/i);
  assert.match(sql, /prevent_connector_raw_snapshot_mutation/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON connector_raw_snapshots/i);
  assert.match(sql, /Opaque connector JSONB payload\. Never expose directly to agents or public API consumers\./i);
});

test("migration keeps KPI columns nullable and treats company_kpi_daily as a table", async () => {
  const sql = await loadMigration();

  assert.doesNotMatch(sql, /CREATE VIEW\s+company_kpi_daily/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS company_kpi_daily/i);

  for (const column of ["spend", "revenue", "impressions", "clicks", "leads", "conversions", "ctr", "cpc", "cpl", "cpa", "roas"]) {
    assert.match(sql, new RegExp(`\\n\\s*${column}\\s+NUMERIC`, "i"));
  }
});
