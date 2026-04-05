/**
 * llm-client.js — Provider-agnostic LLM client factory
 * ======================================================
 * Reads LLM_PROVIDER + LLM_MODEL from env and returns a client with the
 * same interface as the Groq / OpenAI SDK (chat.completions.create).
 *
 * Supported providers
 * ───────────────────
 *   claude   → Anthropic via their OpenAI-compatible endpoint  (DEFAULT)
 *   groq     → Groq SDK (llama / compound / qwen models)
 *   openai   → OpenAI SDK (gpt-4o etc.)
 *
 * Usage
 * ─────
 *   import { defaultLLMClient, getLLMModel } from './llm-client.js';
 *
 *   const completion = await defaultLLMClient.chat.completions.create({
 *     model: getLLMModel('agent-run'),    // resolves env override → provider default
 *     messages: [...],
 *     stream: true,
 *   });
 *
 * Environment variables
 * ─────────────────────
 *   LLM_PROVIDER          claude | groq | openai   (default: claude)
 *   LLM_MODEL             override the default model for the chosen provider
 *
 *   Per-role model overrides (still respected):
 *   GROQ_AGENT_RUN_MODEL, GROQ_AGENT_PLAN_MODEL, GROQ_COMPANY_INTEL_MODEL …
 *   These fall through to LLM_MODEL if not set.
 *
 *   ANTHROPIC_API_KEY     required when LLM_PROVIDER=claude
 *   GROQ_API_KEY          required when LLM_PROVIDER=groq
 *   OPENAI_API_KEY        required when LLM_PROVIDER=openai
 */

import Groq from 'groq-sdk';
import OpenAI from 'openai';

// ── Provider resolution ───────────────────────────────────────────────────────

export const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'claude').toLowerCase();

// Default model per provider if LLM_MODEL is not set
const PROVIDER_DEFAULT_MODELS = {
  claude:  'claude-sonnet-4-5',
  openai:  'gpt-4o',
  groq:    'llama-3.3-70b-versatile',
};

/**
 * The resolved default model string for the active provider.
 * Individual call sites can pass `model` directly, but this is the fallback.
 */
export const LLM_MODEL = process.env.LLM_MODEL || PROVIDER_DEFAULT_MODELS[LLM_PROVIDER] || 'claude-sonnet-4-5';

/**
 * Returns the model to use for a specific role, respecting:
 *   1. Role-specific env override  (e.g. GROQ_AGENT_RUN_MODEL)
 *   2. Generic LLM_MODEL override
 *   3. Provider default
 *
 * @param {'agent-run'|'agent-run-tool'|'agent-plan'|'company-intel'|'company-profile'|'voicebot'|string} role
 */
export function getLLMModel(role = 'default') {
  const roleEnvMap = {
    'agent-run':      process.env.GROQ_AGENT_RUN_MODEL,
    'agent-run-tool': process.env.GROQ_AGENT_RUN_TOOL_MODEL,
    'agent-plan':     process.env.GROQ_AGENT_PLAN_MODEL,
    'company-intel':  process.env.GROQ_COMPANY_INTEL_MODEL,
    'company-profile':process.env.GROQ_COMPANY_PROFILE_MODEL || process.env.GROQ_COMPANY_INTEL_MODEL,
    'voicebot':       process.env.GROQ_VOICEBOT_MODEL,
  };
  return roleEnvMap[role] || LLM_MODEL;
}

// ── Client factory ────────────────────────────────────────────────────────────

/**
 * Creates a provider-specific LLM client.
 * Always returns an object with a `.chat.completions.create()` interface
 * matching the OpenAI / Groq SDK shape.
 */
export function createLLMClient() {
  switch (LLM_PROVIDER) {

    case 'claude':
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn('[llm-client] LLM_PROVIDER=claude but ANTHROPIC_API_KEY is not set. Falling back to Groq.');
        return new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
      }
      // Anthropic exposes an OpenAI-compatible endpoint at /v1
      // The `openai` SDK works against it with a custom baseURL + required header.
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.anthropic.com/v1',
        defaultHeaders: {
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'claude-3-7-sonnet-20250219,interleaved-thinking-2025-05-14',
        },
      });
      console.log(`[llm-client] Provider: Anthropic Claude (${LLM_MODEL})`);
      return client;
    }

    case 'openai': {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
      console.log(`[llm-client] Provider: OpenAI (${LLM_MODEL})`);
      return client;
    }

    case 'groq':
    default: {
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
      console.log(`[llm-client] Provider: Groq (${LLM_MODEL})`);
      return client;
    }
  }
}

/**
 * Default singleton LLM client — use this as a drop-in for `groq` references.
 */
export const defaultLLMClient = createLLMClient();

/**
 * Whether the active provider is Claude/Anthropic.
 * Useful for conditionally stripping Groq-specific params (e.g. compound routing).
 */
export const isClaudeProvider   = LLM_PROVIDER === 'claude' || LLM_PROVIDER === 'anthropic';
export const isGroqProvider     = LLM_PROVIDER === 'groq';
export const isOpenAIProvider   = LLM_PROVIDER === 'openai';
