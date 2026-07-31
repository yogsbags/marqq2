import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, BarChart3, CheckCircle2, CircleAlert, ExternalLink, Link2, Radar, Send, FileText, RefreshCw, Sparkles, Target, Mail, MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { EXECUTION_PLANS, EXISTING_CONNECTOR_IDS, connectorReadiness, formatExecutionConnector, type ExecutionWorkstream } from '@/lib/executionReadiness'
import { PaidAdsDashboardTab, type AdsGoalState } from '@/components/modules/PaidAdsFlow'
import { toast } from 'sonner'

type Props = {
  workstream: ExecutionWorkstream
  onModuleSelect: (moduleId: string | null) => void
}

type LockedGoal = {
  north_star_metric?: string | null
  metric_definition?: string | null
  quantified_target?: string | null
  timeline_target?: string | null
  baseline?: string | null
  sectionTargets?: Array<{ sectionId?: string; metric?: string; contribution?: string; byWhen?: string }>
}

type OutreachSummary = {
  analytics?: { totals?: { sent?: number; replies?: number; positive_replies?: number }; rates?: { reply_rate?: number; positive_reply_rate?: number } }
  target_pacing?: Array<{ status?: string; target?: number; actual?: number; attainment_pct?: number }>
}

const ICONS = { outreach: Send, content: FileText, dashboard: BarChart3, monitoring: Radar }

export function ExecutionWorkspace({ workstream, onModuleSelect }: Props) {
  const { activeWorkspace } = useWorkspace()
  const plan = EXECUTION_PLANS[workstream]
  const Icon = ICONS[workstream]
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [performance, setPerformance] = useState<{ items: Array<{ platform: string; metrics?: { engagement_rate?: number | null } }>; recommendations: Array<{ recommendation?: { recommendation?: string; platform?: string; evidence?: { current_items?: number } } }> }>({ items: [], recommendations: [] })
  const [performanceBusy, setPerformanceBusy] = useState<string | null>(null)
  const [lockedGoal, setLockedGoal] = useState<LockedGoal | null>(null)
  const [goalLoading, setGoalLoading] = useState(false)
  const [outreachSummary, setOutreachSummary] = useState<OutreachSummary | null>(null)
  const dashboardGoal = useMemo<AdsGoalState>(() => {
    const fallback: AdsGoalState = { target: '', timeline: '', budget: '', maxCpa: '', conversion: 'Primary conversion', geo: '', provenPct: '70', scalePct: '20', testPct: '10', approval: 'approval' }
    if (!activeWorkspace?.id) return fallback
    try {
      const saved = localStorage.getItem(`marqq_ads_goal_${activeWorkspace.id}`)
      const localBudget = saved ? JSON.parse(saved) : {}
      return {
        ...fallback,
        budget: String(localBudget?.budget || ''),
        maxCpa: String(localBudget?.maxCpa || ''),
        geo: String(localBudget?.geo || ''),
        provenPct: String(localBudget?.provenPct || fallback.provenPct),
        scalePct: String(localBudget?.scalePct || fallback.scalePct),
        testPct: String(localBudget?.testPct || fallback.testPct),
        target: String(lockedGoal?.quantified_target || ''),
        timeline: String(lockedGoal?.timeline_target || ''),
        conversion: String(lockedGoal?.north_star_metric || fallback.conversion),
      }
    } catch { return fallback }
  }, [activeWorkspace?.id, lockedGoal])

  useEffect(() => {
    let cancelled = false
    if (!activeWorkspace?.id) {
      setLockedGoal(null)
      setOutreachSummary(null)
      return
    }
    setGoalLoading(true)
    Promise.all([
      fetch(`/api/gtm/goal?companyId=${encodeURIComponent(activeWorkspace.id)}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/outreach/workspaces/${encodeURIComponent(activeWorkspace.id)}/summary`).then((r) => r.ok ? r.json() : null),
    ]).then(([goalJson, outreachJson]) => {
      if (cancelled) return
      setLockedGoal(goalJson?.goal || null)
      setOutreachSummary(outreachJson || null)
    }).catch(() => {
      if (!cancelled) { setLockedGoal(null); setOutreachSummary(null) }
    }).finally(() => { if (!cancelled) setGoalLoading(false) })
    return () => { cancelled = true }
  }, [activeWorkspace?.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (!activeWorkspace?.id) {
      setConnectedIds([])
      setLoading(false)
      return
    }
    fetch(`/api/integrations?companyId=${encodeURIComponent(activeWorkspace.id)}`)
      .then((response) => (response.ok ? response.json() : {}))
      .then((json: { connectors?: Array<{ id?: string; connected?: boolean; status?: string }> }) => {
        if (cancelled) return
        const ids = Array.isArray(json?.connectors)
          ? json.connectors
              .filter((connector: { id?: string; connected?: boolean; status?: string }) =>
                Boolean(connector.id) && (connector.connected || ['active', 'connected', 'success'].includes(String(connector.status || '').toLowerCase())),
              )
              .map((connector) => connector.id)
              .filter((id): id is string => Boolean(id))
          : []
        setConnectedIds(ids)
      })
      .catch(() => { if (!cancelled) setConnectedIds([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeWorkspace?.id])

  const readiness = useMemo(() => connectorReadiness(workstream, connectedIds), [workstream, connectedIds])

  const loadPerformance = useCallback(async () => {
    if (!activeWorkspace?.id) return
    const response = await fetch(`/api/content-studio/performance?companyId=${encodeURIComponent(activeWorkspace.id)}`)
    const json = await response.json().catch(() => null)
    if (!response.ok) throw new Error(json?.error || 'Could not load performance data')
    setPerformance({
      items: Array.isArray(json?.items) ? json.items : [],
      recommendations: Array.isArray(json?.recommendations) ? json.recommendations : [],
    })
  }, [activeWorkspace?.id])

  useEffect(() => {
    setPerformance({ items: [], recommendations: [] })
    void loadPerformance().catch(() => {})
  }, [activeWorkspace?.id, loadPerformance])

  const runPerformanceAction = async (action: 'sync' | 'review') => {
    if (!activeWorkspace?.id) return
    setPerformanceBusy(action)
    try {
      const response = await fetch(`/api/content-studio/performance/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: activeWorkspace.id }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(json?.error || `Could not ${action} analytics`)
      await loadPerformance()
      toast.success(action === 'sync' ? 'Analytics synced' : 'Course-correction review complete')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Performance action failed')
    } finally { setPerformanceBusy(null) }
  }

  const performanceByPlatform = useMemo(() => {
    const groups = new Map<string, { count: number; rates: number[] }>()
    for (const item of performance.items) {
      const group = groups.get(item.platform) || { count: 0, rates: [] }
      group.count += 1
      if (typeof item.metrics?.engagement_rate === 'number') group.rates.push(item.metrics.engagement_rate)
      groups.set(item.platform, group)
    }
    return [...groups.entries()].map(([platform, group]) => ({ platform, count: group.count, rate: group.rates.length ? group.rates.reduce((a, b) => a + b, 0) / group.rates.length : null }))
  }, [performance.items])

  const mappedSectionTargetCount = useMemo(() => {
    const ids = new Set((lockedGoal?.sectionTargets || []).map((target) => target.sectionId).filter((id) => id && id !== 'executive_summary'))
    return ids.size
  }, [lockedGoal?.sectionTargets])

  return (
    <div className="min-h-full space-y-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Execution workstream</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.label}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{plan.description}</p>
          </div>
        </div>
        <Button className="gap-2 bg-orange-500 text-white hover:bg-orange-600" onClick={() => onModuleSelect(plan.destination)}>
          {plan.primaryCta} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {workstream === 'content' ? (
        <section className="rounded-xl border border-border/60 bg-background p-5">
          <div>
            <p className="text-sm font-semibold">Choose the content lane</p>
            <p className="mt-1 text-xs text-muted-foreground">Each lane has its own preview, approval, publishing path, and success metrics. Shared analytics flow back into the dashboard.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { id: 'execution-blog-seo', label: 'Blog + SEO', detail: 'Research, audit, briefs, articles', cta: 'Open blog-seo' },
              { id: 'execution-landing-pages', label: 'Landing pages', detail: 'Browser preview, CRO, publishing', cta: 'Open landing-pages' },
              { id: 'execution-lead-magnets', label: 'Lead magnets', detail: 'Offer, gate, delivery, nurture', cta: 'Open lead-magnets' },
              { id: 'execution-social', label: 'Social publishing', detail: 'Platform-native posts and media', cta: 'Open social' },
            ].map((lane) => (
              <button key={lane.id} type="button" onClick={() => onModuleSelect(lane.id)} className="rounded-lg border border-border/60 p-3 text-left transition-colors hover:border-orange-500/50 hover:bg-orange-500/[0.04]">
                <p className="text-sm font-semibold">{lane.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{lane.detail}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-600">{lane.cta} <ArrowRight className="h-3 w-3" /></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-border/60 bg-background p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Execution sequence</p>
              <p className="mt-1 text-xs text-muted-foreground">Marqq keeps every step draft-first and approval-gated.</p>
            </div>
            <Badge variant="secondary" className={cn(readiness.ready ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700')}>
              {readiness.ready ? 'Ready to run' : 'Setup required'}
            </Badge>
          </div>
          <div className="mt-5 divide-y divide-border/50">
            {plan.steps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 py-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground">{index + 1}</span>
                <span className={cn(index === 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{step}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-background p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-orange-500" /> Connector readiness</p>
              <p className="mt-1 text-xs text-muted-foreground">{loading ? 'Checking connected tools…' : `${readiness.connectedCount} of ${readiness.total} useful connectors connected`}</p>
            </div>
            <span className="text-lg font-semibold">{loading ? '—' : `${readiness.coverage}%`}</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${readiness.coverage}%` }} />
          </div>
          {readiness.missingRequired.length > 0 || readiness.missingRequiredAny.length > 0 ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-foreground">Required before live execution</p>
                <p className="mt-0.5 text-muted-foreground">
                  {[...readiness.missingRequired.map((connector) => formatExecutionConnector(connector.id)), ...readiness.missingRequiredAny.map((group) => group.label)].join(' · ')}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Required connectors are ready. Draft execution is available.</p>
          )}
          <Button variant="outline" size="sm" className="mt-4 w-full gap-2" onClick={() => onModuleSelect('integrations')}>
            Manage all connectors <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </section>
      </div>

      <section className="rounded-xl border border-border/60 bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
          <div><p className="text-sm font-semibold">Connector matrix for {plan.label}</p><p className="mt-1 text-xs text-muted-foreground">Optional tools enrich the workflow; required tools gate live actions.</p></div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{EXISTING_CONNECTOR_IDS.length} supported platform connectors</span>
        </div>
        <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
          {plan.connectors.map((connector) => {
            const connected = connectedIds.includes(connector.id)
            return (
              <div key={connector.id} className="flex items-start gap-3 border-b border-r border-border/40 px-5 py-3.5">
                {connected ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />}
                <div className="min-w-0"><p className="truncate text-xs font-medium">{formatExecutionConnector(connector.id)} {connector.required ? <span className="text-orange-600">· required</span> : null}</p><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{connector.role}</p></div>
              </div>
            )
          })}
        </div>
      </section>

      {workstream === 'dashboard' ? (
        <section className="rounded-xl border border-orange-500/25 bg-orange-500/[0.035] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600"><Target className="h-4 w-4" /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">North Star control center</p>
                <h2 className="mt-1 text-lg font-semibold">{goalLoading ? 'Loading the locked goal…' : lockedGoal?.north_star_metric || 'No locked North Star yet'}</h2>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{lockedGoal?.metric_definition || 'Complete and lock the GTM strategy in #main before judging execution performance.'}</p>
              </div>
            </div>
            {lockedGoal ? <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">Server-backed GTM goal</Badge> : <Button variant="outline" size="sm" onClick={() => onModuleSelect('main')}>Open GTM strategy <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
          </div>
          {lockedGoal ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-background/70 p-3"><p className="text-[11px] text-muted-foreground">Target</p><p className="mt-1 text-sm font-semibold">{lockedGoal.quantified_target || '—'}</p></div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3"><p className="text-[11px] text-muted-foreground">Deadline</p><p className="mt-1 text-sm font-semibold">{lockedGoal.timeline_target || '—'}</p></div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3"><p className="text-[11px] text-muted-foreground">Baseline</p><p className="mt-1 text-sm font-semibold">{lockedGoal.baseline || 'Not recorded'}</p></div>
          </div> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-background/70 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> Outreach replies</div><p className="mt-1 text-lg font-semibold">{outreachSummary?.analytics?.totals?.replies ?? '—'}</p><p className="text-[11px] text-muted-foreground">{outreachSummary?.analytics?.rates?.reply_rate == null ? 'No measured outreach yet' : `${(outreachSummary.analytics.rates.reply_rate * 100).toFixed(1)}% reply rate`}</p></div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" /> Content items measured</div><p className="mt-1 text-lg font-semibold">{performance.items.length || '—'}</p><p className="text-[11px] text-muted-foreground">{performance.items.length ? 'Live owned-channel records' : 'Sync content connectors to measure'}</p></div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" /> Section targets</div><p className="mt-1 text-lg font-semibold">{lockedGoal ? `${mappedSectionTargetCount}/15` : '—'}</p><p className="text-[11px] text-muted-foreground">{mappedSectionTargetCount ? 'Visible channel sections mapped' : 'No section targets locked'}</p></div>
          </div>
        </section>
      ) : null}

      {workstream === 'dashboard' ? (
        <section className="rounded-xl border border-border/60 bg-background p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm font-semibold">Paid Ads</p><p className="mt-1 text-xs text-muted-foreground">Consolidated Meta, Google Ads, and LinkedIn Ads performance tied to the workspace goal.</p></div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => onModuleSelect('paid-ads')}>Open paid-ads workspace <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
          {!lockedGoal ? <p className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200">Paid ads can show connector data, but goal pacing is paused until the GTM North Star is locked.</p> : null}
          <PaidAdsDashboardTab companyId={activeWorkspace?.id || ''} goal={dashboardGoal} />
        </section>
      ) : null}

      {(workstream === 'content' || workstream === 'dashboard' || workstream === 'monitoring') && (
        <section className="rounded-xl border border-border/60 bg-background p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-orange-500" /> Content performance loop</p>
              <p className="mt-1 text-xs text-muted-foreground">Own-channel performance is compared against the previous period. Recommendations require at least 3 current and 3 baseline items.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={performanceBusy !== null} onClick={() => void runPerformanceAction('sync')}><RefreshCw className="h-3.5 w-3.5" />{performanceBusy === 'sync' ? 'Syncing…' : 'Sync analytics'}</Button>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={performanceBusy !== null} onClick={() => void runPerformanceAction('review')}><Sparkles className="h-3.5 w-3.5" />{performanceBusy === 'review' ? 'Reviewing…' : 'Review course-corrections'}</Button>
            </div>
          </div>
          {performanceByPlatform.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {performanceByPlatform.map((item) => <div key={item.platform} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"><p className="text-xs font-semibold capitalize">{item.platform}</p><p className="mt-1 text-lg font-semibold">{item.rate == null ? '—' : `${(item.rate * 100).toFixed(1)}%`}</p><p className="text-[11px] text-muted-foreground">{item.count} measured items · engagement</p></div>)}
            </div>
          ) : <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No owned content performance has been synced yet. Connect channels, publish a few items, then sync analytics.</p>}
          {performance.recommendations.length > 0 && <div className="mt-4 space-y-2">{performance.recommendations.slice(0, 3).map((item, index) => <div key={index} className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs"><p className="font-medium">{item.recommendation?.platform || 'Channel'} · approval required</p><p className="mt-1 text-muted-foreground">{item.recommendation?.recommendation}</p></div>)}</div>}
        </section>
      )}
    </div>
  )
}
