import { useState } from 'react';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import type { GtmAutoSectionDraft, GtmStrategySubsection } from '@/lib/gtmAutoSections';

type Props = {
  title: string;
  blurb?: string;
  stepLabel?: string;
  draft: GtmAutoSectionDraft | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onChange: (next: GtmAutoSectionDraft) => void;
  onBack: () => void;
  onSkip?: () => void;
  onLooksGood: () => void;
  looksGoodLabel?: string;
  /** When true, render as fixed fullscreen overlay (wizard). */
  overlay?: boolean;
};

export function GtmStrategySectionReview({
  title,
  blurb,
  stepLabel,
  draft,
  loading,
  error,
  onRetry,
  onChange,
  onBack,
  onSkip,
  onLooksGood,
  looksGoodLabel = 'Looks Good →',
  overlay = false,
}: Props) {
  const [editingBullets, setEditingBullets] = useState(false);
  const [newBullet, setNewBullet] = useState('');

  function patch(partial: Partial<GtmAutoSectionDraft>) {
    if (!draft) return;
    onChange({ ...draft, ...partial });
  }

  function patchSubsection(idx: number, partial: Partial<GtmStrategySubsection>) {
    if (!draft) return;
    const next = [...(draft.subsections || [])];
    next[idx] = { ...next[idx], ...partial };
    patch({ subsections: next });
  }

  const shell = (
    <div className="w-full max-w-[560px] animate-in fade-in slide-in-from-bottom-4 duration-500">
      {loading || !draft ? (
        <>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6521]/15 text-[#FF6521]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <h1 className="font-syne text-[32px] font-bold tracking-tight text-white md:text-[36px]">
              Drafting {title}
            </h1>
            <p className="mt-2 text-sm text-white/50">
              {stepLabel || 'Turning your answers into an editable strategy section…'}
            </p>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] ${
                  i === 1 ? 'col-span-2' : ''
                }`}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6521]/15">
              <span className="text-lg leading-none text-[#FF6521]">✦</span>
            </div>
            {stepLabel ? (
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                {stepLabel}
              </p>
            ) : null}
            <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
              Review {title}
            </h1>
            {blurb ? <p className="mt-2 text-sm text-white/45">{blurb}</p> : null}
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {error}{' '}
              {onRetry ? (
                <button type="button" onClick={onRetry} className="underline underline-offset-2">
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {draft.proposedNorthStar !== undefined || draft.proposedGoalSystem ? (
            <div className="mb-3 space-y-3 rounded-2xl border border-[#FF6521]/35 bg-[#FF6521]/10 px-5 py-4">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FF6521]/90">
                  North Star Metric (edit before Looks good)
                </p>
                <textarea
                  value={draft.proposedNorthStar || draft.proposedGoalSystem?.quantified_target || ''}
                  onChange={(e) => {
                    const v = e.target.value
                    patch({
                      proposedNorthStar: v,
                      proposedGoalSystem: draft.proposedGoalSystem
                        ? { ...draft.proposedGoalSystem, quantified_target: v }
                        : draft.proposedGoalSystem,
                    })
                  }}
                  rows={2}
                  className="w-full resize-none bg-transparent text-[15px] font-medium leading-snug text-white outline-none placeholder:text-white/30"
                  placeholder="Concrete number + unit + timeline for THIS business outcome"
                />
              </div>
              {draft.proposedGoalSystem?.metric_definition ? (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                    Definition
                  </p>
                  <textarea
                    value={draft.proposedGoalSystem.metric_definition || ''}
                    onChange={(e) =>
                      patch({
                        proposedGoalSystem: {
                          ...draft.proposedGoalSystem,
                          metric_definition: e.target.value,
                        },
                      })
                    }
                    rows={2}
                    className="w-full resize-none bg-transparent text-[13px] leading-snug text-white/80 outline-none"
                  />
                </div>
              ) : null}
              {draft.proposedGoalSystem?.business_archetype ||
              (draft.proposedGoalSystem?.rejects_as_nsm || []).length ? (
                <p className="text-[11px] text-white/40">
                  {draft.proposedGoalSystem?.business_archetype
                    ? `Archetype: ${draft.proposedGoalSystem.business_archetype}. `
                    : ''}
                  {(draft.proposedGoalSystem?.rejects_as_nsm || []).length
                    ? `Do not optimize: ${(draft.proposedGoalSystem?.rejects_as_nsm || [])
                        .slice(0, 3)
                        .join('; ')}.`
                    : ''}
                </p>
              ) : (
                <p className="text-[11px] text-white/40">
                  AI inferred this from your business model. Looks good locks it for every later agent.
                </p>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Recommendation
              </p>
              <textarea
                value={draft.summary}
                onChange={(e) => patch({ summary: e.target.value })}
                rows={2}
                className="w-full resize-none bg-transparent font-syne text-lg font-semibold leading-snug text-white outline-none placeholder:text-white/30"
                placeholder="One-line recommendation"
              />
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  Plays
                </p>
                <button
                  type="button"
                  onClick={() => setEditingBullets((v) => !v)}
                  className={`rounded-md p-1 transition hover:bg-white/5 ${
                    editingBullets ? 'text-[#FF6521]' : 'text-white/40 hover:text-white/70'
                  }`}
                  aria-label="Edit plays"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-2.5">
                {draft.bullets.map((b, idx) =>
                  editingBullets ? (
                    <li key={`b-edit-${idx}`} className="flex items-start gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                      <input
                        value={b}
                        onChange={(e) => {
                          const next = [...draft.bullets];
                          next[idx] = e.target.value;
                          patch({ bullets: next });
                        }}
                        className="w-full bg-transparent text-[13px] leading-relaxed text-white/80 outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Remove play"
                        onClick={() =>
                          patch({ bullets: draft.bullets.filter((_, i) => i !== idx) })
                        }
                        className="mt-0.5 shrink-0 rounded p-0.5 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ) : (
                    <li
                      key={`b-${idx}`}
                      className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/75"
                    >
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                      <span>{b}</span>
                    </li>
                  ),
                )}
              </ul>
              {editingBullets ? (
                <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
                  <input
                    value={newBullet}
                    onChange={(e) => setNewBullet(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const v = newBullet.trim();
                        if (!v) return;
                        patch({ bullets: [...draft.bullets, v] });
                        setNewBullet('');
                      }
                    }}
                    placeholder="Add a play…"
                    className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder:text-white/25"
                  />
                  <button
                    type="button"
                    disabled={!newBullet.trim()}
                    onClick={() => {
                      const v = newBullet.trim();
                      if (!v) return;
                      patch({ bullets: [...draft.bullets, v] });
                      setNewBullet('');
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Detail
              </p>
              <textarea
                value={draft.body}
                onChange={(e) => patch({ body: e.target.value })}
                rows={5}
                className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-white/75 outline-none placeholder:text-white/25"
                placeholder="Actionable guidance for this section"
              />
            </div>

            {(draft.subsections || []).map((sub, idx) => (
              <div
                key={`sub-${idx}`}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5"
              >
                <input
                  value={sub.title}
                  onChange={(e) => patchSubsection(idx, { title: e.target.value })}
                  className="mb-2 w-full bg-transparent text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 outline-none"
                  placeholder="Subsection title"
                />
                <textarea
                  value={sub.body}
                  onChange={(e) => patchSubsection(idx, { body: e.target.value })}
                  rows={3}
                  className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-white/75 outline-none"
                />
              </div>
            ))}
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
              {onSkip ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-sm text-white/35 transition hover:text-white/60"
                >
                  Skip
                </button>
              ) : null}
              <button
                type="button"
                onClick={onLooksGood}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                {looksGoodLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (!overlay) return shell;

  return (
    <div className="fixed inset-0 z-[1100] flex overflow-y-auto bg-[#09090F] px-6 py-10 text-[#EDEDF3]">
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-col pb-10">{shell}</div>
    </div>
  );
}
