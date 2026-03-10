import { supabaseAdmin } from "../supabase.js";

function resolveSignalClient(client) {
  return client || supabaseAdmin || null;
}

export async function emitCompetitorSignal({
  companyId,
  competitorName,
  signalType = "competitor_move",
  sourceRunId,
  sourceAgent = "priya",
  payload = {},
  dedupeKey,
}, options = {}) {
  const signal = {
    company_id: companyId,
    signal_type: signalType,
    payload: {
      competitor_name: competitorName,
      source_run_id: sourceRunId,
      source_agent: sourceAgent,
      ...payload,
    },
    created_by_agent: sourceAgent,
    dedupe_key: dedupeKey || `${companyId}:${competitorName}:${signalType}:${sourceRunId}`,
  };

  const writer = options.writer || (async (entry) => entry);
  const client = resolveSignalClient(options.supabase);

  if (!client) {
    return writer(signal);
  }

  const { data, error } = await client
    .from("agent_signals")
    .insert(signal)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`[priya-hook-responder] failed to emit signal: ${error.message}`);
  }

  return data || signal;
}
