/** Shared Composio connector labels for gates + CTAs */

export const CONNECTOR_DISPLAY: Record<string, { label: string; bg: string }> = {
  ga4: { label: 'Google Analytics', bg: 'bg-[#F9AB00]' },
  gsc: { label: 'Search Console', bg: 'bg-[#4285F4]' },
  google_ads: { label: 'Google Ads', bg: 'bg-[#34A853]' },
  meta_ads: { label: 'Meta Ads', bg: 'bg-[#0668E1]' },
  linkedin_ads: { label: 'LinkedIn Ads', bg: 'bg-[#0A66C2]' },
  hubspot: { label: 'HubSpot', bg: 'bg-[#FF7A59]' },
  salesforce: { label: 'Salesforce', bg: 'bg-[#00A1E0]' },
  zoho_crm: { label: 'Zoho CRM', bg: 'bg-[#E71E63]' },
  apollo: { label: 'Apollo', bg: 'bg-[#5B6CFF]' },
  hunter: { label: 'Hunter', bg: 'bg-[#FA5320]' },
  semrush: { label: 'Semrush', bg: 'bg-[#FF6A00]' },
  ahrefs: { label: 'Ahrefs', bg: 'bg-[#0A66FF]' },
  mixpanel: { label: 'Mixpanel', bg: 'bg-[#5F2EEA]' },
  amplitude: { label: 'Amplitude', bg: 'bg-[#1C6BFF]' },
  klaviyo: { label: 'Klaviyo', bg: 'bg-[#1A1A1A]' },
  mailchimp: { label: 'Mailchimp', bg: 'bg-[#FFE01B]' },
  instantly: { label: 'Instantly', bg: 'bg-[#6366F1]' },
  heyreach: { label: 'HeyReach', bg: 'bg-[#111827]' },
  lemlist: { label: 'Lemlist', bg: 'bg-[#F97316]' },
  whatsapp: { label: 'WhatsApp', bg: 'bg-[#25D366]' },
  sendgrid: { label: 'SendGrid', bg: 'bg-[#1A82E2]' },
  gmail: { label: 'Gmail', bg: 'bg-[#EA4335]' },
  outlook: { label: 'Outlook', bg: 'bg-[#0078D4]' },
  zoho_mail: { label: 'Zoho Mail', bg: 'bg-[#E71E63]' },
  slack: { label: 'Slack', bg: 'bg-[#4A154B]' },
  shopify: { label: 'Shopify', bg: 'bg-[#008060]' },
  wix: { label: 'Wix', bg: 'bg-[#0C6EFC]' },
  hostinger: { label: 'Hostinger', bg: 'bg-[#673DE6]' },
  firecrawl: { label: 'Firecrawl', bg: 'bg-[#111827]' },
  github: { label: 'GitHub', bg: 'bg-[#24292F]' },
  railway: { label: 'Railway', bg: 'bg-[#111827]' },
  cloudflare: { label: 'Cloudflare', bg: 'bg-[#F38020]' },
  linkedin: { label: 'LinkedIn', bg: 'bg-[#0A66C2]' },
  facebook: { label: 'Facebook', bg: 'bg-[#0866FF]' },
  instagram: { label: 'Instagram', bg: 'bg-[#E1306C]' },
  twitter: { label: 'X (Twitter)', bg: 'bg-[#111827]' },
  moengage: { label: 'MoEngage', bg: 'bg-[#4F46E5]' },
  clevertap: { label: 'CleverTap', bg: 'bg-[#FF6B6B]' },
  wordpress: { label: 'WordPress', bg: 'bg-[#21759B]' },
  webflow: { label: 'Webflow', bg: 'bg-[#4353FF]' },
  google_docs: { label: 'Google Docs', bg: 'bg-[#4285F4]' },
  google_sheets: { label: 'Google Sheets', bg: 'bg-[#0F9D58]' },
  google_drive: { label: 'Google Drive', bg: 'bg-[#4285F4]' },
  google_calendar: { label: 'Google Calendar', bg: 'bg-[#4285F4]' },
  youtube: { label: 'YouTube', bg: 'bg-[#FF0000]' },
  one_drive: { label: 'OneDrive', bg: 'bg-[#0078D4]' },
  microsoft_sheets: { label: 'Microsoft Excel', bg: 'bg-[#217346]' },
  reddit: { label: 'Reddit', bg: 'bg-[#FF4500]' },
  canva: { label: 'Canva', bg: 'bg-[#00C4CC]' },
  pexels: { label: 'Pexels', bg: 'bg-[#05A081]' },
  gemini: { label: 'Google Gemini', bg: 'bg-[#4285F4]' },
  make: { label: 'Make', bg: 'bg-[#6D00CC]' },
  apify: { label: 'Apify', bg: 'bg-[#1DB954]' },
  snowflake: { label: 'Snowflake', bg: 'bg-[#29B5E8]' },
  openai: { label: 'OpenAI', bg: 'bg-[#10A37F]' },
  anthropic: { label: 'Anthropic', bg: 'bg-[#D97757]' },
  perplexity: { label: 'Perplexity', bg: 'bg-[#1A1A1A]' },
};

export function connectorLabel(id: string): string {
  return CONNECTOR_DISPLAY[id]?.label || id;
}

/** Match Integrations menu: prefer `connected`, also accept active-ish status strings. */
export function isConnectorActive(connector: {
  connected?: boolean
  status?: string
} | null | undefined): boolean {
  if (!connector) return false
  if (connector.connected) return true
  const status = String(connector.status || '').toLowerCase()
  return status === 'active' || status === 'connected' || status === 'success'
}
