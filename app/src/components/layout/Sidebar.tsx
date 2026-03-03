import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { useEffect, useMemo, useState } from 'react';
import {
  HiChat as Bot,
  HiChevronDown,
  HiChevronRight,
  HiCurrencyDollar as DollarSign,
  HiEye as Eye,
  HiHome as Home,
  HiQuestionMarkCircle as HelpCircle,
  HiPencil as PenTool,
  HiSearch as Search,
  HiCog as Settings,
  HiChartBar as Target,
  HiTrendingUp as TrendingUp,
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
  { id: 'opportunities', title: 'Opportunities' },
  { id: 'client_profiling', title: 'Client Profiling' },
  { id: 'partner_profiling', title: 'Partner Profiling' },
  { id: 'icps', title: 'Ideal Customer Profiles' },
  { id: 'social_calendar', title: 'Social Calendar' },
  { id: 'marketing_strategy', title: 'Marketing Strategy' },
  { id: 'positioning_messaging', title: 'Positioning & Messaging' },
  { id: 'pricing_intelligence', title: 'Pricing Intelligence' },
  { id: 'content_strategy', title: 'Content Strategy' },
  { id: 'channel_strategy', title: 'Channel Strategy' },
  { id: 'lookalike_audiences', title: 'Lookalike Audiences' },
  { id: 'lead_magnets', title: 'Lead Magnets' }
];

const navigationItems = [
  {
    id: 'home',
    title: 'Home',
    icon: Home,
  },
  {
    id: 'dashboard',
    title: 'AI Team',
    icon: LayoutDashboard,
  },
  {
    id: 'company-intelligence',
    title: 'Company Intelligence',
    icon: TrendingUp,
  },
  {
    id: 'lead-intelligence',
    title: 'Lead Intelligence',
    icon: Target,
  },
  {
    id: 'ai-voice-bot',
    title: 'AI Voice Bot',
    icon: Bot,
  },
  {
    id: 'ai-video-bot',
    title: 'AI Video Bot',
    icon: Video,
  },
  {
    id: 'user-engagement',
    title: 'User Engagement',
    icon: Users,
  },
  {
    id: 'budget-optimization',
    title: 'Budget Optimization',
    icon: DollarSign,
  },
  {
    id: 'performance-scorecard',
    title: 'Performance Scorecard',
    icon: TrendingUp,
  },
  {
    id: 'ai-content',
    title: 'AI Content',
    icon: PenTool,
  },
  {
    id: 'seo-llmo',
    title: 'SEO/LLMO',
    icon: Search,
  },
  {
    id: 'unified-customer-view',
    title: 'Customer View',
    icon: Eye,
  }
];

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
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    const handler = () => setCompanyIntelPage(parseCompanyIntelPageFromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    if (collapsed) {
      setCompanyIntelOpen(false);
      return;
    }
    if (selectedModule === 'company-intelligence') {
      setCompanyIntelOpen(true);
    }
  }, [collapsed, selectedModule]);

  const companySubmenuVisible = useMemo(
    () => selectedModule === 'company-intelligence' && companyIntelOpen && !collapsed,
    [selectedModule, companyIntelOpen, collapsed]
  );

  const navigateCompanyIntel = (pageId: string) => {
    window.location.hash = `ci=${encodeURIComponent(pageId)}`;
    onModuleSelect('company-intelligence');
  };

  return (
    <div className={cn(
      "fixed left-0 top-0 z-30 flex flex-col h-full bg-white dark:bg-gray-950 border-r transition-all duration-300",
      collapsed ? "w-16" : "w-72"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        {collapsed ? (
          <div className="flex items-center justify-center flex-1">
            <img
              src={BRAND.logoSrc}
              alt={`${BRAND.name} logo`}
              className="block h-9 w-9 rounded-md"
            />
          </div>
        ) : (
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <img
              src={BRAND.logoSrc}
              alt={`${BRAND.name} logo`}
              className="block h-11 w-11 rounded-md flex-shrink-0"
            />
            <h1 className="font-brand text-2xl font-bold bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent truncate">
              {BRAND.name}
            </h1>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-2">
          {navigationItems.map((item) => {
            const isCompanyRoot = item.id === 'company-intelligence';
            const isSelected = selectedModule === item.id;

            if (item.id === 'home') {
              const isHomeActive = !selectedModule || selectedModule === 'home';
              return (
                <div key="home" className="space-y-1">
                  <div className={cn("flex items-center", !collapsed && "gap-1")}>
                    <Button
                      variant={isHomeActive ? "default" : "ghost"}
                      className={cn(
                        "flex-1 justify-start transition-colors duration-200",
                        collapsed ? "px-2" : "px-3 py-2.5",
                        isHomeActive
                          ? "bg-orange-500 text-white hover:bg-orange-600"
                          : "bg-transparent text-foreground/70 hover:bg-orange-500/10 hover:text-orange-500 focus:outline-none focus:ring-0"
                      )}
                      onClick={() => onModuleSelect(item.id)}
                    >
                      <item.icon className={cn("h-4 w-4", collapsed ? "" : "mr-2")} />
                      {!collapsed && <span className="font-medium text-left">Home</span>}
                    </Button>

                    {!collapsed && (
                      <button
                        onClick={() => setHistoryOpen(prev => !prev)}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                        title={historyOpen ? "Collapse history" : "Expand history"}
                      >
                        {historyOpen
                          ? <HiChevronDown className="h-3.5 w-3.5" />
                          : <HiChevronRight className="h-3.5 w-3.5" />
                        }
                      </button>
                    )}
                  </div>

                  {historyOpen && !collapsed && conversations && (
                    <ConversationHistory
                      conversations={conversations}
                      activeId={activeConversationId ?? null}
                      onSelect={(id) => {
                        onConversationSelect?.(id);
                        onModuleSelect('home');
                      }}
                    />
                  )}
                </div>
              );
            }

            return (
              <div key={item.id || 'dashboard'} className="space-y-1">
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
                    if (isCompanyRoot) {
                      if (selectedModule === 'company-intelligence' && companyIntelOpen) {
                        setCompanyIntelOpen(false);
                        return;
                      }
                      setCompanyIntelOpen(true);
                      navigateCompanyIntel(companyIntelPage || 'overview');
                      return;
                    }
                    onModuleSelect(item.id);
                  }}
                  data-tour={item.id === 'company-intelligence' ? 'nav-company-intel' : item.id === 'dashboard' ? 'nav-dashboard' : undefined}
                >
                  {item.icon && (
                    <item.icon className={cn(
                      "h-4 w-4",
                      collapsed ? "" : "mr-2"
                    )} />
                  )}
                  {!collapsed && (
                    <span className="font-medium text-left">{item.title}</span>
                  )}
                </Button>

                {isCompanyRoot && companySubmenuVisible ? (
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
                ) : null}
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
              <item.icon className={cn(
                "h-4 w-4",
                collapsed ? "" : "mr-2"
              )} />
              {!collapsed && (
                <span className="font-medium text-left">{item.title}</span>
              )}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
