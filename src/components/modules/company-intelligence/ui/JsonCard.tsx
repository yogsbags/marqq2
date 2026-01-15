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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={copy}>
          Copy JSON
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap break-words max-h-[520px] overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CardContent>
    </Card>
  )
}

