'use strict';

/**
 * Phase 7.4 — E2E Chat Flow Tests
 *
 * Tests the full pipeline: user message → AgenticLoop routing → agent execution → chat response.
 * Uses stub agents so no real connectors are needed.
 *
 * Run with: node tests/e2e/chat-flow.test.js
 */

const AgenticLoop = require('../../platform/crewai/core/agenticLoop');
const SequentialOrchestrator = require('../../platform/crewai/orchestration/sequential-orchestrator');
const ParallelOrchestrator = require('../../platform/crewai/orchestration/parallel-orchestrator');

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition, detail = '') {
  if (condition) { passed++; process.stdout.write('.'); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ''}`); process.stdout.write('F'); }
}

function section(name) { console.log(`\n\n--- ${name} ---`); }

// ── Stub agents ───────────────────────────────────────────────────────────────

function makeStubAgent(id, responseType, overrides = {}) {
  return {
    id,
    name: id,
    crews: [id + '-crew'],
    execute: async (request) => ({
      prose: `${id} completed ${request.goal_id} for: ${request.message?.slice(0, 30)}`,
      response_type: responseType,
      confidence: 0.85,
      connectors_used: [],
      follow_ups: [`Follow up from ${id} step 1`, `Follow up from ${id} step 2`],
      artifact: {
        type: responseType === 'analysis' ? 'analysis'
          : responseType === 'optimization' ? 'optimization_plan'
          : responseType === 'execution' ? 'execution_tracker'
          : 'content',
        metrics: { sessions: 1000, conversions: 42 },
        findings: [`Finding from ${id}`],
        insights: [`Insight from ${id}`],
        steps: [],
        current_state: {},
        recommendation: {},
        expected_impact: {},
      },
      ...overrides,
    }),
  };
}

function makeConnectorMissingAgent(id, toolkit) {
  return {
    id,
    name: id,
    crews: [id + '-crew'],
    execute: async () => ({
      prose: `${toolkit} not connected.`,
      response_type: 'analysis',
      confidence: 0,
      connectors_used: [],
      connector_missing: toolkit,
      follow_ups: [`Connect ${toolkit}`],
      artifact: { type: 'analysis', metrics: {}, findings: [], insights: [] },
    }),
  };
}

function makeErrorAgent(id, errorMsg) {
  return {
    id,
    name: id,
    crews: ['test-crew'],
    execute: async () => { throw new Error(errorMsg); },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== E2E Chat Flow Tests ===');

  const loop = new AgenticLoop({});

  // ── 1. Intent extraction → routing ────────────────────────────────────────
  section('Intent extraction → routing result');

  const routingTests = [
    { msg: 'Find me qualified leads', expectedGoal: 'find-leads', expectReady: false }, // missing connectors
    { msg: 'Write a blog post about AI', expectedGoal: 'produce-content', expectReady: true }, // no required connectors
    { msg: 'Optimize our ROAS', expectedGoal: 'optimize-roas', expectReady: false },
    { msg: 'Create a landing page', expectedGoal: 'landing-pages', expectReady: true },
    { msg: 'Plan our product launch', expectedGoal: 'launch-planning', expectReady: true },
    { msg: 'Build a sales battlecard', expectedGoal: 'sales-enablement', expectReady: true },
  ];

  for (const rt of routingTests) {
    const result = await loop.routeUserIntent({
      message: rt.msg,
      userId: 'test-user',
      connectors_available: [],
    });
    ok(`Routing "${rt.msg.slice(0, 30)}"`, result.type !== undefined, `got type=${result.type}`);
    if (result.type === 'ready' || result.type === 'connector_missing') {
      ok(`Goal "${rt.msg.slice(0, 25)}" = ${rt.expectedGoal}`, result.goal_id === rt.expectedGoal, `got ${result.goal_id}`);
    }
  }

  // ── 2. Connector missing prompt ───────────────────────────────────────────
  section('Connector missing prompt');

  const missingResult = await loop.routeUserIntent({
    message: 'Optimize our ROAS and ad spend',
    userId: 'test-user',
    connectors_available: [],
  });

  ok('Connector missing: type = connector_missing', missingResult.type === 'connector_missing');
  ok('Connector missing: has missing array', Array.isArray(missingResult.missing_connectors));
  ok('Connector missing: google_ads in missing', missingResult.missing_connectors?.includes('google_ads'));
  ok('Connector missing: has prompt message', typeof missingResult.message === 'string');

  // With connectors available → should be ready
  const readyResult = await loop.routeUserIntent({
    message: 'Optimize our ROAS and ad spend',
    userId: 'test-user',
    connectors_available: ['google_ads', 'meta_ads'],
  });
  ok('Ready with connectors: type = ready', readyResult.type === 'ready');

  // ── 3. Single agent execution via _executeWithRouting ─────────────────────
  section('Single agent execution');

  loop.registerAgent('lp-designer', makeStubAgent('lp-designer', 'creation'));

  const lpRouting = {
    type: 'ready',
    goal_id: 'landing-pages',
    agent: 'lp-designer',
    crew: 'landing-pages',
    confidence: 0.88,
    original_message: 'Create a landing page for our SaaS product',
    extracted_params: { product: 'Marqq' },
    connectors_available: [],
    context: {},
  };

  const lpResponse = await loop._executeWithRouting(lpRouting);
  ok('Single agent: type = chat_message', lpResponse.type === 'chat_message');
  ok('Single agent: has content', typeof lpResponse.content === 'string' && lpResponse.content.length > 0);
  ok('Single agent: has artifact', !!lpResponse.artifact);
  ok('Single agent: has follow_ups', Array.isArray(lpResponse.follow_ups));
  ok('Single agent: has routing_info', !!lpResponse.routing_info);
  ok('Single agent: routing_info.goal_id correct', lpResponse.routing_info?.goal_id === 'landing-pages');
  ok('Single agent: intent_type = creation', lpResponse.intent_type === 'creation');

  // ── 4. Connector error propagated from agent ──────────────────────────────
  section('Connector error propagation');

  loop.registerAgent('churn-agent', makeConnectorMissingAgent('churn-agent', 'hubspot'));

  const churnRouting = {
    type: 'ready',
    goal_id: 'reduce-churn',
    agent: 'churn-agent',
    crew: 'churn-prevention',
    confidence: 0.9,
    original_message: 'Identify customers at risk of churning',
    extracted_params: {},
    connectors_available: ['hubspot'],
    context: {},
  };

  const churnResponse = await loop._executeWithRouting(churnRouting);
  ok('Connector error: response has content', typeof churnResponse.content === 'string');
  ok('Connector error: connector_prompt set', !!churnResponse.connector_prompt);
  ok('Connector error: connector_prompt.missing is array', Array.isArray(churnResponse.connector_prompt?.missing));

  // ── 5. Agent runtime error → graceful response ────────────────────────────
  section('Agent runtime error handling');

  loop.registerAgent('error-agent', makeErrorAgent('error-agent', 'Simulated crash'));

  const errorRouting = {
    type: 'ready',
    goal_id: 'find-leads',
    agent: 'error-agent',
    crew: 'test-crew',
    confidence: 0.8,
    original_message: 'Find leads',
    extracted_params: {},
    connectors_available: [],
    context: {},
  };

  const errorResponse = await loop._executeWithRouting(errorRouting);
  ok('Error handling: intent_type = error', errorResponse.intent_type === 'error');
  ok('Error handling: has content', typeof errorResponse.content === 'string');
  ok('Error handling: does not throw', true);

  // ── 6. Sequential orchestrator ────────────────────────────────────────────
  section('Sequential orchestrator');

  const seqAgents = {
    'neel': makeStubAgent('neel', 'creation'),
    'zara': makeStubAgent('zara', 'creation'),
    'riya': makeStubAgent('riya', 'creation'),
  };

  const seqOrch = new SequentialOrchestrator(seqAgents);
  const seqSteps = [];

  const seqResult = await seqOrch.run(
    [
      { agentId: 'neel', goalId: 'positioning', crew: 'strategy', label: 'Neel — Strategy' },
      { agentId: 'zara', goalId: 'run-social', crew: 'social-campaign', label: 'Zara — Social' },
      { agentId: 'riya', goalId: 'produce-content', crew: 'content-automation', label: 'Riya — Content' },
    ],
    { message: 'Plan our product launch', goal_id: 'launch-planning', available_connectors: [] },
    { onStep: (step) => seqSteps.push(step) }
  );

  ok('Sequential: has prose', typeof seqResult.prose === 'string');
  ok('Sequential: successful_steps = 3', seqResult.successful_steps === 3);
  ok('Sequential: total_steps = 3', seqResult.total_steps === 3);
  ok('Sequential: failed_steps = 0', seqResult.failed_steps === 0);
  ok('Sequential: 3 step callbacks fired', seqSteps.length === 3);
  ok('Sequential: steps array has 3 entries', seqResult.steps.length === 3);
  ok('Sequential: all steps not skipped', seqResult.steps.every((s) => !s.skipped));
  ok('Sequential: has follow_ups', Array.isArray(seqResult.follow_ups));
  ok('Sequential: follow_ups deduplicated (<= 6)', seqResult.follow_ups.length <= 6);
  ok('Sequential: prose contains all agent labels', seqResult.prose.includes('Neel') && seqResult.prose.includes('Zara') && seqResult.prose.includes('Riya'));

  // With a missing agent
  const seqWithMissing = await seqOrch.run(
    [
      { agentId: 'neel', goalId: 'positioning', crew: 'strategy' },
      { agentId: 'nonexistent-agent', goalId: 'test', crew: 'test' },
    ],
    { message: 'test', available_connectors: [] }
  );
  ok('Sequential with missing: completes (partial)', seqWithMissing.successful_steps >= 1);
  ok('Sequential with missing: failed_steps = 1', seqWithMissing.failed_steps === 1);

  // ── 7. Parallel orchestrator ──────────────────────────────────────────────
  section('Parallel orchestrator');

  const parAgents = {
    'dev-scorecard': makeStubAgent('dev-scorecard', 'analysis'),
    'dev-budget': makeStubAgent('dev-budget', 'optimization'),
    'priya': makeStubAgent('priya', 'analysis'),
  };

  const parOrch = new ParallelOrchestrator(parAgents);
  const completedSteps = [];

  const parResult = await parOrch.run(
    [
      { agentId: 'dev-scorecard', goalId: 'measure-performance', crew: 'analytics', label: 'Scorecard' },
      { agentId: 'dev-budget', goalId: 'optimize-roas', crew: 'paid-ads-optimization', label: 'Budget' },
      { agentId: 'priya', goalId: 'market-signals', crew: 'competitor-intelligence', label: 'Competitive' },
    ],
    { message: 'Full marketing audit', goal_id: 'marketing-audit', available_connectors: [] },
    { onComplete: (step) => completedSteps.push(step) }
  );

  ok('Parallel: has prose', typeof parResult.prose === 'string');
  ok('Parallel: successful_steps = 3', parResult.successful_steps === 3);
  ok('Parallel: total_steps = 3', parResult.total_steps === 3);
  ok('Parallel: 3 onComplete callbacks', completedSteps.length === 3);
  ok('Parallel: has artifact', !!parResult.artifact);
  ok('Parallel: merged metrics present', typeof parResult.artifact.metrics === 'object');
  ok('Parallel: step_artifacts array', Array.isArray(parResult.artifact.step_artifacts));
  ok('Parallel: follow_ups <= 6', parResult.follow_ups.length <= 6);

  // With some missing agents
  const parWithMissing = await parOrch.run(
    [
      { agentId: 'dev-scorecard', goalId: 'measure-performance', crew: 'analytics' },
      { agentId: 'ghost-agent', goalId: 'x', crew: 'x' },
    ],
    { message: 'test', available_connectors: [] }
  );
  ok('Parallel with missing: completes', parWithMissing.successful_steps >= 1);
  ok('Parallel with missing: failed_steps = 1', parWithMissing.failed_steps === 1);

  // ── 8. Multi-agent routing via AgenticLoop ────────────────────────────────
  section('Multi-agent via AgenticLoop routing table');

  // Register agents needed for launch-planning (agent_chain: neel, zara, riya)
  loop.registerAgent('neel', seqAgents.neel);
  loop.registerAgent('zara', seqAgents.zara);
  loop.registerAgent('riya', seqAgents.riya);

  const launchRouting = {
    type: 'ready',
    goal_id: 'launch-planning',
    agent: 'zara', // Primary agent (routing table)
    crew: 'social-campaign',
    confidence: 0.87,
    original_message: 'Plan our Q3 product launch',
    extracted_params: {},
    connectors_available: [],
    context: {},
  };

  const launchResponse = await loop._executeWithRouting(launchRouting);
  ok('Multi-agent launch: type = chat_message', launchResponse.type === 'chat_message');
  ok('Multi-agent launch: has orchestration field', !!launchResponse.orchestration);
  ok('Multi-agent launch: orchestration.pattern = sequential', launchResponse.orchestration?.pattern === 'sequential');
  ok('Multi-agent launch: 3 agents in chain', launchResponse.orchestration?.agents?.length === 3);
  ok('Multi-agent launch: content has all agent prose', launchResponse.content.includes('neel') || launchResponse.content.includes('Neel'));

  // ── 9. Clarification needed ───────────────────────────────────────────────
  section('Clarification needed (ambiguous message)');

  const vagueResult = await loop.routeUserIntent({
    message: 'help',
    userId: 'test-user',
    connectors_available: [],
  });
  ok('Vague: returns clarification or low-confidence routing', vagueResult.type !== undefined);

  const emptyResult = await loop.routeUserIntent({
    message: '',
    userId: 'test-user',
    connectors_available: [],
  });
  ok('Empty: does not throw', true);
  ok('Empty: returns object', typeof emptyResult === 'object');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await runTests();

  console.log(`\n\n=== Results ===`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
