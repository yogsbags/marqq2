import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EnvelopeClosedIcon,
  LinkBreak2Icon,
  PaperPlaneIcon,
} from '@radix-ui/react-icons'
import { Loader2, Sparkles, CalendarClock, RefreshCw, Lock, Unlock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { getActiveAgentContext } from '@/lib/agentContext'
import {
  getLeadOutreachCopyTypes,
  getLeadOutreachRequiredConnectors,
  OUTREACH_CONTACT_CHANNEL_PLAN,
} from '@/lib/workflowRequirements'
import { connectorLabel } from '@/lib/connectorMeta'
import { CrmListPreview, EmailClientPreview, OutcomeGoLiveCta, VoiceCallPreview, WhatsAppDmPreview } from '@/components/outcome-previews'

type LeadOutreachFlowProps = {
  initialQuestion?: string
  initialChannel?: string
  initialContactChannels?: string
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
  enrichment?: {
    status?: string
    provider?: string | null
    sources?: string[]
    errors?: Array<{ provider?: string; error?: string }>
    enriched_at?: string
    error?: string
  } | null
  person_profile?: Record<string, unknown> | null
  company_profile?: Record<string, unknown> | null
  signals?: Array<{ type?: string; strength?: string; text?: string }>
  channel_copies?: Record<
    string,
    { subject?: string; body?: string; connector?: string; skills?: string[] }
  > | null
  launch_connectors?: string[]
  phone_e164?: string
  copy_locked?: boolean
  locked_at?: string | null
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
  runId?: string
  prospectId?: string
  body?: string
  subject?: string
  received_at?: string
  prospect_name?: string
  prospect_company?: string
  prospect_email?: string
  provider?: string
  channel?: string
  classification?: string
  auto_reply_draft?: {
    status?: string
    classification?: string
    confidence?: number | null
    rationale?: string | null
    should_reply?: boolean
    subject?: string
    body?: string
    channel?: string
    error?: string | null
    approved_at?: string | null
    sent_at?: string | null
  } | null
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
    email: 'Verified email',
    phone: 'Verified phone',
    linkedin: 'LinkedIn profile',
    multi: 'Multitouch',
    decision: 'Decision makers',
    champions: 'Internal champions',
    warm: 'Warm accounts',
    meeting: 'Book meetings',
    reply: 'Earn replies',
    qualification: 'Qualify interest',
    draft: 'Draft first (default)',
    live: 'Live on Go Live click',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function parseContactChannels(raw?: string, fallbackChannel?: string) {
  const fromRaw = String(raw || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v === 'email' || v === 'phone' || v === 'linkedin')
  if (fromRaw.length) return Array.from(new Set(fromRaw))
  if (fallbackChannel === 'linkedin') return ['linkedin']
  if (fallbackChannel === 'multi') return ['email', 'linkedin']
  return ['email']
}

function deriveChannel(contactChannels: string[]) {
  const set = new Set(contactChannels)
  if (set.has('linkedin') && !set.has('email') && !set.has('phone')) return 'linkedin'
  if (set.has('email') && !set.has('linkedin') && !set.has('phone')) return 'email'
  return 'multi'
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
  if (status === 'enriched') return 'text-sky-600 dark:text-sky-400'
  if (status === 'copy_ready') return 'text-orange-600 dark:text-orange-400'
  if (status === 'copy_locked' || status === 'locked') return 'text-emerald-700 dark:text-emerald-400'
  return 'text-muted-foreground'
}

export function LeadOutreachFlow({
  initialQuestion,
  initialChannel,
  initialContactChannels,
  initialTarget,
  initialGoal,
  initialDelivery,
}: LeadOutreachFlowProps = {}) {
  const { activeWorkspace } = useWorkspace()
  const contactChannels = useMemo(
    () => parseContactChannels(initialContactChannels, initialChannel),
    [initialContactChannels, initialChannel],
  )
  const channel = initialChannel || deriveChannel(contactChannels)
  const requiredLaunchConnectors = useMemo(
    () => getLeadOutreachRequiredConnectors(contactChannels),
    [contactChannels],
  )
  const expectedCopyTypes = useMemo(
    () => getLeadOutreachCopyTypes(contactChannels),
    [contactChannels],
  )
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
  const [enrichStage, setEnrichStage] = useState<string | null>(null)
  const [activeCopyType, setActiveCopyType] = useState<string>('email')
  const [streamText, setStreamText] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [channelCopies, setChannelCopies] = useState<OutreachProspect['channel_copies']>(null)
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [refreshingInbox, setRefreshingInbox] = useState(false)
  const [reviseInstruction, setReviseInstruction] = useState('')
  const [savingProspect, setSavingProspect] = useState(false)
  const [lockingCopy, setLockingCopy] = useState(false)
  const [replyDraftEdits, setReplyDraftEdits] = useState<
    Record<string, { subject: string; body: string }>
  >({})
  const [replyActionId, setReplyActionId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selected = useMemo(
    () => prospects.find((p) => p.id === selectedId) || null,
    [prospects, selectedId],
  )
  const copyLocked = Boolean(selected?.copy_locked)

  const industries = useMemo(
    () => parseListAfterLabel(question, /(?:Apollo\s+)?target industries:\s*([^.]+)/i),
    [question],
  )
  const titles = useMemo(
    () => parseListAfterLabel(question, /(?:Apollo\s+)?buyer titles:\s*([^.]+)/i),
    [question],
  )

  const workspaceId = activeWorkspace?.id || getActiveAgentContext().workspaceId
  const companyId = getActiveAgentContext().companyId
  const companyName =
    activeWorkspace?.name || getActiveAgentContext().companyName || getActiveAgentContext().workspaceName || ''

  const selectProspect = useCallback((p: OutreachProspect) => {
    setSelectedId(p.id)
    const copies = p.channel_copies || null
    setChannelCopies(copies)
    const preferredType =
      (copies && expectedCopyTypes.find((t) => copies[t]?.body)) ||
      (copies && Object.keys(copies)[0]) ||
      expectedCopyTypes[0] ||
      'email'
    setActiveCopyType(preferredType)
    const copy = copies?.[preferredType]
    setSubject(copy?.subject || p.subject || '')
    setBody(copy?.body || p.body || '')
    setStreamText('')
    setReviseInstruction('')
    setScheduledLocal(toLocalInputValue(p.scheduled_for))
  }, [expectedCopyTypes])

  const applyProspectUpdate = useCallback((updated: OutreachProspect) => {
    setProspects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
    if (selectedId === updated.id) {
      setChannelCopies(updated.channel_copies || null)
      const copy = updated.channel_copies?.[activeCopyType]
      if (copy) {
        setSubject(copy.subject || '')
        setBody(copy.body || '')
      } else if (activeCopyType === 'email') {
        setSubject(updated.subject || '')
        setBody(updated.body || '')
      }
    }
  }, [selectedId, activeCopyType])

  const removeProspect = async (prospectId: string) => {
    if (!runId) return
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${prospectId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setProspects((prev) => prev.filter((p) => p.id !== prospectId))
      if (selectedId === prospectId) {
        setSelectedId(null)
        setSubject('')
        setBody('')
        setChannelCopies(null)
        setStreamText('')
      }
      toast.success('Prospect removed from list')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove prospect')
    }
  }

  const patchProspect = async (patch: Record<string, unknown>, opts?: { silent?: boolean }) => {
    if (!runId || !selected) return null
    setSavingProspect(true)
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      const updated = data.prospect as OutreachProspect
      applyProspectUpdate(updated)
      if (!opts?.silent) toast.success('Saved')
      return updated
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
      return null
    } finally {
      setSavingProspect(false)
    }
  }

  const saveCopyEdits = async (opts?: { silent?: boolean }) => {
    if (!selected || copyLocked) return
    const nextCopies = {
      ...(channelCopies || selected.channel_copies || {}),
      [activeCopyType]: {
        ...((channelCopies || selected.channel_copies || {})[activeCopyType] || {}),
        subject: activeCopyType === 'email' ? subject : '',
        body,
      },
    }
    setChannelCopies(nextCopies)
    await patchProspect({
      copy_type: activeCopyType,
      subject: activeCopyType === 'email' ? subject : '',
      body,
      channel_copies: nextCopies,
    }, { silent: true })
    if (!opts?.silent) toast.success('Draft copy saved')
  }

  const setCopyLock = async (locked: boolean) => {
    if (!selected) return
    setLockingCopy(true)
    try {
      if (locked && !copyLocked) {
        await saveCopyEdits({ silent: true })
      }
      const updated = await patchProspect(
        locked ? { copy_locked: true } : { copy_locked: false, unlock: true },
        { silent: true },
      )
      if (updated) toast.success(locked ? 'Copy locked — ready for Go Live' : 'Copy unlocked — you can edit or revise')
    } finally {
      setLockingCopy(false)
    }
  }

  const reviseCopy = async () => {
    if (!runId || !selected) return
    if (copyLocked) {
      toast.error('Unlock copy before revising with AI')
      return
    }
    if (!body.trim()) {
      toast.error('Generate or write a draft first')
      return
    }
    if (!reviseInstruction.trim()) {
      toast.error('Add a follow-up instruction for the AI')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)
    setEnrichStage('revising')
    setStreamText('')

    try {
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          copy_type: activeCopyType,
          instruction: reviseInstruction.trim(),
        }),
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
              stage?: string
              copy_type?: string
              channel_copies?: OutreachProspect['channel_copies']
            }
            if (json.error && !json.done) throw new Error(json.error)
            if (json.stage === 'revising') setEnrichStage('revising')
            if (json.copy_type) setActiveCopyType(json.copy_type)
            if (json.text) {
              assembled += json.text
              setStreamText(assembled)
              setBody(assembled)
            }
            if (json.done) {
              const copies = json.channel_copies || null
              if (copies) setChannelCopies(copies)
              const type = json.copy_type || activeCopyType
              const copy = copies?.[type]
              setSubject(copy?.subject || json.subject || '')
              setBody(copy?.body || json.body || assembled)
              setProspects((prev) =>
                prev.map((p) =>
                  p.id === selected.id
                    ? {
                        ...p,
                        subject: type === 'email' ? (copy?.subject || json.subject || p.subject) : p.subject,
                        body: copy?.body || json.body || p.body,
                        channel_copies: copies || p.channel_copies,
                        status: 'copy_ready',
                        copy_locked: false,
                      }
                    : p,
                ),
              )
              setReviseInstruction('')
              toast.success('Draft revised')
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'Revision failed')
    } finally {
      setStreaming(false)
      setEnrichStage(null)
    }
  }

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

  const getReplyDraftFields = (r: OutreachReply) => {
    const edit = replyDraftEdits[r.id]
    const draft = r.auto_reply_draft
    return {
      subject: edit?.subject ?? draft?.subject ?? '',
      body: edit?.body ?? draft?.body ?? '',
    }
  }

  const saveReplyDraft = async (r: OutreachReply) => {
    if (!r.runId) {
      toast.error('Missing run for this reply')
      return
    }
    const fields = getReplyDraftFields(r)
    setReplyActionId(r.id)
    try {
      const res = await fetch(`/api/outreach/runs/${r.runId}/replies/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: fields.subject, body: fields.body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setReplies((prev) =>
        prev.map((item) => (item.id === r.id ? { ...item, ...data.reply, runId: r.runId } : item)),
      )
      setReplyDraftEdits((prev) => {
        const next = { ...prev }
        delete next[r.id]
        return next
      })
      toast.success('Reply draft saved (not sent)')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save reply draft')
    } finally {
      setReplyActionId(null)
    }
  }

  const approveReply = async (r: OutreachReply) => {
    if (!r.runId) {
      toast.error('Missing run for this reply')
      return
    }
    setReplyActionId(r.id)
    try {
      if (replyDraftEdits[r.id]) {
        const fields = getReplyDraftFields(r)
        const saveRes = await fetch(`/api/outreach/runs/${r.runId}/replies/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: fields.subject, body: fields.body }),
        })
        const saveData = await saveRes.json()
        if (!saveRes.ok) throw new Error(saveData?.error || 'Failed to save draft before send')
        setReplyDraftEdits((prev) => {
          const next = { ...prev }
          delete next[r.id]
          return next
        })
      }

      const res = await fetch(`/api/outreach/runs/${r.runId}/replies/${r.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      if (data.reply) {
        setReplies((prev) =>
          prev.map((item) =>
            item.id === r.id ? { ...item, ...data.reply, runId: r.runId } : item,
          ),
        )
      }
      toast.success(
        data.status === 'sent'
          ? 'Reply approved and sent live'
          : 'Classification approved (no reply body to send)',
      )
      void refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setReplyActionId(null)
    }
  }

  const rejectReply = async (r: OutreachReply) => {
    if (!r.runId) {
      toast.error('Missing run for this reply')
      return
    }
    setReplyActionId(r.id)
    try {
      const res = await fetch(`/api/outreach/runs/${r.runId}/replies/${r.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setReplies((prev) =>
        prev.map((item) => (item.id === r.id ? { ...item, ...data.reply, runId: r.runId } : item)),
      )
      toast.success('Draft dismissed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dismiss failed')
    } finally {
      setReplyActionId(null)
    }
  }

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
          contact_channels: contactChannels,
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
      toast.success(`Loaded ${list.length} prospects from ${data.provider || data.source || 'lead data'} (max 100)`)
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
    if (selected.copy_locked) {
      toast.error('Unlock copy before regenerating')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)
    setEnrichStage('enriching')
    setStreamText('')
    setSubject('')
    setBody('')
    setChannelCopies(null)
    setActiveCopyType(expectedCopyTypes[0] || 'email')

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
      let currentCopyType = expectedCopyTypes[0] || 'email'

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
              stage?: string
              copy_type?: string
              channel_copies?: OutreachProspect['channel_copies']
              launch_connectors?: string[]
              enrichment?: OutreachProspect['enrichment']
              signals?: OutreachProspect['signals']
              person_profile?: OutreachProspect['person_profile']
              company_profile?: OutreachProspect['company_profile']
            }
            if (json.error && !json.stage) throw new Error(json.error)
            if (json.stage === 'enriching') setEnrichStage('enriching')
            if (json.stage === 'enriched' || json.stage === 'enrich_failed') {
              setEnrichStage(json.stage === 'enriched' ? 'enriched' : 'enrich_failed')
              setProspects((prev) =>
                prev.map((p) =>
                  p.id === selected.id
                    ? {
                        ...p,
                        status: json.stage === 'enriched' ? 'enriched' : p.status,
                        enrichment: json.enrichment || p.enrichment,
                        signals: json.signals || p.signals,
                        person_profile: json.person_profile || p.person_profile,
                        company_profile: json.company_profile || p.company_profile,
                      }
                    : p,
                ),
              )
            }
            if (json.stage === 'drafting') {
              setEnrichStage('drafting')
              if (json.copy_type && json.copy_type !== currentCopyType) {
                currentCopyType = json.copy_type
                assembled = ''
                setStreamText('')
                setActiveCopyType(json.copy_type)
              }
            }
            if (json.text) {
              assembled += json.text
              setStreamText(assembled)
            }
            if (json.done) {
              const copies = json.channel_copies || null
              setChannelCopies(copies)
              const primaryType =
                (copies && Object.keys(copies).includes('email') && 'email')
                || (copies && Object.keys(copies)[0])
                || expectedCopyTypes[0]
                || 'email'
              setActiveCopyType(primaryType)
              const primary = copies?.[primaryType]
              setSubject(primary?.subject || json.subject || '')
              setBody(primary?.body || json.body || '')
              setEnrichStage(null)
              setProspects((prev) =>
                prev.map((p) =>
                  p.id === selected.id
                    ? {
                        ...p,
                        subject: json.subject || '',
                        body: json.body || '',
                        status: 'copy_ready',
                        enrichment: json.enrichment || p.enrichment,
                        signals: json.signals || p.signals,
                        person_profile: json.person_profile || p.person_profile,
                        company_profile: json.company_profile || p.company_profile,
                        channel_copies: copies || p.channel_copies,
                        launch_connectors: json.launch_connectors || p.launch_connectors,
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
      setEnrichStage(null)
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

  const goLiveCampaigns = async () => {
    if (!runId || !selected) return
    setSendingNow(true)
    try {
      const mergedCopies = {
        ...(selected.channel_copies || {}),
        ...(channelCopies || {}),
        [activeCopyType]: {
          ...((channelCopies || selected.channel_copies || {})[activeCopyType] || {}),
          subject: activeCopyType === 'email' ? subject : '',
          body,
        },
      }

      const res = await fetch(`/api/outreach/runs/${runId}/go-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectIds: [selected.id],
          activate: delivery === 'live',
          delivery,
          companyId: companyId || workspaceId,
          channel_copies: mergedCopies,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

      if (Array.isArray(data.prospects)) {
        setProspects((prev) =>
          prev.map((p) => {
            const updated = data.prospects.find((u: OutreachProspect) => u.id === p.id)
            return updated ? { ...p, ...updated } : p
          }),
        )
      }
      if (Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns as OutreachCampaign[])
      }

      const channels = Array.isArray(data.channels) ? data.channels : []
      const ok = channels.filter((c: { status?: string }) => c.status === 'completed' || c.status === 'partial')
      const failed = channels.filter((c: { status?: string }) => c.status === 'error')
      const skipped = Array.isArray(data.skipped) ? data.skipped : []

      if (ok.length) {
        toast.success(
          `Launched ${ok.map((c: { provider?: string }) => c.provider || 'channel').join(', ')}${
            delivery === 'live' ? ' (live)' : ' (draft where supported)'
          }`,
        )
      }
      for (const f of failed) {
        toast.error(`${f.provider || f.automation_id}: ${f.error || 'failed'}`)
      }
      for (const s of skipped) {
        toast.message(`${s.channel}: skipped — ${s.reason || 'n/a'}`)
      }
      if (!ok.length && !failed.length) {
        toast.message('Go live finished with no channel launches')
      }
      void refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Go live failed')
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
                <div className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Contact data</div>
                <div className="mt-1 text-sm font-medium">
                  {contactChannels.map((c) => formatLabel(c)).filter(Boolean).join(' · ') || formatLabel(channel)}
                </div>
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
              Fetch up to 100 prospects, pick one, enrich profile/company/signals, stream channel copy
              (email / LinkedIn DM / WhatsApp / voicebot), then Go Live to Instantly, HeyReach, WhatsApp, or voicebot.
              Gmail draft/send remains optional below.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-orange-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">Campaign brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
              {question || 'Open Launch Outreach from an ICP cohort to preload the B2B brief.'}
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
        <CrmListPreview
          title="CRM · Prospects"
          selectedId={selectedId}
          onSelect={(id) => {
            const p = prospects.find((x) => x.id === id)
            if (p) selectProspect(p)
          }}
          onRemove={(id) => void removeProspect(id)}
          emptyLabel={fetching ? 'Searching Apollo…' : 'No prospects yet. Fetch from Apollo to begin.'}
          leads={prospects.map((p) => ({
            id: p.id,
            name: p.full_name,
            title: p.title,
            company: p.company,
            email: p.email,
            status: p.copy_locked ? 'locked' : p.status,
          }))}
        />

        <Card className="rounded-[1.75rem] border-orange-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {selected ? `Draft for ${selected.full_name}` : 'Select one prospect'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Click a contact. Edit fields, generate channel drafts, revise with AI, then lock before Go Live.
              </p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={selected.full_name || ''}
                    disabled={savingProspect}
                    onChange={(e) =>
                      setProspects((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, full_name: e.target.value } : p)),
                      )
                    }
                    onBlur={() => void patchProspect({ full_name: selected.full_name || '' }, { silent: true })}
                    placeholder="Full name"
                  />
                  <Input
                    value={selected.title || ''}
                    disabled={savingProspect}
                    onChange={(e) =>
                      setProspects((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, title: e.target.value } : p)),
                      )
                    }
                    onBlur={() => void patchProspect({ title: selected.title || '' }, { silent: true })}
                    placeholder="Title"
                  />
                  <Input
                    value={selected.company || ''}
                    disabled={savingProspect}
                    onChange={(e) =>
                      setProspects((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, company: e.target.value } : p)),
                      )
                    }
                    onBlur={() => void patchProspect({ company: selected.company || '' }, { silent: true })}
                    placeholder="Company"
                  />
                  <Input
                    value={selected.email || ''}
                    disabled={savingProspect}
                    onChange={(e) =>
                      setProspects((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, email: e.target.value } : p)),
                      )
                    }
                    onBlur={() => void patchProspect({ email: selected.email || '' }, { silent: true })}
                    placeholder="Email"
                  />
                  <Input
                    value={selected.linkedin_url || ''}
                    disabled={savingProspect}
                    onChange={(e) =>
                      setProspects((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, linkedin_url: e.target.value } : p)),
                      )
                    }
                    onBlur={() => void patchProspect({ linkedin_url: selected.linkedin_url || '' }, { silent: true })}
                    placeholder="LinkedIn URL"
                  />
                  <Input
                    value={selected.phone_e164 || ''}
                    disabled={savingProspect}
                    onChange={(e) =>
                      setProspects((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, phone_e164: e.target.value } : p)),
                      )
                    }
                    onBlur={() => void patchProspect({ phone_e164: selected.phone_e164 || '' }, { silent: true })}
                    placeholder="Phone"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => void removeProspect(selected.id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove from list
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void generateCopy()}
                  disabled={streaming || copyLocked}
                >
                  {streaming ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {streaming
                    ? enrichStage === 'enriching'
                      ? 'Enriching profile + signals…'
                      : enrichStage === 'revising'
                        ? `Revising ${String(activeCopyType || 'copy').replace(/_/g, ' ')}…`
                        : enrichStage === 'drafting'
                          ? `Writing ${String(activeCopyType || 'copy').replace(/_/g, ' ')}…`
                          : 'Working…'
                    : `Generate ${expectedCopyTypes.length > 1 ? 'channel copies' : 'short email'}`}
                </Button>

                <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2 text-[11px] text-muted-foreground dark:border-orange-900/40 dark:bg-orange-950/20">
                  <div className="mb-1 font-medium text-foreground/80">Before campaign launch</div>
                  {contactChannels.map((c) => {
                    const plan = OUTREACH_CONTACT_CHANNEL_PLAN[c]
                    return (
                      <div key={c}>
                        • {formatLabel(c)} → {plan?.label || c}
                        {plan?.connectorIds?.length
                          ? ` (${plan.connectorIds.map((id) => connectorLabel(id)).join(', ')})`
                          : ''}
                      </div>
                    )
                  })}
                  <div className="mt-1">
                    Required connectors: {requiredLaunchConnectors.map((id) => connectorLabel(id)).join(', ') || '—'}
                  </div>
                </div>

                {(selected.signals?.length || selected.enrichment?.sources?.length) ? (
                  <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2 text-[11px] text-muted-foreground dark:border-orange-900/40 dark:bg-orange-950/20">
                    {selected.enrichment?.sources?.length ? (
                      <div className="mb-1">
                        Enriched via {selected.enrichment.sources.join(', ')}
                      </div>
                    ) : null}
                    {(selected.signals || []).slice(0, 4).map((s, i) => (
                      <div key={`${s.type || 's'}-${i}`}>• {s.text || s.type}</div>
                    ))}
                  </div>
                ) : null}

                {(channelCopies || selected.channel_copies) && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(channelCopies || selected.channel_copies || {}).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setActiveCopyType(type)
                          const copy = (channelCopies || selected.channel_copies)?.[type]
                          setSubject(copy?.subject || '')
                          setBody(copy?.body || '')
                          setStreamText('')
                        }}
                        className={
                          activeCopyType === type
                            ? 'rounded-full border border-orange-400 bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700'
                            : 'rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground'
                        }
                      >
                        {type.replace(/_/g, ' ')}
                        {(channelCopies || selected.channel_copies)?.[type]?.connector
                          ? ` · ${connectorLabel(String((channelCopies || selected.channel_copies)?.[type]?.connector))}`
                          : ''}
                      </button>
                    ))}
                  </div>
                )}
                {((channelCopies || selected.channel_copies)?.[activeCopyType]?.skills || []).length > 0 ? (
                  <div className="text-[11px] text-muted-foreground">
                    Skills:{' '}
                    {((channelCopies || selected.channel_copies)?.[activeCopyType]?.skills || []).join(' · ')}
                  </div>
                ) : null}

                {activeCopyType === 'voicebot_script' ? (
                  <VoiceCallPreview
                    prospectName={selected.full_name || 'Prospect'}
                    title={selected.title || String(selected.person_profile?.title || selected.person_profile?.headline || '')}
                    company={selected.company}
                    phone={selected.phone_e164 || ''}
                    email={selected.email || ''}
                    script={streaming && streamText && !body ? streamText : body}
                    status={copyLocked ? 'confirmed' : 'draft'}
                    streaming={streaming}
                    editable={!streaming && !copyLocked}
                    onScriptChange={(next) => {
                      setBody(next)
                      setChannelCopies((prev) => ({
                        ...(prev || selected.channel_copies || {}),
                        [activeCopyType]: {
                          ...((prev || selected.channel_copies || {})[activeCopyType] || {}),
                          subject: '',
                          body: next,
                        },
                      }))
                    }}
                    signals={[
                      ...(selected.signals || []).slice(0, 3).map((s) => String(s.text || s.type || '')).filter(Boolean),
                      ...(((channelCopies || selected.channel_copies)?.[activeCopyType]?.skills || []).slice(0, 2).map((s: string) => `Skill: ${s}`)),
                    ].filter(Boolean) as string[]}
                  />
                ) : activeCopyType === 'whatsapp_dm' ? (
                  <WhatsAppDmPreview
                    contactName={selected.full_name || 'Prospect'}
                    message={streaming && streamText && !body ? streamText : body}
                    streaming={streaming}
                    editable={!streaming && !copyLocked}
                    onMessageChange={(next) => {
                      setBody(next)
                      setChannelCopies((prev) => ({
                        ...(prev || selected.channel_copies || {}),
                        [activeCopyType]: {
                          ...((prev || selected.channel_copies || {})[activeCopyType] || {}),
                          subject: '',
                          body: next,
                        },
                      }))
                    }}
                  />
                ) : (
                <EmailClientPreview
                  from="you@yourbrand.com"
                  to={
                    activeCopyType === 'linkedin_dm'
                      ? selected.linkedin_url || selected.full_name
                      : selected.email || ''
                  }
                  subject={activeCopyType === 'email' ? subject : `${activeCopyType.replace(/_/g, ' ')}`}
                  body={streaming && streamText && !body ? streamText : body}
                  streaming={streaming}
                  editable={!streaming && !copyLocked}
                  onSubjectChange={setSubject}
                  onBodyChange={(next) => {
                    setBody(next)
                    setChannelCopies((prev) => ({
                      ...(prev || selected.channel_copies || {}),
                      [activeCopyType]: {
                        ...((prev || selected.channel_copies || {})[activeCopyType] || {}),
                        subject: activeCopyType === 'email' ? subject : '',
                        body: next,
                      },
                    }))
                  }}
                />
                )}

                <div className="space-y-2 rounded-xl border border-border/60 p-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    AI follow-up · revise {activeCopyType.replace(/_/g, ' ')}
                  </div>
                  <Textarea
                    value={reviseInstruction}
                    onChange={(e) => setReviseInstruction(e.target.value)}
                    disabled={streaming || copyLocked}
                    placeholder="e.g. Shorter, warmer opener, mention their Series B, ask for a 15-min reply…"
                    className="min-h-[72px] text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void reviseCopy()}
                      disabled={streaming || copyLocked || !reviseInstruction.trim() || !body.trim()}
                    >
                      {streaming && enrichStage === 'revising' ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Revise with AI
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void saveCopyEdits()}
                      disabled={streaming || copyLocked || savingProspect || !body.trim()}
                    >
                      Save draft edits
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={copyLocked ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}
                      onClick={() => void setCopyLock(!copyLocked)}
                      disabled={streaming || lockingCopy || (!copyLocked && !body.trim())}
                    >
                      {lockingCopy ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : copyLocked ? (
                        <Unlock className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Lock className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copyLocked ? 'Unlock copy' : 'Lock copy'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {copyLocked
                      ? 'Locked — edit/revise disabled. Unlock to change, or Go Live below.'
                      : 'Edit freely or prompt AI. Lock when ready — Go Live requires a locked draft.'}
                  </p>
                </div>

                <OutcomeGoLiveCta
                  kind={
                    activeCopyType === 'voicebot_script'
                      ? 'voicebot'
                      : activeCopyType === 'whatsapp_dm'
                        ? 'whatsapp'
                        : activeCopyType === 'linkedin_dm'
                          ? 'linkedin'
                          : 'email'
                  }
                  workspaceId={workspaceId}
                  companyId={companyId}
                  requiredAllOf={activeCopyType === 'voicebot_script' ? [] : requiredLaunchConnectors}
                  requiredAnyOf={activeCopyType === 'voicebot_script' ? [] : undefined}
                  liveActionLabel={
                    activeCopyType === 'voicebot_script'
                      ? (delivery === 'live' ? 'Place voice calls' : 'Save voice draft')
                      : (delivery === 'live' ? 'Go Live — launch now' : 'Save draft to connectors')
                  }
                  goLiveDisabled={
                    sendingNow
                    || streaming
                    || !body.trim()
                    || !copyLocked
                    || (activeCopyType === 'email' && !subject.trim())
                    || (activeCopyType === 'voicebot_script' && !selected.phone_e164)
                  }
                  onGoLive={() => goLiveCampaigns()}
                />

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Schedule Gmail send (optional)</div>
                  <Input
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Default is draft. Instantly campaigns stay inactive until delivery is Live and you click Go Live.
                    LinkedIn (HeyReach), WhatsApp, and voicebot only send on Live + Go Live.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    className="bg-orange-500 hover:bg-orange-600"
                    onClick={() => void saveGmailDraft()}
                    disabled={savingDraft || streaming || !subject.trim() || !body.trim() || activeCopyType !== 'email'}
                  >
                    {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Gmail draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendNow()}
                    disabled={sendingNow || streaming || !subject.trim() || !body.trim() || activeCopyType !== 'email'}
                  >
                    {sendingNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send via Gmail
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
                  Instantly → <code className="rounded bg-muted px-1">/api/webhooks/instantly</code>
                  {' · '}
                  HeyReach → <code className="rounded bg-muted px-1">/api/webhooks/heyreach</code>
                  {' · '}
                  WhatsApp → <code className="rounded bg-muted px-1">/api/webhooks/whatsapp</code>
                  . Replies are drafted only — Approve & send to go live.
                </p>
              </div>
            ) : (
              replies.slice(0, 20).map((r) => {
                const draft = r.auto_reply_draft
                const draftStatus = draft?.status || ''
                const isDraft = draftStatus === 'draft' || draftStatus === ''
                const fields = getReplyDraftFields(r)
                const busy = replyActionId === r.id
                const classification =
                  draft?.classification || r.classification || null

                return (
                  <div key={r.id} className="rounded-xl border px-3 py-2 text-xs space-y-2">
                    <div className="font-medium">
                      {r.prospect_name || r.prospect_email || 'Unknown'}
                      {r.prospect_company ? ` · ${r.prospect_company}` : ''}
                    </div>
                    {r.subject ? <div className="text-muted-foreground">{r.subject}</div> : null}
                    <div className="line-clamp-3 whitespace-pre-wrap">{r.body || '—'}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {r.received_at ? new Date(r.received_at).toLocaleString() : ''}
                        {r.provider ? ` · ${r.provider}` : ''}
                      </span>
                      {classification ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                          {classification.replace(/_/g, ' ')}
                        </span>
                      ) : null}
                      {r.channel || draft?.channel ? (
                        <span className="rounded-full border px-2 py-0.5 text-[10px]">
                          {(r.channel || draft?.channel || '').replace(/_/g, ' ')}
                        </span>
                      ) : null}
                      {draftStatus ? (
                        <span className="rounded-full border px-2 py-0.5 text-[10px]">
                          reply: {draftStatus}
                        </span>
                      ) : null}
                    </div>

                    {draft && isDraft ? (
                      <div className="space-y-2 rounded-lg border border-dashed border-orange-200/80 bg-orange-50/40 p-2 dark:bg-orange-950/20">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          AI reply draft (not sent)
                        </div>
                        {draft.rationale ? (
                          <p className="text-[10px] text-muted-foreground">{draft.rationale}</p>
                        ) : null}
                        {draft.should_reply === false ? (
                          <p className="text-[11px] text-muted-foreground">
                            No reply recommended — approve to apply status only, or dismiss.
                          </p>
                        ) : (
                          <>
                            {(r.channel || draft.channel) === 'email' ||
                            (!r.channel && !draft.channel) ? (
                              <Input
                                className="h-8 text-xs"
                                value={fields.subject}
                                onChange={(e) =>
                                  setReplyDraftEdits((prev) => ({
                                    ...prev,
                                    [r.id]: { subject: e.target.value, body: fields.body },
                                  }))
                                }
                                placeholder="Reply subject"
                              />
                            ) : null}
                            <Textarea
                              className="min-h-[72px] text-xs"
                              value={fields.body}
                              onChange={(e) =>
                                setReplyDraftEdits((prev) => ({
                                  ...prev,
                                  [r.id]: { subject: fields.subject, body: e.target.value },
                                }))
                              }
                              placeholder={
                                (r.channel || draft.channel) === 'whatsapp_dm'
                                  ? 'WhatsApp reply'
                                  : (r.channel || draft.channel) === 'linkedin_dm'
                                    ? 'LinkedIn DM reply'
                                    : 'Reply body'
                              }
                            />
                          </>
                        )}
                        {draft.error ? (
                          <p className="text-[10px] text-destructive">{draft.error}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          {draft.should_reply !== false ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              disabled={busy || !r.runId}
                              onClick={() => void saveReplyDraft(r)}
                            >
                              Save draft
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={busy || !r.runId}
                            onClick={() => void approveReply(r)}
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Approve & send
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            disabled={busy || !r.runId}
                            onClick={() => void rejectReply(r)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {draftStatus === 'sent' || draftStatus === 'approved' ? (
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                        {draftStatus === 'sent' ? 'Live reply sent' : 'Approved (no send)'}
                        {draft?.sent_at
                          ? ` · ${new Date(draft.sent_at).toLocaleString()}`
                          : draft?.approved_at
                            ? ` · ${new Date(draft.approved_at).toLocaleString()}`
                            : ''}
                      </p>
                    ) : null}
                    {draftStatus === 'rejected' ? (
                      <p className="text-[10px] text-muted-foreground">Draft dismissed</p>
                    ) : null}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
