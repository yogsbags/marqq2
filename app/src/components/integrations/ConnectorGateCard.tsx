import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { connectComposioConnector, formatConnectorError } from '@/lib/composio'
import { CONNECTOR_DISPLAY, isConnectorActive } from '@/lib/connectorMeta'
import { Check, Link2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  /** Connectors to list in the card (missing and/or already connected). */
  connectorIds?: string[]
  /** @deprecated Prefer connectorIds — kept for older call sites */
  missingConnectorIds?: string[]
  /** IDs already linked for this workspace */
  connectedConnectorIds?: string[]
  taskLabel: string
  workspaceId: string | undefined
  /** Hard gate — must connect at least one before continuing */
  hardGate?: boolean
  onConnected: (connectorId: string) => void
  onSkip?: () => void
  className?: string
}

/**
 * Blocks (or soft-nudges) a task channel until the user connects a Composio account.
 * Connect opens the OAuth popup via connectComposioConnector.
 * Already-linked accounts stay visible with a Connected badge.
 */
export function ConnectorGateCard({
  connectorIds,
  missingConnectorIds,
  connectedConnectorIds = [],
  taskLabel,
  workspaceId,
  hardGate = true,
  onConnected,
  onSkip,
  className,
}: Props) {
  const [connecting, setConnecting] = useState<string | null>(null)
  const { user } = useAuth()
  const connectedSet = new Set(connectedConnectorIds)

  const shown = (connectorIds?.length ? connectorIds : missingConnectorIds || [])
    .filter(Boolean)
    .slice(0, 6)

  const handleConnect = async (connectorId: string) => {
    if (!workspaceId) return
    if (connectedSet.has(connectorId)) {
      onConnected(connectorId)
      toast.success('Already connected')
      return
    }

    setConnecting(connectorId)
    try {
      const result = await connectComposioConnector({
        companyId: workspaceId,
        connectorId,
        userEmail: user?.email,
        userName: user?.name ?? user?.email,
        onConnected: () => onConnected(connectorId),
      })

      // If popup closed without postMessage, connectComposioConnector already
      // polled Integrations; if still closed, do one more explicit check.
      if (result.status === 'closed') {
        const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
        const json = res.ok ? await res.json().catch(() => ({})) : {}
        const match = (json?.connectors ?? []).find((c: { id?: string }) => c.id === connectorId)
        if (isConnectorActive(match)) {
          onConnected(connectorId)
          toast.success('Account connected')
          return
        }
        toast.error('Connection not completed — finish the popup and try again')
      } else if (result.status === 'connected') {
        toast.success('Account connected')
      }
    } catch (error) {
      // Integrations may already show this as connected — re-check before toasting
      try {
        const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
        const json = res.ok ? await res.json().catch(() => ({})) : {}
        const match = (json?.connectors ?? []).find((c: { id?: string }) => c.id === connectorId)
        if (isConnectorActive(match)) {
          onConnected(connectorId)
          toast.success('Already connected — continuing.')
          return
        }
      } catch {
        /* ignore */
      }
      toast.error(formatConnectorError(error, 'Could not open connector popup'))
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4',
        hardGate
          ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-orange-500/10 text-zinc-100'
          : 'border-border/70 bg-muted/30',
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        {hardGate ? (
          <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden />
        ) : (
          <Link2 className="h-4 w-4 text-orange-500" aria-hidden />
        )}
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-[0.18em]',
            hardGate ? 'text-amber-400' : 'text-orange-600 dark:text-orange-400',
          )}
        >
          {hardGate ? 'Connector required' : 'Connect for richer data'}
        </p>
      </div>
      <p className={cn('text-sm mb-3', hardGate ? 'text-zinc-300' : 'text-foreground')}>
        {hardGate
          ? `${taskLabel} needs at least one connected account before draft or send. Connect one:`
          : `${taskLabel} can use crawl + GTM context now. Connect an account for live enrichment:`}
      </p>
      <div className="space-y-2">
        {shown.map((id) => {
          const meta = CONNECTOR_DISPLAY[id] ?? { label: id, bg: 'bg-gray-500' }
          const isConnected = connectedSet.has(id)
          return (
            <div
              key={id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2',
                hardGate ? 'border-white/10 bg-black/30' : 'border-border/60 bg-background/80',
                isConnected && 'border-emerald-500/30 bg-emerald-500/5',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
                  meta.bg,
                )}
              >
                {meta.label.slice(0, 2).toUpperCase()}
              </span>
              <span className={cn('flex-1 text-sm', hardGate ? 'text-zinc-100' : 'text-foreground')}>
                {meta.label}
              </span>
              {isConnected ? (
                <span
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium',
                    hardGate
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  )}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Connected
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={!workspaceId || connecting === id}
                  onClick={() => void handleConnect(id)}
                  className="h-8 bg-orange-500 px-3 text-xs text-white hover:bg-orange-600"
                >
                  {connecting === id ? 'Popup…' : 'Connect'}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {onSkip ? (
        <Button
          type="button"
          onClick={onSkip}
          className={cn(
            'mt-4 h-10 w-full text-sm font-semibold',
            hardGate
              ? 'bg-white/10 text-zinc-100 hover:bg-white/15'
              : connectedConnectorIds.length > 0
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'border border-orange-500/40 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 dark:text-orange-300',
          )}
          variant={hardGate ? 'secondary' : 'default'}
        >
          {hardGate
            ? 'Cancel — stay on this channel'
            : connectedConnectorIds.length > 0
              ? 'Continue'
              : 'Continue without connecting'}
        </Button>
      ) : null}
    </div>
  )
}
