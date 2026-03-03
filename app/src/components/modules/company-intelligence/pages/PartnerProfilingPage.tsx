import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'

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
          <CardTitle className="text-base">No partner profiling yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see partner types, value exchange, and activation playbooks.</CardContent>
      </Card>
    )
  }

  const partnerTypes: any[] = Array.isArray(data.partnerTypes) ? data.partnerTypes : []
  const insights: string[] = Array.isArray(data.insights) ? data.insights : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partner Types</CardTitle>
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
            <CardTitle className="text-base">Insights</CardTitle>
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
