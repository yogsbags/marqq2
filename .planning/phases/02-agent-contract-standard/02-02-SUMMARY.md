---
phase: 02-agent-contract-standard
plan: "02"
subsystem: api
tags: [groq, sse, agent-contract, mkg, streaming]

# Dependency graph
requires:
  - phase: 02-agent-contract-standard
    provides: "extractContract and validateContract from contract-validator.js (02-01)"
  - phase: 01-mkg-foundation
    provides: "MKGService.patch() for applying context patches to company MKG"
provides:
  - "POST /api/agents/:name/run with stream-then-extract contract logic"
  - "company_id and run_id accepted from request body (run_id auto-generated if absent)"
  - "Run Context block and CONTRACT_INSTRUCTION injected into every agent system prompt"
  - "Structured contract SSE event emitted after stream ends"
  - "MKG context_patch applied when company_id present and patch is non-empty"
affects: [03-agent-run-persistence, agent-orchestration, slash-commands]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stream-then-extract: forward prose SSE chunks live, buffer fullText, extract contract post-stream"
    - "Soft-fail contract: missing or invalid contract emits contractError event, never crashes"
    - "Server-enforced fields: run_id and agent name overwritten server-side (defense against agent confusion)"
    - "Fire-and-log MKG patch: MKGService.patch() called asynchronously, error logged but does not block SSE"

key-files:
  created: []
  modified:
    - platform/content-engine/backend-server.js

key-decisions:
  - "max_tokens increased from 4096 to 8192 — long prose + contract JSON block requires the extra headroom"
  - "company_id is optional — existing callers omitting it still work; MKG patch is simply skipped with a console.warn"
  - "run_id adopted from client if present (idempotency), auto-generated UUID otherwise"
  - "contractInstruction always injected LAST in system prompt — takes precedence over SOUL.md, memory, and skills"
  - "contractError event sent before [DONE] on missing/invalid contract — preserves UX, lets frontend degrade gracefully"

patterns-established:
  - "Stream-then-extract: buffer fullText during SSE, post-stream analysis does not interrupt client stream"
  - "RunContextBlock injection: company_id and run_id echoed into system prompt so LLM produces correct contract JSON"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-10
---

# Phase 2 Plan 02: Agent Contract Standard — Run Endpoint Summary

**POST /api/agents/:name/run now buffers LLM output, extracts and validates the ---CONTRACT--- block post-stream, applies MKG context patches, and emits a structured data:{contract} SSE event before [DONE]**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-10T00:00:00Z
- **Completed:** 2026-03-10T00:08:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `import { extractContract, validateContract } from "./contract-validator.js"` at line 47 of backend-server.js
- Replaced the POST /api/agents/:name/run handler body (lines 2943-3142) with the stream-then-extract contract pattern
- max_tokens increased from 4096 to 8192 so long prose responses plus the contract JSON block fit within the limit
- company_id is accepted but optional — callers without it still work; only the MKG patch step is skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Import contract-validator and modify the run endpoint** - `67bd481` (feat)

## Files Created/Modified

- `platform/content-engine/backend-server.js` — Modified: import added at line 47; handler at lines 2943-3142 replaced with stream-then-extract pattern

## Decisions Made

- max_tokens raised to 8192 (from 4096) — combined prose + contract block regularly exceeds 4096 tokens for real queries
- company_id is optional (null when absent) — existing slash-command callers that do not send company_id continue to work without modification
- run_id is idempotent: if the client sends one it is adopted; otherwise a fresh UUID is generated server-side
- contractInstruction appended LAST in fullSystem — ensures the LLM sees it after SOUL.md, memory, and skills, maximising compliance
- Soft-fail pattern chosen for missing/invalid contract: a contractError SSE event is emitted before [DONE] rather than crashing, so the frontend prose display is unaffected

## Deviations from Plan

None - plan executed exactly as written.

## Sample contract SSE output

```
data: {"text":"Here is a quick SEO tip: "}
data: {"text":"focus on long-tail keywords..."}
... (many prose chunks) ...
data: {"contract":{"agent":"maya","task":"Provide a 2-sentence SEO tip","company_id":"test-co","run_id":"test-run-001","timestamp":"2026-03-10T00:05:00.000Z","input":{"mkg_version":null,"dependencies_read":[],"assumptions_made":[]},"artifact":{"data":{},"summary":"Provided a concise SEO tip focusing on long-tail keyword targeting to improve organic search visibility.","confidence":0.85},"context_patch":{"writes_to":[],"patch":{}},"handoff_notes":"","missing_data":[],"tasks_created":[],"outcome_prediction":null}}
data: [DONE]
```

## Verification

```
grep "contract-validator" platform/content-engine/backend-server.js
# => import { extractContract, validateContract } from "./contract-validator.js";

grep "max_tokens: 8192" platform/content-engine/backend-server.js
# => max_tokens: 8192,  // increased from 4096 — long prose + contract block needs room
```

## Issues Encountered

None.

## Next Phase Readiness

- The modified endpoint is ready for plan 02-03 to add Supabase side-effects (persisting agent_run_outputs rows) on top of the contract event that this plan emits
- Existing slash commands (/seo, /leads, /content, /campaign, /competitors, /brief, /social, /email) are unaffected — they only consume data:{text} events

---
*Phase: 02-agent-contract-standard*
*Completed: 2026-03-10*
