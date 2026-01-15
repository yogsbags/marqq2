import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function CompetitorIntelligencePage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No competitor analysis yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to see competitors, differentiators, and messaging gaps.</CardContent>
      </Card>
    )
  }

  const top: any[] = Array.isArray(data.topCompetitors) ? data.topCompetitors : []
  const comparison = asObj(data.comparison) || {}

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top Competitors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top.length ? (
              top.map((c, idx) => (
                <div key={idx} className="border rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{String(c.name || `Competitor ${idx + 1}`)}</div>
                    {c.website ? (
                      <a className="text-xs text-blue-600 underline break-all" href={String(c.website)} target="_blank" rel="noreferrer">
                        {String(c.website)}
                      </a>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{String(c.whyRelevant || '')}</div>
                  <div className="text-sm text-gray-900 mt-2">{String(c.positioningSnapshot || '')}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    <div className="text-xs text-gray-700">
                      <div className="font-semibold mb-1">Strengths</div>
                      {(Array.isArray(c.strengths) ? c.strengths : []).slice(0, 6).map((s: string, i: number) => (
                        <div key={i}>• {s}</div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-700">
                      <div className="font-semibold mb-1">Weaknesses</div>
                      {(Array.isArray(c.weaknesses) ? c.weaknesses : []).slice(0, 6).map((s: string, i: number) => (
                        <div key={i}>• {s}</div>
                      ))}
                    </div>
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
            <CardTitle className="text-base">Your Edge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-semibold text-xs text-gray-600 mb-1">Differentiators</div>
              {(Array.isArray(comparison.yourDifferentiators) ? comparison.yourDifferentiators : []).slice(0, 10).map((d: string, i: number) => (
                <div key={i}>• {d}</div>
              ))}
            </div>
            <div>
              <div className="font-semibold text-xs text-gray-600 mb-1">Messaging Gaps</div>
              {(Array.isArray(comparison.messagingGaps) ? comparison.messagingGaps : []).slice(0, 10).map((d: string, i: number) => (
                <div key={i}>• {d}</div>
              ))}
            </div>
            <div>
              <div className="font-semibold text-xs text-gray-600 mb-1">Opportunities</div>
              {(Array.isArray(comparison.opportunities) ? comparison.opportunities : []).slice(0, 10).map((d: string, i: number) => (
                <div key={i}>• {d}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <JsonCard title="Raw JSON" data={artifact.data} />
    </div>
  )
}

