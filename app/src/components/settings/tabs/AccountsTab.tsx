import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Connector = {
  id: string;
  name: string;
  status: string;
  notes?: string;
  connected?: boolean;
  connectedAt?: string | null;
};

type ConnectorMeta = {
  category: 'Advertising & Acquisition' | 'Email & Messaging' | 'CRM & Customer Data' | 'Analytics & Experimentation' | 'Engagement & Product' | 'Commerce & Data Warehouse';
  description: string;
  logoBg: string;
  logoLabel: string;
  logoUrl?: string;
};

const CONNECTOR_META: Record<string, ConnectorMeta> = {
  google_ads: {
    category: 'Advertising & Acquisition',
    description: 'Sync campaigns, ad groups, and costs from Google Ads.',
    logoBg: 'bg-[#4285F4]',
    logoLabel: 'G'
  },
  meta_ads: {
    category: 'Advertising & Acquisition',
    description: 'Connect Facebook & Instagram ad accounts.',
    logoBg: 'bg-[#0866FF]',
    logoLabel: 'M'
  },
  linkedin_ads: {
    category: 'Advertising & Acquisition',
    description: 'Bring in LinkedIn campaign performance for B2B funnels.',
    logoBg: 'bg-[#0A66C2]',
    logoLabel: 'IN'
  },
  gmail: {
    category: 'Email & Messaging',
    description: 'Let agents read campaign threads and outreach (read-only).',
    logoBg: 'bg-[#EA4335]',
    logoLabel: 'G'
  },
  outlook: {
    category: 'Email & Messaging',
    description: 'Connect Outlook mailboxes used for sales and marketing outreach.',
    logoBg: 'bg-[#0078D4]',
    logoLabel: 'O'
  },
  zoho_crm: {
    category: 'CRM & Customer Data',
    description: 'Sync deals, contacts, and accounts from Zoho CRM.',
    logoBg: 'bg-[#E71E63]',
    logoLabel: 'Z'
  },
  hubspot: {
    category: 'CRM & Customer Data',
    description: 'Sync contacts, deals, and marketing events from HubSpot.',
    logoBg: 'bg-[#FF7A59]',
    logoLabel: 'HS'
  },
  salesforce: {
    category: 'CRM & Customer Data',
    description: 'Accounts, opportunities, and pipelines from Salesforce.',
    logoBg: 'bg-[#00A1E0]',
    logoLabel: 'SF'
  },
  ga4: {
    category: 'Analytics & Experimentation',
    description: 'Web analytics, events, and conversions from GA4.',
    logoBg: 'bg-[#F9AB00]',
    logoLabel: 'GA'
  },
  gsc: {
    category: 'Analytics & Experimentation',
    description: 'Search queries, impressions, and clicks from Google Search Console.',
    logoBg: 'bg-[#34A853]',
    logoLabel: 'GSC'
  },
  google_sheets: {
    category: 'Analytics & Experimentation',
    description: 'Use Google Sheets as a central marketing data source.',
    logoBg: 'bg-[#0F9D58]',
    logoLabel: 'GS'
  },
  microsoft_sheets: {
    category: 'Analytics & Experimentation',
    description: 'Use Excel / OneDrive sheets for reports and experiments.',
    logoBg: 'bg-[#107C41]',
    logoLabel: 'XL'
  },
  semrush: {
    category: 'Analytics & Experimentation',
    description: 'SEO and PPC competitive intelligence from Semrush.',
    logoBg: 'bg-[#FF6A00]',
    logoLabel: 'SE'
  },
  ahrefs: {
    category: 'Analytics & Experimentation',
    description: 'Backlinks, rankings, and content gaps from Ahrefs.',
    logoBg: 'bg-[#0A66FF]',
    logoLabel: 'AH'
  },
  moengage: {
    category: 'Engagement & Product',
    description: 'Customer engagement events and cohorts from MoEngage.',
    logoBg: 'bg-[#4F46E5]',
    logoLabel: 'ME'
  },
  mixpanel: {
    category: 'Engagement & Product',
    description: 'Product analytics events, funnels, and retention cohorts from Mixpanel.',
    logoBg: 'bg-[#5F2EEA]',
    logoLabel: 'MX'
  },
  clevertap: {
    category: 'Engagement & Product',
    description: 'Journeys, campaigns, and cohorts from CleverTap.',
    logoBg: 'bg-[#FF6B6B]',
    logoLabel: 'CT'
  },
  wordpress: {
    category: 'Engagement & Product',
    description: 'Blog and landing page content for SEO and content performance.',
    logoBg: 'bg-[#21759B]',
    logoLabel: 'WP'
  },
  shopify: {
    category: 'Commerce & Data Warehouse',
    description: 'Orders, products, and revenue from your Shopify store.',
    logoBg: 'bg-[#008060]',
    logoLabel: 'S'
  },
  snowflake: {
    category: 'Commerce & Data Warehouse',
    description: 'Read-only warehouse role for advanced modeling.',
    logoBg: 'bg-[#29B5E8]',
    logoLabel: 'SF'
  }
};

const CATEGORY_ORDER: ConnectorMeta['category'][] = [
  'Advertising & Acquisition',
  'Email & Messaging',
  'CRM & Customer Data',
  'Analytics & Experimentation',
  'Engagement & Product',
  'Commerce & Data Warehouse'
];

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
  const { user } = useAuth();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations?userId=${encodeURIComponent(user.id)}`);
      const json = await res.json();
      setConnectors(json?.connectors ?? []);
    } catch { setConnectors([]); } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

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
    setActionId(id);
    try {
      const res = await fetch('/api/integrations/connect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, connectorId: id, authType: 'oauth' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.details || 'connect failed');
      await load(); toast.success('Connected');
    } catch (err: any) { toast.error(err?.message || 'Connect failed'); } finally { setActionId(null); }
  };

  const disconnect = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, connectorId: id }),
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
                            Connect
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
