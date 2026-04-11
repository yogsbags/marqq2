import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { BRAND } from '@/lib/brand';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Hash,
  HelpCircle,
  Settings,
  LayoutDashboard,
  Puzzle,
  FolderOpen,
  CalendarClock,
  UserCircle,
  Check,
  Plus,
  LogOut,
  X,
  ClipboardCheck,
  Trash2,
} from 'lucide-react';
import { loadPinnedChannels, unpinChannel, type PinnedChannel } from '@/lib/pinnedChannels';
import type { Conversation } from '@/types/chat';

interface SidebarProps {
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  conversations?: Conversation[];
  activeConversationId?: string | null;
  onConversationSelect?: (id: string) => void;
}

interface NavItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

function formatConvName(name: string): string {
  return (
    name
      .replace(/^\//, '')                          // strip leading slash
      .replace(/[-_]/g, ' ')                       // hyphens/underscores → spaces
      .replace(/\b\w/g, (c) => c.toUpperCase())   // title-case each word
      .trim() || 'New Conversation'
  );
}

const channels: NavItem[] = [
  { id: 'home',                  title: 'main',        icon: Hash },
  { id: 'performance-scorecard', title: 'performance', icon: Hash },
  { id: 'calendar',              title: 'calendar',    icon: Hash },
];


const workspaceItems: NavItem[] = [
  { id: 'integrations',    title: 'Integrations',    icon: Puzzle },
  { id: 'workspace-files', title: 'Files',           icon: FolderOpen },
  { id: 'scheduled-jobs',  title: 'Tasks',           icon: CalendarClock },
  { id: 'draft-approvals', title: 'Approvals',       icon: ClipboardCheck },
  { id: 'profile',         title: 'Your Profile',    icon: UserCircle },
  { id: 'settings',        title: 'Settings',        icon: Settings },
  { id: 'help',            title: 'Help',            icon: HelpCircle },
];

export function Sidebar({
  selectedModule,
  onModuleSelect,
  collapsed,
  onToggleCollapse,
  conversations,
  activeConversationId,
  onConversationSelect,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const { workspaces, activeWorkspace, switchWorkspace, deleteWorkspace } = useWorkspace();
  const homeActive = !selectedModule || selectedModule === 'home';
  const veenaDmActive = selectedModule === 'veena-dm';

  const workspaceId = activeWorkspace?.id;
  const [dynamicChannels, setDynamicChannels] = useState<PinnedChannel[]>(() =>
    loadPinnedChannels(workspaceId),
  );
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reload when workspace changes
  useEffect(() => {
    setDynamicChannels(loadPinnedChannels(workspaceId));
  }, [workspaceId]);

  // Listen for new channel pins from App.tsx
  useEffect(() => {
    const handler = (e: Event) => {
      const { channels } = (e as CustomEvent<{ channels: PinnedChannel[] }>).detail ?? {};
      if (channels) setDynamicChannels(channels);
    };
    window.addEventListener('marqq:channels-updated', handler);
    return () => window.removeEventListener('marqq:channels-updated', handler);
  }, []);

  // Profile popover state
  const [profileOpen, setProfileOpen] = useState(false);
  const [createBrandOpen, setCreateBrandOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Handle workspace deletion
  const handleDeleteWorkspace = async (wsId: string) => {
    setDeleting(true);
    try {
      await deleteWorkspace(wsId);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      alert('Failed to delete workspace. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  // Close profile popover on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  const isChannelActive = (id: string) => (id === 'home' ? homeActive : selectedModule === id);

  return (
    <div
      className={cn(
        'fixed left-0 top-0 z-30 flex flex-col h-full transition-[width] duration-300 ease-in-out',
        'bg-card/95 border-r border-border/70 supports-[backdrop-filter]:backdrop-blur-xl',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* ── Logo header ─────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center border-b border-border/60',
          collapsed ? 'flex-col justify-center gap-2 py-3 px-2' : 'justify-between px-4 py-3',
        )}
      >
        {collapsed ? (
          <>
            <img src={BRAND.logoSrc} alt={BRAND.name} className="h-8 w-8 rounded-lg" />
            <button
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={BRAND.logoSrc} alt={BRAND.name} className="h-8 w-8 rounded-lg flex-shrink-0" />
              <div className="min-w-0">
                <div className={`${BRAND.wordmarkFontClass} text-sm font-bold uppercase tracking-wider text-foreground truncate`}>
                  {BRAND.name}
                </div>
                <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-muted-foreground truncate">
                  Marketing OS
                </div>
              </div>
            </div>
            <button
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded flex-shrink-0"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ── Scrollable nav ──────────────────────────────────────── */}
      <ScrollArea className="flex-1 py-3">

        {/* WORKSPACE NAME */}
        {!collapsed && activeWorkspace?.name && (
          <div className="px-5 mb-3">
            <p className="text-[11px] font-semibold text-foreground/75 truncate">
              {activeWorkspace.name}
            </p>
          </div>
        )}

        {/* CHANNELS */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground px-5 mb-1">
            Channels
          </p>
        )}
        <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {/* Static channels */}
          {channels.map((ch) => {
            const active = isChannelActive(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => onModuleSelect(ch.id === 'home' ? null : ch.id)}
                data-tour={ch.id === 'home' ? 'nav-home' : undefined}
                className={cn(
                  'w-full flex items-center rounded-md transition-all duration-150 text-left',
                  collapsed ? 'p-2 justify-center' : 'gap-2 px-2 py-1.5',
                  active
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
                )}
              >
                {collapsed ? (
                  <ch.icon className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <>
                    <ch.icon
                      className={cn('h-3.5 w-3.5 flex-shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
                    />
                    <span className="text-sm font-medium truncate">{ch.title}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </>
                )}
              </button>
            );
          })}

          {/* Dynamic (user-pinned) channels */}
          {dynamicChannels.map((ch) => {
            const active = selectedModule === ch.id;
            return (
              <div key={ch.id} className="group relative">
                <button
                  onClick={() => onModuleSelect(ch.id)}
                  className={cn(
                    'w-full flex items-center rounded-md transition-all duration-150 text-left',
                    collapsed ? 'p-2 justify-center' : 'gap-2 px-2 py-1.5',
                    active
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
                  )}
                >
                  {collapsed ? (
                    <Hash className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <>
                      <Hash
                        className={cn('h-3.5 w-3.5 flex-shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
                      />
                      <span className="text-sm font-medium truncate flex-1">{ch.title}</span>
                      {active && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </>
                  )}
                </button>
                {/* Un-pin (×) button — only visible on hover, not in collapsed mode */}
                {!collapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!workspaceId) return;
                      const updated = unpinChannel(workspaceId, ch.id);
                      setDynamicChannels(updated);
                      // If currently viewing this channel, go home
                      if (selectedModule === ch.id) onModuleSelect(null);
                    }}
                    title="Remove channel"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* DIRECT MESSAGES */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground px-5 mt-4 mb-1">
            Direct Messages
          </p>
        )}
        {collapsed && <div className="mx-2 mt-4 mb-2 h-px bg-border/70" />}
        <div className={cn('space-y-0.5 mt-1', collapsed ? 'px-2' : 'px-3')}>
          {/* Agent DM row */}
          <div className={cn('w-full rounded-md transition-all duration-150', collapsed ? '' : '')}>
            {collapsed ? (
              <button
                onClick={() => onModuleSelect('veena-dm')}
                data-tour="nav-dashboard"
                className={cn(
                  'w-full flex items-center p-2 justify-center rounded-md transition-all duration-150',
                  veenaDmActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
              </button>
            ) : (
              <div className={cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded-md',
                veenaDmActive ? 'bg-primary/10' : '',
              )}>
                <button
                  onClick={() => onModuleSelect('veena-dm')}
                  data-tour="nav-dashboard"
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div className="relative flex-shrink-0">
                    <AgentAvatar name="veena" size="sm" className="h-6 w-6 rounded-full" />
                    <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border-[1.5px] border-card" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={cn('text-sm font-medium truncate', veenaDmActive ? 'text-foreground' : 'text-foreground/85')}>{BRAND.agentName}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{BRAND.agentTagline}</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    onModuleSelect('veena-dm');
                    window.dispatchEvent(new CustomEvent('marqq:new-veena-dm'));
                  }}
                  title="New chat"
                  className="flex-shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-muted/70"
                >
                  + New
                </button>
              </div>
            )}
          </div>

          {/* Conversation previews (not collapsed) */}
          {!collapsed && conversations && conversations.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground px-2 mt-3 mb-1">
                Chat History
              </p>
              {conversations.slice(0, 3).map(conv => (
                <button
                  key={conv.id}
                  onClick={() => {
                    if (onConversationSelect) onConversationSelect(conv.id);
                    onModuleSelect('veena-dm');
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-150',
                    veenaDmActive && activeConversationId === conv.id
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {/* Same avatar as DM section */}
                  <div className="relative flex-shrink-0">
                    <AgentAvatar name="veena" size="sm" className="h-6 w-6 rounded-full" />
                  </div>
                  <span className="text-xs font-medium text-foreground/85 truncate flex-1">{formatConvName(conv.name)}</span>
                </button>
              ))}
              {conversations.length > 0 && (
                <button
                  onClick={() => onModuleSelect('chat-sessions')}
                  className="w-full text-left px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <span className="text-muted-foreground/60">›</span> See all conversations
                </button>
              )}
            </>
          )}
        </div>

        {/* WORKSPACE */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground px-5 mt-4 mb-1">
            Workspace
          </p>
        )}
        {collapsed && <div className="mx-2 mt-3 mb-2 h-px bg-border/70" />}
        <div className={cn('space-y-0.5 mt-1', collapsed ? 'px-2' : 'px-3')}>
          {workspaceItems.map((item) => {
            const isSelected = selectedModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onModuleSelect(item.id)}
                title={collapsed ? item.title : undefined}
                data-tour={item.id === 'settings' ? 'nav-settings' : undefined}
                className={cn(
                  'w-full flex items-center rounded-md transition-all duration-150 text-left',
                  collapsed ? 'p-2 justify-center' : 'gap-2 px-2 py-1.5',
                  isSelected
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
                )}
              >
                <item.icon
                  className={cn(
                    'h-3.5 w-3.5 flex-shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                {!collapsed && <span className="text-sm truncate">{item.title}</span>}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* ── Bottom user row + profile popover ───────────────────── */}
      <div
        ref={profileRef}
        className={cn(
          'border-t border-border/60 flex-shrink-0 relative',
          collapsed ? 'px-2 py-2 flex justify-center' : 'px-3 py-2',
        )}
      >
        {/* Profile popover — anchored above the button */}
        {profileOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 z-50">
            <div className="bg-white dark:bg-[#1c1c1e] rounded-xl border border-border/60 shadow-xl overflow-hidden">
              {/* Your Profile link */}
              <button
                onClick={() => { setProfileOpen(false); onModuleSelect('profile'); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-foreground hover:bg-muted/60 transition-colors text-left"
              >
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                Your Profile
              </button>

              {/* Brands section */}
              <div className="border-t border-border/40 px-4 pt-2.5 pb-1">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-1.5">Brands</p>
              </div>
              <div className="px-2 pb-1 space-y-0.5">
                {workspaces.map(ws => (
                  <div key={ws.id}>
                    {deleteConfirm === ws.id ? (
                      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-2">
                        <p className="text-xs text-foreground font-medium">Delete {ws.name}?</p>
                        <p className="text-xs text-muted-foreground">This cannot be undone.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteWorkspace(ws.id)}
                            disabled={deleting}
                            className="flex-1 text-xs px-2 py-1 rounded bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
                          >
                            {deleting ? 'Deleting...' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            disabled={deleting}
                            className="flex-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex w-full min-h-10 items-center gap-0.5 py-0.5 pr-0.5">
                        <button
                          type="button"
                          onClick={() => { switchWorkspace(ws.id); setProfileOpen(false); }}
                          className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                            {(ws.name?.[0] ?? 'W').toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm text-foreground truncate">{ws.name}</span>
                          {activeWorkspace?.id === ws.id && (
                            <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(ws.id)}
                          className="shrink-0 border-0 bg-transparent p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:text-destructive"
                          title="Delete workspace"
                          aria-label={`Delete workspace ${ws.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* New brand */}
              <div className="border-t border-border/40 mx-2 mt-1" />
              <button
                onClick={() => { setProfileOpen(false); setCreateBrandOpen(true); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors text-left"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                New brand
              </button>

              {/* Log out */}
              <div className="border-t border-border/40 mx-2" />
              <button
                onClick={() => { setProfileOpen(false); logout(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors text-left"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Log out
              </button>
            </div>
          </div>
        )}

        {/* Trigger button */}
        {collapsed ? (
          <button
            onClick={() => setProfileOpen(prev => !prev)}
            className="h-7 w-7 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[10px] font-bold"
          >
            {(user?.email?.[0] ?? 'M').toUpperCase()}
          </button>
        ) : (
          <button
            onClick={() => setProfileOpen(prev => !prev)}
            className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/70 transition-colors text-left"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {(user?.email?.[0] ?? 'M').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground/85 truncate">{user?.name || user?.email?.split('@')[0] || 'Account'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{activeWorkspace?.name || user?.email || ''}</p>
            </div>
          </button>
        )}
      </div>

      {/* Create brand modal (outside the popover so it's not clipped) */}
      <CreateWorkspaceModal
        open={createBrandOpen}
        onOpenChange={setCreateBrandOpen}
        onCreated={(_ws, url) => url && onModuleSelect('home')}
      />
    </div>
  );
}
