import { NextRequest, NextResponse } from 'next/server'

// Use CommonJS export to avoid bundler issues with shared backend code
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getMoengageClient } = require('../../../../backend/integrations/moengage-client')

type MoengageTrackPayload = {
  type: 'event' | 'customer'
  customer_id: string
  actions?: Array<{ action: string; timestamp?: number; attributes?: Record<string, any> }>
  attributes?: Record<string, any>
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as MoengageTrackPayload

    if (!payload?.type || (payload.type !== 'event' && payload.type !== 'customer')) {
      return NextResponse.json({ error: 'Invalid payload type. Expected "event" or "customer".' }, { status: 400 })
    }

    const client = getMoengageClient()
    const result = await client.track(payload)

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('MoEngage track error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
