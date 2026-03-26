import { useMemo } from 'react'
import {
  BarChartIcon,
  ComponentPlaceholderIcon,
  MixIcon,
  StopwatchIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ABTestFlowProps = {
  initialQuestion?: string
  initialSurface?: string
  initialGoal?: string
  initialMode?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    page: 'Landing page',
    email: 'Email',
    ads: 'Ads',
    conversion: 'Conversion rate',
    quality: 'Lead quality',
    learning: 'Learning speed',
    hypothesis: 'Hypotheses',
    evaluation: 'Evaluate results',
    both: 'Both',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildDevQuery(surface: string, goal: string, mode: string, initialQuestion?: string) {
  return [
    initialQuestion || `Design an experiment for our ${formatLabel(surface)?.toLowerCase() || 'test surface'}.`,
    `Test surface: ${formatLabel(surface) || 'Landing page'}.`,
    `Primary goal: ${formatLabel(goal) || 'Conversion rate'}.`,
    `Mode: ${formatLabel(mode) || 'Hypotheses'}.`,
    'Return the strongest test hypothesis, the control and variant logic, the main metric, the sample or signal needed, and how we should interpret the result.',
    'Keep the output practical for a real test plan, not a generic experimentation lecture.',
  ].join('\n\n')
}

function buildSamQuery(surface: string, goal: string) {
  return [
    `Generate testable variants for our ${formatLabel(surface)?.toLowerCase() || 'experiment surface'}.`,
    `The experiment should improve ${formatLabel(goal)?.toLowerCase() || 'the target outcome'}.`,
    'Return the strongest alternate headline, CTA, or angle directions we should put into the experiment first.',
  ].join('\n\n')
}

export function ABTestFlow({
  initialQuestion,
  initialSurface,
  initialGoal,
  initialMode,
}: ABTestFlowProps = {}) {
  const surface = initialSurface || 'page'
  const goal = initialGoal || 'conversion'
  const mode = initialMode || 'hypothesis'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'dev',
        label: 'Build Experiment Plan',
        taskType: 'ab_test',
        defaultQuery: buildDevQuery(surface, goal, mode, initialQuestion),
        placeholder: 'Describe the surface, current control, weak point, and what the experiment should prove.',
        tags: ['experiment', 'ab-test', 'measurement'],
      },
      {
        name: 'sam',
        label: 'Draft Test Variants',
        taskType: 'ab_variants',
        defaultQuery: buildSamQuery(surface, goal),
        placeholder: 'Turn the hypothesis into the first copy or angle variants to test.',
        tags: ['experiment', 'variants', 'copy'],
      },
    ],
    [goal, initialQuestion, mode, surface]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95)_42%,rgba(255,237,213,0.88)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(140deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_52%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-8 p-5 lg:grid-cols-[0.92fr_1.08fr] lg:p-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-orange-400/20 dark:bg-white/5 dark:text-orange-200">
                Experiment Studio
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-700 dark:text-orange-100/82">
                <span className="rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(surface)}
                </span>
                <span className="rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(goal)}
                </span>
                <span className="rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(mode)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <ComponentPlaceholderIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Surface</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(surface)}</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <BarChartIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Goal</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(goal)}</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <StopwatchIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Mode</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(mode)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_24px_64px_-30px_rgba(113,63,18,0.46)] dark:border-orange-900/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm uppercase tracking-[0.24em] text-orange-300/90">Test Rhythm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-orange-50/82">
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">1</span>
              <div>Choose the one variable that matters instead of stacking multiple changes into one noisy test.</div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">2</span>
              <div>Define the control, variant, and readout criteria before the traffic hits the experiment.</div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">3</span>
              <div>Leave with both the experiment logic and the first variants the team can actually test.</div>
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
            <div>• A sharper hypothesis instead of a vague “let’s test something.”</div>
            <div>• Clear control and variant logic the team can execute fast.</div>
            <div>• A cleaner read on what counts as a win before the test runs.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Experiment Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Change</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Is the test isolating one meaningful change, or hiding multiple edits in one variant?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Signal</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Will the result tell us something real, or just create more uncertainty?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Decision</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What will the team do if variant B wins, loses, or lands in the gray zone?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="ab-test"
      title="Test New Variants"
      description="Frame the experiment, isolate the variable, and leave with test-ready variants and cleaner readout logic."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Draft test variants"
      resourceContextLabel="Experiment doc or live page URL"
      resourceContextPlaceholder="Paste the live page, campaign, results sheet, or experiment brief URL if the test should follow a specific source"
      resourceContextHint="Optional. Use this when the experiment should be designed against an exact page, campaign, or results document."
      buildResourceContext={(value) => `Use this exact experiment brief, live page, or results document if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
