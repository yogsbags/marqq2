---
phase: 06-data-pipeline
plan: "03"
subsystem: api
tags: [supabase, anomaly-detection, express, node-test, scheduler]
requires:
  - phase: 06-data-pipeline
    provides: "Phase 6 schema, KPI aggregation service, and shared pipeline test helpers"
provides:
  - "Deterministic anomaly detection with 7-day and 30-day baselines rooted in company_kpi_daily"
  - "Severity-first narration gating so only high and critical anomalies invoke Groq"
  - "Safe KPI REST endpoint and backend-owned nightly anomaly scheduler helpers"
affects: [phase-06-data-pipeline, backend-server, anomaly-detector, performance-scorecard, hooks-system]
tech-stack:
  added: []
  patterns: ["Severity-first anomaly gating", "Backend-owned nightly scheduling via process timers", "KPI API safe-read projection"]
key-files:
  created:
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/anomaly-detector.js
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/anomaly-detector.test.js
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/kpi-api.test.js
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/nightly-pipeline.test.js
  modified:
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/backend-server.js
key-decisions:
  - "Defaulted the nightly anomaly schedule to 18:30 UTC so the single backend timer lands at midnight IST without adding a cron dependency."
  - "Kept anomaly narration behind a severity-first gate and passed only KPI/anomaly summaries into Groq prompts and MKG patches."
patterns-established:
  - "Phase 6 runtime reads only company_kpi_daily for anomaly baselines and company_anomalies for durable writes."
  - "Backend route helpers are exportable pure functions while server startup remains main-module only."
requirements-completed: [PIPE-03, PIPE-04, PIPE-05]
duration: 5 min
completed: 2026-03-10
---

# Phase 6 Plan 03: Data Pipeline Summary

**Deterministic nightly anomaly detection with severity-gated narration, silent MKG updates, and a safe KPI REST surface**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T11:50:55Z
- **Completed:** 2026-03-10T11:56:03Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `anomaly-detector.js` to compute 7-day and 30-day KPI baselines from `company_kpi_daily`, classify severity, upsert durable `company_anomalies` rows, and patch MKG silently for low and medium anomalies.
- Gated narration strictly on severity so only `high` and `critical` anomalies call Groq, and only with KPI/anomaly summaries rather than raw connector payloads.
- Added `GET /api/kpis/:companyId` plus exportable nightly scheduler helpers in `backend-server.js`, then covered both with node:test contract suites.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing anomaly detector coverage** - `6d2015a` (test)
2. **Task 1 GREEN: deterministic anomaly detector implementation** - `c5e6fbe` (feat)
3. **Task 2 RED: failing KPI API and nightly scheduler coverage** - `4b391f0` (test)
4. **Task 2 GREEN: KPI API and nightly anomaly runtime wiring** - `4a5ad93` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `/Users/yogs87/Documents/New project/marqq/platform/content-engine/anomaly-detector.js` - Severity thresholds, baseline math, anomaly upserts, silent MKG patching, and Groq narration gate.
- `/Users/yogs87/Documents/New project/marqq/platform/content-engine/anomaly-detector.test.js` - Deterministic coverage for thresholds, history guardrails, silent MKG updates, and narration gating.
- `/Users/yogs87/Documents/New project/marqq/platform/content-engine/backend-server.js` - Safe KPI route, nightly scheduling helpers, main-module-only startup, and runtime scheduler bootstrap.
- `/Users/yogs87/Documents/New project/marqq/platform/content-engine/kpi-api.test.js` - Contract tests for validated KPI route inputs and KPI-only output shape.
- `/Users/yogs87/Documents/New project/marqq/platform/content-engine/nightly-pipeline.test.js` - Scheduler and nightly detector fan-out coverage without wall-clock sleeps.

## Decisions Made

- Used a backend-owned `setTimeout` scheduler instead of introducing cron so nightly anomaly execution stays in the existing long-lived content-engine process.
- Defaulted the schedule to `18:30` UTC, which maps cleanly to midnight IST and remains deterministic across UTC and IST operations.
- Exported route and scheduler helpers from `backend-server.js` while gating actual server startup to main-module execution, keeping tests import-safe without changing runtime behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made backend-server startup import-safe for route and scheduler tests**
- **Found during:** Task 2 (Add the KPI REST endpoint, nightly scheduler wiring, and backend contract tests)
- **Issue:** `backend-server.js` bound a port on import, which prevented node:test from importing real route/scheduler helpers safely.
- **Fix:** Moved startup behind a main-module guard and exported pure helpers plus an explicit runtime bootstrap.
- **Files modified:** `platform/content-engine/backend-server.js`
- **Verification:** `node --test platform/content-engine/kpi-api.test.js platform/content-engine/nightly-pipeline.test.js`
- **Committed in:** `4a5ad93`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was required to verify the actual backend wiring in-process. No scope creep.

## Issues Encountered

- Local verification logs the existing missing-Supabase-env warning because this workspace has no configured `VITE_SUPABASE_URL` or anon key. Tests stayed deterministic by injecting doubles and pure helpers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 now has the full safe-read loop: raw snapshots aggregate into KPI rows, KPI rows drive nightly anomaly detection, and frontend or agent consumers can read `/api/kpis/:companyId` without raw payload leakage.
- The backend process now owns nightly anomaly execution directly, so later hooks or scorecard work can consume anomalies without adding a separate scheduler layer first.
- Phase complete, ready for transition.

## Self-Check: PASSED

- Found `.planning/phases/06-data-pipeline/06-03-SUMMARY.md`
- Found task commit `6d2015a`
- Found task commit `c5e6fbe`
- Found task commit `4b391f0`
- Found task commit `4a5ad93`
