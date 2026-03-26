import { useMemo } from 'react'
import {
  ArrowTopRightIcon,
  Component1Icon,
  LayersIcon,
  RocketIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LandingPagesFlowProps = {
  initialQuestion?: string
  initialType?: string
  initialGoal?: string
  initialSource?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    offer: 'Offer page',
    campaign: 'Campaign page',
    signup: 'Signup or demo page',
    convert: 'Drive conversions',
    qualify: 'Qualify buyers',
    explain: 'Explain the offer',
    ads: 'Paid campaigns',
    email: 'Email or lifecycle',
    social: 'Social and content',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildTaraQuery(pageType: string, pageGoal: string, pageSource: string, initialQuestion?: string) {
  return [
    initialQuestion || `Design a ${formatLabel(pageType)?.toLowerCase() || 'landing page'} for ${formatLabel(pageSource)?.toLowerCase() || 'the selected traffic source'}.`,
    `Page type: ${formatLabel(pageType) || 'Offer page'}.`,
    `Primary goal: ${formatLabel(pageGoal) || 'Drive conversions'}.`,
    `Traffic source: ${formatLabel(pageSource) || 'Paid campaigns'}.`,
    'Return the best page structure, the section order, the conversion logic, the friction points to avoid, and the highest-impact page changes or content blocks we should prioritize.',
    'Keep the output practical for a page build, not a generic CRO summary.',
  ].join('\n\n')
}

function buildSamQuery(pageType: string, pageGoal: string, pageSource: string) {
  return [
    `Write the first copy direction for this ${formatLabel(pageType)?.toLowerCase() || 'landing page'}.`,
    `The page should ${formatLabel(pageGoal)?.toLowerCase() || 'hit the desired outcome'} and will receive ${formatLabel(pageSource)?.toLowerCase() || 'the selected traffic source'}.`,
    'Return the hero headline and subheadline, the key proof or benefit blocks, CTA direction, and the strongest supporting section copy to match the page structure.',
  ].join('\n\n')
}

export function LandingPagesFlow({
  initialQuestion,
  initialType,
  initialGoal,
  initialSource,
}: LandingPagesFlowProps = {}) {
  const pageType = initialType || 'offer'
  const pageGoal = initialGoal || 'convert'
  const pageSource = initialSource || 'ads'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'tara',
        label: 'Build Page Structure',
        taskType: 'offer_friction_review',
        defaultQuery: buildTaraQuery(pageType, pageGoal, pageSource, initialQuestion),
        placeholder: 'Describe the page, offer, traffic source, and what the page needs to achieve.',
        tags: ['landing-page', 'structure', 'conversion'],
      },
      {
        name: 'sam',
        label: 'Draft Page Copy',
        taskType: 'weekly_messaging_review',
        defaultQuery: buildSamQuery(pageType, pageGoal, pageSource),
        placeholder: 'Turn the page structure into conversion-ready copy blocks and CTA direction.',
        tags: ['landing-page', 'copy', 'cta'],
      },
    ],
    [initialQuestion, pageGoal, pageSource, pageType]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,237,0.96)_42%,rgba(255,237,213,0.88)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.26)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_45%,rgba(67,20,7,0.86)_100%)]">
          <CardContent className="grid gap-8 p-5 lg:grid-cols-[0.95fr_1.05fr] lg:p-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-orange-400/20 dark:bg-white/5 dark:text-orange-200">
                Conversion Page Direction
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-700 dark:text-orange-100/82">
                <span className="rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(pageType)}
                </span>
                <span className="rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(pageGoal)}
                </span>
                <span className="rounded-full border border-orange-300/60 bg-white/72 px-3 py-1 dark:border-orange-400/20 dark:bg-white/5">
                  {formatLabel(pageSource)}
                </span>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-orange-300/55 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-orange-400/20 dark:bg-white/5">
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                    <Component1Icon className="h-4 w-4" />
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/55">Page</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(pageType)}</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-300/55 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-orange-400/20 dark:bg-white/5">
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                    <RocketIcon className="h-4 w-4" />
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/55">Goal</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(pageGoal)}</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-300/55 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-orange-400/20 dark:bg-white/5">
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                    <ArrowTopRightIcon className="h-4 w-4" />
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/55">Source</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">{formatLabel(pageSource)}</div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-orange-300/55 bg-zinc-950 p-5 text-orange-50 shadow-[0_18px_42px_-26px_rgba(113,63,18,0.46)] dark:border-orange-900/60">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.24em] text-orange-300/80">Page Stack</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Draft order</div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-2xl border border-orange-400/15 bg-white/5 px-4 py-3">
                    <span>Hero with message match</span>
                    <LayersIcon className="h-4 w-4 text-orange-300/70" />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-orange-400/15 bg-white/5 px-4 py-3">
                    <span>Proof and trust block</span>
                    <LayersIcon className="h-4 w-4 text-orange-300/70" />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-orange-400/15 bg-white/5 px-4 py-3">
                    <span>Offer logic and CTA pressure</span>
                    <LayersIcon className="h-4 w-4 text-orange-300/70" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_24px_64px_-30px_rgba(113,63,18,0.45)] dark:border-orange-900/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm uppercase tracking-[0.24em] text-orange-300/90">Build Rhythm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-orange-50/82">
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">1</span>
              <div>Design the section sequence around traffic intent and message match first.</div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">2</span>
              <div>Remove friction in the headline, proof stack, and CTA before drafting full-page copy.</div>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10 text-[11px] font-semibold">3</span>
              <div>Turn the chosen structure into a page draft ready for build or design handoff.</div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.28)] dark:border-orange-950/70 dark:bg-slate-950/86">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">What You Should Get</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-700 dark:text-orange-100/78">
            <div>• A clearer section order instead of an ad-hoc page outline.</div>
            <div>• Better message match between traffic source and page promise.</div>
            <div>• First-pass page copy strong enough to build on immediately.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.26)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Landing Page Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Entry</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the first screen reflect where the visitor came from and what they expected?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Flow</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Is every section earning its place, or is the page leaking attention before the CTA?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Ask</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the page make the next action feel obvious, specific, and worth taking now?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="landing-pages"
      title="Build Landing Pages"
      description="Shape the page structure, tighten message match, and turn the strongest sections into conversion-ready copy."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Draft page copy"
      resourceContextLabel="Existing page or brief URL"
      resourceContextPlaceholder="Paste the current page, Figma brief, PRD, or campaign doc URL if the landing page should follow a specific source"
      resourceContextHint="Optional. Use this when the page build should start from an existing page, brief, or campaign document."
      buildResourceContext={(value) => `Use this exact landing page or planning document if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
