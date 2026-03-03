import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { BarChart3, CheckCircle, Clock, Upload, Zap } from 'lucide-react'
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

export function PerformanceScorecard() {
  const [activeTab, setActiveTab] = useState('upload')
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: 'upload', title: 'Upload', description: 'Provide exports or notes', status: 'pending' },
    { id: 'analysis', title: 'Analysis', description: 'Generate AI analysis', status: 'pending' },
    { id: 'scorecard', title: 'Scorecard', description: 'Compute overall and section scores', status: 'pending' },
    { id: 'benchmarking', title: 'Benchmarking', description: 'Compare vs industry targets', status: 'pending' },
    { id: 'forecasting', title: 'Forecasting', description: 'Create scenario outlook', status: 'pending' },
    { id: 'dashboard', title: 'Dashboard', description: 'Render the scorecard dashboard', status: 'pending' }
  ])

  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>(['manual'])
  const [connectorsMeta, setConnectorsMeta] = useState<Pick<ConnectorsResponse, 'philosophy' | 'rateLimit' | 'cacheTtlSeconds'> | null>(null)

  const [timeframe, setTimeframe] = useState('last_30_days')
  const [currency, setCurrency] = useState('INR')
  const [businessContext, setBusinessContext] = useState('')
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

  const selectedConnectorSet = useMemo(() => new Set(selectedConnectors), [selectedConnectors])

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
      setActiveTab('dashboard')
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

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          Performance Scorecard
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn exports and notes into a clear performance scorecard with AI analysis.
        </p>
        {connectorsMeta ? (
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Rate limit: <span className="font-medium">{connectorsMeta.rateLimit}</span> • Cache: {connectorsMeta.cacheTtlSeconds}s
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-purple-500" />
            <span>Scorecard Workflow</span>
          </CardTitle>
          <CardDescription>Progress updates reflect real generation (not simulated scores).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((s) => (
            <div
              key={s.id}
              className={cn(
                'flex items-center justify-between gap-3 p-3 rounded-lg border',
                s.status === 'completed' ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20' : '',
                s.status === 'processing' ? 'border-purple-200 bg-purple-50 dark:border-purple-900/40 dark:bg-purple-950/20' : '',
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
                {s.status === 'processing' ? <Clock className="h-5 w-5 text-purple-600 animate-spin" /> : null}
                {s.status === 'error' ? <Badge variant="destructive">Error</Badge> : null}
                {s.status === 'pending' ? <Badge variant="secondary">Pending</Badge> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          <TabsTrigger value="benchmarking">Benchmarks</TabsTrigger>
          <TabsTrigger value="forecasting">Forecast</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Connectors</CardTitle>
                <CardDescription className="text-sm">Select which exports/streams this scorecard reflects.</CardDescription>
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
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/25'
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
                <CardTitle className="text-base">Inputs</CardTitle>
                <CardDescription className="text-sm">Upload a CSV/JSON export or paste it directly.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <div className="mb-1 text-xs text-slate-600 dark:text-slate-400">Timeframe</div>
                    <select
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value)}
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No analysis yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Generate to see insights and recommended actions.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Insights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(result.insights || []).length ? (result.insights || []).map((i, idx) => <div key={idx}>• {i}</div>) : <div>—</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommended Actions</CardTitle>
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
            </div>
          )}
        </TabsContent>

        <TabsContent value="scorecard" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No scorecard yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Generate to see overall and section scores.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-purple-700">{Number.isFinite(Number(overall)) ? Math.round(Number(overall)) : '—'}</div>
                  <div className="text-sm text-muted-foreground">Overall Score</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-700">{formatMoney(k?.spend ?? null, result.currency)}</div>
                  <div className="text-sm text-muted-foreground">Spend</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">{formatMoney(k?.revenue ?? null, result.currency)}</div>
                  <div className="text-sm text-muted-foreground">Revenue</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-700">{k?.roas ?? '—'}</div>
                  <div className="text-sm text-muted-foreground">ROAS</div>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Section Scores</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="benchmarking" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No benchmarks yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Generate to see benchmark comparisons.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Benchmarking</CardTitle>
                <CardDescription className="text-sm">These are directional targets; validate per industry and funnel stage.</CardDescription>
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
          )}
        </TabsContent>

        <TabsContent value="forecasting" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No forecast yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Generate to see scenario forecasts.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forecast</CardTitle>
                <CardDescription className="text-sm">Scenario-based (not a guarantee).</CardDescription>
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
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          {!result ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No dashboard yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">Generate a scorecard to see KPIs, channels, and charts.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-gray-600">Overall</div>
                  <div className="text-2xl font-bold text-purple-700">{Math.round(Number(result.overallScore || 0))}/100</div>
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
                    <CardDescription className="text-sm">Distribution of channel scores (from your input).</CardDescription>
                  </div>
                  <Badge className="bg-gray-100 text-gray-800">{result.timeframe}</Badge>
                </CardHeader>
                <CardContent style={{ height: 260 }}>
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" hide />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2} dot={false} />
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
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-center">
        <Button
          onClick={generate}
          disabled={loading}
          className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {loading ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <BarChart3 className="mr-2 h-5 w-5" />
              Generate Performance Scorecard
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
