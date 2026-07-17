import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EnvelopeClosedIcon,
  LinkBreak2Icon,
  PaperPlaneIcon,
} from '@radix-ui/react-icons'
import { Loader2, Sparkles, CalendarClock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { getActiveAgentContext } from '@/lib/agentContext'

type LeadOutreachFlowProps = {
  initialQuestion?: string
  initialChannel?: string
  initialTarget?: string
  initialGoal?: string
  initialDelivery?: string
}

type OutreachProspect = {
  id: string
  full_name: string
  first_name?: string
  title: string
  company: string
  industry: string
  email: string
  linkedin_url?: string
  city?: string
  status: string
  subject: string
  body: string
  scheduled_for: string | null
  gmail_draft_id: string | null
  sent_at?: string | null
  replies?: Array<{ id: string; body?: string; subject?: string; received_at?: string }>
}

type OutreachCampaign = {
  id: string
  provider: string
  name: string
  status: string
  prospectIds: string[]
  createdAt: string
  sentCount?: number
  replyCount?: number
  runId?: string
}

type OutreachReply = {
  id: string
  body?: string
  subject?: string
  received_at?: string
  prospect_name?: string
  prospect_company?: string
  prospect_email?: string
  provider?: string
}

type ScheduledItem = {
  runId: string
  prospectId: string
  full_name: string
  company: string
  email: string
  scheduled_for: string
  subject: string
}

type SentItem = {
  runId: string
  prospectId: string
  full_name: string
  company: string
  email: string
  sent_at: string
  subject: string
}

function formatLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    email: 'Email-first',
    linkedin: 'LinkedIn-first',
    multi: 'Multitouch',
    decision: 'Decision makers',
    champions: 'Internal champions',
    warm: 'Warm accounts',
    meeting: 'Book meetings',
    reply: 'Earn replies',
    qualification: 'Qualify interest',
    draft: 'Gmail draft (default)',
    live: 'Push live',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(local: string) {
  if (!local) return null
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function parseListAfterLabel(question: string, label: RegExp) {
  const match = question.match(label)
  if (!match?.[1]) return [] as string[]
  return match[1]
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^not provided$/i.test(s) && !/^derive/i.test(s))
}

function statusTone(status: string) {
  if (status === 'replied') return 'text-sky-600 dark:text-sky-400'
  if (status === 'sent') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'scheduled' || status === 'drafted') return 'text-amber-600 dark:text-amber-400'
  if (status === 'copy_ready') return 'text-orange-600 dark:text-orange-400'
  return 'text-muted-foreground'
}

export function LeadOutreachFlow({
  initialQuestion,
  initialChannel,
  initialTarget,
  initialGoal,
  initialDelivery,
}: LeadOutreachFlowProps = {}) {
  const { activeWorkspace } = useWorkspace()
  const channel = initialChannel || 'email'
  const target = initialTarget || 'decision'
  const goal = initialGoal || 'reply'
  const delivery = initialDelivery === 'live' ? 'live' : 'draft'
  const question = initialQuestion || ''

  const [runId, setRunId] = useState<string | null>(null)
  const [prospects, setProspects] = useState<OutreachProspect[]>([])
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([])
  const [replies, setReplies] = useState<OutreachReply[]>([])
  const [scheduledQueue, setScheduledQueue] = useState<ScheduledItem[]>([])
  const [sentQueue, setSentQueue] = useState<SentItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [refreshingInbox, setRefreshingInbox] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const selected = useMemo(
    () => prospects.find((p) => p.id === selectedId) || null,
    [prospects, selectedId],
  )

  const industries = useMemo(
    () => parseListAfterLabel(question, /Apollo target industries:\s*([^.]+)/i),
    [question],
  )
  const titles = useMemo(
    () => parseListAfterLabel(question, /Apollo buyer titles:\s*([^.]+)/i),
    [question],
  )

  const workspaceId = activeWorkspace?.id || getActiveAgentContext().workspaceId
  const companyId = getActiveAgentContext().companyId
  const companyName =
    activeWorkspace?.name || getActiveAgentContext().companyName || getActiveAgentContext().workspaceName || ''

  const selectProspect = useCallback((p: OutreachProspect) => {
    setSelectedId(p.id)
    setSubject(p.subject || '')
    setBody(p.body || '')
    setStreamText('')
    setScheduledLocal(toLocalInputValue(p.scheduled_for))
  }, [])

  const refreshInbox = useCallback(async () => {
    if (!workspaceId) return
    setRefreshingInbox(true)
    try {
      const res = await fetch(`/api/outreach/workspaces/${encodeURIComponent(workspaceId)}/summary`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setCampaigns((data.campaigns || []) as OutreachCampaign[])
      setReplies((data.replies || []) as OutreachReply[])
      setScheduledQueue((data.scheduled || []) as ScheduledItem[])
      setSentQueue((data.sent || []) as SentItem[])

      if (runId && Array.isArray(data.runs)) {
        const active = data.runs.find((r: { id: string }) => r.id === runId)
        if (active?.prospects) {
          setProspects(active.prospects as OutreachProspect[])
        }
      }
    } catch (err) {
      console.warn('[outreach] inbox refresh failed', err)
    } finally {
      setRefreshingInbox(false)
    }
  }, [workspaceId, runId])

  const fetchProspects = async () => {
    if (!workspaceId) {
      toast.error('Select a workspace first')
      return
    }
    setFetching(true)
    try {
      const res = await fetch('/api/outreach/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          companyId,
          companyName,
          question,
          channel,
          target,
          goal,
          industries,
          titles,
          limit: 100,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      const list = (data.prospects || []) as OutreachProspect[]
      setRunId(data.runId)
      setProspects(list)
      setSelectedId(null)
      setSubject('')
      setBody('')
      setStreamText('')
      if (data.suggested_send_at) {
        setScheduledLocal(toLocalInputValue(data.suggested_send_at))
      }
      toast.success(`Loaded ${list.length} prospects from Apollo (max 100)`)
      void refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch prospects')
    } finally {
      setFetching(false)
    }
  }

  const generateCopy = async () => {
    if (!runId || !selected) {
      toast.error('Select one prospect first')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)
    setStreamText('')
    setSubject('')
    setBody('')

    try {
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/copy`, {
        method: 'POST',
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assembled = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload) as {
              text?: string
              done?: boolean
              subject?: string
              body?: string
              error?: string
            }
            if (json.error) throw new Error(json.error)
            if (json.text) {
              assembled += json.text
              setStreamText(assembled)
            }
            if (json.done) {
              setSubject(json.subject || '')
              setBody(json.body || '')
              setProspects((prev) =>
                prev.map((p) =>
                  p.id === selected.id
                    ? {
                        ...p,
                        subject: json.subject || '',
                        body: json.body || '',
                        status: 'copy_ready',
                      }
                    : p,
                ),
              )
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'Copy generation failed')
    } finally {
      setStreaming(false)
    }
  }

  const saveGmailDraft = async () => {
    if (!runId || !selected) return
    if (!subject.trim() || !body.trim()) {
      toast.error('Generate or write subject + body first')
      return
    }
    setSavingDraft(true)
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/gmail-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          scheduled_for: fromLocalInputValue(scheduledLocal),
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      const updated = data.prospect as OutreachProspect
      setProspects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
      setScheduledLocal(toLocalInputValue(updated.scheduled_for))
      toast.success(
        `Gmail draft saved · auto-sends ${updated.scheduled_for ? new Date(updated.scheduled_for).toLocaleString() : 'at apt time'}`,
      )
      void refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Gmail draft')
    } finally {
      setSavingDraft(false)
    }
  }

  const sendNow = async () => {
    if (!runId || !selected) return
    setSendingNow(true)
    try {
      if (selected.status === 'copy_ready' || !selected.gmail_draft_id) {
        const draftRes = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/gmail-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            body,
            scheduled_for: fromLocalInputValue(scheduledLocal),
            timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
          }),
        })
        const draftData = await draftRes.json()
        if (!draftRes.ok) throw new Error(draftData?.error || 'Failed to save draft before send')
        setProspects((prev) =>
          prev.map((p) => (p.id === selected.id ? { ...p, ...draftData.prospect } : p)),
        )
      }

      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/send-now`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setProspects((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, ...data.prospect } : p)),
      )
      toast.success('Email sent via Gmail')
      void refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSendingNow(false)
    }
  }

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!question || !workspaceId || runId) return
    void fetchProspects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    void refreshInbox()
    const timer = window.setInterval(() => void refreshInbox(), 60_000)
    return () => window.clearInterval(timer)
  }, [workspaceId, refreshInbox])

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50">
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Outreach Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.2rem] border border-orange-400/15 bg-white/5 p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-200">
                  <LinkBreak2Icon className="h-4 w-4" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Motion</div>
                <div className="mt-1 text-sm font-medium">{formatLabel(channel)}</div>
              </div>
              <div className="rounded-[1.2rem] border border-orange-400/15 bg-white/5 p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-200">
                  <PaperPlaneIcon className="h-4 w-4" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Target</div>
                <div className="mt-1 text-sm font-medium">{formatLabel(target)}</div>
              </div>
              <div className="rounded-[1.2rem] border border-orange-400/15 bg-white/5 p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-200">
                  <EnvelopeClosedIcon className="h-4 w-4" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Goal</div>
                <div className="mt-1 text-sm font-medium">{formatLabel(goal)}</div>
              </div>
              <div className="rounded-[1.2rem] border border-orange-400/15 bg-white/5 p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-200">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Delivery</div>
                <div className="mt-1 text-sm font-medium">{formatLabel(delivery)}</div>
              </div>
            </div>
            <p className="text-xs leading-5 text-orange-100/65">
              Fetch up to 100 Apollo prospects, pick one, stream a short personalized email, save as a Gmail draft,
              and the runner auto-sends at the scheduled apt time.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-orange-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Campaign brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
              {question || 'Open Launch Outreach from an ICP cohort to preload the Apollo-searchable brief.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void fetchProspects()} disabled={fetching || !workspaceId}>
                {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {runId ? 'Refresh prospects' : 'Fetch prospects (max 100)'}
              </Button>
              {prospects.length > 0 ? (
                <span className="self-center text-xs text-muted-foreground">{prospects.length} loaded</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prospects</CardTitle>
          </CardHeader>
          <CardContent>
            {!prospects.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {fetching ? 'Searching Apollo…' : 'No prospects yet. Fetch from Apollo to begin.'}
              </p>
            ) : (
              <div className="max-h-[520px] overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr>
                      {['Name', 'Title', 'Company', 'Email', 'Status'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((p) => {
                      const active = p.id === selectedId
                      return (
                        <tr
                          key={p.id}
                          className={`border-t cursor-pointer transition-colors ${
                            active ? 'bg-orange-500/10' : 'hover:bg-muted/40'
                          }`}
                          onClick={() => selectProspect(p)}
                        >
                          <td className="px-3 py-2 font-medium whitespace-nowrap max-w-[140px] truncate">{p.full_name}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[120px] truncate">
                            {p.title || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[120px] truncate">{p.company || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[140px] truncate">{p.email || '—'}</td>
                          <td className={`px-3 py-2 whitespace-nowrap ${statusTone(p.status)}`}>{p.status}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {selected ? `Copy · ${selected.full_name}` : 'Select one prospect'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Click a single row. AI writes one short email for that person only.
              </p>
            ) : (
              <>
                <div className="rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {selected.title || 'Role n/a'} · {selected.company || 'Company n/a'}
                  {selected.industry ? ` · ${selected.industry}` : ''}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void generateCopy()}
                  disabled={streaming}
                >
                  {streaming ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {streaming ? 'Streaming personalized copy…' : 'Generate short email'}
                </Button>

                {streaming && streamText ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border bg-zinc-950/95 p-3 text-xs text-orange-50">
                    {streamText}
                    <span className="animate-pulse">▍</span>
                  </pre>
                ) : null}

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Subject</div>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={streaming} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Body</div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[160px]"
                    disabled={streaming}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Schedule send (apt time)</div>
                  <Input
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Defaults to next weekday 09:30 local. Draft saves now; the server runner sends at this time.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    className="bg-orange-500 hover:bg-orange-600"
                    onClick={() => void saveGmailDraft()}
                    disabled={savingDraft || streaming || !subject.trim() || !body.trim()}
                  >
                    {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save draft + schedule
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendNow()}
                    disabled={sendingNow || streaming || !subject.trim() || !body.trim()}
                  >
                    {sendingNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send now
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-[1.75rem] border-orange-200/70 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Campaigns</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void refreshInbox()}
              disabled={refreshingInbox}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingInbox ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {!campaigns.length ? (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              campaigns.map((c) => (
                <div key={c.id} className="rounded-xl border px-3 py-2 text-sm">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.provider} · {c.sentCount || 0} sent · {c.replyCount || 0} replies ·{' '}
                    {c.prospectIds?.length || 0} prospects
                  </div>
                  <div className={`mt-1 text-[11px] uppercase tracking-wide ${statusTone(c.status)}`}>
                    {c.status}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scheduled / Sent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-auto">
            {scheduledQueue.length ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Queued</div>
                {scheduledQueue.slice(0, 12).map((item) => (
                  <div key={`${item.runId}-${item.prospectId}`} className="rounded-lg border px-3 py-2 text-xs">
                    <div className="font-medium">{item.full_name}</div>
                    <div className="text-muted-foreground truncate">{item.subject}</div>
                    <div className="text-amber-600 dark:text-amber-400">
                      {item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {sentQueue.length ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sent</div>
                {sentQueue.slice(0, 12).map((item) => (
                  <div key={`${item.runId}-${item.prospectId}-sent`} className="rounded-lg border px-3 py-2 text-xs">
                    <div className="font-medium">{item.full_name}</div>
                    <div className="text-muted-foreground truncate">{item.subject}</div>
                    <div className="text-emerald-600 dark:text-emerald-400">
                      {item.sent_at ? new Date(item.sent_at).toLocaleString() : '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!scheduledQueue.length && !sentQueue.length ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled or sent yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Replies inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-auto">
            {!replies.length ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>No replies yet.</p>
                <p className="text-[11px] leading-4">
                  Point Instantly webhooks to{' '}
                  <code className="rounded bg-muted px-1">/api/webhooks/instantly</code> or post to{' '}
                  <code className="rounded bg-muted px-1">/api/webhooks/outreach/reply</code>.
                </p>
              </div>
            ) : (
              replies.slice(0, 20).map((r) => (
                <div key={r.id} className="rounded-xl border px-3 py-2 text-xs">
                  <div className="font-medium">
                    {r.prospect_name || r.prospect_email || 'Unknown'}
                    {r.prospect_company ? ` · ${r.prospect_company}` : ''}
                  </div>
                  {r.subject ? <div className="text-muted-foreground">{r.subject}</div> : null}
                  <div className="mt-1 line-clamp-3 whitespace-pre-wrap">{r.body || '—'}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {r.received_at ? new Date(r.received_at).toLocaleString() : ''}
                    {r.provider ? ` · ${r.provider}` : ''}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
