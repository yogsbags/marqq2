import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord } from '../api'
import { JsonCard } from '../ui/JsonCard'

type Props = {
  title: string
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function GenericArtifactPage({ title, artifact }: Props) {
  const data = asObj(artifact?.data)

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No output yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to populate this dashboard.</CardContent>
      </Card>
    )
  }

  const sections = Object.entries(data)
    .filter(([_, v]) => typeof v === 'string' || Array.isArray(v))
    .slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sections.map(([key, value]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base">{key}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-gray-800">
              {Array.isArray(value)
                ? value.slice(0, 12).map((v, idx) => (
                    <div key={idx}>
                      • {typeof v === 'string' ? v : JSON.stringify(v)}
                    </div>
                  ))
                : String(value || '—')}
            </CardContent>
          </Card>
        ))}
      </div>

      <JsonCard title={`${title} (Raw JSON)`} data={artifact.data} />
    </div>
  )
}

