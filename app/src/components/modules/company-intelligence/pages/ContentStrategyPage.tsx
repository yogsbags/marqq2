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

export function ContentStrategyPage({ artifact }: Props) {
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_content_strategy')
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No content strategy yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see content pillars, formats, distribution rules, and governance.</CardContent>
      </Card>
    )
  }

  const contentPillars: any[] = Array.isArray(data.contentPillars) ? data.contentPillars : []
  const formats: string[] = Array.isArray(data.formats) ? data.formats : []
  const distributionRules: string[] = Array.isArray(data.distributionRules) ? data.distributionRules : []
  const repurposingPlan: string[] = Array.isArray(data.repurposingPlan) ? data.repurposingPlan : []
  const governance = asObj(data.governance) || {}
  const reviewChecklist: string[] = Array.isArray(governance.reviewChecklist) ? governance.reviewChecklist : []

  return (
    <div className="space-y-4">
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content Pillars</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {contentPillars.length ? (
            contentPillars.map((p, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="font-semibold text-sm">{String(p.name || `Pillar ${idx + 1}`)}</div>
                <div className="text-sm text-foreground mt-1">{String(p.purpose || '')}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  Examples:
                  {(Array.isArray(p.exampleTopics) ? p.exampleTopics : []).slice(0, 8).map((t: string, i: number) => (
                    <div key={i}>• {t}</div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {formats.length ? formats.map((f, idx) => <div key={idx}>• {f}</div>) : <div className="text-sm text-muted-foreground">—</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {distributionRules.length ? distributionRules.map((r, idx) => <div key={idx}>• {r}</div>) : <div className="text-sm text-muted-foreground">—</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repurposing Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {repurposingPlan.length ? repurposingPlan.map((r, idx) => <div key={idx}>• {r}</div>) : <div className="text-sm text-muted-foreground">—</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Governance Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {reviewChecklist.length ? reviewChecklist.map((r, idx) => <div key={idx}>• {r}</div>) : <div className="text-sm text-muted-foreground">—</div>}
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
