import {
  cli,
  defineAgent,
  metrics,
  ServerOptions,
  audioFramesFromFile,
  mergeFrames,
  shortuuid,
  stt,
  tokenize,
  tts,
  voice,
  llm
} from '@livekit/agents'
import * as silero from '@livekit/agents-plugin-silero'
import * as openai from '@livekit/agents-plugin-openai'
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'martech-voicebot'
const BACKEND_ORIGIN = process.env.VOICEBOT_BACKEND_ORIGIN || 'http://127.0.0.1:3008'

function normalizeLanguage(language) {
  return language === 'hi' ? 'hi' : 'en'
}

function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female'
}

function mimeTypeToExtension(mimeType = '') {
  const mime = String(mimeType || '').toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('webm')) return 'webm'
  return 'bin'
}

function frameToWavBuffer(buffer) {
  const frame = mergeFrames(buffer)
  const pcm = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
  const header = Buffer.alloc(44)
  const byteRate = frame.sampleRate * frame.channels * 2
  const blockAlign = frame.channels * 2

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(frame.channels, 22)
  header.writeUInt32LE(frame.sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

async function callBackendJson(pathname, body) {
  const resp = await fetch(`${BACKEND_ORIGIN}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(json?.error || json?.details || `Backend request failed: ${pathname}`)
  }
  return json
}

class SarvamSTT extends stt.STT {
  label = 'sarvam.STT'

  constructor({ language = 'en' } = {}) {
    super({ streaming: false, interimResults: false })
    this.language = normalizeLanguage(language)
  }

  async _recognize(buffer) {
    const wavBuffer = frameToWavBuffer(buffer)
    const json = await callBackendJson('/api/voicebot/stt', {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav',
      language: this.language
    })
    const transcript = String(json?.transcript || '').trim()
    const requestId = json?.requestId || shortuuid('sarvam_stt')
    return {
      type: stt.SpeechEventType.FINAL_TRANSCRIPT,
      requestId,
      alternatives: [
        {
          language: json?.languageCode || (this.language === 'hi' ? 'hi-IN' : 'en-IN'),
          text: transcript,
          startTime: 0,
          endTime: 0,
          confidence: 1
        }
      ]
    }
  }

  stream() {
    throw new Error('Sarvam STT uses stream adapter')
  }
}

class SarvamChunkedStream extends tts.ChunkedStream {
  label = 'sarvam.ChunkedStream'

  constructor(ttsInstance, text, language, gender, connOptions, abortSignal) {
    super(text, ttsInstance, connOptions, abortSignal)
    this.language = normalizeLanguage(language)
    this.gender = normalizeGender(gender)
  }

  async run() {
    let tempPath = null
    try {
      const json = await callBackendJson('/api/voicebot/tts', {
        text: this.inputText,
        language: this.language,
        gender: this.gender
      })
      const audioBuffer = Buffer.from(String(json?.audioBase64 || ''), 'base64')
      const extension = mimeTypeToExtension(json?.mimeType || 'audio/mpeg')
      tempPath = path.join(tmpdir(), `${shortuuid('sarvam_tts')}.${extension}`)
      await writeFile(tempPath, audioBuffer)

      const requestId = shortuuid('sarvam_tts')
      let lastFrame = null
      for await (const frame of audioFramesFromFile(tempPath, {
        sampleRate: 48000,
        numChannels: 1,
        abortSignal: this.abortSignal
      })) {
        if (lastFrame) {
          this.queue.put({ requestId, segmentId: requestId, frame: lastFrame, final: false })
        }
        lastFrame = frame
      }
      if (lastFrame) {
        this.queue.put({ requestId, segmentId: requestId, frame: lastFrame, final: true })
      }
    } finally {
      this.queue.close()
      if (tempPath) {
        try {
          await unlink(tempPath)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

class SarvamTTS extends tts.TTS {
  label = 'sarvam.TTS'

  constructor({ language = 'en', gender = 'female' } = {}) {
    super(48000, 1, { streaming: false })
    this.language = normalizeLanguage(language)
    this.gender = normalizeGender(gender)
  }

  synthesize(text, connOptions, abortSignal) {
    return new SarvamChunkedStream(
      this,
      text,
      this.language,
      this.gender,
      connOptions,
      abortSignal
    )
  }

  stream() {
    throw new Error('Sarvam TTS uses stream adapter')
  }
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
    const language = normalizeLanguage(dispatchMeta?.language)
    const gender = normalizeGender(dispatchMeta?.gender)
    const sarvamStt = new stt.StreamAdapter(new SarvamSTT({ language }), ctx.proc.userData.vad)
    const sarvamTts = new tts.StreamAdapter(
      new SarvamTTS({ language, gender }),
      new tokenize.basic.SentenceTokenizer()
    )

    const session = new voice.AgentSession({
      stt: sarvamStt,
      llm: new openai.LLM({
        model: 'gpt-4o'
      }),
      tts: sarvamTts,
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
