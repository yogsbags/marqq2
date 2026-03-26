'use client'

import { useEffect, useMemo, useState } from 'react'
import { AgentModuleShell } from '@/components/agent/AgentModuleShell'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CalendarDays, CheckCircle2, Circle, FileText, LayoutGrid, Sparkles, XCircle } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

type SocialCalendarFlowProps = {
  initialQuestion?: string
  initialChannels?: string
  initialMotion?: string
  initialHorizon?: string
}

function formatCalendarLabel(value?: string) {
  if (!value) return null
  const labelMap: Record<string, string> = {
    linkedin: 'LinkedIn first',
    instagram: 'Instagram first',
    multi: 'Multi-channel mix',
    education: 'Educate and build trust',
    campaign: 'Support a campaign',
    engagement: 'Drive engagement',
    two_weeks: 'Next 2 weeks',
    month: 'This month',
    quarter: 'Quarter arc',
  }
  return labelMap[value] || value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildSocialCalendarQuery(channels: string, motion: string, horizon: string, initialQuestion?: string) {
  return [
    initialQuestion || `Build a ${formatCalendarLabel(horizon)?.toLowerCase() || 'monthly'} social calendar.`,
    `Channel mix: ${formatCalendarLabel(channels) || 'Multi-channel mix'}.`,
    `Primary job: ${formatCalendarLabel(motion) || 'Educate and build trust'}.`,
    `Planning horizon: ${formatCalendarLabel(horizon) || 'This month'}.`,
    'Return a practical social calendar with the publishing rhythm, priority content pillars, channel-specific post ideas, recommended formats, and the first posts or captions to ship.',
    'Keep the result execution-ready for a real marketing team. Prefer a tight, usable calendar over generic social media advice.',
  ].join('\n\n')
}

export function SocialCalendarFlow({
  initialQuestion,
  initialChannels,
  initialMotion,
  initialHorizon,
}: SocialCalendarFlowProps = {}) {
  const channels = initialChannels || 'multi'
  const motion = initialMotion || 'education'
  const horizon = initialHorizon || 'month'

  const preAgentContent = (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <Card className="rounded-[2rem] border-orange-200/70 bg-zinc-950 text-orange-50 shadow-[0_28px_80px_-34px_rgba(124,45,18,0.46)] dark:border-orange-900/70">
          <CardContent className="space-y-6 p-5 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
              Calendar Desk
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <LayoutGrid className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Channels</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatCalendarLabel(channels)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Motion</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatCalendarLabel(motion)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-orange-400/15 bg-white/5 p-4">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-200">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-100/45">Horizon</div>
                <div className="mt-2 text-sm font-medium text-orange-50">{formatCalendarLabel(horizon)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(255,247,237,0.95)_48%,rgba(255,237,213,0.9)_100%)] shadow-[0_28px_80px_-34px_rgba(154,52,18,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94)_55%,rgba(67,20,7,0.82)_100%)]">
          <CardContent className="grid gap-4 p-8 lg:p-10">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.24em] text-orange-600 dark:text-orange-200/70">Calendar stack</div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Rhythm</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">A clear cadence by week, not just a pile of disconnected post ideas.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">Coverage</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">Channel-specific formats, content pillars, and why each slot exists.</div>
              </div>
              <div className="rounded-[1.45rem] border border-orange-200/70 bg-white/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-orange-900/60 dark:bg-white/5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-orange-100/45">First ship</div>
                <div className="mt-2 text-sm font-medium text-slate-900 dark:text-orange-50">The first posts, captions, and production priorities to move into execution immediately.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[0.82fr_1.18fr]">
        <Card className="rounded-[1.75rem] border-orange-200/70 bg-white/92 shadow-[0_18px_44px_-28px_rgba(180,83,9,0.24)] dark:border-orange-950/70 dark:bg-slate-950/86">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">What You Should Get</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-700 dark:text-orange-100/78">
            <div>• A repeatable posting cadence that fits the team’s current marketing motion.</div>
            <div>• Better channel coverage without duplicating the same idea everywhere.</div>
            <div>• Concrete first posts and content priorities the team can move on immediately.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.92))] shadow-[0_18px_44px_-28px_rgba(180,83,9,0.22)] dark:border-orange-950/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base tracking-tight text-slate-950 dark:text-orange-50">Calendar Lens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Cadence</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">How often should each channel publish before the rhythm becomes noise or too thin?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Mix</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">What formats and pillars belong on each channel instead of repeating one idea everywhere?</div>
            </div>
            <div className="rounded-[1.25rem] border border-orange-200/70 bg-white/70 p-4 dark:border-orange-900/60 dark:bg-white/5">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-600 dark:text-orange-200/70">Execution</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-orange-100/78">Which posts should ship first if the team only has room to execute a few pieces this cycle?</div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )

  const agents = useMemo(
    () => [
      {
        name: 'riya',
        label: 'Build Social Calendar',
        taskType: 'social_calendar_planning',
        defaultQuery: buildSocialCalendarQuery(channels, motion, horizon, initialQuestion),
        placeholder: 'Describe the campaign, channel pressure, or publishing problem you want the calendar to solve.',
        tags: ['social', 'calendar', 'publishing'],
      },
    ],
    [channels, horizon, initialQuestion, motion]
  )

  return (
    <AgentModuleShell
      hideHeader
      moduleId="social-calendar"
      title="Plan Your Social Calendar"
      description="Turn the social motion into a publishing rhythm with the right channels, formats, and first posts to ship."
      agents={agents}
      preAgentContent={preAgentContent}
      collapseSetupControls
      resourceContextLabel="Campaign brief, content doc, or sheet URL"
      resourceContextPlaceholder="Paste the campaign brief, planning sheet, or content doc URL if the calendar should follow a specific source"
      resourceContextHint="Optional. Use this when the calendar should anchor to an exact campaign brief, sheet, or planning document."
      buildResourceContext={(value) => `Use this exact campaign brief, planning sheet, or content document if needed: ${value}`}
      resourceContextPlacement="primary"
    />
  )
}

type SocialMediaFlowProps = {
  initialPlatforms?: string[]
  initialObjective?: string
  initialFormat?: string
  initialHorizon?: string
}

function formatGoalLabel(value?: string) {
  return (value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function resolveCampaignType(platforms: string[], format?: string) {
  const primary = platforms[0] || 'linkedin'
  if (format === 'video') {
    if (primary === 'youtube') return 'youtube-short'
    if (primary === 'instagram' || primary === 'facebook') return 'instagram-reel'
    return 'linkedin-testimonial'
  }
  if (primary === 'youtube') return 'youtube-explainer'
  if (primary === 'instagram' || primary === 'facebook') return 'instagram-carousel'
  return 'linkedin-carousel'
}

function resolvePurpose(objective?: string) {
  switch (objective) {
    case 'leads':
      return 'lead-generation'
    case 'engagement':
      return 'engagement'
    case 'nurture':
      return 'education'
    case 'awareness':
    default:
      return 'brand-awareness'
  }
}

function getCampaignTypeDefaults(campaignType: string) {
  if (campaignType === 'infographic') {
    return { contentType: 'image' as const, aspectRatio: '4:5' }
  }
  if (campaignType === 'instagram-reel' || campaignType === 'youtube-short') {
    return { aspectRatio: '9:16' }
  }
  if (campaignType === 'linkedin-carousel' || campaignType === 'instagram-carousel') {
    return { aspectRatio: '1:1' }
  }
  return {}
}

export function SocialMediaFlow({ initialPlatforms, initialObjective, initialFormat, initialHorizon }: SocialMediaFlowProps = {}) {
  const isGuidedLaunch = Boolean(initialPlatforms?.length || initialObjective || initialFormat || initialHorizon)
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
  const [campaignType, setCampaignType] = useState<string>(resolveCampaignType(initialPlatforms || ['linkedin'], initialFormat))
  const [purpose, setPurpose] = useState<string>(resolvePurpose(initialObjective))
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(initialPlatforms?.length ? initialPlatforms : ['linkedin'])
  const [topic, setTopic] = useState<string>('')
  const [isGeneratingTopic, setIsGeneratingTopic] = useState<boolean>(false)
  const [topicError, setTopicError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number>(15)
  const [contentType, setContentType] = useState<'image' | 'faceless-video' | 'avatar-video'>(
    initialFormat === 'video' ? 'faceless-video' : 'image'
  )
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

  const applyCampaignType = (next: string) => {
    setCampaignType(next)
    const defaults = getCampaignTypeDefaults(next)
    if (defaults.contentType) {
      setContentType(defaults.contentType)
    }
    if (defaults.aspectRatio) {
      setAspectRatio(defaults.aspectRatio)
    }
  }

	  const campaignTypes = [
	    { value: 'linkedin-carousel', label: 'LinkedIn Carousel', platforms: ['linkedin'] },
	    { value: 'linkedin-testimonial', label: 'LinkedIn Testimonial', platforms: ['linkedin'] },
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
    { value: 'brand-awareness', label: 'Brand awareness', description: 'Increase reach, recognition, and message recall.' },
    { value: 'lead-generation', label: 'Lead generation', description: 'Turn social activity into inbound demand or pipeline.' },
    { value: 'engagement', label: 'Engagement', description: 'Drive more conversation, response, and audience interaction.' },
    { value: 'education', label: 'Education', description: 'Teach the audience through explainers, proof, or insights.' },
    { value: 'product-promo', label: 'Offer promotion', description: 'Promote a launch, offer, event, or campaign push.' },
    { value: 'customer-proof', label: 'Customer proof', description: 'Use outcomes, testimonials, and credibility signals.' },
  ]

  const targetAudienceOptions = [
    { value: 'all', label: 'Broad audience', description: 'Use a general campaign for your wider audience.' },
    { value: 'prospects', label: 'Prospects', description: 'Target people who do not know the brand deeply yet.' },
    { value: 'customers', label: 'Customers', description: 'Focus on existing users or customers.' },
    { value: 'decision-makers', label: 'Decision-makers', description: 'Focus on buying roles and business stakeholders.' },
    { value: 'community', label: 'Community', description: 'Nurture followers, engaged users, and repeat viewers.' },
    { value: 'warm-audience', label: 'Warm audience', description: 'Focus on people already aware of the offer or brand.' },
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

  // Pre-fill topic from festival campaign intent (set by CalendarPanel)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('marqq_festival_campaign')
      if (!raw) return
      sessionStorage.removeItem('marqq_festival_campaign')
      const payload = JSON.parse(raw) as { festival?: string; description?: string; date?: string; mode?: string }
      if (payload.festival) {
        const brief = [payload.festival, payload.description].filter(Boolean).join(' — ')
        setTopic(brief)
        setPurpose('brand-awareness')
      }
    } catch { /* non-blocking */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  useEffect(() => {
    if (!initialPlatforms?.length && !initialObjective && !initialFormat && !initialHorizon) return

    const nextPlatforms = initialPlatforms?.length ? initialPlatforms : ['linkedin']
    setSelectedPlatforms(nextPlatforms)
    setCampaignType(resolveCampaignType(nextPlatforms, initialFormat))
    setPurpose(resolvePurpose(initialObjective))

    if (initialFormat === 'video') {
      setContentType('faceless-video')
      setAspectRatio(nextPlatforms[0] === 'youtube' || nextPlatforms[0] === 'instagram' || nextPlatforms[0] === 'facebook' ? '9:16' : '16:9')
    } else {
      setContentType('image')
      setAspectRatio(nextPlatforms[0] === 'linkedin' ? '1:1' : '4:5')
    }
  }, [initialPlatforms, initialObjective, initialFormat, initialHorizon])

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
      addLog('Please select a HeyGen avatar look before executing.')
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
      addLog('Please select a HeyGen avatar look before executing.')
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
      case 'idle': return <Circle className="h-3 w-3 text-gray-400" />
      case 'running': return <Circle className="h-3 w-3 fill-blue-400 text-blue-400" />
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-8 pb-8 pt-2">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
            Run Social Media
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan, generate, and manage channel-ready social campaigns in one workflow.
          </p>
        </div>

        {(initialPlatforms?.length || initialObjective || initialFormat || initialHorizon) && (
          <div className="mb-6 rounded-2xl border border-border/70 bg-muted/10 p-4">
            <div className="text-sm font-semibold text-foreground">Veena campaign brief</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channels</div>
                <div className="mt-1 text-sm text-foreground">
                  {(initialPlatforms?.length ? initialPlatforms : ['linkedin']).map(formatGoalLabel).join(', ')}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</div>
                <div className="mt-1 text-sm text-foreground">{formatGoalLabel(initialObjective || 'awareness')}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Format mix</div>
                <div className="mt-1 text-sm text-foreground">{formatGoalLabel(initialFormat || 'image')}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Horizon</div>
                <div className="mt-1 text-sm text-foreground">{formatGoalLabel(initialHorizon || 'week')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Main Control Panel */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            {isGuidedLaunch ? 'Campaign plan and first action' : 'Campaign Configuration'}
          </h2>

          {isGuidedLaunch ? (
            <div className="mb-6 rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign type</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{campaignTypes.find((item) => item.value === campaignType)?.label || campaignType}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purpose</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{purposeOptions.find((item) => item.value === purpose)?.label || formatGoalLabel(purpose)}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{targetAudienceOptions.find((item) => item.value === targetAudience)?.label || formatGoalLabel(targetAudience)}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Topic</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{topic || 'Generate the campaign topic to begin.'}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={generateTopic}
                  disabled={isRunning || executingStage !== null || isGeneratingTopic}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isRunning || executingStage !== null
                      ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed'
                      : 'bg-background border border-border text-foreground hover:border-orange-300'
                  } ${isGeneratingTopic ? 'opacity-80 cursor-wait' : ''}`}
                >
                  {isGeneratingTopic ? 'Generating topic...' : topic ? 'Refresh topic' : 'Generate topic'}
                </button>
                <button
                  type="button"
                  onClick={executeWorkflow}
                  disabled={isRunning || executingStage !== null || !topic}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isRunning || executingStage !== null || !topic
                      ? 'bg-slate-300 text-slate-600 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm hover:from-orange-600 hover:to-orange-700'
                  }`}
                >
                  {isRunning ? 'Running campaign...' : executionMode === 'staged' ? 'Start staged campaign' : 'Generate first campaign plan'}
                </button>
              </div>
            </div>
          ) : null}

          {isGuidedLaunch ? (
            <details className="mb-6 rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                Refine campaign setup
              </summary>
              <div className="mt-4 p-4 bg-muted/50 rounded-lg border-2 border-border">
                <label className="block text-sm font-medium text-foreground mb-3">
                  Execution Mode:
                </label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setExecutionMode('full')}
                    disabled={isRunning || executingStage !== null}
                    className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                      executionMode === 'full'
                        ? 'bg-orange-500 text-white shadow-md'
                        : 'bg-card border-2 border-border text-foreground hover:border-orange-300'
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
                        : 'bg-card border-2 border-border text-foreground hover:border-purple-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div>Stage-by-Stage</div>
                    <p className="text-xs mt-1 opacity-80">Review and approve each stage</p>
                  </button>
                </div>
              </div>
            </details>
          ) : (
            <div className="mb-6 p-4 bg-muted/50 rounded-lg border-2 border-border">
              <label className="block text-sm font-medium text-foreground mb-3">
                Execution Mode:
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setExecutionMode('full')}
                  disabled={isRunning || executingStage !== null}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                    executionMode === 'full'
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-card border-2 border-border text-foreground hover:border-orange-300'
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
                      : 'bg-card border-2 border-border text-foreground hover:border-purple-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div>Stage-by-Stage</div>
                  <p className="text-xs mt-1 opacity-80">Review and approve each stage</p>
                </button>
              </div>
            </div>
          )}

          <details className="mb-6 rounded-xl border border-border/70 bg-muted/10 px-4 py-3" open={!isGuidedLaunch}>
            <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
              {isGuidedLaunch ? 'Open campaign builder' : 'Campaign builder'}
            </summary>
            <div className="mt-4">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Campaign Type Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Campaign Type:
              </label>
              <select
                value={campaignType}
                onChange={(e) => {
                  applyCampaignType(e.target.value)
                }}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-border rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm bg-background text-foreground disabled:bg-muted disabled:cursor-not-allowed"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Campaign Purpose:
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Target Audience:
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                  className="w-full pr-[120px] px-4 py-2.5 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm text-slate-900 bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={generateTopic}
                  disabled={isRunning || executingStage !== null || isGeneratingTopic}
                  className={`absolute right-2 whitespace-nowrap px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    isRunning || executingStage !== null
                      ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed'
                      : 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm'
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Target Platforms:
              </label>
              <div
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 cursor-pointer bg-white text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 flex items-center justify-between"
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
                <div className="absolute z-10 w-full mt-1 bg-white border-2 border-slate-300 rounded-lg shadow-lg dark:bg-slate-950 dark:border-slate-700 max-h-64 overflow-y-auto">
                  {platforms.map(platform => (
                    <label
                      key={platform.value}
                      className="flex items-center px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(platform.value)}
                        onChange={() => togglePlatform(platform.value)}
                        className="mr-3 w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-slate-900 dark:text-slate-100">{platform.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content Language Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Content Language:
            </label>
            <div className="max-w-xs">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
              >
                {languages.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label} ({lang.native})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Content and videos will be created in the selected language
            </p>
          </div>

          {/* Output Format Type Selector */}
          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-purple-200 dark:border-purple-900/60">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Output Format Type
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setContentType('image')}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'image'
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Avatar Video</div>
                <p className="text-xs opacity-80">AI Avatar</p>
              </button>
            </div>
          </div>

          {/* Aspect Ratio Selection */}
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-950/80 rounded-lg border border-slate-200 dark:border-slate-800">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Aspect Ratio
            </label>
            {contentType === 'image' ? (
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isRunning || executingStage !== null}
                className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '16:9'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-orange-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
              <div className="mb-6 p-4 bg-blue-50 dark:bg-slate-950/80 rounded-lg border-2 border-blue-200 dark:border-blue-900/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => setShowFacelessOptions(!showFacelessOptions)}
                      className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
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
                    <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">
                      Faceless Video Options
                    </h3>
                  </div>
                </div>

                {showFacelessOptions && (
                  <div className="space-y-4 mt-4 pt-4 border-t border-blue-200 dark:border-blue-900/60">
                {/* Video Duration */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mt-1">
                    <span>8s (min)</span>
                    <span>148s (Standard)</span>
                    <span>900s (15 min, Extended)</span>
                  </div>
                </div>

                {/* Model Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Video Duration Mode:
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleModelChange('veo')}
                      disabled={isRunning || executingStage !== null}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        useVeo
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-blue-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                          : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-purple-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                        : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-blue-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                        : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-blue-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div>Image-to-Video</div>
                    <div className="text-xs font-normal opacity-80 mt-1">Animate from image</div>
                  </button>
                </div>

                {facelessVideoMode === 'image-to-video' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                      Image Source:
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setImageSource('generate')}
                        disabled={isRunning || executingStage !== null}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          imageSource === 'generate'
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-green-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                            : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-green-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                <div className="mb-6 p-6 bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-cyan-200 dark:border-cyan-900/60">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">
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
                      <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        Use Frame Interpolation
                      </span>
                    </label>
                  </div>

                  {useFrameInterpolation && (
                    <div className="space-y-4">
                      <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border-2 border-blue-200 dark:border-blue-900/60">
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                          Scene Extensions: {sceneExtensionCount} (Total: {8 + sceneExtensionCount * 7}s)
                        </p>

                        {/* First Frame */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            First Frame:
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => setFirstFrameMode('upload')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'upload'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 resize-none disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                            />
                          )}
                        </div>

                        {/* Last Frame */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Last Frame:
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => setLastFrameMode('upload')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'upload'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 resize-none disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
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
                <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-purple-200 dark:border-purple-900/60">
                  <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100 mb-4">
                    Extended Video Configuration
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Video Mode:
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setLongCatMode('text-to-video')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                            longCatMode === 'text-to-video'
                              ? 'bg-purple-500 text-white shadow-md'
                              : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-purple-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
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
                              : 'bg-white border-2 border-slate-300 text-slate-700 hover:border-purple-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Image-to-Video
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Video Prompt:
                      </label>
                      <textarea
                        value={longCatPrompt}
                        onChange={(e) => setLongCatPrompt(e.target.value)}
                        placeholder="Describe your long-form video..."
                        rows={3}
                        disabled={isRunning || executingStage !== null}
                        className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:border-purple-500 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 resize-none disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
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
            <div className="mb-6 p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-green-200 dark:border-green-900/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => setShowAvatarConfig(!showAvatarConfig)}
                    className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
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
                  <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">
                    Avatar Video Configuration
                  </h3>
                </div>
              </div>

              {showAvatarConfig && (
                <div className="space-y-4 mt-4 pt-4 border-t border-green-200 dark:border-green-900/60">
                {/* Avatar Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-green-500 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Video Script (optional):
                  </label>
                  <textarea
                    value={avatarScriptText}
                    onChange={(e) => setAvatarScriptText(e.target.value)}
                    placeholder="Leave empty to auto-generate based on campaign topic and purpose..."
                    rows={4}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-green-500 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 resize-none disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    If left empty, AI will generate a contextually appropriate script based on your campaign configuration
                  </p>
                </div>

                {/* Video Duration */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mt-1">
                    <span>8s</span>
                    <span>300s (5 min)</span>
                  </div>
                </div>
                </div>
              )}
            </div>
          )}

          {/* Reference Materials Section - Collapsible for all content types */}
          <div className="mb-6 p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-amber-200 dark:border-amber-900/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setShowReferenceMaterials(!showReferenceMaterials)}
                  className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
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
                <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">
                  Reference Materials (Optional)
                </h3>
              </div>
            </div>

            {showReferenceMaterials && (
              <div className="space-y-4 mt-4 pt-4 border-t border-amber-200 dark:border-amber-900/60">
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

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Upload reference materials to guide content generation. These files will be analyzed by AI to understand your style and preferences.
                </p>
              </div>
            )}
          </div>

          {/* Auto-Publish Toggle */}
          <div className="mb-6 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-teal-200 dark:border-teal-900/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">
                  Auto-Publish
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
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
                <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Enable Auto-Publish
                </span>
              </label>
            </div>
          </div>

          {/* Brand Guidelines Section - Collapsed by default */}
          <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-950 dark:to-slate-900 rounded-lg border-2 border-indigo-200 dark:border-indigo-900/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setShowBrandGuidelines(!showBrandGuidelines)}
                  className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
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
                <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">
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
                <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Use PL Capital Brand Guidelines
                </span>
              </label>
            </div>

            {showBrandGuidelines && (
              <div className="mt-4 pt-4 border-t border-indigo-200 dark:border-indigo-900/60">
                {useBrandGuidelines ? (
                  <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border-2 border-green-300 dark:border-green-900/60">
                    <p className="text-sm font-semibold text-green-700 mb-2">
                      PL Capital Brand Guidelines Active
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Primary Colors:</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#0e0e6a' }} title="Navy"></div>
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3c3cf8' }} title="Blue"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Accent Colors:</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#00d084' }} title="Teal"></div>
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#66e766' }} title="Green"></div>
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Font:</span>
                        <span className="ml-2 text-slate-900 dark:text-slate-100">Figtree</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Tone:</span>
                        <span className="ml-2 text-slate-900 dark:text-slate-100">Professional, Trustworthy</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Define custom brand settings for this campaign:
                    </p>

                    {/* Custom Colors */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Brand Colors:
                      </label>
                      <input
                        type="text"
                        value={customColors}
                        onChange={(e) => setCustomColors(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="e.g., #0e0e6a (navy), #3c3cf8 (blue), #00d084 (teal)"
                        className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Custom Tone */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Brand Tone:
                      </label>
                      <select
                        value={customTone}
                        onChange={(e) => setCustomTone(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
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
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Additional Instructions:
                      </label>
                      <textarea
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="Add specific style guidelines, mood, composition requirements..."
                        rows={3}
                        className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 resize-none disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Execute Button */}
            </div>
          </details>

          {!isGuidedLaunch && executionMode === 'full' && (
            <div className="flex justify-center">
              <button
                onClick={executeWorkflow}
                disabled={isRunning || executingStage !== null || !topic}
                className={`px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 ${
                  isRunning || executingStage !== null || !topic
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl'
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

          {!isGuidedLaunch && executionMode === 'staged' && (
            <div className="text-sm text-slate-600 dark:text-slate-300 bg-purple-50 dark:bg-slate-950/80 px-4 py-3 rounded-lg border-2 border-purple-200 dark:border-purple-900/60">
              <p className="font-semibold text-purple-700">Stage-by-Stage Mode Active</p>
              <p className="text-xs mt-1">Execute and review each stage individually below</p>
            </div>
          )}
        </div>

        {/* Workflow Stages */}
        <div className="bg-white dark:bg-slate-950 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
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
                    : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`text-2xl ${getStatusColor(stage.status)}`}>
                        {getStatusIcon(stage.status)}
                      </span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{stage.name}</h3>
                        {stage.message && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{stage.message}</p>
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
                                  ? 'bg-slate-300 text-slate-600 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed'
                                  : !topic
                                  ? 'bg-slate-300 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
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
                                  ? 'bg-slate-300 text-slate-600 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed'
                                  : stages[stage.id - 2]?.status !== 'completed'
                                  ? 'bg-slate-300 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
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
                          <FileText className="h-4 w-4 mr-1" /> View & Edit Data
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specialized Stage Content */}
                {stage.id === 4 && stage.status === 'running' && stageData[4] && (
                  <div className="border-t-2 border-blue-200 dark:border-blue-900/60 p-4 bg-white dark:bg-slate-950">
                    <VideoProducer videoData={stageData[4].data} />
                  </div>
                )}

                {stage.id === 5 && (stage.status === 'running' || stage.status === 'completed') && campaignData.publishedUrls && (
                  <div className="border-t-2 border-green-200 dark:border-green-900/60 p-4 bg-white dark:bg-slate-950">
                    <PublishingQueue publishedUrls={campaignData.publishedUrls} platforms={selectedPlatforms} />
                  </div>
                )}

              </div>
            ))}
          </div>
        </div>

        {/* Live Logs */}
        <div className="bg-white dark:bg-slate-950 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-8">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Live Logs
          </h2>
          <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 italic">Waiting for campaign execution...</p>
            ) : (
              logs.map((log, index) => (
                <LogEntry key={index} text={log} index={index} />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-600 dark:text-slate-400">
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
