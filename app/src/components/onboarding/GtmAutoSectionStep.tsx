import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import type { BrandDna, FormData } from './types';
import {
  GTM_AUTO_STRATEGY_SECTIONS,
  type GtmAutoSectionDraft,
} from '@/lib/gtmAutoSections';

async function generateSection(input: {
  sectionId: string;
  brandDna: BrandDna | null;
  formData: FormData;
  priorSections: GtmAutoSectionDraft[];
}): Promise<GtmAutoSectionDraft> {
  const res = await fetch('/api/gtm/auto-sections/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId: input.sectionId,
      companyName: input.brandDna?.companyName || input.formData.company,
      websiteUrl: input.brandDna?.websiteUrl || input.formData.websiteUrl,
      industry: input.formData.industry,
      icp: input.formData.icp,
      brandDna: input.brandDna,
      onboarding: {
        company: input.formData.company,
        websiteUrl: input.formData.websiteUrl,
        industry: input.formData.industry,
        icp: input.formData.icp,
        competitors: input.formData.competitors,
        primaryGoal: input.formData.primaryGoal,
        goals: input.formData.goals,
      },
      priorSections: input.priorSections,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Failed to generate section (${res.status})`);
  const s = json.section || {};
  return {
    id: String(s.id || input.sectionId),
    title: String(s.title || input.sectionId),
    channel: String(s.channel || ''),
    summary: String(s.summary || '').trim(),
    bullets: Array.isArray(s.bullets)
      ? s.bullets.map((b: unknown) => String(b || '').trim()).filter(Boolean)
      : [],
    body: String(s.body || '').trim(),
  };
}

export function GtmAutoSectionStep({
  brandDna,
  formData,
  approvedSections,
  onApprovedChange,
  onConfirmAll,
  onBack,
  onSkip,
}: {
  brandDna: BrandDna | null;
  formData: FormData;
  approvedSections: GtmAutoSectionDraft[];
  onApprovedChange: (sections: GtmAutoSectionDraft[]) => void;
  onConfirmAll: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const startIndex = Math.min(approvedSections.length, GTM_AUTO_STRATEGY_SECTIONS.length - 1);
  const [index, setIndex] = useState(startIndex);
  const [draft, setDraft] = useState<GtmAutoSectionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBullets, setEditingBullets] = useState(false);
  const [newBullet, setNewBullet] = useState('');
  const genKeyRef = useRef<string | null>(null);

  const meta = GTM_AUTO_STRATEGY_SECTIONS[index];
  const total = GTM_AUTO_STRATEGY_SECTIONS.length;
  const isLast = index >= total - 1;

  useEffect(() => {
    if (!meta) return;
    const existing = approvedSections.find((s) => s.id === meta.id);
    const key = `${meta.id}|${approvedSections.length}`;
    if (genKeyRef.current === key && draft?.id === meta.id) return;

    if (existing && existing.summary) {
      genKeyRef.current = key;
      setDraft(existing);
      setLoading(false);
      setError(null);
      setEditingBullets(false);
      return;
    }

    let cancelled = false;
    genKeyRef.current = key;
    setLoading(true);
    setError(null);
    setEditingBullets(false);
    setDraft(null);

    void generateSection({
      sectionId: meta.id,
      brandDna,
      formData,
      priorSections: approvedSections.filter((s) => s.id !== meta.id),
    })
      .then((section) => {
        if (cancelled) return;
        setDraft(section);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Generation failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, meta?.id]);

  function patchDraft(partial: Partial<GtmAutoSectionDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function looksGood() {
    if (!draft || !meta) return;
    const approved: GtmAutoSectionDraft = {
      ...draft,
      id: meta.id,
      title: draft.title || meta.title,
      channel: draft.channel || '',
      approvedAt: new Date().toISOString(),
    };
    const without = approvedSections.filter((s) => s.id !== meta.id);
    const nextApproved = [...without, approved];
    // Keep order of GTM_AUTO_STRATEGY_SECTIONS
    const ordered = GTM_AUTO_STRATEGY_SECTIONS.map(
      (def) => nextApproved.find((s) => s.id === def.id) || null,
    ).filter(Boolean) as GtmAutoSectionDraft[];
    onApprovedChange(ordered);

    if (isLast) {
      onConfirmAll();
      return;
    }
    setIndex((i) => i + 1);
  }

  function goBack() {
    if (index > 0) {
      setIndex((i) => i - 1);
      return;
    }
    onBack();
  }

  if (!meta) {
    return null;
  }

  if (loading || !draft) {
    return (
      <div className="w-full max-w-[560px] animate-in fade-in duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6521]/15 text-[#FF6521]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <h1 className="font-syne text-[32px] font-bold tracking-tight text-white md:text-[36px]">
            Drafting {meta.title}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Section {index + 1} of {total} — from Brand DNA and your company context…
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
      </div>
    );
  }

  return (
    <div className="w-full max-w-[560px] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6521]/15">
          <span className="text-lg leading-none text-[#FF6521]">✦</span>
        </div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          GTM draft · {index + 1}/{total}
        </p>
        <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
          Review {meta.title}
        </h1>
        <p className="mt-2 text-sm text-white/45">{meta.blurb}</p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              genKeyRef.current = null;
              setIndex((i) => i);
            }}
            className="underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Recommendation
          </p>
          <textarea
            value={draft.summary}
            onChange={(e) => patchDraft({ summary: e.target.value })}
            rows={meta.id === 'market_analysis' ? 3 : 2}
            className="w-full resize-none bg-transparent font-syne text-lg font-semibold leading-snug text-white outline-none placeholder:text-white/30"
            placeholder="One-line recommendation"
          />
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              {meta.bulletsLabel || 'Plays'}
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
                      patchDraft({ bullets: next });
                    }}
                    className="w-full bg-transparent text-[13px] leading-relaxed text-white/80 outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Remove play"
                    onClick={() =>
                      patchDraft({ bullets: draft.bullets.filter((_, i) => i !== idx) })
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
                    patchDraft({ bullets: [...draft.bullets, v] });
                    setNewBullet('');
                  }
                }}
                placeholder={meta.id === 'market_analysis' ? 'Add a decision…' : 'Add a play…'}
                className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder:text-white/25"
              />
              <button
                type="button"
                disabled={!newBullet.trim()}
                onClick={() => {
                  const v = newBullet.trim();
                  if (!v) return;
                  patchDraft({ bullets: [...draft.bullets, v] });
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
            onChange={(e) => patchDraft({ body: e.target.value })}
            rows={6}
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-white/75 outline-none placeholder:text-white/25"
            placeholder="Actionable guidance for this section"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
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
            onClick={looksGood}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            {isLast ? 'Looks Good →' : 'Looks Good →'}
          </button>
        </div>
      </div>
    </div>
  );
}
