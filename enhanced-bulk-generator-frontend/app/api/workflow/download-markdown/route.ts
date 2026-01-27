import { parse } from 'csv-parse/sync'
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

/**
 * Remove JSON metadata blocks from markdown (content_upgrades, compliance, quality_metrics, etc.)
 * These are often appended by AI at the end of articles and should not appear in output
 */
function removeJsonMetadata(markdown: string): string {
  if (!markdown) return ''

  let content = markdown

  // Strategy: Find where the actual article content ends and remove everything after
  // JSON metadata typically appears after the article conclusion, FAQs, or final sections

  // First, try to find common article ending markers
  const articleEndMarkers = [
    /##\s*(?:Conclusion|Bottom\s+Line|Final\s+Thoughts|Summary|Takeaways|Next\s+Steps)/i,
    /##\s*FAQs?\s*(?:on|about)?/i,
    /---\s*$/m, // Horizontal rule at end
    /Ready\s+to\s+execute/i,
    /Open\s+your\s+PL\s+Capital\s+account/i
  ]

  let lastContentIndex = content.length
  let foundEndMarker = false

  // Look for article end markers and find content after them
  for (const marker of articleEndMarkers) {
    const matches = Array.from(content.matchAll(new RegExp(marker.source, 'g')))
    if (matches.length > 0) {
      // Find the last occurrence
      const lastMatch = matches[matches.length - 1]
      const afterMatch = content.substring(lastMatch.index! + lastMatch[0].length)

      // Check if JSON metadata appears after this marker
      if (/["'][^"']+["']\s*:/.test(afterMatch)) {
        // Find where JSON starts after this marker
        const jsonStartMatch = afterMatch.match(/["'][^"']+["']\s*:/)
        if (jsonStartMatch && jsonStartMatch.index !== undefined) {
          lastContentIndex = lastMatch.index! + lastMatch[0].length + jsonStartMatch.index
          foundEndMarker = true
          break
        }
      }
    }
  }

  // If we found an end marker with JSON after it, truncate there
  if (foundEndMarker && lastContentIndex < content.length) {
    content = content.substring(0, lastContentIndex).trim()
  } else {
    // Fallback: Remove JSON-like metadata blocks directly
    // Remove specific known metadata fields
    content = content.replace(/["']content_upgrades["']\s*:\s*\[[\s\S]*?\]/gi, '')
    content = content.replace(/["']compliance["']\s*:\s*"[^"]*"/gi, '')
    content = content.replace(/["']quality_metrics["']\s*:\s*\{[\s\S]*?\}/gi, '')

    // Remove any remaining JSON-like structures (quoted keys with values)
    // This is more aggressive and catches any metadata fields
    content = content.replace(/["'][^"']+["']\s*:\s*(?:\[[\s\S]*?\]|\{[\s\S]*?\}|"[^"]*"|\d+)/g, '')

    // Remove trailing commas, brackets, and braces
    content = content.replace(/,\s*$/, '')
    content = content.replace(/^\s*[\[\{]\s*$/, '')
    content = content.replace(/\s*[\]\}]\s*$/, '')
  }

  // Clean up extra whitespace
  content = content.replace(/\n{3,}/g, '\n\n').trim()

  // Final pass: Remove any lines at the end that look like JSON metadata
  const lines = content.split('\n')
  let lastValidLineIndex = lines.length - 1

  // Work backwards to find the last line that's actual content
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue // Skip empty lines

    // If line looks like JSON metadata (quoted key with colon), this is where content ends
    if (/^["'][^"']+["']\s*:/.test(line)) {
      lastValidLineIndex = i - 1
      break
    }

    // If line looks like JSON structure start/end, also mark as end
    if (/^[\[\{]\s*$/.test(line) || /^\s*[\]\}]\s*$/.test(line)) {
      lastValidLineIndex = i - 1
      break
    }
  }

  // Truncate to last valid line
  if (lastValidLineIndex >= 0 && lastValidLineIndex < lines.length - 1) {
    content = lines.slice(0, lastValidLineIndex + 1).join('\n').trim()
  }

  return content
}

/**
 * Format content as markdown file with SEO metadata
 * Replicates ContentExporter.formatMarkdown logic
 */
function formatMarkdown(content: any, primaryKeyword: string | null = null): string {
  const { article_content, compliance } = content

  // Parse seo_metadata from JSON string
  let seo_metadata: any
  try {
    seo_metadata = content.__seo || (typeof content.seo_metadata === 'string'
      ? JSON.parse(content.seo_metadata)
      : content.seo_metadata)
  } catch (error) {
    console.warn('⚠️  Failed to parse seo_metadata, using defaults')
    seo_metadata = {}
  }

  let markdown = ''

  // Add H1 title (only at top of file)
  if (seo_metadata?.title) {
    markdown += `# ${seo_metadata.title}\n\n`
  }

  // Check if article_content already includes RESEARCH VERIFICATION section
  // If it does, it will be included when we add article_content below
  // If it doesn't, we don't need to add it separately since it should have been added during content creation

  // Normalize article_content: handle escaped newlines from CSV storage
  // CSV may store newlines as literal \n strings, so convert them to actual newlines
  let normalizedArticleContent = article_content || ''
  if (typeof normalizedArticleContent === 'string') {
    // Replace escaped newlines with actual newlines (but not double-escape)
    normalizedArticleContent = normalizedArticleContent.replace(/\\n/g, '\n')
  }

  // Remove JSON metadata blocks (content_upgrades, compliance, quality_metrics, etc.)
  // These should not appear in the markdown output
  normalizedArticleContent = removeJsonMetadata(normalizedArticleContent)

  // Add article content (which should already include RESEARCH VERIFICATION if it was extracted)
  markdown += normalizedArticleContent

  // Add compliance/disclaimer at the end
  if (compliance) {
    markdown += `\n\n---\n\n${compliance}`
  }

  // Add SEO metadata section
  markdown += '\n\n---\n\n## SEO Metadata\n\n'

  if (seo_metadata?.title) {
    markdown += `### SEO Meta Title\n\`\`\`\n${seo_metadata.title}\n\`\`\`\n\n`
  }

  if (seo_metadata?.meta_description) {
    markdown += `### SEO Meta Description\n\`\`\`\n${seo_metadata.meta_description}\n\`\`\`\n\n`
  }

  if (seo_metadata?.focus_keyphrase) {
    markdown += `### Focus Keyword\n\`\`\`\n${seo_metadata.focus_keyphrase}\n\`\`\`\n\n`
  }

  if (seo_metadata?.secondary_keywords && seo_metadata.secondary_keywords.length > 0) {
    markdown += `### Secondary Keywords\n\`\`\`\n${seo_metadata.secondary_keywords.join(', ')}\n\`\`\`\n\n`
  }

  // Add canonical URL
  const keyword = primaryKeyword || content.primary_keyword || content.topic_id || 'article'
  const slug = keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
  const canonicalUrl = `https://www.plindia.com/blog/${slug}`
  markdown += `### SEO Optimized URL\n\`\`\`\n${canonicalUrl}\n\`\`\`\n\n`

  // Extract and add FAQ schema if FAQs exist (use normalized content)
  const faqs = extractFAQs(normalizedArticleContent)
  if (faqs.length > 0) {
    markdown += generateFAQSchema(faqs, canonicalUrl)
    console.log(`✅ Extracted ${faqs.length} FAQs and added FAQ schema`)
  } else {
    // Debug: Log if FAQs weren't found (for troubleshooting)
    console.log('⚠️  No FAQs extracted from article content. FAQ section may be missing or in unexpected format.')
    console.log('Article content preview (last 500 chars):', normalizedArticleContent.slice(-500))
  }

  return markdown
}

/**
 * Extract FAQs from article content
 * Handles multiple formats:
 * 1. H3 format: ### Question text?
 * 2. Q&A format: **Q1. Question text?** followed by A: answer
 */
function extractFAQs(articleContent: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = []

  if (!articleContent) {
    return faqs
  }

  // Check if there's a FAQ section (various possible headings)
  // Match FAQ section until: ---, ## SEO Metadata, ## Talk to, ## Conclusion, or end of content
  // Updated pattern to handle "FAQs on [Topic]" format and be more flexible
  const faqSectionMatch = articleContent.match(/##\s+(?:FAQs?\s+on\s+[^\n]*|FAQs?|Frequently Asked Questions|FAQ)[^\n]*\n([\s\S]*?)(?=\n---|\n##\s+(?:SEO Metadata|Talk to|Conclusion)|$)/i)

  if (faqSectionMatch) {
    const faqSection = faqSectionMatch[1]
    console.log(`✅ Found FAQ section, length: ${faqSection.length} chars`)

    // Try H3 format first (### Question)
    // Updated regex to handle answers that may span multiple paragraphs
    const h3Regex = /###\s+(.+?)\n+([\s\S]+?)(?=\n###\s+|\n##\s+|\n---|$)/g
    let match

    while ((match = h3Regex.exec(faqSection)) !== null) {
      const question = match[1].trim()
      let answer = match[2].trim()

      // Clean up answer: normalize whitespace but preserve sentence structure
      answer = answer
        .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with 2
        .replace(/\n\n/g, ' ')         // Replace double newlines with space
        .replace(/\n/g, ' ')          // Replace single newlines with space
        .replace(/\s+/g, ' ')         // Normalize multiple spaces
        .trim()

      if (question && answer && answer.length > 10) {  // Ensure answer has meaningful content
        faqs.push({
          question: question,
          answer: answer
        })
        console.log(`  ✓ Extracted FAQ: "${question.substring(0, 50)}..."`)
      }
    }

    // If no H3 FAQs found, try Q&A format (**Q1. Question?** followed by A:)
    if (faqs.length === 0) {
      console.log('  ⚠️  No H3 FAQs found, trying Q&A format...')
      // Match **Q1. Question text?** followed by A: answer text
      // Handles both single-line and multi-line answers
      const qaRegex = /\*\*Q\d+\.\s*(.+?)\*\*\s*\n\s*A:\s*([\s\S]+?)(?=\n\*\*Q\d+\.|\n---|\n##|$)/g
      let qaMatch

      while ((qaMatch = qaRegex.exec(faqSection)) !== null) {
        const question = qaMatch[1].trim()
        // Clean up answer: remove extra newlines, preserve sentence structure
        let answer = qaMatch[2].trim()
          .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with 2
          .replace(/\n\n/g, ' ')         // Replace double newlines with space
          .replace(/\n/g, ' ')          // Replace single newlines with space
          .replace(/\s+/g, ' ')         // Normalize multiple spaces
          .trim()

        if (question && answer && answer.length > 10) {  // Ensure answer has meaningful content
          faqs.push({
            question: question,
            answer: answer
          })
          console.log(`  ✓ Extracted FAQ: "${question.substring(0, 50)}..."`)
        }
      }
    }
  } else {
    console.log('⚠️  FAQ section not found in article content')
    // Debug: show what sections we can find
    const sectionMatches = articleContent.match(/##\s+[^\n]+/g)
    if (sectionMatches) {
      console.log('  Found sections:', sectionMatches.slice(-5).join(', '))
    }
  }

  return faqs
}

/**
 * Generate FAQ Schema JSON-LD
 */
function generateFAQSchema(faqs: Array<{ question: string; answer: string }>, url: string): string {
  if (!faqs || faqs.length === 0) {
    return ''
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  }

  return `\n### FAQ Schema (JSON-LD)\n\`\`\`html\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>\n\`\`\`\n\n`
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const contentId = searchParams.get('contentId')

    if (!contentId) {
      return NextResponse.json(
        { error: 'contentId parameter is required' },
        { status: 400 }
      )
    }

    // Construct path to created-content.csv
    const possiblePaths = [
      path.join(process.cwd(), 'backend', 'data', 'created-content.csv'),
      path.join(process.cwd(), '..', 'data', 'created-content.csv'),
      path.join(process.cwd(), '..', 'backend', 'data', 'created-content.csv')
    ]

    const csvPath = possiblePaths.find(p => fs.existsSync(p))

    if (!csvPath) {
      return NextResponse.json(
        { error: 'created-content.csv not found' },
        { status: 404 }
      )
    }

    // Read and parse CSV
    const fileContent = fs.readFileSync(csvPath, 'utf-8')
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_records_with_error: true,
      trim: true,
      escape: '"',
      quote: '"',
    })

    // Find the content by ID (exact match required)
    const content = records.find((r: any) => r.content_id === contentId)

    if (!content) {
      console.error(`❌ Content not found in CSV: ${contentId}`)
      console.log(`Available content_ids: ${records.filter((r: any) => r.content_id).map((r: any) => r.content_id).slice(0, 10).join(', ')}`)
      return NextResponse.json(
        { error: `Content not found: ${contentId}` },
        { status: 404 }
      )
    }

    // Log which content is being downloaded for debugging
    let seoMetaForLog: any = {}
    try {
      seoMetaForLog = JSON.parse(content.seo_metadata || '{}')
    } catch (e) {
      // Ignore
    }
    console.log(`✅ Downloading markdown for content_id: ${contentId}, title: "${seoMetaForLog.title || 'N/A'}"`)

    // Format markdown using inline formatter (includes SEO metadata, FAQ schema, etc.)
    const markdownContent = formatMarkdown(content, content.primary_keyword)

    // Parse SEO metadata for filename
    let seoMeta: any = {}
    try {
      seoMeta = JSON.parse(content.seo_metadata || '{}')
    } catch (e) {
      // Ignore parse errors
    }

    // Generate filename from title (no content_id suffix)
    const sanitizedTitle = (seoMeta.title || content.topic_id || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const filename = `${sanitizedTitle}.md`

    // Return markdown file with appropriate headers for download
    return new NextResponse(markdownContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Markdown download error:', error)
    return NextResponse.json(
      {
        error: 'Failed to download markdown file',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }
}
