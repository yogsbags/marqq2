/**
 * groqService.ts — Provider-agnostic frontend LLM client
 * ========================================================
 * Named "groqService" for historical reasons; now supports any provider.
 *
 * Provider resolution (in priority order):
 *   1. VITE_LLM_PROVIDER env var   (claude | groq | openai)
 *   2. VITE_GROQ_API_KEY present   → groq (legacy fallback)
 *   3. Default                     → routes through backend /api/chat
 *
 * Model:
 *   VITE_LLM_MODEL env var overrides the provider default.
 *
 * Security note: API calls that require secret keys (Claude, OpenAI) are
 * proxied through the backend so keys are never exposed in browser bundles.
 * Only VITE_GROQ_API_KEY is allowed client-side (read-only inference key).
 */

import { BRAND } from '@/lib/brand';

// ── Provider resolution ──────────────────────────────────────────────────────

const LLM_PROVIDER  = (import.meta.env.VITE_LLM_PROVIDER  || 'claude').toLowerCase();
const LLM_MODEL     = import.meta.env.VITE_LLM_MODEL || '';

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  claude:  'claude-sonnet-4-5',
  openai:  'gpt-4o',
  groq:    'openai/gpt-oss-120b',
};

const RESOLVED_MODEL = LLM_MODEL || PROVIDER_DEFAULT_MODELS[LLM_PROVIDER] || 'claude-sonnet-4-5';

// Legacy Groq key — only used when LLM_PROVIDER=groq
const GROQ_API_KEY  = import.meta.env.VITE_GROQ_API_KEY || '';
const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';

// Backend proxy endpoint — used for Claude / OpenAI so keys stay server-side
const BACKEND_CHAT_URL = '/api/chat/completions';

if (LLM_PROVIDER === 'groq' && !GROQ_API_KEY) {
  console.warn('[groqService] LLM_PROVIDER=groq but VITE_GROQ_API_KEY is not set.');
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type VeenaResponse =
  | { route: 'answer'; content: string; reasoning?: string }
  | { route: 'agent'; agentName: string; label: string; query: string }
  | { route: 'module'; moduleId: string; label: string };

// ── Routing tools (Veena tool schema) ───────────────────────────────────────

const ROUTING_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'route_to_agent',
      description: 'Route an action request to the right specialist agent. Use when the user wants to create, write, launch, build, find, generate, run, or execute something.',
      parameters: {
        type: 'object',
        properties: {
          agentName: {
            type: 'string',
            enum: ['arjun', 'riya', 'maya', 'zara', 'dev', 'priya', 'kiran', 'sam', 'isha', 'neel', 'tara'],
            description: 'arjun=leads/outreach, riya=content/copy, maya=SEO/LLMO, zara=paid ads/campaigns, dev=competitor analysis/analytics, priya=brand/positioning, kiran=organic social, sam=email, isha=ICP/audience research, neel=strategy/positioning/GTM, tara=CRO/offers/conversion',
          },
          label: { type: 'string', description: 'Display label e.g. "Riya · Content Producer"' },
          query: { type: 'string', description: 'Rephrased user request as a clear task for the agent' },
        },
        required: ['agentName', 'label', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_module',
      description: 'Open a specific workspace when the user explicitly asks to go there or the task is clearly workspace-specific structured work.',
      parameters: {
        type: 'object',
        properties: {
          moduleId: {
            type: 'string',
            enum: [
              'company-intelligence', 'lead-intelligence', 'seo-llmo', 'budget-optimization',
              'ai-content', 'social-media', 'performance-scorecard', 'landing-pages',
              'market-signals', 'audience-profiles', 'positioning', 'offer-design',
              'messaging', 'channel-health', 'social-calendar', 'ad-creative',
              'email-sequence', 'lead-outreach', 'cro', 'marketing-audit',
              'launch-strategy', 'revenue-ops', 'lead-magnets', 'sales-enablement',
              'paid-ads', 'referral-program', 'churn-prevention', 'ab-test',
              'ai-voice-bot', 'ai-video-bot', 'user-engagement', 'unified-customer-view',
              'industry-intelligence', 'action-plan', 'cro-audit',
            ],
          },
          label: { type: 'string', description: 'Human-readable module name' },
        },
        required: ['moduleId', 'label'],
      },
    },
  },
];

const SYSTEM_PROMPT = (companyContext: string) =>
  `You are Veena, the AI chief of staff at ${BRAND.name} — a B2B marketing intelligence platform. You help founders and marketers with strategy, positioning, ICP, competitors, content, SEO, paid ads, funnels, and growth.

Respond in plain conversational text only. No markdown — no bold, no headings, no bullet points, no numbered lists, no tables, no code blocks, no asterisks, no hyphens as bullets. Write in short paragraphs like a message from a smart colleague.
For action requests (create, write, launch, build, find, run), call the route_to_agent tool.
For requests to open a specific workspace, call the open_module tool.

Never mention "MKG" or "Marketing Knowledge Graph" — say "your company context". Be direct and specific. If company context is available, use it. If it is thin, give the best advice you can.
${companyContext ? `\nCompany context:\n${companyContext}` : ''}`;

// ── Core fetch helper ────────────────────────────────────────────────────────

/**
 * Returns { url, headers } for the active provider.
 * Claude and OpenAI route through the backend proxy; Groq hits its API directly.
 */
function getLLMEndpoint(): { url: string; headers: Record<string, string> } {
  if (LLM_PROVIDER === 'groq' && GROQ_API_KEY) {
    return {
      url: GROQ_API_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
    };
  }

  // Claude / OpenAI — proxy through backend (keeps API keys server-side)
  return {
    url: BACKEND_CHAT_URL,
    headers: { 'Content-Type': 'application/json' },
  };
}

/** Build the request body, normalising provider-specific params. */
function buildRequestBody(opts: {
  messages: ChatMessage[];
  stream: boolean;
  tools?: unknown[];
  toolChoice?: string;
  maxTokens?: number;
  temperature?: number;
}): Record<string, unknown> {
  const { messages, stream, tools, toolChoice, maxTokens = 8192, temperature = 0.41 } = opts;

  const body: Record<string, unknown> = {
    model: RESOLVED_MODEL,
    messages,
    stream,
    temperature,
  };

  if (LLM_PROVIDER === 'groq' && GROQ_API_KEY) {
    // Groq-specific: reasoning params and max_completion_tokens
    body.max_completion_tokens = maxTokens;
    body.reasoning_effort = 'medium';
    body.reasoning_format = 'hidden';
    body.top_p = 1;
  } else {
    // Standard OpenAI / Anthropic-compat shape
    body.max_tokens = maxTokens;
  }

  if (tools) {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }

  return body;
}

// ── Veena: streaming + tool calling ─────────────────────────────────────────

export async function askVeena(
  messages: ChatMessage[],
  companyContext: string,
  onToken: (token: string) => void,
  onReasoning?: (token: string) => void,
): Promise<VeenaResponse> {
  const { url, headers } = getLLMEndpoint();

  const body = buildRequestBody({
    messages: [{ role: 'system', content: SYSTEM_PROMPT(companyContext) }, ...messages],
    stream: true,
    tools: ROUTING_TOOLS,
    toolChoice: 'auto',
  });

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body!.getReader();
  const dec = new TextDecoder();
  let contentAccum = '';
  let reasoningAccum = '';
  let sseBuffer = '';

  type ToolCallAccum = { name: string; args: string };
  const toolCalls: Record<number, ToolCallAccum> = {};

  outer: while (true) {
    const { done, value } = await reader.read();
    const chunkText = dec.decode(value || new Uint8Array(), { stream: !done });
    sseBuffer += chunkText;
    const lines = sseBuffer.split('\n');
    sseBuffer = done ? '' : (lines.pop() || '');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break outer;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
            if (!toolCalls[idx]) toolCalls[idx] = { name: '', args: '' };
            if (tc.function?.name)      toolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
          }
        }

        if (delta.reasoning && onReasoning) {
          reasoningAccum += delta.reasoning;
          onReasoning(delta.reasoning);
        }

        if (delta.content) {
          contentAccum += delta.content;
          onToken(delta.content);
        }
      } catch {
        // ignore malformed chunks
      }
    }

    if (done) break;
  }

  const firstTool = toolCalls[0];
  if (firstTool?.name) {
    try {
      const args = JSON.parse(firstTool.args);
      if (firstTool.name === 'route_to_agent') {
        return { route: 'agent', agentName: args.agentName, label: args.label, query: args.query };
      }
      if (firstTool.name === 'open_module') {
        return { route: 'module', moduleId: args.moduleId, label: args.label };
      }
    } catch {
      // malformed tool args — fall through to answer
    }
  }

  return { route: 'answer', content: contentAccum, reasoning: reasoningAccum || undefined };
}

// ── Plain content generation (non-streaming) ─────────────────────────────────

export class GroqService {
  static async getChatResponse(messages: ChatMessage[], companyContext?: string): Promise<string> {
    const { url, headers } = getLLMEndpoint();

    const systemContent = [
      `You are a helpful AI assistant for ${BRAND.name}, a B2B marketing intelligence platform.`,
      'Respond in plain conversational text only. No markdown, no bullet points, no tables, no bold, no headings. Write in short paragraphs.',
      "Never mention \"MKG\" or \"Marketing Knowledge Graph\".",
      companyContext ? `\nCompany context:\n${companyContext}` : '',
    ].filter(Boolean).join('\n');

    const body = buildRequestBody({
      messages: [{ role: 'system', content: systemContent }, ...messages],
      stream: false,
      maxTokens: 4096,
    });

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
  }
}
