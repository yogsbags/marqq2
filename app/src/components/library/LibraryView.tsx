import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageSectionHeader } from '@/components/layout/PageSectionHeader'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { markdownToRichText } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { loadLibraryArtifacts, deleteLibraryArtifact, type LibraryArtifactRow } from '@/lib/persistence'

const STORAGE_KEY = 'marqq_library_artifacts'
const LIBRARY_EVENT = 'marqq:library-updated'

type LibraryArtifactEntry = {
  id: string
  agent?: string
  companyId?: string | null
  artifact?: Record<string, unknown>
  savedAt: string
  _remote?: boolean   // true = came from Supabase
}

type LibraryFilter = 'all' | 'reports' | 'docs' | 'analysis'

function loadLocalEntries(): LibraryArtifactEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function rowToEntry(row: LibraryArtifactRow): LibraryArtifactEntry {
  return {
    id: row.id,
    agent: row.agent ?? undefined,
    companyId: row.company_id,
    artifact: row.artifact,
    savedAt: row.saved_at,
    _remote: true,
  }
}

function syncRemoteToLocal(rows: LibraryArtifactRow[]) {
  try {
    const entries = rows.map(rowToEntry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)))
    window.dispatchEvent(new CustomEvent(LIBRARY_EVENT))
  } catch {
    // ignore
  }
}

function emitLibraryUpdated() {
  window.dispatchEvent(new CustomEvent(LIBRARY_EVENT))
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractString(artifact: Record<string, unknown> | undefined, keys: string[]) {
  if (!artifact) return ''
  for (const key of keys) {
    const value = artifact[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function extractUrlCandidates(artifact: Record<string, unknown> | undefined) {
  if (!artifact) return []
  const keys = ['doc_url', 'file_url', 'url', 'report_url', 'link']
  const urls = keys
    .map((key) => artifact[key])
    .filter((value): value is string => typeof value === 'string' && /^https?:\/\//.test(value))
  return Array.from(new Set(urls))
}

function deriveType(entry: LibraryArtifactEntry): LibraryFilter {
  const artifact = entry.artifact || {}
  if (typeof artifact.report_title === 'string' || typeof artifact.recommended_subject === 'string') return 'reports'
  if (extractUrlCandidates(artifact).some((url) => url.includes('docs.google.com') || url.includes('drive.google.com'))) return 'docs'
  return 'analysis'
}

function deriveTitle(entry: LibraryArtifactEntry) {
  const artifact = entry.artifact || {}
  const explicit = extractString(artifact, ['report_title', 'title', 'headline', 'name', 'subject'])
  if (explicit) return explicit
  const type = deriveType(entry)
  const agent = entry.agent ? `${entry.agent.charAt(0).toUpperCase()}${entry.agent.slice(1)}` : 'Saved'
  if (type === 'reports') return `${agent} report`
  if (type === 'docs') return `${agent} document`
  return `${agent} artifact`
}

function derivePreview(entry: LibraryArtifactEntry) {
  const artifact = entry.artifact || {}
  const direct = extractString(artifact, [
    'summary',
    'why_it_matters',
    'diagnosis',
    'description',
    'overview',
    'report_html',
  ])
  if (direct) {
    return direct.includes('<') ? stripHtml(direct) : direct
  }
  const firstString = Object.values(artifact).find((value) => typeof value === 'string' && value.trim()) as string | undefined
  if (firstString) return firstString.includes('<') ? stripHtml(firstString) : firstString
  return 'Saved artifact ready to review.'
}

function formatAgentName(agent?: string) {
  if (!agent) return 'Unknown agent'
  return agent.charAt(0).toUpperCase() + agent.slice(1)
}

function formatSavedAt(savedAt: string) {
  try {
    return new Date(savedAt).toLocaleString()
  } catch {
    return savedAt
  }
}

function relativeSavedAt(savedAt: string) {
  const ts = new Date(savedAt).getTime()
  if (Number.isNaN(ts)) return 'Unknown'
  const diffMinutes = Math.floor((Date.now() - ts) / 60000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

function iconLabel(type: LibraryFilter) {
  switch (type) {
    case 'reports':
      return 'Report'
    case 'docs':
      return 'Doc'
    default:
      return 'Analysis'
  }
}

export function LibraryView() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id ?? null

  const [entries, setEntries] = useState<LibraryArtifactEntry[]>(() => loadLocalEntries())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [selectedEntry, setSelectedEntry] = useState<LibraryArtifactEntry | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: fetch from Supabase, sync to localStorage, then fall back to local if offline
  useEffect(() => {
    let cancelled = false
    loadLibraryArtifacts().then((rows) => {
      if (cancelled) return
      if (rows.length > 0) {
        syncRemoteToLocal(rows)
        setEntries(rows.map(rowToEntry))
      }
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Keep in sync with saves from AgentRunPanel (same tab or other tabs)
  useEffect(() => {
    const refresh = () => setEntries(loadLocalEntries())
    window.addEventListener('storage', refresh)
    window.addEventListener(LIBRARY_EVENT, refresh as EventListener)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(LIBRARY_EVENT, refresh as EventListener)
    }
  }, [])

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (workspaceId && entry.companyId !== workspaceId) return false
      if (workspaceId && entry.companyId == null) return false
      const type = deriveType(entry)
      if (filter !== 'all' && type !== filter) return false
      if (!q) return true
      const haystack = [
        deriveTitle(entry),
        derivePreview(entry),
        formatAgentName(entry.agent),
        JSON.stringify(entry.artifact || {}),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [entries, filter, query, workspaceId])

  const stats = useMemo(() => {
    const scoped = entries.filter((entry) => !workspaceId || entry.companyId === workspaceId)
    return {
      total: scoped.length,
      reports: scoped.filter((entry) => deriveType(entry) === 'reports').length,
      docs: scoped.filter((entry) => deriveType(entry) === 'docs').length,
    }
  }, [entries, workspaceId])

  const deleteEntry = (id: string) => {
    // Optimistic local removal
    const next = loadLocalEntries().filter((entry) => entry.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setEntries(next)
    if (selectedEntry?.id === id) setSelectedEntry(null)
    emitLibraryUpdated()
    toast.success('Removed from Library')
    // Remote removal (best-effort, no await)
    void deleteLibraryArtifact(id)
  }

  const copyPreview = (entry: LibraryArtifactEntry) => {
    navigator.clipboard.writeText(derivePreview(entry)).then(() => toast.success('Copied preview'))
  }

  const previewHtml = selectedEntry
    ? markdownToRichText(derivePreview(selectedEntry))
    : ''

  const filterTabs: Array<{ key: LibraryFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'reports', label: 'Reports' },
    { key: 'docs', label: 'Docs' },
    { key: 'analysis', label: 'Analysis' },
  ]

  return (
    <div className="space-y-6">
      <PageSectionHeader
        eyebrow="Asset Desk"
        title="Library"
        description="Keep the briefs, reports, and documents worth reusing instead of losing them inside old runs."
        meta={activeWorkspace?.name ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
            Workspace: {activeWorkspace.name}
          </p>
        ) : undefined}
        actions={(
          <div className="grid min-w-[220px] gap-2 rounded-[1.2rem] border border-border/70 bg-background/80 p-4 text-sm shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Saved</span>
              <span className="text-lg font-semibold text-foreground">{stats.total}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Reports</span>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{stats.reports}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Docs</span>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{stats.docs}</span>
            </div>
          </div>
        )}
      />

      <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reports, summaries, agents, or saved content"
                className="h-11 rounded-xl border-orange-200/70 bg-background pl-10 dark:border-orange-900/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    filter === tab.key
                      ? 'border-orange-300 bg-orange-500 text-white dark:border-orange-500'
                      : 'border-border bg-background text-muted-foreground hover:border-orange-200 hover:text-foreground dark:hover:border-orange-900/40',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="rounded-[1.4rem] border-border/70 bg-background/90">
              <CardContent className="space-y-4 p-5">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card className="rounded-[1.6rem] border-dashed border-orange-200/80 bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-950/10">
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-orange-500 shadow-sm dark:bg-white/10">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Nothing saved yet</h2>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Save any useful report, brief, or artifact from an agent run and it will appear here as a reusable library item.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEntries.map((entry) => {
            const type = deriveType(entry)
            const urls = extractUrlCandidates(entry.artifact)
            return (
              <Card
                key={entry.id}
                className="group rounded-[1.4rem] border-border/70 bg-background/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300/80 hover:shadow-[0_22px_40px_-30px_rgba(15,23,42,0.35)] dark:hover:border-orange-800/60"
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="border border-orange-200/80 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
                          {iconLabel(type)}
                        </Badge>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {relativeSavedAt(entry.savedAt)}
                        </span>
                      </div>
                      <div>
                        <h3 className="line-clamp-2 text-base font-semibold text-foreground">{deriveTitle(entry)}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Saved by {formatAgentName(entry.agent)}</p>
                      </div>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-orange-200/80 bg-orange-50 text-orange-500 dark:border-orange-900/40 dark:bg-orange-950/20">
                      {type === 'reports' ? <Sparkles className="h-4 w-4" /> : type === 'docs' ? <FolderOpen className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                  </div>

                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {derivePreview(entry)}
                  </p>

                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{formatSavedAt(entry.savedAt)}</span>
                    <span className="font-medium text-foreground">{urls.length > 0 ? `${urls.length} link${urls.length > 1 ? 's' : ''}` : 'No external link'}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-600" onClick={() => setSelectedEntry(entry)}>
                      Open
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyPreview(entry)}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    {urls[0] && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={urls[0]} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          Open link
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                      onClick={() => deleteEntry(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto rounded-[1.5rem] border-orange-200/70 bg-background dark:border-orange-900/40">
          {selectedEntry && (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="border border-orange-200/80 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
                        {iconLabel(deriveType(selectedEntry))}
                      </Badge>
                      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {formatAgentName(selectedEntry.agent)}
                      </span>
                    </div>
                    <DialogTitle className="text-2xl">{deriveTitle(selectedEntry)}</DialogTitle>
                    <DialogDescription>
                      Saved {formatSavedAt(selectedEntry.savedAt)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-[1.2rem] border border-orange-200/70 bg-orange-50/70 p-4 dark:border-orange-900/40 dark:bg-orange-950/15">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
                    Preview
                  </div>
                  <div
                    className="prose prose-sm mt-3 max-w-none text-foreground dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>

                {extractUrlCandidates(selectedEntry.artifact).length > 0 && (
                  <div className="rounded-[1.2rem] border border-border/70 bg-muted/30 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Linked assets
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {extractUrlCandidates(selectedEntry.artifact).map((url) => (
                        <Button key={url} size="sm" variant="outline" asChild>
                          <a href={url} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            {url.includes('docs.google.com') ? 'Open Google Doc' : 'Open link'}
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-[1.2rem] border border-border/70 bg-background/80 p-4 dark:bg-background/40">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Raw artifact
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-orange-200/70 bg-orange-50/60 p-4 text-xs leading-6 text-foreground dark:border-orange-900/40 dark:bg-orange-950/15">
                    {JSON.stringify(selectedEntry.artifact || {}, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
