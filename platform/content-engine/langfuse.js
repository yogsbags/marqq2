/**
 * Langfuse Tracing — LLM observability for Marqq AI
 *
 * Uses the classic `langfuse` SDK (v3) to send traces directly via HTTP.
 * Wraps groq.chat.completions.create() calls to capture:
 *   - model, prompt, completion, token usage, latency
 *   - sessionId, userId, tags per call
 */

import Langfuse from 'langfuse'
import Groq from 'groq-sdk'
import { createLLMClient, LLM_PROVIDER, LLM_MODEL } from './llm-client.js'

export const hasLangfuse = !!(
  process.env.LANGFUSE_SECRET_KEY &&
  process.env.LANGFUSE_PUBLIC_KEY &&
  process.env.LANGFUSE_BASE_URL
)

let lf = null

if (hasLangfuse) {
  lf = new Langfuse({
    secretKey:     process.env.LANGFUSE_SECRET_KEY,
    publicKey:     process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl:       process.env.LANGFUSE_BASE_URL,
    flushAt:       5,
    flushInterval: 3000,
  })
  console.log('[Langfuse] Tracing enabled →', process.env.LANGFUSE_BASE_URL)
} else {
  console.warn('[Langfuse] Missing env vars — tracing disabled')
}

export { lf as langfuse }

// Flush pending traces before the process exits so no events are lost
if (hasLangfuse && lf) {
  const flush = () => lf.flushAsync().catch(() => {})
  process.on('beforeExit', flush)
  process.on('SIGTERM', () => flush().finally(() => process.exit(0)))
  process.on('SIGINT',  () => flush().finally(() => process.exit(0)))
}


/**
 * Wrap a streaming Groq response so we collect full text + usage,
 * then finalize the Langfuse generation when the stream ends.
 */
// Rough token estimate when model doesn't return usage (≈4 chars per token)
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

function messagesText(messages) {
  return (messages || []).map(m => m.content || '').join(' ')
}

async function* wrapStream(stream, generation, trace, startTime, inputMessages) {
  let fullContent = ''
  let usage = null
  try {
    for await (const chunk of stream) {
      fullContent += chunk.choices?.[0]?.delta?.content ?? ''
      if (chunk.usage?.prompt_tokens != null) usage = chunk.usage
      yield chunk
    }
  } finally {
    // Fall back to character-based estimate if model didn't return usage
    const inputTokens  = usage?.prompt_tokens     ?? estimateTokens(messagesText(inputMessages))
    const outputTokens = usage?.completion_tokens  ?? estimateTokens(fullContent)
    generation.end({
      output: fullContent,
      usage: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      latency: Date.now() - startTime,
    })
    trace.update({ output: fullContent })
  }
}

/**
 * Returns a Groq client proxy that traces every chat.completions.create() call.
 *
 * @param {object} opts
 * @param {string} [opts.traceName]  - e.g. 'agent-run:isha'
 * @param {string} [opts.sessionId] - groups traces for same run
 * @param {string} [opts.userId]    - company/workspace ID
 * @param {string[]} [opts.tags]    - e.g. ['agent-run', 'isha']
 */
export function tracedLLM({ traceName = 'llm-call', sessionId, userId, tags, provider } = {}) {
  // Use the provider-agnostic client (Claude / Groq / OpenAI based on LLM_PROVIDER env)
  const groqClient = createLLMClient(provider)

  if (!hasLangfuse || !lf) return groqClient

  const originalCreate = groqClient.chat.completions.create.bind(groqClient.chat.completions)

  groqClient.chat.completions.create = async function (params, options) {
    const traceOpts = {
      ...(sessionId && { sessionId }),
      ...(userId    && { userId }),
      ...(tags      && { tags }),
    }
    const trace = lf.trace({ name: traceName, ...traceOpts, input: params.messages })
    const generation = trace.generation({
      name: traceName,
      model: params.model,
      modelParameters: {
        temperature: params.temperature,
        max_tokens: params.max_tokens || params.max_completion_tokens,
        stream: params.stream ?? false,
      },
      input: params.messages,
      ...traceOpts,
    })

    const startTime = Date.now()

    try {
      if (params.stream) {
        // Request usage data from Groq on the last chunk
        const augmented = {
          ...params,
          stream_options: { include_usage: true, ...(params.stream_options || {}) },
        }
        const stream = await originalCreate(augmented, options)
        return wrapStream(stream, generation, trace, startTime, params.messages)
      }

      // Non-streaming
      const result = await originalCreate(params, options)
      const output = result.choices?.[0]?.message?.content ?? ''
      const u = result.usage
      generation.end({
        output,
        ...(u && { usage: { input: u.prompt_tokens, output: u.completion_tokens, total: u.total_tokens } }),
        latency: Date.now() - startTime,
      })
      trace.update({ output })
      return result

    } catch (err) {
      generation.end({ level: 'ERROR', statusMessage: err.message, latency: Date.now() - startTime })
      throw err
    }
  }

  return groqClient
}

/**
 * Default traced Groq client — drop-in for the top-level `groq` const.
 */
export const tracedGroq = tracedLLM({ traceName: 'llm-call', tags: ['marqq'] })
