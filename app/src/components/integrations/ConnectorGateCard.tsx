import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { connectComposioConnector } from '@/lib/composio'
import { CONNECTOR_DISPLAY } from '@/lib/connectorMeta'
import { Link2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  missingConnectorIds: string[]
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
 */
export function ConnectorGateCard({
  missingConnectorIds,
  taskLabel,
  workspaceId,
  hardGate = true,
  onConnected,
  onSkip,
  className,
}: Props) {
  const [connecting, setConnecting] = useState<string | null>(null)
  const { user } = useAuth()
  const shown = missingConnectorIds.slice(0, 4)

  const handleConnect = async (connectorId: string) => {
    if (!workspaceId) return
    setConnecting(connectorId)
    try {
      await connectComposioConnector({
        companyId: workspaceId,
        connectorId,
        userEmail: user?.email,
        userName: user?.name ?? user?.email,
        onConnected: () => onConnected(connectorId),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open connector popup')
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
          return (
            <div
              key={id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2',
                hardGate ? 'border-white/10 bg-black/30' : 'border-border/60 bg-background/80',
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
              <Button
                type="button"
                size="sm"
                disabled={!workspaceId || connecting === id}
                onClick={() => void handleConnect(id)}
                className="h-8 bg-orange-500 px-3 text-xs text-white hover:bg-orange-600"
              >
                {connecting === id ? 'Popup…' : 'Connect'}
              </Button>
            </div>
          )
        })}
      </div>
      {onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          className={cn(
            'mt-3 text-xs transition-colors',
            hardGate
              ? 'text-zinc-500 hover:text-zinc-300'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {hardGate ? 'Cancel — stay on this channel' : 'Continue without connecting'}
        </button>
      ) : null}
    </div>
  )
}
