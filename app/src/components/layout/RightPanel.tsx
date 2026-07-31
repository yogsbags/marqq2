import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  ChevronDown, ChevronRight, BookOpen, Zap,
  Calendar, PlusCircle, BarChart2, PlugZap,
  Linkedin, Youtube, Facebook, Globe, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { AGENTS } from '@/components/onboarding/constants';
import { getGA4PropertyId, getMetaAdAccountId, getGoogleAdsCustomerId, getGscSiteUrl } from '@/components/settings/tabs/AccountsTab';
import { loadLibraryArtifacts, type LibraryArtifactRow } from '@/lib/persistence';
import { CONNECTOR_DISPLAY, isConnectorActive } from '@/lib/connectorMeta';

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
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="min-w-0 flex flex-1 items-center justify-between gap-2 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </span>
          {open
            ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          }
        </button>
        <div className="flex items-center gap-2">
          {action}
        </div>
      </div>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

// ── Metrics section ───────────────────────────────────────────────────────────

type MiniKpi = { label: string; value: string; delta: string; trend: 'up' | 'down' | 'flat'; source: string }

function MetricsSection({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [kpis, setKpis] = useState<MiniKpi[]>([]);
  const [connectedSources, setConnectedSources] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeWorkspace?.id || loaded) return;
    const wsId = activeWorkspace.id;
    const ga4Prop = getGA4PropertyId(wsId) || '';
    const metaAcct = getMetaAdAccountId(wsId) || '';
    const googleCust = getGoogleAdsCustomerId(wsId) || '';
    const gscSite = getGscSiteUrl(wsId) || '';
    const dashUrl = `/api/analytics/dashboard?period=30d&companyId=${encodeURIComponent(wsId)}${ga4Prop ? `&ga4PropertyId=${encodeURIComponent(ga4Prop)}` : ''}${metaAcct ? `&metaAdsAccount=${encodeURIComponent(metaAcct)}` : ''}${googleCust ? `&googleAdsCustomer=${encodeURIComponent(googleCust)}` : ''}${gscSite ? `&gscSiteUrl=${encodeURIComponent(gscSite)}` : ''}`;
    fetch(dashUrl)
      .then(r => r.ok ? r.json() : null)
      .then((data: { connected?: boolean; connectedSources?: Array<{id:string;name:string}>; kpis?: Array<{label:string;value:string;delta:string;trend:string;sub?:string}> } | null) => {
        setLoaded(true);
        if (!data?.connected || !data.kpis?.length) return;
        // Pick top 4 KPIs for the mini panel
        const top = data.kpis.slice(0, 4).map(k => ({
          label: k.label,
          value: k.value,
          delta: k.delta,
          trend: (k.trend as 'up' | 'down' | 'flat') || 'flat',
          source: k.sub || '',
        }));
        setKpis(top);
        setConnectedSources((data.connectedSources ?? []).map((s: {id:string;name:string}) => s.name));
      })
      .catch(() => setLoaded(true));
  }, [activeWorkspace?.id, loaded]);

  useEffect(() => {
    setLoaded(false);
    setKpis([]);
    setConnectedSources([]);
  }, [activeWorkspace?.id]);

  if (loaded && kpis.length > 0) {
    return (
      <Section title="Metrics">
        <div className="px-3 py-1 space-y-2">
          {/* Connected sources pill row */}
          <div className="flex flex-wrap gap-1.5">
            {connectedSources.map(name => (
              <span key={name} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {name}
              </span>
            ))}
          </div>
          {/* Mini KPI grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {kpis.map(k => (
              <button
                key={k.label}
                onClick={() => onModuleSelect?.('execution-dashboard')}
                className="rounded-lg border border-border/50 bg-background/80 p-2 text-left hover:border-orange-300/60 transition-colors"
              >
                <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
                <p className="text-sm font-bold text-foreground leading-tight mt-0.5">{k.value}</p>
                <p className={cn(
                  'text-[10px] font-medium mt-0.5',
                  k.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' :
                  k.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                )}>{k.delta}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => onModuleSelect?.('execution-dashboard')}
            className="w-full text-[10px] text-orange-500 hover:underline text-center py-0.5"
          >
            View full report →
          </button>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Metrics">
      <div className="px-3 py-1">
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 flex flex-col items-center text-center gap-2">
          <PlugZap className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground leading-5">
            Connect GA4, Search Console, or an ads account to see live performance metrics here.
          </p>
          <button
            onClick={() => onModuleSelect?.('integrations')}
            className="text-[11px] font-medium text-orange-500 hover:underline"
          >
            Connect GA4
          </button>
        </div>
      </div>
    </Section>
  );
}

// Social channel display config
type SocialChannelConfig = { name: string; color: string; textColor: string; Icon: React.ComponentType<{ className?: string }> };
const SOCIAL_CHANNEL_MAP: Record<string, SocialChannelConfig> = {
  linkedin:  { name: 'LinkedIn',   color: 'bg-blue-600',  textColor: 'text-white', Icon: Linkedin },
  instagram: { name: 'Instagram',  color: 'bg-pink-500',  textColor: 'text-white', Icon: MessageSquare },
  facebook:  { name: 'Facebook',   color: 'bg-blue-700',  textColor: 'text-white', Icon: Facebook },
  youtube:   { name: 'YouTube',    color: 'bg-red-500',   textColor: 'text-white', Icon: Youtube },
  wordpress: { name: 'WordPress',  color: 'bg-blue-400',  textColor: 'text-white', Icon: Globe },
  webflow:   { name: 'Webflow',    color: 'bg-indigo-500', textColor: 'text-white', Icon: Globe },
  reddit:    { name: 'Reddit',     color: 'bg-orange-500', textColor: 'text-white', Icon: MessageSquare },
  tiktok:    { name: 'TikTok',     color: 'bg-zinc-900',  textColor: 'text-white', Icon: MessageSquare },
};

type ConnectedChannel = SocialChannelConfig & { id: string };

// ── Connected connectors dropdown ─────────────────────────────────────────────

function ConnectorsDropdownSection({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [connectors, setConnectors] = useState<Array<{ id: string; name: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeWorkspace?.id || loaded) return;
    fetch(`/api/integrations?companyId=${encodeURIComponent(activeWorkspace.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { connectors?: Array<{ id: string; name?: string; connected?: boolean; status?: string }> } | null) => {
        setLoaded(true);
        const active = (data?.connectors ?? [])
          .filter((c) => isConnectorActive(c))
          .map((c) => ({
            id: c.id,
            name: CONNECTOR_DISPLAY[c.id]?.label || c.name || c.id,
          }));
        setConnectors(active);
      })
      .catch(() => setLoaded(true));
  }, [activeWorkspace?.id, loaded]);

  useEffect(() => {
    setLoaded(false);
    setConnectors([]);
  }, [activeWorkspace?.id]);

  return (
    <Section
      title="Connectors"
      defaultOpen={true}
      action={
        <button
          type="button"
          onClick={() => onModuleSelect?.('integrations')}
          className="text-[10px] text-orange-500 hover:underline"
        >
          Manage
        </button>
      }
    >
      <div className="px-3 pb-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left hover:border-orange-400/50 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <PlugZap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span className="text-xs font-medium truncate">
              {connectors.length ? `${connectors.length} connected` : 'No connectors yet'}
            </span>
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>

        {open && (
          <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-muted/20">
            {connectors.length === 0 ? (
              <p className="px-2.5 py-3 text-[11px] text-muted-foreground text-center">
                Connect accounts in Settings to make artifacts live.
              </p>
            ) : (
              connectors.map((c) => {
                const meta = CONNECTOR_DISPLAY[c.id];
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5 last:border-0"
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white',
                        meta?.bg || 'bg-zinc-600'
                      )}
                    >
                      {(meta?.label || c.name).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{c.name}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Channels / Autopilot section ──────────────────────────────────────────────

function ChannelsSection({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [channels, setChannels] = useState<ConnectedChannel[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeWorkspace?.id || loaded) return;
    fetch(`/api/integrations?companyId=${encodeURIComponent(activeWorkspace.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { connectors?: Array<{ id: string; connected?: boolean; status?: string }> } | null) => {
        setLoaded(true);
        const active = (data?.connectors ?? []).filter(c => c.connected || c.status === 'active');
        const social: ConnectedChannel[] = active
          .filter(c => SOCIAL_CHANNEL_MAP[c.id])
          .map(c => ({ ...SOCIAL_CHANNEL_MAP[c.id], id: c.id }));
        setChannels(social);
      })
      .catch(() => setLoaded(true));
  }, [activeWorkspace?.id, loaded]);

  useEffect(() => {
    setLoaded(false);
    setChannels([]);
  }, [activeWorkspace?.id]);

  return (
    <Section title="Channels" defaultOpen={true}>
      <div className="px-3 space-y-2">
        {/* Publishing mode is approval-gated; the sidebar does not pretend to
            toggle a server-side autopilot setting locally. */}
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium">Publishing mode</p>
              <p className="text-[10px] text-muted-foreground">Approval required before anything goes live</p>
            </div>
          </div>
          <button type="button" onClick={() => onModuleSelect?.('draft-approvals')} className="text-[10px] font-medium text-orange-500 hover:underline">Approvals</button>
        </div>

        {/* Connected social channels */}
        {channels.length > 0 ? (
          <div className="space-y-0.5">
            {channels.map(ch => (
              <div key={ch.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted/50 transition-colors">
                <div className={cn('h-6 w-6 rounded flex items-center justify-center flex-shrink-0', ch.color)}>
                  <ch.Icon className={cn('h-3 w-3', ch.textColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{ch.name}</p>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex-shrink-0">Connected</span>
              </div>
            ))}
            <button
              onClick={() => onModuleSelect?.('integrations')}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-1 text-[11px] text-muted-foreground hover:border-orange-300 hover:text-orange-600 transition-colors mt-1"
            >
              <PlusCircle className="h-3 w-3" />
              Add channel
            </button>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground px-0.5">
              Connect social channels to enable autopilot
            </p>
            <button
              onClick={() => onModuleSelect?.('integrations')}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-1.5 text-[11px] text-muted-foreground hover:border-orange-300 hover:text-orange-600 transition-colors"
            >
              <PlusCircle className="h-3 w-3" />
              Add channel
            </button>
          </>
        )}
      </div>
    </Section>
  );
}

// ── Upcoming Tasks section ────────────────────────────────────────────────────

type LiveTask = { id: string; label: string; agent: string; dueIn: string; priority: 'high' | 'medium' | 'low'; done: boolean };

function TasksSection({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pending = tasks.filter(t => !t.done);
  const done    = tasks.filter(t => t.done);

  // Fetch real upcoming agent deployments
  useEffect(() => {
    if (!activeWorkspace?.id || loaded) return;
    fetch(`/api/workspaces/${activeWorkspace.id}/agent-deployments`)
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        setLoaded(true);
        const arr = Array.isArray(data) ? data : (data as { deployments?: unknown[] } | null)?.deployments ?? [];
        if (arr.length === 0) return;
        const now = Date.now();
        const live: LiveTask[] = (arr as Array<{
          id: string; sectionTitle?: string; agentName?: string;
          scheduledFor?: string; status?: string;
        }>).slice(0, 5).map(d => {
          const ms = d.scheduledFor ? new Date(d.scheduledFor).getTime() - now : 0;
          let dueIn = '';
          if (ms > 0) {
            const totalMins = Math.round(ms / 60000);
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            if (hours > 0 && mins > 0) dueIn = `in ${hours}h ${mins}m`;
            else if (hours > 0) dueIn = `in ${hours}h`;
            else if (mins > 0) dueIn = `in ${mins}m`;
            else dueIn = 'soon';
          }
          return {
            id: d.id,
            label: d.sectionTitle || d.agentName || 'Scheduled task',
            agent: d.agentName || 'Agent',
            dueIn,
            priority: 'medium' as const,
            done: d.status === 'completed',
          };
        });
        setTasks(live);
      })
      .catch(() => { setLoaded(true); });
  }, [activeWorkspace?.id, loaded]);

  useEffect(() => {
    setLoaded(false);
    setTasks([]);
  }, [activeWorkspace?.id]);

  // Re-fetch when a new deployment is created (e.g. post-onboarding welcome)
  useEffect(() => {
    const handler = () => setLoaded(false);
    window.addEventListener('marqq:deployment-created', handler);
    return () => window.removeEventListener('marqq:deployment-created', handler);
  }, []);

  const viewAllAction = (
    <button
      onClick={() => onModuleSelect?.('scheduled-jobs')}
      className="text-[10px] text-orange-500 hover:underline font-medium"
    >
      View all
    </button>
  );

  return (
    <Section
      title="Upcoming Tasks"
      action={viewAllAction}
      defaultOpen={true}
    >
      <div className="px-3 space-y-0.5">
        {loaded && pending.length === 0 && done.length === 0 && (
          <div className="py-3 text-center">
            <p className="text-xs text-muted-foreground leading-5">No upcoming tasks yet.</p>
            <p className="text-[10px] text-muted-foreground">Your agents will schedule work here.</p>
          </div>
        )}
        {pending.map(t => (
          <button
            key={t.id}
            onClick={() => onModuleSelect?.('scheduled-jobs')}
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

type BrandFile = { name: string; updatedAt?: string };

function extractArtifactTitle(row: LibraryArtifactRow): string {
  const artifact = row.artifact || {};
  const candidates = ['report_title', 'title', 'headline', 'name', 'subject'];
  for (const key of candidates) {
    const value = artifact[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const agent = typeof row.agent === 'string' && row.agent.trim() ? row.agent.trim() : 'Saved';
  return `${agent.charAt(0).toUpperCase()}${agent.slice(1)} artifact`;
}

function BrandKBSection({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [files, setFiles] = useState<BrandFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? files : files.slice(0, 2);
  const hidden  = files.length - 2;

  useEffect(() => {
    if (!activeWorkspace?.id || loaded) return;
    loadLibraryArtifacts(activeWorkspace.id)
      .then((rows) => {
        setLoaded(true);
        const arr: BrandFile[] = rows.slice(0, 10).map((row) => ({
          name: extractArtifactTitle(row),
          updatedAt: row.saved_at,
        }));
        setFiles(arr);
      })
      .catch(() => setLoaded(true));
  }, [activeWorkspace?.id, loaded]);

  useEffect(() => {
    setLoaded(false);
    setFiles([]);
    setShowAll(false);
  }, [activeWorkspace?.id]);

  useEffect(() => {
    const handler = () => setLoaded(false);
    window.addEventListener('marqq:library-updated', handler);
    return () => window.removeEventListener('marqq:library-updated', handler);
  }, []);

  return (
    <Section title="Brand Knowledge Base" defaultOpen={true}>
      <div className="px-3 space-y-0.5">
        {loaded && files.length === 0 ? (
          <div className="py-3 text-center">
            <p className="text-xs text-muted-foreground leading-5">No brand files yet.</p>
            <button
              onClick={() => onModuleSelect?.('workspace-files')}
              className="text-[10px] text-orange-500 hover:underline font-medium"
            >
              Go to Workspace Files
            </button>
          </div>
        ) : (
          <>
            {visible.map(f => (
              <div
                key={f.name}
                onClick={() => onModuleSelect?.('workspace-files')}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                <div className="h-6 w-6 rounded bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{f.name}</p>
                  {f.updatedAt && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(f.updatedAt).toLocaleDateString()}
                    </p>
                  )}
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
          </>
        )}
      </div>
    </Section>
  );
}

// ── Agents section ────────────────────────────────────────────────────────────

function AgentsSection() {
  return (
    <Section title="Your AI Team" defaultOpen={false}>
      <div className="px-3 space-y-0.5">
        {AGENTS.map(a => (
          <div key={a.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
            <div
              className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: a.color }}
            >
              {a.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{a.name}</p>
              <p className="text-[10px] text-muted-foreground">{a.role} · {a.specialty}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function NorthStarSection({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [goal, setGoal] = useState<{ north_star_metric?: string; quantified_target?: string; timeline_target?: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setGoal(null);
    if (!activeWorkspace?.id) return;
    fetch(`/api/gtm/goal?companyId=${encodeURIComponent(activeWorkspace.id)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data: { goal?: { north_star_metric?: string; quantified_target?: string; timeline_target?: string } | null } | null) => {
        setGoal(data?.goal || null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [activeWorkspace?.id]);

  return (
    <Section title="North Star" defaultOpen={true}>
      <div className="px-3">
        {!loaded ? <div className="h-16 animate-pulse rounded-lg bg-muted/40" /> : goal ? (
          <button type="button" onClick={() => onModuleSelect?.('execution-dashboard')} className="w-full rounded-lg border border-orange-500/25 bg-orange-500/[0.04] p-2.5 text-left hover:border-orange-500/50 transition-colors">
            <p className="text-xs font-semibold leading-4">{goal.north_star_metric}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{goal.quantified_target || 'Target not specified'} · {goal.timeline_target || 'Timeline not specified'}</p>
            <p className="mt-2 text-[10px] font-medium text-orange-600">Open control center →</p>
          </button>
        ) : (
          <button type="button" onClick={() => onModuleSelect?.('main')} className="w-full rounded-lg border border-dashed border-border/70 p-3 text-left hover:border-orange-400/50 transition-colors">
            <p className="text-xs font-medium">No locked North Star yet</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Lock the GTM strategy in #main before interpreting channel performance.</p>
          </button>
        )}
      </div>
    </Section>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

interface RightPanelProps {
  className?: string;
  onModuleSelect?: (id: string) => void;
}

export function RightPanel({ className, onModuleSelect }: RightPanelProps) {
  return (
    <div className={cn(
      'hidden xl:flex w-[340px] flex-shrink-0 border-l border-border/60 bg-background/50 flex-col overflow-hidden',
      className,
    )}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <BarChart2 className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-semibold text-foreground">Overview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onModuleSelect?.('calendar')}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
          >
            <Calendar className="h-3 w-3" />
            <span>Calendar</span>
          </button>
        </div>
      </div>

      {/* Scrollable sections */}
      <ScrollArea className="flex-1">
        <NorthStarSection onModuleSelect={onModuleSelect} />
        <MetricsSection onModuleSelect={onModuleSelect} />
        <ConnectorsDropdownSection onModuleSelect={onModuleSelect} />
        <ChannelsSection onModuleSelect={onModuleSelect} />
        <TasksSection onModuleSelect={onModuleSelect} />
        <BrandKBSection onModuleSelect={onModuleSelect} />
        <AgentsSection />
      </ScrollArea>
    </div>
  );
}
