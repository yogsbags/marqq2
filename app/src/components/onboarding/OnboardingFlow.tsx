import { useEffect } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import { ActivationStep } from './ActivationStep';
import { AgentGrid } from './AgentGrid';
import { STEPS } from './constants';
import { FormStep } from './FormStep';
import { WelcomeStep } from './WelcomeStep';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');`;

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const {
    phase, setPhase, stepIdx, formData, updateField, activatedAgents,
    activatingAgent, currentStep, canAdvance, handleNext, handleBack,
    handleSkip, totalSteps
  } = useOnboarding(onComplete);

  useEffect(() => {
    if (document.getElementById('ob-fonts')) return;
    const el = document.createElement('style');
    el.id = 'ob-fonts';
    el.textContent = FONT_IMPORT;
    document.head.appendChild(el);
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex bg-[#09090F] font-sans overflow-hidden text-[#EDEDF3]">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.035]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")` }}
      />

      <AgentGrid
        phase={phase}
        activatedAgents={activatedAgents}
        activatingAgent={activatingAgent}
      />

      <div className="flex-1 flex flex-col justify-center items-start px-16 py-12 relative z-10 w-full overflow-y-auto">
        <div className="w-full h-full flex flex-col items-start justify-center">
          {phase === 'welcome' && (
            <WelcomeStep
              onStart={() => setPhase('form')}
              onSkip={handleSkip}
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
              canAdvance={canAdvance}
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
