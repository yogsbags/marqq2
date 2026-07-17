type ConnectComposioOptions = {
  companyId: string
  connectorId: string
  userEmail?: string | null
  userName?: string | null
  onConnected?: (connectorId: string) => void | Promise<void>
}

/** Turn API/error payloads into a toast-safe string (avoids `[object Object]`). */
export function formatConnectorError(error: unknown, fallback = 'Connect failed'): string {
  if (error == null) return fallback
  if (typeof error === 'string') {
    const trimmed = error.trim()
    return trimmed && trimmed !== '[object Object]' ? trimmed : fallback
  }
  if (error instanceof Error) {
    const msg = error.message?.trim()
    return msg && msg !== '[object Object]' ? msg : fallback
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    for (const key of ['message', 'error', 'detail', 'description']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() && value.trim() !== '[object Object]') {
        return value.trim()
      }
      if (value && typeof value === 'object') {
        const nested = formatConnectorError(value, '')
        if (nested) return nested
      }
    }
    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}' && json !== 'null') return json.slice(0, 280)
    } catch {
      /* ignore */
    }
  }
  return fallback
}

type IntegrationConnectedDetail = {
  companyId: string
  connectorId: string
}

const COMPOSIO_SUCCESS_EVENT = 'marqq:integration-connected'

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isActiveConnectorRecord(connector: { connected?: boolean; status?: string } | null | undefined) {
  if (!connector) return false
  if (connector.connected) return true
  const status = String(connector.status || '').toLowerCase()
  return status === 'active' || status === 'connected' || status === 'success'
}

/** Poll Integrations until Composio marks the connector active (OAuth can lag the popup close). */
async function waitForConnectorActive(
  companyId: string,
  connectorId: string,
  {
    attempts = 8,
    delayMs = 900,
  }: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      const match = (json?.connectors ?? []).find((c: { id?: string }) => c.id === connectorId)
      if (isActiveConnectorRecord(match)) return true
    } catch {
      /* retry */
    }
    if (i < attempts - 1) await sleep(delayMs)
  }
  return false
}

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
  // Must open synchronously from the button click; opening after the async
  // backend call is commonly blocked by Safari/Chrome popup protection.
  const popup = window.open(
    'about:blank',
    'composio_oauth',
    'width=600,height=700,left=200,top=100'
  )

  if (popup) {
    popup.document.title = 'Connecting account...'
    popup.document.body.innerHTML =
      '<div style="font-family: system-ui, -apple-system, sans-serif; padding: 24px;">Opening secure connection...</div>'
  }

  const response = await fetch('/api/integrations/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyId, connectorId }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    popup?.close()
    throw new Error(formatConnectorError(json?.error ?? json?.message ?? json, 'Could not start connector OAuth'))
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
    popup?.close()
    await finalize(connectorId)
    return { status: 'connected' as const, connectorId }
  }

  if (!popup) {
    throw new Error('Unable to open the OAuth popup')
  }

  popup.location.href = json.redirectUrl

  return await new Promise<{ status: 'connected' | 'closed'; connectorId?: string }>((resolve) => {
    let settled = false

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      window.clearInterval(pollTimer)
    }

    const settleConnected = async (resolvedConnectorId: string) => {
      if (settled) return
      settled = true
      cleanup()
      await finalize(resolvedConnectorId)
      resolve({ status: 'connected', connectorId: resolvedConnectorId })
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'composio_oauth_success') return

      const resolvedConnectorId = String(event.data?.connectorId || connectorId)
      if (event.data?.connectorId && resolvedConnectorId !== connectorId) return
      await settleConnected(resolvedConnectorId)
    }

    const pollTimer = window.setInterval(() => {
      if (!popup || popup.closed) {
        if (settled) return
        settled = true
        cleanup()
        // Popup often closes before postMessage arrives (or APP_URL callback misses).
        // Verify with Composio status before treating as abandoned.
        void (async () => {
          const active = await waitForConnectorActive(companyId, connectorId)
          if (active) {
            await finalize(connectorId)
            resolve({ status: 'connected', connectorId })
            return
          }
          resolve({ status: 'closed' })
        })()
      }
    }, 1500)

    window.addEventListener('message', handleMessage)
  })
}
