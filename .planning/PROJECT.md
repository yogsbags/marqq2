# Torqq AI / Marketing Brain OS

## What This Is

A proactive, multi-agent Marketing Brain OS for SMB marketing teams. The platform replaces isolated prompt agents with a collaborative swarm of 12 specialized AI agents that share a persistent Marketing Knowledge Graph (MKG), operate on scheduled heartbeats, and produce measurable business outcomes — not just content.

## Core Value

Every agent run must move a business metric, not just produce output — verified through an outcome ledger that learns per company over time.

## Requirements

### Validated

- ✓ 8 agents (zara, maya, riya, arjun, dev, priya, kiran, sam) running on APScheduler heartbeats — v0.x
- ✓ Composio MCP connector integration with tool-calling loop — v0.x
- ✓ Workspace multi-tenancy (Supabase RLS) — v0.x
- ✓ Rube recipes for automated data pulls (10 recipes across 8 agents) — v0.x
- ✓ Agent Skills library (36 skills across 6 agents) — v0.x
- ✓ Express backend SSE streaming (port 3008) + Vite proxy — v0.x
- ✓ 3-tier white-label architecture (productverse → partners → end clients) — v0.x

### Active

- [ ] Marketing Knowledge Graph (MKG) — shared context object per company with field-level metadata (confidence, expiry, source_agent)
- [ ] Agent Contract Standard — every run produces structured AgentRunOutput JSON
- [ ] Veena (Company Intelligence Agent) — new orchestrator agent, owns MKG
- [ ] Complete agent rewrite — 12 agents per 12-node marketing framework (clean slate)
- [ ] Hooks system — event-driven triggers (signal_triggers + scheduled hooks.json)
- [ ] Data Pipeline — connector raw data → SQL aggregation → KPI views → anomaly detection → LLM narration → MKG
- [ ] Swarm Layer — Priya's competitive intelligence (10-competitor Watchdog, SpreadsheetSwarm for transcript analysis)
- [ ] Outcome Ledger — predicted vs actual metric tracking → per-company calibration learning

### Out of Scope

- Frontend UI changes — NOT changing in this milestone; app/src/components stay intact
- WordPress/Sanity CMS publishing — separate project, not this platform
- Real-time WebSocket streaming — SSE is sufficient; no upgrade needed
- PII storage — DPDP Act 2023 compliance; only aggregated metrics stored

## Context

**Existing codebase state (v0.x):**
- `platform/crewai/agents/{name}/` — 11 agent directories (zara, maya, riya, arjun, dev, priya, kiran, sam, isha, neel, tara) each with SOUL.md, mcp.json, skills/, memory/MEMORY.md
- `platform/content-engine/backend-server.js` — Express server port 3008 with tool-calling loop
- `platform/crewai/autonomous_scheduler.py` — APScheduler with IST cron jobs
- `app/src/` — React frontend (port 3007 Vite) with ChatHome, AgentDashboard, NotificationsPanel
- Supabase: agent_tasks, agent_notifications, agent_memory, workspaces, workspace_members tables

**Marketing framework driving redesign:**
- 80/20 hierarchy from coreyhaines31/marketingskills (31 skills, 7 clusters)
- 12-node architecture: Company Intelligence (0) → CEO (1) → Market Research (2) → Strategy (3) → Offer Engineering (4) → Messaging (5) → Content (6) → Distribution (7) → Funnel (8) → Conversion/CRO (9) → Lifecycle (10) → Analytics (11)
- Agent patterns from: OpenClaw (persistent memory, 24/7 heartbeats), Superpowers (hooks, parallel agents, verification), swarms.ai (ConcurrentWorkflow, SpreadsheetSwarm, Watchdog)

**Design doc**: `docs/plans/2026-03-10-marketing-brain-os-design.md`

## Constraints

- **Backend**: Node.js Express (port 3008) — no framework change
- **Scheduler**: Python APScheduler (IST cron) — keep pattern, update agents
- **LLM**: Groq llama-3.3-70b-versatile primary (Haiku-equivalent for filtering, Sonnet-equivalent for analysis)
- **Cost**: Anomaly-first filtering — 80% of weeks require zero LLM calls; cluster-first (87% cost reduction on large corpus)
- **Data safety**: GA4 Reporting API (aggregated) not BigQuery raw export; RLS on all tables; DPA per client (DPDP Act 2023)
- **Agent count**: 12 agents (Veena new + 11 existing rewritten); no agent is removed, just rewritten
- **Clean slate**: All SOUL.md, mcp.json, skills/, memory/ completely rewritten per new design

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MKG as shared JSON on disk + Supabase sync | Avoids context rot; field-level expiry means agents know what's stale | — Pending |
| AgentRunOutput contract (structured JSON every run) | Enables outcome ledger, handoff notes, verified predictions | — Pending |
| Veena as Company Intelligence orchestrator | MKG ownership needs a dedicated agent; no one else updates it | — Pending |
| Differential analysis (delta only) | Full re-scan is wasteful; process only what changed since last_checked | — Pending |
| Swarms.ai for competitive intelligence | 10-competitor Watchdog + SpreadsheetSwarm handles corpus scale that single agent can't | — Pending |
| Clean slate rewrite (option B) | Retrofit would leave architectural debt; 12-node framework requires incompatible restructuring | ✓ Good |

---
*Last updated: 2026-03-10 after Marketing Brain OS milestone kick-off*
