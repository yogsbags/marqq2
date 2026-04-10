import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  renameWorkspace: (name: string) => Promise<void>;
  updateWebsiteUrl: (url: string, workspaceId?: string) => Promise<void>;
  clearWebsiteUrl: () => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'marqq_workspace_id';
const ACTIVE_WS_KEY = 'marqq_active_workspace';

async function getResponseError(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await res.json().catch(() => null);
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
    return fallback;
  }

  const text = await res.text().catch(() => '');
  if (!text) return fallback;

  // Avoid surfacing raw HTML fallback pages to the UI.
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    return fallback;
  }

  return text.trim();
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const workspacesRef = useRef<Workspace[]>([]);
  workspacesRef.current = workspaces;

  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/workspaces?userId=${encodeURIComponent(user.id)}`);
      const json = await res.json();
      const list: Workspace[] = json.workspaces || [];
      setWorkspaces(list);

      const stored = localStorage.getItem(STORAGE_KEY);
      const found = stored ? list.find(w => w.id === stored) : null;
      const active = found ?? list[0] ?? null;
      setActiveWorkspace(active);
      if (active) localStorage.setItem(ACTIVE_WS_KEY, JSON.stringify({ id: active.id, name: active.name }));
      else localStorage.removeItem(ACTIVE_WS_KEY);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  const switchWorkspace = (id: string) => {
    // Use ref so switching works the same tick as setWorkspaces (e.g. after create).
    const ws = workspacesRef.current.find(w => w.id === id);
    if (!ws) return;
    localStorage.setItem(STORAGE_KEY, id);
    localStorage.setItem(ACTIVE_WS_KEY, JSON.stringify({ id: ws.id, name: ws.name }));
    setActiveWorkspace(ws);
  };

  const createWorkspace = async (name: string): Promise<Workspace> => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id, name }),
    });
    if (!res.ok) throw new Error(await getResponseError(res, 'Failed to create workspace'));
    const { workspace } = await res.json();
    const nextList = [...workspacesRef.current, workspace];
    workspacesRef.current = nextList;
    setWorkspaces(nextList);
    localStorage.setItem(STORAGE_KEY, workspace.id);
    localStorage.setItem(ACTIVE_WS_KEY, JSON.stringify({ id: workspace.id, name: workspace.name }));
    setActiveWorkspace(workspace);
    return workspace;
  };

  const renameWorkspace = async (name: string) => {
    if (!activeWorkspace || !user?.id || !name.trim()) return;
    const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, name: name.trim() }),
    });
    if (!res.ok) throw new Error(await getResponseError(res, 'Failed to rename workspace'));
    const { workspace } = await res.json();
    setWorkspaces(prev => prev.map(w => w.id === workspace.id ? { ...w, name: workspace.name } : w));
    setActiveWorkspace(prev => prev?.id === workspace.id ? ({ ...prev, name: workspace.name } as Workspace) : prev);
    localStorage.setItem(ACTIVE_WS_KEY, JSON.stringify({ id: workspace.id, name: workspace.name }));
  };

  const updateWebsiteUrl = async (url: string, workspaceId?: string) => {
    const id = workspaceId ?? activeWorkspace?.id;
    if (!id || !user?.id) return;
    const res = await fetch(`/api/workspaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, website_url: url }),
    });
    if (!res.ok) throw new Error(await getResponseError(res, 'Failed to update'));
    const { workspace } = await res.json();
    setWorkspaces(prev => prev.map(w => w.id === workspace.id ? { ...w, website_url: workspace.website_url } : w));
    setActiveWorkspace(prev => prev?.id === workspace.id ? ({ ...prev, website_url: workspace.website_url } as Workspace) : prev);
  };

  const clearWebsiteUrl = async () => {
    if (!activeWorkspace || !user?.id) return;
    const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, website_url: null }),
    });
    if (!res.ok) throw new Error(await getResponseError(res, 'Failed to clear website URL'));
    const { workspace } = await res.json();
    setWorkspaces(prev => prev.map(w => w.id === workspace.id ? { ...w, website_url: workspace.website_url } : w));
    setActiveWorkspace(prev => prev?.id === workspace.id ? ({ ...prev, website_url: workspace.website_url } as Workspace) : prev);
  };

  const deleteWorkspace = async (id: string) => {
    if (!user?.id) return;
    const res = await fetch(`/api/workspaces/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
    if (!res.ok) throw new Error(await getResponseError(res, 'Failed to delete workspace'));

    // Remove from list
    const updated = workspaces.filter(w => w.id !== id);
    setWorkspaces(updated);

    // If deleted workspace was active, switch to the first remaining one
    if (activeWorkspace?.id === id) {
      const next = updated[0] ?? null;
      setActiveWorkspace(next);
      if (next) {
        localStorage.setItem(STORAGE_KEY, next.id);
        localStorage.setItem(ACTIVE_WS_KEY, JSON.stringify({ id: next.id, name: next.name }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_WS_KEY);
      }
    }
  };

  return (
    <WorkspaceContext.Provider value={{
      workspaces, activeWorkspace, switchWorkspace,
      createWorkspace, renameWorkspace, updateWebsiteUrl, clearWebsiteUrl, deleteWorkspace,
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
