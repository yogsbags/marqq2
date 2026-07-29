/**
 * GTM Strategy Document viewer — Slack-style channels per section,
 * with PDF / Doc export and optional Google Docs open.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { connectComposioConnector, formatConnectorError } from '@/lib/composio'
import { isConnectorActive, connectorLabel } from '@/lib/connectorMeta'
import {
  FileText, Download, ExternalLink, Loader2, ArrowLeft, Link2, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { GtmStrategyDocument, GtmStrategyDocSection } from '@/types/gtm'

type Props = {
  moduleId: string
  workspaceId?: string | null
  strategy: GtmStrategyDocument
  markdown?: string
  onBack?: () => void
  onStrategyUpdate?: (doc: GtmStrategyDocument) => void
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function displaySectionLabel(section?: Pick<GtmStrategyDocSection, 'title' | 'channel'> | null) {
  return String(section?.title || section?.channel || '').replace(/^#/, '')
}

function strategyToHtml(doc: GtmStrategyDocument) {
  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const sections = doc.sections || []
  const hasExecSection = sections.some((s) => s.id === 'executive_summary')
  const sectionsHtml = sections
    .map((s) => {
      const isExec = s.id === 'executive_summary'
      const lead =
        isExec && doc.executiveSummary
          ? doc.executiveSummary
          : s.summary
      const body =
        isExec && doc.executiveSummary && String(s.body || '').trim() === String(doc.executiveSummary).trim()
          ? ''
          : s.body
      const subs = (s.subsections || [])
        .map(
          (sub) => `
        <h3 style="font-size:15px;margin:18px 0 6px">${esc(sub.title)}</h3>
        ${sub.body ? `<p style="line-height:1.65;white-space:pre-wrap">${esc(sub.body)}</p>` : ''}
        ${(sub.bullets || []).length ? `<ul>${sub.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      `,
        )
        .join('')
      return `
      <section style="margin:32px 0;page-break-inside:avoid">
        <h2 style="font-size:18px;margin:0 0 8px">${esc(displaySectionLabel(s))}</h2>
        ${lead ? `<p style="color:#555;margin:0 0 12px">${esc(lead)}</p>` : ''}
        ${body ? `<p style="line-height:1.65;white-space:pre-wrap">${esc(body)}</p>` : ''}
        ${(s.bullets || []).length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        ${subs}
      </section>`
    })
    .join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(doc.title)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111;line-height:1.6}
  h1{font-size:28px;margin-bottom:8px}
  .meta{color:#666;font-size:12px;margin-bottom:28px}
</style></head><body>
<h1>${esc(doc.title)}</h1>
<p class="meta">Generated ${esc(doc.generatedAt || '')}</p>
${hasExecSection ? '' : `<p>${esc(doc.executiveSummary)}</p>`}
${sectionsHtml}
</body></html>`
}

export function GtmStrategyDocumentView({
  moduleId,
  workspaceId,
  strategy,
  markdown,
  onBack,
  onStrategyUpdate,
}: Props) {
  const { user } = useAuth()
  const [activeId, setActiveId] = useState(strategy.sections?.[0]?.id || 'executive_summary')
  const [docsConnected, setDocsConnected] = useState(false)
  const [checkingDocs, setCheckingDocs] = useState(Boolean(workspaceId))
  const [connectingDocs, setConnectingDocs] = useState(false)
  const [exportingDocs, setExportingDocs] = useState(false)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const active: GtmStrategyDocSection | undefined = useMemo(
    () => strategy.sections?.find((s) => s.id === activeId) || strategy.sections?.[0],
    [strategy.sections, activeId]
  )

  useEffect(() => {
    if (!workspaceId) {
      setCheckingDocs(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setCheckingDocs(true)
      try {
        const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
        const json = res.ok ? await res.json().catch(() => ({})) : {}
        // Export uses GOOGLEDOCS_* → googledocs toolkit. Drive-only is not enough.
        const connected = (json?.connectors ?? []).some(
          (c: { id?: string; connected?: boolean; status?: string }) =>
            c.id === 'google_docs' && isConnectorActive(c)
        )
        if (!cancelled) setDocsConnected(connected)
      } catch {
        if (!cancelled) setDocsConnected(false)
      } finally {
        if (!cancelled) setCheckingDocs(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const md = markdown || ''

  const exportPdf = () => {
    const html = strategyToHtml(strategy)
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      downloadBlob(`${strategy.title || 'gtm-strategy'}.html`, html, 'text/html;charset=utf-8')
      toast.message('Popup blocked — downloaded HTML instead. Open and Print → Save as PDF.')
      return
    }
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      w.focus()
      w.print()
    }, 300)
  }

  const exportDoc = () => {
    const html = strategyToHtml(strategy)
    // Word opens HTML saved as .doc
    downloadBlob(`${strategy.title || 'gtm-strategy'}.doc`, html, 'application/msword')
    toast.success('Downloaded .doc')
  }

  const exportMarkdown = () => {
    const sections = strategy.sections || []
    const hasExecSection = sections.some((s) => s.id === 'executive_summary')
    const content =
      md ||
      [
        `# ${strategy.title}`,
        '',
        ...(hasExecSection || !strategy.executiveSummary
          ? []
          : [strategy.executiveSummary, '']),
        ...sections.flatMap((s) => {
          const isExec = s.id === 'executive_summary'
          const lead =
            isExec && strategy.executiveSummary ? strategy.executiveSummary : s.summary
          const body =
            isExec &&
            strategy.executiveSummary &&
            String(s.body || '').trim() === String(strategy.executiveSummary).trim()
              ? ''
              : s.body
          return [
            `## ${displaySectionLabel(s)}`,
            '',
            ...(lead ? [lead, ''] : []),
            ...(body ? [body, ''] : []),
            ...(s.bullets || []).map((b) => `- ${b}`),
            '',
          ]
        }),
      ].join('\n')
    downloadBlob(`${strategy.title || 'gtm-strategy'}.md`, content, 'text/markdown;charset=utf-8')
    toast.success('Downloaded markdown')
  }

  const connectGoogleDocs = async () => {
    if (!workspaceId) {
      toast.error('Select a workspace first')
      return
    }
    setConnectingDocs(true)
    try {
      await connectComposioConnector({
        companyId: workspaceId,
        connectorId: 'google_docs',
        userEmail: user?.email,
        userName: user?.name ?? user?.email,
        onConnected: () => {
          setDocsConnected(true)
          toast.success('Google Docs connected')
        },
      })
      // Re-check after popup
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      const connected = (json?.connectors ?? []).some(
        (c: { id?: string; connected?: boolean; status?: string }) =>
          c.id === 'google_docs' && isConnectorActive(c)
      )
      setDocsConnected(connected)
    } catch (err) {
      toast.error(formatConnectorError(err, 'Could not connect Google Docs'))
    } finally {
      setConnectingDocs(false)
    }
  }

  const openInGoogleDocs = async () => {
    if (!docsConnected) {
      toast.message('Connect Google Docs first')
      return
    }
    setExportingDocs(true)
    try {
      const res = await fetch(`/api/gtm/modules/${moduleId}/strategy/google-docs`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || json.hint || 'Google Docs export failed')
      if (json.doc_url) {
        setDocUrl(json.doc_url)
        window.open(json.doc_url, '_blank', 'noopener,noreferrer')
        toast.success('Opened in Google Docs')
      } else {
        toast.success('Document created — check Google Drive')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google Docs export failed')
    } finally {
      setExportingDocs(false)
    }
  }

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/gtm/modules/${moduleId}/strategy`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Regenerate failed')
      onStrategyUpdate?.(json.strategy)
      toast.success('Strategy regenerated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Regenerate failed')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Directions
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{strategy.title}</p>
          <p className="text-[11px] text-muted-foreground">
            Full strategy · {strategy.sections?.length || 0} sections
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={exportPdf}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={exportDoc}>
            <Download className="h-3.5 w-3.5" /> Doc
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={exportMarkdown}>
            .md
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={regenerating}
            onClick={() => void regenerate()}
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Regenerate
          </Button>
        </div>
      </div>

      {/* Google Docs gate */}
      <div className="border-b border-border/50 bg-muted/10 px-4 py-2.5">
        {checkingDocs ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Google Docs…
          </p>
        ) : docsConnected ? (
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs text-muted-foreground">
              {connectorLabel('google_docs')} connected — open the live document anytime.
            </span>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 bg-[#1a73e8] hover:bg-[#1765cc] text-white text-xs"
              disabled={exportingDocs}
              onClick={() => void openInGoogleDocs()}
            >
              {exportingDocs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Open in Google Docs
            </Button>
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-600 underline">
                Last doc link
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs text-muted-foreground">
              Connect Google Docs before opening the strategy as a live Doc.
            </span>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs"
              disabled={connectingDocs || !workspaceId}
              onClick={() => void connectGoogleDocs()}
            >
              {connectingDocs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Connect Google Docs
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-[420px] md:grid-cols-[220px_1fr]">
        <aside className="border-r border-border/60 bg-muted/30">
          <div className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Sections
            </p>
            <p className="mt-1 truncate text-xs font-medium">{strategy.moduleName || 'GTM'}</p>
          </div>
          <nav className="space-y-0.5 px-2 pb-3">
            {(strategy.sections || []).map((s) => {
              const selected = (active?.id || activeId) === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] transition',
                    selected
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="truncate">{displaySectionLabel(s)}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col bg-background">
          <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{displaySectionLabel(active)}</h3>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {(() => {
              const isExec = active?.id === 'executive_summary'
              const lead =
                isExec && strategy.executiveSummary ? strategy.executiveSummary : active?.summary
              const body =
                isExec &&
                strategy.executiveSummary &&
                String(active?.body || '').trim() === String(strategy.executiveSummary).trim()
                  ? ''
                  : isExec && strategy.executiveSummary && active?.summary === strategy.executiveSummary
                    ? active?.body
                    : active?.body
              const showSectionSummary = !isExec && Boolean(active?.summary)
              return (
                <>
                  {(isExec ? lead : showSectionSummary ? active?.summary : null) && (
                    <p className="text-sm font-medium leading-6 text-foreground">
                      {isExec ? lead : active?.summary}
                    </p>
                  )}
                  {body && (
                    <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{body}</p>
                  )}
                </>
              )
            })()}
            {(active?.bullets || []).length > 0 && (
              <ul className="space-y-2">
                {active!.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-6 text-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {(active?.subsections || []).map((sub, i) => (
              <div key={`sub-${i}`} className="space-y-2 border-t border-border/40 pt-4">
                <h4 className="text-sm font-semibold">{sub.title}</h4>
                {sub.body ? (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{sub.body}</p>
                ) : null}
                {(sub.bullets || []).length > 0 ? (
                  <ul className="space-y-1.5">
                    {sub.bullets!.map((b, j) => (
                      <li key={j} className="flex gap-2 text-sm leading-6">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500/70" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {!active && (
              <p className="text-sm text-muted-foreground">Select a section to read it.</p>
            )}
          </div>

          {(strategy.nextSteps || []).length > 0 && activeId === strategy.sections?.[0]?.id && (
            <div className="border-t border-border/50 bg-muted/20 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Next steps</p>
              <ul className="mt-1.5 space-y-1">
                {strategy.nextSteps.map((n, i) => (
                  <li key={i} className="text-xs text-foreground">· {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
