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
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { cn } from '@/lib/utils';
import { askVeena, GroqService, ChatMessage, type VeenaResponse } from '@/services/groqService';
import { toast } from 'sonner';
import { CSVAnalysisPanel } from '@/components/ui/csv-analysis-panel';
import type { Message, Conversation } from '@/types/chat';

import { markdownToRichText } from '@/lib/markdown';
import { BRAND } from '@/lib/brand';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  loadConversationsLocal,
  saveConversations,
  deleteConversation as deleteConversationFromStorage,
  type ConversationScope,
} from '@/lib/conversationPersistence';
import { hasWorkflowForm, WORKFLOW_FORMS, buildWorkflowSummary, checkConnectorReadiness } from '@/lib/workflowRequirements';
import { connectComposioConnector } from '@/lib/composio';
import type { WorkflowFormData } from '@/types/chat';

// -- Conversation persistence helpers

// Synchronous local load — instant reads without waiting for Supabase
function loadConversations(workspaceId?: string, scope: ConversationScope = 'main'): Conversation[] {
  return loadConversationsLocal(workspaceId, scope);
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

function normalizeAgentDisplayText(text: string): string {
  return text
    .replace(/\bMKG\b/g, 'company context')
    .replace(/\bSOUL\b/g, '')
    .replace(/\b(run_id|company_id|task_type)\b/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractReadableTextFromContractObject(value: unknown): string {
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const directCandidates = [
    record.message,
    record.summary,
    record.handoff_notes,
    (record.artifact as Record<string, unknown> | undefined)?.summary,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return normalizeAgentDisplayText(candidate.trim());
    }
  }

  return '';
}

function sanitizeAgentStreamText(content: string): string {
  if (!content.trim()) return '';

  let cleaned = content;
  let extractedContractText = '';

  const fencedJsonBlocks = [...content.matchAll(/```json\s*([\s\S]*?)```/gi)];
  for (const match of fencedJsonBlocks) {
    const inner = match[1]?.trim();
    if (!inner) continue;
    try {
      const parsed = JSON.parse(inner);
      const readable = extractReadableTextFromContractObject(parsed);
      if (readable) {
        extractedContractText = readable;
        break;
      }
    } catch {
      // keep scanning
    }
  }

  // Hard delimiters — cut everything after these
  const contractMarkerIndex = cleaned.indexOf('---CONTRACT---');
  if (contractMarkerIndex >= 0) {
    cleaned = cleaned.slice(0, contractMarkerIndex);
  }
  cleaned = cleaned
    .replace(/\n?Structured Output \(for downstream agents\)[\s\S]*$/i, '')
    .replace(/\n?Contract Block \(required\)[\s\S]*$/i, '')
    .replace(/\n?##\s*Output Contract[\s\S]*$/i, '')
    .replace(/\n?\*\*Output Contract\*\*[\s\S]*$/i, '')
    // Raw JSON objects starting with known contract keys
    .replace(/\n?\{\s*"agent"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"run_id"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"artifact"\s*:[\s\S]*$/, '')
    .replace(/\n?\{\s*"tasks_created"\s*:[\s\S]*$/, '');

  // Remove JSON code fences
  cleaned = cleaned.replace(/```json[\s\S]*?```/gi, '');
  cleaned = cleaned.replace(/```json[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
    if (!inner) return '';
    try {
      const parsed = JSON.parse(inner);
      const readable = extractReadableTextFromContractObject(parsed);
      if (!extractedContractText && readable) extractedContractText = readable;
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
  if (!trimmed) return extractedContractText;

  // If entire response is JSON, extract readable field or discard
  try {
    const parsed = JSON.parse(trimmed);
    const readable = extractReadableTextFromContractObject(parsed);
    if (readable) return readable;
    return '';
  } catch {
    // not raw JSON, keep prose
  }

  // Strip internal system terms
  return normalizeAgentDisplayText(trimmed);
}

/**
 * Decode SSE from fetch ReadableStream without splitting JSON across chunk boundaries.
 * Also decodes the last chunk when `done` is true (do not skip `value` on the final read).
 */
function consumeAgentSseBuffer(
  decoder: TextDecoder,
  buffer: { current: string },
  chunk: Uint8Array | undefined,
  streamDone: boolean,
  handleParsed: (parsed: Record<string, unknown>) => void,
): 'done' | 'continue' {
  buffer.current += decoder.decode(chunk ?? new Uint8Array(), { stream: !streamDone });
  const lines = buffer.current.split('\n');
  buffer.current = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') return 'done';
    if (!payload) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    handleParsed(parsed);
  }
  if (streamDone && buffer.current.trim()) {
    const tail = buffer.current.trimEnd();
    buffer.current = '';
    if (tail.startsWith('data: ')) {
      const payload = tail.slice(6).trim();
      if (payload === '[DONE]') return 'done';
      if (payload) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          return 'continue';
        }
        handleParsed(parsed);
      }
    }
  }
  return 'continue';
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">{BRAND.agentName} Brief</div>
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

// ── Artifact renderer (inline, no external import needed) ─────────────────

/** Small metric card used by multiple artifact renderers */
function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded p-2 border border-gray-100 text-center min-w-0">
      <p className="text-[10px] text-gray-400 capitalize truncate">{label.replace(/_/g, ' ')}</p>
      <p className="text-sm font-bold text-gray-800 truncate">{String(value)}</p>
    </div>
  );
}

function ArtifactBlock({ artifact }: { artifact: { type: string; [key: string]: unknown } }) {
  const { type } = artifact;

  if (type === 'analysis') {
    const metrics = (artifact.metrics ?? {}) as Record<string, unknown>;
    const findings = (artifact.findings ?? []) as string[];
    const insights = (artifact.insights ?? []) as string[];
    // Filter to scalar top-level metrics only (skip nested objects/arrays)
    const scalarMetrics = Object.entries(metrics).filter(([, v]) =>
      typeof v === 'string' || typeof v === 'number'
    );
    // Churn-agent at-risk list
    const atRisk = (artifact.at_risk_customers ?? []) as Array<{ name?: string; risk_level?: string; churn_score?: number; days_inactive?: number }>;
    return (
      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-800">📊 Analysis Results</p>
        {scalarMetrics.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {scalarMetrics.slice(0, 6).map(([k, v]) => (
              <MetricPill key={k} label={k} value={v as string | number} />
            ))}
          </div>
        )}
        {findings.slice(0, 3).map((f, i) => (
          <p key={i} className="text-xs text-gray-700">• {f}</p>
        ))}
        {atRisk.length > 0 && (
          <div className="mt-1 space-y-1">
            <p className="text-xs font-medium text-red-700">⚠ At-risk contacts</p>
            {atRisk.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-blue-100">
                <span className="text-xs text-gray-800 truncate max-w-[140px]">{c.name ?? 'Unknown'}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  c.risk_level === 'critical' ? 'bg-red-100 text-red-700'
                  : c.risk_level === 'high' ? 'bg-orange-100 text-orange-700'
                  : 'bg-yellow-100 text-yellow-700'
                }`}>{c.risk_level} · {c.churn_score}/100</span>
              </div>
            ))}
          </div>
        )}
        {insights[0] && (
          <p className="text-xs text-blue-700 font-medium">💡 {insights[0]}</p>
        )}
      </div>
    );
  }

  if (type === 'optimization_plan') {
    const impact = artifact.expected_impact as { current_roas?: number; projected_roas?: number; projected_roas_lift_pct?: number; current_conv_rate?: number; projected_conv_rate?: number; projected_lift_pct?: number; confidence?: string } | undefined;
    const currentState = artifact.current_state as Record<string, unknown> | undefined;
    const rec = artifact.recommendation as { line_items?: Array<{ name?: string; roas_class?: string; adjustment?: number; rationale?: string; element?: string; ice_score?: number; test?: string }>; summary?: { budget_shifted?: number; projected_roas_lift_pct?: number; total_hypotheses?: number; top_test?: string } } | undefined;
    const findings = (artifact.findings ?? []) as string[];

    // Key metrics to surface
    const kpis: Array<[string, string | number]> = [];
    if (currentState) {
      if (currentState.blended_roas !== undefined) kpis.push(['Current ROAS', `${currentState.blended_roas}x`]);
      if (currentState.total_spend !== undefined) kpis.push(['Total Spend', `$${Number(currentState.total_spend).toLocaleString()}`]);
      if (currentState.conversion_rate_pct !== undefined) kpis.push(['Conv. Rate', `${currentState.conversion_rate_pct}%`]);
      if (currentState.bounce_rate_pct !== undefined) kpis.push(['Bounce Rate', `${currentState.bounce_rate_pct}%`]);
    }
    if (impact) {
      if (impact.projected_roas !== undefined) kpis.push(['Projected ROAS', `${impact.projected_roas}x`]);
      if (impact.projected_roas_lift_pct !== undefined) kpis.push(['ROAS Lift', `+${impact.projected_roas_lift_pct}%`]);
      if (impact.projected_conv_rate !== undefined) kpis.push(['Proj. Conv.', `${impact.projected_conv_rate}%`]);
    }

    const lineItems = rec?.line_items ?? [];

    return (
      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-800">🎯 Optimization Plan</p>
        {kpis.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {kpis.slice(0, 6).map(([k, v]) => (
              <MetricPill key={k} label={k} value={v} />
            ))}
          </div>
        )}
        {lineItems.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Recommendations</p>
            {lineItems.slice(0, 3).map((item, i) => (
              <div key={i} className="bg-white rounded px-2 py-1.5 border border-amber-100">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-gray-800 truncate">{item.name ?? item.element}</span>
                  {item.roas_class && (
                    <span className={`text-[10px] px-1.5 rounded-full shrink-0 ${
                      item.roas_class === 'poor' ? 'bg-red-100 text-red-700'
                      : item.roas_class === 'excellent' ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>{item.roas_class}</span>
                  )}
                  {item.ice_score && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded-full shrink-0">ICE {item.ice_score}</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{item.rationale ?? item.test}</p>
              </div>
            ))}
          </div>
        )}
        {findings[0] && <p className="text-xs text-amber-900">• {findings[0]}</p>}
        {impact?.confidence && (
          <p className="text-[10px] text-amber-600">Confidence: {impact.confidence}</p>
        )}
      </div>
    );
  }

  if (type === 'content') {
    const title = artifact.title as string | undefined;
    const format = artifact.format as string | undefined;
    const findings = (artifact.findings ?? []) as string[];
    const content = artifact.content as Record<string, unknown> | undefined;

    // LP Designer: show section names
    const pageStructure = content?.page_structure as Array<{ label?: string; purpose?: string }> | undefined;
    // SE Agent: show section names
    const contentSections = content ? Object.keys(content).filter(k => !['page_structure', 'trust_checklist', 'mobile_notes', 'ab_test_priority', 'implementation_notes', 'usage_guide'].includes(k)) : [];

    return (
      <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-purple-800">
          {format === 'landing_page' ? '📄' : format === 'sales_enablement_pack' ? '🎯' : '✍️'} {title ?? 'Generated Content'}
        </p>
        {pageStructure && pageStructure.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-purple-600 uppercase">Page Sections</p>
            <div className="flex flex-wrap gap-1">
              {pageStructure.map((s, i) => (
                <span key={i} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{s.label ?? `Section ${i + 1}`}</span>
              ))}
            </div>
          </div>
        )}
        {contentSections.length > 0 && !pageStructure && (
          <div className="flex flex-wrap gap-1">
            {contentSections.map((s) => (
              <span key={s} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full capitalize">{s.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}
        {findings.slice(0, 2).map((f, i) => (
          <p key={i} className="text-xs text-gray-700">• {f}</p>
        ))}
      </div>
    );
  }

  if (type === 'discovery_results') {
    const count = artifact.count as number | undefined;
    const results = (artifact.results ?? []) as Array<{ name?: string; icp_fit?: number; [k: string]: unknown }>;
    return (
      <div className="mt-3 bg-pink-50 border border-pink-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-pink-800">🔍 {count ?? results.length} Results Found</p>
        {results.slice(0, 4).map((r, i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-pink-100">
            <span className="text-xs text-gray-800 truncate">{r.name ?? `Result ${i + 1}`}</span>
            {r.icp_fit !== undefined && (
              <span className="text-[10px] bg-pink-100 text-pink-700 px-1.5 rounded-full shrink-0">{Math.round(Number(r.icp_fit) * 100)}% fit</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'document') {
    const title = artifact.title as string | undefined;
    const body = artifact.body as string | undefined;
    const format = artifact.format as string | undefined;
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      if (!body) return;
      navigator.clipboard.writeText(body).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    };

    const formatEmoji = format === 'blog_post' ? '📝'
      : format === 'email_sequence' ? '📧'
      : format === 'social_post' ? '📱'
      : format === 'ad_copy' ? '📣'
      : format === 'sales_pitch' ? '🤝'
      : format === 'seo_brief' ? '🔍'
      : '✍️';

    return (
      <div className="mt-3 bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-teal-800">{formatEmoji} {title ?? 'Generated Document'}</p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] font-medium text-teal-600 hover:text-teal-800 transition-colors px-2 py-0.5 rounded border border-teal-200 bg-white hover:bg-teal-50"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        {body && (
          <div className="bg-white rounded border border-teal-100 p-2.5 max-h-60 overflow-y-auto">
            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{body}</p>
          </div>
        )}
        {format && (
          <p className="text-[10px] text-teal-600 capitalize">{format.replace(/_/g, ' ')}</p>
        )}
      </div>
    );
  }

  if (type === 'execution_tracker') {
    const status = artifact.status as string | undefined;
    const metrics = (artifact.metrics ?? {}) as Record<string, unknown>;
    const alerts = (artifact.alerts ?? []) as Array<{ severity?: string; campaign?: string; message?: string }>;
    const steps = (artifact.steps ?? []) as Array<{ name?: string; status?: string; roas?: number; spend?: number }>;

    const scalarMetrics = Object.entries(metrics).filter(([, v]) =>
      typeof v === 'string' || typeof v === 'number'
    );

    const statusColor = status === 'healthy' ? 'green'
      : status === 'action_required' ? 'red'
      : status === 'warnings' ? 'amber'
      : 'blue';

    const colorMap: Record<string, string> = {
      green: 'bg-green-50 border-green-200',
      red: 'bg-red-50 border-red-200',
      amber: 'bg-amber-50 border-amber-200',
      blue: 'bg-blue-50 border-blue-200',
    };
    const headerColor: Record<string, string> = {
      green: 'text-green-800',
      red: 'text-red-800',
      amber: 'text-amber-800',
      blue: 'text-blue-800',
    };

    return (
      <div className={`mt-3 border rounded-lg p-3 space-y-2 ${colorMap[statusColor]}`}>
        <p className={`text-xs font-semibold ${headerColor[statusColor]}`}>
          {status === 'healthy' ? '✅' : status === 'action_required' ? '🚨' : status === 'warnings' ? '⚠️' : '🚀'} {String(status ?? 'running').replace(/_/g, ' ').toUpperCase()}
        </p>
        {scalarMetrics.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {scalarMetrics.slice(0, 6).map(([k, v]) => (
              <MetricPill key={k} label={k} value={v as string | number} />
            ))}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="space-y-1">
            {alerts.slice(0, 2).map((a, i) => (
              <p key={i} className={`text-xs ${a.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
                {a.severity === 'critical' ? '🔴' : '🟡'} {a.campaign && `[${a.campaign}] `}{a.message}
              </p>
            ))}
          </div>
        )}
        {steps.length > 0 && !alerts.length && (
          <div className="space-y-1">
            {steps.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-gray-100">
                <span className="text-xs text-gray-700 truncate">{s.name}</span>
                <div className="flex gap-2 shrink-0">
                  {s.roas !== undefined && <span className="text-[10px] text-blue-600">ROAS {s.roas}x</span>}
                  {s.spend !== undefined && <span className="text-[10px] text-gray-500">${s.spend}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
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
  const artifacts = isAI ? extractFileArtifacts(content) : [];
  const richTextHtml = markdownToRichText(content);
  return (
    <>
      {(reasoning || isReasoningStreaming) && (
        <ThinkingBlock reasoning={reasoning ?? ''} isStreaming={isReasoningStreaming} />
      )}
      <div
        className="text-sm prose prose-sm dark:prose-invert max-w-none leading-6 [&_ul]:mt-1 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: richTextHtml }}
      />
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

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  content: "Hi! How can I help you today?",
  sender: 'ai',
  timestamp: new Date(),
};

function buildInitialMessages(): Message[] {
  return [{ ...GREETING_MESSAGE, timestamp: new Date() }];
}

// -- Props

interface ChatHomeProps {
  onClose?: () => void;
  onModuleSelect?: (moduleId: string | null) => void;
  activeConversationId?: string | null;
  onConversationsChange?: () => void;
  hideHeader?: boolean;
  scope?: ConversationScope;
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
const AGENT_RUN_TIMEOUT_MS = 45_000;

async function fetchAgentRun(
  agentName: string,
  query: string,
  headers: Record<string, string>,
  timeoutMs = AGENT_RUN_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`/api/agents/${agentName}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildAgentRunPayload({ query })),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildUrlAnalysisSequence(url: string): SequenceAgent[] {
  const concise = '\n\nProvide 2-3 clear bulleted paragraphs with specific, actionable recommendations. No headers or filler.';
  return [
    {
      name: 'maya',
      displayName: 'Maya',
      role: 'SEO & LLMO Monitor',
      query: `Analyse the SEO and AI answer engine (LLMO) presence for ${url}. Surface the top 3 keyword opportunities and the single most urgent ranking gap. Use any connected Google Search Console or Ahrefs data if available via Composio.${concise}`,
    },
    {
      name: 'arjun',
      displayName: 'Arjun',
      role: 'Lead Intelligence',
      query: `Based on the business at ${url}, define the ideal customer profile. Name the top 2 target segments and the recommended first outreach move. Use Apollo or LinkedIn data if available via Composio.${concise}`,
    },
    {
      name: 'dev',
      displayName: 'Dev',
      role: 'Performance Analyst',
      query: `Analyse the estimated performance footprint for ${url}. What are the top 3 conversion improvements to prioritise? Use GA4 or PostHog data if connected via Composio.${concise}`,
    },
    {
      name: 'riya',
      displayName: 'Riya',
      role: 'Content Producer',
      query: `Review the content strategy visible at ${url}. Name the biggest content gap and the top 3 pieces to publish next for maximum organic impact.${concise}`,
    },
    {
      name: 'zara',
      displayName: 'Zara',
      role: 'Campaign Strategist',
      query: `Based on the website ${url} and its market position, what channels and campaign angles should be prioritised for the next 90 days?${concise}`,
    },
  ];
}

/**
 * buildGoalChainSequence — returns a targeted agent sequence from routing_table.json
 * agent_chain entries. Returns null if the query doesn't match any known chain.
 *
 * Chains defined in routing_table.json:
 *   launch-planning  → ["neel","zara","riya"]   orchestration: sequential
 *   marketing-audit  → ["dev","priya","maya"]    orchestration: parallel (run sequential in chat)
 *
 * Generic full-analysis fallback (any broad audit/strategy query) runs 5 agents.
 * Keep the pattern list here in sync with routing_table.json keywords.
 */
function buildGoalChainSequence(query: string): { introText: string; agents: SequenceAgent[] } | null {
  // Never hijack scheduling / automation intents
  if (/schedul|automat|set.?up.?a|create.?a.?(report|task|job|cron|alert)|remind me/i.test(query)) return null;
  // Never hijack artifact creation intents
  if (/\b(write|draft|generate|build|make|produce)\b/i.test(query)) return null;

  const concise = '\n\nProvide 2-3 clear bulleted paragraphs with specific, actionable recommendations. No headers or filler.';

  // ── Chain 1: launch-planning (neel → zara → riya) ──────────────────────────
  // routing_table.json: agent_chain: ["neel","zara","riya"], sequential
  if (/product.?launch|launch.?(strategy|plan|campaign|roadmap|planning)|plan.?(a\s+)?launch|gtm.?plan|go.?to.?market.?(plan|strategy)/i.test(query)) {
    return {
      introText: 'Planning your launch — strategy, campaigns, and content briefing in sequence.',
      agents: [
        {
          name: 'neel',
          displayName: 'Neel',
          role: 'Strategy',
          query: `${query} — what is the core positioning narrative, key differentiation, and primary target segment for this launch? Be specific and opinionated.${concise}`,
        },
        {
          name: 'zara',
          displayName: 'Zara',
          role: 'Campaign Strategist',
          query: `${query} — what channels, launch timeline, and campaign angles should we prioritise for the first 60-90 days? Include the top 3 tactical moves.${concise}`,
        },
        {
          name: 'riya',
          displayName: 'Riya',
          role: 'Content Producer',
          query: `${query} — what are the 3 most critical launch content assets to create first (e.g. landing page, email, social)? Name them and describe what makes each effective.${concise}`,
        },
      ],
    };
  }

  // ── Chain 2: marketing-audit (dev + priya + maya) ──────────────────────────
  // routing_table.json: agent_chain: ["dev-scorecard","dev-budget","priya"], parallel
  // Mapped to dev (performance) + priya (competitive) + maya (SEO) in chat
  if (/marketing.?audit|full.?audit|stack.?review|audit.?my.?(marketing|channels|stack|spend)|tech.?stack.?audit/i.test(query)) {
    return {
      introText: 'Running your marketing audit — performance, competitive, and SEO angles.',
      agents: [
        {
          name: 'dev',
          displayName: 'Dev',
          role: 'Performance Analyst',
          query: `${query} — performance audit: what are the top 3 metric issues, funnel gaps, and the single highest-leverage growth action?${concise}`,
        },
        {
          name: 'priya',
          displayName: 'Priya',
          role: 'Brand Strategist',
          query: `${query} — competitive audit: where is the brand weakest vs competitors, and what is the most urgent positioning or messaging fix?${concise}`,
        },
        {
          name: 'maya',
          displayName: 'Maya',
          role: 'SEO & LLMO',
          query: `${query} — SEO and AI visibility audit: what are the top 3 organic ranking gaps and the single most urgent fix to drive traffic?${concise}`,
        },
      ],
    };
  }

  // ── Generic full-analysis fallback (5-agent) ───────────────────────────────
  // Catches: "analyse my marketing", "review our strategy", "full analysis", etc.
  if (!/full.?analysis|analyse (my|our)|analyze (my|our)|review (my|our)|(marketing|growth) strategy/i.test(query)) {
    return null;
  }
  return {
    introText: 'On it — orchestrating a full read across your team. Each specialist briefing now.',
    agents: [
      {
        name: 'maya',
        displayName: 'Maya',
        role: 'SEO & LLMO',
        query: `${query} — SEO and LLMO perspective: keyword opportunities, ranking gaps, and AI answer engine visibility.${concise}`,
      },
      {
        name: 'arjun',
        displayName: 'Arjun',
        role: 'Lead Intelligence',
        query: `${query} — lead intelligence angle: ICP definition, top segments, and outreach priorities.${concise}`,
      },
      {
        name: 'dev',
        displayName: 'Dev',
        role: 'Performance Analyst',
        query: `${query} — performance angle: key metrics issues, funnel gaps, and top 3 growth levers.${concise}`,
      },
      {
        name: 'riya',
        displayName: 'Riya',
        role: 'Content Producer',
        query: `${query} — content strategy: what specific pieces to publish in the next 30 days for maximum impact?${concise}`,
      },
      {
        name: 'zara',
        displayName: 'Zara',
        role: 'Campaign Strategist',
        query: `${query} — campaign angle: which channels and campaign types to prioritise for the next 90 days?${concise}`,
      },
    ],
  };
}

// ── Onboarding context helpers ────────────────────────────────────────────────

type OnboardingCtx = { company?: string; industry?: string; icp?: string; goals?: string; connectedIntegrations?: string };

function readOnboardingCtx(workspaceId: string): OnboardingCtx {
  try {
    return JSON.parse(localStorage.getItem(`marqq_onboarding_ctx_${workspaceId}`) || '{}');
  } catch { return {}; }
}

function buildOnboardingWelcomeSequence(url: string, ctx: OnboardingCtx): SequenceAgent[] {
  const industryPart = ctx.industry ? ` in the ${ctx.industry} space` : '';
  const icpPart      = ctx.icp        ? ` Target customer: ${ctx.icp}.`             : '';
  const goalsPart    = ctx.goals       ? ` Goals: ${ctx.goals}.`                     : '';
  const toolsPart    = ctx.connectedIntegrations ? ` Connected tools: ${ctx.connectedIntegrations}.` : '';
  const context      = `${url}${industryPart}.${icpPart}${goalsPart}${toolsPart}`.trim();
  const concise      = '\n\nProvide 2-3 clear bulleted paragraphs with specific, actionable recommendations. No headers or filler.';
  return [
    {
      name: 'maya',
      displayName: 'Maya',
      role: 'SEO & LLMO Monitor',
      query: `Analyse the SEO and AI answer engine (LLMO) presence for ${context} What are the top 3 keyword opportunities and the single most urgent ranking gap to fix?${concise}`,
    },
    {
      name: 'arjun',
      displayName: 'Arjun',
      role: 'Lead Intelligence',
      query: `Based on the business at ${context} Define the ideal customer profile and name the top 2 outreach segments to prioritise first.${concise}`,
    },
    {
      name: 'dev',
      displayName: 'Dev',
      role: 'Performance Analyst',
      query: `Analyse the estimated performance footprint for ${context} What are the top 3 conversion improvements to prioritise in the next 30 days?${concise}`,
    },
    {
      name: 'riya',
      displayName: 'Riya',
      role: 'Content Producer',
      query: `Review the content strategy visible at ${context} What are the top 3 content pieces to publish next for maximum organic impact?${concise}`,
    },
    {
      name: 'zara',
      displayName: 'Zara',
      role: 'Campaign Strategist',
      query: `Based on ${context} What channels and campaign angles should be prioritised for the next 90 days?${concise}`,
    },
  ];
}

function SubagentMessageCard({ message, onModuleSelect, onFollowUpClick }: {
  message: Message;
  onModuleSelect?: (id: string) => void;
  onFollowUpClick?: (text: string) => void;
}) {
  const colors = (message.agentId ? AGENT_COLORS[message.agentId] : null) ?? DEFAULT_AGENT_COLORS;
  const plain = stripMarkdown(message.content);
  const artifacts = extractFileArtifacts(message.content);
  const avatarName = (message.agentId || message.agentName || 'zara').toLowerCase();
  return (
    <div className={cn('w-full rounded-2xl border px-4 pt-3 pb-3', colors.border, colors.bg)}>
      {/* Agent header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <AgentAvatar name={avatarName} size="sm" className="h-7 w-7 rounded-full flex-shrink-0" />
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
      <div
        className="text-sm prose prose-sm dark:prose-invert max-w-none leading-6 [&_ul]:mt-1 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: markdownToRichText(message.content) }}
      />
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
      {/* Follow-up suggestion buttons */}
      {message.follow_ups && message.follow_ups.length > 0 && onFollowUpClick && (
        <div className="mt-3 space-y-1.5 border-t border-current/10 pt-2.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Next steps</p>
          {message.follow_ups.map((fu, i) => (
            <button
              key={i}
              onClick={() => onFollowUpClick(fu)}
              className={cn(
                'block w-full text-left text-xs px-2 py-1.5 rounded transition',
                colors.label,
                'hover:bg-black/5 dark:hover:bg-white/5'
              )}
            >
              → {fu}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Workflow form card ────────────────────────────────────────────────────────
function WorkflowFormCard({
  form,
  onSubmit,
  onSkip,
}: {
  form: WorkflowFormData;
  onSubmit: (values: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const set = (id: string, val: string) =>
    setValues(prev => ({ ...prev, [id]: val }));

  return (
    <div className="w-full rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:border-orange-900/30 dark:from-orange-950/30 dark:via-gray-950 dark:to-amber-950/20 px-4 pt-3 pb-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500 mb-0.5">
        {form.moduleName}
      </div>
      <p className="text-sm text-foreground mb-3">{form.prompt}</p>
      <div className="space-y-3">
        {form.fields.map(field => (
          <div key={field.id}>
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{field.label}</p>
            {field.type === 'text' ? (
              <input
                type="text"
                value={values[field.id] ?? ''}
                onChange={e => set(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {field.options?.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set(field.id, values[field.id] === opt.value ? '' : opt.value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      values[field.id] === opt.value
                        ? 'border-orange-400 bg-orange-100 text-orange-700 dark:border-orange-600 dark:bg-orange-900/30 dark:text-orange-300'
                        : 'border-border/60 bg-background/70 text-muted-foreground hover:border-orange-300 hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Button
          type="button"
          size="sm"
          className="rounded-full bg-orange-500 hover:bg-orange-600 text-white px-4"
          onClick={() => onSubmit(values)}
        >
          Let's go
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip — just open it
        </button>
      </div>
    </div>
  );
}

// ── Connector readiness card ──────────────────────────────────────────────────
const CONNECTOR_DISPLAY: Record<string, { label: string; bg: string }> = {
  ga4:          { label: 'Google Analytics 4', bg: 'bg-[#F9AB00]' },
  gsc:          { label: 'Search Console',     bg: 'bg-[#34A853]' },
  google_ads:   { label: 'Google Ads',         bg: 'bg-[#4285F4]' },
  meta_ads:     { label: 'Meta Ads',           bg: 'bg-[#0866FF]' },
  linkedin_ads: { label: 'LinkedIn Ads',       bg: 'bg-[#0A66C2]' },
  hubspot:      { label: 'HubSpot',            bg: 'bg-[#FF7A59]' },
  salesforce:   { label: 'Salesforce',         bg: 'bg-[#00A1E0]' },
  zoho_crm:     { label: 'Zoho CRM',           bg: 'bg-[#E71E63]' },
  apollo:       { label: 'Apollo',             bg: 'bg-[#5B6CFF]' },
  semrush:      { label: 'Semrush',            bg: 'bg-[#FF6A00]' },
  ahrefs:       { label: 'Ahrefs',             bg: 'bg-[#0A66FF]' },
  mixpanel:     { label: 'Mixpanel',           bg: 'bg-[#5F2EEA]' },
  amplitude:    { label: 'Amplitude',          bg: 'bg-[#1C6BFF]' },
  klaviyo:      { label: 'Klaviyo',            bg: 'bg-[#1A1A1A]' },
  mailchimp:    { label: 'Mailchimp',          bg: 'bg-[#FFE01B]' },
  instantly:    { label: 'Instantly',          bg: 'bg-[#6366F1]' },
  sendgrid:     { label: 'SendGrid',           bg: 'bg-[#1A82E2]' },
  gmail:        { label: 'Gmail',              bg: 'bg-[#EA4335]' },
  shopify:      { label: 'Shopify',            bg: 'bg-[#008060]' },
  linkedin:     { label: 'LinkedIn',           bg: 'bg-[#0A66C2]' },
  facebook:     { label: 'Facebook',           bg: 'bg-[#0866FF]' },
  instagram:    { label: 'Instagram',          bg: 'bg-[#E1306C]' },
  moengage:     { label: 'MoEngage',           bg: 'bg-[#4F46E5]' },
  clevertap:    { label: 'CleverTap',          bg: 'bg-[#FF6B6B]' },
  google_calendar: { label: 'Google Calendar', bg: 'bg-[#4285F4]' },
};

function ConnectorReadinessCard({
  missingConnectorIds,
  moduleLabel,
  workspaceId,
  onConnected,
  onSkip,
}: {
  missingConnectorIds: string[];
  moduleLabel: string;
  workspaceId: string | undefined;
  onConnected: (connectorId: string) => void;
  onSkip: () => void;
}) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const { user } = useAuth();
  // Show at most 3 connector options to keep the card concise
  const shown = missingConnectorIds.slice(0, 3);

  const handleConnect = async (connectorId: string) => {
    if (!workspaceId) return;
    setConnecting(connectorId);
    try {
      await connectComposioConnector({
        companyId: workspaceId,
        connectorId,
        userEmail: user?.email,
        userName: user?.name ?? user?.email,
        onConnected: () => onConnected(connectorId),
      });
    } catch {
      // ignore — user may have closed popup
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-900/30 dark:from-amber-950/30 dark:via-gray-950 dark:to-orange-950/20 px-4 pt-3 pb-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 mb-0.5">
        Connect an account
      </div>
      <p className="text-sm text-foreground mb-3">
        {moduleLabel} works best with live data. Connect at least one account to get started:
      </p>
      <div className="space-y-2">
        {shown.map(id => {
          const meta = CONNECTOR_DISPLAY[id] ?? { label: id, bg: 'bg-gray-500' };
          return (
            <div key={id} className="flex items-center gap-3">
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white', meta.bg)}>
                {meta.label.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 text-sm text-foreground">{meta.label}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={connecting === id}
                onClick={() => handleConnect(id)}
                className="h-7 rounded-full border-amber-400/60 px-3 text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
              >
                {connecting === id ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
          );
        })}
        {missingConnectorIds.length > 3 && (
          <p className="text-[11px] text-muted-foreground">
            +{missingConnectorIds.length - 3} more available in{' '}
            <button type="button" className="underline hover:text-foreground" onClick={onSkip}>
              Integrations
            </button>
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip — open anyway
        </button>
      </div>
    </div>
  );
}

// ── Workflow confirm card ─────────────────────────────────────────────────────
function WorkflowConfirmCard({
  summary,
  onConfirm,
  onCancel,
}: {
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const richTextHtml = markdownToRichText(summary);
  return (
    <div className="w-full rounded-2xl border border-border/70 bg-background/80 px-4 pt-3 pb-4 shadow-sm">
      <div
        className="text-sm prose prose-sm dark:prose-invert max-w-none leading-6 mb-3"
        dangerouslySetInnerHTML={{ __html: richTextHtml }}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="rounded-full bg-orange-500 hover:bg-orange-600 text-white px-4"
          onClick={onConfirm}
        >
          Open it
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ChatHome({
  onClose,
  onModuleSelect,
  activeConversationId,
  onConversationsChange,
  hideHeader,
  scope = 'main',
}: ChatHomeProps) {
  const { activeWorkspace, clearWebsiteUrl } = useWorkspace();
  const { plan, creditsRemaining, creditsTotal } = usePlan();
  const [messages, setMessages] = useState<Message[]>(buildInitialMessages);
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
  const hasRunWelcomeRef = useRef(false);
  const hasHydratedConversationRef = useRef(false);
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

  // -- Workflow orchestration state
  const [pendingWorkflow, setPendingWorkflow] = useState<{
    moduleId: string;
    moduleLabel: string;
    formMessageId: string;
  } | null>(null);

  // -- Connected connector IDs for the current workspace (used for readiness checks)
  const [activeConnectorIds, setActiveConnectorIds] = useState<string[]>([]);
  const [connectingConnector, setConnectingConnector] = useState<string | null>(null);

  useEffect(() => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId) return;
    fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
      .then(r => r.json())
      .catch(() => ({}))
      .then(json => {
        const ids: string[] = (json?.connectors ?? [])
          .filter((c: { status: string }) => c.status === 'active')
          .map((c: { id: string }) => c.id);
        setActiveConnectorIds(ids);
      });
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (!isTyping) { setTypingLabelIdx(0); return; }
    const timer = setInterval(() => {
      setTypingLabelIdx(i => (i + 1) % TOOL_USE_LABELS.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [isTyping]);

  // -- Reset thread state when workspace or channel scope changes.
  // MUST run before the hydration effect below: otherwise hydration sees
  // hasHydratedConversationRef still true from the *previous* workspace, returns
  // early, then this effect sets the ref false — and the welcome effect never
  // sees hasHydrated true on the same render (no second pass).
  useEffect(() => {
    setMessages(buildInitialMessages());
    setCurrentConvId(null);
    currentConvIdRef.current = null;
    hasRunWelcomeRef.current = false;
    hasHydratedConversationRef.current = false;
  }, [activeWorkspace?.id, scope]);

  // -- Rehydrate the current workspace's most recent home conversation.
  // Home chats created directly in ChatHome do not set activeConversationId in the
  // parent, so when this view remounts after tab switches we need to restore the
  // latest saved conversation instead of falling back to the default greeting.
  useEffect(() => {
    const conversations = loadConversations(activeWorkspace?.id, scope)
      .slice()
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    if (activeConversationId) {
      const conv = conversations.find(c => c.id === activeConversationId);
      if (conv) {
        setMessages(conv.messages);
        setCurrentConvId(conv.id);
        currentConvIdRef.current = conv.id;
      }
      hasHydratedConversationRef.current = true;
      return;
    }

    if (hasHydratedConversationRef.current) return;

    const latestConversation = conversations[0];
    if (!latestConversation) {
      hasHydratedConversationRef.current = true;
      return;
    }

    setMessages(latestConversation.messages);
    setCurrentConvId(latestConversation.id);
    currentConvIdRef.current = latestConversation.id;
    hasHydratedConversationRef.current = true;
  }, [activeConversationId, activeWorkspace?.id, scope]);

  // -- Load today's report for the #main channel feed (Helena-style)
  // Only runs when there is no persisted conversation to restore.
  // Skip when a website URL is set — the onboarding / specialist scan flow owns the feed.
  useEffect(() => {
    if (scope !== 'main') return;
    if (activeConversationId) return; // a conversation will be loaded by the other effect
    if (activeWorkspace?.website_url?.trim()) return;
    if (loadConversations(activeWorkspace?.id, scope).length > 0) return;
    const ac = new AbortController();
    fetch('/api/agents/today-report', { signal: ac.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data: { hasReport?: boolean; subject?: string; body?: string; recipients?: string[]; agentName?: string } | null) => {
        if (!data?.hasReport || !data.body) return;
        const recipientLine = data.recipients?.length
          ? `Email sent to ${data.recipients.slice(0, 2).join(', ')}${data.recipients.length > 2 ? ` +${data.recipients.length - 2} more` : ''} · Subject: ${data.subject || 'Marketing Report'}`
          : `Subject: ${data.subject || 'Marketing Report'}`;
        const agentId = (data.agentName || 'sam').toLowerCase();
        const agentName = data.agentName
          ? data.agentName.charAt(0).toUpperCase() + data.agentName.slice(1)
          : 'Sam';
        setMessages([{
          id: 'today-report',
          content: `[${recipientLine}]\n\n${data.body}`,
          sender: 'ai' as const,
          timestamp: new Date(),
          agentName,
          agentId,
          agentRole: 'Email Marketing Monitor',
        }]);
      })
      .catch(() => { /* keep greeting; ignore abort */ });
    return () => ac.abort();
  }, [activeConversationId, activeWorkspace?.id, activeWorkspace?.website_url, scope]);

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
          setIsTyping(false);
          // Check for goal-chain sequences from routing_table.json
          const qGoalChain = buildGoalChainSequence(text);
          if (qGoalChain) {
            return runAgentSequence(qGoalChain.agents, qGoalChain.introText);
          }
          const ackMsg: Message = { id: (Date.now() + 2).toString(), content: `On it — routing this to ${veena.label}.`, sender: 'ai', timestamp: new Date() };
          onMessagesChange(prev => [...prev, ackMsg]);
          return runAgentSlashCommand({ name: veena.agentName, label: veena.label, defaultQuery: veena.query }, veena.query);
        }
        if (veena.route === 'module') {
          setMessages(prev => prev.filter(m => m.id !== placeholderId));
          setIsTyping(false);

          // ── Connector readiness check ──────────────────────────────────────
          const readiness = checkConnectorReadiness(veena.moduleId, activeConnectorIds);
          if (!readiness.ready && readiness.missing.length > 0) {
            const ctaMsgId = `wf-cta-${Date.now()}`;
            const ctaMsg: Message = {
              id: ctaMsgId,
              content: `__connector_cta__:${veena.moduleId}:${veena.label}:${readiness.missing.join(',')}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            onMessagesChange(prev => [...prev, ctaMsg]);
            setPendingWorkflow({ moduleId: veena.moduleId, moduleLabel: veena.label, formMessageId: ctaMsgId });
            return;
          }

          if (hasWorkflowForm(veena.moduleId)) {
            const form = WORKFLOW_FORMS[veena.moduleId];
            const formMsgId = `wf-form-${Date.now()}`;
            const formMsg: Message = {
              id: formMsgId,
              content: '',
              sender: 'ai',
              timestamp: new Date(),
              workflowForm: form,
              workflowState: 'gathering_inputs',
            };
            onMessagesChange(prev => [...prev, formMsg]);
            setPendingWorkflow({ moduleId: veena.moduleId, moduleLabel: veena.label, formMessageId: formMsgId });
            return;
          }

          if (onModuleSelect) onModuleSelect(veena.moduleId);
          const navKey = navResponseKey(veena.moduleId);
          const msg: Message = { id: (Date.now() + 2).toString(), content: MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${veena.label} for you.`, sender: 'ai', timestamp: new Date() };
          onMessagesChange(prev => [...prev, msg]);
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
    const conversations = loadConversations(activeWorkspace?.id, scope);
    const id = convId ?? `conv-${Date.now()}`;
    const firstUserMsg = updatedMessages.find(m => m.sender === 'user');
    const name = firstUserMsg ? generateName(firstUserMsg.content) : 'New conversation';
    const now = new Date();
    const existing = conversations.find(c => c.id === id);
    if (existing) {
      existing.messages = updatedMessages;
      existing.lastMessageAt = now;
    } else {
      conversations.push({ id, name, createdAt: now, lastMessageAt: now, messages: updatedMessages, channelId: scope });
    }
    // Dual-write: localStorage (sync) + Supabase (async fire-and-forget)
    saveConversations(conversations, activeWorkspace?.id, id, scope);
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
    setMessages(buildInitialMessages());
    setCurrentConvId(null);
    currentConvIdRef.current = null;
  };

  useEffect(() => {
    if (scope !== 'veena-dm') return;
    const handler = () => handleNewConversation();
    window.addEventListener('marqq:new-veena-dm', handler);
    return () => window.removeEventListener('marqq:new-veena-dm', handler);
  }, [scope]);

  const handleDeleteConversation = async () => {
    try {
      if (currentConvId) {
        // Remove from localStorage + Supabase
        await deleteConversationFromStorage(currentConvId, activeWorkspace?.id, scope);
      }

      try {
        sessionStorage.removeItem('marqq_company_intel_autorun');
      } catch {
        // non-blocking
      }

      if (scope === 'main') {
        await clearWebsiteUrl();
      }
      setMessages(buildInitialMessages());
      setCurrentConvId(null);
      currentConvIdRef.current = null;
      onConversationsChange?.();
      toast.success(scope === 'main' ? 'Home screen reset' : 'Chat reset');
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
      const res = await fetchAgentRun(agentEntry.name, query, buildAgentHeaders());

      // Guard: HTML response means extension/proxy hijacked the request
      if ((res.headers.get('content-type') || '').includes('text/html')) {
        throw new Error(`${agentEntry.label} is not available right now.`);
      }

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

      // Capture structured fields from the final SSE event
      let agentArtifact: Message['artifact'] | undefined;
      let agentFollowUps: string[] | undefined;
      let agentConnectorPrompt: Message['connector_prompt'] | undefined;
      let agentIntentType: Message['intent_type'] | undefined;

      if (reader) {
        const sseBuf = { current: '' };
        outer: while (true) {
          const { done, value } = await reader.read();
          const r = consumeAgentSseBuffer(dec, sseBuf, value, done, (parsed) => {
            if (parsed.contractError || parsed.details) return;
            if (parsed.contract) {
              // Pull follow_ups out of the backend-generated contract
              const fups = parsed.contract?.follow_ups;
              if (Array.isArray(fups) && fups.length) agentFollowUps = fups as string[];
              return;
            }
            if (parsed.tool_call) {
              const toolName = (parsed.tool_call as { function?: { name?: string }; name?: string })?.function?.name
                || (parsed.tool_call as { name?: string })?.name || '';
              const label = String(toolName).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              setMessages(prev => prev.map(m =>
                m.id === slashPlaceholderId ? { ...m, toolStatus: `Working on ${label}…` } : m,
              ));
            }
            if (typeof parsed.text === 'string' && parsed.text) {
              accumulated += parsed.text;
              const displayContent = sanitizeAgentStreamText(accumulated);
              setMessages(prev => prev.map(m =>
                m.id === slashPlaceholderId
                  ? { ...m, content: displayContent, toolStatus: displayContent ? undefined : m.toolStatus }
                  : m,
              ));
            }
            // Capture structured agent response fields
            if (parsed.artifact && typeof parsed.artifact === 'object') {
              agentArtifact = parsed.artifact as Message['artifact'];
            }
            if (Array.isArray(parsed.follow_ups)) {
              agentFollowUps = parsed.follow_ups as string[];
            }
            if (parsed.connector_prompt && typeof parsed.connector_prompt === 'object') {
              agentConnectorPrompt = parsed.connector_prompt as Message['connector_prompt'];
            }
            if (typeof parsed.intent_type === 'string') {
              agentIntentType = parsed.intent_type as Message['intent_type'];
            }
            // Also check top-level result envelope (agenticLoop wraps in chat_message)
            if (parsed.type === 'chat_message') {
              if (parsed.artifact) agentArtifact = parsed.artifact as Message['artifact'];
              if (Array.isArray(parsed.follow_ups)) agentFollowUps = parsed.follow_ups as string[];
              if (parsed.connector_prompt) agentConnectorPrompt = parsed.connector_prompt as Message['connector_prompt'];
              if (typeof parsed.intent_type === 'string') agentIntentType = parsed.intent_type as Message['intent_type'];
              if (typeof parsed.content === 'string' && parsed.content && !accumulated) {
                accumulated = parsed.content;
              }
            }
            if (parsed.error) throw new Error(String(parsed.error));
          });
          if (r === 'done') break outer;
          if (done) break;
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
        ...(agentArtifact && { artifact: agentArtifact }),
        ...(agentFollowUps?.length && { follow_ups: agentFollowUps }),
        ...(agentConnectorPrompt && { connector_prompt: agentConnectorPrompt }),
        ...(agentIntentType && { intent_type: agentIntentType }),
      };
      onMessagesChange(prev => prev.map(m => m.id === slashPlaceholderId ? aiMessage : m));
      toast.success(`${agentEntry.label} responded`);
    } catch (err) {
      const [agentDisplayName, agentRole] = agentEntry.label.split(' · ');
      const timedOut = err instanceof Error && err.name === 'AbortError';
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: timedOut
          ? `${agentEntry.label} took too long to respond. Please try again with a narrower request.`
          : `Offline or not configured. Make sure the AI backend is running (\`npm run dev:backend\`) and \`GROQ_API_KEY\` is set.`,
        sender: 'ai',
        timestamp: new Date(),
        agentName: agentDisplayName?.trim() || agentEntry.label,
        agentRole: agentRole?.trim(),
        agentId: agentEntry.name,
      };
      onMessagesChange(prev => [...prev, errorMessage]);
      toast.error(timedOut ? `${agentEntry.label} timed out.` : String(err));
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
        const res = await fetchAgentRun(agent.name, agent.query, buildAgentHeaders());

        console.log(`[Agent ${agent.name}] response status: ${res.status}, ok: ${res.ok}`);

        // Guard: if response is HTML (extension/proxy hijacked the request) treat as offline
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          console.error(`[Agent ${agent.name}] received HTML instead of SSE — request was likely intercepted`);
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

        if (!res.ok) {
          setIsTyping(false);
          const errBody = await res.text().catch(() => '');
          console.error(`[Agent ${agent.name}] error response:`, errBody.slice(0, 500));
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
        let streamedReasoning = '';

        console.log(`[Agent ${agent.name}] reader available: ${!!reader}`);

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
        // Use onMessagesChange to ensure persistence to localStorage
        onMessagesChange(prev => [...prev, placeholder]);
        setIsTyping(false);
        setActiveTypingAgent(null);

        let seqFollowUps: string[] = [];
        if (reader) {
          const seqSseBuf = { current: '' };
          outer: while (true) {
            const { done, value } = await reader.read();
            const r = consumeAgentSseBuffer(dec, seqSseBuf, value, done, (parsed) => {
              if (parsed.contractError || parsed.details) return;
              if (parsed.contract) {
                // Extract follow_ups from contract payload
                const fups = parsed.contract?.follow_ups;
                if (Array.isArray(fups) && fups.length) seqFollowUps = fups as string[];
                return;
              }
              if (parsed.tool_call) {
                const tc = parsed.tool_call as { function?: { name?: string }; name?: string };
                const toolName = tc?.function?.name || tc?.name || '';
                const label = String(toolName).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                setMessages(prev => prev.map(m =>
                  m.id === placeholderId ? { ...m, toolStatus: `Working on ${label}…` } : m,
                ));
              }
              if (typeof parsed.text === 'string' && parsed.text) {
                accumulated += parsed.text;
                const displayContent = sanitizeAgentStreamText(accumulated);
                setMessages(prev => prev.map(m =>
                  m.id === placeholderId
                    ? { ...m, content: displayContent, toolStatus: displayContent ? undefined : m.toolStatus }
                    : m,
                ));
              }
              if (typeof parsed.thinking === 'string' && parsed.thinking) {
                streamedReasoning += parsed.thinking;
                setMessages(prev => prev.map(m =>
                  m.id === placeholderId ? { ...m, reasoning: streamedReasoning } : m,
                ));
              }
              if (parsed.error) throw new Error(String(parsed.error));
            });
            if (r === 'done') break outer;
            if (done) break;
          }
        }

        const finalContent = sanitizeAgentStreamText(accumulated);

        // Use agent-specific fallback if no content was extracted
        const displayContent = finalContent || (() => {
          const fallbacks: Record<string, string> = {
            maya: 'Maya is analyzing your SEO presence. Check back with a specific query for detailed insights.',
            arjun: 'Arjun is reviewing your lead strategy. Provide more context about your ICP for recommendations.',
            dev: 'Dev analyzed your performance. Ask about specific conversion metrics for more detail.',
            riya: 'Riya reviewed your content. Request specific topics or channels for recommendations.',
            zara: 'Zara assessed your campaigns. Ask about a specific goal or timeframe for recommendations.',
            priya: 'Priya noted your positioning. Add company context for a detailed brand brief.',
            kiran: 'Kiran checked social performance. Ask about specific platforms for detailed analysis.',
            sam: 'Sam reviewed your email health. Ask about specific segments for recommendations.',
          };
          return fallbacks[agent.name.toLowerCase()] || 'Analysis in progress. Try a more specific query.';
        })();

        // Persist the final content + follow-up suggestions via onMessagesChange (clear toolStatus)
        onMessagesChange(prev => prev.map(m =>
          m.id === placeholderId ? {
            ...m,
            content: displayContent,
            reasoning: streamedReasoning || undefined,
            toolStatus: undefined,
            ...(seqFollowUps.length && { follow_ups: seqFollowUps }),
          } : m,
        ));
      } catch (error) {
        setIsTyping(false);
        const errMsg: Message = {
          id: (Date.now() + Math.random()).toString(),
          content: error instanceof Error && error.name === 'AbortError'
            ? 'This step timed out, so I skipped to keep the team moving.'
            : 'Could not reach this agent right now.',
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

  // ── Helena-style auto-first-message ──────────────────────────────────────────
  // Fires once per workspace when a websiteUrl is present (i.e. just after onboarding).
  // Uses localStorage to ensure it only runs once per workspace.
  // CRITICAL: Waits for conversation hydration (useEffect above) before checking.
  useEffect(() => {
    const url = (activeWorkspace?.website_url ?? '').trim();
    if (!url || !activeWorkspace?.id) return;
    if (activeConversationId) return; // don't override an already-open conversation
    if (currentConvIdRef.current) return;

    // WAIT for conversation hydration to complete before deciding to run onboarding
    // This ensures that if a conversation was restored from localStorage, we don't re-run
    if (!hasHydratedConversationRef.current) return;

    // Check if conversations exist — if so, don't run onboarding
    if (scope !== 'main') return;
    if (loadConversations(activeWorkspace?.id, scope).length > 0) return;

    const key = `marqq_welcomed_${activeWorkspace.id}`;
    if (localStorage.getItem(key)) return;
    if (hasRunWelcomeRef.current) return;

    // Do NOT set hasRunWelcomeRef / localStorage here: React Strict Mode runs
    // effect → cleanup(clearTimeout) → effect again; early persistence blocked the retry.

    const workspaceId = activeWorkspace.id;
    const workspaceName = activeWorkspace.name ?? '';
    const timer = setTimeout(() => {
      if (hasRunWelcomeRef.current) return;
      if (localStorage.getItem(key)) return;
      hasRunWelcomeRef.current = true;
      localStorage.setItem(key, '1');

      if (import.meta.env.DEV) {
        console.info('[marqq] #main welcome: starting specialist scan', { workspaceId, url });
      }

      // Replace static greeting with the Helena-style opener, personalised with onboarding context
      const ctx = readOnboardingCtx(workspaceId);
      const companyLabel = ctx.company || workspaceName || url;
      const industryHint = ctx.industry ? ` (${ctx.industry})` : '';
      setMessages([{
        id: 'welcome-opener',
        content: `I've got ${companyLabel}${industryHint} — briefing your team across SEO, leads, performance, content, and campaigns now.`,
        sender: 'ai' as const,
        timestamp: new Date(),
      }]);
      runAgentSequence(
        buildOnboardingWelcomeSequence(url, ctx),
        `Scanning ${url} — each specialist is briefing you now.`,
      );

      // Schedule the first "Weekly Intelligence Brief" task — shows in right panel Upcoming Tasks
      const scheduledFor = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6h from now
      fetch(`/api/workspaces/${workspaceId}/agent-deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: 'sam',
          sectionId: 'weekly_intelligence_brief',
          sectionTitle: 'Weekly Intelligence Brief',
          summary: 'First weekly brief covering SEO rankings, lead signals, content opportunities, and campaign performance.',
          tasks: [{ label: 'Run weekly intelligence brief', horizon: 'week' }],
          scheduledFor,
          source: 'onboarding',
        }),
      }).then(() => {
        window.dispatchEvent(new CustomEvent('marqq:deployment-created'));
      }).catch(() => { /* non-blocking */ });
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id, activeWorkspace?.website_url, scope]);

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
      let planFollowUps: string[] = [];

      if (reader) {
        const planSseBuf = { current: '' };
        outer: while (true) {
          const { done, value } = await reader.read();
          const r = consumeAgentSseBuffer(dec, planSseBuf, value, done, (parsed) => {
            if (parsed.contractError || parsed.details) return;
            if (parsed.contract) {
              // Pull follow_ups from the backend contract event
              const fups = parsed.contract?.follow_ups;
              if (Array.isArray(fups) && fups.length) planFollowUps = fups as string[];
              return;
            }
            if (typeof parsed.text === 'string' && parsed.text) accumulated += parsed.text;
            if (parsed.error) throw new Error(String(parsed.error));
          });
          if (r === 'done') break outer;
          if (done) break;
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
        ...(planFollowUps.length && { follow_ups: planFollowUps }),
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

  // -- Workflow form handlers

  const handleWorkflowFormSubmit = (formMessageId: string, moduleId: string, moduleLabel: string, values: Record<string, string>) => {
    // Mark the form message as done (remove workflowForm, add workflowState=awaiting_confirmation)
    const summary = buildWorkflowSummary(moduleId, values);
    const confirmMsgId = `wf-confirm-${Date.now()}`;
    const confirmMsg: Message = {
      id: confirmMsgId,
      content: summary,
      sender: 'ai',
      timestamp: new Date(),
      workflowState: 'awaiting_confirmation',
      workflowParams: values,
    };
    // Remove the form message, add the confirm message
    onMessagesChange(prev => {
      const filtered = prev.filter(m => m.id !== formMessageId);
      return [...filtered, confirmMsg];
    });
    setPendingWorkflow({ moduleId, moduleLabel, formMessageId: confirmMsgId });
  };

  const handleWorkflowSkip = (formMessageId: string, moduleId: string, moduleLabel: string) => {
    // Just open the module with no params
    onMessagesChange(prev => prev.filter(m => m.id !== formMessageId));
    setPendingWorkflow(null);
    if (onModuleSelect) onModuleSelect(moduleId);
    const navKey = navResponseKey(moduleId);
    const msg: Message = {
      id: Date.now().toString(),
      content: MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${moduleLabel} for you.`,
      sender: 'ai',
      timestamp: new Date(),
    };
    onMessagesChange(prev => [...prev, msg]);
  };

  const handleWorkflowConfirm = (confirmMsgId: string, moduleId: string, moduleLabel: string, params: Record<string, string>) => {
    // Remove confirm message, open module with params
    onMessagesChange(prev => prev.filter(m => m.id !== confirmMsgId));
    setPendingWorkflow(null);
    // Pass params via a custom event so App.tsx can forward them to the module
    window.dispatchEvent(new CustomEvent('marqq:workflow-params', { detail: { moduleId, params } }));
    if (onModuleSelect) onModuleSelect(moduleId);
    const navKey = navResponseKey(moduleId);
    const msg: Message = {
      id: Date.now().toString(),
      content: MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${moduleLabel} for you.`,
      sender: 'ai',
      timestamp: new Date(),
    };
    onMessagesChange(prev => [...prev, msg]);
  };

  const handleWorkflowCancel = (confirmMsgId: string) => {
    onMessagesChange(prev => prev.filter(m => m.id !== confirmMsgId));
    setPendingWorkflow(null);
    const msg: Message = {
      id: Date.now().toString(),
      content: "No problem — let me know when you're ready.",
      sender: 'ai',
      timestamp: new Date(),
    };
    onMessagesChange(prev => [...prev, msg]);
  };

  // -- Scheduling intent handler
  // Detects "schedule / automate X" follow-ups, checks required connectors, and
  // either shows a connector CTA or creates a deployment + confirms to the user.

  const SCHEDULE_RULES: Array<{
    pattern: RegExp;
    agentName: string;
    taskType: string;
    sectionId: string;
    sectionTitle: string;
    schedule: string;
    requiredConnectors: string[];
    connectorLabels: string[];
  }> = [
    {
      pattern: /seo.*(audit|report)|audit.*seo|search.?console|gsc/i,
      agentName: 'maya', taskType: 'seo_audit',
      sectionId: 'monthly_seo_audit', sectionTitle: 'Monthly SEO Audit Report',
      schedule: 'first Monday of month',
      requiredConnectors: ['gsc'], connectorLabels: ['Google Search Console'],
    },
    {
      pattern: /keyword|ranking|organic.*traffic/i,
      agentName: 'maya', taskType: 'seo_audit',
      sectionId: 'monthly_seo_audit', sectionTitle: 'Monthly SEO Audit Report',
      schedule: 'first Monday of month',
      requiredConnectors: ['gsc'], connectorLabels: ['Google Search Console'],
    },
    {
      pattern: /analytics|traffic|ga4|google.?analytics/i,
      agentName: 'maya', taskType: 'daily_market_scan',
      sectionId: 'weekly_traffic_report', sectionTitle: 'Weekly Traffic Report',
      schedule: 'every Monday at 9am',
      requiredConnectors: ['ga4'], connectorLabels: ['Google Analytics 4'],
    },
    {
      pattern: /lead|crm|prospect|pipeline/i,
      agentName: 'arjun', taskType: 'lead_score',
      sectionId: 'weekly_leads_report', sectionTitle: 'Weekly Leads Report',
      schedule: 'every Monday at 9am',
      requiredConnectors: ['hubspot'], connectorLabels: ['HubSpot'],
    },
    {
      pattern: /campaign|ads|paid|google.?ads|meta.?ads/i,
      agentName: 'zara', taskType: 'campaign_brief',
      sectionId: 'weekly_campaign_report', sectionTitle: 'Weekly Campaign Report',
      schedule: 'every Monday at 9am',
      requiredConnectors: ['google_ads'], connectorLabels: ['Google Ads'],
    },
    {
      pattern: /social|linkedin|instagram|youtube/i,
      agentName: 'kiran', taskType: 'social_monitor',
      sectionId: 'weekly_social_report', sectionTitle: 'Weekly Social Report',
      schedule: 'every Monday at 9am',
      requiredConnectors: ['linkedin'], connectorLabels: ['LinkedIn'],
    },
    {
      pattern: /email|newsletter|klaviyo|mailchimp/i,
      agentName: 'sam', taskType: 'report_delivery',
      sectionId: 'weekly_email_report', sectionTitle: 'Weekly Email Performance',
      schedule: 'every Monday at 9am',
      requiredConnectors: [], connectorLabels: [],
    },
  ];

  const tryHandleSchedulingIntent = async (query: string): Promise<boolean> => {
    if (!/schedul|automat|set.?up.?a|every.?(month|week|day)|monthly|weekly|daily|cron/i.test(query)) {
      return false;
    }

    const rule = SCHEDULE_RULES.find(r => r.pattern.test(query));
    if (!rule) return false;

    const workspaceId = activeWorkspace?.id;
    if (!workspaceId) return false;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: query,
      sender: 'user',
      timestamp: new Date(),
    };
    onMessagesChange(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Check if required connectors are connected
    const missing = rule.requiredConnectors.filter(c => !activeConnectorIds.includes(c));
    if (missing.length > 0) {
      setIsTyping(false);
      const ctaMsgId = `sched-cta-${Date.now()}`;
      const ctaMsg: Message = {
        id: ctaMsgId,
        content: `__connector_cta__:${rule.sectionId}:${rule.sectionTitle}:${missing.join(',')}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      onMessagesChange(prev => [...prev, ctaMsg]);
      setPendingWorkflow({ moduleId: rule.sectionId, moduleLabel: rule.sectionTitle, formMessageId: ctaMsgId });
      return true;
    }

    // All connectors present — schedule the deployment
    try {
      await fetch(`/api/workspaces/${workspaceId}/agent-deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: rule.agentName,
          sectionId: rule.sectionId,
          sectionTitle: rule.sectionTitle,
          summary: `${rule.sectionTitle} — runs ${rule.schedule}.`,
          tasks: [{ label: rule.sectionTitle, horizon: 'month' }],
          scheduledFor: new Date(Date.now() + 60_000).toISOString(),
          schedule: rule.schedule,
          source: 'chat_followup',
        }),
      });
      window.dispatchEvent(new CustomEvent('marqq:deployment-created'));
    } catch { /* non-blocking */ }

    setIsTyping(false);
    const confirmMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: `Done — **${rule.sectionTitle}** is scheduled to run ${rule.schedule}. You'll receive the report by email and it will appear in your Upcoming Tasks panel. You can pause or adjust the schedule from the Automations section anytime.`,
      sender: 'ai',
      timestamp: new Date(),
      follow_ups: [
        `View upcoming ${rule.sectionTitle.toLowerCase()} tasks`,
        `Change the schedule for ${rule.sectionTitle.toLowerCase()}`,
        `Add another automated report`,
      ],
    };
    onMessagesChange(prev => [...prev, confirmMsg]);
    return true;
  };

  // -- Artifact creation intent handler
  // Detects "write/draft/create/generate X" intents and routes to the right specialist agent
  // without triggering the 5-agent analysis sequence.

  const CREATION_RULES: Array<{
    pattern: RegExp;
    agentName: string;
    agentLabel: string;
    format: string;
    queryPrefix: string;
  }> = [
    {
      pattern: /blog.?post|article|seo.?content|pillar.?content|content.?brief/i,
      agentName: 'riya', agentLabel: 'Riya · Content Producer',
      format: 'blog_post',
      queryPrefix: 'Write a detailed, SEO-optimised blog post about',
    },
    {
      pattern: /email.?sequence|drip.?campaign|nurture.?sequence|onboarding.?email/i,
      agentName: 'sam', agentLabel: 'Sam · Email Specialist',
      format: 'email_sequence',
      queryPrefix: 'Write a complete email sequence for',
    },
    {
      pattern: /cold.?email|outreach.?email|sales.?email|pitch.?email/i,
      agentName: 'arjun', agentLabel: 'Arjun · Lead Intelligence',
      format: 'sales_pitch',
      queryPrefix: 'Write a high-converting cold outreach email for',
    },
    {
      pattern: /social.?post|linkedin.?post|instagram.?(caption|post)|tweet|x.?post/i,
      agentName: 'kiran', agentLabel: 'Kiran · Social Strategist',
      format: 'social_post',
      queryPrefix: 'Write compelling social media posts for',
    },
    {
      pattern: /ad.?copy|google.?ad|meta.?ad|facebook.?ad|ppc.?ad|banner.?copy/i,
      agentName: 'zara', agentLabel: 'Zara · Campaign Strategist',
      format: 'ad_copy',
      queryPrefix: 'Write high-converting ad copy for',
    },
    {
      pattern: /seo.?brief|keyword.?strategy|content.?calendar|topic.?cluster/i,
      agentName: 'maya', agentLabel: 'Maya · SEO & LLMO',
      format: 'seo_brief',
      queryPrefix: 'Create a detailed SEO brief for',
    },
    {
      pattern: /sales.?pitch|pitch.?deck|elevator.?pitch|positioning.?statement|tagline|brand.?message|value.?prop/i,
      agentName: 'priya', agentLabel: 'Priya · Brand Strategist',
      format: 'sales_pitch',
      queryPrefix: 'Write compelling brand messaging and positioning for',
    },
    {
      pattern: /newsletter|weekly.?digest|digest.?email/i,
      agentName: 'sam', agentLabel: 'Sam · Email Specialist',
      format: 'email_sequence',
      queryPrefix: 'Write a newsletter edition for',
    },
  ];

  const tryHandleCreationIntent = async (query: string): Promise<boolean> => {
    // Must have a clear creation verb
    if (!/\b(write|draft|create|generate|build|make|produce)\b/i.test(query)) return false;
    // Don't intercept scheduling-style creation ("create a report every week")
    if (/schedul|automat|every.?(month|week|day)|monthly|weekly|daily/i.test(query)) return false;

    const rule = CREATION_RULES.find(r => r.pattern.test(query));
    if (!rule) return false;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: query,
      sender: 'user',
      timestamp: new Date(),
    };
    onMessagesChange(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Strip the creation verb from the query to get the topic
    const topic = query.replace(/\b(write|draft|create|generate|build|make|produce)\s+(me\s+)?(a\s+|an\s+)?/i, '').trim();
    const agentQuery = `${rule.queryPrefix}: ${topic}. Return the full written output as your response. Do not just give a plan or outline — write the actual content.`;

    // Brief ack
    await new Promise(r => setTimeout(r, 200));
    setIsTyping(false);

    await runAgentSlashCommand(
      { name: rule.agentName, label: rule.agentLabel, defaultQuery: agentQuery },
      agentQuery,
    );
    return true;
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

    // Scheduling / automation intent — handle before generic Veena routing
    if (!selectedFile && await tryHandleSchedulingIntent(inputValue.trim())) return;

    // Artifact creation intent — route to specialist before generic Veena routing
    if (!selectedFile && await tryHandleCreationIntent(inputValue.trim())) return;

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

        // URL fast-path: full 5-agent team scan
        const urlInMessage = currentInput.match(URL_RE)?.[0];
        if (urlInMessage) {
          await runAgentSequence(
            buildUrlAnalysisSequence(urlInMessage),
            `Ingesting ${urlInMessage} — I'm pulling your full team together. Each specialist will brief you in order.`,
          );
          return;
        }

        // Goal-chain routing: check routing_table.json agent_chain entries first.
        // Matches specific goals (launch-planning, marketing-audit, full-analysis)
        // and runs the right targeted agent sequence, not a generic 5-agent blast.
        const goalChain = buildGoalChainSequence(currentInput);
        if (goalChain) {
          await runAgentSequence(goalChain.agents, goalChain.introText);
          return;
        }

        // Single-agent path — Veena already picked the right specialist
        addMessage(`On it — routing this to ${veena.label}.`);
        await runAgentSlashCommand(
          { name: veena.agentName, label: veena.label, defaultQuery: veena.query },
          veena.query,
        );
        return;
      }

      if (veena.route === 'module') {
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
        setIsTyping(false);

        // ── Connector readiness check ──────────────────────────────────────
        const readiness2 = checkConnectorReadiness(veena.moduleId, activeConnectorIds);
        if (!readiness2.ready && readiness2.missing.length > 0) {
          const ctaMsgId = `wf-cta-${Date.now()}`;
          const ctaMsg: Message = {
            id: ctaMsgId,
            content: `__connector_cta__:${veena.moduleId}:${veena.label}:${readiness2.missing.join(',')}`,
            sender: 'ai',
            timestamp: new Date(),
          };
          onMessagesChange(prev => [...prev, ctaMsg]);
          setPendingWorkflow({ moduleId: veena.moduleId, moduleLabel: veena.label, formMessageId: ctaMsgId });
          return;
        }

        // For modules with workflow forms, inject a guided input form before opening
        if (hasWorkflowForm(veena.moduleId)) {
          const form = WORKFLOW_FORMS[veena.moduleId];
          const formMsgId = `wf-form-${Date.now()}`;
          const formMsg: Message = {
            id: formMsgId,
            content: '',
            sender: 'ai',
            timestamp: new Date(),
            workflowForm: form,
            workflowState: 'gathering_inputs',
          };
          onMessagesChange(prev => [...prev, formMsg]);
          setPendingWorkflow({ moduleId: veena.moduleId, moduleLabel: veena.label, formMessageId: formMsgId });
          return;
        }

        // Default: open module directly
        if (onModuleSelect) onModuleSelect(veena.moduleId);
        const navKey = navResponseKey(veena.moduleId);
        addMessage(MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${veena.label} for you.`);
        return;
      }

      // route === 'answer' — persist final streamed content + reasoning
      onMessagesChange(prev => prev.map(m =>
        m.id === placeholderId
          ? { ...m, content: streamedContent, reasoning: streamedReasoning || undefined }
          : m
      ));

      // Fire background follow-ups call — update message once resolved (non-blocking)
      if (streamedContent.trim()) {
        const storedCompanyId = localStorage.getItem('company_id') || localStorage.getItem('companyId') || '';
        fetch(`/api/veena/follow-ups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: streamedContent, company_id: storedCompanyId }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (Array.isArray(data?.follow_ups) && data.follow_ups.length) {
              onMessagesChange(prev => prev.map(m =>
                m.id === placeholderId ? { ...m, follow_ups: data.follow_ups } : m,
              ));
            }
          })
          .catch(() => { /* non-blocking — ignore */ });
      }
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
                {BRAND.agentName}
              </div>
              <div className="space-y-1">
                <h2 className="font-brand-syne text-[1.35rem] tracking-tight text-foreground">{BRAND.agentName}</h2>
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
              // Connector readiness CTA — show connect buttons when required accounts are missing
              if (message.sender === 'ai' && message.content.startsWith('__connector_cta__:')) {
                const parts = message.content.split(':');
                // format: __connector_cta__:<moduleId>:<moduleLabel>:<comma-ids>
                const ctaModuleId    = parts[1] ?? '';
                const ctaModuleLabel = parts[2] ?? '';
                const ctaMissing     = parts[3]?.split(',').filter(Boolean) ?? [];
                return (
                  <div key={message.id} className="w-full">
                    <ConnectorReadinessCard
                      missingConnectorIds={ctaMissing}
                      moduleLabel={ctaModuleLabel}
                      workspaceId={activeWorkspace?.id}
                      onConnected={(connectorId) => {
                        // Mark this connector as active and proceed to workflow form / module
                        setActiveConnectorIds(prev => [...prev.filter(id => id !== connectorId), connectorId]);
                        onMessagesChange(prev => prev.filter(m => m.id !== message.id));
                        setPendingWorkflow(null);
                        // After connecting, open the module directly (or show form if available)
                        if (hasWorkflowForm(ctaModuleId)) {
                          const form = WORKFLOW_FORMS[ctaModuleId];
                          const formMsgId = `wf-form-${Date.now()}`;
                          const formMsg: Message = {
                            id: formMsgId, content: '', sender: 'ai', timestamp: new Date(),
                            workflowForm: form, workflowState: 'gathering_inputs',
                          };
                          onMessagesChange(prev => [...prev, formMsg]);
                          setPendingWorkflow({ moduleId: ctaModuleId, moduleLabel: ctaModuleLabel, formMessageId: formMsgId });
                        } else {
                          if (onModuleSelect) onModuleSelect(ctaModuleId);
                          const navKey = navResponseKey(ctaModuleId);
                          const navMsg: Message = { id: Date.now().toString(), content: MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${ctaModuleLabel} for you.`, sender: 'ai', timestamp: new Date() };
                          onMessagesChange(prev => [...prev, navMsg]);
                        }
                      }}
                      onSkip={() => {
                        // Let user proceed without connecting
                        onMessagesChange(prev => prev.filter(m => m.id !== message.id));
                        setPendingWorkflow(null);
                        if (hasWorkflowForm(ctaModuleId)) {
                          const form = WORKFLOW_FORMS[ctaModuleId];
                          const formMsgId = `wf-form-${Date.now()}`;
                          const formMsg: Message = {
                            id: formMsgId, content: '', sender: 'ai', timestamp: new Date(),
                            workflowForm: form, workflowState: 'gathering_inputs',
                          };
                          onMessagesChange(prev => [...prev, formMsg]);
                          setPendingWorkflow({ moduleId: ctaModuleId, moduleLabel: ctaModuleLabel, formMessageId: formMsgId });
                        } else {
                          if (onModuleSelect) onModuleSelect(ctaModuleId);
                          const navKey = navResponseKey(ctaModuleId);
                          const navMsg: Message = { id: Date.now().toString(), content: MODULE_NAV_RESPONSES[navKey] ?? `I've opened ${ctaModuleLabel} for you.`, sender: 'ai', timestamp: new Date() };
                          onMessagesChange(prev => [...prev, navMsg]);
                        }
                      }}
                    />
                  </div>
                );
              }

              // Workflow input form — render interactive form card
              if (message.workflowForm && message.workflowState === 'gathering_inputs') {
                const wf = pendingWorkflow;
                return (
                  <div key={message.id} className="w-full">
                    <WorkflowFormCard
                      form={message.workflowForm}
                      onSubmit={(values) =>
                        handleWorkflowFormSubmit(
                          message.id,
                          message.workflowForm!.moduleId,
                          wf?.moduleLabel ?? message.workflowForm!.moduleName,
                          values,
                        )
                      }
                      onSkip={() =>
                        handleWorkflowSkip(
                          message.id,
                          message.workflowForm!.moduleId,
                          wf?.moduleLabel ?? message.workflowForm!.moduleName,
                        )
                      }
                    />
                  </div>
                );
              }

              // Workflow confirmation card
              if (message.workflowState === 'awaiting_confirmation') {
                const wf = pendingWorkflow;
                return (
                  <div key={message.id} className="w-full">
                    <WorkflowConfirmCard
                      summary={message.content}
                      onConfirm={() =>
                        handleWorkflowConfirm(
                          message.id,
                          wf?.moduleId ?? '',
                          wf?.moduleLabel ?? '',
                          message.workflowParams ?? {},
                        )
                      }
                      onCancel={() => handleWorkflowCancel(message.id)}
                    />
                  </div>
                );
              }

              // Specialist subagent message — render as distinct branded card
              if (message.sender === 'ai' && message.agentName) {
                return (
                  <div key={message.id} className="w-full">
                    <SubagentMessageCard
                      message={message}
                      onModuleSelect={onModuleSelect}
                      onFollowUpClick={(text) => setInputValue(text)}
                    />
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
                    {/* ── Routing: connector prompt ─────────────────────── */}
                    {message.connector_prompt && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 items-start">
                        <span className="text-lg">⚠️</span>
                        <div className="flex-1">
                          <p className="text-sm text-amber-900 font-medium mb-2">{message.connector_prompt.message}</p>
                          <div className="flex gap-2">
                            {(message.connector_prompt.missingLabels ?? message.connector_prompt.missing).map((label) => (
                              <button
                                key={label}
                                onClick={() => onModuleSelect?.('integrations')}
                                className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700 transition"
                              >
                                Connect {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* ── Routing: artifact renderer ────────────────────── */}
                    {message.artifact && <ArtifactBlock artifact={message.artifact} />}
                    {/* ── Routing: follow-up suggestions ───────────────── */}
                    {message.follow_ups && message.follow_ups.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium">Suggested next steps:</p>
                        {message.follow_ups.map((fu, i) => (
                          <button
                            key={i}
                            onClick={() => { setInputValue(fu); }}
                            className="block w-full text-left text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded transition"
                          >
                            → {fu}
                          </button>
                        ))}
                      </div>
                    )}
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
              {taskAgent ? `${BRAND.agentName} routing work to ${DIRECT_AGENTS.find((agent) => agent.name === taskAgent)?.label}` : `${BRAND.agentName} task routing`}
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
