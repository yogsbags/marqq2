---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 08
current_phase_name: Outcome Ledger
current_plan: 3
status: ready_for_verification
stopped_at: Completed 08-03-PLAN.md
last_updated: "2026-03-10T13:55:00Z"
last_activity: 2026-03-10
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 24
  completed_plans: 24
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Every agent run must move a business metric, verified through an outcome ledger that learns per company over time.
**Current focus:** Phase 8 — Outcome Ledger (all 3 plans complete, ready for verification)

## Current Position

Current Phase: 08
Current Phase Name: Outcome Ledger
Total Phases: 8
Current Plan: 3
Total Plans in Phase: 3
Phase: 8 of 8 (Outcome Ledger)
Plan: 3 of 3 complete in current phase (08-01, 08-02, 08-03 complete)
Status: Phase 8 complete, ready for verification
Last Activity: 2026-03-10
Last activity: 2026-03-16 - Completed quick task 4: Build n8n workflows + inject automation data into agent prompts

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 24
- Average duration: 4.1 min
- Total execution time: 1.63 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-mkg-foundation | 3 | 13 min | 4.3 min |
| 02-agent-contract-standard | 3 | 11 min | 3.7 min |
| 03-veena-company-intelligence | 3 | 14 min | 4.7 min |
| 04-12-agent-rewrite | 1 | 15 min | 15 min |
| 05-hooks-system | 3 | 15 min | 5 min |
| 06-data-pipeline | 3 | 21 min | 7 min |
| 08-outcome-ledger | 3 | 42 min | 14 min |

**Recent Trend:**
- Last 5 plans: 08-03 (14 min), 08-02 (10 min), 08-01 (18 min), 03-03 (2 min), 05-03 (7 min)
- Trend: —

*Updated after each plan completion*
| Phase 02-agent-contract-standard P02 | 8 min | 1 tasks | 1 files |
| Phase 02-agent-contract-standard P03 | 1 min | 1 tasks | 1 files |
| Phase 03-veena-company-intelligence P01 | 6 min | 2 tasks | 6 files |
| Phase 03-veena-company-intelligence P02 | 6 min | 2 tasks | 3 files |
| Phase 03-veena-company-intelligence P03 | 2 min | 2 tasks | 2 files |
| Phase 04-12-agent-rewrite P01 | 15 min | 2 tasks | 22 files |
| Phase 05-hooks-system P01 | 4 min | 3 tasks | 6 files |
| Phase 05-hooks-system P02 | 4 min | 3 tasks | 5 files |
| Phase 05-hooks-system P03 | 7 min | 4 tasks | 6 files |
| Phase 06-data-pipeline P01 | 12 min | 2 tasks | 5 files |
| Phase 06-data-pipeline P02 | 4 min | 2 tasks | 2 files |
| Phase 06 P03 | 5 min | 2 tasks | 5 files |
| Phase 08-outcome-ledger P01 | 18 min | 4 tasks | 4 files |
| Phase 08-outcome-ledger P02 | 10 min | 3 tasks | 2 files |
| Phase 08-outcome-ledger P03 | 14 min | 3 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Design]: MKG as shared JSON on disk + Supabase sync — avoids context rot, field-level expiry
- [Design]: AgentRunOutput contract enforced on every run — enables outcome ledger and handoff notes
- [Design]: Clean slate rewrite (option B) — retrofit would leave incompatible architectural debt
- [Design]: Differential analysis for swarms — only process delta since last_checked (87% cost reduction)
- [Implementation]: MKGService.isStale() is synchronous — takes pre-read field envelope; callers read first then check staleness (enables use in .filter() chains)
- [Implementation]: patch() ignores unknown fields with console.warn (defensive, forward-compatible)
- [Implementation]: 00- prefix for agent skill files guarantees first-load ordering via natural lexicographic sort
- [DB Schema]: company_id is TEXT not UUID FK on company_mkg — MKG works before company exists in Supabase (disk-first)
- [DB Schema]: mkg_data stored as full JSONB envelope (not normalized) — field schema can evolve; GIN-indexed for confidence queries
- [DB Schema]: agent_run_outputs is append-only — rows never updated; run_id UNIQUE for idempotency
- [DB Schema]: RLS service-role-only on both MKG tables — frontend direct reads deferred
- [API]: companyId validated by regex /^[a-zA-Z0-9_-]{1,64}$/ at route level (not just MKGService) — defense in depth
- [API]: Vite catch-all /api proxy covers /api/mkg/* — no vite.config.ts change needed when adding new /api routes
- [Contract]: extractContract uses lastIndexOf — guards against LLM mid-response sentinel duplication
- [Contract]: company_id allowed as null in validateContract — caller may not have sent it at run time
- [Contract]: outcome_prediction left unvalidated (any/null) — stored inside artifact JSONB per research recommendation
- [DB Schema]: user_id on agent_tasks made nullable — system-generated tasks have no auth.users initiator
- [DB Schema]: priority column constrained to low/medium/high CHECK with default medium
- [Phase 02-agent-contract-standard]: max_tokens increased from 4096 to 8192 — long prose + contract JSON block requires the extra headroom
- [Phase 02-agent-contract-standard]: company_id is optional in run endpoint — existing slash-command callers omitting it continue to work; MKG patch skipped with console.warn
- [Phase 02-agent-contract-standard]: contractInstruction always injected LAST in system prompt to maximise LLM compliance
- [Phase 02-agent-contract-standard]: Promise.allSettled used (not Promise.all) so one Supabase write failure does not abort others in the run endpoint persistence block
- [Phase 02-agent-contract-standard]: 23505 unique_violation swallowed silently in saveAgentRunOutput — client retries are idempotent by design (run_id UNIQUE constraint)
- [Phase 03]: Veena bootstrap uses the existing agent directory convention plus explicit reads_from_mkg, writes_to_mkg, and triggers_agents fields
- [Phase 03-veena-company-intelligence]: Kept veena-crawler.js independent from backend-server.js to avoid circular imports and backend bloat
- [Phase 03-veena-company-intelligence]: Used a 120-second compound timeout with llama-3.3-70b-versatile fallback so crawlCompanyForMKG never aborts without a normalized result
- [Phase 03-veena-company-intelligence]: Loaded Groq and MKGService lazily because local package resolution was unavailable during verification, while preserving runtime integration behavior
- [Phase 04-12-agent-rewrite]: All 11 non-Veena SOUL files now follow the Veena-style MKG contract format with explicit role mapping, read/write fields, and downstream triggers
- [Phase 04-12-agent-rewrite]: Reset all non-Veena MEMORY.md files to a clean baseline before runtime registration so scheduler updates do not inherit legacy state
- [Phase 06-data-pipeline]: KPI aggregation writes raw snapshots through the pipeline service-role client, then upserts source-specific and blended rows into company_kpi_daily
- [Phase 06-data-pipeline]: KPI formulas return NULL for impossible denominators, and downstream readers must stay on company_kpi_daily instead of connector_raw_snapshots
- [Phase 06]: Defaulted nightly anomaly scheduling to 18:30 UTC so the long-lived backend timer lands at midnight IST without adding cron. — This keeps the scheduler inside the existing backend process lifecycle and gives a deterministic UTC/IST-safe nightly window.
- [Phase 06]: Anomaly narration remains severity-first: only high or critical anomalies call Groq, and prompts/MKG patches use KPI summaries only. — This preserves the safe-read boundary from company_kpi_daily and prevents low-signal anomalies from spending tokens or exposing raw payload data.
- [Phase 05-hooks-system]: hooks.json is now the only checked-in Phase 5 hook inventory and explicitly reserves chat_triggers as an empty array for later work.
- [Phase 05-hooks-system]: Hooks config validation rejects malformed cron, duplicate ids, unknown agents, and missing HOOKS-02 mappings before later runtime dispatch code starts.
- [Phase 05-hooks-system]: HooksEngine claims pending agent_signals rows, evaluates company-specific baselines from MKG, and emits normalized dispatch batches without directly calling the run endpoint.
- [Phase 05-hooks-system]: Hook-triggered runs now flow through the existing SSE agent route, and scheduler jobs load from hooks.json instead of hard-coded cron literals.
- [Phase 08-outcome-ledger]: Outcome verification writes to a dedicated `outcome_ledger` table and computes accuracy from signed variance against the prediction reference value.
- [Phase 08-outcome-ledger]: Calibration notes are stored as machine-readable markdown blocks inside agent MEMORY.md files so prompts stay human-readable while tests can parse exact note payloads.
- [Phase 08-outcome-ledger]: The Python verifier supports `--dry-run` without optional dotenv/supabase packages, but non-dry-run execution still requires the full scheduler environment.

### Pending Todos

- Run database/migrations/mkg-foundation.sql in Supabase SQL Editor (human step — migration NOT yet applied)
- Run database/migrations/agent-contract.sql in Supabase SQL Editor after agent-employees.sql (human step — migration NOT yet applied)
- Run database/migrations/outcome-ledger.sql in Supabase SQL Editor (human step — migration NOT yet applied)

### Blockers/Concerns

- MKGService Supabase sync will fail silently until mkg-foundation.sql is applied to Supabase (non-blocking for disk ops)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Build Automation Registry system for Marqq agents | 2026-03-15 | accb6ca | [1-build-automation-registry-system-for-mar](./quick/1-build-automation-registry-system-for-mar/) |
| 2 | Wire Composio connector endpoints and OAuth flow in AccountsTab | 2026-03-15 | c958f45 | [2-wire-composio-connector-endpoints-and-oa](./quick/2-wire-composio-connector-endpoints-and-oa/) |
| 3 | Consolidate workspace/company — make workspace.id the single source of truth for company_id | 2026-03-16 | f3c4a37 | [3-consolidate-workspace-company-make-works](./quick/3-consolidate-workspace-company-make-works/) |
| 4 | Build n8n workflows + inject automation data into agent prompts | 2026-03-16 | ab34e73 | platform/content-engine/automations/ |
| 5 | Custom n8n MCP server with create_workflow tool | 2026-03-16 | 14a3b36 | platform/mcp-servers/n8n/ |
| 6 | Agent-scheduled n8n automations with cron scheduling | 2026-03-16 | [commit-hash] | platform/content-engine/automations/ |

## Session Continuity

Last session: 2026-03-16T00:00:00Z
Stopped at: Completed quick task 4: Build n8n workflows + inject automation data into agent prompts
Resume file: None
