import { useMemo } from 'react'
import {
  ArrowRightIcon,
  LightningBoltIcon,
  MixerHorizontalIcon,
  RocketIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type OfferDesignFlowProps = {
  initialQuestion?: string
  initialProblem?: string
  initialLever?: string
  initialGoal?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    clarity: 'Weak clarity',
    pricing: 'Pricing friction',
    cta: 'Weak CTA pull',
    message: 'Offer message',
    package: 'Packaging',
    action: 'Call to action',
    leads: 'More leads',
    sales: 'Better close rate',
    value: 'Higher perceived value',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildTaraQuery(problem: string, lever: string, goal: string, initialQuestion?: string) {
  return [
    initialQuestion || `Strengthen our offer by fixing ${formatLabel(problem)?.toLowerCase() || 'the main conversion friction'}.`,
    `Main problem: ${formatLabel(problem) || 'Weak clarity'}.`,
    `Priority lever: ${formatLabel(lever) || 'Offer message'}.`,
    `Desired outcome: ${formatLabel(goal) || 'Higher perceived value'}.`,
    'Return the strongest one-line offer statement, the biggest points of hesitation or drop-off, the packaging or CTA changes that matter most, and the fixes we should implement first.',
    'Keep the output practical for conversion work today, not generic offer theory.',
  ].join('\n\n')
}

function buildSamQuery(problem: string, lever: string, goal: string) {
  return [
    `Turn this stronger offer into tighter buyer-facing copy focused on ${formatLabel(lever)?.toLowerCase() || 'the main lever'}.`,
    `The offer currently suffers from ${formatLabel(problem)?.toLowerCase() || 'the main friction'} and should help unlock ${formatLabel(goal)?.toLowerCase() || 'the desired outcome'}.`,
    'Write the improved promise, CTA direction, and 2-3 supporting proof or benefit lines that make the offer feel sharper and more compelling.',
  ].join('\n\n')
}

export function OfferDesignFlow({
  initialQuestion,
  initialProblem,
  initialLever,
  initialGoal,
}: OfferDesignFlowProps = {}) {
  const problem = initialProblem || 'clarity'
  const lever = initialLever || 'message'
  const goal = initialGoal || 'value'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'tara',
        label: 'Strengthen Offer',
        taskType: 'offer_friction_review',
        defaultQuery: buildTaraQuery(problem, lever, goal, initialQuestion),
        placeholder: 'Describe the current offer, where buyers hesitate, and what the stronger offer needs to unlock.',
        tags: ['offer', 'conversion', 'packaging'],
      },
      {
        name: 'sam',
        label: 'Sharpen Offer Copy',
        taskType: 'weekly_messaging_review',
        defaultQuery: buildSamQuery(problem, lever, goal),
        placeholder: 'Turn the stronger offer into a tighter promise, CTA, and supporting copy.',
        tags: ['offer', 'copy', 'cta'],
      },
    ],
    [goal, initialQuestion, lever, problem]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(145deg,rgba(255,247,237,0.98),rgba(255,255,255,0.96)_56%,rgba(255,237,213,0.8))] shadow-[0_28px_80px_-36px_rgba(154,52,18,0.35)] dark:border-orange-900/60 dark:bg-[linear-gradient(145deg,rgba(41,22,12,0.96),rgba(17,24,39,0.98)_60%,rgba(67,20,7,0.88))]">
          <CardContent className="grid gap-8 p-5 lg:grid-cols-[0.94fr_1.06fr] lg:p-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-orange-400/20 dark:bg-white/5 dark:text-orange-200">
                Offer Pressure Review
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-700 dark:text-orange-100/80">
                <span className="rounded-full border border-orange-300/60 bg-white/70 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(problem)}
                </span>
                <span className="rounded-full border border-orange-300/60 bg-white/70 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(lever)}
                </span>
                <span className="rounded-full border border-orange-300/60 bg-white/70 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(goal)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.5rem] border border-orange-300/55 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-orange-400/20 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <LightningBoltIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/55">Problem</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(problem)}</div>
              </div>
              <div className="rounded-[1.5rem] border border-orange-300/55 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-orange-400/20 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <MixerHorizontalIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/55">Lever</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(lever)}</div>
              </div>
              <div className="rounded-[1.5rem] border border-orange-300/55 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-orange-400/20 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <RocketIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/55">Outcome</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(goal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_24px_64px_-30px_rgba(113,63,18,0.45)] dark:border-orange-900/60 dark:bg-zinc-950">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm uppercase tracking-[0.24em] text-orange-300/90">Offer Sequence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-orange-50/82">
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">1</span>
              <div>Clarify the real promise and surface the hesitation points killing intent.</div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">2</span>
              <div>Restructure the package, CTA, or value stack around the strongest buyer conviction point.</div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">3</span>
              <div>Turn the stronger offer into sharper copy the team can ship into pages, emails, and campaigns.</div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[0.84fr_1.16fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.32)] dark:border-orange-950/70 dark:bg-slate-950/86">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">What You Should Get</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-700 dark:text-orange-100/78">
            <div>• A stronger one-line offer statement the team can repeat everywhere.</div>
            <div>• Clear conversion fixes for pricing friction, hesitation, or CTA weakness.</div>
            <div>• Copy directions that make the next action feel more specific and valuable.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.28)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Offer Design Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Promise</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the buyer instantly understand the outcome and why it matters now?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Structure</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Is the package easy to choose, justify, and move through without hesitation?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Action</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the CTA feel like the obvious next step instead of a generic request?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="offer-design"
      title="Strengthen Your Offer"
      description="Tighten the promise, remove packaging friction, and make the next action feel worth taking."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Sharpen offer copy"
      resourceContextLabel="Offer page or pricing doc URL"
      resourceContextPlaceholder="Paste the landing page, pricing doc, proposal, or sales page URL if the offer should be reviewed against a specific source"
      resourceContextHint="Optional. Use this when the stronger offer should follow an exact page, deck, or pricing document."
      buildResourceContext={(value) => `Use this exact offer page or pricing document if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
