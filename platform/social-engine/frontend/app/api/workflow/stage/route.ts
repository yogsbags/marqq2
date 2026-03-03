import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs'
import { NextRequest } from 'next/server'
import os from 'os'
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
 * Execute single workflow stage
 * Returns SSE stream with real-time updates
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    stageId,
    campaignType,
    platforms = [],
    topic,
    duration = 90,
    useVeo = true,
    useAvatar = true,
    campaignData = {},
    longCatConfig = null,
    purpose,
    targetAudience,
    contentType,
    language,
    aspectRatio = '16:9',
    brandSettings,
    files = {},
    avatarId,
    avatarScriptText,
    avatarVoiceId
  } = body

  // Sync useAvatar with contentType if contentType is explicitly set
  const finalUseAvatar = contentType === 'avatar-video' ? true : (contentType === 'faceless-video' ? false : useAvatar)

  console.log(`[DEBUG] contentType="${contentType}", useAvatar=${useAvatar}, finalUseAvatar=${finalUseAvatar}`)

  const stageNames: Record<number, string> = {
    1: 'planning',
    2: 'content',
    3: 'visuals',
    4: 'video',
    5: 'publishing',
    6: 'tracking'
  }

  const stageName = stageNames[stageId]

  // Create SSE response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Helper to persist base64 image to tmp file (fallback) and return path
      const persistBase64Image = (dataUrl: string, name: string) => {
        try {
          const [, meta, b64] = dataUrl.match(/^data:(.*?);base64,(.*)$/) || []
          const buffer = Buffer.from(b64 || dataUrl, 'base64')
          const ext = meta?.includes('png') ? '.png' : meta?.includes('jpeg') ? '.jpg' : '.png'
          const tmpPath = path.join(os.tmpdir(), `${randomUUID()}-${name}${ext}`)
          fs.writeFileSync(tmpPath, buffer)
          return tmpPath
        } catch (e) {
          console.error('Failed to persist reference image:', e)
          return null
        }
      }

      // Helper to upload base64 image to ImgBB if key exists
      const uploadToImgbb = async (dataUrl: string) => {
        const apiKey = process.env.IMGBB_API_KEY
        if (!apiKey) return null
        try {
          const [, , b64] = dataUrl.match(/^data:(.*?);base64,(.*)$/) || []
          const payload = new URLSearchParams()
          payload.append('key', apiKey)
          payload.append('image', b64 || dataUrl)
          const resp = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload
          })
          if (!resp.ok) {
            const text = await resp.text()
            console.error('ImgBB upload failed:', resp.status, text)
            return null
          }
          const json = await resp.json()
          return json?.data?.url || null
        } catch (e) {
          console.error('ImgBB upload error:', e)
          return null
        }
      }

      try {
        sendEvent({ log: `🚀 Starting Stage ${stageId}: ${stageName}...` })
        sendEvent({ stage: stageId, status: 'running', message: `Executing ${stageName}...` })

        // Special handling for Stage 1: Generate creative prompt
        if (stageId === 1) {
          sendEvent({ log: '🎨 Generating creative prompt with GPT-OSS-120B...' })

          try {
            const requestOrigin = new URL(request.url).origin
            const envBase = process.env.NEXT_API_PUBLIC_URL
              ? (process.env.NEXT_API_PUBLIC_URL.startsWith('http') ? process.env.NEXT_API_PUBLIC_URL : `https://${process.env.NEXT_API_PUBLIC_URL}`)
              : process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith('http')
                ? process.env.NEXT_PUBLIC_API_URL
                : null
            const baseUrl = envBase || requestOrigin

            // Ingest reference images: upload to ImgBB so we have URLs to pass to prompt generator
            let referenceImageUrls: string[] = []
            if (files?.referenceImages?.length > 0) {
              sendEvent({ log: `🖼️  Ingesting ${files.referenceImages.length} reference image(s) for creative brief...` })
              for (let i = 0; i < files.referenceImages.length; i++) {
                const ref = files.referenceImages[i]
                const dataUrl = ref.data?.startsWith('data:') ? ref.data : `data:image/png;base64,${ref.data}`
                const url = process.env.IMGBB_API_KEY ? await uploadToImgbb(dataUrl) : null
                if (url) {
                  referenceImageUrls.push(url)
                  sendEvent({ log: `   ✅ Reference image ${i + 1}: uploaded` })
                }
              }
              if (referenceImageUrls.length > 0) {
                sendEvent({ log: `   Reference images will be passed downstream to image/video stages.` })
              } else if (files.referenceImages.length > 0) {
                sendEvent({ log: `   ⚠️ Set IMGBB_API_KEY to upload references for Stage 1; they will still be passed when running Stage 3/4.` })
              }
            }

            const promptResponse = await fetch(`${baseUrl}/api/prompt/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic,
                campaignType,
                purpose,
                targetAudience,
                platforms,
                contentType,
                duration,
                language,
                aspectRatio,
                brandSettings,
                referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
                referenceImagesProvided: files?.referenceImages?.length > 0
              })
            })

            if (!promptResponse.ok) {
              throw new Error('Failed to generate creative prompt')
            }

            const promptData = await promptResponse.json()
            const generatedPrompt = promptData.prompt

            sendEvent({ log: '✅ Creative prompt generated successfully!' })

            // Save the generated prompt as stage 1 data (include reference image URLs so downstream knows they were ingested)
            const stageData = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              type: 'campaign-planning',
              creativePrompt: generatedPrompt,
              promptModel: promptData.model,
              ...(referenceImageUrls.length > 0 && { referenceImageUrls })
            }

            saveStageData(stageId, stageData)
            sendEvent({ stage: stageId, status: 'completed', message: 'Creative prompt generated', data: stageData })
            sendEvent({ log: '✅ Stage 1 completed successfully!' })
            controller.close()
            return

          } catch (error) {
            sendEvent({ log: `⚠️ Prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
            // Fallback prompt so the UI still has editable content
            const brand = brandSettings?.useBrandGuidelines
              ? 'Use PL Capital colors (Navy #0e0e6a, Blue #3c3cf8, Teal #00d084, Green #66e766) and Figtree typography.'
              : [
                  brandSettings?.customColors ? `Brand colors: ${brandSettings.customColors}` : null,
                  brandSettings?.customTone ? `Tone: ${brandSettings.customTone}` : null,
                  brandSettings?.customInstructions ? `Guidelines: ${brandSettings.customInstructions}` : null
                ].filter(Boolean).join(' ')
              || 'Use brand-safe colors and professional tone.'

            const fallbackPrompt = `Create a WhatsApp static creative for "${topic || 'the campaign'}". Focus on a bold headline, single CTA, high contrast, and mobile-friendly 1080x1920 layout. ${brand}`;

            const stageData = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              type: 'campaign-planning',
              creativePrompt: fallbackPrompt,
              promptModel: 'fallback'
            }

            saveStageData(stageId, stageData)
            sendEvent({ stage: stageId, status: 'completed', message: 'Creative prompt generated (fallback)', data: stageData })
            sendEvent({ log: '✅ Stage 1 completed with fallback prompt' })
            controller.close()
            return
          }
        }

        // Special handling for Stage 2: Generate email newsletter content
        if (stageId === 2 && (platforms.includes('email') || campaignType.includes('email') || campaignType.includes('newsletter'))) {
          sendEvent({ log: '📧 Generating HTML email newsletter...' })

          try {
            // Get creative prompt from Stage 1 if available
            const backendRoot = path.join(process.cwd(), 'backend')
            const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')
            let creativePrompt = ''

            if (fs.existsSync(stateFilePath)) {
              const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
              const state = JSON.parse(stateContent)

              // Find the most recent campaign with matching topic
              const campaigns = Object.values(state.campaigns || {}) as any[]
              const matchingCampaign = campaigns
                .filter((c: any) => c.topic === topic)
                .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]

              if (matchingCampaign?.creativePrompt) {
                creativePrompt = matchingCampaign.creativePrompt
                sendEvent({ log: '📋 Using creative prompt from Stage 1' })
              }
            }

            const requestOrigin = new URL(request.url).origin
            const envBase = process.env.NEXT_API_PUBLIC_URL
              ? (process.env.NEXT_API_PUBLIC_URL.startsWith('http') ? process.env.NEXT_API_PUBLIC_URL : `https://${process.env.NEXT_API_PUBLIC_URL}`)
              : process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith('http')
                ? process.env.NEXT_PUBLIC_API_URL
                : null
            const baseUrl = envBase || requestOrigin

            const emailResponse = await fetch(`${baseUrl}/api/email/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic,
                purpose,
                targetAudience,
                creativePrompt,
                brandSettings,
                language
              })
            })

            if (!emailResponse.ok) {
              throw new Error('Failed to generate email newsletter')
            }

            const emailData = await emailResponse.json()

            sendEvent({ log: '✅ Email newsletter generated successfully!' })
            sendEvent({ log: `📧 Subject: ${emailData.subject}` })
            sendEvent({ log: `📝 Preheader: ${emailData.preheader}` })
            sendEvent({ log: `📄 HTML: ${emailData.html.length} characters` })

            // Save the generated email as stage 2 data
            const stageData = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              type: 'content-generation',
              contentType: 'email-newsletter',
              subject: emailData.subject,
              preheader: emailData.preheader,
              subjectVariations: emailData.subjectVariations,
              html: emailData.html,
              plainText: emailData.plainText,
              model: emailData.model
            }

            saveStageData(stageId, stageData)
            sendEvent({ stage: stageId, status: 'completed', message: 'Email newsletter generated', data: stageData })
            sendEvent({ log: '✅ Stage 2 completed successfully!' })
            controller.close()
            return

          } catch (error) {
            sendEvent({ log: `⚠️ Email generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
            sendEvent({ log: '📦 Falling back to standard workflow execution...' })
            // Continue with normal backend execution if email generation fails
          }
        }

        // Path to backend (monorepo structure: frontend/backend/)
        const workingDir = path.join(process.cwd(), 'backend')
        const mainScript = path.join(workingDir, 'main.js')

        sendEvent({ log: `📍 Executing: ${mainScript}` })
        sendEvent({ log: `📍 Working Dir: ${workingDir}` })

        // Build command arguments
        const args = [
          mainScript,
          'stage',
          stageName
        ]

        if (topic) {
          args.push('--topic', topic)
        }

        if (language) {
          args.push('--language', language)
        }

        if (campaignType) {
          args.push('--type', campaignType)

          // Single-word types (e.g. "infographic"): use format = type, platform = first selected or default
          const isSingleWordType = !campaignType.includes('-')
          const platform = isSingleWordType
            ? (Array.isArray(platforms) && platforms.length > 0 ? platforms[0] : 'linkedin')
            : campaignType.split('-')[0]
          const format = isSingleWordType
            ? campaignType
            : campaignType.split('-').slice(1).join('-')

          if (platform) {
            args.push('--platform', platform)
          }
          if (format) {
            args.push('--format', format)
          }
        }

        // Add aspect ratio for image generation stages (Stage 2: Content, Stage 3: Visuals)
        if (stageId === 2 || stageId === 3) {
          args.push('--aspect-ratio', aspectRatio)
        }

        if (stageId === 4) {
          // Video production stage
          args.push('--duration', duration.toString())
          args.push('--aspect-ratio', aspectRatio)
          if (useVeo) args.push('--use-veo')
          // Explicitly set avatar mode: pass --use-avatar if true, --no-avatar if false
          if (finalUseAvatar) {
            args.push('--use-avatar')
          } else {
            args.push('--no-avatar')  // Explicitly disable avatar for faceless videos
          }

          // Pass avatar options directly as CLI arguments - ONLY if avatar mode is enabled
          if (finalUseAvatar && avatarId) {
            args.push('--avatar-id', avatarId)
            // Siddharth Vora: optional heygen group id; voice comes from env or backend default
            if (avatarId === 'siddharth-vora') {
              const heygenGroupId = body.heygenAvatarGroupId
              if (heygenGroupId) args.push('--heygen-avatar-group-id', heygenGroupId)
              if (avatarVoiceId) args.push('--avatar-voice-id', avatarVoiceId)
            } else {
              // Other HeyGen avatars (Raj, Priya, etc.): pass voice from frontend mapping
              if (avatarVoiceId) args.push('--avatar-voice-id', avatarVoiceId)
            }
          }
          if (finalUseAvatar && avatarScriptText) {
            args.push('--avatar-script', avatarScriptText)
          }
        }

        if (stageId === 5) {
          // Publishing stage
          platforms.forEach((platform: string) => {
            args.push('--platform', platform)
          })
        }

        // Add parent node_modules to NODE_PATH for module resolution
        const parentNodeModules = path.join(process.cwd(), 'node_modules')
        const nodeEnv = {
          ...process.env,
          NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '')
        } as NodeJS.ProcessEnv

        // Inject reference images for visual generation and video production
        if (files?.referenceImages?.length > 0) {
          sendEvent({ log: `🖼️  Processing ${files.referenceImages.length} reference image(s)...` })

          const referencePaths: string[] = []
          const referenceUrls: string[] = []

          // Process each reference image (up to 3 for video)
          const imagesToProcess = files.referenceImages.slice(0, 3)

          for (let i = 0; i < imagesToProcess.length; i++) {
            const ref = imagesToProcess[i]

            // Try ImgBB upload first if key exists
            let refUrl: string | null = null
            if (process.env.IMGBB_API_KEY && stageId !== 4) {
              // Only upload to ImgBB for non-video stages (images work better with URLs)
              refUrl = await uploadToImgbb(ref.data)
              if (refUrl) {
                referenceUrls.push(refUrl)
                sendEvent({ log: `   ✅ Image ${i + 1}: Uploaded to ImgBB` })
              }
            }

            // For video stage (4) or if ImgBB failed, save as temp file
            if (!refUrl || stageId === 4) {
              const tmpPath = persistBase64Image(ref.data, ref.name || `ref-${i}`)
              if (tmpPath) {
                referencePaths.push(tmpPath)
                sendEvent({ log: `   ✅ Image ${i + 1}: Saved to ${tmpPath}` })
              }
            }
          }

          // Set environment variables for backend to use
          if (referenceUrls.length > 0) {
            nodeEnv.VISUAL_REFERENCE_URL = referenceUrls[0]
            nodeEnv.VISUAL_REFERENCE_URLS = referenceUrls.join(',')
          }

          if (referencePaths.length > 0) {
            nodeEnv.REFERENCE_IMAGE_PATH = referencePaths[0]
            nodeEnv.REFERENCE_IMAGE_PATHS = referencePaths.join(',')

            if (stageId === 4) {
              sendEvent({ log: `🎬 Reference images will be used for Veo 3.1 video generation` })
            }
          }
        }


        // Pass LongCat configuration as environment variables for video stage
        if (stageId === 4 && longCatConfig) {
          nodeEnv.LONGCAT_ENABLED = longCatConfig.enabled ? 'true' : 'false'
          nodeEnv.LONGCAT_MODE = longCatConfig.mode || 'text-to-video'
          nodeEnv.LONGCAT_PROMPT = longCatConfig.prompt || ''
          nodeEnv.LONGCAT_DURATION = longCatConfig.duration?.toString() || duration.toString()
        }

        sendEvent({ log: `🚀 Command: node ${args.slice(1).join(' ')}` })

        // Spawn backend process
        const backendProcess = spawn('node', args, {
          cwd: workingDir,
          env: nodeEnv
        })

        let outputBuffer = ''

        // Handle stdout - collect output and send events
        backendProcess.stdout.on('data', (data) => {
          const output = data.toString()
          outputBuffer += output
          sendEvent({ log: output.trim() })
        })

        // Handle stderr
        backendProcess.stderr.on('data', (data) => {
          const error = data.toString()
          sendEvent({ log: `⚠️ ${error.trim()}` })
        })

        // Handle process completion
        backendProcess.on('close', (code) => {
          if (code === 0) {
            // Save stage data based on stage type
            const stageData: any = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              output: outputBuffer
            }

            // Add stage-specific data
            if (stageId === 1) {
              stageData.type = 'campaign-planning'
            } else if (stageId === 2) {
              stageData.type = 'content-generation'
            } else if (stageId === 3) {
              stageData.type = 'visual-assets'
            } else if (stageId === 4) {
              stageData.type = 'video-production'
              stageData.duration = duration
              stageData.useVeo = useVeo
              stageData.useAvatar = finalUseAvatar
              if (avatarId) stageData.avatarId = avatarId
              if (avatarScriptText) stageData.avatarScriptText = avatarScriptText
              if (avatarVoiceId) stageData.avatarVoiceId = avatarVoiceId
            } else if (stageId === 5) {
              stageData.type = 'publishing'
            } else if (stageId === 6) {
              stageData.type = 'analytics'
            }

            // Stage 3: merge backend output images (with hostedUrl from ImgBB) so edit popup has image URL and View Image
            if (stageId === 3 && outputBuffer) {
              const match = outputBuffer.match(/__STAGE3_IMAGES__([^\n]+)/)
              if (match) {
                try {
                  const images = JSON.parse(match[1]) as Array<{ path?: string; url?: string; hostedUrl?: string }>
                  if (Array.isArray(images) && images.length > 0) {
                    stageData.images = images
                    const first = images[0]
                    stageData.imageUrl = first?.hostedUrl || first?.url || ''
                  }
                } catch (_) {
                  // ignore parse errors
                }
              }
            }

            // Save to workflow state file
            saveStageData(stageId, stageData)

            sendEvent({ stage: stageId, status: 'completed', message: `${stageName} completed` })
            sendEvent({ log: `✅ Stage ${stageId} completed successfully!` })
          } else {
            sendEvent({ log: `❌ Stage ${stageId} failed with exit code ${code}` })
            sendEvent({ stage: stageId, status: 'error', message: `${stageName} failed` })
          }
          controller.close()
        })

        // Handle errors
        backendProcess.on('error', (error) => {
          sendEvent({ log: `❌ Error: ${error.message}` })
          sendEvent({ stage: stageId, status: 'error', message: error.message })
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
