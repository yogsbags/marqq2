/**
 * MCP Router — routes the right integrations to the right agents.
 *
 * Architecture:
 *   Agent declares connectors in platform/agent-runtime/agents/{name}/mcp.json
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
const AGENTS_DIR = process.env.MARQQ_AGENTS_DIR
  ? process.env.MARQQ_AGENTS_DIR
  : join(__dirname, '..', 'agent-runtime', 'agents')
const REPO_ROOT = join(__dirname, '..', '..')

// Load .env before any auth-config lookups. backend-server also loads env, but
// this module can be imported before that runs — so IDs must not be snapshotted
// at import time.
function loadEnvFileIntoProcess(envPath) {
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (!match) continue
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* missing file is fine */
  }
}
loadEnvFileIntoProcess(join(REPO_ROOT, '.env'))
loadEnvFileIntoProcess(join(REPO_ROOT, '.env.local'))
loadEnvFileIntoProcess(join(REPO_ROOT, '.env.marqq'))

// ─── Connector → Composio app name mapping ────────────────────────────────────
// Composio app names: https://app.composio.dev/apps

// Env var names for Composio auth config IDs (OAuth / Connect Link popup).
// Read at call time via getAuthConfigId() — never cache at import.
const AUTH_CONFIG_ENV_KEYS = {
  // Paid ads
  google_ads: 'COMPOSIO_GOOGLE_ADS_AUTH_CONFIG_ID',
  meta_ads: 'COMPOSIO_META_ADS_AUTH_CONFIG_ID',
  linkedin_ads: 'COMPOSIO_LINKEDIN_ADS_AUTH_CONFIG_ID',
  // CRM
  apollo: 'COMPOSIO_APOLLO_AUTH_CONFIG_ID',
  hubspot: 'COMPOSIO_HUBSPOT_AUTH_CONFIG_ID',
  zoho_crm: 'COMPOSIO_ZOHO_CRM_AUTH_CONFIG_ID',
  salesforce: 'COMPOSIO_SALESFORCE_AUTH_CONFIG_ID',
  // Email & messaging
  gmail: 'COMPOSIO_GMAIL_AUTH_CONFIG_ID',
  outlook: 'COMPOSIO_OUTLOOK_AUTH_CONFIG_ID',
  hunter: 'COMPOSIO_HUNTER_AUTH_CONFIG_ID',
  mailchimp: 'COMPOSIO_MAILCHIMP_AUTH_CONFIG_ID',
  klaviyo: 'COMPOSIO_KLAVIYO_AUTH_CONFIG_ID',
  sendgrid: 'COMPOSIO_SENDGRID_AUTH_CONFIG_ID',
  instantly: 'COMPOSIO_INSTANTLY_AUTH_CONFIG_ID',
  heyreach: 'COMPOSIO_HEYREACH_AUTH_CONFIG_ID',
  lemlist: 'COMPOSIO_LEMLIST_AUTH_CONFIG_ID',
  whatsapp: 'COMPOSIO_WHATSAPP_AUTH_CONFIG_ID',
  slack: 'COMPOSIO_SLACK_AUTH_CONFIG_ID',
  zoho_mail: 'COMPOSIO_ZOHO_MAIL_AUTH_CONFIG_ID',
  // Google workspace
  ga4: 'COMPOSIO_GOOGLE_ANALYTICS_AUTH_CONFIG_ID',
  gsc: 'COMPOSIO_GOOGLE_SEARCH_CONSOLE_AUTH_CONFIG_ID',
  google_sheets: 'COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID',
  google_docs: 'COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID',
  google_drive: 'COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID',
  google_calendar: 'COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID',
  youtube: 'COMPOSIO_YOUTUBE_AUTH_CONFIG_ID',
  // Microsoft
  one_drive: 'COMPOSIO_ONE_DRIVE_AUTH_CONFIG_ID',
  // SEO
  semrush: 'COMPOSIO_SEMRUSH_AUTH_CONFIG_ID',
  ahrefs: 'COMPOSIO_AHREFS_AUTH_CONFIG_ID',
  // Analytics
  mixpanel: 'COMPOSIO_MIXPANEL_AUTH_CONFIG_ID',
  amplitude: 'COMPOSIO_AMPLITUDE_AUTH_CONFIG_ID',
  // Social
  linkedin: 'COMPOSIO_LINKEDIN_AUTH_CONFIG_ID',
  facebook: 'COMPOSIO_FACEBOOK_AUTH_CONFIG_ID',
  instagram: 'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID',
  twitter: 'COMPOSIO_TWITTER_AUTH_CONFIG_ID',
  reddit: 'COMPOSIO_REDDIT_AUTH_CONFIG_ID',
  // Content & creative
  canva: 'COMPOSIO_CANVA_AUTH_CONFIG_ID',
  heygen: 'COMPOSIO_HEYGEN_AUTH_CONFIG_ID',
  elevenlabs: 'COMPOSIO_ELEVENLABS_AUTH_CONFIG_ID',
  veo: 'COMPOSIO_VEO_AUTH_CONFIG_ID',
  fal_ai: 'COMPOSIO_FAL_AI_AUTH_CONFIG_ID',
  pexels: 'COMPOSIO_PEXELS_AUTH_CONFIG_ID',
  gemini: 'COMPOSIO_GEMINI_AUTH_CONFIG_ID',
  wordpress: 'COMPOSIO_WORDPRESS_AUTH_CONFIG_ID',
  webflow: 'COMPOSIO_WEBFLOW_AUTH_CONFIG_ID',
  // Automation & data
  make: 'COMPOSIO_MAKE_AUTH_CONFIG_ID',
  apify: 'COMPOSIO_APIFY_AUTH_CONFIG_ID',
  shopify: 'COMPOSIO_SHOPIFY_AUTH_CONFIG_ID',
  wix: 'COMPOSIO_WIX_AUTH_CONFIG_ID',
  hostinger: 'COMPOSIO_HOSTINGER_AUTH_CONFIG_ID',
  firecrawl: 'COMPOSIO_FIRECRAWL_AUTH_CONFIG_ID',
  github: 'COMPOSIO_GITHUB_AUTH_CONFIG_ID',
  railway: 'COMPOSIO_RAILWAY_AUTH_CONFIG_ID',
  cloudflare: 'COMPOSIO_CLOUDFLARE_AUTH_CONFIG_ID',
  // AI providers
  openai: 'COMPOSIO_OPENAI_AUTH_CONFIG_ID',
  anthropic: 'COMPOSIO_ANTHROPIC_AUTH_CONFIG_ID',
  perplexity: 'COMPOSIO_PERPLEXITY_AUTH_CONFIG_ID',
}

export function getAuthConfigId(connectorId) {
  const envKey = AUTH_CONFIG_ENV_KEYS[connectorId]
  if (!envKey) return null
  const value = process.env[envKey]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** @deprecated Prefer getAuthConfigId() — values are resolved at access time */
export const AUTH_CONFIG_MAP = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return getAuthConfigId(prop)
    },
    ownKeys() {
      return Object.keys(AUTH_CONFIG_ENV_KEYS)
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string' || !(prop in AUTH_CONFIG_ENV_KEYS)) return undefined
      return { enumerable: true, configurable: true, value: getAuthConfigId(prop) }
    },
  },
)

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
  twitter:          'twitter',
  // Content & creative
  canva:            'canva',
  heygen:           'heygen',
  elevenlabs:       'elevenlabs',
  veo:              'veo',
  fal_ai:           'fal_ai',
  pexels:           'pexels',
  gemini:           'gemini',
  // Automation & data
  make:             'make',
  apify:            'apify',
  shopify:          'shopify',
  wix:              'wix',
  hostinger:        'hostinger',
  firecrawl:        'firecrawl',
  github:           'github',
  railway:          'railway',
  cloudflare:        'cloudflare',
  snowflake:        'snowflake',
  wordpress:        'wordpress',
  webflow:          'webflow',
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
  const wanted = String(userId || '')
  if (!wanted) return false
  const candidates = [
    item?.user_id,
    item?.userId,
    item?.entity_id,
    item?.entityId,
    item?.member?.user_id,
  ]
  return candidates.some((value) => String(value || '') === wanted)
}

function normalizeToolkitSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Extra Composio toolkit slugs that map to our connector ids */
const CONNECTOR_SLUG_ALIASES = {
  apollo: ['apolloio', 'apollo_io'],
  ga4: ['googleanalytics', 'google_analytics'],
  gsc: ['googlesearchconsole', 'google_search_console'],
}

function toolkitMatchesConnector(connectorId, toolkitSlug) {
  const normalized = normalizeToolkitSlug(toolkitSlug)
  if (!normalized) return false
  const primary = normalizeToolkitSlug(CONNECTOR_APP_MAP[connectorId] || '')
  if (primary && normalized === primary) return true
  const aliases = CONNECTOR_SLUG_ALIASES[connectorId] || []
  return aliases.some((alias) => normalizeToolkitSlug(alias) === normalized)
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
        if (toolkitMatchesConnector(connId, toolkitSlug) || normalizeToolkitSlug(toolkitSlug) === normalizeToolkitSlug(appName)) {
          const existing = connected.get(connId)
          const statusUpper = String(acct.status || '').toUpperCase()
          const isActive = statusUpper === 'ACTIVE' || statusUpper === 'CONNECTED' || statusUpper === 'SUCCESS'
          // Prefer ACTIVE over any other status — don't let an EXPIRED entry overwrite an ACTIVE one
          if (!existing || isActive) {
            connected.set(connId, {
              connected: isActive,
              connectedAt: acct.created_at || acct.createdAt || null,
              status: isActive ? 'active' : (acct.status?.toLowerCase() || 'connected'),
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

// ─── Initiate OAuth Connect Link (returns redirectUrl for popup) ──────────────

function extractRedirectUrl(data) {
  if (!data || typeof data !== 'object') return null
  return (
    data.link ||
    data.redirectUrl ||
    data.redirect_url ||
    data.redirectURI ||
    data.redirect_uri ||
    data?.connection?.redirectUrl ||
    data?.connection?.redirect_url ||
    data?.data?.link ||
    data?.data?.redirectUrl ||
    data?.data?.redirect_url ||
    null
  )
}

function formatComposioError(data, fallback = 'Connect failed') {
  const raw = data?.message || data?.error || data?.detail || data?.errors || data
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((item) => (typeof item === 'string' ? item : item?.message || JSON.stringify(item)))
      .join('; ')
  }
  if (raw && typeof raw === 'object') {
    const nested = raw.message || raw.error || raw.detail || raw.description
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
    try {
      return JSON.stringify(raw)
    } catch {
      return fallback
    }
  }
  return fallback
}

export async function initiateConnection(userId, connectorId, extraFields = {}) {
  const apiKey       = process.env.COMPOSIO_API_KEY
  const appName      = CONNECTOR_APP_MAP[connectorId]
  const authConfigId = getAuthConfigId(connectorId)
  const authEnvKey   = AUTH_CONFIG_ENV_KEYS[connectorId] || `COMPOSIO_${String(connectorId).toUpperCase()}_AUTH_CONFIG_ID`
  if (!apiKey)      return { error: 'COMPOSIO_API_KEY not configured — add it to your .env' }
  if (!appName)     return { error: `Unknown connector: ${connectorId}` }
  if (!authConfigId) {
    return {
      error: `No auth config ID for ${connectorId} — set ${authEnvKey} in your environment (Composio Auth Config for Connect Link / OAuth popup)`,
    }
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3007'

  // Build connection data — some connectors need extra fields (e.g. Google Ads needs
  // developer_token + customer_id which Composio stores as generic_token + generic_id)
  const connectionData = Object.keys(extraFields || {}).length ? extraFields : undefined

  try {
    const res = await fetch(`${COMPOSIO_V3}/connected_accounts/link`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: userId,
        callback_url: `${appUrl}/settings?tab=accounts&connected=${connectorId}`,
        // One active Apollo (etc.) account per workspace — avoids stale ca_* IDs
        allow_multiple: false,
        ...(connectionData && { data: connectionData }),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[initiateConnection] Composio v3 error:', JSON.stringify(data))
      // Already linked — treat as success so Outreach / Integrations don't toast an error
      try {
        const existing = await getConnectors(userId)
        const match = existing.find((c) => c.id === connectorId)
        if (match?.connected || match?.status === 'active') {
          return { alreadyConnected: true, redirectUrl: null, connectionId: null }
        }
      } catch {
        /* fall through to error */
      }
      return { error: formatComposioError(data, `Composio connect failed (${res.status})`) }
    }

    const redirectUrl = extractRedirectUrl(data)
    if (!redirectUrl) {
      console.error('[initiateConnection] Missing redirect URL in Composio response:', JSON.stringify(data))
      return {
        error: formatComposioError(
          data,
          'Composio did not return an OAuth popup URL — check the Apollo auth config in Composio dashboard',
        ),
      }
    }
    return { redirectUrl, connectionId: data.id || data.connection_id || data.connected_account_id || null }
  } catch (err) {
    return { error: err.message || 'Connect failed' }
  } finally {
    invalidateConnectedAccountCache(userId, appName)
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
    const accounts = (listData.items || []).filter((item) =>
      accountMatchesUser(item, userId) &&
      normalizeToolkitSlug(item.toolkit?.slug || item.toolkit_slug || item.appName || '') === normalizeToolkitSlug(appName)
    )
    if (!accounts.length) {
      invalidateConnectedAccountCache(userId, appName)
      return { error: 'No connected account found' }
    }

    await Promise.all(accounts.map((acct) =>
      fetch(`${COMPOSIO_V3}/connected_accounts/${acct.id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      })
    ))
    invalidateConnectedAccountCache(userId, appName)
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

// ACTION_TOOLKIT_MAP — maps Composio action prefix to toolkit slug.
// Longer prefixes (LINKEDIN_ADS) must win over shorter ones (LINKEDIN).
const ACTION_TOOLKIT_MAP = {
  GOOGLEADS:           'googleads',
  GOOGLE_ADS:          'googleads',
  FACEBOOKADS:         'metaads',
  FACEBOOK_ADS:        'metaads',
  METAADS:             'metaads',
  LINKEDIN_ADS:        'linkedinads',
  LINKEDINADS:         'linkedinads',
  LINKEDIN:            'linkedin',
  HUBSPOT:             'hubspot',
  SLACK:               'slack',
  GMAIL:               'gmail',
  GOOGLEDRIVE:         'googledrive',
  GOOGLESHEETS:        'googlesheets',
  GOOGLEDOCS:          'googledocs',
  GOOGLECALENDAR:      'googlecalendar',
  YOUTUBE:             'youtube',
  GOOGLE_ANALYTICS:    'google_analytics',
  GOOGLEANALYTICS:     'google_analytics',
  GOOGLE_SEARCH_CONSOLE: 'google_search_console',
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
  WORDPRESS:           'wordpress',
  WEBFLOW:             'webflow',
  SHOPIFY:             'shopify',
  WIX:                 'wix',
  HOSTINGER:           'hostinger',
  APIFY:              'apify',
  FIRECRAWL:           'firecrawl',
  GITHUB:              'github',
  RAILWAY:             'railway',
  CLOUDFLARE:          'cloudflare',
}

const ACTION_TOOLKIT_PREFIXES = Object.keys(ACTION_TOOLKIT_MAP).sort((a, b) => b.length - a.length)

function toolkitForAction(actionSlug) {
  const upper = String(actionSlug || '').toUpperCase()
  for (const prefix of ACTION_TOOLKIT_PREFIXES) {
    if (upper === prefix || upper.startsWith(`${prefix}_`)) {
      return ACTION_TOOLKIT_MAP[prefix]
    }
  }
  return upper.split('_')[0].toLowerCase()
}

// Cache: userId+toolkit → connected_account_id (in-process, lives as long as server)
const _caIdCache = new Map()
const _caDetailCache = new Map()

function accountRecency(acct) {
  const stamp = acct?.updated_at || acct?.created_at || acct?.createdAt || acct?.updatedAt || ''
  const ms = Date.parse(stamp)
  return Number.isFinite(ms) ? ms : 0
}

function pickNewestActiveAccount(items, userId, toolkit, { excludeIds = [] } = {}) {
  const excluded = new Set((excludeIds || []).filter(Boolean).map(String))
  return (items || [])
    .filter((a) =>
      accountMatchesUser(a, userId) &&
      normalizeToolkitSlug(a.toolkit?.slug || a.toolkit_slug || '') === normalizeToolkitSlug(toolkit) &&
      a.status === 'ACTIVE' &&
      a.id &&
      !excluded.has(String(a.id))
    )
    .sort((a, b) => accountRecency(b) - accountRecency(a))[0] || null
}

function composioErrorText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message || String(value)
  if (typeof value === 'object') {
    const nested = value.message || value.error || value.detail || value.description
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function invalidateConnectedAccountCache(userId, toolkit = null) {
  const uid = String(userId || '').trim()
  if (!uid) {
    _caIdCache.clear()
    _caDetailCache.clear()
    return
  }
  const toolkitSlug = toolkit ? normalizeToolkitSlug(toolkit) : null
  for (const key of [..._caIdCache.keys()]) {
    if (!key.startsWith(`${uid}:`)) continue
    if (toolkitSlug) {
      const keyToolkit = key.slice(uid.length + 1)
      if (normalizeToolkitSlug(keyToolkit) !== toolkitSlug) continue
    }
    const cachedId = _caIdCache.get(key)
    _caIdCache.delete(key)
    if (cachedId) _caDetailCache.delete(cachedId)
  }
}

async function resolveConnectedAccountId(toolkit, userId, apiKey, { bypassCache = false, excludeIds = [] } = {}) {
  const cacheKey = `${userId}:${toolkit}`
  if (!bypassCache && !excludeIds.length && _caIdCache.has(cacheKey)) {
    return _caIdCache.get(cacheKey)
  }

  // Composio's toolkit_slug filter is unreliable (often returns mixed toolkits /
  // other users). Fetch by user_id and filter client-side instead.
  const res = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=50`,
    { headers: { 'x-api-key': apiKey } }
  )
  if (!res.ok) throw new Error(`Composio connected_accounts lookup failed: ${res.status}`)
  const data = await res.json()
  const acct = pickNewestActiveAccount(data.items, userId, toolkit, { excludeIds })
  if (!acct) throw new Error(
    `No active ${toolkit} connection for user ${userId}. Connect it in Settings → Accounts.`
  )
  _caIdCache.set(cacheKey, acct.id)
  return acct.id
}

function isStaleConnectedAccountError(message) {
  return /no connected account found with id|connected account .* not found|invalid connected.?account/i.test(
    composioErrorText(message),
  )
}

async function getConnectedAccountDetail(toolkit, userId, apiKey) {
  const connectedAccountId = await resolveConnectedAccountId(toolkit, userId, apiKey)
  if (_caDetailCache.has(connectedAccountId)) return _caDetailCache.get(connectedAccountId)

  const res = await fetch(`${COMPOSIO_V3}/connected_accounts/${connectedAccountId}`, {
    headers: { 'x-api-key': apiKey },
  })
  if (!res.ok) {
    invalidateConnectedAccountCache(userId, toolkit)
    throw new Error(`Composio connected_account detail failed: ${res.status}`)
  }
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

export function composioEntityCandidates(...ids) {
  const out = []
  for (const id of ids) {
    const s = String(id || '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function isComposioMissingConnectionError(message) {
  return /no active .* connection|connect it in settings|connect it in settings → accounts|no connected account found with id/i.test(String(message || ''))
}

/**
 * Try Composio execute across workspace/company entity IDs (integrations may be
 * stored under either). Stops on first success or first non-connection error.
 */
export async function executeComposioActionForEntities(actionSlug, inputParams = {}, entityIds = []) {
  const candidates = composioEntityCandidates(...entityIds)
  if (!candidates.length) {
    return { error: 'workspaceId or companyId is required for Composio' }
  }

  let lastResult = { error: 'No Composio connection found' }
  for (const userId of candidates) {
    const result = await executeComposioAction(actionSlug, inputParams, userId)
    if (!result.error) return { ...result, composioUserId: userId }
    lastResult = { ...result, composioUserId: userId }
    if (!isComposioMissingConnectionError(result.error)) return lastResult
  }
  return lastResult
}

/**
 * Try Composio proxy execute across workspace/company entity IDs.
 */
export async function executeComposioProxyForEntities(opts = {}, entityIds = []) {
  const candidates = composioEntityCandidates(...entityIds)
  if (!candidates.length) {
    return { error: 'workspaceId or companyId is required for Composio' }
  }

  let lastResult = { error: 'No Composio connection found' }
  for (const userId of candidates) {
    const result = await executeComposioProxy({ ...opts, userId })
    if (!result.error) return { ...result, composioUserId: userId }
    lastResult = { ...result, composioUserId: userId }
    if (!isComposioMissingConnectionError(result.error)) return lastResult
  }
  return lastResult
}

export async function getConnectedAccountApiKeyForEntities(connectorId, entityIds = []) {
  const candidates = composioEntityCandidates(...entityIds)
  if (!candidates.length) return { error: 'workspaceId or companyId is required' }

  let last = { error: 'No connection found' }
  for (const userId of candidates) {
    const result = await getConnectedAccountApiKey(connectorId, userId)
    if (result.api_key) return { ...result, composioUserId: userId }
    last = result
  }
  return last
}

export function formatApolloConnectionError(err) {
  const msg = composioErrorText(err)
  if (/401|403|unauthorized|invalid api key/i.test(msg)) {
    return 'Apollo authorization failed. Open Settings → Integrations, disconnect Apollo, and reconnect with a valid master API key.'
  }
  if (isStaleConnectedAccountError(msg) || isComposioMissingConnectionError(msg)) {
    return 'Apollo connection is missing or stale. Open Settings → Integrations, disconnect Apollo, and reconnect.'
  }
  return msg || 'Apollo search failed'
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

    const runOnce = async ({ bypassCache = false, excludeIds = [] } = {}) => {
      const connectedAccountId = await resolveConnectedAccountId(toolkit, userId, apiKey, {
        bypassCache,
        excludeIds,
      })
      const res = await fetch(`${COMPOSIO_V3}/tools/execute/${actionSlug}`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected_account_id: connectedAccountId,
          user_id: userId,
          arguments: inputParams,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          error: composioErrorText(data?.error?.message || data?.error || data?.message || data),
          connectedAccountId,
        }
      }
      if (data.successful === false) {
        return {
          error: composioErrorText(data?.error || data?.data?.message || 'Action failed'),
          raw: data,
          connectedAccountId,
        }
      }
      return { ok: true, result: data?.data ?? data, connectedAccountId }
    }

    let result = await runOnce({ bypassCache: false })
    if (result.error && isStaleConnectedAccountError(result.error)) {
      invalidateConnectedAccountCache(userId, toolkit)
      // Drop the rejected ca_* id and try the next newest ACTIVE account
      result = await runOnce({
        bypassCache: true,
        excludeIds: result.connectedAccountId ? [result.connectedAccountId] : [],
      })
    }
    if (result.error) return { error: result.error, raw: result.raw }
    return { ok: true, result: result.result }
  } catch (err) {
    return { error: err.message }
  }
}

/**
 * Create or update a Composio trigger instance for a user.
 * Events are delivered to the project webhook URL configured in Composio.
 */
export async function upsertComposioTrigger(slug, { userId = 'default', triggerConfig = {} } = {}) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }
  if (!slug) return { error: 'Trigger slug is required' }

  try {
    const res = await fetch(`${COMPOSIO_V3}/trigger_instances/${encodeURIComponent(slug)}/upsert`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        trigger_config: triggerConfig,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        error: data?.error?.message || data?.message || JSON.stringify(data) || `HTTP ${res.status}`,
        raw: data,
      }
    }
    return {
      ok: true,
      trigger_id: data?.trigger_id || data?.id || data?.triggerId || null,
      result: data,
    }
  } catch (err) {
    return { error: err.message }
  }
}

/** True when Composio has redacted/masked a credential (e.g. "EAAb..." / "REDACTED"). */
export function isMaskedComposioSecret(value) {
  const s = String(value || '').trim()
  if (!s) return true
  if (/^REDACTED$/i.test(s)) return true
  if (s.includes('...')) return true
  // Real Meta/LinkedIn OAuth tokens are long; masked stubs are short prefixes.
  if (s.length < 32) return true
  return false
}

/**
 * Call a provider API through Composio Proxy Execute.
 * Use this instead of extracting access_token from connected-account details —
 * Composio now masks OAuth tokens in API responses.
 *
 * @param {object} opts
 * @param {string} [opts.connectorId]  Marqq connector id (e.g. meta_ads)
 * @param {string} [opts.toolkit]      Composio toolkit slug (e.g. metaads)
 * @param {string} opts.userId
 * @param {string} [opts.method]
 * @param {string} opts.endpoint       Relative path ("/me/adaccounts") or absolute URL
 * @param {Record<string,string|number|boolean>} [opts.query]
 * @param {object|null} [opts.body]
 */
export async function executeComposioProxy({
  connectorId = null,
  toolkit = null,
  userId = 'default',
  method = 'GET',
  endpoint,
  query = {},
  body = null,
} = {}) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }

  const toolkitSlug = toolkit || CONNECTOR_APP_MAP[connectorId] || null
  if (!toolkitSlug) return { error: `Unknown connector/toolkit: ${connectorId || toolkit}` }
  if (!endpoint) return { error: 'endpoint is required' }

  try {
    const connectedAccountId = await resolveConnectedAccountId(toolkitSlug, userId, apiKey)
    const parameters = Object.entries(query || {}).map(([name, value]) => ({
      name,
      type: 'query',
      value: value == null ? '' : String(value),
    }))

    const payload = {
      connected_account_id: connectedAccountId,
      endpoint: String(endpoint),
      method: String(method || 'GET').toUpperCase(),
      parameters,
    }
    if (body != null && payload.method !== 'GET' && payload.method !== 'HEAD') {
      payload.body = body
    }

    const res = await fetch(`${COMPOSIO_V3}/tools/execute/proxy`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        error: composioErrorText(data?.error?.message || data?.error || data?.message || data),
        connectedAccountId,
        raw: data,
      }
    }

    const providerStatus = Number(data?.status || data?.data?.status || 200)
    const providerData = data?.data?.data !== undefined && data?.status != null
      ? data.data
      : (data?.data ?? data)
    const providerError =
      providerData?.error?.message ||
      providerData?.error ||
      (providerStatus >= 400 ? `Provider HTTP ${providerStatus}` : null)
    if (providerError) {
      return {
        error: composioErrorText(providerError),
        connectedAccountId,
        status: providerStatus,
        raw: data,
      }
    }

    return {
      ok: true,
      result: providerData,
      status: providerStatus,
      connectedAccountId,
      headers: data?.headers || data?.data?.headers || null,
    }
  } catch (err) {
    return { error: err.message }
  }
}

/** Convenience: Meta Marketing Graph via Composio proxy (no raw token needed). */
export async function metaGraphProxy(userId, { method = 'GET', path, query = {}, body = null } = {}) {
  const endpoint = String(path || '').startsWith('http')
    ? String(path)
    : String(path || '').startsWith('/')
      ? String(path)
      : `/${String(path || '').replace(/^\/+/, '')}`
  return executeComposioProxy({
    connectorId: 'meta_ads',
    userId,
    method,
    endpoint,
    query,
    body,
  })
}

// ─── Get OAuth access token for a connected account ──────────────────────────
// Prefer executeComposioProxy / executeComposioAction — Composio masks tokens.
// This helper still returns a token when unmasked; otherwise a clear error.

export async function getConnectedAccountToken(connectorId, userId) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }

  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!appName) return { error: `Unknown connector: ${connectorId}` }

  try {
    const res = await fetch(
      // Connected accounts are shared across many toolkits. Keep this page large
      // enough that an Apollo account is not hidden behind newer connections.
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return { error: `Composio list accounts failed: ${res.status}` }
    const data = await res.json()

    // Find the newest active account for this app
    // Use the same connector alias matching as the readiness endpoint. Some
    // Composio responses expose Apollo as `apollo`, `apolloio`, or `apollo_io`.
    // The strict toolkit-slug comparison here previously made a valid Apollo
    // account look disconnected.
    const acct = (data.items || [])
      .filter((item) =>
        accountMatchesUser(item, userId) &&
        toolkitMatchesConnector(connectorId, item.toolkit?.slug || item.toolkit_slug || '') &&
        item.status === 'ACTIVE' &&
        item.id,
      )
      .sort((a, b) => accountRecency(b) - accountRecency(a))[0] || null
    if (!acct) {
      console.warn('[getConnectedAccountApiKey] no matching account', {
        connectorId,
        userId,
        itemCount: Array.isArray(data.items) ? data.items.length : 0,
        matching: (data.items || []).filter((item) => accountMatchesUser(item, userId)).map((item) => ({
          id: item.id,
          status: item.status,
          toolkit: item.toolkit?.slug || item.toolkit_slug || null,
        })).slice(0, 5),
      })
      return { error: `No active ${connectorId} connection for user ${userId}. Connect it in Settings → Accounts.` }
    }

    // Fetch full account with credentials
    const detailRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${acct.id}`, {
      headers: { 'x-api-key': apiKey }
    })
    if (!detailRes.ok) return { error: `Failed to fetch account details: ${detailRes.status}` }
    const detail = await detailRes.json()

    const token =
      detail.data?.access_token ||
      detail.params?.access_token ||
      detail.state?.val?.access_token ||
      null
    if (!token || isMaskedComposioSecret(token)) {
      return {
        error:
          `Composio masks the ${connectorId} OAuth token — use Composio tool/proxy execution instead of raw API calls. ` +
          `If you need a raw token, disable "Mask Connected Account Secrets" in the Composio project settings.`,
        account_id: acct.id,
        masked: true,
      }
    }

    return { access_token: token, account_id: acct.id }
  } catch (err) {
    return { error: err.message }
  }
}

function maskSecret(value) {
  const str = String(value || '')
  if (str.length <= 8) return str ? `${str[0]}***(${str.length})` : ''
  return `${str.slice(0, 2)}***${str.slice(-4)} (len ${str.length})`
}

export async function getConnectedAccountApiKey(connectorId, userId) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { error: 'COMPOSIO_API_KEY not configured' }

  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!appName) return { error: `Unknown connector: ${connectorId}` }

  try {
    const res = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`,
      { headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return { error: `Composio list accounts failed: ${res.status}` }
    const data = await res.json()

    const acct = (data.items || [])
      .filter((item) =>
        accountMatchesUser(item, userId) &&
        toolkitMatchesConnector(connectorId, item.toolkit?.slug || item.toolkit_slug || '') &&
        String(item.status || '').toUpperCase() === 'ACTIVE' &&
        item.id,
      )
      .sort((a, b) => accountRecency(b) - accountRecency(a))[0] || null
    if (!acct) return { error: `No active ${connectorId} connection for user ${userId}. Connect it in Settings → Accounts.` }

    const detailRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${acct.id}`, {
      headers: { 'x-api-key': apiKey }
    })
    if (!detailRes.ok) return { error: `Failed to fetch account details: ${detailRes.status}` }
    const detail = await detailRes.json()

    const genericApiKey = readGenericApiKey(detail)
    if (connectorId === 'apollo') {
      // Diagnostic only — never logs the actual secret value, just where (if anywhere)
      // Composio stored a credential and a masked fingerprint to compare against the
      // key shown in Apollo's own dashboard.
      console.error('[getConnectedAccountApiKey][apollo]', {
        accountId: acct.id,
        status: acct.status,
        updatedAt: acct.updated_at || acct.created_at || null,
        dataKeys: detail?.data && typeof detail.data === 'object' ? Object.keys(detail.data) : null,
        stateValKeys: detail?.state?.val && typeof detail.state.val === 'object' ? Object.keys(detail.state.val) : null,
        paramsKeys: detail?.params && typeof detail.params === 'object' ? Object.keys(detail.params) : null,
        resolvedKeyFingerprint: genericApiKey ? maskSecret(genericApiKey) : null,
      })
    }
    // Composio masks Apollo API keys in account details. The Apollo lead
    // provider executes searches through Composio Proxy, so account presence is
    // sufficient; do not reject a valid connected account just because its
    // credential is redacted.
    if (!genericApiKey && connectorId === 'apollo') {
      return { api_key: 'composio_proxy', account_id: acct.id, masked: true }
    }
    if (!genericApiKey) return { error: `No API key found for ${connectorId} — account may need reconnection` }

    return { api_key: genericApiKey, account_id: acct.id }
  } catch (err) {
    return { error: err.message }
  }
}
