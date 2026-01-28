import { spawn } from 'child_process'
import { NextRequest } from 'next/server'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes (Vercel Pro plan)

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

      let currentStage = 0

      try {
        // Parse request body to get topic limit, category, custom topic, and custom title
        const body = await req.json()
        const topicLimit = body.topicLimit || 1
        const category = body.category || 'derivatives'
        const customTopic = body.customTopic || ''
        const customTitle = body.customTitle || ''
        const contentOutline = body.contentOutline || ''
        const autoApprove = body.autoApprove !== undefined ? body.autoApprove : true  // Default to true for UI flows

        // Check if we're in Netlify environment
        if (process.env.NETLIFY === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
          // In Netlify: Use the dedicated Netlify Function for workflow execution
          sendEvent({ log: '🔧 Initializing workflow execution via Netlify Function...' })
          sendEvent({ log: `📊 Topic Limit: ${topicLimit}` })
          sendEvent({ log: `📂 Category Focus: ${category}` })
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

          try {
            // In Netlify, we need to construct the full URL for the function
            // Get the current site URL from environment or construct from request
            const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://content-creator-pl.netlify.app'
            const functionUrl = `${siteUrl}/.netlify/functions/workflow-execute`

            sendEvent({ log: `📍 Calling function: ${functionUrl}` })

            const response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ topicLimit, category, customTopic, customTitle, contentOutline }),
            })

            sendEvent({ log: `📡 Response status: ${response.status} ${response.statusText}` })

            if (!response.ok) {
              const errorText = await response.text()
              sendEvent({ log: `❌ HTTP Error: ${errorText}` })
              sendEvent({ stage: 1, status: 'error', message: `HTTP ${response.status}: ${response.statusText}` })
              return
            }

            const result = await response.json()
            sendEvent({ log: `📦 Response received: ${JSON.stringify(result).substring(0, 200)}...` })

            if (result.success) {
              // Stream output logs
              for (const line of result.output || []) {
                sendEvent({ log: line })
              }
              sendEvent({ log: '🎉 Workflow completed successfully!' })

              // Parse logs to determine actual stage progress, then mark remaining stages
              // For now, conservatively mark only final stage
              sendEvent({ stage: 7, status: 'completed', message: 'Workflow completed!' })
            } else {
              sendEvent({ log: `❌ Error: ${result.error}` })
              if (result.errorOutput) {
                for (const line of result.errorOutput) {
                  sendEvent({ log: `⚠️  ${line}` })
                }
              }
              sendEvent({ stage: 1, status: 'error', message: result.error || 'Unknown error' })
            }
          } catch (error: any) {
            sendEvent({ log: `❌ Fatal error: ${error.message}` })
            sendEvent({ stage: 1, status: 'error', message: error.message })
          }
        } else {
          // Vercel/Local: Execute main.js from backend directory
          const mainJsPath = path.join(process.cwd(), 'backend', 'main.js')
          const workingDir = path.join(process.cwd(), 'backend')

          sendEvent({ log: '🔧 Initializing workflow execution...' })
          sendEvent({ log: `📍 Executing: ${mainJsPath}` })
          sendEvent({ log: `📍 Working Dir: ${workingDir}` })
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

          // Execute main.js with 'full' command, topic limit, category, custom topic, and custom title
          const args = [mainJsPath, 'full']
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

          // Add parent node_modules to NODE_PATH for Vercel deployment
          const parentNodeModules = path.join(process.cwd(), 'node_modules')
          const nodeEnv = {
            ...process.env,
            NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : ''),
            // Pass content outline via environment variable to preserve newlines and special chars
            CONTENT_OUTLINE: contentOutline
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

              // Detect stage changes based on output
              // Only match actual execution markers (🎯, ✅, ❌) not initialization text
              const lowerLine = line.toLowerCase()

              // Stage 1: Research Phase
              // ONLY trigger on actual execution marker: "🎯 executing stage: research"
              if (lowerLine.includes('🎯 executing stage: research')) {
                sendEvent({ stage: 1, status: 'running', message: 'Analyzing competitors...' })
                currentStage = 1
              } else if (lowerLine.includes('✅ research stage completed') ||
                         lowerLine.includes('✅ stage 1 complete')) {
                sendEvent({ stage: 1, status: 'completed', message: 'Research gaps identified' })
              }

              // Stage 2: Topic Generation
              // ONLY trigger on actual execution marker: "🎯 executing stage: topics"
              else if (lowerLine.includes('🎯 executing stage: topics')) {
                sendEvent({ stage: 2, status: 'running', message: 'Generating strategic topics...' })
                currentStage = 2
              } else if (lowerLine.includes('✅ topic generation completed') ||
                         lowerLine.includes('✅ stage 2 complete')) {
                sendEvent({ stage: 2, status: 'completed', message: 'Topics generated' })
              }

              // Stage 3: Deep Research
              // ONLY trigger on actual execution marker: "🎯 executing stage: deep-research"
              else if (lowerLine.includes('🎯 executing stage: deep-research')) {
                sendEvent({ stage: 3, status: 'running', message: 'Deep competitor analysis...' })
                currentStage = 3
              } else if (lowerLine.includes('✅ deep research completed') ||
                         lowerLine.includes('✅ stage 3 complete')) {
                sendEvent({ stage: 3, status: 'completed', message: 'Research completed' })
              }

              // Stage 4: Content Creation
              // ONLY trigger on actual execution marker: "🎯 executing stage: content"
              else if (lowerLine.includes('🎯 executing stage: content')) {
                sendEvent({ stage: 4, status: 'running', message: 'Creating E-E-A-T content...' })
                currentStage = 4
              } else if (lowerLine.includes('✅ content creation completed') ||
                         lowerLine.includes('✅ stage 4 complete')) {
                sendEvent({ stage: 4, status: 'completed', message: 'Content created' })
              }

              // Stage 5: SEO Optimization
              // ONLY trigger on actual execution marker: "🎯 executing stage: seo"
              else if (lowerLine.includes('🎯 executing stage: seo')) {
                sendEvent({ stage: 5, status: 'running', message: 'Optimizing SEO metadata...' })
                currentStage = 5
              } else if (lowerLine.includes('✅ seo optimization completed') ||
                         lowerLine.includes('✅ stage 5 complete')) {
                sendEvent({ stage: 5, status: 'completed', message: 'SEO optimized' })
              }

              // Stage 6: Publication
              // ONLY trigger on actual execution marker: "🎯 executing stage: publication"
              else if (lowerLine.includes('🎯 executing stage: publication')) {
                sendEvent({ stage: 6, status: 'running', message: 'Publishing to WordPress + Sanity...' })
                currentStage = 6
              } else if (lowerLine.includes('✅ publication completed') ||
                         lowerLine.includes('✅ stage 6 complete')) {
                sendEvent({ stage: 6, status: 'completed', message: 'Content published' })
              }

              // Stage 7: Completion
              // Only trigger when actually executing stage 7, not during initialization
              else if (lowerLine.includes('🎯 executing stage: completion') ||
                       (lowerLine.includes('📍 stage 7:') && lowerLine.includes('completion'))) {
                sendEvent({ stage: 7, status: 'running', message: 'Finalizing workflow...' })
                currentStage = 7
              }

              // Detect completion
              if (lowerLine.includes('workflow complete') || lowerLine.includes('finished')) {
                sendEvent({ stage: 7, status: 'completed', message: 'Workflow completed!' })
                sendEvent({ log: '✅ All stages completed successfully!' })
              }

              // Detect FATAL errors only (not warnings or optional API failures)
              // Only trigger on actual stage failures, not Google Ads/API warnings
              if ((lowerLine.includes('❌ stage') ||
                   lowerLine.includes('fatal') ||
                   lowerLine.includes('process exited with code') ||
                   lowerLine.includes('workflow failed')) &&
                  !lowerLine.includes('0 error')) {
                const stageWithError = currentStage || 1
                sendEvent({
                  stage: stageWithError,
                  status: 'error',
                  message: 'Error occurred - check logs'
                })
              }
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
                sendEvent({ log: '🎉 Process completed successfully!' })

                // Only mark final stage as completed if not already done
                if (currentStage < 7) {
                  sendEvent({ stage: 7, status: 'completed', message: 'Workflow completed!' })
                }

                resolve()
              } else {
                sendEvent({ log: `❌ Process exited with code ${code}` })
                reject(new Error(`Process exited with code ${code}`))
              }
            })

            nodeProcess.on('error', (error) => {
              sendEvent({ log: `❌ Process error: ${error.message}` })
              reject(error)
            })
          })
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        sendEvent({ log: `❌ Fatal error: ${errorMessage}` })
        sendEvent({ stage: currentStage || 1, status: 'error', message: errorMessage })
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
