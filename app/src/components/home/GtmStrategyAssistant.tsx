import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { generateGtmInterviewPlan, generateGtmStrategy } from '@/services/gtmStrategyService';
import type { AgentTarget, GtmInterviewPlan, GtmInterviewQuestion, GtmStrategyResponse } from '@/types/gtm';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiChat as Bot, HiRefresh as Refresh, HiSparkles as Sparkles } from 'react-icons/hi';
import { toast } from 'sonner';

const GTM_STORAGE_KEY = 'martech_gtm_state';

const DEFAULT_INTRO_CHAT: ChatLine[] = [
  {
    id: 'intro',
    role: 'assistant',
    type: 'text',
    text:
      'Tell me what you want to launch. I’ll ask you 5–6 questions one at a time; answer each and I’ll draft a GTM strategy you can execute with agents.',
  },
];

function loadGtmState(): {
  chat: ChatLine[];
  plan: GtmInterviewPlan | null;
  questionIndex: number;
  answers: Record<string, unknown>;
  prompt: string;
  strategy: GtmStrategyResponse | null;
} {
  try {
    const raw = sessionStorage.getItem(GTM_STORAGE_KEY);
    if (!raw) return { chat: DEFAULT_INTRO_CHAT, plan: null, questionIndex: 0, answers: {}, prompt: '', strategy: null };
    const data = JSON.parse(raw) as {
      chat?: ChatLine[];
      plan?: GtmInterviewPlan | null;
      questionIndex?: number;
      answers?: Record<string, unknown>;
      prompt?: string;
      strategy?: GtmStrategyResponse | null;
    };
    const plan = data.plan ?? null;
    const questionsLength = plan?.questions?.length ?? 1;
    return {
      chat: Array.isArray(data.chat) && data.chat.length > 0 ? data.chat : DEFAULT_INTRO_CHAT,
      plan,
      questionIndex: typeof data.questionIndex === 'number' ? Math.min(data.questionIndex, questionsLength - 1) : 0,
      answers: data.answers && typeof data.answers === 'object' ? data.answers : {},
      prompt: typeof data.prompt === 'string' ? data.prompt : '',
      strategy: data.strategy ?? null,
    };
  } catch {
    return { chat: DEFAULT_INTRO_CHAT, plan: null, questionIndex: 0, answers: {}, prompt: '', strategy: null };
  }
}

type ChatLine =
  | { id: string; role: 'assistant' | 'user'; type: 'text'; text: string }
  | { id: string; role: 'assistant'; type: 'system'; text: string };

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export interface DeployRequest {
  target: AgentTarget;
  context?: {
    sectionId?: string;
    sectionTitle?: string;
    summary?: string;
    bullets?: string[];
  };
}

interface GtmStrategyAssistantProps {
  onDeployAgent: (req: DeployRequest) => void;
  onOpenWorkflow?: (context?: { nextStep?: string }) => void;
}

export function GtmStrategyAssistant({ onDeployAgent, onOpenWorkflow }: GtmStrategyAssistantProps) {
  const loaded = useMemo(() => loadGtmState(), []);
  const [prompt, setPrompt] = useState(loaded.prompt);
  const [isPlanning, setIsPlanning] = useState(false);
  const [plan, setPlan] = useState<GtmInterviewPlan | null>(loaded.plan);
  const [questionIndex, setQuestionIndex] = useState(loaded.questionIndex);
  const [answers, setAnswers] = useState<Record<string, unknown>>(loaded.answers);
  const [chat, setChat] = useState<ChatLine[]>(loaded.chat);
  const [currentFreeText, setCurrentFreeText] = useState('');
  const [currentMulti, setCurrentMulti] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [strategy, setStrategy] = useState<GtmStrategyResponse | null>(loaded.strategy);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const currentQuestion: GtmInterviewQuestion | null = useMemo(() => {
    if (!plan?.questions?.length) return null;
    return plan.questions[questionIndex] || null;
  }, [plan, questionIndex]);

  const hasActiveInterview = !!plan && !!currentQuestion && !strategy;

  // Persist to sessionStorage when state changes (so it survives screen navigation)
  useEffect(() => {
    const hasData = chat.length > 1 || plan != null || Object.keys(answers).length > 0 || strategy != null || prompt.trim() !== '';
    if (!hasData) {
      sessionStorage.removeItem(GTM_STORAGE_KEY);
      return;
    }
    try {
      sessionStorage.setItem(
        GTM_STORAGE_KEY,
        JSON.stringify({
          chat,
          plan,
          questionIndex,
          answers,
          prompt,
          strategy,
        })
      );
    } catch {
      // ignore quota or serialization errors
    }
  }, [chat, plan, questionIndex, answers, prompt, strategy]);

  const resetAll = () => {
    setPrompt('');
    setIsPlanning(false);
    setPlan(null);
    setQuestionIndex(0);
    setAnswers({});
    setCurrentFreeText('');
    setCurrentMulti([]);
    setIsGenerating(false);
    setStrategy(null);
    setChat(DEFAULT_INTRO_CHAT);
    sessionStorage.removeItem(GTM_STORAGE_KEY);
  };

  const addLine = (line: ChatLine) => {
    setChat((prev) => [...prev, line]);
    queueMicrotask(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  };

  const startPlanning = async (rawPrompt: string) => {
    const cleanPrompt = rawPrompt.trim();
    if (!cleanPrompt) return;

    setStrategy(null);
    setPlan(null);
    setQuestionIndex(0);
    setAnswers({});
    setCurrentFreeText('');
    setCurrentMulti([]);

    addLine({ id: `u_${Date.now()}`, role: 'user', type: 'text', text: cleanPrompt });
    addLine({
      id: `a_${Date.now()}`,
      role: 'assistant',
      type: 'text',
      text: 'Got it. I’ll ask a few questions first so the GTM strategy is specific and executable.',
    });

    setIsPlanning(true);
    try {
      const nextPlan = await generateGtmInterviewPlan(cleanPrompt);
      if (!nextPlan?.questions?.length) {
        throw new Error('No questions returned.');
      }
      setPlan(nextPlan);
      setQuestionIndex(0);

      const firstQ = nextPlan.questions[0];
      const firstQText = firstQ.helperText
        ? `${firstQ.question}\n\n${firstQ.helperText}`
        : firstQ.question;
      addLine({
        id: `a_q1_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: `Question 1 of ${nextPlan.questions.length}: ${firstQText}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate questions.';
      toast.error(message);
      addLine({
        id: `a_err_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: `I ran into an error generating the interview: ${message} Please try again after fixing the issue.`,
      });
    } finally {
      setIsPlanning(false);
    }
  };

  const commitAnswerAndAdvance = async (value: unknown, labelForChat?: string) => {
    if (!plan || !currentQuestion) return;

    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(nextAnswers);

    addLine({
      id: `u_ans_${Date.now()}`,
      role: 'user',
      type: 'text',
      text: labelForChat || (Array.isArray(value) ? value.join(', ') : String(value)),
    });

    const nextIndex = questionIndex + 1;
    setCurrentFreeText('');
    setCurrentMulti([]);

    if (nextIndex < plan.questions.length) {
      const nextQ = plan.questions[nextIndex];
      const nextQText = nextQ.helperText
        ? `${nextQ.question}\n\n${nextQ.helperText}`
        : nextQ.question;
      addLine({
        id: `a_q${nextIndex + 1}_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: `Question ${nextIndex + 1} of ${plan.questions.length}: ${nextQText}`,
      });
      setQuestionIndex(nextIndex);
      return;
    }

    addLine({
      id: `a_gen_${Date.now()}`,
      role: 'assistant',
      type: 'text',
      text: 'Perfect. Generating your GTM strategy now…',
    });

    setIsGenerating(true);
    try {
      const result = await generateGtmStrategy({ prompt: plan.title || prompt, answers: nextAnswers });
      setStrategy(result);
      addLine({
        id: `a_done_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'Done. Review the sections on the right and deploy the agents you want to run next.',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate strategy.');
      addLine({
        id: `a_err2_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'I hit an error while drafting the strategy. You can try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const renderCurrentQuestion = () => {
    if (!currentQuestion) return null;
    const options = currentQuestion.options || [];

    return (
      <Card className="border-orange-200/60 dark:border-orange-900/30">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-orange-600" />
            {currentQuestion.question}
          </CardTitle>
          {currentQuestion.helperText ? (
            <CardDescription>{currentQuestion.helperText}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {currentQuestion.type !== 'free_text' && options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => {
                const selected =
                  currentQuestion.type === 'multi_select'
                    ? currentMulti.includes(opt.value)
                    : answers[currentQuestion.id] === opt.value;

                return (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    className={cn(
                      'h-auto rounded-full px-3 py-1.5 text-sm',
                      selected ? 'bg-orange-500 hover:bg-orange-600' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
                    )}
                    onClick={() => {
                      if (currentQuestion.type === 'single_select') {
                        commitAnswerAndAdvance(opt.value, opt.label);
                        return;
                      }
                      setCurrentMulti((prev) => {
                        if (prev.includes(opt.value)) return prev.filter((v) => v !== opt.value);
                        return [...prev, opt.value];
                      });
                    }}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          ) : null}

          {currentQuestion.type === 'free_text' || currentQuestion.allowCustomAnswer ? (
            <div className="space-y-2">
              <Textarea
                value={currentFreeText}
                onChange={(e) => setCurrentFreeText(e.target.value)}
                placeholder="Type a quick answer…"
                className="min-h-[72px]"
                disabled={isPlanning || isGenerating}
              />
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="gap-2">
          {currentQuestion.type === 'multi_select' ? (
            <Button
              type="button"
              disabled={isPlanning || isGenerating || currentMulti.length === 0}
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                commitAnswerAndAdvance(currentMulti, currentMulti.map((v) => toTitleCase(v)).join(', '));
              }}
            >
              Continue
            </Button>
          ) : null}

          {currentQuestion.type === 'free_text' || currentQuestion.allowCustomAnswer ? (
            <Button
              type="button"
              variant={currentQuestion.type === 'multi_select' ? 'outline' : 'default'}
              className={cn(currentQuestion.type !== 'multi_select' ? 'bg-orange-500 hover:bg-orange-600' : '')}
              disabled={isPlanning || isGenerating || !currentFreeText.trim()}
              onClick={() => commitAnswerAndAdvance(currentFreeText.trim(), currentFreeText.trim())}
            >
              {currentQuestion.type === 'free_text' ? 'Continue' : 'Submit custom'}
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    );
  };

  const canStart = !isPlanning && !isGenerating && !hasActiveInterview;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-600" />
                Marketing Strategist
              </CardTitle>
              <CardDescription>
                Ask for a GTM strategy. I’ll run a short interview, then produce an executable plan with deployable agents.
              </CardDescription>
            </div>

            <Button variant="outline" size="sm" onClick={resetAll} className="shrink-0">
              <Refresh className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
              className="rounded-full"
              onClick={() => {
                const seed = 'Create GTM strategy';
                setPrompt(seed);
                if (canStart) startPlanning(seed);
              }}
              disabled={!canStart}
                >
                  Create GTM strategy
                </Button>
              </div>
            </CardHeader>

        <CardContent className="space-y-4">
          <ScrollArea className="h-[360px] rounded-lg border p-4">
            <div className="space-y-3">
              {chat.map((line) => {
                const isUser = line.role === 'user';
                return (
                  <div
                    key={line.id}
                    className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                        isUser
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                      )}
                    >
                      {line.text}
                    </div>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <Separator />

          {!plan ? (
            <div className="space-y-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Create GTM strategy"
                className="min-h-[88px]"
                disabled={!canStart}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={!canStart || !prompt.trim()}
                  onClick={() => startPlanning(prompt)}
                >
                  Start
                </Button>
                <span className="text-xs text-muted-foreground">
                  I’ll ask 5–6 questions one at a time; answer each to continue.
                </span>
              </div>
            </div>
          ) : null}

          {hasActiveInterview ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Question {questionIndex + 1} of {plan?.questions.length}
              </div>
              {renderCurrentQuestion()}
            </div>
          ) : null}

          {isPlanning ? (
            <div className="text-sm text-muted-foreground">Generating questions…</div>
          ) : null}
          {isGenerating ? (
            <div className="text-sm text-muted-foreground">Drafting GTM strategy…</div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle>GTM Strategy</CardTitle>
          <CardDescription>
            Strategy is generated after the interview. Each section includes a Deploy Agent button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!strategy ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No strategy yet. Start the chat on the left.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{strategy.title}</div>
                <div className="text-sm text-muted-foreground">{strategy.executiveSummary}</div>
              </div>

              {strategy.assumptions?.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Assumptions</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {strategy.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-3">
                {strategy.sections.map((section) => (
                  <Card key={section.id} className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{section.title}</CardTitle>
                      <CardDescription className="text-xs">{section.summary}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {asStringArray(section.bullets).slice(0, 6).map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600"
                        onClick={() =>
                          onDeployAgent({
                            target: section.recommendedAgentTarget,
                            context: {
                              sectionId: section.id,
                              sectionTitle: section.title,
                              summary: section.summary,
                              bullets: section.bullets,
                            },
                          })
                        }
                      >
                        {section.deployLabel || 'Deploy Agent'}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {strategy.nextSteps?.length ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Next steps</div>
                  <div className="space-y-2">
                    {strategy.nextSteps.map((n, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <p className="text-sm text-muted-foreground">{n}</p>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard.writeText(n);
                              toast.success('Step copied to clipboard');
                            }}
                          >
                            Copy
                          </Button>
                          {onOpenWorkflow ? (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-orange-500 hover:bg-orange-600"
                              onClick={() => onOpenWorkflow({ nextStep: n })}
                            >
                              Open workflow
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
