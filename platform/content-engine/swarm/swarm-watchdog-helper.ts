import { logWatchdogRun } from "./swarm-watchdog-telemetry.ts";

function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function readCompetitorLastChecked(competitor = {}) {
  return (
    competitor.last_checked ||
    competitor.watchdog_history?.last_checked ||
    competitor.baseline_content?.last_checked ||
    null
  );
}

export function buildWatchdogDelta({ competitor, items, now = new Date() }) {
  const lastChecked = toIsoString(readCompetitorLastChecked(competitor));
  const deltaEnd = toIsoString(now) || new Date().toISOString();
  const normalizedItems = Array.isArray(items) ? items : [];
  const deltaItems = lastChecked
    ? normalizedItems.filter((item) => {
        const publishedAt = toIsoString(item.published_at || item.publishedAt);
        return publishedAt && publishedAt > lastChecked;
      })
    : normalizedItems.slice();

  return {
    lastChecked,
    deltaStart: lastChecked,
    deltaEnd,
    items: deltaItems,
    hasDelta: deltaItems.length > 0,
  };
}

export async function executeWatchdog({
  runId,
  companyId,
  competitor,
  connectorType,
  fetchItems,
  analyzeItems,
  telemetryWriter,
  telemetrySupabase,
  now = new Date(),
}) {
  const startedAt = Date.now();
  const competitorName = competitor?.name || competitor?.competitorName || "unknown";
  const fetchedItems = await fetchItems();
  const delta = buildWatchdogDelta({
    competitor,
    items: fetchedItems,
    now,
  });

  if (!delta.hasDelta) {
    const telemetry = await logWatchdogRun(
      {
        run_id: runId,
        company_id: companyId,
        competitor_name: competitorName,
        connector_type: connectorType,
        delta_start: delta.deltaStart,
        delta_end: delta.deltaEnd,
        fetched_count: Array.isArray(fetchedItems) ? fetchedItems.length : 0,
        processed_count: 0,
        tokens_used: 0,
        status: "skipped_no_delta",
        duration_ms: Date.now() - startedAt,
      },
      { writer: telemetryWriter, supabase: telemetrySupabase },
    );

    return {
      competitorName,
      connectorType,
      status: "skipped_no_delta",
      deltaStart: delta.deltaStart,
      deltaEnd: delta.deltaEnd,
      fetchedCount: Array.isArray(fetchedItems) ? fetchedItems.length : 0,
      processedCount: 0,
      items: [],
      tokensUsed: 0,
      telemetry,
      lastChecked: delta.deltaEnd,
    };
  }

  const analysis = await analyzeItems(delta.items);
  const telemetry = await logWatchdogRun(
    {
      run_id: runId,
      company_id: companyId,
      competitor_name: competitorName,
      connector_type: connectorType,
      delta_start: delta.deltaStart,
      delta_end: delta.deltaEnd,
      fetched_count: Array.isArray(fetchedItems) ? fetchedItems.length : 0,
      processed_count: delta.items.length,
      tokens_used: analysis.tokensUsed ?? 0,
      status: analysis.status || "completed",
      duration_ms: Date.now() - startedAt,
      metadata: analysis.metadata || {},
    },
    { writer: telemetryWriter, supabase: telemetrySupabase },
  );

  return {
    competitorName,
    connectorType,
    status: analysis.status || "completed",
    deltaStart: delta.deltaStart,
    deltaEnd: delta.deltaEnd,
    fetchedCount: Array.isArray(fetchedItems) ? fetchedItems.length : 0,
    processedCount: delta.items.length,
    items: delta.items,
    analysis,
    tokensUsed: analysis.tokensUsed ?? 0,
    telemetry,
    lastChecked: delta.deltaEnd,
  };
}
