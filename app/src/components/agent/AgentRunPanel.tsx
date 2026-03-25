import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Bot, CheckCircle, AlertCircle, Copy, ClipboardList, ChevronDown, ChevronRight, Wrench, Brain, Zap, CheckCheck, XCircle, ArrowRight, Sparkles, Bookmark, Download, PanelTopClose, Radio, Target, PenLine, FileText, Users, Monitor, Briefcase, Mail, Search, CalendarDays, BadgeDollarSign, TrendingDown, BarChart2, FlaskConical, Send, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRunResult, ToolCallEvent, ToolResultEvent, ContractTask } from '@/hooks/useAgentRun'

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

  const provider = vid === 'generate_faceless_video' ? 'veo' : 'heygen'
  const videoUrl = videoState.video_url ?? videoState.download_url
  const refId = videoState.operation_name ?? videoState.video_id
  const isDone = videoState.status === 'completed'

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
    <div className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {vid === 'generate_faceless_video' ? 'Faceless Video · Veo 3.1' : 'Avatar Video · HeyGen'}
        </div>
        {!isDone && (
          <Button
            variant="ghost"
            size="sm"
            onClick={checkStatus}
            disabled={polling}
            aria-label="Check video render status"
            className="h-7 gap-1 px-2 text-xs text-orange-500 hover:text-orange-600"
          >
            {polling && <span className="inline-block h-3 w-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />}
            {polling ? 'Checking…' : 'Check Status'}
          </Button>
        )}
      </div>
      {videoUrl ? (
        <div className="space-y-2">
          <video src={videoUrl as string} controls className="w-full rounded-lg" />
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => downloadFromUrl(String(videoUrl), vid === 'generate_faceless_video' ? 'riya-faceless-video.mp4' : 'riya-avatar-video.mp4')}
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-muted-foreground">
            {String(videoState.status ?? 'queued')} — rendering in background
          </span>
        </div>
      )}
      {Boolean(refId) && (
        <div className="text-[11px] text-muted-foreground/60 font-mono break-all">{String(refId)}</div>
      )}
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

type ArtifactEntry = [string, string | string[]]

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

function flattenArtifactEntries(artifact: Record<string, unknown>): ArtifactEntry[] {
  return Object.entries(artifact)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const items = value
          .map((item) => {
            if (typeof item === 'string') return stripInlineMarkdown(item)
            if (typeof item === 'number' || typeof item === 'boolean') return String(item)
            if (item && typeof item === 'object') {
              const objectValues = Object.values(item as Record<string, unknown>)
                .filter((nested) => typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean')
                .map((nested) => stripInlineMarkdown(String(nested)))
              return objectValues.join(' - ')
            }
            return ''
          })
          .filter(Boolean)
          .slice(0, 4)
        return items.length ? ([[key, items]] as ArtifactEntry[]) : []
      }
      if (typeof value === 'object') {
        const nestedEntries = Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean')
          .map(([nestedKey, nested]) => `${nestedKey.replace(/_/g, ' ')}: ${stripInlineMarkdown(String(nested))}`)
          .slice(0, 4)
        return nestedEntries.length ? ([[key, nestedEntries]] as ArtifactEntry[]) : []
      }
      return [[key, stripInlineMarkdown(String(value))] as ArtifactEntry]
    })
    .slice(0, 6)
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

function saveToLibrary(artifact: Record<string, unknown>, agent: string, companyId: string | null | undefined) {
  try {
    const existing = JSON.parse(localStorage.getItem('marqq_library_artifacts') || '[]')
    const entry = {
      id: crypto.randomUUID(),
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
  const parsed = parseResult(text)
  const artifactEntries = artifact ? flattenArtifactEntries(artifact) : []
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
                      saveToLibrary(artifact, agentName, companyId)
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

        {/* Structured blocks — Fix 8: items rendered with InlineMd to preserve inline formatting */}
        {!shouldPreferMarkdown && (parsed.title || parsed.summary) && (
          <div className="rounded-2xl border border-orange-200/70 bg-white/90 p-4 dark:border-orange-900/30 dark:bg-gray-950/60">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500" aria-hidden="true">Agent Brief</div>
            {parsed.title ? <div className="mt-1 text-base font-semibold text-foreground">{parsed.title}</div> : null}
            {parsed.summary ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{parsed.summary}</p> : null}
          </div>
        )}

        {!shouldPreferMarkdown && parsed.highlights.length > 0 && (
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

        {!shouldPreferMarkdown && parsed.sections.length > 0 && (
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

        {!shouldPreferMarkdown && parsed.actions.length > 0 && (
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

        {/* Fix 4: "Show full output" toggle when structured blocks are truncating content */}
        {!shouldPreferMarkdown && hasStructuredBlocks && displayText && !streaming && (
          <button
            onClick={() => setShowFull((p) => !p)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors min-h-[44px] px-1 py-2 inline-flex items-center"
          >
            {showFull ? 'Hide full output' : 'Show full output'}
          </button>
        )}

        {/* Artifact entries grid */}
        {artifactEntries.length > 0 && !renderArtifact && (
          <div className="grid gap-2 md:grid-cols-2">
            {artifactEntries.map(([key, value]) => (
              <div key={key} className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" aria-hidden="true">
                  {key.replace(/_/g, ' ')}
                </div>
                <div className="mt-1 text-sm leading-6 text-foreground break-words">
                  {Array.isArray(value) ? (
                    <div className="space-y-1">
                      {value.map((item, index) => (
                        <div key={`${key}-${index}`} className="flex items-start gap-2">
                          <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                          <div>{item}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="line-clamp-3 break-words">{String(value)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Automation result cards — image, email HTML, video status */}
        {artifact && (() => {
          const cards: React.ReactNode[] = []
          const img = artifact['generate_social_image'] as Record<string, unknown> | undefined
          if (img?.cdn_url || img?.image_url) {
            const imgSrc = (img.cdn_url ?? img.image_url) as string
            cards.push(
              <div key="social-image" className="rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" aria-hidden="true">Generated Image</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => window.open(imgSrc, '_blank', 'noopener,noreferrer')}
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => downloadFromUrl(imgSrc, 'riya-image-asset.png')}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </div>
                </div>
                <img src={imgSrc} alt="Generated social image" className="rounded-lg w-full max-w-md mx-auto block" />
                {typeof img.platform === 'string' && img.platform && (
                  <div className="text-xs text-muted-foreground">
                    {String(img.platform)} · {String(img.aspect_ratio ?? '')} · {String(img.model ?? '')}
                  </div>
                )}
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
          return cards.length ? <div className="space-y-3 mt-1">{cards}</div> : null
        })()}

        {/* Raw markdown: shown when preferring markdown, no structured blocks, or showFull toggled */}
        {displayText && (!hasStructuredBlocks || shouldPreferMarkdown || showFull) && (
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
