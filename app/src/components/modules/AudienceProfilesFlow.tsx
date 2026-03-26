import { useMemo } from 'react'
import {
  PersonIcon,
  RowsIcon,
  TargetIcon,
  TokensIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AudienceProfilesFlowProps = {
  initialQuestion?: string
  initialScope?: string
  initialBuyer?: string
  initialGoal?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    icp: 'Core ICPs',
    segments: 'Segments',
    lookalikes: 'Lookalikes',
    decision: 'Decision makers',
    operators: 'Operators',
    champions: 'Internal champions',
    outbound: 'Outbound and lead gen',
    positioning: 'Messaging and positioning',
    ads: 'Paid targeting',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildIshaQuery(scope: string, buyer: string, goal: string, initialQuestion?: string) {
  return [
    initialQuestion || `Define the ${formatLabel(scope)?.toLowerCase() || 'target audiences'} we should focus on first.`,
    `Audience scope: ${formatLabel(scope) || 'Core ICPs'}.`,
    `Buyer layer: ${formatLabel(buyer) || 'Decision makers'}.`,
    `Primary use: ${formatLabel(goal) || 'Outbound and lead gen'}.`,
    'Return the strongest audience profiles, the firmographic or buyer distinctions between them, the pains and triggers, and the messaging implications that matter most.',
    'Keep the output specific enough to guide targeting and messaging, not generic persona filler.',
  ].join('\n\n')
}

export function AudienceProfilesFlow({
  initialQuestion,
  initialScope,
  initialBuyer,
  initialGoal,
}: AudienceProfilesFlowProps = {}) {
  const scope = initialScope || 'icp'
  const buyer = initialBuyer || 'decision'
  const goal = initialGoal || 'outbound'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'isha',
        label: 'Build Audience Profiles',
        taskType: 'audience_profiles',
        defaultQuery: buildIshaQuery(scope, buyer, goal, initialQuestion),
        placeholder: 'Describe the market, buyer layer, or audience confusion you want to resolve first.',
        tags: ['audience', 'icp', 'segments'],
      },
    ],
    [buyer, goal, initialQuestion, scope]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-background to-amber-50/50 text-foreground shadow-[0_28px_80px_-34px_rgba(154,52,18,0.14)] dark:border-orange-900/70 dark:from-zinc-950 dark:via-zinc-950 dark:to-orange-950/40 dark:text-orange-50 dark:shadow-[0_28px_80px_-34px_rgba(113,63,18,0.42)]">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/50 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-800 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-orange-200">
              Audience Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <RowsIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Scope</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatLabel(scope)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <PersonIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Buyer layer</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatLabel(buyer)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-200/70 bg-card/80 p-4 dark:border-orange-400/15 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:bg-orange-500/12 dark:text-orange-200">
                  <TargetIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground dark:text-orange-100/45">Use</div>
                <div className="mt-2 text-sm font-medium text-foreground dark:text-orange-50">{formatLabel(goal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Audience stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Who</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Company type, maturity, and role that matter most</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Why</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Pain, trigger, and urgency that create buyer motion</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">How</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Messaging and targeting implications for each audience shape</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <RowsIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Segments</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Separate the audiences that only look similar on the surface.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <TokensIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Triggers</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Name the buying moments that make each profile actually worth targeting.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <TargetIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Implications</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Carry the audience definition into outbound, ads, or positioning cleanly.</div>
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
            <div>• Clear audience profiles instead of generic personas.</div>
            <div>• The buyer triggers and pains that make each segment worth targeting.</div>
            <div>• Messaging and targeting implications you can carry straight into campaigns.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Audience Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Fit</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Who is truly worth targeting, not just reachable?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Urgency</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What event or friction makes the buyer actually move now?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Translation</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">How should the audience insight change campaigns, copy, and sales language?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="audience-profiles"
      title="Define Target Audiences"
      description="Clarify the buyer profiles, sharpen the segment boundaries, and leave with targeting and messaging implications you can use immediately."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      resourceContextLabel="ICP brief, CRM export, or research doc URL"
      resourceContextPlaceholder="Paste the ICP brief, CRM export, customer interview notes, or planning doc URL if the audience work should follow a specific source"
      resourceContextHint="Optional. Use this when the audience definition should anchor to an exact brief, export, or research document."
      buildResourceContext={(value) => `Use this exact ICP brief, CRM export, or audience research document if needed: ${value}`}
      resourceContextPlacement="primary"
      enableReportActions
    />
  )
}
