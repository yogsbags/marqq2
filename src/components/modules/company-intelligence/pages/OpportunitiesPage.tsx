import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { Badge } from '@/components/ui/badge'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
    .map((s) => s.trim())
    .filter(Boolean)
}

function priorityBadge(priority: string) {
  const p = String(priority || '').toLowerCase()
  if (p === 'high') return 'bg-red-100 text-red-800'
  if (p === 'medium') return 'bg-yellow-100 text-yellow-900'
  if (p === 'low') return 'bg-gray-100 text-gray-800'
  return 'bg-gray-100 text-gray-800'
}

export function OpportunitiesPage({ artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No opportunities yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">
          Generate to see quick wins, growth opportunities, and an execution plan.
        </CardContent>
      </Card>
    )
  }

  const summary = String(data.summary || '')
  const quickWins: any[] = Array.isArray(data.quickWins) ? data.quickWins : []
  const opportunities: any[] = Array.isArray(data.opportunities) ? data.opportunities : []
  const risks: any[] = Array.isArray(data.risksAndMitigations) ? data.risksAndMitigations : []
  const plan90: any[] = Array.isArray(data['90DayPlan']) ? data['90DayPlan'] : []

  const highCount = opportunities.filter((o) => String(o?.priority || '').toLowerCase() === 'high').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-gray-600">Opportunities</div>
          <div className="text-2xl font-bold">{opportunities.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-600">Quick wins</div>
          <div className="text-2xl font-bold">{quickWins.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-600">High priority</div>
          <div className="text-2xl font-bold">{highCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-600">90-day plan items</div>
          <div className="text-2xl font-bold">{plan90.length || 0}</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-800">{summary || '—'}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Wins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quickWins.length ? (
            quickWins.map((w, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{String(w.title || `Quick win ${idx + 1}`)}</div>
                  <Badge className={priorityBadge(String(w.priority || 'medium'))}>{String(w.priority || 'medium')}</Badge>
                </div>
                <div className="text-sm text-gray-800 mt-1">{String(w.description || '')}</div>
                <div className="text-xs text-gray-600 mt-2">Expected impact: {String(w.expectedImpact || '—')}</div>
                <div className="text-xs text-gray-600">Time to value: {String(w.timeToValue || '—')}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-700">—</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opportunities</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          {opportunities.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-600 border-b">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Effort</th>
                  <th className="py-2 pr-3">Impact</th>
                  <th className="py-2">Next steps</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o, idx) => (
                  <tr key={idx} className="border-b align-top">
                    <td className="py-2 pr-3 font-medium">{String(o.title || `Opportunity ${idx + 1}`)}</td>
                    <td className="py-2 pr-3">{String(o.category || '—')}</td>
                    <td className="py-2 pr-3">
                      <Badge className={priorityBadge(String(o.priority || 'medium'))}>{String(o.priority || 'medium')}</Badge>
                    </td>
                    <td className="py-2 pr-3">{String(o.effort || '—')}</td>
                    <td className="py-2 pr-3">{String(o.expectedImpact || '—')}</td>
                    <td className="py-2">{asStringArray(o.nextSteps).slice(0, 3).join(' • ') || String(o.nextStep || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-gray-700">—</div>
          )}
        </CardContent>
      </Card>

      {risks.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risks & Mitigations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {risks.map((r, idx) => {
              if (typeof r === 'string') return <div key={idx}>• {r}</div>
              const riskText = String(r?.risk || '').trim()
              const mitigationText = String(r?.mitigation || '').trim()
              if (!riskText && !mitigationText) return null
              return (
                <div key={idx} className="border rounded-md p-3">
                  <div className="font-medium">• {riskText || 'Risk'}</div>
                  {mitigationText ? <div className="text-sm text-gray-700 mt-1">Mitigation: {mitigationText}</div> : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

