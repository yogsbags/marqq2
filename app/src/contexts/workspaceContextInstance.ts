/**
 * Stable context instance (separate file so Vite HMR editing WorkspaceContext.tsx
 * does not re-run createContext() and break Provider / consumer identity).
 */
import { createContext } from 'react';

export interface Workspace {
  id: string;
  name: string;
  website_url: string | null;
  role: 'owner' | 'member';
  created_at?: string;
}

export interface WorkspaceContextType {
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

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);
