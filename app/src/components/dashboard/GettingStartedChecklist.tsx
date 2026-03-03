import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, ChevronUp, Globe, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { fetchJson } from '@/components/modules/company-intelligence/api';
import { toast } from 'sonner';

const DISMISSED_KEY = 'torqq_checklist_dismissed';

interface GettingStartedChecklistProps {
  onNavigate: (moduleId: string) => void;
}

function queueCompanyIntelAutorun(companyName: string, websiteUrl: string, companyId?: string) {
  try {
    sessionStorage.setItem('torqq_company_intel_autorun', JSON.stringify({
      companyName,
      websiteUrl,
      companyId,
    }));
  } catch {
    // non-blocking
  }
}

function normalizeWebsiteUrl(url: string) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

function deriveCompanyName(baseName: string | undefined, websiteUrl: string) {
  let derivedName = baseName || 'Company';
  try {
    const hostname = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname
      .replace(/^www\./, '').split('.')[0];
    if (hostname) derivedName = hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    // keep fallback
  }
  return derivedName;
}

function isNetworkFetchError(error: unknown) {
  return error instanceof TypeError && error.message === 'Failed to fetch';
}

export function GettingStartedChecklist({ onNavigate }: GettingStartedChecklistProps) {
  const { user } = useAuth();
  const { activeWorkspace, updateWebsiteUrl } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1'
  );
  const [websiteUrl, setWebsiteUrl] = useState(activeWorkspace?.website_url ?? '');
  const [savingUrl, setSavingUrl] = useState(false);
  const [showCompanyIntelCta, setShowCompanyIntelCta] = useState(false);
  const [hasIntegration, setHasIntegration] = useState(false);
  const [hasAgentRun, setHasAgentRun] = useState(false);
  const [allDoneShown, setAllDoneShown] = useState(false);

  useEffect(() => {
    setWebsiteUrl(activeWorkspace?.website_url ?? '');
  }, [activeWorkspace?.id, activeWorkspace?.website_url]);

  const checkCompletionStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/integrations?userId=${encodeURIComponent(user.id)}`);
      const d = await res.json();
      const connected = (d?.connectors ?? []).some((c: { connected: boolean }) => c.connected);
      setHasIntegration(connected);
    } catch { /* ignore */ }

    if (activeWorkspace?.id) {
      try {
        const res = await fetch(`/api/agents/status?workspaceId=${activeWorkspace.id}`);
        const d = await res.json();
        const agents = d?.agents ?? {};
        setHasAgentRun(
          Object.values(agents).some((agent: any) => !!agent?.last_run)
        );
      } catch { /* ignore */ }
    }
  }, [user?.id, activeWorkspace?.id]);

  useEffect(() => { checkCompletionStatus(); }, [checkCompletionStatus]);

  const step1Complete = Boolean(activeWorkspace?.website_url);
  const step2Complete = hasIntegration;
  const step3Complete = step1Complete && hasAgentRun;
  const completedCount = [step1Complete, step2Complete, step3Complete].filter(Boolean).length;
  const allComplete = completedCount === 3;

  useEffect(() => {
    if (allComplete && !allDoneShown) {
      setAllDoneShown(true);
      const t = setTimeout(() => {
        localStorage.setItem(DISMISSED_KEY, '1');
        setDismissed(true);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [allComplete, allDoneShown]);

  const handleSaveUrl = async () => {
    const url = websiteUrl.trim();
    if (!url) return;
    setSavingUrl(true);
    try {
      await updateWebsiteUrl(url);
      const derivedName = deriveCompanyName(activeWorkspace?.name, url);
      queueCompanyIntelAutorun(derivedName, url)
      void (async () => {
        try {
          const normalizedUrl = normalizeWebsiteUrl(url);
          const existing = await fetchJson<{ companies: Array<{ id: string; websiteUrl: string | null }> }>('/api/company-intel/companies');
          let companyId = existing.companies.find((company) => (
            company.websiteUrl && normalizeWebsiteUrl(company.websiteUrl) === normalizedUrl
          ))?.id;

          if (!companyId) {
            const created = await fetchJson<{ company: { id: string } }>('/api/company-intel/companies', {
              method: 'POST',
              body: JSON.stringify({ companyName: derivedName, websiteUrl: url })
            });
            companyId = created.company.id;
          }

          if (companyId) {
            queueCompanyIntelAutorun(derivedName, url, companyId)
            await fetchJson(`/api/company-intel/companies/${companyId}/generate-all`, {
              method: 'POST',
              body: JSON.stringify({
                inputs: {
                  goal: 'Increase qualified leads',
                  geo: 'India',
                  timeframe: '90 days',
                  channels: ['instagram', 'linkedin', 'youtube', 'whatsapp'],
                  notes: 'Keep it compliance-safe (no guaranteed returns).'
                }
              })
            });
            await fetchJson('/api/agents/zara/mark-run', {
              method: 'POST',
              body: JSON.stringify({ durationMs: 0 })
            });
            setHasAgentRun(true);
          }
        } catch (backgroundError) {
          if (!isNetworkFetchError(backgroundError)) {
            console.error('Background company intel sync failed:', backgroundError);
          }
        }
      })();

      toast.success('Website URL saved. Company intelligence is being populated in the background.')
      setShowCompanyIntelCta(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingUrl(false);
    }
  };

  if (dismissed) return null;

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="mx-4 mt-3 mb-1 border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
            {completedCount}/3
          </span>
          <div className="text-left">
            <p className="font-semibold text-sm">Let's get started, {firstName}</p>
            <p className="text-xs text-muted-foreground">
              Follow these steps to get the most out of Torqq
            </p>
          </div>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* All done */}
      {allComplete && !collapsed && (
        <div className="px-5 pb-4 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          You're all set! Collapsing in a moment…
        </div>
      )}

      {/* Steps */}
      {!collapsed && !allComplete && (
        <div className="divide-y">
          {/* Step 1 */}
          <div className="px-5 py-4 flex gap-4">
            <div className="mt-0.5 shrink-0">
              {step1Complete
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Globe className="h-5 w-5 text-orange-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Enter your website URL</p>
              <p className="text-xs text-muted-foreground mb-2">
                Strategy agent (Zara) will research and analyze your brand automatically
              </p>
              {!step1Complete && (
                <div className="flex gap-2">
                  <Input
                    placeholder="https://yourcompany.com"
                    value={websiteUrl}
                    onChange={e => setWebsiteUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveUrl}
                    disabled={savingUrl || !websiteUrl.trim()}
                  >
                    {savingUrl ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              )}
              {(step1Complete || showCompanyIntelCta) && (
                <div className="mt-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => {
                      if (activeWorkspace?.website_url) {
                        const derivedName = deriveCompanyName(activeWorkspace.name, activeWorkspace.website_url);
                        queueCompanyIntelAutorun(derivedName, activeWorkspace.website_url)
                      }
                      onNavigate('company-intelligence');
                    }}
                  >
                    Show Company Intel →
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className={cn('px-5 py-4 flex items-center gap-4', step2Complete && 'opacity-60')}>
            <div className="shrink-0">
              {step2Complete
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Plug className="h-5 w-5 text-blue-500" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Connect an account</p>
              <p className="text-xs text-muted-foreground">
                Link Google Ads, Meta or LinkedIn for live data
              </p>
            </div>
            {!step2Complete && (
              <Button variant="outline" size="sm" onClick={() => onNavigate('settings-accounts')}>
                + Connect
              </Button>
            )}
          </div>

          {/* Step 3 */}
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="shrink-0">
              {step3Complete
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Bot className="h-5 w-5 text-purple-500" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Run your first AI agent</p>
              <p className="text-xs text-muted-foreground">
                Ask Maya, Riya or any agent to start working
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('home')}>
              {step3Complete ? '→ Open' : '→ Run'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
