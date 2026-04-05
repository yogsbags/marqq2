import { useState, useRef, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { askVeena, GroqService, ChatMessage, type VeenaResponse } from '@/services/groqService';
import { toast } from 'sonner';
import { CSVAnalysisPanel } from '@/components/ui/csv-analysis-panel';
import type { Message, Conversation } from '@/types/chat';

import { markdownToRichText } from '@/lib/markdown';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  Send,
  MessageSquare as Bot,
  User,
  FileText,
  Image,
  Table as FileSpreadsheet,
  X,
  Map,
  DollarSign,
  PenLine,
  Target,
  Paperclip,
} from 'lucide-react';
import { buildAgentHeaders, buildAgentPlanPayload, buildAgentRunPayload, getActiveAgentContext } from '@/lib/agentContext';
import { usePlan } from '@/hooks/usePlan';
import { Zap } from 'lucide-react';

// -- localStorage helpers

const CONV_KEY_PREFIX = 'marqq_conversations';

function getConvKey(workspaceId: string | undefined): string {
  return workspaceId ? `${CONV_KEY_PREFIX}_${workspaceId}` : CONV_KEY_PREFIX;
}

function loadConversations(workspaceId?: string): Conversation[] {
  try {
    const raw = localStorage.getItem(getConvKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      lastMessageAt: new Date(c.lastMessageAt),
      messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}

function saveConversations(convs: Conversation[], workspaceId?: string) {
  localStorage.setItem(getConvKey(workspaceId), JSON.stringify(convs));
}

function generateName(firstUserMessage: string): string {
  return firstUserMessage.trim().slice(0, 40) || 'New conversation';
}

// -- Slash commands

const SLASH_COMMANDS = [
  { command: '/agents', description: 'Open the AI team', action: 'agents' },
  { command: '/workflows', description: 'Open workflow builder', action: 'workflows' },
  // ── Core automation modules ─────────────────────────────────────────────────
  { command: '/lead-intelligence',    description: 'Find and score leads, build your ICP',           action: 'lead-intelligence'    },
  { command: '/voice-bot',            description: 'Run outbound voice campaigns',                    action: 'voice-bot'            },
  { command: '/video-bot',            description: 'Create AI video and avatar content',              action: 'video-bot'            },
  { command: '/social-media',         description: 'Manage social media campaigns across platforms',  action: 'social-media'         },
  { command: '/user-engagement',      description: 'Map customer journeys and lifecycle flows',       action: 'user-engagement'      },
  { command: '/budget-optimization',  description: 'Analyse and reallocate campaign spend',           action: 'budget-optimization'  },
  { command: '/performance-scorecard',description: 'Check performance across channels',               action: 'performance-scorecard'},
  { command: '/ai-content',           description: 'Create content — blog, email, social, ads',       action: 'ai-content'           },
  { command: '/customer-view',        description: 'See a unified view of your customers',            action: 'customer-view'        },
  { command: '/seo-llmo',             description: 'Optimise for search and AI answer engines',       action: 'seo-llmo'             },
  { command: '/company-intel',        description: 'Build strategy, ICPs, competitive snapshot',      action: 'company-intel'        },
  // ── Intelligence & research ─────────────────────────────────────────────────
  { command: '/industry-intel',       description: 'Track industry trends and market signals',        action: 'industry-intelligence'},
  { command: '/market-signals',       description: 'Live market signals — news, intent, sentiment',   action: 'market-signals'       },
  { command: '/audience-profiles',    description: 'Build and refine detailed audience personas',     action: 'audience-profiles'    },
  // ── Strategy & positioning ──────────────────────────────────────────────────
  { command: '/positioning',          description: 'Define your positioning and competitive angle',   action: 'positioning'          },
  { command: '/offer-design',         description: 'Design and price your core offer',                action: 'offer-design'         },
  { command: '/messaging',            description: 'Craft brand messaging and copy frameworks',       action: 'messaging'            },
  { command: '/launch-strategy',      description: 'Build a go-to-market launch plan',                action: 'launch-strategy'      },
  { command: '/setup',                description: 'Set up your company context for all agents',      action: 'setup'                },
  // ── Campaigns & channels ────────────────────────────────────────────────────
  { command: '/social-calendar',      description: 'Plan and schedule your content calendar',         action: 'social-calendar'      },
  { command: '/channel-health',       description: 'Daily marketing intelligence brief',              action: 'channel-health'       },
  { command: '/ad-creative',          description: 'Generate and test ad creatives',                  action: 'ad-creative'          },
  { command: '/paid-ads',             description: 'Manage paid ad strategy and creative',            action: 'paid-ads'             },
  { command: '/email-sequence',       description: 'Build automated email nurture sequences',         action: 'email-sequence'       },
  { command: '/lead-outreach',        description: 'Run personalised lead outreach campaigns',        action: 'lead-outreach'        },
  { command: '/landing-pages',        description: 'Create and optimise landing pages',               action: 'landing-pages'        },
  { command: '/referral-program',     description: 'Design a referral and word-of-mouth program',     action: 'referral-program'     },
  // ── Growth & optimisation ───────────────────────────────────────────────────
  { command: '/action-plan',          description: 'Turn a goal into a step-by-step action plan',     action: 'action-plan'          },
  { command: '/cro-audit',            description: 'Audit your funnel for conversion leaks',          action: 'cro-audit'            },
  { command: '/ab-test',              description: 'Design and analyse A/B tests',                    action: 'ab-test'              },
  { command: '/cro',                  description: 'Continuous CRO — offers, copy, flow',             action: 'cro'                  },
  { command: '/marketing-audit',      description: 'Full audit of your marketing health',             action: 'marketing-audit'      },
  { command: '/revenue-ops',          description: 'Revenue operations and pipeline analysis',        action: 'revenue-ops'          },
  { command: '/lead-magnets',         description: 'Create high-converting lead magnets',             action: 'lead-magnets'         },
  { command: '/sales-enablement',     description: 'Build sales decks, battle cards, and scripts',    action: 'sales-enablement'     },
  { command: '/churn-prevention',     description: 'Identify at-risk accounts and reduce churn',      action: 'churn-prevention'     },
  // ── Specialist agent shortcuts ──────────────────────────────────────────────
  { command: '/seo',         description: 'Get today\'s ranking update from Maya',          action: 'agent-maya'  },
  { command: '/leads',       description: 'Get today\'s lead insights from Arjun',          action: 'agent-arjun' },
  { command: '/content',     description: 'Get content ideas this week from Riya',          action: 'agent-riya'  },
  { command: '/campaign',    description: 'Get campaign recommendations from Zara',         action: 'agent-zara'  },
  { command: '/competitors', description: 'Get a competitor summary from Dev',              action: 'agent-dev'   },
  { command: '/brief',       description: 'Get a brand brief from Priya',                   action: 'agent-priya' },
  { command: '/social',      description: 'Get organic social performance from Kiran',      action: 'agent-kiran' },
  { command: '/email',       description: 'Get email channel health from Sam',              action: 'agent-sam'   },
  { command: '/help', description: 'How to talk to me', action: 'help' },
];

// Map slash commands to autonomous agents
const SLASH_AGENTS: Record<string, { name: string; label: string; defaultQuery: string }> = {
  '/seo':         { name: 'maya',  label: 'Maya · SEO & LLMO Monitor',   defaultQuery: 'Give me our top 5 ranking changes and 3 keyword opportunities today.' },
  '/leads':       { name: 'arjun', label: 'Arjun · Lead Intelligence',    defaultQuery: 'What are today\'s top lead insights and recommended outreach actions?' },
  '/content':     { name: 'riya',  label: 'Riya · Content Producer',      defaultQuery: 'Suggest 3 content pieces we should publish this week based on current trends.' },
  '/campaign':    { name: 'zara',  label: 'Zara · Campaign Strategist',    defaultQuery: 'Review our active campaigns and give me your top 3 strategic recommendations.' },
  '/competitors': { name: 'dev',   label: 'Dev · Performance Analyst',     defaultQuery: 'Give me a competitor landscape summary and our key performance gaps.' },
  '/brief':       { name: 'priya', label: 'Priya · Brand Intelligence',    defaultQuery: 'Provide a brand intelligence brief covering sentiment and messaging alignment.' },
  '/social':      { name: 'kiran', label: 'Kiran · Social Intelligence',   defaultQuery: 'Give me our organic social performance this week — reach, engagement, and top post.' },
  '/email':       { name: 'sam',   label: 'Sam · Email Marketing Monitor', defaultQuery: 'What is our email channel health this week — sessions, engagement rate, and any anomalies?' },
  '/icp':         { name: 'isha',  label: 'Isha · Market Research',        defaultQuery: 'Give me our current ICP profile and top 3 audience segments to target.' },
  '/strategy':    { name: 'neel',  label: 'Neel · Strategy',               defaultQuery: 'Give me our current positioning brief and top strategic priorities this quarter.' },
  '/cro':         { name: 'tara',  label: 'Tara · CRO & Offers',           defaultQuery: 'Audit our main offer and funnel — what is the biggest conversion friction to fix?' },
};

const DIRECT_AGENTS = [
  { name: 'zara', label: 'Zara', role: 'Campaign Strategist' },
  { name: 'maya', label: 'Maya', role: 'SEO & LLMO Monitor' },
  { name: 'riya', label: 'Riya', role: 'Content Producer' },
  { name: 'arjun', label: 'Arjun', role: 'Lead Intelligence' },
  { name: 'dev', label: 'Dev', role: 'Performance Analyst' },
  { name: 'priya', label: 'Priya', role: 'Brand Intelligence' },
] as const;

type EmployeeName = typeof DIRECT_AGENTS[number]['name'];

type AgentExecutionPlan = {
  request: string;
  summary: string;
  tasks: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>;
  executionPrompt: string;
};

const EMPLOYEE_PROFILES: Record<EmployeeName, { title: string }> = {
  zara: { title: 'Campaign Strategist' },
  maya: { title: 'SEO & LLMO Monitor' },
  riya: { title: 'Content Producer' },
  arjun: { title: 'Lead Intelligence' },
  dev: { title: 'Performance Analyst' },
  priya: { title: 'Brand Intelligence' },
};

const MODULE_NAV_RESPONSES: Record<string, string> = {
  agents: `I've opened the AI team for you. Assign work there, or tell me what you want done and I'll route it to the right person.`,
  workflows: `I've opened the workflow builder. Use it to chain agents or build a multi-step automation. Let me know if you want help designing it.`,
  // Core automation
  'lead-intelligence':     `I've opened Lead Intelligence. Add your data or question there. Tell me what you're trying to find and I can help shape it first.`,
  'voice-bot':             `I've opened Voice Campaigns. Set the brief there, or keep talking here if you want help figuring out the campaign first.`,
  'video-bot':             `I've opened the video workspace. Build the workflow there, or tell me more about what you want to create.`,
  'social-media':          `I've opened Social Media Campaigns. Configure your campaign there, or describe your goals and I'll help you plan it.`,
  'user-engagement':       `I've opened User Engagement. Configure the flow there, or let me know the goal and I'll help scope it.`,
  'budget-optimization':   `I've opened Budget Optimization. Add your question, timeframe, and campaign data there to run the analysis.`,
  'performance-scorecard': `I've opened the Performance Scorecard. Use it to understand what's happening and decide where to act next.`,
  'ai-content':            `I've opened the content workspace. Choose your format and brief there, or keep chatting and I'll help you shape it first.`,
  'customer-view':         `I've opened the Customer View. Explore context and signals there, or tell me what you're looking for.`,
  'seo-llmo':              `I've opened SEO / LLMO. Use it for structured work, or describe what you want to improve and we can scope it together.`,
  'company-intel':         `I've opened Company Intelligence. Use it to build a strategy brief, competitive snapshot, or company view.`,
  // Intelligence & research
  'industry-intelligence': `I've opened Industry Intelligence. Use it to track sector trends and signals relevant to your market.`,
  'market-signals':        `I've opened Market Signals. Live intent, news, and sentiment data is being pulled for your market.`,
  'audience-profiles':     `I've opened Audience Profiles. Build or refine your personas there, or describe your ICP and I'll help structure it.`,
  // Strategy & positioning
  'positioning':           `I've opened Positioning & Strategy. Work through your competitive angle there, or chat here to think it through first.`,
  'offer-design':          `I've opened Offer Design. Define your core offer there — pricing, value props, guarantees.`,
  'messaging':             `I've opened Messaging & Copy. Build your copy frameworks there, or share your draft and I'll give feedback.`,
  'launch-strategy':       `I've opened Launch Strategy. Build your GTM plan there, or tell me what you're launching and we can scope it together.`,
  'setup':                 `I've opened Company Setup. Fill in your brand context there — agents use this to personalise every output.`,
  // Campaigns & channels
  'social-calendar':       `I've opened the Social Calendar. Plan your content schedule there, or tell me how many posts you need per week.`,
  'channel-health':        `I've opened Channel Health. Your daily marketing brief is loading — review the cross-channel overview.`,
  'ad-creative':           `I've opened Ad Creative. Generate and test new ad variants there, or share your current ads and I'll analyse them.`,
  'paid-ads':              `I've opened Paid Ads. Define your budget, audience, and creative brief there.`,
  'email-sequence':        `I've opened Email Sequences. Build your nurture flow there, or describe your goal and I'll draft the sequence structure.`,
  'lead-outreach':         `I've opened Lead Outreach. Upload your list and configure the sequence there.`,
  'landing-pages':         `I've opened Landing Pages. Build or audit your landing page there, or share the URL for a CRO review.`,
  'referral-program':      `I've opened Referral Program. Design your program mechanics there — reward structure, sharing flows, tracking.`,
  // Growth & optimisation
  'action-plan':           `I've opened Goal → Action Plan. Enter your goal there and I'll break it into a prioritised action plan.`,
  'cro-audit':             `I've opened CRO Audit. Enter your funnel URL or describe your flow and I'll find the biggest conversion leaks.`,
  'ab-test':               `I've opened A/B Tests. Define your hypothesis there, or tell me what you want to test and I'll help structure it.`,
  'cro':                   `I've opened CRO. This is your continuous optimisation workspace — offers, copy, flows, and friction analysis.`,
  'marketing-audit':       `I've opened Marketing Audit. I'll run a structured review across your channels, spend, and pipeline.`,
  'revenue-ops':           `I've opened Revenue Operations. Pipeline, attribution, and ops analysis is ready — describe what you want to diagnose.`,
  'lead-magnets':          `I've opened Lead Magnets. Create a high-converting lead magnet there, or describe your audience and I'll suggest formats.`,
  'sales-enablement':      `I've opened Sales Enablement. Build battle cards, decks, and sales scripts there.`,
  'churn-prevention':      `I've opened Churn Prevention. I'll help you identify at-risk accounts and build a retention playbook.`,
};


const CHAT_CONTRACT_KEY_RE = /"(agent|run_id|artifact|tasks_created|contract|confidence)"\s*:/

function sanitizeAgentStreamText(content: string): string {
  if (!content.trim()) return '';

  let cleaned = content;

  // Hard delimiters — cut everything after these
  const contractMarkerIndex = cleaned.indexOf('---CONTRACT---');
  if (contractMarkerIndex >= 0) {
    cleaned = cleaned.slice(0, contractMarkerIndex);
  }
  cleaned = cleaned
    .replace(/\n?Structured Output \(for downstream agents\)[\s\S]*$/i, '')
    .replace(/\n?Contract Block \(required\)[\s\S]*$/i, '')
    .replace(/\n?##\s*Output Contract[\s\S]*$/i, '')
    // Raw JSON objects starting with known contract keys
    .replace(/\n?\{\s*"agent"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"run_id"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"artifact"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"tasks_created"\s*:[\s\S]*$/, '');

  // Remove JSON code fences
  cleaned = cleaned.replace(/```json[\s\S]*?```/gi, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
    if (!inner) return '';
    try {
      JSON.parse(inner);
      return '';
    } catch {
      return block;
    }
  });

  // Fallback: strip trailing JSON block whose keys look like a contract
  const lastBrace = cleaned.lastIndexOf('\n{');
  if (lastBrace > 0 && CHAT_CONTRACT_KEY_RE.test(cleaned.slice(lastBrace))) {
    cleaned = cleaned.slice(0, lastBrace);
  }

  const trimmed = cleaned.trim();
  if (!trimmed) return '';

  // If entire response is JSON, extract readable field or discard
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary.trim();
      return '';
    }
  } catch {
    // not raw JSON, keep prose
  }

  // Strip internal system terms
  return trimmed
    .replace(/\bMKG\b/g, 'company context')
    .replace(/\bSOUL\b/g, '')
    .replace(/\b(run_id|company_id|task_type)\b/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type ParsedAgentPresentation = {
  title: string | null;
  summary: string;
  highlights: string[];
  sections: Array<{ heading: string; items: string[] }>;
  moduleShortcut: { label: string; moduleId: string } | null;
};

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function inferModuleShortcut(title: string | null, content: string): ParsedAgentPresentation['moduleShortcut'] {
  const haystack = `${title || ''} ${content}`.toLowerCase();
  if (haystack.includes('budget') || haystack.includes('roas') || haystack.includes('cpa')) {
    return { label: 'Open Budget Analysis', moduleId: 'budget-optimization' };
  }
  if (haystack.includes('lead') || haystack.includes('pipeline') || haystack.includes('outreach')) {
    return { label: 'Open Lead Intelligence', moduleId: 'lead-intelligence' };
  }
  if (haystack.includes('content') || haystack.includes('calendar') || haystack.includes('seo')) {
    return { label: 'Open Content Workspace', moduleId: 'ai-content' };
  }
  if (haystack.includes('campaign') || haystack.includes('social') || haystack.includes('creative')) {
    return { label: 'Open Campaign Workspace', moduleId: 'social-media' };
  }
  if (haystack.includes('company') || haystack.includes('competitor') || haystack.includes('snapshot')) {
    return { label: 'Open Company Intel', moduleId: 'company-intel' };
  }
  return null;
}

function parseAgentPresentation(content: string): ParsedAgentPresentation {
  const normalized = content.trim();
  const titleMatch = normalized.match(/^\*\*(.+?)\*\*\s*/);
  const title = titleMatch ? stripInlineMarkdown(titleMatch[1]) : null;
  const body = titleMatch ? normalized.slice(titleMatch[0].length).trim() : normalized;

  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const highlights: string[] = [];
  const sections: Array<{ heading: string; items: string[] }> = [];
  const summaryParts: string[] = [];
  let currentSection: { heading: string; items: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      currentSection = { heading: stripInlineMarkdown(headingMatch[1]), items: [] };
      sections.push(currentSection);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      const item = stripInlineMarkdown(bulletMatch[1]);
      if (currentSection) currentSection.items.push(item);
      else if (highlights.length < 4) highlights.push(item);
      continue;
    }

    if (currentSection) {
      currentSection.items.push(stripInlineMarkdown(line));
    } else {
      summaryParts.push(stripInlineMarkdown(line));
    }
  }

  return {
    title,
    summary: summaryParts.join(' ').trim(),
    highlights,
    sections: sections.filter((section) => section.items.length > 0).slice(0, 3),
    moduleShortcut: inferModuleShortcut(title, body),
  };
}

function AgentResponseBlocks({
  content,
  onModuleSelect,
}: {
  content: string;
  onModuleSelect?: (moduleId: string) => void;
}) {
  const parsed = parseAgentPresentation(content);
  const shouldRenderBlocks = Boolean(parsed.title || parsed.highlights.length || parsed.sections.length);

  if (!shouldRenderBlocks) {
    const richTextHtml = markdownToRichText(content);
    return (
      <div
        className="text-sm prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: richTextHtml }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {parsed.title ? (
        <div className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 dark:border-orange-900/30 dark:from-orange-950/30 dark:via-gray-950 dark:to-amber-950/20">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">Veena Brief</div>
          <div className="mt-1 text-base font-semibold text-foreground">{parsed.title}</div>
          {parsed.summary ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{parsed.summary}</p> : null}
          {parsed.moduleShortcut && onModuleSelect ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 rounded-full border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/30"
              onClick={() => onModuleSelect(parsed.moduleShortcut!.moduleId)}
            >
              {parsed.moduleShortcut.label}
            </Button>
          ) : null}
        </div>
      ) : null}

      {parsed.highlights.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {parsed.highlights.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="rounded-xl border border-border/70 bg-background/80 p-3 text-sm leading-6 shadow-sm"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-500">Insight {index + 1}</div>
              <div className="mt-1 text-foreground">{item}</div>
            </div>
          ))}
        </div>
      ) : null}

      {parsed.sections.map((section) => (
        <div key={section.heading} className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{section.heading}</div>
          <div className="mt-2 space-y-2">
            {section.items.slice(0, 4).map((item, index) => (
              <div key={`${section.heading}-${index}`} className="flex items-start gap-2 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-orange-500" />
                <div className="leading-6 text-foreground">{item}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}

function ThinkingBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <style>{`
        @keyframes shimmer-ltr {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .thinking-shimmer { animation: shimmer-ltr 1.8s ease-in-out infinite; }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span
          className={cn(
            'inline-block transition-transform duration-200',
            open ? 'rotate-90' : 'rotate-0'
          )}
        >
          ▶
        </span>
        <span className="relative overflow-hidden rounded px-0.5">
          <span className={cn('relative z-10', isStreaming ? 'text-muted-foreground' : '')}>
            Thinking
          </span>
          {isStreaming && (
            <span
              className="thinking-shimmer pointer-events-none absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
              aria-hidden
            />
          )}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-border/50 bg-muted/30 p-3 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap">
          {reasoning || <span className="italic opacity-50">Still thinking...</span>}
        </div>
      )}
    </div>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')        // bold
    .replace(/\*(.+?)\*/g, '$1')            // italic
    .replace(/__(.+?)__/g, '$1')            // bold alt
    .replace(/_(.+?)_/g, '$1')              // italic alt
    .replace(/~~(.+?)~~/g, '$1')            // strikethrough
    .replace(/`{1,3}[^`]*`{1,3}/g, '')      // inline code / code blocks
    .replace(/^\|.*\|$/gm, '')              // table rows
    .replace(/^\s*[-|:]+[-|:\s]*$/gm, '')   // table dividers
    .replace(/^[-*+]\s+/gm, '')             // unordered bullets
    .replace(/^\d+\.\s+/gm, '')             // ordered bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')// links → label only
    .replace(/\n{3,}/g, '\n\n')             // collapse excess blank lines
    .trim();
}

// Extract file artifact references from agent responses
// Matches patterns like: "brand-guidelines.md", "📄 business-profile.md | File | Saved"
function extractFileArtifacts(text: string): string[] {
  const found: string[] = [];
  const re = /(?:📄\s*)?([a-z0-9_-]+\.(?:md|pdf|csv|json|txt))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

function FileArtifactCard({ name, onView }: { name: string; onView?: () => void }) {
  const ext = name.split('.').pop() ?? 'file';
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2 mt-2">
      <div className="h-7 w-7 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
        <FileText className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate text-foreground">{name}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{ext} · Saved</p>
      </div>
      {onView && (
        <button
          onClick={onView}
          className="flex-shrink-0 text-[10px] text-orange-500 hover:underline font-medium"
        >
          View
        </button>
      )}
    </div>
  );
}

function FormattedMessage({
  content,
  reasoning,
  isReasoningStreaming,
  isAI,
  onModuleSelect: _onModuleSelect,
}: {
  content: string;
  reasoning?: string;
  isReasoningStreaming?: boolean;
  isAI: boolean;
  onModuleSelect?: (moduleId: string) => void;
}) {
  if (!isAI) return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  const plain = stripMarkdown(content);
  const artifacts = isAI ? extractFileArtifacts(content) : [];
  return (
    <>
      {(reasoning || isReasoningStreaming) && (
        <ThinkingBlock reasoning={reasoning ?? ''} isStreaming={isReasoningStreaming} />
      )}
      <p className="text-sm whitespace-pre-wrap leading-6">{plain}</p>
      {artifacts.map(name => (
        <FileArtifactCard
          key={name}
          name={name}
          onView={_onModuleSelect ? () => _onModuleSelect('workspace-files') : undefined}
        />
      ))}
    </>
  );
}

// -- MKG helpers

function formatMkgAsContext(mkg: Record<string, unknown>): string {
  const FIELD_LABELS: Record<string, string> = {
    positioning: 'Positioning',
    icp: 'Ideal customer profile',
    competitors: 'Competitors',
    offers: 'Offers / products',
    messaging: 'Key messaging',
    channels: 'Marketing channels',
    funnel: 'Funnel',
    content_pillars: 'Content pillars',
    campaigns: 'Active campaigns',
    insights: 'Recent insights',
  };

  const lines: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const field = mkg[key] as { value?: unknown } | undefined;
    if (!field?.value) continue;
    const val = typeof field.value === 'string'
      ? field.value.slice(0, 400)
      : JSON.stringify(field.value).slice(0, 400);
    if (val && val !== 'null' && val !== '{}' && val !== '[]') {
      lines.push(`**${label}:** ${val}`);
    }
  }
  return lines.join('\n');
}

// -- Module ID → MODULE_NAV_RESPONSES key map
const MODULE_NAV_KEY: Record<string, string> = {
  'company-intelligence': 'company-intel',
  'ai-voice-bot': 'voice-bot',
  'ai-video-bot': 'video-bot',
  'unified-customer-view': 'customer-view',
};
function navResponseKey(moduleId: string): string {
  return MODULE_NAV_KEY[moduleId] ?? moduleId;
}

// -- Initial messages

const initialMessages: Message[] = [
  {
    id: '1',
    content: "Hi, I'm Veena. What are you working on today?",
    sender: 'ai',
    timestamp: new Date(),
  },
];

// -- Props

interface ChatHomeProps {
  onClose?: () => void;
  onModuleSelect?: (moduleId: string | null) => void;
  activeConversationId?: string | null;
  onConversationsChange?: () => void;
  hideHeader?: boolean;
}

// -- Component

const TOOL_USE_LABELS = [
  'Analysing your context...',
  'Checking brand knowledge base...',
  'Running market analysis...',
  'Looking up performance data...',
  'Generating recommendations...',
  'Searching web for insights...',
  'Crafting your response...',
];

// ── Subagent card colors ──────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, { bg: string; border: string; label: string; avatar: string }> = {
  maya:  { bg: 'bg-green-50/80 dark:bg-green-950/20',   border: 'border-green-200/70 dark:border-green-900/40',   label: 'text-green-700 dark:text-green-400',   avatar: 'bg-green-500' },
  arjun: { bg: 'bg-blue-50/80 dark:bg-blue-950/20',     border: 'border-blue-200/70 dark:border-blue-900/40',     label: 'text-blue-700 dark:text-blue-400',     avatar: 'bg-blue-500' },
  riya:  { bg: 'bg-purple-50/80 dark:bg-purple-950/20', border: 'border-purple-200/70 dark:border-purple-900/40', label: 'text-purple-700 dark:text-purple-400', avatar: 'bg-purple-500' },
  zara:  { bg: 'bg-pink-50/80 dark:bg-pink-950/20',     border: 'border-pink-200/70 dark:border-pink-900/40',     label: 'text-pink-700 dark:text-pink-400',     avatar: 'bg-pink-500' },
  dev:   { bg: 'bg-amber-50/80 dark:bg-amber-950/20',   border: 'border-amber-200/70 dark:border-amber-900/40',   label: 'text-amber-700 dark:text-amber-400',   avatar: 'bg-amber-500' },
  priya: { bg: 'bg-indigo-50/80 dark:bg-indigo-950/20', border: 'border-indigo-200/70 dark:border-indigo-900/40', label: 'text-indigo-700 dark:text-indigo-400', avatar: 'bg-indigo-500' },
  kiran: { bg: 'bg-teal-50/80 dark:bg-teal-950/20',     border: 'border-teal-200/70 dark:border-teal-900/40',     label: 'text-teal-700 dark:text-teal-400',     avatar: 'bg-teal-500' },
  sam:   { bg: 'bg-cyan-50/80 dark:bg-cyan-950/20',     border: 'border-cyan-200/70 dark:border-cyan-900/40',     label: 'text-cyan-700 dark:text-cyan-400',     avatar: 'bg-cyan-500' },
  isha:  { bg: 'bg-rose-50/80 dark:bg-rose-950/20',     border: 'border-rose-200/70 dark:border-rose-900/40',     label: 'text-rose-700 dark:text-rose-400',     avatar: 'bg-rose-500' },
  neel:  { bg: 'bg-slate-50/80 dark:bg-slate-950/20',   border: 'border-slate-200/70 dark:border-slate-900/40',   label: 'text-slate-700 dark:text-slate-400',   avatar: 'bg-slate-500' },
  tara:  { bg: 'bg-orange-50/80 dark:bg-orange-950/20', border: 'border-orange-200/70 dark:border-orange-900/40', label: 'text-orange-700 dark:text-orange-400', avatar: 'bg-orange-500' },
};
const DEFAULT_AGENT_COLORS = { bg: 'bg-zinc-50/80 dark:bg-zinc-900/30', border: 'border-zinc-200/70 dark:border-zinc-800/40', label: 'text-zinc-700 dark:text-zinc-300', avatar: 'bg-zinc-500' };

// ── Autonomous agent sequence helpers ────────────────────────────────────────

type SequenceAgent = {
  name: string;
  displayName: string;
  role: string;
  query: string;
};

const URL_RE = /https?:\/\/[^\s)>"]+/i;

function buildUrlAnalysisSequence(url: string): SequenceAgent[] {
  return [
    {
      name: 'maya',
      displayName: 'Maya',
      role: 'SEO & LLMO Monitor',
      query: `Analyse the SEO and AI answer engine (LLMO) presence for ${url}. Surface the top keyword opportunities, ranking gaps, and visibility in AI summaries. Use any connected Google Search Console or Ahrefs data if available via Composio.`,
    },
    {
      name: 'arjun',
      displayName: 'Arjun',
      role: 'Lead Intelligence',
      query: `Based on the business at ${url}, define the ideal customer profile. Identify the top 3 target segments, key buying signals, and recommended outreach approach. Use Apollo or LinkedIn data if available via Composio.`,
    },
    {
      name: 'dev',
      displayName: 'Dev',
      role: 'Performance Analyst',
      query: `Analyse the estimated performance and analytics footprint for ${url}. What are the traffic trends, funnel drop-offs, and top 3 conversion improvements to prioritise? Use GA4 or PostHog data if connected via Composio.`,
    },
    {
      name: 'riya',
      displayName: 'Riya',
      role: 'Content Producer',
      query: `Review the content strategy visible at ${url}. What content gaps exist, which formats are underused, and what are the top 3 content pieces to publish next for maximum impact?`,
    },
    {
      name: 'zara',
      displayName: 'Zara',
      role: 'Campaign Strategist',
      query: `Based on the website ${url} and its market position, what campaign strategy would you recommend? Which paid and organic channels, messaging angles, and campaign formats should we prioritise for Q2?`,
    },
  ];
}

function buildBroadQuerySequence(query: string): SequenceAgent[] | null {
  if (!/audit|full.?analysis|analyse (my|our)|analyze (my|our)|review (my|our)|(marketing|growth) strategy|go.?to.?market|gtm plan/i.test(query)) {
    return null;
  }
  return [
    {
      name: 'maya',
      displayName: 'Maya',
      role: 'SEO & LLMO Monitor',
      query: `${query} — give your SEO and LLMO perspective: keyword opportunities, ranking position, and AI answer engine visibility.`,
    },
    {
      name: 'arjun',
      displayName: 'Arjun',
      role: 'Lead Intelligence',
      query: `${query} — from a lead intelligence angle: ICP definition, top segments, and outreach priorities.`,
    },
    {
      name: 'dev',
      displayName: 'Dev',
      role: 'Performance Analyst',
      query: `${query} — identify the key performance metrics, funnel gaps, and top 3 growth levers.`,
    },
    {
      name: 'riya',
      displayName: 'Riya',
      role: 'Content Producer',
      query: `${query} — what content strategy and specific content pieces do you recommend for the next 30 days?`,
    },
  ];
}

function SubagentMessageCard({ message, onModuleSelect }: { message: Message; onModuleSelect?: (id: string) => void }) {
  const colors = (message.agentId ? AGENT_COLORS[message.agentId] : null) ?? DEFAULT_AGENT_COLORS;
  const initial = (message.agentName ?? 'A').charAt(0).toUpperCase();
  const plain = stripMarkdown(message.content);
  const artifacts = extractFileArtifacts(message.content);
  return (
    <div className={cn('w-full rounded-2xl border px-4 pt-3 pb-3', colors.border, colors.bg)}>
      {/* Agent header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0', colors.avatar)}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-semibold leading-tight', colors.label)}>{message.agentName}</p>
          {message.agentRole && <p className="text-[10px] text-muted-foreground">{message.agentRole}</p>}
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {/* Tool-call status (Helena-style: "Working on google_analytics…") */}
      {message.toolStatus && !message.content && (
        <p className="text-xs text-muted-foreground italic mb-1 animate-pulse">{message.toolStatus}</p>
      )}
      {/* Content */}
      <p className="text-sm whitespace-pre-wrap leading-6">{plain}</p>
      {/* Inline tool status shown alongside partial content while streaming */}
      {message.toolStatus && message.content && (
        <p className="text-xs text-muted-foreground italic mt-1 animate-pulse">{message.toolStatus}</p>
      )}
      {artifacts.map(name => (
        <FileArtifactCard
          key={name}
          name={name}
          onView={onModuleSelect ? () => onModuleSelect('workspace-files') : undefined}
        />
      ))}
    </div>
  );
}

export function ChatHome({ onClose, onModuleSelect, activeConversationId, onConversationsChange, hideHeader }: ChatHomeProps) {
  const { activeWorkspace, clearWebsiteUrl } = useWorkspace();
  const { plan, creditsRemaining, creditsTotal } = usePlan();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [showAgentSuggestions, setShowAgentSuggestions] = useState(false);
  const [filteredAgentMentions, setFilteredAgentMentions] = useState<Array<typeof DIRECT_AGENTS[number]>>(Array.from(DIRECT_AGENTS));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentConvIdRef = useRef<string | null>(null);
  const [showCSVAnalysis, setShowCSVAnalysis] = useState(false);
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [taskAgent, setTaskAgent] = useState<EmployeeName | null>(null);
  const [taskDraft, setTaskDraft] = useState('');
  const [isPlanningTask, setIsPlanningTask] = useState(false);
  const [planPreview, setPlanPreview] = useState<AgentExecutionPlan | null>(null);
  const [mkgContext, setMkgContext] = useState<string>('');
  const [reasoningStreamingId, setReasoningStreamingId] = useState<string | null>(null);
  const [typingLabelIdx, setTypingLabelIdx] = useState(0);
  const [activeTypingAgent, setActiveTypingAgent] = useState<SequenceAgent | null>(null);

  useEffect(() => {
    if (!isTyping) { setTypingLabelIdx(0); return; }
    const timer = setInterval(() => {
      setTypingLabelIdx(i => (i + 1) % TOOL_USE_LABELS.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [isTyping]);

  const sendQuickMessage = (text: string) => {
    setInputValue(text);
    // Use a microtask so the input state is committed before send fires
    setTimeout(() => {
      setInputValue('');
      const userMessage: Message = {
        id: Date.now().toString(),
        content: text,
        sender: 'user',
        timestamp: new Date(),
      };
      onMessagesChange(prev => [...prev, userMessage]);
      setIsTyping(true);
      const history: ChatMessage[] = [
        ...messages.map(m => ({
          role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: text },
      ];
      const placeholderId = (Date.now() + 1).toString();
      onMessagesChange(prev => [...prev, { id: placeholderId, content: '', sender: 'ai' as const, timestamp: new Date() }]);
      let streamedContent = '';
      let streamedReasoning = '';
      setReasoningStreamingId(placeholderId);
      askVeena(
        history,
        mkgContext,
        (token) => {
          streamedContent += token;
          if (streamedContent.length <= token.length) setIsTyping(false);
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: streamedContent } : m));
        },
        (token) => {
          streamedReasoning += token;
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, reasoning: streamedReasoning } : m));
        },
      ).then(veena => {
        setReasoningStreamingId(null);
        if (veena.route === 'agent') {
          setMessages(prev => prev.filter(m => m.id !== placeholderId));
          const ackMsg: Message = { id: (Date.now() + 2).toString(), content: `On it — routing this to ${veena.label}.`, sender: 'ai', timestamp: new Date() };
          onMessagesChange(prev => [...prev, ackMsg]);
          setIsTyping(false);
          return runAgentSlashCommand({ name: veena.agentName, label: veena.label, defaultQuery: veena.query }, veena.query);
        }
        if (veena.route === 'module') {
          setMessages(prev => prev.filter(m => m.id !== placeholderId));
          if (onModuleSelect) onModuleSelect(veena.moduleId);
          const navKey = navResponseKey(veena.moduleId);
          const msg: Message = { id: (Date.now() + 2).toString(), content: MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${veena.label} for you.`, sender: 'ai', timestamp: new Date() };
          onMessagesChange(prev => [...prev, msg]);
          setIsTyping(false);
          return;
        }
        // answer — persist final streamed content + reasoning
        onMessagesChange(prev => prev.map(m =>
          m.id === placeholderId
            ? { ...m, content: streamedContent, reasoning: streamedReasoning || undefined }
            : m
        ));
      }).catch(() => {
        setReasoningStreamingId(null);
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
        const msg: Message = { id: (Date.now() + 2).toString(), content: "Sorry, I'm having trouble connecting right now.", sender: 'ai', timestamp: new Date() };
        onMessagesChange(prev => [...prev, msg]);
      }).finally(() => setIsTyping(false));
    }, 0);
  };

  // -- Fetch MKG when company context changes
  useEffect(() => {
    const ctx = getActiveAgentContext();
    const companyId = ctx.companyId;
    if (!companyId) return;
    fetch(`/api/mkg/${companyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.mkg) return;
        const lines: string[] = [];
        if (ctx.companyName) lines.push(`**Company:** ${ctx.companyName}`);
        if (ctx.websiteUrl) lines.push(`**Website:** ${ctx.websiteUrl}`);
        const fieldContext = formatMkgAsContext(data.mkg);
        if (fieldContext) lines.push(fieldContext);
        setMkgContext(lines.join('\n'));
      })
      .catch(() => { /* non-blocking */ });
  }, [activeWorkspace?.id]);

  // -- Helpers

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <Image className="h-4 w-4" />;
    if (fileType.includes('pdf')) return <FileText className="h-4 w-4" />;
    if (fileType.includes('csv') || fileType.includes('excel') || fileType.includes('spreadsheet')) return <FileSpreadsheet className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  // -- Conversation persistence

  const persistMessages = (updatedMessages: Message[], convId: string | null): string => {
    const conversations = loadConversations(activeWorkspace?.id);
    const id = convId ?? `conv-${Date.now()}`;
    const firstUserMsg = updatedMessages.find(m => m.sender === 'user');
    const name = firstUserMsg ? generateName(firstUserMsg.content) : 'New conversation';
    const now = new Date();
    const existing = conversations.find(c => c.id === id);
    if (existing) {
      existing.messages = updatedMessages;
      existing.lastMessageAt = now;
    } else {
      conversations.push({ id, name, createdAt: now, lastMessageAt: now, messages: updatedMessages });
    }
    saveConversations(conversations, activeWorkspace?.id);
    currentConvIdRef.current = id;
    if (!convId) setCurrentConvId(id);
    onConversationsChange?.();
    return id;
  };

  const onMessagesChange: Dispatch<SetStateAction<Message[]>> = (updater) => {
    setMessages(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistMessages(next, currentConvIdRef.current);
      return next;
    });
  };

  // -- Load conversation when activeConversationId changes

  useEffect(() => {
    if (!activeConversationId) return;
    const conversations = loadConversations(activeWorkspace?.id);
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      setMessages(conv.messages);
      setCurrentConvId(conv.id);
      currentConvIdRef.current = conv.id;
    }
  }, [activeConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!selectedFile) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // -- New conversation

  const handleNewConversation = () => {
    setMessages(initialMessages);
    setCurrentConvId(null);
    currentConvIdRef.current = null;
  };

  const handleDeleteConversation = async () => {
    try {
      if (currentConvId) {
        const conversations = loadConversations(activeWorkspace?.id).filter((conversation) => conversation.id !== currentConvId);
        saveConversations(conversations, activeWorkspace?.id);
      }

      try {
        sessionStorage.removeItem('marqq_company_intel_autorun');
      } catch {
        // non-blocking
      }

      await clearWebsiteUrl();
      setMessages(initialMessages);
      setCurrentConvId(null);
      currentConvIdRef.current = null;
      onConversationsChange?.();
      toast.success('Home screen reset');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset home screen');
    }
  };

  // -- Input handling

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.startsWith('/')) {
      const query = value.toLowerCase();
      const filtered = SLASH_COMMANDS.filter(cmd =>
        cmd.command.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query.slice(1))
      );
      setFilteredCommands(filtered);
      setShowSuggestions(true);
      setShowAgentSuggestions(false);
    } else {
      setShowSuggestions(false);
      const mentionMatch = value.match(/(?:^|\s)@([a-z]*)$/i);
      if (mentionMatch) {
        const query = mentionMatch[1].toLowerCase();
        const filteredAgents = DIRECT_AGENTS.filter((agent) =>
          agent.name.includes(query) || agent.label.toLowerCase().includes(query)
        );
        setFilteredAgentMentions(filteredAgents);
        setShowAgentSuggestions(filteredAgents.length > 0);
      } else {
        setShowAgentSuggestions(false);
      }
    }
  };

  const parseAgentMention = (value: string): { agent: EmployeeName; task: string } | null => {
    const match = value.trim().match(/^@([a-z]+)\s*(?:[-:]\s*|\s+)(.+)$/i);
    if (!match) return null;
    const agent = match[1].toLowerCase() as EmployeeName;
    const task = match[2].trim();
    if (!DIRECT_AGENTS.some((entry) => entry.name === agent) || !task) return null;
    return { agent, task };
  };

  const handleAgentSuggestionClick = (agentName: EmployeeName) => {
    setInputValue((prev) => prev.replace(/(?:^|\s)@[a-z]*$/i, ` @${agentName} `).trimStart());
    setShowAgentSuggestions(false);
  };

  const openAgentTaskFlow = (agent: EmployeeName, task: string) => {
    setTaskAgent(agent);
    setTaskDraft(task);
    setPlanPreview(null);
    setShowAgentSuggestions(false);
  };

  // -- Slash command execution

  const executeSlashCommand = async (command: string) => {
    const cmd = SLASH_COMMANDS.find(c => c.command === command);
    if (!cmd) return false;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: command,
      sender: 'user',
      timestamp: new Date(),
    };

    onMessagesChange(prev => [...prev, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsTyping(true);

    if (onModuleSelect && cmd.action !== 'help') {
      // Map slash-command action → dashboardData module id
      const moduleMap: Record<string, string> = {
        // Core automation
        'lead-intelligence':     'lead-intelligence',
        'voice-bot':             'ai-voice-bot',
        'video-bot':             'ai-video-bot',
        'social-media':          'social-media',
        'user-engagement':       'user-engagement',
        'budget-optimization':   'budget-optimization',
        'performance-scorecard': 'performance-scorecard',
        'ai-content':            'ai-content',
        'customer-view':         'unified-customer-view',
        'seo-llmo':              'seo-llmo',
        'company-intel':         'company-intelligence',
        // Intelligence & research
        'industry-intelligence': 'industry-intelligence',
        'market-signals':        'market-signals',
        'audience-profiles':     'audience-profiles',
        // Strategy & positioning
        'positioning':           'positioning',
        'offer-design':          'offer-design',
        'messaging':             'messaging',
        'launch-strategy':       'launch-strategy',
        'setup':                 'setup',
        // Campaigns & channels
        'social-calendar':       'social-calendar',
        'channel-health':        'channel-health',
        'ad-creative':           'ad-creative',
        'paid-ads':              'paid-ads',
        'email-sequence':        'email-sequence',
        'lead-outreach':         'lead-outreach',
        'landing-pages':         'landing-pages',
        'referral-program':      'referral-program',
        // Growth & optimisation
        'action-plan':           'action-plan',
        'cro-audit':             'cro-audit',
        'ab-test':               'ab-test',
        'cro':                   'cro',
        'marketing-audit':       'marketing-audit',
        'revenue-ops':           'revenue-ops',
        'lead-magnets':          'lead-magnets',
        'sales-enablement':      'sales-enablement',
        'churn-prevention':      'churn-prevention',
      };
      const moduleId = moduleMap[cmd.action];
      if (moduleId) {
        window.location.hash = 'auto-start';
        onModuleSelect(moduleId);
      } else if (cmd.action === 'agents') {
        onModuleSelect('dashboard');
      } else if (cmd.action === 'workflows') {
        onModuleSelect('workflow-builder');
      }
    }

    try {
      let responseContent = '';

      switch (cmd.action) {
        case 'help':
          responseContent = `Just tell me what you're working on in plain language — I'll figure out where to take it.\n\nType \`/\` to see all available workspaces, or use \`@name\` to send work directly to a specialist.\n\n**Specialists:** @maya (SEO), @arjun (leads), @riya (content), @zara (campaigns), @dev (performance), @priya (brand), @kiran (social), @sam (email)`;
          break;
        default: {
          // All module-nav actions resolve via MODULE_NAV_RESPONSES lookup
          const navKey = cmd.action === 'company-intel' ? 'company-intel' : cmd.action;
          responseContent = MODULE_NAV_RESPONSES[navKey] ?? '';
          if (!responseContent) return false;
          break;
        }
      }

      if (cmd.action !== 'help') {
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseContent,
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange(prev => {
        const alreadyHasUser = prev.some(m => m.id === userMessage.id);
        return alreadyHasUser ? [...prev, aiMessage] : [...prev, userMessage, aiMessage];
      });

      if (cmd.action !== 'help') {
        toast.success(`Opened ${cmd.command.slice(1)}`);
      }
      return true;
    } catch (error) {
      console.error('Slash command error:', error);
      toast.error('Failed to execute command. Please try again.');
      return false;
    } finally {
      setIsTyping(false);
    }
  };

  // -- Digital employee slash command: streams SSE response into chat

  const runAgentSlashCommand = async (agentEntry: { name: string; label: string; defaultQuery: string }, extraQuery: string) => {
    const query = extraQuery.trim() || agentEntry.defaultQuery;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    onMessagesChange(prev => [...prev, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsTyping(true);

    try {
      const res = await fetch(`/api/agents/${agentEntry.name}/run`, {
        method: 'POST',
        headers: buildAgentHeaders(),
        body: JSON.stringify(buildAgentRunPayload({ query })),
      });

      if (!res.ok) {
        let errMsg = `${agentEntry.label} is not available right now.`;
        try {
          const errBody = await res.clone().json();
          if (errBody.message) errMsg = errBody.message;
          else if (errBody.error === 'insufficient_credits') errMsg = 'You have used all your agent run credits for this month.';
          else if (errBody.error === 'module_locked') errMsg = `This module is not available on your current plan. ${errBody.message || ''}`.trim();
        } catch { /* ignore parse error */ }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let accumulated = '';

      // Create a streaming placeholder card (Helena-style: live tool-status updates)
      const [agentDisplayName, agentRole] = agentEntry.label.split(' · ');
      const slashPlaceholderId = `slash-${agentEntry.name}-${Date.now()}`;
      const slashPlaceholder: Message = {
        id: slashPlaceholderId,
        content: '',
        sender: 'ai',
        timestamp: new Date(),
        agentName: agentDisplayName?.trim() || agentEntry.label,
        agentRole: agentRole?.trim(),
        agentId: agentEntry.name,
        toolStatus: `Working on ${agentEntry.name}…`,
      };
      setMessages(prev => [...prev, slashPlaceholder]);
      setIsTyping(false);

      if (reader) {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break outer;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.contract || parsed.contractError || parsed.details) continue;
              if (parsed.tool_call) {
                const toolName = parsed.tool_call?.function?.name || parsed.tool_call?.name || '';
                const label = toolName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                setMessages(prev => prev.map(m =>
                  m.id === slashPlaceholderId ? { ...m, toolStatus: `Working on ${label}…` } : m,
                ));
              }
              if (parsed.text) {
                accumulated += parsed.text;
                setMessages(prev => prev.map(m =>
                  m.id === slashPlaceholderId ? { ...m, content: accumulated, toolStatus: undefined } : m,
                ));
              }
              if (parsed.error) throw new Error(parsed.error);
            } catch { /* ignore parse errors on partial chunks */ }
          }
        }
      }

      const visibleResponse = sanitizeAgentStreamText(accumulated);

      const aiMessage: Message = {
        id: slashPlaceholderId,
        content: visibleResponse || 'Task completed. I have the result ready, but the agent did not return a user-facing summary.',
        sender: 'ai',
        timestamp: new Date(),
        agentName: agentDisplayName?.trim() || agentEntry.label,
        agentRole: agentRole?.trim(),
        agentId: agentEntry.name,
        toolStatus: undefined,
      };
      onMessagesChange(prev => prev.map(m => m.id === slashPlaceholderId ? aiMessage : m));
      toast.success(`${agentEntry.label} responded`);
    } catch (err) {
      const [agentDisplayName, agentRole] = agentEntry.label.split(' · ');
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Offline or not configured. Make sure the AI backend is running (\`npm run dev:backend\`) and \`GROQ_API_KEY\` is set.`,
        sender: 'ai',
        timestamp: new Date(),
        agentName: agentDisplayName?.trim() || agentEntry.label,
        agentRole: agentRole?.trim(),
        agentId: agentEntry.name,
      };
      onMessagesChange(prev => [...prev, errorMessage]);
      toast.error(String(err));
    } finally {
      setIsTyping(false);
    }
  };

  // -- Autonomous agent sequence — streams each agent card in order
  const runAgentSequence = async (agents: SequenceAgent[], introText: string) => {
    // Post Veena orchestration message
    const introMsg: Message = {
      id: Date.now().toString(),
      content: introText,
      sender: 'ai',
      timestamp: new Date(),
    };
    onMessagesChange(prev => [...prev, introMsg]);

    for (const agent of agents) {
      setActiveTypingAgent(agent);
      setIsTyping(true);

      // Brief pause so user sees the typing indicator per agent
      await new Promise(r => setTimeout(r, 400));

      try {
        const res = await fetch(`/api/agents/${agent.name}/run`, {
          method: 'POST',
          headers: buildAgentHeaders(),
          body: JSON.stringify(buildAgentRunPayload({ query: agent.query })),
        });

        if (!res.ok) {
          setIsTyping(false);
          const errMsg: Message = {
            id: (Date.now() + Math.random()).toString(),
            content: 'Agent offline — skipping this step.',
            sender: 'ai',
            timestamp: new Date(),
            agentName: agent.displayName,
            agentRole: agent.role,
            agentId: agent.name,
          };
          onMessagesChange(prev => [...prev, errMsg]);
          continue;
        }

        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        let accumulated = '';

        // Create streaming placeholder card (with Helena-style tool-status indicator)
        const placeholderId = `seq-${agent.name}-${Date.now()}`;
        const placeholder: Message = {
          id: placeholderId,
          content: '',
          sender: 'ai',
          timestamp: new Date(),
          agentName: agent.displayName,
          agentRole: agent.role,
          agentId: agent.name,
          toolStatus: `Working on ${agent.name}…`,
        };
        // Add placeholder and hide typing indicator once the card is live
        setMessages(prev => [...prev, placeholder]);
        setIsTyping(false);
        setActiveTypingAgent(null);

        if (reader) {
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of dec.decode(value).split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') break outer;
              try {
                const parsed = JSON.parse(payload);
                if (parsed.contract || parsed.contractError || parsed.details) continue;
                if (parsed.tool_call) {
                  const toolName = parsed.tool_call?.function?.name || parsed.tool_call?.name || '';
                  const label = toolName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                  setMessages(prev => prev.map(m =>
                    m.id === placeholderId ? { ...m, toolStatus: `Working on ${label}…` } : m,
                  ));
                }
                if (parsed.text) {
                  accumulated += parsed.text;
                  setMessages(prev => prev.map(m =>
                    m.id === placeholderId ? { ...m, content: accumulated, toolStatus: undefined } : m,
                  ));
                }
                if (parsed.error) throw new Error(parsed.error);
              } catch { /* ignore partial chunks */ }
            }
          }
        }

        const finalContent = sanitizeAgentStreamText(accumulated) || 'Analysis complete.';
        // Persist the final content via onMessagesChange so it's saved (clear toolStatus)
        onMessagesChange(prev => prev.map(m =>
          m.id === placeholderId ? { ...m, content: finalContent, toolStatus: undefined } : m,
        ));
      } catch {
        setIsTyping(false);
        const errMsg: Message = {
          id: (Date.now() + Math.random()).toString(),
          content: 'Could not reach this agent right now.',
          sender: 'ai',
          timestamp: new Date(),
          agentName: agent.displayName,
          agentRole: agent.role,
          agentId: agent.name,
        };
        onMessagesChange(prev => [...prev, errMsg]);
      }

      // Pause between agents for readability
      await new Promise(r => setTimeout(r, 500));
    }

    setActiveTypingAgent(null);
    setIsTyping(false);
  };

  const createAgentTaskPlan = async () => {
    if (!taskAgent) return;
    const nextRequest = taskDraft.trim();
    if (!nextRequest) {
      toast.error('Describe what you want this agent to do.');
      return;
    }

    setIsPlanningTask(true);
    try {
      const response = await fetch(`/api/agents/${taskAgent}/plan`, {
        method: 'POST',
        headers: buildAgentHeaders(),
        body: JSON.stringify(buildAgentPlanPayload(nextRequest)),
      });
      if (!response.ok) throw new Error(await response.text());
      const plan = await response.json();
      setPlanPreview({
        request: nextRequest,
        summary: String(plan.summary || '').trim(),
        tasks: Array.isArray(plan.tasks) ? plan.tasks : [],
        executionPrompt: String(plan.executionPrompt || '').trim(),
      });
      toast.success(`Plan created for ${taskAgent}.`);
    } catch {
      toast.error('Failed to create the execution plan.');
    } finally {
      setIsPlanningTask(false);
    }
  };

  const approveAgentTaskPlan = async () => {
    if (!taskAgent || !planPreview) return;

    const agentConfig = DIRECT_AGENTS.find((agent) => agent.name === taskAgent);
    if (!agentConfig) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: `@${taskAgent} ${planPreview.request}`,
      sender: 'user',
      timestamp: new Date(),
    };
    onMessagesChange((prev) => [...prev, userMessage]);
    setInputValue('');
    setTaskDraft('');
    setPlanPreview(null);
    setTaskAgent(null);
    setIsTyping(true);

    try {
      const res = await fetch(`/api/agents/${taskAgent}/run`, {
        method: 'POST',
        headers: buildAgentHeaders(),
        body: JSON.stringify(buildAgentRunPayload({ query: planPreview.executionPrompt })),
      });

      if (!res.ok) {
        throw new Error(`${agentConfig.label} is not available right now.`);
      }

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let accumulated = '';

      if (reader) {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break outer;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.contract || parsed.contractError || parsed.details) continue;
              if (parsed.text) accumulated += parsed.text;
              if (parsed.error) throw new Error(parsed.error);
            } catch {
              // ignore partial chunks
            }
          }
        }
      }

      const visibleResponse = sanitizeAgentStreamText(accumulated);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: visibleResponse || 'Task completed. I have the result ready, but the agent did not return a user-facing summary.',
        sender: 'ai',
        timestamp: new Date(),
        agentName: agentConfig.label,
        agentRole: agentConfig.role,
        agentId: agentConfig.name,
      };
      onMessagesChange((prev) => [...prev, aiMessage]);
      toast.success(`${agentConfig.label} is working on it.`);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Offline or unavailable right now. Please try again once the backend is available.',
        sender: 'ai',
        timestamp: new Date(),
        agentName: agentConfig.label,
        agentRole: agentConfig.role,
        agentId: agentConfig.name,
      };
      onMessagesChange((prev) => [...prev, errorMessage]);
      toast.error(String(error));
    } finally {
      setIsTyping(false);
    }
  };

  // -- Send message

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !selectedFile) return;

    const mentionTask = selectedFile ? null : parseAgentMention(inputValue);
    if (mentionTask) {
      openAgentTaskFlow(mentionTask.agent, mentionTask.task);
      return;
    }

    if (inputValue.startsWith('/')) {
      // Check for digital employee slash commands first
      const parts = inputValue.trim().split(/\s+/);
      const cmd = parts[0];
      const agentEntry = SLASH_AGENTS[cmd];
      if (agentEntry) {
        await runAgentSlashCommand(agentEntry, parts.slice(1).join(' '));
        return;
      }

      const success = await executeSlashCommand(inputValue.trim());
      if (success) return;
    }

    let fileInfo = undefined;
    if (selectedFile) {
      fileInfo = {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        url: URL.createObjectURL(selectedFile),
      };
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue || (selectedFile ? `Uploaded file: ${selectedFile.name}` : ''),
      sender: 'user',
      timestamp: new Date(),
      file: fileInfo,
    };

    onMessagesChange(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    const currentFile = selectedFile;
    setInputValue('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // ── URL fast-path: skip Veena routing and immediately orchestrate full team
    if (!currentFile) {
      const urlMatch = currentInput.match(URL_RE);
      if (urlMatch) {
        await runAgentSequence(
          buildUrlAnalysisSequence(urlMatch[0]),
          `Ingesting ${urlMatch[0]} — pulling your full team together. Each specialist will brief you in sequence.`,
        );
        return;
      }
    }

    setIsTyping(true);

    try {
      const chatMessages: ChatMessage[] = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      let messageContent = currentInput;
      if (currentFile) {
        messageContent += ` [File uploaded: ${currentFile.name} (${formatFileSize(currentFile.size)})]`;
      }
      chatMessages.push({ role: 'user', content: messageContent });

      // Create streaming placeholder
      const placeholderId = (Date.now() + 1).toString();
      onMessagesChange(prev => {
        const alreadyHasUser = prev.some(m => m.id === userMessage.id);
        const base = alreadyHasUser ? prev : [...prev, userMessage];
        return [...base, { id: placeholderId, content: '', sender: 'ai' as const, timestamp: new Date() }];
      });

      let streamedContent = '';
      let streamedReasoning = '';
      setReasoningStreamingId(placeholderId);
      const veena: VeenaResponse = await askVeena(
        chatMessages,
        mkgContext,
        (token) => {
          streamedContent += token;
          if (streamedContent.length <= token.length) setIsTyping(false);
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: streamedContent } : m));
        },
        (token) => {
          streamedReasoning += token;
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, reasoning: streamedReasoning } : m));
        },
      );
      setReasoningStreamingId(null);

      const addMessage = (content: string) => {
        const msg: Message = { id: (Date.now() + 2).toString(), content, sender: 'ai', timestamp: new Date() };
        onMessagesChange(prev => {
          const alreadyHasUser = prev.some(m => m.id === userMessage.id);
          return alreadyHasUser ? [...prev, msg] : [...prev, userMessage, msg];
        });
      };

      if (veena.route === 'agent') {
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
        setIsTyping(false);

        // Check if we should orchestrate a full sequence
        const urlInMessage = currentInput.match(URL_RE)?.[0];
        if (urlInMessage) {
          await runAgentSequence(
            buildUrlAnalysisSequence(urlInMessage),
            `Ingesting ${urlInMessage} — I'm pulling your full team together. Each specialist will brief you in order.`,
          );
          return;
        }
        const broadSequence = buildBroadQuerySequence(currentInput);
        if (broadSequence) {
          await runAgentSequence(
            broadSequence,
            `On it — I'm orchestrating a full read on this across your team. Stand by for each brief.`,
          );
          return;
        }

        // Single-agent path
        addMessage(`On it — routing this to ${veena.label}.`);
        await runAgentSlashCommand(
          { name: veena.agentName, label: veena.label, defaultQuery: veena.query },
          veena.query,
        );
        return;
      }

      if (veena.route === 'module') {
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
        if (onModuleSelect) onModuleSelect(veena.moduleId);
        const navKey = navResponseKey(veena.moduleId);
        addMessage(MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${veena.label} for you.`);
        setIsTyping(false);
        return;
      }

      // route === 'answer' — persist final streamed content + reasoning
      onMessagesChange(prev => prev.map(m =>
        m.id === placeholderId
          ? { ...m, content: streamedContent, reasoning: streamedReasoning || undefined }
          : m
      ));
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get AI response. Please try again.');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange(prev => {
        const alreadyHasUser = prev.some(m => m.id === userMessage.id);
        return alreadyHasUser ? [...prev, errorMessage] : [...prev, userMessage, errorMessage];
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && filteredCommands.length > 0) {
        setInputValue(filteredCommands[0].command);
        setShowSuggestions(false);
      } else if (showAgentSuggestions && filteredAgentMentions.length > 0) {
        handleAgentSuggestionClick(filteredAgentMentions[0].name);
      } else {
        handleSendMessage();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowAgentSuggestions(false);
    }
  };

  const handleSuggestionClick = (command: string) => {
    setInputValue(command);
    setShowSuggestions(false);
  };

  // -- File upload

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'text/csv', 'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid CSV, PDF, or image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    toast.success(`${file.name} selected for upload`);

    if (
      file.type === 'text/csv' ||
      file.name.toLowerCase().endsWith('.csv') ||
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.name.toLowerCase().endsWith('.xls')
    ) {
      setCSVFile(file);
      setShowCSVAnalysis(true);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -- Render

  return (
    <>
      <div className="flex h-full flex-col bg-transparent">
        {/* Top bar */}
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
                Veena
              </div>
              <div className="space-y-1">
                <h2 className="font-brand-syne text-[1.35rem] tracking-tight text-foreground">Veena</h2>
                <p className="max-w-[32rem] text-xs leading-5 text-muted-foreground">
                  Tell me what you're working on and I'll take it from there.
                </p>
              </div>
            </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-muted hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              aria-label="Close AI chat"
            >
              Close
            </button>
          )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-4">
            {messages.map((message) => {
              // Specialist subagent message — render as distinct branded card
              if (message.sender === 'ai' && message.agentName) {
                return (
                  <div key={message.id} className="w-full">
                    <SubagentMessageCard message={message} onModuleSelect={onModuleSelect} />
                  </div>
                );
              }

              // Regular Veena / user message bubble
              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex items-start space-x-3',
                    message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : 'justify-start'
                  )}
                >
                  <Avatar className="h-8 w-8">
                    {message.sender === 'ai' ? (
                      <AvatarFallback className="bg-orange-100 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    ) : (
                      <AvatarFallback className="bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <Card
                    className={cn(
                      'max-w-[78%] rounded-2xl border p-3',
                      message.sender === 'user'
                        ? 'border-orange-500/70 bg-orange-500 text-white'
                        : 'border-border/70 bg-background/90 text-left'
                    )}
                  >
                    {message.file && (
                      <div
                        className={cn(
                          'flex items-center space-x-2 p-2 rounded mb-2 border',
                          message.sender === 'user'
                            ? 'bg-orange-400 border-orange-300'
                            : 'bg-background border-border'
                        )}
                      >
                        {getFileIcon(message.file.type)}
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              'text-xs font-medium truncate',
                              message.sender === 'user' ? 'text-orange-100' : 'text-foreground'
                            )}
                          >
                            {message.file.name}
                          </div>
                          <div
                            className={cn(
                              'text-xs opacity-70',
                              message.sender === 'user' ? 'text-orange-200' : 'text-muted-foreground'
                            )}
                          >
                            {formatFileSize(message.file.size)}
                          </div>
                        </div>
                        {message.file.url && message.file.type.includes('image') && (
                          <img
                            src={message.file.url}
                            alt={message.file.name}
                            className="w-8 h-8 object-cover rounded"
                          />
                        )}
                      </div>
                    )}
                    <FormattedMessage
                      content={message.content}
                      reasoning={message.reasoning}
                      isReasoningStreaming={reasoningStreamingId === message.id}
                      isAI={message.sender === 'ai'}
                      onModuleSelect={onModuleSelect}
                    />
                    <p
                      className={cn(
                        'text-xs mt-1 opacity-70',
                        message.sender === 'user' ? 'text-orange-100' : 'text-muted-foreground'
                      )}
                    >
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </Card>
                </div>
              );
            })}

            {/* Quick-start prompts — shown only on a fresh chat */}
            {messages.length === 1 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Quick starts</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Map,          label: 'Build a GTM strategy',         prompt: 'I want to build a go-to-market strategy for my business.' },
                    { icon: DollarSign,   label: 'Analyse my ad spend',          prompt: 'Help me analyse my marketing budget and ad spend performance.' },
                    { icon: PenLine,      label: 'Plan my content calendar',     prompt: 'Help me plan a content calendar for the next month.' },
                    { icon: Target,       label: 'Find and qualify leads',       prompt: 'I want to find and qualify leads for my business.' },
                  ].map(({ icon: Icon, label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => sendQuickMessage(prompt)}
                      className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-orange-300 hover:bg-orange-50/70 dark:hover:bg-orange-950/20"
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 break-words leading-5">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Typing / tool-use indicator */}
            {isTyping && (
              <div className="flex items-start space-x-3 justify-start">
                {activeTypingAgent ? (
                  // Agent-branded typing indicator during sequence
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                    (AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).avatar,
                  )}>
                    {activeTypingAgent.displayName.charAt(0)}
                  </div>
                ) : (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-orange-100 text-orange-600">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <Card className={cn(
                  'rounded-2xl border p-3 text-left',
                  activeTypingAgent
                    ? cn((AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).border,
                        (AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).bg)
                    : 'border-border/70 bg-background/90',
                )}>
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className={cn('w-1.5 h-1.5 rounded-full animate-bounce', activeTypingAgent ? (AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).avatar : 'bg-orange-400')} />
                      <div className={cn('w-1.5 h-1.5 rounded-full animate-bounce', activeTypingAgent ? (AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).avatar : 'bg-orange-400')} style={{ animationDelay: '0.15s' }} />
                      <div className={cn('w-1.5 h-1.5 rounded-full animate-bounce', activeTypingAgent ? (AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).avatar : 'bg-orange-400')} style={{ animationDelay: '0.3s' }} />
                    </div>
                    <span className={cn('text-[11px] transition-all duration-500', activeTypingAgent ? (AGENT_COLORS[activeTypingAgent.name] ?? DEFAULT_AGENT_COLORS).label : 'text-muted-foreground')}>
                      {activeTypingAgent
                        ? `${activeTypingAgent.displayName} is analysing...`
                        : TOOL_USE_LABELS[typingLabelIdx]}
                    </span>
                  </div>
                </Card>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Slash command suggestions */}
        {showSuggestions && filteredCommands.length > 0 && (
          <div className="mx-4 mb-2 max-h-48 overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-lg backdrop-blur">
            {filteredCommands.map((cmd) => (
              <div
                key={cmd.command}
                className="flex items-center space-x-3 p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                onClick={() => handleSuggestionClick(cmd.command)}
              >
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                    <span className="text-orange-600 font-mono text-sm">/</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{cmd.command}</div>
                  <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAgentSuggestions && filteredAgentMentions.length > 0 && (
          <div className="mx-4 mb-2 max-h-48 overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-lg backdrop-blur">
            {filteredAgentMentions.map((agent) => (
              <div
                key={agent.name}
                className="flex items-center space-x-3 p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                onClick={() => handleAgentSuggestionClick(agent.name)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
                  @{agent.label.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">@{agent.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {agent.label} · {agent.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upgrade CTA strip — shown for free/no-plan users */}
        {(!plan || plan === 'growth') && creditsTotal > 0 && creditsRemaining < creditsTotal * 0.2 && (
          <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-orange-800 dark:text-orange-300 truncate">
                  {creditsRemaining} credits left — upgrade to keep going
                </p>
                <p className="text-[10px] text-orange-600/70 dark:text-orange-400/60">Works while you sleep.</p>
              </div>
            </div>
            <button
              onClick={() => onModuleSelect?.('settings')}
              className="flex-shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold px-3 py-1.5 transition-colors"
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-border/70 px-4 py-3">
          {/* Selected file preview */}
          {selectedFile && (
            <div className="mb-3 rounded-2xl border border-border/70 bg-background/90 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getFileIcon(selectedFile.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{selectedFile.name}</div>
                    <div className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</div>
                  </div>
                  {selectedFile.type.includes('image') && (
                    <img
                      src={filePreviewUrl ?? ''}
                      alt={selectedFile.name}
                      className="w-10 h-10 object-cover rounded"
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeSelectedFile}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-[1.2rem] border border-border/70 bg-background/92 p-2">
          <div className="flex space-x-2">
            <Button
              variant="default"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 border-0 bg-transparent p-0 text-orange-500 shadow-none hover:bg-transparent hover:text-orange-600 dark:text-orange-300 dark:hover:text-orange-200"
              title="Upload file (CSV, PDF, Images)"
            >
              <Paperclip className="h-5 w-5" strokeWidth={2.2} />
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />

            <Input
              data-tour="chat-input"
              data-chat-input
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={selectedFile ? 'Add a message (optional)...' : 'What are you working on?'}
              className="flex-1"
              disabled={isTyping}
            />
            <Button
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && !selectedFile) || isTyping}
              className="rounded-xl bg-orange-500 hover:bg-orange-600"
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Plain language works best. Type `/` to jump somewhere or `@name` to reach a specialist.
          </p>
        </div>
      </div>

      {/* CSV Analysis Panel */}
      {showCSVAnalysis && csvFile && (
        <CSVAnalysisPanel
          file={csvFile}
          onClose={() => {
            setShowCSVAnalysis(false);
            setCSVFile(null);
          }}
        />
      )}

      <Dialog open={Boolean(taskAgent)} onOpenChange={(open) => {
        if (!open) {
          setTaskAgent(null);
          setTaskDraft('');
          setPlanPreview(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {taskAgent ? `Veena routing work to ${DIRECT_AGENTS.find((agent) => agent.name === taskAgent)?.label}` : 'Veena task routing'}
            </DialogTitle>
            <DialogDescription>
              Describe what you want this agent to do.
            </DialogDescription>
          </DialogHeader>

          {taskAgent && (
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="text-sm font-semibold text-foreground">
                {DIRECT_AGENTS.find((agent) => agent.name === taskAgent)?.label} · {EMPLOYEE_PROFILES[taskAgent].title}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Use @mentions in chat to route focused work to the right agent.
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Textarea
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder="Describe what you want this agent to do."
              className="min-h-[120px]"
            />
            <div className="flex justify-end">
              <Button
                onClick={createAgentTaskPlan}
                disabled={isPlanningTask || !taskDraft.trim()}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isPlanningTask ? 'Creating Plan...' : 'Create Plan'}
              </Button>
            </div>
          </div>

          {planPreview && (
            <div className="space-y-4 rounded-2xl border border-orange-200/70 bg-orange-50/60 p-4 dark:border-orange-500/20 dark:bg-orange-950/15">
              <div>
                <div className="text-sm font-semibold text-foreground">Execution Plan</div>
                <p className="mt-1 text-sm text-muted-foreground">{planPreview.summary}</p>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">Tasks</div>
                <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1">
                  {planPreview.tasks.map((task, index) => (
                    <div
                      key={`${task.label}-${index}`}
                      className="rounded-xl border border-border/60 bg-background/80 px-3 py-2"
                    >
                      <div className="text-sm text-foreground">{task.label}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                        {task.horizon}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={approveAgentTaskPlan} className="bg-orange-500 hover:bg-orange-600">
                  Run Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
