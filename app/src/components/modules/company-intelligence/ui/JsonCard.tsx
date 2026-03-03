import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  title: string
  data: unknown
}

export function JsonCard({ title, data }: Props) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    } catch {
      // ignore
    }
  }

  return (
    <details className="rounded-lg border bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void copy()
          }}
        >
          Copy JSON
        </Button>
      </summary>
      <div className="px-4 pb-4">
        <pre className="text-xs whitespace-pre-wrap break-words max-h-[520px] overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </details>
  )
}
