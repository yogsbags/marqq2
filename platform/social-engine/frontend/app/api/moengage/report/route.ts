import { NextRequest, NextResponse } from 'next/server'

// Use CommonJS export to avoid bundler issues with shared backend code
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getMoengageClient } = require('../../../../backend/integrations/moengage-client')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReportKind = 'campaign' | 'business-events' | 'custom-templates' | 'catalog' | 'inform'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const kind = searchParams.get('kind') as ReportKind

  try {
    const client = getMoengageClient()

    if (!kind) {
      return NextResponse.json({ error: 'Query param "kind" is required.' }, { status: 400 })
    }

    switch (kind) {
      case 'campaign': {
        const campaignId = searchParams.get('campaignId')
        if (!campaignId) {
          return NextResponse.json({ error: 'campaignId is required for campaign reports.' }, { status: 400 })
        }
        const data = await client.getCampaignReport(campaignId)
        return NextResponse.json({ data })
      }
      case 'business-events': {
        const params: Record<string, string> = {}
        searchParams.forEach((value, key) => {
          if (key !== 'kind') {
            params[key] = value
          }
        })
        const data = await client.getBusinessEvents(params)
        return NextResponse.json({ data })
      }
      case 'custom-templates': {
        const data = await client.getCustomTemplates()
        return NextResponse.json({ data })
      }
      case 'catalog': {
        const catalogId = searchParams.get('catalogId')
        if (!catalogId) {
          return NextResponse.json({ error: 'catalogId is required for catalog requests.' }, { status: 400 })
        }
        const data = await client.getCatalog(catalogId)
        return NextResponse.json({ data })
      }
      case 'inform': {
        const reportId = searchParams.get('reportId')
        if (!reportId) {
          return NextResponse.json({ error: 'reportId is required for inform reports.' }, { status: 400 })
        }
        const data = await client.getInformReport(reportId)
        return NextResponse.json({ data })
      }
      default:
        return NextResponse.json({ error: `Unsupported kind "${kind}".` }, { status: 400 })
    }
  } catch (error) {
    console.error('MoEngage report error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
