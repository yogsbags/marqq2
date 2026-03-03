import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health check endpoint - verify backend exists and system is operational
 */
export async function GET() {
  try {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      backend: {
        exists: false,
        path: '',
        mainJs: false,
        files: [] as string[]
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        groqKey: !!process.env.GROQ_API_KEY,
        geminiKey: !!process.env.GEMINI_API_KEY,
        falKey: !!process.env.FAL_KEY,
        heygenKey: !!process.env.HEYGEN_API_KEY,
        replicateKey: !!process.env.REPLICATE_API_TOKEN
      }
    }

    // Check backend directory
    const backendDir = path.join(process.cwd(), 'backend')
    checks.backend.path = backendDir
    checks.backend.exists = fs.existsSync(backendDir)

    if (checks.backend.exists) {
      // Check main.js
      const mainJsPath = path.join(backendDir, 'main.js')
      checks.backend.mainJs = fs.existsSync(mainJsPath)

      // List backend files
      try {
        checks.backend.files = fs.readdirSync(backendDir)
      } catch (err) {
        checks.backend.files = [`Error reading: ${err instanceof Error ? err.message : 'Unknown'}`]
      }
    }

    console.log('[Health Check]', JSON.stringify(checks, null, 2))

    return NextResponse.json(checks)
  } catch (error) {
    console.error('[Health Check Error]', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
