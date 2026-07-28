import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { Badge } from '@/components/ui/badge'
import { ArtifactScoreCards, clampDisplayScore } from '../ui/ArtifactScoreCards'
import { CompanyIntelActionButton } from '../ui/CompanyIntelActionButton'
import { Lightbulb, ArrowRight } from 'lucide-react'

type Props = {
  artifact: ArtifactRecord | null
  companyId?: string
  companyName?: string
  websiteUrl?: string | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
    .map((s) => s.trim())
    .filter(Boolean)
}

function synthesizeDirectionSummary(ideas: any[], stage: string, budgetBand: unknown): string {
  const names = ideas
    .map((idea) => String(idea?.name || idea?.title || '').trim())
    .filter(Boolean)
    .slice(0, 3)
  const topWhy = ideas
    .map((idea) => String(idea?.whyItFits || idea?.why || '').trim())
    .find(Boolean)
  const budget = String(budgetBand || '').trim()
  if (!names.length && !topWhy && !stage && !budget) return ''

  const lead = names.length
    ? `Prioritize ${names.join(', ')}${names.length === 3 && ideas.length > 3 ? ', and related catalog ideas' : ''}.`
    : 'Prioritize the highest-fit catalog ideas for this GTM stage.'
  const context = [stage ? `Stage: ${stage}` : '', budget ? `Budget: ${budget}` : ''].filter(Boolean).join(' · ')
  return `${lead}${topWhy ? ` ${topWhy}` : ''}${context ? ` (${context})` : ''}`.trim()
}

/** Map marketing-ideas skill categories → Marqq outcome modules / CI channels */
export function outcomePathForIdea(idea: {
  category?: string
  outcomeModule?: string
  outcomeChannel?: string
}): { moduleId: string; label: string; agent: string; params?: Record<string, string> } {
  const explicit = String(idea.outcomeModule || idea.outcomeChannel || '').toLowerCase().replace(/\s+/g, '-')
  if (explicit) {
    const known: Record<string, { moduleId: string; label: string; agent: string }> = {
      'paid-ads': { moduleId: 'paid-ads', label: 'Open Paid Ads', agent: 'zara' },
      'ad-creative': { moduleId: 'paid-ads', label: 'Test creatives in Paid Ads', agent: 'maya' },
      'social-media': { moduleId: 'social-media', label: 'Open Social Media', agent: 'kiran' },
      'email-sequence': { moduleId: 'email-sequence', label: 'Open Email Sequence', agent: 'sam' },
      'lead-outreach': { moduleId: 'lead-outreach', label: 'Open Lead Outreach', agent: 'sam' },
      'lead-intelligence': { moduleId: 'lead-intelligence', label: 'Open Lead Intel', agent: 'arjun' },
      'lead-magnets': { moduleId: 'ci-lead_magnets', label: 'Open Lead Magnets', agent: 'tara' },
      'content': { moduleId: 'ci-content_strategy', label: 'Open Content Strategy', agent: 'sam' },
      'content-strategy': { moduleId: 'ci-content_strategy', label: 'Open Content Strategy', agent: 'sam' },
      'ab-test': { moduleId: 'ab-test', label: 'Open A/B Tests', agent: 'dev' },
      'budget-optimization': { moduleId: 'budget-optimization', label: 'Open Budget Optimization', agent: 'dev' },
      'partners': { moduleId: 'ci-partner_profiling', label: 'Open Partner Profiling', agent: 'isha' },
      'referral': { moduleId: 'user-engagement', label: 'Open Engagement / Referrals', agent: 'kiran' },
    }
    if (known[explicit]) return known[explicit]
  }

  const cat = String(idea.category || '').toLowerCase()
  if (/paid|ads|ppc|retarget|linkedin ads|google ads|meta/.test(cat)) {
    return { moduleId: 'paid-ads', label: 'Launch in Paid Ads', agent: 'zara' }
  }
  if (/social|community|linkedin|reddit|short.?form|tiktok|instagram/.test(cat)) {
    return { moduleId: 'social-media', label: 'Build in Social Media', agent: 'kiran' }
  }
  if (/email|nurture|newsletter|onboarding sequence/.test(cat)) {
    return { moduleId: 'email-sequence', label: 'Build Email Sequence', agent: 'sam' }
  }
  if (/outreach|cold|apollo|outbound/.test(cat)) {
    return { moduleId: 'lead-outreach', label: 'Run Lead Outreach', agent: 'sam' }
  }
  if (/lead magnet|free tool|calculator|checklist|ebook|magnet/.test(cat)) {
    return { moduleId: 'ci-lead_magnets', label: 'Design Lead Magnet', agent: 'tara' }
  }
  if (/content|seo|blog|glossary|programmatic/.test(cat)) {
    return { moduleId: 'ci-content_strategy', label: 'Open Content Strategy', agent: 'sam' }
  }
  if (/partner|affiliate|integration|co.?market/.test(cat)) {
    return { moduleId: 'ci-partner_profiling', label: 'Explore Partnerships', agent: 'isha' }
  }
  if (/referral|viral|product.?led|in.?app/.test(cat)) {
    return { moduleId: 'user-engagement', label: 'Open Engagement', agent: 'kiran' }
  }
  if (/launch|product hunt|giveaway/.test(cat)) {
    return { moduleId: 'ci-marketing_strategy', label: 'Open Marketing Strategy', agent: 'neel' }
  }
  if (/test|experiment|ab |a\/b/.test(cat)) {
    return { moduleId: 'ab-test', label: 'Design A/B Test', agent: 'dev' }
  }
  return { moduleId: 'paid-ads', label: 'Take to Paid Ads', agent: 'neel' }
}

function priorityBadge(priority: string) {
  const p = String(priority || '').toLowerCase()
  if (p === 'high') return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
  if (p === 'medium') return 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/20'
  return 'bg-muted text-muted-foreground border-border'
}

export function MarketingIdeasPage({ artifact, companyId, companyName, websiteUrl }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card className="rounded-[1.5rem] border-border/70">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <Lightbulb className="h-4 w-4" />
            No marketing ideas yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Generate via the marketing-ideas skill. Each idea includes hooks, angles, and a CTA into the matching Marqq outcome path.
        </CardContent>
      </Card>
    )
  }

  const stage = String(data.stageFit || data.stage || '')
  const scores = asObj(data.scores)
  const ideas: any[] = Array.isArray(data.ideas) ? data.ideas : []
  const hooksBank: any[] = Array.isArray(data.hooksToTest) ? data.hooksToTest : []
  const anglesBank: any[] = Array.isArray(data.anglesToTest) ? data.anglesToTest : []
  const summary =
    String(data.summary || data.direction || data.overview || '').trim() ||
    synthesizeDirectionSummary(ideas, stage, data.budgetBand)

  const fit = Number.isFinite(Number(scores?.fitScore))
    ? clampDisplayScore(scores.fitScore)
    : clampDisplayScore(ideas.length * 14)
  const actionability = Number.isFinite(Number(scores?.actionability))
    ? clampDisplayScore(scores.actionability)
    : clampDisplayScore(ideas.filter((i) => i.hooks?.length || i.howToStart?.length).length * 18)
  const diversity = Number.isFinite(Number(scores?.channelDiversity))
    ? clampDisplayScore(scores.channelDiversity)
    : clampDisplayScore(new Set(ideas.map((i) => String(i.category || ''))).size * 18)

  return (
    <div className="space-y-5">
      <ArtifactScoreCards
        items={[
          { label: 'Idea Fit', value: fit, description: 'How well ideas match GTM stage, ICP, and goal.' },
          { label: 'Actionability', value: actionability, description: 'Clarity of first steps, hooks, and CTAs.' },
          { label: 'Channel Spread', value: diversity, description: 'Breadth across paid, content, social, email, etc.' },
        ]}
      />

      <Card className="rounded-[1.5rem] border-border/70 bg-gradient-to-br from-orange-500/[0.06] to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">Direction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-foreground">{summary || '—'}</p>
          <p className="text-xs text-muted-foreground">
            {stage && (
              <>
                Stage: <span className="text-foreground font-medium">{stage}</span>
              </>
            )}
            {stage && data.budgetBand && ' · '}
            {data.budgetBand && (
              <>
                Budget: <span className="text-foreground font-medium">{String(data.budgetBand)}</span>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {(hooksBank.length > 0 || anglesBank.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {hooksBank.length > 0 && (
            <Card className="rounded-[1.5rem] border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">Hooks to A/B test</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hooksBank.slice(0, 8).map((h, i) => (
                  <div key={i} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <div className="font-medium">{typeof h === 'string' ? h : String(h.hook || h.text || `Hook ${i + 1}`)}</div>
                    {typeof h === 'object' && h.why && (
                      <div className="text-xs text-muted-foreground mt-1">{String(h.why)}</div>
                    )}
                  </div>
                ))}
                <CompanyIntelActionButton
                  label="Test hooks in Paid Ads"
                  agentName="maya"
                  companyId={companyId}
                  companyName={companyName}
                  websiteUrl={websiteUrl}
                  navigateModuleId="paid-ads"
                  moduleWorkflowParams={{ tab: 'assets' }}
                  taskPrefix="Hooks bank → Paid Ads"
                  taskRequest={[
                    companyName ? `Company: ${companyName}.` : null,
                    'Create ad creative tests from this hooks bank. One hook per variant; keep angle constant (ab-test-setup: single variable).',
                    hooksBank
                      .slice(0, 5)
                      .map((h, i) => `Hook ${i + 1}: ${typeof h === 'string' ? h : h.hook || h.text}`)
                      .join(' | '),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  marketingContext={{ module: 'marketing_ideas', hooksToTest: hooksBank }}
                  successMessage="Opening Paid Ads to test hooks."
                  dialogTitle="Test hooks"
                  dialogDescription="Opens Paid Ads Assets with these hooks as A/B creative tests."
                  className="mt-2"
                />
              </CardContent>
            </Card>
          )}
          {anglesBank.length > 0 && (
            <Card className="rounded-[1.5rem] border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">Marketing angles to test</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {anglesBank.slice(0, 8).map((a, i) => (
                  <div key={i} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <div className="font-medium">
                      {typeof a === 'string' ? a : String(a.angle || a.framework || `Angle ${i + 1}`)}
                    </div>
                    {typeof a === 'object' && (a.framework || a.hypothesis) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {[a.framework, a.hypothesis].filter(Boolean).map(String).join(' — ')}
                      </div>
                    )}
                  </div>
                ))}
                <CompanyIntelActionButton
                  label="Test angles in Paid Ads"
                  agentName="maya"
                  companyId={companyId}
                  companyName={companyName}
                  websiteUrl={websiteUrl}
                  navigateModuleId="paid-ads"
                  moduleWorkflowParams={{ tab: 'assets' }}
                  taskPrefix="Angles bank → Paid Ads"
                  taskRequest={[
                    companyName ? `Company: ${companyName}.` : null,
                    'Generate distinct concept creatives (Andromeda) using these marketing angles. Frameworks: PAS, BAB, social proof, etc. (paid-ads + ad-creative).',
                    anglesBank
                      .slice(0, 5)
                      .map((a, i) => `Angle ${i + 1}: ${typeof a === 'string' ? a : a.angle || a.framework}`)
                      .join(' | '),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  marketingContext={{ module: 'marketing_ideas', anglesToTest: anglesBank }}
                  successMessage="Opening Paid Ads to test angles."
                  dialogTitle="Test angles"
                  dialogDescription="Opens Paid Ads with distinct angle concepts for creative testing."
                  className="mt-2"
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground px-1">Ideas → outcome paths</h3>
        {ideas.length ? (
          ideas.map((idea, idx) => {
            const path = outcomePathForIdea(idea)
            const hooks = asStringArray(idea.hooks)
            const angles = asStringArray(idea.angles || idea.marketingAngles)
            const steps = asStringArray(idea.howToStart || idea.nextSteps)
            return (
              <Card key={idx} className="rounded-[1.5rem] border-border/70 overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{String(idea.name || idea.title || `Idea ${idx + 1}`)}</span>
                        {idea.category && (
                          <Badge variant="outline" className="text-[10px]">{String(idea.category)}</Badge>
                        )}
                        {idea.priority && (
                          <Badge variant="outline" className={`text-[10px] ${priorityBadge(String(idea.priority))}`}>
                            {String(idea.priority)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{String(idea.whyItFits || idea.description || '')}</p>
                      {idea.resources && (
                        <p className="text-xs text-muted-foreground">Resources: {String(idea.resources)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span>{path.label}</span>
                    </div>
                  </div>

                  {(hooks.length > 0 || angles.length > 0) && (
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      {hooks.length > 0 && (
                        <div className="rounded-lg bg-muted/40 px-3 py-2">
                          <div className="font-medium mb-1">Hooks</div>
                          <ul className="space-y-0.5 text-muted-foreground">
                            {hooks.slice(0, 3).map((h, i) => (
                              <li key={i}>• {h}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {angles.length > 0 && (
                        <div className="rounded-lg bg-muted/40 px-3 py-2">
                          <div className="font-medium mb-1">Angles</div>
                          <ul className="space-y-0.5 text-muted-foreground">
                            {angles.slice(0, 3).map((a, i) => (
                              <li key={i}>• {a}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {steps.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Start: {steps.slice(0, 3).join(' → ')}
                    </div>
                  )}

                  {idea.expectedOutcome && (
                    <div className="text-xs text-muted-foreground">
                      Success looks like: <span className="text-foreground">{String(idea.expectedOutcome)}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <CompanyIntelActionButton
                      label={path.label}
                      agentName={path.agent}
                      companyId={companyId}
                      companyName={companyName}
                      websiteUrl={websiteUrl}
                      navigateModuleId={path.moduleId}
                      moduleWorkflowParams={path.params}
                      taskPrefix={`Marketing idea · ${String(idea.name || idea.title || idx + 1)}`}
                      taskRequest={[
                        companyName ? `Company: ${companyName}.` : null,
                        websiteUrl ? `Website: ${websiteUrl}.` : null,
                        `Execute marketing idea: ${String(idea.name || idea.title)}.`,
                        `Category: ${String(idea.category || 'general')}.`,
                        String(idea.whyItFits || idea.description || ''),
                        hooks.length ? `Hooks to use: ${hooks.join(' | ')}` : null,
                        angles.length ? `Angles to use: ${angles.join(' | ')}` : null,
                        steps.length ? `First steps: ${steps.join(' | ')}` : null,
                        `Route into ${path.moduleId} and produce the first shippable deliverable.`,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      marketingContext={{ module: 'marketing_ideas', idea, outcomePath: path }}
                      successMessage={`Opening ${path.label} for this idea.`}
                      dialogTitle={path.label}
                      dialogDescription="Deploys this idea into the matching Marqq outcome channel with context preloaded."
                    />
                    {(hooks.length > 0 || angles.length > 0) && path.moduleId !== 'paid-ads' && (
                      <CompanyIntelActionButton
                        label="Also test as ads"
                        agentName="maya"
                        companyId={companyId}
                        companyName={companyName}
                        websiteUrl={websiteUrl}
                        navigateModuleId="paid-ads"
                        moduleWorkflowParams={{ tab: 'assets' }}
                        variant="outline"
                        taskPrefix={`Idea → ad creative · ${String(idea.name || idx + 1)}`}
                        taskRequest={`Turn this marketing idea into Meta/Google/LinkedIn ad creatives. Idea: ${String(idea.name || '')}. Hooks: ${hooks.join(' | ')}. Angles: ${angles.join(' | ')}.`}
                        marketingContext={{ module: 'marketing_ideas', idea }}
                        successMessage="Opening Paid Ads for creative tests."
                        dialogTitle="Test as ads"
                        dialogDescription="Also push hooks/angles into Paid Ads creative testing."
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground px-1">No ideas in artifact — re-run generate.</p>
        )}
      </div>
    </div>
  )
}
