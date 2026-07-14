import OnboardingContainer from './OnboardingContainer';
import ProgressBar from './ProgressBar';
import { Phase } from './types';

interface ActivationStepProps {
  phase: Phase;
}

export function ActivationStep({ phase }: ActivationStepProps) {
  if (phase !== 'activate' && phase !== 'done') return null;

  return (
    <OnboardingContainer ariaLabel="Activation step">
      <div className="mx-auto flex h-full w-full max-w-[440px] flex-col justify-center space-y-6 text-center">
        <ProgressBar currentStep={phase === 'activate' ? 1 : 2} totalSteps={2} />

        {phase === 'activate' && (
          <div className="flex animate-in fade-in slide-in-from-bottom-8 flex-col items-center duration-700">
            <div
              className="mb-6 h-16 w-16 animate-spin rounded-full border-2 border-[#FF6521]/20 border-t-[#FF6521]"
              aria-label="Saving context"
              role="status"
            />
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#FF6521]">
              Saving Context
            </div>
            <h2 className="mb-2 font-syne text-[36px] font-bold tracking-[-0.01em] text-[#EDEDF3]">
              Opening your GTM wizard…
            </h2>
            <p className="max-w-[360px] font-sans text-sm leading-[1.7] text-white/70">
              Your company brief is saved. Next you’ll lock a product, service, app, or business-line
              profile in Home — agents stay idle until you choose a task.
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex animate-in zoom-in-95 fade-in flex-col items-center duration-500 fill-mode-forwards">
            <div
              className="mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-full border-2 border-[#4ADE80] bg-[#4ADE80]/10 text-[#4ADE80] shadow-[0_0_20px_rgba(74,222,128,0.2)]"
              aria-label="Onboarding complete"
              role="img"
            >
              ✓
            </div>
            <h2 className="mb-2 font-syne text-[36px] font-bold tracking-[-0.01em] text-[#EDEDF3]">
              Ready for GTM.
            </h2>
            <p className="max-w-[360px] text-center font-sans text-sm leading-[1.75] text-white/60">
              Continue on Home to complete sequential GTM sections, then run one task when you’re ready.
            </p>
          </div>
        )}
      </div>
    </OnboardingContainer>
  );
}
