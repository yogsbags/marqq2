/**
 * MCP Router — routes the right integrations to the right agents.
 *
 * Architecture:
 *   Agent declares connectors in platform/crewai/agents/{name}/mcp.json
 *   Router fetches tool schemas from Composio for those connectors
 *   Backend injects tools into Groq function-calling, executes tool_calls via Composio
 *
 * Composio handles: OAuth per-user, token refresh, tool schema generation
 * This module handles: agent ↔ connector mapping, tool injection, execution routing
 *
 * Stub mode: if COMPOSIO_API_KEY is not set, tools are returned as descriptive stubs
 * and execution returns a "not connected" message — agents still run but without live data.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, '..', 'crewai', 'agents')

// ─── Connector → Composio app name mapping ────────────────────────────────────
// Composio app names: https://app.composio.dev/apps

export const CONNECTOR_APP_MAP = {
  // Paid ads
  google_ads:       'googleads',
  meta_ads:         'facebookads',
  linkedin_ads:     'linkedinads',
  // Organic social
  facebook_pages:   'facebookpages',
  instagram:        'instagram',
  linkedin:         'linkedin',
  // Email & CRM
  gmail:            'gmail',
  outlook:          'outlook',
  mailchimp:        'mailchimp',
  zoho_crm:         'zohocrm',
  hubspot:          'hubspot',
  salesforce:       'salesforce',
  // Analytics
  ga4:              'googleanalytics',
  gsc:              'googlesearchconsole',
  google_sheets:    'googlesheets',
  microsoft_sheets: 'microsoftexcel',
  // SEO
  semrush:          'semrush',
  ahrefs:           'ahrefs',
  // Product analytics
  moengage:         'moengage',
  mixpanel:         'mixpanel',
  clevertap:        'clevertap',
  // CMS / eComm / data
  wordpress:        'wordpress',
  shopify:          'shopify',
  snowflake:        'snowflake',
}

// ─── Lazy Composio SDK import ─────────────────────────────────────────────────

let _composioSdk = null
async function getComposioSdk() {
  if (_composioSdk !== null) return _composioSdk
  try {
    const mod = await import('composio-core')
    _composioSdk = mod
  } catch {
    _composioSdk = false // unavailable
  }
  return _composioSdk
}

function getToolset(entityId = 'default') {
  const sdk = _composioSdk
  if (!sdk || !sdk.OpenAIToolSet) return null
  return new sdk.OpenAIToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
    entityId,
  })
}

// ─── Agent config ─────────────────────────────────────────────────────────────

function loadAgentMcpConfig(agentName) {
  const cfgPath = join(AGENTS_DIR, agentName, 'mcp.json')
  if (!existsSync(cfgPath)) return { connectors: [] }
  try { return JSON.parse(readFileSync(cfgPath, 'utf8')) }
  catch { return { connectors: [] } }
}

export function getAgentConnectors(agentName) {
  return loadAgentMcpConfig(agentName).connectors || []
}

// ─── Rube Recipe execution ────────────────────────────────────────────────────
// Recipes are pre-built multi-tool workflows defined in Rube (rube.app).
// An agent can trigger a recipe by name instead of orchestrating individual tools.
// Recipe IDs are stored in each agent's mcp.json under "recipes": { "name": "rcp_xxx" }

export async function executeAgentRecipe(agentName, recipeName, params = {}, userId = 'default') {
  const cfg = loadAgentMcpConfig(agentName)
  const recipeId = cfg.recipes?.[recipeName]
  if (!recipeId) {
    return { error: `No recipe "${recipeName}" configured for agent ${agentName}. Add it to ${agentName}/mcp.json under "recipes".` }
  }
  return executeRecipe(recipeId, params, userId)
}

export async function executeRecipe(recipeId, params = {}, userId = 'default') {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) {
    return { error: 'COMPOSIO_API_KEY not configured — recipes require Composio connection' }
  }

  try {
    const res = await fetch('https://backend.composio.dev/api/v1/recipes/execute', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibeApiId: recipeId, params, entityId: userId }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data?.message || 'Recipe execution failed' }
    return { ok: true, result: data }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── Connector list (with per-user auth status) ───────────────────────────────

export async function getConnectors(userId) {
  const allConnectors = Object.keys(CONNECTOR_APP_MAP).map(id => ({
    id,
    name: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    connected: false,
    connectedAt: null,
    status: 'not_connected',
  }))

  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return allConnectors // stub mode

  try {
    const res = await fetch(
      `https://backend.composio.dev/api/v1/connectedAccounts?entityId=${encodeURIComponent(userId)}`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return allConnectors
    const data = await res.json()
    const connected = new Map()
    for (const acct of (data.items || [])) {
      for (const [connId, appName] of Object.entries(CONNECTOR_APP_MAP)) {
        if (acct.appName?.toLowerCase() === appName) {
          connected.set(connId, {
            connected: acct.status === 'ACTIVE',
            connectedAt: acct.createdAt || null,
            status: acct.status?.toLowerCase() || 'connected',
          })
        }
      }
    }
    return allConnectors.map(c => ({ ...c, ...(connected.get(c.id) || {}) }))
  } catch (err) {
    console.error('[MCPRouter] getConnectors error:', err.message)
    return allConnectors
  }
}

// ─── Initiate OAuth (returns redirectUrl for popup) ───────────────────────────

export async function initiateConnection(userId, connectorId) {
  const apiKey  = process.env.COMPOSIO_API_KEY
  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!apiKey)    return { error: 'COMPOSIO_API_KEY not configured — add it to your .env' }
  if (!appName)   return { error: `Unknown connector: ${connectorId}` }

  const appUrl = process.env.APP_URL || 'http://localhost:3007'
  try {
    const res = await fetch('https://backend.composio.dev/api/v1/connectedAccounts', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName,
        entityId: userId,
        redirectUri: `${appUrl}/settings?tab=accounts&connected=${connectorId}`,
      }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data?.message || 'Composio connection failed' }
    return { redirectUrl: data.redirectUrl, connectionId: data.id }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectConnector(userId, connectorId) {
  const apiKey  = process.env.COMPOSIO_API_KEY
  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!apiKey || !appName) return { error: 'COMPOSIO_API_KEY not configured' }

  try {
    const listRes = await fetch(
      `https://backend.composio.dev/api/v1/connectedAccounts?entityId=${encodeURIComponent(userId)}&appName=${appName}`,
      { headers: { 'x-api-key': apiKey } }
    )
    const listData = await listRes.json()
    const acct = listData.items?.[0]
    if (!acct) return { error: 'No connected account found' }

    await fetch(`https://backend.composio.dev/api/v1/connectedAccounts/${acct.id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    })
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── Get Groq-compatible tool definitions for an agent ────────────────────────

export async function getAgentTools(agentName, userId) {
  const cfg = loadAgentMcpConfig(agentName)
  if (!cfg.connectors?.length) return []

  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) {
    // Stub mode — tell agent what's theoretically available but not live
    return cfg.connectors.map(id => ({
      type: 'function',
      function: {
        name: `${id}_query`,
        description: `Query ${id.replace(/_/g, ' ')} data. (Not connected — configure COMPOSIO_API_KEY and connect in Settings → Accounts)`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to query' }
          },
          required: ['query'],
        },
      },
    }))
  }

  await getComposioSdk() // ensure loaded
  const toolset = getToolset(userId)
  if (!toolset) return []

  try {
    const apps = cfg.connectors.map(id => CONNECTOR_APP_MAP[id]).filter(Boolean)
    // Groq uses the same OpenAI function-calling format
    return await toolset.getTools({ apps })
  } catch (err) {
    console.error(`[MCPRouter] getAgentTools(${agentName}) error:`, err.message)
    return []
  }
}

// ─── Execute a tool_call from the model ──────────────────────────────────────
// toolCall: { id, type: 'function', function: { name, arguments } }

export async function executeTool(toolCall, userId) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) {
    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      content: 'Tool execution unavailable — COMPOSIO_API_KEY not configured. Set it in your environment and connect accounts in Settings → Accounts.',
    }
  }

  await getComposioSdk()
  const toolset = getToolset(userId)
  if (!toolset) {
    return { tool_call_id: toolCall.id, role: 'tool', content: 'Composio SDK unavailable' }
  }

  try {
    const result = await toolset.executeToolCall(toolCall, userId)
    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      content: typeof result === 'string' ? result : JSON.stringify(result),
    }
  } catch (err) {
    console.error('[MCPRouter] executeTool error:', err.message)
    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      content: `Tool execution failed: ${err.message}`,
    }
  }
}
