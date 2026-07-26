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
  whatsapp: { label: 'WhatsApp', bg: 'bg-[#25D366]' },
  sendgrid: { label: 'SendGrid', bg: 'bg-[#1A82E2]' },
  gmail: { label: 'Gmail', bg: 'bg-[#EA4335]' },
  shopify: { label: 'Shopify', bg: 'bg-[#008060]' },
  linkedin: { label: 'LinkedIn', bg: 'bg-[#0A66C2]' },
  facebook: { label: 'Facebook', bg: 'bg-[#0866FF]' },
  instagram: { label: 'Instagram', bg: 'bg-[#E1306C]' },
  moengage: { label: 'MoEngage', bg: 'bg-[#4F46E5]' },
  clevertap: { label: 'CleverTap', bg: 'bg-[#FF6B6B]' },
  google_calendar: { label: 'Google Calendar', bg: 'bg-[#4285F4]' },
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
