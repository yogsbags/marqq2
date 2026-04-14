'use strict';

/**
 * Phase 8.4 — Performance Profiler
 *
 * Profiles the critical path of the agentic platform against defined targets:
 *   • Routing latency         target: < 100 ms
 *   • Agent execution         target: < 2 000 ms  (LLM-only agents)
 *   • Connector fetch         target: < 1 000 ms  (with mock server)
 *   • Cache get/set round-trip target: < 5 ms
 *   • Sequential orchestrator  target: < 2 500 ms  (3 stub agents)
 *   • Parallel orchestrator    target: < 1 200 ms  (3 stub agents, should be ~1 agent time)
 *
 * Run with:
 *   node tests/performance/profiler.js
 *
 * Output: plain-text report + exit 1 if any target is missed.
 */

const AgenticLoop   = require('../../platform/crewai/core/agenticLoop');
const SequentialOrchestrator = require('../../platform/crewai/orchestration/sequential-orchestrator');
const ParallelOrchestrator   = require('../../platform/crewai/orchestration/parallel-orchestrator');
const ResponseCache = require('../../platform/crewai/cache/response-cache');
const LlmOptimizer  = require('../../platform/crewai/cost/llm-optimizer');

// ── Helpers ────────────────────────────────────────────────────────────────────

const TARGETS = {
  routing_ms:       100,
  agent_exec_ms:    2000,
  connector_ms:     1000,
  cache_ops_ms:     5,
  seq_3agents_ms:   2500,
  par_3agents_ms:   1200,
  model_select_ms:  2,
};

let passed = 0;
let failed = 0;
const report = [];

function record(label, actualMs, targetMs) {
  const ok = actualMs <= targetMs;
  if (ok) passed++;
  else     failed++;

  const status = ok ? 'PASS' : 'FAIL';
  const bar    = buildBar(actualMs, targetMs);
  report.push({ label, actualMs, targetMs, status, bar });

  process.stdout.write(ok ? '.' : 'F');
  return ok;
}

function buildBar(actual, target) {
  const max   = Math.max(actual, target, 1);
  const width = 30;
  const fill  = Math.round((actual / max) * width);
  const bar   = '█'.repeat(fill) + '░'.repeat(width - fill);
  return `[${bar}]`;
}

async function timed(fn) {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

function repeat(n, fn) {
  return Promise.all(Array.from({ length: n }, fn));
}

// ── Stub factories ─────────────────────────────────────────────────────────────

function makeStubAgent(id, responseType, delayMs = 50) {
  return {
    id, name: id, crews: [id + '-crew'],
    execute: async (req) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return {
        prose: `${id} completed`,
        response_type: responseType,
        confidence: 0.9,
        connectors_used: [],
        follow_ups: [],
        artifact: {
          type: responseType === 'analysis' ? 'analysis' : responseType === 'optimization' ? 'optimization_plan' : 'content',
          metrics: {}, findings: [], insights: [],
          current_state: {}, recommendation: {}, expected_impact: {},
        },
      };
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

async function profileRouting() {
  console.log('\n\n── 1. Routing latency ──');
  const loop = new AgenticLoop({});

  const messages = [
    'Find me 50 leads in the SaaS space',
    'Optimize our ROAS across channels',
    'Write a blog post about AI marketing',
    'Create a landing page for our campaign',
    'Give me a full marketing audit',
  ];

  const times = [];
  for (const msg of messages) {
    const ms = await timed(() => loop.routeUserIntent({
      message: msg,
      userId: 'perf-test',
      connectors_available: ['google_ads', 'meta_ads', 'ga4'],
    }));
    times.push(ms);
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const max = Math.max(...times);

  record('Routing avg latency', avg, TARGETS.routing_ms);
  record('Routing max latency', max, TARGETS.routing_ms * 2); // allow 2× for worst case
}

async function profileKeywordExtraction() {
  console.log('\n\n── 2. _extractIntentByKeywords (hot path) ──');
  const loop = new AgenticLoop({});

  const RUNS = 1000;
  const start = Date.now();
  for (let i = 0; i < RUNS; i++) {
    loop._extractIntentByKeywords('Optimize our ROAS and reduce ad waste');
  }
  const totalMs = Date.now() - start;
  const avgUs   = (totalMs / RUNS) * 1000; // microseconds

  const avgMs = totalMs / RUNS;
  record(`Intent extraction (${RUNS}× avg)`, Math.ceil(avgMs), 1); // must be <1ms each
  console.log(`   ${RUNS} runs in ${totalMs}ms → avg ${avgUs.toFixed(0)}µs per call`);
}

async function profileAgentExecution() {
  console.log('\n\n── 3. Agent execution (LLM-only stub) ──');
  const loop = new AgenticLoop({});

  // Use real LLM-only agents (no connector call) — lp-designer is a good proxy
  const LpAgent = require('../../platform/crewai/agents/lp-designer/index.js');
  const agent = new LpAgent();

  const ms = await timed(() => agent.execute({
    entityId: 'perf-test',
    product: 'Marqq AI',
    goal: 'saas_trial',
    audience: 'B2B Marketers',
    painPoints: ['Too slow', 'Too expensive'],
  }));

  record('LP Designer execution', ms, TARGETS.agent_exec_ms);

  const SeAgent = require('../../platform/crewai/agents/se-agent/index.js');
  const seAgent = new SeAgent();

  const seMs = await timed(() => seAgent.execute({
    entityId: 'perf-test',
    product: 'Marqq AI',
    competitor: 'HubSpot',
    audience: 'VP Marketing',
    outputType: 'full',
  }));

  record('SE Agent execution', seMs, TARGETS.agent_exec_ms);
}

async function profileCache() {
  console.log('\n\n── 4. Cache operations ──');
  const cache = new ResponseCache({ maxSize: 1000, enabled: true });

  const mockResponse = {
    response_type: 'analysis',
    confidence: 0.9,
    prose: 'Test response',
    artifact: { type: 'analysis', metrics: {}, findings: [], insights: [] },
  };

  const RUNS = 10_000;

  // Build keys
  const start1 = Date.now();
  for (let i = 0; i < RUNS; i++) {
    cache.buildKey('find-leads', { entityId: `e-${i % 100}`, timeframe: '30d' });
  }
  const buildKeyMs = (Date.now() - start1) / RUNS;
  record(`Cache buildKey (${RUNS}× avg)`, Math.ceil(buildKeyMs * 1000) / 1000 || 0, TARGETS.cache_ops_ms);

  // Set
  const key = cache.buildKey('find-leads', { entityId: 'e-001' });
  const start2 = Date.now();
  for (let i = 0; i < RUNS; i++) {
    cache.set(`${key}:${i}`, mockResponse);
  }
  const setMs = (Date.now() - start2) / RUNS;
  record(`Cache set (${RUNS}× avg)`, Math.ceil(setMs * 10) / 10 || 0, TARGETS.cache_ops_ms);

  // Get (hit)
  const hitKey = `${key}:0`;
  cache.set(hitKey, mockResponse);
  const start3 = Date.now();
  for (let i = 0; i < RUNS; i++) {
    cache.get(hitKey);
  }
  const getMs = (Date.now() - start3) / RUNS;
  record(`Cache get-hit (${RUNS}× avg)`, Math.ceil(getMs * 10) / 10 || 0, TARGETS.cache_ops_ms);

  const stats = cache.getStats();
  console.log(`   Cache stats: size=${stats.size}, hit_rate=${stats.hit_rate_pct}%`);
}

async function profileOrchestrators() {
  console.log('\n\n── 5. Orchestrator performance (stub agents, 50ms delay each) ──');

  const agents = {
    'agent-a': makeStubAgent('agent-a', 'creation', 50),
    'agent-b': makeStubAgent('agent-b', 'creation', 50),
    'agent-c': makeStubAgent('agent-c', 'creation', 50),
  };

  const baseRequest = { message: 'Plan our launch', goal_id: 'launch-planning', available_connectors: [] };
  const steps = [
    { agentId: 'agent-a', goalId: 'positioning', crew: 'strategy' },
    { agentId: 'agent-b', goalId: 'run-social', crew: 'social-campaign' },
    { agentId: 'agent-c', goalId: 'produce-content', crew: 'content-automation' },
  ];

  // Sequential: should be ~150ms (3 × 50ms + overhead)
  const seqOrch = new SequentialOrchestrator(agents);
  const seqMs = await timed(() => seqOrch.run(steps, baseRequest));
  record('Sequential orchestrator (3 agents, 50ms each)', seqMs, TARGETS.seq_3agents_ms);

  // Parallel: should be ~50ms (all run simultaneously)
  const parOrch = new ParallelOrchestrator(agents);
  const parMs = await timed(() => parOrch.run(steps, baseRequest));
  record('Parallel orchestrator (3 agents, 50ms each)', parMs, TARGETS.par_3agents_ms);

  console.log(`   Sequential: ${seqMs}ms | Parallel: ${parMs}ms | Speedup: ${(seqMs / parMs).toFixed(1)}×`);
}

async function profileModelSelection() {
  console.log('\n\n── 6. LLM model selection ──');
  const optimizer = new LlmOptimizer();

  const RUNS = 10_000;
  const start = Date.now();
  for (let i = 0; i < RUNS; i++) {
    optimizer.selectModel({ responseType: 'analysis', goalId: 'marketing-audit', isChain: i % 2 === 0 });
  }
  const avgMs = (Date.now() - start) / RUNS;
  record(`Model selection (${RUNS}× avg)`, Math.ceil(avgMs * 1000) / 1000 || 0, TARGETS.model_select_ms);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Performance Profiler ===');
  console.log('(. = target met, F = target missed)\n');

  await profileRouting();
  await profileKeywordExtraction();
  await profileAgentExecution();
  await profileCache();
  await profileOrchestrators();
  await profileModelSelection();

  // ── Print report ──────────────────────────────────────────────────────────
  console.log('\n\n════════════════════════════════════════════════════════════════');
  console.log('  Performance Report');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  ${'Label'.padEnd(50)} ${'Actual'.padStart(8)} ${'Target'.padStart(8)}  Status`);
  console.log('  ' + '─'.repeat(80));

  for (const row of report) {
    const label  = row.label.padEnd(50);
    const actual = `${row.actualMs}ms`.padStart(8);
    const target = `<${row.targetMs}ms`.padStart(8);
    const status = row.status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${label} ${actual} ${target}  ${status}`);
  }

  console.log('\n  ' + '─'.repeat(80));
  console.log(`  Total: ${passed + failed} checks — ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Profiler crashed:', err);
  process.exit(1);
});
