import { randomUUID } from "node:crypto";

import { MKGService } from "./mkg-service.js";
import { getPipelineWriteClient } from "./supabase.js";

const KPI_METRICS = [
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
];

const SEVERITY_THRESHOLDS = [
  { minimum: 50, severity: "critical" },
  { minimum: 35, severity: "high" },
  { minimum: 20, severity: "medium" },
  { minimum: 10, severity: "low" },
];

function getClock(options = {}) {
  const clock = options.clock;
  if (clock?.iso && clock?.toDate) return clock;

  return {
    now: () => Date.now(),
    toDate: () => new Date(),
    iso: () => new Date().toISOString(),
  };
}

function requireClient(options = {}) {
  const client = options.client || getPipelineWriteClient();
  if (!client) {
    throw new Error("Anomaly detector requires a pipeline Supabase client.");
  }

  return client;
}

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundMetric(value, scale = 2) {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(scale));
}

function average(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function toMetricDate(value) {
  return String(value || "").slice(0, 10);
}

function pickTargetRow(rows, metricDate) {
  const targetDate = toMetricDate(metricDate);
  const eligibleRows = rows
    .filter((row) => toMetricDate(row.metric_date) <= targetDate)
    .sort((left, right) => (
      toMetricDate(left.metric_date) > toMetricDate(right.metric_date) ? 1 : -1
    ));

  return eligibleRows[eligibleRows.length - 1] || null;
}

export function classifySeverity(percentDeviation) {
  const absoluteDeviation = Math.abs(toFiniteNumber(percentDeviation) || 0);
  for (const threshold of SEVERITY_THRESHOLDS) {
    if (absoluteDeviation >= threshold.minimum) {
      return threshold.severity;
    }
  }

  return null;
}

export function computeBaseline(priorRows, metricName, windowSize, minimumRows) {
  const values = priorRows
    .map((row) => toFiniteNumber(row[metricName]))
    .filter((value) => value !== null)
    .slice(-windowSize);

  if (values.length < minimumRows) return null;
  return roundMetric(average(values), 4);
}

function computePercentDelta(currentValue, baseline) {
  if (!(baseline > 0) || currentValue === null) return null;
  return roundMetric(((currentValue - baseline) / baseline) * 100, 2);
}

function deriveDirection(deltaValues) {
  const usable = deltaValues.filter((value) => value !== null);
  if (!usable.length) return "flat";
  const selected = usable.reduce((winner, candidate) => (
    Math.abs(candidate) > Math.abs(winner) ? candidate : winner
  ));
  if (selected > 0) return "up";
  if (selected < 0) return "down";
  return "flat";
}

function buildSafeAnomalySummary(anomaly) {
  return {
    metric: anomaly.metric_name,
    severity: anomaly.severity,
    direction: anomaly.direction,
    current_value: anomaly.current_value,
    baseline_7d: anomaly.baseline_7d,
    baseline_30d: anomaly.baseline_30d,
    delta_vs_7d_pct: anomaly.delta_vs_7d_pct,
    delta_vs_30d_pct: anomaly.delta_vs_30d_pct,
    narration_required: anomaly.narration_required,
  };
}

function buildMkgPatch(anomalies, clock) {
  const summaries = anomalies.map(buildSafeAnomalySummary);
  return {
    insights: {
      value: {
        summary: summaries
          .map((entry) => `${entry.metric} ${entry.direction} (${entry.severity})`)
          .join("; "),
        anomalies: summaries,
      },
      confidence: 0.76,
      source_agent: "phase-06-anomaly-detector",
      last_verified: clock.iso(),
      expires_at: null,
    },
  };
}

async function createNarration(anomaly, options = {}) {
  const groqClient = options.groqClient;
  if (!groqClient?.chat?.completions?.create) return null;

  const safeSummary = buildSafeAnomalySummary(anomaly);
  const completion = await groqClient.chat.completions.create({
    model: options.model || process.env.GROQ_ANOMALY_MODEL || "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "Summarize KPI anomalies using aggregated metrics only. Never mention raw payloads or connector JSON.",
      },
      {
        role: "user",
        content: [
          `Company: ${anomaly.company_id}`,
          `Date: ${anomaly.metric_date}`,
          `Metric: ${anomaly.metric_name}`,
          `Severity: ${anomaly.severity}`,
          `Direction: ${anomaly.direction}`,
          `Current: ${anomaly.current_value}`,
          `7d baseline: ${anomaly.baseline_7d ?? "n/a"} (${anomaly.delta_vs_7d_pct ?? "n/a"}%)`,
          `30d baseline: ${anomaly.baseline_30d ?? "n/a"} (${anomaly.delta_vs_30d_pct ?? "n/a"}%)`,
          `Safe summary: ${JSON.stringify(safeSummary)}`,
        ].join("\n"),
      },
    ],
  });

  return completion?.choices?.[0]?.message?.content?.trim() || null;
}

async function upsertAnomalies(anomalies, options = {}) {
  if (!anomalies.length) return [];
  const client = requireClient(options);
  const { data, error } = await client
    .from("company_anomalies")
    .upsert(anomalies, { onConflict: "company_id,metric_date,metric_name" })
    .select();

  if (error) throw error;
  return Array.isArray(data) ? data : anomalies;
}

export async function detectCompanyAnomalies(companyId, options = {}) {
  const client = requireClient(options);
  const clock = getClock(options);
  const sourceScope = options.sourceScope || "blended";
  const metricDate = options.metricDate || clock.iso().slice(0, 10);
  const mkgService = options.mkgService || MKGService;

  const { data, error } = await client
    .from("company_kpi_daily")
    .select("*")
    .eq("company_id", companyId)
    .eq("source_scope", sourceScope)
    .order("metric_date", { ascending: true });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const currentRow = pickTargetRow(rows, metricDate);
  if (!currentRow) {
    return { companyId, metricDate: toMetricDate(metricDate), anomalies: [] };
  }

  const currentMetricDate = toMetricDate(currentRow.metric_date);
  const priorRows = rows.filter((row) => toMetricDate(row.metric_date) < currentMetricDate);
  const anomalies = [];

  for (const metricName of KPI_METRICS) {
    const currentValue = toFiniteNumber(currentRow[metricName]);
    if (currentValue === null) continue;

    const baseline7d = computeBaseline(priorRows, metricName, 7, 3);
    const baseline30d = computeBaseline(priorRows, metricName, 30, 7);
    if (baseline7d === null && baseline30d === null) continue;

    const deltaVs7dPct = computePercentDelta(currentValue, baseline7d);
    const deltaVs30dPct = computePercentDelta(currentValue, baseline30d);
    const comparableDeltas = [deltaVs7dPct, deltaVs30dPct].filter((value) => value !== null);
    if (!comparableDeltas.length) continue;

    const severity = classifySeverity(Math.max(...comparableDeltas.map((value) => Math.abs(value))));
    if (!severity) continue;

    const anomaly = {
      id: randomUUID(),
      company_id: companyId,
      metric_date: currentMetricDate,
      metric_name: metricName,
      severity,
      current_value: roundMetric(currentValue, 4),
      baseline_7d: baseline7d,
      baseline_30d: baseline30d,
      delta_vs_7d_pct: deltaVs7dPct,
      delta_vs_30d_pct: deltaVs30dPct,
      direction: deriveDirection([deltaVs7dPct, deltaVs30dPct]),
      status: "open",
      narration_required: severity === "high" || severity === "critical",
      narration_run_id: null,
      narrated_at: null,
      context: {
        source_scope: sourceScope,
        baselines_used: {
          prior_rows_7d: priorRows.slice(-7).length,
          prior_rows_30d: priorRows.slice(-30).length,
        },
      },
      created_at: clock.iso(),
      updated_at: clock.iso(),
    };

    if (anomaly.narration_required) {
      const narration = await createNarration(anomaly, options);
      if (narration) {
        anomaly.context = {
          ...anomaly.context,
          narration,
        };
        anomaly.status = "narrated";
        anomaly.narration_run_id = options.narrationRunId || `narration-${currentMetricDate}`;
        anomaly.narrated_at = clock.iso();
      }
    }

    anomalies.push(anomaly);
  }

  const storedAnomalies = await upsertAnomalies(anomalies, options);
  const silentAnomalies = storedAnomalies.filter((entry) => (
    entry.severity === "low" || entry.severity === "medium"
  ));

  if (silentAnomalies.length) {
    await mkgService.patch(companyId, buildMkgPatch(silentAnomalies, clock));
  }

  return {
    companyId,
    metricDate: currentMetricDate,
    anomalies: storedAnomalies,
  };
}

export default {
  classifySeverity,
  computeBaseline,
  detectCompanyAnomalies,
};
