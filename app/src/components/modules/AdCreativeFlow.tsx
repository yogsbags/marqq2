import { useMemo } from 'react'
import {
  CopyIcon,
  DrawingPinFilledIcon,
  LightningBoltIcon,
  MagicWandIcon,
  RocketIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AdCreativeFlowProps = {
  initialQuestion?: string
  initialFormat?: string
  initialPlatform?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    copy: 'Ad copy',
    angles: 'Creative angles',
    variants: 'Test variants',
    google: 'Google Ads',
    meta: 'Meta Ads',
    linkedin: 'LinkedIn Ads',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildMayaQuery(format: string, platform: string, initialQuestion?: string) {
  return [
    initialQuestion || `Create ${formatLabel(format)?.toLowerCase() || 'ad creative'} for ${formatLabel(platform) || 'Meta Ads'}.`,
    `Format: ${formatLabel(format) || 'Ad copy'}.`,
    `Platform: ${formatLabel(platform) || 'Meta Ads'}.`,
    'Return the strongest creative directions, the hooks worth testing, the first headlines and body lines, and the visual brief cues that fit the platform.',
    'Keep the output built for performance testing, not generic brand copy.',
  ].join('\n\n')
}

function buildSamQuery(format: string, platform: string) {
  return [
    `Write the first testable copy set for ${formatLabel(platform) || 'Meta Ads'}.`,
    `The creative priority is ${formatLabel(format)?.toLowerCase() || 'ad copy'}.`,
    'Return multiple variants that push different angles such as pain, outcome, and proof, while staying native to the platform.',
  ].join('\n\n')
}

export function AdCreativeFlow({
  initialQuestion,
  initialFormat,
  initialPlatform,
}: AdCreativeFlowProps = {}) {
  const format = initialFormat || 'copy'
  const platform = initialPlatform || 'meta'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'maya',
        label: 'Generate Creative Directions',
        taskType: 'ad_creative',
        defaultQuery: buildMayaQuery(format, platform, initialQuestion),
        placeholder: 'Describe the offer, audience, platform, and the kind of creative pressure you need first.',
        tags: ['ads', 'creative', 'hooks'],
      },
      {
        name: 'sam',
        label: 'Draft Copy Variants',
        taskType: 'ad_copy',
        defaultQuery: buildSamQuery(format, platform),
        placeholder: 'Turn the strongest angle into platform-ready copy variants.',
        tags: ['ads', 'copy', 'variants'],
      },
    ],
    [format, initialQuestion, platform]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_28px_80px_-34px_rgba(113,63,18,0.44)] dark:border-orange-900/70">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Creative Lab
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <MagicWandIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Creative format</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(format)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <RocketIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Platform</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(platform)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.24)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:grid-cols-[0.92fr_1.08fr] lg:p-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Creative stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Hook</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Pattern interrupt or sharp promise</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Body</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Reason to believe and payoff tension</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Visual</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Frame, subject, and cue that carries the angle</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <LightningBoltIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Angles</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Pressure-test pain, outcome, and proof before writing full variants.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <CopyIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Copy</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Get native platform copy instead of generic one-size-fits-all lines.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <DrawingPinFilledIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Testing</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Leave with the first creatives worth putting into a real test plan.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.26)] dark:border-orange-950/70 dark:bg-slate-950/86">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">What You Should Get</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-700 dark:text-orange-100/78">
            <div>• Stronger hooks before you waste cycles on weak variants.</div>
            <div>• Platform-native copy rather than recycled generic ad language.</div>
            <div>• Clear visual cues and angles worth taking into production.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.24)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Creative Review Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Stop</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What interrupts the scroll or grabs intent fast enough?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Proof</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What makes the claim believable instead of just louder?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Move</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What should the viewer do next, and does the creative earn that ask?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="ad-creative"
      title="Generate Ad Creatives"
      description="Find the strongest hook, turn it into native ad copy, and leave with the first variants worth testing."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Draft copy variants"
      resourceContextLabel="Offer page or ad brief URL"
      resourceContextPlaceholder="Paste the offer page, campaign brief, or winning ad reference URL if the creative should follow a specific source"
      resourceContextHint="Optional. Use this when the ad creative should be built from an exact brief, page, or prior campaign reference."
      buildResourceContext={(value) => `Use this exact ad brief, offer page, or creative reference if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
