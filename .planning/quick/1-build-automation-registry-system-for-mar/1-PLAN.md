---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - platform/content-engine/automations/registry.js
  - platform/content-engine/automations/migrations/001_automation_runs.sql
  - platform/content-engine/backend-server.js
autonomous: true
requirements: []

must_haves:
  truths:
    - "GET /api/automations/registry returns the 5 automation catalog entries"
    - "GET /api/automations/runs?company_id=X returns recent runs from Supabase"
    - "Agents can declare automation_triggers in their contract JSON"
    - "executeAutomationTriggers runs after writeTasksCreated in both run paths"
    - "creative_fatigue_check internal_fn correctly flags fatigued ads"
  artifacts:
    - path: "platform/content-engine/automations/registry.js"
      provides: "Automation catalog with 5 entries and executeAutomation dispatcher"
      exports: ["REGISTRY", "executeAutomationTriggers"]
    - path: "platform/content-engine/automations/migrations/001_automation_runs.sql"
      provides: "automation_runs table DDL"
      contains: "CREATE TABLE IF NOT EXISTS automation_runs"
  key_links:
    - from: "platform/content-engine/backend-server.js finalizeAgentRunResponse"
      to: "platform/content-engine/automations/registry.js executeAutomationTriggers"
      via: "called right after Promise.allSettled([saveAgentRunOutput, createMissingDataTask, writeTasksCreated])"
    - from: "platform/content-engine/backend-server.js runAgentForArtifact"
      to: "platform/content-engine/automations/registry.js executeAutomationTriggers"
      via: "called just before return contract at line ~4021"
---

<objective>
Build the Automation Registry system: a catalog of 5 named automations agents can declare in their contract, a dispatcher that executes them after each run, and two read endpoints for introspection.

Purpose: Agents can now trigger real-world data fetches (Meta Ads, Google Ads, Apollo enrichment) and internal analysis (creative fatigue) by declaring intent in their contract JSON rather than hardcoding API calls in SOUL files.
Output: registry.js module, SQL migration, contract template extensions in both run paths, executeAutomationTriggers wiring, and two new GET endpoints.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key patterns from the existing codebase (do not re-read — use these directly):

- Supabase client pattern: `const client = supabaseAdminClient || supabase;` (see writeTasksCreated ~line 4096)
- Promise.allSettled for fire-and-log persistence: line ~779 in finalizeAgentRunResponse
- All /api routes use Express `app.get(...)` / `app.post(...)` — add new routes before the "Start" comment at line ~4623
- contractInstruction block 1: lines ~3943-3975 (inside runAgentForArtifact)
- contractInstruction block 2: lines ~4447-4490 (inside the interactive SSE run route)
- finalizeAgentRunResponse Promise.allSettled block at line ~779-783:
    await Promise.allSettled([
      saveAgentRunOutput(rawContract, fullText),
      createMissingDataTask(rawContract),
      writeTasksCreated(rawContract),
    ]);
  Add executeAutomationTriggers call immediately AFTER this block, before res.write contract.
- runAgentForArtifact: no Promise.allSettled; add executeAutomationTriggers just before `return contract;` at line ~4021
- Node require() style (CommonJS) throughout backend-server.js — no import/export
- The automations directory does not yet exist — executor must mkdir it
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create automations/registry.js with catalog and dispatcher</name>
  <files>platform/content-engine/automations/registry.js</files>
  <action>
Create the directory platform/content-engine/automations/ and write registry.js as a CommonJS module.

REGISTRY — array of 5 objects. Each entry has:
  id, name, description, category, trigger_type, endpoint, params_schema, returns, which_agents_can_invoke

Entries (exact values):
  1. id: "fetch_meta_ads"
     name: "Fetch Meta Ads Performance"
     description: "Pulls ad performance metrics from Meta Ads Graph API via n8n webhook"
     category: "paid_media"
     trigger_type: "n8n_webhook"
     endpoint: "N8N_META_ADS_WEBHOOK"
     params_schema: { ad_account_id: "Meta Ads account ID", date_range: "e.g. last_7d or last_30d" }
     returns: "{ campaigns: [...], adsets: [...], ads: [...] }"
     which_agents_can_invoke: ["isha", "maya", "arjun"]

  2. id: "competitor_ad_library"
     name: "Competitor Ad Library Scrape"
     description: "Scrapes Meta Ad Library public API for competitor creatives"
     category: "competitive_intel"
     trigger_type: "direct_api"
     endpoint: "META_AD_LIBRARY_API_URL"
     params_schema: { search_term: "Brand or keyword to search", country: "Two-letter country code e.g. IN" }
     returns: "{ ads: [{ id, page_name, creative, impressions_range }] }"
     which_agents_can_invoke: ["*"]

  3. id: "creative_fatigue_check"
     name: "Creative Fatigue Check"
     description: "Analyses CTR trend and frequency to identify fatigued ad creatives"
     category: "creative_analysis"
     trigger_type: "internal_fn"
     endpoint: null
     params_schema: { ads: "Array of { name, impressions, clicks, frequency }" }
     returns: "{ fatigued_ads: [...], healthy_ads: [...], summary: string }"
     which_agents_can_invoke: ["isha", "maya"]

  4. id: "google_ads_fetch"
     name: "Fetch Google Ads Performance"
     description: "Pulls Google Ads campaign and keyword performance via n8n webhook"
     category: "paid_media"
     trigger_type: "n8n_webhook"
     endpoint: "N8N_GOOGLE_ADS_WEBHOOK"
     params_schema: { customer_id: "Google Ads customer ID", date_range: "e.g. last_7d" }
     returns: "{ campaigns: [...], keywords: [...], search_terms: [...] }"
     which_agents_can_invoke: ["isha", "arjun"]

  5. id: "apollo_lead_enrich"
     name: "Apollo Lead Enrichment"
     description: "Enriches lead records with firmographic and contact data via Apollo API"
     category: "lead_data"
     trigger_type: "direct_api"
     endpoint: "APOLLO_API_URL"
     params_schema: { email: "Lead email address", domain: "Company domain (optional)" }
     returns: "{ person: {...}, organization: {...} }"
     which_agents_can_invoke: ["neel", "sam", "kiran"]

creativeFatigueCheck(params) — internal function (not exported):
  Input: { ads: [{ name, impressions, clicks, frequency }] }
  - Compute ctr per ad: clicks / impressions (0 if impressions === 0)
  - Compute averageCtr: sum of all ctrs / ads.length (0 if no ads)
  - Fatigued condition: frequency > 3 AND ctr < averageCtr * 0.8
  - Split into fatigued_ads and healthy_ads arrays (include computed ctr field in each)
  - summary: "{N} of {total} ads are fatigued (high frequency, low CTR). Recommend refreshing: {names}."
    If no fatigued ads: "All {total} ads appear healthy."
  Return { fatigued_ads, healthy_ads, summary }

executeAutomation(trigger, companyId, runId) — internal async function:
  - trigger: { automation_id, params, reason }
  - Find entry in REGISTRY by id; if missing return { status: "error", error: "unknown automation_id: " + trigger.automation_id }
  - If trigger_type === "internal_fn": call creativeFatigueCheck(trigger.params || {}); return { status: "completed", ...result }
  - For n8n_webhook / direct_api:
    - url = process.env[entry.endpoint]
    - If !url return { status: "simulated", message: "endpoint not configured: " + entry.endpoint, automation_id: entry.id }
    - Otherwise: attempt to require('node-fetch'); if fails return simulated result
    - POST to url with JSON body { automation_id: entry.id, params: trigger.params || {}, company_id: companyId, run_id: runId }
    - Parse and return JSON response; on any error return { status: "error", error: err.message, automation_id: entry.id }

executeAutomationTriggers(contract, companyId) — exported async function:
  - If !contract.automation_triggers || contract.automation_triggers.length === 0 return []
  - Load supabase: try { const { supabaseAdminClient, supabase } = require('../supabase'); client = supabaseAdminClient || supabase; } catch { client = null; }
  - For each trigger in contract.automation_triggers:
    - Call executeAutomation(trigger, companyId, contract.run_id)
    - Compute status: result.status || 'completed'
    - If client: try to insert row into automation_runs table — wrap in try/catch, never throw
      Row: { company_id: companyId || null, run_id: contract.run_id || null, automation_id: trigger.automation_id, automation_name: (REGISTRY.find(r => r.id === trigger.automation_id)?.name) || trigger.automation_id, status, params: trigger.params || {}, result, triggered_by_agent: contract.agent || null }
    - Collect { automation_id: trigger.automation_id, status, result }
  - Return collected array

module.exports = { REGISTRY, executeAutomationTriggers };
  </action>
  <verify>
Run from repo root:
  node -e "
    const { REGISTRY, executeAutomationTriggers } = require('./platform/content-engine/automations/registry.js');
    console.assert(REGISTRY.length === 5, 'should have 5 entries');
    const ids = REGISTRY.map(r => r.id);
    ['fetch_meta_ads','competitor_ad_library','creative_fatigue_check','google_ads_fetch','apollo_lead_enrich'].forEach(id => console.assert(ids.includes(id), 'missing: ' + id));
    const fatigue = REGISTRY.find(r => r.id === 'creative_fatigue_check');
    console.assert(fatigue.trigger_type === 'internal_fn', 'should be internal_fn');
    console.assert(typeof executeAutomationTriggers === 'function', 'exported fn');
    console.log('Task 1 OK');
  "
  </verify>
  <done>
registry.js exists and exports REGISTRY (5 entries) and executeAutomationTriggers. Node require() succeeds without errors. creative_fatigue_check entry has trigger_type "internal_fn".
  </done>
</task>

<task type="auto">
  <name>Task 2: SQL migration + extend both contractInstruction blocks + wire executeAutomationTriggers</name>
  <files>
    platform/content-engine/automations/migrations/001_automation_runs.sql,
    platform/content-engine/backend-server.js
  </files>
  <action>
PART A — SQL migration file:
Create platform/content-engine/automations/migrations/001_automation_runs.sql with exactly this content:

  CREATE TABLE IF NOT EXISTS automation_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id text,
    run_id text,
    automation_id text NOT NULL,
    automation_name text,
    status text NOT NULL DEFAULT 'pending',
    params jsonb DEFAULT '{}',
    result jsonb DEFAULT '{}',
    triggered_by_agent text,
    created_at timestamptz DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS automation_runs_company_id_idx ON automation_runs(company_id);
  CREATE INDEX IF NOT EXISTS automation_runs_run_id_idx ON automation_runs(run_id);

PART B — Extend contractInstruction block 1 (~line 3943 in runAgentForArtifact):
Inside the JSON template, add "automation_triggers": [] as a new field after "outcome_prediction": null.
Add a line in the instruction text after the existing bullet points:
  - automation_triggers: array of { "automation_id": "<id from registry>", "params": {}, "reason": "<why>" } — only include if you need live data or analysis from an automation

PART C — Extend contractInstruction block 2 (~line 4447 in interactive run route):
Same change: add "automation_triggers": [] to JSON template after "outcome_prediction": null, and add the same instruction bullet.

PART D — Add require at top of backend-server.js (after the existing requires, before any app.* calls):
  const { executeAutomationTriggers } = require('./automations/registry');

PART E — Wire executeAutomationTriggers in finalizeAgentRunResponse (~line 779):
After the Promise.allSettled block:
  await Promise.allSettled([
    saveAgentRunOutput(rawContract, fullText),
    createMissingDataTask(rawContract),
    writeTasksCreated(rawContract),
  ]);
Add immediately after (before res.write):
  if (rawContract.automation_triggers?.length) {
    await executeAutomationTriggers(rawContract, companyId).catch(err =>
      console.error('[automations] executeAutomationTriggers failed:', err)
    );
  }

PART F — Wire executeAutomationTriggers in runAgentForArtifact (~line 4021):
Before `return contract;` add:
  if (contract.automation_triggers?.length) {
    await executeAutomationTriggers(contract, companyId).catch(err =>
      console.warn('[automations] runAgentForArtifact triggers failed:', err)
    );
  }

PART G — Add two GET endpoints in backend-server.js before the "Start" section (~line 4623):

  // GET /api/automations/registry — return full catalog
  app.get('/api/automations/registry', (req, res) => {
    res.json({ automations: REGISTRY });
  });

  // GET /api/automations/runs — returns recent runs for a company
  app.get('/api/automations/runs', async (req, res) => {
    const { company_id, limit = '20' } = req.query;
    const client = supabaseAdminClient || supabase;
    if (!client) return res.status(503).json({ error: 'Supabase not configured' });
    try {
      let query = client.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(parseInt(limit, 10) || 20);
      if (company_id) query = query.eq('company_id', company_id);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ runs: data || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

Note: REGISTRY must be in scope for the route — since the require is at the top of the file,
destructure it: const { REGISTRY, executeAutomationTriggers } = require('./automations/registry');
  </action>
  <verify>
Run from repo root (starts server then checks; uses a quick syntax check instead):
  node --check platform/content-engine/backend-server.js && echo "syntax OK"

Then confirm migration file:
  grep -q "automation_runs" platform/content-engine/automations/migrations/001_automation_runs.sql && echo "migration OK"

Then confirm contract blocks were updated:
  grep -c "automation_triggers" platform/content-engine/backend-server.js
  (should be at least 6 occurrences: 2 in JSON templates, 2 in instruction text, 2 in wiring conditionals)
  </verify>
  <done>
backend-server.js passes --check (no syntax errors). Both contractInstruction blocks include "automation_triggers". executeAutomationTriggers is wired in both finalizeAgentRunResponse and runAgentForArtifact. Two new GET endpoints exist. SQL migration file exists with correct DDL.
  </done>
</task>

</tasks>

<verification>
1. node --check platform/content-engine/backend-server.js — must pass (no syntax errors)
2. node -e "require('./platform/content-engine/automations/registry.js')" — must not throw
3. grep -c "automation_triggers" platform/content-engine/backend-server.js — must be >= 6
4. grep -q "CREATE TABLE IF NOT EXISTS automation_runs" platform/content-engine/automations/migrations/001_automation_runs.sql — must match
5. grep -q "api/automations/registry" platform/content-engine/backend-server.js — must match
6. grep -q "api/automations/runs" platform/content-engine/backend-server.js — must match
</verification>

<success_criteria>
- registry.js exports REGISTRY (5 entries, correct fields) and executeAutomationTriggers
- creative_fatigue_check fn flags ads with frequency > 3 AND CTR > 20% below average
- Both contractInstruction blocks include "automation_triggers": [] in the JSON template
- executeAutomationTriggers is called in both run paths (fire-and-catch, never throws)
- GET /api/automations/registry and GET /api/automations/runs endpoints exist
- SQL migration file is ready to run in Supabase SQL Editor
- backend-server.js has no syntax errors after all edits
</success_criteria>

<output>
After completion, create .planning/quick/1-build-automation-registry-system-for-mar/1-SUMMARY.md with:
- Files created/modified
- Key decisions made
- Verification results
</output>
