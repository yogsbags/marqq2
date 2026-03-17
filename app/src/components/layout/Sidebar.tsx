import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { useEffect, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  HiAnnotation as Annotation,
  HiCalendar as CalendarIcon,
  HiChat as Bot,
  HiChevronDown,
  HiChevronRight,
  HiCurrencyDollar as DollarSign,
  HiDesktopComputer as DesktopComputer,
  HiEye as Eye,
  HiHome as Home,
  HiLightningBolt as LightningBolt,
  HiQuestionMarkCircle as HelpCircle,
  HiPencil as PenTool,
  HiSearch as Search,
  HiCog as Settings,
  HiShare as Share,
  HiSpeakerphone as Speakerphone,
  HiChartBar as Target,
  HiTag as Tag,
  HiTrendingUp as TrendingUp,
  HiUserGroup as UserGroup,
  HiUsers as Users,
  HiViewGrid as LayoutDashboard,
  HiVideoCamera as Video
} from 'react-icons/hi';
import type { Conversation } from '@/types/chat';
import { ConversationHistory } from '@/components/chat/ConversationHistory';

interface SidebarProps {
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  conversations?: Conversation[];
  activeConversationId?: string | null;
  onConversationSelect?: (id: string) => void;
}

function parseCompanyIntelPageFromHash(): string {
  const raw = window.location.hash || '';
  if (!raw.startsWith('#')) return 'overview';
  const value = raw.slice(1);
  if (!value) return 'overview';

  if (value.startsWith('company-intel:')) {
    return value.slice('company-intel:'.length) || 'overview';
  }

  const params = new URLSearchParams(value.replace(/^(\?|&)/, ''));
  return params.get('ci') || 'overview';
}

const COMPANY_INTEL_SUBMENU = [
  { id: 'overview', title: 'Company Overview' },
  { id: 'competitor_intelligence', title: 'Competitor Intelligence' },
  { id: 'website_audit', title: 'Website Audit' },
  { id: 'client_profiling', title: 'Client Profiling' },
  { id: 'partner_profiling', title: 'Partner Profiling' },
  { id: 'icps', title: 'Ideal Customer Profiles' },
  { id: 'social_calendar', title: 'Social Calendar' },
  { id: 'sales_enablement', title: 'Sales Enablement' },
  { id: 'content_strategy', title: 'Content Strategy' },
  { id: 'lookalike_audiences', title: 'Lookalike Audiences' },
  { id: 'lead_magnets', title: 'Lead Magnets' },
  { id: 'social_intel', title: 'Social Intelligence' },
  { id: 'ads_intel', title: 'Ads Intelligence' },
];

const INTELLIGENCE_DASHBOARD_SUBMENU = [
  { id: 'dashboard-scorecard', title: 'Marketing Scorecard', moduleId: 'performance-scorecard' },
  { id: 'dashboard-insights', title: 'AI Insights', moduleId: 'market-signals' },
  { id: 'dashboard-alerts', title: 'Alerts', moduleId: 'home' },
  { id: 'dashboard-weekly-summary', title: 'Weekly Summary', moduleId: 'home' },
];

const MARKETING_BLUEPRINT_SUBMENU = [
  { id: 'opportunities', title: 'Opportunities' },
  { id: 'marketing_strategy', title: 'Marketing Strategy' },
  { id: 'positioning_messaging', title: 'Positioning & Messaging' },
  { id: 'pricing_intelligence', title: 'Pricing Intelligence' },
  { id: 'channel_strategy', title: 'Channel Strategy' },
];

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
    label: 'Context',
    items: [
      { id: 'intelligence-dashboard',  title: 'Dashboard',              icon: LayoutDashboard },
      { id: 'company-intelligence',    title: 'Company Intelligence',   icon: TrendingUp },
      { id: 'marketing-blueprint',     title: 'Marketing Blueprint',    icon: Target },
      { id: 'industry-intelligence',   title: 'Industry Intelligence',  icon: Speakerphone },
      { id: 'market-signals',          title: 'Market Signals',         icon: Speakerphone },
      { id: 'audience-profiles',       title: 'Audience Profiles',      icon: UserGroup },
    ],
  },
  {
    label: 'Plan',
    items: [
      { id: 'action-plan', title: 'Goal → Action Plan', icon: LightningBolt },
      { id: 'positioning',  title: 'Positioning',        icon: Target },
      { id: 'offer-design', title: 'Offer Design',       icon: Tag },
      { id: 'messaging',    title: 'Messaging & Copy',   icon: Annotation },
    ],
  },
  {
    label: 'Collateral',
    items: [
      { id: 'ai-content',      title: 'AI Content',      icon: PenTool },
      { id: 'ad-creative',     title: 'Ad Creative',     icon: Speakerphone },
      { id: 'email-sequence',  title: 'Email Sequences', icon: Annotation },
      { id: 'social-calendar', title: 'Social Calendar', icon: CalendarIcon },
      { id: 'landing-pages',   title: 'Landing Pages',   icon: DesktopComputer },
      { id: 'seo-llmo',        title: 'SEO / LLMO',      icon: Search },
      { id: 'ai-video-bot',    title: 'AI Video Bot',    icon: Video },
    ],
  },
  {
    label: 'Execution',
    items: [
      { id: 'lead-outreach',     title: 'Lead Outreach',     icon: Users },
      { id: 'lead-intelligence', title: 'Lead Intelligence', icon: Target },
      { id: 'channel-health',    title: 'Channel Health',    icon: Share },
      { id: 'ai-voice-bot',      title: 'AI Voice Bot',      icon: Bot },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'performance-scorecard', title: 'Performance',         icon: TrendingUp },
      { id: 'budget-optimization',   title: 'Budget Optimization', icon: DollarSign },
      { id: 'cro-audit',             title: 'CRO Audit',           icon: Eye },
      { id: 'ab-test',               title: 'A/B Tests',           icon: TrendingUp },
      { id: 'user-engagement',       title: 'User Engagement',     icon: Users },
      { id: 'unified-customer-view', title: 'Customer View',       icon: Eye },
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
  {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
  },
  {
    id: 'help',
    title: 'Help & Support',
    icon: HelpCircle,
  }
];

export function Sidebar({ selectedModule, onModuleSelect, collapsed, onToggleCollapse, conversations, activeConversationId, onConversationSelect }: SidebarProps) {
  const [companyIntelPage, setCompanyIntelPage] = useState<string>(() => parseCompanyIntelPageFromHash());
  const [companyIntelOpen, setCompanyIntelOpen] = useState<boolean>(selectedModule === 'company-intelligence');
  const [marketingBlueprintOpen, setMarketingBlueprintOpen] = useState<boolean>(
    selectedModule === 'company-intelligence' && MARKETING_BLUEPRINT_SUBMENU.some((sub) => sub.id === parseCompanyIntelPageFromHash())
  );
  const [intelligenceDashboardOpen, setIntelligenceDashboardOpen] = useState<boolean>(selectedModule === 'performance-scorecard' || selectedModule === 'market-signals' || !selectedModule || selectedModule === 'home');
  const [intelligenceDashboardSelection, setIntelligenceDashboardSelection] = useState<string>('');
  const [historyOpen, setHistoryOpen] = useState(true);
  const homeButtonSelected =
    (!selectedModule || selectedModule === 'home') &&
    !['dashboard-alerts', 'dashboard-weekly-summary'].includes(intelligenceDashboardSelection);

  // Sections open state — default all collapsed; auto-open section of active module
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const active = sectionContaining(selectedModule);
    return Object.fromEntries(navSections.map(s => [s.label, s.label === active]));
  });

  useEffect(() => {
    const handler = () => setCompanyIntelPage(parseCompanyIntelPageFromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    if (selectedModule && selectedModule !== 'home' && selectedModule !== 'performance-scorecard' && selectedModule !== 'market-signals') {
      setIntelligenceDashboardSelection('');
    }
  }, [selectedModule]);

  useEffect(() => {
    if (collapsed) {
      setCompanyIntelOpen(false);
      setMarketingBlueprintOpen(false);
      setIntelligenceDashboardOpen(false);
      return;
    }
    if (selectedModule === 'company-intelligence') {
      const activeCompanyPage = companyIntelPage || parseCompanyIntelPageFromHash();
      if (MARKETING_BLUEPRINT_SUBMENU.some((sub) => sub.id === activeCompanyPage)) {
        setMarketingBlueprintOpen(true);
      } else {
        setCompanyIntelOpen(true);
      }
    }
    if (selectedModule === 'performance-scorecard' || selectedModule === 'market-signals' || !selectedModule || selectedModule === 'home') {
      setIntelligenceDashboardOpen(true);
    }
    // Auto-expand section containing newly selected module
    const active = sectionContaining(selectedModule);
    if (active) {
      setOpenSections(prev => prev[active] ? prev : { ...prev, [active]: true });
    }
  }, [collapsed, selectedModule, companyIntelPage]);

  const companySubmenuVisible = useMemo(
    () => selectedModule === 'company-intelligence' && companyIntelOpen && !collapsed,
    [selectedModule, companyIntelOpen, collapsed]
  );
  const marketingBlueprintVisible = useMemo(
    () => selectedModule === 'company-intelligence' && marketingBlueprintOpen && !collapsed,
    [selectedModule, marketingBlueprintOpen, collapsed]
  );
  const dashboardSubmenuVisible = useMemo(
    () => intelligenceDashboardOpen && !collapsed,
    [intelligenceDashboardOpen, collapsed]
  );

  const navigateCompanyIntel = (pageId: string) => {
    window.location.hash = `ci=${encodeURIComponent(pageId)}`;
    onModuleSelect('company-intelligence');
  };

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const renderNavItem = (item: NavItem) => {
    const isCompanyRoot = item.id === 'company-intelligence';
    const isMarketingBlueprintRoot = item.id === 'marketing-blueprint';
    const isDashboardRoot = item.id === 'intelligence-dashboard';
    const isCompanyIntelSubpage = COMPANY_INTEL_SUBMENU.some((sub) => sub.id === companyIntelPage);
    const isDashboardSubmoduleActive = intelligenceDashboardSelection !== '';
    const isDashboardManagedModule =
      (item.id === 'market-signals' &&
        intelligenceDashboardSelection === 'dashboard-insights') ||
      (item.id === 'performance-scorecard' &&
        intelligenceDashboardSelection === 'dashboard-scorecard');
    const isMarketingBlueprintActive =
      selectedModule === 'company-intelligence' &&
      MARKETING_BLUEPRINT_SUBMENU.some((sub) => sub.id === companyIntelPage);
    const isSelected = isDashboardRoot
      ? isDashboardSubmoduleActive
      : isMarketingBlueprintRoot
        ? isMarketingBlueprintActive
      : isCompanyRoot
        ? selectedModule === 'company-intelligence' && isCompanyIntelSubpage
        : isDashboardManagedModule
          ? false
        : selectedModule === item.id;

    return (
      <div key={item.id} className="space-y-1">
        <Button
          variant={isSelected ? "default" : "ghost"}
          className={cn(
            "w-full justify-start transition-colors duration-200 focus-visible:ring-0 focus-visible:outline-none",
            collapsed ? "px-2" : "px-3 py-2.5",
            isSelected
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : "bg-transparent text-foreground/70 hover:bg-orange-500/10 hover:text-orange-500 focus:outline-none focus:ring-0"
          )}
          onClick={() => {
            if (isDashboardRoot) {
              setIntelligenceDashboardOpen((prev) => !prev);
              return;
            }
            if (isMarketingBlueprintRoot) {
              if (selectedModule === 'company-intelligence' && marketingBlueprintOpen) {
                setMarketingBlueprintOpen(false);
                return;
              }
              setMarketingBlueprintOpen(true);
              navigateCompanyIntel(companyIntelPage && MARKETING_BLUEPRINT_SUBMENU.some((sub) => sub.id === companyIntelPage) ? companyIntelPage : 'opportunities');
              return;
            }
            if (isCompanyRoot) {
              if (selectedModule === 'company-intelligence' && companyIntelOpen) {
                setCompanyIntelOpen(false);
                return;
              }
              setCompanyIntelOpen(true);
              navigateCompanyIntel(companyIntelPage && !MARKETING_BLUEPRINT_SUBMENU.some((sub) => sub.id === companyIntelPage) ? companyIntelPage : 'overview');
              return;
            }
            setIntelligenceDashboardSelection('');
            onModuleSelect(item.id);
          }}
          data-tour={item.id === 'company-intelligence' ? 'nav-company-intel' : item.id === 'dashboard' ? 'nav-dashboard' : undefined}
        >
          <item.icon className={cn("h-5 w-5", collapsed ? "" : "mr-2")} />
          {!collapsed && <span className="font-medium text-base text-left">{item.title}</span>}
        </Button>

        {isDashboardRoot && dashboardSubmenuVisible && (
          <div className="ml-2 border-l pl-2 space-y-1">
            {INTELLIGENCE_DASHBOARD_SUBMENU.map((sub) => {
              const isActive = intelligenceDashboardSelection === sub.id;
              return (
                <Button
                  key={sub.id}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start text-xs focus-visible:ring-0 focus-visible:outline-none",
                    isActive
                      ? "bg-orange-500/15 text-orange-500 hover:bg-orange-500/20"
                      : "text-muted-foreground hover:bg-orange-500/10 hover:text-orange-500"
                  )}
                  onClick={() => {
                    setIntelligenceDashboardOpen(true);
                    setIntelligenceDashboardSelection(sub.id);
                    onModuleSelect(sub.moduleId);
                  }}
                >
                  {sub.title}
                </Button>
              );
            })}
          </div>
        )}

        {isCompanyRoot && companySubmenuVisible && (
          <div className="ml-2 border-l pl-2 space-y-1">
            {COMPANY_INTEL_SUBMENU.map((sub) => {
              const isActive = companyIntelPage === sub.id;
              return (
                <Button
                  key={sub.id}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start text-xs focus-visible:ring-0 focus-visible:outline-none",
                    isActive
                      ? "bg-orange-500/15 text-orange-500 hover:bg-orange-500/20"
                      : "text-muted-foreground hover:bg-orange-500/10 hover:text-orange-500"
                  )}
                  onClick={() => navigateCompanyIntel(sub.id)}
                >
                  {sub.title}
                </Button>
              );
            })}
          </div>
        )}

        {isMarketingBlueprintRoot && marketingBlueprintVisible && (
          <div className="ml-2 border-l pl-2 space-y-1">
            {MARKETING_BLUEPRINT_SUBMENU.map((sub) => {
              const isActive = companyIntelPage === sub.id;
              return (
                <Button
                  key={sub.id}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start text-xs focus-visible:ring-0 focus-visible:outline-none",
                    isActive
                      ? "bg-orange-500/15 text-orange-500 hover:bg-orange-500/20"
                      : "text-muted-foreground hover:bg-orange-500/10 hover:text-orange-500"
                  )}
                  onClick={() => navigateCompanyIntel(sub.id)}
                >
                  {sub.title}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "fixed left-0 top-0 z-30 flex flex-col h-full bg-white dark:bg-gray-950 border-r transition-all duration-300",
      collapsed ? "w-16" : "w-72"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        {collapsed ? (
          <div className="flex items-center justify-between flex-1 gap-2">
            <div className="flex items-center justify-center flex-1">
              <img src={BRAND.logoSrc} alt={`${BRAND.name} logo`} className="block h-9 w-9 rounded-md" />
            </div>
            <button
              onClick={onToggleCollapse}
              className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <img src={BRAND.logoSrc} alt={`${BRAND.name} logo`} className="block h-11 w-11 rounded-md flex-shrink-0" />
              <h1 className={`${BRAND.wordmarkFontClass} text-2xl font-bold uppercase bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent truncate`}>
                {BRAND.name.toUpperCase()}
              </h1>
            </div>
            <button
              onClick={onToggleCollapse}
              className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="Collapse sidebar"
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
          <div className="space-y-1 mb-1">
            <div className={cn("flex items-center", !collapsed && "gap-1")}>
              <Button
                variant={homeButtonSelected ? "default" : "ghost"}
                className={cn(
                  "flex-1 justify-start transition-colors duration-200",
                  collapsed ? "px-2" : "px-3 py-2.5",
                  homeButtonSelected
                    ? "bg-orange-500 text-white hover:bg-orange-600"
                    : "bg-transparent text-foreground/70 hover:bg-orange-500/10 hover:text-orange-500 focus:outline-none focus:ring-0"
                )}
                onClick={() => onModuleSelect('home')}
                onClickCapture={() => setIntelligenceDashboardSelection('')}
              >
                <Home className={cn("h-5 w-5", collapsed ? "" : "mr-2")} />
                {!collapsed && <span className="font-medium text-base text-left">Home</span>}
              </Button>
              {!collapsed && (
                <button
                  onClick={() => setHistoryOpen(prev => !prev)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                  title={historyOpen ? "Collapse history" : "Expand history"}
                >
                  {historyOpen ? <HiChevronDown className="h-3.5 w-3.5" /> : <HiChevronRight className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {historyOpen && !collapsed && conversations && (
              <ConversationHistory
                conversations={conversations}
                activeId={activeConversationId ?? null}
                onSelect={(id) => { onConversationSelect?.(id); onModuleSelect('home'); }}
              />
            )}
          </div>

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
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-widest transition-colors select-none",
                      hasActive
                        ? "text-orange-500 hover:text-orange-600"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    {section.label}
                    {isOpen
                      ? <HiChevronDown className="h-3 w-3" />
                      : <HiChevronRight className="h-3 w-3" />
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
                "w-full justify-start transition-colors duration-200 focus-visible:ring-0 focus-visible:outline-none",
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
