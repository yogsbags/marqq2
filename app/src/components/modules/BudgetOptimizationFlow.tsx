import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

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

export function BudgetOptimizationFlow() {
  const { user } = useAuth()
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>(['manual'])
  const [connectorsMeta, setConnectorsMeta] = useState<Pick<ConnectorsResponse, 'philosophy' | 'rateLimit' | 'cacheTtlSeconds'> | null>(
    null
  )

  const [timeframe, setTimeframe] = useState('last_30_days')
  const [currency, setCurrency] = useState('INR')
  const [question, setQuestion] = useState('Why did ROAS dip in the last 7 days? Provide RCA and what to do next.')
  const [dataText, setDataText] = useState('')
  const [uploadedRowCount, setUploadedRowCount] = useState<number | null>(null)
  const [calibrationChannels, setCalibrationChannels] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BudgetOptResult | null>(null)

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

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          Budget Optimization
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect real-time data sources and generate AI-backed budget recommendations.
        </p>
        {connectorsMeta ? (
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Rate limit: <span className="font-medium">{connectorsMeta.rateLimit}</span> • Cache: {connectorsMeta.cacheTtlSeconds}s
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Real-Time Data Connectors</CardTitle>
            <CardDescription className="text-sm">Select data sources for analysis.</CardDescription>
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
            <CardTitle className="text-base">Ask Anything (Natural Language)</CardTitle>
            <CardDescription className="text-sm">
              Example: “Why did ROAS dip?” “What budgets should I shift?” “Which creatives are fatiguing?”
            </CardDescription>
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
                <Button className="w-full" onClick={onAnalyze} disabled={loading || !question.trim()}>
                  {loading ? 'Analyzing…' : 'Analyze'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="text-xs text-slate-600 dark:text-slate-400">Question</div>
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-[90px]" />
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
                placeholder="Paste your Meta/Google/GA4 export here (optional but recommended)."
                className="min-h-[140px]"
              />
              <div className="text-xs text-slate-500 dark:text-slate-500">Max 25,000 characters per request.</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rca">RCA</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="creative">Creative</TabsTrigger>
          <TabsTrigger value="report">HTML Report</TabsTrigger>
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
