import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';

export type PlanName = 'growth' | 'scale' | 'agency';

export interface PlanState {
  plan: PlanName;
  creditsRemaining: number;  // -1 = unlimited
  creditsTotal: number;
  creditsResetAt: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

// Mirrors plans.js — modules accessible per plan (additive)
const GROWTH_MODULES = new Set([
  'company-intelligence', 'lead-intelligence', 'market-signals', 'industry-intelligence',
  'audience-profiles', 'positioning', 'action-plan', 'offer-design', 'messaging',
  'channel-health', 'landing-pages', 'social-calendar', 'ai-content', 'seo-llmo',
  'budget-optimization', 'performance-scorecard', 'crm', 'ad-creative', 'email-sequence',
  'lead-outreach', 'cro', 'cro-audit', 'ab-test', 'marketing-audit', 'launch-strategy',
  'revenue-ops', 'lead-magnets', 'sales-enablement', 'paid-ads', 'referral-program',
  'churn-prevention', 'unified-customer-view', 'user-engagement', 'setup',
]);

const SCALE_ONLY_MODULES = new Set([
  'social-media', 'ai-video-bot', 'ai-voice-bot',
]);

export function canAccessModule(plan: PlanName, moduleId: string): boolean {
  if (plan === 'agency') return true;
  if (SCALE_ONLY_MODULES.has(moduleId)) return plan === 'scale';
  return GROWTH_MODULES.has(moduleId);
}

export function requiredPlanForModule(moduleId: string): PlanName {
  if (SCALE_ONLY_MODULES.has(moduleId)) return 'scale';
  return 'growth';
}

export function usePlan(): PlanState {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanName>('growth');
  const [creditsRemaining, setCreditsRemaining] = useState(500);
  const [creditsTotal, setCreditsTotal] = useState(500);
  const [creditsResetAt, setCreditsResetAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPlan = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setIsLoading(true);
    try {
      const url = user?.id
        ? `/api/workspaces/${activeWorkspace.id}/plan?userId=${encodeURIComponent(user.id)}`
        : `/api/workspaces/${activeWorkspace.id}/plan`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setPlan((data.plan as PlanName) || 'growth');
      setCreditsRemaining(data.credits_remaining ?? 500);
      setCreditsTotal(data.credits_total ?? 500);
      setCreditsResetAt(data.credits_reset_at ?? null);
    } catch {
      // keep defaults
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace?.id, user?.id]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  return {
    plan,
    creditsRemaining,
    creditsTotal,
    creditsResetAt,
    isLoading,
    refresh: fetchPlan,
  };
}
