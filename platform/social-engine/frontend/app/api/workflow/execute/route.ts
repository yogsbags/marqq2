import { spawn } from 'child_process'
import fs from 'fs'
import { NextRequest } from 'next/server'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper function to save stage data
function saveStageData(stageId: number, data: any) {
  try {
    const backendRoot = path.join(process.cwd(), 'backend')
    const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')

    // Read existing state
    let state: any = {
      campaigns: {},
      content: {},
      visuals: {},
      videos: {},
      published: {},
      metrics: {}
    }

    if (fs.existsSync(stateFilePath)) {
      const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
      state = JSON.parse(stateContent)
    }

    // Generate unique ID
    const timestamp = Date.now()
    const id = `${stageId}-${timestamp}`

    // Save data based on stage
    const stageKeys: Record<number, string> = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    }

    const key = stageKeys[stageId]
    if (key) {
      state[key][id] = {
        id,
        ...data,
        stageId,
        completedAt: new Date().toISOString()
      }
    }

    // Write updated state
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2))
    console.log(`Saved stage ${stageId} data:`, id)
  } catch (error) {
    console.error('Error saving stage data:', error)
  }
}

/**
 * Execute full campaign workflow (all 6 stages)
 * Returns SSE stream with real-time updates
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    campaignType,
    platforms = [],
    topic,
    duration = 90,
    useVeo = true,
    useAvatar = true,
    autoPublish = false,
    contentType,
    aspectRatio = '16:9',
    language = 'english'
  } = body

  // Sync useAvatar with contentType if contentType is explicitly set
  const finalUseAvatar = contentType === 'avatar-video' ? true : (contentType === 'faceless-video' ? false : useAvatar)

  console.log(`[DEBUG] contentType="${contentType}", useAvatar=${useAvatar}, finalUseAvatar=${finalUseAvatar}`)

  // Create SSE response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        sendEvent({ log: '🚀 Starting full campaign workflow...' })
        sendEvent({ log: `Campaign: ${campaignType}` })
        sendEvent({ log: `Topic: ${topic}` })
        sendEvent({ log: `Platforms: ${platforms.join(', ')}` })

        // Path to backend (monorepo structure: frontend/backend/)
        const workingDir = path.join(process.cwd(), 'backend')
        const mainScript = path.join(workingDir, 'main.js')

        sendEvent({ log: `📍 Executing: ${mainScript}` })
        sendEvent({ log: `📍 Working Dir: ${workingDir}` })

        // Build command arguments
        const args = [
          mainScript,
          'campaign',
          campaignType,
          '--topic', topic,
          '--duration', duration.toString(),
          '--aspect-ratio', aspectRatio,
          '--language', language
        ]

        if (useVeo) args.push('--use-veo')
        // Explicitly set avatar mode: pass --use-avatar if true, --no-avatar if false
        if (finalUseAvatar) {
          args.push('--use-avatar')
        } else {
          args.push('--no-avatar')  // Explicitly disable avatar for faceless videos
        }
        if (autoPublish) args.push('--auto-publish')

        platforms.forEach((platform: string) => {
          args.push('--platform', platform)
        })

        // Add parent node_modules to NODE_PATH for module resolution
        const parentNodeModules = path.join(process.cwd(), 'node_modules')
        const nodeEnv = {
          ...process.env,
          NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '')
        } as NodeJS.ProcessEnv

        sendEvent({ log: `🚀 Command: node ${args.slice(1).join(' ')}` })

        // Spawn backend process
        const backendProcess = spawn('node', args, {
          cwd: workingDir,
          env: nodeEnv
        })

        let currentStage = 1
        let outputBuffer = ''

        // Handle stdout
        backendProcess.stdout.on('data', (data) => {
          const output = data.toString()
          outputBuffer += output
          sendEvent({ log: output.trim() })

          // Parse stage progression from output and save data
          if (output.includes('Stage 1:') || output.includes('Planning')) {
            currentStage = 1
            sendEvent({ stage: 1, status: 'running', message: 'Generating campaign plan...' })
          } else if (output.includes('Stage 2:') || output.includes('Content')) {
            if (currentStage === 1) {
              saveStageData(1, {
                type: 'campaign-planning',
                topic,
                campaignType,
                platforms,
                status: 'completed',
                output: outputBuffer.slice(0, 1000)
              })
              sendEvent({ stage: 1, status: 'completed', message: 'Plan created' })
            }
            currentStage = 2
            sendEvent({ stage: 2, status: 'running', message: 'Generating scripts & captions...' })
          } else if (output.includes('Stage 3:') || output.includes('Visual')) {
            if (currentStage === 2) {
              saveStageData(2, {
                type: 'content-generation',
                topic,
                campaignType,
                status: 'completed',
                output: outputBuffer.slice(0, 1000)
              })
              sendEvent({ stage: 2, status: 'completed', message: 'Content generated' })
            }
            currentStage = 3
            sendEvent({ stage: 3, status: 'running', message: 'Creating visual assets...' })
          } else if (output.includes('Stage 4:') || output.includes('Video')) {
            if (currentStage === 3) {
              saveStageData(3, {
                type: 'visual-assets',
                topic,
                campaignType,
                status: 'completed',
                output: outputBuffer.slice(0, 1000)
              })
              sendEvent({ stage: 3, status: 'completed', message: 'Assets created' })
            }
            currentStage = 4
            sendEvent({ stage: 4, status: 'running', message: 'Producing video (HeyGen + Veo)...' })
          } else if (output.includes('Stage 5:') || output.includes('Publishing')) {
            if (currentStage === 4) {
              saveStageData(4, {
                type: 'video-production',
                topic,
                campaignType,
                duration,
                useVeo,
                useAvatar,
                status: 'completed',
                output: outputBuffer.slice(0, 1000)
              })
              sendEvent({ stage: 4, status: 'completed', message: 'Video produced' })
            }
            currentStage = 5
            sendEvent({ stage: 5, status: 'running', message: 'Publishing to platforms...' })
          } else if (output.includes('Stage 6:') || output.includes('Analytics')) {
            if (currentStage === 5) {
              saveStageData(5, {
                type: 'publishing',
                topic,
                campaignType,
                platforms,
                status: 'completed',
                output: outputBuffer.slice(0, 1000)
              })
              sendEvent({ stage: 5, status: 'completed', message: 'Published' })
            }
            currentStage = 6
            sendEvent({ stage: 6, status: 'running', message: 'Setting up tracking...' })
          }

          // Extract campaign data
          if (output.includes('Campaign ID:')) {
            const campaignId = output.match(/Campaign ID:\s*(\S+)/)?.[1]
            if (campaignId) {
              sendEvent({ campaignData: { campaignId } })
            }
          }

          // Extract published URLs
          if (output.includes('Published to')) {
            const urlMatch = output.match(/(https?:\/\/[^\s]+)/)
            if (urlMatch) {
              const platform = output.toLowerCase().includes('linkedin') ? 'linkedin' :
                             output.toLowerCase().includes('instagram') ? 'instagram' :
                             output.toLowerCase().includes('youtube') ? 'youtube' :
                             output.toLowerCase().includes('facebook') ? 'facebook' :
                             output.toLowerCase().includes('twitter') ? 'twitter' : 'unknown'
              sendEvent({ campaignData: { publishedUrls: { [platform]: urlMatch[1] } } })
            }
          }
        })

        // Handle stderr
        backendProcess.stderr.on('data', (data) => {
          const error = data.toString()
          sendEvent({ log: `⚠️ ${error.trim()}` })
        })

        // Handle process completion
        backendProcess.on('close', (code) => {
          if (code === 0) {
            // Save stage 6 data if we reached the analytics stage
            if (currentStage === 6) {
              saveStageData(6, {
                type: 'analytics',
                topic,
                campaignType,
                platforms,
                status: 'completed',
                output: outputBuffer.slice(-1000) // Last 1000 chars for analytics stage
              })
            }
            sendEvent({ stage: 6, status: 'completed', message: 'Tracking configured' })
            sendEvent({ log: '✅ Campaign workflow completed successfully!' })
          } else {
            sendEvent({ log: `❌ Workflow failed with exit code ${code}` })
            sendEvent({ stage: currentStage, status: 'error', message: 'Process failed' })
          }
          controller.close()
        })

        // Handle errors
        backendProcess.on('error', (error) => {
          sendEvent({ log: `❌ Error: ${error.message}` })
          sendEvent({ stage: currentStage, status: 'error', message: error.message })
          controller.close()
        })

      } catch (error) {
        sendEvent({ log: `❌ Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}` })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
