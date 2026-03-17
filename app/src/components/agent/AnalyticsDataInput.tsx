import { useCallback, useRef, useState } from 'react'
import { Upload, Database, X, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export interface AnalyticsResult {
  fileName?: string
  rowCount?: number
  analyticsType?: string
  results?: Record<string, unknown>
  connectorId?: string
  connectorName?: string
  summary?: string   // human-readable summary injected into agent query
}

interface Connector {
  id: string
  name: string
  description: string
  status: string
}

interface AnalyticsDataInputProps {
  value: AnalyticsResult | null
  onChange: (v: AnalyticsResult | null) => void
}

export function AnalyticsDataInput({ value, onChange }: AnalyticsDataInputProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadConnectors = useCallback(async () => {
    if (connectors) return
    try {
      const r = await fetch('/api/analytics/connectors')
      const d = await r.json()
      setConnectors(d.connectors ?? [])
    } catch {
      setConnectors([])
    }
  }, [connectors])

  const handleToggle = () => {
    setExpanded(e => {
      if (!e) loadConnectors()
      return !e
    })
  }

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/analytics/upload', { method: 'POST', body: fd })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error((e as any).error || `Upload failed (${r.status})`)
      }
      const data = await r.json()
      const summary = buildSummary(data)
      onChange({ fileName: data.fileName, rowCount: data.rowCount, analyticsType: data.analyticsType, results: data.results, summary })
      setExpanded(false)
      toast.success(`Parsed ${data.rowCount} rows — ${data.analyticsType} analysis ready`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [onChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleConnector = (connector: Connector) => {
    onChange({
      connectorId: connector.id,
      connectorName: connector.name,
      summary: `Connected data source: ${connector.name}. ${connector.description}. Run analysis using this data source.`,
    })
    setExpanded(false)
    toast.success(`${connector.name} selected as data source`)
  }

  const clear = () => {
    onChange(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5" />
          {value ? (
            <span className="text-foreground font-medium">
              {value.fileName ?? value.connectorName ?? 'Data source connected'}
              {value.rowCount ? ` · ${value.rowCount} rows` : ''}
            </span>
          ) : (
            'Add campaign data (optional)'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); clear() }}
              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), clear())}
              className="cursor-pointer text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          {value ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* File upload zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border p-4 cursor-pointer hover:border-orange-400 transition-colors"
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              {loading ? 'Uploading…' : 'Drop or click to upload CSV / XLS / XLSX'}
            </p>
            <p className="text-[10px] text-muted-foreground/70">Campaign spend, funnel stages, conversion data — up to 10 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          {/* Connector list */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Or connect a data source</p>
            {connectors === null ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-1">
                {connectors.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleConnector(c)}
                    className="w-full flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground ml-1.5">— {c.description}</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                      {c.status === 'always_available' ? 'upload' : 'connect'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info note */}
          <div className="flex gap-1.5 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Data is parsed locally and sent only to your agent run. Not stored.</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Build a concise text summary of analytics results for agent context */
function buildSummary(data: {
  fileName?: string
  rowCount?: number
  analyticsType?: string
  results?: Record<string, unknown>
}): string {
  const lines: string[] = [
    `=== Campaign Analytics Data (${data.fileName}, ${data.rowCount} rows, type: ${data.analyticsType}) ===`,
  ]

  const r = data.results ?? {}

  if (r.roi && typeof r.roi === 'object') {
    lines.push('\n--- ROI Analysis ---')
    lines.push(JSON.stringify(r.roi, null, 2).slice(0, 3000))
  }
  if (r.funnel && typeof r.funnel === 'object') {
    lines.push('\n--- Funnel Analysis ---')
    lines.push(JSON.stringify(r.funnel, null, 2).slice(0, 2000))
  }
  if (r.attribution && typeof r.attribution === 'object') {
    lines.push('\n--- Attribution Analysis ---')
    lines.push(JSON.stringify(r.attribution, null, 2).slice(0, 2000))
  }

  lines.push('\nUse the above campaign performance data to provide specific, data-driven recommendations.')
  return lines.join('\n')
}
