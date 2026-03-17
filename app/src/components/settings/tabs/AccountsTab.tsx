import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useWorkspace } from '@/contexts/WorkspaceContext';

type Connector = {
  id: string;
  name: string;
  status: string;
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
  hubspot:         { category: 'CRM & Customer Data',       description: 'Contacts, deals, and marketing events from HubSpot.',               logoBg: 'bg-[#FF7A59]', logoLabel: 'HS'  },
  zoho_crm:        { category: 'CRM & Customer Data',       description: 'Deals, contacts, and accounts from Zoho CRM.',                      logoBg: 'bg-[#E71E63]', logoLabel: 'Z'   },
  salesforce:      { category: 'CRM & Customer Data',       description: 'Accounts, opportunities, and pipelines from Salesforce.',            logoBg: 'bg-[#00A1E0]', logoLabel: 'SF'  },
  // Email & Messaging
  gmail:           { category: 'Email & Messaging',         description: 'Read campaign threads and outreach (read-only).',                   logoBg: 'bg-[#EA4335]', logoLabel: 'G'   },
  outlook:         { category: 'Email & Messaging',         description: 'Outlook mailboxes for sales and marketing outreach.',               logoBg: 'bg-[#0078D4]', logoLabel: 'O'   },
  mailchimp:       { category: 'Email & Messaging',         description: 'Email campaigns, audiences, and automations from Mailchimp.',       logoBg: 'bg-[#FFE01B]', logoLabel: 'MC'  },
  klaviyo:         { category: 'Email & Messaging',         description: 'Email & SMS flows, campaigns, and list metrics from Klaviyo.',      logoBg: 'bg-[#1A1A1A]', logoLabel: 'KL'  },
  sendgrid:        { category: 'Email & Messaging',         description: 'Transactional and marketing email stats from SendGrid.',            logoBg: 'bg-[#1A82E2]', logoLabel: 'SG'  },
  instantly:       { category: 'Email & Messaging',         description: 'Cold outreach campaigns and reply tracking from Instantly.',        logoBg: 'bg-[#6366F1]', logoLabel: 'IN'  },
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
  // Content & Creative
  canva:           { category: 'Content & Creative',        description: 'Create and manage design assets in Canva.',                       logoBg: 'bg-[#00C4CC]', logoLabel: 'CV'  },
  heygen:          { category: 'Content & Creative',        description: 'AI avatar video generation via HeyGen.',                         logoBg: 'bg-[#6C47FF]', logoLabel: 'HG'  },
  elevenlabs:      { category: 'Content & Creative',        description: 'AI voice generation and text-to-speech from ElevenLabs.',        logoBg: 'bg-[#1A1A1A]', logoLabel: 'EL'  },
  veo:             { category: 'Content & Creative',        description: 'Google Veo AI video generation.',                                logoBg: 'bg-[#4285F4]', logoLabel: 'VEO' },
  wordpress:       { category: 'Content & Creative',        description: 'Blog and landing page content for SEO performance.',             logoBg: 'bg-[#21759B]', logoLabel: 'WP'  },
  // Automation & Data
  make:            { category: 'Automation & Data',         description: 'Trigger and manage Make (Integromat) automation scenarios.',     logoBg: 'bg-[#6D00CC]', logoLabel: 'MK'  },
  apify:           { category: 'Automation & Data',         description: 'Web scraping and data extraction via Apify actors.',             logoBg: 'bg-[#1DB954]', logoLabel: 'AP'  },
  shopify:         { category: 'Automation & Data',         description: 'Orders, products, and revenue from your Shopify store.',         logoBg: 'bg-[#008060]', logoLabel: 'S'   },
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

export function AccountsTab() {
  const { activeWorkspace } = useWorkspace();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const companyId = activeWorkspace?.id;
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`);
      const json = await res.json();
      setConnectors(json?.connectors ?? []);
    } catch { setConnectors([]); } finally { setLoading(false); }
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  // Listen for OAuth success message from popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'composio_oauth_success') return
      const connectorId = e.data?.connectorId as string | undefined
      setActionId(null)
      toast.success(`${connectorId ? CONNECTOR_META[connectorId]?.logoLabel || connectorId : 'Account'} connected successfully`)
      load()
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [load]);

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
    const companyId = activeWorkspace?.id;
    if (!companyId) { toast.error('Create or select a workspace first'); return; }
    setActionId(id);
    try {
      const res = await fetch('/api/integrations/connect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, connectorId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'connect failed');
      if (json.redirectUrl) {
        const popup = window.open(json.redirectUrl, 'composio_oauth', 'width=600,height=700,left=200,top=100');
        toast.info('Complete the connection in the popup window');
        // Fallback: if user closes popup without completing, clear the loading state
        const poll = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(poll);
            setActionId(null);
            load();
          }
        }, 1500);
      } else {
        await load();
        toast.success('Connected');
        setActionId(null);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Connect failed');
      setActionId(null);
    }
  };

  const disconnect = async (id: string) => {
    setActionId(id);
    try {
      const companyId = activeWorkspace?.id;
      if (!companyId) { toast.error('Create or select a workspace first'); setActionId(null); return; }
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, connectorId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.details || 'disconnect failed');
      await load(); toast.success('Disconnected');
    } catch (err: any) { toast.error(err?.message || 'Disconnect failed'); } finally { setActionId(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Accounts & Integrations</h2>
        <p className="text-sm text-muted-foreground">
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
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : connectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No integrations available.</p>
      ) : (
        <div className="space-y-6">
          {groupedConnectors.map(group => (
            <section key={group.category} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{group.category}</h3>
              </div>
              <div className="space-y-2">
                {group.items.map(c => {
                  const meta = CONNECTOR_META[c.id];
                  const description = meta?.description || c.notes;
                  return (
                    <div
                      key={c.id}
                      className="border rounded-lg p-4 flex items-center justify-between gap-3 bg-card"
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
                        <Badge variant={c.connected ? 'default' : 'secondary'}>
                          {c.connected ? 'Connected' : 'Not connected'}
                        </Badge>
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
                            disabled={actionId === c.id}
                            onClick={() => connect(c.id)}
                          >
                            {actionId === c.id ? 'Connecting…' : 'Connect'}
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
    </div>
  );
}
