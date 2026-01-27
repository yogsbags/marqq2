import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Map stages to their CSV files
const STAGE_CSV_MAP: Record<number, string> = {
  1: 'research-gaps.csv',
  2: 'generated-topics.csv',
  3: 'topic-research.csv',
  4: 'created-content.csv',
  5: 'created-content.csv', // SEO optimization updates same file
  6: 'published-content.csv',
  7: 'workflow-status.csv'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { stageId, rowIndex, data } = body

    // Validate input
    if (!stageId || rowIndex === undefined || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: stageId, rowIndex, data' },
        { status: 400 }
      )
    }

    const csvFile = STAGE_CSV_MAP[stageId]
    if (!csvFile) {
      return NextResponse.json(
        { error: 'Invalid stage ID' },
        { status: 400 }
      )
    }

    // Use same path as /api/workflow/data for consistency (works in Railway)
    const csvPath = path.join(process.cwd(), 'backend', 'data', csvFile)

    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json(
        { error: `CSV file not found: ${csvFile}` },
        { status: 404 }
      )
    }

    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8')
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_records_with_error: true,
      trim: true,
      escape: '"',
      quote: '"',
    })

    // Calculate actual index (rowIndex is relative to displayed data, which shows last 10)
    // We need to update the correct row in the full dataset
    const actualIndex = records.length - 10 + rowIndex

    if (actualIndex < 0 || actualIndex >= records.length) {
      return NextResponse.json(
        { error: `Invalid row index: ${rowIndex}` },
        { status: 400 }
      )
    }

    // Update the record with edited data
    records[actualIndex] = {
      ...records[actualIndex],
      ...data
    }

    // Convert back to CSV
    const updatedCsv = stringify(records, {
      header: true,
      columns: Object.keys(records[0])
    })

    // Write updated CSV back to file
    fs.writeFileSync(csvPath, updatedCsv, 'utf-8')

    return NextResponse.json({
      success: true,
      message: `Successfully updated row ${rowIndex} in ${csvFile}`,
      stageId,
      rowIndex,
      file: csvFile
    })

  } catch (error) {
    console.error('Error updating CSV:', error)
    return NextResponse.json(
      {
        error: 'Failed to update CSV data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
