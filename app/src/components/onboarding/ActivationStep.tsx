import OnboardingContainer from './OnboardingContainer';
import ProgressBar from './ProgressBar';
import { Phase } from './types';
import { Check } from 'lucide-react';

interface ActivationStepProps {
  phase: Phase;
}

export function ActivationStep({ phase }: ActivationStepProps) {
  if (phase !== 'activate' && phase !== 'done') return null;

  return (
    <OnboardingContainer ariaLabel="Activation step">
      <div className="w-full max-w-[440px] text-center mx-auto flex flex-col justify-center h-full space-y-6">
        {/* Progress indicator */}
        <ProgressBar currentStep={phase === 'activate' ? 1 : 2} totalSteps={2} />

        {phase === 'activate' && (
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Spinner ring */}
            <div className="w-16 h-16 rounded-full border-2 border-[#FF6521]/20 border-t-[#FF6521] mb-6 animate-spin" aria-label="Activating agents" role="status" />
            <div className="font-mono text-[10px] text-[#FF6521] tracking-[0.15em] uppercase mb-2">
              Activating Team
            </div>
            <h2 className="font-syne text-[36px] tracking-[-0.01em] font-bold text-[#EDEDF3] mb-2">
              Briefing your agents…
            </h2>
            <p className="text-sm text-white/70 leading-[1.7] font-sans max-w-[360px]">
              Each agent is receiving your company context and calibrating to your business goals.
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 fade-in fill-mode-forwards">
            <div className="w-[68px] h-[68px] rounded-full bg-[#4ADE80]/10 border-2 border-[#4ADE80] flex items-center justify-center mb-4 text-[#4ADE80] shadow-[0_0_20px_rgba(74,222,128,0.2)]" aria-label="Onboarding complete" role="img">
              <Check className="h-4 w-4" />
            </div>
            <h2 className="font-syne text-[36px] tracking-[-0.01em] font-bold text-[#EDEDF3] mb-2">
              Team is operational.
            </h2>
            <p className="text-sm text-white/60 leading-[1.75] max-w-[360px] text-center font-sans">
              All 6 agents are briefed and ready. Zara will send your first morning synthesis at 9:00 AM IST tomorrow.
            </p>
          </div>
        )}
      </div>
    </OnboardingContainer>
  );
}
