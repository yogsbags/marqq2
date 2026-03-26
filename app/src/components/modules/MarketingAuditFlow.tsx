import { useMemo, useState } from 'react'
import {
  BarChartIcon,
  GlobeIcon,
  LightningBoltIcon,
  ReaderIcon,
  UpdateIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, AlertCircle } from 'lucide-react'

type MarketingAuditFlowProps = {
  initialQuestion?: string
  initialScope?: string
  initialPriority?: string
  initialContext?: string
}

interface PageAnalysis {
  url: string
  seo: { score: number; score_max: number; title: string; h1_count: number; has_viewport: boolean; has_canonical: boolean; alt_text_coverage_pct: number; has_robots_txt: boolean; has_sitemap: boolean }
  cta: { score: number; score_max: number; cta_count: number; word_count: number; form_count: number }
  trust: { score: number; score_max: number; social_platforms: string[]; schema_types: string[]; has_og_tags: boolean }
  tracking: { score: number; score_max: number; tools_detected: string[] }
  overall_score: number
  overall_score_max: number
  error?: string
}

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:3008'

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    full: 'Full stack',
    website: 'Website and funnel',
    growth: 'Growth channels',
    quickwins: 'Quick wins',
    roadmap: 'Roadmap',
    score: 'Score and diagnosis',
    analytics: 'Analytics and performance',
    messaging: 'Messaging and funnel',
    operating: 'Operating model',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildTaraQuery(scope: string, priority: string, context: string, initialQuestion?: string) {
  return [
    initialQuestion || 'Run a full marketing audit.',
    `Audit scope: ${formatLabel(scope) || 'Full stack'}.`,
    `Priority: ${formatLabel(priority) || 'Quick wins'}.`,
    `Guiding context: ${formatLabel(context) || 'Analytics and performance'}.`,
    'Return the strongest audit diagnosis, the composite score by major area, the main breakdowns or weaknesses, the highest-leverage quick wins, and the revenue or performance implications.',
    'Keep the output practical and operator-ready, not abstract marketing commentary.',
  ].join('\n\n')
}

function buildNeelQuery(scope: string, priority: string, context: string) {
  return [
    `Turn this ${formatLabel(scope)?.toLowerCase() || 'marketing audit'} into a sharper operating plan.`,
    `Prioritize ${formatLabel(priority)?.toLowerCase() || 'the main audit outcome'} using ${formatLabel(context)?.toLowerCase() || 'the selected context'}.`,
    'Return a 30-60-90 day roadmap, the action order, and the strategic decisions or channel moves that matter most.',
  ].join('\n\n')
}

function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = (score / max) * 100
  const tone =
    pct >= 70
      ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200'
      : pct >= 40
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-200'
        : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{score}/{max}</span>
}

function PageAnalysisPanel() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PageAnalysis | null>(null)
  const [error, setError] = useState('')

  const analyze = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/analytics/analyze-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Failed to analyze page')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-slate-950/86">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm tracking-tight text-slate-950 dark:text-orange-50">Optional page scan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyze()}
            placeholder="https://yoursite.com"
            className="border-orange-200/70 bg-white/80 text-sm dark:border-orange-900/60 dark:bg-white/5"
          />
          <Button
            size="sm"
            onClick={analyze}
            disabled={loading || !url.trim()}
            className="bg-orange-600 text-white hover:bg-orange-700 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Scan'}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {result && !result.error && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-orange-100/68">
              <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{result.url}</span>
              <span className="ml-auto shrink-0 font-semibold text-slate-900 dark:text-orange-50">
                Overall {result.overall_score}/{result.overall_score_max}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: 'SEO', score: result.seo.score, max: result.seo.score_max },
                { label: 'CTA', score: result.cta.score, max: result.cta.score_max },
                { label: 'Trust', score: result.trust.score, max: result.trust.score_max },
                { label: 'Tracking', score: result.tracking.score, max: result.tracking.score_max },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.2rem] border border-orange-200/70 bg-white/75 p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5"
                >
                  <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-orange-100/45">{item.label}</div>
                  <ScorePill score={item.score} max={item.max} />
                </div>
              ))}
            </div>
            {result.tracking.tools_detected.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.tracking.tools_detected.map((tool) => (
                  <Badge key={tool} variant="secondary" className="border-orange-200/70 bg-orange-50/80 text-[11px] text-orange-900 dark:border-orange-900/60 dark:bg-orange-500/10 dark:text-orange-100">
                    {tool}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function MarketingAuditFlow({
  initialQuestion,
  initialScope,
  initialPriority,
  initialContext,
}: MarketingAuditFlowProps = {}) {
  const scope = initialScope || 'full'
  const priority = initialPriority || 'quickwins'
  const context = initialContext || 'analytics'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'tara',
        label: 'Run Audit Diagnosis',
        taskType: 'marketing_audit',
        defaultQuery: buildTaraQuery(scope, priority, context, initialQuestion),
        placeholder: 'Describe the main marketing concern, the pages or channels in scope, and what the audit should surface first.',
        tags: ['audit', 'diagnosis', 'performance'],
      },
      {
        name: 'neel',
        label: 'Build Operating Plan',
        taskType: 'marketing_report',
        defaultQuery: buildNeelQuery(scope, priority, context),
        placeholder: 'Turn the audit into a stronger 30-60-90 day plan and operating sequence.',
        tags: ['audit', 'roadmap', 'strategy'],
      },
    ],
    [context, initialQuestion, priority, scope]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_28px_80px_-34px_rgba(113,63,18,0.42)] dark:border-orange-900/70">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Audit Control Room
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <ReaderIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Scope</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(scope)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <LightningBoltIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Priority</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(priority)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <UpdateIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Context</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(context)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Audit stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Diagnosis</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Where the stack is weak, leaking, or misaligned</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Priorities</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Which changes actually deserve attention first</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Roadmap</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">What should happen in the next 30, 60, and 90 days</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <BarChartIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Score</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">See whether the marketing system is strong, fragile, or patchy by area.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <LightningBoltIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Quick wins</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Isolate the fixes that move the system fastest without months of cleanup.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <UpdateIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Roadmap</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Convert the audit into a sequence the team can actually run.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <PageAnalysisPanel />
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="marketing-audit"
      title="Audit Your Overall Marketing"
      description="Score the system, surface the real gaps, and turn the audit into a sharper operating plan."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Build operating plan"
      resourceContextLabel="Site, deck, or planning doc URL"
      resourceContextPlaceholder="Paste the site, strategy deck, board update, or planning doc URL if the audit should follow a specific source"
      resourceContextHint="Optional. Use this when the audit should anchor to an exact site, deck, or planning document."
      buildResourceContext={(value) => `Use this exact site, deck, or planning document if needed: ${value}`}
      resourceContextPlacement="primary"
      enableReportActions
    />
  )
}
