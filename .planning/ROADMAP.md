# Roadmap: Marketing Brain OS v1.0

## Overview

Transform 11 isolated, cold-start agents into a 12-agent Marketing Brain OS: shared knowledge graph, enforced output contracts, proactive signal-driven triggers, a structured data pipeline, competitive swarm intelligence, and an outcome ledger that makes the system measurably smarter per company over time. Every phase delivers a coherent, independently verifiable capability that unlocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked INSERTED)

- [x] **Phase 1: MKG Foundation** - Per-company knowledge graph on disk + Supabase, with service layer and REST endpoints ✓ 2026-03-10
- [x] **Phase 2: Agent Contract Standard** - Every agent run produces validated AgentRunOutput JSON; backend enforces schema (completed 2026-03-10)
- [ ] **Phase 3: Veena — Company Intelligence** - New orchestrator agent owns MKG; fires full onboarding chain on new company signal
- [x] **Phase 4: 12-Agent Rewrite** - All 11 existing agents rewritten per 12-node marketing framework; APScheduler updated ✓ 2026-03-10
- [ ] **Phase 5: Hooks System** - Signal-driven and scheduled triggers evaluated every heartbeat; hooks.json as config
- [x] **Phase 6: Data Pipeline** - Connector raw data → SQL aggregation → KPI views → anomaly detection → MKG narration ✓ 2026-03-10
- [ ] **Phase 7: Swarm Layer** - Priya competitive intelligence via ConcurrentWorkflow + SpreadsheetSwarm + Watchdog patterns
- [ ] **Phase 8: Outcome Ledger** - Predicted vs actual metric tracking; per-company calibration loop closes via Arjun

---

## Phase Details

### Phase 1: MKG Foundation
**Goal:** Agents can read and write a per-company Marketing Knowledge Graph with field-level confidence and expiry metadata; the knowledge base persists across runs and is never stale.
**Depends on:** Nothing (first phase)
**Requirements:** MKG-01, MKG-02, MKG-03, MKG-04, MKG-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. A `mkg.json` file exists per company on disk with at least one field containing value, confidence, last_verified, source_agent, and expires_at.
  2. Calling `MKGService.read(companyId, field)` returns a typed value; calling `patch()` updates disk and syncs to Supabase `company_mkg` within the same request.
  3. `GET /api/mkg/:companyId` returns the full MKG document; `PATCH /api/mkg/:companyId` applies a patch and returns the updated document.
  4. `MKGService.isStale(field)` returns true for fields where confidence < 0.6 or data is older than 30 days.
  5. The `product-marketing-context` skill file is loaded as the first skill on every agent run (verified by log output).
**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Supabase migration: create `company_mkg` and `agent_run_outputs` tables with RLS and indexes
- [ ] 01-02-PLAN.md — MKGService JS module (read, patch, isStale, getExpiredFields) + 00-product-marketing-context.md skill in all 11 agent directories
- [ ] 01-03-PLAN.md — REST endpoints (GET + PATCH /api/mkg/:companyId) added to backend-server.js

---

### Phase 2: Agent Contract Standard
**Goal:** Every agent run — regardless of which agent runs — produces a validated, structured `AgentRunOutput` JSON; the backend rejects malformed output and auto-creates follow-up tasks for low-confidence runs.
**Depends on:** Phase 1 (context_patch writes to MKG)
**Requirements:** CONTRACT-01, CONTRACT-02, CONTRACT-03, CONTRACT-04, CONTRACT-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. Calling `POST /api/agents/:name/run` with any agent returns a response containing all required `AgentRunOutput` fields (agent, task, company_id, run_id, timestamp, input, artifact, context_patch, handoff_notes, missing_data, tasks_created).
  2. A run response missing any required field receives a 422 response from the backend validator.
  3. A run with `artifact.confidence < 0.5` automatically creates a record in Supabase `agent_tasks` with a `missing_data` follow-up task.
  4. The `context_patch` from a completed run is applied to MKG immediately; a subsequent `GET /api/mkg/:companyId` reflects the update.
  5. `tasks_created` items appear in Supabase `agent_tasks` with `triggered_by_run_id` populated.
**Plans:** 3/3 plans complete

Plans:
- [ ] 02-01-PLAN.md — AgentRunOutput schema + manual JS validator (extractContract, validateContract) + Supabase migration for agent_tasks new columns
- [ ] 02-02-PLAN.md — Modify run endpoint: Run Context injection, CONTRACT_INSTRUCTION in system prompt, fullText buffer, MKG patch on contract
- [ ] 02-03-PLAN.md — Post-stream Supabase persistence: saveAgentRunOutput, createMissingDataTask (confidence < 0.5), writeTasksCreated + human verify checkpoint

---

### Phase 3: Veena — Company Intelligence
**Goal:** A new Veena agent exists, owns the MKG, can crawl a company URL to bootstrap the knowledge graph, and triggers the full sequential onboarding chain when a new company is added.
**Depends on:** Phase 1 (MKG), Phase 2 (Agent Contract — Veena must output valid AgentRunOutput)
**Requirements:** VEENA-01, VEENA-02, VEENA-03, VEENA-04, VEENA-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. A `platform/crewai/agents/veena/` directory exists with SOUL.md, mcp.json, skills/, and memory/MEMORY.md.
  2. Running Veena against a company URL produces a `mkg.json` with all 12 top-level MKG fields populated within 3 minutes.
  3. Veena's `AgentRunOutput.context_patch` covers all 12 MKG top-level fields; the MKG is updated immediately after the run.
  4. Emitting a `new_company_onboarded` signal triggers the sequential onboarding chain (veena → isha → neel → zara) — confirmed by Supabase `agent_tasks` records for each step.
  5. A new company's `mkg.json` is pre-populated from the `product-marketing-context` skill template before Veena's first crawl runs.
**Plans:** 2/3 plans complete

Plans:
- [x] 03-01-PLAN.md — Veena agent files (SOUL.md, mcp.json, skills/, memory/MEMORY.md) + VALID_AGENTS + AGENT_PROFILES registration
- [x] 03-02-PLAN.md — veena-crawler.js module (crawlCompanyForMKG, buildContextPatchFromCrawl, initializeMKGTemplate, extractPageSignals) + test-veena-crawl.js
- [ ] 03-03-PLAN.md — POST /api/agents/veena/onboard endpoint (202 + background crawl + chain tasks) + test-veena-onboard.js + human verify checkpoint

---

### Phase 4: 12-Agent Rewrite
**Goal:** All 11 existing agents are completely rewritten per the 12-node marketing framework; each reads MKG first, outputs a valid AgentRunOutput with a non-empty context_patch; APScheduler reflects new roles and schedules.
**Depends on:** Phase 1 (MKG), Phase 2 (Agent Contract), Phase 3 (Veena must be done so rewritten agents can read Veena's MKG output)
**Requirements:** AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-07, AGENT-08
**Success Criteria** (what must be TRUE when this phase completes):
  1. All 11 agent directories contain a newly written SOUL.md with `reads_from_mkg`, `writes_to_mkg`, and `triggers_agents` fields present.
  2. Every agent's `mcp.json` maps connectors to its correct marketing node responsibility; connector assignments match the node definitions (e.g., Maya has paid ads + SEO connectors, not lead gen).
  3. Each agent's `skills/` directory contains `product-marketing-context` as the first-loaded skill plus node-specific skills from the marketingskills 31-skill library.
  4. Running any of the 12 agents via `POST /api/agents/:name/run` returns a valid AgentRunOutput with a non-empty `context_patch` — confirmed for all 12 agents.
  5. APScheduler cron jobs reflect the new IST schedules (weekly briefs, daily monitors) per the hooks.json design; backend `VALID_AGENTS` includes veena + all 11.
**Plans:** 3/3 plans complete

Plans:
- [x] 04-01: Rewrite SOUL.md + MEMORY.md for all 11 agents (aligned to framework roles)
- [x] 04-02: Rewrite mcp.json + skills/ for all 11 agents (connectors + marketingskills mapping)
- [x] 04-03: APScheduler + backend VALID_AGENTS update

---

### Phase 5: Hooks System
**Goal:** A `hooks.json` config drives all scheduled and signal-triggered agent runs; a HooksEngine evaluates signal conditions every heartbeat using diff-from-baseline, so agents fire proactively without manual invocation.
**Depends on:** Phase 4 (agents must be rewritten before hooks fire them; hooks read agent names from the new roster)
**Requirements:** HOOKS-01, HOOKS-02, HOOKS-03, HOOKS-04, HOOKS-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. `platform/content-engine/hooks.json` exists with both `scheduled` and `signal_triggers` sections populated (min 6 scheduled + 7 signal triggers per design).
  2. Inserting a `traffic_drop_20pct_7d` record into Supabase `agent_signals` causes tara and kiran to be dispatched within 60 seconds — confirmed by `agent_tasks` records appearing.
  3. Signal evaluation uses per-company diff-from-baseline stored in MKG, not a global absolute threshold — confirmed by MKG `baselines` field being read during evaluation.
  4. Triggered hook runs call the existing `POST /api/agents/:name/run` endpoint and include `triggered_by: signal` metadata in the run payload.
  5. Scheduled hooks (e.g., veena weekly refresh Mon 06:00 IST) fire at the correct time — confirmed by `agent_tasks` timestamp matching the cron schedule.
**Plans:** 2/3 plans complete

Plans:
- [x] 05-01: hooks.json config file — scheduled + signal_triggers + chat_triggers
- [x] 05-02: HooksEngine class — signal evaluation loop, diff-from-baseline, Supabase agent_signals read
- [ ] 05-03: Hook dispatch integration with existing SSE run endpoint

---

### Phase 6: Data Pipeline
**Goal:** Connector raw data flows through SQL aggregation to KPI views; anomaly detection runs nightly; only high/critical anomalies trigger LLM narration; agents read views, never raw tables.
**Depends on:** Phase 5 (hooks consume anomaly signals that the pipeline emits)
**Requirements:** PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. Supabase contains `connector_raw_snapshots`, `company_kpi_daily`, and `company_anomalies` tables with RLS; raw snapshot inserts are append-only.
  2. Running `KPIAggregator` against a raw snapshot produces a row in `company_kpi_daily` with spend, ROAS, CPL, and CTR populated — no raw data is passed to any LLM.
  3. The anomaly detector produces a record in `company_anomalies` with severity assigned (low/medium/high/critical) when today's KPI deviates from 7-day or 30-day baseline.
  4. Only `high` and `critical` severity anomalies trigger an LLM narration call; `low/medium` anomalies are written to MKG silently — confirmed by log showing skipped LLM calls for low/medium.
  5. `GET /api/kpis/:companyId?days=30` returns a structured array of daily KPI rows for the requested window.
**Plans:** 3/3 plans complete

Plans:
- [x] 06-01: Supabase migration — raw snapshot, KPI, anomalies tables + RLS
- [x] 06-02: KPIAggregator service — raw → SQL aggregation → KPI view
- [x] 06-03: Anomaly detector + LLM narration gate + KPI REST endpoint

---

### Phase 7: Swarm Layer
**Goal:** Priya runs competitive intelligence as a swarm — 10 competitor Watchdogs run daily on delta only, SpreadsheetSwarm handles transcript/tweet corpus, swarm results write competitor move signals that HooksEngine picks up.
**Depends on:** Phase 6 (swarm uses pipeline KPI data and MKG competitor fields for differential analysis)
**Requirements:** SWARM-01, SWARM-02, SWARM-03, SWARM-04, SWARM-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. Running Priya's competitive intelligence task fans out to 10 sub-tasks (one per competitor) concurrently and fans in to a synthesis — confirmed by 10 separate task records in Supabase.
  2. The Watchdog only processes content published after `mkg.competitors[n].last_checked`; a competitor with no new content since last run produces zero LLM calls — confirmed by zero tokens consumed in that case.
  3. SpreadsheetSwarm processes a batch of up to 300 YouTube transcripts using a cheap model for filtering and an analysis model only for synthesis — confirmed by model routing log.
  4. Swarm results are written to Supabase `competitive_intelligence` table keyed by (company_id, competitor_name, week_of).
  5. Priya outputs competitor move records to Supabase `agent_signals`; a `competitor_content_pub` signal dispatches priya then riya via HooksEngine within 60 seconds.
**Plans:** TBD

Plans:
- [ ] 07-01: swarm-runner.ts — ConcurrentWorkflow, SpreadsheetSwarm, Watchdog patterns
- [ ] 07-02: Priya swarm config — 10-competitor Watchdog + differential analysis + last_checked tracking
- [ ] 07-03: Corpus analysis — SpreadsheetSwarm for transcripts/tweets + competitive_intelligence table

---

### Phase 8: Outcome Ledger
**Goal:** Every agent run's outcome prediction is tracked; Arjun verifies actuals 7/30/90 days later; variance > 30% triggers per-company calibration notes written to agent MEMORY.md; the system gets measurably smarter.
**Depends on:** Phase 4 (agents must produce outcome_predictions in their AgentRunOutput), Phase 6 (Arjun reads actual metrics from KPI views)
**Requirements:** LEDGER-01, LEDGER-02, LEDGER-03, LEDGER-04, LEDGER-05
**Success Criteria** (what must be TRUE when this phase completes):
  1. Supabase `outcome_ledger` table exists with columns run_id, company_id, agent, metric, baseline, predicted, actual, variance_pct, verified_at; all populated by Arjun's verification run.
  2. Arjun's weekly outcome verification compares `outcome_prediction` from prior AgentRunOutput records against actual GA4/ads KPI view data and writes the result to `outcome_ledger`.
  3. When `variance_pct > 30`, a calibration note is appended to the source agent's `memory/MEMORY.md` — e.g., "For [company], CTR predictions were off by 42%; adjust upward by 40%".
  4. `GET /api/outcomes/:companyId` returns the ledger with an accuracy score per agent (e.g., `{ "neel": 0.72, "riya": 0.85 }`).
  5. On the next run after a calibration note is written, the agent's system prompt includes the calibration note from MEMORY.md — confirmed by the note appearing in the Groq request log.
**Plans:** TBD

Plans:
- [ ] 08-01: outcome_ledger Supabase table + Arjun's verification cron job
- [ ] 08-02: Calibration writer — variance > 30% appends to agent MEMORY.md
- [ ] 08-03: Outcomes REST endpoint + MEMORY.md injection into agent system prompt

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MKG Foundation | 3/3 | ✓ Complete | 2026-03-10 |
| 2. Agent Contract Standard | 3/3 | ✓ Complete | 2026-03-10 |
| 3. Veena — Company Intelligence | 2/3 | In Progress | - |
| 4. 12-Agent Rewrite | 3/3 | ✓ Complete | 2026-03-10 |
| 5. Hooks System | 2/3 | In Progress | - |
| 6. Data Pipeline | 3/3 | ✓ Complete | 2026-03-10 |
| 7. Swarm Layer | 0/3 | Not started | - |
| 8. Outcome Ledger | 0/3 | Not started | - |
