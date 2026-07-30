import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConnectorGateCard } from '@/components/integrations/ConnectorGateCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { isConnectorActive } from '@/lib/connectorMeta'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  Loader2,
  PenLine,
  Search,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'

const SEO_OPTIONAL = ['semrush', 'ahrefs', 'gsc'] as const

export type SeoArticleQueueItem = {
  keyword: string
  secondary_keywords?: string[]
  faq_questions?: string[]
  topic?: string
  cluster?: string
  intent?: string
  priority?: number
  estimated_impact?: string
  why?: string
  word_count_target?: number
}

export type SeoOrganicPlan = {
  status?: string
  error?: string
  message?: string
  domain?: string
  provider?: string
  data_source?: string
  connectors_optional?: boolean
  connectors?: { semrush?: boolean; ahrefs?: boolean; gsc?: boolean }
  gsc?: {
    ok?: boolean
    connectionOk?: boolean
    siteUrl?: string | null
    kpis?: { clicks?: number; impressions?: number; striking_distance?: number } | null
    striking_distance?: Array<{ keyword?: string; position?: number | null; impressions?: number }>
  }
  needs?: { connectors?: string[]; at_least_one?: boolean; domain?: boolean }
  topical_authority?: {
    score?: number
    strengths?: string[]
    gaps?: string[]
    rationale?: string
  }
  topic_clusters?: Array<{
    pillar?: string
    intent?: string
    authority_role?: string
    spokes?: string[]
    priority?: number
  }>
  article_queue?: SeoArticleQueueItem[]
  goal_alignment?: {
    quantified_target?: string | null
    timeline_target?: string | null
    articles_planned?: number
    articles_target?: number
    articles_per_week?: number
    timeline_days?: number
    goal_kind?: string
    expected_contribution?: string
    milestones?: Array<{ week?: number; articles?: number; checkpoint?: string }>
  }
  volume_target?: {
    articles_total?: number
    articles_per_week?: number
    timeline_days?: number
    goal_kind?: string
    goal_number?: number | null
  }
  gtm_goals?: {
    quantified_target?: string | null
    timeline_target?: string | null
    channel_bet?: string | null
    objective?: string | null
  }
  stages?: Record<string, { ok?: boolean; count?: number; data?: unknown }>
  results?: Array<{
    keyword?: string
    topic?: string
    article?: { status?: string; html?: string; title?: string; slug?: string; word_count?: number }
  }>
}

function normalizeDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
}

type Props = {
  companyId: string
  defaultDomain?: string
  className?: string
  onPlanReady?: (plan: SeoOrganicPlan) => void
  onArticlesWritten?: (payload: SeoOrganicPlan) => void
}

export function SeoOrganicPipelinePanel({
  companyId,
  defaultDomain = '',
  className,
  onPlanReady,
  onArticlesWritten,
}: Props) {
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [loadingConnectors, setLoadingConnectors] = useState(Boolean(companyId))
  const [domain, setDomain] = useState(normalizeDomain(defaultDomain))
  const [running, setRunning] = useState(false)
  const [writing, setWriting] = useState(false)
  const [plan, setPlan] = useState<SeoOrganicPlan | null>(null)

  useEffect(() => {
    if (defaultDomain) setDomain(normalizeDomain(defaultDomain))
  }, [defaultDomain])

  const refreshConnectors = useCallback(async () => {
    if (!companyId) {
      setConnectedIds([])
      setLoadingConnectors(false)
      return
    }
    setLoadingConnectors(true)
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      const ids = (json?.connectors ?? [])
        .filter((c: { id?: string; connected?: boolean; status?: string }) => isConnectorActive(c))
        .map((c: { id: string }) => c.id)
      setConnectedIds(ids)
    } catch {
      setConnectedIds([])
    } finally {
      setLoadingConnectors(false)
    }
  }, [companyId])

  useEffect(() => {
    void refreshConnectors()
  }, [refreshConnectors])

  const connectedSet = useMemo(() => new Set(connectedIds), [connectedIds])
  const hasSeoToolkit = SEO_OPTIONAL.some((id) => id !== 'gsc' && connectedSet.has(id))
  const gateIds = [...SEO_OPTIONAL]

  const runPlan = async () => {
    if (!companyId) {
      toast.error('Select a workspace first')
      return
    }
    const d = normalizeDomain(domain)
    if (!d) {
      toast.error('Enter your domain')
      return
    }
    setRunning(true)
    setPlan(null)
    try {
      const res = await fetch('/api/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automation_id: 'build_seo_organic_plan',
          company_id: companyId,
          params: { domain: d },
        }),
      })
      const json = (await res.json().catch(() => ({}))) as SeoOrganicPlan
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || json.error || 'SEO plan failed')
      }
      setPlan(json)
      onPlanReady?.(json)
      toast.success(json.message || 'SEO plan ready')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'SEO plan failed')
    } finally {
      setRunning(false)
    }
  }

  const writeArticles = async (limit = 3) => {
    if (!companyId || !plan?.article_queue?.length) return
    setWriting(true)
    try {
      const res = await fetch('/api/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automation_id: 'execute_seo_plan_articles',
          company_id: companyId,
          params: {
            domain: plan.domain || domain,
            article_queue: plan.article_queue,
            limit,
            market_type: 'b2c',
            target_audience: 'everyday consumers',
          },
        }),
      })
      const json = (await res.json().catch(() => ({}))) as SeoOrganicPlan
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || json.error || 'Article write failed')
      }
      onArticlesWritten?.(json)
      toast.success(json.message || `Wrote ${json.results?.length || 0} articles`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Article write failed')
    } finally {
      setWriting(false)
    }
  }

  const authority = plan?.topical_authority
  const goal = plan?.goal_alignment
  const clusters = plan?.topic_clusters || []
  const queue = plan?.article_queue || []

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Search className="h-4 w-4 text-orange-600" />
            SEO research before writing
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Optional: connect Semrush, Ahrefs, or Search Console for live data. Otherwise AI estimates
            keyword volumes via web search, then maps topical authority → clusters → a goal-aligned plan.
            GSC enriches with real queries, impressions, and striking-distance opportunities.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loadingConnectors && !hasSeoToolkit && !connectedSet.has('gsc') ? (
            <ConnectorGateCard
              connectorIds={[...gateIds]}
              connectedConnectorIds={connectedIds}
              taskLabel="SEO research (Semrush/Ahrefs/GSC optional — web search estimates work without them)"
              workspaceId={companyId}
              hardGate={false}
              onConnected={() => {
                void refreshConnectors()
                toast.success('SEO account connected')
              }}
              onSkip={() => toast.message('Continuing with web-search keyword volume estimates')}
            />
          ) : null}

          {hasSeoToolkit || connectedSet.has('gsc') ? (
            <Alert className="border-emerald-800/40 bg-emerald-950/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <AlertTitle className="text-emerald-300">Live SEO tools connected</AlertTitle>
              <AlertDescription className="text-emerald-200/80">
                {[
                  connectedSet.has('semrush') ? 'Semrush' : null,
                  connectedSet.has('ahrefs') ? 'Ahrefs' : null,
                  connectedSet.has('gsc') ? 'Search Console' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Web-search estimates</AlertTitle>
              <AlertDescription>
                No Semrush/Ahrefs/GSC yet — the pipeline will estimate keyword volumes with web search.
                Connect any of them anytime for live ranking or query data.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="seo-domain">
                Domain
              </label>
              <Input
                id="seo-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                disabled={running}
              />
            </div>
            <Button
              type="button"
              onClick={() => void runPlan()}
              disabled={running || !domain.trim()}
              className="gap-1.5"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              Run SEO pipeline
            </Button>
          </div>

          <ol className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-5">
            {[
              'Tools (optional)',
              'Domain metrics',
              'Topical authority',
              'Topic clusters',
              'Goal-aligned plan',
            ].map((label, i) => (
              <li
                key={label}
                className={cn(
                  'rounded-lg border border-border/60 px-2 py-2',
                  plan?.status === 'success' && i > 0 && 'border-emerald-800/40 text-emerald-300',
                  (hasSeoToolkit || plan?.data_source === 'web_search_estimate') &&
                    i === 0 &&
                    'border-emerald-800/40 text-emerald-300',
                )}
              >
                <span className="mr-1 font-semibold text-foreground/80">{i + 1}.</span>
                {label}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {plan?.data_source === 'web_search_estimate' ? (
        <Alert>
          <AlertTitle>Using web-search volume estimates</AlertTitle>
          <AlertDescription>
            {plan.message ||
              'Keyword volumes are AI estimates from web search. Connect Semrush, Ahrefs, or Search Console for live data.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {plan?.gsc?.connectionOk ? (
        <Alert className="border-emerald-800/40 bg-emerald-950/20">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <AlertTitle className="text-emerald-300">Search Console enriched</AlertTitle>
          <AlertDescription className="text-emerald-200/80">
            {plan.gsc.siteUrl || 'Site connected'}
            {plan.gsc.kpis?.striking_distance != null
              ? ` · ${plan.gsc.kpis.striking_distance} striking-distance queries`
              : plan.gsc.striking_distance?.length
                ? ` · ${plan.gsc.striking_distance.length} striking-distance queries`
                : ''}
            {plan.gsc.kpis?.impressions != null
              ? ` · ${plan.gsc.kpis.impressions.toLocaleString()} impressions (28d)`
              : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {plan?.status === 'needs_connectors' ? (
        <Alert>
          <AlertTitle>SEO tools optional</AlertTitle>
          <AlertDescription>{plan.message}</AlertDescription>
        </Alert>
      ) : null}

      {plan?.status === 'success' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Topical authority</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-2xl font-semibold tabular-nums">
                {authority?.score ?? '—'}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/ 100</span>
              </div>
              <p className="text-muted-foreground">{authority?.rationale}</p>
              {authority?.gaps?.length ? (
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {authority.gaps.slice(0, 4).map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">GTM goal alignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {goal?.quantified_target || plan.gtm_goals?.quantified_target || 'No quantified target'}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {goal?.timeline_target || plan.gtm_goals?.timeline_target || '90d'}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {goal?.articles_planned ?? queue.length} articles
                </span>
              </div>
              <p className="text-muted-foreground">{goal?.expected_contribution}</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Topic clusters</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {clusters.slice(0, 6).map((c) => (
                <div key={String(c.pillar)} className="rounded-xl border border-border/60 p-3">
                  <div className="font-medium">{c.pillar}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {c.intent} · {c.authority_role}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(c.spokes || []).slice(0, 5).map((s) => (
                      <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!clusters.length ? (
                <p className="text-sm text-muted-foreground">No clusters returned.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="text-sm">Article queue (priority)</CardTitle>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={writing || !queue.length}
                onClick={() => void writeArticles(3)}
              >
                {writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                Write next 3
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Primary</th>
                      <th className="pb-2 pr-3 font-medium">Secondary</th>
                      <th className="pb-2 font-medium">Why (goal)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.slice(0, 12).map((row, idx) => (
                      <tr key={`${row.keyword}-${idx}`} className="border-t border-border/50">
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{row.priority ?? idx + 1}</td>
                        <td className="py-2 pr-3 font-medium">{row.keyword}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {(row.secondary_keywords || []).slice(0, 3).join(', ') || '—'}
                        </td>
                        <td className="py-2 text-muted-foreground">{row.why || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
