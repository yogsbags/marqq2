# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Every agent run must move a business metric, verified through an outcome ledger that learns per company over time.
**Current focus:** Phase 1 — MKG Foundation (in progress)

## Current Position

Phase: 1 of 8 (MKG Foundation)
Plan: 2 of 3 in current phase (01-01 and 01-02 complete; 01-03 remaining)
Status: In progress
Last activity: 2026-03-10 — Completed 01-01-PLAN.md (mkg-foundation SQL migration)

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 5 min
- Total execution time: 0.14 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-mkg-foundation | 2 | 9 min | 4.5 min |

**Recent Trend:**
- Last 5 plans: 01-02 (8 min), 01-01 (1 min)
- Trend: —

*Updated after each plan completion*

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

### Pending Todos

- Run database/migrations/mkg-foundation.sql in Supabase SQL Editor (human step — migration NOT yet applied)

### Blockers/Concerns

- MKGService Supabase sync (01-02) will fail silently until mkg-foundation.sql is applied to Supabase

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 01-01-PLAN.md. mkg-foundation SQL migration committed.
Resume file: None
