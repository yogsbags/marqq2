import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Map stages to their CSV files
const STAGE_CSV_MAP: Record<number, string> = {
  1: 'research-gaps.csv',          // Stage 1: SEO Research
  2: 'generated-topics.csv',       // Stage 2: Topic Generation
  3: 'topic-research.csv',         // Stage 3: Deep Research
  4: 'created-content.csv',        // Stage 4: Content Creation
  5: 'created-content.csv',        // Stage 5: Content Validation
  6: 'created-content.csv',        // Stage 6: SEO Optimization (adds metadata to same file)
  7: 'published-content.csv',      // Stage 7: Publication
  8: 'workflow-status.csv'         // Stage 8: Completion
}

// Map CSV files to Google Sheets sheet names
const CSV_TO_SHEET_NAME: Record<string, string> = {
  'research-gaps.csv': 'research-gaps',
  'generated-topics.csv': 'generated-topics',
  'topic-research.csv': 'topic-research',
  'created-content.csv': 'created-content',
  'published-content.csv': 'published-content',
  'workflow-status.csv': 'workflow-status'
}

// Google Sheets configuration
const SPREADSHEET_ID = '104GA_1AMKFgMEbEaU8oJHiP0hBX0fe8EmmQNt_ZnSC4'

function getGoogleSheetsUrl(csvFile: string): string {
  const baseUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
  const sheetName = CSV_TO_SHEET_NAME[csvFile]

  if (!sheetName) {
    return baseUrl
  }

  // Map sheet names to their GIDs (sheet IDs)
  const sheetGidMap: Record<string, number> = {
    'research-gaps': 0,
    'quick-wins': 1,
    'generated-topics': 2,
    'topic-research': 3,
    'created-content': 4,
    'published-content': 5,
    'workflow-status': 6,
    'master-research': 7
  }

  const gid = sheetGidMap[sheetName] ?? 0
  return `${baseUrl}#gid=${gid}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const stage = searchParams.get('stage')

    if (!stage) {
      return NextResponse.json({ error: 'Stage parameter required' }, { status: 400 })
    }

    const stageNum = parseInt(stage)
    const csvFile = STAGE_CSV_MAP[stageNum]

    if (!csvFile) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }

    const csvPath = path.join(process.cwd(), 'backend', 'data', csvFile)

    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({
        data: [],
        message: `CSV file not yet created (${csvFile})`
      })
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

    // Limit to last 10 records to avoid overwhelming the UI
    const limitedRecords = records.slice(-10)

    // Get summary stats
    const summary = {
      total: records.length,
      showing: limitedRecords.length,
      approved: records.filter((r: any) =>
        r.approval_status === 'Yes' || r.approval_status === 'SEO-Ready'
      ).length
    }

    // Get Google Sheets URL for this CSV
    const googleSheetsUrl = getGoogleSheetsUrl(csvFile)

    return NextResponse.json({
      data: limitedRecords,
      summary,
      file: csvFile,
      googleSheetsUrl
    })

  } catch (error) {
    console.error('Error reading CSV:', error)
    return NextResponse.json({
      error: 'Failed to read CSV data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
