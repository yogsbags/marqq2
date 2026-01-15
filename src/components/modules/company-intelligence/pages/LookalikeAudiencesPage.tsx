import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function LookalikeAudiencesPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No lookalike plan yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to see seed audiences and per-platform lookalike targeting.</CardContent>
      </Card>
    )
  }

  const seedAudiences: string[] = Array.isArray(data.seedAudiences) ? data.seedAudiences : []
  const lookalikes: any[] = Array.isArray(data.lookalikes) ? data.lookalikes : []
  const measurement: string[] = Array.isArray(data.measurement) ? data.measurement : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seed Audiences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {seedAudiences.length ? seedAudiences.map((s, idx) => <div key={idx}>• {s}</div>) : <div className="text-sm text-gray-700">—</div>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lookalikes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lookalikes.length ? (
              lookalikes.map((l, idx) => (
                <div key={idx} className="border rounded-md p-3">
                  <div className="font-semibold text-sm">{String(l.platform || `Platform ${idx + 1}`)}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs text-gray-700">
                    <div>
                      <div className="font-semibold mb-1">Targeting</div>
                      {(Array.isArray(l.targeting) ? l.targeting : []).slice(0, 12).map((t: string, i: number) => (
                        <div key={i}>• {t}</div>
                      ))}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Exclusions</div>
                      {(Array.isArray(l.exclusions) ? l.exclusions : []).slice(0, 12).map((t: string, i: number) => (
                        <div key={i}>• {t}</div>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-gray-700 mt-2">
                    <div className="font-semibold mb-1">Creative angles</div>
                    {(Array.isArray(l.creativeAngles) ? l.creativeAngles : []).slice(0, 10).map((t: string, i: number) => (
                      <div key={i}>• {t}</div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-700">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {measurement.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Measurement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {measurement.map((m, idx) => (
              <div key={idx}>• {m}</div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <JsonCard title="Raw JSON" data={artifact.data} />
    </div>
  )
}

