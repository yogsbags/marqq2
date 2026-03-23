import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { toast } from 'sonner'
import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from '@/components/agent/AgentRunPanel'
import { ReportDeliveryCard } from '@/components/agent/ReportDeliveryCard'

type ConnectorStatus = 'available' | 'configured' | 'not_configured'

type ConnectorInfo = {
  id: string
  name: string
  status: ConnectorStatus
  connected?: boolean
  connectedAt?: string | null
  notes?: string
}

type ConnectorsResponse = {
  philosophy: string
  rateLimit: string
  cacheTtlSeconds: number
  connectors: ConnectorInfo[]
}

type BudgetOptResult = {
  timeframe: string
  currency: string
  productionReady?: boolean
  precisionScorecard?: {
    threshold: number
    overall: number
    productionReady: boolean
    dimensions: Array<{
      key: string
      score: number
      reason: string
    }>
  }
  assumptions: string[]
  kpiSnapshot: {
    spend: number | null
    revenue: number | null
    roas: number | null
    cpa: number | null
    cpc: number | null
    ctr: number | null
    cvr: number | null
  }
  diagnosis: {
    summary: string
    drivers: Array<{
      driver: string
      evidence: string
      impact: 'high' | 'medium' | 'low'
      confidence: number
    }>
  }
  recommendations: Array<{
    title: string
    why: string
    how: string[]
    expectedImpact: string
    risk: string
    metricToWatch: string
  }>
  budgetPlan: Array<{
    channel: string
    currentBudget: number | null
    recommendedBudget: number | null
    delta: number | null
    rationale: string
  }>
  creativeInsights: Array<{
    platform: string
    whatWorked: string[]
    whatToTest: string[]
    doNotDo: string[]
  }>
  reportHtml: string
}

function clampText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return value.slice(0, maxChars)
}

function formatMoney(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`
  }
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildActionPlanText(result: BudgetOptResult) {
  const cuts = (result.budgetPlan || []).filter((row) => (row.delta ?? 0) < 0)
  const scales = (result.budgetPlan || []).filter((row) => (row.delta ?? 0) > 0)
  const tests = (result.creativeInsights || []).flatMap((insight) =>
    (insight.whatToTest || []).map((item) => `${insight.platform}: ${item}`)
  )
  const expectedImpact = (result.recommendations || [])
    .map((item) => item.expectedImpact)
    .filter(Boolean)

  return [
    `Budget Optimization Action Plan`,
    ``,
    `Timeframe: ${result.timeframe || '—'}`,
    `Currency: ${result.currency || '—'}`,
    `ROAS: ${result.kpiSnapshot?.roas ?? '—'}`,
    ``,
    `Diagnosis`,
    result.diagnosis?.summary || '—',
    ``,
    `What to cut`,
    ...(cuts.length
      ? cuts.map(
          (row) =>
            `- ${row.channel}: reduce by ${formatMoney(Math.abs(row.delta ?? 0), result.currency)}. ${row.rationale}`
        )
      : ['- No channel cuts recommended yet.']),
    ``,
    `What to scale`,
    ...(scales.length
      ? scales.map(
          (row) =>
            `- ${row.channel}: increase by ${formatMoney(row.delta ?? 0, result.currency)}. ${row.rationale}`
        )
      : ['- No channel scale recommendations yet.']),
    ``,
    `What to test`,
    ...(tests.length ? tests.map((item) => `- ${item}`) : ['- No creative tests suggested yet.']),
    ``,
    `Expected impact`,
    ...(expectedImpact.length ? expectedImpact.map((item) => `- ${item}`) : ['- No quantified impact provided yet.']),
  ].join('\n')
}

function formatTimeframeLabel(value: string) {
  const labels: Record<string, string> = {
    last_7_days: 'Last 7 days',
    last_30_days: 'Last 30 days',
    last_90_days: 'Last 90 days',
    month_to_date: 'Month to date',
  }
  return labels[value] || value.replace(/_/g, ' ')
}

export function BudgetOptimizationFlow({
  initialQuestion,
  initialMode,
  initialTimeframe,
  initialConnectors,
}: {
  initialQuestion?: string
  initialMode?: string
  initialTimeframe?: string
  initialConnectors?: string[]
}) {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const devRun = useAgentRun()
  const arjunRun = useAgentRun()
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>(initialConnectors?.length ? initialConnectors : ['manual'])
  const [connectorsMeta, setConnectorsMeta] = useState<Pick<ConnectorsResponse, 'philosophy' | 'rateLimit' | 'cacheTtlSeconds'> | null>(
    null
  )

  const [timeframe, setTimeframe] = useState(initialTimeframe || 'last_30_days')
  const [currency, setCurrency] = useState('INR')
  const [question, setQuestion] = useState('Why did ROAS dip in the last 7 days? Provide RCA and what to do next.')
  const [dataText, setDataText] = useState('')
  const [uploadedRowCount, setUploadedRowCount] = useState<number | null>(null)
  const [calibrationChannels, setCalibrationChannels] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BudgetOptResult | null>(null)
  const workspaceId = activeWorkspace?.id ?? ''

  useEffect(() => {
    if (initialQuestion) {
      setQuestion(initialQuestion)
    }
  }, [initialQuestion])

  useEffect(() => {
    if (initialTimeframe) {
      setTimeframe(initialTimeframe)
    }
  }, [initialTimeframe])

  useEffect(() => {
    if (initialConnectors?.length) {
      setSelectedConnectors(initialConnectors)
    }
  }, [initialConnectors])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const qp = user?.id ? `?userId=${encodeURIComponent(user.id)}` : ''
        const resp = await fetch(`/api/budget-optimization/connectors${qp}`)
        if (!resp.ok) throw new Error(await resp.text())
        const json = (await resp.json()) as ConnectorsResponse
        if (cancelled) return
        setConnectors(json.connectors || [])
        setConnectorsMeta({ philosophy: json.philosophy, rateLimit: json.rateLimit, cacheTtlSeconds: json.cacheTtlSeconds })
      } catch (err: any) {
        if (cancelled) return
        setConnectors([])
        setConnectorsMeta(null)
        toast.error(`Failed to load connectors: ${err?.message || 'unknown error'}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const selectedConnectorSet = useMemo(() => new Set(selectedConnectors), [selectedConnectors])

  function toggleConnector(id: string) {
    setSelectedConnectors((prev) => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      if (set.size === 0) set.add('manual')
      return Array.from(set)
    })
  }

  async function onAnalyze() {
    setLoading(true)
    setResult(null)
    try {
      const payload = {
        userId: user?.id || 'anonymous',
        question: question.trim(),
        timeframe,
        currency,
        connectorsUsed: selectedConnectors,
        dataText: clampText(dataText.trim(), 25_000)
      }
      const resp = await fetch('/api/budget-optimization/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(json?.error || json?.details || 'request failed')
      setResult(json?.result || null)
      toast.success(json?.cached ? 'Loaded cached analysis' : 'Analysis generated')
    } catch (err: any) {
      toast.error(`Budget optimization failed: ${err?.message || 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Max upload size is 10MB')
      return
    }
    try {
      const form = new FormData()
      form.append('file', file)
      if (user?.id) form.append('userId', user.id)

      const resp = await fetch('/api/budget-optimization/upload', {
        method: 'POST',
        body: form
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(json?.error || json?.details || 'upload failed')

      setDataText(clampText(String(json?.dataText || ''), 25_000))
      setUploadedRowCount(Number.isFinite(Number(json?.rowCount)) ? Number(json.rowCount) : null)
      toast.success(`Parsed ${json?.rowCount || 0} rows from ${file.name}`)
    } catch (err: any) {
      toast.error(`Upload failed: ${err?.message || 'unknown error'}`)
    }
  }

  async function onUploadCalibration(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const form = new FormData()
      form.append('file', file)
      if (user?.id) form.append('userId', user.id)
      const resp = await fetch('/api/budget-optimization/calibration/upload', {
        method: 'POST',
        body: form
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(json?.error || json?.details || 'calibration failed')
      setCalibrationChannels(Array.isArray(json?.channelsUpdated) ? json.channelsUpdated : [])
      toast.success(`Calibration updated for ${json?.channelsUpdated?.length || 0} channels`)
    } catch (err: any) {
      toast.error(`Calibration upload failed: ${err?.message || 'unknown error'}`)
    }
  }

  const kpi = result?.kpiSnapshot
  const isRoasGoal = initialMode === 'roas'
  const budgetCuts = useMemo(() => (result?.budgetPlan || []).filter((row) => (row.delta ?? 0) < 0), [result])
  const budgetScales = useMemo(() => (result?.budgetPlan || []).filter((row) => (row.delta ?? 0) > 0), [result])
  const creativeTests = useMemo(
    () =>
      (result?.creativeInsights || []).flatMap((insight) =>
        (insight.whatToTest || []).map((test) => ({
          platform: insight.platform,
          test,
        }))
      ),
    [result]
  )
  const expectedImpactItems = useMemo(
    () => (result?.recommendations || []).map((item) => item.expectedImpact).filter(Boolean),
    [result]
  )
  const decisionSummaryCards = useMemo(() => {
    if (!result) return []

    return [
      {
        title: 'What to cut',
        description: 'Reduce spend where return is weakest.',
        items: budgetCuts.length
          ? budgetCuts.map((row) => ({
              label: row.channel,
              detail: `Cut ${formatMoney(Math.abs(row.delta ?? 0), result.currency)}. ${row.rationale}`,
            }))
          : [{ label: 'No cuts recommended', detail: 'Current plan does not call for immediate reductions.' }],
      },
      {
        title: 'What to scale',
        description: 'Add budget where return should compound.',
        items: budgetScales.length
          ? budgetScales.map((row) => ({
              label: row.channel,
              detail: `Add ${formatMoney(row.delta ?? 0, result.currency)}. ${row.rationale}`,
            }))
          : [{ label: 'No scale recommendation yet', detail: 'Analysis did not identify a clear scale candidate.' }],
      },
      {
        title: 'What to test',
        description: 'Run the next creative or targeting experiments.',
        items: creativeTests.length
          ? creativeTests.slice(0, 4).map((item) => ({
              label: item.platform,
              detail: item.test,
            }))
          : [{ label: 'No tests suggested', detail: 'Add more performance data to generate creative tests.' }],
      },
      {
        title: 'Expected impact',
        description: 'Likely upside if the plan is applied.',
        items: expectedImpactItems.length
          ? expectedImpactItems.slice(0, 4).map((item, idx) => ({
              label: `Impact ${idx + 1}`,
              detail: item,
            }))
          : [{ label: 'Impact not quantified yet', detail: 'Review recommendations for directional guidance.' }],
      },
    ]
  }, [budgetCuts, budgetScales, creativeTests, expectedImpactItems, result])

  const selectedConnectorNames = useMemo(() => {
    const names = connectors
      .filter((connector) => selectedConnectorSet.has(connector.id))
      .map((connector) => connector.name)
    if (names.length) return names
    return selectedConnectors.map((connector) => connector.replace(/_/g, ' '))
  }, [connectors, selectedConnectorSet, selectedConnectors])

  return (
    <div className="space-y-4">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex w-fit items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            {isRoasGoal ? 'ROAS diagnosis' : 'Budget optimization'}
          </div>
          <div className="space-y-2">
            <h2 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
              {isRoasGoal ? 'Optimize ROAS' : 'Budget Optimization'}
            </h2>
            <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
              {isRoasGoal
                ? 'Diagnose wasted spend, compare channel efficiency, and reallocate budget toward stronger return.'
                : 'Review budget performance, isolate waste, and turn the next reallocation decision into a clear action plan.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Workspace:</span> <span className="font-medium text-foreground">{activeWorkspace?.name || 'Select workspace'}</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Timeframe:</span> <span className="font-medium text-foreground">{formatTimeframeLabel(timeframe)}</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Sources:</span> <span className="font-medium text-foreground">{selectedConnectorNames.length ? `${selectedConnectorNames.length} channels` : 'Manual analysis'}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle className="text-base">{isRoasGoal ? 'ROAS Diagnosis Brief' : 'Budget Optimization Brief'}</CardTitle>
          <CardDescription className="text-sm">
            {isRoasGoal
              ? 'Start from one clear ROAS question, review the selected channels and timeframe, then generate the diagnosis.'
              : 'Set the question, timeframe, and available data before running the analysis.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus</div>
              <div className="mt-1 text-sm font-medium text-foreground">{isRoasGoal ? 'Return on ad spend' : 'Budget optimization'}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeframe</div>
              <div className="mt-1 text-sm font-medium text-foreground">{formatTimeframeLabel(timeframe)}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channels</div>
              <div className="mt-1 text-sm font-medium text-foreground">{selectedConnectorNames.join(', ') || 'Manual data'}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</div>
              <div className="mt-1 text-sm font-medium text-foreground">{currency}</div>
            </div>
          </div>

          {activeWorkspace?.name ? (
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</div>
              <div className="mt-1 text-sm font-medium text-foreground">{activeWorkspace.name}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-400">Question</div>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-[96px]" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onAnalyze}
              disabled={loading || !question.trim()}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-500"
            >
              {loading ? 'Generating ROAS Diagnosis…' : isRoasGoal ? 'Generate ROAS Diagnosis' : 'Analyze'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
          Refine setup
        </summary>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Connectors and uploads</CardTitle>
              <CardDescription className="text-sm">Adjust sources, uploads, and calibration only if the default brief needs more context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {connectors.length ? (
                connectors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={[
                      'w-full text-left border rounded-md p-3 transition',
                      selectedConnectorSet.has(c.id)
                        ? 'border-orange-400 bg-orange-50 dark:border-orange-800/60 dark:bg-orange-950/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60'
                    ].join(' ')}
                    onClick={() => toggleConnector(c.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{c.name}</div>
                      <Badge
                        className={
                          c.status === 'configured'
                            ? 'bg-green-100 text-green-800'
                            : c.status === 'available'
                              ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                              : 'bg-yellow-100 text-yellow-900'
                        }
                      >
                        {c.status === 'not_configured' ? 'not configured' : c.status}
                      </Badge>
                    </div>
                    {c.notes ? <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{c.notes}</div> : null}
                  </button>
                ))
              ) : (
                <div className="text-sm text-slate-700 dark:text-slate-300">Connectors unavailable.</div>
              )}

              <div className="pt-2 border-t">
                <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">Upload source data (CSV/XLS/XLSX/JSON)</div>
                <Input type="file" accept=".csv,.xls,.xlsx,.json,.txt" onChange={onUploadFile} />
                {uploadedRowCount !== null ? <div className="text-xs text-emerald-700 mt-1">Loaded rows: {uploadedRowCount}</div> : null}
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">Parsed server-side and analyzed in-memory.</div>
              </div>

              <div className="pt-2 border-t">
                <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">Upload forecast calibration (optional)</div>
                <Input type="file" accept=".csv,.xls,.xlsx,.json" onChange={onUploadCalibration} />
                {calibrationChannels.length ? (
                  <div className="text-xs text-emerald-700 mt-1">Calibrated: {calibrationChannels.join(', ')}</div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">Columns: channel, forecast_roas, actual_roas, forecast_cpa, actual_cpa.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Analysis controls</CardTitle>
              <CardDescription className="text-sm">Adjust timeframe, currency, or paste raw export notes when the main brief is not enough.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs text-slate-600 dark:text-slate-400">Timeframe</div>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="last_7_days">Last 7 days</option>
                    <option value="last_30_days">Last 30 days</option>
                    <option value="last_90_days">Last 90 days</option>
                    <option value="month_to_date">Month to date</option>
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-600 dark:text-slate-400">Currency</div>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400">Data (paste CSV/JSON export or notes)</div>
                  {dataText.trim() ? (
                    <Button variant="ghost" size="sm" onClick={() => setDataText('')}>
                      Clear
                    </Button>
                  ) : null}
                </div>
                <Textarea
                  value={dataText}
                  onChange={(e) => setDataText(clampText(e.target.value, 25_000))}
                  placeholder="Paste your Meta/Google/GA4 export here if you want the diagnosis grounded in raw performance data."
                  className="min-h-[140px]"
                />
                <div className="text-xs text-slate-500 dark:text-slate-500">Max 25,000 characters per request.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </details>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="overview">Diagnosis</TabsTrigger>
          <TabsTrigger value="rca">Drivers</TabsTrigger>
          <TabsTrigger value="recommendations">Next Actions</TabsTrigger>
          <TabsTrigger value="creative">Creative Signals</TabsTrigger>
          <TabsTrigger value="report">Full Report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No analysis yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Run analysis to see KPIs, drivers, and a budget plan.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {result.precisionScorecard ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Production Precision Gate</CardTitle>
                    <CardDescription className="text-sm">
                      Rule: every precision score must be {'>='}{result.precisionScorecard.threshold} for production-ready status.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge className={result.precisionScorecard.productionReady ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {result.precisionScorecard.productionReady ? 'Production-ready' : 'Not production-ready'}
                      </Badge>
                      <div className="text-sm text-gray-700">Overall precision score: {result.precisionScorecard.overall.toFixed(1)}/10</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {result.precisionScorecard.dimensions.map((d) => (
                        <div key={d.key} className="border rounded-md p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">{d.key.replace(/_/g, ' ')}</div>
                            <Badge className={d.score >= (result.precisionScorecard?.threshold || 9) ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-900'}>
                              {d.score.toFixed(1)}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">{d.reason}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Spend</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg font-semibold">{formatMoney(kpi?.spend ?? null, result.currency)}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Revenue</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg font-semibold">{formatMoney(kpi?.revenue ?? null, result.currency)}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">ROAS</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg font-semibold">{kpi?.roas ?? '—'}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">CPA</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg font-semibold">{formatMoney(kpi?.cpa ?? null, result.currency)}</CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Decision Package</CardTitle>
                  <CardDescription className="text-sm">
                    What to cut, what to scale, what to test, and the likely upside from acting on this ROAS plan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {decisionSummaryCards.map((section) => (
                      <div key={section.title} className="rounded-lg border p-4 space-y-3">
                        <div>
                          <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{section.title}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">{section.description}</div>
                        </div>
                        <div className="space-y-2">
                          {section.items.map((item) => (
                            <div key={`${section.title}-${item.label}-${item.detail}`} className="rounded-md bg-slate-50 dark:bg-slate-900/60 p-3">
                              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</div>
                              <div className="text-sm text-slate-700 dark:text-slate-300">{item.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => downloadTextFile('roas-action-plan.txt', buildActionPlanText(result))}
                    >
                      Export Plan
                    </Button>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      Export a concise action brief for sharing or execution review.
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Budget Plan</CardTitle>
                  <CardDescription className="text-sm">Suggested reallocations with rationale.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {result.budgetPlan?.length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-600 border-b">
                          <th className="py-2 pr-3">Channel</th>
                          <th className="py-2 pr-3">Current</th>
                          <th className="py-2 pr-3">Recommended</th>
                          <th className="py-2 pr-3">Δ</th>
                          <th className="py-2">Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.budgetPlan.map((row, idx) => (
                          <tr key={idx} className="border-b align-top">
                            <td className="py-2 pr-3 font-medium">{row.channel}</td>
                            <td className="py-2 pr-3">{formatMoney(row.currentBudget, result.currency)}</td>
                            <td className="py-2 pr-3">{formatMoney(row.recommendedBudget, result.currency)}</td>
                            <td className="py-2 pr-3">
                              {row.delta === null || !Number.isFinite(row.delta) ? '—' : formatMoney(row.delta, result.currency)}
                            </td>
                            <td className="py-2">{row.rationale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-sm text-gray-700">—</div>
                  )}
                </CardContent>
              </Card>

              {result.assumptions?.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Assumptions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {result.assumptions.map((a, idx) => (
                      <div key={idx}>• {a}</div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rca" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No RCA yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Run analysis to see root causes and drivers.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Diagnosis</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-gray-800">{result.diagnosis?.summary || '—'}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Key Drivers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.diagnosis?.drivers?.length ? (
                    result.diagnosis.drivers.map((d, idx) => (
                      <div key={idx} className="border rounded-md p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm">{d.driver}</div>
                          <Badge className={d.impact === 'high' ? 'bg-red-100 text-red-800' : d.impact === 'medium' ? 'bg-yellow-100 text-yellow-900' : 'bg-gray-100 text-gray-800'}>
                            {d.impact}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-800 mt-1">{d.evidence}</div>
                        <div className="text-xs text-gray-600 mt-2">Confidence: {Math.round((Number(d.confidence || 0) || 0) * 100)}%</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-700">—</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No recommendations yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Run analysis to get actions and metrics to watch.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {result.recommendations?.length ? (
                result.recommendations.map((r, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <CardDescription className="text-sm">Metric to watch: {r.metricToWatch || '—'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="text-gray-900">{r.why}</div>
                      {Array.isArray(r.how) && r.how.length ? (
                        <div className="space-y-1 text-gray-800">
                          {r.how.map((h, hIdx) => (
                            <div key={hIdx}>• {h}</div>
                          ))}
                        </div>
                      ) : null}
                      <div className="text-xs text-gray-700">Expected impact: {r.expectedImpact || '—'}</div>
                      <div className="text-xs text-gray-700">Risk: {r.risk || '—'}</div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">—</CardTitle>
                  </CardHeader>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="creative" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No creative insights yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Run analysis to get creative angles and tests.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {result.creativeInsights?.length ? (
                result.creativeInsights.map((c, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-base">{c.platform}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-gray-900 mb-1">What worked</div>
                        {(Array.isArray(c.whatWorked) ? c.whatWorked : []).map((x, i) => (
                          <div key={i}>• {x}</div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 mb-1">What to test</div>
                        {(Array.isArray(c.whatToTest) ? c.whatToTest : []).map((x, i) => (
                          <div key={i}>• {x}</div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 mb-1">Don’t do</div>
                        {(Array.isArray(c.doNotDo) ? c.doNotDo : []).map((x, i) => (
                          <div key={i}>• {x}</div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">—</CardTitle>
                  </CardHeader>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No report yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Run analysis to generate an HTML report.</CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => downloadTextFile('budget-optimization-report.html', result.reportHtml || '', 'text/html;charset=utf-8')}
                  disabled={!result.reportHtml}
                >
                  Download HTML
                </Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">HTML Report Preview</CardTitle>
                  <CardDescription className="text-sm">Generated by AI; review before sharing.</CardDescription>
                </CardHeader>
                <CardContent>
                  {result.reportHtml ? (
                    <div className="border rounded-md p-4 bg-white" dangerouslySetInnerHTML={{ __html: result.reportHtml }} />
                  ) : (
                    <div className="text-sm text-gray-700">—</div>
                  )}
                </CardContent>
              </Card>

              <ReportDeliveryCard
                moduleTitle="Optimize ROAS"
                analysisLabel="ROAS diagnosis"
                companyId={workspaceId || undefined}
                sourceText={[
                  result.diagnosis?.summary,
                  ...(result.recommendations || []),
                ].filter(Boolean).join('\n\n')}
                sourceArtifact={result as unknown as Record<string, unknown>}
                sourceHtml={result.reportHtml}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
          Run details and calibration
        </summary>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Button size="sm" disabled={devRun.streaming} className="h-auto min-h-9 whitespace-normal text-left leading-5"
              onClick={() => devRun.run('dev',
                'Review KPI movement against baselines. Identify the top anomalies in spend, ROAS, CPA, and conversion rate. Prepare a diagnosis with root causes and recommended budget shifts.',
                'nightly_kpi_watch', workspaceId || undefined)}>
              Run Dev — KPI Diagnosis
            </Button>
            <AgentRunPanel agentName="dev" label="Dev — KPI Watch & Diagnosis" {...devRun} onReset={devRun.reset} />
          </div>
          <div className="space-y-3">
            <Button size="sm" disabled={arjunRun.streaming} className="h-auto min-h-9 whitespace-normal text-left leading-5"
              onClick={() => arjunRun.run('arjun',
                'Verify predicted outcomes against actual KPI movement. Where variance exceeds tolerance, write calibration notes. Recommend budget reallocation based on verified performance data.',
                'weekly_outcome_verification', workspaceId || undefined)}>
              Run Arjun — Outcome Verification
            </Button>
            <AgentRunPanel agentName="arjun" label="Arjun — Budget Verification" {...arjunRun} onReset={arjunRun.reset} />
          </div>
        </div>
      </details>
    </div>
  )
}
