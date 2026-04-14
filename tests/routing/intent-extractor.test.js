'use strict';

/**
 * Phase 7.1 — Intent Extraction Unit Tests
 *
 * Tests the AgenticLoop keyword-based intent extractor against
 * 50+ user messages covering all 32 goals. Run with:
 *   node tests/routing/intent-extractor.test.js
 */

const AgenticLoop = require('../../platform/crewai/core/agenticLoop');

// ── Test runner (no external test library dependency) ────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assertEqual(label, actual, expected) {
  if (actual === expected) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    failures.push({ label, actual, expected });
    process.stdout.write('F');
  }
}

function assertContains(label, actual, expectedSubstring) {
  if (typeof actual === 'string' && actual.includes(expectedSubstring)) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    failures.push({ label, actual, expected: `contains "${expectedSubstring}"` });
    process.stdout.write('F');
  }
}

function assertAbove(label, actual, threshold) {
  if (typeof actual === 'number' && actual >= threshold) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    failures.push({ label, actual, expected: `>= ${threshold}` });
    process.stdout.write('F');
  }
}

// ── Test cases: message → expected goal_id ───────────────────────────────────

const TEST_CASES = [
  // Acquire
  { msg: 'Find me 50 leads in the SaaS space', goal: 'find-leads' },
  { msg: 'Get me a prospect list for B2B fintech companies', goal: 'find-leads' },
  { msg: 'I need qualified leads matching our ICP', goal: 'find-leads' },
  { msg: 'Enrich my lead list with missing emails', goal: 'enrich-leads' },
  { msg: 'Add contact data to these leads', goal: 'enrich-leads' },
  { msg: 'Build an outreach sequence for cold email', goal: 'build-sequences' },
  { msg: 'Create a LinkedIn outreach sequence', goal: 'build-sequences' },
  { msg: 'Define our target audience segments', goal: 'define-audiences' },
  { msg: 'Create a lead magnet for our webinar', goal: 'create-magnets' },
  { msg: 'Build a referral program', goal: 'referral-program' },

  // Advertise
  { msg: 'Launch a Google Ads campaign', goal: 'run-paid-ads' },
  { msg: 'Run paid ads on Meta', goal: 'run-paid-ads' },
  { msg: 'Generate ad creative variations', goal: 'generate-creatives' },
  { msg: 'Create ad copy for our campaign', goal: 'generate-creatives' },
  { msg: 'Optimize our ROAS across channels', goal: 'optimize-roas' },
  { msg: 'We\'re wasting money on ads, help', goal: 'optimize-roas' },
  { msg: 'Improve ad spend efficiency', goal: 'optimize-roas' },

  // Create
  { msg: 'Write a blog post about AI marketing', goal: 'produce-content' },
  { msg: 'Produce content for our website', goal: 'produce-content' },
  { msg: 'Plan our social media strategy', goal: 'run-social' },
  { msg: 'Build a content calendar for next month', goal: 'social-calendar' },
  { msg: 'Create an email onboarding sequence', goal: 'email-sequences' },
  { msg: 'Set up email automation', goal: 'email-sequences' },
  { msg: 'Improve our SEO rankings', goal: 'seo-visibility' },

  // Convert
  { msg: 'Increase our conversion rate', goal: 'increase-conversions' },
  { msg: 'Our conversion rate is too low, what do we do', goal: 'increase-conversions' },
  { msg: 'Set up an A/B test', goal: 'test-variants' },
  { msg: 'Run a split test on the landing page', goal: 'test-variants' },
  { msg: 'Create a landing page for our campaign', goal: 'landing-pages' },
  { msg: 'Build a sales page', goal: 'landing-pages' },
  { msg: 'Help us strengthen our offer', goal: 'strengthen-offer' },
  { msg: 'Sharpen our brand messaging', goal: 'sharpen-messaging' },

  // Retain
  { msg: 'Identify customers at risk of churning', goal: 'reduce-churn' },
  { msg: 'Reduce churn in our customer base', goal: 'reduce-churn' },
  { msg: 'Set up lifecycle engagement automation', goal: 'lifecycle-engagement' },
  { msg: 'Analyse customer behaviour patterns', goal: 'customer-behavior' },

  // Plan
  { msg: 'Research the market for AI tools', goal: 'market-research' },
  { msg: 'What are our competitors doing', goal: 'market-signals' },
  { msg: 'Track competitor signals', goal: 'market-signals' },
  { msg: 'Clarify our brand positioning', goal: 'positioning' },
  { msg: 'Plan our product launch', goal: 'launch-planning' },
  { msg: 'Create a launch strategy', goal: 'launch-planning' },
  { msg: 'Build a sales battlecard', goal: 'sales-enablement' },
  { msg: 'Create sales resources for the team', goal: 'sales-enablement' },

  // Analyze
  { msg: 'Measure our marketing performance', goal: 'measure-performance' },
  { msg: 'Show me our marketing KPIs', goal: 'measure-performance' },
  { msg: 'Give me a full marketing audit', goal: 'marketing-audit' },
  { msg: 'How are our marketing channels performing', goal: 'channel-health' },
  { msg: 'Understand what\'s happening in our market', goal: 'understand-market' },
  { msg: 'What\'s the revenue ops situation', goal: 'revenue-ops' },
];

// Edge cases — these should return null/low confidence, not crash
const EDGE_CASES = [
  { msg: 'Hello', expectNull: true },
  { msg: 'What is 2+2?', expectNull: true },
  { msg: '', expectNull: true },
  { msg: 'Tell me a joke', expectNull: true },
];

// ── Run tests ─────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== Intent Extractor Tests ===\n');

  const loop = new AgenticLoop({});

  let correctGoals = 0;
  const totalGoalTests = TEST_CASES.length;

  console.log(`Running ${totalGoalTests} goal extraction tests...`);
  console.log('(. = pass, F = fail)\n');

  for (const tc of TEST_CASES) {
    const result = loop._extractIntentByKeywords(tc.msg);
    const isCorrect = result && result.goal_id === tc.goal;

    if (isCorrect) {
      correctGoals++;
      passed++;
      process.stdout.write('.');
    } else {
      failed++;
      failures.push({
        label: `Intent: "${tc.msg.slice(0, 50)}"`,
        actual: result ? result.goal_id : 'null',
        expected: tc.goal,
      });
      process.stdout.write('F');
    }
  }

  console.log('\n');
  console.log(`Running ${EDGE_CASES.length} edge case tests...`);

  for (const ec of EDGE_CASES) {
    const result = loop._extractIntentByKeywords(ec.msg);
    const label = `Edge: "${ec.msg.slice(0, 30) || '(empty)'}"`;

    if (ec.expectNull) {
      // Either null result or confidence below threshold
      const isLowConfidence = !result || result.confidence < 0.5;
      if (isLowConfidence) {
        passed++;
        process.stdout.write('.');
      } else {
        failed++;
        failures.push({ label, actual: result?.goal_id, expected: 'null or low confidence' });
        process.stdout.write('F');
      }
    }
  }

  // ── Confidence score tests ────────────────────────────────────────────────
  console.log('\n\nRunning confidence score tests...');

  const highConfidenceMessages = [
    'Find me 50 qualified leads in SaaS',
    'Optimize our ROAS and reduce ad waste',
    'Create a landing page for our product launch',
  ];

  for (const msg of highConfidenceMessages) {
    const result = loop._extractIntentByKeywords(msg);
    assertAbove(`Confidence >= 0.7: "${msg.slice(0, 40)}"`, result?.confidence ?? 0, 0.7);
  }

  // ── Routing table coverage ────────────────────────────────────────────────
  console.log('\n\nChecking routing table coverage...');

  const routingGoals = Object.keys(loop.routingTable.goals);
  assertEqual('Routing table has 30+ goals', routingGoals.length >= 30, true);

  // Every goal in routing table has required fields
  for (const [goalId, config] of Object.entries(loop.routingTable.goals)) {
    assertEqual(`Goal "${goalId}" has agent`, typeof config.agent, 'string');
    assertEqual(`Goal "${goalId}" has crew`, typeof config.crew, 'string');
    assertEqual(`Goal "${goalId}" has keywords`, Array.isArray(config.keywords), true);
    assertEqual(`Goal "${goalId}" has response_type`, typeof config.response_type, 'string');
  }

  // ── Results ───────────────────────────────────────────────────────────────
  const accuracy = Math.round((correctGoals / totalGoalTests) * 100);
  console.log('\n\n=== Results ===\n');
  console.log(`Goal routing accuracy: ${correctGoals}/${totalGoalTests} (${accuracy}%)`);
  console.log(`Target: 90%+ | Status: ${accuracy >= 90 ? '✅ PASS' : '❌ BELOW TARGET'}`);
  console.log(`\nTotal assertions: ${passed + failed}`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => {
      console.log(`  ✗ ${f.label}`);
      console.log(`    Expected: ${f.expected}`);
      console.log(`    Actual:   ${f.actual}`);
    });
  }

  console.log('\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
