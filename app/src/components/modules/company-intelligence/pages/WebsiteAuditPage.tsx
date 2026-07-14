import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { Badge } from '@/components/ui/badge'
import { CompanyIntelActionButton } from '../ui/CompanyIntelActionButton'
import { clampDisplayScore } from '../ui/ArtifactScoreCards'

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

function priorityBadge(priority: string) {
  const p = String(priority || '').toLowerCase()
  if (p === 'high') return 'bg-red-100 text-red-800'
  if (p === 'medium') return 'bg-yellow-100 text-yellow-900'
  if (p === 'low') return 'bg-muted text-foreground'
  return 'bg-muted text-foreground'
}

export function WebsiteAuditPage({ artifact, companyId, companyName, websiteUrl }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">No website audit yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Generate to critique the homepage and get conversion-focused recommendations.
        </CardContent>
      </Card>
    )
  }

  const summary = String(data.summary || '')
  const first = asObj(data.firstImpression) || {}
  const funnel = asObj(data.conversionFunnel) || {}
  const copy = asObj(data.copyRecommendations) || {}
  const ux = asObj(data.uxRecommendations) || {}

  const sections: any[] = Array.isArray(data.homepageSections) ? data.homepageSections : []
  const experiments: any[] = Array.isArray(data.experiments) ? data.experiments : []
  const plan: any[] = Array.isArray(data.priorityPlan) ? data.priorityPlan : []

  const clarityScore = clampDisplayScore(first.clarityScore, Number.NaN)
  const trustScore = clampDisplayScore(first.trustScore, Number.NaN)
  const hierarchyScore = clampDisplayScore(first.visualHierarchyScore, Number.NaN)

  function routePriorityAgent(task: string, ownerHint: string) {
    const text = `${task} ${ownerHint}`.toLowerCase()
    if (text.includes('copy') || text.includes('headline') || text.includes('cta')) return 'riya'
    if (text.includes('measure') || text.includes('track') || text.includes('analytics')) return 'maya'
    if (text.includes('position') || text.includes('message') || text.includes('structure')) return 'neel'
    return 'zara'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Clarity</div>
          <div className="text-2xl font-bold">{Number.isFinite(clarityScore) ? clarityScore : '—'}/100</div>
          <div className="text-xs text-muted-foreground mt-1">Can users understand “what you do” fast?</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Trust</div>
          <div className="text-2xl font-bold">{Number.isFinite(trustScore) ? trustScore : '—'}/100</div>
          <div className="text-xs text-muted-foreground mt-1">Signals: compliance, proof, credibility.</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Visual Hierarchy</div>
          <div className="text-2xl font-bold">{Number.isFinite(hierarchyScore) ? hierarchyScore : '—'}/100</div>
          <div className="text-xs text-muted-foreground mt-1">Is attention guided to the CTA?</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground">{summary || '—'}</CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Primary CTA:</span> {String(funnel.primaryCta || '—')}
            </div>
            <div className="text-xs text-muted-foreground">
              Recommended CTAs: {(asStringArray(funnel.recommendedCtas).slice(0, 6).join(' • ') || '—')}
            </div>
            <div className="mt-2">
              <div className="font-medium text-sm">Friction points</div>
              <div className="text-sm text-foreground mt-1 space-y-1">
                {asStringArray(funnel.frictionPoints).length ? (
                  asStringArray(funnel.frictionPoints).slice(0, 8).map((x, i) => <div key={i}>• {x}</div>)
                ) : (
                  <div className="text-sm text-muted-foreground">—</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Copy Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-medium">Headline options</div>
              <div className="mt-1 space-y-1">
                {asStringArray(copy.headlineOptions).slice(0, 6).map((h, i) => (
                  <div key={i}>• {h}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-medium">CTA copy options</div>
              <div className="mt-1 space-y-1">
                {asStringArray(copy.ctaCopyOptions).slice(0, 6).map((c, i) => (
                  <div key={i}>• {c}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">Homepage Section Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sections.length ? (
            sections.map((s, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-medium text-sm">{String(s.section || `Section ${idx + 1}`)}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">What works</div>
                    {asStringArray(s.whatWorks).slice(0, 5).map((x, i) => (
                      <div key={i}>• {x}</div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Issues</div>
                    {asStringArray(s.issues).slice(0, 5).map((x, i) => (
                      <div key={i}>• {x}</div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Recommendations</div>
                    {asStringArray(s.recommendations).slice(0, 5).map((x, i) => (
                      <div key={i}>• {x}</div>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <CompanyIntelActionButton
                    label="Create Fix Tasks"
                    agentName="veena"
                    companyId={companyId}
                    companyName={companyName}
                    websiteUrl={websiteUrl}
                    taskPrefix={`Website Audit • ${String(s.section || `Section ${idx + 1}`)}`}
                    taskRequest={[
                      `Turn the website-audit findings for section ${String(s.section || `Section ${idx + 1}`)} into prioritized execution tasks.`,
                      `What works: ${asStringArray(s.whatWorks).join(' | ') || 'none'}.`,
                      `Issues: ${asStringArray(s.issues).join(' | ') || 'none'}.`,
                      `Recommendations: ${asStringArray(s.recommendations).join(' | ') || 'none'}.`,
                      'Create taskboard items for the fixes and start the highest-priority fix analysis.'
                    ].join(' ')}
                    marketingContext={{ module: 'website_audit', homepageSection: s, websiteAudit: data }}
                    successMessage={`Fix tasks created for ${String(s.section || `Section ${idx + 1}`)}.`}
                    dialogTitle="Deploy Website Fix Plan"
                    dialogDescription="This will turn the selected website section issues into prioritized taskboard fixes and start the first-pass analysis."
                    className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">UX Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-medium">Quick wins</div>
              <div className="mt-1 space-y-1">{asStringArray(ux.quickWins).slice(0, 8).map((x, i) => <div key={i}>• {x}</div>)}</div>
            </div>
            <div>
              <div className="font-medium">High-impact changes</div>
              <div className="mt-1 space-y-1">{asStringArray(ux.highImpactChanges).slice(0, 8).map((x, i) => <div key={i}>• {x}</div>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Priority Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {plan.length ? (
              plan.slice(0, 10).map((p, idx) => (
                <div key={idx} className="border rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{String(p.task || `Task ${idx + 1}`)}</div>
                    <Badge className={priorityBadge(String(p.priority || 'medium'))}>{String(p.priority || 'medium')}</Badge>
                  </div>
                  <div className="text-sm text-foreground mt-1">{String(p.why || '')}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Effort: {String(p.effort || '—')} • Owner: {String(p.ownerHint || '—')}
                  </div>
                  <div className="mt-3">
                    <CompanyIntelActionButton
                      label="Deploy Fix"
                      agentName={routePriorityAgent(String(p.task || ''), String(p.ownerHint || ''))}
                      companyId={companyId}
                      companyName={companyName}
                      websiteUrl={websiteUrl}
                      taskPrefix={`Website Priority • ${String(p.task || `Task ${idx + 1}`)}`}
                      taskRequest={[
                        `Deploy this website fix: ${String(p.task || `Task ${idx + 1}`)}.`,
                        `Why: ${String(p.why || '')}.`,
                        `Priority: ${String(p.priority || 'medium')}.`,
                        `Effort: ${String(p.effort || 'unknown')}.`,
                        `Owner hint: ${String(p.ownerHint || 'unknown')}.`,
                        'Create the execution tasks and start the first step.'
                      ].join(' ')}
                      marketingContext={{ module: 'website_audit', priorityPlanItem: p, websiteAudit: data }}
                      successMessage={`Fix deployment started for ${String(p.task || `Task ${idx + 1}`)}.`}
                      dialogTitle="Deploy Website Fix"
                      dialogDescription="This will create execution tasks for the selected website fix and start the first step."
                      className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {experiments.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Experiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {experiments.slice(0, 10).map((e, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-medium">{String(e.name || `Experiment ${idx + 1}`)}</div>
                <div className="text-xs text-muted-foreground mt-1">Hypothesis: {String(e.hypothesis || '—')}</div>
                <div className="text-xs text-muted-foreground mt-1">Success metric: {String(e.successMetric || '—')}</div>
                <div className="mt-2 space-y-1">
                  {asStringArray(e.implementation).slice(0, 6).map((x, i) => (
                    <div key={i}>• {x}</div>
                  ))}
                </div>
                <div className="mt-3">
                  <CompanyIntelActionButton
                    label="Run Experiment"
                    agentName="maya"
                    companyId={companyId}
                    companyName={companyName}
                    websiteUrl={websiteUrl}
                    taskPrefix={`Website Experiment • ${String(e.name || `Experiment ${idx + 1}`)}`}
                    taskRequest={[
                      `Prepare and run this website experiment: ${String(e.name || `Experiment ${idx + 1}`)}.`,
                      `Hypothesis: ${String(e.hypothesis || '')}.`,
                      `Success metric: ${String(e.successMetric || '')}.`,
                      `Implementation steps: ${asStringArray(e.implementation).join(' | ') || 'none'}.`,
                      'Create setup, launch, and review tasks for the taskboard and start the experiment workflow.'
                    ].join(' ')}
                    marketingContext={{ module: 'website_audit', experiment: e, websiteAudit: data }}
                    successMessage={`Experiment workflow started for ${String(e.name || `Experiment ${idx + 1}`)}.`}
                    dialogTitle="Run Website Experiment"
                    dialogDescription="This will create setup, launch, and review tasks for the selected experiment and start the workflow."
                    className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
