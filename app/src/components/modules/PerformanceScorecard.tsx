import { useEffect, useState } from 'react'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'
import { getGA4PropertyId } from '@/components/settings/tabs/AccountsTab'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  TrendingUp, TrendingDown, Minus,
  BarChart2, Globe, Search, MousePointerClick,
  Eye, ArrowUpRight, RefreshCw, PlugZap, CheckCircle2,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type Trend = 'up' | 'down' | 'flat'

type KpiCard = {
  label: string
  value: string
  delta: string
  trend: Trend
  sub?: string
}

type ChartPoint = { date: string; value: number; prev?: number }

type TopPage = { path: string; sessions: number; delta: number }
type TopQuery = { query: string; clicks: number; impressions: number; position: number }
type ChannelRow = { channel: string; sessions: number; pct: number; delta: number }

type ConnectedSource = { id: string; name: string; connectedAt?: string | null }

type DashboardData = {
  lastUpdated: string
  period: string
  kpis: KpiCard[]
  trafficChart: ChartPoint[]
  conversionChart: ChartPoint[]
  topPages: TopPage[]
  topQueries: TopQuery[]
  channels: ChannelRow[]
  connected: boolean
  connectedSources?: ConnectedSource[]
}

// ─── Placeholder / skeleton data ─────────────────────────────────────────────

function buildEmptyData(): DashboardData {
  const today = new Date()
  const trafficChart: ChartPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (29 - i))
    return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: 0 }
  })
  return {
    lastUpdated: '',
    period: 'Last 30 days',
    connected: false,
    kpis: [
      { label: 'Sessions', value: '—', delta: '—', trend: 'flat' },
      { label: 'Organic Clicks', value: '—', delta: '—', trend: 'flat' },
      { label: 'Impressions', value: '—', delta: '—', trend: 'flat' },
      { label: 'Avg. Position', value: '—', delta: '—', trend: 'flat' },
      { label: 'Bounce Rate', value: '—', delta: '—', trend: 'flat' },
      { label: 'Conversions', value: '—', delta: '—', trend: 'flat' },
    ],
    trafficChart,
    conversionChart: trafficChart,
    topPages: [],
    topQueries: [],
    channels: [],
  }
}

// ─── Mock data for demo ────────────────────────────────────────────────────────

function buildMockData(): DashboardData {
  const today = new Date()
  const trafficChart: ChartPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (29 - i))
    const base = 1200 + Math.sin(i * 0.4) * 300
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Math.round(base + Math.random() * 200),
      prev: Math.round(base * 0.85 + Math.random() * 150),
    }
  })
  const conversionChart: ChartPoint[] = trafficChart.map(p => ({
    date: p.date,
    value: Math.round(p.value * 0.032 + Math.random() * 5),
    prev: Math.round((p.prev || 0) * 0.028 + Math.random() * 3),
  }))

  return {
    lastUpdated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    period: 'Last 30 days',
    connected: false, // still shows "connect GA4" CTA but renders demo data
    kpis: [
      { label: 'Sessions',        value: '38,214',   delta: '+12.4%', trend: 'up',   sub: 'vs prev period' },
      { label: 'Organic Clicks',  value: '14,892',   delta: '+8.7%',  trend: 'up',   sub: 'Google Search Console' },
      { label: 'Impressions',     value: '312,740',  delta: '+21.3%', trend: 'up',   sub: 'GSC total' },
      { label: 'Avg. Position',   value: '11.2',     delta: '-1.4',   trend: 'up',   sub: 'lower is better' },
      { label: 'Bounce Rate',     value: '54.1%',    delta: '-3.2pp', trend: 'up',   sub: 'engagement rate' },
      { label: 'Goal Completions',value: '1,243',    delta: '+18.9%', trend: 'up',   sub: 'all goals' },
    ],
    trafficChart,
    conversionChart,
    topPages: [
      { path: '/blog/ai-marketing-guide',  sessions: 4820, delta: 22 },
      { path: '/pricing',                   sessions: 3210, delta: 8  },
      { path: '/features/lead-scoring',     sessions: 2980, delta: 15 },
      { path: '/blog/seo-automation',       sessions: 2540, delta: -4 },
      { path: '/integrations',              sessions: 1890, delta: 31 },
    ],
    topQueries: [
      { query: 'ai marketing automation',   clicks: 1240, impressions: 18400, position: 3.2 },
      { query: 'b2b lead scoring software', clicks: 890,  impressions: 12100, position: 5.7 },
      { query: 'marketing intelligence platform', clicks: 760, impressions: 9800, position: 4.1 },
      { query: 'content automation tool',   clicks: 640,  impressions: 8200,  position: 6.8 },
      { query: 'seo content generator',     clicks: 590,  impressions: 7600,  position: 7.4 },
    ],
    channels: [
      { channel: 'Organic Search', sessions: 18420, pct: 48, delta: 14 },
      { channel: 'Direct',         sessions: 9810,  pct: 26, delta: 5  },
      { channel: 'Referral',       sessions: 5430,  pct: 14, delta: -2 },
      { channel: 'Social',         sessions: 3020,  pct: 8,  delta: 22 },
      { channel: 'Email',          sessions: 1534,  pct: 4,  delta: 9  },
    ],
  }
}

// ─── Mini helpers ─────────────────────────────────────────────────────────────

function TrendIcon({ trend, size = 14 }: { trend: Trend; size?: number }) {
  if (trend === 'up')   return <TrendingUp   className="text-emerald-500" style={{ width: size, height: size }} />
  if (trend === 'down') return <TrendingDown className="text-red-500"     style={{ width: size, height: size }} />
  return <Minus className="text-muted-foreground" style={{ width: size, height: size }} />
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiTile({ card }: { card: KpiCard }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-4 flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
      <p className="text-2xl font-bold text-foreground leading-none">{card.value}</p>
      <div className="flex items-center gap-1 mt-auto pt-1">
        <TrendIcon trend={card.trend} />
        <span className={cn(
          'text-[11px] font-medium',
          card.trend === 'up'   ? 'text-emerald-600 dark:text-emerald-400' :
          card.trend === 'down' ? 'text-red-600 dark:text-red-400' :
          'text-muted-foreground'
        )}>{card.delta}</span>
        {card.sub && <span className="text-[10px] text-muted-foreground ml-1">{card.sub}</span>}
      </div>
    </div>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name === 'prev' ? 'Prev period' : 'This period'}:</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Connect / Connected banner ───────────────────────────────────────────────

function ConnectBanner({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-orange-300/60 bg-orange-50/40 dark:border-orange-800/40 dark:bg-orange-950/20 px-4 py-3 text-sm">
      <PlugZap className="h-4 w-4 text-orange-500 flex-shrink-0" />
      <p className="text-muted-foreground flex-1">
        Showing <span className="font-medium text-foreground">demo data</span> — connect Google Analytics 4 &amp; Search Console for live metrics.
      </p>
      <button
        onClick={() => onModuleSelect?.('integrations')}
        className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium hover:underline text-[11px] flex-shrink-0"
      >
        Connect <ArrowUpRight className="h-3 w-3" />
      </button>
    </div>
  )
}

function ConnectedBanner({ sources, onModuleSelect }: { sources: ConnectedSource[]; onModuleSelect?: (id: string) => void }) {
  const SOURCE_COLORS: Record<string, string> = {
    ga4: 'bg-[#F9AB00]',
    gsc: 'bg-[#34A853]',
    google_ads: 'bg-[#4285F4]',
    meta_ads: 'bg-[#0866FF]',
    linkedin_ads: 'bg-[#0A66C2]',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-300/50 bg-emerald-50/40 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-4 py-3 text-sm">
      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
      <div className="flex-1 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Live data from</span>
        {sources.map(s => (
          <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
            <span className={cn('h-2 w-2 rounded-full', SOURCE_COLORS[s.id] ?? 'bg-slate-400')} />
            {s.name}
          </span>
        ))}
      </div>
      <button
        onClick={() => onModuleSelect?.('integrations')}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-[11px] flex-shrink-0"
      >
        Manage <ArrowUpRight className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-orange-500">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {sub && <span className="text-[11px] text-muted-foreground ml-auto">{sub}</span>}
    </div>
  )
}

// ─── Traffic chart ────────────────────────────────────────────────────────────

function TrafficChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-4">
      <SectionHeader icon={<BarChart2 className="h-4 w-4" />} title="Sessions over time" sub="30-day window" />
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f97316" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="areaGradPrev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false}
            interval={Math.floor(data.length / 5)} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false}
            tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="prev" stroke="#94a3b8" strokeWidth={1.5} fill="url(#areaGradPrev)"
            strokeDasharray="4 2" name="prev" dot={false} />
          <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} fill="url(#areaGrad)"
            name="sessions" dot={false} activeDot={{ r: 4, fill: '#f97316' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Conversion chart ─────────────────────────────────────────────────────────

function ConversionChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-4">
      <SectionHeader icon={<MousePointerClick className="h-4 w-4" />} title="Goal completions" sub="30-day window" />
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false}
            interval={Math.floor(data.length / 5)} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" name="completions" fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Channel breakdown ────────────────────────────────────────────────────────

function ChannelTable({ rows }: { rows: ChannelRow[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-4">
      <SectionHeader icon={<Globe className="h-4 w-4" />} title="Traffic by channel" />
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.channel} className="flex items-center gap-2">
            <span className="text-xs text-foreground w-32 truncate flex-shrink-0">{r.channel}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${r.pct}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground w-14 text-right">{fmt(r.sessions)}</span>
            <span className={cn(
              'text-[11px] w-12 text-right',
              r.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : r.delta < 0 ? 'text-red-500' : 'text-muted-foreground'
            )}>
              {r.delta > 0 ? '+' : ''}{r.delta}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Top pages ────────────────────────────────────────────────────────────────

function TopPagesTable({ pages }: { pages: TopPage[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-4">
      <SectionHeader icon={<Eye className="h-4 w-4" />} title="Top pages" sub="by sessions" />
      <div className="space-y-1.5">
        {pages.map((p, i) => (
          <div key={p.path} className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] text-muted-foreground w-4 text-right flex-shrink-0">{i + 1}</span>
            <span className="text-xs text-foreground flex-1 truncate font-mono">{p.path}</span>
            <span className="text-[11px] text-muted-foreground w-12 text-right">{fmt(p.sessions)}</span>
            <span className={cn(
              'text-[11px] w-10 text-right',
              p.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
            )}>
              {p.delta > 0 ? '+' : ''}{p.delta}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Top queries ──────────────────────────────────────────────────────────────

function TopQueriesTable({ queries }: { queries: TopQuery[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-4">
      <SectionHeader icon={<Search className="h-4 w-4" />} title="Top search queries" sub="Google Search Console" />
      <div className="space-y-1.5">
        <div className="grid grid-cols-4 text-[10px] text-muted-foreground pb-1 border-b border-border/40">
          <span className="col-span-2">Query</span>
          <span className="text-right">Clicks</span>
          <span className="text-right">Position</span>
        </div>
        {queries.map(q => (
          <div key={q.query} className="grid grid-cols-4 items-center py-0.5">
            <span className="text-xs text-foreground col-span-2 truncate">{q.query}</span>
            <span className="text-[11px] text-muted-foreground text-right">{fmt(q.clicks)}</span>
            <span className={cn(
              'text-[11px] text-right font-medium',
              q.position <= 5 ? 'text-emerald-600 dark:text-emerald-400' :
              q.position <= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
            )}>{q.position.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Period selector ─────────────────────────────────────────────────────────

const PERIODS = [
  { id: '7d',  label: '7D'  },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
]

// ─── Root export ──────────────────────────────────────────────────────────────

type PerformanceScorecardProps = {
  onModuleSelect?: (id: string) => void
}

export function PerformanceScorecard({ onModuleSelect }: PerformanceScorecardProps = {}) {
  const { activeWorkspace } = useWorkspace()
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState<DashboardData>(buildMockData)
  const [refreshing, setRefreshing] = useState(false)
  const [showAllPages, setShowAllPages] = useState(false)
  const [showAllQueries, setShowAllQueries] = useState(false)

  // Load dashboard data — passes companyId so backend checks real connector status
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const wsId = activeWorkspace?.id
        const ga4Prop = wsId ? (getGA4PropertyId(wsId) || '') : ''
        const url = wsId
          ? `/api/analytics/dashboard?period=${period}&companyId=${encodeURIComponent(wsId)}${ga4Prop ? `&ga4PropertyId=${encodeURIComponent(ga4Prop)}` : ''}`
          : `/api/analytics/dashboard?period=${period}`
        const resp = await fetch(url)
        if (!resp.ok) return
        const json = await resp.json()
        if (cancelled) return
        if (json?.kpis?.length) setData(json)
      } catch {
        // silently keep mock data
      }
    }
    load()
    return () => { cancelled = true }
  }, [period, activeWorkspace?.id])

  async function refresh() {
    setRefreshing(true)
    try {
      const wsId = activeWorkspace?.id
      const ga4Prop = wsId ? (getGA4PropertyId(wsId) || '') : ''
      const url = wsId
        ? `/api/analytics/dashboard?period=${period}&companyId=${encodeURIComponent(wsId)}${ga4Prop ? `&ga4PropertyId=${encodeURIComponent(ga4Prop)}` : ''}`
        : `/api/analytics/dashboard?period=${period}`
      const resp = await fetch(url)
      if (resp.ok) {
        const json = await resp.json()
        if (json?.kpis?.length) setData(json)
      }
    } catch { /* keep current data */ }
    setRefreshing(false)
  }

  const visiblePages   = showAllPages   ? data.topPages   : data.topPages.slice(0, 5)
  const visibleQueries = showAllQueries ? data.topQueries : data.topQueries.slice(0, 5)

  return (
    <ScrollArea className="h-full">
      <div className="px-6 pb-10 pt-4 max-w-5xl mx-auto space-y-5">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Performance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analytics overview · {data.period}
              {data.lastUpdated && <span className="ml-2">Updated {data.lastUpdated}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period pills */}
            <div className="flex rounded-lg border border-border/60 overflow-hidden">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    period === p.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >{p.label}</button>
              ))}
            </div>
            <button
              onClick={refresh}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Connection status banner */}
        {data.connected && data.connectedSources?.length
          ? <ConnectedBanner sources={data.connectedSources} onModuleSelect={onModuleSelect} />
          : <ConnectBanner onModuleSelect={onModuleSelect} />
        }

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {data.kpis.map(k => <KpiTile key={k.label} card={k} />)}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <TrafficChart data={data.trafficChart} />
          </div>
          <div className="lg:col-span-2">
            <ConversionChart data={data.conversionChart} />
          </div>
        </div>

        {/* Bottom tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Channels */}
          <ChannelTable rows={data.channels} />

          {/* Top pages */}
          <div className="rounded-xl border border-border/60 bg-background/80 p-4">
            <SectionHeader icon={<Eye className="h-4 w-4" />} title="Top pages" sub="by sessions" />
            <div className="space-y-1.5">
              {visiblePages.map((p, i) => (
                <div key={p.path} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] text-muted-foreground w-4 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-xs text-foreground flex-1 truncate font-mono">{p.path}</span>
                  <span className="text-[11px] text-muted-foreground w-12 text-right">{fmt(p.sessions)}</span>
                  <span className={cn(
                    'text-[11px] w-10 text-right',
                    p.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                  )}>{p.delta > 0 ? '+' : ''}{p.delta}%</span>
                </div>
              ))}
            </div>
            {data.topPages.length > 5 && (
              <button
                onClick={() => setShowAllPages(v => !v)}
                className="mt-2 flex items-center gap-1 text-[11px] text-orange-500 hover:underline"
              >
                {showAllPages ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> +{data.topPages.length - 5} more</>}
              </button>
            )}
          </div>
        </div>

        {/* GSC queries */}
        <div className="rounded-xl border border-border/60 bg-background/80 p-4">
          <SectionHeader icon={<Search className="h-4 w-4" />} title="Top search queries" sub="Google Search Console" />
          <div className="space-y-1.5">
            <div className="grid grid-cols-4 text-[10px] text-muted-foreground pb-1 border-b border-border/40">
              <span className="col-span-2">Query</span>
              <span className="text-right">Clicks</span>
              <span className="text-right">Position</span>
            </div>
            {visibleQueries.map(q => (
              <div key={q.query} className="grid grid-cols-4 items-center py-0.5">
                <span className="text-xs text-foreground col-span-2 truncate">{q.query}</span>
                <span className="text-[11px] text-muted-foreground text-right">{fmt(q.clicks)}</span>
                <span className={cn(
                  'text-[11px] text-right font-medium',
                  q.position <= 5 ? 'text-emerald-600 dark:text-emerald-400' :
                  q.position <= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                )}>{q.position.toFixed(1)}</span>
              </div>
            ))}
          </div>
          {data.topQueries.length > 5 && (
            <button
              onClick={() => setShowAllQueries(v => !v)}
              className="mt-2 flex items-center gap-1 text-[11px] text-orange-500 hover:underline"
            >
              {showAllQueries ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> +{data.topQueries.length - 5} more</>}
            </button>
          )}
        </div>

      </div>
    </ScrollArea>
  )
}
