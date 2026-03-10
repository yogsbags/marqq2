---
phase: 01-mkg-foundation
plan: 01
subsystem: database
tags: [supabase, sql, postgresql, rls, jsonb, migration]

# Dependency graph
requires: []
provides:
  - company_mkg table with JSONB mkg_data and RLS (service-role-only)
  - agent_run_outputs table with append-only log schema and RLS (service-role-only)
  - 5 indexes for efficient querying (staleness checks, agent lookups, idempotency)
  - database/migrations/mkg-foundation.sql ready to run in Supabase SQL Editor
affects:
  - 01-02 (MKGService writes to company_mkg via supabase.from('company_mkg').upsert())
  - Phase 2 (AgentRunOutput contract writes to agent_run_outputs)
  - Phase 8 (Outcome Ledger reads agent_run_outputs)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Disk-first architecture: SQL table is sync replica, not source of truth"
    - "Service-role-only RLS on backend tables (no direct frontend reads)"
    - "TEXT PRIMARY KEY on company_mkg (not UUID FK) for pre-Supabase company support"
    - "Append-only log pattern on agent_run_outputs (rows never updated)"
    - "GIN index on JSONB for field-level confidence queries"

key-files:
  created:
    - database/migrations/mkg-foundation.sql
  modified: []

key-decisions:
  - "company_id is TEXT not UUID FK — MKG must work before company is in Supabase (disk-first)"
  - "mkg_data stored as full JSONB envelope (not normalized columns) for schema flexibility"
  - "agent_run_outputs is append-only — no UPDATE path; new run = new row with unique run_id"
  - "RLS service-role-only for now — workspace-scoped SELECT policy deferred to when frontend reads needed"
  - "Migration is NOT run in Supabase yet — requires human to copy-paste into SQL Editor"

patterns-established:
  - "Pattern: SQL migration file at database/migrations/{name}.sql, runnable in Supabase SQL Editor"
  - "Pattern: RLS with service-role-only for backend-write tables, with commented workspace-scoped template"

# Metrics
duration: 1min
completed: 2026-03-10
---

# Phase 1 Plan 01: MKG Foundation DB Migration Summary

**SQL migration establishing company_mkg (JSONB MKG store) and agent_run_outputs (append-only run log) with RLS service-role-only policies and 5 indexes**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-10T04:37:08Z
- **Completed:** 2026-03-10T04:37:47Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `database/migrations/mkg-foundation.sql` with two production-ready tables
- `company_mkg`: stores the full MKG envelope as JSONB per company, with GIN and timestamp indexes
- `agent_run_outputs`: append-only log for every agent run's structured output (artifact, context_patch, handoff_notes, missing_data, tasks_created)
- RLS enabled on both tables with service-role-only policies (safe defaults for backend-only access)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mkg-foundation.sql migration file** - `27100ed` (feat)

**Plan metadata:** _(committed with SUMMARY.md below)_

## Files Created/Modified

- `database/migrations/mkg-foundation.sql` - SQL migration for company_mkg and agent_run_outputs tables

## Schema Summary

### company_mkg

| Column | Type | Notes |
|--------|------|-------|
| company_id | TEXT PRIMARY KEY | Accepts UUID or slug-style IDs (disk-first: works before Supabase company entry) |
| mkg_data | JSONB NOT NULL DEFAULT '{}' | Full MKG envelope with 12 field envelopes; GIN-indexed for field-level queries |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | DESC-indexed for staleness queries |

Indexes: `idx_company_mkg_updated` (updated_at DESC), `idx_company_mkg_data` (GIN on mkg_data)

### agent_run_outputs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PRIMARY KEY | Auto-generated |
| run_id | TEXT NOT NULL UNIQUE | Caller-supplied idempotency key |
| company_id | TEXT NOT NULL | Links to company |
| agent | TEXT NOT NULL | Agent name (zara, maya, etc.) |
| task | TEXT | Task description |
| timestamp | TIMESTAMPTZ | Run time |
| artifact | JSONB NOT NULL DEFAULT '{}' | Structured output: { type, content, confidence } |
| context_patch | JSONB NOT NULL DEFAULT '{}' | Fields written to MKG this run |
| handoff_notes | TEXT | For next agent in chain |
| missing_data | JSONB NOT NULL DEFAULT '[]' | Array of missing field names |
| tasks_created | JSONB NOT NULL DEFAULT '[]' | Follow-up tasks spawned |
| raw_output | TEXT | Full LLM response for debugging |
| created_at | TIMESTAMPTZ | Insert time |

Indexes: `idx_agent_run_outputs_company` (company_id, timestamp DESC), `idx_agent_run_outputs_agent` (agent, timestamp DESC), `idx_agent_run_outputs_run_id` (run_id)

## Decisions Made

- `company_id` is `TEXT` not a UUID FK to the `companies` table — MKG must work even before a company exists in Supabase (disk-first architecture)
- `mkg_data` stored as a single JSONB column (full envelope) rather than normalized columns — field schema may evolve; JSONB allows field-level queries via `->` operators without schema migrations
- `agent_run_outputs` rows are never updated — append-only by design; idempotency handled via `run_id UNIQUE`
- RLS set to service-role-only (`auth.role() = 'service_role'`) — backend Express writes use service key; frontend direct reads deferred; workspace-scoped SELECT policy commented in migration as a template for when needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Migration must be run manually in Supabase.**

The file `database/migrations/mkg-foundation.sql` has NOT been run against any Supabase project yet. To apply:

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the full contents of `database/migrations/mkg-foundation.sql`
4. Paste and click **Run**
5. Verify: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('company_mkg', 'agent_run_outputs');` should return 2 rows

**Note on RLS:** The policies use `auth.role() = 'service_role'`. Your backend must connect using the Supabase service role key (not the anon key) for writes to succeed. Set `SUPABASE_SERVICE_KEY` in the backend environment.

## Next Phase Readiness

- `database/migrations/mkg-foundation.sql` is complete and ready to apply to Supabase
- Plan 01-02 (MKGService) can now complete wiring — `MKGService.patch()` writes to `company_mkg` via `supabase.from('company_mkg').upsert()`
- Phase 2 (AgentRunOutput contract) can write structured outputs to `agent_run_outputs`
- Blocker: Migration must be run in Supabase before backend MKG sync works (human step)

---
*Phase: 01-mkg-foundation*
*Completed: 2026-03-10*
