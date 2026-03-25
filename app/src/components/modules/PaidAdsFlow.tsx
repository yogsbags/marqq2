import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgentModuleShell } from '@/components/agent/AgentModuleShell'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { toast } from 'sonner'
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, Play, PauseCircle,
  BarChart2, Megaphone, Zap, AlertCircle, CheckCircle2, Loader2, Radar, Target, WalletCards
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface CampaignRow {
  campaign: string
  platform?: string
  spend: number
  impressions: number
  clicks: number
  ctr?: number
  cpc?: number
  roas?: number | null
  conversions?: number
}

interface AutomationResult {
  status: 'completed' | 'error' | string
  error?: string
  campaigns?: CampaignRow[]
  adsets?: unknown[]
  ads?: unknown[]
  date_range?: string
  // create_meta_campaign result
  campaign_id?: string
  adset_id?: string
  creative_id?: string
  ad_id?: string
  campaign_status?: string
  message?: string
  objective?: string
  ad_account_id?: string
  step?: string
  // optimize_meta_roas result
  paused_ads?: Array<{ ad_id: string; name: string; roas: number; spend: number }>
  scaled_adsets?: Array<{ adset_id: string; name: string; old_budget: number; new_budget: number }>
  actions_taken?: number
  roas_summary?: { avg_roas: number; total_spend: number; ads_analyzed: number }
  report?: string
  dry_run?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null | undefined) {
  if (v == null) return '—'
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
function fmtNum(v: number | null | undefined, decimals = 0) {
  if (v == null) return '—'
  return v.toLocaleString('en-IN', { maximumFractionDigits: decimals })
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${Number(v).toFixed(2)}%`
}
function roasBadge(roas: number | null | undefined) {
  if (roas == null) return <span className="text-muted-foreground text-xs">—</span>
  const r = Number(roas)
  if (r >= 3) return <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-xs">{r.toFixed(2)}x</Badge>
  if (r >= 1) return <Badge className="bg-amber-500/15 text-amber-400 border-0 text-xs">{r.toFixed(2)}x</Badge>
  return <Badge className="bg-red-500/15 text-red-400 border-0 text-xs">{r.toFixed(2)}x</Badge>
}

function formatPaidLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    leads: 'Generate leads',
    traffic: 'Drive traffic',
    awareness: 'Build awareness',
    google: 'Google Ads',
    meta: 'Meta Ads',
    linkedin: 'LinkedIn Ads',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildPaidAdsPlanQuery(objective: string, channel: string, initialQuestion?: string) {
  return [
    initialQuestion || `Build a paid ads plan to ${formatPaidLabel(objective)?.toLowerCase() || 'generate demand'}.`,
    `Priority channel: ${formatPaidLabel(channel) || 'Google Ads'}.`,
    `Primary objective: ${formatPaidLabel(objective) || 'Generate leads'}.`,
    'Return the campaign structure, audience direction, budget shape, KPI targets, risk areas, and the first launch or optimization moves to make next.',
    'Keep the answer practical for an active paid media team. Avoid generic ad advice and make the plan channel-aware.',
  ].join('\n\n')
}

async function runAutomation(automationId: string, params: Record<string, unknown>, companyId: string): Promise<AutomationResult> {
  const res = await fetch('/api/automations/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ automation_id: automationId, params, company_id: companyId }),
  })
  return res.json()
}

// ── Tab: Live Performance ────────────────────────────────────────────────────

function LivePerformanceTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState('last_30d')
  const [metaData, setMetaData] = useState<AutomationResult | null>(null)
  const [googleData, setGoogleData] = useState<AutomationResult | null>(null)

  const fetchAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [meta, google] = await Promise.all([
        runAutomation('fetch_meta_ads', { date_range: dateRange }, companyId),
        runAutomation('google_ads_fetch', { date_range: dateRange }, companyId),
      ])
      setMetaData(meta)
      setGoogleData(google)
    } catch (e) {
      toast.error('Failed to fetch ad performance data')
    } finally {
      setLoading(false)
    }
  }, [companyId, dateRange])

  useEffect(() => { if (companyId) fetchAll() }, [companyId, fetchAll])

  const allCampaigns: CampaignRow[] = [
    ...(metaData?.campaigns || []).map(c => ({ ...c, platform: 'Meta' })),
    ...(googleData?.campaigns || []).map(c => ({ ...c, platform: 'Google' })),
  ]

  const totalSpend = allCampaigns.reduce((s, c) => s + (c.spend || 0), 0)
  const totalImpressions = allCampaigns.reduce((s, c) => s + (c.impressions || 0), 0)
  const totalClicks = allCampaigns.reduce((s, c) => s + (c.clicks || 0), 0)
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_7d">Last 7 days</SelectItem>
            <SelectItem value="last_30d">Last 30 days</SelectItem>
            <SelectItem value="this_month">This month</SelectItem>
            <SelectItem value="last_month">Last month</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={fetchAll} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
        {/* Platform status badges */}
        <div className="flex gap-2 ml-auto">
          <PlatformBadge label="Meta" result={metaData} />
          <PlatformBadge label="Google" result={googleData} />
        </div>
      </div>

      {/* Summary KPI cards */}
      {!loading && allCampaigns.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="Total Spend" value={fmtCurrency(totalSpend)} icon={<BarChart2 className="h-4 w-4" />} />
          <KpiCard label="Impressions" value={fmtNum(totalImpressions)} icon={<TrendingUp className="h-4 w-4" />} />
          <KpiCard label="Clicks" value={fmtNum(totalClicks)} icon={<Zap className="h-4 w-4" />} />
          <KpiCard label="Avg CTR" value={fmtPct(avgCTR)} icon={<Megaphone className="h-4 w-4" />} />
        </div>
      )}

      {/* Campaign table */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Fetching live data from Meta &amp; Google…
        </div>
      ) : allCampaigns.length === 0 ? (
        <EmptyState
          title="No campaign data"
          subtitle={
            metaData?.error || googleData?.error
              ? `${metaData?.error || ''} ${googleData?.error || ''}`.trim()
              : `No campaigns found for ${dateRange}. Create a campaign or check your account connections.`
          }
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Campaign</th>
                <th className="text-left px-3 py-2 font-medium">Platform</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Impressions</th>
                <th className="text-right px-3 py-2 font-medium">Clicks</th>
                <th className="text-right px-3 py-2 font-medium">CTR</th>
                <th className="text-right px-3 py-2 font-medium">CPC</th>
                <th className="text-right px-3 py-2 font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {allCampaigns.map((c, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-medium max-w-[200px] truncate">{c.campaign || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs py-0">
                      {c.platform}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(c.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.impressions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.clicks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(c.ctr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(c.cpc)}</td>
                  <td className="px-3 py-2 text-right">{roasBadge(c.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PlatformBadge({ label, result }: { label: string; result: AutomationResult | null }) {
  if (!result) return <Badge variant="outline" className="text-xs gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />{label}</Badge>
  if (result.status === 'error') return <Badge variant="outline" className="text-xs gap-1 text-red-400 border-red-400/30"><AlertCircle className="h-2.5 w-2.5" />{label}</Badge>
  return <Badge variant="outline" className="text-xs gap-1 text-emerald-400 border-emerald-400/30"><CheckCircle2 className="h-2.5 w-2.5" />{label}</Badge>
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3">
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs">{label}</span>
          {icon}
        </div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function PaidAdsPlanTab({
  initialQuestion,
  initialObjective,
  initialChannel,
}: {
  initialQuestion?: string
  initialObjective?: string
  initialChannel?: string
}) {
  const objective = initialObjective || 'leads'
  const channel = initialChannel || 'google'

  const agents = useMemo(
    () => [
      {
        name: 'zara',
        label: 'Build Paid Ads Plan',
        taskType: 'paid_ads_strategy',
        defaultQuery: buildPaidAdsPlanQuery(objective, channel, initialQuestion),
        placeholder: 'Describe the offer, budget pressure, market, or launch context Zara should factor into the plan.',
        tags: ['paid-ads', 'plan', 'budget'],
      },
    ],
    [channel, initialObjective, initialQuestion, objective]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-background to-amber-50/50 text-foreground shadow-[0_28px_80px_-34px_rgba(154,52,18,0.14)] dark:border-orange-900/70 dark:from-zinc-950 dark:via-zinc-950 dark:to-orange-950/40 dark:text-orange-50 dark:shadow-[0_28px_80px_-34px_rgba(124,45,18,0.46)]">
          <CardContent className="space-y-6 p-8 lg:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/50 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-800 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-orange-200">
              Paid Ads Desk
            </div>
            <div className="space-y-3">
              <h2 className="max-w-xl text-4xl tracking-[-0.045em] text-foreground md:text-5xl dark:text-orange-50">
                Launch from a campaign plan that knows the channel, the objective, and the tradeoffs before money goes live.
              </h2>
              <p className="max-w-[60ch] text-sm leading-7 text-muted-foreground dark:text-orange-100/74">
                This flow is built to give the team a sharper paid plan first, then leave the live controls and automation
                workspace available underneath for execution.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <Target className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Objective</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatPaidLabel(objective)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <Radar className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Channel</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatPaidLabel(channel)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:p-10">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Plan stack</div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Structure</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Campaign and ad-set direction built for the chosen objective instead of one generic structure.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Budget shape</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">A clearer read on spend distribution, KPI expectations, and what not to waste money on first.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Launch moves</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">The next build, launch, and optimization actions to move into execution immediately.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[0.82fr_1.18fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.24)] dark:border-orange-950/70 dark:bg-slate-950/86">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">What You Should Get</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-700 dark:text-orange-100/78">
            <div>• A sharper campaign plan before anyone touches live budgets or launches a build.</div>
            <div>• Channel-aware targeting, KPI, and budget guidance that matches the objective.</div>
            <div>• Immediate next moves the team can carry into campaign creation and optimization.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Paid Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Audience</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Who to target first and which audience layers should stay out of the initial launch.</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Budget</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">How to shape early spend and what signals should justify scaling or cutting quickly.</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Risk</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Where the launch can go wrong first: offer, creative, targeting, funnel, or tracking.</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      moduleId="paid-ads-plan"
      title="Run Paid Ads"
      description="Build the campaign plan first, then move into live performance, launch, copy, creative, and ROAS controls."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      resourceContextLabel="Campaign brief, landing page, or media plan URL"
      resourceContextPlaceholder="Paste the brief, landing page, or media plan URL if Zara should anchor the campaign plan to a specific source"
      resourceContextHint="Optional. Use this when the paid plan should follow an exact campaign brief, landing page, or media plan."
      buildResourceContext={(value) => `Use this exact campaign brief, landing page, or media plan if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}

// ── Tab: Create Campaign ──────────────────────────────────────────────────────

const OBJECTIVES = [
  { value: 'OUTCOME_TRAFFIC',     label: 'Traffic — Drive website visits' },
  { value: 'OUTCOME_LEADS',       label: 'Leads — Collect lead form submissions' },
  { value: 'OUTCOME_SALES',       label: 'Sales — Drive conversions & purchases' },
  { value: 'OUTCOME_AWARENESS',   label: 'Awareness — Reach a broad audience' },
  { value: 'OUTCOME_ENGAGEMENT',  label: 'Engagement — Post likes, comments, shares' },
]

const CTAS = ['LEARN_MORE', 'SIGN_UP', 'SHOP_NOW', 'CONTACT_US', 'BOOK_NOW', 'GET_QUOTE', 'DOWNLOAD']

interface CreateForm {
  campaign_name: string
  objective: string
  daily_budget: string
  headline: string
  primary_text: string
  link_url: string
  cta_type: string
  image_url: string
  status: 'PAUSED' | 'ACTIVE'
}

function CreateCampaignTab({ companyId }: { companyId: string }) {
  const [form, setForm] = useState<CreateForm>({
    campaign_name: '',
    objective: 'OUTCOME_TRAFFIC',
    daily_budget: '',
    headline: '',
    primary_text: '',
    link_url: '',
    cta_type: 'LEARN_MORE',
    image_url: '',
    status: 'PAUSED',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AutomationResult | null>(null)

  function set(k: keyof CreateForm, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleCreate() {
    if (!form.campaign_name || !form.daily_budget || !form.headline || !form.primary_text || !form.link_url) {
      toast.error('Fill in all required fields')
      return
    }
    if (!companyId) { toast.error('No workspace selected'); return }

    setLoading(true)
    setResult(null)
    try {
      const params: Record<string, unknown> = {
        campaign_name: form.campaign_name,
        objective: form.objective,
        daily_budget: Math.round(Number(form.daily_budget) * 100), // rupees → paise
        headline: form.headline,
        primary_text: form.primary_text,
        link_url: form.link_url,
        cta_type: form.cta_type,
        status: form.status,
      }
      if (form.image_url) params.image_url = form.image_url
      const res = await runAutomation('create_meta_campaign', params, companyId)
      setResult(res)
      if (res.status === 'completed') {
        toast.success('Campaign created in Meta Ads!')
      } else {
        toast.error(res.error || 'Campaign creation failed')
      }
    } catch {
      toast.error('Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Creates a full Meta Ads campaign — Campaign → Ad Set → Creative → Ad — in PAUSED state for review.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Campaign name */}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Campaign Name <span className="text-red-400">*</span></Label>
          <Input
            value={form.campaign_name}
            onChange={e => set('campaign_name', e.target.value)}
            placeholder="e.g. Productverse AI Platform — April 2026"
            className="h-9"
          />
        </div>

        {/* Objective */}
        <div className="space-y-1.5">
          <Label className="text-xs">Objective <span className="text-red-400">*</span></Label>
          <Select value={form.objective} onValueChange={v => set('objective', v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVES.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Daily budget */}
        <div className="space-y-1.5">
          <Label className="text-xs">Daily Budget (₹) <span className="text-red-400">*</span></Label>
          <Input
            type="number"
            value={form.daily_budget}
            onChange={e => set('daily_budget', e.target.value)}
            placeholder="e.g. 500"
            className="h-9"
          />
          {form.daily_budget && (
            <p className="text-xs text-muted-foreground">≈ ₹{(Number(form.daily_budget) * 30).toLocaleString('en-IN')} / month</p>
          )}
        </div>

        {/* Headline */}
        <div className="space-y-1.5">
          <Label className="text-xs">Headline <span className="text-red-400">*</span></Label>
          <Input
            value={form.headline}
            onChange={e => set('headline', e.target.value)}
            placeholder="Under 40 characters"
            maxLength={40}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">{form.headline.length}/40</p>
        </div>

        {/* CTA */}
        <div className="space-y-1.5">
          <Label className="text-xs">Call to Action</Label>
          <Select value={form.cta_type} onValueChange={v => set('cta_type', v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CTAS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Primary text */}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Primary Text <span className="text-red-400">*</span></Label>
          <Textarea
            value={form.primary_text}
            onChange={e => set('primary_text', e.target.value)}
            placeholder="Under 125 characters for best performance"
            rows={2}
            className="text-sm resize-none"
          />
          <p className="text-xs text-muted-foreground">{form.primary_text.length} chars</p>
        </div>

        {/* Link URL */}
        <div className="space-y-1.5">
          <Label className="text-xs">Destination URL <span className="text-red-400">*</span></Label>
          <Input
            value={form.link_url}
            onChange={e => set('link_url', e.target.value)}
            placeholder="https://yoursite.com/landing"
            className="h-9"
          />
        </div>

        {/* Image URL */}
        <div className="space-y-1.5">
          <Label className="text-xs">Image URL <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            value={form.image_url}
            onChange={e => set('image_url', e.target.value)}
            placeholder="https://... hosted image"
            className="h-9"
          />
        </div>

        {/* Status */}
        <div className="col-span-2 flex items-center gap-3">
          <Label className="text-xs">Launch status:</Label>
          <div className="flex gap-2">
            {(['PAUSED', 'ACTIVE'] as const).map(s => (
              <button
                key={s}
                onClick={() => set('status', s)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors
                  ${form.status === s
                    ? s === 'PAUSED'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
              >
                {s === 'PAUSED' ? 'Paused — review first' : 'Active — spend immediately'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={handleCreate} disabled={loading || !companyId} className="gap-2">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</> : <><Play className="h-4 w-4" />Create Campaign</>}
      </Button>

      {/* Result */}
      {result && (
        <Card className={`border ${result.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <CardContent className="p-4 space-y-2">
            {result.status === 'completed' ? (
              <>
                <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                  <CheckCircle2 className="h-4 w-4" /> Campaign created successfully
                </div>
                <p className="text-xs text-muted-foreground">{result.message}</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    ['Campaign ID', result.campaign_id],
                    ['Ad Set ID', result.adset_id],
                    ['Creative ID', result.creative_id],
                    ['Ad ID', result.ad_id],
                  ].map(([label, val]) => val && (
                    <div key={label} className="text-xs">
                      <span className="text-muted-foreground">{label}: </span>
                      <code className="font-mono">{val}</code>
                    </div>
                  ))}
                </div>
                <a
                  href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${result.ad_account_id?.replace('act_', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  Open in Meta Ads Manager →
                </a>
              </>
            ) : (
              <div className="flex items-start gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Creation failed{result.step ? ` at ${result.step} step` : ''}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{result.error}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Tab: ROAS Optimizer ───────────────────────────────────────────────────────

function ROASOptimizerTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [dateRange, setDateRange] = useState('last_7d')
  const [pauseThreshold, setPauseThreshold] = useState('1.0')
  const [scaleThreshold, setScaleThreshold] = useState('3.0')
  const [scaleFactor, setScaleFactor] = useState('1.25')
  const [result, setResult] = useState<AutomationResult | null>(null)

  async function runOptimizer() {
    if (!companyId) { toast.error('No workspace selected'); return }
    setLoading(true)
    setResult(null)
    try {
      const res = await runAutomation('optimize_meta_roas', {
        date_range: dateRange,
        roas_threshold_pause: Number(pauseThreshold),
        roas_threshold_scale: Number(scaleThreshold),
        budget_scale_factor: Number(scaleFactor),
        dry_run: dryRun,
      }, companyId)
      setResult(res)
      if (res.status === 'completed') {
        toast.success(dryRun ? 'Dry run complete — no changes made' : `Done: ${res.actions_taken} actions taken`)
      } else {
        toast.error(res.error || 'Optimizer failed')
      }
    } catch {
      toast.error('Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Analyzes Meta Ads performance and automatically pauses low-ROAS ads and scales budgets on winning ad sets.
      </p>

      {/* Settings */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Date Range</Label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7d">Last 7 days</SelectItem>
              <SelectItem value="last_30d">Last 30 days</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Pause ads below ROAS</Label>
          <Input type="number" step="0.1" value={pauseThreshold} onChange={e => setPauseThreshold(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Scale adsets above ROAS</Label>
          <Input type="number" step="0.1" value={scaleThreshold} onChange={e => setScaleThreshold(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Budget scale factor</Label>
          <Input type="number" step="0.05" value={scaleFactor} onChange={e => setScaleFactor(e.target.value)} className="h-9" />
          <p className="text-xs text-muted-foreground">e.g. 1.25 = +25% budget</p>
        </div>
        <div className="col-span-2 flex items-end gap-2 pb-0.5">
          <button
            onClick={() => setDryRun(d => !d)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors
              ${dryRun
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              }`}
          >
            {dryRun ? 'Dry Run — report only, no changes' : 'Live — will pause & scale'}
          </button>
        </div>
      </div>

      <Button onClick={runOptimizer} disabled={loading || !companyId} className="gap-2">
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin" />{dryRun ? 'Analyzing…' : 'Optimizing…'}</>
          : <><Zap className="h-4 w-4" />{dryRun ? 'Run Analysis' : 'Optimize Now'}</>
        }
      </Button>

      {/* Result */}
      {result && result.status === 'completed' && (
        <div className="space-y-3">
          {/* Summary */}
          {result.roas_summary && (
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="Avg ROAS" value={`${result.roas_summary.avg_roas?.toFixed(2) ?? '—'}x`} icon={<TrendingUp className="h-4 w-4" />} />
              <KpiCard label="Total Spend" value={fmtCurrency(result.roas_summary.total_spend)} icon={<BarChart2 className="h-4 w-4" />} />
              <KpiCard label="Ads Analyzed" value={String(result.roas_summary.ads_analyzed ?? 0)} icon={<Megaphone className="h-4 w-4" />} />
            </div>
          )}

          {/* Paused ads */}
          {(result.paused_ads?.length ?? 0) > 0 && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                  <PauseCircle className="h-4 w-4" />
                  {result.dry_run ? 'Would pause' : 'Paused'} — {result.paused_ads!.length} ad{result.paused_ads!.length !== 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1">
                {result.paused_ads!.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                    <span className="truncate max-w-[240px] text-muted-foreground">{a.name}</span>
                    <div className="flex gap-3 shrink-0">
                      <span>ROAS {roasBadge(a.roas)}</span>
                      <span className="text-muted-foreground">{fmtCurrency(a.spend)} spent</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Scaled adsets */}
          {(result.scaled_adsets?.length ?? 0) > 0 && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                  {result.dry_run ? 'Would scale' : 'Scaled'} — {result.scaled_adsets!.length} ad set{result.scaled_adsets!.length !== 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1">
                {result.scaled_adsets!.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                    <span className="truncate max-w-[200px] text-muted-foreground">{a.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{fmtCurrency(a.old_budget / 100)}</span>
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">{fmtCurrency(a.new_budget / 100)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* No action */}
          {(result.paused_ads?.length ?? 0) === 0 && (result.scaled_adsets?.length ?? 0) === 0 && (
            <Card className="border-border/50">
              <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Minus className="h-4 w-4" /> No ads met the pause or scale thresholds for this period.
              </CardContent>
            </Card>
          )}

          {/* Full report */}
          {result.report && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                View full report
              </summary>
              <pre className="mt-2 p-3 bg-muted/30 rounded-lg whitespace-pre-wrap font-mono text-xs leading-relaxed overflow-auto max-h-64">
                {result.report}
              </pre>
            </details>
          )}
        </div>
      )}

      {result?.status === 'error' && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-start gap-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Optimizer failed</div>
              <div className="text-xs text-muted-foreground mt-0.5">{result.error}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Shared empty state ────────────────────────────────────────────────────────

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-center gap-1">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70 max-w-md">{subtitle}</p>
    </div>
  )
}

// ── Agent tabs config ────────────────────────────────────────────────────────

const AGENT_TABS = [
  {
    id: 'copy',
    label: 'Ad Copy',
    title: 'Paid Ads — Ad Copy',
    description: 'Write platform-specific ad copy variants for Meta, Google, and LinkedIn from Sam.',
    agents: [
      {
        name: 'sam',
        label: 'Sam — Ad Copy Variants',
        taskType: 'paid_ads_copy',
        defaultQuery:
          'Write ad copy for each platform. For each: 3 headline variants, 2 description variants, and 1 CTA recommendation. Formats: Meta (primary text + headline), Google Ads (RSA headlines + descriptions), LinkedIn (intro text + headline).',
        placeholder: 'Product / offer / angle to lead with, or any constraints',
        tags: ['paid-ads', 'copy', 'variants'],
      },
    ],
  },
  {
    id: 'creative',
    label: 'Creative Brief',
    title: 'Paid Ads — Creative Brief',
    description: 'Generate ad creative concepts — visual direction, hooks, and format recommendations from Maya.',
    agents: [
      {
        name: 'maya',
        label: 'Maya — Creative Concepts',
        taskType: 'ad_creative',
        defaultQuery:
          'Create 5 ad creative concepts for [Meta Ads / Google Ads / LinkedIn Ads]. Include: headline (under 40 chars), primary text (under 125 chars), description, visual brief (what the image/video should show), and CTA. Target audience: [ICP]. Offer: [product/service].',
        placeholder: 'Platform, target audience, product or offer',
        tags: ['ad-creative', 'concepts', 'visual'],
      },
    ],
  },
]

// ── Root component ───────────────────────────────────────────────────────────

type PaidAdsFlowProps = {
  initialTab?: string
  initialQuestion?: string
  initialObjective?: string
  initialChannel?: string
}

export function PaidAdsFlow({
  initialTab = 'performance',
  initialQuestion,
  initialObjective,
  initialChannel,
}: PaidAdsFlowProps) {
  const normalizeInitialTab = (value?: string) => {
    if (value === 'plan' || value === 'launch' || value === 'optimize' || value === 'assets') return value
    if (value === 'create') return 'launch'
    if (value === 'performance' || value === 'optimizer') return 'optimize'
    if (value === 'copy' || value === 'creative') return 'assets'
    return 'plan'
  }
  const isGuidedLaunch = Boolean(initialQuestion || initialObjective || initialChannel)
  const [activeTab, setActiveTab] = useState(() => normalizeInitialTab(isGuidedLaunch ? 'plan' : initialTab))
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id ?? ''
  const objectiveLabel = formatPaidLabel(initialObjective || 'leads')
  const channelLabel = formatPaidLabel(initialChannel || 'google')

  useEffect(() => {
    setActiveTab(normalizeInitialTab(isGuidedLaunch ? 'plan' : initialTab))
  }, [initialTab, isGuidedLaunch])

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08] self-start">
          <CardContent className="space-y-3 p-5 md:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
              Paid Ads Desk
            </div>
            <div className="space-y-2">
              <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
                Plan, launch, and optimize without mixing every ad tool into one screen.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Start with the campaign plan. Move into launch, optimization, and asset production only when you need them.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Objective:</span> <span className="font-medium text-foreground">{objectiveLabel}</span></div>
              <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Channel:</span> <span className="font-medium text-foreground">{channelLabel}</span></div>
              <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Flow:</span> <span className="font-medium text-foreground">Plan → Launch → Optimize</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.85rem] border-border/70 bg-background/90">
          <CardContent className="grid gap-3 p-6">
            <div className="rounded-[1.15rem] border border-border/70 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <WalletCards className="h-4 w-4 text-orange-500" />
                Plan
              </div>
              <p className="text-sm leading-6 text-muted-foreground">Get the structure, targeting direction, KPI targets, and budget shape before anyone launches.</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/70 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Play className="h-4 w-4 text-orange-500" />
                Launch
              </div>
              <p className="text-sm leading-6 text-muted-foreground">Create the campaign only after the plan is clear and the brief is stable.</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/70 bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Zap className="h-4 w-4 text-orange-500" />
                Optimize
              </div>
              <p className="text-sm leading-6 text-muted-foreground">Check live performance and make ROAS decisions without hopping between disjoint operator tools.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap gap-1.5 rounded-[1.25rem] border border-border/70 bg-muted/50 p-1.5">
          <TabsTrigger value="plan" className="gap-1.5">
            <WalletCards className="h-3.5 w-3.5" /> Campaign Plan
          </TabsTrigger>
          <TabsTrigger value="launch" className="gap-1.5">
            <Play className="h-3.5 w-3.5" /> Launch
          </TabsTrigger>
          <TabsTrigger value="optimize" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Optimize
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Assets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="mt-4">
          <PaidAdsPlanTab
            initialQuestion={initialQuestion}
            initialObjective={initialObjective}
            initialChannel={initialChannel}
          />
        </TabsContent>

        <TabsContent value="launch" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
            <Card className="rounded-[1.5rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] dark:border-orange-900/40 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Launch checklist</CardTitle>
                <CardDescription>Use this once the campaign plan is approved.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <div className="rounded-[1rem] border border-border/70 bg-background/70 p-4 dark:bg-background/30">
                  Confirm the offer, destination URL, and conversion path before spend goes live.
                </div>
                <div className="rounded-[1rem] border border-border/70 bg-background/70 p-4 dark:bg-background/30">
                  Keep the first launch in `Paused` state if the team still needs a quick review in Ads Manager.
                </div>
                <div className="rounded-[1rem] border border-border/70 bg-background/70 p-4 dark:bg-background/30">
                  Move into `Assets` only when you need fresh copy or creative direction, not before.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Create Meta Ads Campaign</CardTitle>
                <CardDescription>Launch a full campaign in Meta Ads Manager — Campaign → Ad Set → Creative → Ad.</CardDescription>
              </CardHeader>
              <CardContent>
                <CreateCampaignTab companyId={companyId} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="optimize" className="mt-4">
          <div className="space-y-4">
            <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Live Ad Performance</CardTitle>
                <CardDescription>Check channel health before making ROAS changes.</CardDescription>
              </CardHeader>
              <CardContent>
                <LivePerformanceTab companyId={companyId} />
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ROAS Optimizer</CardTitle>
                <CardDescription>Pause underperformers and scale winners only after the live picture is clear.</CardDescription>
              </CardHeader>
              <CardContent>
                <ROASOptimizerTab companyId={companyId} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {AGENT_TABS.map((t) => (
              <Card key={t.id} className="rounded-[1.5rem] border-border/70 bg-background/90">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t.label}</CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AgentModuleShell
                    moduleId={`paid-ads-${t.id}`}
                    title={t.title}
                    description={t.description}
                    agents={t.agents}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
