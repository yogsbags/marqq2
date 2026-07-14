import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { clampDisplayScore } from '../ui/ArtifactScoreCards'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function ClientProfilingPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">No client profiling yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see segments, pain points, objections, and channel insights.</CardContent>
      </Card>
    )
  }

  const segments: any[] = Array.isArray(data.segments) ? data.segments : []
  const insights: string[] = Array.isArray(data.insights) ? data.insights : []
  const aiScores = asObj(data.scores)
  const segmentCoverageScore = Number.isFinite(Number(aiScores?.segmentCoverage))
    ? clampDisplayScore(Number(aiScores.segmentCoverage))
    : clampDisplayScore(
    Math.min(segments.length * 20, 60) +
      Math.min(segments.filter((segment) => String(segment?.profile || '').trim()).length * 10, 20) +
      Math.min(
        segments.filter((segment) => Array.isArray(segment?.channels) && segment.channels.length > 0).length * 7,
        20
      )
  )
  const painClarityScore = Number.isFinite(Number(aiScores?.painClarity))
    ? clampDisplayScore(Number(aiScores.painClarity))
    : clampDisplayScore(
    Math.min(
      segments.filter((segment) => Array.isArray(segment?.painPoints) && segment.painPoints.length > 0).length * 14,
      42
    ) +
      Math.min(
        segments.filter((segment) => Array.isArray(segment?.objections) && segment.objections.length > 0).length * 12,
        36
      ) +
      Math.min(insights.length * 4, 22)
  )
  const activationReadinessScore = Number.isFinite(Number(aiScores?.activationReadiness))
    ? clampDisplayScore(Number(aiScores.activationReadiness))
    : clampDisplayScore(
    Math.min(
      segments.filter((segment) => Array.isArray(segment?.jobsToBeDone) && segment.jobsToBeDone.length > 0).length * 12,
      36
    ) +
      Math.min(
        segments.filter((segment) => Array.isArray(segment?.triggers) && segment.triggers.length > 0).length * 14,
        42
      ) +
      Math.min(
        segments.filter((segment) => Array.isArray(segment?.channels) && segment.channels.length > 0).length * 7,
        22
      )
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Segment Coverage</div>
          <div className="text-2xl font-bold">{segmentCoverageScore}/100</div>
          <div className="text-xs text-muted-foreground mt-1">How complete the client segment map and core profiles are.</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Pain Clarity</div>
          <div className="text-2xl font-bold">{painClarityScore}/100</div>
          <div className="text-xs text-muted-foreground mt-1">How clearly pains, objections, and buying friction are defined.</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">Activation Readiness</div>
          <div className="text-2xl font-bold">{activationReadinessScore}/100</div>
          <div className="text-xs text-muted-foreground mt-1">How usable this client profile is for campaigns and messaging.</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">Segments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {segments.length ? (
            segments.map((s, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">{String(s.name || `Segment ${idx + 1}`)}</div>
                <div className="text-sm text-foreground mt-1">{String(s.profile || '')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                  <div>
                    <div className="font-semibold mb-1">Jobs-to-be-done</div>
                    {(Array.isArray(s.jobsToBeDone) ? s.jobsToBeDone : []).slice(0, 6).map((v: string, i: number) => (
                      <div key={i}>• {v}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Pain Points</div>
                    {(Array.isArray(s.painPoints) ? s.painPoints : []).slice(0, 6).map((v: string, i: number) => (
                      <div key={i}>• {v}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Objections</div>
                    {(Array.isArray(s.objections) ? s.objections : []).slice(0, 6).map((v: string, i: number) => (
                      <div key={i}>• {v}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Triggers</div>
                    {(Array.isArray(s.triggers) ? s.triggers : []).slice(0, 6).map((v: string, i: number) => (
                      <div key={i}>• {v}</div>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Channels: {(Array.isArray(s.channels) ? s.channels : []).join(', ') || '—'}
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
