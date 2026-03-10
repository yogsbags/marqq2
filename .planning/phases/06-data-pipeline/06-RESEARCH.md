# Phase 6: Data Pipeline - Research

**Researched:** 2026-03-10
**Domain:** Supabase schema design, SQL aggregation, nightly anomaly detection, MKG update boundaries, backend API integration
**Confidence:** HIGH (direct codebase inspection of current backend, migrations, roadmap, and planning state)

---

## Summary

Phase 6 should be planned as a backend-only data layer phase inside `platform/content-engine/`, not a frontend phase. The repo already has the right insertion points:

- `platform/content-engine/backend-server.js` is the monolithic Express backend where new KPI and anomaly endpoints belong.
- `platform/content-engine/supabase.js` is the single shared Supabase client used by backend helpers.
- `platform/content-engine/mkg-service.js` already owns MKG writes and should remain the only path for silent low/medium anomaly context updates.
- `POST /api/agents/:name/run` already appends validated contract data to MKG and Supabase after an LLM run; Phase 6 should mirror that discipline by keeping raw connector data out of LLM prompts entirely.

The key planning decision is this: **treat `connector_raw_snapshots` as storage-only, `company_kpi_daily` as the agent-safe analytical surface, and `company_anomalies` as the control plane for detection + narration gating.** Do not let any agent or narration code read `connector_raw_snapshots` directly.

The cleanest implementation shape for this repo is:

1. A Supabase migration creating three Phase 6 tables plus indexes and RLS.
2. A new `platform/content-engine/kpi-aggregator.js` service that converts one raw snapshot into one or more `company_kpi_daily` rows.
3. A new `platform/content-engine/anomaly-detector.js` service that reads only aggregated KPI rows, computes severity from 7-day and 30-day baselines, writes `company_anomalies`, then:
   - silent MKG patch for `low`/`medium`
   - optional LLM narration only for `high`/`critical`
4. A `GET /api/kpis/:companyId?days=30` endpoint in `backend-server.js`.

This phase has one major repo-specific constraint: **current backend Supabase access is using the anon key in `platform/content-engine/supabase.js`, while the newer migration pattern uses service-role-only RLS.** If that is not resolved in planning, Phase 6 can be coded but will not persist anything in Supabase under real RLS.

---

## What Exists Already

### Current backend shape

- `platform/content-engine/backend-server.js` is the runtime home for new Phase 6 APIs and orchestration helpers.
- `platform/content-engine/mkg-service.js` is disk-first, then fire-and-forget Supabase sync, and already defines `metrics` and `baselines` as first-class MKG fields.
- `platform/content-engine/supabase.js` exports a singleton `supabase` client used everywhere else.

### Existing implementation patterns worth following

- Plain ESM JavaScript, not TypeScript, in `platform/content-engine/`.
- Supabase helpers are small functions, not framework-heavy repositories or ORMs.
- Database writes are currently fire-and-log, not request-fatal, when persistence is secondary to UX.
- REST endpoints are added directly in `backend-server.js`.
- Migrations live in `database/migrations/*.sql` and are expected to be run manually in the Supabase SQL Editor.

### Existing architectural decisions that affect Phase 6

- MKG is the cross-run context surface; `metrics` and `baselines` already exist there.
- The roadmap explicitly says hooks consume anomaly signals after Phase 5, so Phase 6 should emit anomaly records and optionally signal-ready metadata, but not assume HooksEngine is fully present yet.
- The roadmap success criteria require agents to read KPI views, never raw data. That means planning should include an explicit safe-read boundary, not just a convention.

---

## Planning-Critical Unknowns

These are the questions that matter before breaking the phase into plans:

1. **What exact raw connector shape will be stored?**
   Recommendation: normalize at the metadata layer, not the payload layer. Store connector payloads as JSONB in `connector_raw_snapshots` with strict envelope columns, and let aggregation SQL extract only supported metrics.

2. **Is `company_kpi_daily` a SQL table or a SQL view?**
   Recommendation: make it a real table, despite the roadmap calling it a “view” in prose. `PIPE-01` explicitly requires a table. Use “view” as the safe analytical interface concept, not as a PostgreSQL `CREATE VIEW`.

3. **Where does nightly execution live before Hooks Phase 5 is complete?**
   Recommendation: plan a callable detector function first, then wire scheduling later. The phase should not block on unfinished hooks infrastructure.

4. **How will RLS work with the current backend client?**
   Recommendation: Phase 6 planning must include either:
   - switching backend writes to a service key client, or
   - temporarily relaxing RLS policies.

   The first option is cleaner and aligns with the comments in existing migrations.

5. **How will agents be prevented from reading raw data?**
   Recommendation: enforce this in code structure:
   - no raw-table helper exported to agent code
   - LLM narration helpers accept anomaly + KPI summaries only
   - public API exposes only `company_kpi_daily`

---

## Standard Stack

No new dependency is required for the phase if scope stays disciplined.

| Layer | Use | Why |
|------|-----|-----|
| PostgreSQL / Supabase | raw snapshot storage, KPI fact rows, anomaly rows | already the project database |
| `@supabase/supabase-js` | DB reads/writes from backend services | already in repo |
| Express in `backend-server.js` | KPI API exposure | already established |
| `MKGService` | silent anomaly writes into `metrics` / `baselines` / `insights` | already established |
| Groq SDK | narration only for `high` / `critical` anomalies | already established |

### Do not add in planning

- No ORM
- No workflow engine
- No queue system unless Phase 6 scope expands materially
- No custom stats library for anomaly detection

Simple SQL + small JS services is the correct scale for this repo.

---

## Recommended Data Model

### 1. `connector_raw_snapshots`

Purpose: append-only storage of fetched connector output before transformation.

Recommended columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `company_id TEXT NOT NULL`
- `connector_name TEXT NOT NULL`
- `source_type TEXT NOT NULL`
  Example values: `meta_ads`, `google_ads`, `ga4`, `shopify`, `manual`
- `snapshot_date DATE NOT NULL`
- `grain TEXT NOT NULL DEFAULT 'day'`
- `currency TEXT`
- `payload JSONB NOT NULL`
- `ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `triggered_by_run_id TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Recommended indexes:

- `(company_id, snapshot_date DESC)`
- `(company_id, connector_name, snapshot_date DESC)`
- GIN on `payload`

Recommended constraint:

- unique key on `(company_id, connector_name, snapshot_date, grain, coalesce(triggered_by_run_id, ''))` only if ingestion is idempotent by run

Planning note: keep raw payload JSONB opaque. Do not prematurely normalize every connector field.

### 2. `company_kpi_daily`

Purpose: the analytical surface every downstream reader uses.

Recommended columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `company_id TEXT NOT NULL`
- `metric_date DATE NOT NULL`
- `source_scope TEXT NOT NULL DEFAULT 'blended'`
- `currency TEXT`
- `spend NUMERIC`
- `revenue NUMERIC`
- `impressions NUMERIC`
- `clicks NUMERIC`
- `leads NUMERIC`
- `conversions NUMERIC`
- `ctr NUMERIC`
- `cpc NUMERIC`
- `cpl NUMERIC`
- `cpa NUMERIC`
- `roas NUMERIC`
- `ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `source_snapshot_ids JSONB NOT NULL DEFAULT '[]'`

Recommended uniqueness:

- `(company_id, metric_date, source_scope)`

Planning note: this is the “agent-safe view”. Every metric the LLM sees should come from here or from anomaly summaries built from here.

### 3. `company_anomalies`

Purpose: durable anomaly history and severity gating.

Recommended columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `company_id TEXT NOT NULL`
- `metric_date DATE NOT NULL`
- `metric_name TEXT NOT NULL`
- `severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical'))`
- `current_value NUMERIC`
- `baseline_7d NUMERIC`
- `baseline_30d NUMERIC`
- `delta_vs_7d_pct NUMERIC`
- `delta_vs_30d_pct NUMERIC`
- `direction TEXT CHECK (direction IN ('up','down','flat'))`
- `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','narrated','dismissed'))`
- `narration_required BOOLEAN NOT NULL DEFAULT FALSE`
- `narrated_at TIMESTAMPTZ`
- `narration_run_id TEXT`
- `context JSONB NOT NULL DEFAULT '{}'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Recommended uniqueness:

- `(company_id, metric_date, metric_name)`

Planning note: this table is where Phase 5 hooks should eventually look for anomaly-derived signals.

---

## Architecture Patterns

### Pattern 1: Raw -> Aggregate -> Detect -> Narrate

Use a strict four-step flow:

1. Connector fetch writes one row into `connector_raw_snapshots`.
2. `KPIAggregator` reads the new snapshot and upserts one or more `company_kpi_daily` rows.
3. `AnomalyDetector` reads only `company_kpi_daily`, computes baselines, and upserts `company_anomalies`.
4. Narration gate checks anomaly severity:
   - `low` / `medium`: patch MKG silently
   - `high` / `critical`: call LLM with aggregated anomaly summary only

This is the core requirement boundary for `PIPE-02`, `PIPE-03`, and `PIPE-04`.

### Pattern 2: SQL does math, JS does orchestration

Do not compute all KPI math in JavaScript from arbitrary payloads if the end state is SQL-backed daily KPIs. The clean split is:

- JS decides which connector parser to use and prepares extracted metric atoms.
- SQL stores the canonical daily facts and supports baseline queries.
- JS orchestrates anomaly severity, narration gating, and MKG patches.

Planning implication: Phase 6 likely wants a small parser layer per connector type, but not a huge transformation framework.

### Pattern 3: Agent-safe read surface

The roadmap says agents read views, never raw tables. In this repo, the practical implementation is:

- public KPI API reads only `company_kpi_daily`
- anomaly narration helper accepts only aggregate fields
- no helper should exist named like `loadRawConnectorDataForAgent`

If a future agent needs performance context, it should receive:

- daily KPI rows
- anomaly rows
- MKG `metrics` / `baselines`

Never raw `payload` JSONB.

### Pattern 4: Silent MKG updates for low/medium anomalies

This repo already treats MKG as the cross-run context plane. For low/medium anomalies, update:

- `metrics.value`
- `baselines.value`
- optionally `insights.value`

via `MKGService.patch(companyId, patch)`.

Do not generate agent tasks or LLM narration for those severities.

### Pattern 5: Phase boundary with Hooks

Roadmap dependency says Phase 6 depends on Phase 5, but current state shows Phase 5 is not built yet. Plan around that by separating:

- Phase 6 code that writes anomaly records and a `narration_required` flag
- later Phase 5/6 integration that emits `agent_signals`

Do not make Phase 6 implementation impossible to test because HooksEngine is absent.

---

## Repo-Specific Implementation Recommendation

### Files likely to add

- `platform/content-engine/kpi-aggregator.js`
- `platform/content-engine/anomaly-detector.js`
- possibly `platform/content-engine/kpi-service.js` if read helpers need separation
- `database/migrations/data-pipeline.sql`

### Files likely to modify

- `platform/content-engine/backend-server.js`
- `platform/content-engine/supabase.js` if service-key support is added
- maybe `platform/content-engine/package-lock.json` only if a dependency is added, which is not recommended

### Suggested service boundaries

`kpi-aggregator.js`

- `saveRawSnapshot(snapshotEnvelope)`
- `aggregateSnapshot(snapshotRow)`
- `upsertDailyKpis(rows)`

`anomaly-detector.js`

- `detectAnomaliesForCompanyDay(companyId, metricDate)`
- `upsertAnomalies(rows)`
- `narrateHighSeverityAnomalies(companyId, anomalies, kpiRows)`
- `buildSilentMkgPatch(anomalies, kpiRows)`

`backend-server.js`

- `GET /api/kpis/:companyId?days=30`
- optionally internal-only `POST /api/pipeline/run-anomaly-detection` for manual verification during development

### Suggested plan split

The roadmap’s current 3-plan split is correct:

1. `06-01` migration and RLS
2. `06-02` aggregation service and ingestion path
3. `06-03` anomaly detector, narration gate, and KPI API

That split matches the real repo boundaries and keeps verification incremental.

---

## Concrete SQL Strategy

### KPI calculation source of truth

Compute these first because they are explicitly required by the roadmap success criteria:

- `spend`
- `roas`
- `cpl`
- `ctr`

Derived formulas:

- `ctr = clicks / impressions` when impressions > 0
- `cpl = spend / leads` when leads > 0
- `cpa = spend / conversions` when conversions > 0
- `roas = revenue / spend` when spend > 0
- `cpc = spend / clicks` when clicks > 0

Use `NULL` for impossible denominators, not `0`, to avoid false anomaly noise.

### Baseline computation

Recommended baseline query behavior:

- 7-day baseline = average of previous 7 completed daily rows, excluding current day
- 30-day baseline = average of previous 30 completed daily rows, excluding current day

Do not include the current day in its own baseline.

### Severity recommendation

The roadmap does not define exact thresholds. Planning should define them now so validation is deterministic.

Recommended initial severity model:

- `low`: absolute deviation >= 10% from either baseline
- `medium`: >= 20%
- `high`: >= 35%
- `critical`: >= 50%

Apply only when the metric has enough baseline support:

- at least 3 prior rows for 7-day comparisons
- at least 7 prior rows for 30-day comparisons

If support is insufficient, skip anomaly creation rather than invent weak severity.

### Idempotency

Both aggregation and anomaly creation should be upsert-based:

- one KPI row per company/date/source_scope
- one anomaly row per company/date/metric

This matches the repo’s earlier use of `upsert` and avoids duplicate nightly runs.

---

## LLM Narration Boundary

This is the most important planning rule in the phase.

### What the LLM may receive

- company id
- date
- metric name
- current KPI value
- 7-day baseline
- 30-day baseline
- deviation percentages
- severity
- a compact KPI snapshot from `company_kpi_daily`
- maybe recent MKG context from `metrics` / `baselines` / `campaigns`

### What the LLM must never receive

- raw connector payload JSON
- row-level ad records
- event-level GA4 exports
- arbitrary text from `connector_raw_snapshots.payload`

Planning implication: narration helper should accept a pre-built plain object created from aggregate tables only.

---

## Don't Hand-Roll

- Do not build a generic connector ETL framework in Phase 6.
- Do not build a custom scheduling system in this phase.
- Do not build a statistical anomaly engine beyond deterministic percentage-vs-baseline thresholds.
- Do not build a PostgreSQL `VIEW` plus a duplicate table unless there is a proven need.
- Do not introduce frontend chart work; roadmap and requirements say this phase is backend/data.

---

## Common Pitfalls

### Pitfall 1: RLS blocks all writes

Current `platform/content-engine/supabase.js` uses:

- `VITE_SUPABASE_URL || SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY`

But the newer migrations use service-role-only policies. If Phase 6 copies that policy pattern without fixing the client, inserts and upserts will fail at runtime.

Planning action: decide in `06-01` whether to add backend service-key support.

### Pitfall 2: Calling the LLM before severity gating

If narration is called first and severity is assigned after, Phase 6 violates `PIPE-04`.

Planning action: severity must be written to `company_anomalies` before any narration branch executes.

### Pitfall 3: Using `0` instead of `NULL` in KPI formulas

That creates fake drops and fake spikes. A missing denominator should yield `NULL`.

### Pitfall 4: Letting low-volume metrics trigger noise

Tiny baselines create meaningless percentage swings.

Planning action: require minimum support windows before anomaly creation.

### Pitfall 5: Tying Phase 6 verification to unfinished Hooks

Hooks are not implemented yet. If the phase plan assumes full signal dispatch, verification will block on another unfinished phase.

Planning action: validate anomaly persistence and narration gating independently from hook dispatch.

### Pitfall 6: Writing raw payload summaries into MKG

That would quietly break the “agents read views, never raw tables” rule.

Planning action: MKG patches should summarize KPI/anomaly outcomes only.

---

## Validation Architecture

Use a three-layer validation strategy: SQL truth checks, service-level deterministic tests, and manual endpoint verification.

### 1. Migration validation

After `data-pipeline.sql` is written:

- verify all three tables exist
- verify RLS is enabled
- verify expected indexes exist
- verify uniqueness constraints prevent duplicate daily rows and duplicate anomalies

Manual SQL checks after applying migration:

```sql
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('connector_raw_snapshots', 'company_kpi_daily', 'company_anomalies');

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('connector_raw_snapshots', 'company_kpi_daily', 'company_anomalies');
```

### 2. Aggregator validation

Use deterministic fixture snapshots with known outputs.

Minimum fixture cases:

- normal day with spend, revenue, impressions, clicks, leads
- zero-impression day
- zero-lead day
- mixed connector input producing one blended daily row

Verify:

- exact `spend`, `roas`, `cpl`, `ctr`
- `NULL` handling for impossible ratios
- upsert idempotency on repeated aggregation

### 3. Anomaly detector validation

Seed `company_kpi_daily` with at least 31 days for one company and assert:

- no anomaly when current day is inside threshold
- `low`, `medium`, `high`, `critical` severities classify correctly
- insufficient history produces no anomaly
- repeated runs do not duplicate anomaly rows

### 4. Narration gate validation

Mock or stub the Groq call and assert:

- `low` and `medium` anomalies do not call narration
- `high` and `critical` do call narration
- low/medium still produce MKG patches

This is the most important service-level assertion for `PIPE-04`.

### 5. API validation

For `GET /api/kpis/:companyId?days=30`, verify:

- invalid `companyId` returns `400`
- invalid `days` returns `400`
- valid request returns only aggregated KPI rows
- response excludes raw snapshot payloads entirely

### 6. Manual end-to-end validation

Recommended manual flow:

1. Insert a raw snapshot fixture into `connector_raw_snapshots`.
2. Run `KPIAggregator`.
3. Confirm one `company_kpi_daily` row exists.
4. Seed prior KPI history if needed.
5. Run `AnomalyDetector`.
6. Confirm anomaly severity in `company_anomalies`.
7. Confirm:
   - no Groq call for `low`/`medium`
   - Groq call only for `high`/`critical`
8. Call `GET /api/kpis/:companyId?days=30` and confirm the API returns aggregate rows only.

### 7. Evidence to require before phase completion

- migration file exists and is human-runnable
- at least one deterministic aggregation test
- at least one deterministic anomaly severity test
- one explicit test covering narration gating
- one manual SQL verification checklist for Supabase

---

## Code Examples

### Example service flow

```javascript
// platform/content-engine/kpi-aggregator.js
import { supabase } from "./supabase.js";

export async function aggregateSnapshot(snapshot) {
  const extracted = extractMetricAtoms(snapshot);

  const row = {
    company_id: snapshot.company_id,
    metric_date: snapshot.snapshot_date,
    source_scope: "blended",
    currency: snapshot.currency || null,
    spend: extracted.spend ?? null,
    revenue: extracted.revenue ?? null,
    impressions: extracted.impressions ?? null,
    clicks: extracted.clicks ?? null,
    leads: extracted.leads ?? null,
    conversions: extracted.conversions ?? null,
    ctr: extracted.impressions > 0 ? extracted.clicks / extracted.impressions : null,
    cpc: extracted.clicks > 0 ? extracted.spend / extracted.clicks : null,
    cpl: extracted.leads > 0 ? extracted.spend / extracted.leads : null,
    cpa: extracted.conversions > 0 ? extracted.spend / extracted.conversions : null,
    roas: extracted.spend > 0 ? extracted.revenue / extracted.spend : null,
    source_snapshot_ids: [snapshot.id],
  };

  const { error } = await supabase
    .from("company_kpi_daily")
    .upsert(row, { onConflict: "company_id,metric_date,source_scope" });

  if (error) throw error;
  return row;
}
```

### Example narration gate

```javascript
// platform/content-engine/anomaly-detector.js
import { MKGService } from "./mkg-service.js";

export async function handleAnomalyOutcome(companyId, anomaly, summary) {
  if (anomaly.severity === "low" || anomaly.severity === "medium") {
    await MKGService.patch(companyId, {
      metrics: {
        value: summary.metrics,
        confidence: 0.8,
        last_verified: new Date().toISOString(),
        source_agent: "dev",
        expires_at: null,
      },
      baselines: {
        value: summary.baselines,
        confidence: 0.8,
        last_verified: new Date().toISOString(),
        source_agent: "dev",
        expires_at: null,
      },
    });
    return { narrated: false };
  }

  return narrateAnomaly(summary);
}
```

---

## Recommended Planning Decisions

Decide these before writing `06-01-PLAN.md`:

1. Use a real table for `company_kpi_daily`, not a PostgreSQL view object.
2. Add backend service-key support for Supabase writes, or explicitly relax RLS for this phase.
3. Define severity thresholds in the phase plan so tests are deterministic.
4. Treat Hooks integration as downstream, not as a blocker to core pipeline validation.
5. Enforce an explicit “aggregate-only to LLM” helper boundary in code.

If those decisions are locked first, the phase should plan cleanly into the roadmap’s existing three-plan structure.
