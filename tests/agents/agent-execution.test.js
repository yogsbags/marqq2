'use strict';

/**
 * Phase 7.3 — Agent Execution Tests
 *
 * Tests every agent's execute() contract:
 * - Required response fields (prose, response_type, artifact, follow_ups)
 * - Schema compliance per response type
 * - Error handling (missing entityId, missing apiKey)
 * - Execution time < 2s for LLM-only agents
 *
 * Run with: node tests/agents/agent-execution.test.js
 */

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition) {
  if (condition) { passed++; process.stdout.write('.'); }
  else { failed++; failures.push(label); process.stdout.write('F'); }
}

function section(name) { console.log(`\n\n--- ${name} ---`); }

// ── Schema validators ─────────────────────────────────────────────────────────

function validateBaseResponse(label, result) {
  ok(`${label}: has prose (string)`, typeof result.prose === 'string' && result.prose.length > 0);
  ok(`${label}: has response_type`, typeof result.response_type === 'string');
  ok(`${label}: has confidence (0-1)`, typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1);
  ok(`${label}: has connectors_used (array)`, Array.isArray(result.connectors_used));
  ok(`${label}: has follow_ups (array)`, Array.isArray(result.follow_ups));
  ok(`${label}: has artifact (object)`, result.artifact !== null && typeof result.artifact === 'object');
}

function validateAnalysisArtifact(label, artifact) {
  ok(`${label}: artifact.type = 'analysis'`, artifact.type === 'analysis');
  ok(`${label}: has metrics (object)`, typeof artifact.metrics === 'object');
  ok(`${label}: has findings (array)`, Array.isArray(artifact.findings));
  ok(`${label}: has insights (array)`, Array.isArray(artifact.insights));
}

function validateOptimizationArtifact(label, artifact) {
  ok(`${label}: artifact.type = 'optimization_plan'`, artifact.type === 'optimization_plan');
  ok(`${label}: has current_state`, typeof artifact.current_state === 'object');
  ok(`${label}: has recommendation`, typeof artifact.recommendation === 'object');
  ok(`${label}: has expected_impact`, typeof artifact.expected_impact === 'object');
}

function validateCreationArtifact(label, artifact) {
  ok(`${label}: artifact.type = 'content'`, artifact.type === 'content');
  ok(`${label}: has title`, typeof artifact.title === 'string');
  ok(`${label}: has content`, typeof artifact.content === 'object');
}

function validateExecutionArtifact(label, artifact) {
  ok(`${label}: artifact.type = 'execution_tracker'`, artifact.type === 'execution_tracker');
  ok(`${label}: has status`, typeof artifact.status === 'string');
  ok(`${label}: has steps (array)`, Array.isArray(artifact.steps));
  ok(`${label}: has metrics (object)`, typeof artifact.metrics === 'object');
}

// ── Timing helper ─────────────────────────────────────────────────────────────

async function timed(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

// ── Fake request ──────────────────────────────────────────────────────────────

const FAKE_REQUEST = {
  entityId: 'test-entity-001',
  apiKey: 'fake-key-for-schema-test',
  goal_id: 'test-goal',
  message: 'Test message',
  extracted_params: {},
  available_connectors: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== Agent Execution Tests ===');

  // ── 1. CRO Agent ──────────────────────────────────────────────────────────
  section('CRO Agent');
  const CroAgent = require('../../platform/crewai/agents/cro-agent/index.js');
  const croAgent = new CroAgent();

  // Missing connector should return structured error (not throw)
  const { result: croResult, ms: croMs } = await timed(() =>
    croAgent.execute({ ...FAKE_REQUEST })
  );
  ok('CRO: returns without throwing', true);
  ok('CRO: has prose', typeof croResult.prose === 'string');
  ok('CRO: response_type present', typeof croResult.response_type === 'string');
  ok('CRO: connector_missing set on auth failure', croResult.connector_missing === 'ga4' || croResult.confidence === 0);
  ok('CRO: execution under 5s (connector error path)', croMs < 5000);

  // Missing entityId
  const croNoEntity = await croAgent.execute({ apiKey: 'x' });
  ok('CRO: error prose on missing entityId', typeof croNoEntity.prose === 'string' && croNoEntity.prose.length > 0);
  ok('CRO: confidence=0 on error', croNoEntity.confidence === 0);

  // ── 2. LP Designer Agent ──────────────────────────────────────────────────
  section('LP Designer Agent');
  const LpDesignerAgent = require('../../platform/crewai/agents/lp-designer/index.js');
  const lpAgent = new LpDesignerAgent();

  const { result: lpResult, ms: lpMs } = await timed(() =>
    lpAgent.execute({
      entityId: 'test-entity',
      product: 'TestProduct',
      goal: 'saas_trial',
      audience: 'B2B Marketing Teams',
      painPoints: ['Too slow', 'Too expensive'],
    })
  );

  ok('LP Designer: no throw', true);
  validateBaseResponse('LP Designer', lpResult);
  validateCreationArtifact('LP Designer', lpResult.artifact);
  ok('LP Designer: artifact.format = landing_page', lpResult.artifact.format === 'landing_page');
  ok('LP Designer: page_structure is array', Array.isArray(lpResult.artifact.content?.page_structure));
  ok('LP Designer: hero section present', lpResult.artifact.content?.page_structure?.some((s) => s.section === 'hero'));
  ok('LP Designer: trust_checklist present', Array.isArray(lpResult.artifact.content?.trust_checklist));
  ok('LP Designer: ab_test_priority present', Array.isArray(lpResult.artifact.content?.ab_test_priority));
  ok('LP Designer: at least 3 follow_ups', lpResult.follow_ups.length >= 3);
  ok(`LP Designer: <2s execution (${lpMs}ms)`, lpMs < 2000);

  // Different goal types
  for (const goal of ['lead_gen', 'ecommerce', 'webinar', 'default']) {
    const r = await lpAgent.execute({ entityId: 'x', product: 'P', goal });
    ok(`LP Designer: ${goal} goal returns prose`, typeof r.prose === 'string');
  }

  // Error: missing entityId
  const lpNoEntity = await lpAgent.execute({});
  ok('LP Designer: error on missing entityId', lpNoEntity.confidence === 0);

  // ── 3. SE Agent ───────────────────────────────────────────────────────────
  section('SE Agent');
  const SeAgent = require('../../platform/crewai/agents/se-agent/index.js');
  const seAgent = new SeAgent();

  const { result: seResult, ms: seMs } = await timed(() =>
    seAgent.execute({
      entityId: 'test-entity',
      product: 'Marqq AI',
      competitor: 'HubSpot',
      audience: 'VP Marketing',
      outputType: 'full',
    })
  );

  ok('SE Agent: no throw', true);
  validateBaseResponse('SE Agent', seResult);
  validateCreationArtifact('SE Agent', seResult.artifact);
  ok('SE Agent: format = sales_enablement_pack', seResult.artifact.format === 'sales_enablement_pack');
  ok('SE Agent: has battlecard', !!seResult.artifact.content?.battlecard);
  ok('SE Agent: has objection_handlers', !!seResult.artifact.content?.objection_handlers);
  ok('SE Agent: has 10 objections', seResult.artifact.content?.objection_handlers?.objections?.length === 10);
  ok('SE Agent: has value_prop_by_persona', !!seResult.artifact.content?.value_prop_by_persona);
  ok('SE Agent: has discovery_questions', !!seResult.artifact.content?.discovery_questions);
  ok('SE Agent: has icp', !!seResult.artifact.content?.icp);
  ok('SE Agent: usage_guide present', Array.isArray(seResult.artifact.content?.usage_guide));
  ok(`SE Agent: <2s execution (${seMs}ms)`, seMs < 2000);

  // Partial output types
  for (const outputType of ['battlecard', 'objections', 'value_props', 'discovery', 'icp']) {
    const r = await seAgent.execute({ entityId: 'x', product: 'P', competitor: 'C', outputType });
    ok(`SE Agent: ${outputType} mode returns prose`, typeof r.prose === 'string');
    ok(`SE Agent: ${outputType} has sections_included`, Array.isArray(r.artifact?.metadata?.sections_included));
  }

  // Missing entityId
  const seNoEntity = await seAgent.execute({});
  ok('SE Agent: error on missing entityId', seNoEntity.confidence === 0);

  // ── 4. Paid Ads Agent (brief mode, no connector) ──────────────────────────
  section('Paid Ads Agent — brief mode');
  const PaidAdsAgent = require('../../platform/crewai/agents/paid-ads-agent/index.js');
  const paidAgent = new PaidAdsAgent();

  const { result: briefResult, ms: briefMs } = await timed(() =>
    paidAgent.execute({
      entityId: 'test-entity',
      apiKey: 'fake',
      mode: 'brief',
      campaignBrief: {
        campaignName: 'Summer Launch',
        goal: 'lead_gen',
        budget: 10000,
        audience: 'SaaS founders',
        platforms: ['Google Ads', 'Meta Ads'],
      },
    })
  );

  ok('PaidAds brief: no throw', true);
  validateBaseResponse('PaidAds brief', briefResult);
  validateExecutionArtifact('PaidAds brief', briefResult.artifact);
  ok('PaidAds brief: status = pending_launch', briefResult.artifact.status === 'pending_launch');
  ok('PaidAds brief: has campaign_brief', !!briefResult.artifact.campaign_brief);
  ok('PaidAds brief: recommended_settings array', Array.isArray(briefResult.artifact.campaign_brief?.recommended_settings));
  ok(`PaidAds brief: <1s execution (${briefMs}ms)`, briefMs < 1000);

  // Missing entityId
  const paidNoEntity = await paidAgent.execute({ apiKey: 'x' });
  ok('PaidAds: error on missing entityId', paidNoEntity.confidence === 0);

  // ── 5. Churn Agent (schema only, no live HubSpot) ─────────────────────────
  section('Churn Agent — schema validation');
  const ChurnAgent = require('../../platform/crewai/agents/churn-agent/index.js');
  const churnAgent = new ChurnAgent();

  // Error response should still be schema-compliant
  const churnErr = await churnAgent.execute({ entityId: 'x', apiKey: 'fake' });
  ok('Churn error: has prose', typeof churnErr.prose === 'string');
  ok('Churn error: response_type = analysis', churnErr.response_type === 'analysis');
  ok('Churn error: has artifact', !!churnErr.artifact);
  ok('Churn error: artifact has at_risk_customers', Array.isArray(churnErr.artifact?.at_risk_customers));
  ok('Churn error: has follow_ups', Array.isArray(churnErr.follow_ups));

  // ── 6. Dev Budget — schema ────────────────────────────────────────────────
  section('Dev Budget Agent — schema validation');
  const DevBudgetAgent = require('../../platform/crewai/agents/dev-budget/index.js');
  const budgetAgent = new DevBudgetAgent();

  const budgetErr = await budgetAgent.execute({ entityId: 'x', apiKey: 'fake' });
  ok('Budget error: has prose', typeof budgetErr.prose === 'string');
  ok('Budget error: response_type = optimization', budgetErr.response_type === 'optimization');
  ok('Budget error: has artifact', !!budgetErr.artifact);

  // ── 7. Dev Scorecard — schema ─────────────────────────────────────────────
  section('Dev Scorecard Agent — schema validation');
  const DevScorecardAgent = require('../../platform/crewai/agents/dev-scorecard/index.js');
  const scorecardAgent = new DevScorecardAgent();

  const scorecardErr = await scorecardAgent.execute({ entityId: 'x', apiKey: 'fake' });
  ok('Scorecard error: has prose', typeof scorecardErr.prose === 'string');
  ok('Scorecard error: response_type = analysis', scorecardErr.response_type === 'analysis');
  ok('Scorecard error: has artifact', !!scorecardErr.artifact);
  ok('Scorecard error: has channel_breakdown', Array.isArray(scorecardErr.artifact?.channel_breakdown));

  // ── 8. Arjun — LLM-only path (no connector) ──────────────────────────────
  section('Arjun Agent — LLM-only paths');
  const ArjunAgent = require('../../platform/crewai/agents/arjun/index.js');
  const arjun = new ArjunAgent();

  // No apiKey supplied → LLM-only plan (not connector_missing for apollo as it's non-fatal)
  const { result: arjunResult, ms: arjunMs } = await timed(() =>
    arjun.execute({ entityId: 'test-entity', goal_id: 'find-leads', message: 'find leads' })
  );
  ok('Arjun find-leads: no throw', true);
  ok('Arjun find-leads: has prose', typeof arjunResult.prose === 'string' && arjunResult.prose.length > 0);
  ok('Arjun find-leads: response_type = discovery', arjunResult.response_type === 'discovery');
  ok('Arjun find-leads: has artifact', !!arjunResult.artifact);
  ok('Arjun find-leads: has follow_ups', Array.isArray(arjunResult.follow_ups));
  ok(`Arjun find-leads: <2s (${arjunMs}ms)`, arjunMs < 2000);

  // referral-program → execution type (needs fake apiKey to bypass guard; Composio fails non-fatally → returns plan)
  const arjunRef = await arjun.execute({ entityId: 'test-entity', apiKey: 'fake-key', goal_id: 'referral-program', message: 'build a referral program' });
  ok('Arjun referral: has prose', typeof arjunRef.prose === 'string');
  ok('Arjun referral: response_type = execution', arjunRef.response_type === 'execution');

  // Missing entityId
  const arjunNoEntity = await arjun.execute({});
  ok('Arjun: confidence=0 on missing entityId', arjunNoEntity.confidence === 0);

  // ── 9. Riya — LLM-only content creation ───────────────────────────────────
  section('Riya Agent — content creation');
  const RiyaAgent = require('../../platform/crewai/agents/riya/index.js');
  const riya = new RiyaAgent();

  const { result: riyaResult, ms: riyaMs } = await timed(() =>
    riya.execute({ entityId: 'test-entity', goal_id: 'produce-content', message: 'write a blog post' })
  );
  ok('Riya produce-content: no throw', true);
  ok('Riya produce-content: has prose', typeof riyaResult.prose === 'string' && riyaResult.prose.length > 0);
  ok('Riya produce-content: response_type = creation', riyaResult.response_type === 'creation');
  ok('Riya produce-content: artifact.type = content', riyaResult.artifact?.type === 'content');
  ok('Riya produce-content: has title', typeof riyaResult.artifact?.title === 'string');
  ok('Riya produce-content: has content (object)', typeof riyaResult.artifact?.content === 'object');
  ok('Riya produce-content: has follow_ups', Array.isArray(riyaResult.follow_ups));
  ok(`Riya produce-content: <2s (${riyaMs}ms)`, riyaMs < 2000);

  // generate-creatives path
  const riyaAds = await riya.execute({ entityId: 'test-entity', goal_id: 'generate-creatives', message: 'make ads' });
  ok('Riya creatives: response_type = creation', riyaAds.response_type === 'creation');
  ok('Riya creatives: has artifact.content', typeof riyaAds.artifact?.content === 'object');

  // create-magnets path
  const riyaMagnet = await riya.execute({ entityId: 'test-entity', goal_id: 'create-magnets', message: 'create a lead magnet' });
  ok('Riya magnet: response_type = creation', riyaMagnet.response_type === 'creation');

  const riyaNoEntity = await riya.execute({});
  ok('Riya: confidence=0 on missing entityId', riyaNoEntity.confidence === 0);

  // ── 10. Zara — social + calendar ─────────────────────────────────────────
  section('Zara Agent — social strategy');
  const ZaraAgent = require('../../platform/crewai/agents/zara/index.js');
  const zara = new ZaraAgent();

  const { result: zaraResult, ms: zaraMs } = await timed(() =>
    zara.execute({ entityId: 'test-entity', goal_id: 'run-social', message: 'create social media strategy' })
  );
  ok('Zara run-social: no throw', true);
  ok('Zara run-social: has prose', typeof zaraResult.prose === 'string' && zaraResult.prose.length > 0);
  ok('Zara run-social: response_type = creation', zaraResult.response_type === 'creation');
  ok('Zara run-social: artifact.type = content', zaraResult.artifact?.type === 'content');
  ok('Zara run-social: has content object', typeof zaraResult.artifact?.content === 'object');
  ok(`Zara run-social: <2s (${zaraMs}ms)`, zaraMs < 2000);

  const zaraCal = await zara.execute({ entityId: 'test-entity', goal_id: 'social-calendar', message: 'build social calendar' });
  ok('Zara calendar: response_type = creation', zaraCal.response_type === 'creation');

  const zaraLaunch = await zara.execute({ entityId: 'test-entity', goal_id: 'launch-planning', message: 'plan product launch' });
  ok('Zara launch: response_type = creation', zaraLaunch.response_type === 'creation');

  const zaraNoEntity = await zara.execute({});
  ok('Zara: confidence=0 on missing entityId', zaraNoEntity.confidence === 0);

  // ── 11. Neel — positioning strategy ──────────────────────────────────────
  section('Neel Agent — positioning');
  const NeelAgent = require('../../platform/crewai/agents/neel/index.js');
  const neel = new NeelAgent();

  const { result: neelResult, ms: neelMs } = await timed(() =>
    neel.execute({ entityId: 'test-entity', product: 'Marqq AI', audience: 'B2B marketing teams' })
  );
  ok('Neel: no throw', true);
  ok('Neel: has prose', typeof neelResult.prose === 'string' && neelResult.prose.length > 0);
  ok('Neel: response_type = creation', neelResult.response_type === 'creation');
  ok('Neel: artifact.type = content', neelResult.artifact?.type === 'content');
  ok('Neel: has positioning_statement', typeof neelResult.artifact?.content?.positioning_statement === 'string');
  ok('Neel: has messaging_pillars (array)', Array.isArray(neelResult.artifact?.content?.messaging_pillars));
  ok('Neel: has strategic_priorities', Array.isArray(neelResult.artifact?.content?.strategic_priorities));
  ok('Neel: follow_ups >= 3', neelResult.follow_ups?.length >= 3);
  ok(`Neel: <2s (${neelMs}ms)`, neelMs < 2000);

  const neelNoEntity = await neel.execute({});
  ok('Neel: confidence=0 on missing entityId', neelNoEntity.confidence === 0);

  // ── 12. Priya — market signals ────────────────────────────────────────────
  section('Priya Agent — market signals');
  const PriyaAgent = require('../../platform/crewai/agents/priya/index.js');
  const priya = new PriyaAgent();

  const { result: priyaResult, ms: priyaMs } = await timed(() =>
    priya.execute({ entityId: 'test-entity', goal_id: 'market-signals', message: 'what are competitors doing' })
  );
  ok('Priya signals: no throw', true);
  ok('Priya signals: has prose', typeof priyaResult.prose === 'string' && priyaResult.prose.length > 0);
  ok('Priya signals: response_type = analysis', priyaResult.response_type === 'analysis');
  ok('Priya signals: artifact.type = analysis', priyaResult.artifact?.type === 'analysis');
  ok('Priya signals: has metrics', typeof priyaResult.artifact?.metrics === 'object');
  ok('Priya signals: has findings (array)', Array.isArray(priyaResult.artifact?.findings));
  ok('Priya signals: has insights (array)', Array.isArray(priyaResult.artifact?.insights));
  ok(`Priya signals: <2s (${priyaMs}ms)`, priyaMs < 2000);

  const priyaMarket = await priya.execute({ entityId: 'test-entity', goal_id: 'understand-market', message: 'understand the market' });
  ok('Priya understand-market: response_type = analysis', priyaMarket.response_type === 'analysis');

  const priyaNoEntity = await priya.execute({});
  ok('Priya: confidence=0 on missing entityId', priyaNoEntity.confidence === 0);

  // ── 13. Sam — sequences & messaging ──────────────────────────────────────
  section('Sam Agent — sequences');
  const SamAgent = require('../../platform/crewai/agents/sam/index.js');
  const sam = new SamAgent();

  // No apiKey → LLM-only copy still returned
  const { result: samResult, ms: samMs } = await timed(() =>
    sam.execute({ entityId: 'test-entity', goal_id: 'build-sequences', message: 'build outreach sequence' })
  );
  ok('Sam sequences: no throw', true);
  ok('Sam sequences: has prose', typeof samResult.prose === 'string' && samResult.prose.length > 0);
  ok('Sam sequences: response_type = creation', samResult.response_type === 'creation');
  ok('Sam sequences: artifact.type = content', samResult.artifact?.type === 'content');
  ok('Sam sequences: has content object', typeof samResult.artifact?.content === 'object');
  ok(`Sam sequences: <2s (${samMs}ms)`, samResult.confidence >= 0 && samMs < 2000);

  const samEmail = await sam.execute({ entityId: 'test-entity', goal_id: 'email-sequences', message: 'create email sequences' });
  ok('Sam email-sequences: response_type = creation', samEmail.response_type === 'creation');

  const samMsg = await sam.execute({ entityId: 'test-entity', goal_id: 'sharpen-messaging', message: 'sharpen my messaging' });
  ok('Sam sharpen-messaging: response_type = creation', samMsg.response_type === 'creation');

  const samNoEntity = await sam.execute({});
  ok('Sam: confidence=0 on missing entityId', samNoEntity.confidence === 0);

  // ── 14. Maya — SEO ───────────────────────────────────────────────────────
  section('Maya Agent — SEO');
  const MayaAgent = require('../../platform/crewai/agents/maya/index.js');
  const maya = new MayaAgent();

  const { result: mayaResult, ms: mayaMs } = await timed(() =>
    maya.execute({ entityId: 'test-entity', goal_id: 'seo-visibility', message: 'improve my SEO' })
  );
  ok('Maya SEO: no throw', true);
  ok('Maya SEO: has prose', typeof mayaResult.prose === 'string' && mayaResult.prose.length > 0);
  ok('Maya SEO: response_type = analysis', mayaResult.response_type === 'analysis');
  ok('Maya SEO: artifact.type = analysis', mayaResult.artifact?.type === 'analysis');
  ok('Maya SEO: has metrics', typeof mayaResult.artifact?.metrics === 'object');
  ok('Maya SEO: has keyword_clusters (array)', Array.isArray(mayaResult.artifact?.keyword_clusters));
  ok('Maya SEO: has content_architecture', typeof mayaResult.artifact?.content_architecture === 'object');
  ok('Maya SEO: has aeo_strategy', typeof mayaResult.artifact?.aeo_strategy === 'object');
  ok('Maya SEO: follow_ups >= 3', mayaResult.follow_ups?.length >= 3);
  ok(`Maya SEO: <2s (${mayaMs}ms)`, mayaMs < 2000);

  const mayaNoEntity = await maya.execute({});
  ok('Maya: confidence=0 on missing entityId', mayaNoEntity.confidence === 0);

  // ── 15. Isha — market research ────────────────────────────────────────────
  section('Isha Agent — market research');
  const IshaAgent = require('../../platform/crewai/agents/isha/index.js');
  const isha = new IshaAgent();

  const { result: ishaResult, ms: ishaMs } = await timed(() =>
    isha.execute({ entityId: 'test-entity', goal_id: 'market-research', message: 'research my market' })
  );
  ok('Isha: no throw', true);
  ok('Isha: has prose', typeof ishaResult.prose === 'string' && ishaResult.prose.length > 0);
  ok('Isha: response_type = analysis', ishaResult.response_type === 'analysis');
  ok('Isha: artifact.type = analysis', ishaResult.artifact?.type === 'analysis');
  ok('Isha: has metrics', typeof ishaResult.artifact?.metrics === 'object');
  ok('Isha: has segments (array)', Array.isArray(ishaResult.artifact?.segments));
  ok('Isha: has buyer_journey', typeof ishaResult.artifact?.buyer_journey === 'object');
  ok('Isha: has hypotheses (array)', Array.isArray(ishaResult.artifact?.hypotheses));
  ok(`Isha: <2s (${ishaMs}ms)`, ishaMs < 2000);

  const ishaNoEntity = await isha.execute({});
  ok('Isha: confidence=0 on missing entityId', ishaNoEntity.confidence === 0);

  // ── 16. Tara — offer engineering ──────────────────────────────────────────
  section('Tara Agent — offer engineering');
  const TaraAgent = require('../../platform/crewai/agents/tara/index.js');
  const tara = new TaraAgent();

  const { result: taraResult, ms: taraMs } = await timed(() =>
    tara.execute({ entityId: 'test-entity', goal_id: 'strengthen-offer', message: 'improve my offer' })
  );
  ok('Tara: no throw', true);
  ok('Tara: has prose', typeof taraResult.prose === 'string' && taraResult.prose.length > 0);
  ok('Tara: response_type = optimization', taraResult.response_type === 'optimization');
  ok('Tara: artifact.type = optimization_plan', taraResult.artifact?.type === 'optimization_plan');
  ok('Tara: has current_state', typeof taraResult.artifact?.current_state === 'object');
  ok('Tara: has recommendation', typeof taraResult.artifact?.recommendation === 'object');
  ok('Tara: has expected_impact', typeof taraResult.artifact?.expected_impact === 'object');
  ok('Tara: has line_items (array)', Array.isArray(taraResult.artifact?.line_items));
  ok(`Tara: <2s (${taraMs}ms)`, taraMs < 2000);

  const taraNoEntity = await tara.execute({});
  ok('Tara: confidence=0 on missing entityId', taraNoEntity.confidence === 0);

  // ── 17. Kiran — lifecycle engagement ──────────────────────────────────────
  section('Kiran Agent — lifecycle engagement');
  const KiranAgent = require('../../platform/crewai/agents/kiran/index.js');
  const kiran = new KiranAgent();

  // No apiKey → plan-only (non-fatal HubSpot path)
  const { result: kiranResult, ms: kiranMs } = await timed(() =>
    kiran.execute({ entityId: 'test-entity', goal_id: 'lifecycle-engagement', message: 'create lifecycle plan' })
  );
  ok('Kiran: no throw', true);
  ok('Kiran: has prose', typeof kiranResult.prose === 'string' && kiranResult.prose.length > 0);
  ok('Kiran: response_type = execution', kiranResult.response_type === 'execution');
  ok('Kiran: artifact.type = execution_tracker', kiranResult.artifact?.type === 'execution_tracker');
  ok('Kiran: has status', typeof kiranResult.artifact?.status === 'string');
  ok('Kiran: has steps (array)', Array.isArray(kiranResult.artifact?.steps));
  ok('Kiran: has metrics (object)', typeof kiranResult.artifact?.metrics === 'object');
  ok('Kiran: has lifecycle_map', typeof kiranResult.artifact?.lifecycle_map === 'object');
  ok('Kiran: has re_engagement', typeof kiranResult.artifact?.re_engagement === 'object');
  ok('Kiran: has churn_triggers (array)', Array.isArray(kiranResult.artifact?.churn_triggers));
  ok(`Kiran: <2s (${kiranMs}ms)`, kiranMs < 2000);

  const kiranNoEntity = await kiran.execute({});
  ok('Kiran: confidence=0 on missing entityId', kiranNoEntity.confidence === 0);

  // ── 18. Agent bootstrap — registerAllAgents ───────────────────────────────
  section('Agent bootstrap index');
  const { AGENT_CLASSES, registerAllAgents } = require('../../platform/crewai/agents/index.js');
  ok('Bootstrap: AGENT_CLASSES is object', typeof AGENT_CLASSES === 'object');
  ok('Bootstrap: has 17 agent classes', Object.keys(AGENT_CLASSES).length === 17);

  const mockLoop = { agents: new Map(), registerAgent(id, a) { this.agents.set(id, a); } };
  registerAllAgents(mockLoop);
  ok('Bootstrap: all 17 agents registered', mockLoop.agents.size === 17);

  for (const agentId of Object.keys(AGENT_CLASSES)) {
    const instance = mockLoop.agents.get(agentId);
    ok(`Bootstrap: ${agentId} has execute()`, typeof instance?.execute === 'function');
  }

  // ── 19. Static agent ID / name / crews checks ─────────────────────────────
  section('Agent static properties');
  const agents = [
    require('../../platform/crewai/agents/churn-agent/index.js'),
    require('../../platform/crewai/agents/dev-budget/index.js'),
    require('../../platform/crewai/agents/dev-scorecard/index.js'),
    require('../../platform/crewai/agents/paid-ads-agent/index.js'),
    require('../../platform/crewai/agents/cro-agent/index.js'),
    require('../../platform/crewai/agents/lp-designer/index.js'),
    require('../../platform/crewai/agents/se-agent/index.js'),
    require('../../platform/crewai/agents/arjun/index.js'),
    require('../../platform/crewai/agents/riya/index.js'),
    require('../../platform/crewai/agents/zara/index.js'),
    require('../../platform/crewai/agents/neel/index.js'),
    require('../../platform/crewai/agents/priya/index.js'),
    require('../../platform/crewai/agents/sam/index.js'),
    require('../../platform/crewai/agents/maya/index.js'),
    require('../../platform/crewai/agents/isha/index.js'),
    require('../../platform/crewai/agents/tara/index.js'),
    require('../../platform/crewai/agents/kiran/index.js'),
  ];

  for (const AgentClass of agents) {
    ok(`${AgentClass.id}: has static id`, typeof AgentClass.id === 'string');
    ok(`${AgentClass.id}: has static name`, typeof AgentClass.name === 'string');
    ok(`${AgentClass.id}: has static crews`, Array.isArray(AgentClass.crews));
    const instance = new AgentClass();
    ok(`${AgentClass.id}: execute is function`, typeof instance.execute === 'function');
  }
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
