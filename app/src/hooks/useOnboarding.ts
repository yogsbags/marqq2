import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCallback, useState } from 'react';
import { fetchJson } from '../components/modules/company-intelligence/api';
import { AGENTS, STEPS } from '../components/onboarding/constants';
import { FormData, Phase } from '../components/onboarding/types';
import { supabase } from '@/lib/supabase';

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

export function useOnboarding(onComplete: () => void) {
  const { user } = useAuth();
  const { activeWorkspace, updateWebsiteUrl, renameWorkspace } = useWorkspace();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [stepIdx, setStepIdx] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    company: '', websiteUrl: '', industry: '', icp: '', competitors: '', monthlyMarketingBudget: '', primaryGoal: '', goals: '', kpis: '', channels: '',
  });

  const [activatedAgents, setActivatedAgents] = useState<Set<string>>(new Set());
  const [activatingAgent, setActivatingAgent] = useState<string | null>(null);

  const currentStep = STEPS[stepIdx];
  const canAdvance = currentStep?.fields.every(f => f.optional || !!formData[f.key]?.trim()) !== false;

  const updateField = useCallback((key: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const startCompanyIntelInBackground = useCallback(async (rawWebsiteUrl: string) => {
    const normalizedUrl = normalizeWebsiteUrl(rawWebsiteUrl);
    const derivedName = deriveCompanyName(formData.company || activeWorkspace?.name, rawWebsiteUrl);
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

    if (!companyId) return;

    queueCompanyIntelAutorun(derivedName, rawWebsiteUrl, companyId);
    await fetchJson(`/api/company-intel/companies/${companyId}/generate-all`, {
      method: 'POST',
      body: JSON.stringify({
        inputs: {
          goal: 'Build company context from onboarding',
          geo: 'India',
          timeframe: '90 days',
          channels: ['instagram', 'linkedin', 'youtube', 'whatsapp'],
          notes: 'Keep it compliance-safe (no guaranteed returns).'
        }
      })
    });
  }, [activeWorkspace?.name, formData.company]);

  const handleActivate = async () => {
    setPhase('activate');

    // Persist context to Supabase (workspace-scoped) + filesystem fallback
    fetch('/api/agents/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id,
        workspaceId: activeWorkspace?.id,
        ...formData,
      }),
    }).catch(() => {/* non-blocking */ });

    // Cascade agent activation
    for (const agent of AGENTS) {
      setActivatingAgent(agent.id);
      await new Promise(r => setTimeout(r, 480));
      setActivatedAgents(prev => new Set([...prev, agent.id]));
    }
    setActivatingAgent(null);

    const websiteUrl = formData.websiteUrl.trim();
    if (websiteUrl && activeWorkspace?.id) {
      try {
        await updateWebsiteUrl(websiteUrl);
        // Rename workspace to company name entered during onboarding
        const companyName = formData.company?.trim();
        if (companyName && companyName !== activeWorkspace.name) {
          await renameWorkspace(companyName).catch(() => {/* non-blocking */});
        }
      } catch {
        // non-blocking
      }
      startCompanyIntelInBackground(websiteUrl).catch(() => {
        // non-blocking background kickoff
      });
    }

    await new Promise(r => setTimeout(r, 900));
    setPhase('done');
    sessionStorage.removeItem('marqq_just_signed_up');
    localStorage.setItem('marqq_onboarded', '1');
    // Persist to Supabase so the flag survives new deployments and other devices
    supabase.auth.updateUser({ data: { onboarded: true } }).catch(() => {/* non-blocking */});

    await new Promise(r => setTimeout(r, 1800));
    onComplete();
  };

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(s => s + 1);
    } else {
      handleActivate();
    }
  };

  const handleBack = () => {
    if (stepIdx > 0) {
      setStepIdx(s => s - 1);
    }
  };

  const handleSkip = () => {
    handleActivate();
  };

  return {
    phase,
    setPhase,
    stepIdx,
    formData,
    updateField,
    activatedAgents,
    activatingAgent,
    currentStep,
    canAdvance,
    handleNext,
    handleBack,
    handleSkip,
    totalSteps: STEPS.length
  };
}
