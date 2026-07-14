import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { clampDisplayScore } from '../ui/ArtifactScoreCards'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function PartnerProfilingPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">No partner profiling yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see partner types, value exchange, and activation playbooks.</CardContent>
      </Card>
    )
  }

  const partnerTypes: any[] = Array.isArray(data.partnerTypes) ? data.partnerTypes : []
  const insights: string[] = Array.isArray(data.insights) ? data.insights : []
  const aiScores = asObj(data.scores)
  const partnerCoverageScore = Number.isFinite(Number(aiScores?.partnerCoverage))
    ? clampDisplayScore(Number(aiScores.partnerCoverage))
    : clampDisplayScore(
    Math.min(partnerTypes.length * 20, 60) +
      Math.min(
        partnerTypes.filter((partner) => String(partner?.valueExchange || '').trim()).length * 12,
        24
      ) +
      Math.min(insights.length * 4, 16)
  )
  const valueExchangeClarityScore = Number.isFinite(Number(aiScores?.valueExchangeClarity))
    ? clampDisplayScore(Number(aiScores.valueExchangeClarity))
    : clampDisplayScore(
    Math.min(
      partnerTypes.filter((partner) => String(partner?.valueExchange || '').trim()).length * 20,
      60
    ) +
      Math.min(
        partnerTypes.filter(
          (partner) => Array.isArray(partner?.selectionCriteria) && partner.selectionCriteria.length > 0
        ).length * 10,
        20
      ) +
      Math.min(
        partnerTypes.filter(
          (partner) => Array.isArray(partner?.activationPlaybook) && partner.activationPlaybook.length > 0
        ).length * 10,
        20
      )
  )
  const activationReadinessScore = Number.isFinite(Number(aiScores?.activationReadiness))
    ? clampDisplayScore(Number(aiScores.activationReadiness))
    : clampDisplayScore(
    Math.min(
      partnerTypes.filter(
        (partner) => Array.isArray(partner?.activationPlaybook) && partner.activationPlaybook.length > 0
      ).length * 18,
      54
    ) +
      Math.min(
        partnerTypes.filter(
          (partner) => Array.isArray(partner?.selectionCriteria) && partner.selectionCriteria.length > 0
        ).length * 12,
        36
      ) +
      Math.min(insights.length * 2, 10)
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Partner Coverage</div>
          <div className="text-2xl font-bold">{partnerCoverageScore}/100</div>
          <div className="text-xs text-muted-foreground mt-1">How complete the partner landscape and archetypes are.</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Value Exchange Clarity</div>
          <div className="text-2xl font-bold">{valueExchangeClarityScore}/100</div>
          <div className="text-xs text-muted-foreground mt-1">How clearly mutual partner value and qualification logic are defined.</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Activation Readiness</div>
          <div className="text-2xl font-bold">{activationReadinessScore}/100</div>
          <div className="text-xs text-muted-foreground mt-1">How ready these partner profiles are for outbound activation.</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">Partner Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {partnerTypes.length ? (
            partnerTypes.map((p, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">{String(p.name || `Partner ${idx + 1}`)}</div>
                <div className="text-sm text-foreground mt-1">Value exchange: {String(p.valueExchange || '—')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                  <div>
                    <div className="font-semibold mb-1">Selection Criteria</div>
                    {(Array.isArray(p.selectionCriteria) ? p.selectionCriteria : []).slice(0, 10).map((v: string, i: number) => (
                      <div key={i}>• {v}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Activation Playbook</div>
                    {(Array.isArray(p.activationPlaybook) ? p.activationPlaybook : []).slice(0, 10).map((v: string, i: number) => (
                      <div key={i}>• {v}</div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

      {insights.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {insights.map((n, idx) => (
              <div key={idx}>• {n}</div>
            ))}
          </CardContent>
        </Card>
      ) : null}

    </div>
  )
}
