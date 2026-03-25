import { useEffect, useMemo, useState } from 'react'
import { AgentModuleShell, type AgentConfig } from '@/components/agent/AgentModuleShell'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { PenLine, Image as ImageIcon, Film, Video, Mail } from 'lucide-react'

type ContentType = 'post' | 'image' | 'video-faceless' | 'video-avatar' | 'email'
type TopicAngle = { id: string; title: string; prompt: string; rationale: string }

function formatLabel(value?: string) {
  return (value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getTextContentLabel(channel?: string) {
  switch (channel) {
    case 'linkedin':
      return 'LinkedIn Post'
    case 'website_blog':
      return 'Blog or Page Copy'
    case 'email':
      return 'Email Content'
    case 'facebook_instagram':
      return 'Social Caption'
    case 'youtube':
      return 'Video Script'
    default:
      return 'Text Content'
  }
}

function getDeliverableLabel(deliverable?: string, fallback?: string) {
  switch (deliverable) {
    case 'blog_article':
      return 'Blog Article'
    case 'landing_page':
      return 'Landing Page Copy'
    case 'seo_page':
      return 'SEO Page Draft'
    case 'linkedin_post':
      return 'LinkedIn Post'
    case 'linkedin_carousel':
      return 'LinkedIn Carousel'
    case 'linkedin_article':
      return 'LinkedIn Article'
    case 'campaign_email':
      return 'Campaign Email'
    case 'nurture_email':
      return 'Nurture Email'
    case 'newsletter':
      return 'Newsletter'
    case 'static_visual':
      return 'Static Graphic'
    case 'carousel_visual':
      return 'Carousel Visual'
    case 'banner_visual':
      return 'Banner Visual'
    case 'youtube_explainer':
      return 'YouTube Explainer'
    case 'youtube_short':
      return 'YouTube Short'
    case 'promo_video':
      return 'Promo Video'
    case 'social_video':
      return 'Social Video'
    case 'explainer_video':
      return 'Explainer Video'
    default:
      return fallback || 'Content Draft'
  }
}

function getImageContentLabel(channel?: string) {
  switch (channel) {
    case 'linkedin':
      return 'LinkedIn Visual'
    case 'facebook_instagram':
      return 'Social Creative'
    default:
      return 'Image Creative'
  }
}

function getVideoContentLabel(channel: string | undefined, contentType: ContentType) {
  if (channel === 'youtube') return 'YouTube Video'
  if (channel === 'linkedin') return contentType === 'video-avatar' ? 'LinkedIn Avatar Video' : 'LinkedIn Video'
  if (channel === 'facebook_instagram') return 'Social Video'
  return contentType === 'video-avatar' ? 'Avatar Video' : 'Video'
}

function buildDefaultBrief({
  contentType,
  channel,
  objective,
  deliverable,
  topicAngle,
}: {
  contentType: ContentType
  channel?: string
  objective?: string
  deliverable?: string
  topicAngle?: string
}) {
  const goalText = objective
    ? {
        awareness: 'drive awareness',
        leads: 'generate leads',
        offer: 'explain the offer clearly',
        seo: 'improve SEO visibility',
      }[objective] || `support ${objective.replace(/_/g, ' ')}`
    : 'support the current campaign'

  const channelText = channel ? formatLabel(channel) : 'the primary channel'
  const topicInstruction = topicAngle ? ` Focus the piece on this angle: ${topicAngle}.` : ''

  switch (contentType) {
    case 'email':
      return `Create a ${getDeliverableLabel(deliverable, 'email draft')} for ${channelText} that helps ${goalText}.${topicInstruction} Use our current positioning and keep the message ready for review and editing.`
    case 'image':
      return `Create a ${getDeliverableLabel(deliverable, 'visual asset')} brief for ${channelText} that helps ${goalText}.${topicInstruction} Include the core message, visual direction, and CTA.`
    case 'video-avatar':
      return `Create a ${getDeliverableLabel(deliverable, 'spokesperson video')} brief for ${channelText} that helps ${goalText}.${topicInstruction} Include hook, talking points, CTA, and production guidance.`
    case 'video-faceless':
      return `Create a ${getDeliverableLabel(deliverable, 'faceless video')} brief for ${channelText} that helps ${goalText}.${topicInstruction} Include hook, scene direction, CTA, and visual structure.`
    case 'post':
    default:
      if (deliverable === 'blog_article') {
        return `Draft a blog article for ${channelText} that helps ${goalText}.${topicInstruction} Use our current positioning, structure it clearly, and make it ready for editing and publishing.`
      }
      if (deliverable === 'landing_page') {
        return `Write landing page copy for ${channelText} that helps ${goalText}.${topicInstruction} Use our current offer and messaging context, include strong sections and CTA, and make it ready to refine.`
      }
      if (deliverable === 'seo_page') {
        return `Draft an SEO-focused page for ${channelText} that helps ${goalText}.${topicInstruction} Use our positioning and make the draft suitable for discoverability and organic traffic.`
      }
      if (channel === 'linkedin') {
        return `Write a ${getDeliverableLabel(deliverable, 'LinkedIn post')} that helps ${goalText}.${topicInstruction} Use our current offer and messaging context, include a strong opening hook, and end with a clear CTA.`
      }
      if (channel === 'website_blog') {
        return `Draft blog or landing-page copy that helps ${goalText}.${topicInstruction} Use our current positioning, keep the structure clear, and make the asset ready for editing and publishing.`
      }
      if (channel === 'youtube') {
        return `Write a video script that helps ${goalText}.${topicInstruction} Use our current message, keep it structured for spoken delivery, and include a strong CTA.`
      }
      return `Create ${channelText} content that helps ${goalText}.${topicInstruction} Use the current offer and messaging context, and produce a draft that is ready to refine.`
  }
}

function getTopicAngles({
  workspaceName,
  channel,
  objective,
  deliverable,
  contentType,
}: {
  workspaceName?: string
  channel?: string
  objective?: string
  deliverable?: string
  contentType: ContentType
}): TopicAngle[] {
  const brand = workspaceName || 'the company'
  const objectiveLabel = objective ? objective.replace(/_/g, ' ') : 'the current goal'
  const deliverableLabel = getDeliverableLabel(deliverable, 'content piece')

  if (contentType === 'image') {
    return [
      {
        id: 'offer-visual',
        title: `Show the offer visually`,
        prompt: `Turn ${brand}'s main offer into a clear ${deliverableLabel.toLowerCase()} with one strong promise, one visual focal point, and a direct CTA.`,
        rationale: 'Best when the goal is clarity and direct response.',
      },
      {
        id: 'problem-solution-visual',
        title: 'Frame the problem and payoff',
        prompt: `Create a ${deliverableLabel.toLowerCase()} that shows the before-and-after of the customer problem ${brand} solves, with a concise transformation message.`,
        rationale: 'Useful for lead generation and awareness.',
      },
      {
        id: 'proof-visual',
        title: 'Lead with proof or credibility',
        prompt: `Create a ${deliverableLabel.toLowerCase()} that highlights proof, outcomes, or credibility signals for ${brand}, with a clean CTA to learn more.`,
        rationale: 'Best when trust matters more than novelty.',
      },
    ]
  }

  if (contentType === 'video-faceless' || contentType === 'video-avatar') {
    return [
      {
        id: 'explainer-video',
        title: 'Explainer angle',
        prompt: `Create a ${deliverableLabel.toLowerCase()} that explains what ${brand} helps customers do, why it matters, and what step to take next.`,
        rationale: 'Best general-purpose topic for awareness and education.',
      },
      {
        id: 'pain-point-video',
        title: 'Pain-point hook',
        prompt: `Create a ${deliverableLabel.toLowerCase()} built around a high-friction pain point, then show how ${brand} resolves it with a strong call to action.`,
        rationale: 'Usually strongest for lead generation and outbound promotion.',
      },
      {
        id: 'use-case-video',
        title: 'Specific use-case story',
        prompt: `Create a ${deliverableLabel.toLowerCase()} focused on one concrete use case or workflow that ${brand} improves for the audience.`,
        rationale: 'Good when the audience needs context before action.',
      },
    ]
  }

  if (contentType === 'email') {
    return [
      {
        id: 'offer-email',
        title: 'Offer-first email',
        prompt: `Write about ${brand}'s offer in a way that helps ${objectiveLabel}, with one clear promise and one CTA.`,
        rationale: 'Best when you want a direct campaign-ready draft.',
      },
      {
        id: 'insight-email',
        title: 'Insight-led email',
        prompt: `Lead with a useful insight or pattern the audience will care about, then connect it back to ${brand}'s offer and CTA.`,
        rationale: 'Works well when direct promotion would feel too abrupt.',
      },
      {
        id: 'problem-email',
        title: 'Problem-led email',
        prompt: `Start from a problem the audience faces, show why it matters, and position ${brand} as the next step.`,
        rationale: 'Good for colder audiences and nurture sequences.',
      },
    ]
  }

  if (deliverable === 'blog_article' || deliverable === 'seo_page') {
    return [
      {
        id: 'how-to-blog',
        title: 'How-to topic',
        prompt: `Write a ${deliverableLabel.toLowerCase()} that teaches the audience how to solve a practical problem related to ${brand}'s offer.`,
        rationale: 'Best default for organic traffic and discoverability.',
      },
      {
        id: 'mistakes-blog',
        title: 'Common mistakes topic',
        prompt: `Write a ${deliverableLabel.toLowerCase()} around common mistakes, what they cost, and how ${brand} helps avoid them.`,
        rationale: 'Strong for awareness and conversion-driven education.',
      },
      {
        id: 'comparison-blog',
        title: 'Approach comparison topic',
        prompt: `Write a ${deliverableLabel.toLowerCase()} comparing different ways to achieve the outcome and explain where ${brand} fits best.`,
        rationale: 'Good when buyers need decision support.',
      },
    ]
  }

  if (deliverable === 'landing_page') {
    return [
      {
        id: 'offer-page',
        title: 'Core offer page',
        prompt: `Build the page around ${brand}'s main offer, clear value, proof, and a direct CTA.`,
        rationale: 'Best default landing-page direction.',
      },
      {
        id: 'persona-page',
        title: 'Audience-specific page',
        prompt: `Write the page for one specific buyer type, their pain points, and why ${brand} is relevant right now.`,
        rationale: 'Useful when the page should speak to one segment clearly.',
      },
      {
        id: 'use-case-page',
        title: 'Use-case page',
        prompt: `Write the page around one concrete use case or workflow outcome that ${brand} delivers.`,
        rationale: 'Best when the product needs situational framing.',
      },
    ]
  }

  if (channel === 'linkedin') {
    return [
      {
        id: 'point-of-view',
        title: 'Point-of-view post',
        prompt: `Write a ${deliverableLabel.toLowerCase()} with a clear opinion about how teams should approach ${objectiveLabel}, tied back to ${brand}.`,
        rationale: 'Best for authority and awareness.',
      },
      {
        id: 'problem-hook',
        title: 'Pain-point post',
        prompt: `Write a ${deliverableLabel.toLowerCase()} that starts with a sharp pain point the audience feels, then connects it to ${brand}'s offer.`,
        rationale: 'Usually strongest for lead generation.',
      },
      {
        id: 'proof-hook',
        title: 'Proof-led post',
        prompt: `Write a ${deliverableLabel.toLowerCase()} centered on proof, outcomes, or a credible working insight from ${brand}.`,
        rationale: 'Best when trust and signal matter most.',
      },
    ]
  }

  if (channel === 'youtube') {
    return [
      {
        id: 'explainer-script',
        title: 'Explainer script',
        prompt: `Create a ${deliverableLabel.toLowerCase()} that explains the problem, the approach, and why ${brand} matters.`,
        rationale: 'Strong default for YouTube educational content.',
      },
      {
        id: 'mistakes-script',
        title: 'Mistakes / lessons script',
        prompt: `Create a ${deliverableLabel.toLowerCase()} around common mistakes and lessons the audience should learn before they choose a solution.`,
        rationale: 'Good for audience retention and trust.',
      },
      {
        id: 'walkthrough-script',
        title: 'Walkthrough script',
        prompt: `Create a ${deliverableLabel.toLowerCase()} showing one practical workflow or use case that ${brand} supports.`,
        rationale: 'Best when the product needs concrete context.',
      },
    ]
  }

  return [
    {
      id: 'offer-angle',
      title: 'Offer-led angle',
      prompt: `Create ${deliverableLabel.toLowerCase()} content around ${brand}'s offer and how it helps the audience achieve ${objectiveLabel}.`,
      rationale: 'Best all-purpose default.',
    },
    {
      id: 'problem-angle',
      title: 'Problem-led angle',
      prompt: `Create ${deliverableLabel.toLowerCase()} content starting from a concrete customer problem, then connect it to ${brand}.`,
      rationale: 'Strong for lead generation and engagement.',
    },
    {
      id: 'proof-angle',
      title: 'Proof-led angle',
      prompt: `Create ${deliverableLabel.toLowerCase()} content that highlights credibility, outcomes, or evidence related to ${brand}.`,
      rationale: 'Useful when trust is the main blocker.',
    },
  ]
}

function getNextActions(channel?: string, contentType?: ContentType, deliverable?: string) {
  const actions: string[] = []

  if (channel === 'website_blog') {
    if (deliverable === 'landing_page') actions.push('Refine the page structure and publish the approved draft to WordPress.')
    else actions.push('Polish the draft for SEO and publish it to WordPress.')
  }
  if (channel === 'linkedin') {
    actions.push('Review the draft and schedule it for LinkedIn publishing.')
    if (deliverable === 'linkedin_carousel') actions.push('Turn the slide outline into visuals in Canva before publishing.')
  }
  if (channel === 'facebook_instagram') {
    actions.push('Approve the final asset and move it into social scheduling for Facebook and Instagram.')
    if (contentType === 'image') actions.push('Use Canva to turn the concept into channel-ready creative sizes.')
  }
  if (channel === 'youtube') {
    actions.push('Finalize the script or brief, then prepare the asset for YouTube upload.')
  }
  if (channel === 'email' || contentType === 'email') {
    actions.push('Approve the email copy, then move it into your email platform for send setup.')
  }

  if (contentType === 'video-faceless' || contentType === 'video-avatar') {
    actions.push('Use the connected video stack to produce the first draft after the brief is approved.')
  }

  return actions
}

const CONTENT_TYPES: {
  id: ContentType
  label: string
  icon: React.ComponentType<{ className?: string }>
  taskType: string
  placeholder: string
}[] = [
  {
    id: 'post',
    label: 'Text Content',
    icon: PenLine,
    taskType: 'content_creation',
    placeholder:
      'e.g. "Write a LinkedIn post about our lead scoring feature" · "Draft a blog section explaining our offer" · "Write landing page copy for our SaaS product launch"',
  },
  {
    id: 'image',
    label: 'Social Image',
    icon: ImageIcon,
    taskType: 'generate_image',
    placeholder:
      'e.g. "Create a 1:1 Instagram image for Diwali with our brand colors" · "Generate a 16:9 LinkedIn banner for our new feature launch" · "Make a 9:16 story graphic showing our product dashboard"',
  },
  {
    id: 'video-faceless',
    label: 'Faceless Video',
    icon: Film,
    taskType: 'generate_video',
    placeholder:
      'e.g. "Create an 8-second cinematic shot of a data dashboard coming to life" · "Generate a product explainer scene: spreadsheet transforms into a clean analytics UI" · "B-roll of a busy SaaS team reviewing marketing metrics"',
  },
  {
    id: 'video-avatar',
    label: 'Avatar Video',
    icon: Video,
    taskType: 'generate_avatar_video',
    placeholder:
      'e.g. "Create a 60-second spokesperson video introducing our Q1 product update" · "Generate an avatar video presenting our lead scoring feature to CFOs" · "Record a 90-second demo walkthrough narrated by our spokesperson"',
  },
  {
    id: 'email',
    label: 'Email Content',
    icon: Mail,
    taskType: 'generate_email',
    placeholder:
      'e.g. "Create an HTML newsletter for our monthly product digest" · "Write a re-engagement email for dormant leads with 3 sections: highlight, feature update, CTA" · "Build a Diwali campaign email with our brand colors and a discount CTA"',
  },
]

const DESCRIPTIONS: Record<ContentType, string> = {
  post:           'Write channel-ready text content for social, landing pages, and blog-style drafts — powered by Riya.',
  image:          'Generate brand-consistent social images via DALL-E 3 in any aspect ratio — powered by Riya.',
  'video-faceless': 'Generate cinematic faceless videos via Fal AI Veo 2 — powered by Riya.',
  'video-avatar': 'Generate avatar spokesperson videos via HeyGen — powered by Riya.',
  email:          'Generate email content and HTML-ready campaign drafts for your ESP — powered by Riya.',
}

export function AIContentFlow({
  initialContentType,
  initialChannel,
  initialObjective,
  initialDeliverable,
}: {
  initialContentType?: ContentType
  initialChannel?: string
  initialObjective?: string
  initialDeliverable?: string
}) {
  const { activeWorkspace } = useWorkspace()
  const [contentType, setContentType] = useState<ContentType>(initialContentType || 'post')
  const [showFormatSwitch, setShowFormatSwitch] = useState(false)
  const [heygenAvatars, setHeygenAvatars] = useState<Array<{
    avatar_id: string
    avatar_name: string | null
    preview_image_url?: string | null
    premium?: boolean
  }>>([])
  const [heygenVoices, setHeygenVoices] = useState<Array<{
    voice_id: string
    name: string | null
    language?: string | null
    gender?: string | null
  }>>([])
  const [heygenAvatarId, setHeygenAvatarId] = useState('')
  const [heygenVoiceId, setHeygenVoiceId] = useState('')

  useEffect(() => {
    if (initialContentType) setContentType(initialContentType)
  }, [initialContentType])

  useEffect(() => {
    if (contentType !== 'video-avatar' || !activeWorkspace?.id) return
    let cancelled = false

    const loadHeyGenAssets = async () => {
      try {
        const [avatarResponse, voiceResponse] = await Promise.all([
          fetch(`/api/heygen/avatars?companyId=${encodeURIComponent(activeWorkspace.id)}`),
          fetch(`/api/heygen/voices?companyId=${encodeURIComponent(activeWorkspace.id)}`),
        ])
        if (!avatarResponse.ok) throw new Error('Failed to load HeyGen avatars')
        if (!voiceResponse.ok) throw new Error('Failed to load HeyGen voices')
        const avatarData = await avatarResponse.json()
        const voiceData = await voiceResponse.json()
        const avatars = Array.isArray(avatarData?.avatars) ? avatarData.avatars : []
        const voices = Array.isArray(voiceData?.voices) ? voiceData.voices : []
        if (cancelled) return
        setHeygenAvatars(avatars)
        setHeygenVoices(voices)
        setHeygenAvatarId((current) =>
          current && avatars.some((avatar: { avatar_id: string }) => avatar.avatar_id === current)
            ? current
            : ''
        )
        setHeygenVoiceId((current) =>
          current && voices.some((voice: { voice_id: string }) => voice.voice_id === current)
            ? current
            : ''
        )
      } catch {
        if (cancelled) return
        setHeygenAvatars([])
        setHeygenVoices([])
        setHeygenAvatarId('')
        setHeygenVoiceId('')
      }
    }

    void loadHeyGenAssets()
    return () => {
      cancelled = true
    }
  }, [contentType, activeWorkspace?.id])

  const contentOptions = CONTENT_TYPES.map((type) => {
    if (type.id === 'post') return { ...type, label: getTextContentLabel(initialChannel) }
    if (type.id === 'image') return { ...type, label: getImageContentLabel(initialChannel) }
    if (type.id === 'video-faceless' || type.id === 'video-avatar') {
      return { ...type, label: getVideoContentLabel(initialChannel, type.id) }
    }
    return type
  })
  const cfg = contentOptions.find((t) => t.id === contentType) ?? contentOptions[0]
  const topicAngles = getTopicAngles({
    workspaceName: activeWorkspace?.name,
    channel: initialChannel,
    objective: initialObjective,
    deliverable: initialDeliverable,
    contentType,
  })
  const [selectedTopicId, setSelectedTopicId] = useState(topicAngles[0]?.id ?? '')
  const [customTopic, setCustomTopic] = useState('')
  useEffect(() => {
    setSelectedTopicId(topicAngles[0]?.id ?? '')
    setCustomTopic('')
  }, [contentType, initialChannel, initialObjective, initialDeliverable, activeWorkspace?.name])
  const selectedTopic = topicAngles.find((item) => item.id === selectedTopicId) ?? topicAngles[0]
  const customTopicText = customTopic.trim()
  const selectedTopicPrompt = customTopicText
    ? `Use this exact topic or angle from the user: ${customTopicText}.`
    : selectedTopic?.prompt
  const selectedHeyGenAvatar = useMemo(
    () => heygenAvatars.find((avatar) => avatar.avatar_id === heygenAvatarId) ?? null,
    [heygenAvatars, heygenAvatarId]
  )
  const selectedHeyGenVoice = useMemo(
    () => heygenVoices.find((voice) => voice.voice_id === heygenVoiceId) ?? null,
    [heygenVoices, heygenVoiceId]
  )
  const hasRequiredHeyGenSelection = contentType !== 'video-avatar' || (Boolean(selectedHeyGenAvatar) && Boolean(selectedHeyGenVoice))
  const avatarInstruction = contentType === 'video-avatar' && selectedHeyGenAvatar
    ? ` Use this exact HeyGen avatar_id: ${selectedHeyGenAvatar.avatar_id}${selectedHeyGenAvatar.avatar_name ? ` (${selectedHeyGenAvatar.avatar_name})` : ''}.`
    : ''
  const voiceInstruction = contentType === 'video-avatar' && selectedHeyGenVoice
    ? ` Use this exact HeyGen voice_id: ${selectedHeyGenVoice.voice_id}${selectedHeyGenVoice.name ? ` (${selectedHeyGenVoice.name})` : ''}.`
    : ''
  const startingBrief = buildDefaultBrief({
    contentType,
    channel: initialChannel,
    objective: initialObjective,
    deliverable: initialDeliverable,
    topicAngle: selectedTopicPrompt,
  }) + avatarInstruction + voiceInstruction
  const deliverableLabel = getDeliverableLabel(initialDeliverable, cfg.label)
  const nextActions = getNextActions(initialChannel, contentType, initialDeliverable)
  const isGuidedEntry = Boolean(initialDeliverable || initialChannel || initialObjective)
  const canSwitchFormat = !isGuidedEntry || showFormatSwitch
  const isSeoDraftFlow = contentType === 'post' && (
    initialDeliverable === 'blog_article' ||
    initialDeliverable === 'seo_page' ||
    initialChannel === 'website_blog'
  )
  const seoBrief = `Build an SEO brief for a ${deliverableLabel.toLowerCase()} on ${initialChannel ? initialChannel.replace(/_/g, ' ') : 'the website'}. ${selectedTopicPrompt || ''} Identify likely search intent, topic angle, suggested structure, and SEO guidance before drafting.`
  const contentAgents: AgentConfig[] = isSeoDraftFlow
    ? [
        {
          name: 'maya',
          label: 'Maya — SEO Brief',
          taskType: 'seo_analysis',
          defaultQuery: seoBrief,
          placeholder: 'Maya will shape the SEO angle, search intent, and structure before Riya drafts.',
        },
        {
          name: 'riya',
          label: 'Riya — Content Draft',
          taskType: cfg.taskType,
          defaultQuery: `${startingBrief} If Maya has provided an SEO brief above, use it directly in the draft.`,
          placeholder: cfg.placeholder,
        },
      ]
    : [
        {
          name: 'riya',
          label: 'Riya — Content',
          taskType: cfg.taskType,
          defaultQuery: startingBrief,
          placeholder: cfg.placeholder,
        },
      ]

  return (
    <div className="space-y-5">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex w-fit items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            Content studio
          </div>
          <div className="space-y-2">
            <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">
              Create Campaign-Ready Content
            </h1>
            <p className="max-w-[60ch] text-sm leading-6 text-muted-foreground">
              Shape the format, pick the angle, and move from brief to draft without opening a cluttered content console.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Deliverable', value: deliverableLabel },
              { label: 'Channel', value: formatLabel(initialChannel) || 'Primary channel' },
              { label: 'Objective', value: formatLabel(initialObjective) || 'Campaign support' },
            ].map((item) => (
              <div key={item.label} className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{item.label}:</span>{' '}
                <span className="font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(initialChannel || initialObjective) ? (
        <Card className="border-orange-200 bg-orange-50/70 dark:border-orange-900/40 dark:bg-orange-950/20">
          <CardContent className="space-y-3 px-4 py-3 text-sm">
            <div className="flex flex-wrap gap-4">
            <div><span className="text-muted-foreground">Deliverable:</span> <span className="font-medium">{deliverableLabel}</span></div>
            {initialChannel ? <div><span className="text-muted-foreground">Channel:</span> <span className="font-medium">{initialChannel.replace(/_/g, ' ')}</span></div> : null}
            {initialObjective ? <div><span className="text-muted-foreground">Objective:</span> <span className="font-medium">{initialObjective.replace(/_/g, ' ')}</span></div> : null}
            </div>
            {(selectedTopic || customTopicText) ? (
              <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2">
                <div className="text-muted-foreground">Chosen topic:</div>
                <div className="font-medium">{customTopicText || selectedTopic?.title}</div>
              </div>
            ) : null}
            {isSeoDraftFlow ? (
              <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Flow:</span>{' '}
                <span className="font-medium">Maya shapes the SEO brief first, then Riya drafts from it.</span>
              </div>
            ) : null}
            {contentType === 'video-avatar' && selectedHeyGenAvatar ? (
              <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Avatar:</span>{' '}
                <span className="font-medium">{selectedHeyGenAvatar.avatar_name || selectedHeyGenAvatar.avatar_id}</span>
              </div>
            ) : null}
            {contentType === 'video-avatar' && selectedHeyGenVoice ? (
              <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Voice:</span>{' '}
                <span className="font-medium">
                  {selectedHeyGenVoice.name || selectedHeyGenVoice.voice_id}
                  {selectedHeyGenVoice.language ? ` · ${selectedHeyGenVoice.language}` : ''}
                </span>
              </div>
            ) : null}
            {nextActions.length ? (
              <div className="space-y-2">
                <div className="text-muted-foreground">Next actions:</div>
                <div className="space-y-1">
                  {nextActions.map((item) => (
                    <div key={item} className="text-foreground">• {item}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {isGuidedEntry ? (
              <div className="pt-1">
                <button
                  type="button"
                  className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                  onClick={() => setShowFormatSwitch((prev) => !prev)}
                >
                  {showFormatSwitch ? 'Keep selected mode' : 'Change format'}
                </button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canSwitchFormat ? (
        <div className="flex flex-wrap gap-2">
          {contentOptions.map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => setContentType(type.id)}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                contentType === type.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20',
              ].join(' ')}
            >
              <type.icon className="h-3.5 w-3.5" />
              {type.label}
            </button>
          ))}
        </div>
      ) : null}

      {topicAngles.length > 0 ? (
        <Card className="border-border/70">
          <CardContent className="space-y-3 px-4 py-4">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Topic Direction
              </div>
              <div className="text-sm text-muted-foreground">
                Pick the angle Riya should use before drafting.
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {topicAngles.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    setSelectedTopicId(topic.id)
                    setCustomTopic('')
                  }}
                  className={[
                    'rounded-xl border px-3 py-3 text-left transition-colors',
                    selectedTopic?.id === topic.id && !customTopicText
                      ? 'border-orange-300 bg-orange-50 text-foreground shadow-sm dark:border-orange-800/60 dark:bg-orange-950/20'
                      : 'border-border/70 bg-background hover:border-orange-200 hover:bg-orange-50/50 dark:hover:bg-orange-950/10',
                  ].join(' ')}
                >
                  <div className="font-medium">{topic.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{topic.rationale}</div>
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-xl border border-border/70 bg-background px-3 py-3">
              <div className="text-xs font-medium text-foreground">Or enter your own topic</div>
              <Input
                value={customTopic}
                onChange={(event) => setCustomTopic(event.target.value)}
                placeholder="e.g. Why B2B teams waste spend before they fix lead routing"
              />
              <div className="text-xs text-muted-foreground">
                If you enter your own topic, Riya will use that instead of the suggested angle.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {contentType === 'video-avatar' ? (
        <Card className="border-border/70">
          <CardContent className="space-y-3 px-4 py-4">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Spokesperson
              </div>
              <div className="text-sm text-muted-foreground">
                Choose the HeyGen avatar Riya should use for this video.
              </div>
            </div>
            <select
              value={heygenAvatarId}
              onChange={(event) => setHeygenAvatarId(event.target.value)}
              className="w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
            >
              {heygenAvatars.length === 0 ? (
                <option value="">No HeyGen avatars available</option>
              ) : (
                <option value="">Select a HeyGen avatar</option>
              )}
              {heygenAvatars.map((avatar) => (
                <option key={avatar.avatar_id} value={avatar.avatar_id}>
                  {avatar.avatar_name || avatar.avatar_id}{avatar.premium ? ' · Premium' : ''}
                </option>
              ))}
            </select>
            {selectedHeyGenAvatar?.preview_image_url ? (
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-3">
                <img
                  src={selectedHeyGenAvatar.preview_image_url}
                  alt={selectedHeyGenAvatar.avatar_name || selectedHeyGenAvatar.avatar_id}
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <div className="font-medium">{selectedHeyGenAvatar.avatar_name || selectedHeyGenAvatar.avatar_id}</div>
                  <div className="text-xs text-muted-foreground break-all">{selectedHeyGenAvatar.avatar_id}</div>
                </div>
              </div>
            ) : null}
            <select
              value={heygenVoiceId}
              onChange={(event) => setHeygenVoiceId(event.target.value)}
              className="w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
            >
              {heygenVoices.length === 0 ? (
                <option value="">No HeyGen voices available</option>
              ) : (
                <option value="">Select a HeyGen voice</option>
              )}
              {heygenVoices.map((voice) => (
                <option key={voice.voice_id} value={voice.voice_id}>
                  {voice.name || voice.voice_id}{voice.language ? ` · ${voice.language}` : ''}{voice.gender ? ` · ${voice.gender}` : ''}
                </option>
              ))}
            </select>
            {!hasRequiredHeyGenSelection ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                Select both a HeyGen avatar and a voice before generating an avatar video.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <AgentModuleShell
        key={`${contentType}-${selectedTopic?.id ?? 'default'}-${heygenAvatarId || 'none'}-${heygenVoiceId || 'none'}-${isSeoDraftFlow ? 'seo' : 'standard'}`}
        moduleId="ai-content"
        title="AI Content"
        description={DESCRIPTIONS[contentType]}
        agents={contentAgents}
        collapseSetupControls
        disabledReason={
          !hasRequiredHeyGenSelection
            ? 'Select both a HeyGen avatar and a voice to enable avatar video generation.'
            : null
        }
      />
    </div>
  )
}
