import React from 'react';

interface ProgressBarProps {
  /** Current step number (1-indexed) */
  currentStep: number;
  /** Total number of steps in the flow */
  totalSteps: number;
}

/**
 * A simple, accessible progress bar used in the onboarding flow.
 * It displays a horizontal bar with a filled portion representing the
 * current progress and a numeric label for screen‑reader users.
 */
const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep, totalSteps }) => {
  const percentage = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100));

  return (
    <div
      className="w-full max-w-[440px] mx-auto"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={currentStep}
      aria-label={`Onboarding step ${currentStep} of ${totalSteps}`}
    >
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#FF6521] to-[#FF8C00] transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-1 text-center text-sm text-[#EDEDF3]">
        Step {currentStep} of {totalSteps}
      </div>
    </div>
  );
};

export default ProgressBar;
