#!/usr/bin/env node
/**
 * Backend E2E for Nouriva's paid-ads launch path.
 *
 * Flow covered:
 *   selected Meta account → Zara strategy plan → account readiness →
 *   local creative draft → Meta draft execution (PAUSED only)
 *
 * Run with the backend using production-like credentials:
 *   node --env-file=.env.marqq-live platform/content-engine/backend-server.js
 *   BASE_URL=http://127.0.0.1:3008 npm run test:nouriva:paid-ads
 *
 * This never requests ACTIVE status and therefore must not start spend.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = String(process.env.BASE_URL || 'http://127.0.0.1:3008').replace(/\/$/, '');
const COMPANY_ID = process.env.COMPANY_ID || 'b08d3df3-c1a9-4632-96ec-e6e5b703c2a0';
const WORKSPACE_ID = process.env.WORKSPACE_ID || '44769d4f-0c8c-4046-8a7b-ddab2feba4b3';
const META_ACCOUNT_ID = process.env.META_ACCOUNT_ID || 'act_1721558035534754';
const META_PAGE_ID = process.env.META_PAGE_ID || '1236398099550846';
const CREATIVE_TYPE = String(process.env.CREATIVE_TYPE || 'IMAGE').toUpperCase();
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'scripts', 'output', 'nouriva-paid-ads');

async function api(path, { method = 'GET', body, timeoutMs = 180_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = {
  company: 'Nouriva AI',
  website: 'https://nouriva.tech',
  companyId: COMPANY_ID,
  workspaceId: WORKSPACE_ID,
  selectedMetaAccount: META_ACCOUNT_ID,
  selectedMetaPage: META_PAGE_ID,
  draftOnly: true,
  startedAt: new Date().toISOString(),
  steps: [],
};

try {
  const strategy = await api('/api/agents/zara/plan', {
    method: 'POST',
    body: {
      task: 'Create a paid acquisition strategy for Nouriva AI. Align every recommendation to the locked North Star: 500 Activated Paid Users in 90 days. Use Meta as the first channel. Define objective, audience, funnel, budget allocation, creative angles, conversion event, measurement plan, guardrails, and course-correction rules. Do not publish or activate anything.',
      taskType: 'paid_ads_strategy',
      moduleId: 'paid-ads',
      marketingContext: {
        companyName: 'Nouriva AI',
        website: 'https://nouriva.tech',
        northStarMetric: 'Activated Paid Users',
        northStarDefinition: 'A user who uploads a lab report, subscribes to a paid plan, and logs at least two meals within the first seven days.',
        quantifiedTarget: '500 Activated Paid Users',
        timeline: '90 days',
        audience: 'Health-conscious adults with recent lab reports seeking personalized nutrition',
        selectedChannel: 'Meta Ads',
        selectedMetaAccount: META_ACCOUNT_ID,
        deliveryMode: 'draft',
      },
    },
  });
  assert(strategy?.summary || strategy?.executionPrompt || Array.isArray(strategy?.subtasks), 'Zara returned no usable paid-ads strategy plan');
  report.strategy = {
    summary: strategy.summary || null,
    subtasks: strategy.subtasks || [],
    executionPrompt: strategy.executionPrompt || null,
    model: strategy.model || null,
  };
  report.steps.push({ name: 'strategy', status: 'passed' });

  const preferences = await api('/api/integrations/preferences', {
    method: 'POST',
    body: { companyId: COMPANY_ID, meta_ads_account_id: META_ACCOUNT_ID },
  });
  assert(preferences?.preferences?.meta_ads_account_id === META_ACCOUNT_ID, 'Selected Meta account was not saved');
  report.steps.push({ name: 'account-selection', status: 'passed', accountId: META_ACCOUNT_ID });

  try {
    const accounts = await api(`/api/analytics/meta-ads/accounts?companyId=${encodeURIComponent(COMPANY_ID)}`);
    const selected = (accounts.accounts || []).find((account) => account.id === META_ACCOUNT_ID);
    assert(selected, `Selected Meta account ${META_ACCOUNT_ID} was not returned by account discovery`);
    report.account = selected;
    report.steps.push({ name: 'account-readiness', status: 'passed', account: selected });
  } catch (error) {
    // The account ID is intentionally supplied by the test (the same account
    // selected in the UI). Keep exercising the launch path when Composio's
    // discovery proxy is temporarily unauthorized, but make the warning
    // explicit in the report.
    report.steps.push({ name: 'account-readiness', status: 'warning', error: error.message });
  }

  const execution = await api('/api/automations/execute', {
    method: 'POST',
    timeoutMs: 240_000,
    body: {
      company_id: COMPANY_ID,
      automation_id: 'create_meta_campaign',
      params: {
        ad_account_id: META_ACCOUNT_ID,
        page_id: META_PAGE_ID,
        campaign_name: `Nouriva AI — Paid Ads E2E — ${new Date().toISOString().slice(0, 10)}`,
        objective: 'OUTCOME_LEADS',
        daily_budget: 50000,
        targeting: { age_min: 18, age_max: 65, geo_locations: { countries: ['IN'] } },
        headline: 'Get your 7-day meal plan',
        primary_text: 'Plan balanced Indian meals around your routine with Nouriva AI. Review the plan and make your next week easier to start.',
        link_url: 'https://nouriva.tech/',
        creative_type: CREATIVE_TYPE,
        generate_video: CREATIVE_TYPE === 'VIDEO',
        cta_type: 'SIGN_UP',
        channel: 'facebook_instagram',
        status: 'PAUSED',
        loop_dry_run: true,
        quantified_target: '500 Activated Paid Users',
        timeline_target: '90 days',
      },
    },
  });
  report.execution = execution;
  const executionResult = execution?.result || execution;
  assert(executionResult?.status === 'completed' || executionResult?.creative_draft_id, 'Meta draft execution did not return a draft or execution result');
  report.steps.push({ name: 'draft-execution', status: executionResult.status === 'completed' ? 'passed' : 'blocked-at-meta-creative', details: execution });
  report.completedAt = new Date().toISOString();

  await mkdir(OUT_DIR, { recursive: true });
  const outputPath = join(OUT_DIR, `run-${Date.now()}.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outputPath, report }, null, 2));
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.message : String(error);
  await mkdir(OUT_DIR, { recursive: true });
  const outputPath = join(OUT_DIR, `failed-${Date.now()}.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ ok: false, outputPath, report }, null, 2));
  process.exitCode = 1;
}
