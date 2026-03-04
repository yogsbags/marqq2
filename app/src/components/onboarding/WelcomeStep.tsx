import OnboardingContainer from './OnboardingContainer';
import { BRAND } from '@/lib/brand';
import { OnboardingStep } from './types';

interface WelcomeStepProps {
  onStart: () => void;
  onSkip: () => void;
  steps: OnboardingStep[];
}

export function WelcomeStep({ onStart, onSkip, steps }: WelcomeStepProps) {
  return (
    <OnboardingContainer ariaLabel="Welcome step">
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full max-w-[500px]">
        <div className="font-mono text-[10px] text-[#FF6521] tracking-[0.18em] uppercase mb-7">
          Welcome to {BRAND.name}
        </div>

        <h1 className="font-syne text-[56px] font-extrabold leading-[1.04] text-[#EDEDF3] m-0 mb-[22px] tracking-[-0.01em]">
          Your AI team<br />is waiting to<br />
          <span className="text-[#FF6521]">meet you.</span>
        </h1>

        <p className="text-[15px] text-white/40 leading-[1.75] mb-11 max-w-[400px]">
          Before Zara, Maya, Riya, Arjun, Dev, and Priya start working,
          they need a quick brief. Answer 4 questions and they'll be
          operational tonight.
        </p>

        <div className="flex flex-col gap-3 items-start">
          <button
            className="bg-[#FF6521] hover:bg-[#FF7A3A] text-[#0A0808] border-none rounded-xl px-7 py-3 text-[13px] font-bold font-syne tracking-[0.08em] uppercase transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg shadow-[#FF6521]/20 cursor-pointer"
            onClick={onStart}
          >
            Brief the team →
          </button>
          <button
            onClick={onSkip}
            className="bg-transparent border-none cursor-pointer text-white/20 text-[13px] py-1 transition-colors hover:text-white/50 font-sans"
          >
            Skip for now
          </button>
        </div>

        {/* Decorative step preview */}
        <div className="flex gap-6 mt-14 border-t border-white/5 pt-7">
          {steps.map((s) => (
            <div key={s.num} className="opacity-40 hover:opacity-100 transition-opacity cursor-default">
              <div className="font-mono text-[9px] text-[#FF6521] tracking-[0.12em] mb-1.5">
                {s.num}
              </div>
              <div className="text-xs text-white/50">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </OnboardingContainer>
  );
}
