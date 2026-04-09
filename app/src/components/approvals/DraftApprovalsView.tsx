import { useEffect, useState, useMemo } from 'react'
import {
  CheckCircle, XCircle, Edit3, Clock, Send, Filter,
  Linkedin, Globe, Mail, FileText, Image as ImageIcon, Film,
  ChevronDown, ChevronRight, RefreshCw, Eye,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { PageSectionHeader } from '@/components/layout/PageSectionHeader'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const BACKEND_URL = import.meta.env?.VITE_BACKEND_URL ?? 'http://localhost:3008'

type DraftStatus = 'pending' | 'approved' | 'rejected' | 'published'

interface DraftApproval {
  id: string
  workspaceId: string
  companyId: string | null
  agent: string
  type: 'social_post' | 'article' | 'email' | 'video' | 'image' | string
  platform: string | null
  content: string | null
  artifact: Record<string, unknown> | null
  scheduledFor: string | null
  status: DraftStatus
  createdAt: string
  approvedAt: string | null
  rejectedAt: string | null
  publishedAt: string | null
  approvalEmailSent: boolean
}

// ── Platform icon & colour ────────────────────────────────────────────────────

function TypeIcon({ type, platform }: { type: string; platform?: string | null }) {
  const p = (platform ?? '').toLowerCase()
  if (type === 'video') return <Film className="h-4 w-4 text-red-500" />
  if (type === 'image') return <ImageIcon className="h-4 w-4 text-violet-500" />
  if (type === 'email') return <Mail className="h-4 w-4 text-amber-500" />
  if (type === 'article') return <FileText className="h-4 w-4 text-emerald-500" />
  if (p.includes('linkedin')) return <Linkedin className="h-4 w-4 text-blue-600" />
  return <Globe className="h-4 w-4 text-orange-500" />
}

function statusBadge(status: DraftStatus) {
  switch (status) {
    case 'pending':
      return (
        <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      )
    case 'approved':
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
          <CheckCircle className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      )
    case 'rejected':
      return (
        <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800">
          <XCircle className="mr-1 h-3 w-3" />
          Rejected
        </Badge>
      )
    case 'published':
      return (
        <Badge className="bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800">
          <Send className="mr-1 h-3 w-3" />
          Published
        </Badge>
      )
  }
}

function formatRelative(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Single Draft Card ─────────────────────────────────────────────────────────

function DraftCard({
  draft,
  onAction,
}: {
  draft: DraftApproval
  onAction: (id: string, action: 'approve' | 'reject' | 'publish' | 'edit', editedContent?: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(draft.content ?? '')
  const [loading, setLoading] = useState<string | null>(null)

  const agentLabel = draft.agent
    ? draft.agent.charAt(0).toUpperCase() + draft.agent.slice(1)
    : 'Agent'

  const typeLabel = draft.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const act = async (action: 'approve' | 'reject' | 'publish' | 'edit') => {
    setLoading(action)
    try {
      await onAction(draft.id, action, action === 'edit' ? editedContent : undefined)
      if (action === 'edit') setEditing(false)
    } finally {
      setLoading(null)
    }
  }

  const preview = draft.content
    ? draft.content.slice(0, 200) + (draft.content.length > 200 ? '…' : '')
    : draft.artifact?.summary
      ? String(draft.artifact.summary).slice(0, 200)
      : 'No preview available'

  return (
    <Card className={cn(
      'rounded-[1.4rem] border-border/70 bg-background/90 transition-all duration-200',
      draft.status === 'pending' && 'border-amber-300/60 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]',
      draft.status === 'approved' && 'border-emerald-300/60',
      draft.status === 'rejected' && 'opacity-60',
    )}>
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/30">
              <TypeIcon type={draft.type} platform={draft.platform} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(draft.status)}
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {typeLabel}
                  {draft.platform ? ` · ${draft.platform}` : ''}
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {agentLabel} draft
              </p>
              <p className="text-[11px] text-muted-foreground">
                Created {formatRelative(draft.createdAt)}
                {draft.scheduledFor && ` · Scheduled for ${new Date(draft.scheduledFor).toLocaleString()}`}
                {draft.approvalEmailSent && (
                  <span className="ml-2 text-orange-500">· Approval email sent</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Preview / expanded content */}
        {!editing && (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            {!expanded ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{preview}</p>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {draft.content ?? JSON.stringify(draft.artifact ?? {}, null, 2)}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Edit area */}
        {editing && (
          <div className="space-y-2">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="min-h-[180px] text-sm font-mono"
              placeholder="Edit the draft content…"
            />
          </div>
        )}

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Expand/collapse */}
          {draft.content && draft.content.length > 200 && !editing && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setExpanded((p) => !p)}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
          )}

          {draft.status === 'pending' && (
            <>
              <Button
                size="sm"
                className="h-8 gap-1 bg-emerald-500 text-white hover:bg-emerald-600 px-3 text-xs"
                disabled={loading !== null}
                onClick={() => act('approve')}
              >
                <CheckCircle className="h-3 w-3" />
                {loading === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              {!editing ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 px-3 text-xs"
                  onClick={() => { setEditing(true); setExpanded(false) }}
                >
                  <Edit3 className="h-3 w-3" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-orange-500 text-white hover:bg-orange-600 px-3 text-xs"
                    disabled={loading !== null}
                    onClick={() => act('edit')}
                  >
                    {loading === 'edit' ? 'Saving…' : 'Save edits'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs"
                    onClick={() => { setEditing(false); setEditedContent(draft.content ?? '') }}
                  >
                    Cancel
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                disabled={loading !== null}
                onClick={() => act('reject')}
              >
                <XCircle className="h-3 w-3" />
                {loading === 'reject' ? 'Rejecting…' : 'Reject'}
              </Button>
            </>
          )}

          {draft.status === 'approved' && (
            <Button
              size="sm"
              className="h-8 gap-1 bg-blue-500 text-white hover:bg-blue-600 px-3 text-xs"
              disabled={loading !== null}
              onClick={() => act('publish')}
            >
              <Send className="h-3 w-3" />
              {loading === 'publish' ? 'Publishing…' : 'Publish now'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main View ─────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | DraftStatus

export function DraftApprovalsView() {
  const { activeWorkspace } = useWorkspace()
  const [drafts, setDrafts] = useState<DraftApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('pending')

  const fetchDrafts = async () => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    try {
      const url = `${BACKEND_URL}/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/draft-approvals`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load drafts')
      const data = await res.json()
      setDrafts(Array.isArray(data.drafts) ? data.drafts : [])
    } catch {
      toast.error('Could not load draft approvals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchDrafts() }, [activeWorkspace?.id])

  const handleAction = async (
    draftId: string,
    action: 'approve' | 'reject' | 'publish' | 'edit',
    editedContent?: string,
  ) => {
    if (!activeWorkspace?.id) return
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/draft-approvals/${draftId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, editedContent }),
        },
      )
      if (!res.ok) throw new Error('Action failed')
      const { draft } = await res.json()
      setDrafts((prev) => prev.map((d) => (d.id === draftId ? draft : d)))
      const labels: Record<string, string> = {
        approve: 'Draft approved ✓',
        reject: 'Draft rejected',
        publish: 'Published!',
        edit: 'Edits saved',
      }
      toast.success(labels[action] ?? 'Done')
    } catch {
      toast.error('Action failed — please try again')
    }
  }

  const counts = useMemo(() => {
    return {
      all: drafts.length,
      pending: drafts.filter((d) => d.status === 'pending').length,
      approved: drafts.filter((d) => d.status === 'approved').length,
      rejected: drafts.filter((d) => d.status === 'rejected').length,
      published: drafts.filter((d) => d.status === 'published').length,
    }
  }, [drafts])

  const visible = useMemo(
    () => (filter === 'all' ? drafts : drafts.filter((d) => d.status === filter)),
    [drafts, filter],
  )

  const filterTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'pending', label: `Pending${counts.pending > 0 ? ` (${counts.pending})` : ''}` },
    { key: 'approved', label: 'Approved' },
    { key: 'published', label: 'Published' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      <PageSectionHeader
        eyebrow="Content Approvals"
        title="Draft Queue"
        description="Review, edit, and approve content before it goes live. Approval emails are sent automatically when autopilot generates new drafts."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDrafts()}
            className="gap-1.5 rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Pending Review', value: counts.pending, color: 'text-amber-600' },
          { label: 'Approved', value: counts.approved, color: 'text-emerald-600' },
          { label: 'Published', value: counts.published, color: 'text-blue-600' },
          { label: 'Total Drafts', value: counts.all, color: 'text-foreground' },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-[1.2rem] border-border/70 bg-background/90">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        <Filter className="h-4 w-4 text-muted-foreground self-center" />
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === tab.key
                ? 'border-orange-300 bg-orange-500 text-white dark:border-orange-500'
                : 'border-border bg-background text-muted-foreground hover:border-orange-200 hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Draft list */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="rounded-[1.4rem] border-border/70">
              <CardContent className="p-5 space-y-3">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-12 w-full animate-pulse rounded bg-muted" />
                <div className="h-7 w-1/4 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="rounded-[1.6rem] border-dashed border-amber-200/80 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/10">
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm dark:bg-white/10">
              <Eye className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {filter === 'pending' ? 'No drafts awaiting approval' : `No ${filter} drafts`}
              </h2>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {filter === 'pending'
                  ? 'When an agent produces a social post, article, email, or video with autopilot enabled, it will appear here for your review before going live.'
                  : 'Switch to "Pending" to see drafts awaiting review.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((draft) => (
            <DraftCard key={draft.id} draft={draft} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  )
}
