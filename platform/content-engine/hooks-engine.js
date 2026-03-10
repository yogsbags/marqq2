import { loadHooksConfig } from "./hooks-config.js";
import { MKGService } from "./mkg-service.js";
import { supabaseAdmin, supabase as anonSupabase } from "./supabase.js";

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPath(object, path) {
  if (!object || typeof path !== "string" || !path.trim()) return undefined;
  return path
    .split(".")
    .filter(Boolean)
    .reduce((current, segment) => (current == null ? undefined : current[segment]), object);
}

function buildIgnoredResult(reason, extras = {}) {
  return {
    matched: false,
    deltaPct: null,
    baselineValue: extras.baselineValue ?? null,
    currentValue: extras.currentValue ?? null,
    reason,
  };
}

export function evaluateSignalAgainstBaseline({
  currentValue,
  baselineValue,
  operator,
  threshold,
}) {
  const current = toNumber(currentValue);
  const baseline = toNumber(baselineValue);

  if (current === null) {
    return buildIgnoredResult("missing_current_value", { baselineValue: baseline });
  }
  if (baseline === null) {
    return buildIgnoredResult("missing_baseline_value", { currentValue: current });
  }
  if (baseline <= 0) {
    return buildIgnoredResult("invalid_baseline_value", {
      currentValue: current,
      baselineValue: baseline,
    });
  }

  const deltaPct = ((current - baseline) / baseline) * 100;

  switch (operator) {
    case "pct_drop_gte": {
      const dropPct = ((baseline - current) / baseline) * 100;
      return {
        matched: dropPct >= threshold,
        deltaPct: -dropPct,
        baselineValue: baseline,
        currentValue: current,
        reason: dropPct >= threshold ? "matched" : "below_threshold",
      };
    }
    case "pct_rise_gte":
      return {
        matched: deltaPct >= threshold,
        deltaPct,
        baselineValue: baseline,
        currentValue: current,
        reason: deltaPct >= threshold ? "matched" : "below_threshold",
      };
    default:
      return buildIgnoredResult("unsupported_operator", {
        currentValue: current,
        baselineValue: baseline,
      });
  }
}

export class HooksEngine {
  constructor(options = {}) {
    this.supabase = options.supabase || supabaseAdmin || anonSupabase || null;
    this.dispatchHookRun = options.dispatchHookRun || (async () => {});
    this.mkgReader = options.mkgReader || MKGService.read.bind(MKGService);
    this.logger = options.logger || console;
    this.loadHooksConfigFn = options.loadHooksConfigFn || loadHooksConfig;
    this.hooksConfig = options.hooksConfig || null;
    this.timer = null;
    this.running = false;
  }

  async getConfig() {
    if (!this.hooksConfig) {
      this.hooksConfig = await this.loadHooksConfigFn();
    }
    return this.hooksConfig;
  }

  async start() {
    if (this.running) return;
    const config = await this.getConfig();
    const heartbeatMs = config.heartbeat_seconds * 1000;
    this.running = true;
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error("[hooks-engine] tick failed:", error);
      });
    }, heartbeatMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  async tick() {
    const config = await this.getConfig();
    const signalRows = await this.fetchPendingSignals();
    const dispatches = [];

    for (const signalRow of signalRows) {
      const claimed = await this.claimSignal(signalRow.id);
      if (!claimed) continue;

      try {
        const signalDispatches = await this.processSignal(claimed, config);
        dispatches.push(...signalDispatches);
      } catch (error) {
        await this.markSignalFailed(claimed.id, error);
      }
    }

    return dispatches;
  }

  async fetchPendingSignals() {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("agent_signals")
      .select("*")
      .eq("status", "pending")
      .order("observed_at", { ascending: true });

    if (error) {
      throw new Error(`[hooks-engine] failed to fetch pending signals: ${error.message}`);
    }

    return data || [];
  }

  async claimSignal(signalId) {
    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from("agent_signals")
      .update({ status: "processing" })
      .eq("id", signalId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`[hooks-engine] failed to claim signal ${signalId}: ${error.message}`);
    }

    return data || null;
  }

  async processSignal(signalRow, config) {
    const matchingHooks = config.signal_triggers.filter(
      (hook) => hook.enabled && hook.signal_type === signalRow.signal_type
    );

    if (matchingHooks.length === 0) {
      await this.updateSignal(signalRow.id, {
        status: "ignored",
        processed_at: new Date().toISOString(),
        error_message: "no_matching_hook",
      });
      return [];
    }

    const mkg = await this.mkgReader(signalRow.company_id);
    const dispatchBatches = [];
    const triggeredHookIds = [];

    for (const hook of matchingHooks) {
      const currentValue = this.resolveCurrentValue(signalRow.payload, mkg, hook.condition.metric_path);
      const baselineValue = getPath(mkg, hook.condition.baseline_path);
      const evaluation = evaluateSignalAgainstBaseline({
        currentValue,
        baselineValue,
        operator: hook.condition.operator,
        threshold: hook.condition.threshold,
      });

      if (!evaluation.matched) continue;

      const batch = {
        company_id: signalRow.company_id,
        signal_id: signalRow.id,
        signal_type: signalRow.signal_type,
        hook_id: hook.id,
        triggered_by: "signal",
        trigger_id: signalRow.id,
        trigger_metadata: {
          signal_type: signalRow.signal_type,
          baseline_value: evaluation.baselineValue,
          current_value: evaluation.currentValue,
          delta_pct: evaluation.deltaPct,
          reason: evaluation.reason,
        },
        dispatch: hook.dispatch.map((entry) => ({
          agent: entry.agent,
          task_type: entry.task_type,
          order: entry.order,
        })),
      };

      await this.dispatchHookRun(batch);
      dispatchBatches.push(batch);
      triggeredHookIds.push(hook.id);
    }

    if (dispatchBatches.length > 0) {
      await this.updateSignal(signalRow.id, {
        status: "triggered",
        processed_at: new Date().toISOString(),
        triggered_hook_ids: triggeredHookIds,
        error_message: null,
      });
    } else {
      await this.updateSignal(signalRow.id, {
        status: "ignored",
        processed_at: new Date().toISOString(),
        error_message: "conditions_not_met",
      });
    }

    return dispatchBatches;
  }

  resolveCurrentValue(payload, mkg, metricPath) {
    const payloadCurrent =
      payload && typeof payload === "object"
        ? payload.current_value ?? getPath(payload, metricPath)
        : undefined;

    if (toNumber(payloadCurrent) !== null) {
      return payloadCurrent;
    }

    return getPath(mkg, metricPath);
  }

  async updateSignal(signalId, updates) {
    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from("agent_signals")
      .update(updates)
      .eq("id", signalId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`[hooks-engine] failed to update signal ${signalId}: ${error.message}`);
    }

    return data || null;
  }

  async markSignalFailed(signalId, error) {
    await this.updateSignal(signalId, {
      status: "failed",
      processed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}
