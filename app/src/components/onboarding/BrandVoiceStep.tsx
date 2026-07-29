import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
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

function SectionLabel({
  children,
  editing,
  onToggleEdit,
}: {
  children: ReactNode;
  editing?: boolean;
  onToggleEdit?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        {children}
      </p>
      {onToggleEdit ? (
        <button
          type="button"
          onClick={onToggleEdit}
          className={`rounded-md p-1 transition hover:bg-white/5 ${
            editing ? 'text-[#FF6521]' : 'text-white/40 hover:text-white/70'
          }`}
          aria-label={editing ? 'Done editing' : 'Edit'}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ToneChips({
  items,
  editing,
  onChange,
  onRemove,
  draft,
  setDraft,
  onAdd,
}: {
  items: string[];
  editing: boolean;
  onChange: (idx: number, value: string) => void;
  onRemove: (idx: number) => void;
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((t, idx) =>
          editing ? (
            <div
              key={`tone-edit-${idx}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] pl-3 pr-1.5 py-1"
            >
              <input
                value={t}
                onChange={(e) => onChange(idx, e.target.value)}
                className="w-[7.5rem] bg-transparent text-xs text-white/85 outline-none"
              />
              <button
                type="button"
                aria-label="Remove tone"
                onClick={() => onRemove(idx)}
                className="rounded-full p-0.5 text-white/40 transition hover:bg-white/10 hover:text-white/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <span
              key={`tone-${idx}-${t}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/75"
            >
              {t}
            </span>
          ),
        )}
        {!items.length && !editing ? (
          <span className="text-sm text-white/35">No tone guidelines yet</span>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder="Add tone…"
            className="flex-1 bg-transparent text-sm text-white/80 outline-none placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GuidelineBullets({
  items,
  editing,
  emptyLabel,
  onChange,
  onRemove,
  draft,
  setDraft,
  onAdd,
  addPlaceholder,
}: {
  items: string[];
  editing: boolean;
  emptyLabel: string;
  onChange: (idx: number, value: string) => void;
  onRemove: (idx: number) => void;
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  addPlaceholder: string;
}) {
  return (
    <div>
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((t, idx) =>
            editing ? (
              <li key={`g-edit-${idx}`} className="flex items-start gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                <input
                  value={t}
                  onChange={(e) => onChange(idx, e.target.value)}
                  className="w-full bg-transparent text-[13px] leading-relaxed text-white/80 outline-none"
                />
                <button
                  type="button"
                  aria-label="Remove guideline"
                  onClick={() => onRemove(idx)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ) : (
              <li
                key={`g-${idx}-${t.slice(0, 24)}`}
                className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/75"
              >
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                <span>{t}</span>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-white/35">{emptyLabel}</p>
      )}
      {editing ? (
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder={addPlaceholder}
            className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      ) : null}
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
  const [editingTone, setEditingTone] = useState(false);
  const [editingDos, setEditingDos] = useState(false);
  const [editingDonts, setEditingDonts] = useState(false);
  const [newTone, setNewTone] = useState('');
  const [newDo, setNewDo] = useState('');
  const [newDont, setNewDont] = useState('');
  const hasGeneratedRef = useRef(false);

  const brandVoice = brandDna?.brandVoice || null;
  const tone = brandVoice?.tone || [];
  const dosList = brandVoice?.dosList || [];
  const dontsList = brandVoice?.dontsList || [];
  const hasContent = Boolean(tone.length || dosList.length || dontsList.length);

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
    if (brandVoice && hasContent) return;
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
          disabled={generating && !hasContent}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          Looks Good →
        </button>
      </div>
    </div>
  );

  if (!brandDna) {
    return (
      <div className="w-full max-w-[560px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6521]/15">
            <span className="text-lg leading-none text-[#FF6521]">✦</span>
          </div>
          <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
            Review your Brand Voice
          </h1>
          <p className="mt-2 text-sm text-white/45">Brand DNA is missing.</p>
        </div>
        {footer}
      </div>
    );
  }

  if (generating && !hasContent) {
    return (
      <div className="w-full max-w-[560px] animate-in fade-in duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6521]/15 text-[#FF6521]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <h1 className="font-syne text-[32px] font-bold tracking-tight text-white md:text-[36px]">
            Shaping your Brand Voice
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Turning Brand DNA into tone, do&apos;s, and don&apos;ts…
          </p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] ${
                i === 1 ? 'col-span-2' : i === 2 ? 'col-span-2' : ''
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
        <h1 className="font-syne text-[30px] font-bold tracking-tight text-white md:text-[34px]">
          Review your Brand Voice
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Your content agents will write from these guidelines.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}{' '}
          <button
            type="button"
            onClick={() => void generateBrandVoice()}
            className="underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {/* Identity context — mirrors Brand DNA company card */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4">
          <p className="font-syne text-xl font-semibold text-white">{brandDna.companyName}</p>
          {brandDna.brandTagline ? (
            <p className="mt-1.5 text-sm leading-relaxed text-white/50">{brandDna.brandTagline}</p>
          ) : brandDna.toneOfVoice ? (
            <p className="mt-1.5 text-sm leading-relaxed text-white/50">{brandDna.toneOfVoice}</p>
          ) : null}
        </div>

        {/* Tone chips */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
          <SectionLabel editing={editingTone} onToggleEdit={() => setEditingTone((v) => !v)}>
            Tone
          </SectionLabel>
          <ToneChips
            items={tone}
            editing={editingTone}
            onChange={(idx, value) =>
              updateVoice({ tone: tone.map((x, i) => (i === idx ? value : x)) })
            }
            onRemove={(idx) => updateVoice({ tone: tone.filter((_, i) => i !== idx) })}
            draft={newTone}
            setDraft={setNewTone}
            onAdd={addTone}
          />
        </div>

        {/* Do */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 sm:col-span-1">
          <SectionLabel editing={editingDos} onToggleEdit={() => setEditingDos((v) => !v)}>
            Do
          </SectionLabel>
          <GuidelineBullets
            items={dosList}
            editing={editingDos}
            emptyLabel="No do guidelines yet"
            onChange={(idx, value) =>
              updateVoice({ dosList: dosList.map((x, i) => (i === idx ? value : x)) })
            }
            onRemove={(idx) => updateVoice({ dosList: dosList.filter((_, i) => i !== idx) })}
            draft={newDo}
            setDraft={setNewDo}
            onAdd={addDo}
            addPlaceholder="Add a do…"
          />
        </div>

        {/* Don't */}
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 sm:col-span-1">
          <SectionLabel editing={editingDonts} onToggleEdit={() => setEditingDonts((v) => !v)}>
            Don&apos;t
          </SectionLabel>
          <GuidelineBullets
            items={dontsList}
            editing={editingDonts}
            emptyLabel="No don't guidelines yet"
            onChange={(idx, value) =>
              updateVoice({ dontsList: dontsList.map((x, i) => (i === idx ? value : x)) })
            }
            onRemove={(idx) =>
              updateVoice({ dontsList: dontsList.filter((_, i) => i !== idx) })
            }
            draft={newDont}
            setDraft={setNewDont}
            onAdd={addDont}
            addPlaceholder="Add a don't…"
          />
        </div>
      </div>

      {generating ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing…
        </div>
      ) : null}

      {footer}
    </div>
  );
}
