'use strict';

/**
 * Phase 8.3 — Request Tracer & Metrics Collector
 *
 * Lightweight in-process tracing for the agentic platform.
 * No external dependencies — uses a Map to track active spans
 * and a rolling buffer for completed trace records.
 *
 * What it tracks:
 *   • Request traces (intent → routing → agent → response)
 *   • Intent accuracy (predicted goal vs user-confirmed goal)
 *   • Connector success / failure rates per toolkit
 *   • Agent execution latency distribution
 *   • Error rates per goal and per agent
 *
 * Usage:
 *   const { tracer } = require('./observability/tracer');
 *
 *   // Start a trace for an incoming chat request
 *   const span = tracer.startRequest({ requestId: 'req-001', userId: 'u-1', message: 'Find leads' });
 *
 *   span.setRouting({ goalId: 'find-leads', confidence: 0.9, agentId: 'kiran' });
 *   span.setAgent({ agentId: 'kiran', responseType: 'discovery' });
 *   span.setConnector({ toolkit: 'apollo', success: true, latencyMs: 240 });
 *   span.finish({ success: true });
 *
 *   tracer.recordIntentAccuracy({ predicted: 'find-leads', confirmed: 'find-leads' });
 *
 *   // Get dashboard snapshot
 *   const dashboard = tracer.getDashboard();
 */

const { logger } = require('./logger');

// ── Span ───────────────────────────────────────────────────────────────────────

class Span {
  constructor(requestId, meta) {
    this.requestId  = requestId;
    this.startMs    = Date.now();
    this.meta       = meta;          // { userId, message }
    this.routing    = null;          // { goalId, confidence, agentId, latencyMs }
    this.agent      = null;          // { agentId, responseType, latencyMs, fromCache }
    this.connectors = [];            // [{ toolkit, success, latencyMs }]
    this.error      = null;
    this.endMs      = null;
    this._log       = logger.child({ requestId });
  }

  setRouting(data) {
    this.routing = { ...data, latencyMs: Date.now() - this.startMs };
    this._log.debug('Routing resolved', { goalId: data.goalId, confidence: data.confidence });
  }

  setAgent(data) {
    const routingMs = this.routing?.latencyMs ?? 0;
    this.agent = { ...data, latencyMs: Date.now() - this.startMs - routingMs };
    this._log.debug('Agent assigned', { agentId: data.agentId });
  }

  setConnector(data) {
    this.connectors.push({ ...data });
    const status = data.success ? 'ok' : 'fail';
    this._log.debug(`Connector ${status}`, { toolkit: data.toolkit, latencyMs: data.latencyMs });
  }

  setError(err) {
    this.error = { message: err.message, stack: err.stack };
    this._log.error('Request error', { err: err.message });
  }

  finish({ success = true } = {}) {
    this.endMs     = Date.now();
    this.durationMs = this.endMs - this.startMs;
    this.success    = success;

    this._log.info('Request finished', {
      goalId:     this.routing?.goalId,
      agentId:    this.agent?.agentId,
      durationMs: this.durationMs,
      success,
    });
  }

  toRecord() {
    return {
      requestId:   this.requestId,
      userId:      this.meta?.userId,
      goalId:      this.routing?.goalId ?? null,
      agentId:     this.agent?.agentId ?? null,
      responseType: this.agent?.responseType ?? null,
      confidence:  this.routing?.confidence ?? null,
      fromCache:   this.agent?.fromCache ?? false,
      connectors:  this.connectors,
      durationMs:  this.durationMs ?? null,
      success:     this.success ?? false,
      error:       this.error,
      ts:          this.startMs,
    };
  }
}

// ── Tracer ─────────────────────────────────────────────────────────────────────

class Tracer {
  constructor({ maxBuffer = 2000 } = {}) {
    this._active   = new Map();   // requestId → Span
    this._buffer   = [];          // completed Span records
    this._maxBuffer = maxBuffer;

    // Intent accuracy tracking
    this._intentTotal   = 0;
    this._intentCorrect = 0;

    // Connector stats — toolkit → { calls, successes, totalLatencyMs }
    this._connectorStats = {};

    // Agent latency — agentId → [latencyMs, ...]
    this._agentLatencies = {};

    // Error counts — key → count
    this._errors = {};
  }

  // ── Span lifecycle ──────────────────────────────────────────────────────────

  /**
   * Start a new request span.
   * @param {Object} meta - { requestId, userId, message }
   * @returns {Span}
   */
  startRequest(meta = {}) {
    const requestId = meta.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const span = new Span(requestId, meta);
    this._active.set(requestId, span);
    return span;
  }

  /**
   * Finish a span (called automatically from span.finish() — can also call directly).
   * Moves span to buffer and updates aggregates.
   * @param {Span} span
   */
  finishSpan(span) {
    if (!span.endMs) span.finish();

    const record = span.toRecord();
    this._active.delete(span.requestId);

    // Rolling buffer
    this._buffer.push(record);
    if (this._buffer.length > this._maxBuffer) this._buffer.shift();

    // Update connector stats
    for (const c of record.connectors) {
      if (!this._connectorStats[c.toolkit]) {
        this._connectorStats[c.toolkit] = { calls: 0, successes: 0, totalLatencyMs: 0 };
      }
      const s = this._connectorStats[c.toolkit];
      s.calls++;
      if (c.success) s.successes++;
      if (c.latencyMs) s.totalLatencyMs += c.latencyMs;
    }

    // Update agent latency
    if (record.agentId && record.durationMs) {
      if (!this._agentLatencies[record.agentId]) this._agentLatencies[record.agentId] = [];
      const arr = this._agentLatencies[record.agentId];
      arr.push(record.durationMs);
      if (arr.length > 500) arr.shift(); // keep last 500 per agent
    }

    // Update error counts
    if (!record.success) {
      const errorKey = record.goalId ?? 'unknown';
      this._errors[errorKey] = (this._errors[errorKey] ?? 0) + 1;
    }

    return record;
  }

  // ── Intent accuracy ─────────────────────────────────────────────────────────

  /**
   * Record whether the routing intent matched the user's confirmed intent.
   * Call this when the user confirms or corrects the routing.
   *
   * @param {{ predicted: string, confirmed: string }}
   */
  recordIntentAccuracy({ predicted, confirmed }) {
    this._intentTotal++;
    if (predicted === confirmed) this._intentCorrect++;
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  getDashboard() {
    const now = Date.now();
    const oneHour = 60 * 60_000;
    const recentHour = this._buffer.filter((r) => now - r.ts < oneHour);

    // Overall success rate
    const totalFinished = this._buffer.length;
    const successful    = this._buffer.filter((r) => r.success).length;
    const errorRate     = totalFinished > 0
      ? +(((totalFinished - successful) / totalFinished) * 100).toFixed(1)
      : 0;

    // Latency percentiles across all requests
    const allLatencies = this._buffer.map((r) => r.durationMs).filter(Boolean).sort((a, b) => a - b);
    const p50 = percentile(allLatencies, 50);
    const p95 = percentile(allLatencies, 95);
    const p99 = percentile(allLatencies, 99);

    // Cache hit rate
    const cached    = this._buffer.filter((r) => r.fromCache).length;
    const cacheRate = totalFinished > 0 ? +((cached / totalFinished) * 100).toFixed(1) : 0;

    // Intent accuracy
    const intentAccuracyPct = this._intentTotal > 0
      ? +((this._intentCorrect / this._intentTotal) * 100).toFixed(1)
      : null;

    // Connector health
    const connectorHealth = Object.entries(this._connectorStats).map(([toolkit, s]) => ({
      toolkit,
      calls:      s.calls,
      successRate: +((s.successes / s.calls) * 100).toFixed(1),
      avgLatencyMs: s.calls > 0 ? Math.round(s.totalLatencyMs / s.calls) : null,
    }));

    // Agent latency breakdown
    const agentStats = Object.entries(this._agentLatencies).map(([agentId, arr]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        agentId,
        calls: arr.length,
        p50:   percentile(sorted, 50),
        p95:   percentile(sorted, 95),
        avg:   Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      };
    });

    // Goal distribution (last hour)
    const goalDist = {};
    for (const r of recentHour) {
      if (r.goalId) goalDist[r.goalId] = (goalDist[r.goalId] ?? 0) + 1;
    }
    const topGoals = Object.entries(goalDist)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([goalId, count]) => ({ goalId, count }));

    return {
      total_requests:    totalFinished,
      active_requests:   this._active.size,
      error_rate_pct:    errorRate,
      cache_hit_rate_pct: cacheRate,
      latency: { p50_ms: p50, p95_ms: p95, p99_ms: p99 },
      intent_accuracy_pct: intentAccuracyPct,
      intent_total:      this._intentTotal,
      last_hour: {
        requests:  recentHour.length,
        successes: recentHour.filter((r) => r.success).length,
      },
      connector_health:  connectorHealth,
      agent_stats:       agentStats,
      top_goals_last_hour: topGoals,
      errors_by_goal:    Object.entries(this._errors).map(([goalId, count]) => ({ goalId, count })),
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Singleton export ───────────────────────────────────────────────────────────

const tracer = new Tracer();

// Auto-expose dashboard on SIGINT in dev (useful for local debugging)
if (process.env.NODE_ENV !== 'production') {
  process.once('SIGINT', () => {
    try {
      const d = tracer.getDashboard();
      process.stderr.write('\n[Tracer] Dashboard snapshot:\n' + JSON.stringify(d, null, 2) + '\n');
    } catch (_) { /* ignore */ }
  });
}

module.exports = Tracer;
module.exports.tracer = tracer;
