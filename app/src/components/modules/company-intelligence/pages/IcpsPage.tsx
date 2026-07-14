import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { useGtmContext } from '@/lib/gtmContext'
import { GtmContextBanner } from '@/components/ui/gtm-context-banner'
import { ArtifactScoreCards, clampDisplayScore } from '../ui/ArtifactScoreCards'
import { CompanyIntelActionButton } from '../ui/CompanyIntelActionButton'

type Props = {
  artifact: ArtifactRecord | null
  companyId?: string
  companyName?: string
  websiteUrl?: string | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item'
}

export function IcpsPage({ artifact, companyId, companyName, websiteUrl }: Props) {
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_icp')
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">No ICPs yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see ICP definitions, cohorts, and messaging angles.</CardContent>
      </Card>
    )
  }

  const icps: any[] = Array.isArray(data.icps) ? data.icps : []
  const cohorts: any[] = Array.isArray(data.cohorts) ? data.cohorts : []
  const notes: string[] = Array.isArray(data.notes) ? data.notes : []
  const aiScores = asObj(data.scores)
  const segmentFit = Number.isFinite(Number(aiScores?.segmentFit))
    ? clampDisplayScore(aiScores.segmentFit)
    : clampDisplayScore(icps.length * 22 + cohorts.length * 8)
  const targetingClarity = Number.isFinite(Number(aiScores?.targetingClarity))
    ? clampDisplayScore(aiScores.targetingClarity)
    : clampDisplayScore(icps.filter((icp) => Array.isArray(icp?.qualifiers) && icp.qualifiers.length > 0).length * 18 + cohorts.length * 7)
  const activationReadiness = Number.isFinite(Number(aiScores?.activationReadiness))
    ? clampDisplayScore(aiScores.activationReadiness)
    : clampDisplayScore(icps.filter((icp) => String(icp?.hook || '').trim()).length * 18 + cohorts.length * 8)

  return (
    <div className="space-y-4">
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}
      <ArtifactScoreCards
        items={[
          { label: 'Segment Fit', value: segmentFit, description: 'How well the ICP set maps the right market segments.' },
          { label: 'Targeting Clarity', value: targetingClarity, description: 'How clear the qualifiers, channels, and cohort angles are.' },
          { label: 'Activation Readiness', value: activationReadiness, description: 'How ready these ICPs are for outreach and campaign execution.' },
        ]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">ICPs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {icps.length ? (
              icps.map((icp, idx) => (
                <div key={idx} className="border rounded-md p-3">
                  <div className="font-semibold text-sm">{String(icp.name || `ICP ${idx + 1}`)}</div>
                  <div className="text-sm text-foreground mt-1">{String(icp.who || '')}</div>
                  <div className="text-xs text-muted-foreground mt-2">Hook: {String(icp.hook || '—')}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Channels: {(Array.isArray(icp.channels) ? icp.channels : []).join(', ') || '—'}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                    <div>
                      <div className="font-semibold mb-1">Qualifiers</div>
                      {(Array.isArray(icp.qualifiers) ? icp.qualifiers : []).slice(0, 8).map((q: string, i: number) => (
                        <div key={i}>• {q}</div>
                      ))}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Disqualifiers</div>
                      {(Array.isArray(icp.disqualifiers) ? icp.disqualifiers : []).slice(0, 8).map((q: string, i: number) => (
                        <div key={i}>• {q}</div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <CompanyIntelActionButton
                      label="Activate ICP"
                      agentName="isha"
                      companyId={companyId}
                      companyName={companyName}
                      websiteUrl={websiteUrl}
                      sectionId={`icp-activate-${slugify(String(icp.name || `icp-${idx + 1}`))}`}
                      sectionTitle={`Activate ICP · ${String(icp.name || `ICP ${idx + 1}`)}`}
                      summary={`Activate ${String(icp.name || `ICP ${idx + 1}`)} for GTM targeting and qualification.`}
                      bullets={[
                        String(icp.who || '').trim(),
                        String(icp.hook || '').trim() ? `Hook: ${String(icp.hook)}` : '',
                        (Array.isArray(icp.channels) ? icp.channels : []).join(', ')
                          ? `Channels: ${(Array.isArray(icp.channels) ? icp.channels : []).join(', ')}`
                          : '',
                      ].filter(Boolean)}
                      taskPrefix={`ICP • ${String(icp.name || `ICP ${idx + 1}`)}`}
                      taskRequest={[
                        companyName ? `Company: ${companyName}.` : null,
                        `Activate this ICP for GTM execution: ${String(icp.name || `ICP ${idx + 1}`)}.`,
                        `Who: ${String(icp.who || '')}.`,
                        `Hook: ${String(icp.hook || '')}.`,
                        `Channels: ${(Array.isArray(icp.channels) ? icp.channels : []).join(', ') || 'none'}.`,
                        `Qualifiers: ${(Array.isArray(icp.qualifiers) ? icp.qualifiers : []).join(' | ') || 'none'}.`,
                        `Disqualifiers: ${(Array.isArray(icp.disqualifiers) ? icp.disqualifiers : []).join(' | ') || 'none'}.`,
                        'Create targeting, qualification, and activation tasks for the taskboard and start the first analysis pass.'
                      ].filter(Boolean).join(' ')}
                      marketingContext={{ module: 'icps', icp, icps: data }}
                      navigateModuleId="audience-profiles"
                      moduleWorkflowParams={{
                        question: [
                          companyName ? `Company: ${companyName}.` : null,
                          `Activate this ICP for GTM execution: ${String(icp.name || `ICP ${idx + 1}`)}.`,
                          `Who: ${String(icp.who || '')}.`,
                          `Hook: ${String(icp.hook || '')}.`,
                          `Channels: ${(Array.isArray(icp.channels) ? icp.channels : []).join(', ') || 'none'}.`,
                          `Qualifiers: ${(Array.isArray(icp.qualifiers) ? icp.qualifiers : []).join(' | ') || 'none'}.`,
                          'Build targeting, qualification, and activation guidance for this ICP.',
                        ].filter(Boolean).join(' '),
                        scope: 'icp',
                        buyer: String(icp.name || ''),
                        goal: 'activation',
                      }}
                      chatHandoff={false}
                      successMessage={`ICP activation queued for ${String(icp.name || `ICP ${idx + 1}`)} — opening #audiences.`}
                      dialogTitle="Activate ICP"
                      dialogDescription="Adds ICP targeting tasks to Upcoming Tasks, then opens #audiences with this profile preloaded. Does not send outreach by itself."
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Cohorts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cohorts.length ? (
              cohorts
                .slice()
                .sort((a, b) => Number(a?.priority || 0) - Number(b?.priority || 0))
                .map((c, idx) => (
                  <div key={idx} className="border rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{String(c.name || `Cohort ${idx + 1}`)}</div>
                      <div className="text-xs text-muted-foreground">Priority: {String(c.priority ?? '—')}</div>
                    </div>
                    <div className="text-sm text-foreground mt-1">{String(c.definition || '')}</div>
                    <div className="text-xs text-muted-foreground mt-2">Angle: {String(c.messagingAngle || '—')}</div>
                    <div className="mt-3">
                      <CompanyIntelActionButton
                        label="Launch Outreach"
                        agentName="arjun"
                        companyId={companyId}
                        companyName={companyName}
                        websiteUrl={websiteUrl}
                        sectionId={`cohort-outreach-${slugify(String(c.name || `cohort-${idx + 1}`))}`}
                        sectionTitle={`Launch Outreach · ${String(c.name || `Cohort ${idx + 1}`)}`}
                        summary={`Prepare outreach for cohort ${String(c.name || `Cohort ${idx + 1}`)} (priority ${String(c.priority ?? idx + 1)}).`}
                        bullets={[
                          String(c.definition || '').trim(),
                          String(c.messagingAngle || '').trim() ? `Angle: ${String(c.messagingAngle)}` : '',
                          `Priority: ${String(c.priority ?? idx + 1)}`,
                        ].filter(Boolean)}
                        taskPrefix={`Cohort • ${String(c.name || `Cohort ${idx + 1}`)}`}
                        taskRequest={[
                          companyName ? `Company: ${companyName}.` : null,
                          `Prepare and schedule outreach for this cohort: ${String(c.name || `Cohort ${idx + 1}`)}.`,
                          `Definition: ${String(c.definition || '')}.`,
                          `Messaging angle: ${String(c.messagingAngle || '')}.`,
                          `Priority: ${String(c.priority ?? idx + 1)}.`,
                          'Create outreach and distribution tasks for the taskboard and prepare the first launch step. Do not claim messages were sent to LinkedIn or email unless a connected channel send is confirmed.'
                        ].filter(Boolean).join(' ')}
                        marketingContext={{ module: 'icps', cohort: c, icps: data }}
                        navigateModuleId="lead-outreach"
                        moduleWorkflowParams={{
                          question: [
                            companyName ? `Company: ${companyName}.` : null,
                            `Launch an outreach campaign for cohort: ${String(c.name || `Cohort ${idx + 1}`)}.`,
                            `Definition: ${String(c.definition || '')}.`,
                            `Messaging angle: ${String(c.messagingAngle || '')}.`,
                            `Priority: ${String(c.priority ?? idx + 1)}.`,
                            'Build the outreach sequence arc, personalization logic, first touch, and follow-ups for this cohort.',
                          ].filter(Boolean).join(' '),
                          channel: 'multi',
                          target: 'decision',
                          goal: 'meeting',
                          delivery: 'draft',
                        }}
                        chatHandoff={false}
                        successMessage={`Outreach campaign queued for ${String(c.name || `Cohort ${idx + 1}`)} — opening #outreach.`}
                        dialogTitle="Launch Outreach Campaign"
                        dialogDescription="Adds outreach tasks to Upcoming Tasks, then opens #outreach with this cohort preloaded. Does not send live LinkedIn or email by itself."
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

      {notes.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {notes.map((n, idx) => (
              <div key={idx}>• {n}</div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
