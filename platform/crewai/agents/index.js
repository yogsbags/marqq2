'use strict';

/**
 * Agent Bootstrap — register all agent implementations with an AgenticLoop instance.
 *
 * Usage (in backend-server.js or wherever AgenticLoop is instantiated):
 *
 *   const AgenticLoop = require('./core/agenticLoop');
 *   const { registerAllAgents } = require('./agents');
 *
 *   const loop = new AgenticLoop({ ... });
 *   registerAllAgents(loop);
 *
 * Alternatively, import createLoop() which does both steps.
 */

// ── Phase-7 agents (connector-dependent) ─────────────────────────────────────
const ChurnAgent      = require('./churn-agent/index.js');
const DevBudgetAgent  = require('./dev-budget/index.js');
const DevScorecardAgent = require('./dev-scorecard/index.js');
const PaidAdsAgent    = require('./paid-ads-agent/index.js');
const CroAgent        = require('./cro-agent/index.js');

// ── Phase-7 agents (LLM-only) ─────────────────────────────────────────────────
const LpDesignerAgent = require('./lp-designer/index.js');
const SeAgent         = require('./se-agent/index.js');

// ── Phase-9 agents — all 32 goals covered ─────────────────────────────────────
const ArjunAgent = require('./arjun/index.js');  // find-leads, enrich-leads, define-audiences, referral-program, revenue-ops
const RiyaAgent  = require('./riya/index.js');   // produce-content, generate-creatives, create-magnets
const ZaraAgent  = require('./zara/index.js');   // run-social, social-calendar, launch-planning (chain)
const NeelAgent  = require('./neel/index.js');   // positioning (+ launch-planning chain anchor)
const PriyaAgent = require('./priya/index.js');  // market-signals, understand-market
const SamAgent   = require('./sam/index.js');    // build-sequences, email-sequences, sharpen-messaging
const MayaAgent  = require('./maya/index.js');   // seo-visibility
const IshaAgent  = require('./isha/index.js');   // market-research
const TaraAgent  = require('./tara/index.js');   // strengthen-offer
const KiranAgent = require('./kiran/index.js');  // lifecycle-engagement

/**
 * Map of agentId → AgentClass.
 * Keys must match the `agent` field values in routing_table.json.
 */
const AGENT_CLASSES = {
  // id on left must match AgentClass.id static property
  'churn-agent':    ChurnAgent,
  'dev-budget':     DevBudgetAgent,
  'dev-scorecard':  DevScorecardAgent,
  'paid-ads-agent': PaidAdsAgent,
  'cro-agent':      CroAgent,
  'lp-designer':    LpDesignerAgent,
  'se-agent':       SeAgent,
  arjun:            ArjunAgent,
  riya:             RiyaAgent,
  zara:             ZaraAgent,
  neel:             NeelAgent,
  priya:            PriyaAgent,
  sam:              SamAgent,
  maya:             MayaAgent,
  isha:             IshaAgent,
  tara:             TaraAgent,
  kiran:            KiranAgent,
};

/**
 * Instantiate and register all agents with an AgenticLoop instance.
 *
 * @param {import('../core/agenticLoop')} loop - AgenticLoop instance
 * @returns {Map<string, Object>} Map of agentId → agent instance (for inspection)
 */
function registerAllAgents(loop) {
  const instances = new Map();

  for (const [agentId, AgentClass] of Object.entries(AGENT_CLASSES)) {
    try {
      const agent = new AgentClass();
      loop.registerAgent(agentId, agent);
      instances.set(agentId, agent);
    } catch (err) {
      console.error(`[AgentBootstrap] Failed to register agent "${agentId}":`, err.message);
    }
  }

  console.log(`[AgentBootstrap] Registered ${instances.size}/${Object.keys(AGENT_CLASSES).length} agents`);
  return instances;
}

/**
 * Convenience: create a pre-wired AgenticLoop with all agents registered.
 *
 * @param {Object} config - AgenticLoop config (supabaseUrl, supabaseKey, llmClient, …)
 * @returns {{ loop: AgenticLoop, agents: Map<string,Object> }}
 */
function createLoop(config = {}) {
  const AgenticLoop = require('../core/agenticLoop');
  const loop = new AgenticLoop(config);
  const agents = registerAllAgents(loop);
  return { loop, agents };
}

module.exports = { AGENT_CLASSES, registerAllAgents, createLoop };
