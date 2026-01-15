import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function LeadMagnetsPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No lead magnets yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to see lead magnet ideas, landing page copy, and follow-up sequence.</CardContent>
      </Card>
    )
  }

  const leadMagnets: any[] = Array.isArray(data.leadMagnets) ? data.leadMagnets : []
  const notes: string[] = Array.isArray(data.notes) ? data.notes : []

  return (
    <div className="space-y-4">
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
                    <div className="text-xs text-gray-600">{String(m.format || '—')}</div>
                  </div>
                  <div className="text-sm text-gray-800 mt-1">{String(m.promise || '')}</div>
                  <div className="text-xs text-gray-700 mt-2">
                    Outline:
                    {(Array.isArray(m.outline) ? m.outline : []).slice(0, 10).map((o: string, i: number) => (
                      <div key={i}>• {o}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div className="border rounded-md p-2">
                      <div className="font-semibold text-xs text-gray-600">Landing Page</div>
                      <div className="text-sm mt-1">{String(lp.headline || '—')}</div>
                      <div className="text-xs text-gray-700 mt-1">{String(lp.subheadline || '')}</div>
                      <div className="text-xs text-gray-700 mt-2">
                        {(Array.isArray(lp.bullets) ? lp.bullets : []).slice(0, 6).map((b: string, i: number) => (
                          <div key={i}>• {b}</div>
                        ))}
                      </div>
                      <div className="text-xs text-gray-600 mt-2">CTA: {String(lp.cta || '—')}</div>
                    </div>
                    <div className="border rounded-md p-2">
                      <div className="font-semibold text-xs text-gray-600">Follow-up Sequence</div>
                      {follow.length ? (
                        follow.slice(0, 6).map((f, i) => (
                          <div key={i} className="text-xs text-gray-700 mt-1">
                            Day {String(f.day ?? i + 1)}: {String(f.subject || '—')} — {String(f.goal || '')}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-700">—</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-sm text-gray-700">—</div>
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

      <JsonCard title="Raw JSON" data={artifact.data} />
    </div>
  )
}

