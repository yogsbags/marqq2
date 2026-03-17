import { Card } from '@/components/ui/card'

export type ArtifactScoreCard = {
  label: string
  value: number | string
  description: string
}

export function clampDisplayScore(value: unknown, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.min(100, Math.round(num)))
}

export function ArtifactScoreCards({ items }: { items: ArtifactScoreCard[] }) {
  if (!items.length) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <div className="text-xs text-orange-600 dark:text-orange-400">{item.label}</div>
          <div className="text-2xl font-bold">{item.value}/100</div>
          <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
        </Card>
      ))}
    </div>
  )
}
