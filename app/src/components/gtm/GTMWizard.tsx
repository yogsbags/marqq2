import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HiX as X,
  HiCheck as Check,
  HiLockClosed as LockClosed,
  HiLockOpen as LockOpen,
  HiChevronLeft as ChevronLeft,
} from 'react-icons/hi';
import { Map, Target, Megaphone, PenLine, Search, Calendar, BarChart3, Clock3, PlayCircle, Wrench, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  GTM_QUESTIONS,
  generateGtmStrategy,
  strategyToBlocks,
  saveGtmStrategy,
} from '@/services/gtmWizardService';
import type { AgentTarget, GtmStrategyBlock, SavedGtmStrategy } from '@/types/gtm';
import { addAiTask, loadTasks } from '@/lib/taskStore';
import { storeGtmContext } from '@/lib/gtmContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

// Horizon mapping: first 2 bullets are near-term (week), rest are monthly
function bulletHorizon(blockId: string, bullet: string, index: number): 'day' | 'week' | 'month' {
  const normalized = bullet.toLowerCase();
  if (normalized.includes('today') || normalized.includes('tomorrow') || normalized.includes('this week')) return 'day';
  if (normalized.includes('week 1') || normalized.includes('week 2')) return 'week';
  if (normalized.includes('month 2') || normalized.includes('month 3') || normalized.includes('quarter')) return 'month';
  if (blockId === 'roadmap') return index < 2 ? 'week' : 'month';
  if (blockId === 'kpis') return 'month';
  return index < 2 ? 'week' : 'month';
}

function taskLabel(blockTitle: string, bullet: string): string {
  return `[GTM • ${blockTitle}] ${bullet}`;
}

function extractRoadmapPrefix(bullet: string): string | null {
  const match = bullet.match(/^(month\s*\d+|week\s*\d+|q[1-4]|quarter)\s*:\s*/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

type DeploymentMode = 'run_now' | 'scheduled';

type DeployableAgent = {
  runtimeName: 'zara' | 'maya' | 'riya' | 'arjun' | 'dev' | 'priya';
  displayName: string;
  role: string;
  accent: string;
  gradient: string;
  intro: string;
  taskSummary: string;
  requiredTools: string[];
  optionalTools: string[];
};

const DEPLOYMENT_AGENT_MAP: Record<AgentTarget, DeployableAgent> = {
  company_intel_icp: {
    runtimeName: 'priya',
    displayName: 'Priya',
    role: 'Brand Intelligence',
    accent: 'text-rose-500',
    gradient: 'from-rose-500 to-pink-500',
    intro: 'Priya will tighten the target segment definition and message-market fit before execution starts.',
    taskSummary: 'Refine ICP hypotheses, validate pain points, and package the audience insight into actionable GTM tasks.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['CRM audience data', 'Competitor notes', 'Sales call notes'],
  },
  company_intel_competitors: {
    runtimeName: 'dev',
    displayName: 'Dev',
    role: 'Performance Analyst',
    accent: 'text-amber-500',
    gradient: 'from-amber-500 to-orange-500',
    intro: 'Dev will turn competitive assumptions into execution-grade market pressure points.',
    taskSummary: 'Review competitors, isolate strategic gaps, and convert the strongest moves into trackable work.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Paid media data', 'SEO snapshots', 'Sales objections'],
  },
  company_intel_marketing_strategy: {
    runtimeName: 'zara',
    displayName: 'Zara',
    role: 'Campaign Strategist',
    accent: 'text-indigo-500',
    gradient: 'from-indigo-500 to-violet-500',
    intro: 'Zara will convert this GTM section into an operating plan with channel and offer priorities.',
    taskSummary: 'Sequence initiatives, prioritize bets, and align the section with campaign execution.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Campaign performance data', 'Budget guardrails', 'Creative learnings'],
  },
  company_intel_sales_enablement: {
    runtimeName: 'priya',
    displayName: 'Priya',
    role: 'Brand Intelligence',
    accent: 'text-rose-500',
    gradient: 'from-rose-500 to-pink-500',
    intro: 'Priya will sharpen the narrative so sales and marketing push the same story.',
    taskSummary: 'Translate the strategy into objections handling, proof points, and internal enablement tasks.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Sales deck', 'Discovery call notes', 'Win/loss insights'],
  },
  company_intel_pricing: {
    runtimeName: 'dev',
    displayName: 'Dev',
    role: 'Performance Analyst',
    accent: 'text-amber-500',
    gradient: 'from-amber-500 to-orange-500',
    intro: 'Dev will pressure-test the packaging and pricing logic behind this GTM section.',
    taskSummary: 'Frame pricing assumptions, benchmark offer structure, and identify the next validation tasks.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Pricing sheet', 'Sales objections', 'Competitor packaging notes'],
  },
  company_intel_content_strategy: {
    runtimeName: 'riya',
    displayName: 'Riya',
    role: 'Content Producer',
    accent: 'text-fuchsia-500',
    gradient: 'from-fuchsia-500 to-purple-500',
    intro: 'Riya will translate the strategy into concrete editorial and campaign content work.',
    taskSummary: 'Turn the approved section into content assets, briefs, and publishing tasks that match the GTM plan.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Brand guidelines', 'Existing content library', 'SEO priorities'],
  },
  company_intel_channel_strategy: {
    runtimeName: 'zara',
    displayName: 'Zara',
    role: 'Campaign Strategist',
    accent: 'text-indigo-500',
    gradient: 'from-indigo-500 to-violet-500',
    intro: 'Zara will choose where to focus and turn that choice into an execution schedule.',
    taskSummary: 'Prioritize channels, define operating cadence, and create immediate execution tasks.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Historical campaign data', 'Audience insights', 'Budget guardrails'],
  },
  company_intel_social_calendar: {
    runtimeName: 'riya',
    displayName: 'Riya',
    role: 'Content Producer',
    accent: 'text-fuchsia-500',
    gradient: 'from-fuchsia-500 to-purple-500',
    intro: 'Riya will turn the strategy into a repeatable social publishing rhythm.',
    taskSummary: 'Generate social execution tasks, repurposing ideas, and content cadence based on the approved section.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Platform priorities', 'Brand guidelines', 'Social proof assets'],
  },
  company_intel_lead_magnets: {
    runtimeName: 'riya',
    displayName: 'Riya',
    role: 'Content Producer',
    accent: 'text-fuchsia-500',
    gradient: 'from-fuchsia-500 to-purple-500',
    intro: 'Riya will package the approved strategy into conversion-oriented content offers.',
    taskSummary: 'Shape lead magnet ideas, draft asset requirements, and set up the supporting production tasks.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['CRM lead quality feedback', 'Existing PDFs/assets', 'Landing pages'],
  },
  lead_intelligence: {
    runtimeName: 'arjun',
    displayName: 'Arjun',
    role: 'Lead Intelligence',
    accent: 'text-emerald-500',
    gradient: 'from-emerald-500 to-green-500',
    intro: 'Arjun will operationalize the lead-gen section into qualification and pipeline actions.',
    taskSummary: 'Build lead capture, qualification, and follow-up tasks from the approved GTM section.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['CRM access', 'Lead source data', 'ICP notes'],
  },
  budget_optimization: {
    runtimeName: 'dev',
    displayName: 'Dev',
    role: 'Performance Analyst',
    accent: 'text-amber-500',
    gradient: 'from-amber-500 to-orange-500',
    intro: 'Dev will convert the strategy into measurable budget and efficiency decisions.',
    taskSummary: 'Turn the approved section into optimization tasks, guardrails, and reporting checkpoints.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Spend data', 'Channel ROI history', 'Pacing rules'],
  },
  performance_scorecard: {
    runtimeName: 'dev',
    displayName: 'Dev',
    role: 'Performance Analyst',
    accent: 'text-amber-500',
    gradient: 'from-amber-500 to-orange-500',
    intro: 'Dev will set up the measurement and review loop for this GTM section.',
    taskSummary: 'Translate roadmap and KPI commitments into scorecard-ready tasks and review cadences.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Analytics access', 'Dashboard exports', 'Revenue or pipeline targets'],
  },
  user_engagement: {
    runtimeName: 'priya',
    displayName: 'Priya',
    role: 'Brand Intelligence',
    accent: 'text-rose-500',
    gradient: 'from-rose-500 to-pink-500',
    intro: 'Priya will make sure engagement motions stay aligned with the brand narrative.',
    taskSummary: 'Convert lifecycle and engagement ideas into user-facing experiments and owned tasks.',
    requiredTools: ['Website/company context', 'Saved GTM strategy section'],
    optionalTools: ['Lifecycle data', 'Product events', 'User research'],
  },
};

function AgentBadgeAvatar({ agent }: { agent: DeployableAgent }) {
  return (
    <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm', agent.gradient)}>
      <span className="text-sm font-bold tracking-wide">{agent.displayName.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

function stripRoadmapPrefix(bullet: string): string {
  return bullet.replace(/^(month\s*\d+|week\s*\d+|q[1-4]|quarter)\s*:\s*/i, '').trim();
}

function normalizeTaskText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTaskFromBullet(block: GtmStrategyBlock, bullet: string, index: number) {
  const trimmed = bullet.trim();
  if (!trimmed) return null;

  if (block.id === 'kpis') {
    const normalized = trimmed.toLowerCase();
    if (normalized.includes('tracking cadence') || normalized.includes('weekly review') || normalized.includes('scorecard')) {
      return {
        label: taskLabel(block.title, trimmed),
        horizon: 'week' as const,
      };
    }

    if (normalized.includes('track ') || normalized.includes('measure ') || normalized.includes('review ')) {
      return {
        label: taskLabel(block.title, trimmed),
        horizon: 'month' as const,
      };
    }

    return {
      label: taskLabel(block.title, `Instrument tracking for ${trimmed.replace(/\.$/, '')}`),
      horizon: 'week' as const,
    };
  }

  if (block.id === 'roadmap') {
    const prefix = extractRoadmapPrefix(trimmed);
    const body = stripRoadmapPrefix(trimmed) || trimmed;
    return {
      label: prefix
        ? `[GTM • ${block.title} • ${prefix}] ${body}`
        : taskLabel(block.title, trimmed),
      horizon: bulletHorizon(block.id, trimmed, index),
    };
  }

  return {
    label: taskLabel(block.title, trimmed),
    horizon: bulletHorizon(block.id, trimmed, index),
  };
}

function buildTasksFromBlocks(blocks: GtmStrategyBlock[]) {
  const existing = new Set(loadTasks().map((task) => normalizeTaskText(task.label)));
  const seen = new Set<string>();
  const tasks: Array<{ label: string; horizon: 'day' | 'week' | 'month' }> = [];

  blocks
    .filter((block) => block.approved)
    .forEach((block) => {
      block.bullets.forEach((bullet, index) => {
        const task = inferTaskFromBullet(block, bullet, index);
        if (!task) return;
        const normalized = normalizeTaskText(task.label);
        if (seen.has(normalized) || existing.has(normalized)) return;
        seen.add(normalized);
        tasks.push(task);
      });
    });

  return tasks;
}

// Section icon map
const SECTION_ICON: Record<string, LucideIcon> = {
  positioning: Target,
  channels:    Megaphone,
  content:     PenLine,
  lead_gen:    Search,
  roadmap:     Calendar,
  kpis:        BarChart3,
};

type Phase = 'interview' | 'generating' | 'review';

interface Props {
  onClose: () => void;
  onNavigate?: (moduleId: string) => void;
}

function navigateFromTarget(target: AgentTarget, onNavigate?: (moduleId: string) => void) {
  const companyIntelMap: Partial<Record<AgentTarget, string>> = {
    company_intel_icp: 'icps',
    company_intel_competitors: 'competitor_intelligence',
    company_intel_marketing_strategy: 'marketing_strategy',
    company_intel_sales_enablement: 'sales_enablement',
    company_intel_pricing: 'pricing_intelligence',
    company_intel_content_strategy: 'content_strategy',
    company_intel_channel_strategy: 'channel_strategy',
    company_intel_social_calendar: 'social_calendar',
    company_intel_lead_magnets: 'lead_magnets',
  };

  const companyIntelPage = companyIntelMap[target];
  if (companyIntelPage) {
    window.location.hash = `ci=${encodeURIComponent(companyIntelPage)}`;
    onNavigate?.('company-intelligence');
    return;
  }

  const moduleMap: Partial<Record<AgentTarget, string>> = {
    lead_intelligence: 'lead-intelligence',
    budget_optimization: 'budget-optimization',
    performance_scorecard: 'performance-scorecard',
    user_engagement: 'user-engagement',
  };

  const moduleId = moduleMap[target];
  if (moduleId) {
    onNavigate?.(moduleId);
  }
}

export function GTMWizard({ onClose, onNavigate }: Props) {
  const { activeWorkspace } = useWorkspace();
  const [phase, setPhase] = useState<Phase>('interview');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<GtmStrategyBlock[]>([]);
  const [strategyTitle, setStrategyTitle] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [deployingBlock, setDeployingBlock] = useState<GtmStrategyBlock | null>(null);
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>('run_now');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedBlocks, setDeployedBlocks] = useState<Record<string, DeploymentMode>>({});

  const question = GTM_QUESTIONS[currentQ];
  const approvedCount = blocks.filter(b => b.approved).length;
  const allApproved = blocks.length > 0 && approvedCount === blocks.length;

  const tasksForDeployingBlock = deployingBlock ? buildTasksFromBlocks([{ ...deployingBlock, approved: true }]) : [];
  const deployingAgent = deployingBlock ? DEPLOYMENT_AGENT_MAP[deployingBlock.recommendedAgentTarget] : null;

  // ── Interview ──────────────────────────────────────────────────────────────

  const handleAnswer = async (label: string, value: string) => {
    const newAnswers = { ...answers, [question.id]: label };
    setAnswers(newAnswers);

    if (currentQ < GTM_QUESTIONS.length - 1) {
      setCurrentQ(q => q + 1);
      return;
    }

    // Last question answered → generate
    setPhase('generating');
    try {
      const strategy = await generateGtmStrategy(newAnswers);
      setStrategyTitle(strategy.title);
      setExecutiveSummary(strategy.executiveSummary);
      setAssumptions(strategy.assumptions);
      setNextSteps(strategy.nextSteps);
      setBlocks(strategyToBlocks(strategy));
      setPhase('review');
    } catch (err) {
      console.error('GTM generation failed:', err);
      toast.error('Failed to generate strategy — please try again.');
      setPhase('interview');
      setCurrentQ(GTM_QUESTIONS.length - 1);
    }
  };

  // ── Review ─────────────────────────────────────────────────────────────────

  const toggleApprove = (id: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, approved: !b.approved } : b));
  };

  const handleSave = () => {
    const saved: SavedGtmStrategy = {
      id: `gtm-${Date.now()}`,
      createdAt: new Date().toISOString(),
      answers,
      strategy: {
        title: strategyTitle,
        executiveSummary,
        assumptions,
        sections: blocks,
        nextSteps,
      },
      blocks,
    };
    saveGtmStrategy(saved);

    toast.success('GTM Strategy saved');
    onClose();
  };

  const runAgentForBlock = async (block: GtmStrategyBlock, agent: DeployableAgent) => {
    const query = [
      `You are being deployed against the approved GTM section "${block.title}".`,
      `Section summary: ${block.summary}`,
      `Key tasks to execute:`,
      ...block.bullets.map((bullet) => `- ${bullet}`),
      'Respond with the specific actions you will take first and the expected output.',
    ].join('\n');

    const res = await fetch(`/api/agents/${agent.runtimeName}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(`${agent.displayName} is not available right now.`);
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      if (chunk.includes('[DONE]')) break;
    }
  };

  const handleConfirmDeployment = async () => {
    if (!deployingBlock || !deployingAgent) return;
    setIsDeploying(true);
    try {
      storeGtmContext(deployingBlock.recommendedAgentTarget, {
        sectionId: deployingBlock.id,
        sectionTitle: deployingBlock.title,
        summary: deployingBlock.summary,
        bullets: deployingBlock.bullets,
      });

      tasksForDeployingBlock.forEach((task) => {
        addAiTask(`[${deployingAgent.displayName}] ${task.label}`, task.horizon);
      });

      if (deploymentMode === 'run_now') {
        await runAgentForBlock(deployingBlock, deployingAgent);
        toast.success(`${deployingAgent.displayName} deployed and running now`);
      } else {
        const response = await fetch('/api/agents/deployments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName: deployingAgent.runtimeName,
            agentTarget: deployingBlock.recommendedAgentTarget,
            workspaceId: activeWorkspace?.id ?? null,
            sectionId: deployingBlock.id,
            sectionTitle: deployingBlock.title,
            summary: deployingBlock.summary,
            bullets: deployingBlock.bullets,
            source: 'gtm-wizard',
            tasks: tasksForDeployingBlock.map((task) => ({
              label: task.label,
              horizon: task.horizon,
            })),
          }),
        });
        if (!response.ok) {
          throw new Error('Failed to queue scheduled deployment');
        }
        toast.success(`${deployingAgent.displayName} queued for the next scheduled run`);
      }

      setDeployedBlocks((prev) => ({ ...prev, [deployingBlock.id]: deploymentMode }));
      setDeployingBlock(null);
    } catch (error) {
      console.error('Agent deployment failed:', error);
      toast.error(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
              {phase === 'review' ? (strategyTitle || '90-Day GTM Strategy') : 'GTM Strategy Builder'}
            </p>
            {phase === 'review' && (
              <p className="text-xs text-gray-400">
                {approvedCount} of {blocks.length} sections approved
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Interview phase ── */}
      {phase === 'interview' && (
        <div className="flex flex-col flex-1 overflow-hidden px-6 py-5">

          {/* Progress bar */}
          <div className="mb-6 flex-shrink-0">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Question {currentQ + 1} of {GTM_QUESTIONS.length}</span>
              <span>{Math.round((currentQ / GTM_QUESTIONS.length) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${(currentQ / GTM_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Previous answers breadcrumb */}
          {Object.keys(answers).length > 0 && (
            <div className="mb-5 flex flex-wrap gap-1.5 flex-shrink-0">
              {GTM_QUESTIONS.slice(0, currentQ).map(q => (
                <span
                  key={q.id}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                >
                  <Check className="h-2.5 w-2.5" />
                  {answers[q.id]}
                </span>
              ))}
            </div>
          )}

          {/* Question */}
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 leading-snug flex-shrink-0">
            {question.question}
          </p>

          {/* Option buttons */}
          <div className="space-y-2.5 overflow-y-auto">
            {question.options?.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleAnswer(opt.label, opt.value)}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-700 dark:hover:text-orange-400 transition-all duration-150 font-medium"
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Back button */}
          {currentQ > 0 && (
            <button
              onClick={() => {
                const prev = GTM_QUESTIONS[currentQ - 1];
                const newAnswers = { ...answers };
                delete newAnswers[prev.id];
                setAnswers(newAnswers);
                setCurrentQ(q => q - 1);
              }}
              className="mt-5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
        </div>
      )}

      {/* ── Generating phase ── */}
      {phase === 'generating' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="w-14 h-14 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Building your GTM strategy</p>
            <p className="text-xs text-gray-400 mt-1">Crafting a personalised 90-day plan…</p>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {Object.entries(answers).map(([id, label]) => (
              <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">
                <Check className="h-2.5 w-2.5" /> {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Review phase ── */}
      {phase === 'review' && (
        <>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {blocks.map(block => (
                <div
                  key={block.id}
                  className={cn(
                    'rounded-xl border overflow-hidden transition-all duration-200',
                    block.approved
                      ? 'border-green-300 dark:border-green-700'
                      : 'border-gray-200 dark:border-gray-700'
                  )}
                >
                  {/* Block header */}
                  <div className={cn(
                    'flex items-center justify-between px-4 py-2.5',
                    block.approved
                      ? 'bg-green-50 dark:bg-green-950/20'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  )}>
                    <div className="flex items-center gap-2">
                      {(() => { const SectionIcon = SECTION_ICON[block.id] ?? BarChart3; return <SectionIcon className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />; })()}
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{block.title}</span>
                      {block.approved && <Check className="h-3.5 w-3.5 text-green-500" />}
                    </div>
                    <button
                      onClick={() => toggleApprove(block.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 border',
                        block.approved
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700 hover:bg-green-200'
                          : 'bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-600 hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400'
                      )}
                    >
                      {block.approved
                        ? <><LockClosed className="h-3 w-3" /> Locked</>
                        : <><LockOpen   className="h-3 w-3" /> Approve</>
                      }
                    </button>
                  </div>

                  {/* Summary */}
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">{block.summary}</p>
                  </div>

                  {/* Bullets as tasks preview */}
                  <div className="px-4 pb-3 space-y-1.5 mt-2">
                    {block.bullets.map((bullet, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={cn(
                          'mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full',
                          i < 2 ? 'bg-orange-400' : 'bg-gray-300 dark:bg-gray-600'
                        )} />
                        <span className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{bullet}</span>
                        <span className={cn(
                          'ml-auto flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          i < 2
                            ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                        )}>
                          {i < 2 ? 'week' : 'month'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Deploy hint */}
                  {block.deployLabel && (
                    <div className="px-4 pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          disabled={!block.approved}
                          className={cn(
                            'text-[11px] font-semibold transition-colors',
                            block.approved
                              ? 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300'
                              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                          )}
                          onClick={() => {
                            if (!block.approved) return;
                            setDeploymentMode('run_now');
                            setDeployingBlock(block);
                          }}
                        >
                          {deployedBlocks[block.id]
                            ? `Deploy Agent Again (${deployedBlocks[block.id] === 'run_now' ? 'ran now' : 'scheduled'})`
                            : 'Deploy Agent'}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 italic"
                          onClick={() => navigateFromTarget(block.recommendedAgentTarget, onNavigate)}
                        >
                          → {block.deployLabel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t px-4 py-3 flex-shrink-0">
            {allApproved ? (
              <Button
                onClick={handleSave}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold"
              >
                Save Strategy
              </Button>
            ) : (
              <div className="text-center">
                <p className="text-xs text-gray-400">
                  Approve all {blocks.length} sections to save your strategy
                </p>
                <div className="flex justify-center gap-1 mt-2">
                  {blocks.map(b => (
                    <div
                      key={b.id}
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        b.approved ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={Boolean(deployingBlock)} onOpenChange={(open) => !open && !isDeploying && setDeployingBlock(null)}>
        <DialogContent className="sm:max-w-2xl">
          {deployingBlock && deployingAgent && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <AgentBadgeAvatar agent={deployingAgent} />
                  <div>
                    <DialogTitle className="flex items-center gap-2">
                      Deploy {deployingAgent.displayName} for {deployingBlock.title}
                    </DialogTitle>
                    <DialogDescription className="pt-1">
                      {deployingAgent.role} • {deployingAgent.intro}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">What this agent will do</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{deployingAgent.taskSummary}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tasks that will be created</p>
                    </div>
                    <div className="space-y-2">
                      {tasksForDeployingBlock.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No executable tasks found in this card yet.</p>
                      ) : (
                        tasksForDeployingBlock.map((task) => (
                          <div key={task.label} className="rounded-lg bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 px-3 py-2">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">[{deployingAgent.displayName}] {task.label}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{task.horizon}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Wrench className="h-4 w-4 text-orange-500" />
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">External tool requirements</p>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Required</p>
                          <div className="space-y-1.5">
                            {deployingAgent.requiredTools.map((tool) => (
                              <div key={tool} className="text-xs text-slate-700 dark:text-slate-300">{tool}</div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Optional</p>
                          <div className="space-y-1.5">
                            {deployingAgent.optionalTools.map((tool) => (
                              <div key={tool} className="text-xs text-slate-600 dark:text-slate-400">{tool}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Execution timing</p>
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => setDeploymentMode('run_now')}
                          className={cn(
                            'rounded-xl border px-3 py-3 text-left transition-all',
                            deploymentMode === 'run_now'
                              ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-orange-300'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <PlayCircle className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Run now</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Create the tasks and start the agent immediately.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeploymentMode('scheduled')}
                          className={cn(
                            'rounded-xl border px-3 py-3 text-left transition-all',
                            deploymentMode === 'scheduled'
                              ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-orange-300'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Next scheduled run</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Save tasks now and queue this section for the agent’s next cron cycle.</p>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDeployingBlock(null)} disabled={isDeploying}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleConfirmDeployment()}
                  disabled={isDeploying || tasksForDeployingBlock.length === 0}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {isDeploying
                    ? 'Deploying…'
                    : deploymentMode === 'run_now'
                    ? 'Confirm Deployment & Run'
                    : 'Confirm Deployment & Schedule'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
