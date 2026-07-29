import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  approveInterviewStrategySection,
  createGtmModule,
  executeGtmTask,
  generateInterviewStrategySection,
  getExecuteOptions,
  getGtmModule,
  getGtmPrepStatus,
  listGtmModules,
  loadSectionQuestions,
  lockGtmSection,
  patchGtmModule,
  refreshQuestionOptions,
  saveSectionAnswers,
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
  GtmStrategyDocument,
  GtmWizardProgress,
} from '@/types/gtm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GtmStrategyDocumentView } from '@/components/home/GtmStrategyDocumentView';
import { GtmStrategySectionReview } from '@/components/gtm/GtmStrategySectionReview';
import {
  GTM_WIZARD_INTERVIEW_SECTION_IDS,
  interviewGenerateMeta,
  loadGtmAutoSections,
  type GtmAutoSectionDraft,
} from '@/lib/gtmAutoSections';

type WizardPhase = 'prep' | 'interview' | 'sectionReview' | 'execute' | 'strategy' | 'done';

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
  return questions.every((q) => {
    const a = answers[q.id];
    if (!a) return false;
    if (Array.isArray(a.values) && a.values.length > 0) return true;
    return Boolean(String(a.value || '').trim() || String(a.label || '').trim());
  });
}

function parseSelectedValues(answer?: GtmSectionAnswer | null): string[] {
  if (!answer) return [];
  if (Array.isArray(answer.values) && answer.values.length) return answer.values.map(String);
  const raw = String(answer.value || '').trim();
  if (!raw) return [];
  if (raw.includes('||')) return raw.split('||').map((s) => s.trim()).filter(Boolean);
  return [raw];
}

function joinMultiAnswer(values: string[], labels: string[]): GtmSectionAnswer {
  const cleanValues = values.map((v) => String(v || '').trim()).filter(Boolean);
  const cleanLabels = labels.map((l) => String(l || '').trim()).filter(Boolean);
  return {
    value: cleanValues.join('||'),
    label: cleanLabels.join(' · '),
    values: cleanValues,
    labels: cleanLabels,
  };
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
  const lockCtaRef = useRef<HTMLDivElement | null>(null);

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
  const [multiSelected, setMultiSelected] = useState<Array<{ value: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([
    {
      id: 'intro',
      role: 'assistant',
      type: 'text',
      text: 'Answer a few GTM questions. After each section we generate the matching strategy draft for you to review — then assemble the full document.',
    },
  ]);
  const [executeOptions, setExecuteOptions] = useState<GtmExecuteOption[]>([]);
  const [postStrategyOptions, setPostStrategyOptions] = useState<GtmExecuteOption[]>([]);
  const [strategyDoc, setStrategyDoc] = useState<GtmStrategyDocument | null>(null);
  const [strategyMarkdown, setStrategyMarkdown] = useState<string>('');
  const [modules, setModules] = useState<GtmModule[]>([]);
  const [reviewQueue, setReviewQueue] = useState<
    Array<{ id: string; title: string; cta: string; blurb: string }>
  >([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewDraft, setReviewDraft] = useState<GtmAutoSectionDraft | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [approvedDrafts, setApprovedDrafts] = useState<GtmAutoSectionDraft[]>([]);

  const currentQuestion = questions[questionIndex] || null;
  const canLock = useMemo(
    () => questions.length > 0 && sectionAnswersComplete(questions, answers),
    [questions, answers]
  );
  /** Only after the last question is answered — never while mid-section */
  const awaitingLock =
    phase === 'interview' &&
    canLock &&
    questions.length > 0 &&
    questionIndex >= questions.length - 1 &&
    Boolean(answers[questions[questions.length - 1]?.id]);

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

  useEffect(() => {
    if (!awaitingLock) return;
    const id = window.requestAnimationFrame(() => {
      lockCtaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [awaitingLock, sectionId]);

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
        setMultiSelected([]);
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
          const first = data.questions[0];
          if (first.type === 'multi_select' && first.selectedValue) {
            const values = String(first.selectedValue).split('||').map((s) => s.trim()).filter(Boolean);
            const labels = String(first.selectedLabel || first.selectedValue)
              .split(' · ')
              .map((s) => s.trim())
              .filter(Boolean);
            setMultiSelected(
              values.map((value, i) => ({
                value,
                label: labels[i] || value,
              })),
            );
          }
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
        setPostStrategyOptions(data.postStrategyOptions || []);

        if (data.hasStrategy && data.strategy) {
          setStrategyDoc(data.strategy);
          setStrategyMarkdown('');
          setPhase('strategy');
          setSectionId('execute');
          const ga = data.strategy.goalAlignment;
          const targetLine = ga?.quantified_target
            ? ` North star: ${ga.quantified_target}${ga.timeline_target ? ` by ${ga.timeline_target}` : ''}.`
            : '';
          pushChat({
            role: 'assistant',
            type: 'text',
            text: `GTM strategy is locked.${targetLine} Next: marketing ideas (and other plays) reverse-engineered from that target — not a new ICP or strategy.`,
          });
          return;
        }

        setPhase('execute');
        setSectionId('execute');
        pushChat({
          role: 'assistant',
          type: 'text',
          text: 'Inputs complete. Generate the GTM strategy document first — quantified target + timeline become the north star; every section gets measurable sub-goals. Marketing ideas unlock after that.',
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
        text: 'Context ready. We’ll ask only module, offer, audience, and goals — then generate each related strategy section for review.',
      });

      // Persist onboarding auto strategy drafts onto the module profile
      if (workspaceId) {
        const autoDrafts = loadGtmAutoSections(workspaceId);
        if (autoDrafts.length) {
          try {
            sessionStorage.setItem(
              `marqq_gtm_auto_sections_${readyModule.id}`,
              JSON.stringify(autoDrafts),
            );
            const patched = await patchGtmModule(readyModule.id, {
              autoStrategySections: autoDrafts,
            }).catch(() => null);
            if (patched?.module) readyModule = patched.module;
            setApprovedDrafts(autoDrafts);
          } catch {
            /* ignore */
          }
        }
      }

      const order = [...GTM_WIZARD_INTERVIEW_SECTION_IDS];
      const next =
        readyProgress?.currentSectionId &&
        readyProgress.currentSectionId !== 'execute' &&
        (order as readonly string[]).includes(readyProgress.currentSectionId)
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

    if (q.type === 'multi_select') {
      setMultiSelected((prev) => {
        if (prev.some((item) => item.value === value)) {
          return prev.filter((item) => item.value !== value);
        }
        return [...prev, { value, label }];
      });
      return;
    }

    advanceAfterAnswer(q, { value, label });
  };

  const advanceAfterAnswer = (q: GtmInterviewQuestion, answer: GtmSectionAnswer) => {
    const nextAnswers = {
      ...answers,
      [q.id]: answer,
    };
    setAnswers(nextAnswers);
    pushChat({ role: 'user', type: 'text', text: answer.label });

    if (questionIndex < questions.length - 1) {
      const nextIdx = questionIndex + 1;
      const nextQ = questions[nextIdx];
      setQuestionIndex(nextIdx);
      setCustomText('');
      if (nextQ.type === 'multi_select' && nextAnswers[nextQ.id]) {
        const draft = nextAnswers[nextQ.id];
        const values = parseSelectedValues(draft);
        const labels = Array.isArray(draft.labels) && draft.labels.length
          ? draft.labels
          : String(draft.label || '')
              .split(' · ')
              .map((s) => s.trim())
              .filter(Boolean);
        setMultiSelected(
          values.map((value, i) => ({
            value,
            label: labels[i] || (nextQ.options || []).find((opt) => opt.value === value)?.label || value,
          })),
        );
      } else {
        setMultiSelected([]);
      }
      pushChat({
        role: 'assistant',
        type: 'text',
        text: nextQ.question,
      });

      // After timeline (or any prior answer), regenerate quantified options for that window
      if (
        module &&
        sectionId === 'goals' &&
        nextQ.id === 'quantified_target'
      ) {
        void (async () => {
          try {
            await saveSectionAnswers(sectionId, module.id, nextAnswers);
            const refreshed = await refreshQuestionOptions(
              sectionId,
              module.id,
              'quantified_target',
              nextAnswers
            );
            if (refreshed?.options?.length) {
              setQuestions((prev) =>
                prev.map((item) =>
                  item.id === 'quantified_target'
                    ? { ...item, options: refreshed.options }
                    : item
                )
              );
            }
          } catch {
            /* keep prior options */
          }
        })();
      }
    } else {
      setMultiSelected([]);
      pushChat({
        role: 'assistant',
        type: 'system',
        text: 'Section answers ready. Generate the strategy draft to continue.',
      });
    }
  };

  const submitMulti = async () => {
    if (!currentQuestion || currentQuestion.type !== 'multi_select' || !multiSelected.length) return;
    const answer = joinMultiAnswer(
      multiSelected.map((item) => item.value),
      multiSelected.map((item) => item.label),
    );
    advanceAfterAnswer(currentQuestion, answer);
  };

  const submitCustom = async () => {
    if (!currentQuestion || !customText.trim()) return;
    const text = customText.trim();

    if (currentQuestion.type === 'multi_select') {
      const next = [...multiSelected.filter((item) => item.value !== text), { value: text, label: text }];
      const answer = joinMultiAnswer(
        next.map((item) => item.value),
        next.map((item) => item.label),
      );
      setMultiSelected(next);
      advanceAfterAnswer(currentQuestion, answer);
      return;
    }

    advanceAfterAnswer(currentQuestion, { value: text, label: text });
  };

  const currentGenerateMeta = interviewGenerateMeta(sectionId || '');

  const startReviewQueue = async (
    queue: Array<{ id: string; title: string; cta: string; blurb: string }>,
  ) => {
    if (!module || !sectionId) return;
    setReviewQueue(queue);
    setReviewIndex(0);
    setPhase('sectionReview');
    setReviewDraft(null);
    setReviewError(null);
    setReviewLoading(true);
    try {
      const first = queue[0];
      const res = await generateInterviewStrategySection({
        moduleId: module.id,
        interviewSectionId: sectionId,
        strategySectionId: first.id,
        answers,
        priorSections: approvedDrafts,
      });
      setModule(res.module);
      setProgress(res.progress);
      setReviewDraft(res.section);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleGenerateCta = async () => {
    if (!module || !sectionId || sectionId === 'execute' || !canLock) return;
    const meta = interviewGenerateMeta(sectionId);
    if (!meta.outputs.length) {
      setBusy(true);
      try {
        const result = await lockGtmSection(sectionId, module.id, answers);
        setModule(result.module);
        setProgress(result.progress);
        pushChat({
          role: 'assistant',
          type: 'system',
          text: `Saved “${sectionTitle}”.`,
        });
        if (result.nextSectionId === 'execute' || result.progress.allLocked) {
          await enterExecute(result.module);
        } else if (result.nextSectionId) {
          await loadQuestionsFor(result.module, result.nextSectionId);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to continue');
      } finally {
        setBusy(false);
      }
      return;
    }
    pushChat({
      role: 'assistant',
      type: 'system',
      text: `${meta.cta}…`,
    });
    await startReviewQueue(meta.outputs);
  };

  const regenerateCurrentReview = async () => {
    if (!module || !sectionId || !reviewQueue[reviewIndex]) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const target = reviewQueue[reviewIndex];
      const res = await generateInterviewStrategySection({
        moduleId: module.id,
        interviewSectionId: sectionId,
        strategySectionId: target.id,
        answers,
        priorSections: approvedDrafts,
      });
      setModule(res.module);
      setReviewDraft(res.section);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReviewLooksGood = async () => {
    if (!module || !sectionId || !reviewDraft) return;
    setBusy(true);
    try {
      const isLast = reviewIndex >= reviewQueue.length - 1;
      // If AI proposed a north-star, fold it into goals answers before lock
      let nextAnswers = answers;
      if (
        sectionId === 'goals' &&
        (reviewDraft.proposedNorthStar?.trim() || reviewDraft.proposedGoalSystem)
      ) {
        const proposed =
          reviewDraft.proposedNorthStar?.trim() ||
          reviewDraft.proposedGoalSystem?.quantified_target?.trim() ||
          '';
        const existing = answers.quantified_target;
        const weak =
          !existing?.label ||
          /ai_recommend|let marqq|tbd|unset|not sure/i.test(existing.label) ||
          existing.label.length < 4;
        if (proposed && weak) {
          nextAnswers = {
            ...answers,
            quantified_target: { value: 'ai_proposed', label: proposed },
          };
          setAnswers(nextAnswers);
        }
      }
      const result = await approveInterviewStrategySection({
        moduleId: module.id,
        section: { ...reviewDraft, approvedAt: new Date().toISOString() },
        interviewSectionId: sectionId,
        answers: nextAnswers,
        lockInterview: isLast,
      });
      setModule(result.module);
      setProgress(result.progress);
      const nextApproved = [
        ...approvedDrafts.filter((s) => s.id !== reviewDraft.id),
        result.section,
      ];
      setApprovedDrafts(nextApproved);

      if (!isLast) {
        const nextIdx = reviewIndex + 1;
        setReviewIndex(nextIdx);
        setReviewDraft(null);
        setReviewLoading(true);
        setReviewError(null);
        const target = reviewQueue[nextIdx];
        const res = await generateInterviewStrategySection({
          moduleId: result.module.id,
          interviewSectionId: sectionId,
          strategySectionId: target.id,
          answers,
          priorSections: nextApproved,
        });
        setModule(res.module);
        setReviewDraft(res.section);
        setReviewLoading(false);
        return;
      }

      setPhase('interview');
      setReviewQueue([]);
      setReviewDraft(null);
      pushChat({
        role: 'assistant',
        type: 'system',
        text: `Approved strategy drafts for “${sectionTitle}”.`,
      });

      if (result.nextSectionId === 'execute' || result.allLocked) {
        await enterExecute(result.module);
      } else if (result.nextSectionId) {
        await loadQuestionsFor(result.module, result.nextSectionId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve section');
      setReviewLoading(false);
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

      if (result.kind === 'document' || opt.id === 'gtm_strategy_doc' || opt.kind === 'document') {
        if (!result.strategy) throw new Error('Strategy document missing from response');
        setStrategyDoc(result.strategy);
        setStrategyMarkdown(result.markdown || '');
        setModule(result.module);
        setPostStrategyOptions(result.postStrategyOptions || []);
        setPhase('strategy');
        const ga = result.strategy.goalAlignment;
        const targetLine = ga?.quantified_target
          ? ` North star locked: ${ga.quantified_target}${ga.timeline_target ? ` by ${ga.timeline_target}` : ''}.`
          : '';
        pushChat({
          role: 'assistant',
          type: 'text',
          text: `GTM strategy ready.${targetLine} Executive summary is open; sidebar channels hold each section’s contribution to that goal. Next step: marketing ideas grounded in this strategy.`,
        });
        return;
      }

      pushChat({
        role: 'assistant',
        type: 'text',
        text: `Starting “${opt.title}” from your locked strategy + quantified target.`,
      });
      setPhase('done');
      sessionStorage.removeItem('marqq_gtm_wizard_pending');
      if (!result.agentTarget) throw new Error('Missing agent target for task');
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
              Answer module, offer, audience, and goals — generate each strategy draft for review, then
              assemble the full GTM document.
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
        <div
          ref={scrollRef}
          className={cn(
            'space-y-3 overflow-y-auto rounded-md border p-3',
            awaitingLock ? 'max-h-[160px]' : 'h-[220px]'
          )}
        >
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

        {phase === 'interview' && awaitingLock && (
          <div
            ref={lockCtaRef}
            className="sticky bottom-0 z-10 space-y-3 rounded-lg border border-foreground/15 bg-background/95 p-3 shadow-sm backdrop-blur"
          >
            <div>
              <p className="text-sm font-medium">{sectionTitle} answers ready</p>
              <p className="text-sm text-muted-foreground">
                {currentGenerateMeta.outputs.length
                  ? 'Generate the strategy draft from these answers, review it like Brand DNA, then continue.'
                  : 'Continue to the next set of questions.'}
              </p>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {questions.map((q) => (
                <li key={q.id} className="truncate">
                  <span className="font-medium text-foreground">{answers[q.id]?.label || '—'}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="w-full"
              disabled={busy || !canLock}
              onClick={() => void handleGenerateCta()}
            >
              {currentGenerateMeta.cta}
            </Button>
          </div>
        )}

        {phase === 'interview' && currentQuestion && !awaitingLock && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">
                {sectionTitle} · Q{questionIndex + 1}/{questions.length}
                {currentQuestion.type === 'multi_select' ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">Multi-select</span>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {currentQuestion.helperText ||
                  (currentQuestion.type === 'multi_select'
                    ? 'Select all that apply, or type your own.'
                    : 'Pick an option, or type your own.')}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(currentQuestion.options || []).slice(0, 4).map((opt) => {
                const selected =
                  currentQuestion.type === 'multi_select'
                    ? multiSelected.some((item) => item.value === opt.value)
                    : answers[currentQuestion.id]?.value === opt.value;
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
            {currentQuestion.type === 'multi_select' && multiSelected.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Selected: {multiSelected.map((item) => item.label).join(' · ')}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Type your own"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitCustom();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !customText.trim()}
                onClick={() => void submitCustom()}
              >
                {currentQuestion.type === 'multi_select' ? 'Add & continue' : 'Use'}
              </Button>
            </div>
            {currentQuestion.type === 'multi_select' ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy || multiSelected.length === 0}
                onClick={() => void submitMulti()}
              >
                Continue with selected
              </Button>
            ) : null}
          </div>
        )}

        {phase === 'execute' && (
          <div className="space-y-3">
            {(executeOptions.filter((o) => o.id === 'gtm_strategy_doc').length
              ? executeOptions.filter((o) => o.id === 'gtm_strategy_doc')
              : [
                  {
                    id: 'gtm_strategy_doc',
                    title: 'Generate GTM strategy document',
                    description:
                      'Assemble all approved sections into one document with a quantified north-star target, section sub-goals, and Slack-style strategy channels.',
                    recommended: true,
                    kind: 'document' as const,
                    agentTarget: null,
                  },
                ]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => void handleExecute(opt)}
                className="w-full rounded-lg border border-orange-400/50 bg-orange-500/[0.06] p-4 text-left transition hover:border-orange-400"
              >
                <p className="text-sm font-semibold">{opt.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
              </button>
            ))}
          </div>
        )}

        {phase === 'sectionReview' && reviewQueue[reviewIndex] && (
        <GtmStrategySectionReview
          overlay
          title={reviewQueue[reviewIndex].title}
          blurb={reviewQueue[reviewIndex].blurb}
          stepLabel={`Strategy draft · ${reviewIndex + 1}/${reviewQueue.length}`}
          draft={reviewDraft}
          loading={reviewLoading}
          error={reviewError}
          onRetry={() => void regenerateCurrentReview()}
          onChange={setReviewDraft}
          onBack={() => {
            setPhase('interview');
            setReviewQueue([]);
            setReviewDraft(null);
          }}
          onLooksGood={() => void handleReviewLooksGood()}
        />
      )}

      {phase === 'strategy' && strategyDoc && module && (
        <div className="space-y-4">
          {strategyDoc.goalAlignment?.quantified_target ||
          strategyDoc.goalAlignment?.north_star_metric ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium">
                {strategyDoc.goalAlignment.north_star_metric || 'North-star target'}
              </p>
              {strategyDoc.goalAlignment.metric_definition ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {strategyDoc.goalAlignment.metric_definition}
                </p>
              ) : null}
              <p className="mt-1 text-muted-foreground">
                {strategyDoc.goalAlignment.quantified_target}
                {strategyDoc.goalAlignment.timeline_target
                  ? ` · by ${strategyDoc.goalAlignment.timeline_target}`
                  : ''}
              </p>
              {strategyDoc.goalAlignment.business_archetype ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Archetype: {strategyDoc.goalAlignment.business_archetype}
                </p>
              ) : null}
              {(strategyDoc.goalAlignment.sectionTargets || []).length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {strategyDoc.goalAlignment.sectionTargets!.slice(0, 6).map((t) => (
                    <li key={t.sectionId}>
                      {t.sectionId}: {t.contribution || t.metric}
                      {t.byWhen ? ` (${t.byWhen})` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <GtmStrategyDocumentView
            moduleId={module.id}
            workspaceId={workspaceId || module.workspace_id || module.company_id}
            strategy={strategyDoc}
            markdown={strategyMarkdown}
            onBack={() => {
              setPhase('execute');
              setStrategyDoc(null);
            }}
            onStrategyUpdate={(doc) => setStrategyDoc(doc)}
          />

          {(postStrategyOptions.length
            ? postStrategyOptions
            : [
                {
                  id: 'marketing_ideas',
                  title: 'Marketing ideas',
                  description:
                    'Catalog ideas reverse-engineered from your quantified GTM target and locked strategy.',
                  agentTarget: 'company_intel_marketing_ideas' as AgentTarget,
                  kind: 'agent' as const,
                },
              ]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => void handleExecute(opt)}
              className="w-full rounded-lg border border-violet-400/40 bg-violet-500/[0.06] p-4 text-left transition hover:border-violet-400"
            >
              <p className="text-sm font-semibold">{opt.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
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
