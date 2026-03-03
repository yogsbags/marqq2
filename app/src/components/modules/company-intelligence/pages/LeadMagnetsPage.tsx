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

export function LeadMagnetsPage({ artifact }: Props) {
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_lead_magnets')
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No lead magnets yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see lead magnet ideas, landing page copy, and follow-up sequence.</CardContent>
      </Card>
    )
  }

  const leadMagnets: any[] = Array.isArray(data.leadMagnets) ? data.leadMagnets : []
  const notes: string[] = Array.isArray(data.notes) ? data.notes : []

  return (
    <div className="space-y-4">
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Magnets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {leadMagnets.length ? (
            leadMagnets.map((m, idx) => {
              const lp = asObj(m.landingPageCopy) || {}
              const follow: any[] = Array.isArray(m.followUpSequence) ? m.followUpSequence : []
              return (
                <div key={idx} className="border rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{String(m.name || `Lead Magnet ${idx + 1}`)}</div>
                    <div className="text-xs text-muted-foreground">{String(m.format || '—')}</div>
                  </div>
                  <div className="text-sm text-foreground mt-1">{String(m.promise || '')}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Outline:
                    {(Array.isArray(m.outline) ? m.outline : []).slice(0, 10).map((o: string, i: number) => (
                      <div key={i}>• {o}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div className="border rounded-md p-2">
                      <div className="font-semibold text-xs text-muted-foreground">Landing Page</div>
                      <div className="text-sm mt-1">{String(lp.headline || '—')}</div>
                      <div className="text-xs text-muted-foreground mt-1">{String(lp.subheadline || '')}</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {(Array.isArray(lp.bullets) ? lp.bullets : []).slice(0, 6).map((b: string, i: number) => (
                          <div key={i}>• {b}</div>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">CTA: {String(lp.cta || '—')}</div>
                    </div>
                    <div className="border rounded-md p-2">
                      <div className="font-semibold text-xs text-muted-foreground">Follow-up Sequence</div>
                      {follow.length ? (
                        follow.slice(0, 6).map((f, i) => (
                          <div key={i} className="text-xs text-muted-foreground mt-1">
                            Day {String(f.day ?? i + 1)}: {String(f.subject || '—')} — {String(f.goal || '')}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">—</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

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
