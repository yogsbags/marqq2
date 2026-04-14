'use strict';

/**
 * Phase 8.2 — LLM Cost Optimizer
 *
 * Routes intents to the cheapest model that can handle them reliably.
 * Tracks per-request cost and surfaces a cost dashboard.
 *
 * Model tiers (cheapest → most capable):
 *   tier-1  groq/llama-3.1-8b-instant        ≈ $0.00  (free tier up to quota)
 *   tier-2  groq/llama-3.3-70b-versatile      ≈ $0.00  (free tier up to quota)
 *   tier-3  openai/gpt-4o-mini                ≈ $0.15 / 1M input tokens
 *   tier-4  openai/gpt-4o                     ≈ $2.50 / 1M input tokens
 *   tier-5  anthropic/claude-opus-4-6         ≈ $15.00 / 1M input tokens
 *
 * Routing rules (in priority order):
 *   • creation  intents with short output   → tier-2 (structured templates, no reasoning)
 *   • analysis  with connector data         → tier-2 (arithmetic + formatting only)
 *   • discovery                             → tier-2 (list retrieval + scoring)
 *   • optimization                          → tier-3 (multi-variable trade-offs)
 *   • execution with live data anomalies    → tier-3 (threshold logic)
 *   • multi-step chain (orchestration)      → tier-4 (synthesis across agents)
 *   • fallback / unknown                    → tier-2
 *
 * Usage:
 *   const { model, estimatedCostUsd } = LlmOptimizer.selectModel({ responseType, goalId, isChain });
 *   LlmOptimizer.trackUsage({ model, inputTokens, outputTokens, goalId, requestId });
 *   LlmOptimizer.getCostDashboard();
 */

// ── Model registry ─────────────────────────────────────────────────────────────

const MODELS = {
  'groq/llama-3.1-8b-instant': {
    provider: 'groq',
    id: 'llama-3.1-8b-instant',
    tier: 1,
    inputCostPer1M:  0.05,  // USD (approximate paid tier)
    outputCostPer1M: 0.08,
    maxOutputTokens: 8192,
    strengths: ['fast', 'simple-classification', 'short-generation'],
  },
  'groq/llama-3.3-70b-versatile': {
    provider: 'groq',
    id: 'llama-3.3-70b-versatile',
    tier: 2,
    inputCostPer1M:  0.59,
    outputCostPer1M: 0.79,
    maxOutputTokens: 32768,
    strengths: ['analysis', 'creation', 'discovery', 'structured-output'],
  },
  'openai/gpt-4o-mini': {
    provider: 'openai',
    id: 'gpt-4o-mini',
    tier: 3,
    inputCostPer1M:  0.15,
    outputCostPer1M: 0.60,
    maxOutputTokens: 16384,
    strengths: ['optimization', 'multi-step-reasoning', 'code'],
  },
  'openai/gpt-4o': {
    provider: 'openai',
    id: 'gpt-4o',
    tier: 4,
    inputCostPer1M:  2.50,
    outputCostPer1M: 10.00,
    maxOutputTokens: 16384,
    strengths: ['complex-reasoning', 'synthesis', 'long-context'],
  },
  'anthropic/claude-opus-4-6': {
    provider: 'anthropic',
    id: 'claude-opus-4-6',
    tier: 5,
    inputCostPer1M:  15.00,
    outputCostPer1M: 75.00,
    maxOutputTokens: 4096,
    strengths: ['nuanced-reasoning', 'strategic-synthesis', 'multi-agent-chain'],
  },
};

// ── Routing rules ──────────────────────────────────────────────────────────────

/**
 * Maps (responseType × complexity) → model key.
 *
 * Complexity levels:
 *   'low'    — simple / structured / no reasoning chain
 *   'medium' — moderate trade-off analysis
 *   'high'   — multi-variable or multi-agent synthesis
 */
const ROUTING_TABLE = {
  analysis: {
    low:    'groq/llama-3.3-70b-versatile',
    medium: 'groq/llama-3.3-70b-versatile',
    high:   'openai/gpt-4o-mini',
  },
  optimization: {
    low:    'groq/llama-3.3-70b-versatile',
    medium: 'openai/gpt-4o-mini',
    high:   'openai/gpt-4o',
  },
  creation: {
    low:    'groq/llama-3.3-70b-versatile',
    medium: 'groq/llama-3.3-70b-versatile',
    high:   'openai/gpt-4o-mini',
  },
  discovery: {
    low:    'groq/llama-3.3-70b-versatile',
    medium: 'groq/llama-3.3-70b-versatile',
    high:   'openai/gpt-4o-mini',
  },
  execution: {
    low:    'groq/llama-3.1-8b-instant',
    medium: 'groq/llama-3.3-70b-versatile',
    high:   'openai/gpt-4o-mini',
  },
  default: {
    low:    'groq/llama-3.3-70b-versatile',
    medium: 'groq/llama-3.3-70b-versatile',
    high:   'openai/gpt-4o-mini',
  },
};

// Goals that are always complex (synthesis across multiple data sources)
const HIGH_COMPLEXITY_GOALS = new Set([
  'marketing-audit',
  'revenue-ops',
  'understand-market',
  'market-signals',
  'channel-health',
]);

// Goals that are always low complexity (template-based, no deep reasoning)
const LOW_COMPLEXITY_GOALS = new Set([
  'produce-content',
  'social-calendar',
  'email-sequences',
  'landing-pages',
  'sales-enablement',
]);

// ── Cost tracker ───────────────────────────────────────────────────────────────

class CostTracker {
  constructor() {
    // Rolling window: last 1000 requests
    this._requests = [];
    this._maxRequests = 1000;
    this._totalCostUsd = 0;
    this._byModel = {};     // modelKey → { calls, inputTokens, outputTokens, costUsd }
    this._byGoal = {};      // goalId  → { calls, costUsd }
    this._byResponseType = {}; // responseType → { calls, costUsd }
  }

  /**
   * Record a completed LLM call.
   *
   * @param {Object} usage
   * @param {string} usage.model - Full model key (e.g. 'groq/llama-3.3-70b-versatile')
   * @param {number} usage.inputTokens
   * @param {number} usage.outputTokens
   * @param {string} [usage.goalId]
   * @param {string} [usage.responseType]
   * @param {string} [usage.requestId]
   * @param {number} [usage.latencyMs]
   */
  record(usage) {
    const modelDef = MODELS[usage.model];
    if (!modelDef) return;

    const inputCost  = (usage.inputTokens  / 1_000_000) * modelDef.inputCostPer1M;
    const outputCost = (usage.outputTokens / 1_000_000) * modelDef.outputCostPer1M;
    const totalCost  = inputCost + outputCost;

    const entry = {
      ts: Date.now(),
      model: usage.model,
      inputTokens:  usage.inputTokens  ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      costUsd: totalCost,
      goalId: usage.goalId ?? 'unknown',
      responseType: usage.responseType ?? 'unknown',
      requestId: usage.requestId ?? null,
      latencyMs: usage.latencyMs ?? null,
    };

    // Rolling window
    this._requests.push(entry);
    if (this._requests.length > this._maxRequests) {
      this._requests.shift();
    }

    // Aggregate by model
    if (!this._byModel[usage.model]) {
      this._byModel[usage.model] = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
    const m = this._byModel[usage.model];
    m.calls++;
    m.inputTokens  += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.costUsd      += totalCost;

    // Aggregate by goal
    if (!this._byGoal[entry.goalId]) {
      this._byGoal[entry.goalId] = { calls: 0, costUsd: 0 };
    }
    this._byGoal[entry.goalId].calls++;
    this._byGoal[entry.goalId].costUsd += totalCost;

    // Aggregate by response type
    if (!this._byResponseType[entry.responseType]) {
      this._byResponseType[entry.responseType] = { calls: 0, costUsd: 0 };
    }
    this._byResponseType[entry.responseType].calls++;
    this._byResponseType[entry.responseType].costUsd += totalCost;

    this._totalCostUsd += totalCost;

    return { costUsd: totalCost, entry };
  }

  /**
   * Return a cost dashboard snapshot.
   */
  getDashboard() {
    const now = Date.now();
    const oneHour = 60 * 60_000;
    const oneDay  = 24 * oneHour;

    const recentHour = this._requests.filter((r) => now - r.ts < oneHour);
    const recentDay  = this._requests.filter((r) => now - r.ts < oneDay);

    const sumCost = (arr) => arr.reduce((acc, r) => acc + r.costUsd, 0);

    // Top expensive goals
    const goalRank = Object.entries(this._byGoal)
      .sort(([, a], [, b]) => b.costUsd - a.costUsd)
      .slice(0, 10)
      .map(([goalId, stats]) => ({ goalId, ...stats }));

    // Model utilisation
    const modelUtilisation = Object.entries(this._byModel).map(([model, stats]) => ({
      model,
      tier: MODELS[model]?.tier ?? '?',
      ...stats,
      avgCostPerCall: stats.calls > 0 ? stats.costUsd / stats.calls : 0,
    }));

    // Average latency
    const latencies = this._requests.filter((r) => r.latencyMs != null).map((r) => r.latencyMs);
    const avgLatencyMs = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    return {
      total_requests: this._requests.length,
      total_cost_usd: +this._totalCostUsd.toFixed(6),
      last_hour: {
        requests: recentHour.length,
        cost_usd: +sumCost(recentHour).toFixed(6),
      },
      last_24h: {
        requests: recentDay.length,
        cost_usd: +sumCost(recentDay).toFixed(6),
      },
      by_model: modelUtilisation,
      by_response_type: Object.entries(this._byResponseType).map(([type, s]) => ({ type, ...s })),
      top_goals_by_cost: goalRank,
      avg_latency_ms: avgLatencyMs,
      window_size: this._maxRequests,
    };
  }
}

// ── LlmOptimizer ──────────────────────────────────────────────────────────────

class LlmOptimizer {
  constructor() {
    this._tracker = new CostTracker();
  }

  // ── Model selection ─────────────────────────────────────────────────────────

  /**
   * Select the optimal model for a given request context.
   *
   * @param {Object} ctx
   * @param {string}  [ctx.responseType='default']  - analysis | optimization | creation | discovery | execution
   * @param {string}  [ctx.goalId]                  - goal ID from routing table
   * @param {boolean} [ctx.isChain=false]            - whether this is a multi-agent chain step
   * @param {number}  [ctx.estimatedInputTokens=0]   - rough prompt token estimate
   * @param {string}  [ctx.forceModel]               - bypass routing (for overrides)
   * @returns {{ model: string, provider: string, modelId: string, tier: number, estimatedCostUsd: number }}
   */
  selectModel(ctx = {}) {
    if (ctx.forceModel && MODELS[ctx.forceModel]) {
      const def = MODELS[ctx.forceModel];
      return this._buildSelection(ctx.forceModel, def, ctx.estimatedInputTokens ?? 0);
    }

    const responseType = ctx.responseType ?? 'default';
    const goalId = ctx.goalId ?? '';
    const isChain = ctx.isChain ?? false;

    // Determine complexity
    let complexity = this._inferComplexity(responseType, goalId, isChain);

    // Look up routing table
    const typeRoutes = ROUTING_TABLE[responseType] ?? ROUTING_TABLE.default;
    const modelKey   = typeRoutes[complexity] ?? typeRoutes.medium;
    const def        = MODELS[modelKey];

    return this._buildSelection(modelKey, def, ctx.estimatedInputTokens ?? 0);
  }

  /**
   * Record a completed LLM call for cost tracking.
   *
   * @param {Object} usage - See CostTracker.record()
   */
  trackUsage(usage) {
    return this._tracker.record(usage);
  }

  /**
   * Return the cost dashboard.
   */
  getCostDashboard() {
    return this._tracker.getDashboard();
  }

  /**
   * Estimate cost before running (based on token estimate).
   *
   * @param {string} modelKey
   * @param {number} estimatedInputTokens
   * @param {number} [estimatedOutputTokens=500]
   * @returns {number} Estimated USD
   */
  estimateCost(modelKey, estimatedInputTokens, estimatedOutputTokens = 500) {
    const def = MODELS[modelKey];
    if (!def) return 0;
    const inCost  = (estimatedInputTokens  / 1_000_000) * def.inputCostPer1M;
    const outCost = (estimatedOutputTokens / 1_000_000) * def.outputCostPer1M;
    return +(inCost + outCost).toFixed(8);
  }

  /**
   * List all available models with their specs.
   */
  listModels() {
    return Object.entries(MODELS).map(([key, def]) => ({ key, ...def }));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _inferComplexity(responseType, goalId, isChain) {
    // Multi-agent chains always get higher models
    if (isChain) return 'high';

    if (HIGH_COMPLEXITY_GOALS.has(goalId)) return 'high';
    if (LOW_COMPLEXITY_GOALS.has(goalId))  return 'low';

    // Response-type heuristics
    if (responseType === 'execution') return 'low';    // mostly threshold checks
    if (responseType === 'creation')  return 'low';    // structured templates
    if (responseType === 'discovery') return 'medium';
    if (responseType === 'analysis')  return 'medium';
    if (responseType === 'optimization') return 'medium';

    return 'medium';
  }

  _buildSelection(modelKey, def, estimatedInputTokens) {
    const estimatedOutputTokens = 600; // conservative default
    return {
      model: modelKey,
      provider: def.provider,
      modelId: def.id,
      tier: def.tier,
      estimatedCostUsd: this.estimateCost(modelKey, estimatedInputTokens, estimatedOutputTokens),
    };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

const defaultOptimizer = new LlmOptimizer();

module.exports = LlmOptimizer;
module.exports.defaultOptimizer = defaultOptimizer;
module.exports.MODELS = MODELS;
module.exports.ROUTING_TABLE = ROUTING_TABLE;
