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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function cohortMarketType(cohort: any): 'b2b' | 'b2c' | 'mixed' {
  const explicit = String(cohort?.marketType || cohort?.market_type || '').toLowerCase()
  if (explicit === 'b2b' || explicit === 'b2c' || explicit === 'mixed') return explicit

  const recommended = asStringArray(cohort?.recommendedChannels || cohort?.recommended_channels)
  const blocked = asStringArray(cohort?.blockedChannels || cohort?.blocked_channels)
  if (recommended.includes('apollo_outreach')) return 'b2b'
  if (blocked.includes('apollo_outreach')) return 'b2c'

  const text = [
    cohort?.name,
    cohort?.definition,
    cohort?.messagingAngle,
    cohort?.messaging_angle,
  ].map((v) => String(v || '').toLowerCase()).join(' ')
  const consumerSignals = [
    'adult', 'women', 'men', 'person', 'people', 'users', 'consumer', 'patient',
    'diagnosed', 'diabetes', 'pcos', 'thyroid', 'pregnant', 'health condition',
    'fitness enthusiasts', 'meal', 'lab reports',
  ]
  const businessSignals = [
    'companies', 'businesses', 'clinics', 'labs', 'agencies', 'teams', 'founders',
    'owners', 'operators', 'buyers', 'decision makers', 'partners', 'hospitals',
  ]
  const hasConsumer = consumerSignals.some((signal) => text.includes(signal))
  const hasBusiness = businessSignals.some((signal) => text.includes(signal))
  if (hasBusiness && !hasConsumer) return 'b2b'
  if (hasBusiness && hasConsumer) return 'mixed'
  return 'b2c'
}

function acquisitionChannels(cohort: any): string[] {
  const explicit = asStringArray(cohort?.recommendedChannels || cohort?.recommended_channels)
    .filter((channel) => channel !== 'apollo_outreach')
  return explicit.length ? explicit : ['paid_ads', 'social_posts', 'seo_article']
}

function channelLabel(channel: string) {
  const labels: Record<string, string> = {
    paid_ads: 'Paid ads',
    social_posts: 'Social posts',
    seo_article: 'SEO article',
    creator_partnerships: 'Creator partnerships',
    community: 'Community plan',
    landing_page: 'Landing page',
  }
  return labels[channel] || channel.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
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
                .map((c, idx) => {
                  const cohortName = String(c.name || `Cohort ${idx + 1}`)
                  const marketType = cohortMarketType(c)
                  const channels = acquisitionChannels(c)
                  const isB2BOutreach = marketType === 'b2b'
                  return (
                    <div key={idx} className="border rounded-md p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm">{cohortName}</div>
                        <div className="text-xs text-muted-foreground">Priority: {String(c.priority ?? '—')}</div>
                      </div>
                      <div className="text-sm text-foreground mt-1">{String(c.definition || '')}</div>
                      <div className="text-xs text-muted-foreground mt-2">Angle: {String(c.messagingAngle || '—')}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Channel fit: {marketType.toUpperCase()}
                        {!isB2BOutreach ? ' · B2B lead-data outreach disabled; use consumer acquisition channels.' : ' · Lead-data outreach (Apollo/Hunter) is available for business buyers.'}
                      </div>
                      {c.reason ? (
                        <div className="mt-1 text-xs text-muted-foreground">{String(c.reason)}</div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isB2BOutreach ? (
                          <CompanyIntelActionButton
                            label="Launch Outreach"
                            agentName="sam"
                            companyId={companyId}
                            companyName={companyName}
                            websiteUrl={websiteUrl}
                            sectionId={`cohort-outreach-${slugify(cohortName)}`}
                            sectionTitle={`Launch Outreach · ${cohortName}`}
                            summary={`Prepare outreach for B2B cohort ${cohortName} (priority ${String(c.priority ?? idx + 1)}).`}
                            bullets={[
                              String(c.definition || '').trim(),
                              String(c.messagingAngle || '').trim() ? `Angle: ${String(c.messagingAngle)}` : '',
                              asStringArray(c.apolloTargetIndustries || c.apollo_target_industries).length
                                ? `Target industries: ${asStringArray(c.apolloTargetIndustries || c.apollo_target_industries).join(', ')}`
                                : '',
                              asStringArray(c.apolloBuyerTitles || c.apollo_buyer_titles).length
                                ? `Buyer titles: ${asStringArray(c.apolloBuyerTitles || c.apollo_buyer_titles).join(', ')}`
                                : '',
                              `Priority: ${String(c.priority ?? idx + 1)}`,
                            ].filter(Boolean)}
                            taskPrefix={`B2B Cohort • ${cohortName}`}
                            taskRequest={[
                              companyName ? `Company: ${companyName}.` : null,
                              `Prepare B2B outreach for this lead-data-searchable cohort: ${cohortName}.`,
                              `Definition: ${String(c.definition || '')}.`,
                              `Messaging angle: ${String(c.messagingAngle || '')}.`,
                              `Target industries: ${asStringArray(c.apolloTargetIndustries || c.apollo_target_industries).join(', ') || 'derive from cohort only if business/professional buyer safe'}.`,
                              `Buyer titles: ${asStringArray(c.apolloBuyerTitles || c.apollo_buyer_titles).join(', ') || 'decision makers'}.`,
                              'Use connected lead-data providers (Apollo or Hunter) only for companies/professional decision makers. Do not search for consumers, patients, demographics, or sensitive traits.'
                            ].filter(Boolean).join(' ')}
                            marketingContext={{ module: 'icps', cohort: c, icps: data }}
                            navigateModuleId="lead-outreach"
                            moduleWorkflowParams={{
                              question: [
                                companyName ? `Company: ${companyName}.` : null,
                                `Launch B2B outreach for lead-data-searchable cohort: ${cohortName}.`,
                                `Definition: ${String(c.definition || '')}.`,
                                `Messaging angle: ${String(c.messagingAngle || '')}.`,
                                `Target industries: ${asStringArray(c.apolloTargetIndustries || c.apollo_target_industries).join(', ') || 'not provided'}.`,
                                `Buyer titles: ${asStringArray(c.apolloBuyerTitles || c.apollo_buyer_titles).join(', ') || 'decision makers'}.`,
                                'Use Apollo or Hunter only for businesses/professional buyers; never for consumer traits or health-condition users.',
                              ].filter(Boolean).join(' '),
                              channel: 'email',
                              contact_channels: 'email',
                              target: 'decision',
                              goal: 'reply',
                              delivery: 'draft',
                            }}
                            chatHandoff={false}
                            successMessage={`Outreach campaign queued for ${cohortName} — opening #outreach.`}
                            dialogTitle="Launch Outreach Campaign"
                            dialogDescription="Adds outreach tasks to Upcoming Tasks, then opens #outreach with this B2B cohort preloaded."
                            className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                          />
                        ) : (
                          <>
                            {channels.includes('paid_ads') ? (
                              <CompanyIntelActionButton
                                label="Create Paid Ads"
                                agentName="zara"
                                companyId={companyId}
                                companyName={companyName}
                                websiteUrl={websiteUrl}
                                sectionId={`cohort-paid-ads-${slugify(cohortName)}`}
                                sectionTitle={`Paid Ads · ${cohortName}`}
                                summary={`Create consumer paid acquisition for ${cohortName}.`}
                                bullets={[String(c.definition || '').trim(), String(c.messagingAngle || '').trim()].filter(Boolean)}
                                taskPrefix={`Paid Ads • ${cohortName}`}
                                taskRequest={[
                                  companyName ? `Company: ${companyName}.` : null,
                                  `Create paid acquisition tasks for B2C cohort: ${cohortName}.`,
                                  `Definition: ${String(c.definition || '')}.`,
                                  `Messaging angle: ${String(c.messagingAngle || '')}.`,
                                  'Do not use Apollo outreach for this consumer/persona cohort.'
                                ].filter(Boolean).join(' ')}
                                marketingContext={{ module: 'icps', cohort: c, icps: data }}
                                navigateModuleId="paid-ads"
                                moduleWorkflowParams={{
                                  question: `Create paid ads for B2C cohort ${cohortName}. Angle: ${String(c.messagingAngle || '')}.`,
                                  objective: 'leads',
                                  channel: 'facebook_instagram',
                                }}
                                chatHandoff={false}
                                successMessage={`Paid ads queued for ${cohortName}.`}
                                dialogTitle="Create Paid Ads"
                                dialogDescription="Creates paid acquisition tasks for this consumer cohort."
                                className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                              />
                            ) : null}
                            {channels.some((channel) => ['social_posts', 'creator_partnerships', 'community'].includes(channel)) ? (
                              <CompanyIntelActionButton
                                label="Generate Social Posts"
                                agentName="kiran"
                                companyId={companyId}
                                companyName={companyName}
                                websiteUrl={websiteUrl}
                                sectionId={`cohort-social-${slugify(cohortName)}`}
                                sectionTitle={`Social Posts · ${cohortName}`}
                                summary={`Create social content for ${cohortName}.`}
                                bullets={[String(c.definition || '').trim(), String(c.messagingAngle || '').trim()].filter(Boolean)}
                                taskPrefix={`Social • ${cohortName}`}
                                taskRequest={[
                                  companyName ? `Company: ${companyName}.` : null,
                                  `Create social/content acquisition tasks for B2C cohort: ${cohortName}.`,
                                  `Definition: ${String(c.definition || '')}.`,
                                  `Messaging angle: ${String(c.messagingAngle || '')}.`,
                                  `Recommended channels: ${channels.map(channelLabel).join(', ')}.`,
                                  'Do not use Apollo outreach for this consumer/persona cohort.'
                                ].filter(Boolean).join(' ')}
                                marketingContext={{ module: 'icps', cohort: c, icps: data }}
                                navigateModuleId="social-media"
                                moduleWorkflowParams={{
                                  question: `Generate social posts for B2C cohort ${cohortName}. Angle: ${String(c.messagingAngle || '')}.`,
                                }}
                                chatHandoff={false}
                                successMessage={`Social posts queued for ${cohortName}.`}
                                dialogTitle="Generate Social Posts"
                                dialogDescription="Creates organic social tasks for this consumer cohort."
                                className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                              />
                            ) : null}
                            {channels.includes('seo_article') ? (
                              <CompanyIntelActionButton
                                label="Write Article"
                                agentName="riya"
                                companyId={companyId}
                                companyName={companyName}
                                websiteUrl={websiteUrl}
                                sectionId={`cohort-article-${slugify(cohortName)}`}
                                sectionTitle={`SEO Article · ${cohortName}`}
                                summary={`Create SEO content for ${cohortName}.`}
                                bullets={[String(c.definition || '').trim(), String(c.messagingAngle || '').trim()].filter(Boolean)}
                                taskPrefix={`SEO Article • ${cohortName}`}
                                taskRequest={[
                                  companyName ? `Company: ${companyName}.` : null,
                                  `Write an acquisition article plan for B2C cohort: ${cohortName}.`,
                                  `Definition: ${String(c.definition || '')}.`,
                                  `Messaging angle: ${String(c.messagingAngle || '')}.`,
                                  'Do not use Apollo outreach for this consumer/persona cohort.'
                                ].filter(Boolean).join(' ')}
                                marketingContext={{ module: 'icps', cohort: c, icps: data }}
                                navigateModuleId="ai-content"
                                moduleWorkflowParams={{
                                  question: `Write an SEO/article brief for B2C cohort ${cohortName}. Angle: ${String(c.messagingAngle || '')}.`,
                                }}
                                chatHandoff={false}
                                successMessage={`Article task queued for ${cohortName}.`}
                                dialogTitle="Write Article"
                                dialogDescription="Creates content tasks for this consumer cohort."
                                className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
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
