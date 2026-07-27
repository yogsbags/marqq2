import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  CheckCircle,
  CheckCircle2,
  Clock,
  Mic,
  PhoneCall,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Upload,
  Volume2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { AgentRunPanel } from '@/components/agent/AgentRunPanel';
import { CompanySelector } from '@/components/agent/CompanySelector';
import { OutcomeGoLiveCta } from '@/components/outcome-previews';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAgentRun } from '@/hooks/useAgentRun';
import { cn } from '@/lib/utils';
import { getActiveAgentContext } from '@/lib/agentContext';
import { KnowledgeBaseUploader } from './voicebot/KnowledgeBaseUploader';
import { LiveKitVoiceSession } from './voicebot/LiveKitVoiceSession';
import { VoicebotSimulator } from './voicebot/VoicebotSimulator';

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
}

interface VoiceLead {
  phone: string;
  name?: string;
  company?: string;
  email?: string;
}

interface VoiceCallRecord {
  callSid?: string;
  leadName?: string | null;
  leadPhone?: string | null;
  leadEmail?: string | null;
  status?: string;
  campaignId?: string;
  queuedAt?: string;
  updatedAt?: string;
  language?: string;
  turns?: unknown[];
  summary?: string;
  leadScore?: number;
  leadStatus?: string;
  leadTemperature?: string;
  scorecard?: {
    summary?: string;
    overallScore?: number;
    status?: string;
    leadTemperature?: string;
    nextAction?: string;
    humanCloserBrief?: string;
  } | null;
}

interface TwilioConfig {
  configured: boolean;
  phoneNumber?: string | null;
  publicBaseUrl?: string | null;
  mediaStreamUrl?: string | null;
}

interface AIVoiceBotFlowProps {
  autoStart?: boolean;
}

const INITIAL_STEPS: WorkflowStep[] = [
  {
    id: 'brief',
    title: 'Brief locked',
    description: 'Contact list, objective, and campaign shape are ready.',
    status: 'pending',
  },
  {
    id: 'script',
    title: 'Opening line ready',
    description: 'Sarvam TTS preview uses the same voice as live calls.',
    status: 'pending',
  },
  {
    id: 'bot',
    title: 'Twilio + Sarvam checked',
    description: 'Outbound dialer and Sarvam STT/TTS are configured.',
    status: 'pending',
  },
  {
    id: 'launch',
    title: 'Calls queued',
    description: 'Outbound calls placed via Twilio → Sarvam media stream.',
    status: 'pending',
  },
];

function normalizePhone(value: unknown): string {
  return String(value || '').replace(/[^\d+]/g, '');
}

function pickField(row: Record<string, unknown>, aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const hit = entries.find(([key]) => key.trim().toLowerCase() === alias);
    if (hit && String(hit[1] || '').trim()) return String(hit[1]).trim();
  }
  for (const alias of aliases) {
    const hit = entries.find(([key]) => key.trim().toLowerCase().includes(alias));
    if (hit && String(hit[1] || '').trim()) return String(hit[1]).trim();
  }
  return '';
}

async function parseContactFile(file: File): Promise<VoiceLead[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });

  const leads: VoiceLead[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const phone = normalizePhone(
      pickField(row, ['phone', 'phone_e164', 'mobile', 'mobile_number', 'phonenumber', 'contact_number', 'tel']),
    );
    if (!phone || phone.replace(/\D/g, '').length < 8) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    leads.push({
      phone,
      name: pickField(row, ['name', 'full_name', 'fullname_name', 'contact', 'lead_name']) || undefined,
      company: pickField(row, ['company', 'organization', 'account', 'company_name']) || undefined,
      email: pickField(row, ['email', 'email_norm', 'email_address', 'work_email']) || undefined,
    });
  }
  return leads;
}

export function AIVoiceBotFlow({ autoStart = false }: AIVoiceBotFlowProps) {
  const kiranRun = useAgentRun();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id || getActiveAgentContext().workspaceId || '';

  const [voiceCompanyId, setVoiceCompanyId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<VoiceLead[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<'en' | 'hi'>('en');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [previewText, setPreviewText] = useState('Namaste! This is your AI voice campaign assistant reaching out with a quick follow-up.');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [campaignName, setCampaignName] = useState('Q2 Voice Outreach');
  const [campaignObjective, setCampaignObjective] = useState('Book qualified meetings');
  const [callWindow, setCallWindow] = useState('10 AM - 6 PM');
  const [dailyLimit, setDailyLimit] = useState('100');
  const [showVoiceLab, setShowVoiceLab] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [liveCalls, setLiveCalls] = useState<VoiceCallRecord[]>([]);
  const [launchResult, setLaunchResult] = useState<{
    queued_count?: number;
    failed_count?: number;
    calls?: Array<{ phone?: string; status?: string; sid?: string; error?: string }>;
    message?: string;
    error?: string;
  } | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  const uploadReady = Boolean(uploadedFile) && parsedLeads.length > 0;
  const campaignReady =
    uploadReady &&
    Boolean(voiceCompanyId.trim()) &&
    Boolean(campaignName.trim()) &&
    Boolean(campaignObjective.trim()) &&
    Boolean(previewText.trim());

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps((prev) => prev.map((step, index) => (index === stepIndex ? { ...step, status, progress } : step)));
  };

  const refreshTwilioConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/voicebot/twilio/config');
      const json = await res.json().catch(() => null);
      if (res.ok) setTwilioConfig(json as TwilioConfig);
    } catch {
      setTwilioConfig(null);
    }
  }, []);

  const refreshLiveCalls = useCallback(async () => {
    setMonitorLoading(true);
    try {
      const res = await fetch('/api/voicebot/twilio/calls');
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load calls');
      setLiveCalls(Array.isArray(json?.calls) ? json.calls : []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load call monitor');
    } finally {
      setMonitorLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTwilioConfig();
  }, [refreshTwilioConfig]);

  useEffect(() => {
    if (!showMonitor) return;
    void refreshLiveCalls();
    const timer = window.setInterval(() => {
      void refreshLiveCalls();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [showMonitor, refreshLiveCalls]);

  useEffect(() => {
    if (!autoStart || isProcessing || uploadedFile) return;
    // autoStart only opens the monitor — real launch still needs a contact file
    setShowMonitor(true);
    void refreshLiveCalls();
  }, [autoStart, isProcessing, uploadedFile, refreshLiveCalls]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['.xlsx', '.xls', '.csv'];
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!validTypes.includes(fileExtension)) {
      toast.error('Please upload a valid Excel or CSV file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB.');
      return;
    }

    try {
      const leads = await parseContactFile(file);
      if (!leads.length) {
        toast.error('No phone numbers found. Include a Phone / Mobile column.');
        return;
      }
      setUploadedFile(file);
      setParsedLeads(leads);
      updateStepStatus(0, 'completed', 100);
      toast.success(`${file.name}: ${leads.length} contacts with phones`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse contact file');
    }
  };

  const deployVoiceCampaign = async () => {
    if (!campaignReady) {
      toast.error('Select a company, upload contacts with phones, and set brief + opening line before launching.');
      return;
    }

    setIsProcessing(true);
    setShowMonitor(true);
    setLaunchResult(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending', progress: undefined })));

    try {
      updateStepStatus(0, 'processing', 40);
      updateStepStatus(0, 'completed', 100);

      updateStepStatus(1, 'processing', 50);
      if (!previewText.trim()) throw new Error('Opening line is required');
      updateStepStatus(1, 'completed', 100);

      updateStepStatus(2, 'processing', 30);
      await refreshTwilioConfig();
      const configRes = await fetch('/api/voicebot/twilio/config');
      const configJson = (await configRes.json().catch(() => null)) as TwilioConfig | null;
      if (!configJson?.configured) {
        throw new Error(
          'Twilio + public media stream not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and PUBLIC_BASE_URL.',
        );
      }
      const sarvamRes = await fetch('/api/voicebot/livekit/config');
      const sarvamJson = await sarvamRes.json().catch(() => null);
      if (!sarvamJson?.providers?.stt?.configured || !sarvamJson?.providers?.tts?.configured) {
        throw new Error('SARVAM_API_KEY is required for STT/TTS on live calls.');
      }
      updateStepStatus(2, 'completed', 100);

      updateStepStatus(3, 'processing', 20);
      const limit = Math.max(1, Math.min(Number(dailyLimit) || 100, 100));
      const leads = parsedLeads.slice(0, limit);

      const res = await fetch('/api/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automation_id: 'voicebot_campaign_launch',
          company_id: voiceCompanyId,
          params: {
            campaign_name: campaignName,
            script_hint: previewText,
            objective: campaignObjective,
            call_window: callWindow,
            language: voiceLanguage,
            gender: voiceGender,
            leads,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Launch failed (${res.status})`);
      if (json?.status === 'error' && !json?.queued_count) {
        throw new Error(json?.error || json?.message || 'No calls queued');
      }

      setLaunchResult(json);
      updateStepStatus(3, 'completed', 100);
      await refreshLiveCalls();

      const queued = Number(json?.queued_count || 0);
      const failed = Number(json?.failed_count || 0);
      if (queued > 0 && failed === 0) {
        toast.success(`Queued ${queued} Sarvam voice calls via Twilio`);
      } else if (queued > 0) {
        toast.success(`Queued ${queued} calls (${failed} failed)`);
      } else {
        toast.error(json?.error || 'No calls were queued');
      }
    } catch (error: unknown) {
      const firstIncomplete = steps.findIndex((step) => step.status !== 'completed');
      updateStepStatus(firstIncomplete >= 0 ? firstIncomplete : 0, 'error');
      toast.error(error instanceof Error ? error.message : 'Voice campaign launch failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const previewVoice = async () => {
    try {
      setPreviewLoading(true);
      const resp = await fetch('/api/voicebot/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: previewText,
          language: voiceLanguage,
          gender: voiceGender,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error || json?.message || 'Failed to generate audio');
      const audioBase64 = json?.audioBase64;
      if (!audioBase64) throw new Error('No audio returned');
      const audio = new Audio(`data:${json?.mimeType || 'audio/mpeg'};base64,${audioBase64}`);
      await audio.play();
      updateStepStatus(1, 'completed', 100);
      toast.success('Playing Sarvam voice preview');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Voice preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const runKiranBrief = () => {
    return kiranRun.run(
      'kiran',
      'Review retention signals and outreach context. Return the top 3 conversation angles, likely objections, and a short call outline for this company.',
      'daily_lifecycle_check',
      voiceCompanyId || undefined,
    );
  };

  const stepCompletion = useMemo(() => {
    const completed = steps.filter((step) => step.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  }, [steps]);

  const activeCalls = liveCalls.filter((c) => {
    const s = String(c.status || '').toLowerCase();
    return ['queued', 'initiated', 'ringing', 'in-progress', 'answered', 'active'].includes(s);
  });
  const completedCalls = liveCalls.filter((c) => {
    const s = String(c.status || '').toLowerCase();
    return ['completed', 'busy', 'failed', 'no-answer', 'canceled', 'cancelled'].includes(s);
  });

  const monitorMetrics = [
    { label: 'Queued / live', value: String(activeCalls.length) },
    { label: 'Recent calls', value: String(liveCalls.length) },
    { label: 'Launch queued', value: String(launchResult?.queued_count ?? '—') },
  ];

  const planCards = [
    {
      title: 'What you launch',
      copy: 'Twilio dials each contact; Sarvam handles STT/TTS on the media stream with Groq dialogue.',
      icon: PhoneCall,
    },
    {
      title: 'What the bot handles',
      copy: 'Opening line, qualification turns, objections, and meeting-booking logic in one Sarvam voice loop.',
      icon: Bot,
    },
    {
      title: 'What you review',
      copy: 'Live call status from Twilio + persisted call records after each conversation.',
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            Voice Campaigns · Sarvam
          </div>
          <div className="space-y-2">
            <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
              Launch outbound voice without the operator mess
            </h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Upload contacts, preview with Sarvam TTS, then place real Twilio calls. Speech in and out is Sarvam only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Readiness:</span> <span className="font-medium text-foreground">{stepCompletion}%</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Contacts:</span> <span className="font-medium text-foreground">{parsedLeads.length || 0}</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Twilio:</span> <span className="font-medium text-foreground">{twilioConfig?.configured ? 'ready' : 'needs env'}</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Volume:</span> <span className="font-medium text-foreground">{dailyLimit}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Campaign brief</h2>
                  <p className="text-sm text-muted-foreground">Define the campaign once, then launch real Twilio + Sarvam calls.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={kiranRun.streaming}
                  className="h-auto min-h-9 whitespace-normal text-left leading-5"
                  onClick={runKiranBrief}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Get pre-call brief
                </Button>
              </div>

              <CompanySelector value={voiceCompanyId} onChange={setVoiceCompanyId} />
              <AgentRunPanel agentName="kiran" label="Kiran — Pre-call Brief" {...kiranRun} onReset={kiranRun.reset} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="voice-campaign-name">Campaign name</Label>
                <Input id="voice-campaign-name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice-objective">Primary outcome</Label>
                <Input id="voice-objective" value={campaignObjective} onChange={(e) => setCampaignObjective(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice-window">Calling window</Label>
                <select
                  id="voice-window"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={callWindow}
                  onChange={(e) => setCallWindow(e.target.value)}
                >
                  <option>10 AM - 6 PM</option>
                  <option>9 AM - 5 PM</option>
                  <option>11 AM - 7 PM</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice-daily-limit">Daily call limit</Label>
                <select
                  id="voice-daily-limit"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                </select>
              </div>
            </div>

            <div
              className="rounded-[1.35rem] border border-dashed border-orange-300/80 bg-orange-50/60 p-6 text-center transition-colors hover:border-orange-400 dark:border-orange-900/40 dark:bg-orange-950/10"
              onClick={() => document.getElementById('voice-file-upload')?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                void handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
              }}
            >
              <Upload className="mx-auto mb-3 h-10 w-10 text-orange-500" />
              <h3 className="text-base font-semibold text-foreground">Upload contact list</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Excel or CSV with a Phone / Mobile column (name, company, email optional).
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Supports `.xlsx`, `.xls`, `.csv` up to 10MB</p>
              <Input id="voice-file-upload" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { void handleFileUpload(e); }} className="hidden" />
            </div>

            {uploadedFile ? (
              <div className="flex items-center gap-3 rounded-[1.1rem] border border-orange-200/80 bg-orange-50/80 p-4 dark:border-orange-900/40 dark:bg-orange-950/15">
                <CheckCircle2 className="h-5 w-5 text-orange-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{uploadedFile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {parsedLeads.length} dialable contacts · {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-orange-500 text-white hover:bg-orange-600"
                disabled={!campaignReady || isProcessing}
                onClick={() => { void deployVoiceCampaign(); }}
              >
                <Play className="mr-2 h-4 w-4" />
                {isProcessing ? 'Queuing calls…' : 'Launch voice campaign'}
              </Button>
              <Button variant="outline" onClick={() => setShowVoiceLab((prev) => !prev)}>
                <Settings className="mr-2 h-4 w-4" />
                {showVoiceLab ? 'Hide Voice Lab' : 'Open Voice Lab'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowMonitor((prev) => !prev);
                  if (!showMonitor) void refreshLiveCalls();
                }}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                {showMonitor ? 'Hide call monitor' : 'Show call monitor'}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[1.35rem] border-orange-200/70 bg-white/80 dark:border-orange-900/40 dark:bg-white/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mic className="h-4 w-4 text-orange-500" />
                  Voice direction (Sarvam)
                </CardTitle>
                <CardDescription>Same Sarvam voice used on live Twilio calls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="voice-language">Language</Label>
                    <select
                      id="voice-language"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      value={voiceLanguage}
                      onChange={(e) => setVoiceLanguage(e.target.value === 'hi' ? 'hi' : 'en')}
                    >
                      <option value="en">English</option>
                      <option value="hi">Hindi</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voice-gender">Voice</Label>
                    <select
                      id="voice-gender"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      value={voiceGender}
                      onChange={(e) => setVoiceGender(e.target.value === 'male' ? 'male' : 'female')}
                    >
                      <option value="female">{voiceLanguage === 'hi' ? 'Hindi female' : 'English female'}</option>
                      <option value="male">{voiceLanguage === 'hi' ? 'Hindi male' : 'English male'}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="voice-preview-text">Opening line</Label>
                  <Textarea
                    id="voice-preview-text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    className="min-h-[110px]"
                  />
                </div>

                <Button variant="outline" onClick={() => { void previewVoice(); }} disabled={previewLoading || !previewText.trim()}>
                  <Volume2 className="mr-2 h-4 w-4" />
                  {previewLoading ? 'Generating preview…' : 'Preview Sarvam voice'}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[1.35rem] border-border/70 bg-background/90">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-orange-500" />
                  Launch path
                </CardTitle>
                <CardDescription>Parse contacts → check Twilio/Sarvam → queue real outbound calls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={cn(
                      'rounded-[1rem] border px-4 py-3 transition-colors',
                      step.status === 'completed'
                        ? 'border-orange-200/80 bg-orange-50/80 dark:border-orange-900/40 dark:bg-orange-950/15'
                        : step.status === 'processing'
                          ? 'border-orange-300/80 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20'
                          : step.status === 'error'
                            ? 'border-red-200/80 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                            : 'border-border bg-muted/20',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{step.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</div>
                      </div>
                      {step.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 text-orange-500" />
                      ) : step.status === 'processing' ? (
                        <Clock className="h-4 w-4 animate-spin text-orange-500" />
                      ) : null}
                    </div>
                    {typeof step.progress === 'number' && step.status === 'processing' ? <Progress value={step.progress} className="mt-3 h-2" /> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {planCards.map((item) => (
          <Card key={item.title} className="rounded-[1.35rem] border-border/70 bg-background/90">
            <CardContent className="space-y-3 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-200/80 bg-orange-50 text-orange-500 dark:border-orange-900/40 dark:bg-orange-950/20">
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showMonitor ? (
        <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-orange-500" />
                Call monitor
              </CardTitle>
              <CardDescription>Live records from Twilio outbound + Sarvam media stream.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => { void refreshLiveCalls(); }} disabled={monitorLoading}>
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5', monitorLoading && 'animate-spin')} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {monitorMetrics.map((metric) => (
                <div key={metric.label} className="rounded-[1rem] border border-border/70 bg-muted/30 p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{metric.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{metric.label}</div>
                </div>
              ))}
            </div>

            {launchResult?.calls?.length ? (
              <div className="rounded-[1.15rem] border border-border/70 bg-background/80 p-4">
                <h3 className="text-sm font-semibold text-foreground">Last launch batch</h3>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {launchResult.calls.map((row, idx) => (
                    <div key={`${row.phone || 'call'}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm">
                      <span className="font-mono text-foreground">{row.phone || '—'}</span>
                      <span className="text-xs text-muted-foreground">{row.status || (row.error ? 'failed' : '—')}{row.sid ? ` · ${row.sid}` : ''}{row.error ? ` · ${row.error}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.15rem] border border-border/70 bg-background/80 p-4 dark:bg-background/40">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Active / queued</h3>
                  <div className="inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
                    {activeCalls.length} live
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {activeCalls.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active calls yet. Launch a campaign to queue Twilio dials.</p>
                  ) : (
                    activeCalls.slice(0, 12).map((row) => (
                      <div key={row.callSid || `${row.leadPhone}-${row.queuedAt}`} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-3">
                        <div className="h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
                        <div className="min-w-0">
                          <div className="truncate text-sm text-foreground">{row.leadName || row.leadPhone || row.callSid || 'Call'}</div>
                          <div className="text-xs text-muted-foreground">{row.status}{row.campaignId ? ` · ${row.campaignId}` : ''}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[1.15rem] border border-border/70 bg-background/80 p-4 dark:bg-background/40">
                <h3 className="text-sm font-semibold text-foreground">Recent outcomes</h3>
                <div className="mt-4 space-y-3">
                  {(completedCalls.length ? completedCalls : liveCalls).slice(0, 12).map((item) => {
                    const score = item.leadScore ?? item.scorecard?.overallScore
                    const summary = item.summary || item.scorecard?.summary
                    const disposition = item.leadStatus || item.scorecard?.status || item.status || 'unknown'
                    return (
                      <div key={item.callSid || `${item.leadPhone}-${item.updatedAt || item.queuedAt}`} className="rounded-xl border border-border/60 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{item.leadName || item.leadPhone || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground">{item.leadPhone || item.callSid || ''}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs capitalize text-muted-foreground">{disposition}</div>
                            {score != null ? (
                              <div className="text-xs font-semibold text-orange-600">{score}/100</div>
                            ) : null}
                          </div>
                        </div>
                        {summary ? (
                          <p className="mt-2 text-[11px] leading-4 text-muted-foreground line-clamp-3">
                            <span className="mr-1 rounded border border-border/70 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                              AI
                            </span>
                            {summary}
                          </p>
                        ) : null}
                        {item.scorecard?.nextAction ? (
                          <p className="mt-1 text-[11px] text-foreground/80">Next: {item.scorecard.nextAction}</p>
                        ) : null}
                        {(summary || item.scorecard?.overallScore != null) && workspaceId ? (
                          <div className="mt-2 space-y-2">
                            <OutcomeGoLiveCta
                              kind="crm_push"
                              workspaceId={workspaceId}
                              companyId={voiceCompanyId || workspaceId}
                              liveActionLabel="Push to CRM"
                              payload={{
                                lead_name: item.leadName,
                                lead_phone: item.leadPhone,
                                lead_email: item.leadEmail,
                                call_sid: item.callSid,
                                summary,
                                lead_score: score,
                                lead_status: disposition,
                                lead_temperature: item.leadTemperature || item.scorecard?.leadTemperature,
                                scorecard: item.scorecard,
                                turns: item.turns,
                                company: voiceCompanyId,
                              }}
                            />
                            <OutcomeGoLiveCta
                              kind="sheets_push"
                              workspaceId={workspaceId}
                              companyId={voiceCompanyId || workspaceId}
                              liveActionLabel="Push to Sheet"
                              payload={{
                                spreadsheet_title: 'Marqq Voice Outcomes',
                                worksheet_name: 'Calls',
                                source: 'voicebot',
                                lead_name: item.leadName,
                                lead_phone: item.leadPhone,
                                lead_email: item.leadEmail,
                                call_sid: item.callSid,
                                summary,
                                lead_score: score,
                                lead_status: disposition,
                                next_action: item.scorecard?.nextAction,
                                scorecard: item.scorecard,
                                company: voiceCompanyId,
                              }}
                            />
                            <OutcomeGoLiveCta
                              kind="drive_save"
                              workspaceId={workspaceId}
                              companyId={voiceCompanyId || workspaceId}
                              liveActionLabel="Save to Drive"
                              payload={{
                                title: `${item.leadName || item.leadPhone || 'Call'} — voice summary`,
                                folder_name: 'Marqq Exports',
                                lead_name: item.leadName,
                                lead_phone: item.leadPhone,
                                lead_email: item.leadEmail,
                                summary,
                                scorecard: item.scorecard,
                                lead_score: score,
                                lead_status: disposition,
                                call_sid: item.callSid,
                              }}
                            />
                            <OutcomeGoLiveCta
                              kind="drive_share"
                              workspaceId={workspaceId}
                              companyId={voiceCompanyId || workspaceId}
                              liveActionLabel="Share Drive link"
                              payload={{
                                title: `${item.leadName || item.leadPhone || 'Call'} — voice summary`,
                                folder_name: 'Marqq Exports',
                                share_type: 'anyone',
                                role: 'reader',
                                lead_name: item.leadName,
                                lead_phone: item.leadPhone,
                                lead_email: item.leadEmail,
                                summary,
                                scorecard: item.scorecard,
                                call_sid: item.callSid,
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                  {!liveCalls.length ? (
                    <p className="text-sm text-muted-foreground">No persisted call records yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showVoiceLab ? (
        <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-500" />
              Voice Lab
            </CardTitle>
            <CardDescription>
              Sarvam simulator, LiveKit room (Sarvam STT/TTS), and knowledge files — kept out of the launch path.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <VoicebotSimulator />
            <LiveKitVoiceSession />
            <KnowledgeBaseUploader />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
