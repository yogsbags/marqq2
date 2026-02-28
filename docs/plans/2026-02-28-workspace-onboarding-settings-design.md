# Workspace, Onboarding Checklist & Settings Redesign

**Date**: 2026-02-28
**Status**: Approved
**Scope**: Multi-workspace support, dashboard onboarding checklist, tabbed settings with Members + Accounts

---

## Context

Torqq AI serves two audiences:
- **Marketing agencies** — one account, multiple client workspaces (data must be isolated per client)
- **In-house marketing teams** — one workspace, multiple collaborators

Both use cases require real workspace data isolation. Inspired by Prosp's UX patterns: workspace switcher in top nav, "Let's get started" checklist on dashboard, Settings with tabbed sidebar.

---

## Architecture Decision

**Option A — Workspace-scoped DB** (selected over label-only and RLS approaches).

- `workspaces` + `workspace_members` + `workspace_invites` tables
- `workspace_id` FK added to `agent_notifications`, `agent_tasks`, `agent_memory`
- `WorkspaceContext` React provider mirrors `AuthContext` pattern
- Active workspace persisted in `localStorage` as `torqq_workspace_id`

---

## Section 1 — Database Schema

**Migration file**: `database/migrations/workspace.sql`

```sql
CREATE TABLE workspaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  website_url  TEXT,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by   UUID REFERENCES auth.users(id),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE workspace_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  invited_by   UUID REFERENCES auth.users(id),
  token        TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add workspace_id to existing tables (nullable for backward compat)
ALTER TABLE agent_notifications ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_tasks         ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_memory        ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX ON workspace_members(user_id);
CREATE INDEX ON agent_notifications(workspace_id);
CREATE INDEX ON agent_tasks(workspace_id);
```

**Auto-provisioning**: On signup, create a default workspace (`"My workspace"`) and insert owner into `workspace_members`. This happens in the auth flow (Supabase trigger or backend route called after signup).

---

## Section 2 — WorkspaceContext

**File**: `app/src/contexts/WorkspaceContext.tsx`

```typescript
interface Workspace {
  id: string;
  name: string;
  website_url: string | null;
  role: 'owner' | 'member';
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWebsiteUrl: (url: string) => Promise<void>;
  isLoading: boolean;
}
```

- Fetches workspaces on mount via `GET /api/workspaces`
- Active workspace from `localStorage('torqq_workspace_id')`, falls back to first
- `createWorkspace()` → `POST /api/workspaces` → switches to new workspace
- `updateWebsiteUrl()` → `PATCH /api/workspaces/:id` → updates `website_url`
- Wrapped in `App.tsx` inside `AuthProvider`, wrapping `AppContent`

**Backend routes** (added to `backend-server.js`):
- `GET /api/workspaces` — list user's workspaces with role
- `POST /api/workspaces` — create workspace + add owner to members
- `PATCH /api/workspaces/:id` — update name or website_url
- `GET /api/workspaces/:id/members` — list members
- `POST /api/workspaces/:id/invite` — create invite record + (stub) send email
- `DELETE /api/workspaces/:id/members/:userId` — remove member (owner only)

All existing `/api/agents/*` routes updated to filter Supabase queries by `workspace_id`.

---

## Section 3 — Workspace Switcher (Top Nav)

**File modified**: `app/src/components/dashboard/DashboardHeader.tsx`

Layout change: workspace switcher added to **left side** of header. Header now always visible (including home/chat view — `isHomeView` exception removed from `MainLayout`).

```
[My workspace ▾]                    [🔔] [theme] [user ▾]
```

**Dropdown** (shadcn `DropdownMenu`):
- Section header "My workspaces"
- List of workspaces: active gets orange dot, role shown in muted text
- Divider
- "+ Create a workspace" → opens `CreateWorkspaceModal`

**CreateWorkspaceModal**: single `Input` for name + `Create` button. Website URL collected in checklist step 1 instead.

**Truncation**: workspace name capped at 20 chars with `…`.

---

## Section 4 — "Let's get started" Dashboard Checklist

**File**: `app/src/components/dashboard/GettingStartedChecklist.tsx`
**Location**: Rendered above chat input in `ChatHome.tsx`

**3 steps:**
1. **Enter your website URL** — `Input` + Save button → calls `updateWebsiteUrl()`. Complete when `workspace.website_url` is set.
2. **Connect an account** — "+ Connect" button → navigates to Settings → Accounts tab. Complete when any integration `connected: true`.
3. **Run your first agent** — "→ Run" button → navigates to Chat with a pre-filled prompt. Complete when `agent_notifications` has ≥1 row for this workspace.

**State:**
- Progress pill: `1/3`, `2/3`, `3/3`
- All complete → ✅ "You're all set!" → auto-collapses after 3s
- Manually collapsible via `▾` chevron
- Collapsed state: `localStorage('torqq_checklist_dismissed')`
- Visible to all workspace members (only owner can edit website URL)

---

## Section 5 — Settings Tabbed Sidebar Redesign

**File modified**: `app/src/components/settings/SettingsPanel.tsx`
**New files**: `app/src/components/settings/tabs/GeneralTab.tsx`, `AccountsTab.tsx`, `MembersTab.tsx`, `BillingTab.tsx`

**Layout**: Two-column — 220px left sidebar with tab list, right panel renders active tab.

### General Tab
Consolidates current SettingsPanel content: Profile, Appearance, Notifications, Security, AI Team Context (7-field form), Data Management.

### Accounts Tab
Existing integrations list promoted to first-class tab. Each connector shows: logo icon, name, description, status badge (`Connected` / `Not connected`), Connect/Disconnect button. Active connection count shown as dot indicator on tab.

### Members Tab
- **Invite section**: email `Input` + `+ Add` button → `POST /api/workspaces/:id/invite`
- **Member list**: avatar, name, email, role badge (`Owner` / `Member`), kebab `⋮` menu with Remove option (disabled for owner row)
- Fetches from `GET /api/workspaces/:id/members`

### Billing Tab
Placeholder showing current plan name + "Upgrade" CTA. Wires to billing system in next milestone.

---

## File Change Summary

### New files
- `database/migrations/workspace.sql`
- `app/src/contexts/WorkspaceContext.tsx`
- `app/src/components/dashboard/GettingStartedChecklist.tsx`
- `app/src/components/layout/WorkspaceSwitcher.tsx`
- `app/src/components/workspace/CreateWorkspaceModal.tsx`
- `app/src/components/settings/tabs/GeneralTab.tsx`
- `app/src/components/settings/tabs/AccountsTab.tsx`
- `app/src/components/settings/tabs/MembersTab.tsx`
- `app/src/components/settings/tabs/BillingTab.tsx`

### Modified files
- `app/src/App.tsx` — wrap with `WorkspaceProvider`
- `app/src/components/dashboard/DashboardHeader.tsx` — add workspace switcher
- `app/src/components/layout/MainLayout.tsx` — always show header
- `app/src/components/chat/ChatHome.tsx` — add `GettingStartedChecklist`
- `app/src/components/settings/SettingsPanel.tsx` — replace with tabbed layout
- `platform/content-engine/backend-server.js` — add workspace routes, update agent routes

---

## Out of Scope
- Email delivery for invites (stub only — log to console)
- Invite acceptance flow (deep link from email)
- RLS policies (deferred to scaling phase)
- Billing implementation (separate milestone)
