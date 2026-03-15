---
phase: quick-3
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/agentContext.ts
  - app/src/components/agent/AgentModuleShell.tsx
  - app/src/components/settings/tabs/AccountsTab.tsx
  - platform/content-engine/backend-server.js
autonomous: true
requirements:
  - WORKSPACE-CONSOLIDATION-01
must_haves:
  truths:
    - "Agent runs receive company_id even when no ACTIVE_COMPANY_KEY is set in localStorage — workspace.id is the fallback"
    - "AgentModuleShell shows a read-only workspace badge instead of CompanySelector dropdown"
    - "AccountsTab uses activeWorkspace.id for all API calls instead of getActiveAgentContext().companyId"
    - "Backend run handler falls back to x-workspace-id header when body.company_id is absent"
  artifacts:
    - path: "app/src/lib/agentContext.ts"
      provides: "companyId falls back to workspaceId; buildAgentRunPayload triple-fallback"
    - path: "app/src/components/agent/AgentModuleShell.tsx"
      provides: "workspace badge + no-workspace guard; CompanySelector removed"
    - path: "app/src/components/settings/tabs/AccountsTab.tsx"
      provides: "useWorkspace hook; all API calls scoped to activeWorkspace.id"
    - path: "platform/content-engine/backend-server.js"
      provides: "companyId = body.company_id || x-workspace-id header || null"
  key_links:
    - from: "AgentModuleShell.tsx"
      to: "useAgentRun.run()"
      via: "activeWorkspace.id passed as companyId arg"
    - from: "agentContext.ts buildAgentRunPayload"
      to: "backend-server.js /api/agents/:name/run"
      via: "company_id field in request body + x-workspace-id header"
---

<objective>
Make workspace.id the single source of truth for company_id across the agent stack.

Purpose: Right now agents can silently receive no company_id when a user has a workspace but no separate ACTIVE_COMPANY_KEY entry. This consolidation ensures workspace.id flows through every layer — context lib, UI shell, settings tab, and backend handler — so agents always have a company scope.
Output: 4 targeted file edits, no DB changes, CompanySelector component file untouched.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Key interfaces for executor -->
<interfaces>
From app/src/contexts/WorkspaceContext.tsx:
```typescript
export interface Workspace {
  id: string;
  name: string;
  website_url: string | null;
  role: 'owner' | 'member';
  created_at?: string;
}
export function useWorkspace(): WorkspaceContextType
// WorkspaceContextType.activeWorkspace: Workspace | null
```

From app/src/lib/agentContext.ts (current state):
```typescript
export type AgentMarketingContext = {
  workspaceId: string | null
  workspaceName: string | null
  websiteUrl: string | null
  companyId: string | null       // currently null unless ACTIVE_COMPANY_KEY set
  companyName: string | null
}
export function getActiveAgentContext(): AgentMarketingContext
export function buildAgentRunPayload<T>(payload: T): T & { company_id?: string }
```

From platform/content-engine/backend-server.js (lines 4315-4346):
```javascript
app.post("/api/agents/:name/run", async (req, res) => {
  const { company_id, ... } = req.body;
  const workspaceId = typeof req.headers["x-workspace-id"] === "string"
    ? req.headers["x-workspace-id"].trim() : null;
  // ...
  const companyId = (typeof company_id === "string" && company_id.trim())
    ? company_id.trim()
    : null;   // <-- workspaceId NOT used as fallback yet
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: agentContext.ts — workspace fallback in getActiveAgentContext + buildAgentRunPayload</name>
  <files>app/src/lib/agentContext.ts</files>
  <action>
Two targeted changes only — do not alter any other function:

1. In `getActiveAgentContext()`, change the `companyId` and `companyName` and `websiteUrl` lines to fall back to workspace values:

```typescript
companyId: (typeof company?.id === 'string' && company.id.trim()
  ? company.id
  : typeof workspace?.id === 'string' && workspace.id.trim()
    ? workspace.id
    : null),
companyName: (typeof company?.companyName === 'string' && company.companyName.trim()
  ? company.companyName
  : typeof workspace?.name === 'string' && workspace.name.trim()
    ? workspace.name
    : null),
websiteUrl:
  typeof company?.websiteUrl === 'string' && company.websiteUrl.trim()
    ? company.websiteUrl
    : typeof workspace?.website_url === 'string' && workspace.website_url.trim()
      ? workspace.website_url
      : null,
```

2. In `buildAgentRunPayload()`, extend the company_id resolution to triple-fallback:

```typescript
company_id:
  typeof payload.company_id === 'string' && payload.company_id.trim()
    ? payload.company_id
    : context.companyId || context.workspaceId || undefined,
```

Keep `ACTIVE_COMPANY_KEY` and `ACTIVE_WORKSPACE_KEY` constants unchanged. Keep all other exported functions unchanged.
  </action>
  <verify>npx tsc --noEmit -p /Users/yogs87/Documents/New\ project/marqq/app/tsconfig.app.json 2>&1 | grep "agentContext" || echo "no type errors in agentContext"</verify>
  <done>getActiveAgentContext().companyId returns workspaceId when ACTIVE_COMPANY_KEY is absent; buildAgentRunPayload falls back through companyId then workspaceId</done>
</task>

<task type="auto">
  <name>Task 2: AgentModuleShell.tsx — replace CompanySelector with workspace badge</name>
  <files>app/src/components/agent/AgentModuleShell.tsx</files>
  <action>
Make these changes to `AgentModuleShell.tsx`:

1. Add import at top (after existing imports):
```typescript
import { useWorkspace } from '@/contexts/WorkspaceContext'
```

2. Remove the `CompanySelector` import line (line 9). Keep `OfferSelector` import.

3. Remove `getActiveAgentContext` import from `@/lib/agentContext`.

4. In `AgentModuleShell` function body:
   - Remove: `const [companyId, setCompanyId] = useState(() => getActiveAgentContext().companyId || '')`
   - Add: `const { activeWorkspace } = useWorkspace()`
   - Derive: `const companyId = activeWorkspace?.id ?? ''`
   - Remove: `const [autoRunAgentName, setAutoRunAgentName]` — keep it, it's still needed for autorun logic.
   - Keep the `selectedOffer` state and `autoRunAgentName` state.

5. Replace the `<CompanySelector ... />` block in the JSX with:
```tsx
{activeWorkspace ? (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <span className="font-medium text-foreground">Running for:</span>
    <Badge variant="outline">{activeWorkspace.name}</Badge>
  </div>
) : (
  <p className="text-sm text-amber-500">
    Select or create a workspace in Settings to run agents.
  </p>
)}
```

6. Update `OfferSelector` — the `onChange` currently calls `setCompanyId(id); setSelectedOffer(null)`. Replace that with just `setSelectedOffer(null)` on workspace change (the offer reset should happen via a useEffect watching `activeWorkspace?.id`):
   - Keep `<OfferSelector companyId={companyId} value={selectedOffer?.name ?? ''} onChange={(_name, offer) => setSelectedOffer(offer)} />`
   - Add a useEffect to reset selectedOffer when workspace changes:
     ```typescript
     useEffect(() => { setSelectedOffer(null) }, [activeWorkspace?.id])
     ```

The `CompanySelector` component file (`app/src/components/agent/CompanySelector.tsx`) must NOT be modified — it is used elsewhere.
  </action>
  <verify>npx tsc --noEmit -p /Users/yogs87/Documents/New\ project/marqq/app/tsconfig.app.json 2>&1 | grep "AgentModuleShell" || echo "no type errors in AgentModuleShell"</verify>
  <done>AgentModuleShell renders workspace badge (not dropdown), shows warning when no workspace, passes activeWorkspace.id to all agent runs</done>
</task>

<task type="auto">
  <name>Task 3: AccountsTab.tsx — switch to useWorkspace for all API calls</name>
  <files>app/src/components/settings/tabs/AccountsTab.tsx</files>
  <action>
Make these changes to `AccountsTab.tsx`:

1. Add import:
```typescript
import { useWorkspace } from '@/contexts/WorkspaceContext';
```

2. Remove the `getActiveAgentContext` import line.

3. Inside `AccountsTab()` function body, add at the top:
```typescript
const { activeWorkspace } = useWorkspace();
```

4. Update `load` callback — replace `const { companyId } = getActiveAgentContext()` with:
```typescript
const companyId = activeWorkspace?.id;
if (!companyId) return;
```
Also add `activeWorkspace` to the `useCallback` dependency array: `[activeWorkspace]`

5. Update `connect` function — replace `const { companyId } = getActiveAgentContext()` with:
```typescript
const companyId = activeWorkspace?.id;
if (!companyId) { toast.error('Create or select a workspace first'); return; }
```

6. Update `disconnect` function — replace `const { companyId } = getActiveAgentContext()` with:
```typescript
const companyId = activeWorkspace?.id;
if (!companyId) { toast.error('Create or select a workspace first'); setActionId(null); return; }
```

7. In the JSX return, add a guard before the connectors list. After the description paragraph and before the `{loading ? ...}` block, insert:
```tsx
{!activeWorkspace && (
  <p className="text-sm text-amber-500">
    Create a workspace to connect integrations.
  </p>
)}
```

Keep all other logic (groupedConnectors, CONNECTOR_META, IntegrationLogo, etc.) unchanged.
  </action>
  <verify>npx tsc --noEmit -p /Users/yogs87/Documents/New\ project/marqq/app/tsconfig.app.json 2>&1 | grep "AccountsTab" || echo "no type errors in AccountsTab"</verify>
  <done>AccountsTab uses activeWorkspace.id for all three API calls; shows amber warning when no workspace; getActiveAgentContext no longer imported</done>
</task>

<task type="auto">
  <name>Task 4: backend-server.js — add x-workspace-id header fallback to companyId</name>
  <files>platform/content-engine/backend-server.js</files>
  <action>
Find the `companyId` assignment in the `POST /api/agents/:name/run` handler (around line 4344). The current code is:

```javascript
const companyId = (typeof company_id === "string" && company_id.trim())
  ? company_id.trim()
  : null;
```

Replace it with:

```javascript
const companyId = (typeof company_id === "string" && company_id.trim())
  ? company_id.trim()
  : (typeof workspaceId === "string" && workspaceId.trim())
    ? workspaceId.trim()
    : null;
```

The `workspaceId` variable is already extracted from `req.headers["x-workspace-id"]` a few lines above (lines 4328-4330). This change simply makes the existing header value act as a fallback for `companyId` when the request body omits `company_id`.

No other changes to backend-server.js.
  </action>
  <verify>node --check /Users/yogs87/Documents/New\ project/marqq/platform/content-engine/backend-server.js && echo "syntax ok"</verify>
  <done>When body.company_id is absent, companyId resolves to x-workspace-id header value; existing behavior unchanged when body.company_id is present</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. TypeScript build passes: `cd /Users/yogs87/Documents/New\ project/marqq/app && npx tsc --noEmit`
2. Backend syntax clean: `node --check platform/content-engine/backend-server.js`
3. CompanySelector component file is unmodified (verify with `git diff app/src/components/agent/CompanySelector.tsx` — should show no changes)
4. AgentModuleShell no longer imports CompanySelector: `grep -n "CompanySelector" app/src/components/agent/AgentModuleShell.tsx` should return nothing
5. AccountsTab no longer imports getActiveAgentContext: `grep -n "getActiveAgentContext" app/src/components/settings/tabs/AccountsTab.tsx` should return nothing
</verification>

<success_criteria>
- workspace.id is the fallback company_id at every layer (context lib, UI shell, settings tab, backend)
- No CompanySelector dropdown in AgentModuleShell — workspace badge shown instead
- AccountsTab gracefully guards when no workspace exists
- Backend silently resolves company_id from header when body omits it
- TypeScript builds without new errors
- CompanySelector.tsx file unchanged (used in company-intelligence pages)
</success_criteria>

<output>
After completion, create `.planning/quick/3-consolidate-workspace-company-make-works/3-SUMMARY.md` with what was changed, files modified, and any notable decisions.
</output>
