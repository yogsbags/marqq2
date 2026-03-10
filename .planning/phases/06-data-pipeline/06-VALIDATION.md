---
phase: 6
slug: data-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-10
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` |
| **Config file** | none — built-in runner |
| **Quick run command** | `node --test platform/content-engine/data-pipeline-schema.test.js platform/content-engine/supabase.test.js platform/content-engine/kpi-aggregator.test.js platform/content-engine/anomaly-detector.test.js platform/content-engine/kpi-api.test.js platform/content-engine/nightly-pipeline.test.js` |
| **Full suite command** | `node --test platform/content-engine/*.test.js` |
| **Estimated runtime** | smoke ~10-15 seconds, full suite ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific command from the map below. If the task touches shared backend wiring, also run the Quick run command before moving on.
- **After every plan wave:** Run `node --test platform/content-engine/*.test.js`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | PIPE-01 | migration contract + manual DB check | `node --test platform/content-engine/data-pipeline-schema.test.js` | ✅ planned | ⬜ pending |
| 06-01-02 | 01 | 0 | PIPE-01 | unit/smoke | `node --test platform/content-engine/supabase.test.js` | ✅ planned | ⬜ pending |
| 06-02-01 | 02 | 1 | PIPE-02 | unit | `node --test platform/content-engine/kpi-aggregator.test.js` | ✅ planned | ⬜ pending |
| 06-02-02 | 02 | 1 | PIPE-02 | unit | `node --test platform/content-engine/kpi-aggregator.test.js` | ✅ planned | ⬜ pending |
| 06-03-01 | 03 | 2 | PIPE-03, PIPE-04 | unit | `node --test platform/content-engine/anomaly-detector.test.js` | ✅ planned | ⬜ pending |
| 06-03-02 | 03 | 2 | PIPE-05 | integration + scheduler smoke | `node --test platform/content-engine/kpi-api.test.js platform/content-engine/nightly-pipeline.test.js` | ✅ planned | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `platform/content-engine/data-pipeline-test-helpers.js` — shared fake Supabase builders, KPI/anomaly fixtures, and scheduler clock helpers used across Phase 6 tests
- [ ] `platform/content-engine/data-pipeline-schema.test.js` — migration text contract coverage for required tables, RLS, uniqueness, and append-only boundaries
- [ ] `platform/content-engine/supabase.test.js` — Wave 0 smoke coverage for service-role client export, null-safe fallback, and write-surface boundary
- [ ] `06-02` depends on `06-01` so aggregation work cannot start before the shared schema/client/test foundation exists
- [ ] `06-03` depends on `06-01` and `06-02` so anomaly/API/nightly scheduling work inherits the Wave 0 harness and KPI surface
- [ ] Later Wave 1/2 tests import or reuse the Wave 0 helper layer instead of inventing isolated mocks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase tables, indexes, and RLS policies exist after migration | PIPE-01 | Requires live project DB inspection | Apply the migration in Supabase SQL Editor, then run the SQL checks from `06-RESEARCH.md` and capture the output. |
| End-to-end raw snapshot -> KPI row -> anomaly row -> narration gate flow | PIPE-02, PIPE-03, PIPE-04 | Requires real DB state plus live backend wiring | Seed a fixture snapshot, run the aggregator, seed history, run the anomaly detector, then confirm low/medium skip LLM and high/critical call it. |
| Nightly scheduler registration executes detector on the configured cadence | PIPE-03, PIPE-04 | Requires a running backend process and wall-clock verification beyond isolated unit tests | Start `npm run dev:backend`, confirm the nightly job registers once at boot, then use the verification-only trigger or forced clock config described in code comments to observe one end-to-end scheduled detector run. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
