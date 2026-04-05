import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Hash,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Eye,
  Zap as LightningBolt,
  HelpCircle,
  Pen as PenTool,
  Settings,
  Megaphone as Speakerphone,
  BarChart2 as Target,
  Tag,
  TrendingUp,
  Users as UserGroup,
  Users2 as Users,
  LayoutDashboard,
  Map as MapIcon,
  RefreshCw as RefreshIcon,
  Download as DownloadIcon,
  UserPlus as UserAddIcon,
  MousePointerClick as CursorClickIcon,
  ShieldCheck as ShieldCheckIcon,
  Puzzle,
  BookOpen,
  Calendar,
  FolderOpen,
  CalendarClock,
  UserCircle,
  History,
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

function ensureCompanyIntelHash() {
  const raw = window.location.hash || '';
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  if (value.includes('ci=') || value.startsWith('company-intel:')) return;
  window.location.hash = 'ci=overview';
}

interface NavItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const channels: NavItem[] = [
  { id: 'home',                  title: 'main',        icon: Hash },
  { id: 'performance-scorecard', title: 'performance', icon: Hash },
  { id: 'channel-health',        title: 'daily-brief', icon: Hash },
  { id: 'calendar',              title: 'calendar',    icon: Calendar },
];

const navSections: NavSection[] = [
  {
    label: 'Plan',
    items: [
      { id: 'company-intelligence', title: 'Company Intelligence', icon: TrendingUp },
      { id: 'market-signals',       title: 'Market Intelligence',  icon: Speakerphone },
      { id: 'audience-profiles',    title: 'Audience Profiles',    icon: UserGroup },
      { id: 'positioning',          title: 'Positioning & GTM',    icon: Target },
      { id: 'offer-design',         title: 'Offer Design',         icon: Tag },
      { id: 'launch-strategy',      title: 'Launch Strategy',      icon: MapIcon },
    ],
  },
  {
    label: 'Execute',
    items: [
      { id: 'lead-intelligence', title: 'Lead Engine',      icon: Users },
      { id: 'paid-ads',          title: 'Paid Ads',         icon: DollarSign },
      { id: 'ai-content',        title: 'Content Studio',   icon: PenTool },
      { id: 'ai-voice-bot',      title: 'Voice Campaigns',  icon: MessageSquare },
      { id: 'referral-program',  title: 'Referral Program', icon: UserAddIcon },
    ],
  },
  {
    label: 'Measure',
    items: [
      { id: 'budget-optimization', title: 'Budget Optimization', icon: DollarSign },
      { id: 'cro',                 title: 'Conversion',          icon: CursorClickIcon },
    ],
  },
  {
    label: 'Customers',
    items: [
      { id: 'unified-customer-view', title: 'Customer View', icon: Eye },
      { id: 'user-engagement',       title: 'Lifecycle',     icon: RefreshIcon },
      { id: 'churn-prevention',      title: 'Retention',     icon: ShieldCheckIcon },
    ],
  },
];

function sectionContaining(moduleId: string | null): string | null {
  if (!moduleId) return null;
  for (const s of navSections) {
    if (s.items.some(i => i.id === moduleId)) return s.label;
  }
  return null;
}

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
  const { user } = useAuth();
  const homeActive = !selectedModule || selectedModule === 'home';

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const active = sectionContaining(selectedModule);
    return Object.fromEntries(navSections.map(s => [s.label, s.label === active]));
  });

  useEffect(() => {
    const active = sectionContaining(selectedModule);
    if (active) {
      setOpenSections(prev => (prev[active] ? prev : { ...prev, [active]: true }));
    }
  }, [selectedModule]);

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

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
          {/* Veena / Marqq AI DM row */}
          <div className={cn('w-full rounded-md transition-all duration-150', collapsed ? '' : '')}>
            {collapsed ? (
              <button
                onClick={() => onModuleSelect('dashboard')}
                data-tour="nav-dashboard"
                className={cn(
                  'w-full flex items-center p-2 justify-center rounded-md transition-all duration-150',
                  selectedModule === 'dashboard'
                    ? 'bg-[#F97316]/20 text-white'
                    : 'text-white/50 hover:text-white/85 hover:bg-white/[0.07]',
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
              </button>
            ) : (
              <div className={cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded-md',
                selectedModule === 'dashboard' ? 'bg-[#F97316]/20' : '',
              )}>
                <button
                  onClick={() => onModuleSelect('dashboard')}
                  data-tour="nav-dashboard"
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div className="relative flex-shrink-0">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[9px] font-bold">
                      V
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border-[1.5px] border-[#1A1A2E]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={cn('text-sm font-medium truncate', selectedModule === 'dashboard' ? 'text-white' : 'text-white/80')}>Veena</span>
                    </div>
                    <p className="text-[10px] text-white/35 truncate">AI Marketing OS</p>
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

        {/* INTELLIGENCE sections */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 px-5 mt-4 mb-1">
            Intelligence
          </p>
        )}
        {collapsed && <div className="mx-2 mt-4 mb-2 h-px bg-white/[0.08]" />}
        <div className={cn('mt-1 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {navSections.map((section) => {
            const isOpen = openSections[section.label];
            const hasActive = section.items.some(i => i.id === selectedModule);

            return (
              <div key={section.label}>
                {!collapsed ? (
                  <>
                    <button
                      onClick={() => toggleSection(section.label)}
                      aria-expanded={isOpen}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-[0.13em] transition-colors select-none',
                        hasActive ? 'text-[#fb923c]' : 'text-white/30 hover:text-white/55',
                      )}
                    >
                      <span>{section.label}</span>
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="space-y-0.5 mt-0.5 mb-1">
                        {section.items.map((item) => {
                          const isSelected = selectedModule === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (item.id === 'company-intelligence') ensureCompanyIntelHash();
                                onModuleSelect(item.id);
                              }}
                              data-tour={
                                item.id === 'company-intelligence' ? 'nav-company-intel' : undefined
                              }
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150 text-left',
                                isSelected
                                  ? 'bg-[#F97316]/20 text-white font-medium'
                                  : 'text-white/45 hover:text-white/80 hover:bg-white/[0.06]',
                              )}
                            >
                              <item.icon
                                className={cn(
                                  'h-3.5 w-3.5 flex-shrink-0',
                                  isSelected ? 'text-[#fb923c]' : 'text-white/30',
                                )}
                              />
                              <span className="truncate">{item.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const isSelected = selectedModule === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.id === 'company-intelligence') ensureCompanyIntelHash();
                            onModuleSelect(item.id);
                          }}
                          title={item.title}
                          className={cn(
                            'w-full flex items-center justify-center p-2 rounded-md transition-all duration-150',
                            isSelected
                              ? 'bg-[#F97316]/25 text-[#fb923c]'
                              : 'text-white/35 hover:text-white/80 hover:bg-white/[0.07]',
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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

      {/* ── Bottom user row ──────────────────────────────────────── */}
      <div className={cn(
        'border-t border-white/[0.08] flex-shrink-0',
        collapsed ? 'px-2 py-2 flex justify-center' : 'px-3 py-2',
      )}>
        {collapsed ? (
          <button
            onClick={() => onModuleSelect('profile')}
            className="h-7 w-7 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[10px] font-bold"
          >
            {(user?.email?.[0] ?? 'M').toUpperCase()}
          </button>
        ) : (
          <button
            onClick={() => onModuleSelect('profile')}
            className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.06] transition-colors text-left"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#F97316] to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {(user?.email?.[0] ?? 'M').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white/80 truncate">{user?.name || user?.email?.split('@')[0] || 'Account'}</p>
              <p className="text-[10px] text-white/35 truncate">{user?.email ?? ''}</p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
