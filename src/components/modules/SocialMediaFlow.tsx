'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FileUpload from '../social-media/FileUpload'
import PromptEditor from '../social-media/PromptEditor'
import PublishingQueue from '../social-media/PublishingQueue'
// Import StageDataModal for social media workflow (NOT EditModal)
// Using relative path to ensure correct resolution
import StageDataModalComponent from '../social-media/StageDataModal'

// Debug: Verify we're importing the correct component
if (typeof window !== 'undefined') {
  console.log('SocialMediaFlow: Imported StageDataModal:', StageDataModalComponent);
  console.log('SocialMediaFlow: Component name:', StageDataModalComponent?.name || 'Unknown');
}
import VideoProducer from '../social-media/VideoProducer'

type WorkflowStage = {
  id: number
  name: string
  status: 'idle' | 'running' | 'completed' | 'error'
  message: string
}

type CampaignData = {
  campaignId?: string
  topic?: string
  script?: string
  caption?: string
  assets?: any[]
  videoData?: any
  publishedUrls?: Record<string, string>
}

type StageData = {
  data: any
  summary?: {
    [key: string]: any
  }
}

// Helper function to detect if text contains markdown
function isMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers
    /\*\*[^*]+\*\*/,        // Bold
    /\*[^*]+\*/,            // Italic
    /^\s*[-*+]\s/m,         // Unordered lists
    /^\s*\d+\.\s/m,         // Ordered lists
    /\[.+\]\(.+\)/,         // Links
    /^>\s/m,                // Blockquotes
  ];
  return markdownPatterns.some(pattern => pattern.test(text));
}

// LogEntry component to render logs with markdown support
function LogEntry({ text, index }: { text: string; index: number }) {
  if (isMarkdown(text)) {
    return (
      <div key={index} className="text-green-400 mb-2 prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div key={index} className="text-green-400 mb-1">
      {text}
    </div>
  );
}

export function SocialMediaFlow() {
  const [isRunning, setIsRunning] = useState(false)
  const [stages, setStages] = useState<WorkflowStage[]>([
    { id: 1, name: 'Stage 1: Campaign Planning', status: 'idle', message: '' },
    { id: 2, name: 'Stage 2: Content Generation', status: 'idle', message: '' },
    { id: 3, name: 'Stage 3: Visual Assets', status: 'idle', message: '' },
    { id: 4, name: 'Stage 4: Video Production', status: 'idle', message: '' },
    { id: 5, name: 'Stage 5: Publishing', status: 'idle', message: '' },
    { id: 6, name: 'Stage 6: Analytics & Tracking', status: 'idle', message: '' },
  ])
  const [logs, setLogs] = useState<string[]>([])
  const [stageData, setStageData] = useState<Record<number, StageData>>({})
  const [campaignData, setCampaignData] = useState<CampaignData>({})
  const [executionMode, setExecutionMode] = useState<'full' | 'staged'>('full')
  const [executingStage, setExecutingStage] = useState<number | null>(null)
  const [expandedStage, setExpandedStage] = useState<number | null>(null)
  const [showDataModal, setShowDataModal] = useState(false)
  const [selectedStageData, setSelectedStageData] = useState<{ stageId: number; stageName: string; data: any; dataId: string } | null>(null)

  // Campaign configuration
  const [campaignType, setCampaignType] = useState<string>('linkedin-testimonial')
  const [purpose, setPurpose] = useState<string>('brand-awareness')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin'])
  const [topic, setTopic] = useState<string>('')
  const [isGeneratingTopic, setIsGeneratingTopic] = useState<boolean>(false)
  const [topicError, setTopicError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number>(15)
  const [contentType, setContentType] = useState<'image' | 'faceless-video' | 'avatar-video'>('image')
  const [facelessVideoMode, setFacelessVideoMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video')
  const [imageSource, setImageSource] = useState<'generate' | 'upload'>('generate')
  const [useVeo, setUseVeo] = useState<boolean>(true)
  const [useAvatar, setUseAvatar] = useState<boolean>(true)
  const [autoPublish, setAutoPublish] = useState<boolean>(false)
  // Aspect ratio: For images (16:9, 9:16, 1:1), For videos (16:9, 9:16)
  const [aspectRatio, setAspectRatio] = useState<string>('16:9')
  const [targetAudience, setTargetAudience] = useState<string>('all_clients')
  const [language, setLanguage] = useState<string>('english')

  // Avatar Video Configuration
  const [avatarId, setAvatarId] = useState<string>('siddharth-vora')
  const [avatarScriptText, setAvatarScriptText] = useState<string>('')
  const [avatarVoiceId, setAvatarVoiceId] = useState<string>('')
  const [heygenAvatarGroupId, setHeygenAvatarGroupId] = useState<string | null>(null)
  const [heygenGroupAvatars, setHeygenGroupAvatars] = useState<Array<{ avatarId: string; name?: string | null }>>([])
  const [availableAvatars, setAvailableAvatars] = useState<Array<{
    id: string
    name: string
    groupId: string
    voiceId: string
    voiceName: string
    gender: string
    description: string
  }>>([])

  // Brand Guidelines
  const [showBrandGuidelines, setShowBrandGuidelines] = useState<boolean>(false)
  const [useBrandGuidelines, setUseBrandGuidelines] = useState<boolean>(true)
  const [customColors, setCustomColors] = useState<string>('')
  const [customTone, setCustomTone] = useState<string>('')
  const [customInstructions, setCustomInstructions] = useState<string>('')

  // Reference Materials
  const [showReferenceMaterials, setShowReferenceMaterials] = useState<boolean>(false)

  // Avatar Video Configuration
  const [showAvatarConfig, setShowAvatarConfig] = useState<boolean>(false)

  // Faceless Video Options
  const [showFacelessOptions, setShowFacelessOptions] = useState<boolean>(false)

  // File uploads
  const [researchPDFs, setResearchPDFs] = useState<File[]>([])
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [referenceVideo, setReferenceVideo] = useState<File[]>([])

  // Prompt editing
  const [showPromptEditor, setShowPromptEditor] = useState<boolean>(false)
  const [currentPrompt, setCurrentPrompt] = useState<string>('')
  const [promptStage, setPromptStage] = useState<number | null>(null)
  const [generatedPrompts, setGeneratedPrompts] = useState<Record<number, string>>({})

  // VEO 3.1 Frame Interpolation
  const [useFrameInterpolation, setUseFrameInterpolation] = useState<boolean>(false)
  const [firstFrameMode, setFirstFrameMode] = useState<'upload' | 'text-gemini' | 'text-imagen'>('text-gemini')
  const [lastFrameMode, setLastFrameMode] = useState<'upload' | 'text-gemini' | 'text-imagen'>('text-gemini')
  const [firstFrameImage, setFirstFrameImage] = useState<File[]>([])
  const [lastFrameImage, setLastFrameImage] = useState<File[]>([])
  const [firstFramePrompt, setFirstFramePrompt] = useState<string>('')
  const [lastFramePrompt, setLastFramePrompt] = useState<string>('')
  const [sceneExtensionCount, setSceneExtensionCount] = useState<number>(0)

  // LongCat Video Generation (for videos >148s up to 15 minutes)
  const [useLongCat, setUseLongCat] = useState<boolean>(false)
  const [longCatMode, setLongCatMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video')
  const [longCatPrompt, setLongCatPrompt] = useState<string>('')
  const [longCatReferenceImage, setLongCatReferenceImage] = useState<File[]>([])

  // Platform dropdown state
  const [showPlatformDropdown, setShowPlatformDropdown] = useState<boolean>(false)

  const campaignTypes = [
    { value: 'linkedin-carousel', label: 'LinkedIn Carousel', platforms: ['linkedin'] },
    { value: 'linkedin-testimonial', label: 'LinkedIn Testimonial', platforms: ['linkedin'] },
    { value: 'linkedin-data-viz', label: 'LinkedIn Data Viz', platforms: ['linkedin'] },
    { value: 'instagram-reel', label: 'Instagram Reel', platforms: ['instagram'] },
    { value: 'instagram-carousel', label: 'Instagram Carousel', platforms: ['instagram'] },
    { value: 'youtube-explainer', label: 'YouTube Explainer', platforms: ['youtube'] },
    { value: 'youtube-short', label: 'YouTube Short', platforms: ['youtube'] },
    { value: 'facebook-community', label: 'Facebook Community', platforms: ['facebook'] },
    { value: 'twitter-thread', label: 'Twitter Thread', platforms: ['twitter'] },
    { value: 'whatsapp-creative', label: 'WhatsApp Creative', platforms: ['whatsapp'] },
    { value: 'email-newsletter', label: 'Email Newsletter', platforms: ['email'] },
    { value: 'infographic', label: 'Infographic', platforms: ['linkedin', 'instagram', 'facebook', 'twitter'] },
  ]

  const purposeOptions = [
    // Products
    { value: 'falcon', label: 'Falcon', description: '5Lakh Min., Research Basket' },
    { value: 'aqua', label: 'AQUA', description: 'Quant Portfolio Strategy (1Cr+ clients)' },
    { value: 'madp', label: 'MADP', description: 'Multi-Asset Dynamic Portfolio (1Cr+ clients)' },
    { value: 'loan-tieups', label: 'Loan Tie ups', description: 'Loan Against Securities' },
    { value: 'scoutquest', label: 'Scoutquest', description: '45 days free, 24x7 alerts, track all stocks' },
    { value: 'mobile-app', label: 'Mobile App', description: 'Easy Options, Scanners, Algos, Research Baskets' },
    { value: 'open-account', label: 'Open Account in 5mins', description: 'Quick Account Opening (Lead Gen)' },
    { value: 'commodity-activation', label: 'Commodity Account Activation', description: 'Gold, Silver & Commodity Trading, Call and Trade Support' },
    { value: 'mtf-activation', label: 'MTF Account Activation', description: 'MTF Research Calls, Competitive ROI, 1000+ scrips, 4X multiplier' },
    { value: 'dormant-activation', label: 'Dormant Account Activation', description: 'MTF, Research and New App' },
    // Other
    { value: 'partners-mobile-app', label: 'Partners Mobile App', description: 'IFA/Partner Platform' },
    { value: 'website', label: 'Website', description: 'Corporate Website' },
    { value: 'web-app', label: 'Web App', description: 'Web Application' },
    { value: 'aif', label: 'AIF', description: 'Alternative Investment Fund' },
    { value: 'brand-awareness', label: 'Brand Awareness', description: 'General Brand Building' },
  ]

  const targetAudienceOptions = [
    // General Segments
    { value: 'all_clients', label: 'All', description: 'All clients' },
    { value: 'lead_gen', label: 'Lead Gen', description: 'New customer acquisition' },
    { value: 'internal', label: 'Internal communication', description: 'Employee communications, training' },
    { value: 'mass_affluent', label: 'Mass affluent', description: 'Emerging investors, young professionals' },
    { value: 'hni', label: 'HNIs', description: 'High Net Worth Individuals' },
    { value: 'uhni', label: 'UHNIs', description: 'Ultra High Net Worth Individuals' },
    // Client Segments by DP Value
    { value: 'more_than_10l_dp', label: 'More than 10L DP', description: 'Clients with 10L+ demat portfolio' },
    { value: '1cr_plus', label: '1cr+', description: 'Clients with 1 crore+ portfolio' },
    // Activity-based Segments
    { value: 'semi_active', label: 'Semi-active', description: 'Occasional trading activity' },
    { value: 'dormant', label: 'Dormant', description: 'No recent activity, needs reactivation' },
    { value: 'inactive', label: 'Inactive', description: 'Currently inactive accounts' },
    // Performance-based Segments
    { value: 'in_loss', label: 'In Loss', description: 'Clients currently in loss' },
    // Product-based Segments
    { value: 'fno_traders', label: 'F&O traders', description: 'Futures & Options active traders' },
    { value: 'commodity', label: 'Commodity', description: 'Commodity trading clients' },
    { value: 'non_mtf', label: 'Non-MTF', description: 'Clients not using Margin Trading' },
    { value: 'cash', label: 'Cash', description: 'Cash segment traders' },
  ]

  const platforms = [
    { value: 'linkedin', label: 'LinkedIn', color: 'bg-blue-500' },
    { value: 'instagram', label: 'Instagram', color: 'bg-pink-500' },
    { value: 'youtube', label: 'YouTube', color: 'bg-red-500' },
    { value: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
    { value: 'twitter', label: 'Twitter/X', color: 'bg-sky-500' },
    { value: 'whatsapp', label: 'WhatsApp', color: 'bg-green-500' },
    { value: 'email', label: 'Email', color: 'bg-gray-600' },
  ]

  const languages = [
    { value: 'english', label: 'English', native: 'English' },
    { value: 'hinglish', label: 'Hinglish', native: 'Hinglish' },
    { value: 'hindi', label: 'Hindi', native: 'हिंदी' },
    { value: 'bengali', label: 'Bengali', native: 'বাংলা' },
    { value: 'telugu', label: 'Telugu', native: 'తెలుగు' },
    { value: 'marathi', label: 'Marathi', native: 'मराठी' },
    { value: 'tamil', label: 'Tamil', native: 'தமிழ்' },
    { value: 'gujarati', label: 'Gujarati', native: 'ગુજરાતી' },
    { value: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ' },
    { value: 'malayalam', label: 'Malayalam', native: 'മലയാളം' },
    { value: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ]

  const HEYGEN_GROUPS = {
    indianMale: 'c2d73a2a1707469c852206165ede3fb2',
    indianFemale: '2c43461ac14846ef973be96e81c49ca3',
    male2: '1185d8e89e7b4fe6a577343bbfd1bb0e',
    male3: '3802eae40be249198de20e64662259b6',
    female3: 'a761ce70b43447ab8383684d98afcf22',
  } as const

  // Load available avatars on component mount
  useEffect(() => {
    const loadAvatars = async () => {
      try {
        const response = await fetch('/api/avatars')
        if (response.ok) {
          const data = await response.json()
          setAvailableAvatars(data.avatars || [])
        }
      } catch (error) {
        console.error('Failed to load avatars:', error)
      }
    }
    loadAvatars()
  }, [])

  const loadHeyGenAvatarGroup = async (groupId: string) => {
    try {
      const response = await fetch(`/api/heygen/avatar-group/${groupId}`)
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Failed to load HeyGen avatar group (${response.status})`)
      }

      const data = await response.json()
      const avatars = Array.isArray(data?.avatars) ? data.avatars : []
      setHeygenGroupAvatars(avatars)
      return avatars
    } catch (error) {
      console.error('Failed to load HeyGen avatar group:', error)
      setHeygenGroupAvatars([])
      return []
    }
  }

  const getHeyGenGroupLabel = (groupId: string | null) => {
    if (!groupId) return 'Group'
    if (groupId === HEYGEN_GROUPS.indianMale) return 'Indian Male'
    if (groupId === HEYGEN_GROUPS.indianFemale) return 'Indian Female'
    if (groupId === HEYGEN_GROUPS.male2) return 'Male 2'
    if (groupId === HEYGEN_GROUPS.male3) return 'Male 3'
    if (groupId === HEYGEN_GROUPS.female3) return 'Female 3'
    return 'Group'
  }

  const parseHeyGenSelection = (value: string) => {
    const trimmed = (value || '').trim()
    if (trimmed.startsWith('heygen-group:')) {
      return { kind: 'group' as const, groupId: trimmed.slice('heygen-group:'.length) }
    }
    if (trimmed.startsWith('heygen-avatar:')) {
      const parts = trimmed.split(':')
      return {
        kind: 'avatar' as const,
        groupId: parts[1] || '',
        avatarId: parts[2] || ''
      }
    }
    return { kind: 'other' as const }
  }

  const isHeyGenSelection = avatarId.startsWith('heygen-group:') || avatarId.startsWith('heygen-avatar:')

  const resolvedAvatarIdForBackend = () => {
    const parsed = parseHeyGenSelection(avatarId)
    if (parsed.kind === 'avatar') return parsed.avatarId || ''
    if (parsed.kind === 'group') return ''
    return avatarId
  }

  const updateStage = async (stageId: number, status: WorkflowStage['status'], message: string) => {
    setStages(prev => prev.map(stage =>
      stage.id === stageId ? { ...stage, status, message } : stage
    ))

    if (status === 'completed') {
      try {
        const response = await fetch(`/api/workflow/social-media/data?stage=${stageId}`)
        if (response.ok) {
          const data = await response.json()
          setStageData(prev => ({ ...prev, [stageId]: data }))
        }
      } catch (error) {
        console.error(`Failed to fetch data for stage ${stageId}:`, error)
      }
    }
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const executeStage = async (stageId: number) => {
    if (contentType === 'avatar-video' && isHeyGenSelection && !resolvedAvatarIdForBackend()) {
      addLog('⚠️ Please select a HeyGen avatar look before executing.')
      return
    }

    setExecutingStage(stageId)
    addLog(`Starting Stage ${stageId} execution...`)
    let stageHadError = false

    try {
      // Prepare file data
      addLog('Preparing reference materials...')
      const fileData = await prepareFilesForAPI()

      const response = await fetch('/api/workflow/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          campaignType,
          purpose,
          platforms: selectedPlatforms,
          topic,
          duration,
          contentType,
          useVeo,
          useAvatar,
          autoPublish,
          targetAudience,
          language,
          campaignData,
          files: fileData,
          avatarId: resolvedAvatarIdForBackend(),
          avatarScriptText,
          avatarVoiceId,
          heygenAvatarGroupId,
          brandSettings: {
            useBrandGuidelines,
            customColors: useBrandGuidelines ? null : customColors,
            customTone: useBrandGuidelines ? null : customTone,
            customInstructions: useBrandGuidelines ? null : customInstructions
          },
          promptOverride: generatedPrompts[stageId] || null,
          frameInterpolation: useVeo && useFrameInterpolation ? {
            enabled: true,
            sceneExtensionCount,
            firstFrame: {
              mode: firstFrameMode,
              prompt: firstFrameMode !== 'upload' ? firstFramePrompt : null
            },
            lastFrame: {
              mode: lastFrameMode,
              prompt: lastFrameMode !== 'upload' ? lastFramePrompt : null
            }
          } : null,
          longCatConfig: useLongCat ? {
            enabled: true,
            mode: longCatMode,
            prompt: longCatPrompt,
            duration: duration
          } : null
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.stage) {
                  const normalizedStageId = Number(data.stage)
                  await updateStage(normalizedStageId, data.status, data.message)
                  addLog(`Stage ${normalizedStageId}: ${data.message}`)
                  if (normalizedStageId === stageId && data.status === 'error') {
                    stageHadError = true
                  }
                } else if (data.log) {
                  addLog(data.log)
                } else if (data.campaignData) {
                  setCampaignData(prev => ({ ...prev, ...data.campaignData }))
                }
              } catch (e) {
                console.error('Parse error:', e)
              }
            }
          }
        }
      }

      if (!stageHadError) {
        addLog(`Stage ${stageId} completed!`)
      }
    } catch (error) {
      addLog(`Error in Stage ${stageId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Stage error:', error)
    } finally {
      setExecutingStage(null)
    }
  }

  const executeWorkflow = async () => {
    if (contentType === 'avatar-video' && isHeyGenSelection && !resolvedAvatarIdForBackend()) {
      addLog('⚠️ Please select a HeyGen avatar look before executing.')
      return
    }

    setIsRunning(true)
    setLogs([])
    setStageData({})
    setCampaignData({})
    setStages(stages.map(s => ({ ...s, status: 'idle', message: '' })))

    try {
      addLog('Starting full workflow execution...')

      // Prepare file data
      addLog('Preparing reference materials...')
      const fileData = await prepareFilesForAPI()

      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignType,
          purpose,
          platforms: selectedPlatforms,
          topic,
          duration,
          contentType,
          useVeo,
          useAvatar,
          autoPublish,
          targetAudience,
          language,
          aspectRatio,
          files: fileData,
          avatarId: resolvedAvatarIdForBackend(),
          avatarScriptText,
          avatarVoiceId,
          heygenAvatarGroupId,
          brandSettings: {
            useBrandGuidelines,
            customColors: useBrandGuidelines ? null : customColors,
            customTone: useBrandGuidelines ? null : customTone,
            customInstructions: useBrandGuidelines ? null : customInstructions
          },
          frameInterpolation: useVeo && useFrameInterpolation ? {
            enabled: true,
            sceneExtensionCount,
            firstFrame: {
              mode: firstFrameMode,
              prompt: firstFrameMode !== 'upload' ? firstFramePrompt : null
            },
            lastFrame: {
              mode: lastFrameMode,
              prompt: lastFrameMode !== 'upload' ? lastFramePrompt : null
            }
          } : null,
          longCatConfig: useLongCat ? {
            enabled: true,
            mode: longCatMode,
            prompt: longCatPrompt,
            duration: duration
          } : null
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.stage) {
                  const normalizedStageId = Number(data.stage)
                  updateStage(normalizedStageId, data.status, data.message)
                  addLog(`Stage ${normalizedStageId}: ${data.message}`)
                } else if (data.log) {
                  addLog(data.log)
                } else if (data.campaignData) {
                  setCampaignData(prev => ({ ...prev, ...data.campaignData }))
                }
              } catch (e) {
                console.error('Parse error:', e)
              }
            }
          }
        }
      }

      addLog('Workflow completed successfully!')
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Workflow error:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const getStatusIcon = (status: WorkflowStage['status']) => {
    switch (status) {
      case 'idle': return '⚪'
      case 'running': return '🔵'
      case 'completed': return '✅'
      case 'error': return '❌'
    }
  }

  const getStatusColor = (status: WorkflowStage['status']) => {
    switch (status) {
      case 'idle': return 'text-gray-400'
      case 'running': return 'text-blue-500 animate-pulse'
      case 'completed': return 'text-green-500'
      case 'error': return 'text-red-500'
    }
  }

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    )
  }

  const generateTopic = async () => {
    if (isRunning || executingStage !== null || isGeneratingTopic) return

    try {
      setIsGeneratingTopic(true)
      setTopicError(null)
      addLog('Generating campaign topic with Gemini 3 Pro Preview...')

      const campaignTypeMeta = campaignTypes.find(c => c.value === campaignType)
      const purposeMeta = purposeOptions.find(p => p.value === purpose)
      const targetAudienceMeta = targetAudienceOptions.find(a => a.value === targetAudience)

      const response = await fetch('/api/topic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignType,
          campaignTypeLabel: campaignTypeMeta?.label,
          purpose,
          purposeLabel: purposeMeta?.label,
          purposeDescription: purposeMeta?.description,
          targetAudience,
          targetAudienceLabel: targetAudienceMeta?.label,
          targetAudienceDescription: targetAudienceMeta?.description,
          platforms: selectedPlatforms,
          language
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to generate topic')
      }

      const data = await response.json()
      if (data.topic) {
        setTopic(data.topic)
        addLog(`Topic generated (${data.model || 'Gemini'}): ${data.topic}`)
      } else {
        throw new Error('No topic returned from generator')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setTopicError(message)
      addLog(`Topic generation failed: ${message}`)
    } finally {
      setIsGeneratingTopic(false)
    }
  }

  // Convert files to base64 for API transmission
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  const prepareFilesForAPI = async () => {
    const fileData: {
      researchPDFs?: Array<{ name: string; data: string; size: number }>
      referenceImages?: Array<{ name: string; data: string; size: number }>
      referenceVideo?: { name: string; data: string; size: number }
      firstFrameImage?: { name: string; data: string; size: number }
      lastFrameImage?: { name: string; data: string; size: number }
      longCatReferenceImage?: { name: string; data: string; size: number }
    } = {}

    // Convert PDFs
    if (researchPDFs.length > 0) {
      fileData.researchPDFs = await Promise.all(
        researchPDFs.map(async (file) => ({
          name: file.name,
          data: await fileToBase64(file),
          size: file.size
        }))
      )
    }

    // Convert reference images
    if (referenceImages.length > 0) {
      fileData.referenceImages = await Promise.all(
        referenceImages.map(async (file) => ({
          name: file.name,
          data: await fileToBase64(file),
          size: file.size
        }))
      )
    }

    // Convert reference video
    if (referenceVideo.length > 0) {
      const video = referenceVideo[0]
      fileData.referenceVideo = {
        name: video.name,
        data: await fileToBase64(video),
        size: video.size
      }
    }

    // Convert first frame image (if upload mode)
    if (useFrameInterpolation && firstFrameMode === 'upload' && firstFrameImage.length > 0) {
      const image = firstFrameImage[0]
      fileData.firstFrameImage = {
        name: image.name,
        data: await fileToBase64(image),
        size: image.size
      }
    }

    // Convert last frame image (if upload mode)
    if (useFrameInterpolation && lastFrameMode === 'upload' && lastFrameImage.length > 0) {
      const image = lastFrameImage[0]
      fileData.lastFrameImage = {
        name: image.name,
        data: await fileToBase64(image),
        size: image.size
      }
    }

    // Convert LongCat reference image (if image-to-video mode)
    if (useLongCat && longCatMode === 'image-to-video' && longCatReferenceImage.length > 0) {
      const image = longCatReferenceImage[0]
      fileData.longCatReferenceImage = {
        name: image.name,
        data: await fileToBase64(image),
        size: image.size
      }
    }

    return fileData
  }

  // Prompt editing handlers
  const handleEditPrompt = (stageId: number, stageName: string, prompt: string) => {
    setPromptStage(stageId)
    setCurrentPrompt(prompt)
    setShowPromptEditor(true)
  }

  const handleSavePrompt = (editedPrompt: string) => {
    if (promptStage) {
      setGeneratedPrompts(prev => ({ ...prev, [promptStage]: editedPrompt }))
      addLog(`Prompt updated for Stage ${promptStage}`)
    }
    setShowPromptEditor(false)
    setCurrentPrompt('')
    setPromptStage(null)
  }

  const handleCancelPrompt = () => {
    setShowPromptEditor(false)
    setCurrentPrompt('')
    setPromptStage(null)
  }

  // Stage data modal handlers
  const handleViewData = (stageId: number, stageName: string) => {
    if (typeof window !== 'undefined') {
      console.log('[AI Content] View & Edit Data clicked', {
        stageId,
        stageName,
        rawStageData: stageData[stageId]
      })
    }

    if (stageData[stageId]?.data) {
      // Extract all data entries and sort by completedAt to get the most recent
      const dataEntries = Object.entries(stageData[stageId].data)
      if (typeof window !== 'undefined') {
        console.log('[AI Content] Available data entries for modal', {
          count: dataEntries.length,
          keys: dataEntries.map(([id]) => id),
          sample: dataEntries[0]?.[1]
        })
      }

      if (dataEntries.length > 0) {
        // Sort by completedAt timestamp (most recent first)
        const sortedEntries = dataEntries.sort((a: any, b: any) => {
          const timeA = new Date(a[1].completedAt || a[1].createdAt || 0).getTime()
          const timeB = new Date(b[1].completedAt || b[1].createdAt || 0).getTime()
          return timeB - timeA // Descending order (newest first)
        })

        const [dataId, data] = sortedEntries[0]

        if (typeof window !== 'undefined') {
          console.log('[AI Content] Opening StageDataModal with payload', {
            dataId,
            dataKeys: Object.keys(data || {}),
            dataPreview: data
          })
        }

        setSelectedStageData({ stageId, stageName, data, dataId })
        setShowDataModal(true)
      } else if (typeof window !== 'undefined') {
        console.warn('[AI Content] handleViewData: no data entries found for stage', stageId)
      }
    } else if (typeof window !== 'undefined') {
      console.warn('[AI Content] handleViewData: no stageData found for stage', stageId)
    }
  }

  const handleSaveStageData = async (stageId: number, editedData: any) => {
    if (!selectedStageData) return

    const response = await fetch('/api/workflow/social-media/data/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stageId,
        dataId: selectedStageData.dataId,
        editedData
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to save data')
    }

    // Refresh stage data
    const dataResponse = await fetch(`/api/workflow/social-media/data?stage=${stageId}`)
    if (dataResponse.ok) {
      const data = await dataResponse.json()
      setStageData(prev => ({ ...prev, [stageId]: data }))
    }

    addLog(`Stage ${stageId} data updated successfully`)
  }

  const handleCloseModal = () => {
    setShowDataModal(false)
    setSelectedStageData(null)
  }

  // Calculate scene extension count for VEO 3.1
  const calculateSceneExtensions = (targetDuration: number): number => {
    // VEO 3.1 generates 8s initial video
    // Each extension adds 7s (max 20 extensions = 148s total)
    if (targetDuration <= 8) return 0
    const remainingSeconds = targetDuration - 8
    const extensionsNeeded = Math.ceil(remainingSeconds / 7)
    return Math.min(extensionsNeeded, 20) // Max 20 extensions (148s limit)
  }

  // Update scene extension count when duration changes
  const handleDurationChange = (newDuration: number) => {
    setDuration(newDuration)

    // Auto-switch to LongCat for videos >148s
    if (newDuration > 148) {
      setUseLongCat(true)
      setUseVeo(false)
      setSceneExtensionCount(0)
    } else if (useVeo) {
      setSceneExtensionCount(calculateSceneExtensions(newDuration))
      setUseLongCat(false)
    }
  }

  // Handle model selection (VEO vs LongCat)
  const handleModelChange = (model: 'veo' | 'longcat') => {
    if (model === 'veo') {
      setUseVeo(true)
      setUseLongCat(false)
      // Cap duration at 148s for VEO
      if (duration > 148) {
        setDuration(148)
      }
      setSceneExtensionCount(calculateSceneExtensions(Math.min(duration, 148)))
    } else {
      setUseLongCat(true)
      setUseVeo(false)
      setSceneExtensionCount(0)
      // Set minimum to 180s for LongCat
      if (duration <= 148) {
        setDuration(180)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8 text-center">
          <h1 className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2 uppercase">
            AI Content
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            AI-Powered Multi-Platform Campaign Automation
          </p>
        </div>

        {/* Main Control Panel */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            Campaign Configuration
          </h2>

          {/* Execution Mode Toggle */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Execution Mode:
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setExecutionMode('full')}
                disabled={isRunning || executingStage !== null}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                  executionMode === 'full'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div>Full Campaign</div>
                <p className="text-xs mt-1 opacity-80">Execute all 6 stages automatically</p>
              </button>
              <button
                onClick={() => setExecutionMode('staged')}
                disabled={isRunning || executingStage !== null}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                  executionMode === 'staged'
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div>Stage-by-Stage</div>
                <p className="text-xs mt-1 opacity-80">Review and approve each stage</p>
              </button>
            </div>
          </div>

          {/* Campaign Configuration Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Campaign Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Type:
              </label>
              <select
                value={campaignType}
                onChange={(e) => {
                  const next = e.target.value
                  setCampaignType(next)
                  // Auto-set contentType to 'image' for infographic campaigns
                  if (next === 'infographic') {
                    setContentType('image')
                    setAspectRatio('4:5')
                  }
                  // Instagram Reels defaults: vertical video
                  if (next === 'instagram-reel') {
                    setAspectRatio('9:16')
                  }
                  // YouTube Shorts defaults: vertical video
                  if (next === 'youtube-short') {
                    setAspectRatio('9:16')
                  }
                  // LinkedIn Carousel defaults: square slides
                  if (next === 'linkedin-carousel') {
                    setAspectRatio('1:1')
                  }
                  // Instagram Carousel defaults: square slides
                  if (next === 'instagram-carousel') {
                    setAspectRatio('1:1')
                  }
                }}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {campaignTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Purpose Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Purpose:
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {purposeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Audience Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Audience:
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {targetAudienceOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Topic and Platform Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Campaign Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Topic:
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value)
                    if (topicError) {
                      setTopicError(null)
                    }
                  }}
                  disabled={isRunning || executingStage !== null}
                  placeholder="e.g., Client Success: ₹50L to ₹2Cr in 5 years"
                  className="w-full pr-[120px] px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={generateTopic}
                  disabled={isRunning || executingStage !== null || isGeneratingTopic}
                  className={`absolute right-2 whitespace-nowrap px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    isRunning || executingStage !== null
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  } ${isGeneratingTopic ? 'opacity-80 cursor-wait' : ''}`}
                >
                  {isGeneratingTopic ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {topicError && (
                <p className="text-xs text-red-600 mt-2">
                  {topicError}
                </p>
              )}
            </div>

            {/* Platform Multi-Selector Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Platforms:
              </label>
              <div
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 cursor-pointer bg-white text-sm text-gray-800 flex items-center justify-between"
              >
                <span>
                  {selectedPlatforms.length === 0
                    ? 'Select platforms...'
                    : `${selectedPlatforms.length} selected (${selectedPlatforms.join(', ')})`}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${showPlatformDropdown ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {showPlatformDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {platforms.map(platform => (
                    <label
                      key={platform.value}
                      className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(platform.value)}
                        onChange={() => togglePlatform(platform.value)}
                        className="mr-3 w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-800">{platform.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content Language Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Language:
            </label>
            <div className="max-w-xs">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {languages.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label} ({lang.native})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Content and videos will be created in the selected language
            </p>
          </div>

          {/* Output Format Type Selector */}
          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Output Format Type
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setContentType('image')}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'image'
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Static Image</div>
                <p className="text-xs opacity-80">Generate single image</p>
              </button>

              <button
                onClick={() => {
                  setContentType('faceless-video')
                  setUseAvatar(false)
                  // Reset to video aspect ratio if current is image-only
                  if (aspectRatio === '1:1') {
                    setAspectRatio('16:9')
                  }
                }}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'faceless-video'
                    ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-purple-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Faceless Video</div>
                <p className="text-xs opacity-80">AI video generation</p>
              </button>

              <button
                onClick={() => {
                  setContentType('avatar-video')
                  setUseAvatar(true)
                  // Reset to video aspect ratio if current is image-only
                  if (aspectRatio === '1:1') {
                    setAspectRatio('16:9')
                  }
                }}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'avatar-video'
                    ? 'bg-green-500 text-white border-green-500 shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-green-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Avatar Video</div>
                <p className="text-xs opacity-80">AI Avatar</p>
              </button>
            </div>
          </div>

          {/* Aspect Ratio Selection */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Aspect Ratio
            </label>
            {contentType === 'image' ? (
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '16:9'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">16:9</div>
                  <p className="text-xs opacity-80">Horizontal</p>
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '9:16'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">9:16</div>
                  <p className="text-xs opacity-80">Vertical</p>
                </button>
                <button
                  onClick={() => setAspectRatio('1:1')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '1:1'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">1:1</div>
                  <p className="text-xs opacity-80">Square</p>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '16:9'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">16:9</div>
                  <p className="text-xs opacity-80">Landscape</p>
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '9:16'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">9:16</div>
                  <p className="text-xs opacity-80">Portrait</p>
                </button>
              </div>
            )}
          </div>

          {/* Conditional sections based on contentType */}
          {contentType === 'faceless-video' && (
            <>
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => setShowFacelessOptions(!showFacelessOptions)}
                      className="text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${showFacelessOptions ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <h3 className="text-md font-semibold text-gray-800">
                      Faceless Video Options
                    </h3>
                  </div>
                </div>

                {showFacelessOptions && (
                  <div className="space-y-4 mt-4 pt-4 border-t border-blue-200">
                {/* Video Duration */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Duration: {duration} seconds
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="900"
                    step="1"
                    value={duration}
                    onChange={(e) => handleDurationChange(Number(e.target.value))}
                    disabled={isRunning || executingStage !== null}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>8s (min)</span>
                    <span>148s (Standard)</span>
                    <span>900s (15 min, Extended)</span>
                  </div>
                </div>

                {/* Model Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Duration Mode:
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleModelChange('veo')}
                      disabled={isRunning || executingStage !== null}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        useVeo
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div>Standard Duration</div>
                      <div className="text-xs font-normal opacity-80 mt-1">Up to 148s, High Quality</div>
                    </button>

                    <button
                      onClick={() => handleModelChange('longcat')}
                      disabled={isRunning || executingStage !== null}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        useLongCat
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div>Extended Duration</div>
                      <div className="text-xs font-normal opacity-80 mt-1">149s to 15 min</div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    onClick={() => setFacelessVideoMode('text-to-video')}
                    disabled={isRunning || executingStage !== null}
                    className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                      facelessVideoMode === 'text-to-video'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div>Text-to-Video</div>
                    <div className="text-xs font-normal opacity-80 mt-1">Direct generation</div>
                  </button>

                  <button
                    onClick={() => setFacelessVideoMode('image-to-video')}
                    disabled={isRunning || executingStage !== null}
                    className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                      facelessVideoMode === 'image-to-video'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div>Image-to-Video</div>
                    <div className="text-xs font-normal opacity-80 mt-1">Animate from image</div>
                  </button>
                </div>

                {facelessVideoMode === 'image-to-video' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Image Source:
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setImageSource('generate')}
                        disabled={isRunning || executingStage !== null}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          imageSource === 'generate'
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-green-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Generate Image
                      </button>

                      <button
                        onClick={() => setImageSource('upload')}
                        disabled={isRunning || executingStage !== null}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          imageSource === 'upload'
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-green-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Upload Image
                      </button>
                    </div>
                  </div>
                )}
                  </div>
                )}
              </div>

              {/* VEO 3.1 Frame Interpolation */}
              {useVeo && (
                <div className="mb-6 p-6 bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg border-2 border-cyan-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-semibold text-gray-800">
                      Advanced Frame Controls
                    </h3>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useFrameInterpolation}
                        onChange={(e) => setUseFrameInterpolation(e.target.checked)}
                        disabled={isRunning || executingStage !== null}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-700">
                        Use Frame Interpolation
                      </span>
                    </label>
                  </div>

                  {useFrameInterpolation && (
                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
                        <p className="text-xs text-gray-600 mb-3">
                          Scene Extensions: {sceneExtensionCount} (Total: {8 + sceneExtensionCount * 7}s)
                        </p>

                        {/* First Frame */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            First Frame:
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => setFirstFrameMode('upload')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'upload'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Upload
                            </button>
                            <button
                              onClick={() => setFirstFrameMode('text-gemini')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'text-gemini'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 1)
                            </button>
                            <button
                              onClick={() => setFirstFrameMode('text-imagen')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'text-imagen'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 2)
                            </button>
                          </div>

                          {firstFrameMode === 'upload' ? (
                            <FileUpload
                              fileType="image"
                              label="Upload First Frame Image"
                              accept="image/*"
                              onFilesChange={setFirstFrameImage}
                              maxFiles={1}
                              multiple={false}
                              disabled={isRunning || executingStage !== null}
                            />
                          ) : (
                            <textarea
                              value={firstFramePrompt}
                              onChange={(e) => setFirstFramePrompt(e.target.value)}
                              placeholder="Describe the first frame..."
                              rows={2}
                              disabled={isRunning || executingStage !== null}
                              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          )}
                        </div>

                        {/* Last Frame */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Last Frame:
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => setLastFrameMode('upload')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'upload'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Upload
                            </button>
                            <button
                              onClick={() => setLastFrameMode('text-gemini')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'text-gemini'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 1)
                            </button>
                            <button
                              onClick={() => setLastFrameMode('text-imagen')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'text-imagen'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 2)
                            </button>
                          </div>

                          {lastFrameMode === 'upload' ? (
                            <FileUpload
                              fileType="image"
                              label="Upload Last Frame Image"
                              accept="image/*"
                              onFilesChange={setLastFrameImage}
                              maxFiles={1}
                              multiple={false}
                              disabled={isRunning || executingStage !== null}
                            />
                          ) : (
                            <textarea
                              value={lastFramePrompt}
                              onChange={(e) => setLastFramePrompt(e.target.value)}
                              placeholder="Describe the last frame..."
                              rows={2}
                              disabled={isRunning || executingStage !== null}
                              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LongCat Configuration */}
              {useLongCat && (
                <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                  <h3 className="text-md font-semibold text-gray-800 mb-4">
                    Extended Video Configuration
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Video Mode:
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setLongCatMode('text-to-video')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                            longCatMode === 'text-to-video'
                              ? 'bg-purple-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Text-to-Video
                        </button>
                        <button
                          onClick={() => setLongCatMode('image-to-video')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                            longCatMode === 'image-to-video'
                              ? 'bg-purple-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Image-to-Video
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Video Prompt:
                      </label>
                      <textarea
                        value={longCatPrompt}
                        onChange={(e) => setLongCatPrompt(e.target.value)}
                        placeholder="Describe your long-form video..."
                        rows={3}
                        disabled={isRunning || executingStage !== null}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {longCatMode === 'image-to-video' && (
                      <div>
                        <FileUpload
                          fileType="image"
                          label="Reference Image"
                          accept="image/*"
                          onFilesChange={setLongCatReferenceImage}
                          maxFiles={1}
                          multiple={false}
                          disabled={isRunning || executingStage !== null}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Avatar Video Configuration */}
          {contentType === 'avatar-video' && (
            <div className="mb-6 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => setShowAvatarConfig(!showAvatarConfig)}
                    className="text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    <svg
                      className={`w-5 h-5 transition-transform ${showAvatarConfig ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <h3 className="text-md font-semibold text-gray-800">
                    Avatar Video Configuration
                  </h3>
                </div>
              </div>

              {showAvatarConfig && (
                <div className="space-y-4 mt-4 pt-4 border-t border-green-200">
                {/* Avatar Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Avatar:
                  </label>
                  <select
                    value={avatarId}
                    onChange={async (e) => {
                      const value = e.target.value
                      setAvatarId(value)

                      const parsed = parseHeyGenSelection(value)

                      if (parsed.kind === 'group') {
                        const groupId = parsed.groupId
                        setHeygenAvatarGroupId(groupId)
                        const avatars = await loadHeyGenAvatarGroup(groupId)
                        const firstAvatarId = avatars[0]?.avatarId
                        if (firstAvatarId) {
                          setAvatarId(`heygen-avatar:${groupId}:${firstAvatarId}`)
                        }
                        return
                      }

                      if (parsed.kind === 'avatar') {
                        const groupId = parsed.groupId
                        if (groupId && groupId !== heygenAvatarGroupId) {
                          setHeygenAvatarGroupId(groupId)
                          await loadHeyGenAvatarGroup(groupId)
                        }
                        return
                      }

                      setHeygenAvatarGroupId(null)
                      setHeygenGroupAvatars([])

                      // Auto-set voice ID when avatar changes (config-driven avatars)
                      const selectedAvatar = availableAvatars.find(a => a.groupId === value)
                      if (selectedAvatar) setAvatarVoiceId(selectedAvatar.voiceId)
                    }}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="siddharth-vora">Siddharth Vora (HeyGen Custom Avatar)</option>
                    <option value={`heygen-group:${HEYGEN_GROUPS.indianMale}`}>Indian Male (HeyGen)</option>
                    <option value={`heygen-group:${HEYGEN_GROUPS.indianFemale}`}>Indian Female (HeyGen)</option>
                    <option value={`heygen-group:${HEYGEN_GROUPS.male2}`}>Male 2 (HeyGen)</option>
                    <option value={`heygen-group:${HEYGEN_GROUPS.male3}`}>Male 3 (HeyGen)</option>
                    <option value={`heygen-group:${HEYGEN_GROUPS.female3}`}>Female 3 (HeyGen)</option>
                    {heygenAvatarGroupId && heygenGroupAvatars.length > 0 && (
                      <optgroup
                        label={`HeyGen Looks (${getHeyGenGroupLabel(heygenAvatarGroupId)})`}
                      >
                        {heygenGroupAvatars.map((a, idx) => (
                          <option key={a.avatarId} value={`heygen-avatar:${heygenAvatarGroupId}:${a.avatarId}`}>
                            {a.name ? a.name : `Look ${idx + 1}`} ({a.avatarId.slice(0, 8)}…)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {availableAvatars.map((avatar) => (
                      <option key={avatar.groupId} value={avatar.groupId}>
                        {avatar.name} ({avatar.gender === 'male' ? 'Male' : 'Female'}) - {avatar.voiceName}
                      </option>
                    ))}
                    {availableAvatars.length === 0 && (
                      <>
                        <option value="generic-indian-male">Generic Indian Male (VEO)</option>
                        <option value="generic-indian-female">Generic Indian Female (VEO)</option>
                      </>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {avatarId === 'siddharth-vora'
                      ? 'Using HeyGen custom avatar for Siddharth Vora, Fund Manager at PL Capital'
                      : avatarId.startsWith('heygen-avatar:') && resolvedAvatarIdForBackend()
                      ? `Using HeyGen avatar look: ${resolvedAvatarIdForBackend().slice(0, 8)}…`
                      : availableAvatars.find(a => a.groupId === avatarId)
                      ? `Using ${availableAvatars.find(a => a.groupId === avatarId)?.name} avatar with ${availableAvatars.find(a => a.groupId === avatarId)?.voiceName} voice`
                      : 'Using VEO-generated avatar'}
                  </p>
                </div>

                {/* Script Text (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Script (optional):
                  </label>
                  <textarea
                    value={avatarScriptText}
                    onChange={(e) => setAvatarScriptText(e.target.value)}
                    placeholder="Leave empty to auto-generate based on campaign topic and purpose..."
                    rows={4}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If left empty, AI will generate a contextually appropriate script based on your campaign configuration
                  </p>
                </div>

                {/* Video Duration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Duration: {duration} seconds
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="300"
                    step="5"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    disabled={isRunning || executingStage !== null}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>8s</span>
                    <span>300s (5 min)</span>
                  </div>
                </div>
                </div>
              )}
            </div>
          )}

          {/* Reference Materials Section - Collapsible for all content types */}
          <div className="mb-6 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border-2 border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setShowReferenceMaterials(!showReferenceMaterials)}
                  className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${showReferenceMaterials ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <h3 className="text-md font-semibold text-gray-800">
                  Reference Materials (Optional)
                </h3>
              </div>
            </div>

            {showReferenceMaterials && (
              <div className="space-y-4 mt-4 pt-4 border-t border-amber-200">
                {/* Research PDFs */}
                <FileUpload
                  fileType="pdf"
                  label="Research PDFs"
                  accept=".pdf"
                  onFilesChange={setResearchPDFs}
                  maxFiles={5}
                  multiple={true}
                  disabled={isRunning || executingStage !== null}
                />

                {/* Reference Images */}
                <FileUpload
                  fileType="image"
                  label="Reference Images"
                  accept="image/*"
                  onFilesChange={setReferenceImages}
                  maxFiles={10}
                  multiple={true}
                  disabled={isRunning || executingStage !== null}
                />

                {/* Reference Video */}
                <FileUpload
                  fileType="video"
                  label="Reference Video"
                  accept="video/*"
                  onFilesChange={setReferenceVideo}
                  maxFiles={1}
                  multiple={false}
                  disabled={isRunning || executingStage !== null}
                />

                <p className="text-xs text-gray-600 mt-2">
                  Upload reference materials to guide content generation. These files will be analyzed by AI to understand your style and preferences.
                </p>
              </div>
            )}
          </div>

          {/* Auto-Publish Toggle */}
          <div className="mb-6 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border-2 border-teal-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-semibold text-gray-800">
                  Auto-Publish
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  Automatically publish content to selected platforms after generation
                </p>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  disabled={isRunning || executingStage !== null}
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 disabled:cursor-not-allowed"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Enable Auto-Publish
                </span>
              </label>
            </div>
          </div>

          {/* Brand Guidelines Section - Collapsed by default */}
          <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setShowBrandGuidelines(!showBrandGuidelines)}
                  className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${showBrandGuidelines ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <h3 className="text-md font-semibold text-gray-800">
                  Brand Guidelines
                </h3>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBrandGuidelines}
                  onChange={(e) => setUseBrandGuidelines(e.target.checked)}
                  disabled={isRunning || executingStage !== null}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Use PL Capital Brand Guidelines
                </span>
              </label>
            </div>

            {showBrandGuidelines && (
              <div className="mt-4 pt-4 border-t border-indigo-200">
                {useBrandGuidelines ? (
                  <div className="bg-white rounded-lg p-4 border-2 border-green-300">
                    <p className="text-sm font-semibold text-green-700 mb-2">
                      PL Capital Brand Guidelines Active
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-600">Primary Colors:</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#0e0e6a' }} title="Navy"></div>
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3c3cf8' }} title="Blue"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-600">Accent Colors:</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#00d084' }} title="Teal"></div>
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#66e766' }} title="Green"></div>
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-600">Font:</span>
                        <span className="ml-2 text-gray-800">Figtree</span>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-600">Tone:</span>
                        <span className="ml-2 text-gray-800">Professional, Trustworthy</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 mb-4">
                      Define custom brand settings for this campaign:
                    </p>

                    {/* Custom Colors */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Brand Colors:
                      </label>
                      <input
                        type="text"
                        value={customColors}
                        onChange={(e) => setCustomColors(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="e.g., #0e0e6a (navy), #3c3cf8 (blue), #00d084 (teal)"
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Custom Tone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Brand Tone:
                      </label>
                      <select
                        value={customTone}
                        onChange={(e) => setCustomTone(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Select tone...</option>
                        <option value="professional">Professional & Corporate</option>
                        <option value="friendly">Friendly & Approachable</option>
                        <option value="luxury">Luxury & Premium</option>
                        <option value="energetic">Energetic & Dynamic</option>
                        <option value="minimalist">Minimalist & Clean</option>
                        <option value="bold">Bold & Vibrant</option>
                        <option value="elegant">Elegant & Sophisticated</option>
                      </select>
                    </div>

                    {/* Custom Instructions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Additional Instructions:
                      </label>
                      <textarea
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="Add specific style guidelines, mood, composition requirements..."
                        rows={3}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Execute Button */}
          {executionMode === 'full' && (
            <div className="flex justify-center">
              <button
                onClick={executeWorkflow}
                disabled={isRunning || executingStage !== null || !topic}
                className={`px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 ${
                  isRunning || executingStage !== null || !topic
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Running Campaign...
                  </span>
                ) : (
                  'Execute Full Campaign'
                )}
              </button>
            </div>
          )}

          {executionMode === 'staged' && (
            <div className="text-sm text-gray-600 bg-purple-50 px-4 py-3 rounded-lg border-2 border-purple-200">
              <p className="font-semibold text-purple-700">Stage-by-Stage Mode Active</p>
              <p className="text-xs mt-1">Execute and review each stage individually below</p>
            </div>
          )}
        </div>

        {/* Workflow Stages */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Workflow Stages
          </h2>

          <div className="space-y-3">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className={`rounded-lg border-2 transition-all ${
                  stage.status === 'running'
                    ? 'border-blue-300 bg-blue-50'
                    : stage.status === 'completed'
                    ? 'border-green-300 bg-green-50'
                    : stage.status === 'error'
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`text-2xl ${getStatusColor(stage.status)}`}>
                        {getStatusIcon(stage.status)}
                      </span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800">{stage.name}</h3>
                        {stage.message && (
                          <p className="text-sm text-gray-600 mt-1">{stage.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stage.status === 'running' && (
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}

                      {/* Stage Execution Button (staged mode) */}
                      {executionMode === 'staged' && (
                        <>
                          {stage.id === 1 ? (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={executingStage !== null || isRunning || stage.status === 'completed' || !topic}
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? 'bg-purple-400 text-white cursor-wait'
                                  : stage.status === 'completed'
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : !topic
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg'
                              }`}
                            >
                              {executingStage === stage.id ? 'Executing...' : stage.status === 'completed' ? 'Completed' : 'Execute Stage'}
                            </button>
                          ) : (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={
                                executingStage !== null ||
                                isRunning ||
                                stage.status === 'completed' ||
                                stages[stage.id - 2]?.status !== 'completed'
                              }
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? 'bg-purple-400 text-white cursor-wait'
                                  : stage.status === 'completed'
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : stages[stage.id - 2]?.status !== 'completed'
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg'
                              }`}
                            >
                              {executingStage === stage.id
                                ? 'Executing...'
                                : stage.status === 'completed'
                                ? 'Completed'
                                : stages[stage.id - 2]?.status !== 'completed'
                                ? 'Waiting'
                                : 'Approve & Continue'}
                            </button>
                          )}
                        </>
                      )}

                      {/* View Data Button (available after completion) */}
                      {stageData[stage.id]?.data && stage.status === 'completed' && (
                        <button
                          onClick={() => handleViewData(stage.id, stage.name)}
                          className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          📝 View & Edit Data
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specialized Stage Content */}
                {stage.id === 4 && stage.status === 'running' && stageData[4] && (
                  <div className="border-t-2 border-blue-200 p-4 bg-white">
                    <VideoProducer videoData={stageData[4].data} />
                  </div>
                )}

                {stage.id === 5 && (stage.status === 'running' || stage.status === 'completed') && campaignData.publishedUrls && (
                  <div className="border-t-2 border-green-200 p-4 bg-white">
                    <PublishingQueue publishedUrls={campaignData.publishedUrls} platforms={selectedPlatforms} />
                  </div>
                )}

              </div>
            ))}
          </div>
        </div>

        {/* Live Logs */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Live Logs
          </h2>
          <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-gray-500 italic">Waiting for campaign execution...</p>
            ) : (
              logs.map((log, index) => (
                <LogEntry key={index} text={log} index={index} />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600">
          <p className="text-sm">
            Social Media Engine • Integrated into Martech Platform •
            <span className="ml-2">AI-Powered Video Production & Multi-Platform Publishing</span>
          </p>
        </div>

        {/* Prompt Editor Modal */}
        <PromptEditor
          isOpen={showPromptEditor}
          prompt={currentPrompt}
          stageNumber={promptStage || 0}
          stageName={promptStage ? stages.find(s => s.id === promptStage)?.name || '' : ''}
          onSave={handleSavePrompt}
          onCancel={handleCancelPrompt}
        />

        {/* Stage Data Edit Modal - Using StageDataModal for Social Media workflow */}
        {selectedStageData && showDataModal && (
          <StageDataModalComponent
            isOpen={showDataModal}
            stageId={selectedStageData.stageId}
            stageName={selectedStageData.stageName}
            data={selectedStageData.data}
            onClose={handleCloseModal}
            onSave={handleSaveStageData}
          />
        )}
      </div>
    </div>
  )
}
