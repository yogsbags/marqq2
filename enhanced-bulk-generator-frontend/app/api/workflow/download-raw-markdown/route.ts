import { parse } from 'csv-parse/sync'
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

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
    console.log(`✅ Downloading raw content for content_id: ${contentId}, topic_id: ${content.topic_id || 'N/A'}, title: "${seoMetaForLog.title || 'N/A'}"`)

    // Get topic_id to find raw response file
    const topicId = content.topic_id || 'unknown'
    const creationDate = content.creation_date || ''

    // Look for raw response files matching this topic_id
    const rawResponsesPaths = [
      path.join(process.cwd(), 'backend', 'data', 'raw-responses'),
      path.join(process.cwd(), '..', 'data', 'raw-responses'),
      path.join(process.cwd(), '..', 'backend', 'data', 'raw-responses')
    ]

    let rawResponsePath: string | null = null
    let rawResponseContent: string | null = null

    for (const rawDir of rawResponsesPaths) {
      if (fs.existsSync(rawDir)) {
        try {
          const files = fs.readdirSync(rawDir).filter((f: string) => f.endsWith('.md'))

          // Strategy 1: Find files that start with the topic_id
          let matchingFiles = files.filter((file: string) =>
            file.startsWith(`${topicId}_`)
          )

          // Strategy 2: If no match, search by content_id or topic_id in file content
          if (matchingFiles.length === 0) {
            console.log(`⚠️  No files found starting with "${topicId}_", searching in file content...`)
            for (const file of files) {
              try {
                const filePath = path.join(rawDir, file)
                const fileContent = fs.readFileSync(filePath, 'utf-8')
                // Check if file contains the topic_id or content_id in metadata
                if (fileContent.includes(`Topic ID: ${topicId}`) ||
                    fileContent.includes(`content_id: ${contentId}`) ||
                    fileContent.includes(`"topic_id": "${topicId}"`) ||
                    fileContent.includes(`"topic_id": "${content.topic_id}"`)) {
                  matchingFiles.push(file)
                  console.log(`✅ Found matching file by content search: ${file}`)
                }
              } catch (err) {
                // Skip files that can't be read
                continue
              }
            }
          }

          // Strategy 3: If still no match and creation_date exists, try to find files by date proximity
          if (matchingFiles.length === 0 && creationDate) {
            console.log(`⚠️  No files found by content search, trying date-based search for ${creationDate}...`)
            // Extract date part (YYYY-MM-DD)
            const datePart = creationDate.split('T')[0] || creationDate
            matchingFiles = files.filter((file: string) => {
              // Check if filename contains the date
              return file.includes(datePart.replace(/-/g, '')) ||
                     file.includes(datePart)
            })
          }

          if (matchingFiles.length > 0) {
            // Get the most recent file (sort by filename which includes timestamp)
            const sortedFiles = matchingFiles.sort().reverse()
            rawResponsePath = path.join(rawDir, sortedFiles[0])
            rawResponseContent = fs.readFileSync(rawResponsePath, 'utf-8')
            console.log(`✅ Found raw response file: ${sortedFiles[0]}`)
            break
          }
        } catch (error) {
          console.warn(`⚠️  Error reading raw-responses directory ${rawDir}:`, error)
        }
      }
    }

    if (!rawResponseContent) {
      // Provide helpful error message with available files
      let availableFiles: string[] = []
      let checkedDirs: string[] = []
      for (const rawDir of rawResponsesPaths) {
        if (fs.existsSync(rawDir)) {
          checkedDirs.push(rawDir)
          try {
            const files = fs.readdirSync(rawDir).filter((f: string) => f.endsWith('.md'))
            availableFiles = [...availableFiles, ...files]
          } catch (e) {
            // Ignore errors
          }
        }
      }

      // Try to extract dates from available files for comparison
      const availableDates = availableFiles
        .map(f => {
          const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/)
          return dateMatch ? dateMatch[1] : null
        })
        .filter(Boolean)
        .slice(0, 5)

      return NextResponse.json(
        {
          error: `Raw response file not found for content_id: ${contentId}`,
          message: `The raw AI response file for this content was not found. This may be because:
- The content was created before raw response saving was implemented
- The raw response file was deleted or moved
- The topic_id "${topicId}" doesn't match any raw response files`,
          details: {
            content_id: contentId,
            topic_id: topicId,
            creation_date: creationDate,
            searched_directories: checkedDirs,
            available_files_count: availableFiles.length,
            available_files: availableFiles.slice(0, 10), // Show first 10 files
            available_dates: availableDates,
            suggestion: creationDate && availableDates.length > 0
              ? `Content was created on ${creationDate}, but available raw files are from different dates. Raw response saving may have been added after this content was created.`
              : 'Raw response files may not exist for older content. Only content created after raw response saving was implemented will have raw files available.'
          }
        },
        { status: 404 }
      )
    }

    // Parse SEO metadata for filename
    let seoMeta: any = {}
    try {
      seoMeta = JSON.parse(content.seo_metadata || '{}')
    } catch (e) {
      // Ignore parse errors
    }

    // Generate filename from title (with -raw suffix)
    const sanitizedTitle = (seoMeta.title || content.topic_id || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const filename = `${sanitizedTitle}-raw.md`

    // Return raw markdown file with appropriate headers for download
    return new NextResponse(rawResponseContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Raw markdown download error:', error)
    return NextResponse.json(
      {
        error: 'Failed to download raw markdown file',
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
