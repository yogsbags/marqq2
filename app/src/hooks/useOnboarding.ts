import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCallback, useRef, useState } from 'react';
import { STEPS } from '../components/onboarding/constants';
import { FormData, Phase } from '../components/onboarding/types';
import { markUserOnboardedLocal } from '@/lib/onboardingGate';
import { startGtmPrep } from '@/services/gtmModuleService';
import { supabase } from '@/lib/supabase';

function normalizeWebsiteUrl(url: string) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

export function useOnboarding(onComplete: () => void) {
  const { user } = useAuth();
  const { activeWorkspace, updateWebsiteUrl, renameWorkspace } = useWorkspace();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [stepIdx, setStepIdx] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    company: '', websiteUrl: '', industry: '', icp: '', competitors: '', connectedIntegrations: '', monthlyMarketingBudget: '', primaryGoal: '', goals: '', kpis: '', channels: '',
  });

  const [activatedAgents, setActivatedAgents] = useState<Set<string>>(new Set());
  const [activatingAgent, setActivatingAgent] = useState<string | null>(null);
  const prepStartedForUrlRef = useRef<string | null>(null);

  const currentStep = STEPS[stepIdx];
  const canAdvance = currentStep?.fields.every(f => f.optional || !!formData[f.key]?.trim()) !== false;

  const updateField = useCallback((key: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  /**
   * Kick Compound web research as soon as company + URL are confirmed (leave step 01).
   * Silent / no agent theatre — GTM wizard later polls prep status.
   * Pass `mergeOnly` on activate so industry/ICP update the in-flight prep (server dedupes crawl).
   */
  const startBackgroundWebResearch = useCallback(async (data: FormData, opts?: { mergeOnly?: boolean }) => {
    const websiteUrl = data.websiteUrl.trim();
    const companyName = data.company?.trim();
    if (!websiteUrl || !user?.id || !activeWorkspace?.id) return;

    const normalized = normalizeWebsiteUrl(websiteUrl);
    if (!opts?.mergeOnly && prepStartedForUrlRef.current === normalized) return;
    if (!opts?.mergeOnly) prepStartedForUrlRef.current = normalized;

    try {
      sessionStorage.setItem('marqq_gtm_prep_started', '1');
      sessionStorage.setItem('marqq_gtm_prep_url', normalized);
    } catch {
      /* ignore */
    }

    // Persist URL early so workspace + prep share the same target
    if (!opts?.mergeOnly) {
      updateWebsiteUrl(websiteUrl).catch(() => {/* non-blocking */});
      if (companyName && companyName !== activeWorkspace.name) {
        renameWorkspace(companyName).catch(() => {/* non-blocking */});
      }
    }

    startGtmPrep({
      workspaceId: activeWorkspace.id,
      userId: user.id,
      websiteUrl,
      companyName: companyName || activeWorkspace.name || 'Company',
      onboarding: {
        company: companyName || '',
        websiteUrl,
        industry: data.industry?.trim() || '',
        icp: data.icp?.trim() || '',
        competitors: data.competitors?.trim() || '',
        connectedIntegrations: data.connectedIntegrations?.trim() || '',
      },
    }).catch(() => {
      if (!opts?.mergeOnly) prepStartedForUrlRef.current = null;
    });
  }, [user?.id, activeWorkspace?.id, activeWorkspace?.name, updateWebsiteUrl, renameWorkspace]);

  const handleActivate = async () => {
    setPhase('activate');

    // Persist onboarding context only — no Veena cascade / generate-all.
    // Quiet site prep + GTM wizard run from Home chat.
    fetch('/api/agents/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id,
        workspaceId: activeWorkspace?.id,
        ...formData,
      }),
    }).catch(() => {/* non-blocking */ });

    setActivatingAgent(null);
    setActivatedAgents(new Set());

    const websiteUrl = formData.websiteUrl.trim();
    const companyName = formData.company?.trim();

    if (companyName && activeWorkspace?.id && companyName !== activeWorkspace.name) {
      renameWorkspace(companyName).catch(() => {/* non-blocking */});
    }

    if (websiteUrl && activeWorkspace?.id) {
      try {
        await updateWebsiteUrl(websiteUrl);
      } catch {
        // non-blocking
      }
    }

    // Ensure prep is running; if already started at step 01, backend merges
    // richer industry/ICP into the in-flight Compound crawl (no second crawl).
    void startBackgroundWebResearch(formData, { mergeOnly: true });

    if (activeWorkspace?.id) {
      localStorage.setItem(`marqq_onboarding_ctx_${activeWorkspace.id}`, JSON.stringify({
        company: formData.company?.trim() || '',
        websiteUrl: formData.websiteUrl?.trim() || '',
        industry: formData.industry?.trim() || '',
        icp: formData.icp?.trim() || '',
        goals: formData.goals?.trim() || '',
        connectedIntegrations: formData.connectedIntegrations?.trim() || '',
      }));
    }

    sessionStorage.setItem('marqq_gtm_wizard_pending', '1');
    sessionStorage.setItem('marqq_post_onboard_home_tour', '1');

    setPhase('done');
    sessionStorage.removeItem('marqq_just_signed_up');
    if (user?.id) markUserOnboardedLocal(user.id);
    await supabase.auth.updateUser({ data: { onboarded: true } }).catch(() => {/* non-blocking */});

    await new Promise(r => setTimeout(r, 600));
    onComplete();
  };

  const handleNext = () => {
    // After company + URL step: start Compound crawl in the background immediately
    if (stepIdx === 0) {
      void startBackgroundWebResearch(formData);
    }
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
