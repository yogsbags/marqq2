import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GtmStrategyDocumentView } from '@/components/home/GtmStrategyDocumentView'
import type { GtmStrategyDocument } from '@/types/gtm'

type Props = {
  moduleId: string
  sectionId: string
  workspaceId?: string | null
  onModuleSelect: (id: string | null) => void
}

export function GtmStrategySectionChannel({ moduleId, sectionId, workspaceId, onModuleSelect }: Props) {
  const [strategy, setStrategy] = useState<GtmStrategyDocument | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStrategy(null)
    setError(null)
    fetch(`/api/gtm/modules/${encodeURIComponent(moduleId)}/strategy`)
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body?.error || 'Could not load strategy'))))
      .then((data: { strategy?: GtmStrategyDocument; markdown?: string }) => {
        if (cancelled) return
        setStrategy(data.strategy || null)
        setMarkdown(data.markdown || '')
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load strategy')
      })
    return () => { cancelled = true }
  }, [moduleId])

  if (error) {
    return (
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Could not open this strategy channel</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => onModuleSelect('main')} className="gap-2"><ArrowLeft className="h-3.5 w-3.5" /> Back to #main</Button>
      </div>
    )
  }

  if (!strategy) {
    return <div className="flex min-h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading strategy channel…</div>
  }

  return (
    <GtmStrategyDocumentView
      moduleId={moduleId}
      workspaceId={workspaceId}
      strategy={strategy}
      markdown={markdown}
      initialSectionId={sectionId}
      onModuleSelect={onModuleSelect}
      onBack={() => onModuleSelect('main')}
      onStrategyUpdate={setStrategy}
    />
  )
}
