import { parse } from 'csv-parse/sync'
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

/**
 * Remove RESEARCH VERIFICATION section from markdown (for HTML output)
 */
function removeResearchVerification(markdown: string): string {
  if (!markdown) return ''

  // Normalize escaped newlines first
  let content = markdown.replace(/\\n/g, '\n')

  // Remove all RESEARCH VERIFICATION sections (including duplicates)
  // Match from ### RESEARCH VERIFICATION until: another ### RESEARCH VERIFICATION, ---, ##, or end
  content = content.replace(/###\s*RESEARCH\s+VERIFICATION[\s\S]*?(?=\n###\s*RESEARCH\s+VERIFICATION|\n---|\n##|$)/gi, '')

  // Clean up any leftover separators or orphaned headers
  content = content.replace(/\n---\n---/g, '\n---')
  content = content.replace(/^\s*###\s*RESEARCH\s+VERIFICATION\s*$/gim, '') // Remove orphaned headers
  content = content.replace(/\n{3,}/g, '\n\n').trim()

  return content
}

/**
 * Remove JSON metadata blocks from markdown (content_upgrades, compliance, quality_metrics, etc.)
 * These are often appended by AI at the end of articles and should not appear in HTML output
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
 * Convert Markdown tables to HTML tables
 */
function convertMarkdownTables(markdown: string): string {
  if (!markdown) return ''

  // Match markdown table pattern:
  // | Header 1 | Header 2 |
  // |:---|:---:|---:|
  // | Cell 1 | Cell 2 |
  // Match from header row through all data rows (until blank line or non-table line)
  const tableRegex = /(\|[^\n]+\|\r?\n\|[:\s\-|]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/g

  return markdown.replace(tableRegex, (match) => {
    const lines = match.trim().split(/\r?\n/).filter(line => line.trim() && line.includes('|'))
    if (lines.length < 2) return match // Need at least header and separator

    // Parse header row
    const headerRow = lines[0]
    const headerCells = headerRow.split('|').map(h => h.trim())
    // Remove first and last empty cells (from leading/trailing |)
    const headers = headerCells.slice(1, -1).filter(h => h.length > 0)

    // Parse separator row to determine alignment
    const separatorRow = lines[1]
    const separatorCells = separatorRow.split('|').map(s => s.trim())
    const alignments: string[] = []

    separatorCells.forEach((sep, idx) => {
      // Skip first and last empty cells
      if (idx === 0 || idx === separatorCells.length - 1) return
      if (sep.startsWith(':') && sep.endsWith(':')) {
        alignments.push('center')
      } else if (sep.endsWith(':')) {
        alignments.push('right')
      } else {
        alignments.push('left')
      }
    })

    // Build table HTML
    let tableHtml = '<table>\n<thead>\n<tr>\n'

    headers.forEach((header, index) => {
      const align = alignments[index] || 'left'
      // Remove markdown bold/italic from headers, but preserve content
      let cleanHeader = header
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\/\/(.+?)\/\//g, '<em>$1</em>')
        .replace(/\/([^\/\n]+?)\//g, '<em>$1</em>')
      tableHtml += `  <th style="text-align: ${align}">${cleanHeader}</th>\n`
    })

    tableHtml += '</tr>\n</thead>\n<tbody>\n'

    // Parse data rows
    for (let i = 2; i < lines.length; i++) {
      const row = lines[i]
      if (!row.includes('|')) continue

      const cells = row.split('|').map(c => c.trim())
      // Remove first and last empty cells (from leading/trailing |)
      const dataCells = cells.slice(1, -1)

      if (dataCells.length === 0) continue

      tableHtml += '<tr>\n'
      dataCells.forEach((cell, index) => {
        const align = alignments[index] || 'left'
        // Process cell content: convert markdown formatting
        let cellContent = cell
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/\/\/(.+?)\/\//g, '<em>$1</em>')
          .replace(/\/([^\/\n]+?)\//g, '<em>$1</em>')
          .replace(/\\"/g, '"') // Fix escaped quotes
          .replace(/\\'/g, "'") // Fix escaped single quotes
        tableHtml += `  <td style="text-align: ${align}">${cellContent}</td>\n`
      })
      tableHtml += '</tr>\n'
    }

    tableHtml += '</tbody>\n</table>'
    return tableHtml
  })
}

/**
 * Process LaTeX formulas in HTML content
 * Converts LaTeX syntax to MathJax-compatible format
 */
function processLatexFormulas(html: string): string {
  if (!html) return ''

  // Handle inline math: $formula$ or \(formula\)
  // Already in HTML, so we need to preserve existing formatting
  // MathJax will handle $...$ and \(...\) automatically, but we can ensure proper spacing

  // Ensure display math blocks are on separate lines for better rendering
  // Convert $$...$$ blocks (if not already properly formatted)
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    // Ensure formula is on its own line
    const trimmed = formula.trim()
    return `\n<div class="math-display">$$${trimmed}$$</div>\n`
  })

  // Convert \[...\] blocks
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    const trimmed = formula.trim()
    return `\n<div class="math-display">\\[${trimmed}\\]</div>\n`
  })

  return html
}

/**
 * Convert Markdown to HTML
 */
function markdownToHtml(markdown: string, title: string = 'Article', metaDescription: string = ''): string {
  if (!markdown) return ''

  // Remove RESEARCH VERIFICATION section before converting to HTML
  let cleanedMarkdown = removeResearchVerification(markdown)

  // Remove JSON metadata blocks (content_upgrades, compliance, quality_metrics, etc.)
  cleanedMarkdown = removeJsonMetadata(cleanedMarkdown)

  // Clean up escaped quotes and other escape sequences
  cleanedMarkdown = cleanedMarkdown.replace(/\\"/g, '"')
  cleanedMarkdown = cleanedMarkdown.replace(/\\'/g, "'")
  cleanedMarkdown = cleanedMarkdown.replace(/\\\\/g, '\\')

  // Preserve LaTeX formulas before markdown conversion
  // Store LaTeX blocks temporarily to prevent markdown processing from interfering
  const latexPlaceholders: { [key: string]: string } = {}
  let placeholderIndex = 0

  // Protect display math blocks ($$...$$ and \[...\])
  cleanedMarkdown = cleanedMarkdown.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const key = `__LATEX_DISPLAY_${placeholderIndex}__`
    latexPlaceholders[key] = match
    placeholderIndex++
    return key
  })

  cleanedMarkdown = cleanedMarkdown.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    const key = `__LATEX_DISPLAY_${placeholderIndex}__`
    latexPlaceholders[key] = match
    placeholderIndex++
    return key
  })

  // Protect inline math ($...$ and \(...\)) - but be careful not to match URLs
  cleanedMarkdown = cleanedMarkdown.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (match, formula) => {
    // Skip if it looks like a URL or path
    if (match.includes('://') || match.includes('www.')) {
      return match
    }
    const key = `__LATEX_INLINE_${placeholderIndex}__`
    latexPlaceholders[key] = match
    placeholderIndex++
    return key
  })

  cleanedMarkdown = cleanedMarkdown.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
    const key = `__LATEX_INLINE_${placeholderIndex}__`
    latexPlaceholders[key] = match
    placeholderIndex++
    return key
  })

  let html = cleanedMarkdown

  // Convert markdown tables FIRST (before other conversions that might interfere)
  html = convertMarkdownTables(html)

  // Convert headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

  // Convert bold and italic (standard markdown)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Convert alternative italic syntax: /text/ or //text//
  // Handle both /word/ and /phrase with spaces/
  // First handle double slashes //text// (more specific, do first)
  html = html.replace(/\/\/([^\/\n]+?)\/\//g, '<em>$1</em>')
  // Then handle single slashes /text/
  // Avoid converting if it's already inside HTML tags or looks like a URL/path
  html = html.replace(/\/([^\/\n<>]+?)\//g, (match, content) => {
    // Skip if it looks like a URL (starts with http/https) or path (contains :// or multiple slashes)
    if (match.includes('://') || match.includes('www.') || content.includes('http')) {
      return match
    }
    // Skip if already inside HTML tags
    if (match.includes('<') || match.includes('>')) {
      return match
    }
    return `<em>${content}</em>`
  })

  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Convert unordered lists
  html = html.replace(/^\* (.+)$/gim, '<li>$1</li>')
  html = html.replace(/^- (.+)$/gim, '<li>$1</li>')

  // Convert ordered lists
  html = html.replace(/^(\d+)\. (.+)$/gim, '<li>$2</li>')

  // Wrap consecutive list items
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
    return '<ul>\n' + match + '</ul>\n'
  })

  // Convert horizontal rules
  html = html.replace(/^---$/gim, '<hr>')

  // Convert paragraphs (lines not already wrapped)
  // Skip lines that are part of tables
  const lines = html.split('\n')
  const processedLines: string[] = []
  let inTable = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()

    // Track if we're inside a table
    if (line.startsWith('<table>')) {
      inTable = true
      processedLines.push(line)
      continue
    }
    if (line.startsWith('</table>')) {
      inTable = false
      processedLines.push(line)
      continue
    }

    // If inside table, pass through as-is
    if (inTable) {
      processedLines.push(line)
      continue
    }

    // Handle empty lines
    if (!line) {
      processedLines.push('<br>')
      continue
    }

    // Already HTML (including table tags, headings, lists, etc.)
    if (line.startsWith('<')) {
      processedLines.push(line)
      continue
    }

    // Headings (shouldn't reach here if already converted, but safety check)
    if (line.match(/^#{1,6} /)) {
      processedLines.push(line)
      continue
    }

    // Skip markdown table syntax that wasn't converted (shouldn't happen, but safety check)
    if (line.match(/^\|.*\|$/)) {
      continue // Skip unconverted table rows
    }

    // Regular paragraph
    processedLines.push('<p>' + line + '</p>')
  }

  html = processedLines.join('\n')

  // Restore LaTeX formulas from placeholders
  Object.keys(latexPlaceholders).forEach(key => {
    html = html.replace(key, latexPlaceholders[key])
  })

  // Process LaTeX formulas for proper MathJax rendering
  html = processLatexFormulas(html)

  // Add basic HTML structure
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${metaDescription}">
  <!-- MathJax for LaTeX rendering -->
  <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        processEscapes: true,
        processEnvironments: true
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
      }
    };
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3 { margin-top: 1.5em; color: #2c3e50; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    li { margin: 0.5em 0; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { border: none; border-top: 2px solid #eee; margin: 2em 0; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5em 0;
      font-size: 0.95em;
    }
    table th,
    table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    table th {
      background-color: #f8f9fa;
      font-weight: 600;
      color: #2c3e50;
    }
    table tr:nth-child(even) {
      background-color: #f8f9fa;
    }
    table tr:hover {
      background-color: #f1f3f5;
    }
    .math-display {
      margin: 1.5em 0;
      text-align: center;
      overflow-x: auto;
    }
    .math-display mjx-container {
      display: inline-block;
    }
  </style>
</head>
<body>
${html}
</body>
</html>`
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
      return NextResponse.json(
        { error: `Content not found: ${contentId}` },
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }

    // Log which content is being downloaded for debugging
    let seoMetaForLog: any = {}
    try {
      seoMetaForLog = JSON.parse(content.seo_metadata || '{}')
    } catch (e) {
      // Ignore
    }
    console.log(`✅ Downloading HTML for content_id: ${contentId}, title: "${seoMetaForLog.title || 'N/A'}"`)

    // Get markdown content and metadata
    let markdownContent = content.article_content || ''

    // Normalize escaped newlines from CSV storage
    if (typeof markdownContent === 'string') {
      markdownContent = markdownContent.replace(/\\n/g, '\n')
    }

    let seoMeta: any = {}
    try {
      seoMeta = JSON.parse(content.seo_metadata || '{}')
    } catch (e) {
      // Ignore parse errors
    }

    const title = seoMeta.title || 'Article'
    const metaDescription = seoMeta.meta_description || ''

    // Convert markdown to HTML (RESEARCH VERIFICATION will be removed in markdownToHtml)
    const htmlContent = markdownToHtml(markdownContent, title, metaDescription)

    // Generate filename from title
    const sanitizedTitle = (seoMeta.title || content.topic_id || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const filename = `${sanitizedTitle}-${contentId}.html`

    // Return HTML file with appropriate headers for download
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('HTML download error:', error)
    return NextResponse.json(
      {
        error: 'Failed to download HTML file',
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
