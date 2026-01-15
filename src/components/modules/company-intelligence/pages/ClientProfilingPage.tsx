import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

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
          <CardTitle className="text-base">No client profiling yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to see segments, pain points, objections, and channel insights.</CardContent>
      </Card>
    )
  }

  const segments: any[] = Array.isArray(data.segments) ? data.segments : []
  const insights: string[] = Array.isArray(data.insights) ? data.insights : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {segments.length ? (
            segments.map((s, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">{String(s.name || `Segment ${idx + 1}`)}</div>
                <div className="text-sm text-gray-800 mt-1">{String(s.profile || '')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs text-gray-700">
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
                <div className="text-xs text-gray-600 mt-2">
                  Channels: {(Array.isArray(s.channels) ? s.channels : []).join(', ') || '—'}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-700">—</div>
          )}
        </CardContent>
      </Card>

      {insights.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {insights.map((n, idx) => (
              <div key={idx}>• {n}</div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <JsonCard title="Raw JSON" data={artifact.data} />
    </div>
  )
}

