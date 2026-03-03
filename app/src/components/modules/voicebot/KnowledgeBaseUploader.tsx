import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type KbFile = {
  id: string
  name: string
  mime: string
  size: number
  createdAt: string
}

export function KnowledgeBaseUploader() {
  const [files, setFiles] = useState<KbFile[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const resp = await fetch('/api/voicebot/kb/files')
    const json = await resp.json().catch(() => ({ files: [] }))
    if (!resp.ok) throw new Error(json?.error || 'Failed to load KB files')
    setFiles(Array.isArray(json?.files) ? json.files : [])
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  async function uploadSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setLoading(true)
    try {
      const form = new FormData()
      for (const f of selected) form.append('files', f)
      const resp = await fetch('/api/voicebot/kb/upload', { method: 'POST', body: form })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || json?.details || 'Upload failed')
      const rejected = Array.isArray(json?.rejected) ? json.rejected : []
      if (rejected.length) toast.error(`Some files rejected: ${rejected.map((r: any) => r?.name).filter(Boolean).join(', ')}`)
      toast.success('Knowledge base updated')
      await refresh()
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  async function removeFile(id: string) {
    setLoading(true)
    try {
      const resp = await fetch(`/api/voicebot/kb/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || 'Delete failed')
      toast.success('Removed')
      await refresh()
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Knowledge Base (Client Details)</CardTitle>
        <CardDescription className="text-sm">
          Upload txt/md/csv/json files. The voicebot uses these for client-specific answers (RAG).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-gray-600">
            Files: <span className="font-medium">{files.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input type="file" multiple accept=".txt,.md,.csv,.json,text/plain,text/markdown,application/json,text/csv" onChange={uploadSelected} />
            <Badge className="bg-gray-100 text-gray-800">Ephemeral (Railway filesystem)</Badge>
          </div>
        </div>

        {files.length ? (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 border rounded-md p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-xs text-gray-600">
                    {f.mime} • {(f.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeFile(f.id)} disabled={loading}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-700">No files uploaded yet.</div>
        )}

        {loading ? <div className="text-xs text-gray-600">Working…</div> : null}
      </CardContent>
    </Card>
  )
}

