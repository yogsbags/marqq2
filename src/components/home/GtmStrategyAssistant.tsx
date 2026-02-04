import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { generateGtmInterviewPlan, generateGtmStrategy } from '@/services/gtmStrategyService';
import type { AgentTarget, GtmInterviewPlan, GtmInterviewQuestion, GtmStrategyResponse } from '@/types/gtm';
import { HiChat as Bot, HiRefresh as Refresh, HiSparkles as Sparkles } from 'react-icons/hi';

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
  context?: { sectionId?: string; sectionTitle?: string };
}

interface GtmStrategyAssistantProps {
  onDeployAgent: (req: DeployRequest) => void;
}

export function GtmStrategyAssistant({ onDeployAgent }: GtmStrategyAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [plan, setPlan] = useState<GtmInterviewPlan | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [chat, setChat] = useState<ChatLine[]>([
    {
      id: 'intro',
      role: 'assistant',
      type: 'text',
      text:
        'Tell me what you want to launch, and I’ll ask a short set of questions (5–6) before I draft a GTM strategy you can execute with agents.',
    },
  ]);
  const [currentFreeText, setCurrentFreeText] = useState('');
  const [currentMulti, setCurrentMulti] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [strategy, setStrategy] = useState<GtmStrategyResponse | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const currentQuestion: GtmInterviewQuestion | null = useMemo(() => {
    if (!plan?.questions?.length) return null;
    return plan.questions[questionIndex] || null;
  }, [plan, questionIndex]);

  const hasActiveInterview = !!plan && !!currentQuestion && !strategy;

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
    setChat([
      {
        id: 'intro',
        role: 'assistant',
        type: 'text',
        text:
          'Tell me what you want to launch, and I’ll ask a short set of questions (5–6) before I draft a GTM strategy you can execute with agents.',
      },
    ]);
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

      addLine({
        id: `a_plan_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: `Interview ready: ${nextPlan.questions.length} questions. Answer them and I’ll generate your GTM strategy.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate questions.');
      addLine({
        id: `a_err_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'I ran into an error generating the interview. Please try again.',
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
      setQuestionIndex(nextIndex);
      addLine({
        id: `a_next_${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'Thanks — next question.',
      });
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
                GTM Strategy Chat
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
                <Badge variant="outline" className="rounded-full">
                  Model: {strategy?.model || plan?.model || 'gemini-3-flash-preview'}
                </Badge>
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
                  You’ll answer 5–6 questions before the strategy is generated.
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
                            context: { sectionId: section.id, sectionTitle: section.title },
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
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Next steps</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {strategy.nextSteps.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
