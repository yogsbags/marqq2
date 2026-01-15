import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function MarketingStrategyPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No strategy yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to see objective, funnel plan, KPIs, and a 90-day plan.</CardContent>
      </Card>
    )
  }

  const objective = String(data.objective || '')
  const positioning = String(data.positioning || '')
  const targetSegments: string[] = Array.isArray(data.targetSegments) ? data.targetSegments : []
  const messagingPillars: string[] = Array.isArray(data.messagingPillars) ? data.messagingPillars : []
  const kpis: string[] = Array.isArray(data.kpis) ? data.kpis : []
  const funnelPlan: any[] = Array.isArray(data.funnelPlan) ? data.funnelPlan : []
  const plan90: any[] = Array.isArray(data['90DayPlan']) ? data['90DayPlan'] : []
  const risks: string[] = Array.isArray(data.risksAndMitigations) ? data.risksAndMitigations : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Objective</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-800">{objective || '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Positioning</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-800">{positioning || '—'}</CardContent>
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
                <span key={idx} className="text-xs bg-gray-100 border rounded-full px-2 py-1">
                  {s}
                </span>
              ))
            ) : (
              <div className="text-sm text-gray-700">—</div>
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
                <div key={idx} className="text-sm text-gray-800">
                  • {p}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-700">—</div>
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
                <div key={idx} className="text-sm text-gray-800">
                  • {k}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-700">—</div>
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
                <div className="text-sm text-gray-800 mt-1">{String(stage.goal || '')}</div>
                <div className="text-xs text-gray-600 mt-2">
                  Channels: {(Array.isArray(stage.channels) ? stage.channels : []).join(', ') || '—'}
                </div>
                <div className="text-xs text-gray-600">
                  Offers: {(Array.isArray(stage.offers) ? stage.offers : []).join(', ') || '—'}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-700">—</div>
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
                <div className="text-sm text-gray-800 mt-1">{String(w.focus || '')}</div>
                <div className="text-xs text-gray-600 mt-2">{String(w.keyActivities || '')}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-700">—</div>
          )}
        </CardContent>
      </Card>

      {risks.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risks & Mitigations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {risks.map((r, idx) => (
              <div key={idx} className="text-sm text-gray-800">
                • {r}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <JsonCard title="Raw JSON" data={artifact.data} />
    </div>
  )
}

