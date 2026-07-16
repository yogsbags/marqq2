import { useState } from 'react';
import { Link2, Pencil, Loader2 } from 'lucide-react';
import type { BrandDna } from './types';

interface BrandDnaStepProps {
  brandDna: BrandDna | null;
  loading: boolean;
  error: string | null;
  onChange: (next: BrandDna) => void;
  onConfirm: () => void;
  onBack: () => void;
  onSkip: () => void;
  onRetry: () => void;
}

function displayHost(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

export function BrandDnaStep({
  brandDna,
  loading,
  error,
  onChange,
  onConfirm,
  onBack,
  onSkip,
  onRetry,
}: BrandDnaStepProps) {
  const [editingColors, setEditingColors] = useState(false);

  if (loading || !brandDna) {
    return (
      <div className="w-full max-w-[560px] animate-in fade-in duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6521]/15 text-[#FF6521]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <h1 className="font-syne text-[32px] font-bold tracking-tight text-white md:text-[36px]">
            Fetching your Brand DNA
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Reading your website for logo, colors, fonts, and voice…
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] ${i === 1 ? 'col-span-2' : ''}`}
            />
          ))}
        </div>
      </div>
    );
  }

  const update = (patch: Partial<BrandDna>) => onChange({ ...brandDna, ...patch });

  return (
    <div className="w-full max-w-[560px] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6521]/15">
          <span className="text-lg leading-none text-[#FF6521]">✦</span>
        </div>
        <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
          Review your Brand DNA
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Your brand and influencer agents will be generated from here.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}{' '}
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Identity */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4">
          <input
            value={brandDna.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            className="w-full bg-transparent font-syne text-xl font-semibold text-white outline-none placeholder:text-white/30"
            placeholder="Company name"
          />
          <a
            href={brandDna.websiteUrl.startsWith('http') ? brandDna.websiteUrl : `https://${brandDna.websiteUrl}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
          >
            <Link2 className="h-3.5 w-3.5" />
            {displayHost(brandDna.websiteUrl)}
          </a>
        </div>

        {/* Logo */}
        <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
          {brandDna.logoUrl ? (
            <img
              src={brandDna.logoUrl}
              alt={`${brandDna.companyName} logo`}
              className="max-h-16 max-w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold text-white/80"
              style={{ background: brandDna.colors[0] || '#0f3d2e' }}
            >
              {(brandDna.companyName || 'B').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Business summary */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Business summary
          </p>
          <textarea
            value={brandDna.businessSummary}
            onChange={(e) => update({ businessSummary: e.target.value })}
            rows={5}
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-white/75 outline-none placeholder:text-white/25"
            placeholder="What does this company do?"
          />
        </div>

        {/* Fonts */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Fonts
          </p>
          <div className="mb-3 font-syne text-4xl font-medium text-white/90">Aa</div>
          <input
            value={brandDna.fonts.join(', ')}
            onChange={(e) =>
              update({
                fonts: e.target.value
                  .split(',')
                  .map((f) => f.trim())
                  .filter(Boolean),
              })
            }
            className="w-full bg-transparent text-sm text-white/60 outline-none placeholder:text-white/25"
            placeholder="Inter, Fraunces, Georgia"
          />
        </div>

        {/* Colors */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Colors
            </p>
            <button
              type="button"
              onClick={() => setEditingColors((v) => !v)}
              className="rounded-md p-1 text-white/40 transition hover:bg-white/5 hover:text-white/70"
              aria-label="Edit colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-3">
            {brandDna.colors.slice(0, 3).map((color, idx) => (
              <div key={`${color}-${idx}`} className="flex flex-1 flex-col items-center gap-2">
                {editingColors ? (
                  <input
                    type="color"
                    value={color.length === 7 ? color : '#000000'}
                    onChange={(e) => {
                      const next = [...brandDna.colors];
                      next[idx] = e.target.value;
                      update({ colors: next });
                    }}
                    className="h-12 w-full cursor-pointer rounded-xl border-0 bg-transparent p-0"
                  />
                ) : (
                  <div
                    className="h-12 w-full rounded-xl border border-white/10"
                    style={{ background: color }}
                  />
                )}
                <span className="font-mono text-[10px] text-white/45">{color}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tagline */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 sm:col-span-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Brand tagline
          </p>
          <textarea
            value={brandDna.brandTagline}
            onChange={(e) => update({ brandTagline: e.target.value })}
            rows={3}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-white/80 outline-none placeholder:text-white/25"
            placeholder="One-line brand promise"
          />
        </div>

        {/* Tone */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 sm:col-span-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Tone of voice
          </p>
          <textarea
            value={brandDna.toneOfVoice}
            onChange={(e) => update({ toneOfVoice: e.target.value })}
            rows={3}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-white/70 outline-none placeholder:text-white/25"
            placeholder="How should agents write for this brand?"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/45 transition hover:text-white/80"
        >
          Back
        </button>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-white/35 transition hover:text-white/60"
          >
            Skip Onboarding
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Looks Good →
          </button>
        </div>
      </div>
    </div>
  );
}
