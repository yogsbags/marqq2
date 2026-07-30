import { connectorLabel } from '@/lib/connectorMeta'

export type ExecutionWorkstream = 'outreach' | 'content' | 'dashboard' | 'monitoring'

export type ExecutionConnectorPlan = {
  id: string
  role: string
  required?: boolean
}

export type ExecutionPlan = {
  id: ExecutionWorkstream
  label: string
  description: string
  primaryCta: string
  destination: string
  connectors: ExecutionConnectorPlan[]
  requiredAny?: Array<{ ids: string[]; label: string }>
  steps: string[]
}

// Keep this catalog aligned with platform/content-engine/mcp-router.js.
// Readiness is evaluated from the connector IDs returned by /api/integrations.
export const EXISTING_CONNECTOR_IDS = [
  'google_ads', 'meta_ads', 'linkedin_ads',
  'apollo', 'hubspot', 'zoho_crm', 'salesforce',
  'gmail', 'outlook', 'hunter', 'mailchimp', 'klaviyo', 'sendgrid',
  'instantly', 'heyreach', 'lemlist', 'whatsapp', 'slack', 'zoho_mail',
  'ga4', 'gsc', 'google_sheets', 'google_docs', 'google_drive', 'google_calendar', 'youtube',
  'one_drive', 'microsoft_sheets',
  'semrush', 'ahrefs', 'mixpanel', 'amplitude', 'moengage', 'clevertap',
  'linkedin', 'facebook', 'reddit', 'instagram', 'twitter',
  'canva', 'heygen', 'elevenlabs', 'veo',
  'make', 'apify', 'shopify', 'wix', 'hostinger', 'firecrawl', 'github', 'railway', 'cloudflare', 'snowflake', 'wordpress', 'webflow',
  'openai', 'anthropic', 'perplexity',
] as const

export const EXECUTION_PLANS: Record<ExecutionWorkstream, ExecutionPlan> = {
  outreach: {
    id: 'outreach',
    label: 'Outreach',
    description: 'Build, approve, send, and measure targeted outreach without losing CRM or consent context.',
    primaryCta: 'Open outreach workspace',
    destination: 'lead-intelligence',
    connectors: [
      { id: 'apollo', role: 'Find and enrich target accounts' },
      { id: 'hunter', role: 'Find and verify business emails' },
      { id: 'instantly', role: 'Send and track email sequences', required: true },
      { id: 'heyreach', role: 'Run LinkedIn outreach sequences' },
      { id: 'whatsapp', role: 'Send approved WhatsApp outreach' },
      { id: 'hubspot', role: 'Sync contacts, replies, and lifecycle stages' },
      { id: 'salesforce', role: 'Sync accounts, opportunities, and activity' },
      { id: 'zoho_crm', role: 'Sync accounts, opportunities, and activity' },
      { id: 'gmail', role: 'Use a connected mailbox for replies and threads' },
      { id: 'outlook', role: 'Use a connected Microsoft mailbox' },
      { id: 'slack', role: 'Receive alerts and approval notifications' },
    ],
    requiredAny: [{ ids: ['apollo', 'hunter'], label: 'Apollo or Hunter for lead sourcing' }],
    steps: ['Build target list', 'Approve accounts', 'Draft sequence', 'Approve send', 'Track replies and qualified meetings'],
  },
  content: {
    id: 'content',
    label: 'Content & publishing',
    description: 'Create channel-native content, review it in context, then schedule or publish with approval.',
    primaryCta: 'Open content workspace',
    destination: 'ai-content',
    connectors: [
      { id: 'linkedin', role: 'Publish and measure LinkedIn content' },
      { id: 'facebook', role: 'Publish and measure Facebook content' },
      { id: 'instagram', role: 'Publish and measure Instagram content' },
      { id: 'twitter', role: 'Publish and measure X content' },
      { id: 'youtube', role: 'Publish and measure video content' },
      { id: 'semrush', role: 'Research search demand and content gaps' },
      { id: 'ahrefs', role: 'Research rankings, backlinks, and competitors' },
      { id: 'gsc', role: 'Measure search queries and article performance' },
      { id: 'apify', role: 'Run selected keyword and SERP research Actors' },
      { id: 'firecrawl', role: 'Audit rendered pages and schema when needed' },
      { id: 'wordpress', role: 'Publish blog and landing page content' },
      { id: 'webflow', role: 'Publish CMS content and landing pages' },
      { id: 'wix', role: 'Use connected Wix site content context' },
      { id: 'shopify', role: 'Publish Shopify blog articles' },
      { id: 'github', role: 'Publish repository-based site content' },
      { id: 'railway', role: 'Verify repository deployment status' },
      { id: 'cloudflare', role: 'Verify production domain and DNS context' },
      { id: 'google_docs', role: 'Read and save briefs and drafts' },
      { id: 'google_drive', role: 'Use approved assets and files' },
      { id: 'canva', role: 'Create and manage visual assets' },
      { id: 'ga4', role: 'Measure traffic and conversions from content' },
    ],
    steps: ['Create brief', 'Generate native draft', 'Review preview', 'Approve publishing', 'Track qualified engagement'],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboards & analytics',
    description: 'Connect outcome data, ask questions in natural language, and turn variance into approved interventions.',
    primaryCta: 'Open performance dashboard',
    destination: 'performance-scorecard',
    connectors: [
      { id: 'ga4', role: 'Web traffic, events, and conversions' },
      { id: 'gsc', role: 'Search visibility and query performance' },
      { id: 'hubspot', role: 'Pipeline, lifecycle, and attribution data' },
      { id: 'salesforce', role: 'Pipeline, opportunity, and revenue data' },
      { id: 'zoho_crm', role: 'Pipeline, opportunity, and revenue data' },
      { id: 'mixpanel', role: 'Product funnels and retention' },
      { id: 'amplitude', role: 'Product journeys and cohorts' },
      { id: 'moengage', role: 'Engagement and lifecycle cohorts' },
      { id: 'clevertap', role: 'Journeys, campaigns, and cohorts' },
      { id: 'google_ads', role: 'Paid acquisition cost and conversion data' },
      { id: 'meta_ads', role: 'Paid social cost and conversion data' },
      { id: 'linkedin_ads', role: 'B2B paid acquisition data' },
      { id: 'google_sheets', role: 'Manual targets and operational inputs' },
      { id: 'snowflake', role: 'Warehouse-level reporting and modeling' },
    ],
    requiredAny: [{ ids: ['ga4', 'mixpanel', 'amplitude', 'hubspot', 'salesforce', 'zoho_crm'], label: 'one analytics or CRM source' }],
    steps: ['Connect sources', 'Map North Star metrics', 'Review baseline', 'Ask a question', 'Approve intervention'],
  },
  monitoring: {
    id: 'monitoring',
    label: 'Research & monitoring',
    description: 'Watch competitors, search demand, channels, and market signals without changing strategy silently.',
    primaryCta: 'Open monitoring workspace',
    destination: 'company-intelligence',
    connectors: [
      { id: 'apify', role: 'Collect structured public web signals' },
      { id: 'semrush', role: 'Monitor search and competitor visibility' },
      { id: 'ahrefs', role: 'Monitor rankings, backlinks, and content gaps' },
      { id: 'gsc', role: 'Monitor owned search performance' },
      { id: 'ga4', role: 'Monitor owned traffic and conversions' },
      { id: 'linkedin', role: 'Monitor organic social signals' },
      { id: 'reddit', role: 'Monitor community conversations' },
      { id: 'youtube', role: 'Monitor video and competitor signals' },
      { id: 'google_sheets', role: 'Store watchlists and review inputs' },
      { id: 'slack', role: 'Deliver alerts and weekly briefs' },
    ],
    steps: ['Choose watchlist', 'Collect signals', 'Review evidence', 'Assess strategy impact', 'Create approved response'],
  },
}

export function connectorPlansFor(workstream: ExecutionWorkstream) {
  return EXECUTION_PLANS[workstream].connectors
}

export function connectorReadiness(workstream: ExecutionWorkstream, connectedIds: string[]) {
  const connected = new Set(connectedIds)
  const plans = connectorPlansFor(workstream)
  const required = plans.filter((connector) => connector.required)
  const missingRequired = required.filter((connector) => !connected.has(connector.id))
  const missingRequiredAny = (EXECUTION_PLANS[workstream].requiredAny || []).filter(
    (group) => !group.ids.some((id) => connected.has(id)),
  )
  const connectedCount = plans.filter((connector) => connected.has(connector.id)).length
  return {
    ready: missingRequired.length === 0 && missingRequiredAny.length === 0,
    missingRequired,
    missingRequiredAny,
    connectedCount,
    total: plans.length,
    coverage: plans.length ? Math.round((connectedCount / plans.length) * 100) : 0,
  }
}

export function formatExecutionConnector(id: string) {
  return connectorLabel(id)
}
