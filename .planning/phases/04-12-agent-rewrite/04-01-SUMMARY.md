---
phase: 04-12-agent-rewrite
plan: "01"
subsystem: agents
tags: [agents, mkg, identity, memory, marketing-brain]
requires:
  - phase: 01-mkg-foundation
    provides: "Shared MKG field model and first-skill loading convention"
  - phase: 02-agent-contract-standard
    provides: "AgentRunOutput contract expectations for every run"
  - phase: 03-veena-company-intelligence
    provides: "Phase-4-style SOUL format with reads_from_mkg, writes_to_mkg, and triggers_agents"
provides:
  - "Phase-4 SOUL.md identities for all 11 non-Veena agents"
  - "Reset MEMORY.md baselines for the rewritten 11-agent roster"
  - "Locked role-map alignment for AGENT-05 across all non-Veena agent files"
affects: [04-02, 04-03, phase-05-hooks]
tech-stack:
  added: []
  patterns: ["Phase-4 agent files declare MKG read/write ownership explicitly", "Scheduler-safe memory scaffolds exist for every agent before runtime registration"]
key-files:
  created:
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/isha/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/neel/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/tara/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/isha/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/neel/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/tara/memory/MEMORY.md
  modified:
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/zara/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/maya/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/riya/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/arjun/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/dev/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/priya/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/kiran/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/sam/SOUL.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/zara/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/maya/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/riya/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/arjun/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/dev/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/priya/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/kiran/memory/MEMORY.md
    - /Users/yogs87/Documents/New project/marqq/platform/crewai/agents/sam/memory/MEMORY.md
key-decisions:
  - "Used Veena as the canonical SOUL reference so all rewritten agents declare reads_from_mkg, writes_to_mkg, and triggers_agents consistently"
  - "Removed legacy agent_notifications output instructions from SOUL files because backend-server.js already appends the AgentRunOutput contract"
  - "Reset all MEMORY.md files to a clean Phase 4 baseline before runtime registration so scheduler writes do not inherit stale legacy state"
patterns-established:
  - "Every rewritten agent now names a concrete marketing role, MKG boundaries, and downstream trigger topology"
  - "Memory scaffolds use a short reset header plus calibration/outcome placeholders to tolerate scheduler truncation"
requirements-completed: [AGENT-01, AGENT-04, AGENT-05, AGENT-06]
duration: 15 min
completed: 2026-03-10
---

# Phase 4 Plan 01: Agent Identity Rewrite Summary

**Phase-4 SOUL identities and clean memory baselines for all 11 non-Veena agents, aligned to the locked 12-node role map**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-10T11:24:00Z
- **Completed:** 2026-03-10T11:39:29Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments
- Rewrote every non-Veena `SOUL.md` to the Phase 4 format with explicit MKG ownership and trigger relationships.
- Added runnable identity scaffolds for `isha`, `neel`, and `tara`, which previously lacked `SOUL.md` entirely.
- Reset all 11 `MEMORY.md` files to a clean Phase 4 baseline so scheduler append behavior starts from known-good state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite SOUL.md for all 11 non-Veena agents** - `bba017a` (feat)
2. **Task 2: Initialize/reset memory files for the rewritten agents** - `49cf981` (feat)

## Files Created/Modified
- `/Users/yogs87/Documents/New project/marqq/platform/crewai/agents/isha/SOUL.md` - New Market Research identity with MKG ownership and trigger topology.
- `/Users/yogs87/Documents/New project/marqq/platform/crewai/agents/neel/SOUL.md` - New Strategy identity aligned to the locked Phase 4 role map.
- `/Users/yogs87/Documents/New project/marqq/platform/crewai/agents/tara/SOUL.md` - New Offer Engineering identity with funnel and offer write targets.
- `/Users/yogs87/Documents/New project/marqq/platform/crewai/agents/{zara,maya,riya,arjun,dev,priya,kiran,sam}/SOUL.md` - Legacy roles replaced with Phase 4 node definitions and MKG declarations.
- `/Users/yogs87/Documents/New project/marqq/platform/crewai/agents/{isha,neel,tara,zara,maya,riya,arjun,dev,priya,kiran,sam}/memory/MEMORY.md` - Clean memory baselines for the rewritten roster.

## Decisions Made

- Assigned explicit trigger graphs in SOUL files now rather than leaving downstream topology implicit.
- Kept schedules in SOUL files lightweight and role-aligned, with the authoritative cron matrix deferred to Plan 04-03.
- Standardized memory templates so all agents start Phase 4 with the same scheduler-safe structure.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Zara's legacy memory file contained stale garbage state, so it was replaced wholesale rather than edited in place.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-02 can now realign `mcp.json` and `skills/` against stable role definitions instead of legacy agent identities.
- Runtime registration work in 04-03 can assume all 11 non-Veena agents now have scheduler-safe memory files and explicit MKG contracts.

## Self-Check: PASSED

- Found `.planning/phases/04-12-agent-rewrite/04-01-SUMMARY.md`
- Found task commit `bba017a`
- Found task commit `49cf981`
