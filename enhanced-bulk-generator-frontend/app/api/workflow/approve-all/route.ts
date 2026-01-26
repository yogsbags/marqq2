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
  5: 'created-content.csv',
  6: 'created-content.csv',
  7: 'published-content.csv',
  8: 'workflow-status.csv'
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const stageId = searchParams.get('stageId')

    if (!stageId) {
      return NextResponse.json({ error: 'stageId parameter required' }, { status: 400 })
    }

    const stageNum = parseInt(stageId)
    const csvFile = STAGE_CSV_MAP[stageNum]

    if (!csvFile) {
      return NextResponse.json({ error: 'Invalid stage ID' }, { status: 400 })
    }

    const csvPath = path.join(process.cwd(), 'backend', 'data', csvFile)

    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({
        approved: 0,
        message: `CSV file not found: ${csvFile}`
      })
    }

    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8')
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    })

    // Approve all pending records
    let approvedCount = 0
    const updatedRecords = records.map((record: any) => {
      const currentStatus = (record.approval_status || '').toLowerCase()
      if (currentStatus !== 'yes' && currentStatus !== 'seo-ready') {
        approvedCount++
        return {
          ...record,
          approval_status: 'Yes'
        }
      }
      return record
    })

    // Write updated CSV back to file
    if (approvedCount > 0) {
      const updatedCsv = stringify(updatedRecords, {
        header: true,
        columns: Object.keys(updatedRecords[0])
      })
      fs.writeFileSync(csvPath, updatedCsv, 'utf-8')
    }

    return NextResponse.json({
      approved: approvedCount,
      total: records.length,
      message: approvedCount > 0 
        ? `Approved ${approvedCount} pending ${stageNum === 2 ? 'topics' : 'items'}`
        : 'All items already approved'
    })

  } catch (error) {
    console.error('Error approving items:', error)
    return NextResponse.json({
      error: 'Failed to approve items',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
