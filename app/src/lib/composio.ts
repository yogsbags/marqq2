type ConnectComposioOptions = {
  companyId: string
  connectorId: string
  userEmail?: string | null
  userName?: string | null
  onConnected?: (connectorId: string) => void | Promise<void>
}

type IntegrationConnectedDetail = {
  companyId: string
  connectorId: string
}

const COMPOSIO_SUCCESS_EVENT = 'marqq:integration-connected'

async function notifyAgentIntegrationConnected({
  connectorId,
  companyId,
  userEmail,
  userName,
}: IntegrationConnectedDetail & {
  userEmail?: string | null
  userName?: string | null
}) {
  if (!userEmail) return

  try {
    await fetch('/api/agents/integration-connected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId,
        workspaceId: companyId,
        userEmail,
        userName,
      }),
    })
  } catch {
    // Ignore notification failures. The actual OAuth connection already succeeded.
  }
}

function emitIntegrationConnected(detail: IntegrationConnectedDetail) {
  window.dispatchEvent(new CustomEvent<IntegrationConnectedDetail>(COMPOSIO_SUCCESS_EVENT, { detail }))
}

export function addIntegrationConnectedListener(
  handler: (detail: IntegrationConnectedDetail) => void
) {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<IntegrationConnectedDetail>
    if (!customEvent.detail?.companyId || !customEvent.detail?.connectorId) return
    handler(customEvent.detail)
  }

  window.addEventListener(COMPOSIO_SUCCESS_EVENT, listener)
  return () => window.removeEventListener(COMPOSIO_SUCCESS_EVENT, listener)
}

export async function connectComposioConnector({
  companyId,
  connectorId,
  userEmail,
  userName,
  onConnected,
}: ConnectComposioOptions) {
  const response = await fetch('/api/integrations/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyId, connectorId }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(json?.error || 'connect failed')
  }

  const finalize = async (resolvedConnectorId: string) => {
    emitIntegrationConnected({ companyId, connectorId: resolvedConnectorId })
    await notifyAgentIntegrationConnected({
      companyId,
      connectorId: resolvedConnectorId,
      userEmail,
      userName,
    })
    await onConnected?.(resolvedConnectorId)
  }

  if (!json.redirectUrl) {
    await finalize(connectorId)
    return { status: 'connected' as const, connectorId }
  }

  const popup = window.open(
    json.redirectUrl,
    'composio_oauth',
    'width=600,height=700,left=200,top=100'
  )

  if (!popup) {
    throw new Error('Unable to open the OAuth popup')
  }

  return await new Promise<{ status: 'connected' | 'closed'; connectorId?: string }>((resolve) => {
    let settled = false

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      window.clearInterval(pollTimer)
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'composio_oauth_success') return

      const resolvedConnectorId = String(event.data?.connectorId || connectorId)
      if (event.data?.connectorId && resolvedConnectorId !== connectorId) return
      if (settled) return

      settled = true
      cleanup()
      await finalize(resolvedConnectorId)
      resolve({ status: 'connected', connectorId: resolvedConnectorId })
    }

    const pollTimer = window.setInterval(() => {
      if (!popup || popup.closed) {
        if (settled) return
        settled = true
        cleanup()
        resolve({ status: 'closed' })
      }
    }, 1500)

    window.addEventListener('message', handleMessage)
  })
}
