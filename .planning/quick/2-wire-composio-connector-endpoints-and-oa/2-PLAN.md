---
phase: quick-2
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - platform/content-engine/backend-server.js
  - app/src/components/settings/tabs/AccountsTab.tsx
  - platform/content-engine/automations/registry.js
autonomous: true
requirements: [QUICK-2]
must_haves:
  truths:
    - "GET /api/integrations?companyId=X returns connector list with live Composio status"
    - "POST /api/integrations/connect returns { redirectUrl } which opens an OAuth popup"
    - "Popup close is detected and triggers a connector status refresh"
    - "POST /api/integrations/disconnect calls Composio to remove the connected account"
    - "Automation registry entries declare requires_credential and dispatcher injects access_token"
  artifacts:
    - path: "platform/content-engine/backend-server.js"
      provides: "3 live integration routes backed by mcp-router.js"
    - path: "app/src/components/settings/tabs/AccountsTab.tsx"
      provides: "OAuth popup flow with polling and companyId wiring"
    - path: "platform/content-engine/automations/registry.js"
      provides: "getComposioToken helper + credential injection in dispatcher"
  key_links:
    - from: "AccountsTab.tsx load()"
      to: "/api/integrations?companyId=X"
      via: "getActiveAgentContext().companyId from agentContext.ts"
    - from: "/api/integrations (backend)"
      to: "mcp-router.js getConnectors()"
      via: "ES module import at top of backend-server.js"
    - from: "executeAutomation in registry.js"
      to: "Composio connectedAccounts API"
      via: "getComposioToken() before webhook payload dispatch"
---

<objective>
Wire the three Composio integration endpoints in the backend, update AccountsTab to use companyId and open an OAuth popup, and add credential injection to the automation registry dispatcher.

Purpose: Accounts tab is currently wired to stub endpoints that return 501. This unblocks real OAuth-based connector connections per company context, and ensures automation triggers can pass access tokens to n8n.
Output: Working OAuth connect/disconnect flow in Settings > Accounts, plus live integration routes backed by mcp-router.js, plus registry credential injection.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

Key facts gathered during planning:
- `mcp-router.js` exports: `getConnectors(userId)`, `initiateConnection(userId, connectorId)`, `disconnectConnector(userId, connectorId)` — all ES module named exports. `userId` param = entityId = companyId in Marqq.
- backend-server.js is already an ES module (`import` at top). The mcp-router.js import is NOT present yet — must be added.
- Existing stub routes are at lines ~5216-5390 (GET /api/integrations returns static JSON; POST routes return 501).
- `agentContext.ts` exports `getActiveAgentContext()` which reads localStorage key `marqq_active_company_context` and returns `{ companyId }`.
- AccountsTab.tsx currently passes `userId: user?.id` in all three fetch calls; `load()` queries `?userId=`.
- Registry `executeAutomation` dispatches n8n webhooks via `fetch`; the webhook body already includes `company_id` and `params`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace stub integration routes in backend-server.js with mcp-router.js calls</name>
  <files>platform/content-engine/backend-server.js</files>
  <action>
    1. At the top of backend-server.js, after the existing imports block (around line 55), add the mcp-router import:
       `import { getConnectors, initiateConnection, disconnectConnector } from './mcp-router.js'`

    2. Find the GET /api/integrations stub handler (currently at line ~5218, returns static connector JSON). Replace the entire handler body with:
       ```js
       app.get("/api/integrations", async (req, res) => {
         const companyId = req.query.companyId || req.query.userId || 'default'
         try {
           const connectors = await getConnectors(companyId)
           res.json({ connectors })
         } catch (err) {
           console.error('[integrations] getConnectors error:', err.message)
           res.status(500).json({ error: err.message })
         }
       })
       ```
       Delete all the static connector array content that was previously between the opening brace and `res.json({ connectors, debug: ... })`.

    3. Replace the POST /api/integrations/connect stub (currently returns 501) with:
       ```js
       app.post("/api/integrations/connect", async (req, res) => {
         const { companyId, connectorId } = req.body
         if (!companyId || !connectorId) return res.status(400).json({ error: 'companyId and connectorId required' })
         const result = await initiateConnection(companyId, connectorId)
         if (result.error) return res.status(400).json({ error: result.error })
         res.json(result)
       })
       ```

    4. Replace the POST /api/integrations/disconnect stub (currently returns 501) with:
       ```js
       app.post("/api/integrations/disconnect", async (req, res) => {
         const { companyId, connectorId } = req.body
         if (!companyId || !connectorId) return res.status(400).json({ error: 'companyId and connectorId required' })
         const result = await disconnectConnector(companyId, connectorId)
         if (result.error) return res.status(400).json({ error: result.error })
         res.json(result)
       })
       ```

    Note: mcp-router.js already returns stub data when COMPOSIO_API_KEY is unset — these routes safely pass through with no extra guard needed.
  </action>
  <verify>curl -s "http://localhost:3008/api/integrations?companyId=test" | grep -q '"connectors"' && echo OK</verify>
  <done>GET returns { connectors: [...] } (at least the static list from mcp-router stub mode), POST /connect returns { redirectUrl } or { error } (not 501), POST /disconnect returns { ok: true } or { error } (not 501)</done>
</task>

<task type="auto">
  <name>Task 2: Wire AccountsTab.tsx to companyId + OAuth popup with poll-on-close</name>
  <files>app/src/components/settings/tabs/AccountsTab.tsx</files>
  <action>
    1. Add import at top (after existing imports):
       `import { getActiveAgentContext } from '@/lib/agentContext'`

    2. In the `load` callback:
       - Replace `if (!user?.id) return` with a companyId guard:
         ```ts
         const { companyId } = getActiveAgentContext()
         if (!companyId) return
         ```
       - Change the fetch URL from `/api/integrations?userId=${encodeURIComponent(user.id)}` to `/api/integrations?companyId=${encodeURIComponent(companyId)}`
       - Remove `user?.id` from the `useCallback` dependency array — replace with no dependency (or keep empty so it re-reads localStorage fresh each call). The callback has no captured variables from render scope now, so `useCallback` deps array becomes `[]`.

    3. In the `connect` function, replace the entire body with:
       ```ts
       const connect = async (id: string) => {
         const { companyId } = getActiveAgentContext()
         if (!companyId) { toast.error('Select a company first'); return }
         setActionId(id)
         try {
           const res = await fetch('/api/integrations/connect', {
             method: 'POST', headers: { 'content-type': 'application/json' },
             body: JSON.stringify({ companyId, connectorId: id }),
           })
           const json = await res.json().catch(() => ({}))
           if (!res.ok) throw new Error(json?.error || 'connect failed')
           if (json.redirectUrl) {
             const popup = window.open(json.redirectUrl, 'composio_oauth', 'width=600,height=700,left=200,top=100')
             toast.info('Complete OAuth in the popup window')
             const poll = setInterval(() => {
               if (!popup || popup.closed) {
                 clearInterval(poll)
                 setActionId(null)
                 toast.info('Connection cancelled or completed — refreshing status')
                 load()
               }
             }, 1500)
           } else {
             await load()
             toast.success('Connected')
             setActionId(null)
           }
         } catch (err: any) {
           toast.error(err?.message || 'Connect failed')
           setActionId(null)
         }
       }
       ```
       Note: `setActionId(null)` is intentionally NOT called in the popup path until the popup closes (keeps "Connecting…" state on the button while popup is open).

    4. In the `disconnect` function, replace `{ userId: user?.id, connectorId: id }` with:
       ```ts
       const { companyId } = getActiveAgentContext()
       if (!companyId) { toast.error('Select a company first'); setActionId(null); return }
       ```
       and change the body to `JSON.stringify({ companyId, connectorId: id })`.

    5. The Connect button already shows `disabled={actionId === c.id}` — add a loading label: when `actionId === c.id` show "Connecting…" else "Connect".

    6. Remove the `user` dependency from `useAuth` if it's no longer needed (check — `useAuth` is still used for the user object guard in load if you keep it, but since load now uses companyId you can remove the user guard entirely). Keep `const { user } = useAuth()` only if referenced elsewhere in the component — if not, remove the destructure to avoid lint warnings.
       Actually: `user` is no longer referenced after this change. Remove `const { user } = useAuth()` and the `useAuth` import if it has no other uses in this file.
  </action>
  <verify>npm run typecheck 2>&1 | grep -i "AccountsTab" | head -5; echo "typecheck done"</verify>
  <done>No TypeScript errors in AccountsTab.tsx; connect button shows "Connecting…" while actionId matches; load() uses companyId query param; disconnect sends companyId</done>
</task>

<task type="auto">
  <name>Task 3: Add requires_credential + getComposioToken + credential injection in registry.js</name>
  <files>platform/content-engine/automations/registry.js</files>
  <action>
    1. Add `requires_credential` field to each REGISTRY entry:
       - `fetch_meta_ads`: add `requires_credential: 'facebookads'`
       - `competitor_ad_library`: add `requires_credential: null`
       - `creative_fatigue_check`: add `requires_credential: null`
       - `google_ads_fetch`: add `requires_credential: 'googleads'`
       - `apollo_lead_enrich`: add `requires_credential: null`

    2. Add this async helper function before `executeAutomation` (keep it module-private, no export):
       ```js
       async function getComposioToken(companyId, appName) {
         const apiKey = process.env.COMPOSIO_API_KEY
         if (!apiKey || !appName) return null
         try {
           const res = await fetch(
             `https://backend.composio.dev/api/v1/connectedAccounts?entityId=${encodeURIComponent(companyId)}&appName=${appName}`,
             { headers: { 'x-api-key': apiKey } }
           )
           const data = await res.json()
           const acct = data.items?.find(a => a.status === 'ACTIVE')
           return acct?.connectionConfig?.access_token || acct?.accessToken || null
         } catch { return null }
       }
       ```

    3. In `executeAutomation(trigger, companyId, runId)`, before the n8n/direct_api fetch call, add credential resolution:
       After `const url = process.env[entry.endpoint]` (and the early-return for missing url), add:
       ```js
       // Resolve OAuth access token from Composio if this automation requires one
       let access_token = null
       if (entry.requires_credential) {
         access_token = await getComposioToken(companyId, entry.requires_credential)
         if (!access_token) {
           console.warn(`[automations] No active Composio token for ${entry.requires_credential} (company: ${companyId}) — proceeding without access_token`)
         }
       }
       ```
       Then in the fetch body JSON, add `access_token` to the payload:
       ```js
       body: JSON.stringify({
         automation_id: entry.id,
         params: trigger.params || {},
         company_id: companyId,
         run_id: runId,
         ...(access_token ? { access_token } : {}),
       }),
       ```

    Note: `fetch` is used here — registry.js already uses dynamic `import("node-fetch")` for fetching. The `getComposioToken` helper should use the same pattern. Update it to use the dynamic import fallback:
    ```js
    async function getComposioToken(companyId, appName) {
      const apiKey = process.env.COMPOSIO_API_KEY
      if (!apiKey || !appName) return null
      try {
        let fetchFn
        try { fetchFn = fetch } catch { fetchFn = null }
        if (!fetchFn) {
          const mod = await import('node-fetch').catch(() => null)
          fetchFn = mod?.default || null
        }
        if (!fetchFn) return null
        const res = await fetchFn(
          `https://backend.composio.dev/api/v1/connectedAccounts?entityId=${encodeURIComponent(companyId)}&appName=${appName}`,
          { headers: { 'x-api-key': apiKey } }
        )
        const data = await res.json()
        const acct = data.items?.find(a => a.status === 'ACTIVE')
        return acct?.connectionConfig?.access_token || acct?.accessToken || null
      } catch { return null }
    }
    ```
  </action>
  <verify>node --input-type=module --eval "import { REGISTRY } from './platform/content-engine/automations/registry.js'; const hasCred = REGISTRY.every(r => 'requires_credential' in r); console.log('requires_credential on all:', hasCred)" 2>&1 | grep "requires_credential on all: true"</verify>
  <done>All 5 REGISTRY entries have requires_credential field; getComposioToken helper exists; executeAutomation injects access_token into webhook payload when token is resolved</done>
</task>

</tasks>

<verification>
1. Backend routes respond correctly: `curl http://localhost:3008/api/integrations?companyId=test` returns `{ connectors: [...] }` with at least 20 connectors, not static debug data.
2. Frontend compiles: `npm run typecheck` from `app/` passes with no errors in AccountsTab.tsx.
3. Registry integrity: `node --input-type=module --eval "import { REGISTRY } from './platform/content-engine/automations/registry.js'; console.log(REGISTRY.map(r=>r.id+':'+r.requires_credential).join('\n'))"` shows all 5 entries with correct credential values.
</verification>

<success_criteria>
- Accounts tab loads connectors from Composio (or stub list when COMPOSIO_API_KEY absent) using companyId, not userId.
- Clicking Connect opens an OAuth popup window; button shows "Connecting…" until popup closes; on close, connectors reload.
- Clicking Disconnect calls /api/integrations/disconnect with companyId and removes the connection.
- Automation registry entries all have requires_credential field; dispatcher fetches and injects access_token for Meta Ads and Google Ads automations.
</success_criteria>

<output>
After completion, create `.planning/quick/2-wire-composio-connector-endpoints-and-oa/2-SUMMARY.md` with what was done, files changed, and any issues encountered.
</output>
