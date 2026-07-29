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

function GuidelineList({
  label,
  items,
  onChangeItem,
  onRemove,
  draft,
  setDraft,
  onAdd,
  placeholder,
}: {
  label: string;
  items: string[];
  onChangeItem: (idx: number, value: string) => void;
  onRemove: (idx: number) => void;
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        {label}
      </p>
      <div className="space-y-2">
        {items.map((t, idx) => (
          <div key={`${label}-${idx}`} className="flex items-center gap-2">
            <input
              value={t}
              onChange={(e) => onChangeItem(idx, e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-white/75 outline-none"
            />
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onRemove(idx)}
              className="shrink-0 rounded p-1 text-white/35 transition hover:bg-white/5 hover:text-white/80"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/25"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim()}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
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
              'Constraints: each array must have 3-6 short items. Tone items are 1-3 words. ' +
              'Do/Dont items are one short actionable sentence each.',
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
      };

      if (!next.dontsList.length) {
        next.dontsList = normalizeList(
          parsed.dontList || parsed.donts || parsed.dont || parsed.dont_sList,
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
        tone,
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

  const footer = (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-[#09090F]/95 pt-4 backdrop-blur-sm">
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
  );

  if (!brandDna) {
    return (
      <div className="flex w-full max-w-[560px] flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-7 text-center">
          <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
            Review your Brand Voice
          </h1>
          <p className="mt-2 text-sm text-white/45">Brand DNA is missing.</p>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[560px] flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 shrink-0 text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6521]/15">
          <span className="text-lg leading-none text-[#FF6521]">✦</span>
        </div>
        <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
          Review your Brand Voice
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Tone, do&apos;s, and don&apos;ts your agents will follow when writing.
        </p>
      </div>

      {error ? (
        <div className="mb-4 shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
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

      {generating && !tone.length && !dosList.length ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating brand voice from your Brand DNA…
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <GuidelineList
            label="Tone"
            items={tone}
            onChangeItem={(idx, value) =>
              updateVoice({ tone: tone.map((x, i) => (i === idx ? value : x)) })
            }
            onRemove={(idx) => updateVoice({ tone: tone.filter((_, i) => i !== idx) })}
            draft={newTone}
            setDraft={setNewTone}
            onAdd={addTone}
            placeholder="e.g. Approachable"
          />
        </div>

        <GuidelineList
          label="Do"
          items={dosList}
          onChangeItem={(idx, value) =>
            updateVoice({ dosList: dosList.map((x, i) => (i === idx ? value : x)) })
          }
          onRemove={(idx) => updateVoice({ dosList: dosList.filter((_, i) => i !== idx) })}
          draft={newDo}
          setDraft={setNewDo}
          onAdd={addDo}
          placeholder="Add a do guideline"
        />

        <GuidelineList
          label="Don't"
          items={dontsList}
          onChangeItem={(idx, value) =>
            updateVoice({ dontsList: dontsList.map((x, i) => (i === idx ? value : x)) })
          }
          onRemove={(idx) => updateVoice({ dontsList: dontsList.filter((_, i) => i !== idx) })}
          draft={newDont}
          setDraft={setNewDont}
          onAdd={addDont}
          placeholder="Add a don't guideline"
        />
      </div>

      {generating && (tone.length > 0 || dosList.length > 0) ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing…
        </div>
      ) : null}

      <div className="mt-6 shrink-0">{footer}</div>
    </div>
  );
}
