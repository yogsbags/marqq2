import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

export const runtime = 'nodejs'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
})

const MODEL = 'openai/gpt-oss-120b'

/**
 * Generate HTML email newsletter with subject line using best practices
 * Follows subjectline.com guidelines and email marketing best practices
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      topic,
      purpose,
      targetAudience,
      creativePrompt, // From Stage 1
      brandSettings,
      language = 'en'
    } = body

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic is required' },
        { status: 400 }
      )
    }

    // Build brand guidelines
    let brandGuidance = ''
    if (brandSettings?.useBrandGuidelines) {
      brandGuidance = `
**PL Capital Brand Guidelines:**
- **Primary Colors**: Navy (#0e0e6a), Blue (#3c3cf8)
- **Accent Colors**: Teal (#00d084), Green (#66e766)
- **Typography**: Figtree font family, professional sans-serif fallbacks
- **Tone & Voice**: Professional, trustworthy, data-driven yet approachable
- **Visual Style**: Clean, modern, corporate with subtle tech motifs
- **Key Values**: Trust, Innovation, Performance, Client-First
- **Messaging**: Focus on adaptive strategies, quantitative excellence, consistent alpha
`
    } else if (brandSettings?.customColors || brandSettings?.customTone || brandSettings?.customInstructions) {
      brandGuidance = `
**Custom Brand Guidelines:**
${brandSettings.customColors ? `- **Brand Colors**: ${brandSettings.customColors}` : ''}
${brandSettings.customTone ? `- **Brand Tone**: ${brandSettings.customTone}` : ''}
${brandSettings.customInstructions ? `- **Additional Guidelines**: ${brandSettings.customInstructions}` : ''}
`
    }

const systemPrompt = `You are an expert email marketing specialist and HTML email designer.

Your task is to generate a complete, production-ready HTML email newsletter following industry best practices.

Layout reference (use this structure and styling cues):
- 600px wide, single-column responsive layout
- Header/hero image with logo (link to plindia.com) and top banner using:
  * Header image: https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/xtp/w8t/1aj/Asset%201.png
  * Hero/banner image slot (keep 600px width)
- Intro paragraph and section dividers
- “Market Highlights” section
- 3-column story grid with image + headline + “Read more” button (rounded 24px, #00b34e background, white text, Figtree bold 12px, generous horizontal padding)
- CTA section to visit PL Capital News
- Closing tagline and footer image:
  * Footer image: https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/9wn/vw0/ds6/Asset%202.png
- Fonts: Figtree (load via Google Fonts); Colors: Navy/Blue (#0000a0 accents), CTA buttons #00b34e, body text #000
- Dividers: 1px solid #0000a0 consistent throughout sections
- Social icons bar (below footer image): centered row of circular color icons linking to:
  * LinkedIn: https://www.linkedin.com/company/prabhudaslilladher/
  * Instagram: https://www.instagram.com/prabhudaslilladher/
  * X/Twitter: https://x.com/PLIndiaOnline
  * YouTube: https://www.youtube.com/@PrabhudasLilladherIndia
  * Telegram: https://t.me/PLIndiaOnline
  Use 32px circle-color icons (e.g., https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/circle-color/linkedin@2x.png etc.) in a single horizontal row (centered) — use a table with inline-block cells and equal padding so icons do NOT stack vertically on desktop or mobile.

📧 SUBJECT LINE BEST PRACTICES (from subjectline.com):
1. **Length**: 40-60 characters (optimal for mobile preview)
2. **Clarity**: Be specific and clear about the email content
3. **Urgency**: Use time-sensitive language when appropriate (without being spammy)
4. **Personalization**: Reference the audience or their interests
5. **Curiosity**: Tease valuable content without being clickbait
6. **Action-Oriented**: Use verbs and active language
7. **Numbers**: Include specific numbers/stats when relevant
8. **Avoid Spam Triggers**: No ALL CAPS, excessive punctuation!!!, or spam words (FREE, URGENT, ACT NOW)
9. **A/B Test Friendly**: Create variations if requested
10. **Emoji Usage**: Use sparingly and only if brand-appropriate

📧 EMAIL BEST PRACTICES:
- **Preheader Text**: 85-100 characters complementing subject line
- **Mobile-First**: 600px max width, single column, large tap targets (44px min)
- **Hierarchy**: Clear visual hierarchy with headings, body text, CTA
- **CTA Buttons**:
  * Primary CTA: Prominent, high contrast, 44px min height
  * Use brand colors for buttons
  * Clear action-oriented text (not just "Click Here")
  * Single primary CTA (multiple secondary CTAs ok)
- **Accessibility**:
  * Alt text for all images
  * Semantic HTML structure
  * High contrast text (WCAG AA compliant)
  * Screen reader friendly
- **Email Client Compatibility**:
  * Inline CSS (no external stylesheets)
  * Table-based layout for reliability
  * Tested across Gmail, Outlook, Apple Mail, Yahoo
  * Fallback fonts: Arial, Helvetica, sans-serif
- **Footer Requirements**:
  * Company address
  * Unsubscribe link (required by CAN-SPAM)
  * Social media links
  * View in browser link

Campaign Details:
- Topic: ${topic}
- Purpose: ${purpose}
- Target Audience: ${targetAudience}
- Language: ${language}

${creativePrompt ? `Creative Direction:\n${creativePrompt}\n` : ''}

${brandGuidance ? `Brand Requirements:\n${brandGuidance}\nIMPORTANT: You MUST use these exact brand colors in the email HTML.` : ''}

Generate a complete JSON response with:

{
  "subject": "The email subject line (40-60 chars)",
  "preheader": "Preview text that appears after subject line (85-100 chars)",
  "subjectVariations": ["Alternative subject 1", "Alternative subject 2"],
  "html": "Complete HTML email code (inline CSS, table-based layout, mobile-responsive)",
  "plainText": "Plain text version of the email (for text-only email clients)"
}

The HTML must be:
1. Complete and production-ready (can be sent as-is)
2. Fully responsive (mobile-first design)
3. Use inline CSS only
4. Use table-based layout for compatibility
5. Include all brand colors from guidelines
6. Have clear visual hierarchy
7. Include at least one prominent CTA button
8. Have a proper footer with unsubscribe link
9. Be accessible (alt text, semantic structure)
10. Work across all major email clients

Structure your HTML like this:
- DOCTYPE and basic HTML structure
- Head with viewport meta and styles
- Body with table-based layout:
  * Header section with logo
  * Hero section with main message
  * Content sections (benefits, features, etc.)
  * Primary CTA section
  * Footer with contact info, social links, unsubscribe

Use the brand colors specified in the guidelines for:
- Header background
- CTA buttons
- Section accents
- Links
- Footer background

Make the HTML production-ready - it should render beautifully in all email clients.`

    console.log('Generating email newsletter with GPT-OSS-120B...')

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a professional email newsletter for: ${topic}` }
      ],
      model: MODEL,
      temperature: 0.7,
      max_tokens: 8000,
    })

    const generatedContent = completion.choices[0]?.message?.content || ''

    if (!generatedContent) {
      throw new Error('No email content generated from GPT-OSS-120B')
    }

    // Try to parse as JSON first
    let emailData
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = generatedContent.match(/```json\n([\s\S]*?)\n```/) ||
                       generatedContent.match(/```\n([\s\S]*?)\n```/) ||
                       [null, generatedContent]

      const jsonContent = jsonMatch[1] || generatedContent
      emailData = JSON.parse(jsonContent)
    } catch (parseError) {
      // If not valid JSON, try to extract components manually
      console.warn('Failed to parse as JSON, attempting manual extraction')

      const subjectMatch = generatedContent.match(/"subject":\s*"([^"]+)"/) ||
                          generatedContent.match(/Subject:\s*(.+)/i)
      const preheaderMatch = generatedContent.match(/"preheader":\s*"([^"]+)"/) ||
                            generatedContent.match(/Preheader:\s*(.+)/i)
      const htmlMatch = generatedContent.match(/"html":\s*"([\s\S]*?)"(?=,\s*"plainText"|$)/) ||
                       generatedContent.match(/<!DOCTYPE[\s\S]*<\/html>/i)

      emailData = {
        subject: subjectMatch ? subjectMatch[1].trim() : `${topic} - Newsletter`,
        preheader: preheaderMatch ? preheaderMatch[1].trim() : `Discover insights about ${topic}`,
        subjectVariations: [
          `${topic} - Exclusive Insights`,
          `Your Guide to ${topic}`
        ],
        html: htmlMatch ? (htmlMatch[1] || htmlMatch[0]).replace(/\\n/g, '\n').replace(/\\"/g, '"') : generatedContent,
        plainText: `${topic}\n\nView this email in your browser for the best experience.`
      }
    }

    console.log('Email newsletter generated successfully')

    return NextResponse.json({
      ...emailData,
      model: MODEL,
      usage: completion.usage
    })

  } catch (error) {
    console.error('Error generating email newsletter:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate email newsletter',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
