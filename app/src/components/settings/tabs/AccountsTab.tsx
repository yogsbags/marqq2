import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { addIntegrationConnectedListener, connectComposioConnector, formatConnectorError } from '@/lib/composio';
import { cn } from '@/lib/utils';
import { BarChart2, Check, ChevronDown, Globe, Loader2, Mail, Megaphone, Search, X } from 'lucide-react';

type Connector = {
  id: string;
  name: string;
  status: 'active' | 'expired' | 'initiated' | 'not_connected' | string;
  notes?: string;
  connected?: boolean;
  connectedAt?: string | null;
};

type ConnectorCategory =
  | 'Advertising & Acquisition'
  | 'CRM & Customer Data'
  | 'Email & Messaging'
  | 'Google Workspace'
  | 'Analytics & SEO'
  | 'Social & Community'
  | 'Content & Creative'
  | 'Automation & Data'
  | 'AI Providers'

type ConnectorMeta = {
  category: ConnectorCategory
  description: string
  logoBg: string
  logoLabel: string
  logoUrl?: string
}

const CONNECTOR_META: Record<string, ConnectorMeta> = {
  // Advertising & Acquisition
  google_ads:      { category: 'Advertising & Acquisition', description: 'Sync campaigns, ad groups, and costs from Google Ads.',            logoBg: 'bg-[#4285F4]', logoLabel: 'G'   },
  meta_ads:        { category: 'Advertising & Acquisition', description: 'Connect Facebook & Instagram ad accounts.',                         logoBg: 'bg-[#0866FF]', logoLabel: 'M'   },
  linkedin_ads:    { category: 'Advertising & Acquisition', description: 'LinkedIn campaign performance for B2B funnels.',                    logoBg: 'bg-[#0A66C2]', logoLabel: 'IN'  },
  // CRM
  apollo:          { category: 'CRM & Customer Data',       description: 'B2B people/account search and enrichment (lead-data provider).',        logoBg: 'bg-[#5B6CFF]', logoLabel: 'AP'  },
  hubspot:         { category: 'CRM & Customer Data',       description: 'Contacts, deals, and marketing events from HubSpot.',               logoBg: 'bg-[#FF7A59]', logoLabel: 'HS'  },
  zoho_crm:        { category: 'CRM & Customer Data',       description: 'Deals, contacts, and accounts from Zoho CRM.',                      logoBg: 'bg-[#E71E63]', logoLabel: 'Z'   },
  salesforce:      { category: 'CRM & Customer Data',       description: 'Accounts, opportunities, and pipelines from Salesforce.',            logoBg: 'bg-[#00A1E0]', logoLabel: 'SF'  },
  // Email & Messaging
  gmail:           { category: 'Email & Messaging',         description: 'Read campaign threads and outreach (read-only).',                   logoBg: 'bg-[#EA4335]', logoLabel: 'G'   },
  outlook:         { category: 'Email & Messaging',         description: 'Outlook mailboxes for sales and marketing outreach.',               logoBg: 'bg-[#0078D4]', logoLabel: 'O'   },
  hunter:          { category: 'CRM & Customer Data',       description: 'Find emails by domain/company — alternate lead-data provider to Apollo.', logoBg: 'bg-[#FF6A3D]', logoLabel: 'HU'  },
  mailchimp:       { category: 'Email & Messaging',         description: 'Email campaigns, audiences, and automations from Mailchimp.',       logoBg: 'bg-[#FFE01B]', logoLabel: 'MC'  },
  klaviyo:         { category: 'Email & Messaging',         description: 'Email & SMS flows, campaigns, and list metrics from Klaviyo.',      logoBg: 'bg-[#1A1A1A]', logoLabel: 'KL'  },
  sendgrid:        { category: 'Email & Messaging',         description: 'Transactional and marketing email stats from SendGrid.',            logoBg: 'bg-[#1A82E2]', logoLabel: 'SG'  },
  instantly:       { category: 'Email & Messaging',         description: 'Cold outreach campaigns and reply tracking from Instantly.',        logoBg: 'bg-[#6366F1]', logoLabel: 'IN'  },
  lemlist:         { category: 'Email & Messaging',         description: 'Multichannel outreach campaigns and reply tracking from Lemlist.',    logoBg: 'bg-[#F97316]', logoLabel: 'LE'  },
  whatsapp:        { category: 'Email & Messaging',         description: 'WhatsApp Business messaging and campaign automation.',              logoBg: 'bg-[#25D366]', logoLabel: 'WA'  },
  slack:           { category: 'Email & Messaging',         description: 'Send alerts and reports to Slack channels.',                       logoBg: 'bg-[#4A154B]', logoLabel: 'SL'  },
  zoho_mail:       { category: 'Email & Messaging',         description: 'Zoho Mail for business email and outreach.',                       logoBg: 'bg-[#E71E63]', logoLabel: 'ZM'  },
  // Google Workspace
  ga4:             { category: 'Google Workspace',          description: 'Web analytics, events, and conversions from GA4.',                 logoBg: 'bg-[#F9AB00]', logoLabel: 'GA'  },
  gsc:             { category: 'Google Workspace',          description: 'Search queries, impressions, and clicks from Search Console.',     logoBg: 'bg-[#34A853]', logoLabel: 'GSC' },
  google_sheets:   { category: 'Google Workspace',          description: 'Google Sheets as a central marketing data source.',               logoBg: 'bg-[#0F9D58]', logoLabel: 'GS'  },
  google_docs:     { category: 'Google Workspace',          description: 'Read and write marketing docs and briefs in Google Docs.',         logoBg: 'bg-[#4285F4]', logoLabel: 'GD'  },
  google_drive:    { category: 'Google Workspace',          description: 'Access and manage files and assets in Google Drive.',              logoBg: 'bg-[#4285F4]', logoLabel: 'GDr' },
  google_calendar: { category: 'Google Workspace',          description: 'Sync content calendar and campaign schedules.',                   logoBg: 'bg-[#4285F4]', logoLabel: 'GC'  },
  youtube:         { category: 'Google Workspace',          description: 'Video performance, comments, and channel analytics from YouTube.', logoBg: 'bg-[#FF0000]', logoLabel: 'YT'  },
  one_drive:       { category: 'Google Workspace',          description: 'OneDrive / SharePoint file access for Microsoft users.',          logoBg: 'bg-[#0078D4]', logoLabel: 'OD'  },
  // Analytics & SEO
  semrush:         { category: 'Analytics & SEO',           description: 'SEO and PPC competitive intelligence from Semrush.',               logoBg: 'bg-[#FF6A00]', logoLabel: 'SE'  },
  ahrefs:          { category: 'Analytics & SEO',           description: 'Backlinks, rankings, and content gaps from Ahrefs.',               logoBg: 'bg-[#0A66FF]', logoLabel: 'AH'  },
  mixpanel:        { category: 'Analytics & SEO',           description: 'Product analytics events, funnels, and retention from Mixpanel.',  logoBg: 'bg-[#5F2EEA]', logoLabel: 'MX'  },
  amplitude:       { category: 'Analytics & SEO',           description: 'Behavioral analytics and user journey data from Amplitude.',       logoBg: 'bg-[#1C6BFF]', logoLabel: 'AM'  },
  moengage:        { category: 'Analytics & SEO',           description: 'Customer engagement events and cohorts from MoEngage.',            logoBg: 'bg-[#4F46E5]', logoLabel: 'ME'  },
  clevertap:       { category: 'Analytics & SEO',           description: 'Journeys, campaigns, and cohorts from CleverTap.',                 logoBg: 'bg-[#FF6B6B]', logoLabel: 'CT'  },
  // Social & Community
  linkedin:        { category: 'Social & Community',        description: 'LinkedIn profile, posts, and organic social data.',               logoBg: 'bg-[#0A66C2]', logoLabel: 'LI'  },
  facebook:        { category: 'Social & Community',        description: 'Facebook Pages posts, insights, and audience data.',              logoBg: 'bg-[#0866FF]', logoLabel: 'FB'  },
  reddit:          { category: 'Social & Community',        description: 'Reddit posts, comments, and community signals.',                  logoBg: 'bg-[#FF4500]', logoLabel: 'R'   },
  instagram:       { category: 'Social & Community',        description: 'Instagram business profile posts and engagement.',                logoBg: 'bg-[#E1306C]', logoLabel: 'IG'  },
  twitter:         { category: 'Social & Community',        description: 'X (Twitter) posts and organic publishing.',                       logoBg: 'bg-[#111827]', logoLabel: 'X'   },
  // Content & Creative
  canva:           { category: 'Content & Creative',        description: 'Create and manage design assets in Canva.',                       logoBg: 'bg-[#00C4CC]', logoLabel: 'CV'  },
  heygen:          { category: 'Content & Creative',        description: 'AI avatar video generation via HeyGen.',                         logoBg: 'bg-[#6C47FF]', logoLabel: 'HG'  },
  elevenlabs:      { category: 'Content & Creative',        description: 'AI voice generation and text-to-speech from ElevenLabs.',        logoBg: 'bg-[#1A1A1A]', logoLabel: 'EL'  },
  veo:             { category: 'Content & Creative',        description: 'Google Veo AI video generation.',                                logoBg: 'bg-[#4285F4]', logoLabel: 'VEO' },
  wordpress:       { category: 'Content & Creative',        description: 'Blog and landing page content for SEO performance.',             logoBg: 'bg-[#21759B]', logoLabel: 'WP'  },
  webflow:         { category: 'Content & Creative',        description: 'Publish blogs and landing pages to Webflow CMS collections.',   logoBg: 'bg-[#4353FF]', logoLabel: 'WF'  },
  wix:             { category: 'Content & Creative',        description: 'Manage Wix site content and publishing workflows.',               logoBg: 'bg-[#0C6EFC]', logoLabel: 'W'   },
  // Automation & Data
  make:            { category: 'Automation & Data',         description: 'Trigger and manage Make (Integromat) automation scenarios.',     logoBg: 'bg-[#6D00CC]', logoLabel: 'MK'  },
  apify:           { category: 'Automation & Data',         description: 'Web scraping and data extraction via Apify actors.',             logoBg: 'bg-[#1DB954]', logoLabel: 'AP'  },
  shopify:         { category: 'Automation & Data',         description: 'Store data plus Shopify blog article publishing.',                 logoBg: 'bg-[#008060]', logoLabel: 'S'   },
  hostinger:       { category: 'Automation & Data',         description: 'Hosting, domains, DNS, and technical site checks.',             logoBg: 'bg-[#673DE6]', logoLabel: 'H'   },
  firecrawl:       { category: 'Automation & Data',         description: 'Rendered site crawling, scraping, and structured audits.',         logoBg: 'bg-[#111827]', logoLabel: 'FC'  },
  github:          { category: 'Automation & Data',         description: 'Repository content publishing and workflow dispatch.',              logoBg: 'bg-[#24292F]', logoLabel: 'GH'  },
  railway:         { category: 'Automation & Data',         description: 'Deployment status, logs, and environment context.',               logoBg: 'bg-[#111827]', logoLabel: 'RW'  },
  cloudflare:      { category: 'Automation & Data',         description: 'DNS, zones, and production site health context.',                  logoBg: 'bg-[#F38020]', logoLabel: 'CF'  },
  snowflake:       { category: 'Automation & Data',         description: 'Read-only warehouse access for advanced data modeling.',         logoBg: 'bg-[#29B5E8]', logoLabel: 'SF'  },
  // AI Providers
  openai:          { category: 'AI Providers',              description: 'OpenAI GPT models for agent tasks and content generation.',      logoBg: 'bg-[#10A37F]', logoLabel: 'OAI' },
  anthropic:       { category: 'AI Providers',              description: 'Anthropic Claude models for reasoning and analysis.',            logoBg: 'bg-[#D97757]', logoLabel: 'ANT' },
  perplexity:      { category: 'AI Providers',              description: 'Real-time web search and AI answers from Perplexity.',           logoBg: 'bg-[#1A1A1A]', logoLabel: 'PPX' },
}

const CATEGORY_ORDER: ConnectorCategory[] = [
  'Advertising & Acquisition',
  'CRM & Customer Data',
  'Email & Messaging',
  'Google Workspace',
  'Analytics & SEO',
  'Social & Community',
  'Content & Creative',
  'Automation & Data',
  'AI Providers',
]

function IntegrationLogo({ id, name }: { id: string; name: string }) {
  const meta = CONNECTOR_META[id];
  const label = meta?.logoLabel || name.charAt(0).toUpperCase();
  const bg = meta?.logoBg || 'bg-slate-700';

  if (meta?.logoUrl) {
    return (
      <div className="h-8 w-8 rounded-md overflow-hidden flex items-center justify-center bg-background">
        <img
          src={meta.logoUrl}
          alt={name}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-semibold text-white ${bg}`}>
      {label}
    </div>
  );
}

// ─── Resource preference helpers (local cache + server sync) ─────────────────

type ResourceOption = {
  id: string
  displayName: string
  subtitle?: string
}

const GA4_PROPERTY_KEY = (wsId: string) => `marqq_ga4_property_${wsId}`;
const META_AD_ACCOUNT_KEY = (wsId: string) => `marqq_meta_ad_account_${wsId}`;
const GOOGLE_ADS_CUSTOMER_KEY = (wsId: string) => `marqq_google_ads_customer_${wsId}`;
const GSC_SITE_KEY = (wsId: string) => `marqq_gsc_site_${wsId}`;
const WEBFLOW_SITE_KEY = (wsId: string) => `marqq_webflow_site_${wsId}`;
const WEBFLOW_BLOG_COLLECTION_KEY = (wsId: string) => `marqq_webflow_blog_collection_${wsId}`;
const WEBFLOW_LANDING_COLLECTION_KEY = (wsId: string) => `marqq_webflow_landing_collection_${wsId}`;
const MAILCHIMP_LIST_KEY = (wsId: string) => `marqq_mailchimp_list_${wsId}`;

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}

export function getGA4PropertyId(workspaceId: string): string | null {
  return readLocal(GA4_PROPERTY_KEY(workspaceId));
}
export function getMetaAdAccountId(workspaceId: string): string | null {
  return readLocal(META_AD_ACCOUNT_KEY(workspaceId));
}
export function getGoogleAdsCustomerId(workspaceId: string): string | null {
  return readLocal(GOOGLE_ADS_CUSTOMER_KEY(workspaceId));
}
export function getGscSiteUrl(workspaceId: string): string | null {
  return readLocal(GSC_SITE_KEY(workspaceId));
}
export function getWebflowSiteId(workspaceId: string): string | null {
  return readLocal(WEBFLOW_SITE_KEY(workspaceId));
}
export function getWebflowBlogCollectionId(workspaceId: string): string | null {
  return readLocal(WEBFLOW_BLOG_COLLECTION_KEY(workspaceId));
}
export function getWebflowLandingCollectionId(workspaceId: string): string | null {
  return readLocal(WEBFLOW_LANDING_COLLECTION_KEY(workspaceId));
}
export function getMailchimpListId(workspaceId: string): string | null {
  return readLocal(MAILCHIMP_LIST_KEY(workspaceId));
}

const LEAD_DATA_PROVIDER_KEY = (ws: string) => `marqq:lead_data_provider:${ws}`

export function getLeadDataProvider(workspaceId: string): string | null {
  return readLocal(LEAD_DATA_PROVIDER_KEY(workspaceId));
}

async function savePreference(
  workspaceId: string,
  localKey: string,
  serverField: string,
  value: string,
) {
  writeLocal(localKey, value);
  try {
    await fetch('/api/integrations/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: workspaceId, [serverField]: value }),
    });
  } catch {
    // local cache still works offline; server sync best-effort
  }
}

type ResourcePickerConfig = {
  title: string
  description: string
  accentClass: string
  icon: ReactNode
  fetchUrl: (workspaceId: string) => string
  parseOptions: (data: any) => ResourceOption[]
  localKey: (workspaceId: string) => string
  serverField: string
  getSaved: (workspaceId: string) => string | null
  saveLabel: string
  emptyMessage: string
  manualInputLabel?: string
  manualPlaceholder?: string
  manualHelp?: string
}

function ResourcePickerModal({
  workspaceId,
  config,
  onClose,
}: {
  workspaceId: string
  config: ResourcePickerConfig
  onClose: () => void
}) {
  const [options, setOptions] = useState<ResourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const current = config.getSaved(workspaceId);

  useEffect(() => {
    setLoading(true);
    fetch(config.fetchUrl(workspaceId))
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        const parsed = config.parseOptions(data);
        setOptions(parsed);
        const saved = config.getSaved(workspaceId) || data.preferred || null;
        if (saved) setSelected(saved);
        else if (parsed.length === 1) setSelected(parsed[0].id);
      })
      .catch(e => setError(e.message || 'Failed to load options'))
      .finally(() => setLoading(false));
  }, [workspaceId, config]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    const valueToSave = config.serverField === 'ga4_property_id' && /^\d+$/.test(selected)
      ? `properties/${selected}`
      : selected;
    await savePreference(workspaceId, config.localKey(workspaceId), config.serverField, valueToSave);
    const opt = options.find(o => o.id === selected || o.id === valueToSave);
    toast.success(`${config.title.replace(/^Select\s+/i, '')} set to "${opt?.displayName || valueToSave}"`);
    setSaving(false);
    onClose();
  }

  const selectedOpt = options.find(o => o.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-background shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <div className={`h-8 w-8 rounded-lg ${config.accentClass} flex items-center justify-center flex-shrink-0`}>
            {config.icon}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{config.title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{config.description}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          {!loading && !error && options.length === 0 && !config.manualInputLabel && (
            <p className="text-sm text-muted-foreground text-center py-6">{config.emptyMessage}</p>
          )}
          {!loading && !error && options.length === 0 && config.manualInputLabel && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">{config.manualInputLabel}</label>
              <input
                value={selected || ''}
                onChange={e => setSelected(e.target.value.trim() || null)}
                placeholder={config.manualPlaceholder}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none focus:border-orange-400/70 focus:ring-2 focus:ring-orange-400/10"
              />
              {config.manualHelp && <p className="text-[11px] text-muted-foreground">{config.manualHelp}</p>}
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{config.emptyMessage}</p>
            </div>
          )}
          {!loading && !error && options.length > 0 && (
            <>
              <div className="relative">
                <button
                  onClick={() => setOpen(o => !o)}
                  className="w-full flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm hover:border-orange-400/60 transition-colors"
                >
                  <span className={cn('text-left flex-1', !selectedOpt && 'text-muted-foreground')}>
                    {selectedOpt ? (
                      <span className="flex flex-col">
                        <span className="font-medium text-foreground">{selectedOpt.displayName}</span>
                        {selectedOpt.subtitle && (
                          <span className="text-[10px] text-muted-foreground">{selectedOpt.subtitle}</span>
                        )}
                      </span>
                    ) : 'Select…'}
                  </span>
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground ml-2 flex-shrink-0 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-border/60 bg-popover shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {options.map(o => (
                      <button
                        key={o.id}
                        onClick={() => { setSelected(o.id); setOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors',
                          selected === o.id && 'bg-orange-50/60 dark:bg-orange-950/20',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{o.displayName}</p>
                          {o.subtitle && (
                            <p className="text-[10px] text-muted-foreground truncate">{o.subtitle}</p>
                          )}
                        </div>
                        {selected === o.id && <Check className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {current && current !== selected && (
                <p className="text-[11px] text-muted-foreground">
                  Currently saved: <span className="font-medium text-foreground">{options.find(o => o.id === current)?.displayName || current}</span>
                </p>
              )}
              {options.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {options.length} accounts found — pick which one Marqq should use.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!selected || saving || loading}
            onClick={save}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {config.saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

const GA4_PICKER: ResourcePickerConfig = {
  title: 'Select GA4 Property',
  description: 'Choose which property to use for your Performance dashboard',
  accentClass: 'bg-[#F9AB00]/15',
  icon: <BarChart2 className="h-4 w-4 text-[#F9AB00]" />,
  fetchUrl: (ws) => `/api/analytics/ga4/properties?companyId=${encodeURIComponent(ws)}`,
  parseOptions: (data) => (data.properties || []).map((p: any) => ({
    id: p.id,
    displayName: p.displayName || p.id,
    subtitle: `${p.account || ''} · ${p.id}`.trim(),
  })),
  localKey: GA4_PROPERTY_KEY,
  serverField: 'ga4_property_id',
  getSaved: getGA4PropertyId,
  saveLabel: 'Save property',
  emptyMessage: 'Property discovery is temporarily unavailable for this connection.',
  manualInputLabel: 'GA4 property ID',
  manualPlaceholder: 'properties/123456789 or 123456789',
  manualHelp: 'Enter the GA4 Admin property ID. Marqq will normalize a numeric ID to properties/123456789.',
};

const META_PICKER: ResourcePickerConfig = {
  title: 'Select Meta Ad Account',
  description: 'Choose which Facebook/Instagram ad account campaigns should use',
  accentClass: 'bg-[#0866FF]/15',
  icon: <Megaphone className="h-4 w-4 text-[#0866FF]" />,
  fetchUrl: (ws) => `/api/analytics/meta-ads/accounts?companyId=${encodeURIComponent(ws)}`,
  parseOptions: (data) => (data.accounts || []).map((a: any) => ({
    id: a.id,
    displayName: a.displayName || a.name || a.id,
    subtitle: [a.currency, a.id].filter(Boolean).join(' · '),
  })),
  localKey: META_AD_ACCOUNT_KEY,
  serverField: 'meta_ads_account_id',
  getSaved: getMetaAdAccountId,
  saveLabel: 'Save account',
  emptyMessage: 'No Meta ad accounts found for this connection.',
};

const GOOGLE_ADS_PICKER: ResourcePickerConfig = {
  title: 'Select Google Ads Account',
  description: 'Choose which Google Ads customer account to use',
  accentClass: 'bg-[#4285F4]/15',
  icon: <Megaphone className="h-4 w-4 text-[#4285F4]" />,
  fetchUrl: (ws) => `/api/analytics/google-ads/accounts?companyId=${encodeURIComponent(ws)}`,
  parseOptions: (data) => (data.accounts || []).map((a: any) => ({
    id: a.id,
    displayName: a.displayName || a.id,
    subtitle: a.id,
  })),
  localKey: GOOGLE_ADS_CUSTOMER_KEY,
  serverField: 'google_ads_customer_id',
  getSaved: getGoogleAdsCustomerId,
  saveLabel: 'Save account',
  emptyMessage: 'No Google Ads accounts found for this connection.',
};

const GSC_PICKER: ResourcePickerConfig = {
  title: 'Select Search Console Site',
  description: 'Choose which site property to use for SEO metrics',
  accentClass: 'bg-[#34A853]/15',
  icon: <Search className="h-4 w-4 text-[#34A853]" />,
  fetchUrl: (ws) => `/api/analytics/gsc/sites?companyId=${encodeURIComponent(ws)}`,
  parseOptions: (data) => (data.sites || data.accounts || []).map((s: any) => ({
    id: s.id || s.siteUrl,
    displayName: s.displayName || s.siteUrl || s.id,
    subtitle: s.permissionLevel ? `Permission: ${s.permissionLevel}` : undefined,
  })),
  localKey: GSC_SITE_KEY,
  serverField: 'gsc_site_url',
  getSaved: getGscSiteUrl,
  saveLabel: 'Save site',
  emptyMessage: 'No Search Console sites found for this connection.',
};

const WEBFLOW_SITE_PICKER: ResourcePickerConfig = {
  title: 'Select Webflow Site',
  description: 'Choose which Webflow site receives blog and landing-page publishes',
  accentClass: 'bg-[#4353FF]/15',
  icon: <Globe className="h-4 w-4 text-[#4353FF]" />,
  fetchUrl: (ws) => `/api/webflow/sites?companyId=${encodeURIComponent(ws)}`,
  parseOptions: (data) => (data.sites || []).map((s: any) => ({
    id: s.id,
    displayName: s.displayName || s.id,
    subtitle: s.shortName || s.previewUrl || undefined,
  })),
  localKey: WEBFLOW_SITE_KEY,
  serverField: 'webflow_site_id',
  getSaved: getWebflowSiteId,
  saveLabel: 'Save site',
  emptyMessage: 'No Webflow sites found for this connection.',
};

const MAILCHIMP_LIST_PICKER: ResourcePickerConfig = {
  title: 'Select Mailchimp Audience',
  description: 'Audience for newsletter go-live and subscribe / campaign webhook triggers',
  accentClass: 'bg-[#FFE01B]/20',
  icon: <Mail className="h-4 w-4 text-[#241c15]" />,
  fetchUrl: (ws) => `/api/mailchimp/audiences?companyId=${encodeURIComponent(ws)}`,
  parseOptions: (data) => (data.audiences || []).map((a: any) => ({
    id: a.id,
    displayName: a.displayName || a.id,
    subtitle: a.memberCount != null ? `${a.memberCount} members` : undefined,
  })),
  localKey: MAILCHIMP_LIST_KEY,
  serverField: 'mailchimp_list_id',
  getSaved: getMailchimpListId,
  saveLabel: 'Save audience',
  emptyMessage: 'No Mailchimp audiences found for this connection.',
};

const PICKER_BY_CONNECTOR: Record<string, ResourcePickerConfig> = {
  ga4: GA4_PICKER,
  meta_ads: META_PICKER,
  google_ads: GOOGLE_ADS_PICKER,
  gsc: GSC_PICKER,
  webflow: WEBFLOW_SITE_PICKER,
  mailchimp: MAILCHIMP_LIST_PICKER,
};

// ─────────────────────────────────────────────────────────────────────────────

export function AccountsTab() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [pickerConnectorId, setPickerConnectorId] = useState<string | null>(null);
  const [preferredLeadProvider, setPreferredLeadProvider] = useState<string | null>(null);

  // Composio connections are per workspace/company — each workspace is a separate entityId
  // so an agency user can have different Google Ads, Meta Ads etc. per client workspace
  const entityId = activeWorkspace?.id;

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(entityId)}`);
      const json = await res.json();
      setConnectors(json?.connectors ?? []);
      setPreferredLeadProvider(getLeadDataProvider(entityId) || json?.preferences?.lead_data_provider || null);
    } catch { setConnectors([]); } finally { setLoading(false); }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  // Prompt account selection for already-connected multi-account connectors
  useEffect(() => {
    if (!entityId || !connectors.length) return;
    let cancelled = false;
    (async () => {
      for (const c of connectors) {
        if (!c.connected || !PICKER_BY_CONNECTOR[c.id]) continue;
        const config = PICKER_BY_CONNECTOR[c.id];
        if (config.getSaved(entityId)) continue;
        try {
          const res = await fetch(config.fetchUrl(entityId));
          const data = await res.json();
          if (cancelled || data.error) continue;
          const options = config.parseOptions(data);
          if (options.length === 1 && c.id !== 'ga4' && c.id !== 'gsc') {
            await savePreference(entityId, config.localKey(entityId), config.serverField, options[0].id);
          } else if (options.length > 0 || ((c.id === 'ga4' || c.id === 'gsc') && data.needsSelection)) {
            setPickerConnectorId(c.id);
            break; // one picker at a time
          }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [entityId, connectors]);

  const maybeOpenResourcePicker = useCallback(async (connectorId: string, workspaceId: string) => {
    const config = PICKER_BY_CONNECTOR[connectorId];
    if (!config) return;
    try {
      const res = await fetch(config.fetchUrl(workspaceId));
      const data = await res.json();
      if (data.error) return;
      const options = config.parseOptions(data);
      if (options.length === 1 && connectorId !== 'ga4' && connectorId !== 'gsc') {
        await savePreference(workspaceId, config.localKey(workspaceId), config.serverField, options[0].id);
        toast.success(`${config.title.replace(/^Select\s+/i, '')} set to "${options[0].displayName}"`);
        return;
      }
      if (options.length > 0 || ((connectorId === 'ga4' || connectorId === 'gsc') && data.needsSelection)) {
        setPickerConnectorId(connectorId);
      }
    } catch {
      // ignore — user can open picker manually
    }
  }, []);

  useEffect(() => {
    return addIntegrationConnectedListener(({ companyId, connectorId }) => {
      if (companyId !== entityId) return
      setActionId(null)
      toast.success(`${connectorId ? CONNECTOR_META[connectorId]?.logoLabel || connectorId : 'Account'} connected successfully`)
      load()
      if (connectorId && entityId) {
        void maybeOpenResourcePicker(connectorId, entityId)
      }
    })
  }, [entityId, load, maybeOpenResourcePicker]);

  const groupedConnectors = useMemo(() => {
    const buckets: Record<string, Connector[]> = {};
    for (const c of connectors) {
      const meta = CONNECTOR_META[c.id];
      const category = meta?.category || 'Other';
      if (!buckets[category]) buckets[category] = [];
      buckets[category].push(c);
    }
    // Preserve category order, but only include those that have connectors
    const ordered: Array<{ category: string; items: Connector[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      if (buckets[cat]?.length) {
        ordered.push({ category: cat, items: buckets[cat] });
      }
    }
    if (buckets['Other']?.length) {
      ordered.push({ category: 'Other', items: buckets['Other'] });
    }
    return ordered;
  }, [connectors]);

  const connect = async (id: string) => {
    if (!entityId) { toast.error('Select a workspace to connect integrations'); return; }
    setActionId(id);
    try {
      toast.info('Complete the connection in the popup window');
      const result = await connectComposioConnector({
        companyId: entityId,
        connectorId: id,
        userEmail: user?.email,
        userName: user?.name,
        onConnected: async () => {
          await load()
        },
      });
      if (result.status === 'closed') {
        setActionId(null);
        await load();
      }
    } catch (err: any) {
      toast.error(formatConnectorError(err, 'Connect failed'));
      setActionId(null);
    }
  };

  const disconnect = async (id: string) => {
    setActionId(id);
    try {
      if (!entityId) { toast.error('Select a workspace to disconnect integrations'); setActionId(null); return; }
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: entityId, connectorId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.details || 'disconnect failed');
      await load(); toast.success('Disconnected');
    } catch (err: any) { toast.error(err?.message || 'Disconnect failed'); } finally { setActionId(null); }
  };

  const pickerConfig = pickerConnectorId ? PICKER_BY_CONNECTOR[pickerConnectorId] : null;

  const connectedLeadProviders = useMemo(
    () => connectors.filter((c) => c.connected && (c.id === 'apollo' || c.id === 'hunter')).map((c) => c.id),
    [connectors],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] px-5 py-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">Integrations</div>
        <h2 className="mt-2 font-brand-syne text-2xl font-semibold tracking-tight text-foreground">Accounts & Integrations</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Connect ad, analytics, and commerce platforms via secure OAuth. Agents only receive read-only access
          where possible, and your data is encrypted in transit and at rest with industry-standard, military-grade
          security controls.
        </p>
      </div>
      {!activeWorkspace && (
        <p className="text-sm text-amber-500">
          Create a workspace to connect integrations.
        </p>
      )}
      {entityId && connectedLeadProviders.length > 1 && (
        <div className="rounded-[24px] border border-border/70 bg-card/90 p-4 shadow-sm space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Preferred lead data provider</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Used for ICP → outreach prospecting when more than one is connected. Apollo is better for
              industry/title people search; Hunter is better for emails at known company domains.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedLeadProviders.map((id) => {
              const active = (preferredLeadProvider || connectedLeadProviders[0]) === id;
              return (
                <Button
                  key={id}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={async () => {
                    await savePreference(entityId, LEAD_DATA_PROVIDER_KEY(entityId), 'lead_data_provider', id);
                    setPreferredLeadProvider(id);
                    toast.success(`Lead data provider set to ${id === 'apollo' ? 'Apollo' : 'Hunter'}`);
                  }}
                >
                  {id === 'apollo' ? 'Apollo' : 'Hunter'}
                  {active ? ' · active' : ''}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !activeWorkspace ? null : connectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No integrations available.</p>
      ) : (
        <div className="space-y-6">
          {groupedConnectors.map(group => (
            <section key={group.category} className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.category}</h3>
              </div>
              <div className="space-y-2">
                {group.items.map(c => {
                  const meta = CONNECTOR_META[c.id];
                  const description = meta?.description || c.notes;
                  const hasPicker = Boolean(PICKER_BY_CONNECTOR[c.id]);
                  const pickerLabel =
                    c.id === 'ga4' ? 'Property' :
                    c.id === 'gsc' || c.id === 'webflow' ? 'Site' :
                    'Account';
                  return (
                    <div
                      key={c.id}
                      className="rounded-[24px] border border-border/70 p-4 flex items-center justify-between gap-3 bg-card/90 shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <IntegrationLogo id={c.id} name={c.name} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{c.name}</p>
                          {description && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {description}
                            </p>
                          )}
                          {c.connectedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Connected {new Date(c.connectedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.connected ? (
                          <Badge variant="default">Connected</Badge>
                        ) : c.status === 'expired' ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : c.status === 'initiated' ? (
                          <Badge variant="outline">Pending</Badge>
                        ) : (
                          <Badge variant="secondary">Not connected</Badge>
                        )}
                        {c.connected && hasPicker && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPickerConnectorId(c.id)}
                            className="text-orange-600 border-orange-400/40 hover:border-orange-500/70 hover:bg-orange-500/10"
                          >
                            {pickerLabel}
                          </Button>
                        )}
                        {c.connected ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionId === c.id}
                            onClick={() => disconnect(c.id)}
                          >
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={c.status === 'expired' ? 'destructive' : 'default'}
                            disabled={actionId === c.id}
                            onClick={() => connect(c.id)}
                          >
                            {actionId === c.id ? 'Connecting…' : c.status === 'expired' ? 'Reconnect' : 'Connect'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {pickerConfig && activeWorkspace?.id && (
        <ResourcePickerModal
          workspaceId={activeWorkspace.id}
          config={pickerConfig}
          onClose={() => setPickerConnectorId(null)}
        />
      )}
    </div>
  );
}
