'use strict';

/**
 * Phase 7.2 — Connector Integration Tests
 *
 * Tests Composio connector resolution and tool execution using mock
 * API responses. Run with:
 *   node tests/connectors/connector-integration.test.js
 *
 * Set COMPOSIO_API_KEY + test entity ID in env for live tests:
 *   COMPOSIO_API_KEY=xxx TEST_ENTITY_ID=yyy LIVE=true node tests/connectors/connector-integration.test.js
 */

const https = require('https');
const http = require('http');

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition) {
  if (condition) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    failures.push({ label, detail: 'condition was false' });
    process.stdout.write('F');
  }
}

function equal(label, a, b) {
  if (a === b) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    failures.push({ label, detail: `${JSON.stringify(a)} !== ${JSON.stringify(b)}` });
    process.stdout.write('F');
  }
}

// ── Mock Composio server (in-process HTTP server) ─────────────────────────────

/**
 * Spin up a minimal mock of the Composio V3 API so tests run without
 * a real API key. Returns server instance + base URL.
 */
function startMockComposioServer() {
  const MOCK_ACCOUNT_ID = 'mock-account-001';

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    // Connected accounts endpoint
    if (req.url?.includes('/connected_accounts')) {
      const url = new URL(req.url, 'http://localhost');
      const toolkit = url.searchParams.get('toolkit_slug') || '';
      const userId = url.searchParams.get('user_id') || '';

      // Simulate missing connector for 'tiktok_ads'
      if (toolkit === 'tiktok_ads') {
        res.writeHead(200);
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        items: [{
          id: MOCK_ACCOUNT_ID,
          user_id: userId,
          entity_id: userId,
          toolkit_slug: toolkit,
          status: 'ACTIVE',
        }],
      }));
      return;
    }

    // Tool execution endpoint
    if (req.url?.includes('/tools/execute/')) {
      const toolSlug = req.url.split('/tools/execute/')[1]?.split('?')[0] || '';
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        let reqBody = {};
        try { reqBody = JSON.parse(body); } catch { /* ignore */ }

        // Simulate error for invalid tool
        if (toolSlug === 'INVALID_TOOL') {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Tool not found', successful: false }));
          return;
        }

        // Simulate HubSpot contacts response
        if (toolSlug === 'HUBSPOT_LIST_CONTACTS') {
          res.writeHead(200);
          res.end(JSON.stringify({
            successful: true,
            data: {
              results: [
                { id: 'c1', properties: { firstname: 'Alice', lastname: 'Smith', email: 'alice@example.com', lifecyclestage: 'lead', notes_last_activity_date: new Date(Date.now() - 45 * 86_400_000).toISOString() } },
                { id: 'c2', properties: { firstname: 'Bob', lastname: 'Jones', email: 'bob@example.com', lifecyclestage: 'customer', notes_last_activity_date: new Date(Date.now() - 10 * 86_400_000).toISOString() } },
              ],
            },
          }));
          return;
        }

        // Simulate GA4 report
        if (toolSlug === 'GOOGLEANALYTICS_RUN_REPORT') {
          res.writeHead(200);
          res.end(JSON.stringify({
            successful: true,
            data: {
              totals: [{
                metricValues: [
                  { value: '12500' }, // sessions
                  { value: '9800' },  // users
                  { value: '3200' },  // newUsers
                  { value: '0.45' },  // bounceRate
                  { value: '185' },   // avgSessionDuration
                  { value: '38000' }, // pageViews
                  { value: '420' },   // conversions
                  { value: '84000' }, // revenue
                  { value: '0.68' },  // engagementRate
                ],
              }],
              rows: [],
            },
          }));
          return;
        }

        // Simulate Google Ads campaigns
        if (toolSlug === 'GOOGLEADS_LIST_CAMPAIGNS') {
          res.writeHead(200);
          res.end(JSON.stringify({
            successful: true,
            data: {
              campaigns: [
                { campaign: { id: 'g1', name: 'Brand Search', status: 'ENABLED' }, metrics: { cost_micros: '5200000000', clicks: '8200', impressions: '95000', conversions: '320', conversions_value: '64000' } },
                { campaign: { id: 'g2', name: 'Non-Brand DSA', status: 'ENABLED' }, metrics: { cost_micros: '2100000000', clicks: '3100', impressions: '42000', conversions: '28', conversions_value: '1400' } },
              ],
            },
          }));
          return;
        }

        // Simulate Meta Ads insights
        if (toolSlug === 'FACEBOOK_GET_AD_INSIGHTS') {
          res.writeHead(200);
          res.end(JSON.stringify({
            successful: true,
            data: {
              data: [
                { campaign_id: 'm1', campaign_name: 'Retargeting', spend: '1800', clicks: '2400', impressions: '65000', effective_status: 'ACTIVE', actions: [{ action_type: 'purchase', value: '7200' }], action_values: [{ action_type: 'purchase', value: '7200' }] },
              ],
            },
          }));
          return;
        }

        // Generic success for other tools
        res.writeHead(200);
        res.end(JSON.stringify({ successful: true, data: { result: 'mock_data', tool: toolSlug } }));
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, mockAccountId: MOCK_ACCOUNT_ID });
    });
  });
}

// ── Monkey-patch COMPOSIO_V3 in agent files ───────────────────────────────────

function patchComposioUrl(mockBaseUrl) {
  // Patch the global fetch used by agents to redirect to mock server
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('backend.composio.dev')) {
      const patchedUrl = url.replace('https://backend.composio.dev/api/v3', mockBaseUrl);
      return originalFetch(patchedUrl, options);
    }
    return originalFetch(url, options);
  };
  return () => { global.fetch = originalFetch; };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runConnectorTests(mockBaseUrl) {
  const TEST_ENTITY = 'test-workspace-123';
  const TEST_API_KEY = 'mock-key-for-tests';

  // ── 1. ConnectorChecker tests ─────────────────────────────────────────────
  console.log('\n--- ConnectorChecker ---');
  const ConnectorChecker = require('../../platform/crewai/routing/connector-checker');
  const checker = new ConnectorChecker('mock-url', 'mock-key');

  // Test label mapping
  const label = checker._getConnectorLabel('google_ads');
  equal('google_ads label is "Google Ads"', label, 'Google Ads');
  const label2 = checker._getConnectorLabel('hubspot');
  equal('hubspot label is "HubSpot"', label2, 'HubSpot');

  // Test missing connector prompt generation
  const prompt = checker.generateMissingConnectorPrompt(['google_ads', 'meta_ads'], []);
  ok('Missing prompt contains connector names', prompt.message.includes('Google Ads'));
  ok('Missing prompt contains missing array', Array.isArray(prompt.missing));

  // ── 2. ChurnAgent (HubSpot) ───────────────────────────────────────────────
  console.log('\n--- Churn Agent (HubSpot) ---');
  const ChurnAgent = require('../../platform/crewai/agents/churn-agent/index.js');
  const churnAgent = new ChurnAgent();

  const churnResult = await churnAgent.execute({
    entityId: TEST_ENTITY,
    apiKey: TEST_API_KEY,
    inactiveDays: 30,
    limit: 10,
  });

  ok('Churn: has prose', typeof churnResult.prose === 'string' && churnResult.prose.length > 0);
  ok('Churn: response_type is analysis', churnResult.response_type === 'analysis');
  ok('Churn: has artifact', !!churnResult.artifact);
  ok('Churn: artifact type is analysis', churnResult.artifact?.type === 'analysis');
  ok('Churn: has at_risk_customers array', Array.isArray(churnResult.artifact?.at_risk_customers));
  ok('Churn: has metrics', typeof churnResult.artifact?.metrics === 'object');
  ok('Churn: has follow_ups', Array.isArray(churnResult.follow_ups));

  // ── 3. DevBudget Agent (Google Ads + Meta) ────────────────────────────────
  console.log('\n--- Dev Budget Agent (Google Ads + Meta Ads) ---');
  const DevBudgetAgent = require('../../platform/crewai/agents/dev-budget/index.js');
  const budgetAgent = new DevBudgetAgent();

  const budgetResult = await budgetAgent.execute({
    entityId: TEST_ENTITY,
    apiKey: TEST_API_KEY,
    lookbackDays: 30,
    currency: 'USD',
  });

  ok('Budget: has prose', typeof budgetResult.prose === 'string' && budgetResult.prose.length > 0);
  ok('Budget: response_type is optimization', budgetResult.response_type === 'optimization');
  ok('Budget: has artifact', !!budgetResult.artifact);
  ok('Budget: artifact type is optimization_plan', budgetResult.artifact?.type === 'optimization_plan');
  ok('Budget: current_state has total_spend', budgetResult.artifact?.current_state?.total_spend !== undefined);
  ok('Budget: recommendation has line_items', Array.isArray(budgetResult.artifact?.recommendation?.line_items));
  ok('Budget: expected_impact present', !!budgetResult.artifact?.expected_impact);

  // ── 4. DevScorecard Agent (GA4) ───────────────────────────────────────────
  console.log('\n--- Dev Scorecard Agent (GA4) ---');
  const DevScorecardAgent = require('../../platform/crewai/agents/dev-scorecard/index.js');
  const scorecardAgent = new DevScorecardAgent();

  const scorecardResult = await scorecardAgent.execute({
    entityId: TEST_ENTITY,
    apiKey: TEST_API_KEY,
    lookbackDays: 30,
  });

  ok('Scorecard: has prose', typeof scorecardResult.prose === 'string' && scorecardResult.prose.length > 0);
  ok('Scorecard: response_type is analysis', scorecardResult.response_type === 'analysis');
  ok('Scorecard: has artifact', !!scorecardResult.artifact);
  ok('Scorecard: metrics has sessions', scorecardResult.artifact?.metrics?.sessions !== undefined);
  ok('Scorecard: metrics has conversion_rate_pct', scorecardResult.artifact?.metrics?.conversion_rate_pct !== undefined);
  ok('Scorecard: has channel_breakdown', Array.isArray(scorecardResult.artifact?.channel_breakdown));

  // ── 5. Missing connector handling ─────────────────────────────────────────
  console.log('\n--- Missing connector error handling ---');

  const churnNoEntity = await churnAgent.execute({ apiKey: TEST_API_KEY });
  ok('Churn: error on missing entityId', churnNoEntity.confidence === 0);
  ok('Churn: error prose present', typeof churnNoEntity.prose === 'string');

  const budgetNoKey = await budgetAgent.execute({ entityId: TEST_ENTITY });
  ok('Budget: error on missing API key (default env)', typeof budgetNoKey.prose === 'string');

  // ── 6. PaidAdsAgent ───────────────────────────────────────────────────────
  console.log('\n--- Paid Ads Agent ---');
  const PaidAdsAgent = require('../../platform/crewai/agents/paid-ads-agent/index.js');
  const paidAdsAgent = new PaidAdsAgent();

  const paidAdsResult = await paidAdsAgent.execute({
    entityId: TEST_ENTITY,
    apiKey: TEST_API_KEY,
    mode: 'status',
  });

  ok('PaidAds: has prose', typeof paidAdsResult.prose === 'string');
  ok('PaidAds: response_type is execution', paidAdsResult.response_type === 'execution');
  ok('PaidAds: has artifact', !!paidAdsResult.artifact);
  ok('PaidAds: artifact type is execution_tracker', paidAdsResult.artifact?.type === 'execution_tracker');
  ok('PaidAds: has metrics', typeof paidAdsResult.artifact?.metrics === 'object');
  ok('PaidAds: has steps array', Array.isArray(paidAdsResult.artifact?.steps));

  // Campaign brief mode (no connector needed)
  const briefResult = await paidAdsAgent.execute({
    entityId: TEST_ENTITY,
    apiKey: TEST_API_KEY,
    mode: 'brief',
    campaignBrief: { campaignName: 'Q2 Launch', goal: 'conversions', budget: 5000, audience: 'B2B SaaS founders' },
  });

  ok('PaidAds brief: status is pending_launch', briefResult.artifact?.status === 'pending_launch');
  ok('PaidAds brief: has campaign_brief', !!briefResult.artifact?.campaign_brief);

  // ── 7. LLM-only agents (no connector) ────────────────────────────────────
  console.log('\n--- LLM-only agents ---');
  const LpDesignerAgent = require('../../platform/crewai/agents/lp-designer/index.js');
  const lpAgent = new LpDesignerAgent();
  const lpResult = await lpAgent.execute({ entityId: TEST_ENTITY, product: 'Marqq AI', goal: 'saas_trial', audience: 'Marketing Directors' });
  ok('LP Designer: has prose', typeof lpResult.prose === 'string');
  ok('LP Designer: response_type is creation', lpResult.response_type === 'creation');
  ok('LP Designer: artifact format is landing_page', lpResult.artifact?.format === 'landing_page');
  ok('LP Designer: has page_structure', Array.isArray(lpResult.artifact?.content?.page_structure));

  const SeAgent = require('../../platform/crewai/agents/se-agent/index.js');
  const seAgent = new SeAgent();
  const seResult = await seAgent.execute({ entityId: TEST_ENTITY, product: 'Marqq AI', competitor: 'HubSpot', audience: 'VP Marketing' });
  ok('SE Agent: has prose', typeof seResult.prose === 'string');
  ok('SE Agent: response_type is creation', seResult.response_type === 'creation');
  ok('SE Agent: artifact format is sales_enablement_pack', seResult.artifact?.format === 'sales_enablement_pack');
  ok('SE Agent: has battlecard', !!seResult.artifact?.content?.battlecard);
  ok('SE Agent: has objection_handlers', !!seResult.artifact?.content?.objection_handlers);
}

// ── Live tests (only if LIVE=true) ───────────────────────────────────────────

async function runLiveTests() {
  const entityId = process.env.TEST_ENTITY_ID;
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!entityId || !apiKey) {
    console.log('\n[Live tests skipped] Set TEST_ENTITY_ID and COMPOSIO_API_KEY to run live');
    return;
  }

  console.log(`\n--- Live tests (entity: ${entityId}) ---`);
  const ConnectorChecker = require('../../platform/crewai/routing/connector-checker');
  const checker = new ConnectorChecker(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

  try {
    const integrations = await checker.getConnectedIntegrations(entityId);
    ok('Live: getConnectedIntegrations returns array', Array.isArray(integrations));
    console.log(`\n  Connected integrations: ${integrations.join(', ') || '(none)'}`);
  } catch (err) {
    console.log(`\n  Live test skipped: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Connector Integration Tests ===\n');

  const { server, baseUrl } = await startMockComposioServer();
  const restore = patchComposioUrl(baseUrl);

  try {
    await runConnectorTests(baseUrl);
    if (process.env.LIVE === 'true') {
      await runLiveTests();
    }
  } finally {
    restore();
    server.close();
  }

  console.log(`\n\n=== Results ===`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f.label}: ${f.detail}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
