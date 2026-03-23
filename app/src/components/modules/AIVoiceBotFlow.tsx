import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Mic,
  MessageSquare,
  PhoneCall,
  Play,
  Settings,
  Sparkles,
  Upload,
  Volume2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { AgentRunPanel } from '@/components/agent/AgentRunPanel';
import { CompanySelector } from '@/components/agent/CompanySelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useAgentRun } from '@/hooks/useAgentRun';
import { AgentService } from '@/services/agentService';
import { cn } from '@/lib/utils';

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
    title: 'Script prepared',
    description: 'AI generates the outreach structure and objection handling.',
    status: 'pending',
  },
  {
    id: 'bot',
    title: 'Bot configured',
    description: 'Voice settings, knowledge, and fallback logic are validated.',
    status: 'pending',
  },
  {
    id: 'launch',
    title: 'Campaign launched',
    description: 'The voice campaign is ready to run and monitor.',
    status: 'pending',
  },
];

export function AIVoiceBotFlow({ autoStart = false }: AIVoiceBotFlowProps) {
  const kiranRun = useAgentRun();

  const [voiceCompanyId, setVoiceCompanyId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
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
  const [showMonitorPreview, setShowMonitorPreview] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);

  const uploadReady = Boolean(uploadedFile);
  const campaignReady = uploadReady && Boolean(campaignName.trim()) && Boolean(campaignObjective.trim());

  useEffect(() => {
    if (!autoStart || isProcessing || uploadedFile) return;
    const file = new File(['sample'], 'contact-list.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    setUploadedFile(file);
    setSteps((prev) => prev.map((step, index) => (index === 0 ? { ...step, status: 'completed', progress: 100 } : step)));
    const timer = window.setTimeout(() => {
      void deployVoiceCampaign();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [autoStart, isProcessing, uploadedFile]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps((prev) => prev.map((step, index) => (index === stepIndex ? { ...step, status, progress } : step)));
  };

  const deployVoiceCampaign = async () => {
    if (!campaignReady) {
      toast.error('Add a contact list and campaign brief before launching.');
      return;
    }

    setIsProcessing(true);
    setShowMonitorPreview(true);

    try {
      const contentAgent = AgentService.getAgents().find((agent) => agent.role.includes('Content'));
      if (contentAgent) {
        await AgentService.executeTask(contentAgent.id, {
          type: 'content_generation',
          description: 'Generate personalized voice bot scripts for calling campaign',
          input: {
            contentType: 'voice_script',
            topic: campaignObjective,
            audience: { segment: 'Outbound voice prospects' },
            tone: 'Professional & conversational',
          },
        });
      }

      for (let i = 0; i < INITIAL_STEPS.length; i += 1) {
        updateStepStatus(i, 'processing', 0);
        for (let progress = 0; progress <= 100; progress += 25) {
          updateStepStatus(i, 'processing', progress);
          await new Promise((resolve) => setTimeout(resolve, 220));
        }
        updateStepStatus(i, 'completed', 100);
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      toast.success('Voice campaign is ready.');
    } catch (error) {
      const firstIncomplete = steps.findIndex((step) => step.status !== 'completed');
      updateStepStatus(firstIncomplete >= 0 ? firstIncomplete : 0, 'error');
      toast.error('Voice campaign setup failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploadedFile(file);
    updateStepStatus(0, 'completed', 100);
    toast.success(`${file.name} uploaded`);
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
      toast.success('Playing voice preview');
    } catch (err: any) {
      toast.error(err?.message || 'Voice preview failed');
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

  const projectedMetrics = [
    { label: 'Daily calls', value: dailyLimit },
    { label: 'Expected connect rate', value: '15-19%' },
    { label: 'Live meetings', value: '10-14 / week' },
  ];

  const planCards = [
    {
      title: 'What you launch',
      copy: 'A voice campaign with the script, calling window, and campaign guardrails already shaped.',
      icon: PhoneCall,
    },
    {
      title: 'What the bot handles',
      copy: 'Opening, qualification, objection handling, and meeting-booking logic in one flow.',
      icon: Bot,
    },
    {
      title: 'What you review',
      copy: 'Call quality, conversion signals, and the most recent outcomes after launch.',
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            Voice Campaigns
          </div>
          <div className="space-y-2">
            <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
              Launch outbound voice without the operator mess
            </h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Set the campaign brief, preview the voice, and launch the outreach flow. Testing and realtime controls stay available in the lab, not in the way.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Readiness:</span> <span className="font-medium text-foreground">{stepCompletion}%</span></div>
            <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm"><span className="text-muted-foreground">Flow:</span> <span className="font-medium text-foreground">Brief → Voice → Launch</span></div>
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
                  <p className="text-sm text-muted-foreground">Define the campaign once, then launch from a single screen.</p>
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
                handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
              }}
            >
              <Upload className="mx-auto mb-3 h-10 w-10 text-orange-500" />
              <h3 className="text-base font-semibold text-foreground">Upload contact list</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add the calling list once. Use Excel or CSV with phone numbers and basic contact fields.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Supports `.xlsx`, `.xls`, `.csv` up to 10MB</p>
              <Input id="voice-file-upload" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
            </div>

            {uploadedFile ? (
              <div className="flex items-center gap-3 rounded-[1.1rem] border border-orange-200/80 bg-orange-50/80 p-4 dark:border-orange-900/40 dark:bg-orange-950/15">
                <CheckCircle2 className="h-5 w-5 text-orange-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{uploadedFile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB · contact list ready
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-orange-500 text-white hover:bg-orange-600"
                disabled={!campaignReady || isProcessing}
                onClick={deployVoiceCampaign}
              >
                <Play className="mr-2 h-4 w-4" />
                {isProcessing ? 'Preparing launch…' : 'Launch voice campaign'}
              </Button>
              <Button variant="outline" onClick={() => setShowVoiceLab((prev) => !prev)}>
                <Settings className="mr-2 h-4 w-4" />
                {showVoiceLab ? 'Hide Voice Lab' : 'Open Voice Lab'}
              </Button>
              <Button variant="outline" onClick={() => setShowMonitorPreview((prev) => !prev)}>
                <BarChart3 className="mr-2 h-4 w-4" />
                {showMonitorPreview ? 'Hide monitor preview' : 'Show monitor preview'}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[1.35rem] border-orange-200/70 bg-white/80 dark:border-orange-900/40 dark:bg-white/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mic className="h-4 w-4 text-orange-500" />
                  Voice direction
                </CardTitle>
                <CardDescription>Pick the voice and hear the opening before launch.</CardDescription>
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

                <Button variant="outline" onClick={previewVoice} disabled={previewLoading || !previewText.trim()}>
                  <Volume2 className="mr-2 h-4 w-4" />
                  {previewLoading ? 'Generating preview…' : 'Preview voice'}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[1.35rem] border-border/70 bg-background/90">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-orange-500" />
                  Launch path
                </CardTitle>
                <CardDescription>A cleaner four-step flow instead of six noisy tabs.</CardDescription>
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

      {showMonitorPreview ? (
        <Card className="rounded-[1.5rem] border-border/70 bg-background/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-orange-500" />
              Monitor preview
            </CardTitle>
            <CardDescription>What the campaign desk looks like once calls start running.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {projectedMetrics.map((metric) => (
                <div key={metric.label} className="rounded-[1rem] border border-border/70 bg-muted/30 p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{metric.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{metric.label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.15rem] border border-border/70 bg-background/80 p-4 dark:bg-background/40">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Live activity</h3>
                  <div className="inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
                    3 active calls
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    'Rajesh Sharma · discussing pain points',
                    'Priya Patel · in value proposition phase',
                    'Amit Gupta · scheduling meeting',
                  ].map((row) => (
                    <div key={row} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-3">
                      <div className="h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
                      <div className="text-sm text-foreground">{row}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.15rem] border border-border/70 bg-background/80 p-4 dark:bg-background/40">
                <h3 className="text-sm font-semibold text-foreground">Recent outcomes</h3>
                <div className="mt-4 space-y-3">
                  {[
                    { name: 'Neha Singh', outcome: 'Meeting scheduled' },
                    { name: 'Vikram Agarwal', outcome: 'Follow-up needed' },
                    { name: 'Kavya Reddy', outcome: 'Not interested' },
                  ].map((item) => (
                    <div key={item.name} className="rounded-xl border border-border/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.outcome}</div>
                      </div>
                    </div>
                  ))}
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
              Realtime session controls, simulator, and knowledge files live here so they do not overload the launch path.
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
