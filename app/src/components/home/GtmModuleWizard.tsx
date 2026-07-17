import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  createGtmModule,
  executeGtmTask,
  getExecuteOptions,
  getGtmModule,
  getGtmPrepStatus,
  listGtmModules,
  loadSectionQuestions,
  lockGtmSection,
  patchGtmModule,
  startGtmPrep,
  unlockGtmSection,
} from '@/services/gtmModuleService';
import type {
  AgentTarget,
  GtmDeployRequest,
  GtmExecuteOption,
  GtmInterviewQuestion,
  GtmModule,
  GtmSectionAnswer,
  GtmWizardProgress,
} from '@/types/gtm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type WizardPhase = 'prep' | 'interview' | 'execute' | 'done';

type ChatLine =
  | { id: string; role: 'assistant' | 'user'; type: 'text'; text: string }
  | { id: string; role: 'assistant'; type: 'system'; text: string };

function onboardingCtx(workspaceId?: string | null) {
  if (!workspaceId) return {};
  try {
    const raw = localStorage.getItem(`marqq_onboarding_ctx_${workspaceId}`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function sectionAnswersComplete(
  questions: GtmInterviewQuestion[],
  answers: Record<string, GtmSectionAnswer>
) {
  return questions.every((q) => Boolean(answers[q.id]?.value || answers[q.id]?.label));
}

interface GtmModuleWizardProps {
  onDeployAgent: (req: GtmDeployRequest) => void;
  forceNewModule?: boolean;
  onForceNewConsumed?: () => void;
}

export function GtmModuleWizard({
  onDeployAgent,
  forceNewModule = false,
  onForceNewConsumed,
}: GtmModuleWizardProps) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<WizardPhase>('prep');
  const [prepMessage, setPrepMessage] = useState('Preparing your GTM brief…');
  const [module, setModule] = useState<GtmModule | null>(null);
  const [progress, setProgress] = useState<GtmWizardProgress | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [sectionTitle, setSectionTitle] = useState('');
  const [questions, setQuestions] = useState<GtmInterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, GtmSectionAnswer>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([
    {
      id: 'intro',
      role: 'assistant',
      type: 'text',
      text: 'We will build a go-to-market profile step by step. Agents stay quiet until you lock each section and pick one task to run.',
    },
  ]);
  const [executeOptions, setExecuteOptions] = useState<GtmExecuteOption[]>([]);
  const [modules, setModules] = useState<GtmModule[]>([]);

  const currentQuestion = questions[questionIndex] || null;
  const canLock = useMemo(
    () => questions.length > 0 && sectionAnswersComplete(questions, answers),
    [questions, answers]
  );

  const pushChat = useCallback((line: Omit<ChatLine, 'id'> & { id?: string }) => {
    setChat((prev) => {
      const id = line.id || `${Date.now()}-${prev.length}`
      const next: ChatLine =
        line.type === 'system'
          ? { id, role: 'assistant', type: 'system', text: line.text }
          : { id, role: line.role, type: 'text', text: line.text }
      return [...prev, next]
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, questions, questionIndex, executeOptions]);

  const loadQuestionsFor = useCallback(
    async (mod: GtmModule, nextSection: string) => {
      setBusy(true);
      try {
        const data = await loadSectionQuestions(nextSection, mod.id);
        setModule(mod);
        setProgress(data.progress);
        setSectionId(data.sectionId);
        setSectionTitle(data.title);
        setQuestions(data.questions);
        const seeded: Record<string, GtmSectionAnswer> = {};
        for (const q of data.questions) {
          if (q.selectedValue) {
            seeded[q.id] = {
              value: q.selectedValue,
              label: q.selectedLabel || q.selectedValue,
            };
          }
        }
        setAnswers(seeded);
        setQuestionIndex(0);
        setCustomText('');
        setPhase('interview');
        pushChat({
          role: 'assistant',
          type: 'system',
          text: `Section: ${data.title} — ${data.description}`,
        });
        if (data.questions[0]) {
          pushChat({
            role: 'assistant',
            type: 'text',
            text: data.questions[0].question,
          });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load questions');
      } finally {
        setBusy(false);
      }
    },
    [pushChat]
  );

  const enterExecute = useCallback(
    async (mod: GtmModule) => {
      setBusy(true);
      try {
        const data = await getExecuteOptions(mod.id);
        setModule(mod);
        setProgress(data.progress);
        setExecuteOptions(data.options);
        setPhase('execute');
        setSectionId('execute');
        pushChat({
          role: 'assistant',
          type: 'text',
          text: 'Profile locked. Pick one task to run — only that agent workflow will start.',
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load execute options');
      } finally {
        setBusy(false);
      }
    },
    [pushChat]
  );

  const bootstrap = useCallback(async () => {
    if (!workspaceId || !user?.id) return;
    setBusy(true);
    setPhase('prep');

    const ctx = onboardingCtx(workspaceId);
    const companyName = ctx.company || activeWorkspace?.name || 'Company';
    const websiteUrl = ctx.websiteUrl || activeWorkspace?.website_url || '';

    setPrepMessage(`Preparing your GTM brief from ${companyName}…`);
    pushChat({
      role: 'assistant',
      type: 'system',
      text: `Ingesting context for ${companyName}${websiteUrl ? ` (${websiteUrl})` : ''}…`,
    });

    try {
      const wantNew =
        forceNewModule || sessionStorage.getItem('marqq_gtm_force_new_module') === '1';
      if (wantNew) {
        sessionStorage.removeItem('marqq_gtm_force_new_module');
        onForceNewConsumed?.();
      }

      // Prefer attaching crawl to a dedicated module when forcing a new one
      let targetModuleId: string | null = null;
      if (wantNew) {
        const created = await createGtmModule({
          workspaceId,
          userId: user.id,
          name: `${companyName} — Module`,
          moduleType: 'product',
          sourceContext: { onboarding: ctx },
          active: true,
        });
        targetModuleId = created.module.id;
        setModule(created.module);
        setProgress(created.progress);
      }

      // Idempotent: if Compound already started at onboarding URL step, server
      // dedupes the crawl and merges full onboarding ctx into the in-flight prep.
      if (sessionStorage.getItem('marqq_gtm_prep_started') === '1' && !wantNew) {
        setPrepMessage(`Finishing site research for ${companyName}…`);
      }
      await startGtmPrep({
        workspaceId,
        userId: user.id,
        websiteUrl: websiteUrl || undefined,
        companyName,
        onboarding: ctx,
        moduleId: targetModuleId,
      });

      let readyModule: GtmModule | null = null;
      let readyProgress: GtmWizardProgress | null = null;

      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await getGtmPrepStatus(workspaceId);
        const mods = await listGtmModules({ workspaceId });
        setModules(mods);

        if (targetModuleId) {
          const mine = mods.find((m) => m.id === targetModuleId);
          if (
            mine?.source_context &&
            typeof mine.source_context === 'object' &&
            'prepared_at' in mine.source_context
          ) {
            readyModule = mine;
            readyProgress = {
              ...(status.progress || {
                sections: [],
                currentSectionId: 'module',
                allLocked: false,
                status: mine.status,
              }),
              currentSectionId: 'module',
              allLocked: false,
              status: mine.status,
            };
            break;
          }
        } else {
          const resumable = mods.find(
            (m) =>
              m.source_context &&
              typeof m.source_context === 'object' &&
              'prepared_at' in m.source_context &&
              (m.status === 'in_progress' || m.status === 'draft' || m.status === 'ready')
          );
          if (resumable) {
            readyModule = resumable;
            readyProgress = status.progress;
            break;
          }
          if (status.ready && status.module) {
            readyModule = status.module;
            readyProgress = status.progress;
            break;
          }
        }
        if (i === 8) setPrepMessage('Still reading your site — almost there…');
      }

      if (!readyModule) {
        if (targetModuleId) {
          const { module, progress } = await getGtmModule(targetModuleId).catch(() => ({
            module: null as GtmModule | null,
            progress: null as GtmWizardProgress | null,
          }));
          if (module) {
            readyModule = module;
            readyProgress = progress;
          }
        }
      }

      if (!readyModule) {
        const created = await createGtmModule({
          workspaceId,
          userId: user.id,
          name: companyName,
          moduleType: 'product',
          sourceContext: { onboarding: ctx, prepared_at: new Date().toISOString() },
          active: true,
        });
        readyModule = created.module;
        readyProgress = created.progress;
        pushChat({
          role: 'assistant',
          type: 'system',
          text: 'Site crawl timed out — continuing with onboarding inputs only.',
        });
      }

      setModule(readyModule);
      setProgress(readyProgress);
      const mods = await listGtmModules({ workspaceId });
      setModules(mods);

      pushChat({
        role: 'assistant',
        type: 'text',
        text: 'Context ready. Let’s lock your GTM module profile section by section.',
      });

      const order = ['module', 'offer', 'audience', 'problem', 'positioning', 'goals'];
      const next =
        readyProgress?.currentSectionId && readyProgress.currentSectionId !== 'execute'
          ? readyProgress.currentSectionId
          : order.find((id) => !readyModule?.section_state?.[id]?.locked) || null;

      if (!next || readyProgress?.allLocked || readyModule.status === 'ready') {
        const lockedCount = order.filter((id) => readyModule?.section_state?.[id]?.locked).length;
        if (lockedCount >= order.length) {
          await enterExecute(readyModule);
          return;
        }
      }

      await loadQuestionsFor(readyModule, next || 'module');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GTM prep failed');
      setPrepMessage('Could not prepare context. Retry or continue from onboarding answers.');
      pushChat({
        role: 'assistant',
        type: 'text',
        text: 'Prep hit an error. Use Retry prep below.',
      });
    } finally {
      setBusy(false);
    }
  }, [
    workspaceId,
    user?.id,
    activeWorkspace?.name,
    activeWorkspace?.website_url,
    forceNewModule,
    onForceNewConsumed,
    pushChat,
    loadQuestionsFor,
    enterExecute,
  ]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once per workspace / forceNew
  }, [workspaceId, user?.id, forceNewModule]);

  const selectOption = async (q: GtmInterviewQuestion, value: string, label: string) => {
    if (!module || !sectionId || busy) return;
    const nextAnswers = {
      ...answers,
      [q.id]: { value, label },
    };
    setAnswers(nextAnswers);
    pushChat({ role: 'user', type: 'text', text: label });

    if (questionIndex < questions.length - 1) {
      const nextIdx = questionIndex + 1;
      setQuestionIndex(nextIdx);
      setCustomText('');
      pushChat({
        role: 'assistant',
        type: 'text',
        text: questions[nextIdx].question,
      });
    } else {
      pushChat({
        role: 'assistant',
        type: 'system',
        text: 'Section complete. Lock it to continue to the next section.',
      });
    }
  };

  const submitCustom = async () => {
    if (!currentQuestion || !customText.trim()) return;
    await selectOption(currentQuestion, customText.trim(), customText.trim());
  };

  const handleLock = async () => {
    if (!module || !sectionId || sectionId === 'execute' || !canLock) return;
    setBusy(true);
    try {
      const result = await lockGtmSection(sectionId, module.id, answers);
      setModule(result.module);
      setProgress(result.progress);
      pushChat({
        role: 'assistant',
        type: 'system',
        text: `Locked “${sectionTitle}”.`,
      });
      toast.success(`${sectionTitle} locked`);

      if (result.nextSectionId === 'execute' || result.progress.allLocked) {
        await enterExecute(result.module);
      } else if (result.nextSectionId) {
        await loadQuestionsFor(result.module, result.nextSectionId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to lock section');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockLast = async () => {
    if (!module || !progress) return;
    const locked = [...progress.sections].reverse().find((s) => s.locked);
    if (!locked) return;
    setBusy(true);
    try {
      const result = await unlockGtmSection(locked.id, module.id);
      setModule(result.module);
      setProgress(result.progress);
      await loadQuestionsFor(result.module, locked.id);
      toast.message(`Unlocked ${locked.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExecute = async (opt: GtmExecuteOption) => {
    if (!module) return;
    setBusy(true);
    try {
      const result = await executeGtmTask(module.id, opt.id);
      pushChat({
        role: 'user',
        type: 'text',
        text: `Run: ${opt.title}`,
      });
      pushChat({
        role: 'assistant',
        type: 'text',
        text: `Starting “${opt.title}”. Opening the workflow with your locked module profile.`,
      });
      setPhase('done');
      sessionStorage.removeItem('marqq_gtm_wizard_pending');
      onDeployAgent({
        target: result.agentTarget as AgentTarget,
        companyId: module?.company_id || null,
        context: result.deployContext,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAddModule = async () => {
    sessionStorage.setItem('marqq_gtm_force_new_module', '1');
    window.location.reload();
  };

  const handleSwitchModule = async (id: string) => {
    setBusy(true);
    try {
      const result = await patchGtmModule(id, { active: true });
      setModule(result.module);
      setProgress(result.progress);
      const mods = workspaceId ? await listGtmModules({ workspaceId }) : [];
      setModules(mods);
      if (result.progress.allLocked) await enterExecute(result.module);
      else {
        const next = result.progress.currentSectionId || 'module';
        if (next === 'execute') await enterExecute(result.module);
        else await loadQuestionsFor(result.module, next);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Switch failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/80" data-tour="gtm-module-wizard">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">GTM Wizard</CardTitle>
            <CardDescription>
              Sequential profile for {module?.name || activeWorkspace?.name || 'your offer'} — lock
              each section, then run one task.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleAddModule()}>
              Add module
            </Button>
            {progress?.sections.some((s) => s.locked) && phase === 'interview' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleUnlockLast()}
              >
                Unlock last
              </Button>
            )}
          </div>
        </div>

        {modules.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={m.id === module?.id ? 'default' : 'outline'}
                disabled={busy || m.id === module?.id}
                onClick={() => void handleSwitchModule(m.id)}
              >
                {m.name}
                {m.active ? ' · active' : ''}
              </Button>
            ))}
          </div>
        )}

        {progress && (
          <div className="space-y-2" data-tour="gtm-section-progress">
            <p className="text-xs font-medium text-muted-foreground">
              Progress ·{' '}
              {progress.sections.filter((s) => s.locked).length}/{progress.sections.length} sections
              locked
              {phase === 'execute' || phase === 'done' ? ' · Execute' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {progress.sections.map((s, i) => {
                const isCurrent = sectionId === s.id && phase === 'interview';
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs',
                      s.locked && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                      isCurrent && 'border-foreground bg-muted',
                      !s.locked && !isCurrent && 'border-border text-muted-foreground'
                    )}
                  >
                    {i + 1}. {s.title}
                    {s.locked ? ' ✓' : isCurrent ? ' ·' : ''}
                  </div>
                );
              })}
              <div
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs',
                  phase === 'execute' || phase === 'done'
                    ? 'border-foreground bg-muted'
                    : 'border-border text-muted-foreground'
                )}
              >
                Execute
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div ref={scrollRef} className="h-[280px] space-y-3 overflow-y-auto rounded-md border p-3">
          {chat.map((line) => (
            <div
              key={line.id}
              className={cn(
                'max-w-[92%] rounded-lg px-3 py-2 text-sm',
                line.role === 'user' && 'ml-auto bg-primary text-primary-foreground',
                line.role === 'assistant' && line.type === 'text' && 'bg-muted',
                line.type === 'system' && 'w-full max-w-full bg-transparent text-xs text-muted-foreground'
              )}
            >
              {line.text}
            </div>
          ))}
          {phase === 'prep' && (
            <div className="animate-pulse text-sm text-muted-foreground">{prepMessage}</div>
          )}
        </div>

        {phase === 'interview' && currentQuestion && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">
                {sectionTitle} · Q{questionIndex + 1}/{questions.length}
              </p>
              <p className="text-sm text-muted-foreground">{currentQuestion.helperText}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(currentQuestion.options || []).slice(0, 4).map((opt) => {
                const selected = answers[currentQuestion.id]?.value === opt.value;
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    className="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                    disabled={busy}
                    onClick={() => void selectOption(currentQuestion, opt.value, opt.label)}
                  >
                    <span>
                      {opt.label}
                      {opt.recommended ? (
                        <span className="mt-1 block text-[10px] uppercase tracking-wide opacity-70">
                          Suggested
                        </span>
                      ) : null}
                    </span>
                  </Button>
                );
              })}
            </div>
            {currentQuestion.allowCustomAnswer !== false && (
              <div className="flex gap-2">
                <Input
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Other — type your own"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitCustom();
                    }
                  }}
                />
                <Button type="button" variant="secondary" disabled={busy || !customText.trim()} onClick={() => void submitCustom()}>
                  Use
                </Button>
              </div>
            )}
            <Button
              type="button"
              className="w-full"
              disabled={busy || !canLock}
              onClick={() => void handleLock()}
            >
              Lock {sectionTitle || 'section'}
            </Button>
          </div>
        )}

        {phase === 'execute' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {executeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => void handleExecute(opt)}
                className={cn(
                  'rounded-lg border p-3 text-left transition hover:border-foreground',
                  opt.recommended && 'border-foreground bg-muted/40'
                )}
              >
                <p className="text-sm font-semibold">{opt.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
                {opt.recommended && (
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Recommended
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {phase === 'done' && (
          <p className="text-sm text-muted-foreground">
            Task launched. Add another module anytime to run a separate GTM profile.
          </p>
        )}

        {phase === 'prep' && !busy && (
          <Button type="button" onClick={() => void bootstrap()}>
            Retry prep
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
