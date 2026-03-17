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

// Composio auth config IDs — set per-app when you create a custom OAuth config in Composio dashboard
// These are passed as integrationId so Composio uses your configured OAuth app (client ID/secret)
export const AUTH_CONFIG_MAP = {
  // Paid ads
  google_ads:       process.env.COMPOSIO_GOOGLE_ADS_AUTH_CONFIG_ID              || null,
  meta_ads:         process.env.COMPOSIO_META_ADS_AUTH_CONFIG_ID                || null,
  linkedin_ads:     process.env.COMPOSIO_LINKEDIN_ADS_AUTH_CONFIG_ID            || null,
  // CRM
  hubspot:          process.env.COMPOSIO_HUBSPOT_AUTH_CONFIG_ID                 || null,
  zoho_crm:         process.env.COMPOSIO_ZOHO_CRM_AUTH_CONFIG_ID                || null,
  salesforce:       process.env.COMPOSIO_SALESFORCE_AUTH_CONFIG_ID              || null,
  // Email & messaging
  gmail:            process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID                   || null,
  outlook:          process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID                 || null,
  mailchimp:        process.env.COMPOSIO_MAILCHIMP_AUTH_CONFIG_ID               || null,
  klaviyo:          process.env.COMPOSIO_KLAVIYO_AUTH_CONFIG_ID                 || null,
  sendgrid:         process.env.COMPOSIO_SENDGRID_AUTH_CONFIG_ID                || null,
  instantly:        process.env.COMPOSIO_INSTANTLY_AUTH_CONFIG_ID               || null,
  whatsapp:         process.env.COMPOSIO_WHATSAPP_AUTH_CONFIG_ID                || null,
  slack:            process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID                   || null,
  zoho_mail:        process.env.COMPOSIO_ZOHO_MAIL_AUTH_CONFIG_ID               || null,
  // Google workspace
  ga4:              process.env.COMPOSIO_GOOGLE_ANALYTICS_AUTH_CONFIG_ID        || null,
  gsc:              process.env.COMPOSIO_GOOGLE_SEARCH_CONSOLE_AUTH_CONFIG_ID   || null,
  google_sheets:    process.env.COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID           || null,
  google_docs:      process.env.COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID             || null,
  google_drive:     process.env.COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID            || null,
  google_calendar:  process.env.COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID         || null,
  youtube:          process.env.COMPOSIO_YOUTUBE_AUTH_CONFIG_ID                 || null,
  // Microsoft
  one_drive:        process.env.COMPOSIO_ONE_DRIVE_AUTH_CONFIG_ID               || null,
  // SEO
  semrush:          process.env.COMPOSIO_SEMRUSH_AUTH_CONFIG_ID                 || null,
  ahrefs:           process.env.COMPOSIO_AHREFS_AUTH_CONFIG_ID                  || null,
  // Analytics
  mixpanel:         process.env.COMPOSIO_MIXPANEL_AUTH_CONFIG_ID                || null,
  amplitude:        process.env.COMPOSIO_AMPLITUDE_AUTH_CONFIG_ID               || null,
  // Social
  linkedin:         process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID                || null,
  facebook:         process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID                || null,
  reddit:           process.env.COMPOSIO_REDDIT_AUTH_CONFIG_ID                  || null,
  // Content & creative
  canva:            process.env.COMPOSIO_CANVA_AUTH_CONFIG_ID                   || null,
  heygen:           process.env.COMPOSIO_HEYGEN_AUTH_CONFIG_ID                  || null,
  elevenlabs:       process.env.COMPOSIO_ELEVENLABS_AUTH_CONFIG_ID              || null,
  veo:              process.env.COMPOSIO_VEO_AUTH_CONFIG_ID                     || null,
  // Automation & data
  make:             process.env.COMPOSIO_MAKE_AUTH_CONFIG_ID                    || null,
  apify:            process.env.COMPOSIO_APIFY_AUTH_CONFIG_ID                   || null,
  shopify:          process.env.COMPOSIO_SHOPIFY_AUTH_CONFIG_ID                 || null,
  // AI providers
  openai:           process.env.COMPOSIO_OPENAI_AUTH_CONFIG_ID                  || null,
  anthropic:        process.env.COMPOSIO_ANTHROPIC_AUTH_CONFIG_ID               || null,
  perplexity:       process.env.COMPOSIO_PERPLEXITY_AUTH_CONFIG_ID              || null,
}

export const CONNECTOR_APP_MAP = {
  // Paid ads
  google_ads:       'googleads',
  meta_ads:         'facebookads',
  linkedin_ads:     'linkedinads',
  // CRM
  hubspot:          'hubspot',
  zoho_crm:         'zohocrm',
  salesforce:       'salesforce',
  // Email & messaging
  gmail:            'gmail',
  outlook:          'outlook',
  mailchimp:        'mailchimp',
  klaviyo:          'klaviyo',
  sendgrid:         'sendgrid',
  instantly:        'instantly',
  whatsapp:         'whatsapp',
  slack:            'slack',
  zoho_mail:        'zohomail',
  // Google workspace
  ga4:              'googleanalytics',
  gsc:              'googlesearchconsole',
  google_sheets:    'googlesheets',
  google_docs:      'googledocs',
  google_drive:     'googledrive',
  google_calendar:  'googlecalendar',
  youtube:          'youtube',
  // Microsoft
  one_drive:        'onedrive',
  microsoft_sheets: 'microsoftexcel',
  // SEO
  semrush:          'semrush',
  ahrefs:           'ahrefs',
  // Analytics
  mixpanel:         'mixpanel',
  amplitude:        'amplitude',
  moengage:         'moengage',
  clevertap:        'clevertap',
  // Social
  linkedin:         'linkedin',
  facebook:         'facebook',
  reddit:           'reddit',
  instagram:        'instagram',
  // Content & creative
  canva:            'canva',
  heygen:           'heygen',
  elevenlabs:       'elevenlabs',
  veo:              'veo',
  // Automation & data
  make:             'make',
  apify:            'apify',
  shopify:          'shopify',
  snowflake:        'snowflake',
  wordpress:        'wordpress',
  // AI providers
  openai:           'openai',
  anthropic:        'anthropic',
  perplexity:       'perplexity',
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

// ─── Composio v3 base URL ─────────────────────────────────────────────────────
const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3'

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
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return allConnectors
    const data = await res.json()
    const connected = new Map()
    for (const acct of (data.items || [])) {
      // v3 uses toolkit_slug instead of appName
      const toolkitSlug = acct.toolkit?.slug || acct.toolkit_slug || acct.appName || ''
      for (const [connId, appName] of Object.entries(CONNECTOR_APP_MAP)) {
        if (toolkitSlug.toLowerCase() === appName.toLowerCase()) {
          connected.set(connId, {
            connected: acct.status === 'ACTIVE',
            connectedAt: acct.created_at || acct.createdAt || null,
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
  const apiKey       = process.env.COMPOSIO_API_KEY
  const appName      = CONNECTOR_APP_MAP[connectorId]
  const authConfigId = AUTH_CONFIG_MAP[connectorId] || null
  if (!apiKey)      return { error: 'COMPOSIO_API_KEY not configured — add it to your .env' }
  if (!appName)     return { error: `Unknown connector: ${connectorId}` }
  if (!authConfigId) return { error: `No auth config ID for ${connectorId} — add COMPOSIO_${connectorId.toUpperCase()}_AUTH_CONFIG_ID to .env` }

  const appUrl = process.env.APP_URL || 'http://localhost:3007'

  try {
    const res = await fetch(`${COMPOSIO_V3}/connected_accounts/link`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: userId,
        callback_url: `${appUrl}/settings?tab=accounts&connected=${connectorId}`,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[initiateConnection] Composio v3 error:', JSON.stringify(data))
      return { error: data?.message || data?.error || JSON.stringify(data) }
    }
    // v3 returns { link: "https://..." } or { redirectUrl: "..." }
    const redirectUrl = data.link || data.redirectUrl || data.redirect_url
    return { redirectUrl, connectionId: data.id || data.connection_id }
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
    // Find the connected account first
    const listRes = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&toolkit_slug=${appName}&limit=10`,
      { headers: { 'x-api-key': apiKey } }
    )
    const listData = await listRes.json()
    const acct = listData.items?.[0]
    if (!acct) return { error: 'No connected account found' }

    await fetch(`${COMPOSIO_V3}/connected_accounts/${acct.id}`, {
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
