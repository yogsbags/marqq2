import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GtmContextBanner } from '@/components/ui/gtm-context-banner'
import { useGtmContext } from '@/lib/gtmContext'
import { Lightbulb } from 'lucide-react'
import type { ArtifactRecord } from '../api'

type Props = {
  artifact: ArtifactRecord | null
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

type RiskItem = string | { risk?: unknown; mitigation?: unknown }

export function MarketingStrategyPage({ artifact }: Props) {
  const { context: gtmContext, isFromGtm, dismiss: dismissGtmContext } = useGtmContext('company_intel_marketing_strategy');
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <div className="space-y-4">
        {isFromGtm && gtmContext && (
          <GtmContextBanner context={gtmContext} onDismiss={dismissGtmContext} />
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No strategy yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Generate to see objective, funnel plan, KPIs, and a 90-day plan.
            {isFromGtm && gtmContext && (
              <div className="mt-4 text-xs text-orange-600 flex items-center">
                <Lightbulb className="h-4 w-4 mr-1" /> Tip: Use the GTM strategy insights above to inform your marketing strategy generation.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const objective = String(data.objective || '')
  const positioning = String(data.positioning || '')
  const targetSegments = asStringArray(data.targetSegments)
  const messagingPillars = asStringArray(data.messagingPillars)
  const kpis = asStringArray(data.kpis)
  const funnelPlan: any[] = Array.isArray(data.funnelPlan) ? data.funnelPlan : []
  const plan90: any[] = Array.isArray(data['90DayPlan']) ? data['90DayPlan'] : []
  const risks: RiskItem[] = Array.isArray(data.risksAndMitigations) ? (data.risksAndMitigations as RiskItem[]) : []

  return (
    <div className="space-y-4">
      {isFromGtm && gtmContext && (
        <GtmContextBanner context={gtmContext} onDismiss={dismissGtmContext} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Objective</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground">{objective || '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Positioning</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground">{positioning || '—'}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target Segments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {targetSegments.length ? (
              targetSegments.map((s, idx) => (
                <span key={idx} className="text-xs bg-muted border rounded-full px-2 py-1">
                  {s}
                </span>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Messaging Pillars</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {messagingPillars.length ? (
              messagingPillars.map((p, idx) => (
                <div key={idx} className="text-sm text-foreground">
                  • {p}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">KPIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {kpis.length ? (
              kpis.map((k, idx) => (
                <div key={idx} className="text-sm text-foreground">
                  • {k}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funnel Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {funnelPlan.length ? (
            funnelPlan.map((stage, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">{String(stage.stage || `Stage ${idx + 1}`)}</div>
                <div className="text-sm text-foreground mt-1">{String(stage.goal || '')}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  Channels:{' '}
                  {(Array.isArray(stage.channels)
                    ? asStringArray(stage.channels)
                    : typeof stage.channels === 'string'
                      ? [stage.channels.trim()].filter(Boolean)
                      : []
                  ).join(', ') || '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Offers:{' '}
                  {(Array.isArray(stage.offers)
                    ? asStringArray(stage.offers)
                    : typeof stage.offers === 'string'
                      ? [stage.offers.trim()].filter(Boolean)
                      : []
                  ).join(', ') || '—'}
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
          <CardTitle className="text-base">90‑Day Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan90.length ? (
            plan90.map((w, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">Week {Number(w.week || idx + 1)}</div>
                <div className="text-sm text-foreground mt-1">{String(w.focus || '')}</div>
                {Array.isArray(w.keyActivities) ? (
                  <div className="text-xs text-muted-foreground mt-2 space-y-1">
                    {asStringArray(w.keyActivities).map((a, aIdx) => (
                      <div key={aIdx}>• {a}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-2">{String(w.keyActivities || '')}</div>
                )}
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

      {risks.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risks & Mitigations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {risks.map((r, idx) => {
              if (typeof r === 'string') {
                return (
                  <div key={idx} className="text-sm text-foreground">
                    • {r}
                  </div>
                )
              }

              const riskText = r && typeof r === 'object' ? String((r as any).risk || '') : ''
              const mitigationText = r && typeof r === 'object' ? String((r as any).mitigation || '') : ''

              if (!riskText && !mitigationText) return null

              return (
                <div key={idx} className="text-sm text-foreground">
                  <div className="font-medium">• {riskText || 'Risk'}</div>
                  {mitigationText ? <div className="text-sm text-muted-foreground mt-1">Mitigation: {mitigationText}</div> : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
