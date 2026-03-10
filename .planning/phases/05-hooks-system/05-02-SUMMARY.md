---
phase: 05-hooks-system
plan: "02"
subsystem: backend
tags: [hooks, signals, supabase, mkg, node-test]
requires:
  - phase: 05-hooks-system
    plan: "01"
    provides: "Validated hooks config consumed by the signal engine"
provides:
  - "Supabase migration for durable agent_signals persistence"
  - "HooksEngine heartbeat polling and diff-from-baseline evaluation"
  - "Node test coverage for signal claiming, evaluation, and dispatch payload generation"
affects: [phase-05-hooks-system, backend-server, hooks-engine, supabase]
tech-stack:
  added: []
  patterns: ["Diff-from-baseline signal evaluation", "Claim-process-complete signal lifecycle", "Dependency-injected dispatch engine"]
key-files:
  created:
    - /Users/yogs87/Documents/New project/marqq/database/migrations/hooks-system.sql
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/hooks-engine.js
    - /Users/yogs87/Documents/New project/marqq/platform/content-engine/hooks-engine.test.js
  modified:
    - /Users/yogs87/Documents/New project/marqq/.planning/ROADMAP.md
    - /Users/yogs87/Documents/New project/marqq/.planning/STATE.md
key-decisions:
  - "Kept dispatch abstract in HooksEngine so Phase 05-03 can reuse the same evaluated payloads without inventing a second execution path."
  - "Resolved current metric values from signal payload first, then MKG, while baselines always come from MKG to preserve company-specific diff semantics."
patterns-established:
  - "Signal rows move pending -> processing -> triggered|ignored|failed."
  - "Dispatch payloads now carry trigger metadata needed for the existing run endpoint wiring."
requirements-completed: [HOOKS-03, HOOKS-04]
duration: 4 min
completed: 2026-03-10
---

# Phase 5 Plan 02: Hooks System Summary

**Signal persistence and diff-from-baseline evaluation runtime for proactive hook triggering**

## Performance

- **Duration:** 4 min
- **Completed:** 2026-03-10T12:17:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `database/migrations/hooks-system.sql` to create the durable `agent_signals` table with lifecycle statuses, indexes, and service-role RLS policy.
- Implemented `platform/content-engine/hooks-engine.js` with heartbeat polling, pending-row claiming, MKG baseline evaluation, and normalized dispatch batch generation.
- Added `platform/content-engine/hooks-engine.test.js` to cover diff matching, ignored-path behavior, signal status transitions, and dispatch ordering.

## Verification

- `rg -n "agent_signals|pending|processing|triggered|ignored|failed" database/migrations/hooks-system.sql` passed
- `node --check platform/content-engine/hooks-engine.js` passed
- `node -e "import('./platform/content-engine/hooks-engine.js')..."` passed
- `node --test platform/content-engine/hooks-engine.test.js` passed

## Decisions Made

- Kept `HooksEngine` dependency-injected for Supabase, MKG reads, and dispatch so Wave 3 can wire the live backend path without refactoring the core evaluation logic.
- Made `payload.current_value` the first source of current metrics, with MKG as fallback, while baseline values remain MKG-driven.

## Self-Check: PASSED
