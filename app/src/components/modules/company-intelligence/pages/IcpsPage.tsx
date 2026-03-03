import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { useGtmContext } from '@/lib/gtmContext'
import { GtmContextBanner } from '@/components/ui/gtm-context-banner'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function IcpsPage({ artifact }: Props) {
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_icp')
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No ICPs yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see ICP definitions, cohorts, and messaging angles.</CardContent>
      </Card>
    )
  }

  const icps: any[] = Array.isArray(data.icps) ? data.icps : []
  const cohorts: any[] = Array.isArray(data.cohorts) ? data.cohorts : []
  const notes: string[] = Array.isArray(data.notes) ? data.notes : []

  return (
    <div className="space-y-4">
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ICPs</CardTitle>
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
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cohorts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cohorts.length ? (
              cohorts
                .slice()
                .sort((a, b) => Number(a?.priority || 0) - Number(b?.priority || 0))
                .map((c, idx) => (
                  <div key={idx} className="border rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{String(c.name || `Cohort ${idx + 1}`)}</div>
                      <div className="text-xs text-muted-foreground">Priority: {String(c.priority ?? '—')}</div>
                    </div>
                    <div className="text-sm text-foreground mt-1">{String(c.definition || '')}</div>
                    <div className="text-xs text-muted-foreground mt-2">Angle: {String(c.messagingAngle || '—')}</div>
                  </div>
                ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {notes.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
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
