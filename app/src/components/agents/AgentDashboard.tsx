import { useEffect, useState } from 'react';
import { PlayCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { addAiTasks } from '@/lib/taskStore';
import { cn } from '@/lib/utils';

const DIGITAL_EMPLOYEES = [
  { name: 'zara', role: 'Campaign Strategist' },
  { name: 'maya', role: 'SEO & LLMO Monitor' },
  { name: 'riya', role: 'Content Producer' },
  { name: 'arjun', role: 'Lead Intelligence' },
  { name: 'dev', role: 'Performance Analyst' },
  { name: 'priya', role: 'Brand Intelligence' },
] as const;

type EmployeeName = typeof DIGITAL_EMPLOYEES[number]['name'];

interface HeartbeatAgent {
  status: 'idle' | 'running' | 'completed' | 'error';
  last_run: string | null;
  duration_ms: number | null;
  next_run?: string;
}

interface HeartbeatData {
  updated_at: string | null;
  agents: Record<string, HeartbeatAgent>;
}

type EmployeeProfile = {
  title: string;
  personality: string;
  executes: string[];
  objectives: string[];
};

type PlannedTask = {
  label: string;
  horizon: 'day' | 'week' | 'month';
};

type AgentExecutionPlan = {
  request: string;
  summary: string;
  tasks: PlannedTask[];
  executionPrompt: string;
};

const EMPLOYEE_PROFILES: Record<EmployeeName, EmployeeProfile> = {
  zara: {
    title: 'Campaign Strategist',
    personality: 'Decisive, commercially sharp, and biased toward clear GTM tradeoffs rather than vague planning.',
    executes: [
      'Turn business goals into channel-specific campaign plans',
      'Recommend launch structure, offers, and funnel sequencing',
      'Translate GTM strategy into deployable execution tasks',
    ],
    objectives: [
      'Launch campaigns faster',
      'Improve channel mix decisions',
      'Keep GTM work aligned to revenue outcomes',
    ],
  },
  maya: {
    title: 'SEO & LLMO Monitor',
    personality: 'Methodical, evidence-driven, and focused on search visibility, citations, and technical discoverability.',
    executes: [
      'Monitor SEO and AI-search visibility signals',
      'Identify ranking, indexing, and answer-engine gaps',
      'Suggest content and site updates that improve discoverability',
    ],
    objectives: [
      'Increase organic visibility',
      'Catch SEO regressions early',
      'Improve AI citation readiness',
    ],
  },
  riya: {
    title: 'Content Producer',
    personality: 'Fast-moving, editorially minded, and tuned to shipping usable content rather than abstract ideas.',
    executes: [
      'Generate content plans, briefs, and campaign-ready assets',
      'Turn strategy into channel-specific content output',
      'Support social, messaging, and creative production flows',
    ],
    objectives: [
      'Maintain content velocity',
      'Improve campaign consistency',
      'Reduce time from idea to published asset',
    ],
  },
  arjun: {
    title: 'Lead Intelligence',
    personality: 'Analytical and conversion-oriented, with a strong bias toward qualification, prioritization, and pipeline efficiency.',
    executes: [
      'Analyze lead quality and prospect segments',
      'Surface ICP fit, enrichment, and prioritization insights',
      'Support outreach and opportunity qualification decisions',
    ],
    objectives: [
      'Improve lead quality',
      'Prioritize the right accounts faster',
      'Strengthen sales and marketing handoff',
    ],
  },
  dev: {
    title: 'Performance Analyst',
    personality: 'Numerate, pragmatic, and focused on budget efficiency, signal quality, and measurable performance improvement.',
    executes: [
      'Review campaign performance and scorecards',
      'Recommend budget reallocations and efficiency moves',
      'Track KPI movement across channels and time horizons',
    ],
    objectives: [
      'Improve ROI and spend efficiency',
      'Spot underperformance quickly',
      'Support budget decisions with data',
    ],
  },
  priya: {
    title: 'Brand Intelligence',
    personality: 'Research-led, positioning-aware, and strong at turning messy market inputs into sharper differentiation.',
    executes: [
      'Generate company intelligence and competitor analysis',
      'Refine messaging, positioning, and audience hypotheses',
      'Support brand, market, and narrative decisions',
    ],
    objectives: [
      'Sharpen market positioning',
      'Improve competitive awareness',
      'Create stronger strategic messaging',
    ],
  },
};

function AgentAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const avatarMap: Record<string, {
    shell: string;
    skin: string;
    hair: string;
    shirt: string;
    accent: string;
  }> = {
    zara: { shell: 'from-indigo-100 to-violet-200 dark:from-indigo-950 dark:to-violet-900', skin: '#F6C7A5', hair: '#3B2C67', shirt: '#5B5CE2', accent: '#B6A5FF' },
    maya: { shell: 'from-sky-100 to-cyan-200 dark:from-sky-950 dark:to-cyan-900', skin: '#EFC09A', hair: '#243B7A', shirt: '#0EA5E9', accent: '#8BE3FF' },
    riya: { shell: 'from-fuchsia-100 to-purple-200 dark:from-fuchsia-950 dark:to-purple-900', skin: '#F3C9AF', hair: '#5B2167', shirt: '#A855F7', accent: '#F0ABFC' },
    arjun: { shell: 'from-emerald-100 to-green-200 dark:from-emerald-950 dark:to-green-900', skin: '#D9A77E', hair: '#243B2F', shirt: '#16A34A', accent: '#86EFAC' },
    dev: { shell: 'from-orange-100 to-amber-200 dark:from-orange-950 dark:to-amber-900', skin: '#D8A27D', hair: '#4B2E1F', shirt: '#F97316', accent: '#FDBA74' },
    priya: { shell: 'from-rose-100 to-pink-200 dark:from-rose-950 dark:to-pink-900', skin: '#EFB89A', hair: '#4A2238', shirt: '#E11D48', accent: '#FDA4AF' },
  };

  const avatar = avatarMap[name.toLowerCase()] || avatarMap.zara;
  const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';

  return (
    <div className={cn('rounded-2xl bg-gradient-to-br p-0.5 shadow-sm', avatar.shell, sizeClass, className)}>
      <div className="flex h-full w-full items-center justify-center rounded-[calc(1rem-2px)] bg-white/75 dark:bg-slate-950/70">
        <svg viewBox="0 0 64 64" className="h-[86%] w-[86%]" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill={avatar.accent} opacity="0.16" />
          <path d="M16 56c2-10 10-16 16-16s14 6 16 16" fill={avatar.shirt} />
          <circle cx="32" cy="28" r="12" fill={avatar.skin} />
          <path d="M20 28c0-9 5-16 12-16s12 7 12 16c-3-3-7-5-12-5s-9 2-12 5Z" fill={avatar.hair} />
          <circle cx="27" cy="29" r="1.5" fill="#1F2937" />
          <circle cx="37" cy="29" r="1.5" fill="#1F2937" />
          <path d="M28 35c2.5 2 5.5 2 8 0" stroke="#7C4A2D" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </div>
  );
}

export function AgentDashboard() {
  const [heartbeat, setHeartbeat] = useState<HeartbeatData | null>(null);
  const [runningAgents, setRunningAgents] = useState<Set<EmployeeName>>(new Set());
  const [meetAgent, setMeetAgent] = useState<EmployeeName | null>(null);
  const [taskAgent, setTaskAgent] = useState<EmployeeName | null>(null);
  const [taskDraft, setTaskDraft] = useState('');
  const [isPlanningTask, setIsPlanningTask] = useState(false);
  const [planPreview, setPlanPreview] = useState<AgentExecutionPlan | null>(null);
  const [agentPlans, setAgentPlans] = useState<Partial<Record<EmployeeName, AgentExecutionPlan>>>({});

  const fetchHeartbeat = async () => {
    try {
      const res = await fetch('/api/agents/status');
      if (res.ok) {
        setHeartbeat(await res.json());
      }
    } catch {
      /* backend may not be running in dev */
    }
  };

  const runAgentNow = async (name: EmployeeName) => {
    if (runningAgents.has(name)) return;
    const savedPlan = agentPlans[name];
    if (!savedPlan) {
      openTaskModal(name);
      return;
    }
    setRunningAgents((prev) => new Set([...prev, name]));
    try {
      const res = await fetch(`/api/agents/${name}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: savedPlan.executionPrompt }),
      });
      if (!res.ok) {
        toast.error(`${name}: failed to start`);
        return;
      }
      toast.success(`${name} is running...`);
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (decoder.decode(value).includes('[DONE]')) break;
        }
      }
      toast.success(`${name} finished`);
      await fetchHeartbeat();
    } catch {
      toast.error(`${name}: run failed`);
    } finally {
      setRunningAgents((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  useEffect(() => {
    fetchHeartbeat();
    const intervalId = setInterval(fetchHeartbeat, 30_000);
    return () => clearInterval(intervalId);
  }, []);

  const formatLastRun = (ts: string | null) => {
    if (!ts) return 'Never';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const statusColour = (status?: HeartbeatAgent['status']) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300';
      case 'error':
        return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const activeProfile = meetAgent ? EMPLOYEE_PROFILES[meetAgent] : null;

  const openTaskModal = (name: EmployeeName) => {
    const existingPlan = agentPlans[name] || null;
    setTaskAgent(name);
    setTaskDraft(existingPlan?.request ?? '');
    setPlanPreview(existingPlan);
  };

  const createTaskPlan = async () => {
    if (!taskAgent) return;
    const nextRequest = taskDraft.trim();
    if (!nextRequest) {
      toast.error('Enter a task before creating the plan.');
      return;
    }

    setIsPlanningTask(true);
    try {
      const response = await fetch(`/api/agents/${taskAgent}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: nextRequest }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const plan = await response.json();
      setPlanPreview({
        request: nextRequest,
        summary: String(plan.summary || '').trim(),
        tasks: Array.isArray(plan.tasks) ? plan.tasks : [],
        executionPrompt: String(plan.executionPrompt || '').trim(),
      });
      toast.success(`Execution plan created for ${taskAgent}.`);
    } catch {
      toast.error('Failed to create the execution plan.');
    } finally {
      setIsPlanningTask(false);
    }
  };

  const approveTaskPlan = () => {
    if (!taskAgent || !planPreview) return;
    addAiTasks(
      planPreview.tasks.map((task) => ({
        label: `[${taskAgent} • AI Team] ${task.label}`,
        horizon: task.horizon,
      })),
    );
    setAgentPlans((prev) => ({ ...prev, [taskAgent]: planPreview }));
    toast.success(`Plan approved for ${taskAgent}. Tasks added to the taskboard.`);
    setTaskAgent(null);
    setTaskDraft('');
    setPlanPreview(null);
  };

  const resetTaskModal = () => {
    setTaskAgent(null);
    setTaskDraft('');
    setPlanPreview(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          AI Team
        </h1>
        <p className="mx-auto max-w-3xl text-sm text-muted-foreground">
          Meet your AI team, assign work, and run tasks from one place.
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div />
          <button
            onClick={fetchHeartbeat}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-gray-700 dark:hover:text-gray-300"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {DIGITAL_EMPLOYEES.map((employee) => {
            const hb = heartbeat?.agents[employee.name];
            const isRunning = runningAgents.has(employee.name) || hb?.status === 'running';
            const profile = EMPLOYEE_PROFILES[employee.name];
            const savedPlan = agentPlans[employee.name];

            return (
              <Card
                key={employee.name}
                className="border-border/70 bg-background/90 transition-colors hover:border-orange-300/70 dark:hover:border-orange-800/70"
              >
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AgentAvatar name={employee.name} size="md" className="flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold capitalize text-foreground">{employee.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{employee.role}</p>
                      </div>
                    </div>
                    <Badge className={cn('px-2 py-0 text-xs capitalize', statusColour(isRunning ? 'running' : hb?.status))}>
                      {isRunning ? 'running' : hb?.status ?? 'idle'}
                    </Badge>
                  </div>

                  <p className="mb-4 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {profile.personality}
                  </p>

                  {savedPlan && (
                    <div className="mb-4 rounded-xl border border-orange-200/70 bg-orange-50/70 p-3 dark:border-orange-900/60 dark:bg-orange-950/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                            Execution plan ready
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground">
                            {savedPlan.summary}
                          </p>
                        </div>
                        <button
                          className="text-[11px] font-medium text-orange-700 transition-colors hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-100"
                          onClick={() => openTaskModal(employee.name)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last run</p>
                      <p className="mt-1 font-medium text-foreground">{formatLastRun(hb?.last_run ?? null)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-border/70 bg-background text-foreground hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 dark:bg-slate-950 dark:hover:border-orange-800 dark:hover:bg-orange-950/30 dark:hover:text-orange-200"
                      onClick={() => setMeetAgent(employee.name)}
                    >
                      Meet Agent
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => (savedPlan ? runAgentNow(employee.name) : openTaskModal(employee.name))}
                      disabled={isRunning}
                    >
                      {isRunning ? (
                        <>
                          <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Running
                        </>
                      ) : (
                        <>
                          <PlayCircle className="mr-2 h-3.5 w-3.5" />
                          {savedPlan ? 'Run Now' : 'Give Task'}
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!meetAgent} onOpenChange={(open) => !open && setMeetAgent(null)}>
        <DialogContent className="border-orange-200/70 bg-background dark:border-orange-900/60">
          {meetAgent && activeProfile && (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <AgentAvatar name={meetAgent} size="lg" />
                  <div>
                    <DialogTitle className="text-xl capitalize">{meetAgent}</DialogTitle>
                    <DialogDescription className="mt-1 text-sm">
                      {activeProfile.title}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personality</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{activeProfile.personality}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {`Tasks ${meetAgent} can execute`}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-foreground">
                      {activeProfile.executes.map((task) => (
                        <li key={task} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-500" />
                          <span>{task}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {`Objectives ${meetAgent} helps with`}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-foreground">
                      {activeProfile.objectives.map((objective) => (
                        <li key={objective} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-500" />
                          <span>{objective}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="bg-orange-500 text-white hover:bg-orange-600" onClick={() => setMeetAgent(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!taskAgent}
        onOpenChange={(open) => {
          if (!open) {
            resetTaskModal();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-orange-200/70 bg-background dark:border-orange-900/60">
          {taskAgent && (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <AgentAvatar name={taskAgent} size="lg" />
                  <div>
                    <DialogTitle className="text-xl capitalize">{taskAgent}</DialogTitle>
                    <DialogDescription className="mt-1 text-sm">
                      Describe what you want this agent to do, then review the execution plan before you run it.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Task for {taskAgent}
                  </p>
                  <Textarea
                    value={taskDraft}
                    onChange={(event) => setTaskDraft(event.target.value)}
                    placeholder={`Example: ${EMPLOYEE_PROFILES[taskAgent].executes[0]}`}
                    className="min-h-28 border-border/70 bg-background text-foreground"
                  />
                </div>

                {planPreview && (
                  <div className="space-y-4 rounded-xl border border-orange-200/70 bg-orange-50/50 p-4 dark:border-orange-900/50 dark:bg-orange-950/10">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Plan summary
                      </p>
                      <p className="mt-2 text-sm leading-6 text-foreground">{planPreview.summary}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Actionable tasks for the taskboard
                      </p>
                      <div className="mt-3 max-h-[36vh] space-y-2 overflow-y-auto pr-1">
                        {planPreview.tasks.map((task, index) => (
                          <div
                            key={`${task.label}-${index}`}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/80 p-3"
                          >
                            <p className="text-sm text-foreground">{task.label}</p>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                              {task.horizon}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={resetTaskModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={createTaskPlan}
                    disabled={isPlanningTask || !taskDraft.trim()}
                  >
                    {isPlanningTask ? 'Planning...' : planPreview ? 'Refresh Plan' : 'Create Plan'}
                  </Button>
                  <Button
                    className="bg-orange-500 text-white hover:bg-orange-600"
                    onClick={approveTaskPlan}
                    disabled={!planPreview?.tasks.length}
                  >
                    Approve Plan
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
