import { useOnboarding } from '../../hooks/useOnboarding';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ActivationStep } from './ActivationStep';
import { AgentGrid } from './AgentGrid';
import { BrandDnaStep } from './BrandDnaStep';
import { STEPS } from './constants';
import { FormStep } from './FormStep';
import { WelcomeStep } from './WelcomeStep';

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const {
    phase, setPhase, stepIdx, formData, updateField, activatedAgents,
    activatingAgent, currentStep, canAdvance, handleNext, handleBack,
    handleSkip, handleActivate, brandDna, setBrandDna, brandDnaLoading,
    brandDnaError, retryBrandDna, totalSteps,
  } = useOnboarding(onComplete);

  return (
    <div className="fixed inset-0 z-[1000] flex bg-[#09090F] font-sans overflow-hidden text-[#EDEDF3]">
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.035]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")` }}
      />

      <AgentGrid
        phase={phase}
        activatedAgents={activatedAgents}
        activatingAgent={activatingAgent}
      />

      <div className="flex-1 flex flex-col justify-start items-start px-6 py-8 md:px-12 md:py-10 lg:px-16 lg:py-12 relative z-10 w-full min-h-0 overflow-y-auto">
        <div className={`w-full flex flex-col items-start ${phase === 'review' ? 'justify-start pb-10' : 'h-full justify-center'}`}>
          {phase === 'welcome' && (
            <WelcomeStep
              onStart={() => setPhase('form')}
              steps={STEPS}
            />
          )}

          {phase === 'form' && currentStep && (
            <FormStep
              stepIdx={stepIdx}
              totalSteps={totalSteps}
              currentStep={currentStep}
              formData={formData}
              updateField={updateField}
              onNext={handleNext}
              onBack={handleBack}
              onSkip={handleSkip}
              canAdvance={canAdvance}
            />
          )}

          {phase === 'review' && (
            <BrandDnaStep
              brandDna={brandDna}
              loading={brandDnaLoading}
              error={brandDnaError}
              workspaceId={activeWorkspace?.id}
              onChange={(next) => setBrandDna(next)}
              onConfirm={handleActivate}
              onBack={handleBack}
              onSkip={handleActivate}
              onRetry={retryBrandDna}
            />
          )}

          {(phase === 'activate' || phase === 'done') && (
            <ActivationStep phase={phase} />
          )}
        </div>
      </div>
    </div>
  );
}
