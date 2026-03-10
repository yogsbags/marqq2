---
phase: 02-agent-contract-standard
verified: 2026-03-10T10:00:00Z
status: human_needed
score: 9/9 must-haves verified (code-complete; Supabase migration pending human application)
re_verification: false
human_verification:
  - test: "Apply database/migrations/agent-contract.sql in Supabase SQL Editor and confirm it runs without errors"
    expected: "All 5 ALTER/ADD statements and both indexes execute successfully on a Supabase project that already has agent-employees.sql applied"
    why_human: "SQL migration must be applied manually via Supabase Dashboard — cannot verify remote DB state programmatically"
  - test: "Trigger a real agent run via chat interface (any slash command: /seo, /leads, /content) and inspect the SSE stream in DevTools Network tab"
    expected: "Multiple data:{text:...} prose chunks appear, followed by one data:{contract:{agent, run_id, artifact.confidence, tasks_created}} event, then data:[DONE]"
    why_human: "Requires live Groq LLM call and browser DevTools inspection to confirm end-to-end SSE event sequence"
  - test: "After a run with company_id set, query Supabase: SELECT agent, company_id, artifact->>'confidence' as conf FROM agent_run_outputs ORDER BY created_at DESC LIMIT 5"
    expected: "A row appears for the run with correct agent name and company_id — confirms saveAgentRunOutput persisted the contract"
    why_human: "Requires live Supabase DB access after migration is applied"
  - test: "Force a low-confidence run (or run with company_id where LLM returns confidence < 0.5) and query: SELECT * FROM agent_tasks WHERE task_type = 'missing_data' ORDER BY created_at DESC LIMIT 5"
    expected: "A row exists with task_type='missing_data', priority='high', triggered_by_run_id populated"
    why_human: "Requires live Supabase DB access and a run that produces confidence < 0.5 from the LLM"
  - test: "Submit a run with tasks_created items in the contract JSON, then query: SELECT agent_name, task_type, triggered_by_run_id FROM agent_tasks WHERE triggered_by_run_id IS NOT NULL ORDER BY created_at DESC LIMIT 10"
    expected: "One row per tasks_created item, each with triggered_by_run_id matching the run's run_id"
    why_human: "Requires live Supabase DB access and a run where the LLM produces non-empty tasks_created in its contract"
---

# Phase 2: Agent Contract Standard Verification Report

**Phase Goal:** Every agent run — regardless of which agent runs — produces a validated, structured AgentRunOutput JSON; the backend rejects malformed output and auto-creates follow-up tasks for low-confidence runs.
**Verified:** 2026-03-10T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/agents/:name/run omitting required fields is rejected with validation errors identifying each missing field | VERIFIED | `validateContract` returns `{ valid: false, errors: [...] }` with per-field messages; `contractError: "invalid", details: errors` SSE event emitted before [DONE] — confirmed in backend-server.js lines 3194-3203 |
| 2 | agent_tasks table has triggered_by_run_id, company_id, description, and priority columns; user_id is nullable | VERIFIED (migration) | `database/migrations/agent-contract.sql` contains all 5 ALTER statements — pending human application to Supabase |
| 3 | validateContract(obj) returns `{valid:true, errors:[]}` for well-formed and `{valid:false, errors:[...]}` for malformed input | VERIFIED | Live node test run: "All assertions passed" — extractContract and validateContract both work correctly |
| 4 | extractContract(fullText) returns last CONTRACT JSON block, trims trailing markdown, returns null when sentinel absent | VERIFIED | Live node test confirms lastIndexOf behavior, null-on-absent, and null-on-malformed-second-block |
| 5 | After stream ends, server extracts CONTRACT block and sends data:{contract:{...}} event before data:[DONE] | VERIFIED | backend-server.js lines 3183-3235: extract → validate → MKG patch → Promise.allSettled → contract event → [DONE] |
| 6 | When LLM produces no CONTRACT sentinel, endpoint sends data:{contractError:"missing"} before [DONE] and does not crash | VERIFIED | Lines 3185-3192: soft-fail path emits contractError:"missing" event, calls res.end(), returns without crashing |
| 7 | context_patch.patch is applied to MKG via MKGService.patch() when company_id is present and patch is non-empty | VERIFIED | Lines 3211-3223: Object.keys check guard + MKGService.patch(companyId, rawContract.context_patch.patch) call with try/catch |
| 8 | artifact.confidence < 0.5 auto-creates agent_tasks row with task_type='missing_data', priority='high', triggered_by_run_id | VERIFIED (code) | `createMissingDataTask` (lines 2977-3001): confidence >= 0.5 guard, inserts with task_type='missing_data', priority='high', triggered_by_run_id; Supabase DB write requires migration applied |
| 9 | tasks_created items are written to Supabase agent_tasks with triggered_by_run_id populated | VERIFIED (code) | `writeTasksCreated` (lines 3007-3029): maps each item with triggered_by_run_id = contract.run_id; Supabase DB write requires migration applied |

**Score:** 9/9 truths verified at code level. Supabase DB persistence requires human step (migration application).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `database/migrations/agent-contract.sql` | ALTER TABLE agent_tasks adding 4 columns + DROP NOT NULL on user_id + 2 indexes | VERIFIED | 29 lines — all 5 schema changes and both indexes present; IF NOT EXISTS guards make it idempotent |
| `platform/content-engine/contract-validator.js` | extractContract() and validateContract() exported functions | VERIFIED | 171 lines — both functions exported, no external dependencies, full validation logic implemented |
| `platform/content-engine/backend-server.js` | Modified run endpoint with stream-then-extract contract logic + 3 persistence helpers | VERIFIED | Import at line 47; helpers at lines 2940-3029; modified endpoint at lines 3036-3239 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend-server.js` | `contract-validator.js` | ESM import line 47 | WIRED | `import { extractContract, validateContract } from "./contract-validator.js"` — confirmed at line 47 |
| `backend-server.js` | `contract-validator.js` | extractContract call | WIRED | Line 3183: `const rawContract = extractContract(fullText)` |
| `backend-server.js` | `contract-validator.js` | validateContract call | WIRED | Line 3194: `const { valid, errors } = validateContract(rawContract)` |
| `backend-server.js` | `mkg-service.js` | MKGService.patch() | WIRED | Line 3217: `await MKGService.patch(companyId, rawContract.context_patch.patch)` with try/catch |
| `backend-server.js` | Supabase `agent_run_outputs` | supabase.from(...).insert() | WIRED (code) | Line 2950: `.from("agent_run_outputs").insert(...)` inside saveAgentRunOutput — requires DB migration |
| `backend-server.js` | Supabase `agent_tasks` | supabase.from(...).insert() | WIRED (code) | Lines 2983, 3020: `.from("agent_tasks").insert(...)` inside createMissingDataTask and writeTasksCreated — requires DB migration |
| `saveAgentRunOutput` → `createMissingDataTask` → `writeTasksCreated` | SSE stream | Promise.allSettled | WIRED | Lines 3226-3230: all three called via `Promise.allSettled(...)` before contract SSE event |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CONTRACT-01 | 02-01, 02-02 | Every agent run returns structured AgentRunOutput JSON with all 12 required fields | SATISFIED | contractInstruction in system prompt injects all 12-field template; contract emitted as data:{contract:{...}} SSE event; validateContract checks all fields |
| CONTRACT-02 | 02-01, 02-02 | Backend validates AgentRunOutput schema before saving; rejects malformed contracts | SATISFIED | validateContract called post-stream; invalid contracts send contractError:"invalid" with per-field errors before [DONE]; Supabase writes only fire after validation passes |
| CONTRACT-03 | 02-03 | artifact.confidence 0–1 is required; runs with confidence < 0.5 auto-create a missing_data follow-up task | SATISFIED (code) | createMissingDataTask: confidence < 0.5 threshold guard + inserts agent_tasks row with task_type='missing_data', priority='high', triggered_by_run_id; DB write requires migration applied |
| CONTRACT-04 | 02-02 | context_patch is applied to MKG immediately after every successful run | SATISFIED | MKGService.patch() called synchronously (awaited) before Supabase writes and before [DONE]; guarded by company_id presence and non-empty patch |
| CONTRACT-05 | 02-03 | tasks_created are written to Supabase agent_tasks with triggered_by_run_id FK | SATISFIED (code) | writeTasksCreated maps each item with triggered_by_run_id = contract.run_id; DB write requires migration applied |

All 5 CONTRACT requirements are addressed in the code. The Supabase side of CONTRACT-03 and CONTRACT-05 requires the database migration (human step) to be applied before rows can be written.

Note: REQUIREMENTS.md Traceability table still shows CONTRACT-01 through CONTRACT-05 as "Pending" — this is a documentation gap, not a code gap. The implementation is complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None detected | — | — | — | — |

No TODOs, FIXMEs, placeholders, empty implementations, or stub patterns found in the phase-2 code artifacts (contract-validator.js, agent-contract.sql, or the run endpoint/helpers section of backend-server.js).

### Human Verification Required

#### 1. Apply Supabase Migration

**Test:** Paste `database/migrations/agent-contract.sql` into Supabase Dashboard > SQL Editor and run it (after confirming `agent-employees.sql` has already been applied).
**Expected:** All statements execute without errors; the agent_tasks table gains triggered_by_run_id, company_id, description, and priority columns; user_id becomes nullable; both indexes are created.
**Why human:** SQL migration targets a remote Supabase database — cannot verify remote schema state programmatically.

#### 2. End-to-End SSE Stream Inspection

**Test:** Open the chat interface, run any slash command (e.g., `/seo give me a quick tip`), open DevTools > Network, find the `/api/agents/:name/run` SSE request, and inspect the response stream.
**Expected:** Multiple `data: {"text":"..."}` prose chunks appear, followed by one `data: {"contract":{...}}` event containing agent name, run_id (a UUID), artifact.confidence (0.0–1.0), and tasks_created (an array). Final event is `data: [DONE]`.
**Why human:** Requires a live Groq LLM call with real streaming output; contract content depends on LLM output which cannot be mocked programmatically.

#### 3. Supabase agent_run_outputs Persistence

**Test:** After running an agent with `company_id` set, query Supabase: `SELECT agent, company_id, artifact->>'confidence' as conf, created_at FROM agent_run_outputs ORDER BY created_at DESC LIMIT 5;`
**Expected:** A row exists matching the run, with correct agent name and company_id populated.
**Why human:** Requires live Supabase DB access after the migration is applied and a real agent run completes.

#### 4. Low-Confidence Auto-Task Creation

**Test:** Confirm a run where LLM produces `artifact.confidence < 0.5`, then query: `SELECT task_type, priority, triggered_by_run_id FROM agent_tasks WHERE task_type = 'missing_data' ORDER BY created_at DESC LIMIT 5;`
**Expected:** A row with task_type='missing_data', priority='high', triggered_by_run_id matching the run's run_id.
**Why human:** LLM confidence is non-deterministic; requires a live run producing low confidence, followed by DB inspection.

#### 5. tasks_created FK Chain

**Test:** Inspect a run's contract SSE event for non-empty `tasks_created`, then query: `SELECT agent_name, task_type, triggered_by_run_id FROM agent_tasks WHERE triggered_by_run_id IS NOT NULL ORDER BY created_at DESC LIMIT 10;`
**Expected:** One row per tasks_created item, each with triggered_by_run_id matching the run's run_id.
**Why human:** Requires LLM to produce non-empty tasks_created in the contract JSON (non-deterministic), followed by DB inspection.

### Gaps Summary

No code gaps. All 9 observable truths are verified at the code level. All 5 CONTRACT requirements are implemented. All key links are wired.

The phase status is `human_needed` because Supabase DB persistence (CONTRACT-03, CONTRACT-05, and saveAgentRunOutput) requires the `database/migrations/agent-contract.sql` migration to be applied in Supabase before rows can be written. Until applied, write calls fail silently (fire-and-log pattern intentionally prevents SSE stream interruption). The code path for all three helpers is fully implemented and wired.

**Pending human step:** Apply `database/migrations/agent-contract.sql` in Supabase Dashboard > SQL Editor. This is documented in STATE.md and noted in both 02-01-SUMMARY.md and 02-03-SUMMARY.md.

---

_Verified: 2026-03-10T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
