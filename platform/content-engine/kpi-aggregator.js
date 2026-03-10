import { getPipelineWriteClient } from "./supabase.js";

const METRIC_ALIASES = {
  spend: ["spend", "cost", "ad_spend", "amount_spent"],
  revenue: ["revenue", "sales", "gmv", "purchase_value"],
  impressions: ["impressions", "imps", "views"],
  clicks: ["clicks", "click"],
  leads: ["leads", "lead_count"],
  conversions: ["conversions", "purchases", "orders", "signups"],
};

const KPI_FIELDS = [
  "id",
  "company_id",
  "metric_date",
  "source_scope",
  "currency",
  "spend",
  "revenue",
  "impressions",
  "clicks",
  "leads",
  "conversions",
  "ctr",
  "cpc",
  "cpl",
  "cpa",
  "roas",
  "source_snapshot_ids",
  "ingested_at",
  "created_at",
  "updated_at",
];

function getClock(options = {}) {
  const clock = options.clock;
  if (clock?.iso) return clock;

  return {
    now: () => Date.now(),
    toDate: () => new Date(),
    iso: () => new Date().toISOString(),
  };
}

function requireClient(options = {}) {
  const client = options.client || getPipelineWriteClient();
  if (!client) {
    throw new Error("KPIAggregator requires a pipeline Supabase client.");
  }

  return client;
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function buildAliasLookup() {
  const lookup = new Map();

  for (const [metric, aliases] of Object.entries(METRIC_ALIASES)) {
    for (const alias of aliases) {
      lookup.set(alias, metric);
    }
  }

  return lookup;
}

const aliasLookup = buildAliasLookup();

function extractMetricAtomsFromPayload(payload) {
  const totals = {
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    conversions: 0,
  };

  const visit = (value, keyHint = null) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, keyHint);
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, nestedValue] of Object.entries(value)) {
        visit(nestedValue, key);
      }
      return;
    }

    const numericValue = toFiniteNumber(value);
    if (numericValue === null || !keyHint) return;

    const normalizedKey = keyHint.toLowerCase();
    const metric = aliasLookup.get(normalizedKey);
    if (!metric) return;

    totals[metric] += numericValue;
  };

  visit(payload);
  return totals;
}

function roundMetric(value, scale) {
  if (value === null) return null;
  return Number(value.toFixed(scale));
}

function safeDivide(numerator, denominator, scale) {
  if (!(denominator > 0)) return null;
  return roundMetric(numerator / denominator, scale);
}

function normalizeSnapshotEnvelope(snapshotEnvelope, clock) {
  return {
    id: snapshotEnvelope.id,
    company_id: snapshotEnvelope.company_id,
    connector_name: snapshotEnvelope.connector_name || snapshotEnvelope.source_type || "unknown",
    source_type: snapshotEnvelope.source_type || snapshotEnvelope.connector_name || "unknown",
    snapshot_date: snapshotEnvelope.snapshot_date,
    grain: snapshotEnvelope.grain || "day",
    currency: snapshotEnvelope.currency || null,
    payload: snapshotEnvelope.payload || {},
    triggered_by_run_id: snapshotEnvelope.triggered_by_run_id || null,
    ingested_at: snapshotEnvelope.ingested_at || clock.iso(),
    created_at: snapshotEnvelope.created_at || clock.iso(),
  };
}

function dedupeSnapshots(snapshotRows) {
  const seen = new Set();
  const deduped = [];

  for (const row of snapshotRows) {
    const key = row.id || `${row.company_id}:${row.source_type}:${row.snapshot_date}:${JSON.stringify(row.payload)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function inferCurrency(snapshotRows) {
  return snapshotRows.find((row) => row.currency)?.currency || null;
}

function buildKpiRow(snapshotRows, sourceScope, clock) {
  const dedupedRows = dedupeSnapshots(snapshotRows);
  if (!dedupedRows.length) return null;

  const totals = {
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    conversions: 0,
  };

  for (const row of dedupedRows) {
    const atoms = extractMetricAtomsFromPayload(row.payload);
    for (const metric of Object.keys(totals)) {
      totals[metric] += atoms[metric] || 0;
    }
  }

  const baseRow = {
    company_id: dedupedRows[0].company_id,
    metric_date: dedupedRows[0].snapshot_date,
    source_scope: sourceScope,
    currency: inferCurrency(dedupedRows),
    spend: roundMetric(totals.spend, 2),
    revenue: roundMetric(totals.revenue, 2),
    impressions: roundMetric(totals.impressions, 0),
    clicks: roundMetric(totals.clicks, 0),
    leads: roundMetric(totals.leads, 0),
    conversions: roundMetric(totals.conversions, 0),
    ctr: safeDivide(totals.clicks, totals.impressions, 4),
    cpc: safeDivide(totals.spend, totals.clicks, 2),
    cpl: safeDivide(totals.spend, totals.leads, 2),
    cpa: safeDivide(totals.spend, totals.conversions, 2),
    roas: safeDivide(totals.revenue, totals.spend, 4),
    source_snapshot_ids: dedupedRows
      .map((row) => row.id)
      .filter(Boolean)
      .sort(),
    ingested_at: clock.iso(),
    updated_at: clock.iso(),
  };

  return baseRow;
}

async function querySnapshotsForDate(companyId, snapshotDate, options = {}) {
  const client = requireClient(options);
  const { data, error } = await client
    .from("connector_raw_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .eq("snapshot_date", snapshotDate)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function pickSafeKpiRow(row) {
  return KPI_FIELDS.reduce((safeRow, field) => {
    if (field in row) safeRow[field] = row[field];
    return safeRow;
  }, {});
}

export async function saveRawSnapshot(snapshotEnvelope, options = {}) {
  const client = requireClient(options);
  const clock = getClock(options);
  const normalizedSnapshot = normalizeSnapshotEnvelope(snapshotEnvelope, clock);

  const { data, error } = await client
    .from("connector_raw_snapshots")
    .insert(normalizedSnapshot)
    .select()
    .single();

  if (error) throw error;
  return data || normalizedSnapshot;
}

export async function upsertDailyKpis(rows, options = {}) {
  const client = requireClient(options);
  const payload = rows
    .filter(Boolean)
    .map((row) => ({
      ...row,
      created_at: row.created_at || row.ingested_at || getClock(options).iso(),
      updated_at: row.updated_at || getClock(options).iso(),
    }));

  if (!payload.length) return [];

  const { data, error } = await client
    .from("company_kpi_daily")
    .upsert(payload, { onConflict: "company_id,metric_date,source_scope" })
    .select();

  if (error) throw error;
  return Array.isArray(data) ? data.map(pickSafeKpiRow) : payload.map(pickSafeKpiRow);
}

export async function aggregateSnapshot(snapshotRow, options = {}) {
  const clock = getClock(options);
  const sourceScope = snapshotRow.source_type || snapshotRow.connector_name || "unknown";
  const allSnapshotsForDay = await querySnapshotsForDate(
    snapshotRow.company_id,
    snapshotRow.snapshot_date,
    options,
  );

  const sourceSnapshots = allSnapshotsForDay.filter((row) => (
    (row.source_type || row.connector_name || "unknown") === sourceScope
  ));

  const sourceRow = buildKpiRow(sourceSnapshots.length ? sourceSnapshots : [snapshotRow], sourceScope, clock);
  const blendedRow = buildKpiRow(allSnapshotsForDay.length ? allSnapshotsForDay : [snapshotRow], "blended", clock);

  const rowsToUpsert = sourceScope === "blended"
    ? [blendedRow]
    : [sourceRow, blendedRow];

  const rows = await upsertDailyKpis(rowsToUpsert, options);
  return {
    snapshot: snapshotRow,
    rows,
  };
}

export async function aggregate(snapshotEnvelope, options = {}) {
  const snapshotRow = await saveRawSnapshot(snapshotEnvelope, options);
  return aggregateSnapshot(snapshotRow, options);
}

export async function listCompanyKpis(companyId, options = {}) {
  const client = requireClient(options);
  const days = Number(options.days || 30);
  const sourceScope = options.sourceScope || "blended";
  const { data, error } = await client
    .from("company_kpi_daily")
    .select("*")
    .eq("company_id", companyId)
    .eq("source_scope", sourceScope)
    .order("metric_date", { ascending: false });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows
    .slice(0, Number.isFinite(days) ? days : 30)
    .map(pickSafeKpiRow);
}

export default {
  aggregate,
  aggregateSnapshot,
  listCompanyKpis,
  saveRawSnapshot,
  upsertDailyKpis,
};
