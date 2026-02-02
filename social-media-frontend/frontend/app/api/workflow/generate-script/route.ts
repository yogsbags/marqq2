import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'English',
  hinglish: 'Hinglish (Hindi in Latin script)',
  hindi: 'Hindi',
  bengali: 'Bengali',
  telugu: 'Telugu',
  marathi: 'Marathi',
  tamil: 'Tamil',
  gujarati: 'Gujarati',
  kannada: 'Kannada',
  malayalam: 'Malayalam',
  punjabi: 'Punjabi',
  urdu: 'Urdu',
  odia: 'Odia',
  assamese: 'Assamese'
}

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code?.toLowerCase() || ''] ?? 'English'
}

type GenerateScriptBody = {
  topic: string
  duration?: number
  platform?: string
  format?: string
  language?: string
  planningContext?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateScriptBody = await request.json()
    const topic = (body.topic || '').trim() || 'PL Capital investing insights'
    const platform = body.platform || 'instagram'
    const format = body.format || 'reel'
    const duration = Math.max(8, Number(body.duration) || 8)
    const language = body.language || 'english'
    const planningText = (body.planningContext || '').trim()

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      const needsDisclaimer = /(english|hinglish)/i.test(language)
      const disclaimer = needsDisclaimer ? 'Market risks apply.' : ''
      const hook = platform === 'instagram' ? 'Stop scrolling—quick money tip.' : 'Quick update.'
      const fallback = `${hook} ${topic}. Want a simple plan? Talk to PL Capital today. ${disclaimer}`.trim()
      return NextResponse.json({ script: fallback })
    }

    const wordsTarget = Math.max(12, Math.round(duration * 2.2))
    const languageName = getLanguageName(language)
    const isInstagramReel = platform === 'instagram' || /reel/i.test(format)
    const needsDisclaimer = /(english|hinglish)/i.test(language)

    const systemPrompt = `You write short, natural spoken scripts for a financial services video avatar.
Return ONLY the spoken script as plain text. No bullet points. No headings. No stage directions. No meta-instructions.`

    const styleGuidance = isInstagramReel
      ? `Style (Instagram Reels, Indian audience):
- Hook in the first sentence (pattern interrupt).
- Short punchy sentences, spoken like a credible Indian finfluencer (not cheesy).
- Use everyday India cues where relevant (₹, SIP, tax, salary day) without giving personalized advice.
- Close with a strong CTA: "Save this", "Share", "Follow", or "Comment 'PLAN'".`
      : ''

    const userPrompt = `Write a single spoken script for an AI avatar video.

Constraints:
- Platform: ${platform}
- Format: ${format}
- Topic: ${topic}
- Duration: ${duration} seconds
- Language: ${languageName}
- Tone: confident, warm, professional, Indian business style.
- Length: about ${wordsTarget} words (max ${wordsTarget + 6}).
- Compliance: no guaranteed returns, no exaggerated claims, no personalized investment advice.
- If language is English or Hinglish, end with the exact disclaimer: "Market risks apply." (exactly once).

${styleGuidance}

Optional context from campaign planning (may include purpose/audience/tone):
${planningText ? planningText.slice(0, 2000) : '(none)'}

Output rules:
- Output ONLY the script text the avatar should speak.
- Do NOT include quotation marks or labels like "Script:".`

    const model = process.env.GROQ_HEYGEN_SCRIPT_MODEL || DEFAULT_MODEL

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: 400
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('Groq generate-script error:', response.status, text)
      return NextResponse.json(
        { error: text || `Groq API error: ${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json()
    let script = (data.choices?.[0]?.message?.content || '').trim()

    script = script.replace(/^```[\s\S]*?$/gm, '').trim()
    script = script.replace(/^\s*script\s*:\s*/i, '').trim()
    script = script.replace(/^["']|["']$/g, '').trim()

    const words = script.split(/\s+/).filter(Boolean)
    if (words.length > wordsTarget + 12) {
      script = words.slice(0, wordsTarget + 12).join(' ').trim()
    }

    if (needsDisclaimer && !/market risks apply\.?$/i.test(script)) {
      script = `${script.replace(/\.*\s*$/, '')}. Market risks apply.`
    }

    return NextResponse.json({ script })
  } catch (e) {
    console.error('generate-script error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to generate script' },
      { status: 500 }
    )
  }
}
