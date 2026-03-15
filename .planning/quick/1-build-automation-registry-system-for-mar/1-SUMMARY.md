---
phase: quick
plan: 1
subsystem: automation-registry
tags: [automations, agent-contract, registry, paid-media, creative-analysis]
dependency_graph:
  requires: [platform/content-engine/backend-server.js, platform/content-engine/supabase.js]
  provides: [automation_triggers contract field, executeAutomationTriggers dispatcher, GET /api/automations/registry, GET /api/automations/runs]
  affects: [all agent runs via finalizeAgentRunResponse and runAgentForArtifact]
tech_stack:
  added: []
  patterns: [ESM dynamic import for node-fetch, fire-and-catch automation dispatch, internal_fn trigger type for pure-JS computations]
key_files:
  created:
    - platform/content-engine/automations/registry.js
    - platform/content-engine/automations/migrations/001_automation_runs.sql
  modified:
    - platform/content-engine/backend-server.js
decisions:
  - "Used ES module syntax (export/import) for registry.js — codebase is type:module throughout; CommonJS would require .cjs extension and break static analysis"
  - "creativeFatigueCheck is an internal function not exported — only reachable via automation_id dispatch to keep the registry interface minimal"
  - "executeAutomationTriggers uses dynamic import('../supabase.js') to load client lazily — avoids circular import risk and keeps registry.js self-contained"
  - "n8n_webhook and direct_api types use dynamic node-fetch import with graceful simulated fallback — server works without node-fetch installed"
metrics:
  duration: "8 min"
  completed: "2026-03-15"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Quick Task 1: Build Automation Registry System Summary

**One-liner:** ESM automation registry with 5-entry catalog, creativeFatigueCheck dispatcher, contract injection in both run paths, and two introspection endpoints.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create automations/registry.js | f2cda0f | platform/content-engine/automations/registry.js |
| 2 | SQL migration + backend wiring + endpoints | 5dd560e | platform/content-engine/automations/migrations/001_automation_runs.sql, platform/content-engine/backend-server.js |

## What Was Built

### Task 1 — registry.js

- `REGISTRY` array with 5 automation entries:
  - `fetch_meta_ads` (n8n_webhook, paid_media) — isha, maya, arjun
  - `competitor_ad_library` (direct_api, competitive_intel) — any agent (`"*"`)
  - `creative_fatigue_check` (internal_fn, creative_analysis) — isha, maya
  - `google_ads_fetch` (n8n_webhook, paid_media) — isha, arjun
  - `apollo_lead_enrich` (direct_api, lead_data) — neel, sam, kiran

- `creativeFatigueCheck(params)`: computes per-ad CTR, average CTR, flags ads where `frequency > 3 AND ctr < averageCtr * 0.8` as fatigued

- `executeAutomationTriggers(contract, companyId)`: iterates `contract.automation_triggers`, dispatches each, persists rows to `automation_runs`, returns collected results; never throws

### Task 2 — SQL Migration

`001_automation_runs.sql` creates the `automation_runs` table with:
- UUID primary key, company_id, run_id, automation_id, automation_name, status, params (jsonb), result (jsonb), triggered_by_agent, created_at
- Indexes on `company_id` and `run_id`

### Task 2 — backend-server.js Changes

1. Added ESM import: `import { REGISTRY, executeAutomationTriggers } from "./automations/registry.js"`
2. Extended `contractInstruction` block 1 (runAgentForArtifact): added `"automation_triggers": []` to JSON template and bullet to instructions
3. Extended `contractInstruction` block 2 (interactive SSE run): same additions
4. Wired `executeAutomationTriggers` in `finalizeAgentRunResponse` — after `Promise.allSettled`, before `res.write`
5. Wired `executeAutomationTriggers` in `runAgentForArtifact` — before `return contract`
6. Added `GET /api/automations/registry` — returns full REGISTRY catalog
7. Added `GET /api/automations/runs` — returns recent automation_runs rows filtered by `company_id`

## Verification Results

All 6 plan verification checks passed:

1. `node --check platform/content-engine/backend-server.js` — PASS (no syntax errors)
2. `import('./platform/content-engine/automations/registry.js')` — PASS (no throw)
3. `grep -c "automation_triggers"` — 6 occurrences (meets >= 6 requirement)
4. SQL DDL contains `CREATE TABLE IF NOT EXISTS automation_runs` — PASS
5. `api/automations/registry` endpoint present — PASS
6. `api/automations/runs` endpoint present — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Adaptation] ES module syntax instead of CommonJS**
- **Found during:** Task 1
- **Issue:** Plan specified `module.exports` / `require()` style, but `backend-server.js` and `supabase.js` use ES modules (`type: "module"` in package.json). A CommonJS registry.js would not be importable without dynamic `createRequire()` boilerplate.
- **Fix:** Wrote registry.js using `export const REGISTRY` and `export async function executeAutomationTriggers`. Used `import { REGISTRY, executeAutomationTriggers } from "./automations/registry.js"` in backend-server.js.
- **Files modified:** platform/content-engine/automations/registry.js, platform/content-engine/backend-server.js
- **Commit:** 5dd560e

## Pending Human Step

The SQL migration `platform/content-engine/automations/migrations/001_automation_runs.sql` must be run manually in the Supabase SQL Editor before `automation_runs` rows can be persisted. Until then, the insert is silently swallowed (try/catch).

## Self-Check: PASSED

- [x] `platform/content-engine/automations/registry.js` — exists
- [x] `platform/content-engine/automations/migrations/001_automation_runs.sql` — exists
- [x] Commits f2cda0f and 5dd560e — verified in git log
- [x] All 6 verification commands pass
