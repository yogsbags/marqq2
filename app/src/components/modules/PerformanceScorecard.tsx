import { useEffect, useMemo, useState } from 'react'
import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from '@/components/agent/AgentRunPanel'
import { ReportDeliveryCard } from '@/components/agent/ReportDeliveryCard'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { BarChart3, CheckCircle, Clock, Zap } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type ConnectorStatus = 'available' | 'configured' | 'not_configured'

type ConnectorInfo = {
  id: string
  name: string
  status: ConnectorStatus
}

type ConnectorsResponse = {
  philosophy: string
  rateLimit: string
  cacheTtlSeconds: number
  connectors: ConnectorInfo[]
}

type WorkflowStep = {
  id: string
  title: string
  description: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress?: number
}

type ScorecardResult = {
  timeframe: string
  currency: string
  assumptions: string[]
  overallScore: number
  kpis: {
    spend: number | null
    revenue: number | null
    roas: number | null
    leads: number | null
    customers: number | null
    cpa: number | null
    cpc: number | null
    ctr: number | null
    cvr: number | null
  }
  sectionScores: Array<{ section: string; score: number; notes: string[] }>
  channelBreakdown: Array<{
    channel: string
    spend: number | null
    revenue: number | null
    roas: number | null
    cpa: number | null
    ctr: number | null
    cvr: number | null
    score: number
    notes: string
  }>
  benchmarks: Array<{ metric: string; yourValue: string; benchmark: string; status: 'above' | 'near' | 'below'; notes: string }>
  insights: string[]
  recommendedActions: Array<{ title: string; priority: 'high' | 'medium' | 'low'; why: string; how: string[]; metricToWatch: string }>
  forecast: { horizon: string; summary: string; scenarios: Array<{ name: string; assumption: string; expectedOutcome: string }> }
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

function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(2)}%`
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

function KpiSummaryCards({
  overall,
  kpis,
  currency,
}: {
  overall: number | undefined
  kpis: ScorecardResult['kpis'] | undefined
  currency: string
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="border-orange-200/60 bg-orange-50/60 p-4 text-center dark:border-orange-900/40 dark:bg-orange-950/20">
        <div className="text-3xl font-bold text-orange-700 dark:text-orange-300">{Number.isFinite(Number(overall)) ? Math.round(Number(overall)) : '—'}</div>
        <div className="text-sm text-muted-foreground">Overall Score</div>
      </Card>
      <Card className="border-border/70 bg-background/80 p-4 text-center">
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatMoney(kpis?.spend ?? null, currency)}</div>
        <div className="text-sm text-muted-foreground">Spend</div>
      </Card>
      <Card className="border-border/70 bg-background/80 p-4 text-center">
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatMoney(kpis?.revenue ?? null, currency)}</div>
        <div className="text-sm text-muted-foreground">Revenue</div>
      </Card>
      <Card className="border-border/70 bg-background/80 p-4 text-center">
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{kpis?.roas ?? '—'}</div>
        <div className="text-sm text-muted-foreground">ROAS</div>
      </Card>
    </div>
  )
}

type PerformanceScorecardProps = {
  initialQuestion?: string
  initialTimeframe?: string
  initialConnectors?: string[]
}

export function PerformanceScorecard({ initialQuestion, initialTimeframe, initialConnectors }: PerformanceScorecardProps = {}) {
  const { activeWorkspace } = useWorkspace()
  const activeCompanyId = activeWorkspace?.id || ''
  const mayaRun = useAgentRun()
  const kiranRun = useAgentRun()
  const devRun = useAgentRun()
  const arjunRun = useAgentRun()
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: 'upload', title: 'Refine setup', description: 'Adjust sources, timeframe, and supporting context', status: 'pending' },
    { id: 'analysis', title: 'Diagnosis', description: 'Generate the main performance readout', status: 'pending' },
    { id: 'scorecard', title: 'Key signals', description: 'Summarize scores and channel health', status: 'pending' },
    { id: 'benchmarking', title: 'Comparisons', description: 'See how the current picture stacks up against targets', status: 'pending' },
    { id: 'forecasting', title: 'Next actions', description: 'Estimate likely outcomes and what to do next', status: 'pending' },
    { id: 'dashboard', title: 'Full view', description: 'Open the complete decision workspace', status: 'pending' }
  ])

  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>(initialConnectors?.length ? initialConnectors : ['manual'])
  const [connectorsMeta, setConnectorsMeta] = useState<Pick<ConnectorsResponse, 'philosophy' | 'rateLimit' | 'cacheTtlSeconds'> | null>(null)

  const [timeframe, setTimeframe] = useState(initialTimeframe || 'last_30_days')
  const [currency, setCurrency] = useState('INR')
  const [businessContext, setBusinessContext] = useState(initialQuestion || '')
  const [dataText, setDataText] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScorecardResult | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch('/api/performance-scorecard/connectors')
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
  }, [])

  useEffect(() => {
    if (initialConnectors?.length) setSelectedConnectors(initialConnectors)
  }, [initialConnectors])

  useEffect(() => {
    if (initialTimeframe) setTimeframe(initialTimeframe)
  }, [initialTimeframe])

  useEffect(() => {
    if (initialQuestion) setBusinessContext(initialQuestion)
  }, [initialQuestion])

  const selectedConnectorSet = useMemo(() => new Set(selectedConnectors), [selectedConnectors])
  const selectedConnectorLabels = useMemo(() => {
    const byId = new Map(connectors.map((connector) => [connector.id, connector.name]))
    return selectedConnectors.map((id) => byId.get(id) || id)
  }, [connectors, selectedConnectors])
  const hasMayaAnalyticsStack = useMemo(
    () => ['ga4', 'gsc', 'google_sheets'].every((id) => selectedConnectorSet.has(id)),
    [selectedConnectorSet]
  )
  const hasKiranAnalyticsStack = useMemo(
    () => ['youtube', 'facebook', 'instagram', 'linkedin', 'reddit'].some((id) => selectedConnectorSet.has(id)),
    [selectedConnectorSet]
  )

  function updateStep(id: string, patch: Partial<WorkflowStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function toggleConnector(id: string) {
    setSelectedConnectors((prev) => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      if (set.size === 0) set.add('manual')
      return Array.from(set)
    })
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Max upload size is 10MB')
      return
    }
    const text = await file.text().catch(() => '')
    if (!text.trim()) {
      toast.error('File was empty')
      return
    }
    setUploadedFileName(file.name)
    setDataText(clampText(text, 25_000))
    updateStep('upload', { status: 'completed' })
    toast.success(`Loaded ${file.name}`)
    e.target.value = ''
  }

  async function generate() {
    const hasInput = Boolean(dataText.trim() || businessContext.trim())
    if (!hasInput) {
      toast.error('Add data (paste/upload) or business context first')
      return
    }

    setLoading(true)
    setResult(null)
    updateStep('upload', { status: hasInput ? 'completed' : 'pending' })
    for (const id of ['analysis', 'scorecard', 'benchmarking', 'forecasting', 'dashboard']) {
      updateStep(id, { status: 'pending', progress: undefined })
    }
    updateStep('analysis', { status: 'processing', progress: 15 })

    try {
      const payload = {
        timeframe,
        currency,
        connectorsUsed: selectedConnectors,
        businessContext: businessContext.trim(),
        dataText: clampText(dataText.trim(), 25_000)
      }
      const resp = await fetch('/api/performance-scorecard/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(json?.error || json?.details || 'request failed')

      setResult(json?.result || null)
      updateStep('analysis', { status: 'completed', progress: 100 })
      updateStep('scorecard', { status: 'completed' })
      updateStep('benchmarking', { status: 'completed' })
      updateStep('forecasting', { status: 'completed' })
      updateStep('dashboard', { status: 'completed' })

      toast.success(json?.cached ? 'Loaded cached scorecard' : 'Scorecard generated')

      const runCompanyId = activeCompanyId || undefined
      if (runCompanyId && hasMayaAnalyticsStack) {
        void mayaRun.run('maya', mayaQuery, 'seo_analysis', runCompanyId)
      }
      if (runCompanyId && hasKiranAnalyticsStack) {
        void kiranRun.run('kiran', kiranQuery, undefined, runCompanyId)
      }
    } catch (err: any) {
      updateStep('analysis', { status: 'error' })
      toast.error(`Scorecard failed: ${err?.message || 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const overall = result?.overallScore
  const k = result?.kpis

  // Lightweight sparkline placeholder: use channel score distribution if no timeseries is returned.
  const chartData = useMemo(() => {
    const rows = (result?.channelBreakdown || []).slice(0, 12)
    return rows.map((r, idx) => ({ name: r.channel || `Ch ${idx + 1}`, score: Number(r.score || 0) }))
  }, [result])

  const mayaQuery = useMemo(() => {
    const connectorsLabel = selectedConnectors.length ? selectedConnectors.join(', ') : 'manual'
    const contextBits = [
      `Analyze cross-channel marketing performance using these connected sources where relevant: ${connectorsLabel}.`,
      `Timeframe: ${timeframe}.`,
      businessContext.trim() ? `Business question: ${businessContext.trim()}` : '',
      dataText.trim() ? `User-provided data excerpt:\n${clampText(dataText.trim(), 6000)}` : '',
      'Return the clearest diagnosis of what is working, what is underperforming, what content or channel patterns stand out, and the next actions to take.'
    ].filter(Boolean)
    return contextBits.join('\n\n')
  }, [selectedConnectors, timeframe, businessContext, dataText])

  const kiranQuery = useMemo(() => {
    const socialConnectors = selectedConnectors.filter((id) => ['youtube', 'facebook', 'instagram', 'linkedin', 'reddit'].includes(id))
    const connectorsLabel = socialConnectors.length ? socialConnectors.join(', ') : 'social channels'
    const contextBits = [
      `Analyze organic social and video performance using these connected channels where relevant: ${connectorsLabel}.`,
      `Timeframe: ${timeframe}.`,
      businessContext.trim() ? `Business question: ${businessContext.trim()}` : '',
      dataText.trim() ? `User-provided data excerpt:\n${clampText(dataText.trim(), 6000)}` : '',
      'Return the strongest content themes, engagement winners, weak channels or posts, audience-response patterns, and the next social/content actions to take.'
    ].filter(Boolean)
    return contextBits.join('\n\n')
  }, [selectedConnectors, timeframe, businessContext, dataText])

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex w-fit items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            Performance diagnosis
          </div>
          <div className="space-y-2">
            <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
              Diagnose Performance
            </h1>
            <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
              See what is working, what is underperforming, and what to do next across connected channels without opening a dense analyst console.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Workspace:</span> <span className="font-medium text-foreground">{activeWorkspace?.name || 'Select workspace'}</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Timeframe:</span> <span className="font-medium text-foreground">{timeframe.replace(/_/g, ' ')}</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Run mode:</span> <span className="font-medium text-foreground">{selectedConnectorLabels.length ? `${selectedConnectorLabels.length} sources` : 'Manual analysis'}</span></div>
            {connectorsMeta ? <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Cache:</span> <span className="font-medium text-foreground">{connectorsMeta.cacheTtlSeconds}s</span></div> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle className="text-base">Diagnosis brief</CardTitle>
          <CardDescription className="text-sm">
            Run the main diagnosis first. Maya and Kiran review the connected sources automatically when their stacks are selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedConnectorLabels.map((label) => (
                  <Badge key={label} variant="outline">{label}</Badge>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeframe</div>
              <div className="mt-2 text-sm font-medium text-foreground">{timeframe.replace(/_/g, ' ')}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question</div>
              <div className="mt-2 text-sm text-foreground">{businessContext.trim() || 'Diagnose the current performance and highlight the next actions.'}</div>
            </div>
          </div>
          <Button
            onClick={generate}
            disabled={loading}
            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-500 text-white"
          >
            {loading ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Generate Diagnosis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3" open={!initialQuestion && !result}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Refine setup
        </summary>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Connected sources</CardTitle>
              <CardDescription className="text-sm">Choose the channels and sources that should shape this diagnosis.</CardDescription>
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
                  </button>
                ))
              ) : (
                <div className="text-sm text-slate-700 dark:text-slate-300">Connectors unavailable.</div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Question and context</CardTitle>
              <CardDescription className="text-sm">Add the business question, plus any exported data or notes that sharpen the diagnosis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                <div className="flex items-end">
                  <div className="w-full">
                    <div className="mb-1 text-xs text-slate-600 dark:text-slate-400">Upload</div>
                    <Input type="file" accept=".csv,.json,.txt" onChange={onUploadFile} />
                  </div>
                </div>
              </div>

              {uploadedFileName ? <div className="text-xs text-slate-600 dark:text-slate-400">Loaded: {uploadedFileName}</div> : null}

              <div className="space-y-2">
                <div className="text-xs text-slate-600 dark:text-slate-400">Business context (optional)</div>
                <Textarea
                  value={businessContext}
                  onChange={(e) => setBusinessContext(clampText(e.target.value, 4000))}
                  placeholder="Example: Objective, target audience, primary channels, key offers, constraints."
                  className="min-h-[90px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400">Data (paste export)</div>
                  {dataText.trim() ? (
                    <Button variant="ghost" size="sm" onClick={() => setDataText('')}>
                      Clear
                    </Button>
                  ) : null}
                </div>
                <Textarea
                  value={dataText}
                  onChange={(e) => setDataText(clampText(e.target.value, 25_000))}
                  placeholder="Paste your exported metrics here."
                  className="min-h-[160px]"
                />
                <div className="text-xs text-slate-500 dark:text-slate-500">Max 25,000 characters per request.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </details>

      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No diagnosis yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-700">
            Generate to see the main diagnosis, key signals, comparisons, and next actions in one page.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Diagnosis</CardTitle>
              <CardDescription className="text-sm">The main narrative first: what is working, what is weak, and where to act.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2 text-sm">
                {(result.insights || []).length ? (result.insights || []).map((i, idx) => <div key={idx}>• {i}</div>) : <div>—</div>}
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision horizon</div>
                <div className="mt-2 text-sm font-medium text-foreground">{result.forecast?.horizon || 'Current planning horizon'}</div>
                <div className="mt-2 text-sm text-muted-foreground">{result.forecast?.summary || 'Generate a diagnosis to see the likely next-step scenarios.'}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Key Signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <KpiSummaryCards overall={overall} kpis={k} currency={result.currency} />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(result.sectionScores || []).length ? (
                  result.sectionScores.map((s, idx) => (
                    <div key={idx} className="border rounded-md p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm">{s.section}</div>
                        <Badge className="bg-gray-100 text-gray-800">{Math.round(Number(s.score || 0))}</Badge>
                      </div>
                      <div className="text-xs text-gray-700 mt-2 space-y-1">
                        {(Array.isArray(s.notes) ? s.notes : []).slice(0, 6).map((n, nIdx) => (
                          <div key={nIdx}>• {n}</div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-700">—</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(result.recommendedActions || []).length ? (
                (result.recommendedActions || []).map((a, idx) => (
                  <div key={idx} className="border rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{a.title}</div>
                      <Badge className={a.priority === 'high' ? 'bg-red-100 text-red-800' : a.priority === 'medium' ? 'bg-yellow-100 text-yellow-900' : 'bg-gray-100 text-gray-800'}>
                        {a.priority}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-800 mt-1">{a.why}</div>
                    {Array.isArray(a.how) && a.how.length ? (
                      <div className="text-xs text-gray-700 mt-2 space-y-1">
                        {a.how.slice(0, 6).map((h, hIdx) => (
                          <div key={hIdx}>• {h}</div>
                        ))}
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-600 mt-2">Metric to watch: {a.metricToWatch || '—'}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-700">—</div>
              )}
            </CardContent>
          </Card>

          <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Comparisons And Scenarios
            </summary>
            <div className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Comparisons</CardTitle>
                  <CardDescription className="text-sm">Directional benchmarks. Validate them against your industry and funnel stage.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {(result.benchmarks || []).length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-600 border-b">
                          <th className="py-2 pr-3">Metric</th>
                          <th className="py-2 pr-3">Yours</th>
                          <th className="py-2 pr-3">Benchmark</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.benchmarks.map((b, idx) => (
                          <tr key={idx} className="border-b align-top">
                            <td className="py-2 pr-3 font-medium">{b.metric}</td>
                            <td className="py-2 pr-3">{b.yourValue}</td>
                            <td className="py-2 pr-3">{b.benchmark}</td>
                            <td className="py-2 pr-3">
                              <Badge className={b.status === 'above' ? 'bg-green-100 text-green-800' : b.status === 'near' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-900'}>
                                {b.status}
                              </Badge>
                            </td>
                            <td className="py-2">{b.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-sm text-gray-700">—</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Scenario outlook</CardTitle>
                  <CardDescription className="text-sm">Scenario-based, not a guarantee.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">Horizon:</span> {result.forecast?.horizon || '—'}
                  </div>
                  <div className="text-gray-800">{result.forecast?.summary || '—'}</div>
                  {(result.forecast?.scenarios || []).length ? (
                    <div className="space-y-2">
                      {result.forecast.scenarios.map((s, idx) => (
                        <div key={idx} className="border rounded-md p-3">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-gray-700 mt-1">Assumption: {s.assumption}</div>
                          <div className="text-sm text-gray-800 mt-2">{s.expectedOutcome}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </details>
        </div>
      )}

      <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Full workspace view
        </summary>
        <div className="mt-4 space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No full view yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Generate a diagnosis to see KPIs, channels, and the full report workspace.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-gray-600">Overall</div>
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{Math.round(Number(result.overallScore || 0))}/100</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-gray-600">CPA</div>
                  <div className="text-2xl font-bold">{formatMoney(result.kpis?.cpa ?? null, result.currency)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-gray-600">CTR</div>
                  <div className="text-2xl font-bold">{formatPct(result.kpis?.ctr ?? null)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-gray-600">CVR</div>
                  <div className="text-2xl font-bold">{formatPct(result.kpis?.cvr ?? null)}</div>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Channel Scores</CardTitle>
                    <CardDescription className="text-sm">Distribution of channel scores from the diagnosis inputs.</CardDescription>
                  </div>
                  <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">{result.timeframe}</Badge>
                </CardHeader>
                <CardContent style={{ height: 260 }}>
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" hide />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-sm text-gray-700">—</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Channel Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {(result.channelBreakdown || []).length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-600 border-b">
                          <th className="py-2 pr-3">Channel</th>
                          <th className="py-2 pr-3">Spend</th>
                          <th className="py-2 pr-3">Revenue</th>
                          <th className="py-2 pr-3">ROAS</th>
                          <th className="py-2 pr-3">Score</th>
                          <th className="py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.channelBreakdown.map((r, idx) => (
                          <tr key={idx} className="border-b align-top">
                            <td className="py-2 pr-3 font-medium">{r.channel}</td>
                            <td className="py-2 pr-3">{formatMoney(r.spend, result.currency)}</td>
                            <td className="py-2 pr-3">{formatMoney(r.revenue, result.currency)}</td>
                            <td className="py-2 pr-3">{r.roas ?? '—'}</td>
                            <td className="py-2 pr-3">
                              <Badge className="bg-gray-100 text-gray-800">{Math.round(Number(r.score || 0))}</Badge>
                            </td>
                            <td className="py-2">{r.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-sm text-gray-700">—</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">HTML Report</CardTitle>
                  <Button
                    variant="outline"
                    onClick={() => downloadTextFile('performance-scorecard.html', result.reportHtml || '', 'text/html;charset=utf-8')}
                    disabled={!result.reportHtml}
                  >
                    Download HTML
                  </Button>
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
                moduleTitle="Diagnose Performance"
                analysisLabel="Performance diagnosis"
                companyId={activeCompanyId || undefined}
                sourceText={[
                  ...(result.insights || []),
                  ...(result.recommendedActions || []).map((action) => `${action.title}: ${action.why}`),
                ].filter(Boolean).join('\n\n')}
                sourceArtifact={result as unknown as Record<string, unknown>}
                sourceHtml={result.reportHtml}
              />
            </div>
          )}
        </div>
      </details>

      <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Connected Source Reviews</div>
              <div className="mt-1 text-xs text-muted-foreground">Maya and Kiran deepen the diagnosis when the right connected sources are selected.</div>
            </div>
          </div>
        </summary>
        <div className="mt-4 space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Maya Diagnosis</CardTitle>
              <CardDescription className="text-sm">
                Automatically runs when GA4, Search Console, and Sheets are selected together.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!hasMayaAnalyticsStack ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  Connect and select `GA4`, `GSC`, and `Google Sheets` together to give Maya the full analysis stack for this goal.
                </div>
              ) : null}
              <Button
                size="sm"
                disabled={mayaRun.streaming || !hasMayaAnalyticsStack}
                className="h-auto min-h-9 whitespace-normal text-left leading-5"
                onClick={() => mayaRun.run(
                  'maya',
                  mayaQuery,
                  'seo_analysis',
                  activeCompanyId || undefined
                )}
              >
                Re-run Maya Diagnosis
              </Button>
              <AgentRunPanel agentName="maya" label="Maya — Performance Diagnosis" {...mayaRun} onReset={mayaRun.reset} />
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Kiran Social Diagnosis</CardTitle>
              <CardDescription className="text-sm">
                Automatically runs when social or video channels are selected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!hasKiranAnalyticsStack ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  Select at least one of `YouTube`, `Facebook`, `Instagram`, `LinkedIn`, or `Reddit` to run social and video diagnosis.
                </div>
              ) : null}
              <Button
                size="sm"
                disabled={kiranRun.streaming || !hasKiranAnalyticsStack}
                className="h-auto min-h-9 whitespace-normal text-left leading-5"
                onClick={() => kiranRun.run(
                  'kiran',
                  kiranQuery,
                  undefined,
                  activeCompanyId || undefined
                )}
              >
                Re-run Kiran Diagnosis
              </Button>
              <AgentRunPanel agentName="kiran" label="Kiran — Social & Video Diagnosis" {...kiranRun} onReset={kiranRun.reset} />
            </CardContent>
          </Card>
        </div>
      </details>

      <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Run Details And Calibration</div>
              <div className="mt-1 text-xs text-muted-foreground">Workflow status and optional operator review tools.</div>
            </div>
          </div>
        </summary>
        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-orange-500" />
                <span>Diagnosis Workflow</span>
              </CardTitle>
              <CardDescription>Progress updates reflect the actual diagnosis run and downstream analysis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-lg border',
                    s.status === 'completed' ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20' : '',
                    s.status === 'processing' ? 'border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20' : '',
                    s.status === 'error' ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : ''
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{s.title}</div>
                    <div className="truncate text-xs text-slate-600 dark:text-slate-400">{s.description}</div>
                    {s.status === 'processing' && typeof s.progress === 'number' ? <Progress value={s.progress} className="mt-2 h-2" /> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'completed' ? <CheckCircle className="h-5 w-5 text-green-600" /> : null}
                    {s.status === 'processing' ? <Clock className="h-5 w-5 animate-spin text-orange-600 dark:text-orange-300" /> : null}
                    {s.status === 'error' ? <Badge variant="destructive">Error</Badge> : null}
                    {s.status === 'pending' ? <Badge variant="secondary">Pending</Badge> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Advanced Agent Reviews</CardTitle>
                <CardDescription className="text-sm">Optional operator tools for KPI review and calibration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace context</div>
                  <div className="mt-1 font-medium text-foreground">{activeWorkspace?.name || 'Select workspace'}</div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Button size="sm" disabled={devRun.streaming} className="h-auto min-h-9 whitespace-normal text-left leading-5"
                    onClick={() => devRun.run('dev',
                      'Review KPI movement against baselines and prepare anomaly-ready notes. Flag which metrics are trending outside expected range and surface the top 3 priorities to act on this week.',
                      'nightly_kpi_watch', activeCompanyId || undefined)}>
                    Run Dev — KPI Watch
                  </Button>
                  <AgentRunPanel agentName="dev" label="Dev — KPI Analysis" {...devRun} onReset={devRun.reset} />
                </div>
                <div className="space-y-2">
                    <Button size="sm" disabled={arjunRun.streaming} className="h-auto min-h-9 whitespace-normal text-left leading-5"
                    onClick={() => arjunRun.run('arjun',
                      'Verify predicted outcomes against actual KPI movement. Write calibration notes where variance exceeds tolerance. Score prediction accuracy for this period.',
                      'weekly_outcome_verification', activeCompanyId || undefined)}>
                    Run Arjun — Outcome Tracker
                  </Button>
                  <AgentRunPanel agentName="arjun" label="Arjun — Outcome Verification" {...arjunRun} onReset={arjunRun.reset} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </details>
    </div>
  )
}
