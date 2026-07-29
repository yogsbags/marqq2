import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { BrandDna } from './types';

function parseJsonSafely(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function BrandVoiceStep({
  brandDna,
  workspaceId,
  onBrandDnaUpdate,
  onBack,
  onSkip,
  onConfirm,
}: {
  brandDna: BrandDna | null;
  workspaceId?: string | null;
  onBrandDnaUpdate: (next: BrandDna) => void;
  onBack: () => void;
  onSkip: () => void;
  onConfirm: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasGeneratedRef = useRef(false);

  const brandVoice = brandDna?.brandVoice || null;
  const tone = brandVoice?.tone || [];
  const dosList = brandVoice?.dosList || [];
  const dontsList = brandVoice?.dontsList || [];

  const voiceNoteText = useMemo(() => {
    const notes = brandDna?.voiceNotes || [];
    const transcripts = notes
      .map((n) => String(n.transcript || '').trim())
      .filter(Boolean);
    return transcripts.slice(0, 6).join('\n\n');
  }, [brandDna]);

  async function generateBrandVoice() {
    if (!brandDna) return;
    setGenerating(true);
    setError(null);
    try {
      const body = {
        stream: false,
        temperature: 0.25,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              'You are a brand voice strategist. Return STRICT JSON ONLY. No markdown. No extra text. ' +
              'Output schema: { "tone": string[], "dosList": string[], "dontsList": string[] }. ' +
              'Constraints: each array must have 3-8 items (if insufficient, use fewer but non-empty where possible). ' +
              'Each string should be actionable and specific (1 short sentence).',
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                companyName: brandDna.companyName,
                websiteUrl: brandDna.websiteUrl,
                tagline: brandDna.brandTagline,
                summary: brandDna.businessSummary,
                toneOfVoice: brandDna.toneOfVoice,
                voiceNotes: voiceNoteText || '(no voice notes provided)',
                colors: brandDna.colors,
                fonts: brandDna.fonts,
                workspaceId: workspaceId || undefined,
              },
              null,
              2,
            ),
          },
        ],
      };

      const res = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to generate brand voice');

      const content = json?.choices?.[0]?.message?.content;
      const parsed = typeof content === 'string' ? parseJsonSafely(content) : null;
      if (!parsed) throw new Error('AI returned invalid JSON');

      const next = {
        tone: normalizeList(parsed.tone),
        dosList: normalizeList(parsed.dosList),
        dontsList: normalizeList(parsed.dontsList),
      } as { tone: string[]; dosList: string[]; dontsList: string[] };

      // Key variant tolerance (in case LLM outputs different spellings)
      if (!next.dontsList.length) {
        next.dontsList = normalizeList(
          parsed.dontsList || parsed.dontList || parsed.donts || parsed.dont || parsed.dont_sList,
        );
      }

      if (!next.tone.length && !next.dosList.length && !next.dontsList.length) {
        throw new Error('Generated brand voice was empty');
      }

      onBrandDnaUpdate({
        ...brandDna,
        brandVoice: next,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brand voice generation failed');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!brandDna) return;
    if (hasGeneratedRef.current) return;
    if (brandVoice && (tone.length || dosList.length || dontsList.length)) return;
    hasGeneratedRef.current = true;
    void generateBrandVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandDna]);

  function updateVoice(partial: Partial<NonNullable<BrandDna['brandVoice']>>) {
    if (!brandDna) return;
    onBrandDnaUpdate({
      ...brandDna,
      brandVoice: {
        tone: tone,
        dosList,
        dontsList,
        ...partial,
      },
    });
  }

  const [newTone, setNewTone] = useState('');
  const [newDo, setNewDo] = useState('');
  const [newDont, setNewDont] = useState('');

  function addTone() {
    const v = newTone.trim();
    if (!v) return;
    updateVoice({ tone: [...tone, v] });
    setNewTone('');
  }

  function addDo() {
    const v = newDo.trim();
    if (!v) return;
    updateVoice({ dosList: [...dosList, v] });
    setNewDo('');
  }

  function addDont() {
    const v = newDont.trim();
    if (!v) return;
    updateVoice({ dontsList: [...dontsList, v] });
    setNewDont('');
  }

  function removeAt(listKey: 'tone' | 'dosList' | 'dontsList', idx: number) {
    if (listKey === 'tone') updateVoice({ tone: tone.filter((_, i) => i !== idx) });
    if (listKey === 'dosList') updateVoice({ dosList: dosList.filter((_, i) => i !== idx) });
    if (listKey === 'dontsList') updateVoice({ dontsList: dontsList.filter((_, i) => i !== idx) });
  }

  if (!brandDna) {
    return (
      <div className="w-full max-w-[560px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-7 text-center">
          <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
            Review your Brand Voice
          </h1>
          <p className="mt-2 text-sm text-white/45">Brand DNA is missing.</p>
        </div>
        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="text-sm text-white/45 transition hover:text-white/80">
            Back
          </button>
          <div className="flex items-center gap-4">
            <button type="button" onClick={onSkip} className="text-sm text-white/35 transition hover:text-white/60">
              Skip Onboarding
            </button>
            <button type="button" onClick={onConfirm} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90">
              Looks Good →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[560px] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6521]/15">
          <span className="text-lg leading-none text-[#FF6521]">*</span>
        </div>
        <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
          Review your Brand Voice
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Tone, do's, and don'ts for consistent messaging across your agents.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
          <button
            type="button"
            onClick={() => void generateBrandVoice()}
            className="ml-2 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Tone (how we sound)
          </p>

          <div className="space-y-2">
            {tone.map((t, idx) => (
              <div key={`${idx}-${t}`} className="flex items-start gap-2">
                <textarea
                  value={t}
                  onChange={(e) => updateVoice({ tone: tone.map((x, i) => (i === idx ? e.target.value : x)) })}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-white/75 outline-none"
                />
                <button
                  type="button"
                  aria-label="Remove tone"
                  onClick={() => removeAt('tone', idx)}
                  className="mt-1 rounded p-1 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={newTone}
              onChange={(e) => setNewTone(e.target.value)}
              placeholder="Add tone guideline"
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/25"
            />
            <button
              type="button"
              onClick={addTone}
              disabled={!newTone.trim()}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Do (what to say)
          </p>
          <div className="space-y-2">
            {dosList.map((t, idx) => (
              <div key={`${idx}-${t}`} className="flex items-start gap-2">
                <textarea
                  value={t}
                  onChange={(e) => updateVoice({ dosList: dosList.map((x, i) => (i === idx ? e.target.value : x)) })}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-white/75 outline-none"
                />
                <button
                  type="button"
                  aria-label="Remove do"
                  onClick={() => removeAt('dosList', idx)}
                  className="mt-1 rounded p-1 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newDo}
              onChange={(e) => setNewDo(e.target.value)}
              placeholder="Add do guideline"
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/25"
            />
            <button
              type="button"
              onClick={addDo}
              disabled={!newDo.trim()}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Don't (what to avoid)
          </p>
          <div className="space-y-2">
            {dontsList.map((t, idx) => (
              <div key={`${idx}-${t}`} className="flex items-start gap-2">
                <textarea
                  value={t}
                  onChange={(e) => updateVoice({ dontsList: dontsList.map((x, i) => (i === idx ? e.target.value : x)) })}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-white/75 outline-none"
                />
                <button
                  type="button"
                  aria-label="Remove dont"
                  onClick={() => removeAt('dontsList', idx)}
                  className="mt-1 rounded p-1 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newDont}
              onChange={(e) => setNewDont(e.target.value)}
              placeholder="Add don't guideline"
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/25"
            />
            <button
              type="button"
              onClick={addDont}
              disabled={!newDont.trim()}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        {generating ? (
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating brand voice...
          </div>
        ) : null}
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

