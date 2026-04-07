import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { BRAND } from '@/lib/brand';
import { fetchJson } from '@/components/modules/company-intelligence/api';
import { toast } from 'sonner';

const DISMISSED_KEY = 'marqq_checklist_dismissed';

function getWebsiteStepKey(workspaceId: string) {
  return `marqq_checklist_website_step_completed:${workspaceId}`;
}

function getIntegrationStepKey(workspaceId: string) {
  return `marqq_checklist_integration_step_completed:${workspaceId}`;
}

function getFirstRunStepKey(workspaceId: string) {
  return `marqq_checklist_first_run_step_completed:${workspaceId}`;
}

interface GettingStartedChecklistProps {
  onNavigate: (moduleId: string) => void;
  onWebsiteSaved?: (websiteUrl: string) => void;
}

function queueCompanyIntelAutorun(companyName: string, websiteUrl: string, companyId?: string) {
  try {
    sessionStorage.setItem('marqq_company_intel_autorun', JSON.stringify({
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

function StepBadge({
  stepNumber,
  complete,
  active,
}: {
  stepNumber: 1 | 2 | 3;
  complete: boolean;
  active: boolean;
}) {
  if (complete) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  }

  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold shadow-sm",
        active
          ? "border-orange-500 bg-orange-500 text-white dark:border-orange-500 dark:bg-orange-500 dark:text-white"
          : "border-orange-300 bg-background text-orange-600 dark:border-orange-700 dark:bg-gray-950 dark:text-orange-300"
      )}
    >
      <span>{stepNumber}</span>
    </div>
  );
}

export function GettingStartedChecklist({ onNavigate, onWebsiteSaved }: GettingStartedChecklistProps) {
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
  const [websiteStepCompleted, setWebsiteStepCompleted] = useState(false);
  const [integrationStepCompleted, setIntegrationStepCompleted] = useState(false);
  const [firstRunStepCompleted, setFirstRunStepCompleted] = useState(false);
  const [runningFirstAgent, setRunningFirstAgent] = useState(false);

  useEffect(() => {
    setWebsiteUrl(activeWorkspace?.website_url ?? '');
  }, [activeWorkspace?.id, activeWorkspace?.website_url]);

  useEffect(() => {
    if (!activeWorkspace?.id) {
      setWebsiteStepCompleted(false);
      setIntegrationStepCompleted(false);
      setFirstRunStepCompleted(false);
      return;
    }

    try {
      setWebsiteStepCompleted(localStorage.getItem(getWebsiteStepKey(activeWorkspace.id)) === '1');
      setIntegrationStepCompleted(localStorage.getItem(getIntegrationStepKey(activeWorkspace.id)) === '1');
      setFirstRunStepCompleted(localStorage.getItem(getFirstRunStepKey(activeWorkspace.id)) === '1');
    } catch {
      setWebsiteStepCompleted(false);
      setIntegrationStepCompleted(false);
      setFirstRunStepCompleted(false);
    }
  }, [activeWorkspace?.id]);

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

  const hasCapturedWebsite = Boolean(activeWorkspace?.website_url?.trim());
  const step1Complete = websiteStepCompleted || hasCapturedWebsite;
  const step2Complete = step1Complete && integrationStepCompleted;
  const step3Complete = step2Complete && firstRunStepCompleted;
  const activeStep = !step1Complete ? 1 : !step2Complete ? 2 : !step3Complete ? 3 : null;
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

  const startCompanyIntel = useCallback(async (rawWebsiteUrl: string) => {
    const normalizedUrl = normalizeWebsiteUrl(rawWebsiteUrl);
    const derivedName = deriveCompanyName(activeWorkspace?.name, rawWebsiteUrl);
    const existing = await fetchJson<{ companies: Array<{ id: string; websiteUrl: string | null }> }>('/api/company-intel/companies');
    let companyId = existing.companies.find((company) => (
      company.websiteUrl && normalizeWebsiteUrl(company.websiteUrl) === normalizedUrl
    ))?.id;

    if (!companyId) {
      const created = await fetchJson<{ company: { id: string } }>('/api/company-intel/companies', {
        method: 'POST',
        body: JSON.stringify({ companyName: derivedName, websiteUrl: rawWebsiteUrl })
      });
      companyId = created.company.id;
    }

    if (!companyId) {
      throw new Error('Unable to prepare company intelligence.');
    }

    queueCompanyIntelAutorun(derivedName, rawWebsiteUrl, companyId);
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

    return { companyId, derivedName };
  }, [activeWorkspace?.name]);

  const handleSaveUrl = async () => {
    const url = websiteUrl.trim();
    if (!url) return;
    setSavingUrl(true);
    try {
      await updateWebsiteUrl(url);
      if (activeWorkspace?.id) {
        localStorage.setItem(getWebsiteStepKey(activeWorkspace.id), '1');
        setWebsiteStepCompleted(true);
      }
      onWebsiteSaved?.(url);
      await startCompanyIntel(url);
      toast.success('Website URL saved. Starting Company Intelligence.')
      setShowCompanyIntelCta(true);
      onNavigate('company-intelligence');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingUrl(false);
    }
  };

  if (dismissed) return null;

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const handleRunFirstAgent = async () => {
    const currentWebsiteUrl = activeWorkspace?.website_url?.trim();
    if (!currentWebsiteUrl || !activeWorkspace?.id) {
      toast.error('Save your website URL first.');
      return;
    }
    if (!step2Complete) {
      toast.error('Connect an account before running your first agent.');
      onNavigate('integrations');
      return;
    }

    setRunningFirstAgent(true);
    try {
      await startCompanyIntel(currentWebsiteUrl);
      await fetchJson('/api/agents/zara/mark-run', {
        method: 'POST',
        body: JSON.stringify({ durationMs: 0 })
      });
      setHasAgentRun(true);
      if (activeWorkspace?.id) {
        localStorage.setItem(getFirstRunStepKey(activeWorkspace.id), '1');
        setFirstRunStepCompleted(true);
      }
      toast.success('Your first AI run has started.');
      onNavigate('company-intelligence');
    } catch (error) {
      if (!isNetworkFetchError(error)) {
        console.error('First AI run failed:', error);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to run your first AI agent');
    } finally {
      setRunningFirstAgent(false);
    }
  };

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
              Follow these steps to get the most out of {BRAND.name}
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
          <div
            className={cn(
              "px-5 py-4 flex gap-4 border-l-2",
              activeStep === 1
                ? "border-l-orange-500 bg-orange-50/40 dark:bg-orange-950/10"
                : "border-l-transparent"
            )}
          >
            <div className="mt-0.5 shrink-0">
              <StepBadge stepNumber={1} complete={step1Complete} active={activeStep === 1} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Enter your website URL</p>
              <p className="text-xs text-muted-foreground mb-2">
                {hasCapturedWebsite
                  ? 'Your company website is already captured. Open Company Intelligence to review it.'
                  : 'Save your company website so agents can use the right business context.'}
              </p>
              {!hasCapturedWebsite && (
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
              {(hasCapturedWebsite || showCompanyIntelCta) && (
                <div className="mt-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => {
                      if (activeWorkspace?.website_url) {
                        const derivedName = deriveCompanyName(activeWorkspace.name, activeWorkspace.website_url);
                        queueCompanyIntelAutorun(derivedName, activeWorkspace.website_url);
                      }
                      onNavigate('company-intelligence');
                    }}
                  >
                    Show Company Intel
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div
            className={cn(
              'px-5 py-4 flex items-center gap-4 border-l-2',
              step2Complete && 'opacity-60',
              activeStep === 2
                ? "border-l-orange-500 bg-orange-50/40 dark:bg-orange-950/10"
                : "border-l-transparent"
            )}
          >
            <div className="shrink-0">
              <StepBadge stepNumber={2} complete={step2Complete} active={activeStep === 2} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Connect an account</p>
              <p className="text-xs text-muted-foreground">
                Link Google Ads, Meta, or LinkedIn so your first run has campaign context.
              </p>
            </div>
            {!step2Complete && (
              <Button
                variant="outline"
                size="sm"
                disabled={!step1Complete}
                onClick={() => {
                  if (step1Complete && hasIntegration && activeWorkspace?.id) {
                    localStorage.setItem(getIntegrationStepKey(activeWorkspace.id), '1');
                    setIntegrationStepCompleted(true);
                  } else {
                    onNavigate('integrations');
                  }
                }}
              >
                {hasIntegration && step1Complete ? 'Mark done' : '+ Connect'}
              </Button>
            )}
          </div>

          {/* Step 3 */}
          <div
            className={cn(
              "px-5 py-4 flex items-center gap-4 border-l-2",
              activeStep === 3
                ? "border-l-orange-500 bg-orange-50/40 dark:bg-orange-950/10"
                : "border-l-transparent"
            )}
          >
            <div className="shrink-0">
              <StepBadge stepNumber={3} complete={step3Complete} active={activeStep === 3} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Run your first AI analysis</p>
              <p className="text-xs text-muted-foreground">
                Start Company Intelligence after your website and connectors are ready.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (step3Complete) {
                  onNavigate('company-intelligence');
                  return;
                }
                void handleRunFirstAgent();
              }}
              disabled={runningFirstAgent || !step1Complete || !step2Complete}
            >
              {step3Complete ? '→ Open' : runningFirstAgent ? 'Running…' : '→ Run'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
