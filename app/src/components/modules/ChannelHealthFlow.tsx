import { useMemo } from 'react'
import {
  BarChartIcon,
  GlobeIcon,
  MixIcon,
  RocketIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ChannelHealthFlowProps = {
  initialQuestion?: string
  initialScope?: string
  initialProblem?: string
  initialHorizon?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    paid: 'Paid channels',
    owned: 'Owned channels',
    all: 'Full mix',
    winners: 'What is working',
    gaps: 'What is weak',
    allocation: 'Where to shift focus',
    today: 'Today',
    week: 'This week',
    month: 'This month',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildZaraQuery(scope: string, problem: string, horizon: string, initialQuestion?: string) {
  return [
    initialQuestion || `Check channel health across the ${formatLabel(scope)?.toLowerCase() || 'full mix'}.`,
    `Channel scope: ${formatLabel(scope) || 'Full mix'}.`,
    `Main need: ${formatLabel(problem) || 'Where to shift focus'}.`,
    `Horizon: ${formatLabel(horizon) || 'This week'}.`,
    'Return the strongest channels, the weakest spots, the reasons behind both, and the immediate reallocation or execution moves we should make next.',
    'Keep the output practical for active channel management, not generic distribution commentary.',
  ].join('\n\n')
}

export function ChannelHealthFlow({
  initialQuestion,
  initialScope,
  initialProblem,
  initialHorizon,
}: ChannelHealthFlowProps = {}) {
  const scope = initialScope || 'all'
  const problem = initialProblem || 'allocation'
  const horizon = initialHorizon || 'week'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'zara',
        label: 'Check Channel Health',
        taskType: 'distribution_health_check',
        defaultQuery: buildZaraQuery(scope, problem, horizon, initialQuestion),
        placeholder: 'Describe the channel mix, the weak signals, or the reallocation question you want answered first.',
        tags: ['channels', 'distribution', 'allocation'],
      },
    ],
    [horizon, initialQuestion, problem, scope]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-background to-amber-50/50 text-foreground shadow-[0_28px_80px_-34px_rgba(154,52,18,0.14)] dark:border-orange-900/70 dark:from-zinc-950 dark:via-zinc-950 dark:to-orange-950/40 dark:text-orange-50 dark:shadow-[0_28px_80px_-34px_rgba(113,63,18,0.42)]">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/50 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-800 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-orange-200">
              Distribution Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <MixIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Scope</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatLabel(scope)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <BarChartIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Need</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatLabel(problem)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <RocketIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Horizon</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatLabel(horizon)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Channel stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Strength</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Which channels are actually carrying momentum</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Weakness</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Where the mix is leaking attention, budget, or execution quality</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Shift</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">How to reallocate focus, budget, or operating time next</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <BarChartIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Winners</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Double down only where the signal is real, not where the team is loudest.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <GlobeIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Coverage</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Know whether the mix is too narrow, too scattered, or simply mismanaged.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <RocketIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Next moves</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Leave with immediate channel decisions, not just a descriptive report.</div>
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
            <div>• Clear channel winners and weak spots instead of a generic distribution summary.</div>
            <div>• A better read on where budget or attention should move next.</div>
            <div>• Near-term actions tied to real channel health, not channel habit.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Channel Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Signal</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Is the channel actually producing useful momentum, or just activity?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Friction</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What is blocking the channel: creative, targeting, cadence, budget, or process?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Shift</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What should change first if the team only makes one channel move this cycle?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="channel-health"
      title="Check Channel Health"
      description="Read the channel mix, spot the real weak points, and leave with the next allocation or execution moves."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      resourceContextLabel="Channel report or planning doc URL"
      resourceContextPlaceholder="Paste the ad report, spreadsheet, weekly review, or planning doc URL if the health check should follow a specific source"
      resourceContextHint="Optional. Use this when the channel review should anchor to an exact report or operating document."
      buildResourceContext={(value) => `Use this exact channel report or planning document if needed: ${value}`}
      resourceContextPlacement="primary"
      enableReportActions
    />
  )
}
