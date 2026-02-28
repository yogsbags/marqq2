# Workspace, Onboarding Checklist & Settings Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-workspace support with a top-nav switcher, a "Let's get started" dashboard checklist, and a tabbed Settings panel with General / Accounts / Members / Billing tabs.

**Architecture:** Option A — workspace-scoped DB. `workspaces` + `workspace_members` + `workspace_invites` tables. `workspace_id` FK added to existing agent tables. `WorkspaceContext` React provider (mirrors `AuthContext` pattern) wraps the whole app and exposes `activeWorkspace` everywhere.

**Tech Stack:** React 18 + TypeScript + Vite, shadcn/ui (DropdownMenu, Dialog, Tabs, Input, Button, Badge), Supabase JS client, Node.js/Express backend (`platform/content-engine/backend-server.js`)

**Design doc:** `docs/plans/2026-02-28-workspace-onboarding-settings-design.md`

---

## Task 1: DB Migration File

**Files:**
- Create: `database/migrations/workspace.sql`

**Step 1: Create the migration file**

```sql
-- database/migrations/workspace.sql
-- Run in Supabase Dashboard → SQL Editor

-- 1. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  website_url  TEXT,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Workspace members
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by   UUID REFERENCES auth.users(id),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 3. Workspace invites (pending email invites)
CREATE TABLE IF NOT EXISTS workspace_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  invited_by   UUID REFERENCES auth.users(id),
  token        TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Add workspace_id to existing agent tables (nullable = backward compat)
ALTER TABLE agent_notifications ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_tasks         ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_memory        ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_workspace ON agent_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace ON agent_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace ON agent_memory(workspace_id);
```

**Step 2: Run in Supabase**

Open Supabase Dashboard → SQL Editor → paste and run. Verify 3 new tables appear in Table Editor.

**Step 3: Commit**

```bash
git add database/migrations/workspace.sql
git commit -m "feat: add workspace DB migration (workspaces, members, invites)"
```

---

## Task 2: Backend — Workspace CRUD Routes

**Files:**
- Modify: `platform/content-engine/backend-server.js`

The backend uses `node:fs/promises`, `express`, and the `@supabase/supabase-js` client. Check top of file for how Supabase is instantiated — it uses `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)`.

**Step 1: Add workspace routes after existing routes**

Find the last route block in `backend-server.js` (before `app.listen`) and add:

```javascript
// ─── Workspace routes ─────────────────────────────────────────────────────

// GET /api/workspaces?userId=xxx — list workspaces for a user
app.get('/api/workspaces', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspace:workspaces(id, name, website_url, created_at)')
      .eq('user_id', userId);
    if (error) throw error;
    const workspaces = (data || []).map(row => ({
      ...row.workspace,
      role: row.role,
    }));
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces — create workspace + add owner as member
app.post('/api/workspaces', async (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });
  try {
    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name, owner_id: userId })
      .select()
      .single();
    if (wsErr) throw wsErr;
    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: ws.id, user_id: userId, role: 'owner' });
    if (memErr) throw memErr;
    res.json({ workspace: { ...ws, role: 'owner' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workspaces/:id — update name or website_url
app.patch('/api/workspaces/:id', async (req, res) => {
  const { id } = req.params;
  const { name, website_url, userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (website_url !== undefined) updates.website_url = website_url;
    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ workspace: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspaces/:id/members — list members
app.get('/api/workspaces/:id/members', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, joined_at, user:user_id(id, email, raw_user_meta_data)')
      .eq('workspace_id', id);
    if (error) throw error;
    const members = (data || []).map(row => ({
      id: row.user?.id,
      email: row.user?.email,
      name: row.user?.raw_user_meta_data?.full_name || row.user?.email?.split('@')[0] || 'Unknown',
      role: row.role,
      joined_at: row.joined_at,
    }));
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/:id/invite — create pending invite
app.post('/api/workspaces/:id/invite', async (req, res) => {
  const { id } = req.params;
  const { email, invitedBy } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { data, error } = await supabase
      .from('workspace_invites')
      .insert({ workspace_id: id, email, invited_by: invitedBy })
      .select()
      .single();
    if (error) throw error;
    // TODO: send invite email with data.token
    console.log(`[invite] ${email} invited to workspace ${id} — token: ${data.token}`);
    res.json({ invite: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workspaces/:id/members/:userId — remove member
app.delete('/api/workspaces/:id/members/:userId', async (req, res) => {
  const { id, userId } = req.params;
  try {
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .neq('role', 'owner'); // cannot remove owner
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Verify backend starts without errors**

```bash
cd /Users/yogs87/Downloads/sanity/projects/martech
npm run dev:backend
```

Expected: server starts on port 3008, no syntax errors.

**Step 3: Commit**

```bash
git add platform/content-engine/backend-server.js
git commit -m "feat: add workspace CRUD + members API routes"
```

---

## Task 3: Backend — Auto-provision Default Workspace

**Files:**
- Modify: `platform/content-engine/backend-server.js`

When a user first loads the app, the frontend calls `GET /api/workspaces?userId=xxx`. If empty, it auto-provisions a default workspace. Add that logic to the GET route (idempotent — safe to call multiple times).

**Step 1: Update GET /api/workspaces to auto-provision**

Replace the existing `GET /api/workspaces` handler body with:

```javascript
app.get('/api/workspaces', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    let { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspace:workspaces(id, name, website_url, created_at)')
      .eq('user_id', userId);
    if (error) throw error;

    // Auto-provision default workspace for new users
    if (!data || data.length === 0) {
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .insert({ name: 'My workspace', owner_id: userId })
        .select()
        .single();
      if (wsErr) throw wsErr;
      const { error: memErr } = await supabase
        .from('workspace_members')
        .insert({ workspace_id: ws.id, user_id: userId, role: 'owner' });
      if (memErr) throw memErr;
      return res.json({ workspaces: [{ ...ws, role: 'owner' }] });
    }

    const workspaces = data.map(row => ({ ...row.workspace, role: row.role }));
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Restart backend and verify**

```bash
npm run dev:backend
```

**Step 3: Commit**

```bash
git add platform/content-engine/backend-server.js
git commit -m "feat: auto-provision default workspace for new users"
```

---

## Task 4: WorkspaceContext Provider

**Files:**
- Create: `app/src/contexts/WorkspaceContext.tsx`

**Step 1: Create the context**

```typescript
// app/src/contexts/WorkspaceContext.tsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

export interface Workspace {
  id: string;
  name: string;
  website_url: string | null;
  role: 'owner' | 'member';
  created_at?: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWebsiteUrl: (url: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'torqq_workspace_id';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/workspaces?userId=${encodeURIComponent(user.id)}`);
      const json = await res.json();
      const list: Workspace[] = json.workspaces || [];
      setWorkspaces(list);

      // Restore last active or fall back to first
      const stored = localStorage.getItem(STORAGE_KEY);
      const found = stored ? list.find(w => w.id === stored) : null;
      setActiveWorkspace(found ?? list[0] ?? null);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  const switchWorkspace = (id: string) => {
    const ws = workspaces.find(w => w.id === id);
    if (!ws) return;
    localStorage.setItem(STORAGE_KEY, id);
    setActiveWorkspace(ws);
  };

  const createWorkspace = async (name: string): Promise<Workspace> => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id, name }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create workspace');
    const { workspace } = await res.json();
    setWorkspaces(prev => [...prev, workspace]);
    switchWorkspace(workspace.id);
    return workspace;
  };

  const updateWebsiteUrl = async (url: string) => {
    if (!activeWorkspace || !user?.id) return;
    const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, website_url: url }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
    const { workspace } = await res.json();
    setWorkspaces(prev => prev.map(w => w.id === workspace.id ? { ...w, website_url: workspace.website_url } : w));
    setActiveWorkspace(prev => prev?.id === workspace.id ? { ...prev, website_url: workspace.website_url } : prev);
  };

  return (
    <WorkspaceContext.Provider value={{
      workspaces, activeWorkspace, switchWorkspace,
      createWorkspace, updateWebsiteUrl,
      refreshWorkspaces: fetchWorkspaces, isLoading,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
```

**Step 2: Wrap App.tsx**

In `app/src/App.tsx`, add import and wrap `AppContent`:

```typescript
// Add import at top
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';

// In App() function, wrap inside AuthProvider:
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <AppContent />
          <Toaster richColors position="top-right" />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

**Step 3: Add Vite proxy entry for /api/workspaces**

Open `vite.config.ts`. In the `proxy` object, add:

```typescript
'/api/workspaces': { target: 'http://localhost:3008', changeOrigin: true },
```

(Place before the catch-all `/api` entry if one exists.)

**Step 4: Typecheck**

```bash
cd /Users/yogs87/Downloads/sanity/projects/martech && npm run typecheck 2>&1 | grep -v "node_modules" | grep -v "plindia-frontend"
```

Expected: no errors in `WorkspaceContext.tsx` or `App.tsx`.

**Step 5: Commit**

```bash
git add app/src/contexts/WorkspaceContext.tsx app/src/App.tsx vite.config.ts
git commit -m "feat: add WorkspaceContext provider and wrap App"
```

---

## Task 5: Workspace Switcher — CreateWorkspaceModal

**Files:**
- Create: `app/src/components/workspace/CreateWorkspaceModal.tsx`

**Step 1: Create the modal**

```typescript
// app/src/components/workspace/CreateWorkspaceModal.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceModal({ open, onOpenChange }: CreateWorkspaceModalProps) {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createWorkspace(name.trim());
      toast.success(`Workspace "${name.trim()}" created`);
      setName('');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            placeholder="e.g. Client A, Acme Corp"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? 'Creating…' : 'Create workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | grep "workspace"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add app/src/components/workspace/CreateWorkspaceModal.tsx
git commit -m "feat: add CreateWorkspaceModal component"
```

---

## Task 6: Workspace Switcher — Dropdown Component

**Files:**
- Create: `app/src/components/layout/WorkspaceSwitcher.tsx`

**Step 1: Create the switcher**

```typescript
// app/src/components/layout/WorkspaceSwitcher.tsx
import { useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal';

function truncate(str: string, n = 22) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace, isLoading } = useWorkspace();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) {
    return <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 font-medium text-sm max-w-[200px]"
          >
            <span className="truncate">{activeWorkspace ? truncate(activeWorkspace.name) : 'Select workspace'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            My workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map(ws => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => switchWorkspace(ws.id)}
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="truncate">{truncate(ws.name)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">{ws.role}</span>
                {activeWorkspace?.id === ws.id && (
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setModalOpen(true)}
            className="text-orange-600 dark:text-orange-400 cursor-pointer gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Create a workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
```

**Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | grep "WorkspaceSwitcher\|workspace"
```

**Step 3: Commit**

```bash
git add app/src/components/layout/WorkspaceSwitcher.tsx
git commit -m "feat: add WorkspaceSwitcher dropdown component"
```

---

## Task 7: DashboardHeader — Add Workspace Switcher + Always Show

**Files:**
- Modify: `app/src/components/dashboard/DashboardHeader.tsx`
- Modify: `app/src/components/layout/MainLayout.tsx`

**Step 1: Update DashboardHeader**

Add import at top of `DashboardHeader.tsx`:

```typescript
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
```

Replace the left side of the header (currently just a Badge) with the workspace switcher:

```typescript
// Replace this block:
<div className="flex items-center space-x-4">
  {/* Only show badge on dashboard, not on module pages */}
  {!selectedModule && (
    <Badge variant="secondary" className="hidden sm:inline-flex">
      {user?.role === 'admin' ? 'Admin' : 'User'}
    </Badge>
  )}
</div>

// With:
<div className="flex items-center space-x-4">
  <WorkspaceSwitcher />
</div>
```

**Step 2: Update MainLayout to always show the header**

In `app/src/components/layout/MainLayout.tsx`, find:

```typescript
{/* Hide header on home/chat view to give full height to chat */}
{!isHomeView && (
  <DashboardHeader selectedModule={selectedModule} onModuleSelect={onModuleSelect} />
)}
```

Replace with:

```typescript
<DashboardHeader selectedModule={selectedModule} onModuleSelect={onModuleSelect} />
```

Also update the `main` className — the home view currently has no `pt-4`, keep that:

```typescript
<main className={cn(
  "flex-1 overflow-auto transition-all duration-300",
  isHomeView
    ? "bg-white dark:bg-gray-900"
    : "bg-gradient-to-br from-orange-50/30 via-white to-orange-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 pt-4"
)}>
```

(No change needed here — just remove the header conditional above.)

**Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | grep -v "node_modules" | grep -v "plindia-frontend" | head -20
```

Expected: no new errors.

**Step 4: Visual check**

```bash
npm run dev
```

Open http://localhost:5173. The workspace switcher should appear in the top-left of the header on all views including the chat home.

**Step 5: Commit**

```bash
git add app/src/components/dashboard/DashboardHeader.tsx app/src/components/layout/MainLayout.tsx
git commit -m "feat: add WorkspaceSwitcher to header, show header on all views"
```

---

## Task 8: "Let's Get Started" Checklist Component

**Files:**
- Create: `app/src/components/dashboard/GettingStartedChecklist.tsx`

**Step 1: Create the checklist**

```typescript
// app/src/components/dashboard/GettingStartedChecklist.tsx
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Globe, Plug, Bot, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const DISMISSED_KEY = 'torqq_checklist_dismissed';

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  complete: boolean;
}

interface GettingStartedChecklistProps {
  onNavigate: (moduleId: string) => void;
}

export function GettingStartedChecklist({ onNavigate }: GettingStartedChecklistProps) {
  const { user } = useAuth();
  const { activeWorkspace, updateWebsiteUrl } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [websiteUrl, setWebsiteUrl] = useState(activeWorkspace?.website_url ?? '');
  const [savingUrl, setSavingUrl] = useState(false);
  const [hasIntegration, setHasIntegration] = useState(false);
  const [hasAgentRun, setHasAgentRun] = useState(false);
  const [allDoneShown, setAllDoneShown] = useState(false);

  // Sync website url when workspace changes
  useEffect(() => {
    setWebsiteUrl(activeWorkspace?.website_url ?? '');
  }, [activeWorkspace?.id, activeWorkspace?.website_url]);

  // Check step 2 (integration) and step 3 (agent run)
  useEffect(() => {
    if (!user?.id || !activeWorkspace?.id) return;
    // Check integrations
    fetch(`/api/integrations?userId=${user.id}`)
      .then(r => r.json())
      .then(d => {
        const connected = (d?.connectors ?? []).some((c: { connected: boolean }) => c.connected);
        setHasIntegration(connected);
      })
      .catch(() => {});
    // Check agent runs
    fetch(`/api/agents/status?workspaceId=${activeWorkspace.id}`)
      .then(r => r.json())
      .then(d => setHasAgentRun((d?.total ?? 0) > 0))
      .catch(() => {});
  }, [user?.id, activeWorkspace?.id]);

  const step1Complete = Boolean(activeWorkspace?.website_url);
  const step2Complete = hasIntegration;
  const step3Complete = hasAgentRun;
  const completedCount = [step1Complete, step2Complete, step3Complete].filter(Boolean).length;
  const allComplete = completedCount === 3;

  // Auto-collapse when all done
  useEffect(() => {
    if (allComplete && !allDoneShown) {
      setAllDoneShown(true);
      setTimeout(() => {
        localStorage.setItem(DISMISSED_KEY, '1');
        setDismissed(true);
      }, 3000);
    }
  }, [allComplete, allDoneShown]);

  const handleSaveUrl = async () => {
    const url = websiteUrl.trim();
    if (!url) return;
    setSavingUrl(true);
    try {
      await updateWebsiteUrl(url);
      toast.success('Website URL saved — your agents will research this automatically');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingUrl(false);
    }
  };

  if (dismissed) return null;

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="mx-4 mt-3 mb-1 border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
            {completedCount}/3
          </span>
          <div className="text-left">
            <p className="font-semibold text-sm">Let's get started, {firstName} 👋</p>
            <p className="text-xs text-muted-foreground">Follow these steps to get the most out of Torqq</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* All done state */}
      {allComplete && !collapsed && (
        <div className="px-5 pb-4 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          You're all set! Collapsing in a moment…
        </div>
      )}

      {/* Steps */}
      {!collapsed && !allComplete && (
        <div className="divide-y">
          {/* Step 1: Website URL */}
          <div className={cn('px-5 py-4 flex gap-4', step1Complete && 'opacity-60')}>
            <div className="mt-0.5 shrink-0">
              {step1Complete
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Globe className="h-5 w-5 text-orange-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Enter your website URL</p>
              <p className="text-xs text-muted-foreground mb-2">Your agents will research your brand automatically</p>
              {!step1Complete && (
                <div className="flex gap-2">
                  <Input
                    placeholder="https://yourcompany.com"
                    value={websiteUrl}
                    onChange={e => setWebsiteUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" onClick={handleSaveUrl} disabled={savingUrl || !websiteUrl.trim()}>
                    {savingUrl ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Connect account */}
          <div className={cn('px-5 py-4 flex items-center gap-4', step2Complete && 'opacity-60')}>
            <div className="shrink-0">
              {step2Complete
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Plug className="h-5 w-5 text-blue-500" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Connect an account</p>
              <p className="text-xs text-muted-foreground">Link Google Ads, Meta or LinkedIn for live data</p>
            </div>
            {!step2Complete && (
              <Button variant="outline" size="sm" onClick={() => onNavigate('settings')}>
                + Connect
              </Button>
            )}
          </div>

          {/* Step 3: Run first agent */}
          <div className={cn('px-5 py-4 flex items-center gap-4', step3Complete && 'opacity-60')}>
            <div className="shrink-0">
              {step3Complete
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Bot className="h-5 w-5 text-purple-500" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Run your first agent</p>
              <p className="text-xs text-muted-foreground">Ask Zara, Maya or any agent to start working</p>
            </div>
            {!step3Complete && (
              <Button variant="outline" size="sm" onClick={() => onNavigate('home')}>
                → Run
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add to ChatHome**

Open `app/src/components/chat/ChatHome.tsx`. Find where the component returns its JSX. Import and add the checklist above the main chat area:

```typescript
// Add import
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist';

// In the JSX, add before the chat messages/input area:
<GettingStartedChecklist onNavigate={onModuleSelect} />
```

Check `ChatHome.tsx`'s props to confirm `onModuleSelect` is the correct prop name.

**Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | grep -v "node_modules" | grep -v "plindia-frontend" | head -20
```

**Step 4: Commit**

```bash
git add app/src/components/dashboard/GettingStartedChecklist.tsx app/src/components/chat/ChatHome.tsx
git commit -m "feat: add GettingStartedChecklist dashboard widget with 3 onboarding steps"
```

---

## Task 9: Settings — Tabbed Sidebar Layout

**Files:**
- Create: `app/src/components/settings/tabs/GeneralTab.tsx`
- Create: `app/src/components/settings/tabs/AccountsTab.tsx`
- Create: `app/src/components/settings/tabs/MembersTab.tsx`
- Create: `app/src/components/settings/tabs/BillingTab.tsx`
- Modify: `app/src/components/settings/SettingsPanel.tsx`

**Step 1: Create GeneralTab**

Move ALL existing content from `SettingsPanel.tsx` (Profile, Appearance, Notifications, Security, AI Team Context, Data Management cards) into `GeneralTab.tsx`:

```typescript
// app/src/components/settings/tabs/GeneralTab.tsx
// Cut all the card content from SettingsPanel.tsx and paste here.
// The component signature:
export function GeneralTab() {
  // ... all existing SettingsPanel state and JSX goes here
  return (
    <div className="space-y-6">
      {/* Profile, Appearance, Notifications, Security, AI Team Context, Data Management */}
    </div>
  );
}
```

**Step 2: Create AccountsTab**

Move the Integrations card from SettingsPanel into AccountsTab, add platform icons:

```typescript
// app/src/components/settings/tabs/AccountsTab.tsx
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Connector = {
  id: string; name: string; status: string;
  notes?: string; connected?: boolean; connectedAt?: string | null;
};

export function AccountsTab() {
  const { user } = useAuth();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations?userId=${encodeURIComponent(user.id)}`);
      const json = await res.json();
      setConnectors(json?.connectors ?? []);
    } catch { setConnectors([]); } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const connect = async (id: string) => {
    setActionId(id);
    try {
      await fetch('/api/integrations/connect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, connectorId: id, authType: 'oauth' }),
      });
      await load(); toast.success('Connected');
    } catch { toast.error('Connect failed'); } finally { setActionId(null); }
  };

  const disconnect = async (id: string) => {
    setActionId(id);
    try {
      await fetch('/api/integrations/disconnect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, connectorId: id }),
      });
      await load(); toast.success('Disconnected');
    } catch { toast.error('Disconnect failed'); } finally { setActionId(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <p className="text-sm text-muted-foreground">
          Connect ad, analytics, and commerce platforms for live data in your agents.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : connectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No integrations available.</p>
      ) : (
        <div className="space-y-2">
          {connectors.map(c => (
            <div key={c.id} className="border rounded-lg p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{c.name}</p>
                {c.notes && <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>}
                {c.connectedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connected {new Date(c.connectedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={c.connected ? 'default' : 'secondary'}>
                  {c.connected ? 'Connected' : 'Not connected'}
                </Badge>
                {c.connected ? (
                  <Button variant="outline" size="sm" disabled={actionId === c.id} onClick={() => disconnect(c.id)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" disabled={actionId === c.id} onClick={() => connect(c.id)}>
                    Connect
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create MembersTab**

```typescript
// app/src/components/settings/tabs/MembersTab.tsx
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Member = { id: string; name: string; email: string; role: 'owner' | 'member'; joined_at: string; };

export function MembersTab() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/members`);
      const json = await res.json();
      setMembers(json?.members ?? []);
    } catch { setMembers([]); } finally { setLoading(false); }
  }, [activeWorkspace?.id]);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!email.trim() || !activeWorkspace?.id) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/invite`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), invitedBy: user?.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail('');
    } catch (err: any) { toast.error(err.message); } finally { setInviting(false); }
  };

  const remove = async (memberId: string) => {
    if (!activeWorkspace?.id) return;
    try {
      await fetch(`/api/workspaces/${activeWorkspace.id}/members/${memberId}`, { method: 'DELETE' });
      toast.success('Member removed');
      load();
    } catch { toast.error('Failed to remove'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="text-sm text-muted-foreground">Add unlimited members to your workspace for free.</p>
      </div>

      {/* Invite */}
      <div className="border rounded-lg p-4 space-y-3">
        <p className="font-medium text-sm">Invite</p>
        <div className="flex gap-2">
          <Input
            placeholder="colleague@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && invite()}
            className="flex-1"
          />
          <Button onClick={invite} disabled={inviting || !email.trim()}>
            {inviting ? 'Sending…' : '+ Add'}
          </Button>
        </div>
      </div>

      {/* Member list */}
      <div className="border rounded-lg divide-y">
        <div className="px-4 py-2 text-xs text-muted-foreground">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </div>
        {loading ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">Loading…</div>
        ) : members.map(m => (
          <div key={m.id} className="px-4 py-3 flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.name}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>
            <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} className="shrink-0">
              {m.role === 'owner' ? 'Admin' : 'Member'}
            </Badge>
            {m.role !== 'owner' && m.id !== user?.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-red-600 cursor-pointer"
                    onClick={() => remove(m.id)}
                  >
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Create BillingTab placeholder**

```typescript
// app/src/components/settings/tabs/BillingTab.tsx
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function BillingTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">Manage your plan and payment details.</p>
      </div>
      <div className="border rounded-lg p-6 flex items-center justify-between">
        <div>
          <p className="font-medium">Free plan</p>
          <p className="text-sm text-muted-foreground mt-1">Upgrade to unlock more credits and features.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">Free</Badge>
          <Button>Upgrade →</Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Rewrite SettingsPanel.tsx as tabbed layout**

Replace the entire content of `SettingsPanel.tsx` with:

```typescript
// app/src/components/settings/SettingsPanel.tsx
import { useState } from 'react';
import { User, Plug, Users, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneralTab } from './tabs/GeneralTab';
import { AccountsTab } from './tabs/AccountsTab';
import { MembersTab } from './tabs/MembersTab';
import { BillingTab } from './tabs/BillingTab';

type TabId = 'general' | 'accounts' | 'members' | 'billing';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general',  label: 'General',  icon: <User className="h-4 w-4" /> },
  { id: 'accounts', label: 'Accounts', icon: <Plug className="h-4 w-4" /> },
  { id: 'members',  label: 'Members',  icon: <Users className="h-4 w-4" /> },
  { id: 'billing',  label: 'Billing',  icon: <CreditCard className="h-4 w-4" /> },
];

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const renderTab = () => {
    switch (activeTab) {
      case 'general':  return <GeneralTab />;
      case 'accounts': return <AccountsTab />;
      case 'members':  return <MembersTab />;
      case 'billing':  return <BillingTab />;
    }
  };

  return (
    <div className="flex gap-0 min-h-full">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r pr-0">
        <div className="px-4 py-4 pb-2">
          <h1 className="font-semibold text-base">Settings</h1>
        </div>
        <nav className="px-2 space-y-0.5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                activeTab === tab.id
                  ? 'bg-orange-50 text-orange-700 font-medium dark:bg-orange-900/20 dark:text-orange-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 px-8 py-6 overflow-auto">
        {renderTab()}
      </main>
    </div>
  );
}
```

**Step 6: Typecheck**

```bash
npm run typecheck 2>&1 | grep -v "node_modules" | grep -v "plindia-frontend" | head -30
```

Fix any errors before proceeding.

**Step 7: Visual check**

Navigate to Settings in the app. Should see 4-tab sidebar with General/Accounts/Members/Billing.

**Step 8: Commit**

```bash
git add app/src/components/settings/
git commit -m "feat: refactor Settings into tabbed sidebar (General, Accounts, Members, Billing)"
```

---

## Task 10: Final Integration Check + Memory Update

**Step 1: Full typecheck**

```bash
npm run typecheck 2>&1 | grep -v "node_modules" | grep -v "plindia-frontend"
```

All onboarding/workspace/settings files should be error-free. Pre-existing company-intelligence errors are OK to ignore.

**Step 2: Smoke test the full flow**

1. Open http://localhost:5173
2. Log in → workspace switcher appears in top nav showing "My workspace"
3. Click workspace switcher → dropdown shows workspace list + "Create a workspace"
4. Click "Create a workspace" → modal opens → type name → creates new workspace → switches to it
5. Dashboard home shows "Let's get started" checklist with 3 steps
6. Enter a website URL in Step 1 → save → step goes green
7. Navigate to Settings → tabbed sidebar shows General / Accounts / Members / Billing
8. Members tab shows current user as Admin + invite form works

**Step 3: Update Playwright test**

Add a workspace smoke test to `app/tests/onboarding.spec.ts` or create `app/tests/workspace.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test('workspace switcher appears after login', async ({ page }) => {
  await page.goto('/');
  // Login (reuse credentials from existing test)
  await page.locator('#email').fill('yogsbags@gmail.com');
  await page.locator('#password').fill('Acc1234$&');
  await page.locator('button[type="submit"]:has-text("Sign In")').click();
  await page.waitForLoadState('networkidle');
  // Skip onboarding if shown
  await page.evaluate(() => localStorage.setItem('torqq_onboarded', '1'));
  await page.reload();
  await page.waitForLoadState('networkidle');
  // Workspace switcher should be visible
  await expect(page.locator('text=My workspace')).toBeVisible({ timeout: 8000 });
});
```

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: workspace + onboarding checklist + tabbed settings — complete"
```

---

## Summary of All Files Changed

| Action | File |
|--------|------|
| Create | `database/migrations/workspace.sql` |
| Create | `app/src/contexts/WorkspaceContext.tsx` |
| Create | `app/src/components/workspace/CreateWorkspaceModal.tsx` |
| Create | `app/src/components/layout/WorkspaceSwitcher.tsx` |
| Create | `app/src/components/dashboard/GettingStartedChecklist.tsx` |
| Create | `app/src/components/settings/tabs/GeneralTab.tsx` |
| Create | `app/src/components/settings/tabs/AccountsTab.tsx` |
| Create | `app/src/components/settings/tabs/MembersTab.tsx` |
| Create | `app/src/components/settings/tabs/BillingTab.tsx` |
| Modify | `app/src/App.tsx` |
| Modify | `app/src/components/dashboard/DashboardHeader.tsx` |
| Modify | `app/src/components/layout/MainLayout.tsx` |
| Modify | `app/src/components/chat/ChatHome.tsx` |
| Modify | `app/src/components/settings/SettingsPanel.tsx` |
| Modify | `platform/content-engine/backend-server.js` |
| Modify | `vite.config.ts` |
