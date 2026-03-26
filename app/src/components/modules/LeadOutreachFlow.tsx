import { useMemo } from 'react'
import {
  EnvelopeClosedIcon,
  LinkBreak2Icon,
  LinkedInLogoIcon,
  PaperPlaneIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LeadOutreachFlowProps = {
  initialQuestion?: string
  initialChannel?: string
  initialTarget?: string
  initialGoal?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    email: 'Email-first',
    linkedin: 'LinkedIn-first',
    multi: 'Multitouch',
    decision: 'Decision makers',
    champions: 'Internal champions',
    warm: 'Warm accounts',
    meeting: 'Book meetings',
    reply: 'Earn replies',
    qualification: 'Qualify interest',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildArjunQuery(channel: string, target: string, goal: string, initialQuestion?: string) {
  return [
    initialQuestion || `Build a ${formatLabel(channel)?.toLowerCase() || 'multitouch'} outreach sequence.`,
    `Outreach motion: ${formatLabel(channel) || 'Multitouch'}.`,
    `Primary target: ${formatLabel(target) || 'Decision makers'}.`,
    `Primary goal: ${formatLabel(goal) || 'Book meetings'}.`,
    'Return the outreach sequence arc, the personalization logic, the first touch, the follow-up sequence, and how the messaging should change across the motion.',
    'Keep the output practical for real outbound execution, not generic cold-email advice.',
  ].join('\n\n')
}

export function LeadOutreachFlow({
  initialQuestion,
  initialChannel,
  initialTarget,
  initialGoal,
}: LeadOutreachFlowProps = {}) {
  const channel = initialChannel || 'multi'
  const target = initialTarget || 'decision'
  const goal = initialGoal || 'meeting'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'arjun',
        label: 'Build Outreach Sequence',
        taskType: 'lead_outreach',
        defaultQuery: buildArjunQuery(channel, target, goal, initialQuestion),
        placeholder: 'Describe the ICP, the account context, and the response or meeting outcome this sequence should drive.',
        tags: ['outreach', 'sequence', 'pipeline'],
      },
    ],
    [channel, goal, initialQuestion, target]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_28px_80px_-34px_rgba(113,63,18,0.42)] dark:border-orange-900/70">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Outreach Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <LinkBreak2Icon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Motion</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(channel)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <PaperPlaneIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Target</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(target)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <EnvelopeClosedIcon className="h-4 w-4" />
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
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Sequence stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Hook</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Why this account or person should even notice the message</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Progression</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">How the sequence earns the next reply instead of repeating the same ask</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Personalization</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">What context makes the message feel earned instead of obviously templated</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <EnvelopeClosedIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Email</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Use when the ask needs more room and proof in the first touch.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <LinkedInLogoIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">LinkedIn</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Use when context and lighter-friction touches matter more than volume.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <PaperPlaneIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Multitouch</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Use when sequence timing and cross-channel rhythm matter most.</div>
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
            <div>• A sharper outreach arc instead of disconnected cold messages.</div>
            <div>• Clear personalization logic the team can repeat without sounding robotic.</div>
            <div>• First-touch and follow-up messages aligned to one pipeline goal.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Outreach Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Relevance</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Why is this message for this account right now, not any account anytime?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Friction</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Is the ask small enough to earn the next move instead of demanding too much too early?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Momentum</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does each follow-up add pressure and context, or just repeat the same generic pitch?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="lead-outreach"
      hideMarketSignals
      title="Build Outreach Sequences"
      description="Shape the outreach arc, tighten the personalization logic, and leave with the first messages ready to send."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      resourceContextLabel="Lead list, CRM, or account brief URL"
      resourceContextPlaceholder="Paste the lead sheet, CRM view, account brief, or notes doc URL if the outreach should follow a specific source"
      resourceContextHint="Optional. Use this when the sequence should be built against an exact lead list, CRM slice, or account brief."
      buildResourceContext={(value) => `Use this exact lead list, CRM view, or account brief if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
