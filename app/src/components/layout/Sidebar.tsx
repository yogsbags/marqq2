import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { useEffect, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare as Bot,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Eye,
  Home,
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

/** Default hash when opening CI from sidebar so horizontal tabs + flow stay in sync */
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

const topItems: NavItem[] = [
  { id: 'home',      title: 'Home',    icon: Home },
  { id: 'dashboard', title: 'AI Team', icon: LayoutDashboard },
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
      { id: 'ai-voice-bot',      title: 'Voice Campaigns',  icon: Bot },
      { id: 'referral-program',  title: 'Referral Program', icon: UserAddIcon },
    ],
  },
  {
    label: 'Measure',
    items: [
      { id: 'performance-scorecard', title: 'Performance',         icon: TrendingUp },
      { id: 'budget-optimization',   title: 'Budget Optimization', icon: DollarSign },
      { id: 'cro',                   title: 'Conversion',          icon: CursorClickIcon },
      { id: 'channel-health',        title: 'Daily Brief',         icon: LightningBolt },
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

const bottomItems = [
  { id: 'library',  title: 'Library',        icon: DownloadIcon }, // TODO: library module
  { id: 'settings', title: 'Settings',       icon: Settings },
  { id: 'help',     title: 'Help & Support', icon: HelpCircle },
];

export function Sidebar({ selectedModule, onModuleSelect, collapsed, onToggleCollapse, conversations, activeConversationId, onConversationSelect }: SidebarProps) {
  const homeButtonSelected = !selectedModule || selectedModule === 'home';

  // Sections open state — default all collapsed; auto-open section of active module
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const active = sectionContaining(selectedModule);
    return Object.fromEntries(navSections.map(s => [s.label, s.label === active]));
  });

  useEffect(() => {
    // Auto-expand section containing newly selected module
    const active = sectionContaining(selectedModule);
    if (active) {
      setOpenSections(prev => (prev[active] ? prev : { ...prev, [active]: true }));
    }
  }, [collapsed, selectedModule]);

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const renderNavItem = (item: NavItem) => {
    const isSelected = selectedModule === item.id;

    return (
      <motion.div
        key={item.id}
        className="space-y-1"
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <Button
          variant={isSelected ? "default" : "ghost"}
          className={cn(
            "w-full justify-start transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1",
            collapsed ? "px-2" : "px-3 py-2.5",
            isSelected
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : "bg-transparent text-foreground/70 hover:bg-orange-500/10 hover:text-orange-500"
          )}
          onClick={() => {
            if (item.id === 'company-intelligence') {
              ensureCompanyIntelHash();
              onModuleSelect('company-intelligence');
              return;
            }
            onModuleSelect(item.id);
          }}
          data-tour={
            item.id === 'home'
              ? 'nav-home'
              : item.id === 'company-intelligence'
                ? 'nav-company-intel'
                : item.id === 'dashboard'
                  ? 'nav-dashboard'
                  : undefined
          }
        >
          <item.icon className={cn("h-5 w-5", collapsed ? "" : "mr-2")} />
          {!collapsed && <span className="font-medium text-base text-left">{item.title}</span>}
        </Button>
      </motion.div>
    );
  };

  return (
    <div className={cn(
      "fixed left-0 top-0 z-30 flex flex-col h-full bg-white/88 dark:bg-gray-950/92 border-r border-border/70 backdrop-blur-xl transition-[width] duration-300 ease-in-out",
      collapsed ? "w-16" : "w-72"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/70">
        {collapsed ? (
          <div className="flex items-center justify-between flex-1 gap-2">
            <div className="flex items-center justify-center flex-1">
              <img src={BRAND.logoSrc} alt={`${BRAND.name} logo`} className="block h-9 w-9 rounded-md" />
            </div>
            <button
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <img src={BRAND.logoSrc} alt={`${BRAND.name} logo`} className="block h-11 w-11 rounded-md flex-shrink-0" />
              <div className="min-w-0">
                <div className={`${BRAND.wordmarkFontClass} text-2xl font-bold uppercase bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent truncate`}>
                  {BRAND.name.toUpperCase()}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Marketing Intelligence OS
                </div>
              </div>
            </div>
            <button
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {/* Home */}
          <motion.div
            className="space-y-1 mb-1"
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <Button
              variant={homeButtonSelected ? "default" : "ghost"}
              className={cn(
                "w-full justify-start rounded-2xl transition-colors duration-200",
                collapsed ? "px-2" : "px-3 py-2.5",
                homeButtonSelected
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "bg-transparent text-foreground/70 hover:bg-orange-500/10 hover:text-orange-500"
              )}
              onClick={() => onModuleSelect('home')}
            >
              <Home className={cn("h-5 w-5", collapsed ? "" : "mr-2")} />
              {!collapsed && <span className="font-medium text-base text-left">Home</span>}
            </Button>
          </motion.div>

          {/* AI Team */}
          {renderNavItem({ id: 'dashboard', title: 'AI Team', icon: LayoutDashboard })}
        </div>

        {/* Collapsible sections */}
        <div className="mt-3 space-y-1">
          {navSections.map((section) => {
            const isOpen = openSections[section.label];
            const hasActive = section.items.some(i => i.id === selectedModule);

            return (
              <div key={section.label}>
                {!collapsed ? (
                  <button
                    onClick={() => toggleSection(section.label)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${section.label} section`}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                      hasActive
                        ? "text-orange-500 hover:text-orange-600"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    {section.label}
                    {isOpen
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronRight className="h-3 w-3" />
                    }
                  </button>
                ) : (
                  <div className="h-px bg-border mx-1 my-2" />
                )}

                {(isOpen || collapsed) && (
                  <div className={cn("space-y-1", !collapsed && "mt-1")}>
                    {section.items.map(renderNavItem)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Separator className="my-4" />

        <div className="space-y-2">
          {bottomItems.map((item) => (
            <Button
              key={item.id}
              variant={selectedModule === item.id ? "default" : "ghost"}
              className={cn(
                "w-full justify-start rounded-2xl transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1",
                collapsed ? "px-2" : "px-3 py-2.5",
                selectedModule === item.id
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "bg-transparent text-foreground/70 hover:bg-orange-500/10 hover:text-orange-500"
              )}
              onClick={() => onModuleSelect(item.id)}
              data-tour={item.id === 'settings' ? 'nav-settings' : undefined}
            >
              <item.icon className={cn("h-5 w-5", collapsed ? "" : "mr-2")} />
              {!collapsed && <span className="font-medium text-base text-left">{item.title}</span>}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
