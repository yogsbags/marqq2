import React from 'react';

interface OnboardingContainerProps {
  children: React.ReactNode;
  /** Optional ARIA label for the container */
  ariaLabel?: string;
}

/**
 * A reusable container that provides a premium glass‑morphism background
 * and centers its children. Used across all onboarding steps to ensure a
 * consistent look and feel.
 */
const OnboardingContainer: React.FC<OnboardingContainerProps> = ({ children, ariaLabel }) => {
  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-screen p-6 bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a]"
      aria-label={ariaLabel}
    >
      {/* Glass effect background */}
      <div className="absolute inset-0 pointer-events-none bg-[url('/images/noise.png')] opacity-10" />
      <div className="relative w-full max-w-[540px] bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
        {children}
      </div>
    </section>
  );
};

export default OnboardingContainer;
