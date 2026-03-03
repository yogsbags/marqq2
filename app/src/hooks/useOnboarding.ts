import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useState } from 'react';
import { AGENTS, STEPS } from '../components/onboarding/constants';
import { FormData, Phase } from '../components/onboarding/types';

export function useOnboarding(onComplete: () => void) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [stepIdx, setStepIdx] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    company: '', industry: '', icp: '', competitors: '', campaigns: '', keywords: '', goals: '',
  });

  const [activatedAgents, setActivatedAgents] = useState<Set<string>>(new Set());
  const [activatingAgent, setActivatingAgent] = useState<string | null>(null);

  const currentStep = STEPS[stepIdx];
  const canAdvance = currentStep?.fields.every(f => formData[f.key]?.trim()) !== false;

  const updateField = useCallback((key: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleActivate = async () => {
    setPhase('activate');

    // Persist context (non-blocking)
    fetch('/api/agents/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id, ...formData }),
    }).catch(() => {/* non-blocking */ });

    // Cascade agent activation
    for (const agent of AGENTS) {
      setActivatingAgent(agent.id);
      await new Promise(r => setTimeout(r, 480));
      setActivatedAgents(prev => new Set([...prev, agent.id]));
    }
    setActivatingAgent(null);

    await new Promise(r => setTimeout(r, 900));
    setPhase('done');
    localStorage.setItem('torqq_onboarded', '1');

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
    localStorage.setItem('torqq_onboarded', '1');
    onComplete();
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
