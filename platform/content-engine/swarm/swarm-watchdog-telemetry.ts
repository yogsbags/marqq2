import { supabaseAdmin } from "../supabase.js";

function createTelemetryClient(client) {
  return client || supabaseAdmin || null;
}

export async function logWatchdogRun(entry, options = {}) {
  const telemetryEntry = {
    run_id: entry.run_id,
    company_id: entry.company_id,
    competitor_name: entry.competitor_name,
    connector_type: entry.connector_type || "unknown",
    delta_start: entry.delta_start || null,
    delta_end: entry.delta_end || null,
    fetched_count: entry.fetched_count ?? 0,
    processed_count: entry.processed_count ?? 0,
    tokens_used: entry.tokens_used ?? 0,
    status: entry.status || "completed",
    duration_ms: entry.duration_ms ?? 0,
    metadata: entry.metadata || {},
    created_at: entry.created_at || new Date().toISOString(),
  };

  const writer = options.writer || (async (payload) => payload);
  const client = createTelemetryClient(options.supabase);

  if (!client) {
    return writer(telemetryEntry);
  }

  const { data, error } = await client
    .from("swarm_watchdog_runs")
    .insert(telemetryEntry)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`[swarm-watchdog-telemetry] failed to log run: ${error.message}`);
  }

  return data || telemetryEntry;
}
