/**
 * Last-step CTA under outcome previews:
 * connect the right accounts → user clicks → publish/send via Composio
 * (never auto-publishes).
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { connectComposioConnector, formatConnectorError } from '@/lib/composio'
import { CONNECTOR_DISPLAY, connectorLabel, isConnectorActive } from '@/lib/connectorMeta'
import { CheckCircle2, Loader2, Rocket, Link2 } from 'lucide-react'
import { toast } from 'sonner'

export type OutcomeLiveKind =
  | 'email'
  | 'whatsapp'
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'social'
  | 'newsletter'
  | 'blog'
  | 'landing_page'
  | 'paid_ads'
  | 'voicebot'
  | 'crm_push'
  | 'crm_task'
  | 'sheets_push'
  | 'drive_save'
  | 'drive_share'

type LiveSpec = {
  /** Any-of: at least one must be connected */
  anyOf: string[]
  /** All-of: must also be connected */
  allOf?: string[]
  liveAction: string
  outcomeNoun: string
}

const LIVE_SPECS: Record<OutcomeLiveKind, LiveSpec> = {
  email: {
    anyOf: ['instantly', 'gmail'],
    liveAction: 'Send email',
    outcomeNoun: 'outbound email',
  },
  whatsapp: {
    anyOf: ['whatsapp'],
    liveAction: 'Send WhatsApp',
    outcomeNoun: 'WhatsApp message',
  },
  linkedin: {
    anyOf: ['linkedin'],
    liveAction: 'Publish to LinkedIn',
    outcomeNoun: 'LinkedIn post',
  },
  instagram: {
    anyOf: ['instagram'],
    liveAction: 'Publish to Instagram',
    outcomeNoun: 'Instagram post',
  },
  facebook: {
    anyOf: ['facebook'],
    liveAction: 'Publish to Facebook',
    outcomeNoun: 'Facebook post',
  },
  twitter: {
    anyOf: ['twitter'],
    liveAction: 'Publish to X',
    outcomeNoun: 'X post',
  },
  social: {
    anyOf: ['linkedin', 'instagram', 'facebook', 'twitter'],
    liveAction: 'Publish post',
    outcomeNoun: 'social post',
  },
  newsletter: {
    anyOf: ['mailchimp', 'klaviyo', 'gmail'],
    liveAction: 'Go live via email',
    outcomeNoun: 'newsletter',
  },
  blog: {
    anyOf: ['webflow', 'wordpress', 'google_docs'],
    liveAction: 'Publish article',
    outcomeNoun: 'blog article',
  },
  landing_page: {
    anyOf: ['webflow', 'wordpress'],
    liveAction: 'Publish landing page',
    outcomeNoun: 'landing page',
  },
  paid_ads: {
    anyOf: ['meta_ads', 'google_ads', 'linkedin_ads'],
    liveAction: 'Go live on paid ads',
    outcomeNoun: 'paid campaign',
  },
  voicebot: {
    // Twilio + Sarvam are env-configured (not Composio OAuth)
    anyOf: [],
    liveAction: 'Place voice calls',
    outcomeNoun: 'voice calls',
  },
  crm_push: {
    anyOf: ['hubspot', 'zoho_crm'],
    liveAction: 'Push to CRM',
    outcomeNoun: 'CRM record',
  },
  crm_task: {
    anyOf: ['hubspot', 'zoho_crm'],
    liveAction: 'Create CRM task',
    outcomeNoun: 'CRM task',
  },
  sheets_push: {
    anyOf: ['google_sheets'],
    liveAction: 'Push to Sheet',
    outcomeNoun: 'Google Sheet row',
  },
  drive_save: {
    anyOf: ['google_drive'],
    liveAction: 'Save to Drive',
    outcomeNoun: 'Drive file',
  },
  drive_share: {
    anyOf: ['google_drive'],
    liveAction: 'Share Drive link',
    outcomeNoun: 'shared Drive file',
  },
}

export function outcomeKindFromPlatform(platform?: string | null): OutcomeLiveKind {
  const p = String(platform || '').toLowerCase()
  if (p.includes('linkedin')) return 'linkedin'
  if (p.includes('instagram') || p === 'ig') return 'instagram'
  if (p.includes('facebook') || p === 'fb') return 'facebook'
  if (p.includes('twitter') || p === 'x') return 'twitter'
  return 'social'
}

function missingForSpec(spec: LiveSpec, connected: Set<string>): string[] {
  const missingAll = (spec.allOf || []).filter((id) => !connected.has(id))
  const anyOk = !spec.anyOf.length || spec.anyOf.some((id) => connected.has(id))
  const missingAny = anyOk ? [] : spec.anyOf
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [...missingAll, ...missingAny]) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function isReady(spec: LiveSpec, connected: Set<string>): boolean {
  const allOk = (spec.allOf || []).every((id) => connected.has(id))
  const anyOk = !spec.anyOf.length || spec.anyOf.some((id) => connected.has(id))
  return allOk && anyOk
}

export type OutcomeGoLiveResult = {
  ok?: boolean
  url?: string | null
  tool?: string
  connector?: string
  error?: string
}

/**
 * POST /api/outcomes/go-live — only call from a user click handler.
 */
export async function requestOutcomeGoLive(opts: {
  kind: OutcomeLiveKind
  workspaceId: string
  companyId?: string | null
  preferredConnector?: string
  payload?: Record<string, unknown>
}): Promise<OutcomeGoLiveResult> {
  const res = await fetch('/api/outcomes/go-live', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-workspace-id': opts.workspaceId,
    },
    body: JSON.stringify({
      kind: opts.kind,
      workspaceId: opts.workspaceId,
      companyId: opts.companyId ?? undefined,
      preferredConnector: opts.preferredConnector,
      payload: opts.payload ?? {},
    }),
  })
  const json = (await res.json().catch(() => ({}))) as OutcomeGoLiveResult
  if (!res.ok) {
    throw new Error(json.error || 'Go live failed')
  }
  return json
}

export function OutcomeGoLiveCta({
  kind,
  workspaceId,
  companyId,
  payload,
  preferredConnector,
  onGoLive,
  goLiveDisabled,
  className,
  requiredAllOf,
  requiredAnyOf,
  liveActionLabel,
}: {
  kind: OutcomeLiveKind
  workspaceId?: string | null
  companyId?: string | null
  /** Artifact fields passed to the go-live API on user click */
  payload?: Record<string, unknown>
  preferredConnector?: string
  /**
   * Custom handler (e.g. Instantly campaign launch in Lead Intelligence).
   * When omitted and `payload` is set, calls POST /api/outcomes/go-live.
   */
  onGoLive?: () => void | Promise<void | OutcomeGoLiveResult>
  goLiveDisabled?: boolean
  className?: string
  /** Override LiveSpec.allOf — every listed connector must be connected */
  requiredAllOf?: string[]
  /** Override LiveSpec.anyOf — empty means anyOf is not required */
  requiredAnyOf?: string[]
  /** Override button / copy label (e.g. Launch campaigns) */
  liveActionLabel?: string
}) {
  const baseSpec = LIVE_SPECS[kind]
  const spec: LiveSpec = {
    ...baseSpec,
    allOf: requiredAllOf ?? baseSpec.allOf,
    anyOf: requiredAnyOf ?? baseSpec.anyOf,
    liveAction: liveActionLabel || baseSpec.liveAction,
  }
  const { user } = useAuth()
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [connecting, setConnecting] = useState<string | null>(null)
  const [goingLive, setGoingLive] = useState(false)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setConnectedIds([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      const ids = (json?.connectors ?? [])
        .filter((c: { id?: string; connected?: boolean; status?: string }) => isConnectorActive(c))
        .map((c: { id: string }) => c.id)
      setConnectedIds(ids)
    } catch {
      setConnectedIds([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connected = new Set(connectedIds)
  const missing = missingForSpec(spec, connected)
  const ready = isReady(spec, connected)
  const publisherChoices =
    kind === 'blog' || kind === 'landing_page' || kind === 'newsletter' || kind === 'crm_push' || kind === 'crm_task'
      ? spec.anyOf.filter((id) => connected.has(id))
      : []
  const [cmsPublisher, setCmsPublisher] = useState<string | undefined>(preferredConnector)

  useEffect(() => {
    if (preferredConnector && connected.has(preferredConnector)) {
      setCmsPublisher(preferredConnector)
      return
    }
    if (publisherChoices.length && (!cmsPublisher || !publisherChoices.includes(cmsPublisher))) {
      setCmsPublisher(publisherChoices[0])
    }
  }, [preferredConnector, connectedIds.join('|'), kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (connectorId: string) => {
    if (!workspaceId) {
      toast.error('Select a workspace first')
      return
    }
    setConnecting(connectorId)
    try {
      const result = await connectComposioConnector({
        companyId: workspaceId,
        connectorId,
        userEmail: user?.email,
        userName: user?.name ?? user?.email,
        onConnected: () => {
          void refresh()
        },
      })
      if (result.status === 'closed') {
        await refresh()
        toast.message('Finish connecting in the popup, then try again if needed')
      } else if (result.status === 'connected') {
        await refresh()
        toast.success(`${connectorLabel(connectorId)} connected`)
      }
    } catch (err) {
      toast.error(formatConnectorError(err, 'Could not open connector'))
    } finally {
      setConnecting(null)
    }
  }

  const handleGoLive = async () => {
    setGoingLive(true)
    try {
      if (onGoLive) {
        const custom = await onGoLive()
        if (custom && typeof custom === 'object' && custom.url) {
          setLiveUrl(custom.url)
          window.open(custom.url, '_blank', 'noopener,noreferrer')
        }
        // Custom handlers (Lead Intelligence / Outreach) own their own toasts.
        return
      }
      if (!workspaceId) {
        toast.error('Select a workspace first')
        return
      }
      if (!payload) {
        toast.message(`Connectors ready — open this module’s launch control to ${spec.liveAction.toLowerCase()}.`)
        return
      }
      const result = await requestOutcomeGoLive({
        kind,
        workspaceId,
        companyId,
        preferredConnector: cmsPublisher || preferredConnector,
        payload,
      })
      if (result.url) {
        setLiveUrl(result.url)
        window.open(result.url, '_blank', 'noopener,noreferrer')
      }
      toast.success(
        result.tool
          ? `Live via ${result.tool.replace(/_/g, ' ').toLowerCase()}`
          : `${spec.liveAction} succeeded`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Go live failed')
    } finally {
      setGoingLive(false)
    }
  }

  if (!workspaceId) {
    return (
      <div className={cn('rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200', className)}>
        Select a workspace to connect accounts and make this {spec.outcomeNoun} live.
      </div>
    )
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-xs text-muted-foreground', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking connectors…
      </div>
    )
  }

  if (!ready) {
    return (
      <div className={cn('rounded-xl border border-orange-500/35 bg-gradient-to-br from-orange-500/10 via-background to-amber-500/5 px-4 py-3 space-y-3', className)}>
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <div>
            <p className="text-sm font-semibold text-foreground">Make it live</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {kind === 'crm_push' || kind === 'crm_task'
                ? 'Connect HubSpot or Zoho CRM, then click the action — nothing syncs until you do.'
                : kind === 'sheets_push'
                  ? 'Connect Google Sheets, then click Push to Sheet — nothing writes until you do.'
                  : kind === 'drive_save' || kind === 'drive_share'
                    ? 'Connect Google Drive, then click the action — nothing uploads or shares until you do.'
                : `This is still a draft. Connect ${missing.map(connectorLabel).join(' or ')}, then click ${spec.liveAction} — nothing publishes until you do.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {missing.map((id) => {
            const meta = CONNECTOR_DISPLAY[id] ?? { label: id, bg: 'bg-zinc-600' }
            return (
              <Button
                key={id}
                size="sm"
                className="h-8 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                disabled={connecting === id}
                onClick={() => void handleConnect(id)}
              >
                {connecting === id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white', meta.bg)}>
                    {meta.label.slice(0, 2).toUpperCase()}
                  </span>
                )}
                Connect {meta.label}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-emerald-500/35 bg-emerald-500/5 px-4 py-3 flex flex-wrap items-center gap-3', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            {liveUrl ? 'Live' : 'Ready to go live'}
          </p>
          <p className="text-xs text-muted-foreground">
            {liveUrl
              ? 'Published on your click. Open the live link anytime.'
              : `Connectors linked. Nothing is live until you click ${spec.liveAction}.`}
          </p>
          {publisherChoices.length > 1 && !liveUrl ? (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{kind === 'newsletter' ? 'Send via' : 'Publish to'}</span>
              <select
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                value={cmsPublisher || publisherChoices[0]}
                onChange={(e) => setCmsPublisher(e.target.value)}
              >
                {publisherChoices.map((id) => (
                  <option key={id} value={id}>
                    {connectorLabel(id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex text-xs font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Open live result
            </a>
          ) : null}
        </div>
      </div>
      <Button
        size="sm"
        className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
        disabled={goLiveDisabled || goingLive || (!onGoLive && !payload)}
        onClick={() => void handleGoLive()}
      >
        {goingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
        {goingLive
          ? 'Working…'
          : liveUrl
            ? `Re-${spec.liveAction}`
            : cmsPublisher && publisherChoices.length
              ? `${spec.liveAction} → ${connectorLabel(cmsPublisher)}`
              : spec.liveAction}
      </Button>
    </div>
  )
}
