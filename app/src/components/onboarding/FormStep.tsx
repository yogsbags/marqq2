import OnboardingContainer from './OnboardingContainer';
import ProgressBar from './ProgressBar';
import { FormData, OnboardingStep } from './types';

interface FormStepProps {
  stepIdx: number;
  totalSteps: number;
  currentStep: OnboardingStep;
  formData: FormData;
  updateField: (key: keyof FormData, value: string) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
}

export function FormStep({
  stepIdx, totalSteps, currentStep, formData, updateField, onNext, onBack, canAdvance
}: FormStepProps) {
  return (
    <OnboardingContainer ariaLabel="Form step">
      <ProgressBar currentStep={stepIdx + 1} totalSteps={totalSteps} />

      {/* Step label */}
      <div className="font-mono text-[10px] text-[#FF6521] tracking-[0.15em] uppercase mb-3.5">
        {currentStep.num} — {currentStep.label}
      </div>

      {/* Question */}
      <h2 className="font-syne text-[40px] font-bold leading-[1.12] text-[#EDEDF3] m-0 mb-3.5 tracking-[-0.01em] whitespace-pre-line">
        {currentStep.question}
      </h2>

      <p className="text-[14px] text-white/40 leading-[1.65] mb-9 font-sans">
        {currentStep.sub}
      </p>

      {/* Fields */}
      <div className="flex flex-col gap-5 mb-10 w-full">
        {currentStep.fields.map((field) => (
          <div key={field.key} className="w-full relative group">
            <label className="font-mono text-[10px] text-white/40 tracking-[0.12em] block uppercase mb-2">
              {field.label}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                className="w-full box-border bg-white/5 border border-white/10 rounded-xl text-[#EDEDF3] text-sm px-4 py-3.5 outline-none transition-all duration-300 resize-y min-h-[96px] leading-[1.6] focus:border-[#FF6521] focus:bg-white/10 hover:bg-white/10 backdrop-blur-md font-sans shadow-sm"
                placeholder={field.placeholder}
                value={formData[field.key] || ''}
                onChange={e => updateField(field.key, e.target.value)}
              />
            ) : (
              <input
                className="w-full box-border bg-white/5 border border-white/10 rounded-xl text-[#EDEDF3] text-sm px-4 py-3.5 outline-none transition-all duration-300 focus:border-[#FF6521] focus:bg-white/10 hover:bg-white/10 backdrop-blur-md font-sans shadow-sm"
                type="text"
                placeholder={field.placeholder}
                value={formData[field.key] || ''}
                onChange={e => updateField(field.key, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canAdvance) onNext(); }}
              />
            )}
          </div>
        ))}
      </div>

      {/* CTA row */}
      <div className="flex items-center gap-[18px]">
        <button
          className="bg-[#FF6521] hover:bg-[#FF7A3A] disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed disabled:transform-none !disabled:shadow-none text-[#0A0808] border-none rounded-xl px-[30px] py-[13px] text-[13px] font-bold font-syne tracking-[0.08em] uppercase transition-all duration-300 hover:-translate-y-0.5 shadow-lg shadow-[#FF6521]/20 cursor-pointer"
          onClick={onNext}
          disabled={!canAdvance}
        >
          {stepIdx === totalSteps - 1 ? 'Activate Team →' : 'Continue →'}
        </button>
        {stepIdx > 0 && (
          <button
            onClick={onBack}
            className="bg-transparent border-none cursor-pointer text-white/30 text-[13px] hover:text-white/50 transition-colors font-sans"
          >
            ← Back
          </button>
        )}
      </div>
    </OnboardingContainer>
  );
}
