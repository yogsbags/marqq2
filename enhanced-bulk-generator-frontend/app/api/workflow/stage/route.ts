import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Map stage IDs to stage names for main.js
const STAGE_NAMES: Record<number, string> = {
  1: 'research',
  2: 'topics',
  3: 'deep-research',
  4: 'content',
  5: 'validation',
  6: 'seo',
  7: 'publication',
  8: 'completion'
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        try {
          // Sanitize log messages to prevent JSON parsing errors
          if (data.log && typeof data.log === 'string') {
            // Remove ANSI color codes and control characters
            data.log = data.log
              .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes
              .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n and \r
              .trim()

            // Truncate very long logs to prevent SSE overflow
            if (data.log.length > 5000) {
              data.log = data.log.substring(0, 5000) + '... (truncated)'
            }
          }

          const message = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          // If JSON.stringify fails, send a safe error message
          console.error('SSE JSON stringify error:', error)
          const safeMessage = `data: ${JSON.stringify({ log: '⚠️ [Log encoding error]' })}\n\n`
          controller.enqueue(encoder.encode(safeMessage))
        }
      }

      try {
        // Parse request body
        const body = await req.json()
        const stageId = body.stageId
        const topicLimit = body.topicLimit || 1
        const category = body.category || 'derivatives'
        const customTopic = body.customTopic || ''
        const customTitle = body.customTitle || ''
        const contentOutline = body.contentOutline || ''
        const autoApprove = body.autoApprove !== undefined ? body.autoApprove : true  // Default to true for UI flows

        if (!stageId || !STAGE_NAMES[stageId]) {
          throw new Error(`Invalid stage ID: ${stageId}`)
        }

        const stageName = STAGE_NAMES[stageId]

        // Path to main.js (backend directory)
        const workingDir = path.join(process.cwd(), 'backend')
        const mainJsPath = path.join(workingDir, 'main.js')

        sendEvent({ log: `🔧 Executing Stage ${stageId}: ${stageName}...` })
        sendEvent({ log: `📊 Topic Limit: ${topicLimit}` })
        sendEvent({ log: `📂 Category Focus: ${category}` })
        if (autoApprove) {
          sendEvent({ log: `🤖 Auto-Approval: ENABLED` })
        }
        if (customTopic) {
          sendEvent({ log: `✨ Custom Topic: "${customTopic}"` })
        }
        if (customTitle) {
          sendEvent({ log: `🚀 Custom Title: "${customTitle}"` })
        }
        if (contentOutline) {
          const lineCount = contentOutline.split('\n').length
          sendEvent({ log: `📝 Content Outline: ${lineCount} lines provided` })
        }
        sendEvent({ stage: stageId, status: 'running', message: `Executing ${stageName}...` })

        // Execute stage with NODE_PATH for module resolution
        const parentNodeModules = path.join(process.cwd(), 'node_modules')
        const nodeEnv = {
          ...process.env,
          NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : ''),
          // Pass content outline via environment variable to preserve newlines and special chars
          CONTENT_OUTLINE: contentOutline
        }

        const args = [mainJsPath, 'stage', stageName]
        if (autoApprove) {
          args.push('--auto-approve')
        }
        args.push('--topic-limit', topicLimit.toString(), '--category', category)
        if (customTopic) {
          args.push('--custom-topic', customTopic)
        }
        if (customTitle) {
          args.push('--custom-title', customTitle)
        }
        if (contentOutline) {
          args.push('--content-outline-provided')
        }
        const nodeProcess = spawn('node', args, {
          cwd: workingDir,
          env: nodeEnv,
        })

        sendEvent({ log: `🚀 Command: node ${args.slice(1).join(' ')}` })

        // Handle stdout
        nodeProcess.stdout.on('data', (data: Buffer) => {
          const output = data.toString()
          const lines = output.split('\n').filter(line => line.trim())

          for (const line of lines) {
            sendEvent({ log: line })
          }
        })

        // Handle stderr
        nodeProcess.stderr.on('data', (data: Buffer) => {
          const error = data.toString()
          sendEvent({ log: `⚠️  ${error}` })
        })

        // Handle process completion
        await new Promise<void>((resolve, reject) => {
          nodeProcess.on('close', (code) => {
            if (code === 0) {
              sendEvent({ log: `✅ Stage ${stageId} completed successfully!` })
              sendEvent({ stage: stageId, status: 'completed', message: 'Stage completed' })
              resolve()
            } else {
              sendEvent({ log: `❌ Stage ${stageId} exited with code ${code}` })
              sendEvent({ stage: stageId, status: 'error', message: `Failed with code ${code}` })
              reject(new Error(`Process exited with code ${code}`))
            }
          })

          nodeProcess.on('error', (error) => {
            sendEvent({ log: `❌ Process error: ${error.message}` })
            sendEvent({ stage: stageId, status: 'error', message: error.message })
            reject(error)
          })
        })

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        sendEvent({ log: `❌ Fatal error: ${errorMessage}` })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
