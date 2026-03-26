import { useMemo } from 'react'
import {
  EyeOpenIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  UpdateIcon,
} from '@radix-ui/react-icons'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SEOLLMOFlowProps = {
  initialQuestion?: string
  initialFocus?: string
  initialSurface?: string
  initialGoal?: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    rankings: 'Search rankings',
    llm: 'LLM visibility',
    both: 'SEO + LLM',
    homepage: 'Homepage',
    content: 'Content library',
    offer: 'Offer pages',
    traffic: 'More traffic',
    coverage: 'Better topic coverage',
    authority: 'Stronger authority',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildMayaQuery(focus: string, surface: string, goal: string, initialQuestion?: string) {
  return [
    initialQuestion || `Improve our ${formatLabel(focus)?.toLowerCase() || 'organic visibility'} on the ${formatLabel(surface)?.toLowerCase() || 'selected surface'}.`,
    `Visibility focus: ${formatLabel(focus) || 'SEO + LLM'}.`,
    `Primary surface: ${formatLabel(surface) || 'Homepage'}.`,
    `Desired outcome: ${formatLabel(goal) || 'More traffic'}.`,
    'Return the biggest visibility gaps, the highest-leverage search and answer-engine opportunities, the content or page changes that matter most, and the first moves we should make next.',
    'Keep the output practical for organic growth work, not generic SEO advice.',
  ].join('\n\n')
}

export function SEOLLMOFlow({
  initialQuestion,
  initialFocus,
  initialSurface,
  initialGoal,
}: SEOLLMOFlowProps = {}) {
  const focus = initialFocus || 'both'
  const surface = initialSurface || 'homepage'
  const goal = initialGoal || 'traffic'

  const agents = useMemo<Array<AgentConfig>>(
    () => [
      {
        name: 'maya',
        label: 'Build Visibility Plan',
        taskType: 'seo_analysis',
        defaultQuery: buildMayaQuery(focus, surface, goal, initialQuestion),
        placeholder: 'Describe the site, page set, topic area, or search problem you want to improve first.',
        tags: ['seo', 'llmo', 'visibility'],
      },
    ],
    [focus, goal, initialQuestion, surface]
  )

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_28px_80px_-34px_rgba(113,63,18,0.44)] dark:border-orange-900/70">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Visibility Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Focus</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(focus)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <GlobeIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Surface</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(surface)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <EyeOpenIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Outcome</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatLabel(goal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.24)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:grid-cols-[0.92fr_1.08fr] lg:p-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Visibility stack</div>
              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Demand</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">What people search, ask, and expect to find</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Coverage</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Where pages, topics, and answers are missing or weak</div>
                </div>
                <div className="rounded-[1.4rem] border border-orange-200/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Authority</div>
                  <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Why search engines and answer engines should trust the result</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Search gaps</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Find the missing terms, intents, and pages the footprint does not cover well enough.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <UpdateIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Refreshes</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Identify pages or topics that should be tightened, re-ordered, or re-explained.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
                  <GlobeIcon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Answer engines</div>
                <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-orange-100/78">Improve the pages and content most likely to earn citations or retrieval in AI answers.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.26)] dark:border-orange-950/70 dark:bg-slate-950/86">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">What You Should Get</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-700 dark:text-orange-100/78">
            <div>• Clear visibility gaps instead of a generic SEO checklist.</div>
            <div>• Priority page and content moves tied to one surface.</div>
            <div>• A unified view of search and LLM discoverability, not two disconnected audits.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.24)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Visibility Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Intent</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Are we matching what the searcher or asker actually wants answered?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Coverage</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Do we cover enough of the topic or use case to deserve the click or citation?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Clarity</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Does the page explain the answer clearly enough for humans and retrieval systems alike?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="seo-llmo"
      title="Improve Organic Visibility"
      description="Surface the biggest search and answer-engine gaps, then turn them into the first page and content moves worth shipping."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      resourceContextLabel="Page, sitemap, or content brief URL"
      resourceContextPlaceholder="Paste the page, sitemap, topic brief, or content doc URL if the visibility review should follow a specific source"
      resourceContextHint="Optional. Use this when the visibility work should anchor to an exact page, sitemap, or content planning document."
      buildResourceContext={(value) => `Use this exact page, sitemap, or content planning document if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}
