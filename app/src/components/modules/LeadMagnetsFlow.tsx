import { useMemo } from 'react'
import {
  BookmarkIcon,
  DownloadIcon,
  FileTextIcon,
  ReaderIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LeadMagnetsFlowProps = {
  initialQuestion?: string
  initialType?: string
  initialAudience?: string
  initialGoal?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    guide: 'Guide or playbook',
    checklist: 'Checklist or template',
    calculator: 'Framework or tool',
    top_funnel: 'Top-of-funnel audience',
    consideration: 'In-market buyers',
    high_intent: 'High-intent prospects',
    capture: 'Capture more leads',
    qualify: 'Improve lead quality',
    nurture: 'Support nurture',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildSamQuery(type: string, audience: string, goal: string, initialQuestion?: string) {
  return [
    initialQuestion || `Create a ${formatLabel(type)?.toLowerCase() || 'lead magnet'} for ${formatLabel(audience)?.toLowerCase() || 'the selected audience'}.`,
    `Lead magnet type: ${formatLabel(type) || 'Guide or playbook'}.`,
    `Primary audience: ${formatLabel(audience) || 'Top-of-funnel audience'}.`,
    `Primary goal: ${formatLabel(goal) || 'Capture more leads'}.`,
    'Return the strongest concept, title and hook, the content structure, the key takeaways, and the distribution or promotion plan.',
    'Keep the output practical for demand capture, not generic content brainstorming.',
  ].join('\n\n')
}

function buildTaraQuery(type: string, audience: string, goal: string) {
  return [
    `Review the opt-in logic and conversion path for this ${formatLabel(type)?.toLowerCase() || 'lead magnet'}.`,
    `The asset should attract ${formatLabel(audience)?.toLowerCase() || 'the selected audience'} and should ${formatLabel(goal)?.toLowerCase() || 'support the target outcome'}.`,
    'Return the strongest opt-in angle, the biggest friction points, and the CTA or page improvements that should ship first.',
  ].join('\n\n')
}

export function LeadMagnetsFlow({
  initialQuestion,
  initialType,
  initialAudience,
  initialGoal,
}: LeadMagnetsFlowProps = {}) {
  const type = initialType || 'guide'
  const audience = initialAudience || 'top_funnel'
  const goal = initialGoal || 'capture'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'sam',
        label: 'Design Lead Magnet',
        taskType: 'lead_magnet',
        defaultQuery: buildSamQuery(type, audience, goal, initialQuestion),
        placeholder: 'Describe the ICP, pain point, and kind of lead magnet the team needs to launch first.',
        tags: ['lead-magnet', 'content', 'capture'],
      },
      {
        name: 'tara',
        label: 'Tighten Opt-in Conversion',
        taskType: 'lead_magnet_cro',
        defaultQuery: buildTaraQuery(type, audience, goal),
        placeholder: 'Review the opt-in path, CTA, and friction points around the lead magnet page.',
        tags: ['lead-magnet', 'cro', 'opt-in'],
      },
    ],
    [audience, goal, initialQuestion, type]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_28px_80px_-34px_rgba(113,63,18,0.42)] dark:border-orange-900/70">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Demand Capture Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <FileTextIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Asset</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(type)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <ReaderIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Audience</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(audience)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <DownloadIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Goal</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(goal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Magnet stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Promise</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Why this asset is worth the email or form fill</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Structure</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">How the asset delivers immediate value instead of feeling padded</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Capture</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">What turns interest into the download or opt-in cleanly</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <BookmarkIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Concept</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">The idea has to feel worth saving, not just worth skimming.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <DownloadIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Opt-in</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">The page has to make the value exchange feel easy and specific.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <ReaderIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Usefulness</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">The asset should earn trust quickly enough to move the lead forward.</div>
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
            <div>• A clearer lead-magnet concept instead of a generic gated PDF idea.</div>
            <div>• The structure and hook needed to make the asset feel worth the download.</div>
            <div>• Opt-in logic strong enough to support the conversion path around the asset.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Lead Magnet Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Relevance</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Is this something the target audience would actually stop and want?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Clarity</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the opt-in promise say exactly what the lead gets and why it matters?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Conversion</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the page reduce enough friction to turn curiosity into the actual download?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="lead-magnets"
      title="Create Lead Magnets"
      description="Shape the lead-magnet concept, tighten the value exchange, and leave with the first asset and opt-in direction ready to build."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Tighten opt-in conversion"
      resourceContextLabel="Offer page, opt-in page, or campaign brief URL"
      resourceContextPlaceholder="Paste the page, campaign brief, or conversion flow URL if the lead magnet should follow a specific source"
      resourceContextHint="Optional. Use this when the asset and opt-in path should follow an exact page, campaign, or existing conversion flow."
      buildResourceContext={(value) => `Use this exact offer page, opt-in page, or campaign brief if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
