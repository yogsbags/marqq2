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
  apollo:           process.env.COMPOSIO_APOLLO_AUTH_CONFIG_ID                  || null,
  hubspot:          process.env.COMPOSIO_HUBSPOT_AUTH_CONFIG_ID                 || null,
  zoho_crm:         process.env.COMPOSIO_ZOHO_CRM_AUTH_CONFIG_ID                || null,
  salesforce:       process.env.COMPOSIO_SALESFORCE_AUTH_CONFIG_ID              || null,
  // Email & messaging
  gmail:            process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID                   || null,
  outlook:          process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID                 || null,
  hunter:           process.env.COMPOSIO_HUNTER_AUTH_CONFIG_ID                  || null,
  mailchimp:        process.env.COMPOSIO_MAILCHIMP_AUTH_CONFIG_ID               || null,
  klaviyo:          process.env.COMPOSIO_KLAVIYO_AUTH_CONFIG_ID                 || null,
  sendgrid:         process.env.COMPOSIO_SENDGRID_AUTH_CONFIG_ID                || null,
  instantly:        process.env.COMPOSIO_INSTANTLY_AUTH_CONFIG_ID               || null,
  heyreach:         process.env.COMPOSIO_HEYREACH_AUTH_CONFIG_ID                || null,
  lemlist:          process.env.COMPOSIO_LEMLIST_AUTH_CONFIG_ID                 || null,
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
  instagram:        process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID               || null,
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
  meta_ads:         'metaads',
  linkedin_ads:     'linkedinads',
  // CRM
  apollo:           'apollo',
  hubspot:          'hubspot',
  zoho_crm:         'zoho',
  salesforce:       'salesforce',
  // Email & messaging
  gmail:            'gmail',
  outlook:          'outlook',
  hunter:           'hunter',
  mailchimp:        'mailchimp',
  klaviyo:          'klaviyo',
  sendgrid:         'sendgrid',
  instantly:        'instantly',
  heyreach:         'heyreach',
  lemlist:          'lemlist',
  whatsapp:         'whatsapp',
  slack:            'slack',
  zoho_mail:        'zohomail',
  // Google workspace
  ga4:              'google_analytics',
  gsc:              'google_search_console',
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

function readGenericApiKey(detail) {
  return detail?.data?.generic_api_key
    || detail?.state?.val?.generic_api_key
    || detail?.params?.generic_api_key
    || detail?.data?.api_key
    || detail?.state?.val?.api_key
    || detail?.params?.api_key
    || null
}

function accountMatchesUser(item, userId) {
  return String(item?.user_id || '') === String(userId || '')
}

function normalizeToolkitSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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

export function getAgentConnectorApps(agentName) {
  return getAgentConnectors(agentName)
    .map((id) => CONNECTOR_APP_MAP[id])
    .filter(Boolean)
}

/** Returns the permission level declared in the agent's mcp.json ("read" | "write" | undefined) */
export function getAgentPermissions(agentName) {
  return loadAgentMcpConfig(agentName).permissions || undefined
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
      if (!accountMatchesUser(acct, userId)) continue
      // v3 uses toolkit_slug instead of appName
      const toolkitSlug = acct.toolkit?.slug || acct.toolkit_slug || acct.appName || ''
      for (const [connId, appName] of Object.entries(CONNECTOR_APP_MAP)) {
        if (normalizeToolkitSlug(toolkitSlug) === normalizeToolkitSlug(appName)) {
          const existing = connected.get(connId)
          // Prefer ACTIVE over any other status — don't let an EXPIRED entry overwrite an ACTIVE one
          if (!existing || acct.status === 'ACTIVE') {
            connected.set(connId, {
              connected: acct.status === 'ACTIVE',
              connectedAt: acct.created_at || acct.createdAt || null,
              status: acct.status?.toLowerCase() || 'connected',
            })
          }
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

export async function initiateConnection(userId, connectorId, extraFields = {}) {
  const apiKey       = process.env.COMPOSIO_API_KEY
  const appName      = CONNECTOR_APP_MAP[connectorId]
  const authConfigId = AUTH_CONFIG_MAP[connectorId] || null
  if (!apiKey)      return { error: 'COMPOSIO_API_KEY not configured — add it to your .env' }
  if (!appName)     return { error: `Unknown connector: ${connectorId}` }
  if (!authConfigId) return { error: `No auth config ID for ${connectorId} — add COMPOSIO_${connectorId.toUpperCase()}_AUTH_CONFIG_ID to .env` }

  const appUrl = process.env.APP_URL || 'http://localhost:3007'

  // Build connection data — some connectors need extra fields (e.g. Google Ads needs
  // developer_token + customer_id which Composio stores as generic_token + generic_id)
  const connectionData = Object.keys(extraFields).length ? extraFields : undefined

  try {
    const res = await fetch(`${COMPOSIO_V3}/connected_accounts/link`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: userId,
        callback_url: `${appUrl}/settings?tab=accounts&connected=${connectorId}`,
        ...(connectionData && { data: connectionData }),
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
    const acct = (listData.items || []).find((item) =>
      accountMatchesUser(item, userId) &&
      normalizeToolkitSlug(item.toolkit?.slug || item.toolkit_slug || item.appName || '') === normalizeToolkitSlug(appName)
    )
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

// ─── Execute a named Composio action directly (no LLM in the loop) ──────────
// actionSlug: e.g. 'METAADS_GET_INSIGHTS'
// inputParams: plain object matching the action's parameters schema
// userId: the companyId / entityId used when connecting the account
//
// Uses Composio v3 API: POST /api/v3/tools/execute/{tool_slug}
// Resolves connected_account_id from userId + toolkit before executing.

// ACTION_TOOLKIT_MAP — maps Composio action prefix to toolkit slug
const ACTION_TOOLKIT_MAP = {
  GOOGLEADS:           'googleads',
  FACEBOOKADS:         'metaads',
  METAADS:             'metaads',
  LINKEDIN:            'linkedin',
  HUBSPOT:             'hubspot',
  SLACK:               'slack',
  GMAIL:               'gmail',
  GOOGLEDRIVE:         'googledrive',
  GOOGLESHEETS:        'googlesheets',
  GOOGLEDOCS:          'googledocs',
  GOOGLECALENDAR:      'googlecalendar',
  YOUTUBE:             'youtube',
  GOOGLEANALYTICS:     'google_analytics',
  GOOGLESEARCHCONSOLE: 'google_search_console',
  SEMRUSH:             'semrush',
  AHREFS:              'ahrefs',
  MIXPANEL:            'mixpanel',
  AMPLITUDE:           'amplitude',
  SALESFORCE:          'salesforce',
  ZOHOCRM:             'zoho',
  INSTANTLY:           'instantly',
  HEYREACH:            'heyreach',
  LEMLIST:             'lemlist',
  APOLLO:              'apollo',
}

function toolkitForAction(actionSlug) {
  const prefix = actionSlug.split('_')[0].toUpperCase()
  return ACTION_TOOLKIT_MAP[prefix] || prefix.toLowerCase()
}

// Cache: userId+toolkit → connected_account_id (in-process, lives as long as server)
const _caIdCache = new Map()
const _caDetailCache = new Map()

async function resolveConnectedAccountId(toolkit, userId, apiKey) {
  const cacheKey = `${userId}:${toolkit}`
  if (_caIdCache.has(cacheKey)) return _caIdCache.get(cacheKey)

  const res = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&toolkit_slug=${toolkit}&limit=10`,
    { headers: { 'x-api-key': apiKey } }
  )
  if (!res.ok) throw new Error(`Composio connected_accounts lookup failed: ${res.status}`)
  const data = await res.json()
  const acct = (data.items || []).find(a =>
    accountMatchesUser(a, userId) &&
    normalizeToolkitSlug(a.toolkit?.slug || a.toolkit_slug || '') === normalizeToolkitSlug(toolkit)
    && a.status === 'ACTIVE'
  )
  if (!acct) throw new Error(
    `No active ${toolkit} connection for user ${userId}. Connect it in Settings → Accounts.`
  )
  _caIdCache.set(cacheKey, acct.id)
  return acct.id
}

async function getConnectedAccountDetail(toolkit, userId, apiKey) {
  const connectedAccountId = await resolveConnectedAccountId(toolkit, userId, apiKey)
  if (_caDetailCache.has(connectedAccountId)) return _caDetailCache.get(connectedAccountId)

  const res = await fetch(`${COMPOSIO_V3}/connected_accounts/${connectedAccountId}`, {
    headers: { 'x-api-key': apiKey },
  })
  if (!res.ok) throw new Error(`Composio connected_account detail failed: ${res.status}`)
  const data = await res.json()
  _caDetailCache.set(connectedAccountId, data)
  return data
}

function getGenericApiKey(detail) {
  return detail?.data?.generic_api_key
    || detail?.state?.val?.generic_api_key
    || detail?.params?.generic_api_key
    || detail?.data?.api_key
    || detail?.state?.val?.api_key
    || detail?.params?.api_key
    || null
}

async function executeHunterDirect(actionSlug, inputParams, userId, apiKey) {
  const detail = await getConnectedAccountDetail('hunter', userId, apiKey)
  const hunterApiKey = getGenericApiKey(detail)
  if (!hunterApiKey) {
    return { error: 'No Hunter API key found in connected account details' }
  }

  let path = null
  const params = new URLSearchParams()

  if (actionSlug === 'HUNTER_DOMAIN_SEARCH') {
    path = '/domain-search'
    if (inputParams.domain) params.set('domain', String(inputParams.domain))
    if (inputParams.company) params.set('company', String(inputParams.company))
    if (inputParams.type) params.set('type', String(inputParams.type))
    if (inputParams.limit != null) params.set('limit', String(inputParams.limit))
    if (inputParams.offset != null) params.set('offset', String(inputParams.offset))
    if (Array.isArray(inputParams.seniority) && inputParams.seniority.length) params.set('seniority', inputParams.seniority.join(','))
    if (Array.isArray(inputParams.department) && inputParams.department.length) params.set('department', inputParams.department.join(','))
    if (Array.isArray(inputParams.required_field) && inputParams.required_field.length) params.set('required_field', inputParams.required_field.join(','))
  } else if (actionSlug === 'HUNTER_EMAIL_FINDER') {
    path = '/email-finder'
    if (inputParams.domain) params.set('domain', String(inputParams.domain))
    if (inputParams.company) params.set('company', String(inputParams.company))
    if (inputParams.full_name) params.set('full_name', String(inputParams.full_name))
    if (inputParams.first_name) params.set('first_name', String(inputParams.first_name))
    if (inputParams.last_name) params.set('last_name', String(inputParams.last_name))
    if (inputParams.max_duration != null) params.set('max_duration', String(inputParams.max_duration))
  } else {
    return null
  }

  params.set('api_key', hunterApiKey)
  const res = await fetch(`https://api.hunter.io/v2${path}?${params.toString()}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { error: data?.errors?.[0]?.details || data?.errors?.[0]?.id || data?.message || `Hunter API failed: ${res.status}` }
  }
  return { ok: true, result: data }
}

export async function executeComposioAction(actionSlug, inputParams = {}, userId = 'default') {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }

  const toolkit = toolkitForAction(actionSlug)

  try {
    if (toolkit === 'hunter' && ['HUNTER_DOMAIN_SEARCH', 'HUNTER_EMAIL_FINDER'].includes(actionSlug)) {
      const hunterResult = await executeHunterDirect(actionSlug, inputParams, userId, apiKey)
      if (hunterResult) return hunterResult
    }

    const connectedAccountId = await resolveConnectedAccountId(toolkit, userId, apiKey)

    const res = await fetch(`${COMPOSIO_V3}/tools/execute/${actionSlug}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected_account_id: connectedAccountId, arguments: inputParams }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data?.error?.message || data?.message || JSON.stringify(data) }
    if (data.successful === false) return { error: data?.error || data?.data?.message || 'Action failed', raw: data }
    return { ok: true, result: data?.data ?? data }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── Get OAuth access token for a connected account ──────────────────────────
// Returns the live access_token from Composio's stored credentials.
// Composio handles refresh automatically — the token in data.access_token is
// always valid at fetch time for ACTIVE connections.

export async function getConnectedAccountToken(connectorId, userId) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }

  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!appName) return { error: `Unknown connector: ${connectorId}` }

  try {
    const res = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=20`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return { error: `Composio list accounts failed: ${res.status}` }
    const data = await res.json()

    // Find the active account for this app
    const acct = (data.items || []).find(a => {
      const slug = a.toolkit?.slug || a.toolkit_slug || ''
      return accountMatchesUser(a, userId) && normalizeToolkitSlug(slug) === normalizeToolkitSlug(appName) && a.status === 'ACTIVE'
    })
    if (!acct) return { error: `No active ${connectorId} connection for user ${userId}. Connect it in Settings → Accounts.` }

    // Fetch full account with credentials
    const detailRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${acct.id}`, {
      headers: { 'x-api-key': apiKey }
    })
    if (!detailRes.ok) return { error: `Failed to fetch account details: ${detailRes.status}` }
    const detail = await detailRes.json()

    const token = detail.data?.access_token || detail.params?.access_token
    if (!token) return { error: `No access_token found for ${connectorId} — account may need reconnection` }

    return { access_token: token, account_id: acct.id }
  } catch (err) {
    return { error: err.message }
  }
}

export async function getConnectedAccountApiKey(connectorId, userId) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }

  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!appName) return { error: `Unknown connector: ${connectorId}` }

  try {
    const res = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=20`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return { error: `Composio list accounts failed: ${res.status}` }
    const data = await res.json()

    const acct = (data.items || []).find(a => {
      const slug = a.toolkit?.slug || a.toolkit_slug || ''
      return accountMatchesUser(a, userId) && normalizeToolkitSlug(slug) === normalizeToolkitSlug(appName) && a.status === 'ACTIVE'
    })
    if (!acct) return { error: `No active ${connectorId} connection for user ${userId}. Connect it in Settings → Accounts.` }

    const detailRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${acct.id}`, {
      headers: { 'x-api-key': apiKey }
    })
    if (!detailRes.ok) return { error: `Failed to fetch account details: ${detailRes.status}` }
    const detail = await detailRes.json()

    const genericApiKey = readGenericApiKey(detail)
    if (!genericApiKey) return { error: `No API key found for ${connectorId} — account may need reconnection` }

    return { api_key: genericApiKey, account_id: acct.id }
  } catch (err) {
    return { error: err.message }
  }
}
