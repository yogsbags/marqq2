import { useState } from 'react';
import OnboardingContainer from './OnboardingContainer';
import ProgressBar from './ProgressBar';
import { FormData, OnboardingStep } from './types';

interface Integration {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

const INTEGRATIONS: Integration[] = [
  { id: 'google-analytics', name: 'Google Analytics 4', icon: 'GA', description: 'Traffic & conversion data', color: '#E37400' },
  { id: 'google-ads', name: 'Google Ads', icon: 'G', description: 'Ad spend & ROAS', color: '#4285F4' },
  { id: 'meta-ads', name: 'Meta Ads', icon: 'M', description: 'Facebook & Instagram ads', color: '#1877F2' },
  { id: 'hubspot', name: 'HubSpot', icon: 'HS', description: 'CRM & pipeline data', color: '#FF7A59' },
  { id: 'linkedin-ads', name: 'LinkedIn Ads', icon: 'In', description: 'B2B campaign performance', color: '#0A66C2' },
  { id: 'mailchimp', name: 'Mailchimp', icon: 'MC', description: 'Email campaigns', color: '#FFE01B' },
];

interface FormStepProps {
  stepIdx: number;
  totalSteps: number;
  currentStep: OnboardingStep;
  formData: FormData;
  updateField: (key: keyof FormData, value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  canAdvance: boolean;
}

function IntegrationsGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const connected = new Set(value ? value.split(',').filter(Boolean) : []);
  const [connecting, setConnecting] = useState<string | null>(null);

  const toggle = async (id: string) => {
    if (connected.has(id)) {
      const next = new Set(connected);
      next.delete(id);
      onChange([...next].join(','));
      return;
    }
    // Simulate OAuth connect flow
    setConnecting(id);
    await new Promise(r => setTimeout(r, 900));
    setConnecting(null);
    const next = new Set(connected);
    next.add(id);
    onChange([...next].join(','));
  };

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      {INTEGRATIONS.map((integration) => {
        const isConnected = connected.has(integration.id);
        const isConnecting = connecting === integration.id;

        return (
          <button
            key={integration.id}
            type="button"
            onClick={() => toggle(integration.id)}
            className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-300 border"
            style={{
              background: isConnected
                ? `${integration.color}12`
                : 'rgba(255,255,255,0.03)',
              borderColor: isConnected
                ? `${integration.color}44`
                : 'rgba(255,255,255,0.08)',
            }}
          >
            {/* Icon orb */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 transition-all duration-300"
              style={{
                background: isConnected ? integration.color : 'rgba(255,255,255,0.07)',
                color: isConnected ? '#fff' : 'rgba(255,255,255,0.3)',
              }}
            >
              {isConnecting ? (
                <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin block" />
              ) : (
                integration.icon
              )}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div
                className="font-syne text-[12px] font-semibold leading-tight truncate transition-colors duration-300"
                style={{ color: isConnected ? '#EDEDF3' : 'rgba(255,255,255,0.45)' }}
              >
                {integration.name}
              </div>
              <div className="font-mono text-[9px] tracking-[0.04em] text-white/25 mt-[2px] truncate">
                {integration.description}
              </div>
            </div>

            {/* Status badge */}
            <div
              className="shrink-0 font-mono text-[9px] tracking-[0.06em] uppercase transition-all duration-300"
              style={{ color: isConnected ? '#4ADE80' : 'rgba(255,255,255,0.2)' }}
            >
              {isConnecting ? '...' : isConnected ? '● Connected' : 'Connect'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function FormStep({
  stepIdx, totalSteps, currentStep, formData, updateField, onNext, onBack, onSkip, canAdvance
}: FormStepProps) {
  const isIntegrationsStep = currentStep.fields.some(f => f.type === 'integrations');
  const connectedCount = formData.connectedIntegrations
    ? formData.connectedIntegrations.split(',').filter(Boolean).length
    : 0;

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
        {currentStep.fields.map((field) => {
          if (field.type === 'integrations') {
            return (
              <IntegrationsGrid
                key={field.key}
                value={formData[field.key] || ''}
                onChange={(val) => updateField(field.key, val)}
              />
            );
          }

          if (field.type === 'choice') {
            return (
              <div key={field.key} className="w-full">
                <label className="font-mono text-[10px] text-white/40 tracking-[0.12em] block uppercase mb-2">
                  {field.label}
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(field.options || []).map((option) => {
                    const selected = formData[field.key] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateField(field.key, option)}
                        className="w-full text-left rounded-xl border px-4 py-3 text-sm transition-all duration-200"
                        style={{
                          background: selected ? 'rgba(255,101,33,0.12)' : 'rgba(255,255,255,0.03)',
                          borderColor: selected ? '#FF6521' : 'rgba(255,255,255,0.08)',
                          color: selected ? '#FF6521' : '#EDEDF3',
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <div key={field.key} className="w-full relative group">
              <label className="font-mono text-[10px] text-white/40 tracking-[0.12em] block uppercase mb-2">
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  className="w-full box-border bg-white/5 border border-white/10 rounded-xl text-[#EDEDF3] text-sm px-4 py-3.5 outline-none transition-all duration-300 resize-y min-h-[80px] leading-[1.6] focus:border-[#FF6521] focus:bg-white/10 hover:bg-white/10 backdrop-blur-md font-sans shadow-sm"
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
          );
        })}
      </div>

      {/* CTA row */}
      <div className="flex items-center gap-[18px]">
        <button
          className="bg-[#FF6521] hover:bg-[#FF7A3A] disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed disabled:transform-none text-[#0A0808] border-none rounded-xl px-[30px] py-[13px] text-[13px] font-bold font-syne tracking-[0.08em] uppercase transition-all duration-300 hover:-translate-y-0.5 shadow-lg shadow-[#FF6521]/20 cursor-pointer"
          onClick={onNext}
          disabled={!canAdvance}
        >
          {isIntegrationsStep
            ? connectedCount > 0
              ? `Activate Team (${connectedCount} connected) →`
              : 'Skip for now →'
            : stepIdx === totalSteps - 1
              ? 'Activate Team →'
              : 'Continue →'}
        </button>
        {stepIdx > 0 && (
          <button
            onClick={onBack}
            className="bg-transparent border-none cursor-pointer text-white/30 text-[13px] hover:text-white/50 transition-colors font-sans"
          >
            ← Back
          </button>
        )}
        {stepIdx > 0 && stepIdx < totalSteps - 1 && (
          <button
            onClick={onSkip}
            className="bg-transparent border-none cursor-pointer text-white/30 text-[13px] hover:text-white/50 transition-colors font-sans"
          >
            Skip tour
          </button>
        )}
      </div>
    </OnboardingContainer>
  );
}
