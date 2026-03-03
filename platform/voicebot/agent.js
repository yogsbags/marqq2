import {
  cli,
  defineAgent,
  metrics,
  ServerOptions,
  voice,
  llm
} from '@livekit/agents'
import * as livekit from '@livekit/agents-plugin-livekit'
import * as silero from '@livekit/agents-plugin-silero'
import * as openai from '@livekit/agents-plugin-openai'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as cartesia from '@livekit/agents-plugin-cartesia'
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'martech-voicebot'
const BACKEND_ORIGIN = process.env.VOICEBOT_BACKEND_ORIGIN || 'http://127.0.0.1:3008'

function pickVoiceId({ language, gender }) {
  const lang = language === 'hi' ? 'hi' : 'en'
  const gen = gender === 'male' ? 'male' : 'female'

  if (lang === 'hi' && gen === 'male') return process.env.CARTESIA_VOICE_ID_HI_MALE || process.env.CARTESIA_VOICE_ID_EN_MALE
  if (lang === 'hi' && gen === 'female') return process.env.CARTESIA_VOICE_ID_HI_FEMALE || process.env.CARTESIA_VOICE_ID_EN_FEMALE
  if (lang === 'en' && gen === 'male') return process.env.CARTESIA_VOICE_ID_EN_MALE
  return process.env.CARTESIA_VOICE_ID_EN_FEMALE
}

async function kbSearch(query, limit = 6) {
  const resp = await fetch(`${BACKEND_ORIGIN}/api/voicebot/kb/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit })
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json?.error || json?.details || 'KB search failed')
  const results = Array.isArray(json?.results) ? json.results : []
  return results
}

class MarbleStyleOutboundAgent extends voice.Agent {
  constructor({ language = 'en', gender = 'female' } = {}) {
    const lang = language === 'hi' ? 'hi' : 'en'
    const gen = gender === 'male' ? 'male' : 'female'

    super({
      instructions: `You are an AI Voice Bot for performance marketing/finance outreach.
You MUST follow this workflow (stateful progression):
1) Greeting (confirm you reached the right person)
2) Value proposition (1 sentence, relevant to the lead)
3) Qualification (ask 1 question)
4) CTA (offer 2 time slots or next step)
5) Close (polite wrap-up)

Constraints:
- Keep each response 1-3 short sentences; spoken, natural.
- Ask at most ONE question per turn.
- Finance compliance: no guaranteed returns, no personalized investment advice.

Language:
- If Hindi: respond in Hindi (Devanagari), conversational Indian tone.
- If English: respond in Indian English.

Use the knowledge base tool when the user asks about the company, products, pricing, or client details.`,

      tools: {
        search_client_kb: llm.tool({
          description: 'Search uploaded client documents for relevant details and return short snippets with filenames.',
          parameters: z.object({
            query: z.string(),
            limit: z.number().optional()
          }),
          execute: async ({ query, limit }) => {
            const results = await kbSearch(query, limit ?? 6)
            const lines = results.map((r) => `FILE: ${r.fileName}\nSNIPPET: ${String(r.snippet || '').slice(0, 600)}`)
            return lines.join('\n\n')
          }
        })
      },

      metadata: {
        language: lang,
        gender: gen
      }
    })
  }
}

export default defineAgent({
  name: AGENT_NAME,
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load()
  },
  entry: async (ctx) => {
    const dispatchMeta = ctx.job?.metadata ? JSON.parse(ctx.job.metadata) : {}
    const language = dispatchMeta?.language === 'hi' ? 'hi' : 'en'
    const gender = dispatchMeta?.gender === 'male' ? 'male' : 'female'

    const voiceId = pickVoiceId({ language, gender }) || '3b554273-4299-48b9-9aaf-eefd438e3941'

    const session = new voice.AgentSession({
      stt: new deepgram.STT({
        model: 'nova-2',
        language
      }),
      llm: new openai.LLM({
        model: 'gpt-4o'
      }),
      tts: new cartesia.TTS({
        model: 'sonic-3',
        voice: voiceId
      }),
      turnDetection: new livekit.turnDetector.MultilingualModel(),
      vad: ctx.proc.userData.vad,
      voiceOptions: { preemptiveGeneration: true }
    })

    const usageCollector = new metrics.UsageCollector()
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics)
      usageCollector.collect(ev.metrics)
    })
    ctx.addShutdownCallback(() => {
      const summary = usageCollector.getSummary()
      console.log(`[voicebot-agent] Usage: ${JSON.stringify(summary)}`)
    })

    await session.start({
      agent: new MarbleStyleOutboundAgent({ language, gender }),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation()
      }
    })

    await ctx.connect()
  }
})

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }))
