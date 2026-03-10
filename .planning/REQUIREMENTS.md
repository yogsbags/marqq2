# Requirements: Marketing Brain OS v1.0

**Defined:** 2026-03-10
**Core Value:** Every agent run must move a business metric, verified through an outcome ledger that learns per company over time.

## v1 Requirements

### Marketing Knowledge Graph (MKG)

- [ ] **MKG-01**: System stores a per-company `mkg.json` on disk with field-level metadata (value, confidence 0–1, last_verified, source_agent, expires_at)
- [ ] **MKG-02**: TypeScript `MKGService` class provides `read(companyId, field)`, `patch(companyId, patch)`, `isStale(field)`, `getExpiredFields()` methods
- [ ] **MKG-03**: MKG is synced to Supabase `company_mkg` table on every patch (for multi-instance resilience)
- [ ] **MKG-04**: Backend exposes `GET /api/mkg/:companyId` and `PATCH /api/mkg/:companyId` REST endpoints
- [ ] **MKG-05**: `product-marketing-context` skill loaded first on every agent run (MKG foundation skill)

### Agent Contract Standard

- [ ] **CONTRACT-01**: Every agent run returns a structured `AgentRunOutput` JSON (agent, task, company_id, run_id, timestamp, input, artifact, context_patch, handoff_notes, missing_data, tasks_created, outcome_prediction)
- [ ] **CONTRACT-02**: Backend validates AgentRunOutput schema before saving; rejects malformed contracts
- [ ] **CONTRACT-03**: `artifact.confidence` 0–1 is required; runs with confidence < 0.5 auto-create a `missing_data` follow-up task
- [ ] **CONTRACT-04**: `context_patch` is applied to MKG immediately after every successful run
- [ ] **CONTRACT-05**: `tasks_created` are written to Supabase `agent_tasks` with `triggered_by_run_id` FK

### Veena — Company Intelligence Agent

- [x] **VEENA-01**: New agent "veena" (Company Intelligence) created with SOUL.md, mcp.json, skills/, memory/MEMORY.md
- [ ] **VEENA-02**: Veena runs weekly (Mon 06:00 IST) to refresh MKG — crawls company website, reads GA4, reads Composio connectors
- [ ] **VEENA-03**: Veena triggers `new_company_onboarded` signal → fires full-chain onboarding (sequential: veena → isha → neel → zara)
- [ ] **VEENA-04**: Veena outputs `AgentRunOutput` with `context_patch` covering 12 MKG top-level fields
- [ ] **VEENA-05**: Veena `mkg.json` template pre-populated for new companies from product-marketing-context skill

### 12-Agent Rewrite (Clean Slate)

- [ ] **AGENT-01**: All 11 existing SOUL.md files completely rewritten per 12-node marketing framework roles (company intelligence through analytics)
- [ ] **AGENT-02**: All 11 existing mcp.json files rewritten — connectors mapped to correct marketing node responsibilities
- [ ] **AGENT-03**: All skills/ directories rewritten — each agent loads `product-marketing-context` first + node-specific skills from marketingskills repo
- [ ] **AGENT-04**: All memory/MEMORY.md files reset and re-initialized with correct per-agent context structure
- [ ] **AGENT-05**: Agent name mapping: isha=Market Research, neel=Strategy, tara=Offer Engineering, zara=Distribution, maya=SEO/Content, riya=Content Creation, arjun=Funnel/Leads, dev=Analytics, priya=Competitive Intelligence, kiran=Lifecycle/Social, sam=Messaging
- [ ] **AGENT-06**: Each agent's SOUL.md includes explicit `reads_from_mkg`, `writes_to_mkg`, and `triggers_agents` fields
- [ ] **AGENT-07**: APScheduler updated with correct IST cron schedules per new agent roles (weekly briefs, daily monitors)
- [ ] **AGENT-08**: Backend `VALID_AGENTS` list updated to include veena + all 11 rewritten agents

### Hooks System

- [ ] **HOOKS-01**: `platform/content-engine/hooks.json` file defines scheduled triggers and signal_triggers
- [ ] **HOOKS-02**: Signal triggers include: `traffic_drop_20pct_7d` → tara+kiran, `new_company_onboarded` → full chain, `campaign_anomaly` → zara+dev, `competitor_move` → priya+neel
- [ ] **HOOKS-03**: `HooksEngine` class in backend evaluates signal conditions against Supabase `agent_signals` table on every heartbeat
- [ ] **HOOKS-04**: Signal evaluation uses diff-from-baseline (not absolute threshold) — baseline stored per company in MKG
- [ ] **HOOKS-05**: Triggered hook runs fire through existing SSE `/api/agents/:name/run` endpoint with `triggered_by: signal` metadata

### Data Pipeline

- [ ] **PIPE-01**: Supabase migration creates `connector_raw_snapshots`, `company_kpi_daily`, `company_anomalies` tables
- [ ] **PIPE-02**: `KPIAggregator` service runs post-connector-fetch: raw → SQL aggregation → KPI view (no raw data reaches LLM)
- [ ] **PIPE-03**: Anomaly detector compares today's KPIs vs 7-day and 30-day baseline; writes to `company_anomalies` with severity (low/medium/high/critical)
- [ ] **PIPE-04**: Only `high` and `critical` anomalies trigger LLM narration; `low/medium` written to MKG silently
- [ ] **PIPE-05**: `company_kpi_daily` view exposed via `GET /api/kpis/:companyId?days=30` for frontend charts

### Swarm Layer — Competitive Intelligence

- [ ] **SWARM-01**: Priya (Competitive Intelligence) uses `ConcurrentWorkflow` pattern — fans out to 10 sub-tasks (one per competitor) then fans in to synthesis
- [ ] **SWARM-02**: Competitor monitoring uses differential analysis — only process changes since `last_checked` stored in MKG `competitors[n].last_checked`
- [ ] **SWARM-03**: `SpreadsheetSwarm` pattern for corpus analysis — YouTube transcript batch (up to 300), tweet batch (up to 400) — Haiku for filtering, Sonnet for synthesis
- [ ] **SWARM-04**: Swarm results written to Supabase `competitive_intelligence` table keyed by (company_id, competitor_name, week_of)
- [ ] **SWARM-05**: Priya outputs competitor move signals to `agent_signals` table — picked up by HooksEngine on next evaluation cycle

### Outcome Ledger

- [ ] **LEDGER-01**: Supabase `outcome_ledger` table stores (run_id, company_id, agent, metric, baseline, predicted, actual, variance_pct, verified_at)
- [ ] **LEDGER-02**: Arjun runs weekly outcome verification — compares `outcome_prediction` from prior runs against actual GA4/ads data
- [ ] **LEDGER-03**: Variance > 30% triggers calibration write to agent's `memory/MEMORY.md` — "For [company], [metric] predictions were off by X; adjust by Y"
- [ ] **LEDGER-04**: Backend `GET /api/outcomes/:companyId` returns ledger with accuracy score per agent
- [ ] **LEDGER-05**: `product-marketing-context` skill injects per-company calibration notes from MEMORY.md into every agent system prompt

## v2 Requirements

### UI Enhancements

- **UI-01**: MKG visualization panel — show knowledge graph fields, confidence scores, expiry dates
- **UI-02**: Swarm execution progress UI — show fan-out status for 10-competitor monitoring
- **UI-03**: Outcome ledger dashboard — per-agent accuracy charts, metric prediction history

### Advanced Swarm Patterns

- **SWARM-06**: HierarchicalSwarm for news monitoring (director agent routes to specialist sub-agents based on news category)
- **SWARM-07**: Auto-scaling swarm size based on competitor count (scales 1–20 competitors)

### Billing Integration

- **BILL-01**: MKG refresh counts toward credit deduction (Veena runs cost 500 credits)
- **BILL-02**: Swarm runs cost per-competitor (100 credits × competitor count)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend UI component changes | Not this milestone — app/src/ stays intact |
| WordPress/Sanity CMS publishing | Separate project, different codebase |
| Real-time WebSocket | SSE sufficient; no upgrade needed |
| PII storage | DPDP Act 2023 — only aggregated metrics allowed |
| New Rube recipe creation | Existing 10 recipes carry over; new recipes in v2 |
| Mobile app | Web-first |
| OAuth self-service | Composio handles auth; no custom OAuth flow |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MKG-01 | Phase 1 — MKG Foundation | Complete |
| MKG-02 | Phase 1 — MKG Foundation | Complete |
| MKG-03 | Phase 1 — MKG Foundation | Complete |
| MKG-04 | Phase 1 — MKG Foundation | Complete |
| MKG-05 | Phase 1 — MKG Foundation | Complete |
| CONTRACT-01 | Phase 2 — Agent Contract Standard | Pending |
| CONTRACT-02 | Phase 2 — Agent Contract Standard | Pending |
| CONTRACT-03 | Phase 2 — Agent Contract Standard | Pending |
| CONTRACT-04 | Phase 2 — Agent Contract Standard | Pending |
| CONTRACT-05 | Phase 2 — Agent Contract Standard | Pending |
| VEENA-01 | Phase 3 — Veena (Company Intelligence) | Complete |
| VEENA-02 | Phase 3 — Veena (Company Intelligence) | Pending |
| VEENA-03 | Phase 3 — Veena (Company Intelligence) | Pending |
| VEENA-04 | Phase 3 — Veena (Company Intelligence) | Pending |
| VEENA-05 | Phase 3 — Veena (Company Intelligence) | Pending |
| AGENT-01 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-02 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-03 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-04 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-05 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-06 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-07 | Phase 4 — 12-Agent Rewrite | Pending |
| AGENT-08 | Phase 4 — 12-Agent Rewrite | Pending |
| HOOKS-01 | Phase 5 — Hooks System | Pending |
| HOOKS-02 | Phase 5 — Hooks System | Pending |
| HOOKS-03 | Phase 5 — Hooks System | Pending |
| HOOKS-04 | Phase 5 — Hooks System | Pending |
| HOOKS-05 | Phase 5 — Hooks System | Pending |
| PIPE-01 | Phase 6 — Data Pipeline | Pending |
| PIPE-02 | Phase 6 — Data Pipeline | Pending |
| PIPE-03 | Phase 6 — Data Pipeline | Pending |
| PIPE-04 | Phase 6 — Data Pipeline | Pending |
| PIPE-05 | Phase 6 — Data Pipeline | Pending |
| SWARM-01 | Phase 7 — Swarm Layer | Pending |
| SWARM-02 | Phase 7 — Swarm Layer | Pending |
| SWARM-03 | Phase 7 — Swarm Layer | Pending |
| SWARM-04 | Phase 7 — Swarm Layer | Pending |
| SWARM-05 | Phase 7 — Swarm Layer | Pending |
| LEDGER-01 | Phase 8 — Outcome Ledger | Pending |
| LEDGER-02 | Phase 8 — Outcome Ledger | Pending |
| LEDGER-03 | Phase 8 — Outcome Ledger | Pending |
| LEDGER-04 | Phase 8 — Outcome Ledger | Pending |
| LEDGER-05 | Phase 8 — Outcome Ledger | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 — Roadmap created, traceability finalized*
