import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function ChannelStrategyPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No channel strategy yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to see channel roles, cadence, growth loops, and measurement.</CardContent>
      </Card>
    )
  }

  const channels: any[] = Array.isArray(data.channels) ? data.channels : []
  const budgetSplitGuidance: string[] = Array.isArray(data.budgetSplitGuidance) ? data.budgetSplitGuidance : []
  const measurement: string[] = Array.isArray(data.measurement) ? data.measurement : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel Roles & Cadence</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {channels.length ? (
            channels.map((c, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">{String(c.name || `Channel ${idx + 1}`)}</div>
                <div className="text-sm text-gray-800 mt-1">{String(c.role || '')}</div>
                <div className="text-xs text-gray-600 mt-2">Cadence: {String(c.cadence || '—')}</div>
                <div className="text-xs text-gray-700 mt-2">
                  Content mix:
                  {(Array.isArray(c.contentMix) ? c.contentMix : []).slice(0, 10).map((m: string, i: number) => (
                    <div key={i}>• {m}</div>
                  ))}
                </div>
                <div className="text-xs text-gray-700 mt-2">
                  Growth loops:
                  {(Array.isArray(c.growthLoops) ? c.growthLoops : []).slice(0, 10).map((m: string, i: number) => (
                    <div key={i}>• {m}</div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-700">—</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget Split Guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {budgetSplitGuidance.length ? (
              budgetSplitGuidance.map((b, idx) => <div key={idx}>• {b}</div>)
            ) : (
              <div className="text-sm text-gray-700">—</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Measurement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {measurement.length ? measurement.map((m, idx) => <div key={idx}>• {m}</div>) : <div className="text-sm text-gray-700">—</div>}
          </CardContent>
        </Card>
      </div>

      <JsonCard title="Raw JSON" data={artifact.data} />
    </div>
  )
}

