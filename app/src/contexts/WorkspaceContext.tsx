import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  clearWebsiteUrl: () => Promise<void>;
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
    setActiveWorkspace(prev => prev?.id === workspace.id ? ({ ...prev, website_url: workspace.website_url } as Workspace) : prev);
  };

  const clearWebsiteUrl = async () => {
    if (!activeWorkspace || !user?.id) return;
    const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, website_url: null }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to clear website URL');
    const { workspace } = await res.json();
    setWorkspaces(prev => prev.map(w => w.id === workspace.id ? { ...w, website_url: workspace.website_url } : w));
    setActiveWorkspace(prev => prev?.id === workspace.id ? ({ ...prev, website_url: workspace.website_url } as Workspace) : prev);
  };

  return (
    <WorkspaceContext.Provider value={{
      workspaces, activeWorkspace, switchWorkspace,
      createWorkspace, updateWebsiteUrl, clearWebsiteUrl,
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
