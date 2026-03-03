import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Root API route - basic health check
 */
export async function GET() {
  console.log('[Root API] GET / request received')

  try {
    const response = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'API is operational'
    }

    console.log('[Root API] Returning response:', response)
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Root API] Error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
