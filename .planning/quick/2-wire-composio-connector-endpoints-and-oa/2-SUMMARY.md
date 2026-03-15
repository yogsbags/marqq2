---
phase: quick-2
plan: 1
subsystem: integrations
tags: [composio, oauth, settings, automation-registry]
key-files:
  modified:
    - platform/content-engine/backend-server.js
    - app/src/components/settings/tabs/AccountsTab.tsx
    - platform/content-engine/automations/registry.js
decisions:
  - AccountsTab uses getActiveAgentContext().companyId exclusively (no useAuth) — companyId is the entityId for Composio OAuth scoping
  - getComposioToken uses native fetch with node-fetch dynamic import fallback — matches existing registry.js fetch pattern
  - Popup poll interval is 1500ms — balances responsiveness vs overhead; actionId not cleared until popup closes to keep "Connecting..." state
metrics:
  duration: "~10 min"
  completed: "2026-03-15T18:52:00Z"
  tasks: 3
  files: 3
---

# Quick-2: Wire Composio Connector Endpoints and OAuth — Summary

**One-liner:** Live Composio-backed integration routes replacing 501 stubs, plus OAuth popup flow with companyId scoping and credential injection in automation dispatcher.

## What Was Done

### Task 1: Replace stub integration routes in backend-server.js

Replaced the 170-line static connector array GET handler and two 501 POST stubs with live handlers backed by `mcp-router.js`.

- Added import: `getConnectors, initiateConnection, disconnectConnector` from `./mcp-router.js`
- `GET /api/integrations?companyId=X` now calls `getConnectors(companyId)` — returns live Composio status when `COMPOSIO_API_KEY` is set, stub list when unset
- `POST /api/integrations/connect` calls `initiateConnection(companyId, connectorId)` — returns `{ redirectUrl }` for OAuth popup
- `POST /api/integrations/disconnect` calls `disconnectConnector(companyId, connectorId)` — deletes Composio connected account

**Commit:** `1cf44c4`

### Task 2: Wire AccountsTab.tsx to companyId + OAuth popup

Replaced `useAuth`/`userId` wiring with `getActiveAgentContext().companyId` throughout the component.

- `load()` now reads companyId from localStorage context; fetches `/api/integrations?companyId=X`
- `connect()` opens OAuth popup via `window.open(..., 'composio_oauth', 'width=600,height=700,...')`
- Polls `popup.closed` every 1500ms; clears `actionId` and calls `load()` when popup closes
- Connect button shows `"Connecting…"` while `actionId === c.id` (spinner state while popup is open)
- `disconnect()` sends `{ companyId, connectorId }` body; shows "Select a company first" toast if no companyId
- Removed `useAuth` import entirely — no longer needed in this component

**Commit:** `179435c`

### Task 3: Add requires_credential + getComposioToken + credential injection in registry.js

Added `requires_credential` to all 5 REGISTRY entries, added a private `getComposioToken` helper, and wired credential resolution into the dispatcher before n8n/direct_api fetch calls.

**REGISTRY credential assignments:**
| Automation | requires_credential |
|---|---|
| fetch_meta_ads | `facebookads` |
| competitor_ad_library | `null` |
| creative_fatigue_check | `null` |
| google_ads_fetch | `googleads` |
| apollo_lead_enrich | `null` |

`getComposioToken(companyId, appName)`:
- Queries `https://backend.composio.dev/api/v1/connectedAccounts?entityId=...&appName=...`
- Finds first ACTIVE account; returns `connectionConfig.access_token` or `accessToken`
- Returns null if `COMPOSIO_API_KEY` unset, appName null, no active account, or any error
- Uses native `fetch` with `import('node-fetch')` dynamic fallback

In `executeAutomation`, before the webhook dispatch:
- Calls `getComposioToken(companyId, entry.requires_credential)` if `requires_credential` is set
- Warns to console if token not found but continues (graceful degradation)
- Spreads `access_token` into webhook body only when resolved

**Commit:** `c958f45`

## Verification Results

1. Registry integrity: `REGISTRY.every(r => 'requires_credential' in r)` returns `true` for all 5 entries
2. TypeScript: `npm run typecheck` passes with no errors in AccountsTab.tsx
3. All 3 integration routes replaced (confirmed via grep on backend-server.js)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files confirmed created/modified:
- FOUND: platform/content-engine/backend-server.js (import + 3 route handlers updated)
- FOUND: app/src/components/settings/tabs/AccountsTab.tsx (companyId + popup wiring)
- FOUND: platform/content-engine/automations/registry.js (requires_credential + helper + injection)

Commits confirmed:
- 1cf44c4: feat(quick-2): replace stub integration routes
- 179435c: feat(quick-2): wire AccountsTab to companyId and OAuth popup
- c958f45: feat(quick-2): add requires_credential, getComposioToken helper
