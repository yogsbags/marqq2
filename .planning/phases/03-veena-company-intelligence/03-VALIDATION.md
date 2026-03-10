---
phase: 3
slug: veena-company-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual test scripts (project convention — no jest/vitest/pytest detected) |
| **Config file** | none — Wave 0 installs `test-veena-crawl.js` |
| **Quick run command** | `node test-veena-crawl.js https://example.com` |
| **Full suite command** | `node test-veena-crawl.js https://example.com && node test-veena-onboard.js` |
| **Estimated runtime** | ~90 seconds (compound LLM crawl is network-bound) |

---

## Sampling Rate

- **After every task commit:** Run `ls platform/crewai/agents/veena/` (file existence checks)
- **After every plan wave:** Run full suite `node test-veena-crawl.js && node test-veena-onboard.js`
- **Before `/gsd:verify-work`:** Full suite must be green + Supabase query confirms agent_tasks rows
- **Max feedback latency:** 180 seconds (3-minute crawl window per VEENA-02 success criterion)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | VEENA-01 | file existence | `ls platform/crewai/agents/veena/SOUL.md` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | VEENA-01 | file existence | `ls platform/crewai/agents/veena/mcp.json` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | VEENA-01 | file existence | `ls platform/crewai/agents/veena/skills/` | ❌ W0 | ⬜ pending |
| 3-01-04 | 01 | 1 | VEENA-01 | file existence | `ls platform/crewai/agents/veena/memory/MEMORY.md` | ❌ W0 | ⬜ pending |
| 3-01-05 | 01 | 1 | VEENA-01 | grep | `grep veena platform/content-engine/backend-server.js` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | VEENA-02 | integration | `node test-veena-crawl.js https://example.com` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 2 | VEENA-04 | unit | inspect crawl output — verify all 12 keys in context_patch | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 3 | VEENA-05 | unit | `node test-veena-onboard.js --step=template` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 3 | VEENA-03 | integration | `curl -X POST localhost:3006/api/agents/veena/onboard` + Supabase query | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test-veena-crawl.js` — smoke test: calls `crawlCompanyForMKG(url)`, asserts 12 MKG keys present, logs confidence scores per field
- [ ] `test-veena-onboard.js` — integration: POSTs to `/api/agents/veena/onboard`, queries Supabase `agent_tasks` and asserts rows exist for veena + isha + neel + zara
- [ ] No framework install needed — plain Node.js scripts match existing `test-supabase-connection.js` convention

*Wave 0 test files are new — no existing infrastructure covers Veena-specific behavior.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MKG populated within 3 minutes | VEENA-02 | Timing requires wall-clock measurement during live crawl | Start timer, run `node test-veena-crawl.js https://[real-company-url]`, confirm all 12 fields have `confidence > 0` before 3:00 elapsed |
| Sequential chain ordering (veena→isha→neel→zara) | VEENA-03 | `scheduled_for` timestamps confirm order; actual execution is Phase 4/5 | Query: `SELECT agent_name, status, scheduled_for FROM agent_tasks WHERE company_id='test-co' ORDER BY scheduled_for` — verify isha < neel < zara timestamps |
| context_patch MKG update is immediate | VEENA-04 | Requires reading mkg.json immediately after crawl returns | After test-veena-crawl.js completes, `cat platform/data/mkg/[company_id]/mkg.json` — verify all 12 top-level keys are present with `source_agent: "veena"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
