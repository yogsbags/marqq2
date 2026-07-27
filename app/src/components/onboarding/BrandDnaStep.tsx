import { useEffect, useRef, useState } from 'react';
import { FileText, Link2, Loader2, Mic, Pencil, Square, Trash2, Upload } from 'lucide-react';
import type { BrandDna, BrandDnaKnowledgeFile, BrandDnaVoiceNote } from './types';
import {
  startBrowserSpeechRecognition,
  type BrowserSpeechSession,
} from '@/lib/browserSpeechRecognition';

interface BrandDnaStepProps {
  brandDna: BrandDna | null;
  loading: boolean;
  error: string | null;
  workspaceId?: string | null;
  onChange: (next: BrandDna) => void;
  onConfirm: () => void;
  onBack: () => void;
  onSkip: () => void;
  onRetry: () => void;
}

const KB_ACCEPT = '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.svg,.txt,.md,.markdown';
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg';

function displayHost(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

async function fileToBase64(file: File | Blob) {
  const arrayBuffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function formatBytes(size: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadBrandFiles(
  workspaceId: string,
  files: Array<{ name: string; mime: string; size: number; base64: string; category?: string; transcript?: string }>,
) {
  const res = await fetch('/api/brand-dna/knowledge-base', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, files }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Upload failed (${res.status})`);
  return Array.isArray(json.files) ? (json.files as BrandDnaKnowledgeFile[]) : [];
}

function VoiceInputPanel({
  workspaceId,
  voiceNotes,
  knowledgeFiles,
  onVoiceNotesChange,
  onFilesChange,
  compact = false,
}: {
  workspaceId?: string | null;
  voiceNotes: BrandDnaVoiceNote[];
  knowledgeFiles: BrandDnaKnowledgeFile[];
  onVoiceNotesChange: (notes: BrandDnaVoiceNote[]) => void;
  onFilesChange: (files: BrandDnaKnowledgeFile[]) => void;
  compact?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const speechSessionRef = useRef<BrowserSpeechSession | null>(null);

  async function startRecording() {
    if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
      setError('Voice recording is not supported in this browser.');
      return;
    }
    if (!workspaceId) {
      setError('Select a workspace before recording.');
      return;
    }
    setError(null);
    setLiveTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      speechSessionRef.current = startBrowserSpeechRecognition('en');
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone permission failed');
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    setRecording(false);
    setWorking(true);
    setError(null);
    try {
      await new Promise<void>((resolve) => {
        mr.addEventListener('stop', () => resolve(), { once: true });
        mr.stop();
      });
      await new Promise((r) => setTimeout(r, 120));
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      if (!blob.size) throw new Error('No audio captured — try again.');

      const audioBase64 = await fileToBase64(blob);
      let transcript = '';
      try {
        transcript = (await speechSessionRef.current?.stop())?.trim() || '';
      } catch {
        transcript = '';
      } finally {
        speechSessionRef.current = null;
      }
      if (!transcript) {
        const sttResp = await fetch('/api/voicebot/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64,
            mimeType: blob.type || 'audio/webm',
            language: 'en',
          }),
        });
        const sttJson = await sttResp.json().catch(() => ({}));
        if (!sttResp.ok) throw new Error(sttJson?.error || sttJson?.details || 'Transcription failed');
        transcript = String(sttJson?.transcript || '').trim();
      }
      setLiveTranscript(transcript);
      if (!transcript) throw new Error('No speech detected — try speaking a bit longer.');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const audioName = `voice-note-${stamp}.webm`;
      const mdName = `voice-note-${stamp}.md`;
      const mdBody = `# Brand voice note\n\nRecorded: ${new Date().toLocaleString()}\n\n${transcript}\n`;
      const mdBase64 = window.btoa(unescape(encodeURIComponent(mdBody)));

      const created = await uploadBrandFiles(workspaceId!, [
        {
          name: audioName,
          mime: blob.type || 'audio/webm',
          size: blob.size,
          base64: audioBase64,
          category: 'voice_note',
          transcript,
        },
        {
          name: mdName,
          mime: 'text/markdown',
          size: mdBody.length,
          base64: mdBase64,
          category: 'voice_transcript',
          transcript,
        },
      ]);

      const audioFile = created.find((f) => f.name === audioName) || created[0];
      const transcriptFile = created.find((f) => f.name === mdName) || created[1];
      const note: BrandDnaVoiceNote = {
        id: audioFile?.id || crypto.randomUUID(),
        transcript,
        audioFileId: audioFile?.id,
        audioUrl: audioFile?.url,
        transcriptFileId: transcriptFile?.id,
        createdAt: new Date().toISOString(),
      };
      onVoiceNotesChange([note, ...voiceNotes]);
      onFilesChange([...created, ...knowledgeFiles]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice capture failed');
    } finally {
      setWorking(false);
      speechSessionRef.current = null;
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
  }

  function removeNote(note: BrandDnaVoiceNote) {
    onVoiceNotesChange(voiceNotes.filter((n) => n.id !== note.id));
    const removeIds = new Set([note.audioFileId, note.transcriptFileId].filter(Boolean));
    if (removeIds.size) {
      onFilesChange(knowledgeFiles.filter((f) => !removeIds.has(f.id)));
      if (workspaceId) {
        for (const id of removeIds) {
          void fetch(
            `/api/brand-dna/knowledge-base/${encodeURIComponent(String(id))}?workspaceId=${encodeURIComponent(workspaceId)}`,
            { method: 'DELETE' },
          ).catch(() => {});
        }
      }
    }
  }

  function updateTranscript(noteId: string, transcript: string) {
    onVoiceNotesChange(
      voiceNotes.map((n) => (n.id === noteId ? { ...n, transcript } : n)),
    );
  }

  return (
    <div
      className={`rounded-2xl border border-dashed border-white/15 bg-white/[0.03] ${
        compact ? 'px-4 py-3' : 'px-5 py-4'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Voice brand brief
          </p>
          <p className={`mt-1 text-white/45 ${compact ? 'text-xs' : 'text-sm'}`}>
            Record anything about your brand — we store the audio and transcript.
          </p>
        </div>
        {!recording ? (
          <button
            type="button"
            disabled={working || !workspaceId}
            onClick={() => void startRecording()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
          >
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
            {working ? 'Saving…' : 'Record'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopRecording()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-500/30"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </button>
        )}
      </div>

      {recording ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-red-200/90">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
          Listening… speak freely, then tap Stop.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-amber-200">{error}</p> : null}
      {liveTranscript && working ? (
        <p className="mt-2 text-xs text-white/50">Transcribed: {liveTranscript}</p>
      ) : null}

      {voiceNotes.length ? (
        <ul className="mt-3 space-y-2">
          {voiceNotes.map((note, idx) => (
            <li
              key={note.id}
              className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-white/70"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-medium text-white/80">Voice note {voiceNotes.length - idx}</span>
                <button
                  type="button"
                  onClick={() => removeNote(note)}
                  className="rounded p-1 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                  aria-label="Remove voice note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={note.transcript}
                onChange={(e) => updateTranscript(note.id, e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-white/75 outline-none placeholder:text-white/25"
              />
              {note.audioUrl ? (
                <audio controls src={note.audioUrl} className="mt-2 h-8 w-full" preload="none" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-white/30">
          No voice notes yet — describe your product, audience, or brand voice out loud.
        </p>
      )}
    </div>
  );
}

function KnowledgeUploadPanel({
  workspaceId,
  files,
  onFilesChange,
  compact = false,
}: {
  workspaceId?: string | null;
  files: BrandDnaKnowledgeFile[];
  onFilesChange: (files: BrandDnaKnowledgeFile[]) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadSelected(selected: FileList | null) {
    if (!selected?.length) return;
    if (!workspaceId) {
      setUploadError('Select a workspace before uploading brand files.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const payload = await Promise.all(
        Array.from(selected).map(async (file) => ({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          base64: await fileToBase64(file),
        })),
      );
      const created = await uploadBrandFiles(workspaceId, payload);
      onFilesChange([...created, ...files]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeFile(fileId: string) {
    if (!workspaceId) return;
    try {
      await fetch(
        `/api/brand-dna/knowledge-base/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: 'DELETE' },
      );
    } catch {
      /* still remove locally */
    }
    onFilesChange(files.filter((f) => f.id !== fileId));
  }

  const visibleFiles = files.filter((f) => f.category !== 'voice_note' && f.category !== 'voice_transcript');

  return (
    <div
      className={`rounded-2xl border border-dashed border-white/15 bg-white/[0.03] ${
        compact ? 'px-4 py-3' : 'px-5 py-4'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Brand knowledge base
          </p>
          <p className={`mt-1 text-white/45 ${compact ? 'text-xs' : 'text-sm'}`}>
            Upload PDF, PPTX, images, TXT, or MD so agents learn your brand.
          </p>
        </div>
        <button
          type="button"
          disabled={uploading || !workspaceId}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={KB_ACCEPT}
          className="hidden"
          onChange={(e) => void uploadSelected(e.target.files)}
        />
      </div>

      {uploadError ? <p className="mt-2 text-xs text-amber-200">{uploadError}</p> : null}

      {visibleFiles.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {visibleFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-white/70"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-white/40" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-white/35">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => void removeFile(file.id)}
                className="rounded p-1 text-white/35 transition hover:bg-white/5 hover:text-white/80"
                aria-label={`Remove ${file.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-white/30">No files yet — guidelines, decks, and brand docs welcome.</p>
      )}
    </div>
  );
}

export function BrandDnaStep({
  brandDna,
  loading,
  error,
  workspaceId,
  onChange,
  onConfirm,
  onBack,
  onSkip,
  onRetry,
}: BrandDnaStepProps) {
  const [editingColors, setEditingColors] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<BrandDnaKnowledgeFile[]>([]);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<BrandDnaVoiceNote[]>([]);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedKbRef = useRef(false);

  useEffect(() => {
    setLogoBroken(false);
  }, [brandDna?.logoUrl]);

  useEffect(() => {
    if (!workspaceId || hydratedKbRef.current) return;
    hydratedKbRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/brand-dna/knowledge-base?workspaceId=${encodeURIComponent(workspaceId)}`,
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const files = Array.isArray(json.files) ? (json.files as BrandDnaKnowledgeFile[]) : [];
        if (!files.length) return;
        setPendingFiles(files);
        const notes: BrandDnaVoiceNote[] = files
          .filter((f) => f.category === 'voice_note')
          .map((f) => ({
            id: f.id,
            transcript: String((f as BrandDnaKnowledgeFile & { transcript?: string }).transcript || ''),
            audioFileId: f.id,
            audioUrl: f.url,
            createdAt: f.createdAt,
          }));
        if (notes.length) setPendingVoiceNotes(notes);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!brandDna) return;
    const patch: Partial<BrandDna> = {};
    if (pendingFiles.length && !brandDna.knowledgeBaseFiles?.length) {
      patch.knowledgeBaseFiles = pendingFiles;
    }
    if (pendingVoiceNotes.length && !brandDna.voiceNotes?.length) {
      patch.voiceNotes = pendingVoiceNotes;
    }
    if (!Object.keys(patch).length) {
      if (pendingFiles.length && brandDna.knowledgeBaseFiles?.length) setPendingFiles([]);
      if (pendingVoiceNotes.length && brandDna.voiceNotes?.length) setPendingVoiceNotes([]);
      return;
    }
    onChange({ ...brandDna, ...patch });
    if (patch.knowledgeBaseFiles) setPendingFiles([]);
    if (patch.voiceNotes) setPendingVoiceNotes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merge pending uploads once DNA arrives
  }, [brandDna?.companyName, pendingFiles.length, pendingVoiceNotes.length]);

  const kbFiles = brandDna?.knowledgeBaseFiles || pendingFiles;
  const voiceNotes = brandDna?.voiceNotes || pendingVoiceNotes;

  function setKbFiles(files: BrandDnaKnowledgeFile[]) {
    if (brandDna) onChange({ ...brandDna, knowledgeBaseFiles: files });
    else setPendingFiles(files);
  }

  function setVoiceNotes(notes: BrandDnaVoiceNote[]) {
    if (brandDna) onChange({ ...brandDna, voiceNotes: notes });
    else setPendingVoiceNotes(notes);
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    if (!workspaceId) {
      setLogoError('Select a workspace before uploading a logo.');
      return;
    }
    setLogoUploading(true);
    setLogoError(null);
    try {
      const res = await fetch('/api/brand-dna/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: file.name,
          mime: file.type || 'image/png',
          size: file.size,
          base64: await fileToBase64(file),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Logo upload failed (${res.status})`);
      if (!brandDna) throw new Error('Brand DNA not ready yet');
      onChange({ ...brandDna, logoUrl: String(json.logoUrl || '') });
      setLogoBroken(false);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

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
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] ${i === 1 ? 'col-span-2' : ''}`}
            />
          ))}
        </div>
        <div className="mb-3 space-y-3">
          <VoiceInputPanel
            workspaceId={workspaceId}
            voiceNotes={voiceNotes}
            knowledgeFiles={kbFiles}
            onVoiceNotesChange={setVoiceNotes}
            onFilesChange={setKbFiles}
          />
          <KnowledgeUploadPanel
            workspaceId={workspaceId}
            files={kbFiles}
            onFilesChange={setKbFiles}
          />
        </div>
      </div>
    );
  }

  const update = (patch: Partial<BrandDna>) => onChange({ ...brandDna, ...patch });
  const showLogoUpload = !brandDna.logoUrl || logoBroken;

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
        <div className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
          {!showLogoUpload ? (
            <button
              type="button"
              className="group relative"
              onClick={() => logoInputRef.current?.click()}
              title="Replace logo"
            >
              <img
                src={brandDna.logoUrl || ''}
                alt={`${brandDna.companyName} logo`}
                className="max-h-16 max-w-full object-contain"
                onError={() => setLogoBroken(true)}
              />
              <span className="mt-2 block text-center text-[10px] text-white/30 opacity-0 transition group-hover:opacity-100">
                Replace
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={logoUploading || !workspaceId}
              onClick={() => logoInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/10 px-3 py-4 text-center transition hover:border-white/35 hover:bg-white/[0.04] disabled:opacity-40"
            >
              {logoUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white/50" />
              ) : (
                <Upload className="h-5 w-5 text-white/45" />
              )}
              <span className="text-xs font-medium text-white/70">Upload logo</span>
              <span className="text-[10px] text-white/35">PNG, JPG, SVG, WebP</span>
            </button>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept={LOGO_ACCEPT}
            className="hidden"
            onChange={(e) => void uploadLogo(e.target.files?.[0] || null)}
          />
          {logoError ? <p className="mt-2 text-[10px] text-amber-200">{logoError}</p> : null}
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

        <div className="col-span-2 space-y-3">
          <VoiceInputPanel
            workspaceId={workspaceId}
            voiceNotes={voiceNotes}
            knowledgeFiles={kbFiles}
            onVoiceNotesChange={(notes) => update({ voiceNotes: notes })}
            onFilesChange={(files) => update({ knowledgeBaseFiles: files })}
            compact
          />
          <KnowledgeUploadPanel
            workspaceId={workspaceId}
            files={kbFiles}
            onFilesChange={(files) => update({ knowledgeBaseFiles: files })}
            compact
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
