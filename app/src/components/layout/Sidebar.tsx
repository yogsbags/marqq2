import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
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
  BookOpen,
  Calendar,
  FolderOpen,
  CalendarClock,
  UserCircle,
  History,
  Check,
  Plus,
  LogOut,
} from 'lucide-react';
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

const channels: NavItem[] = [
  { id: 'home',                  title: 'main',        icon: Hash },
  { id: 'performance-scorecard', title: 'performance', icon: Hash },
  { id: 'channel-health',        title: 'daily-brief', icon: Hash },
  { id: 'calendar',              title: 'calendar',    icon: Calendar },
];


const workspaceItems: NavItem[] = [
  { id: 'integrations',    title: 'Integrations',    icon: Puzzle },
  { id: 'workspace-files', title: 'Files',           icon: FolderOpen },
  { id: 'scheduled-jobs',  title: 'Tasks',           icon: CalendarClock },
  { id: 'chat-sessions',   title: 'Chat History',    icon: History },
  { id: 'profile',         title: 'Your Profile',    icon: UserCircle },
  { id: 'library',         title: 'Library',         icon: BookOpen },
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
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();
  const homeActive = !selectedModule || selectedModule === 'home';

  // Profile popover state
  const [profileOpen, setProfileOpen] = useState(false);
  const [createBrandOpen, setCreateBrandOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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
        'bg-[#1A1A2E] border-r border-white/[0.08]',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* ── Logo header ─────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center border-b border-white/[0.08]',
          collapsed ? 'flex-col justify-center gap-2 py-3 px-2' : 'justify-between px-4 py-3',
        )}
      >
        {collapsed ? (
          <>
            <img src={BRAND.logoSrc} alt={BRAND.name} className="h-8 w-8 rounded-lg" />
            <button
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              className="p-1 text-white/40 hover:text-white/80 transition-colors rounded"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={BRAND.logoSrc} alt={BRAND.name} className="h-8 w-8 rounded-lg flex-shrink-0" />
              <div className="min-w-0">
                <div className={`${BRAND.wordmarkFontClass} text-sm font-bold uppercase tracking-wider text-white truncate`}>
                  {BRAND.name}
                </div>
                <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/40 truncate">
                  Marketing OS
                </div>
              </div>
            </div>
            <button
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="p-1.5 text-white/40 hover:text-white/80 transition-colors rounded flex-shrink-0"
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
            <p className="text-[11px] font-semibold text-white/70 truncate">
              {activeWorkspace.name}
            </p>
          </div>
        )}

        {/* CHANNELS */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 px-5 mb-1">
            Channels
          </p>
        )}
        <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
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
                    ? 'bg-[#F97316]/20 text-white'
                    : 'text-white/50 hover:text-white/85 hover:bg-white/[0.07]',
                )}
              >
                {collapsed ? (
                  <ch.icon className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <>
                    <ch.icon
                      className={cn('h-3.5 w-3.5 flex-shrink-0', active ? 'text-[#fb923c]' : 'text-white/35')}
                    />
                    <span className="text-sm font-medium truncate">{ch.title}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#fb923c] flex-shrink-0" />
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* DIRECT MESSAGES */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 px-5 mt-4 mb-1">
            Direct Messages
          </p>
        )}
        {collapsed && <div className="mx-2 mt-4 mb-2 h-px bg-white/[0.08]" />}
        <div className={cn('space-y-0.5 mt-1', collapsed ? 'px-2' : 'px-3')}>
          {/* Agent DM row */}
          <div className={cn('w-full rounded-md transition-all duration-150', collapsed ? '' : '')}>
            {collapsed ? (
              <button
                onClick={() => onModuleSelect(null)}
                data-tour="nav-dashboard"
                className={cn(
                  'w-full flex items-center p-2 justify-center rounded-md transition-all duration-150',
                  homeActive
                    ? 'bg-[#F97316]/20 text-white'
                    : 'text-white/50 hover:text-white/85 hover:bg-white/[0.07]',
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
              </button>
            ) : (
              <div className={cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded-md',
                homeActive ? 'bg-[#F97316]/20' : '',
              )}>
                <button
                  onClick={() => onModuleSelect(null)}
                  data-tour="nav-dashboard"
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div className="relative flex-shrink-0">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[9px] font-bold">
                      {BRAND.agentInitial}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border-[1.5px] border-[#1A1A2E]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={cn('text-sm font-medium truncate', homeActive ? 'text-white' : 'text-white/80')}>{BRAND.agentName}</span>
                    </div>
                    <p className="text-[10px] text-white/35 truncate">{BRAND.agentTagline}</p>
                  </div>
                </button>
                <button
                  onClick={() => onModuleSelect(null)}
                  title="New chat"
                  className="flex-shrink-0 text-[10px] text-white/30 hover:text-white/70 transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-white/[0.08]"
                >
                  + New
                </button>
              </div>
            )}
          </div>

          {/* Conversation previews (not collapsed) */}
          {!collapsed && conversations && conversations.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/20 px-2 mt-3 mb-1">
                Chat History
              </p>
              {conversations.slice(0, 2).map(conv => (
                <button
                  key={conv.id}
                  onClick={() => {
                    if (onConversationSelect) onConversationSelect(conv.id);
                    onModuleSelect(null);
                  }}
                  className={cn(
                    'w-full flex flex-col px-2 py-1.5 rounded-md text-left transition-all duration-150',
                    activeConversationId === conv.id
                      ? 'bg-white/[0.10] text-white'
                      : 'text-white/45 hover:text-white/75 hover:bg-white/[0.06]',
                  )}
                >
                  <span className="text-xs font-medium truncate text-white/70">{conv.name}</span>
                  <span className="text-[10px] text-white/30 truncate mt-0.5">
                    {conv.messages[conv.messages.length - 1]?.content?.slice(0, 38) ?? ''}
                    {(conv.messages[conv.messages.length - 1]?.content?.length ?? 0) > 38 ? '...' : ''}
                  </span>
                </button>
              ))}
              {conversations.length > 0 && (
                <button
                  onClick={() => onModuleSelect('chat-sessions')}
                  className="w-full text-left px-2 py-1 text-[10px] text-white/30 hover:text-white/55 transition-colors"
                >
                  See all conversations
                </button>
              )}
            </>
          )}
        </div>

        {/* WORKSPACE */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 px-5 mt-4 mb-1">
            Workspace
          </p>
        )}
        {collapsed && <div className="mx-2 mt-3 mb-2 h-px bg-white/[0.08]" />}
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
                    ? 'bg-[#F97316]/20 text-white'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/[0.07]',
                )}
              >
                <item.icon
                  className={cn(
                    'h-3.5 w-3.5 flex-shrink-0',
                    isSelected ? 'text-[#fb923c]' : 'text-white/30',
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
          'border-t border-white/[0.08] flex-shrink-0 relative',
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
                  <button
                    key={ws.id}
                    onClick={() => { switchWorkspace(ws.id); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                      {(ws.name?.[0] ?? 'W').toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-foreground truncate">{ws.name}</span>
                    {activeWorkspace?.id === ws.id && (
                      <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    )}
                  </button>
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
            className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.06] transition-colors text-left"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {(user?.email?.[0] ?? 'M').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white/80 truncate">{user?.name || user?.email?.split('@')[0] || 'Account'}</p>
              <p className="text-[10px] text-white/35 truncate">{activeWorkspace?.name || user?.email || ''}</p>
            </div>
          </button>
        )}
      </div>

      {/* Create brand modal (outside the popover so it's not clipped) */}
      <CreateWorkspaceModal
        open={createBrandOpen}
        onOpenChange={setCreateBrandOpen}
        onCreated={(_ws, url) => url && onModuleSelect('company-intelligence')}
      />
    </div>
  );
}
