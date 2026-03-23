import { useMemo, useState } from 'react'
import { ArrowRightIcon, BarChartIcon, ReloadIcon } from '@radix-ui/react-icons'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAgentRun } from '@/hooks/useAgentRun'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ReportDeliveryCard } from '@/components/agent/ReportDeliveryCard'

type MarketSignalsFlowProps = {
  initialQuestion?: string
  initialFocus?: string
  initialShift?: string
  initialScope?: string
}

type ParsedMarketView = {
  summary: string
  topShift: string | null
  whyItMatters: string[]
  competitorMoves: string[]
  responseOpportunities: string[]
  nextMove: string[]
}

type MarketArtifactShape = {
  top_shift?: unknown
  summary?: unknown
  why_it_matters?: unknown
  competitor_moves?: unknown
  response_opportunities?: unknown
  next_actions?: unknown
  next_move?: unknown
  market_context?: unknown
  competitor_set?: unknown
  research_gaps?: unknown
}

const FOCUS_OPTIONS = [
  { id: 'competitors', label: 'Competitor moves' },
  { id: 'demand', label: 'Demand shifts' },
  { id: 'positioning', label: 'Positioning gaps' },
]

const SHIFT_OPTIONS = [
  { id: 'new_moves', label: 'Fresh moves' },
  { id: 'buyer_change', label: 'Buyer changes' },
  { id: 'white_space', label: 'White space' },
]

const SCOPE_OPTIONS = [
  { id: 'direct_market', label: 'Direct market' },
  { id: 'category', label: 'Category view' },
  { id: 'full_landscape', label: 'Full landscape' },
]

function formatMarketLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    competitors: 'Competitor moves',
    demand: 'Demand shifts',
    positioning: 'Positioning gaps',
    new_moves: 'Fresh market moves',
    buyer_change: 'Buyer changes',
    white_space: 'White-space openings',
    direct_market: 'Direct market',
    category: 'Category view',
    full_landscape: 'Full landscape',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function cleanLine(line: string) {
  return line
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^#+\s*/, '')
    .trim()
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return cleanLine(item)
        if (item && typeof item === 'object') {
          return Object.values(item as Record<string, unknown>)
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => cleanLine(entry))
            .join(' — ')
        }
        return ''
      })
      .filter(Boolean)
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split('\n')
      .map((item) => cleanLine(item))
      .filter(Boolean)
  }

  return []
}

function parseMarketArtifact(artifact: Record<string, unknown> | null): ParsedMarketView | null {
  if (!artifact) return null

  const data = artifact as MarketArtifactShape
  const competitorSet = Array.isArray(data.competitor_set)
    ? data.competitor_set.map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const record = entry as Record<string, unknown>
        const name = typeof record.name === 'string' ? record.name : 'Competitor'
        const position = typeof record.position === 'string' ? record.position : null
        const gap = typeof record.gap === 'string' ? record.gap : null
        return [name, position, gap].filter(Boolean).join(' — ')
      }).filter(Boolean)
    : []

  const marketContext = data.market_context && typeof data.market_context === 'object'
    ? data.market_context as Record<string, unknown>
    : null

  const topShift =
    typeof data.top_shift === 'string' ? cleanLine(data.top_shift) :
    typeof data.summary === 'string' ? cleanLine(data.summary) :
    typeof marketContext?.validated_vs_assumed === 'string' ? cleanLine(marketContext.validated_vs_assumed) :
    null

  const whyItMatters = [
    ...asStringArray(data.why_it_matters),
    ...asStringArray(marketContext?.demand_drivers).slice(0, 3),
  ].filter(Boolean)

  const competitorMoves = [
    ...asStringArray(data.competitor_moves),
    ...competitorSet,
  ].filter(Boolean)

  const responseOpportunities = [
    ...asStringArray(data.response_opportunities),
    ...asStringArray(data.research_gaps),
  ].filter(Boolean)

  const nextMove = [
    ...asStringArray(data.next_actions),
    ...asStringArray(data.next_move),
  ].filter(Boolean)

  const summary = topShift || whyItMatters[0] || competitorMoves[0] || responseOpportunities[0] || nextMove[0] || ''

  if (!summary && !whyItMatters.length && !competitorMoves.length && !responseOpportunities.length && !nextMove.length) {
    return null
  }

  return {
    summary,
    topShift: topShift || summary || null,
    whyItMatters,
    competitorMoves,
    responseOpportunities,
    nextMove,
  }
}

function parseMarketView(text: string): ParsedMarketView {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const sections: Record<string, string[]> = {
    changed: [],
    matters: [],
    competitors: [],
    response: [],
    next: [],
    other: [],
  }

  let current: keyof typeof sections = 'other'

  for (const raw of lines) {
    const line = cleanLine(raw)
    if (!line) continue

    const lower = line.toLowerCase()
    if (lower.includes('what changed') || lower.includes('top shift') || lower.includes('market shift')) {
      current = 'changed'
      continue
    }
    if (lower.includes('why it matters') || lower.includes('implication')) {
      current = 'matters'
      continue
    }
    if (lower.includes('competitor')) {
      current = 'competitors'
      continue
    }
    if (lower.includes('respond') || lower.includes('opportunit')) {
      current = 'response'
      continue
    }
    if (lower.includes('next move') || lower.includes('what to do next') || lower.includes('recommended action')) {
      current = 'next'
      continue
    }

    sections[current].push(line)
  }

  const fallback = [...sections.other, ...sections.changed]
  return {
    summary: fallback[0] || lines[0] || '',
    topShift: sections.changed[0] || fallback[0] || null,
    whyItMatters: sections.matters.length ? sections.matters : fallback.slice(1, 4),
    competitorMoves: sections.competitors,
    responseOpportunities: sections.response,
    nextMove: sections.next,
  }
}

function SectionCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="rounded-[2rem] border-slate-200/70 bg-white/90 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.18)] dark:border-slate-800/80 dark:bg-slate-950/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base tracking-tight text-slate-900 dark:text-slate-50">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
        {items.length ? items.map((item, index) => <div key={`${title}-${index}`}>• {item}</div>) : (
          <div className="text-muted-foreground">{empty}</div>
        )}
      </CardContent>
    </Card>
  )
}

export function MarketSignalsFlow({
  initialQuestion,
  initialFocus,
  initialShift,
  initialScope,
}: MarketSignalsFlowProps = {}) {
  const { activeWorkspace } = useWorkspace()
  const marketRun = useAgentRun()
  const [focus, setFocus] = useState(initialFocus || 'competitors')
  const [shift, setShift] = useState(initialShift || 'new_moves')
  const [scope, setScope] = useState(initialScope || 'direct_market')
  const [watchlist, setWatchlist] = useState('')

  const companyId = activeWorkspace?.id || ''
  const isGuidedLaunch = Boolean(initialQuestion || initialFocus || initialShift || initialScope)

  const marketQuestion = useMemo(
    () =>
      [
        initialQuestion,
        `Focus on ${formatMarketLabel(focus)?.toLowerCase() || 'market shifts'}.`,
        `Prioritize ${formatMarketLabel(shift)?.toLowerCase() || 'fresh changes'}.`,
        `Use a ${formatMarketLabel(scope)?.toLowerCase() || 'direct market'} view.`,
      ]
        .filter(Boolean)
        .join(' '),
    [focus, initialQuestion, scope, shift]
  )

  const finalPrompt = useMemo(
    () =>
      [
        marketQuestion,
        watchlist.trim() ? `Use this market watchlist if useful: ${watchlist.trim()}` : null,
        'Stay tightly anchored to the current workspace, saved company context, and any known competitor context already provided. Do not broaden into unrelated industries or generic market commentary.',
        'If evidence is thin, say so clearly and reduce confidence instead of inventing specific competitor moves.',
        'Only include competitor moves when they are plausible and closely tied to the company context in this workspace. Prefer fewer specific moves over a longer generic list.',
        'Return a clear market view with these sections in plain language: What changed, Why it matters, Competitor moves, Response opportunities, and What to do next.',
        'In artifact.data, return a valid JSON object with these exact keys: top_shift, why_it_matters, competitor_moves, response_opportunities, next_actions, summary.',
        'Do not place raw JSON in the prose body. Keep the prose readable and keep the structured data inside artifact.data only.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    [marketQuestion, watchlist]
  )

  const parsed = useMemo(() => {
    return parseMarketArtifact(marketRun.artifact) ?? parseMarketView(marketRun.text)
  }, [marketRun.artifact, marketRun.text])

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex w-fit items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            Market intelligence
          </div>
          <div className="space-y-2">
            <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
              Understand Your Market
            </h1>
            <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
              Track competitor moves, demand shifts, and positioning openings so the next GTM decision is sharper.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Focus', value: formatMarketLabel(focus) || 'Competitor moves' },
              { label: 'Shift', value: formatMarketLabel(shift) || 'Fresh market moves' },
              { label: 'Scope', value: formatMarketLabel(scope) || 'Direct market' },
            ].map((item) => (
              <div key={item.label} className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{item.label}:</span>{' '}
                <span className="font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!activeWorkspace ? (
        <p className="text-sm text-amber-500">Select or create a workspace in Settings to run agents.</p>
      ) : null}

      {isGuidedLaunch ? (
        <Card className="rounded-[2rem] border-slate-200/70 bg-slate-50/80 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.12)] dark:border-slate-800/80 dark:bg-slate-950/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Veena market brief</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus</div>
              <div className="mt-1 text-sm font-medium text-foreground">{formatMarketLabel(initialFocus) || 'Market focus'}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shift</div>
              <div className="mt-1 text-sm font-medium text-foreground">{formatMarketLabel(initialShift) || 'Priority shift'}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</div>
              <div className="mt-1 text-sm font-medium text-foreground">{formatMarketLabel(initialScope) || 'Market scope'}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.12fr_0.88fr]">
        <Card className="rounded-[2rem] border-slate-200/70 bg-white/92 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.16)] dark:border-slate-800/80 dark:bg-slate-950/82">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight">Choose the market question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                {[
                  { label: 'Focus', value: focus, onChange: setFocus, options: FOCUS_OPTIONS },
                  { label: 'Shift', value: shift, onChange: setShift, options: SHIFT_OPTIONS },
                  { label: 'Scope', value: scope, onChange: setScope, options: SCOPE_OPTIONS },
                ].map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{group.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option) => {
                        const active = group.value === option.id
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => group.onChange(option.id)}
                            className={[
                              'rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300 ease-out active:scale-[0.98]',
                              active
                                ? 'border-orange-500/70 bg-orange-500/10 text-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] dark:text-orange-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100',
                            ].join(' ')}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-slate-800/80 dark:bg-slate-900/70">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Current market question
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-800 dark:text-slate-200">
                  {marketQuestion || 'Generate a market view around the most important market changes and what to do next.'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/70 bg-slate-50/85 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.16)] dark:border-slate-800/80 dark:bg-slate-900/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-900 dark:text-slate-50">Market watchlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Input</div>
              <Input
                value={watchlist}
                onChange={(event) => setWatchlist(event.target.value)}
                placeholder="Paste competitor names, category keywords, competitor URLs, or the specific market watchpoints you want scanned"
                className="h-12 rounded-2xl border-slate-200 bg-white/90 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-50 dark:placeholder:text-slate-500"
              />
            </div>
            <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Best input: a short list of direct competitors, core category terms, or the exact market angle you want tracked.
            </div>
            <Button
              onClick={() => marketRun.run('isha', finalPrompt, 'daily_market_scan', companyId || undefined, undefined, ['market', 'signals', 'demand'])}
              disabled={!activeWorkspace || marketRun.streaming}
              className="h-11 rounded-2xl bg-orange-500 px-4 text-white shadow-[0_18px_36px_-20px_rgba(249,115,22,0.55)] transition-all duration-300 ease-out hover:bg-orange-600 active:translate-y-px active:scale-[0.99]"
            >
              {marketRun.streaming ? (
                <>
                  <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <BarChartIcon className="mr-2 h-4 w-4" />
                  Generate Market View
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {marketRun.text ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="rounded-[2rem] border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-background to-amber-50/50 text-foreground shadow-[0_24px_48px_-28px_rgba(249,115,22,0.16)] dark:border-orange-900/60 dark:from-zinc-950 dark:via-zinc-950 dark:to-orange-950/40 dark:text-orange-50 dark:shadow-[0_24px_48px_-28px_rgba(249,115,22,0.22)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base tracking-tight text-foreground dark:text-orange-50">
                  Top Shift To Act On Now
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-foreground/95 dark:text-orange-100/90">
                {parsed.topShift || parsed.summary || 'No market shift extracted yet.'}
              </CardContent>
            </Card>
            <Card className="rounded-[2rem] border-slate-200/70 bg-white/88 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.16)] dark:border-slate-800/80 dark:bg-slate-950/82">
              <CardHeader className="pb-3">
                <CardTitle className="text-base tracking-tight text-slate-900 dark:text-slate-50">Suggested response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {(parsed.nextMove.length ? parsed.nextMove : parsed.responseOpportunities.slice(0, 2)).length ? (
                  (parsed.nextMove.length ? parsed.nextMove : parsed.responseOpportunities.slice(0, 2)).map((item, index) => (
                    <div key={`response-${index}`} className="flex items-start gap-2">
                      <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-orange-500" />
                      <span>{item}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 dark:text-slate-400">Run the market view to surface the clearest response.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="Why It Matters"
              items={parsed.whyItMatters}
              empty="The run has not surfaced the main implications yet."
            />
            <SectionCard
              title="Competitor Moves"
              items={parsed.competitorMoves}
              empty="No competitor-specific moves were extracted."
            />
            <SectionCard
              title="Response Opportunities"
              items={parsed.responseOpportunities}
              empty="No response opportunities were extracted."
            />
            <SectionCard
              title="What To Do Next"
              items={parsed.nextMove}
              empty="No next-step recommendations were extracted."
            />
          </div>

          <ReportDeliveryCard
            moduleTitle="Understand Your Market"
            analysisLabel="Market intelligence dashboard"
            companyId={companyId || undefined}
            sourceText={marketRun.text}
            sourceArtifact={marketRun.artifact}
          />
        </div>
      ) : (
        <Card className="rounded-[2rem] border-dashed border-slate-300 bg-slate-50/70 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/40">
          <CardContent className="flex flex-col gap-3 px-8 py-10 text-left">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Market dashboard
            </div>
            <div className="text-lg font-medium tracking-tight text-slate-900 dark:text-slate-50">
              Generate the first market view to see the top shift, competitor moves, response opportunities, and the next move to make.
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
