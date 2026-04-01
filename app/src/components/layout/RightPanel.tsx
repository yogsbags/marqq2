import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, ExternalLink,
  ChevronDown, ChevronRight, BookOpen, Users, Zap,
  Calendar, PlusCircle, BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkspace } from '@/contexts/WorkspaceContext';

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_METRICS = [
  { label: 'Organic Traffic', value: '14,280', change: '+12%', positive: true as boolean | null },
  { label: 'Leads Generated', value: '382',    change: '+8%',   positive: true },
  { label: 'Conversion Rate', value: '2.7%',   change: '-0.3%', positive: false },
  { label: 'Email Open Rate', value: '28.4%',  change: '+4%',   positive: true },
  { label: 'Avg. Session',    value: '3m 12s', change: '+0%',   positive: null },
  { label: 'Bounce Rate',     value: '41%',    change: '-2%',   positive: true },
];

const MOCK_TASKS: LiveTask[] = [
  { id: '1', label: 'Review Q2 campaign brief',   done: false, priority: 'high',   agent: 'Veena',  dueIn: 'in 2d' },
  { id: '2', label: 'Publish 3 LinkedIn posts',   done: false, priority: 'medium', agent: 'Riya',   dueIn: 'in 4d' },
  { id: '3', label: 'Connect Google Analytics',   done: false, priority: 'high',   agent: 'Dev',    dueIn: 'in 6d' },
  { id: '4', label: 'Update ICP document',        done: true,  priority: 'low',    agent: 'Arjun',  dueIn: '' },
  { id: '5', label: 'Run SEO gap analysis',       done: true,  priority: 'medium', agent: 'Maya',   dueIn: '' },
];

const MOCK_BRAND_FILES = [
  { name: 'brand_guidelines.md',    date: '3/31/2026' },
  { name: 'business_profile.md',    date: '3/31/2026' },
  { name: 'marketing_strategy.md',  date: '3/31/2026' },
  { name: 'market_research.md',     date: '3/31/2026' },
  { name: 'seo_strategy.md',        date: '3/31/2026' },
];

const MOCK_AGENTS = [
  { name: 'Veena', role: 'Marketing OS',     status: 'online',   color: 'bg-orange-500' },
  { name: 'Maya',  role: 'SEO & LLMO',       status: 'online',   color: 'bg-green-500' },
  { name: 'Arjun', role: 'Lead Intelligence', status: 'idle',    color: 'bg-blue-500' },
  { name: 'Riya',  role: 'Content',          status: 'working',  color: 'bg-purple-500' },
  { name: 'Zara',  role: 'Campaigns',        status: 'idle',     color: 'bg-pink-500' },
  { name: 'Dev',   role: 'Analytics',        status: 'idle',     color: 'bg-amber-500' },
];

// ── Collapsible section wrapper ───────────────────────────────────────────────

function Section({
  title,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
          {open
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          }
        </div>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

// ── Metrics section ───────────────────────────────────────────────────────────

function MetricsSection() {
  return (
    <Section title="Metrics">
      <div className="px-3 space-y-1.5">
        {MOCK_METRICS.map(m => (
          <div key={m.label} className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums">{m.value}</span>
              <span className={cn(
                'text-[10px] font-medium flex items-center gap-0.5',
                m.positive === true  ? 'text-green-600 dark:text-green-400' :
                m.positive === false ? 'text-red-500 dark:text-red-400' :
                                       'text-muted-foreground',
              )}>
                {m.positive === true  && <TrendingUp className="h-2.5 w-2.5" />}
                {m.positive === false && <TrendingDown className="h-2.5 w-2.5" />}
                {m.positive === null  && <Minus className="h-2.5 w-2.5" />}
                {m.change}
              </span>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          Connect GA4 for live data ·{' '}
          <button className="text-orange-500 hover:underline">Connect now</button>
        </p>
      </div>
    </Section>
  );
}

// ── Channels / Autopilot section ──────────────────────────────────────────────

function ChannelsSection() {
  const [autopilot, setAutopilot] = useState(false);
  return (
    <Section title="Channels" defaultOpen={true}>
      <div className="px-3 space-y-2">
        {/* Autopilot toggle */}
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <Zap className={cn('h-3.5 w-3.5', autopilot ? 'text-orange-500' : 'text-muted-foreground')} />
            <div>
              <p className="text-xs font-medium">Autopilot</p>
              <p className="text-[10px] text-muted-foreground">Auto-post approved content</p>
            </div>
          </div>
          <button
            onClick={() => setAutopilot(p => !p)}
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors flex-shrink-0',
              autopilot ? 'bg-orange-500' : 'bg-border',
            )}
          >
            <span className={cn(
              'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              autopilot ? 'translate-x-4' : 'translate-x-0',
            )} />
          </button>
        </div>
        {/* Connect channels CTA */}
        <p className="text-[10px] text-muted-foreground px-0.5">
          Connect all channels to enable autopilot
        </p>
        <button className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-1.5 text-[11px] text-muted-foreground hover:border-orange-300 hover:text-orange-600 transition-colors">
          <PlusCircle className="h-3 w-3" />
          Add channel
        </button>
      </div>
    </Section>
  );
}

// ── Upcoming Tasks section ────────────────────────────────────────────────────

type LiveTask = { id: string; label: string; agent: string; dueIn: string; priority: 'high' | 'medium' | 'low'; done: boolean };

function TasksSection() {
  const { activeWorkspace } = useWorkspace();
  const [tasks, setTasks] = useState<LiveTask[]>(MOCK_TASKS);
  const [loaded, setLoaded] = useState(false);
  const pending = tasks.filter(t => !t.done);
  const done    = tasks.filter(t => t.done);

  // Fetch real upcoming agent deployments
  useEffect(() => {
    if (!activeWorkspace?.id || loaded) return;
    fetch(`/api/workspaces/${activeWorkspace.id}/agent-deployments`)
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : (data as { deployments?: unknown[] } | null)?.deployments ?? [];
        if (arr.length === 0) return;
        const now = Date.now();
        const live: LiveTask[] = (arr as Array<{
          id: string; sectionTitle?: string; agentName?: string;
          scheduledFor?: string; status?: string;
        }>).slice(0, 5).map(d => {
          const ms = d.scheduledFor ? new Date(d.scheduledFor).getTime() - now : 0;
          const daysLeft = Math.ceil(ms / 86400000);
          return {
            id: d.id,
            label: d.sectionTitle || d.agentName || 'Scheduled task',
            agent: d.agentName || 'Agent',
            dueIn: daysLeft > 0 ? `in ${daysLeft}d` : '',
            priority: 'medium' as const,
            done: d.status === 'completed',
          };
        });
        setTasks(live);
        setLoaded(true);
      })
      .catch(() => {});
  }, [activeWorkspace?.id, loaded]);

  const viewAllAction = (
    <button className="text-[10px] text-orange-500 hover:underline font-medium">View all</button>
  );

  return (
    <Section
      title="Upcoming Tasks"
      action={viewAllAction}
      defaultOpen={true}
    >
      <div className="px-3 space-y-0.5">
        {pending.map(t => (
          <button
            key={t.id}
            onClick={() => setTasks(prev => prev.map(x => x.id === t.id ? { ...x, done: true } : x))}
            className="flex items-start gap-2 w-full rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors text-left group"
          >
            <div className={cn(
              'mt-0.5 h-3.5 w-3.5 rounded border-[1.5px] flex-shrink-0',
              t.priority === 'high'   ? 'border-orange-400' :
              t.priority === 'medium' ? 'border-blue-400'   : 'border-border',
            )} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground leading-snug">{t.label}</p>
              <p className="text-[10px] text-muted-foreground">{t.agent}{t.dueIn ? ` · ${t.dueIn}` : ''}</p>
            </div>
          </button>
        ))}
        {done.length > 0 && (
          <div className="mt-1 space-y-0.5 opacity-50">
            {done.map(t => (
              <div key={t.id} className="flex items-start gap-2 px-2 py-1.5">
                <div className="mt-0.5 h-3.5 w-3.5 rounded border-[1.5px] border-green-500 bg-green-500 flex-shrink-0 flex items-center justify-center">
                  <svg className="h-2 w-2 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground line-through leading-snug">{t.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Brand KB section ──────────────────────────────────────────────────────────

function BrandKBSection() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? MOCK_BRAND_FILES : MOCK_BRAND_FILES.slice(0, 2);
  const hidden  = MOCK_BRAND_FILES.length - 2;

  return (
    <Section title="Brand Knowledge Base" defaultOpen={true}>
      <div className="px-3 space-y-0.5">
        {visible.map(f => (
          <div
            key={f.name}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer group"
          >
            <div className="h-6 w-6 rounded bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{f.name}</p>
              <p className="text-[10px] text-muted-foreground">{f.date}</p>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        ))}
        {!showAll && hidden > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-left text-[10px] text-orange-500 hover:underline px-2 py-1"
          >
            View all ({hidden} more)
          </button>
        )}
      </div>
    </Section>
  );
}

// ── Agents section ────────────────────────────────────────────────────────────

function AgentsSection() {
  const statusColor = (s: string) =>
    s === 'online'  ? 'bg-green-500'  :
    s === 'working' ? 'bg-orange-400' : 'bg-gray-400';
  const statusLabel = (s: string) =>
    s === 'online'  ? 'Ready'      :
    s === 'working' ? 'Working...' : 'Idle';

  return (
    <Section title="Your AI Team" defaultOpen={false}>
      <div className="px-3 space-y-0.5">
        {MOCK_AGENTS.map(a => (
          <div key={a.name} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
            <div className={cn('h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0', a.color)}>
              {a.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{a.name}</p>
              <p className="text-[10px] text-muted-foreground">{a.role}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className={cn('h-1.5 w-1.5 rounded-full', statusColor(a.status))} />
              <span className="text-[10px] text-muted-foreground">{statusLabel(a.status)}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

interface RightPanelProps {
  className?: string;
  onModuleSelect?: (id: string) => void;
}

export function RightPanel({ className }: RightPanelProps) {
  return (
    <div className={cn(
      'w-[380px] flex-shrink-0 border-l border-border/60 bg-background/50 flex flex-col overflow-hidden',
      className,
    )}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <BarChart2 className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-semibold text-foreground">Overview</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5">
            <Calendar className="h-3 w-3" />
            <span>Last 30 days</span>
          </button>
        </div>
      </div>

      {/* Scrollable sections */}
      <ScrollArea className="flex-1">
        <MetricsSection />
        <ChannelsSection />
        <TasksSection />
        <BrandKBSection />
        <AgentsSection />
      </ScrollArea>
    </div>
  );
}
