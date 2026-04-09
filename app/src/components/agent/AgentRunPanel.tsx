import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Bot, CheckCircle, AlertCircle, Copy, ClipboardList, ClipboardCheck, ChevronDown, ChevronRight, Wrench, Brain, Zap, CheckCheck, XCircle, ArrowRight, Sparkles, Bookmark, Download, PanelTopClose, Radio, Target, PenLine, FileText, Users, Monitor, Briefcase, Mail, Search, CalendarDays, BadgeDollarSign, TrendingDown, BarChart2, FlaskConical, Send, Link2, Hash, Type, AlignLeft, Globe, Image as ImageIcon, Film } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRunResult, ToolCallEvent, ToolResultEvent, ContractTask } from '@/hooks/useAgentRun'
import { saveLibraryArtifact } from '@/lib/persistence'
import { markdownToRichText } from '@/lib/markdown'
import { useWorkspace } from '@/contexts/WorkspaceContext'

interface AgentRunPanelProps extends AgentRunResult {
  agentName: string
  label?: string
  companyId?: string | null
  onReset?: () => void
  onUseAsInput?: (text: string) => void
  renderArtifact?: (artifact: Record<string, unknown>) => React.ReactNode
  hideNextActions?: boolean
}

type ParsedResult = {
  title: string | null
  summary: string
  highlights: string[]
  sections: Array<{ heading: string; items: string[] }>
  actions: string[]
}

// Fix 8: strips only block-level syntax; preserves **bold**, *italic*, `code` spans
// ── VideoStatusCard ────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env?.VITE_BACKEND_URL ?? 'http://localhost:3008'

function downloadFromUrl(url: string, filename?: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  if (filename) anchor.download = filename
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

async function copyText(value: string, successMessage: string) {
  await navigator.clipboard.writeText(value)
  toast.success(successMessage)
}

function VideoStatusCard({ vid, v }: { vid: string; v: Record<string, unknown> }) {
  const [videoState, setVideoState] = useState<Record<string, unknown>>(v)
  const [polling, setPolling] = useState(false)

  const isFaceless = vid === 'generate_faceless_video'
  const provider = isFaceless ? 'veo' : 'heygen'
  const videoUrl = videoState.video_url ?? videoState.download_url
  const refId = videoState.operation_name ?? videoState.video_id
  const isDone = videoState.status === 'completed'
  const filename = isFaceless ? 'faceless-video.mp4' : 'avatar-video.mp4'

  async function checkStatus() {
    setPolling(true)
    try {
      const body = provider === 'veo'
        ? { provider: 'veo', operation_name: refId }
        : { provider: 'heygen', video_id: refId, company_id: videoState.company_id ?? null }
      const resp = await fetch(`${BACKEND_URL}/api/automations/video-poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      setVideoState(prev => ({ ...prev, ...data }))
    } catch {
      // non-fatal
    } finally {
      setPolling(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
        <Film className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          {isFaceless ? 'Faceless Video' : 'Avatar Video'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {isFaceless ? 'Veo 3.1' : 'HeyGen'}
        </span>
        {isDone && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3 w-3" /> Ready
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {!isDone && (
            <Button
              variant="ghost"
              size="sm"
              onClick={checkStatus}
              disabled={polling}
              aria-label="Check video render status"
              className="h-7 gap-1 px-2 text-xs text-orange-500 hover:text-orange-600"
            >
              {polling
                ? <span className="inline-block h-3 w-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                : <Zap className="h-3 w-3" />}
              {polling ? 'Checking…' : 'Check Status'}
            </Button>
          )}
          {Boolean(videoUrl) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => window.open(String(videoUrl), '_blank', 'noopener,noreferrer')}
              >
                Open
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => downloadFromUrl(String(videoUrl), filename)}
              >
                <Download className="h-3 w-3" />
                .mp4
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Video player or pending state */}
      <div className="p-4">
        {videoUrl ? (
          <video
            src={videoUrl as string}
            controls
            className="w-full rounded-lg bg-black aspect-video"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/50 bg-muted/20 py-10">
            <span className="inline-flex h-3 w-3 rounded-full bg-orange-400 animate-pulse" />
            <p className="text-sm text-muted-foreground">
              {String(videoState.status ?? 'queued')} — rendering in background
            </p>
            <p className="text-xs text-muted-foreground/60">Click "Check Status" to refresh</p>
          </div>
        )}
        {Boolean(refId) && (
          <div className="mt-2 text-[11px] text-muted-foreground/50 font-mono break-all">{String(refId)}</div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stripBlockMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Used only for sanitization / deduplication keys — full strip is correct here
function stripInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

type ArtifactEntry = [string, string | string[] | Record<string, unknown>[]]

// Contract keys at top level of the JSON contract block (mirrors useAgentRun.ts)
const CONTRACT_KEY_RE = /"(agent|run_id|artifact|tasks_created|contract|confidence)"\s*:/

function sanitizeDisplayText(text: string) {
  if (!text.trim()) return ''

  let cleaned = text
    // Internal test-mode prefix
    .replace(/^\[TEST MODE\][^\n]*\n?/i, '')
    // Hard delimiters
    .replace(/\n?---CONTRACT---[\s\S]*$/, '')
    .replace(/\n?Structured Output \(for downstream agents\)[\s\S]*$/i, '')
    .replace(/\n?Contract Block \(required\)[\s\S]*$/i, '')
    .replace(/\n?##\s*Output Contract[\s\S]*$/i, '')
    .replace(/\n?\*\*Output Contract\*\*[\s\S]*$/i, '')
    // JSON objects starting with any known contract key
    .replace(/\n?\{\s*"agent"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"run_id"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"artifact"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"tasks_created"\s*:[\s\S]*$/, '')
    // JSON code fences and stray HTML
    .replace(/```json[\s\S]*?```/gi, '')
    // Unclosed JSON fence (agent output cut off before closing ```)
    .replace(/```json[\s\S]*$/gi, '')
    // Bare --- separator followed by heading or JSON (common agent contract divider)
    .replace(/\n?---\s*\n[\s\S]*$/, '')
    .replace(/<br\s*\/?>/gi, '')
    .trim()

  // Fallback: strip any trailing JSON block whose keys look like a contract
  const lastBrace = cleaned.lastIndexOf('\n{')
  if (lastBrace > 0 && CONTRACT_KEY_RE.test(cleaned.slice(lastBrace))) {
    cleaned = cleaned.slice(0, lastBrace).trimEnd()
  }

  const trimmed = cleaned.trim()
  if (!trimmed) return ''

  // If the entire response is JSON (e.g. agent only returned a contract), extract readable fields
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary.trim()
      return ''
    }
  } catch {
    // keep prose
  }

  // Strip any residual internal system terms that should never reach the user
  const sanitized = trimmed
    .replace(/\bMKG\b/g, 'company context')
    .replace(/\bSOUL\b/g, '')
    .replace(/\b(run_id|company_id|task_type)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return sanitized
}

/** Strips internal technical details from error messages before showing to users. */
function sanitizeErrorMessage(msg: string): string {
  return msg
    // Remove model identifiers
    .replace(/\b(llama|gpt|qwen|deepseek|gemini|claude|mixtral)[-\w.]*\b/gi, 'AI model')
    .replace(/groq\s+model\s+"[^"]+"/gi, 'model')
    // Remove URLs
    .replace(/https?:\/\/\S+/gi, '[service]')
    // Soften HTTP status codes
    .replace(/\bHTTP\s+\d{3}[:\s]/gi, 'Service error: ')
    .replace(/Agent returned \d+/gi, 'Agent returned an error')
    // Remove raw API key mentions
    .replace(/\bAPI\s+key\b/gi, 'configuration')
    .trim()
}

function containsMarkdownTable(text: string) {
  if (!text.trim()) return false
  return /\|.+\|/.test(text) && /\n\|?\s*[-:]+\s*\|[-| :]*\n?/m.test(text)
}

function parseResult(text: string): ParsedResult {
  const normalized = sanitizeDisplayText(text)
  const titleMatch = normalized.match(/^\*\*(.+?)\*\*\s*/)
  const title = titleMatch ? stripInlineMarkdown(titleMatch[1]) : null
  const body = titleMatch ? normalized.slice(titleMatch[0].length).trim() : normalized
  const lines = body.split('\n').map((line: string) => line.trim()).filter(Boolean)

  const summaryParts: string[] = []
  const highlights: string[] = []
  const sections: Array<{ heading: string; items: string[] }> = []
  const actions: string[] = []
  const seenItems = new Set<string>()
  let currentSection: { heading: string; items: string[] } | null = null

  // Fix 8: use stripBlockMarkdown so **bold** and `code` survive into structured blocks
  const pushItem = (target: string[], item: string) => {
    const normalizedItem = stripBlockMarkdown(item)
    if (!normalizedItem) return
    // dedup key uses full strip so bold/plain variants don't duplicate
    const key = stripInlineMarkdown(normalizedItem).toLowerCase()
    if (seenItems.has(key)) return
    seenItems.add(key)
    target.push(normalizedItem)
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headingMatch) {
      currentSection = { heading: stripInlineMarkdown(headingMatch[1]), items: [] }
      sections.push(currentSection)
      continue
    }

    const labelHeadingMatch = line.match(/^([A-Za-z][A-Za-z0-9\s/&-]{2,40}):$/)
    if (labelHeadingMatch) {
      currentSection = { heading: stripInlineMarkdown(labelHeadingMatch[1]), items: [] }
      sections.push(currentSection)
      continue
    }

    const listMatch = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      const item = listMatch[1]
      const plain = stripInlineMarkdown(item)
      if (/^(next step|action|owner|test|monitor|ship|launch|review|priorit)/i.test(plain)) {
        pushItem(actions, item)
      }
      if (currentSection) pushItem(currentSection.items, item)
      else if (highlights.length < 4) pushItem(highlights, item)
      else summaryParts.push(stripBlockMarkdown(item))
      continue
    }

    const cleanedLine = stripBlockMarkdown(line)
    if (currentSection) pushItem(currentSection.items, cleanedLine)
    else summaryParts.push(cleanedLine)
  }

  const renderedItems = new Set([
    ...highlights.map((item) => stripInlineMarkdown(item).toLowerCase()),
    ...sections.flatMap((section) => section.items.map((item) => stripInlineMarkdown(item).toLowerCase())),
  ])

  const uniqueActions = actions.filter((item) => !renderedItems.has(stripInlineMarkdown(item).toLowerCase()))

  return {
    title,
    summary: summaryParts.join(' ').trim(),
    highlights,
    sections: sections.filter((section) => section.items.length > 0).slice(0, 4),
    actions: uniqueActions.slice(0, 4),
  }
}

// Keys that have dedicated renderer cards — exclude from generic grid to prevent duplication
const AUTOMATION_SUBKEYS = new Set([
  'generate_social_image',
  'generate_social_image_error',
  'generate_email_html',
  'generate_faceless_video',
  'generate_avatar_video',
  'create_seo_article',
  'doc_url',
  'file_url',
])

function flattenArtifactEntries(artifact: Record<string, unknown>): ArtifactEntry[] {
  return Object.entries(artifact)
    .filter(([key, value]) => !AUTOMATION_SUBKEYS.has(key) && value !== null && value !== undefined && value !== '')
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) return []
        // Arrays of objects → pass through as raw objects so the renderer can show mini-cards
        if (value[0] && typeof value[0] === 'object') {
          return [[key, value as Record<string, unknown>[]] as ArtifactEntry]
        }
        // Arrays of primitives → convert to strings
        const items = value
          .map((item) => {
            if (typeof item === 'string') return stripInlineMarkdown(item)
            if (typeof item === 'number' || typeof item === 'boolean') return String(item)
            return ''
          })
          .filter(Boolean)
        return items.length ? [[key, items] as ArtifactEntry] : []
      }
      if (typeof value === 'object') {
        // Single nested object → flatten to key: value strings
        const nestedEntries = Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean')
          .map(([nestedKey, nested]) => `${nestedKey.replace(/_/g, ' ')}: ${stripInlineMarkdown(String(nested))}`)
        return nestedEntries.length ? [[key, nestedEntries] as ArtifactEntry] : []
      }
      return [[key, stripInlineMarkdown(String(value))] as ArtifactEntry]
    })
}

// Fix 8: renders inline markdown (bold, italic, code) without wrapping block elements
function InlineMd({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="font-mono text-xs bg-muted px-0.5 rounded text-orange-600 dark:text-orange-400">
            {children}
          </code>
        ),
        a: ({ children }) => <>{children}</>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

// ── ContentPostCard ─────────────────────────────────────────────────────────
const PLATFORM_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  linkedin:            { label: 'LinkedIn',           bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-300' },
  linkedin_post:       { label: 'LinkedIn Post',      bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-300' },
  linkedin_carousel:   { label: 'LinkedIn Carousel',  bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-300' },
  linkedin_article:    { label: 'LinkedIn Article',   bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-300' },
  instagram:           { label: 'Instagram',           bg: 'bg-pink-50 dark:bg-pink-950/30',   text: 'text-pink-700 dark:text-pink-300' },
  facebook_instagram:  { label: 'Instagram / Facebook', bg: 'bg-pink-50 dark:bg-pink-950/30', text: 'text-pink-700 dark:text-pink-300' },
  facebook:            { label: 'Facebook',            bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300' },
  youtube:             { label: 'YouTube',             bg: 'bg-red-50 dark:bg-red-950/30',     text: 'text-red-700 dark:text-red-300' },
  twitter:             { label: 'X / Twitter',         bg: 'bg-slate-50 dark:bg-slate-900/30', text: 'text-slate-700 dark:text-slate-300' },
  website_blog:        { label: 'Website / Blog',      bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300' },
  blog_article:        { label: 'Blog Article',        bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300' },
  landing_page:        { label: 'Landing Page',        bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-300' },
}

function PlatformBadge({ value }: { value: string }) {
  const key = value.toLowerCase().replace(/\s+/g, '_')
  const style = PLATFORM_STYLES[key] ?? { label: value, bg: 'bg-muted', text: 'text-muted-foreground' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${style.bg} ${style.text}`}>
      <Globe className="h-3 w-3" />
      {style.label}
    </span>
  )
}

function normalizeDistributionTarget(value: string) {
  const key = value.toLowerCase().replace(/\s+/g, '_')
  if (key === 'linkedin') {
    return {
      platform: 'linkedin',
      label: 'LinkedIn',
      primaryLabel: 'Save LinkedIn draft',
      secondaryLabel: 'Schedule draft review',
      supportsSchedule: true,
    }
  }
  if (['facebook_instagram', 'instagram_facebook', 'facebook', 'instagram'].includes(key)) {
    return {
      platform: 'facebook_instagram',
      label: 'Facebook Page',
      primaryLabel: 'Save Facebook draft',
      secondaryLabel: 'Schedule draft review',
      supportsSchedule: true,
    }
  }
  if (['website_blog', 'blog_article', 'landing_page'].includes(key)) {
    return {
      platform: 'website_blog',
      label: 'Google Docs',
      primaryLabel: 'Save as draft doc',
      secondaryLabel: '',
      supportsSchedule: false,
    }
  }
  return null
}

function ContentDistributionActions({
  companyId,
  platform,
  payload,
  agentName,
  workspaceId,
}: {
  companyId?: string | null
  platform: string
  payload: Record<string, unknown>
  agentName?: string
  workspaceId?: string | null
}) {
  const target = normalizeDistributionTarget(platform)
  const [submitting, setSubmitting] = useState<'publish' | 'schedule' | 'draft-queue' | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState(() => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000)
    const timezoneOffset = nextHour.getTimezoneOffset() * 60 * 1000
    return new Date(nextHour.getTime() - timezoneOffset).toISOString().slice(0, 16)
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (!target || !companyId) return null

  const sendToDraftQueue = async () => {
    if (!workspaceId) {
      toast.error('No active workspace')
      return
    }
    setSubmitting('draft-queue')
    setErrorMessage(null)
    try {
      const content = typeof payload['post'] === 'string' ? payload['post'] : JSON.stringify(payload, null, 2)
      const resp = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/draft-approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: agentName ?? 'agent',
          type: 'social_post',
          platform: target.platform,
          content,
          artifact: payload,
          companyId,
        }),
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(typeof d?.error === 'string' ? d.error : 'Failed to queue draft')
      }
      toast.success('Added to draft approval queue')
      setSuccessMessage('Draft queued for approval')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to queue draft')
    } finally {
      setSubmitting(null)
    }
  }

  const openAccounts = () => {
    window.dispatchEvent(new CustomEvent('marqq:navigate', { detail: { moduleId: 'integrations' } }))
  }

  const runAction = async (mode: 'publish' | 'schedule') => {
    setSubmitting(mode)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const response = await fetch('/api/content-studio/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          mode,
          platform: target.platform,
          publishAt: mode === 'schedule' ? new Date(scheduleAt).toISOString() : undefined,
          payload,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Distribution failed')
      }
      setSuccessMessage(typeof data?.summary === 'string' ? data.summary : mode === 'schedule' ? 'Draft review scheduled' : 'Draft saved')
      if (mode === 'schedule') setScheduleOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Distribution failed')
    } finally {
      setSubmitting(null)
    }
  }

  const connectNeeded = errorMessage?.toLowerCase().includes('connect it in settings') || errorMessage?.toLowerCase().includes('no active')

  return (
    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Distribution
        </div>
        <PlatformBadge value={target.label} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-8 gap-1 px-3 text-xs"
          disabled={submitting !== null}
          onClick={() => { void runAction('publish') }}
        >
          <Send className="h-3 w-3" />
          {submitting === 'publish' ? 'Working…' : target.primaryLabel}
        </Button>
        {target.supportsSchedule ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-3 text-xs"
            disabled={submitting !== null}
            onClick={() => setScheduleOpen((current) => !current)}
          >
            <CalendarDays className="h-3 w-3" />
            {target.secondaryLabel}
          </Button>
        ) : null}
        {workspaceId ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-3 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950/30"
            disabled={submitting !== null}
            onClick={() => { void sendToDraftQueue() }}
            title="Add to approval queue — you'll review before publishing"
          >
            <ClipboardCheck className="h-3 w-3" />
            {submitting === 'draft-queue' ? 'Queuing…' : 'Queue for approval'}
          </Button>
        ) : null}
      </div>
      {scheduleOpen ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 p-3">
          <label className="text-xs font-medium text-foreground" htmlFor={`schedule-${target.platform}`}>
            Review time
          </label>
          <Input
            id={`schedule-${target.platform}`}
            type="datetime-local"
            value={scheduleAt}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setScheduleAt(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 gap-1 px-3 text-xs"
              disabled={submitting !== null || !scheduleAt}
              onClick={() => { void runAction('schedule') }}
            >
              <CalendarDays className="h-3 w-3" />
              {submitting === 'schedule' ? 'Scheduling…' : 'Schedule draft'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs"
              disabled={submitting !== null}
              onClick={() => setScheduleOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          {errorMessage}
          {connectNeeded ? (
            <button
              type="button"
              className="ml-1 font-semibold underline underline-offset-4"
              onClick={openAccounts}
            >
              Connect the account
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ContentPostCard({ artifact, companyId, agentName, workspaceId }: { artifact: Record<string, unknown>; companyId?: string | null; agentName?: string; workspaceId?: string | null }) {
  const post       = typeof artifact['post']       === 'string' ? artifact['post']       : ''
  const hook       = typeof artifact['hook']       === 'string' ? artifact['hook']       : ''
  const cta        = typeof artifact['cta']        === 'string' ? artifact['cta']        : ''
  const platform   = typeof artifact['platform']   === 'string' ? artifact['platform']   : ''
  const wordCount  = artifact['word_count'] != null ? String(artifact['word_count'])      : ''
  const hashtags   = Array.isArray(artifact['hashtags'])
    ? (artifact['hashtags'] as unknown[]).map(String)
    : typeof artifact['hashtags'] === 'string'
      ? artifact['hashtags'].split(/\s+/).filter(Boolean)
      : []
  const variations = Array.isArray(artifact['variations'])
    ? (artifact['variations'] as Record<string, unknown>[])
    : []

  const [showVariations, setShowVariations] = useState(false)

  const exportText = [
    post,
    hashtags.length ? '\n' + hashtags.join(' ') : '',
    cta ? '\nCTA: ' + cta : '',
  ].filter(Boolean).join('\n').trim()
  const distributionPayload = {
    title: hook || platform || 'Content Draft',
    post,
    cta,
    hashtags,
    platform,
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
        <Type className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Content Draft</span>
        {platform && <PlatformBadge value={platform} />}
        {wordCount && (
          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{wordCount} words</span>
        )}
        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => { void copyText(exportText, 'Post copied') }}
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              const platform_slug = platform.toLowerCase().replace(/\s+/g, '-') || 'post'
              downloadTextFile(`${platform_slug}-post.txt`, exportText)
            }}
          >
            <Download className="h-3 w-3" />
            .txt
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              const md = [
                platform ? `**Platform:** ${platform}` : '',
                wordCount ? `**Words:** ${wordCount}` : '',
                '',
                post,
                hashtags.length ? '\n---\n' + hashtags.join(' ') : '',
              ].filter(s => s !== undefined).join('\n').trim()
              const platform_slug = platform.toLowerCase().replace(/\s+/g, '-') || 'post'
              downloadTextFile(`${platform_slug}-post.md`, md, 'text/markdown;charset=utf-8')
            }}
          >
            <Download className="h-3 w-3" />
            .md
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              const platform_slug = platform.toLowerCase().replace(/\s+/g, '-') || 'post'
              const hashtagsHtml = hashtags.length
                ? `<p class="hashtags">${hashtags.map(t => `<span>${t}</span>`).join(' ')}</p>`
                : ''
              const ctaHtml = cta
                ? `<div class="cta"><strong>CTA:</strong> ${cta}</div>`
                : ''
              const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${platform ? platform + ' Post' : 'Content Draft'}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 680px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.7; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  .platform { background: #f0f0f0; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
  .words { font-size: 12px; color: #6b7280; margin-left: auto; }
  .body { white-space: pre-wrap; font-size: 15px; margin: 0 0 24px; }
  .hashtags { margin: 16px 0; }
  .hashtags span { display: inline-block; margin: 3px 4px 3px 0; background: #f3f4f6; border-radius: 20px; padding: 2px 10px; font-size: 13px; color: #374151; }
  .cta { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #166534; margin-top: 20px; }
</style>
</head>
<body>
<header>
  ${platform ? `<span class="platform">${platform}</span>` : ''}
  ${wordCount ? `<span class="words">${wordCount} words</span>` : ''}
</header>
<p class="body">${post.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
${hashtagsHtml}
${ctaHtml}
</body>
</html>`
              downloadTextFile(`${platform_slug}-post.html`, html, 'text/html;charset=utf-8')
            }}
          >
            <Download className="h-3 w-3" />
            .html
          </Button>
        </div>
      </div>

      {/* Post body */}
      <div className="px-4 py-4 space-y-4">
        {hook && hook !== post.split('\n')[0] && (
          <div className="rounded-lg border border-orange-200/60 bg-orange-50/60 dark:border-orange-800/40 dark:bg-orange-950/20 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-500 mb-1 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Hook
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{hook}</p>
          </div>
        )}

        <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-4">
          <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{post}</p>
        </div>

        <ContentDistributionActions
          companyId={companyId}
          platform={platform}
          payload={distributionPayload}
          agentName={agentName}
          workspaceId={workspaceId}
        />

        {hashtags.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" />
              Hashtags
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag, i) => (
                <button
                  key={`${tag}-${i}`}
                  type="button"
                  className="rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs text-muted-foreground hover:border-orange-300 hover:text-orange-600 transition-colors"
                  onClick={() => { void navigator.clipboard.writeText(tag).then(() => toast.success('Copied')) }}
                  title="Click to copy"
                >
                  {tag}
                </button>
              ))}
              {hashtags.length > 1 && (
                <button
                  type="button"
                  className="rounded-full border border-dashed border-border/50 bg-background px-2.5 py-0.5 text-xs text-muted-foreground hover:border-orange-300 hover:text-orange-600 transition-colors"
                  onClick={() => { void copyText(hashtags.join(' '), 'All hashtags copied') }}
                >
                  Copy all
                </button>
              )}
            </div>
          </div>
        )}

        {cta && (
          <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
              <Send className="h-3 w-3" />
              CTA
            </div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-foreground">{cta}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] shrink-0 text-emerald-600 hover:text-emerald-700"
                onClick={() => { void copyText(cta, 'CTA copied') }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {variations.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowVariations(p => !p)}
            >
              {showVariations ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {variations.length} variation{variations.length > 1 ? 's' : ''}
            </button>
            {showVariations && (
              <div className="space-y-2">
                {variations.map((v, i) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 text-sm">
                    {typeof v['hook'] === 'string' && (
                      <p className="font-medium text-foreground mb-1">{v['hook']}</p>
                    )}
                    {typeof v['cta'] === 'string' && (
                      <p className="text-xs text-muted-foreground mt-1">CTA: {v['cta']}</p>
                    )}
                    {typeof v['post'] === 'string' && !v['hook'] && (
                      <p className="text-foreground whitespace-pre-wrap">{v['post']}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── EmailDraftCard ───────────────────────────────────────────────────────────
function EmailDraftCard({ artifact }: { artifact: Record<string, unknown> }) {
  const subject     = typeof artifact['subject']      === 'string' ? artifact['subject']      : ''
  const previewText = typeof artifact['preview_text'] === 'string' ? artifact['preview_text'] : ''
  const body        = typeof artifact['body']         === 'string' ? artifact['body']         : ''
  const cta         = typeof artifact['cta']          === 'string' ? artifact['cta']          : ''
  const wordCount   = artifact['word_count'] != null  ? String(artifact['word_count'])         : ''

  const exportText = [
    subject  ? `Subject: ${subject}`           : '',
    previewText ? `Preview: ${previewText}`    : '',
    '',
    body,
    cta ? `\nCTA: ${cta}` : '',
  ].filter(Boolean).join('\n').trim()

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
        <Mail className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Email Draft</span>
        {wordCount && (
          <span className="ml-auto text-[11px] text-muted-foreground">{wordCount} words</span>
        )}
        <div className="flex items-center gap-1.5">
          <Button variant="outline"  size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => { void copyText(exportText, 'Email copied') }}>
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => downloadTextFile('email-draft.txt', exportText)}>
            <Download className="h-3 w-3" /> .txt
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => {
            const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject ? esc(subject) : 'Email Draft'}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.7; }
  .subject { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .preview { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
  .body { white-space: pre-wrap; font-size: 15px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
  .cta { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #166534; margin-top: 20px; }
</style>
</head>
<body>
${subject ? `<div class="subject">${esc(subject)}</div>` : ''}
${previewText ? `<div class="preview">${esc(previewText)}</div>` : ''}
<div class="body">${esc(body)}</div>
${cta ? `<div class="cta"><strong>CTA:</strong> ${esc(cta)}</div>` : ''}
</body>
</html>`
            downloadTextFile('email-draft.html', html, 'text/html;charset=utf-8')
          }}>
            <Download className="h-3 w-3" /> .html
          </Button>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        {subject && (
          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mt-0.5 w-14 shrink-0">Subject</div>
            <p className="text-sm font-medium text-foreground leading-snug">{subject}</p>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 ml-auto shrink-0" onClick={() => { void copyText(subject, 'Subject copied') }}>
              <Copy className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        )}
        {previewText && (
          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mt-0.5 w-14 shrink-0">Preview</div>
            <p className="text-xs text-muted-foreground leading-snug">{previewText}</p>
          </div>
        )}
        {body && (
          <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-4">
            <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{body}</p>
          </div>
        )}
        {cta && (
          <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 mb-1">CTA</div>
            <p className="text-sm text-foreground">{cta}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ArticleCard ──────────────────────────────────────────────────────────────
// Renders Maya's article schema: {title, meta_description, target_keyword, word_count, sections:[{heading,content}]}
function ArticleCard({ artifact }: { artifact: Record<string, unknown> }) {
  const [openSections, setOpenSections] = useState<Set<number>>(() => new Set([0, 1]))
  const title          = typeof artifact['title']            === 'string' ? artifact['title']            : ''
  const metaDesc       = typeof artifact['meta_description'] === 'string' ? artifact['meta_description'] : ''
  const targetKeyword  = typeof artifact['target_keyword']   === 'string' ? artifact['target_keyword']   : ''
  const wordCount      = artifact['word_count'] != null ? String(artifact['word_count']) : ''
  const sections       = Array.isArray(artifact['sections'])
    ? (artifact['sections'] as Record<string, unknown>[]).filter(s => s && typeof s === 'object')
    : []

  const toggleSection = (i: number) =>
    setOpenSections(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const exportMarkdown = [
    `# ${title}`,
    metaDesc ? `\n> ${metaDesc}` : '',
    targetKeyword ? `\n**Target keyword:** ${targetKeyword}` : '',
    '',
    ...sections.map(s => `## ${s['heading'] ?? ''}\n\n${s['content'] ?? ''}`),
  ].filter(s => s !== undefined).join('\n')

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
        <FileText className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Article</span>
        {wordCount && <span className="text-[11px] text-muted-foreground">{wordCount} words</span>}
        {sections.length > 0 && <span className="text-[11px] text-muted-foreground">{sections.length} sections</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => { void copyText(exportMarkdown, 'Article copied') }}>
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => downloadTextFile(`${title || 'article'}.md`, exportMarkdown)}>
            <Download className="h-3 w-3" /> .md
          </Button>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        {title && <h2 className="text-base font-bold text-foreground leading-snug">{title}</h2>}
        {metaDesc && (
          <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">Meta Description</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{metaDesc}</p>
          </div>
        )}
        {targetKeyword && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Keyword</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300">
              <Hash className="h-3 w-3" />{targetKeyword}
            </span>
          </div>
        )}
        {sections.length > 0 && (
          <div className="space-y-2 pt-1">
            {sections.map((section, i) => {
              const heading = typeof section['heading'] === 'string' ? section['heading'] : `Section ${i + 1}`
              const content = typeof section['content'] === 'string' ? section['content'] : ''
              const isOpen  = openSections.has(i)
              return (
                <div key={i} className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection(i)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors text-left gap-2"
                  >
                    <span className="text-sm font-semibold text-foreground">{heading}</span>
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>
                  {isOpen && content && (
                    <div className="px-3 py-3 border-t border-border/40 bg-background/60">
                      <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{content}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── StrategyCard ──────────────────────────────────────────────────────────────
// Renders generic strategy/plan schema: {strategy_overview, phases:[{...}], recommendations:[...]}
// Also handles analysis schema: {findings:[...], recommendations:[...], priority_actions:[...]}
function StrategyCard({ artifact }: { artifact: Record<string, unknown> }) {
  const overview      = typeof artifact['strategy_overview'] === 'string' ? artifact['strategy_overview'] : ''
  const phases        = Array.isArray(artifact['phases'])          ? artifact['phases']          as Record<string, unknown>[] : []
  const findings      = Array.isArray(artifact['findings'])        ? artifact['findings']        as unknown[]                 : []
  const recommendations = Array.isArray(artifact['recommendations']) ? artifact['recommendations'] as unknown[]               : []
  const priorityActions = Array.isArray(artifact['priority_actions']) ? artifact['priority_actions'] as unknown[] : []

  const KNOWN_KEYS = new Set(['strategy_overview','phases','findings','recommendations','priority_actions','doc_url','file_url'])
  // Scalar extra fields (string/number) not in known keys
  const extraEntries = Object.entries(artifact).filter(
    ([k, v]) => !KNOWN_KEYS.has(k) && !AUTOMATION_SUBKEYS.has(k) && v !== null && v !== undefined && v !== '' && !Array.isArray(v) && typeof v !== 'object'
  )
  // Extra arrays not in known keys (e.g. content_pillars, topic_clusters, target_audiences)
  const extraArrays = Object.entries(artifact).filter(
    ([k, v]) => !KNOWN_KEYS.has(k) && !AUTOMATION_SUBKEYS.has(k) && Array.isArray(v) && (v as unknown[]).length > 0
  ) as [string, unknown[]][]

  function renderItem(item: unknown, idx: number) {
    if (typeof item === 'string') return (
      <div key={idx} className="flex items-start gap-2">
        <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
        <p className="text-sm leading-6 text-foreground flex-1 whitespace-pre-wrap">{item}</p>
      </div>
    )
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const keys = Object.keys(obj).filter(k => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
      return (
        <div key={idx} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-3 space-y-1.5">
          {keys.map(k => (
            <div key={k} className="flex items-start gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mt-0.5 w-24 shrink-0">{k.replace(/_/g,' ')}</span>
              <p className="text-sm text-foreground flex-1 whitespace-pre-wrap leading-6">
                {Array.isArray(obj[k]) ? (obj[k] as unknown[]).join(', ') : String(obj[k])}
              </p>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
        <Bookmark className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          {phases.length > 0 ? 'Strategy & Plan' : findings.length > 0 ? 'Analysis & Findings' : 'Output'}
        </span>
      </div>
      <div className="px-4 py-4 space-y-4">
        {overview && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overview</div>
            <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{overview}</p>
          </div>
        )}
        {extraEntries.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {extraEntries.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{k.replace(/_/g,' ')}</div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-6">{String(v)}</p>
              </div>
            ))}
          </div>
        )}
        {extraArrays.map(([k, arr]) => (
          <div key={k} className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">{k.replace(/_/g,' ')}</div>
            <div className="space-y-2">{arr.map((item, i) => renderItem(item, i))}</div>
          </div>
        ))}
        {phases.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Phases</div>
            <div className="space-y-2">{phases.map((p, i) => renderItem(p, i))}</div>
          </div>
        )}
        {findings.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Findings</div>
            <div className="space-y-2">{findings.map((f, i) => renderItem(f, i))}</div>
          </div>
        )}
        {recommendations.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 mb-2">Recommendations</div>
            <div className="space-y-1.5">{recommendations.map((r, i) => renderItem(r, i))}</div>
          </div>
        )}
        {priorityActions.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 mb-2">Priority Actions</div>
            <div className="space-y-1.5">{priorityActions.map((a, i) => renderItem(a, i))}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CalendarCard ──────────────────────────────────────────────────────────────
// Renders social calendar schema: {calendar:[{platform,content,day,format,hashtags,cta}], content_themes:[], platform_strategy:{}}
function CalendarCard({ artifact }: { artifact: Record<string, unknown> }) {
  const calendar   = Array.isArray(artifact['calendar']) ? artifact['calendar'] as Record<string, unknown>[] : []
  const themes     = Array.isArray(artifact['content_themes']) ? artifact['content_themes'] as unknown[] : []
  const strategyObject = artifact['platform_strategy'] && typeof artifact['platform_strategy'] === 'object'
    ? artifact['platform_strategy'] as Record<string, unknown>
    : null

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
        <CalendarDays className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Content Calendar</span>
        <span className="text-[11px] text-muted-foreground">{calendar.length} posts</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() => {
            const text = calendar.map((e, i) =>
              `Post ${i+1} — ${e['platform'] ?? ''} ${e['day'] ?? e['week'] ?? ''}\n${e['content'] ?? e['caption'] ?? ''}\n${e['hashtags'] ? (Array.isArray(e['hashtags']) ? e['hashtags'].join(' ') : e['hashtags']) : ''}`
            ).join('\n\n')
            void copyText(text, 'Calendar copied')
          }}>
          <Copy className="h-3 w-3" /> Copy all
        </Button>
      </div>
      <div className="px-4 py-4 space-y-4">
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mr-1">Themes</span>
            {themes.map((t, i) => (
              <span key={i} className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">{String(t)}</span>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {calendar.map((entry, i) => {
            const platform = typeof entry['platform'] === 'string' ? entry['platform'] : ''
            const content  = typeof entry['content']  === 'string' ? entry['content']  : typeof entry['caption'] === 'string' ? entry['caption'] : ''
            const day      = typeof entry['day']      === 'string' ? entry['day']      : typeof entry['week'] === 'string' ? entry['week'] : ''
            const format   = typeof entry['format']   === 'string' ? entry['format']   : typeof entry['type'] === 'string' ? entry['type'] : ''
            const cta      = typeof entry['cta']      === 'string' ? entry['cta']      : ''
            const hashtags = Array.isArray(entry['hashtags']) ? (entry['hashtags'] as string[]).join(' ') :
                             typeof entry['hashtags'] === 'string' ? entry['hashtags'] : ''
            return (
              <div key={i} className="rounded-lg border border-border/50 bg-background/60 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border/30 flex-wrap">
                  <span className="text-[11px] font-bold text-muted-foreground">#{i+1}</span>
                  {platform && <PlatformBadge value={platform} />}
                  {day && <span className="text-[11px] text-muted-foreground">{day}</span>}
                  {format && <span className="text-[11px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{format}</span>}
                  <Button variant="ghost" size="sm" className="ml-auto h-6 px-1.5" onClick={() => { void copyText(content, 'Post copied') }}>
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
                {content && (
                  <div className="px-3 py-2.5">
                    <p className="text-sm leading-6 text-foreground whitespace-pre-wrap">{content}</p>
                    {hashtags && <p className="text-xs text-muted-foreground mt-1.5">{hashtags}</p>}
                    {cta && (
                      <div className="mt-2 text-xs rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 px-2 py-1.5 text-emerald-700 dark:text-emerald-300">CTA: {cta}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {strategyObject && Object.keys(strategyObject).length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Platform Strategy</div>
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(strategyObject).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">{k.replace(/_/g,' ')}</div>
                  <p className="text-xs text-foreground">{String(v)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ProposalCard ──────────────────────────────────────────────────────────────
// Renders proposal schema: {proposal_title, executive_summary, problem_statement, our_approach, deliverables, pricing_tiers:[{name,price_signal,whats_included}], next_steps}
function ProposalCard({ artifact }: { artifact: Record<string, unknown> }) {
  const title      = typeof artifact['proposal_title']      === 'string' ? artifact['proposal_title']      : ''
  const summary    = typeof artifact['executive_summary']    === 'string' ? artifact['executive_summary']    : ''
  const problem    = typeof artifact['problem_statement']    === 'string' ? artifact['problem_statement']    : ''
  const approach   = typeof artifact['our_approach']         === 'string' ? artifact['our_approach']         : ''
  const nextSteps  = typeof artifact['next_steps']           === 'string' ? artifact['next_steps']           : ''
  const deliverables  = Array.isArray(artifact['deliverables'])  ? artifact['deliverables']  as unknown[] : []
  const pricingTiers  = Array.isArray(artifact['pricing_tiers']) ? artifact['pricing_tiers'] as Record<string, unknown>[] : []

  const exportText = [
    title ? `# ${title}` : '',
    summary ? `\n## Executive Summary\n${summary}` : '',
    problem ? `\n## Problem Statement\n${problem}` : '',
    approach ? `\n## Our Approach\n${approach}` : '',
    deliverables.length ? `\n## Deliverables\n${deliverables.map(d => `- ${d}`).join('\n')}` : '',
    pricingTiers.length ? `\n## Pricing\n${pricingTiers.map(t => `**${t['name']}** — ${t['price_signal']}`).join('\n')}` : '',
    nextSteps ? `\n## Next Steps\n${nextSteps}` : '',
  ].filter(Boolean).join('\n')

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
        <Briefcase className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Proposal</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => { void copyText(exportText, 'Proposal copied') }}>
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => downloadTextFile(`${title || 'proposal'}.md`, exportText)}>
            <Download className="h-3 w-3" /> .md
          </Button>
        </div>
      </div>
      <div className="px-4 py-4 space-y-4">
        {title && <h2 className="text-base font-bold text-foreground">{title}</h2>}
        {summary && (
          <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Executive Summary</div>
            <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{summary}</p>
          </div>
        )}
        {(problem || approach) && (
          <div className="grid gap-3 md:grid-cols-2">
            {problem && (
              <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-3 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Problem</div>
                <p className="text-sm leading-6 text-foreground whitespace-pre-wrap">{problem}</p>
              </div>
            )}
            {approach && (
              <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-3 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Our Approach</div>
                <p className="text-sm leading-6 text-foreground whitespace-pre-wrap">{approach}</p>
              </div>
            )}
          </div>
        )}
        {deliverables.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Deliverables</div>
            <div className="space-y-1">
              {deliverables.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <p className="text-sm text-foreground leading-6">{String(d)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {pricingTiers.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Pricing Tiers</div>
            <div className="grid gap-2 md:grid-cols-3">
              {pricingTiers.map((tier, i) => (
                <div key={i} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-3 space-y-1">
                  <div className="text-sm font-bold text-foreground">{String(tier['name'] ?? '')}</div>
                  {Boolean(tier['price_signal']) && <div className="text-xs font-semibold text-orange-600">{String(tier['price_signal'])}</div>}
                  {Array.isArray(tier['whats_included']) && (
                    <div className="space-y-0.5 pt-1">
                      {(tier['whats_included'] as string[]).map((item, j) => (
                        <div key={j} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="text-orange-400 shrink-0 mt-0.5">·</span>{item}
                        </div>
                      ))}
                    </div>
                  )}
                  {typeof tier['whats_included'] === 'string' && (
                    <p className="text-xs text-muted-foreground pt-1">{tier['whats_included']}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {nextSteps && (
          <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 mb-1">Next Steps</div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{nextSteps}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeadsCard ─────────────────────────────────────────────────────────────────
// Renders leads schema: {leads:[{name,company,score,email,reason,...}], scoring:{...}}
function LeadsCard({ artifact }: { artifact: Record<string, unknown> }) {
  const leads   = Array.isArray(artifact['leads'])   ? artifact['leads']   as Record<string, unknown>[] : []
  const scoring = artifact['scoring'] && typeof artifact['scoring'] === 'object' ? artifact['scoring'] as Record<string, unknown> : null

  const PRIORITY_KEYS = ['name', 'company', 'score', 'email', 'title', 'reason', 'status', 'segment']
  function getScore(lead: Record<string, unknown>) {
    const s = lead['score'] ?? lead['ics_score'] ?? lead['lead_score']
    if (s == null) return null
    const n = typeof s === 'number' ? s : Number(s)
    return isNaN(n) ? String(s) : n
  }
  function scoreColor(score: number | string | null) {
    if (typeof score !== 'number') return 'text-muted-foreground'
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
    if (score >= 60) return 'text-orange-500'
    return 'text-red-500'
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
        <Users className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Leads</span>
        <span className="text-[11px] text-muted-foreground">{leads.length} leads</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() => {
            const csv = [
              Object.keys(leads[0] || {}).join(','),
              ...leads.map(l => Object.values(l).map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(','))
            ].join('\n')
            void copyText(csv, 'Leads copied as CSV')
          }}>
          <Copy className="h-3 w-3" /> CSV
        </Button>
      </div>
      <div className="divide-y divide-border/40">
        {leads.map((lead, i) => {
          const name    = typeof lead['name']    === 'string' ? lead['name']    : ''
          const company = typeof lead['company'] === 'string' ? lead['company'] : ''
          const email   = typeof lead['email']   === 'string' ? lead['email']   : ''
          const reason  = typeof lead['reason']  === 'string' ? lead['reason']  : typeof lead['notes'] === 'string' ? lead['notes'] : ''
          const score   = getScore(lead)
          const otherKeys = Object.keys(lead).filter(k => !PRIORITY_KEYS.includes(k) && lead[k] !== null && lead[k] !== undefined && lead[k] !== '')
          return (
            <div key={i} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{name || `Lead ${i+1}`}</span>
                {company && <span className="text-xs text-muted-foreground">{company}</span>}
                {score !== null && (
                  <span className={`ml-auto text-xs font-bold ${scoreColor(score)}`}>
                    {typeof score === 'number' ? `${score}/100` : score}
                  </span>
                )}
              </div>
              {email && <p className="text-xs text-muted-foreground">{email}</p>}
              {reason && <p className="text-xs text-muted-foreground leading-5 italic">{reason}</p>}
              {otherKeys.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {otherKeys.map(k => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold">{k.replace(/_/g,' ')}:</span> {String(lead[k])}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {scoring && Object.keys(scoring).length > 0 && (
        <div className="px-4 py-3 border-t border-border/40 bg-muted/10">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Scoring Summary</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(scoring).map(([k, v]) => (
              <div key={k} className="rounded-md bg-background border border-border/50 px-2.5 py-1.5 text-center">
                <div className="text-xs font-bold text-foreground">{String(v)}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{k.replace(/_/g,' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Next-action routing map ───────────────────────────────────────────────────
// Each agent knows what naturally comes next in the marketing workflow.
// label / description are shown on the CTA chip.

interface NextAction {
  moduleId: string
  agentName: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const AGENT_NEXT_ACTIONS: Record<string, NextAction[]> = {
  // Context layer
  veena: [
    { moduleId: 'market-signals',    agentName: 'isha',  label: 'Market Signals',   description: 'Isha scans trends that match your positioning',   icon: Radio },
    { moduleId: 'positioning',       agentName: 'neel',  label: 'Positioning',      description: 'Neel builds your differentiation story',          icon: Target },
    { moduleId: 'audience-profiles', agentName: 'isha',  label: 'Audience Profiles',description: 'Isha profiles your ICP segments in depth',         icon: Users },
  ],
  isha: [
    { moduleId: 'positioning',       agentName: 'neel',  label: 'Positioning',      description: 'Neel turns market signals into positioning',        icon: Target },
    { moduleId: 'messaging',         agentName: 'sam',   label: 'Messaging & Copy', description: 'Sam drafts copy anchored to what the market wants', icon: PenLine },
    { moduleId: 'ai-content',        agentName: 'zara',  label: 'AI Content',       description: 'Zara creates content from these insights',          icon: FileText },
  ],
  // Plan layer
  neel: [
    { moduleId: 'messaging',         agentName: 'sam',   label: 'Messaging & Copy', description: 'Sam writes copy variants from your positioning',    icon: PenLine },
    { moduleId: 'landing-pages',     agentName: 'riya',  label: 'Landing Pages',    description: 'Riya builds landing page copy from this',          icon: Monitor },
    { moduleId: 'sales-enablement',  agentName: 'sam',   label: 'Sales Enablement', description: 'Sam creates pitch decks and battle cards',          icon: Briefcase },
  ],
  sam: [
    { moduleId: 'ai-content',        agentName: 'zara',  label: 'AI Content',       description: 'Zara turns messaging into blog posts and scripts',  icon: FileText },
    { moduleId: 'email-sequence',    agentName: 'priya', label: 'Email Sequences',  description: 'Priya writes nurture sequences from this copy',      icon: Mail },
    { moduleId: 'landing-pages',     agentName: 'riya',  label: 'Landing Pages',    description: 'Riya converts the messaging into page copy',        icon: Monitor },
  ],
  riya: [
    { moduleId: 'seo-llmo',          agentName: 'kiran', label: 'SEO / LLMO',       description: 'Kiran optimises pages for search and LLMs',        icon: Search },
    { moduleId: 'paid-ads',          agentName: 'arjun', label: 'Paid Ads',         description: 'Arjun runs ads pointing to these pages',           icon: BadgeDollarSign },
    { moduleId: 'email-sequence',    agentName: 'priya', label: 'Email Sequences',  description: 'Priya writes outbound pointing here',               icon: Mail },
  ],
  // Collateral layer
  zara: [
    { moduleId: 'social-calendar',   agentName: 'zara',  label: 'Social Calendar',  description: 'Schedule this content across platforms',            icon: CalendarDays },
    { moduleId: 'email-sequence',    agentName: 'priya', label: 'Email Sequences',  description: 'Priya repurposes content into email campaigns',      icon: Mail },
    { moduleId: 'seo-llmo',          agentName: 'kiran', label: 'SEO / LLMO',       description: 'Kiran optimises this for search and LLM visibility', icon: Search },
  ],
  kiran: [
    { moduleId: 'ai-content',        agentName: 'zara',  label: 'AI Content',       description: 'Zara creates content for your target keywords',      icon: FileText },
    { moduleId: 'landing-pages',     agentName: 'riya',  label: 'Landing Pages',    description: 'Riya builds SEO-optimised landing pages',           icon: Monitor },
    { moduleId: 'performance-scorecard', agentName: 'dev', label: 'Performance', description: 'Dev tracks keyword and traffic improvements',         icon: BarChart2 },
  ],
  priya: [
    { moduleId: 'lead-intelligence', agentName: 'maya',  label: 'Lead Intelligence',description: 'Maya scores leads for the sequences you created',   icon: Target },
    { moduleId: 'cro',               agentName: 'tara',  label: 'CRO',              description: 'Tara A/B tests email subject lines and CTAs',       icon: FlaskConical },
    { moduleId: 'paid-ads',          agentName: 'arjun', label: 'Paid Ads',         description: 'Arjun runs retargeting to non-openers',             icon: BadgeDollarSign },
  ],
  // Execution layer
  maya: [
    { moduleId: 'lead-outreach',     agentName: 'sam',   label: 'Lead Outreach',    description: 'Sam crafts personalised outreach for these leads',   icon: Send },
    { moduleId: 'email-sequence',    agentName: 'priya', label: 'Email Sequences',  description: 'Priya builds nurture flows for qualified leads',      icon: Mail },
    { moduleId: 'sales-enablement',  agentName: 'sam',   label: 'Sales Enablement', description: 'Sam prepares collateral for your sales team',        icon: Briefcase },
  ],
  arjun: [
    { moduleId: 'budget-optimization', agentName: 'arjun', label: 'Budget Optimisation', description: 'Arjun optimises your spend across channels',    icon: TrendingDown },
    { moduleId: 'performance-scorecard', agentName: 'dev', label: 'Performance',  description: 'Dev tracks ROAS and conversion performance',          icon: BarChart2 },
    { moduleId: 'cro',               agentName: 'tara',  label: 'CRO',              description: 'Tara improves ad landing page conversion rates',     icon: FlaskConical },
  ],
  // Analytics layer
  tara: [
    { moduleId: 'budget-optimization', agentName: 'arjun', label: 'Budget Optimisation', description: 'Arjun reallocates spend based on this audit',   icon: TrendingDown },
    { moduleId: 'positioning',       agentName: 'neel',  label: 'Positioning',      description: 'Neel refreshes positioning based on audit findings', icon: Target },
    { moduleId: 'ai-content',        agentName: 'zara',  label: 'AI Content',       description: 'Zara fixes content gaps found in the audit',        icon: FileText },
  ],
  dev: [
    { moduleId: 'budget-optimization', agentName: 'arjun', label: 'Budget Optimisation', description: 'Arjun reallocates based on performance data',   icon: TrendingDown },
    { moduleId: 'cro',               agentName: 'tara',  label: 'CRO',              description: 'Tara improves conversion on underperforming funnels', icon: FlaskConical },
    { moduleId: 'channel-health',    agentName: 'dev',   label: 'Channel Health',   description: 'Dev audits each channel for quality and health',     icon: Link2 },
  ],
}

// Fallback for any agent not in the map
const DEFAULT_NEXT_ACTIONS: NextAction[] = [
  { moduleId: 'messaging',   agentName: 'sam',   label: 'Messaging & Copy', description: 'Sam turns this output into copy and messaging',     icon: PenLine },
  { moduleId: 'ai-content',  agentName: 'zara',  label: 'AI Content',      description: 'Zara creates content from what you just built',      icon: FileText },
  { moduleId: 'action-plan', agentName: 'neel',  label: 'Action Plan',     description: 'Neel turns insights into a prioritised plan',        icon: Zap },
]

function NextActionsSection({
  agentName,
  outputText,
  tasksCreated,
}: {
  agentName: string
  outputText: string
  tasksCreated: ContractTask[]
}) {
  // Build the list: dynamic suggestions from contract tasks first, then static map
  const staticActions = AGENT_NEXT_ACTIONS[agentName.toLowerCase()] ?? DEFAULT_NEXT_ACTIONS

  // Map contract tasks_created to next actions (agent_name must resolve to a known next action)
  const dynamicActions: NextAction[] = tasksCreated
    .filter(t => t.agent_name && t.description)
    .map(t => {
      // Find matching static action by agent name
      const allStatics = Object.values(AGENT_NEXT_ACTIONS).flat()
      const match = allStatics.find(a => a.agentName === t.agent_name.toLowerCase())
      if (!match) return null
      return { ...match } // use static description — contract descriptions may contain internal jargon
    })
    .filter((a): a is NextAction => a !== null)

  // Merge: dynamic first, then static, dedupe by moduleId, limit to 3
  const seen = new Set<string>()
  const actions: NextAction[] = []
  for (const a of [...dynamicActions, ...staticActions]) {
    if (!seen.has(a.moduleId)) {
      seen.add(a.moduleId)
      actions.push(a)
      if (actions.length === 3) break
    }
  }

  if (actions.length === 0) return null

  const navigate = (action: NextAction) => {
    // Write chained context for the target module to pick up
    if (outputText.trim()) {
      try {
        sessionStorage.setItem('marqq_agent_chain_input', outputText.trim())
      } catch { /* non-fatal */ }
    }
    // Write auto-run intent
    try {
      sessionStorage.setItem(
        'marqq_agent_module_autorun',
        JSON.stringify({ moduleId: action.moduleId, agentName: action.agentName })
      )
    } catch { /* non-fatal */ }
    // Navigate
    window.dispatchEvent(
      new CustomEvent('marqq:navigate', { detail: { moduleId: action.moduleId } })
    )
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        <ArrowRight className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">What's next?</span>
        <span className="text-[11px] text-muted-foreground">
          Output will be sent as context
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
        {actions.map((action) => (
          <button
            key={action.moduleId}
            type="button"
            onClick={() => navigate(action)}
            className="group flex flex-col gap-1 px-3 py-3 text-left hover:bg-orange-50/60 dark:hover:bg-orange-950/20 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <action.icon className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span className="text-xs font-semibold text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                {action.label}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all ml-auto" />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {action.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Humanises raw Composio action names: GMAIL_SEND_EMAIL → "Send Email (Gmail)" */
function humaniseToolName(name: string): string {
  const parts = name.split('_')
  // Heuristic: last segment often is the app, first segments are the verb
  // e.g. GMAIL_SEND_EMAIL → ["GMAIL","SEND","EMAIL"]
  // Try to detect app prefix (first part if well-known)
  const knownApps = new Set([
    'GMAIL','GOOGLE','SLACK','NOTION','HUBSPOT','SALESFORCE','AIRTABLE',
    'LINEAR','JIRA','GITHUB','GITLAB','STRIPE','SHOPIFY','TWITTER','LINKEDIN',
    'INSTAGRAM','FACEBOOK','YOUTUBE','DISCORD','ZOOM','CALENDAR','DRIVE',
  ])
  let appLabel = ''
  let actionParts = parts
  if (parts.length > 1 && knownApps.has(parts[0].toUpperCase())) {
    appLabel = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
    actionParts = parts.slice(1)
  }
  const action = actionParts
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
  return appLabel ? `${action} (${appLabel})` : action
}

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!thinking.trim()) return null

  const wordCount = thinking.trim().split(/\s+/).length
  const depth = wordCount < 50 ? 'quick' : wordCount < 200 ? 'moderate' : 'deep'
  const depthLabel = { quick: 'Quick reasoning', moderate: 'Moderate reasoning', deep: 'Deep reasoning' }[depth]

  return (
    <div className="rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-indigo-50/60 dark:border-violet-800/40 dark:from-violet-950/30 dark:to-indigo-950/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-100/40 dark:hover:bg-violet-900/20"
        aria-expanded={open}
      >
        <Brain className={`h-3.5 w-3.5 shrink-0 text-violet-500 ${isStreaming ? 'animate-pulse' : ''}`} />
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
          {isStreaming ? 'Reasoning…' : depthLabel}
        </span>
        {!isStreaming && (
          <span className="text-[11px] text-violet-500/70 dark:text-violet-500/50">
            {wordCount} words
          </span>
        )}
        {isStreaming && (
          <span className="flex gap-0.5 ml-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="inline-block h-1 w-1 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 text-violet-400">
          {open
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />
          }
        </div>
      </button>

      {open && (
        <div className="border-t border-violet-200/50 dark:border-violet-800/30 px-3 py-3">
          <p className="text-[11px] leading-relaxed text-violet-800/80 dark:text-violet-300/70 whitespace-pre-wrap font-mono">
            {thinking}
          </p>
        </div>
      )}
    </div>
  )
}

function ToolCallFeed({
  toolCalls,
  isStreaming,
}: {
  toolCalls: Array<{ call: ToolCallEvent; result: ToolResultEvent | null }>
  isStreaming?: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  if (toolCalls.length === 0) return null

  const doneCount = toolCalls.filter(tc => tc.result != null).length
  const failCount = toolCalls.filter(tc => tc.result != null && !tc.result.successful).length
  const allDone = doneCount === toolCalls.length

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          {allDone && !isStreaming ? 'Tools used' : 'Using tools…'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {allDone && !isStreaming && failCount === 0 && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCheck className="h-3 w-3" />
              {doneCount} {doneCount === 1 ? 'action' : 'actions'} succeeded
            </span>
          )}
          {allDone && !isStreaming && failCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              {doneCount - failCount}/{doneCount} succeeded
            </span>
          )}
          {isStreaming && !allDone && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Tool chips */}
      <div className="divide-y divide-border/30">
        {toolCalls.map(({ call, result }) => {
          const isExpanded = expandedId === call.id
          const isPending = result == null
          const isOk = result?.successful === true
          const isFail = result?.successful === false

          return (
            <div key={call.id} className="group">
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : call.id)}
              >
                {/* State icon */}
                <div className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${
                  isPending ? 'bg-amber-100 dark:bg-amber-900/40' :
                  isOk ? 'bg-emerald-100 dark:bg-emerald-900/40' :
                  'bg-red-100 dark:bg-red-900/40'
                }`}>
                  {isPending && <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-500" />}
                  {isOk && <CheckCircle className="h-2.5 w-2.5 text-emerald-500" />}
                  {isFail && <XCircle className="h-2.5 w-2.5 text-red-500" />}
                </div>

                {/* Tool name */}
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-foreground">
                    {humaniseToolName(call.name)}
                  </span>
                  {isPending && (
                    <span className="text-[11px] text-muted-foreground ml-1.5">executing…</span>
                  )}
                  {result?.preview && !isExpanded && (
                    <span className="text-[11px] text-muted-foreground ml-1.5 truncate">
                      · {result.preview.slice(0, 60)}{result.preview.length > 60 ? '…' : ''}
                    </span>
                  )}
                  {isFail && result?.error && !isExpanded && (
                    <span className="text-[11px] text-red-500 ml-1.5">· {result.error.slice(0, 60)}</span>
                  )}
                </div>

                {/* Expand chevron when there's detail */}
                {result != null && (result.preview || result.error) && (
                  <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && result != null && (
                <div className={`px-3 pb-3 pt-0 border-t border-border/20 ${
                  isOk ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : 'bg-red-50/40 dark:bg-red-950/10'
                }`}>
                  {result.preview && (() => {
                    // Try to show a humanised summary; fall back to truncated plain text
                    let displayPreview = result.preview
                    try {
                      const parsed = JSON.parse(result.preview)
                      if (parsed && typeof parsed === 'object') {
                        // Extract a human-readable field if present
                        const readable = parsed.message ?? parsed.summary ?? parsed.title ?? parsed.text ?? parsed.result ?? null
                        if (typeof readable === 'string' && readable.trim()) {
                          displayPreview = readable.trim()
                        } else {
                          displayPreview = isOk ? 'Action completed successfully.' : result.preview.slice(0, 200)
                        }
                      }
                    } catch { /* not JSON — use as-is but limit length */ }
                    return (
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {displayPreview.slice(0, 300)}{displayPreview.length > 300 ? '…' : ''}
                      </p>
                    )
                  })()}
                  {result.error && (
                    <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{sanitizeErrorMessage(result.error)}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function saveToLibrary(artifact: Record<string, unknown>, agent: string, companyId: string | null | undefined) {
  // Persist to Supabase (primary, survives re-login)
  const remoteId = await saveLibraryArtifact(artifact, agent, companyId)

  // Mirror to localStorage as a client-side cache so the library is instant on load
  try {
    const existing = JSON.parse(localStorage.getItem('marqq_library_artifacts') || '[]')
    const entry = {
      id: remoteId ?? crypto.randomUUID(),
      agent,
      companyId: companyId ?? null,
      artifact,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem('marqq_library_artifacts', JSON.stringify([entry, ...existing].slice(0, 50)))
    window.dispatchEvent(new CustomEvent('marqq:library-updated'))
  } catch {
    // ignore storage errors
  }
}

function AgentRunSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {/* Header line */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      {/* Content lines — mimics markdown paragraph output */}
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Section break */}
      <div className="space-y-2 pt-2">
        <Skeleton className="h-5 w-1/3 rounded" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      {/* Card-like block */}
      <div className="rounded-lg border p-3 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  )
}

export function AgentRunPanel({
  agentName,
  label,
  companyId,
  streaming,
  text,
  thinking,
  toolCalls,
  artifact,
  tasksCreated,
  confidence,
  error,
  handoffNotes,
  onReset,
  onUseAsInput,
  renderArtifact,
  hideNextActions = false,
}: AgentRunPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  // Fix 4: toggle to reveal full raw markdown when structured blocks are shown
  const [showFull, setShowFull] = useState(false)
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id ?? null

  useEffect(() => {
    if (streaming) {
      startTimeRef.current = Date.now()
      setElapsed(0)
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000))
      }, 1000)
      return () => clearInterval(id)
    }
  }, [streaming])

  // Reset showFull when a new run starts
  useEffect(() => {
    if (streaming) setShowFull(false)
  }, [streaming])

  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [text, streaming])

  const copyMarkdown = () => {
    const clean = sanitizeDisplayText(text)
    if (!clean) return
    navigator.clipboard.writeText(clean).then(() => toast.success('Copied as markdown'))
  }

  const copyPlainText = () => {
    const clean = sanitizeDisplayText(text)
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
    if (!clean) return
    navigator.clipboard.writeText(clean).then(() => toast.success('Copied as plain text'))
  }

  if (!streaming && !text && !thinking && !toolCalls.length && !artifact && !error) return null

  const displayText = sanitizeDisplayText(text)
  const shouldPreferMarkdown = containsMarkdownTable(displayText)
  const richTextHtml = displayText ? markdownToRichText(displayText) : ''
  const showMarkdownFallback = shouldPreferMarkdown || showFull
  const parsed = parseResult(displayText)
  const artifactEntries = artifact ? flattenArtifactEntries(artifact) : []
  // Only suppress text when we have real structured data (not just automation sub-results)
  const hasArtifactCards = artifactEntries.length > 0
  const hasStructuredBlocks = Boolean(
    parsed.title || parsed.summary || parsed.highlights.length || parsed.sections.length || parsed.actions.length,
  )
  const showInternalTraceDetails = streaming || Boolean(error)

  return (
    <Card className="w-full min-w-0 overflow-hidden border-orange-200/70 bg-gradient-to-br from-white via-orange-50/30 to-amber-50/40 shadow-sm dark:border-orange-900/40 dark:from-gray-950 dark:via-orange-950/10 dark:to-amber-950/10">
      {/* Fix 3: Two-row header — status row + actions row */}
      <CardHeader className="pb-2 space-y-2">
        {/* Row 1: Status */}
        <div className="flex items-center gap-2 min-w-0">
          <PanelTopClose className="h-4 w-4 text-orange-500 shrink-0" />
          <span className="truncate text-sm font-semibold">{label ?? agentName}</span>
          {streaming && (() => {
            const hasActiveToolCall = toolCalls.some(tc => tc.result == null)
            const isThinking = thinking && !text
            return hasActiveToolCall
              ? <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0"><Zap className="h-3 w-3 animate-pulse" /> Using tools</span>
              : isThinking
              ? <span className="flex items-center gap-1 text-xs text-violet-500 shrink-0"><Brain className="h-3 w-3 animate-pulse" /> Thinking</span>
              : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
          })()}
          {streaming && elapsed > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">· {elapsed}s</span>
          )}
          {!streaming && !error && text && <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />}
          {!streaming && !error && !text && toolCalls.length > 0 && <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />}
          {error && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
          {/* Agentic capability badges — shown once complete */}
        </div>

        {/* Row 2: Actions — visible when not streaming and there is output or an error */}
        {!streaming && (text || error) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Confidence badge — only shown when the agent actively calibrates (not the 0.75 default) */}
            {!error && confidence !== null && confidence !== 0.75 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs cursor-help">
                      {Math.round(confidence * 100)}% confidence
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-[200px]">How confident the agent is in this output based on available data quality</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Fix 7 + 11: labeled copy buttons with aria-labels */}
            {!error && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyMarkdown}
                  aria-label="Copy as markdown"
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyPlainText}
                  aria-label="Copy as plain text"
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <ClipboardList className="h-3 w-3" />
                  Plain
                </Button>
                {onUseAsInput && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUseAsInput(sanitizeDisplayText(text))}
                    title="Use this output as input for the next agent"
                    aria-label="Use this output as input for the next agent"
                    className="h-7 px-2 text-xs gap-1 text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                  >
                    ↓ Use as input
                  </Button>
                )}
                {artifact && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void saveToLibrary(artifact, agentName, companyId)
                      toast.success('Saved to Library')
                    }}
                    aria-label="Save artifact to library"
                    title="Save to Library"
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <Bookmark className="h-3 w-3" />
                    Save
                  </Button>
                )}
              </>
            )}
            {/* Fix 5: Retry on error / Reset on success — at the end of the row */}
            {onReset && (
              <Button
                variant={error ? 'default' : 'ghost'}
                size="sm"
                onClick={onReset}
                className={`h-7 px-2 text-xs ${!error ? 'ml-auto' : ''}`}
              >
                {error ? 'Retry' : 'Reset'}
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3" aria-live="polite" aria-atomic="false">
        {/* Error block — message sanitized before display */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20 p-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{sanitizeErrorMessage(error)}</p>
          </div>
        )}

        {/* Reasoning block — collapsible; live bounce when still streaming */}
        {showInternalTraceDetails && thinking && <ThinkingBlock thinking={thinking} isStreaming={streaming && !text} />}

        {showInternalTraceDetails && toolCalls.length > 0 && <ToolCallFeed toolCalls={toolCalls} isStreaming={streaming} />}

        {/* Skeleton: only show when no agentic activity yet and no text */}
        {streaming && !displayText && !thinking && toolCalls.length === 0 && (
          <AgentRunSkeleton />
        )}

        {/* Structured blocks — only shown when there are no artifact cards (artifact = primary output) */}
        {!shouldPreferMarkdown && !hasArtifactCards && (parsed.title || parsed.summary) && (
          <div className="rounded-2xl border border-orange-200/70 bg-white/90 p-4 dark:border-orange-900/30 dark:bg-gray-950/60">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500" aria-hidden="true">Agent Brief</div>
            {parsed.title ? <div className="mt-1 text-base font-semibold text-foreground">{parsed.title}</div> : null}
            {parsed.summary ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{parsed.summary}</p> : null}
          </div>
        )}

        {!shouldPreferMarkdown && !hasArtifactCards && parsed.highlights.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {parsed.highlights.map((item, index) => (
              <div key={`${stripInlineMarkdown(item)}-${index}`} className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-500" aria-hidden="true">
                  Key Insight {index + 1}
                </div>
                <div className="mt-1 text-sm leading-6 text-foreground">
                  <InlineMd>{item}</InlineMd>
                </div>
              </div>
            ))}
          </div>
        )}

        {!shouldPreferMarkdown && !hasArtifactCards && parsed.sections.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {parsed.sections.map((section) => (
              <div key={section.heading} className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground" aria-hidden="true">
                  {section.heading}
                </div>
                <div className="mt-2 space-y-2">
                  {section.items.slice(0, 4).map((item, index) => (
                    <div key={`${section.heading}-${index}`} className="flex items-start gap-2 text-sm">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                      <div className="leading-6 text-foreground">
                        <InlineMd>{item}</InlineMd>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!shouldPreferMarkdown && !hasArtifactCards && parsed.actions.length > 0 && (
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400" aria-hidden="true">
              Recommended Actions
            </div>
            <div className="mt-2 space-y-2">
              {parsed.actions.map((item, index) => (
                <div key={`${stripInlineMarkdown(item)}-${index}`} className="flex items-start gap-2 text-sm text-foreground">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white dark:bg-emerald-500">
                    {index + 1}
                  </div>
                  <div className="leading-6">
                    <InlineMd>{item}</InlineMd>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* "Show full output" only relevant for text-only outputs (artifact cards are the primary output) */}
        {!showMarkdownFallback && !hasArtifactCards && hasStructuredBlocks && displayText && !streaming && (
          <button
            onClick={() => setShowFull((p) => !p)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors min-h-[44px] px-1 py-2 inline-flex items-center"
          >
            {showFull ? 'Hide raw output' : 'Show raw output'}
          </button>
        )}

        {/* Artifact renderers — type-aware */}
        {artifact && !renderArtifact && (() => {
          // Social/text post
          if (typeof artifact['post'] === 'string' && artifact['post']) {
            return <ContentPostCard artifact={artifact} companyId={companyId} agentName={agentName} workspaceId={workspaceId} />
          }
          // Email draft (body without html — html is handled below)
          if (typeof artifact['body'] === 'string' && artifact['body'] && !artifact['generate_email_html']) {
            return <EmailDraftCard artifact={artifact} />
          }
          // Article: title + sections array with {heading, content}
          if (typeof artifact['title'] === 'string' && artifact['title'] &&
              Array.isArray(artifact['sections']) && artifact['sections'].length > 0 &&
              artifact['sections'][0] && typeof artifact['sections'][0] === 'object' &&
              ('heading' in (artifact['sections'][0] as object) || 'content' in (artifact['sections'][0] as object))) {
            return <ArticleCard artifact={artifact} />
          }
          // Proposal: proposal_title field
          if (typeof artifact['proposal_title'] === 'string' && artifact['proposal_title']) {
            return <ProposalCard artifact={artifact} />
          }
          // Social calendar: calendar array
          if (Array.isArray(artifact['calendar']) && artifact['calendar'].length > 0) {
            return <CalendarCard artifact={artifact} />
          }
          // Leads: leads array of objects
          if (Array.isArray(artifact['leads']) && artifact['leads'].length > 0 &&
              artifact['leads'][0] && typeof artifact['leads'][0] === 'object') {
            return <LeadsCard artifact={artifact} />
          }
          // Strategy/plan/analysis: strategy_overview prose OR phases/findings arrays
          if (typeof artifact['strategy_overview'] === 'string' && artifact['strategy_overview']) {
            return <StrategyCard artifact={artifact} />
          }
          if ((Array.isArray(artifact['phases']) && artifact['phases'].length > 0) ||
              (Array.isArray(artifact['findings']) && artifact['findings'].length > 0)) {
            return <StrategyCard artifact={artifact} />
          }
          // Generic fallback — full-width flex column, handles strings, string arrays, and object arrays
          if (artifactEntries.length > 0) {
            return (
              <div className="flex flex-col gap-3">
                {artifactEntries.map(([key, value]) => {
                  const isObjArray = Array.isArray(value) && value.length > 0 && typeof value[0] === 'object'
                  const isStrArray = Array.isArray(value) && !isObjArray
                  const isScalar   = !Array.isArray(value)
                  return (
                    <div key={key} className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" aria-hidden="true">
                          {key.replace(/_/g, ' ')}
                        </div>
                        {isScalar && (
                          <button
                            type="button"
                            onClick={() => { void copyText(String(value), `${key.replace(/_/g, ' ')} copied`) }}
                            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            aria-label={`Copy ${key}`}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-sm leading-6 text-foreground break-words">
                        {isStrArray ? (
                          <div className="space-y-1.5">
                            {(value as string[]).map((item, index) => (
                              <div key={`${key}-${index}`} className="flex items-start gap-2">
                                <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                                <div className="flex-1 whitespace-pre-wrap">{item}</div>
                              </div>
                            ))}
                          </div>
                        ) : isObjArray ? (
                          <div className="space-y-2">
                            {(value as Record<string, unknown>[]).map((obj, index) => {
                              const objKeys = Object.keys(obj).filter(k => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
                              return (
                                <div key={index} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 space-y-1.5">
                                  {objKeys.map(k => (
                                    <div key={k} className="flex items-start gap-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mt-0.5 w-20 shrink-0">{k.replace(/_/g,' ')}</span>
                                      <p className="text-sm text-foreground flex-1 whitespace-pre-wrap leading-6">
                                        {Array.isArray(obj[k]) ? (obj[k] as unknown[]).join(', ') : String(obj[k])}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="break-words whitespace-pre-wrap">{String(value)}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
          return null
        })()}

        {/* Automation result cards — image, email HTML, video status */}
        {artifact && (() => {
          const cards: React.ReactNode[] = []
          const img = artifact['generate_social_image'] as Record<string, unknown> | undefined
          if (img?.cdn_url || img?.image_url) {
            const imgSrc = (img.cdn_url ?? img.image_url) as string
            const imgPlatform = typeof img.platform === 'string' ? img.platform : ''
            const imgAspect  = typeof img.aspect_ratio === 'string' ? img.aspect_ratio : ''
            const imgModel   = typeof img.model === 'string' ? img.model : ''
            const imgSlug    = imgPlatform.toLowerCase().replace(/\s+/g, '-') || 'social'
            cards.push(
              <div key="social-image" className="rounded-xl border border-border/70 bg-background/90 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20 flex-wrap">
                  <ImageIcon className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Generated Image</span>
                  {imgPlatform && <PlatformBadge value={imgPlatform} />}
                  {imgAspect && (
                    <span className="text-[11px] text-muted-foreground">{imgAspect}</span>
                  )}
                  {imgModel && (
                    <span className="text-[11px] text-muted-foreground/60">{imgModel}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => window.open(imgSrc, '_blank', 'noopener,noreferrer')}
                    >
                      Preview
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => downloadFromUrl(imgSrc, `${imgSlug}-image.png`)}
                    >
                      <Download className="h-3 w-3" />
                      .png
                    </Button>
                  </div>
                </div>
                {/* Image */}
                <div className="p-4">
                  <img
                    src={imgSrc}
                    alt={imgPlatform ? `${imgPlatform} image` : 'Generated social image'}
                    className="rounded-lg w-full object-contain max-h-[480px] bg-muted/10"
                  />
                </div>
              </div>
            )
          }
          const imgErr = artifact['generate_social_image_error']
          if (imgErr) {
            cards.push(
              <div key="social-image-err" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Image generation failed: {String(imgErr)}
              </div>
            )
          }
          const email = artifact['generate_email_html'] as Record<string, unknown> | undefined
          if (email?.html) {
            const emailHtml = String(email.html)
            const emailSubject = email.subject ? String(email.subject) : 'Campaign Email'
            cards.push(
              <div key="email-html" className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" aria-hidden="true">
                    Email Newsletter{email.subject ? ` — ${email.subject}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => { void copyText(emailHtml, 'Email HTML copied') }}
                    >
                      <Copy className="h-3 w-3" />
                      Copy HTML
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => downloadTextFile('riya-email.html', emailHtml, 'text/html;charset=utf-8')}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Subject: <span className="font-medium text-foreground">{emailSubject}</span>
                </div>
                <iframe
                  srcDoc={emailHtml}
                  className="w-full rounded-lg border border-border/40"
                  style={{ height: '480px' }}
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              </div>
            )
          }
          const seo = artifact['create_seo_article'] as Record<string, unknown> | undefined
          if (seo?.html) {
            const articleHtml = String(seo.html)
            const articleTitle = seo.title ? String(seo.title) : 'SEO Article'
            const articleSlug = seo.slug ? String(seo.slug) : ''
            const articleMeta = seo.meta_description ? String(seo.meta_description) : ''
            cards.push(
              <div key="seo-article" className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" aria-hidden="true">
                    Blog Article{seo.title ? ` — ${seo.title}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => { void copyText(articleHtml, 'Article HTML copied') }}
                    >
                      <Copy className="h-3 w-3" />
                      Copy HTML
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => downloadTextFile(`${articleSlug || 'riya-seo-article'}.html`, articleHtml, 'text/html;charset=utf-8')}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="font-medium text-foreground">Title</div>
                    <div>{articleTitle}</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="font-medium text-foreground">Slug</div>
                    <div>{articleSlug || 'Not provided'}</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="font-medium text-foreground">Meta Description</div>
                    <div>{articleMeta || 'Not provided'}</div>
                  </div>
                </div>
                <iframe
                  srcDoc={articleHtml}
                  className="w-full rounded-lg border border-border/40"
                  style={{ height: '600px' }}
                  sandbox="allow-same-origin"
                  title="Article preview"
                />
              </div>
            )
          }
          for (const vid of ['generate_faceless_video', 'generate_avatar_video']) {
            const v = artifact[vid] as Record<string, unknown> | undefined
            if (v) {
              cards.push(<VideoStatusCard key={vid} vid={vid} v={v} />)
            }
          }
          // Google Docs / Drive links — always show when present regardless of other output
          const docUrl  = typeof artifact['doc_url']  === 'string' ? artifact['doc_url']  : null
          const fileUrl = typeof artifact['file_url'] === 'string' ? artifact['file_url'] : null
          if (docUrl || fileUrl) {
            cards.push(
              <div key="doc-links" className="rounded-xl border border-blue-200/60 bg-blue-50/40 dark:border-blue-800/40 dark:bg-blue-950/20 px-4 py-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400 mb-1">Saved Document</div>
                {docUrl && (
                  <a href={docUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-blue-200/70 bg-white/80 dark:bg-blue-950/30 px-3 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">Open in Google Docs</span>
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  </a>
                )}
                {fileUrl && (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-blue-200/70 bg-white/80 dark:bg-blue-950/30 px-3 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                    <Download className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">Open in Google Drive</span>
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  </a>
                )}
              </div>
            )
          }
          return cards.length ? <div className="space-y-3 mt-1">{cards}</div> : null
        })()}

        {/* Raw markdown: shown when no artifact cards + (no structured blocks, prefers markdown, or showFull) */}
        {displayText && !hasArtifactCards && !showMarkdownFallback && (
          <div
            ref={scrollRef}
            className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 text-sm text-foreground leading-relaxed"
          >
            <div dangerouslySetInnerHTML={{ __html: richTextHtml }} />
            {streaming && (
              <span className="inline-block w-1 h-3 bg-orange-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {displayText && !hasArtifactCards && showMarkdownFallback && (
          <div
            ref={scrollRef}
            className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground leading-relaxed"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-0.5">{children}</h3>,
                p: ({ children }) => <p className="mb-2">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                code: ({ children }) => (
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded text-orange-600 dark:text-orange-400">
                    {children}
                  </code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-orange-400 pl-3 italic text-muted-foreground my-2">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="border-border my-3" />,
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto rounded-lg border border-border/70">
                    <table className="w-full border-collapse text-sm">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                tbody: ({ children }) => <tbody className="bg-background">{children}</tbody>,
                tr: ({ children }) => <tr className="border-b border-border/60">{children}</tr>,
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>
                ),
                td: ({ children }) => <td className="px-3 py-2 align-top text-foreground">{children}</td>,
              }}
            >
              {displayText}
            </ReactMarkdown>
            {streaming && (
              <span className="inline-block w-1 h-3 bg-orange-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {artifact && renderArtifact && (
          <div className="border-t pt-3 mt-3">{renderArtifact(artifact)}</div>
        )}

        {!showInternalTraceDetails && (thinking || toolCalls.length > 0) ? (
          <details className="rounded-xl border border-border/70 bg-background/70 px-3 py-3">
            <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Run details
            </summary>
            <div className="mt-3 space-y-3">
              {thinking ? <ThinkingBlock thinking={thinking} /> : null}
              {toolCalls.length > 0 ? <ToolCallFeed toolCalls={toolCalls} isStreaming={false} /> : null}
            </div>
          </details>
        ) : null}

        {/* Next Best Action panel — driven by handoff_notes from the contract */}
        {!streaming && !error && handoffNotes && (
          <div className="mt-4 rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-6 w-6 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                  What to do next
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{handoffNotes}</p>
              </div>
            </div>
          </div>
        )}

        {/* What's next — shown after every successful completed run */}
        {!streaming && !error && (text || toolCalls.length > 0) && !hideNextActions && (
          <NextActionsSection
            agentName={agentName}
            outputText={sanitizeDisplayText(text)}
            tasksCreated={tasksCreated}
          />
        )}
      </CardContent>
    </Card>
  )
}
