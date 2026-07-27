import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ExternalLink,
  Loader2,
  Phone,
  RefreshCw,
  StickyNote,
  ListTodo,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { OutcomeGoLiveCta } from '@/components/outcome-previews'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { getActiveAgentContext } from '@/lib/agentContext'
import { cn } from '@/lib/utils'

type CrmContact = {
  id: string
  name?: string
  title?: string
  company?: string
  email?: string
  phone?: string
  status?: string
  source?: string
  connector?: string
  url?: string | null
  module?: string
}

type VoiceCallRow = {
  callSid?: string
  leadName?: string | null
  leadPhone?: string | null
  leadEmail?: string | null
  summary?: string
  leadScore?: number
  leadStatus?: string
  leadTemperature?: string
  scorecard?: {
    summary?: string
    overallScore?: number
    status?: string
    leadTemperature?: string
    nextAction?: string
    humanCloserBrief?: string
  } | null
  turns?: unknown[]
  updatedAt?: string
}

function initials(name?: string) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

export function CrmFlow({ onModuleSelect }: { onModuleSelect?: (id: string) => void }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id || getActiveAgentContext().workspaceId || ''
  const companyId = getActiveAgentContext().companyId || workspaceId

  const [query, setQuery] = useState('')
  const [connector, setConnector] = useState<'hubspot' | 'zoho_crm' | ''>('')
  const [connected, setConnected] = useState<string[]>([])
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [voiceCalls, setVoiceCalls] = useState<VoiceCallRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refreshContacts = useCallback(async () => {
    if (!workspaceId) {
      setError('Select a workspace first')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        workspaceId,
        companyId,
        limit: '50',
      })
      if (connector) params.set('connector', connector)
      if (query.trim()) params.set('q', query.trim())

      const res = await fetch(`/api/crm/contacts?${params}`, {
        headers: { 'x-workspace-id': workspaceId },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setContacts([])
        setConnected(Array.isArray(json.connected) ? json.connected : [])
        setError(json.error || 'Could not load CRM contacts')
        return
      }
      setContacts(Array.isArray(json.contacts) ? json.contacts : [])
      setConnected(Array.isArray(json.connected) ? json.connected : [])
      if (json.connector) setConnector(json.connector)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CRM load failed')
      setContacts([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId, companyId, connector, query])

  const refreshVoiceCalls = useCallback(async () => {
    try {
      const res = await fetch('/api/voicebot/twilio/calls')
      const json = await res.json().catch(() => ({}))
      const rows = Array.isArray(json?.calls) ? json.calls : Array.isArray(json) ? json : []
      setVoiceCalls(rows.filter((r: VoiceCallRow) => r.summary || r.scorecard?.summary || r.leadScore != null))
    } catch {
      setVoiceCalls([])
    }
  }, [])

  useEffect(() => {
    void refreshContacts()
    void refreshVoiceCalls()
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const scoredByPhone = useMemo(() => {
    const map = new Map<string, VoiceCallRow>()
    for (const call of voiceCalls) {
      const key = normalizePhone(call.leadPhone)
      if (key) map.set(key, call)
    }
    return map
  }, [voiceCalls])

  const selected = contacts.find((c) => c.id === selectedId) || null
  const selectedCall = selected
    ? scoredByPhone.get(normalizePhone(selected.phone)) ||
      voiceCalls.find(
        (c) =>
          selected.email &&
          c.leadEmail &&
          c.leadEmail.toLowerCase() === selected.email.toLowerCase(),
      )
    : null

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">#crm</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live contacts from HubSpot or Zoho. Row actions sync notes, tasks, and voicebot scorecards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setConnector(id as 'hubspot' | 'zoho_crm')}
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-medium capitalize',
                connector === id
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-border bg-background text-muted-foreground hover:border-orange-300',
              )}
            >
              {id === 'zoho_crm' ? 'Zoho CRM' : 'HubSpot'}
            </button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={loading || !workspaceId}
            onClick={() => {
              void refreshContacts()
              void refreshVoiceCalls()
            }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {!workspaceId ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Select a workspace to load CRM.</CardContent>
        </Card>
      ) : connected.length === 0 && error ? (
        <OutcomeGoLiveCta
          kind="crm_push"
          workspaceId={workspaceId}
          companyId={companyId}
          liveActionLabel="Connect CRM"
        />
      ) : connected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Connected: {connected.map((id) => (id === 'zoho_crm' ? 'Zoho CRM' : 'HubSpot')).join(' · ')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void refreshContacts()
            }}
            placeholder="Search name, email, phone…"
            className="h-9 pl-8"
          />
        </div>
        <Button type="button" size="sm" className="h-9 bg-orange-500 hover:bg-orange-600" onClick={() => void refreshContacts()}>
          Search
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="overflow-hidden rounded-[1.15rem] border-border/70">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Contacts</CardTitle>
                <CardDescription>
                  {loading ? 'Loading…' : `${contacts.length} from ${connector === 'zoho_crm' ? 'Zoho CRM' : connector || 'CRM'}`}
                </CardDescription>
              </div>
              {workspaceId && contacts.length > 0 ? (
                <OutcomeGoLiveCta
                  kind="sheets_push"
                  workspaceId={workspaceId}
                  companyId={companyId}
                  liveActionLabel="Export table to Sheet"
                  className="max-w-sm"
                  payload={{
                    spreadsheet_title: 'Marqq CRM Export',
                    worksheet_name: 'Contacts',
                    source: 'crm_table',
                    rows: contacts.map((c) => ({
                      lead_name: c.name,
                      lead_email: c.email,
                      lead_phone: c.phone,
                      company: c.company,
                      lead_status: c.status,
                      source: c.connector || 'crm',
                    })),
                  }}
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!contacts.length && !loading ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No contacts yet. Connect HubSpot or Zoho, then refresh.
              </p>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/90 text-[10px] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                    <tr>
                      {['Contact', 'Company', 'Phone', 'Stage', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-2.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((row) => {
                      const call = scoredByPhone.get(normalizePhone(row.phone))
                      const active = selectedId === row.id
                      return (
                        <tr
                          key={`${row.connector}-${row.id}`}
                          onClick={() => setSelectedId(row.id)}
                          className={cn(
                            'border-t border-border/60 cursor-pointer',
                            active ? 'bg-orange-500/10' : 'hover:bg-muted/40',
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-[10px] font-bold text-white">
                                {initials(row.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">{row.name || '—'}</p>
                                <p className="truncate text-[11px] text-muted-foreground">{row.email || row.title || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.company || '—'}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{row.phone || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {row.status || 'lead'}
                            </span>
                            {call?.leadScore != null ? (
                              <span className="ml-1 inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                                {call.leadScore}/100
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-[10px]"
                                onClick={() => setSelectedId(row.id)}
                              >
                                <StickyNote className="h-3 w-3" />
                                Note
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-[10px]"
                                onClick={() => setSelectedId(row.id)}
                              >
                                <ListTodo className="h-3 w-3" />
                                Task
                              </Button>
                              {row.phone ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-[10px]"
                                  onClick={() => onModuleSelect?.('ai-voice-bot')}
                                >
                                  <Phone className="h-3 w-3" />
                                  Call
                                </Button>
                              ) : null}
                              {row.url ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1 px-2 text-[10px]"
                                  onClick={() => window.open(row.url!, '_blank', 'noopener,noreferrer')}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[1.15rem] border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Row actions</CardTitle>
              <CardDescription>
                {selected ? selected.name || selected.email || selected.id : 'Select a contact'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selected ? (
                <p className="text-sm text-muted-foreground">Pick a row to unlock CRM CTAs.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                    <p className="font-semibold text-foreground">{selected.name}</p>
                    <p className="text-muted-foreground">{selected.email || 'No email'}</p>
                    <p className="font-mono text-muted-foreground">{selected.phone || 'No phone'}</p>
                    {selectedCall?.summary || selectedCall?.scorecard?.summary ? (
                      <p className="mt-2 line-clamp-4 text-muted-foreground">
                        <span className="mr-1 rounded border px-1 text-[9px] uppercase tracking-wide">AI</span>
                        {selectedCall.summary || selectedCall.scorecard?.summary}
                      </p>
                    ) : null}
                  </div>

                  {workspaceId ? (
                    <>
                      <OutcomeGoLiveCta
                        kind="crm_push"
                        workspaceId={workspaceId}
                        companyId={companyId}
                        preferredConnector={selected.connector || connector || undefined}
                        liveActionLabel="Add note / sync scorecard"
                        payload={{
                          hubspot_contact_id: selected.connector === 'hubspot' ? selected.id : undefined,
                          zoho_lead_id: selected.connector === 'zoho_crm' ? selected.id : undefined,
                          contact_id: selected.id,
                          lead_name: selected.name,
                          lead_phone: selected.phone,
                          lead_email: selected.email,
                          company: selected.company,
                          summary:
                            selectedCall?.summary ||
                            selectedCall?.scorecard?.summary ||
                            `CRM sync from Marqq for ${selected.name}`,
                          scorecard: selectedCall?.scorecard,
                          lead_score: selectedCall?.leadScore ?? selectedCall?.scorecard?.overallScore,
                          lead_status: selectedCall?.leadStatus || selectedCall?.scorecard?.status || selected.status,
                          turns: selectedCall?.turns,
                          call_sid: selectedCall?.callSid,
                        }}
                      />
                      <OutcomeGoLiveCta
                        kind="crm_task"
                        workspaceId={workspaceId}
                        companyId={companyId}
                        preferredConnector={selected.connector || connector || undefined}
                        liveActionLabel="Create follow-up task"
                        payload={{
                          hubspot_contact_id: selected.connector === 'hubspot' ? selected.id : undefined,
                          contact_id: selected.id,
                          lead_name: selected.name,
                          lead_phone: selected.phone,
                          lead_email: selected.email,
                          task_subject:
                            selectedCall?.scorecard?.nextAction ||
                            `Follow up with ${selected.name || 'contact'}`,
                          task_body:
                            selectedCall?.scorecard?.humanCloserBrief ||
                            selectedCall?.summary ||
                            selectedCall?.scorecard?.summary ||
                            `Follow up from Marqq CRM channel`,
                          task_type: selected.phone ? 'CALL' : 'TODO',
                          summary: selectedCall?.summary || selectedCall?.scorecard?.summary,
                          scorecard: selectedCall?.scorecard,
                        }}
                      />
                      <OutcomeGoLiveCta
                        kind="sheets_push"
                        workspaceId={workspaceId}
                        companyId={companyId}
                        liveActionLabel="Push to Sheet"
                        payload={{
                          spreadsheet_title: 'Marqq CRM Export',
                          worksheet_name: 'Contacts',
                          source: 'crm',
                          lead_name: selected.name,
                          lead_phone: selected.phone,
                          lead_email: selected.email,
                          company: selected.company,
                          lead_status: selectedCall?.leadStatus || selectedCall?.scorecard?.status || selected.status,
                          lead_score: selectedCall?.leadScore ?? selectedCall?.scorecard?.overallScore,
                          summary: selectedCall?.summary || selectedCall?.scorecard?.summary,
                          next_action: selectedCall?.scorecard?.nextAction,
                          call_sid: selectedCall?.callSid,
                          scorecard: selectedCall?.scorecard,
                        }}
                      />
                      <OutcomeGoLiveCta
                        kind="drive_save"
                        workspaceId={workspaceId}
                        companyId={companyId}
                        liveActionLabel="Save to Drive"
                        payload={{
                          title: `${selected.name || selected.email || 'Contact'} — Marqq CRM note`,
                          folder_name: 'Marqq Exports',
                          lead_name: selected.name,
                          lead_phone: selected.phone,
                          lead_email: selected.email,
                          company: selected.company,
                          summary: selectedCall?.summary || selectedCall?.scorecard?.summary,
                          scorecard: selectedCall?.scorecard,
                          lead_score: selectedCall?.leadScore ?? selectedCall?.scorecard?.overallScore,
                          lead_status: selected.status,
                          call_sid: selectedCall?.callSid,
                        }}
                      />
                      <OutcomeGoLiveCta
                        kind="drive_share"
                        workspaceId={workspaceId}
                        companyId={companyId}
                        liveActionLabel="Share Drive link"
                        payload={{
                          title: `${selected.name || selected.email || 'Contact'} — Marqq CRM note`,
                          folder_name: 'Marqq Exports',
                          share_type: 'anyone',
                          role: 'reader',
                          lead_name: selected.name,
                          lead_phone: selected.phone,
                          lead_email: selected.email,
                          company: selected.company,
                          summary: selectedCall?.summary || selectedCall?.scorecard?.summary,
                          scorecard: selectedCall?.scorecard,
                          call_sid: selectedCall?.callSid,
                        }}
                      />
                    </>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.15rem] border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Voice outcomes to push</CardTitle>
              <CardDescription>Scored calls waiting for CRM sync</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!voiceCalls.length ? (
                <p className="text-sm text-muted-foreground">No scored voicebot calls yet.</p>
              ) : (
                voiceCalls.slice(0, 8).map((call) => (
                  <div
                    key={call.callSid || `${call.leadPhone}-${call.updatedAt}`}
                    className="rounded-xl border border-border/60 px-3 py-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{call.leadName || call.leadPhone || 'Lead'}</p>
                        <p className="text-[11px] text-muted-foreground">{call.leadPhone}</p>
                      </div>
                      {call.leadScore != null || call.scorecard?.overallScore != null ? (
                        <span className="text-xs font-semibold text-orange-600">
                          {call.leadScore ?? call.scorecard?.overallScore}/100
                        </span>
                      ) : null}
                    </div>
                    {(call.summary || call.scorecard?.summary) && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">
                        {call.summary || call.scorecard?.summary}
                      </p>
                    )}
                    {workspaceId ? (
                      <div className="space-y-2">
                        <OutcomeGoLiveCta
                          kind="crm_push"
                          workspaceId={workspaceId}
                          companyId={companyId}
                          preferredConnector={connector || undefined}
                          liveActionLabel="Push to CRM"
                          payload={{
                            lead_name: call.leadName,
                            lead_phone: call.leadPhone,
                            lead_email: call.leadEmail,
                            call_sid: call.callSid,
                            summary: call.summary || call.scorecard?.summary,
                            lead_score: call.leadScore ?? call.scorecard?.overallScore,
                            lead_status: call.leadStatus || call.scorecard?.status,
                            lead_temperature: call.leadTemperature || call.scorecard?.leadTemperature,
                            scorecard: call.scorecard,
                            turns: call.turns,
                          }}
                        />
                        <OutcomeGoLiveCta
                          kind="sheets_push"
                          workspaceId={workspaceId}
                          companyId={companyId}
                          liveActionLabel="Push to Sheet"
                          payload={{
                            spreadsheet_title: 'Marqq Voice Outcomes',
                            worksheet_name: 'Calls',
                            source: 'voicebot',
                            lead_name: call.leadName,
                            lead_phone: call.leadPhone,
                            lead_email: call.leadEmail,
                            call_sid: call.callSid,
                            summary: call.summary || call.scorecard?.summary,
                            lead_score: call.leadScore ?? call.scorecard?.overallScore,
                            lead_status: call.leadStatus || call.scorecard?.status,
                            next_action: call.scorecard?.nextAction,
                            scorecard: call.scorecard,
                          }}
                        />
                        <OutcomeGoLiveCta
                          kind="drive_save"
                          workspaceId={workspaceId}
                          companyId={companyId}
                          liveActionLabel="Save to Drive"
                          payload={{
                            title: `${call.leadName || call.leadPhone || 'Call'} — voice summary`,
                            folder_name: 'Marqq Exports',
                            lead_name: call.leadName,
                            lead_phone: call.leadPhone,
                            lead_email: call.leadEmail,
                            summary: call.summary || call.scorecard?.summary,
                            scorecard: call.scorecard,
                            call_sid: call.callSid,
                          }}
                        />
                        <OutcomeGoLiveCta
                          kind="drive_share"
                          workspaceId={workspaceId}
                          companyId={companyId}
                          liveActionLabel="Share Drive link"
                          payload={{
                            title: `${call.leadName || call.leadPhone || 'Call'} — voice summary`,
                            folder_name: 'Marqq Exports',
                            share_type: 'anyone',
                            role: 'reader',
                            lead_name: call.leadName,
                            lead_phone: call.leadPhone,
                            lead_email: call.leadEmail,
                            summary: call.summary || call.scorecard?.summary,
                            scorecard: call.scorecard,
                            call_sid: call.callSid,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  toast.message('Open #voice-bot to place more calls')
                  onModuleSelect?.('ai-voice-bot')
                }}
              >
                Open voice bot
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
