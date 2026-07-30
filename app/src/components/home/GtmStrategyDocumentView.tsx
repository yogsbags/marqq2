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
  FileText, Download, ExternalLink, Loader2, ArrowLeft, Link2, CheckCircle2, Hash,
  Rocket, Target, CalendarClock, Check, ArrowUpRight, MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import type { GtmStrategyDocument, GtmStrategyDocSection } from '@/types/gtm'
import { GtmControlLoopPanel } from '@/components/home/GtmControlLoopPanel'
import { ChatHome } from '@/components/chat/ChatHome'

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
        ${(sub.bullets || []).length ? `<ul>${(sub.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
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
  const channelSections = useMemo(
    () => (strategy.sections || []).filter((s) => s.id !== 'executive_summary'),
    [strategy.sections],
  )
  const execSection = useMemo(
    () => (strategy.sections || []).find((s) => s.id === 'executive_summary'),
    [strategy.sections],
  )
  const [activeId, setActiveId] = useState<string>('__overview__')
  const [docsConnected, setDocsConnected] = useState(false)
  const [checkingDocs, setCheckingDocs] = useState(Boolean(workspaceId))
  const [connectingDocs, setConnectingDocs] = useState(false)
  const [exportingDocs, setExportingDocs] = useState(false)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'strategy' | 'activation'>('strategy')
  const [chatSectionId, setChatSectionId] = useState<string | null>(null)

  const active: GtmStrategyDocSection | undefined = useMemo(() => {
    if (activeId === '__overview__') return execSection
    return channelSections.find((s) => s.id === activeId) || channelSections[0]
  }, [activeId, channelSections, execSection])

  const channelLabel = (s: Pick<GtmStrategyDocSection, 'id' | 'title' | 'channel'>) => {
    const raw = String(s.channel || '').trim()
    if (raw.startsWith('#')) return raw.slice(1)
    if (raw) return raw.replace(/^#/, '')
    return String(s.id || s.title || '')
      .replace(/_/g, '-')
      .replace(/^#/, '')
  }

  const sectionTargetFor = (sectionId: string) =>
    (strategy.goalAlignment?.sectionTargets || []).find((target) => target.sectionId === sectionId)

  const northStarLabel = strategy.goalAlignment?.north_star_metric || 'North-star goal'
  const northStarTarget = strategy.goalAlignment?.quantified_target || strategy.goalAlignment?.target || 'Not quantified'
  const northStarTimeline = strategy.goalAlignment?.timeline_target
  const targetCount = (strategy.goalAlignment?.sectionTargets || []).filter((target) => target.metric || target.contribution).length
  const chatSection = chatSectionId ? channelSections.find((section) => section.id === chatSectionId) : null

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
            Back
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              <Check className="h-3 w-3" /> Strategy ready
            </span>
            <p className="truncate text-sm font-semibold">{strategy.title}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {channelSections.length} strategy sections · generated {strategy.generatedAt || 'just now'}
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

      {/* One source of truth for the goal, followed by the first post-generation decision. */}
      <div className="border-b border-border/50 bg-background px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-orange-500" /> North Star
            </p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">{northStarLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Target: <span className="font-medium text-foreground">{northStarTarget}</span>
              {northStarTimeline ? ` · by ${northStarTimeline}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-l border-border/60 pl-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sections mapped</p>
              <p className="mt-1 text-lg font-semibold">{targetCount}/{channelSections.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next decision</p>
              <p className="mt-1 text-sm font-semibold">Activate work</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
            onClick={() => setWorkspaceView('activation')}
          >
            <Rocket className="h-3.5 w-3.5" /> Activate strategy
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

      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setWorkspaceView('strategy')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              workspaceView === 'strategy' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Strategy document
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('activation')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              workspaceView === 'activation' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Rocket className="h-3.5 w-3.5" /> Activation & control loop
          </button>
        </div>
      </div>

      {workspaceView === 'activation' ? (
        <div className="space-y-5 bg-muted/10 p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
            <section className="rounded-xl border border-border/60 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><Rocket className="h-4 w-4 text-orange-500" /> Activation plan</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Start with draft work. Live publishing, outreach, and CRM changes remain approval-gated.
                  </p>
                </div>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Draft first</span>
              </div>
              <div className="mt-4 divide-y divide-border/50">
                {[
                  ['Review the North Star and section targets', true],
                  ['Connect the tools required by the first workstream', false],
                  ['Run the first agent output in draft mode', false],
                  ['Approve live execution and create a schedule', false],
                ].map(([label, complete], index) => (
                  <div key={String(label)} className="flex items-center gap-3 py-3 text-xs">
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', complete ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700' : 'border-border text-muted-foreground')}>
                      {complete ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" className="mt-3 w-full gap-1.5" onClick={() => toast.message('Choose a section to start its first draft workflow.') }>
                Choose first workstream <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </section>

            <section className="rounded-xl border border-border/60 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-orange-500" /> Section activation map</p>
                  <p className="mt-1 text-xs text-muted-foreground">Each section gets a measurable target before an agent is scheduled.</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{targetCount} mapped</span>
              </div>
              <div className="mt-4 max-h-72 divide-y divide-border/50 overflow-y-auto">
                {channelSections.map((section) => {
                  const target = sectionTargetFor(section.id)
                  return (
                    <div key={section.id} className="flex items-center gap-3 py-2.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">#{channelLabel(section)}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{target?.metric || target?.contribution || 'Target needs review'}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">Not started</span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
          <GtmControlLoopPanel moduleId={moduleId} goalAlignment={strategy.goalAlignment} />
        </div>
      ) : (
      <div className="grid min-h-[480px] md:grid-cols-[240px_1fr]">
        <aside className="border-r border-border/60 bg-[#3f0e40] text-white/90 dark:bg-[#1a0b1c]">
          <div className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Strategy workspace
            </p>
            <p className="mt-1 truncate text-xs font-medium text-white/85">
              {strategy.moduleName || 'GTM'}
            </p>
          </div>
          <nav className="space-y-0.5 px-2 pb-3">
            <button
              type="button"
              onClick={() => setActiveId('__overview__')}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] transition',
                activeId === '__overview__'
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">Executive summary</span>
            </button>
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Channels
            </p>
            {channelSections.map((s) => {
              const selected = activeId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActiveId(s.id)
                    if (chatSectionId) setChatSectionId(s.id)
                  }}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] transition',
                    selected ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{channelLabel(s)}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className={cn(
          'min-w-0 bg-background',
          chatSection ? 'grid lg:grid-cols-[minmax(0,1fr)_360px]' : 'flex flex-col',
        )}>
          <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2.5">
            {activeId === '__overview__' ? (
              <FileText className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Hash className="h-4 w-4 text-muted-foreground" />
            )}
            <h3 className="text-sm font-semibold">
              {activeId === '__overview__'
                ? 'Executive summary'
                : active
                  ? `#${channelLabel(active)}`
                  : 'Section'}
            </h3>
            {activeId !== '__overview__' && active?.title ? (
              <span className="truncate text-xs text-muted-foreground">{active.title}</span>
            ) : null}
            {activeId !== '__overview__' && active ? (
              <button
                type="button"
                className={cn(
                  'ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition',
                  chatSectionId === active.id
                    ? 'border-orange-500/40 bg-orange-500/10 text-orange-700'
                    : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={() => setChatSectionId((current) => (current === active.id ? null : active.id))}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {chatSectionId === active.id ? 'Close chat' : 'Ask this section'}
              </button>
            ) : null}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {activeId === '__overview__' ? (
              <>
                <p className="text-sm font-medium leading-6 text-foreground">
                  {strategy.executiveSummary || execSection?.summary || 'No executive summary yet.'}
                </p>
                {execSection?.body &&
                String(execSection.body).trim() !== String(strategy.executiveSummary || '').trim() ? (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                    {execSection.body}
                  </p>
                ) : null}
                {(execSection?.bullets || []).length > 0 ? (
                  <ul className="space-y-2">
                    {execSection!.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-6 text-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(strategy.nextSteps || []).length > 0 ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Next steps
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {strategy.nextSteps.map((n, i) => (
                        <li key={i} className="text-sm text-foreground">
                          · {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Open a channel in the sidebar to read each strategy section in order.
                </p>
              </>
            ) : active ? (
              <>
                {active.summary ? (
                  <p className="text-sm font-medium leading-6 text-foreground">{active.summary}</p>
                ) : null}
                {sectionTargetFor(active.id) ? (
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/[0.06] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-700">Contribution to North Star</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {sectionTargetFor(active.id)?.metric || sectionTargetFor(active.id)?.contribution}
                    </p>
                    {sectionTargetFor(active.id)?.byWhen ? <p className="mt-0.5 text-xs text-muted-foreground">Due by {sectionTargetFor(active.id)?.byWhen}</p> : null}
                  </div>
                ) : null}
                {active.body ? (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{active.body}</p>
                ) : null}
                {(active.bullets || []).length > 0 ? (
                  <ul className="space-y-2">
                    {active.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-6 text-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(active.subsections || []).map((sub, i) => (
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
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a channel to read that section.</p>
            )}
          </div>
          </div>
          {chatSection ? (
            <div className="min-h-[520px] border-t border-border/60 bg-muted/10 lg:border-l lg:border-t-0">
              <ChatHome
                hideHeader
                scope={`gtm:${moduleId}:${chatSection.id}`}
                contextPrompt={`You are working inside the GTM strategy section #${channelLabel(chatSection)} for ${strategy.moduleName || 'this company'}.

North Star: ${northStarLabel}
North Star target: ${String(northStarTarget)}${northStarTimeline ? ` by ${northStarTimeline}` : ''}
Section goal: ${sectionTargetFor(chatSection.id)?.metric || sectionTargetFor(chatSection.id)?.contribution || 'Review and improve this section'}
Section strategy summary: ${chatSection.summary || 'No summary available.'}

Answer questions using this section as the primary context. If the user requests a change, describe the proposed change and its impact on the North Star before executing anything.`}
              />
            </div>
          ) : null}
        </div>
      </div>
      )}
    </div>
  )
}
