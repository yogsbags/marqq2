import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type GenerateBody = {
  campaignType?: string
  purpose?: string
  targetAudience?: string
  platforms?: string[]
  language?: string
}

const MODEL_PRIMARY = process.env.GROQ_TOPIC_MODEL || 'llama-3.3-70b-versatile'
const MODEL_FALLBACK = 'llama-3.3-70b-versatile'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const REFERENCE_FILENAME = 'pl-products-reference.md'

/** Returns true if the text looks like our instruction (echo) rather than a topic */
function isEchoOrInvalid(text: string | undefined, userPrompt: string): boolean {
  if (!text || text.length < 10) return true
  if (text.includes('Generate ONE concise campaign topic') || text.includes('Return ONLY the campaign topic')) return true
  if (text.includes('Type:') && text.includes('Purpose:') && text.includes('Platforms:')) return true
  if (text.length > 200 && text.includes('\n')) return true
  if (text === userPrompt.trim() || userPrompt.includes(text)) return true
  return false
}

/** Returns true if the topic is a generic "80 years / wealth creation / PL Capital solutions" tagline we want to avoid */
function isGenericTagline(text: string | undefined): boolean {
  if (!text || text.length < 15) return false
  const t = text.toLowerCase()
  const hasEightyYears = /\b80\s*years\b|\b80\+?\s*years\b|\beighty\s*years\b/i.test(text)
  const hasWealthCreation = /wealth\s*creation|wealth\s*creation\s*expertise/i.test(t)
  const hasPlSolutions = /pl\s*capital\s*solutions?|solutions?\s*with\s*pl\s*capital/i.test(t)
  const isMostlyTagline = (hasEightyYears && (hasWealthCreation || hasPlSolutions)) ||
    (hasWealthCreation && hasPlSolutions) ||
    (t.includes('expertise') && t.includes('pl capital') && text.split(/\s+/).length <= 12)
  return isMostlyTagline
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateBody = await request.json()
    const groqKey = process.env.GROQ_API_KEY

    if (!groqKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
    }

    const referencePath = path.join(process.cwd(), 'public', REFERENCE_FILENAME)
    const hasReference = fs.existsSync(referencePath)
    const reference = hasReference ? fs.readFileSync(referencePath, 'utf8') : ''

    const contextLines = [
      body.campaignType ? `Campaign type: ${body.campaignType}` : null,
      body.purpose ? `Purpose: ${body.purpose}` : null,
      body.targetAudience ? `Audience: ${body.targetAudience}` : null,
      body.platforms?.length ? `Platforms: ${body.platforms.join(', ')}` : null,
      hasReference ? `Product context (for ideas only; do not copy taglines):\n${reference.substring(400, 1800)}` : null,
    ].filter(Boolean) as string[]

    const userPrompt = [
      'Generate exactly one short campaign topic for PL Capital (finance). Max 15 words.',
      'Do NOT use generic taglines like "80 years of wealth creation", "PL Capital solutions", or "expertise with PL Capital". Give a specific, campaign-style topic (e.g. tax-saving strategies, mutual fund basics, IPO investing).',
      ...contextLines,
      'Reply with only the topic line, no labels or quotes. Example: 5 tax-saving strategies for HNIs in 2025',
    ].join('\n')

    console.log('Making request to Groq API with model:', MODEL_PRIMARY)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const response = await fetch(
      GROQ_API_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_PRIMARY,
          messages: [
            {
              role: 'system',
              content: 'You are a creative marketing expert for PL Capital (financial services). Your reply must be ONLY one short, specific campaign topic (max 15 words). Do NOT use generic taglines like "80 years of wealth creation" or "PL Capital solutions". Prefer concrete topics: tax saving, mutual funds, IPO, options, portfolio tips, market outlook, etc. No labels, no "Topic:", no quotes. Example: 5 tax-saving strategies for HNIs in 2025'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 80
        }),
        signal: controller.signal
      }
    ).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Groq API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Groq API request failed: ${response.status} ${errorText}` },
        { status: 500 }
      )
    }

    const result = await response.json()
    console.log('Groq API response (topic):', result?.choices?.[0]?.message?.content?.slice(0, 200))

    const message = result?.choices?.[0]?.message
    let topic = message?.content?.trim()

    if (!topic && message?.reasoning) {
      const reasoning = message.reasoning.trim()
      const quoteMatch = reasoning.match(/"([^"]+)"/)
      if (quoteMatch) topic = quoteMatch[1]
      else {
        const sentences = reasoning.split(/[.!?]/).filter((s: string) => s.trim().length > 10)
        topic = sentences[sentences.length - 1]?.trim() || reasoning
      }
    }

    if (topic && topic.includes('\n')) topic = topic.split('\n')[0].trim()

    topic = topic?.replace(/^["']|["']$/g, '').trim()

    const fillerPatterns = [
      /^So something like[:\s]+/i,
      /^Here'?s? a topic[:\s]+/i,
      /^Topic[:\s]+/i,
      /^Campaign topic[:\s]+/i,
      /^How about[:\s]+/i,
      /^Try this[:\s]+/i,
      /^Reply with only[:\s]+/i,
      /^Example[:\s]+/i,
      /^Unleash [^:]+:\s*/i,
      /^Discover [^:]+:\s*/i,
      /^Unlock [^:]+:\s*/i,
      /^Experience [^:]+:\s*/i,
      /^Transform [^:]+:\s*/i,
      /^[A-Z][^:]{0,40}:\s*(?=[A-Z])/,
    ]
    for (const pattern of fillerPatterns) {
      topic = topic?.replace(pattern, '').trim() ?? ''
    }
    topic = topic?.replace(/^["']|["']$/g, '').trim()

    if (isEchoOrInvalid(topic, userPrompt) || isGenericTagline(topic) || !topic || topic.length < 5) {
      if (isGenericTagline(topic)) console.error('Topic is generic tagline, retrying')
      else console.error('Topic invalid or echo, retrying with fallback model')
      const fallbackResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_FALLBACK,
          messages: [
            { role: 'system', content: 'Reply with one short, specific campaign topic for PL Capital (max 15 words). Do NOT use "80 years", "wealth creation expertise", or "PL Capital solutions". Use a concrete topic like tax saving, mutual funds, IPO, or market tips. No labels, no quotes. Example: 5 tax-saving strategies for HNIs in 2025' },
            { role: 'user', content: `Campaign: ${body.campaignType || 'general'}. Purpose: ${body.purpose || 'brand-awareness'}. Audience: ${body.targetAudience || 'all'}. Give one specific topic line only (e.g. tax saving, mutual funds, IPO), not a generic tagline.` }
          ],
          temperature: 0.7,
          max_tokens: 80
        })
      })
      if (!fallbackResponse.ok) {
        return NextResponse.json(
          { error: 'No valid topic generated from Groq response', debug: result },
          { status: 500 }
        )
      }
      const fallbackResult = await fallbackResponse.json()
      topic = fallbackResult?.choices?.[0]?.message?.content?.trim()
      if (topic?.includes('\n')) topic = topic.split('\n')[0].trim()
      topic = topic?.replace(/^["']|["']$/g, '').trim()
      for (const pattern of fillerPatterns) {
        topic = topic?.replace(pattern, '').trim() ?? ''
      }
      topic = topic?.replace(/^["']|["']$/g, '').trim()
    }

    if (!topic || topic.length < 5) {
      console.error('Failed to extract valid topic from response:', result)
      return NextResponse.json(
        { error: 'No valid topic generated from Groq response', debug: result },
        { status: 500 }
      )
    }

    if (isGenericTagline(topic)) {
      console.error('Topic rejected as generic tagline:', topic)
      return NextResponse.json(
        { error: 'Generated topic was too generic. Please try again for a more specific topic.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ topic, model: MODEL_PRIMARY })
  } catch (error) {
    console.error('Topic generation error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out after 15 seconds. Please try again.' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
