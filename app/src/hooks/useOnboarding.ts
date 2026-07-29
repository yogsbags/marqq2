import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCallback, useRef, useState } from 'react';
import { AGENTS, STEPS } from '../components/onboarding/constants';
import { BrandDna, FormData, Phase } from '../components/onboarding/types';
import { markUserOnboardedLocal, clearNeedsOnboarding } from '@/lib/onboardingGate';
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
  const [brandDna, setBrandDna] = useState<BrandDna | null>(null);
  const [brandDnaLoading, setBrandDnaLoading] = useState(false);
  const [brandDnaError, setBrandDnaError] = useState<string | null>(null);
  const prepStartedForUrlRef = useRef<string | null>(null);
  const brandDnaFetchKeyRef = useRef<string | null>(null);
  const brandDnaReadyRef = useRef(false);

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

  const fetchBrandDna = useCallback(async (data: FormData, force = false) => {
    const websiteUrl = data.websiteUrl.trim();
    if (!websiteUrl) {
      setBrandDnaError('Add a website URL first so we can fetch Brand DNA.');
      return;
    }

    const key = `${normalizeWebsiteUrl(websiteUrl)}|${data.company.trim()}|${data.industry.trim()}|${data.icp.trim()}`;
    if (!force && brandDnaFetchKeyRef.current === key && brandDnaReadyRef.current) return;

    brandDnaFetchKeyRef.current = key;
    setBrandDnaLoading(true);
    setBrandDnaError(null);

    try {
      const res = await fetch('/api/brand-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: data.company.trim(),
          websiteUrl,
          industry: data.industry.trim(),
          icp: data.icp.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Brand DNA fetch failed (${res.status})`);
      }
      const dna = json.brandDna as BrandDna;
      if (!dna?.companyName) throw new Error('Brand DNA response was empty');
      setBrandDna((prev) => ({
        ...dna,
        knowledgeBaseFiles: prev?.knowledgeBaseFiles || dna.knowledgeBaseFiles || [],
        voiceNotes: prev?.voiceNotes || dna.voiceNotes || [],
      }));
      brandDnaReadyRef.current = true;
      if (json.partial) {
        setBrandDnaError('Fetched partial Brand DNA from your site. Review and edit before continuing.');
      }
    } catch (err) {
      brandDnaFetchKeyRef.current = null;
      brandDnaReadyRef.current = true;
      setBrandDna((prev) => ({
        companyName: data.company.trim() || 'Your Company',
        websiteUrl: normalizeWebsiteUrl(websiteUrl),
        logoUrl: null,
        businessSummary: '',
        fonts: ['Inter', 'Georgia'],
        colors: ['#0f3d2e', '#f0e9d8', '#faf7f0'],
        brandTagline: '',
        toneOfVoice: '',
        knowledgeBaseFiles: prev?.knowledgeBaseFiles || [],
        voiceNotes: prev?.voiceNotes || [],
      }));
      setBrandDnaError(err instanceof Error ? err.message : 'Could not fetch Brand DNA. You can edit manually.');
    } finally {
      setBrandDnaLoading(false);
    }
  }, []);

  const enterBrandDnaReview = useCallback((data: FormData) => {
    setPhase('review');
    void fetchBrandDna(data);
  }, [fetchBrandDna]);

  const handleActivate = async () => {
    setPhase('activate');
    setActivatingAgent(null);
    setActivatedAgents(new Set());

    // Persist context + workspace — never await network here (a hung PATCH left
    // users stuck on the activate screen before onComplete could fire).
    fetch('/api/agents/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id,
        workspaceId: activeWorkspace?.id,
        ...formData,
        company: brandDna?.companyName || formData.company,
        websiteUrl: brandDna?.websiteUrl || formData.websiteUrl,
        brandDna: brandDna || undefined,
      }),
    }).catch(() => {/* non-blocking */ });

    const websiteUrl = (brandDna?.websiteUrl || formData.websiteUrl).trim();
    const companyName = (brandDna?.companyName || formData.company)?.trim();

    if (companyName && activeWorkspace?.id && companyName !== activeWorkspace.name) {
      renameWorkspace(companyName).catch(() => {/* non-blocking */});
    }
    if (websiteUrl && activeWorkspace?.id) {
      updateWebsiteUrl(websiteUrl).catch(() => {/* non-blocking */});
    }

    // Ensure prep is running; if already started at step 01, backend merges
    // richer industry/ICP into the in-flight Compound crawl (no second crawl).
    void startBackgroundWebResearch({
      ...formData,
      company: companyName || formData.company,
      websiteUrl: websiteUrl || formData.websiteUrl,
    }, { mergeOnly: true });

    if (activeWorkspace?.id) {
      try {
        localStorage.setItem(`marqq_onboarding_ctx_${activeWorkspace.id}`, JSON.stringify({
          company: companyName || formData.company?.trim() || '',
          websiteUrl: websiteUrl || formData.websiteUrl?.trim() || '',
          industry: formData.industry?.trim() || '',
          icp: formData.icp?.trim() || '',
          goals: formData.goals?.trim() || '',
          connectedIntegrations: formData.connectedIntegrations?.trim() || '',
        }));
        if (brandDna) {
          localStorage.setItem(`marqq_brand_dna_${activeWorkspace.id}`, JSON.stringify(brandDna));
        }
      } catch {
        /* ignore */
      }
    }

    try {
      sessionStorage.setItem('marqq_gtm_wizard_pending', '1');
      sessionStorage.setItem('marqq_post_onboard_home_tour', '1');
    } catch {
      /* ignore */
    }

    // Visual handoff — paced so each agent lights up clearly.
    // Still no network awaits (activation stays snappy even if workspace PATCH lags).
    for (const agent of AGENTS) {
      setActivatingAgent(agent.id);
      await new Promise(r => setTimeout(r, 340));
      setActivatedAgents(prev => new Set([...prev, agent.id]));
    }
    setActivatingAgent(null);

    setPhase('done');
    if (user?.id) {
      clearNeedsOnboarding(user.id);
      markUserOnboardedLocal(user.id);
    }
    void supabase.auth.updateUser({ data: { onboarded: true } }).catch(() => {/* non-blocking */});

    await new Promise(r => setTimeout(r, 1800));
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
      enterBrandDnaReview(formData);
    }
  };

  const handleBack = () => {
    if (phase === 'brandVoiceReview') {
      setPhase('review');
      return;
    }
    if (phase === 'review') {
      setPhase('form');
      return;
    }
    if (stepIdx > 0) {
      setStepIdx(s => s - 1);
    }
  };

  const handleSkip = () => {
    // From form (e.g. skip integrations) still review Brand DNA before activating agents.
    if (phase === 'form') {
      enterBrandDnaReview(formData);
      return;
    }
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
    handleActivate,
    brandDna,
    setBrandDna,
    brandDnaLoading,
    brandDnaError,
    retryBrandDna: () => void fetchBrandDna(formData, true),
    totalSteps: STEPS.length,
  };
}
