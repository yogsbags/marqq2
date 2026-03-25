import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  ANALYZE_GOAL_IDS,
  CONNECTOR_LABEL_TO_ID,
  GOAL_CARDS,
  GOAL_CATALOG_GROUPS,
  type GoalCard,
  type GoalIntakeConfig,
  type GoalTarget,
  getGoalIntakeConfig,
  titleCase,
  WORKFLOW_GOAL_GROUPS,
} from './goalConfig'
import { toast } from 'sonner'
import {
  HiTrendingUp as TrendingUp,
  HiUsers as Users,
  HiPencil as PenLine,
  HiChartBar as BarChart,
  HiShieldCheck as Shield,
  HiArrowRight as ArrowRight,
  HiClock as Clock,
  HiX as X,
} from 'react-icons/hi'
import { Search } from 'lucide-react'

interface WorkflowPlan {
  workflow_name: string
  description: string
  steps: Array<{ order: number; agent: string; query: string; description: string }>
}

interface ActiveWorkflow {
  id: string
  goal: string
  workflow_name: string
  steps: WorkflowPlan['steps']
  currentStep: number
  status: 'planning' | 'running' | 'done' | 'error'
  createdAt: string
  moduleId?: string
  hashParams?: Record<string, string>
}

const RETIRED_WORKFLOW_GOALS = new Set(['Launch a Campaign'])

function loadActiveWorkflows(): ActiveWorkflow[] {
  try {
    const raw = localStorage.getItem('marqq_active_workflows')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Only show workflows from the last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const next = parsed.filter((w: ActiveWorkflow) =>
      new Date(w.createdAt).getTime() > cutoff &&
      !RETIRED_WORKFLOW_GOALS.has(String(w.goal || ''))
    )
    if (next.length !== parsed.length) {
      localStorage.setItem('marqq_active_workflows', JSON.stringify(next))
    }
    return next
  } catch { return [] }
}

function saveActiveWorkflow(wf: ActiveWorkflow) {
  const existing = loadActiveWorkflows().filter(w => w.id !== wf.id)
  localStorage.setItem('marqq_active_workflows', JSON.stringify([wf, ...existing].slice(0, 5)))
}

function removeActiveWorkflow(id: string) {
  const next = loadActiveWorkflows().filter((workflow) => workflow.id !== id)
  localStorage.setItem('marqq_active_workflows', JSON.stringify(next))
  return next
}

interface HomeViewProps {
  onModuleSelect: (moduleId: string | null) => void
  onOpenChat: () => void
}

type GoalRequirementNotice = {
  goalKey: string
  title: string
  description: string
  ctaLabel: string
  moduleId: string
  hashParams?: Record<string, string>
  blocking?: boolean
}

type ConnectorStatus = {
  id: string
  name: string
  status: string
  connected?: boolean
}

type MkgField = {
  value?: unknown
  confidence?: number
}

type MkgRecord = Record<string, MkgField>

const WEBSITE_REQUIRED_MODULES = new Set([
  'paid-ads',
  'ad-creative',
  'ai-content',
  'seo-llmo',
  'company-intelligence',
  'positioning',
  'launch-strategy',
  'sales-enablement',
  'marketing-audit',
  'lead-magnets',
])

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item && 'name' in item ? String((item as { name?: unknown }).name || '') : ''))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function getMkgValue(mkg: MkgRecord | null, key: string) {
  const entry = mkg?.[key]
  if (!entry) return null
  if (!entry.value) return null
  if (Number(entry.confidence ?? 0) < 0.5) return null
  return entry.value
}

export function HomeView({ onModuleSelect, onOpenChat }: HomeViewProps) {
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id ?? null
  const websiteUrl = activeWorkspace?.website_url?.trim() ?? ''

  const [showAllGoals, setShowAllGoals] = useState(false)
  const [goalSearch, setGoalSearch] = useState('')
  const [activeWorkflows, setActiveWorkflows] = useState<ActiveWorkflow[]>(() => loadActiveWorkflows())
  const [selectedGoal, setSelectedGoal] = useState<GoalTarget | null>(null)
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({})
  const [intakeStep, setIntakeStep] = useState(0)
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [connectorActionId, setConnectorActionId] = useState<string | null>(null)
  const [mkg, setMkg] = useState<MkgRecord | null>(null)

  const openGoal = (moduleId: string, hashParams?: Record<string, string>) => {
    const params = new URLSearchParams(hashParams)
    const nextHash = params.toString()
    window.location.hash = nextHash
    onModuleSelect(moduleId)
  }

  const workflowGoalGroups = WORKFLOW_GOAL_GROUPS.map((group) => ({
    ...group,
    goals: group.goalIds
      .map((goalId) => GOAL_CARDS.find((goal) => goal.id === goalId))
      .filter(Boolean) as GoalCard[],
  })).filter((group) => group.goals.length > 0)

  const buildGoalLaunchParams = (goal: GoalTarget) => {
    const params: Record<string, string> = { ...(goal.hashParams || {}) }
    if (goal.moduleId === 'paid-ads') {
      const objective = goalAnswers.objective || 'leads'
      const channel = goalAnswers.channel || 'google'

      const objectiveLabelMap: Record<string, string> = {
        leads: 'generate leads',
        traffic: 'drive traffic',
        awareness: 'build awareness',
      }
      const channelLabelMap: Record<string, string> = {
        google: 'Google Ads',
        meta: 'Meta Ads',
        linkedin: 'LinkedIn Ads',
      }
      const connectorMap: Record<string, string[]> = {
        google: ['google_ads', 'ga4'],
        meta: ['meta_ads', 'ga4'],
        linkedin: ['linkedin_ads', 'ga4'],
      }

      params.tab = 'plan'
      params.paid_objective = objective
      params.paid_channel = channel
      params.connectors = (connectorMap[channel] || connectorMap.google).join(',')
      params.question = `Build a paid ads plan to ${objectiveLabelMap[objective] || 'generate demand'} through ${channelLabelMap[channel] || 'the selected channel'}. Return the campaign structure, targeting direction, budget shape, KPI targets, and the first launch moves we should make.`
      return params
    }

    if (goal.moduleId === 'budget-optimization') {
      const selectedChannels = goalAnswers.channel === 'both'
        ? ['meta_ads', 'google_ads']
        : goalAnswers.channel === 'meta'
          ? ['meta_ads']
          : goalAnswers.channel === 'google'
            ? ['google_ads']
            : []

      const focusPromptMap: Record<string, string> = {
        waste: 'Find wasted spend and the first budget cuts we should make to improve ROAS.',
        conversions: 'Show how to increase conversions without hurting overall ROAS.',
        top_campaigns: 'Improve ROAS on our strongest campaigns before expanding spend elsewhere.',
      }

      params.mode = 'roas'
      if (goalAnswers.timeframe) params.timeframe = goalAnswers.timeframe
      if (selectedChannels.length) params.connectors = selectedChannels.join(',')
      params.question = focusPromptMap[goalAnswers.focus] || 'How can we improve ROAS across our current ad channels? Give a channel-by-channel diagnosis and budget reallocation plan.'
      return params
    }

    if (goal.moduleId === 'email-sequence') {
      const type = goalAnswers.sequence_type || 'nurture'
      const audience = goalAnswers.sequence_audience || 'new_leads'
      const outcome = goalAnswers.sequence_goal || 'activate'

      const typeLabelMap: Record<string, string> = {
        nurture: 'nurture',
        onboarding: 'onboarding',
        outbound: 'outbound',
      }
      const audienceLabelMap: Record<string, string> = {
        new_leads: 'new leads',
        trial_users: 'trial or new users',
        customers: 'existing customers',
      }
      const goalLabelMap: Record<string, string> = {
        activate: 'activation and education',
        convert: 'conversion',
        reengage: 're-engagement',
      }

      params.email_sequence_type = type
      params.email_sequence_audience = audience
      params.email_sequence_goal = outcome
      params.question = `Build a ${typeLabelMap[type] || 'nurture'} email sequence for ${audienceLabelMap[audience] || 'the selected audience'} focused on ${goalLabelMap[outcome] || 'the next key outcome'}. Include the message arc, email-by-email goal, CTA progression, and the first drafts we should send.`
      return params
    }

    if (goal.moduleId === 'ad-creative') {
      const format = goalAnswers.format || 'copy'
      const platform = goalAnswers.platform || 'meta'

      const formatLabelMap: Record<string, string> = {
        copy: 'channel-ready ad copy',
        angles: 'creative angles and hooks',
        variants: 'testable creative variants',
      }
      const platformLabelMap: Record<string, string> = {
        google: 'Google Ads',
        meta: 'Meta Ads',
        linkedin: 'LinkedIn Ads',
      }

      params.ad_format = format
      params.ad_platform = platform
      params.question = `Generate ${formatLabelMap[format] || 'ad creative'} for ${platformLabelMap[platform] || 'the selected platform'}. Return the strongest creative directions, the messaging angles, the first headline and body options, and the visual or asset cues we should test first.`
      return params
    }

    if (goal.moduleId === 'ab-test') {
      const surface = goalAnswers.test_surface || 'page'
      const goalType = goalAnswers.test_goal || 'conversion'
      const mode = goalAnswers.test_mode || 'hypothesis'

      const surfaceLabelMap: Record<string, string> = {
        page: 'landing page',
        email: 'email',
        ads: 'ad creative',
      }
      const goalLabelMap: Record<string, string> = {
        conversion: 'improve conversion rate',
        quality: 'improve lead or response quality',
        learning: 'learn faster which angle works',
      }
      const modeLabelMap: Record<string, string> = {
        hypothesis: 'generate the strongest hypotheses and first variants',
        evaluation: 'evaluate the current experiment and call the result cleanly',
        both: 'design the test and define how to evaluate it',
      }

      params.test_surface = surface
      params.test_goal = goalType
      params.test_mode = mode
      params.question = `Design an experiment for our ${surfaceLabelMap[surface] || 'test surface'} that should ${goalLabelMap[goalType] || 'hit the main test goal'}. We need to ${modeLabelMap[mode] || 'handle the right experiment motion'}. Return the strongest hypothesis, the control and variant direction, the metric to watch, and how we should interpret the outcome.`
      return params
    }

    if (goal.moduleId === 'seo-llmo') {
      const focus = goalAnswers.seo_focus || 'both'
      const surface = goalAnswers.seo_surface || 'homepage'
      const seoGoal = goalAnswers.seo_goal || 'traffic'

      const focusLabelMap: Record<string, string> = {
        rankings: 'improve classical SEO visibility and search rankings',
        llm: 'improve LLM and answer-engine visibility',
        both: 'improve both SEO and LLM discoverability together',
      }
      const surfaceLabelMap: Record<string, string> = {
        homepage: 'homepage',
        content: 'content library',
        offer: 'offer and conversion pages',
      }
      const goalLabelMap: Record<string, string> = {
        traffic: 'grow qualified organic traffic',
        coverage: 'close the biggest topic and intent gaps',
        authority: 'strengthen relevance, trust, and authority signals',
      }

      params.seo_focus = focus
      params.seo_surface = surface
      params.seo_goal = seoGoal
      params.question = `Improve our organic visibility by helping us ${focusLabelMap[focus] || 'improve organic discoverability'} on the ${surfaceLabelMap[surface] || 'selected surface'}. Return the biggest search or LLM visibility gaps, the strongest opportunities, and the first moves that help us ${goalLabelMap[seoGoal] || 'unlock the desired visibility outcome'}.`
      return params
    }

    if (goal.moduleId === 'audience-profiles') {
      const scope = goalAnswers.audience_scope || 'icp'
      const buyer = goalAnswers.audience_buyer || 'decision'
      const audienceGoal = goalAnswers.audience_goal || 'outbound'

      const scopeLabelMap: Record<string, string> = {
        icp: 'define the core ICPs',
        segments: 'map sharper audience segments',
        lookalikes: 'identify adjacent lookalike audiences',
      }
      const buyerLabelMap: Record<string, string> = {
        decision: 'decision makers',
        operators: 'operators and day-to-day users',
        champions: 'internal champions and influencers',
      }
      const goalLabelMap: Record<string, string> = {
        outbound: 'improve outbound and lead generation',
        positioning: 'improve messaging and positioning',
        ads: 'improve paid targeting and audience selection',
      }

      params.audience_scope = scope
      params.audience_buyer = buyer
      params.audience_goal = audienceGoal
      params.question = `Help us ${scopeLabelMap[scope] || 'clarify target audiences'} around ${buyerLabelMap[buyer] || 'the selected buyer layer'} so we can ${goalLabelMap[audienceGoal] || 'unlock the desired audience outcome'}. Return the strongest audience profiles, the differences between them, the buying triggers, and the messaging implications we should use first.`
      return params
    }

    if (goal.moduleId === 'lead-outreach') {
      const channel = goalAnswers.outreach_channel || 'multi'
      const target = goalAnswers.outreach_target || 'decision'
      const outreachGoal = goalAnswers.outreach_goal || 'meeting'

      const channelLabelMap: Record<string, string> = {
        email: 'email-first outbound',
        linkedin: 'LinkedIn-first outreach',
        multi: 'multitouch outreach across email and LinkedIn',
      }
      const targetLabelMap: Record<string, string> = {
        decision: 'decision makers',
        champions: 'internal champions',
        warm: 'warm or already-engaged accounts',
      }
      const goalLabelMap: Record<string, string> = {
        meeting: 'book more meetings',
        reply: 'earn more replies',
        qualification: 'qualify interest faster',
      }

      params.outreach_channel = channel
      params.outreach_target = target
      params.outreach_goal = outreachGoal
      params.question = `Build a ${channelLabelMap[channel] || 'prospecting motion'} for ${targetLabelMap[target] || 'the selected prospects'} that should ${goalLabelMap[outreachGoal] || 'hit the main outreach outcome'}. Return the sequence arc, the personalization logic, and the first outreach messages we should send.`
      return params
    }

    if (goal.moduleId === 'lead-magnets') {
      const type = goalAnswers.magnet_type || 'guide'
      const audience = goalAnswers.magnet_audience || 'top_funnel'
      const magnetGoal = goalAnswers.magnet_goal || 'capture'

      const typeLabelMap: Record<string, string> = {
        guide: 'guide or playbook',
        checklist: 'checklist or template',
        calculator: 'framework or tool',
      }
      const audienceLabelMap: Record<string, string> = {
        top_funnel: 'top-of-funnel audience',
        consideration: 'in-market buyers',
        high_intent: 'high-intent prospects',
      }
      const goalLabelMap: Record<string, string> = {
        capture: 'capture more leads',
        qualify: 'improve lead quality',
        nurture: 'support nurture and follow-up',
      }

      params.magnet_type = type
      params.magnet_audience = audience
      params.magnet_goal = magnetGoal
      params.question = `Create a ${typeLabelMap[type] || 'lead magnet'} for ${audienceLabelMap[audience] || 'the selected audience'} that should ${goalLabelMap[magnetGoal] || 'hit the main conversion goal'}. Return the strongest concept, the content structure, the promise and hook, and the opt-in logic we should use first.`
      return params
    }

    if (goal.moduleId === 'marketing-audit') {
      const scope = goalAnswers.audit_scope || 'full'
      const priority = goalAnswers.audit_priority || 'quickwins'
      const context = goalAnswers.audit_context || 'analytics'

      const scopeLabelMap: Record<string, string> = {
        full: 'audit the full marketing stack',
        website: 'audit the website and funnel',
        growth: 'audit the growth and channel system',
      }
      const priorityLabelMap: Record<string, string> = {
        quickwins: 'surface the fastest high-leverage improvements',
        roadmap: 'build the clearest 30-60-90 day roadmap',
        score: 'produce the clearest score and diagnosis',
      }
      const contextLabelMap: Record<string, string> = {
        analytics: 'performance and analytics context',
        messaging: 'messaging and funnel context',
        operating: 'operating-model and execution context',
      }

      params.audit_scope = scope
      params.audit_priority = priority
      params.audit_context = context
      params.question = `Run a marketing audit that should ${scopeLabelMap[scope] || 'audit the current marketing system'} and ${priorityLabelMap[priority] || 'deliver the right outcome'}. Use ${contextLabelMap[context] || 'the selected context'} to identify the main gaps, the strongest quick wins, and the next actions we should prioritize.`
      return params
    }

    if (goal.moduleId === 'channel-health') {
      const scope = goalAnswers.channel_scope || 'all'
      const problem = goalAnswers.channel_problem || 'allocation'
      const horizon = goalAnswers.channel_horizon || 'week'

      const scopeLabelMap: Record<string, string> = {
        paid: 'review the paid channel mix',
        owned: 'review the owned and lifecycle channels',
        all: 'review the full distribution mix',
      }
      const problemLabelMap: Record<string, string> = {
        winners: 'surface what is working best',
        gaps: 'identify the weakest execution points',
        allocation: 'decide where to shift focus and budget',
      }
      const horizonLabelMap: Record<string, string> = {
        today: 'today',
        week: 'this week',
        month: 'this month',
      }

      params.channel_scope = scope
      params.channel_problem = problem
      params.channel_horizon = horizon
      params.question = `Check channel health so we can ${scopeLabelMap[scope] || 'review channel performance'} and ${problemLabelMap[problem] || 'understand the right moves'}. Use a ${horizonLabelMap[horizon] || 'near-term'} horizon and return the strongest channels, weak spots, and the next reallocation or execution actions.`
      return params
    }

    if (goal.moduleId === 'messaging') {
      const surface = goalAnswers.messaging_surface || 'website'
      const problem = goalAnswers.messaging_problem || 'unclear'
      const outcome = goalAnswers.messaging_goal || 'clarify'

      const surfaceLabelMap: Record<string, string> = {
        website: 'website or landing page',
        email: 'email or lifecycle messaging',
        ads: 'ads and campaign copy',
      }
      const problemLabelMap: Record<string, string> = {
        unclear: 'unclear value',
        weak: 'weak differentiation',
        conversion: 'poor conversion pull',
      }
      const goalLabelMap: Record<string, string> = {
        clarify: 'clarify the message',
        differentiate: 'differentiate more strongly',
        convert: 'drive more action',
      }

      params.messaging_surface = surface
      params.messaging_problem = problem
      params.messaging_goal = outcome
      params.question = `Sharpen our ${surfaceLabelMap[surface] || 'messaging'} because the current copy suffers from ${problemLabelMap[problem] || 'the main copy problem'}. Rework the message so it helps us ${goalLabelMap[outcome] || 'achieve the right outcome'}. Return the stronger message architecture, the main rewrites, and the best headline and CTA directions.`
      return params
    }

    if (goal.moduleId === 'launch-strategy') {
      const type = goalAnswers.launch_type || 'product'
      const audience = goalAnswers.launch_audience || 'market'
      const horizon = goalAnswers.launch_horizon || 'month'

      const typeLabelMap: Record<string, string> = {
        product: 'product or feature launch',
        campaign: 'campaign or offer launch',
        brand: 'brand or positioning launch',
      }
      const audienceLabelMap: Record<string, string> = {
        customers: 'existing customers',
        pipeline: 'leads and pipeline',
        market: 'a new market audience',
      }
      const horizonLabelMap: Record<string, string> = {
        week: 'one-week sprint',
        month: 'one-month launch arc',
        quarter: 'quarter-long launch program',
      }

      params.launch_type = type
      params.launch_audience = audience
      params.launch_horizon = horizon
      params.question = `Plan a ${typeLabelMap[type] || 'launch'} for ${audienceLabelMap[audience] || 'the selected audience'} using a ${horizonLabelMap[horizon] || 'practical launch window'}. Return the pre-launch, launch, and post-launch plan, the channels and asset sequence, the core message hierarchy, and the launch-ready copy assets we should prepare first.`
      return params
    }

    if (goal.moduleId === 'sales-enablement') {
      const asset = goalAnswers.sales_asset || 'one_pager'
      const audience = goalAnswers.sales_audience || 'sellers'
      const motion = goalAnswers.sales_motion || 'discovery'

      const assetLabelMap: Record<string, string> = {
        one_pager: 'buyer-facing one-pager',
        battlecard: 'competitive battle card',
        sequence: 'seller-ready outreach sequence',
      }
      const audienceLabelMap: Record<string, string> = {
        sellers: 'sales reps',
        buyers: 'buyers and prospects',
        leadership: 'sales leadership',
      }
      const motionLabelMap: Record<string, string> = {
        discovery: 'early discovery and qualification',
        competitive: 'active competitive deals',
        late_stage: 'late-stage close and decision movement',
      }

      params.sales_asset = asset
      params.sales_audience = audience
      params.sales_motion = motion
      params.question = `Build a ${assetLabelMap[asset] || 'sales enablement asset'} for ${audienceLabelMap[audience] || 'the selected audience'} to support ${motionLabelMap[motion] || 'the current sales motion'}. Return the strongest enablement structure, the main proof points and objection handling, and the seller-ready asset or sequence we should use first.`
      return params
    }

    if (goal.moduleId === 'positioning') {
      const focus = goalAnswers.positioning_focus || 'differentiate'
      const buyer = goalAnswers.positioning_buyer || 'execs'
      const outcome = goalAnswers.positioning_outcome || 'pipeline'

      const focusLabelMap: Record<string, string> = {
        differentiate: 'differentiate more clearly from competitors and generic alternatives',
        clarify: 'clarify the value and category fit',
        reframe: 'reframe the category story and own a sharper market angle',
      }
      const buyerLabelMap: Record<string, string> = {
        execs: 'executive buyers',
        operators: 'operators and functional users',
        technical: 'technical evaluators',
      }
      const outcomeLabelMap: Record<string, string> = {
        pipeline: 'create more pipeline and easier demand capture',
        sales: 'improve the sales motion and deal conversion',
        category: 'strengthen the market narrative and category story',
      }

      params.positioning_focus = focus
      params.positioning_buyer = buyer
      params.positioning_outcome = outcome
      params.question = `Clarify our positioning so we can ${focusLabelMap[focus] || 'sharpen the market story'} for ${buyerLabelMap[buyer] || 'the selected buyer'}. Return the strongest positioning angle, the message hierarchy, the points of differentiation, and the next strategic moves that help us ${outcomeLabelMap[outcome] || 'unlock the desired outcome'}.`
      return params
    }

    if (goal.moduleId === 'offer-design') {
      const problem = goalAnswers.offer_problem || 'clarity'
      const lever = goalAnswers.offer_lever || 'message'
      const goalOutcome = goalAnswers.offer_goal || 'value'

      const problemLabelMap: Record<string, string> = {
        clarity: 'solve weak offer clarity',
        pricing: 'remove pricing and packaging friction',
        cta: 'fix weak CTA pull and next-step ambiguity',
      }
      const leverLabelMap: Record<string, string> = {
        message: 'offer message and promise',
        package: 'packaging and value structure',
        action: 'CTA and conversion action',
      }
      const outcomeLabelMap: Record<string, string> = {
        leads: 'capture more leads',
        sales: 'improve close rate and deal movement',
        value: 'increase perceived value and conviction',
      }

      params.offer_problem = problem
      params.offer_lever = lever
      params.offer_goal = goalOutcome
      params.question = `Strengthen our offer so we can ${problemLabelMap[problem] || 'resolve the main offer problem'} through the ${leverLabelMap[lever] || 'offer structure'}. Return the strongest offer statement, the main friction points, the packaging or CTA fixes, and the next changes that help us ${outcomeLabelMap[goalOutcome] || 'unlock the desired outcome'}.`
      return params
    }

    if (goal.moduleId === 'landing-pages') {
      const pageType = goalAnswers.page_type || 'offer'
      const pageGoal = goalAnswers.page_goal || 'convert'
      const pageSource = goalAnswers.page_source || 'ads'

      const typeLabelMap: Record<string, string> = {
        offer: 'offer-focused landing page',
        campaign: 'campaign landing page',
        signup: 'signup or demo page',
      }
      const goalLabelMap: Record<string, string> = {
        convert: 'drive more conversions',
        qualify: 'qualify better-fit buyers',
        explain: 'explain the offer more clearly',
      }
      const sourceLabelMap: Record<string, string> = {
        ads: 'paid campaign traffic',
        email: 'email or lifecycle traffic',
        social: 'social and content traffic',
      }

      params.page_type = pageType
      params.page_goal = pageGoal
      params.page_source = pageSource
      params.question = `Build a ${typeLabelMap[pageType] || 'landing page'} that should ${goalLabelMap[pageGoal] || 'hit the desired page outcome'} for ${sourceLabelMap[pageSource] || 'the selected traffic source'}. Return the page structure, the conversion logic, the strongest section order, and the first copy direction we should use.`
      return params
    }

    if (goal.moduleId === 'performance-scorecard') {
      const connectorGroups: Record<string, string[]> = {
        full_funnel: ['ga4', 'gsc', 'youtube', 'facebook', 'instagram', 'linkedin', 'reddit'],
        web_search: ['ga4', 'gsc'],
        social_video: ['youtube', 'facebook', 'instagram', 'linkedin', 'reddit'],
      }
      const questionMap: Record<string, string> = {
        winners: 'Identify the highest-performing channels, content types, and standout wins from the selected timeframe.',
        dropoffs: 'Find the biggest performance drop-offs, weak channels, and content that is underperforming, with likely causes.',
        next_moves: 'Explain what is working, what is underperforming, and the next actions we should take by channel.',
      }

      const selectedConnectors = connectorGroups[goalAnswers.performance_scope] || connectorGroups.full_funnel
      if (goalAnswers.performance_timeframe) params.timeframe = goalAnswers.performance_timeframe
      if (selectedConnectors.length) params.connectors = selectedConnectors.join(',')
      params.question = questionMap[goalAnswers.performance_focus] || 'What is working across our connected channels, what is underperforming, and what should we do next?'
      return params
    }

    if (goal.moduleId === 'cro') {
      const surfaceTabMap: Record<string, string> = {
        landing: 'page',
        form: 'forms',
        signup: 'signup',
      }
      const questionMap: Record<string, string> = {
        more_conversions: 'Find the biggest friction points reducing conversion rate, then recommend the highest-impact fixes and experiments.',
        better_quality: 'Improve conversion quality by identifying weak intent signals, poor qualification points, and the changes needed to improve lead or signup quality.',
        faster_learning: 'Set up the clearest experiment roadmap to learn faster, including the first tests, hypotheses, and UX or copy changes to validate.',
      }

      if (goalAnswers.surface) params.tab = surfaceTabMap[goalAnswers.surface] || 'page'
      params.question = questionMap[goalAnswers.goal] || 'Find the highest-friction drop-off points and recommend the clearest next CRO actions.'
      return params
    }

    if (goal.moduleId === 'churn-prevention') {
      const segmentPromptMap: Record<string, string> = {
        new: 'Focus on new customers who are failing to activate or form a strong early habit.',
        at_risk: 'Focus on existing customers showing churn risk or declining engagement.',
        churned: 'Focus on users who have already churned and the best win-back angles.',
      }
      const playPromptMap: Record<string, string> = {
        messaging: 'Prioritise lifecycle messaging, save-touch copy, and re-engagement communication.',
        offers: 'Prioritise save offers, pauses, downgrades, and retention incentives.',
        journeys: 'Prioritise lifecycle journeys, retention triggers, and multi-step reactivation plays.',
      }

      params.question = [
        segmentPromptMap[goalAnswers.segment] || 'Focus on the highest-risk customer segment first.',
        playPromptMap[goalAnswers.play] || 'Prioritise the strongest retention intervention.',
        'Diagnose the main churn signals, segment the risk, and recommend the clearest next retention actions.',
      ].join(' ')
      if (goalAnswers.segment) params.segment = goalAnswers.segment
      if (goalAnswers.play) params.play = goalAnswers.play
      return params
    }

    if (goal.moduleId === 'user-engagement') {
      const segmentPromptMap: Record<string, string> = {
        new_users: 'Focus on new users who are not activating or reaching value quickly enough.',
        active_users: 'Focus on active users who need stronger repeat usage, feature adoption, or habit formation.',
        dormant_users: 'Focus on dormant users who are losing momentum and need a re-engagement path.',
      }
      const problemPromptMap: Record<string, string> = {
        activation: 'Diagnose the main activation blockers and what is preventing early habit formation.',
        habit: 'Diagnose why repeat usage is weak and what would increase ongoing engagement.',
        dropoff: 'Diagnose where users are dropping off and what re-engagement or lifecycle interventions would recover them.',
      }
      const motionPromptMap: Record<string, string> = {
        onboarding: 'Prioritise improvements to the onboarding journey, first-run flow, and time-to-value.',
        lifecycle: 'Prioritise lifecycle messaging, ongoing nudges, and coordinated engagement touchpoints.',
        reactivation: 'Prioritise the reactivation sequence, comeback prompts, and recovery messaging.',
      }
      const channelPromptMap: Record<string, string> = {
        email: 'Use email and lifecycle systems as the first engagement channel.',
        product: 'Use in-product prompts, usage triggers, and product moments as the first engagement channel.',
        mixed: 'Coordinate email and in-product engagement as one combined motion.',
      }
      const selectedConnectors = (() => {
        switch (goalAnswers.engagement_channel) {
          case 'email':
            return ['mailchimp', 'klaviyo']
          case 'product':
            return ['ga4', 'hubspot']
          case 'mixed':
            return ['ga4', 'mailchimp', 'klaviyo', 'hubspot']
          default:
            return ['ga4', 'mailchimp', 'hubspot']
        }
      })()

      params.question = [
        segmentPromptMap[goalAnswers.engagement_segment] || 'Focus on the user segment that most needs stronger engagement.',
        problemPromptMap[goalAnswers.engagement_problem] || 'Diagnose the clearest engagement friction in the current journey.',
        motionPromptMap[goalAnswers.engagement_motion] || 'Recommend the strongest activation, lifecycle, or re-engagement play.',
        channelPromptMap[goalAnswers.engagement_channel] || 'Use the available engagement channels to design the first intervention.',
      ].join(' ')
      if (goalAnswers.engagement_segment) params.engagement_segment = goalAnswers.engagement_segment
      if (goalAnswers.engagement_problem) params.engagement_problem = goalAnswers.engagement_problem
      if (goalAnswers.engagement_motion) params.engagement_motion = goalAnswers.engagement_motion
      if (goalAnswers.engagement_channel) params.engagement_channel = goalAnswers.engagement_channel
      if (selectedConnectors.length) params.connectors = selectedConnectors.join(',')
      return params
    }

    if (goal.moduleId === 'unified-customer-view') {
      const viewPromptMap: Record<string, string> = {
        segments: 'Build a clear customer segmentation view based on behaviour, lifecycle state, and value.',
        risk: 'Build a customer-risk view that highlights churn signals, declining engagement, and save opportunities.',
        opportunities: 'Build a customer-opportunity view that highlights expansion, referral, and growth opportunities.',
      }
      const questionPromptMap: Record<string, string> = {
        what_changed: 'Explain what changed in customer behaviour, lifecycle state, or engagement.',
        who_matters: 'Identify which customer segments matter most right now and why.',
        what_next: 'Turn the customer view into clear actions by segment.',
      }
      const systemsPromptMap: Record<string, string> = {
        crm_lifecycle: 'Prioritise CRM, lifecycle, and messaging systems as the main source of truth.',
        analytics: 'Prioritise analytics, usage, and cohort signals as the main source of truth.',
        full_view: 'Combine CRM, lifecycle, analytics, and spreadsheet context into one customer view.',
      }
      const selectedConnectors = (() => {
        switch (goalAnswers.customer_view_systems) {
          case 'crm_lifecycle':
            return ['hubspot', 'zoho_crm', 'mailchimp', 'klaviyo']
          case 'analytics':
            return ['ga4', 'google_sheets']
          case 'full_view':
            return ['hubspot', 'zoho_crm', 'mailchimp', 'klaviyo', 'ga4', 'google_sheets']
          default:
            return ['hubspot', 'mailchimp', 'ga4']
        }
      })()

      params.question = [
        viewPromptMap[goalAnswers.customer_view_type] || 'Build the clearest customer view for the business right now.',
        questionPromptMap[goalAnswers.customer_view_question] || 'Explain what matters and what actions should follow.',
        systemsPromptMap[goalAnswers.customer_view_systems] || 'Use the strongest connected systems available as the basis for the view.',
      ].join(' ')
      if (goalAnswers.customer_view_type) params.customer_view_type = goalAnswers.customer_view_type
      if (goalAnswers.customer_view_question) params.customer_view_question = goalAnswers.customer_view_question
      if (goalAnswers.customer_view_systems) params.customer_view_systems = goalAnswers.customer_view_systems
      if (selectedConnectors.length) params.connectors = selectedConnectors.join(',')
      return params
    }

    if (goal.moduleId === 'revenue-ops') {
      const problemPromptMap: Record<string, string> = {
        routing: 'Diagnose the lead-routing logic, ownership rules, and where leads are being misrouted or delayed.',
        qualification: 'Diagnose the qualification model, stage definitions, and how MQL, SQL, or handoff rules should be tightened.',
        pipeline: 'Diagnose pipeline hygiene, stale stage behaviour, and weak process discipline across the funnel.',
      }
      const breakdownPromptMap: Record<string, string> = {
        marketing_to_sales: 'Focus on the handoff between marketing and sales and the points where leads lose momentum.',
        sales_process: 'Focus on the internal sales process, stage progression, and deals that stall or slip.',
        full_funnel: 'Review the full funnel from inquiry to pipeline progression and identify the biggest operational gaps.',
      }
      const systemsPromptMap: Record<string, string> = {
        crm: 'Use CRM data as the main source of truth for this revops diagnosis.',
        analytics: 'Use analytics and funnel conversion data as the main source of truth for this revops diagnosis.',
        combined: 'Use a combined CRM, analytics, and spreadsheet view for this revops diagnosis.',
      }
      const selectedConnectors = (() => {
        switch (goalAnswers.revops_systems) {
          case 'crm':
            return ['hubspot', 'zoho_crm']
          case 'analytics':
            return ['ga4', 'google_sheets']
          case 'combined':
            return ['hubspot', 'zoho_crm', 'ga4', 'google_sheets']
          default:
            return ['hubspot', 'ga4']
        }
      })()

      params.question = [
        problemPromptMap[goalAnswers.revops_problem] || 'Diagnose the highest-priority revenue-operations issue in the current funnel.',
        breakdownPromptMap[goalAnswers.revops_breakdown] || 'Identify where the lifecycle is breaking down and why.',
        systemsPromptMap[goalAnswers.revops_systems] || 'Use the strongest connected systems available to explain the problem and next fixes.',
      ].join(' ')
      if (goalAnswers.revops_problem) params.revops_problem = goalAnswers.revops_problem
      if (goalAnswers.revops_breakdown) params.revops_breakdown = goalAnswers.revops_breakdown
      if (goalAnswers.revops_systems) params.revops_systems = goalAnswers.revops_systems
      if (selectedConnectors.length) params.connectors = selectedConnectors.join(',')
      return params
    }

    if (goal.moduleId === 'market-signals') {
      const focusPromptMap: Record<string, string> = {
        competitors: 'Show the most important competitor moves, launches, pricing changes, and visible campaigns we should pay attention to.',
        demand: 'Show the clearest buyer-demand shifts, category momentum changes, and pain signals emerging in the market.',
        positioning: 'Find the strongest positioning gaps, messaging vulnerabilities, and market angles we should consider owning.',
      }
      const shiftPromptMap: Record<string, string> = {
        new_moves: 'Prioritize fresh moves from the last 30 days.',
        buyer_change: 'Prioritize signs that buyer concerns or urgency are changing.',
        white_space: 'Prioritize under-served angles and response opportunities.',
      }
      const scopePromptMap: Record<string, string> = {
        direct_market: 'Keep the scan focused on direct competitors and the core category.',
        category: 'Include category shifts and adjacent players where helpful.',
        full_landscape: 'Combine direct competitors, category changes, and buyer-signal shifts together.',
      }
      const selectedConnectors = (() => {
        const set = new Set<string>()
        if (goalAnswers.market_focus === 'competitors' || goalAnswers.market_focus === 'positioning' || !goalAnswers.market_focus) {
          set.add('semrush')
          set.add('ahrefs')
        }
        if (goalAnswers.market_shift === 'buyer_change' || goalAnswers.market_scope === 'full_landscape' || !goalAnswers.market_shift) {
          set.add('linkedin')
          set.add('reddit')
        }
        return Array.from(set)
      })()

      params.question = [
        focusPromptMap[goalAnswers.market_focus] || 'Explain what is shifting in our market and what we should respond to next.',
        shiftPromptMap[goalAnswers.market_shift] || 'Prioritize the most actionable changes first.',
        scopePromptMap[goalAnswers.market_scope] || 'Use the broadest relevant market view.',
      ].join(' ')
      if (goalAnswers.market_focus) params.market_focus = goalAnswers.market_focus
      if (goalAnswers.market_shift) params.market_shift = goalAnswers.market_shift
      if (goalAnswers.market_scope) params.market_scope = goalAnswers.market_scope
      if (selectedConnectors.length) params.connectors = selectedConnectors.join(',')
      return params
    }

    if (goal.moduleId === 'referral-program') {
      const whoPromptMap: Record<string, string> = {
        customers: 'Focus on happy customers who are already seeing value and are most likely to refer others.',
        champions: 'Focus on highly engaged champions, promoters, and power users who already advocate for the product.',
        partners: 'Focus on partners, affiliates, or ecosystem allies who can drive a more structured referral motion.',
      }
      const playPromptMap: Record<string, string> = {
        invite_loop: 'Design a repeatable invite loop that makes referring simple, measurable, and easy to share.',
        post_purchase: 'Design a post-purchase or post-activation referral ask that appears at the strongest success moment.',
        win_back: 'Design a referral-led win-back or expansion motion that reactivates or expands existing users.',
      }
      const incentivePromptMap: Record<string, string> = {
        double_sided: 'Use a double-sided incentive where both the advocate and the referred user benefit.',
        advocate_only: 'Use a simple advocate-only reward with clear economics and payout logic.',
        non_cash: 'Use a non-cash incentive like credits, upgrades, access, or recognition instead of cash.',
      }
      const channelPromptMap: Record<string, string> = {
        email: 'Launch first through lifecycle email and owned nurture touchpoints.',
        in_product: 'Launch first inside the product journey with prompts and a clear referral mechanism.',
        social: 'Launch first through social-sharing flows and channel-ready share assets.',
        crm: 'Launch first through CRM-led outreach and segmented customer or partner lists.',
      }
      const selectedConnectors = (() => {
        switch (goalAnswers.referral_channel) {
          case 'email':
            return ['mailchimp', 'klaviyo']
          case 'social':
            return ['linkedin', 'facebook', 'instagram']
          case 'crm':
            return ['hubspot', 'zoho_crm']
          case 'in_product':
            return ['hubspot', 'mailchimp']
          default:
            return ['hubspot', 'mailchimp']
        }
      })()

      params.question = [
        whoPromptMap[goalAnswers.referral_who] || 'Focus on the segment most likely to refer successfully.',
        playPromptMap[goalAnswers.referral_play] || 'Design the strongest referral motion for that segment.',
        incentivePromptMap[goalAnswers.referral_incentive] || 'Recommend the right referral incentive structure and reward economics.',
        channelPromptMap[goalAnswers.referral_channel] || 'Choose the strongest first channel to launch and measure the program.',
      ].join(' ')
      if (goalAnswers.referral_who) params.referral_who = goalAnswers.referral_who
      if (goalAnswers.referral_play) params.referral_play = goalAnswers.referral_play
      if (goalAnswers.referral_incentive) params.referral_incentive = goalAnswers.referral_incentive
      if (goalAnswers.referral_channel) params.referral_channel = goalAnswers.referral_channel
      if (selectedConnectors.length) params.connectors = selectedConnectors.join(',')
      return params
    }

    if (goal.moduleId === 'ai-content') {
      const format = goalAnswers.format
      const channel = goalAnswers.channel
      const objective = goalAnswers.objective
      const deliverable = goalAnswers.deliverable

      if (format === 'image') params.content_type = 'image'
      else if (format === 'video') {
        const prefersAvatar = channel === 'linkedin' || channel === 'email'
        params.content_type = prefersAvatar ? 'video-avatar' : 'video-faceless'
      } else if (channel === 'email') {
        params.content_type = 'email'
      } else {
        params.content_type = 'post'
      }

      if (format) params.content_format = format
      if (channel) params.content_channel = channel
      if (objective) params.content_objective = objective
      if (deliverable) params.content_deliverable = deliverable
      return params
    }

    if (goal.moduleId === 'social-calendar') {
      const channelMap: Record<string, string[]> = {
        linkedin: ['linkedin'],
        instagram: ['instagram', 'facebook'],
        multi: ['linkedin', 'instagram', 'facebook', 'youtube'],
      }
      const channel = goalAnswers.calendar_channels || 'multi'
      const motion = goalAnswers.calendar_motion || 'education'
      const horizon = goalAnswers.calendar_horizon || 'month'

      params.calendar_channels = channel
      params.calendar_motion = motion
      params.calendar_horizon = horizon
      params.connectors = (channelMap[channel] || channelMap.multi).join(',')
      params.question = `Build a ${horizon.replace(/_/g, ' ')} social calendar focused on ${motion.replace(/_/g, ' ')} across ${channel === 'multi' ? 'the main social channels' : channel}. Return the publishing rhythm, channel-by-channel mix, content pillars, and the first posts we should ship.`
      return params
    }

    if (goal.moduleId === 'social-media') {
      const channelMap: Record<string, string[]> = {
        linkedin: ['linkedin'],
        meta: ['facebook', 'instagram'],
        youtube: ['youtube'],
        multi: ['linkedin', 'facebook', 'instagram', 'youtube', 'reddit'],
      }
      const formatMap: Record<string, string> = {
        posts: 'image',
        visuals: 'image',
        video: 'video',
      }

      if (goalAnswers.social_channels) params.social_channels = channelMap[goalAnswers.social_channels]?.join(',') || goalAnswers.social_channels
      if (goalAnswers.social_objective) params.social_objective = goalAnswers.social_objective
      if (goalAnswers.social_format) params.social_format = formatMap[goalAnswers.social_format] || goalAnswers.social_format
      if (goalAnswers.social_horizon) params.social_horizon = goalAnswers.social_horizon
      return params
    }

    if (goal.moduleId !== 'lead-intelligence') return params

    const leadType = goalAnswers.lead_type
    const priority = goalAnswers.priority
    const source = goalAnswers.source
    const missingFields = goalAnswers.missing_fields

    if (leadType) params.lead_type = leadType
    if (priority) params.priority = priority
    if (source) params.source = source
    if (missingFields) params.missing_fields = missingFields
    if (leadType === 'existing' && !params.tab) params.tab = 'enrich'

    return params
  }

  useEffect(() => {
    if (!companyId) {
      setConnectors([])
      return
    }

    let cancelled = false
    fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setConnectors(Array.isArray(json?.connectors) ? json.connectors : [])
        }
      })
      .catch(() => {
        if (!cancelled) setConnectors([])
      })

    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    if (!companyId) {
      setMkg(null)
      return
    }

    let cancelled = false
    fetch(`/api/mkg/${encodeURIComponent(companyId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setMkg((json?.mkg as MkgRecord) || null)
        }
      })
      .catch(() => {
        if (!cancelled) setMkg(null)
      })

    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'composio_oauth_success') return
      setConnectorActionId(null)
      if (!companyId) return
      fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
        .then((res) => res.json())
        .then((json) => setConnectors(Array.isArray(json?.connectors) ? json.connectors : []))
        .catch(() => {})
      toast.success('Account connected successfully')
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [companyId])

  const getGoalKey = (goal: GoalTarget) => `${goal.moduleId}:${goal.title}`

  const resolveGoalRequirement = (goal: GoalTarget): GoalRequirementNotice | null => {
    if (!companyId) {
      return {
        goalKey: getGoalKey(goal),
        title: 'Select a workspace first',
        description: 'Goals run against the active workspace. Pick or create one before starting.',
        ctaLabel: 'Open Setup',
        moduleId: 'setup',
        blocking: true,
      }
    }

    const requiresWebsite = new Set([
      'paid-ads',
      'ad-creative',
      'ai-content',
      'seo-llmo',
      'company-intelligence',
      'positioning',
      'launch-strategy',
      'sales-enablement',
      'marketing-audit',
      'lead-magnets',
    ])

    if (!websiteUrl && requiresWebsite.has(goal.moduleId)) {
      return {
        goalKey: getGoalKey(goal),
        title: 'Add your company website first',
        description: 'This goal works best after onboarding captures your website so Veena can personalize the workflow.',
        ctaLabel: 'Open Setup',
        moduleId: 'setup',
        blocking: false,
      }
    }

    return null
  }

  const inferGoalAnswers = (goal: GoalTarget): Record<string, string> => {
    const answers: Record<string, string> = {}

    if (goal.moduleId === 'paid-ads' || goal.moduleId === 'ad-creative' || goal.moduleId === 'budget-optimization') {
      if (preferredChannels.some((channel) => channel.includes('google'))) answers.channel = 'google'
      else if (preferredChannels.some((channel) => channel.includes('linkedin'))) answers.channel = 'linkedin'
      else if (preferredChannels.some((channel) => channel.includes('meta') || channel.includes('facebook') || channel.includes('instagram'))) answers.channel = 'meta'
      if (goal.moduleId === 'budget-optimization' && !answers.timeframe) answers.timeframe = 'last_30_days'
      if (goal.moduleId === 'budget-optimization' && hasCompetitorContext) answers.focus = 'waste'
    }

    if (goal.moduleId === 'lead-intelligence') {
      if (goal.hashParams?.tab === 'enrich') answers.lead_type = 'existing'
      else if (hasICPContext) answers.lead_type = 'companies'
    }

    if (goal.moduleId === 'ai-content' && hasMessagingContext) {
      answers.format = 'text'
    }

    if (goal.moduleId === 'churn-prevention' && hasMessagingContext) {
      answers.play = 'messaging'
    }

    if (goal.moduleId === 'cro' && companyPositioning) {
      answers.goal = 'more_conversions'
    }

    return answers
  }

  const personalizeGoalConfig = (goal: GoalTarget, config: GoalIntakeConfig): GoalIntakeConfig => {
    const nextQuestions = config.questions.map((question) => ({
      ...question,
      options: [...question.options],
    }))

    if (goal.moduleId === 'lead-intelligence' && goal.hashParams?.tab !== 'enrich') {
      const leadTypeQuestion = nextQuestions.find((question) => question.id === 'lead_type')
      const priorityQuestion = nextQuestions.find((question) => question.id === 'priority')

      if (leadTypeQuestion && hasICPContext) {
        leadTypeQuestion.prompt = 'What should we focus on first?'
        leadTypeQuestion.options = [
          { id: 'companies', label: 'ICP-fit accounts', description: 'Start from companies that match the current ICP signal.' },
          { id: 'buyers', label: 'Buying roles', description: 'Go straight to decision-makers inside those accounts.' },
          { id: 'existing', label: 'Existing list', description: 'Work from a list you already have and sharpen it.' },
        ]
      }

      if (priorityQuestion && connectedLeadStack.length > 0) {
        priorityQuestion.prompt = 'What matters most for this run?'
      }
    }

    if (goal.moduleId === 'lead-intelligence' && goal.hashParams?.tab === 'enrich') {
      const sourceQuestion = nextQuestions.find((question) => question.id === 'source')
      if (sourceQuestion && connectedConnectorIds.includes('hubspot')) {
        sourceQuestion.prompt = 'Where is the lead list coming from?'
        sourceQuestion.options = [
          { id: 'crm', label: 'CRM records', description: 'Use the leads already sitting in your CRM.' },
          { id: 'csv', label: 'Spreadsheet export', description: 'Upload or paste a lead list you already have.' },
          { id: 'mixed', label: 'Mixed source list', description: 'Combine manual leads, exports, and ad-hoc lists.' },
        ]
      }
    }

    if (goal.moduleId === 'paid-ads') {
      const channelQuestion = nextQuestions.find((question) => question.id === 'channel')
      if (channelQuestion && preferredChannelLabels.length > 0) {
        channelQuestion.prompt = 'Which channel should we prioritize first?'
        channelQuestion.options.sort((a, b) => {
          const aMatch = preferredChannels.some((channel) => channel.includes(a.id))
          const bMatch = preferredChannels.some((channel) => channel.includes(b.id))
          return Number(bMatch) - Number(aMatch)
        })
      }
    }

    if (goal.moduleId === 'ad-creative') {
      const formatQuestion = nextQuestions.find((question) => question.id === 'format')
      const platformQuestion = nextQuestions.find((question) => question.id === 'platform')
      if (formatQuestion && hasMessagingContext) {
        formatQuestion.prompt = 'What do you want to create first?'
        formatQuestion.options = [
          { id: 'angles', label: 'Creative angles', description: 'Turn current positioning into sharper campaign hooks.' },
          { id: 'copy', label: 'Ad copy', description: 'Write channel-ready headlines, descriptions, and body copy.' },
          { id: 'variants', label: 'Test variants', description: 'Create multiple structured options for experimentation.' },
        ]
      }
      if (platformQuestion && preferredChannelLabels.length > 0) {
        platformQuestion.prompt = 'Where will this creative run first?'
        platformQuestion.options.sort((a, b) => {
          const aMatch = preferredChannels.some((channel) => channel.includes(a.id))
          const bMatch = preferredChannels.some((channel) => channel.includes(b.id))
          return Number(bMatch) - Number(aMatch)
        })
      }
    }

    if (goal.moduleId === 'budget-optimization') {
      const channelQuestion = nextQuestions.find((question) => question.id === 'channel')
      const focusQuestion = nextQuestions.find((question) => question.id === 'focus')
      if (channelQuestion && preferredChannelLabels.length > 0) {
        channelQuestion.options.sort((a, b) => {
          const aMatch = a.id === 'both' || preferredChannels.some((channel) => channel.includes(a.id))
          const bMatch = b.id === 'both' || preferredChannels.some((channel) => channel.includes(b.id))
          return Number(bMatch) - Number(aMatch)
        })
      }
      if (focusQuestion && preferredChannelLabels.length > 0) {
        focusQuestion.prompt = 'Where should we look for ROAS gains first?'
      }
    }

    if (goal.moduleId === 'ai-content') {
      const formatQuestion = nextQuestions.find((question) => question.id === 'format')
      const channelQuestion = nextQuestions.find((question) => question.id === 'channel')
      const objectiveQuestion = nextQuestions.find((question) => question.id === 'objective')
      const deliverableQuestion = nextQuestions.find((question) => question.id === 'deliverable')

      if (formatQuestion && preferredChannelLabels.length > 0) {
        formatQuestion.prompt = 'What should we create first?'
      }
      if (channelQuestion && preferredChannelLabels.length > 0) {
        channelQuestion.prompt = 'Which channel should we prepare content for first?'
        channelQuestion.options.sort((a, b) => {
          const normalize = (value: string) => value.replace('_', ' ')
          const aMatch = preferredChannels.some((channel) => normalize(a.id).includes(channel) || channel.includes(a.id))
          const bMatch = preferredChannels.some((channel) => normalize(b.id).includes(channel) || channel.includes(b.id))
          return Number(bMatch) - Number(aMatch)
        })
      }
      if (objectiveQuestion && hasMessagingContext) {
        objectiveQuestion.prompt = 'What should this content do first?'
      }
      if (deliverableQuestion) {
        const selectedFormat = goalAnswers.format
        const selectedChannel = goalAnswers.channel

        if (selectedFormat === 'text' && selectedChannel === 'website_blog') {
          deliverableQuestion.prompt = 'What written asset should we make first?'
          deliverableQuestion.options = [
            { id: 'blog_article', label: 'Blog article', description: 'Create an article meant for content publishing and SEO.' },
            { id: 'landing_page', label: 'Landing page copy', description: 'Create a conversion-focused page draft for an offer or campaign.' },
            { id: 'seo_page', label: 'SEO page draft', description: 'Create a discoverability-focused page around search demand.' },
          ]
        } else if (selectedFormat === 'text' && selectedChannel === 'linkedin') {
          deliverableQuestion.prompt = 'What LinkedIn asset should we make first?'
          deliverableQuestion.options = [
            { id: 'linkedin_post', label: 'LinkedIn post', description: 'Create a standard post draft with hook and CTA.' },
            { id: 'linkedin_carousel', label: 'Carousel outline', description: 'Create slide-by-slide copy for a carousel post.' },
            { id: 'linkedin_article', label: 'LinkedIn article', description: 'Create a longer thought-leadership draft.' },
          ]
        } else if (selectedFormat === 'text' && selectedChannel === 'email') {
          deliverableQuestion.prompt = 'What email asset should we make first?'
          deliverableQuestion.options = [
            { id: 'campaign_email', label: 'Campaign email', description: 'Create a one-off outbound or launch email.' },
            { id: 'nurture_email', label: 'Nurture email', description: 'Create a lifecycle or follow-up email draft.' },
            { id: 'newsletter', label: 'Newsletter', description: 'Create a broader newsletter-style email.' },
          ]
        } else if (selectedFormat === 'image') {
          deliverableQuestion.prompt = 'What visual asset should we make first?'
          deliverableQuestion.options = [
            { id: 'static_visual', label: 'Static graphic', description: 'Create a single visual asset for the chosen channel.' },
            { id: 'carousel_visual', label: 'Carousel visual', description: 'Create a multi-frame visual concept.' },
            { id: 'banner_visual', label: 'Banner or header', description: 'Create a wider visual for profile, campaign, or page use.' },
          ]
        } else if (selectedFormat === 'video' && selectedChannel === 'youtube') {
          deliverableQuestion.prompt = 'What video asset should we make first?'
          deliverableQuestion.options = [
            { id: 'youtube_explainer', label: 'YouTube explainer', description: 'Create a longer-form explainer or walkthrough.' },
            { id: 'youtube_short', label: 'YouTube short', description: 'Create a short-form video concept.' },
            { id: 'promo_video', label: 'Promo video', description: 'Create a campaign-style promo asset.' },
          ]
        } else if (selectedFormat === 'video') {
          deliverableQuestion.prompt = 'What video asset should we make first?'
          deliverableQuestion.options = [
            { id: 'social_video', label: 'Social video', description: 'Create a short channel-native video asset.' },
            { id: 'promo_video', label: 'Promo video', description: 'Create a product or offer promo concept.' },
            { id: 'explainer_video', label: 'Explainer video', description: 'Create a more structured narrative asset.' },
          ]
        }
      }
    }

    if (goal.moduleId === 'churn-prevention') {
      const segmentQuestion = nextQuestions.find((question) => question.id === 'segment')
      const playQuestion = nextQuestions.find((question) => question.id === 'play')
      if (segmentQuestion && hasCompetitorContext) {
        segmentQuestion.prompt = 'Which customer segment needs attention first?'
      }
      if (playQuestion && hasMessagingContext) {
        playQuestion.prompt = 'Where should we intervene first?'
        playQuestion.options = [
          { id: 'messaging', label: 'Lifecycle messaging', description: 'Tighten save-touch, nurture, and reactivation copy.' },
          { id: 'journeys', label: 'Lifecycle journeys', description: 'Change the actual sequence and timing of retention touches.' },
          { id: 'offers', label: 'Offers and saves', description: 'Introduce pauses, downgrades, or incentive-based retention.' },
        ]
      }
    }

    return {
      ...config,
      questions: nextQuestions,
    }
  }

  const openGoalIntake = (goal: GoalTarget) => {
    const intake = getGoalIntakeConfig(goal)
    const inferredAnswers = inferGoalAnswers(goal)
    const defaults = Object.fromEntries(
      intake.questions
        .filter((question) => question.options[0])
        .map((question) => [question.id, question.options[0].id])
    )

    setSelectedGoal(goal)
    setGoalAnswers({ ...defaults, ...inferredAnswers })
    setIntakeStep(0)
  }

  const closeGoalIntake = () => {
    setSelectedGoal(null)
    setGoalAnswers({})
    setIntakeStep(0)
  }

  const handleGoalSelect = (goal: GoalTarget) => {
    openGoalIntake(goal)
  }

  const resolveWorkflowDestination = (workflow: ActiveWorkflow): { moduleId: string; hashParams?: Record<string, string> } | null => {
    if (workflow.moduleId) {
      return { moduleId: workflow.moduleId, hashParams: workflow.hashParams }
    }

    const descriptor = `${workflow.goal} ${workflow.workflow_name}`.toLowerCase()
    if (descriptor.includes('lead')) return { moduleId: 'lead-intelligence', hashParams: { tab: 'fetch' } }
    if (descriptor.includes('ad') || descriptor.includes('campaign')) return { moduleId: 'paid-ads', hashParams: { tab: 'create' } }
    if (descriptor.includes('social')) return { moduleId: 'social-media' }
    if (descriptor.includes('content')) return { moduleId: 'ai-content' }
    if (descriptor.includes('convert') || descriptor.includes('cro')) return { moduleId: 'cro' }
    if (descriptor.includes('retain') || descriptor.includes('churn')) return { moduleId: 'churn-prevention' }
    if (descriptor.includes('performance') || descriptor.includes('budget')) return { moduleId: 'budget-optimization' }
    return null
  }

  const getConnectorStatus = (label: string) => {
    const connectorId = CONNECTOR_LABEL_TO_ID[label]
    if (!connectorId) return null
    return connectors.find((connector) => connector.id === connectorId) || null
  }

  const resolveContentGoalConnectors = () => {
    if (!selectedGoal || selectedGoal.moduleId !== 'ai-content') return selectedGoalConfig?.connectors || []

    const format = goalAnswers.format || 'text'
    const channel = goalAnswers.channel || 'website_blog'
    const connectorSet = new Set<string>()

    if (format === 'text') {
      if (channel === 'website_blog') {
        connectorSet.add('Semrush')
        connectorSet.add('Ahrefs')
        connectorSet.add('WordPress')
      } else if (channel === 'linkedin') {
        connectorSet.add('LinkedIn')
      } else if (channel === 'facebook_instagram') {
        connectorSet.add('Facebook')
        connectorSet.add('Instagram')
      } else if (channel === 'youtube') {
        connectorSet.add('YouTube')
      } else if (channel === 'email') {
        connectorSet.add('Email platform')
      }
    }

    if (format === 'image') {
      connectorSet.add('Canva')
      if (channel === 'linkedin') connectorSet.add('LinkedIn')
      if (channel === 'facebook_instagram') {
        connectorSet.add('Facebook')
        connectorSet.add('Instagram')
      }
    }

    if (format === 'video') {
      connectorSet.add('HeyGen')
      connectorSet.add('ElevenLabs')
      connectorSet.add('Veo')
      if (channel === 'linkedin') connectorSet.add('LinkedIn')
      if (channel === 'facebook_instagram') {
        connectorSet.add('Facebook')
        connectorSet.add('Instagram')
      }
      if (channel === 'youtube') connectorSet.add('YouTube')
    }

    return Array.from(connectorSet)
  }

  const connectConnector = async (label: string) => {
    const connectorId = CONNECTOR_LABEL_TO_ID[label]
    if (!connectorId) {
      toast.info(`${label} can be connected from Setup`)
      return
    }
    if (!companyId) {
      toast.error('Select a workspace to connect integrations')
      return
    }

    setConnectorActionId(connectorId)
    try {
      const res = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, connectorId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'connect failed')

      if (json.redirectUrl) {
        const popup = window.open(json.redirectUrl, 'composio_oauth', 'width=600,height=700,left=200,top=100')
        toast.info('Complete the connection in the popup window')
        const poll = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(poll)
            setConnectorActionId(null)
            fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
              .then((refreshRes) => refreshRes.json())
              .then((refreshJson) => setConnectors(Array.isArray(refreshJson?.connectors) ? refreshJson.connectors : []))
              .catch(() => {})
          }
        }, 1500)
      } else {
        const refreshRes = await fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
        const refreshJson = await refreshRes.json().catch(() => ({}))
        setConnectors(Array.isArray(refreshJson?.connectors) ? refreshJson.connectors : [])
        toast.success('Connected')
        setConnectorActionId(null)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Connect failed')
      setConnectorActionId(null)
    }
  }

  const groupedGoalResults = GOAL_CATALOG_GROUPS.map((group) => ({
    ...group,
    filteredGoals: group.goals.filter((goal) => {
      const query = goalSearch.trim().toLowerCase()
      if (!query) return true
      return `${goal.title} ${goal.description}`.toLowerCase().includes(query)
    }),
  })).filter((group) => group.filteredGoals.length > 0)

  const connectedConnectorIds = connectors
    .filter((connector) => connector.connected || connector.status === 'active')
    .map((connector) => connector.id)
  const preferredChannels = normalizeList(getMkgValue(mkg, 'channels')).map((item) => item.toLowerCase())
  const hasICPContext = Boolean(getMkgValue(mkg, 'icp'))
  const hasMessagingContext = Boolean(getMkgValue(mkg, 'messaging'))
  const hasCompetitorContext = Boolean(getMkgValue(mkg, 'competitors'))
  const companyPositioning = typeof getMkgValue(mkg, 'positioning') === 'string' ? String(getMkgValue(mkg, 'positioning')) : ''
  const preferredChannelLabels = preferredChannels.slice(0, 3).map(titleCase)
  const connectedLeadStack = [
    connectedConnectorIds.includes('apollo') ? 'Apollo' : null,
    connectedConnectorIds.includes('hunter') ? 'Hunter' : null,
    connectedConnectorIds.includes('hubspot') ? 'HubSpot' : null,
  ].filter(Boolean) as string[]
  const selectedGoalBaseConfig = selectedGoal ? personalizeGoalConfig(selectedGoal, getGoalIntakeConfig(selectedGoal)) : null
  const inferredAnswers = selectedGoal ? inferGoalAnswers(selectedGoal) : {}

  const selectedGoalConfig = selectedGoalBaseConfig
    ? {
        ...selectedGoalBaseConfig,
        questions: selectedGoalBaseConfig.questions.filter((question) => !inferredAnswers[question.id]),
        connectors: selectedGoalBaseConfig.connectors || [],
      }
    : null
  const selectedGoalConnectors = selectedGoal?.moduleId === 'ai-content'
    ? resolveContentGoalConnectors()
    : selectedGoal?.moduleId === 'social-media'
      ? (() => {
          const channels = goalAnswers.social_channels
          const format = goalAnswers.social_format
          const connectors = new Set<string>()
          if (channels === 'linkedin' || channels === 'multi') connectors.add('LinkedIn')
          if (channels === 'meta' || channels === 'multi') {
            connectors.add('Facebook')
            connectors.add('Instagram')
          }
          if (channels === 'youtube' || channels === 'multi') connectors.add('YouTube')
          if (channels === 'multi') connectors.add('Reddit')
          if (format === 'visuals' || format === 'posts') connectors.add('Canva')
          if (format === 'video') {
            connectors.add('HeyGen')
            connectors.add('Veo')
            connectors.add('ElevenLabs')
          }
          return Array.from(connectors)
        })()
    : selectedGoal?.moduleId === 'referral-program'
      ? (() => {
          const channel = goalAnswers.referral_channel
          const connectors = new Set<string>()
          if (channel === 'email') {
            connectors.add('Mailchimp')
            connectors.add('Klaviyo')
          }
          if (channel === 'social') {
            connectors.add('LinkedIn')
            connectors.add('Facebook')
            connectors.add('Instagram')
          }
          if (channel === 'crm') {
            connectors.add('HubSpot')
            connectors.add('Zoho CRM')
          }
          if (channel === 'in_product') {
            connectors.add('HubSpot')
            connectors.add('Mailchimp')
          }
          if (!channel) {
            connectors.add('HubSpot')
            connectors.add('Mailchimp')
          }
          return Array.from(connectors)
        })()
    : selectedGoal?.moduleId === 'user-engagement'
      ? (() => {
          const channel = goalAnswers.engagement_channel
          const connectors = new Set<string>()
          connectors.add('GA4')
          if (channel === 'email' || channel === 'mixed' || !channel) {
            connectors.add('Mailchimp')
            connectors.add('Klaviyo')
          }
          if (channel === 'product' || channel === 'mixed' || !channel) {
            connectors.add('HubSpot')
          }
          return Array.from(connectors)
        })()
    : selectedGoal?.moduleId === 'unified-customer-view'
      ? (() => {
          const systems = goalAnswers.customer_view_systems
          const connectors = new Set<string>()
          if (systems === 'crm_lifecycle' || systems === 'full_view' || !systems) {
            connectors.add('HubSpot')
            connectors.add('Zoho CRM')
            connectors.add('Mailchimp')
            connectors.add('Klaviyo')
          }
          if (systems === 'analytics' || systems === 'full_view' || !systems) {
            connectors.add('GA4')
            connectors.add('CSV import')
          }
          return Array.from(connectors)
        })()
    : selectedGoal?.moduleId === 'revenue-ops'
      ? (() => {
          const systems = goalAnswers.revops_systems
          const connectors = new Set<string>()
          if (systems === 'crm' || systems === 'combined' || !systems) {
            connectors.add('HubSpot')
            connectors.add('Zoho CRM')
          }
          if (systems === 'analytics' || systems === 'combined' || !systems) {
            connectors.add('GA4')
            connectors.add('CSV import')
          }
          return Array.from(connectors)
        })()
    : selectedGoal?.moduleId === 'market-signals'
      ? (() => {
          const connectors = new Set<string>()
          if (goalAnswers.market_focus === 'competitors' || goalAnswers.market_focus === 'positioning' || !goalAnswers.market_focus) {
            connectors.add('Semrush')
            connectors.add('Ahrefs')
          }
          if (goalAnswers.market_shift === 'buyer_change' || goalAnswers.market_scope === 'full_landscape' || !goalAnswers.market_shift) {
            connectors.add('LinkedIn')
            connectors.add('Reddit')
          }
          return Array.from(connectors)
        })()
    : (selectedGoalConfig?.connectors || [])
  const selectedGoalRequirement = selectedGoal ? resolveGoalRequirement(selectedGoal) : null
  const hasRequirementStep = Boolean(selectedGoalRequirement)
  const hasConnectorStep = Boolean(selectedGoalConnectors.length)
  const questionCount = selectedGoalConfig?.questions.length ?? 0
  const totalIntakeSteps = selectedGoal
    ? questionCount + (hasRequirementStep ? 1 : 0) + (hasConnectorStep ? 1 : 0) + 1
    : 0
  const questionStartIndex = 0
  const requirementStepIndex = questionStartIndex + questionCount
  const connectorStepIndex = requirementStepIndex + (hasRequirementStep ? 1 : 0)
  const handoffStepIndex = connectorStepIndex + (hasConnectorStep ? 1 : 0)

  const selectedQuestion = selectedGoalConfig && intakeStep >= questionStartIndex && intakeStep < requirementStepIndex
    ? selectedGoalConfig.questions[intakeStep - questionStartIndex]
    : null
  const answeredQuestionSummary = selectedGoalConfig?.questions
    .map((question) => {
      const answerId = goalAnswers[question.id]
      const option = question.options.find((item) => item.id === answerId)
      if (!option) return null
      const labelMap: Record<string, string> = {
        lead_type: 'Lead type',
        priority: 'Priority',
        source: 'Source',
        missing_fields: 'Fields',
        objective: 'Goal',
        channel: 'Channel',
        timeframe: 'Timeframe',
        focus: 'Focus',
        format: 'Format',
        deliverable: 'Deliverable',
        surface: 'Surface',
        segment: 'Segment',
        play: 'Play',
        goal: 'Goal',
        referral_who: 'Advocates',
        referral_play: 'Play',
        referral_incentive: 'Reward',
        referral_channel: 'Launch',
        engagement_segment: 'Users',
        engagement_problem: 'Problem',
        engagement_motion: 'Motion',
        engagement_channel: 'Channel',
        customer_view_type: 'View',
        customer_view_question: 'Question',
        customer_view_systems: 'Sources',
        revops_problem: 'Problem',
        revops_breakdown: 'Breakdown',
        revops_systems: 'Sources',
        market_focus: 'Focus',
        market_shift: 'Shift',
        market_scope: 'Scope',
      }
      return {
        id: question.id,
        label: labelMap[question.id] || titleCase(question.id),
        value: option.label,
      }
    })
    .filter(Boolean) as Array<{ id: string; label: string; value: string }>

  return (
    <div className="h-full overflow-auto px-6 py-6 space-y-8 max-w-6xl mx-auto">

      <div className="space-y-3">
        <div
          className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] px-5 py-5 shadow-sm"
          data-tour="home-start-here"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-500">
            Start Here
          </div>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-1">
              <h2 className="font-brand-syne text-2xl font-semibold tracking-tight text-foreground md:text-[2.15rem]">
                Choose the outcome you want to move.
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Start with a primary goal below. Use the full catalog only when you need a more specific workflow.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
              onClick={() => setShowAllGoals((prev) => !prev)}
            >
              {showAllGoals ? 'Hide full catalog' : 'Browse full catalog'}
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {workflowGoalGroups.map((group, groupIdx) => (
            <div
              key={group.title}
              className="space-y-4 rounded-[28px] border border-border/70 bg-background/80 p-5 shadow-sm"
              data-tour={groupIdx === 0 ? 'home-goal-grid' : undefined}
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.title}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{group.description}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {group.goals.length} priority {group.goals.length === 1 ? 'goal' : 'goals'}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.goals.map((goal, idx) => (
                  <Card
                    key={goal.id}
                    className={cn(
                      'group rounded-[24px] p-5 bg-gradient-to-br border cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-[transform,box-shadow] duration-200',
                      idx === 0 && 'sm:col-span-2 lg:col-span-2',
                      goal.color
                    )}
                    onClick={() => handleGoalSelect(goal)}
                  >
                    <div className="mb-4 flex items-start justify-between gap-2">
                      {goal.kind ? (
                        <div className="rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {goal.kind}
                        </div>
                      ) : <div />}
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h3 className="font-brand-syne font-semibold text-base tracking-tight mb-1.5">{goal.title}</h3>
                    <p className="text-sm text-muted-foreground leading-6 mb-4">{goal.description}</p>
                    <div className="rounded-xl bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground">
                      {goal.bestFor}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
        {showAllGoals && (
          <div className="space-y-5 rounded-[28px] border border-border/70 bg-background/95 p-5 shadow-sm">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Full Catalog</div>
              <div className="text-sm text-muted-foreground">Use a narrower workflow only when the primary goals above feel too broad.</div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={goalSearch}
                onChange={(event) => setGoalSearch(event.target.value)}
                placeholder="Search all goals"
                aria-label="Search all goals"
                className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
            {groupedGoalResults.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center">
                <div className="text-sm font-medium text-foreground">No goals match that search.</div>
                <div className="mt-1 text-xs text-muted-foreground">Try a different term or reset the search.</div>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-orange-600 transition-colors hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                  onClick={() => setGoalSearch('')}
                >
                  Reset search
                </button>
              </div>
            ) : (
              groupedGoalResults.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                  </div>
                  <div className="space-y-2">
                    {group.filteredGoals.map((goal) => (
                      <button
                        key={`${group.title}-${goal.moduleId}-${goal.title}`}
                        type="button"
                        className="flex w-full items-start justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/50 dark:hover:border-orange-800 dark:hover:bg-orange-950/10"
                        onClick={() => handleGoalSelect(goal)}
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{goal.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{goal.description}</div>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Active Workflows */}
      {activeWorkflows.length > 0 && (
        <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Resume Work</div>
                <div className="mt-1 text-xs text-muted-foreground">Pick up a recent workflow when needed.</div>
              </div>
              <div className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground border border-border/70">
                {activeWorkflows.length}
              </div>
            </div>
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeWorkflows.map(wf => {
              const destination = resolveWorkflowDestination(wf)
              return (
              <Card
                key={wf.id}
                className="p-4 flex items-start gap-3 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  if (destination) {
                    openGoal(destination.moduleId, destination.hashParams)
                    return
                  }
                  onOpenChat()
                }}
              >
                <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', wf.status === 'done' ? 'bg-green-500' : wf.status === 'error' ? 'bg-red-500' : 'bg-orange-500 animate-pulse')} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{wf.workflow_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{wf.goal} · {wf.steps.length} steps</p>
                  <div className="flex gap-1 mt-2">
                    {wf.steps.map(s => (
                      <span key={s.order} className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', s.order <= wf.currentStep ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500')}>
                        {s.agent}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ml-auto flex items-start gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Remove workflow ${wf.workflow_name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveWorkflows(removeActiveWorkflow(wf.id))
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Card>
            )})}
          </div>
        </details>
      )}

      <Dialog open={Boolean(selectedGoal)} onOpenChange={(open) => { if (!open) closeGoalIntake() }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="border-b border-border/70 bg-gradient-to-r from-orange-500/10 via-background to-background px-6 py-5">
            <div className="flex items-center gap-4 pr-8">
              <AgentAvatar name="veena" size="lg" className="shrink-0" />
              <div className="space-y-1 text-left">
                <DialogTitle className="text-xl">Veena · Goal setup</DialogTitle>
                <DialogDescription>
                  {selectedGoal ? `Step ${Math.min(intakeStep + 1, totalIntakeSteps)} of ${totalIntakeSteps} for ${selectedGoal.title}.` : 'Set up this goal before launch.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedGoal && selectedGoalConfig && (
            <div className="space-y-6 px-6 py-5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${totalIntakeSteps ? ((intakeStep + 1) / totalIntakeSteps) * 100 : 0}%` }}
                />
              </div>

              {answeredQuestionSummary.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {answeredQuestionSummary.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs transition-colors hover:border-orange-300 hover:bg-orange-50/60 dark:hover:border-orange-800 dark:hover:bg-orange-950/10"
                      onClick={() => {
                        const questionIndex = selectedGoalConfig.questions.findIndex((question) => question.id === item.id)
                        if (questionIndex >= 0) setIntakeStep(questionStartIndex + questionIndex)
                      }}
                    >
                      <span className="text-muted-foreground">{item.label}: </span>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedQuestion && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">{selectedQuestion.prompt}</div>
                  <div className="grid gap-3">
                    {selectedQuestion.options.map((option) => {
                      const isSelected = goalAnswers[selectedQuestion.id] === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            'rounded-2xl border px-4 py-3 text-left transition-colors',
                            isSelected
                              ? 'border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/20'
                              : 'border-border/70 bg-background hover:border-orange-300 hover:bg-orange-50/40 dark:hover:border-orange-800 dark:hover:bg-orange-950/10'
                          )}
                          onClick={() => setGoalAnswers((prev) => ({ ...prev, [selectedQuestion.id]: option.id }))}
                        >
                          <div className="text-sm font-medium text-foreground">{option.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedGoalRequirement && intakeStep === requirementStepIndex && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
                  <div className="text-sm font-semibold text-orange-700 dark:text-orange-300">{selectedGoalRequirement.title}</div>
                  <div className="mt-2 text-sm text-orange-700/80 dark:text-orange-300/80">{selectedGoalRequirement.description}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => {
                        closeGoalIntake()
                        openGoal(selectedGoalRequirement.moduleId, selectedGoalRequirement.hashParams)
                      }}
                    >
                      {selectedGoalRequirement.ctaLabel}
                    </Button>
                  </div>
                </div>
              )}

              {hasConnectorStep && intakeStep === connectorStepIndex && selectedGoalConnectors && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">Accounts that strengthen this goal</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedGoalConnectors.map((connector) => {
                      const status = getConnectorStatus(connector)
                      const isConnected = Boolean(status?.connected || status?.status === 'active')
                      const connectorId = CONNECTOR_LABEL_TO_ID[connector]
                      const isLoading = connectorId ? connectorActionId === connectorId : false
                      return (
                        <button
                          key={connector}
                          type="button"
                          className={cn(
                            'rounded-xl border px-3 py-3 text-left transition-colors',
                            isConnected
                              ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                              : 'border-border/70 bg-muted/20 hover:border-orange-300 hover:bg-orange-50/50 dark:hover:border-orange-800 dark:hover:bg-orange-950/10'
                          )}
                          onClick={() => {
                            if (isConnected) return
                            void connectConnector(connector)
                          }}
                          disabled={isLoading}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-foreground">{connector}</div>
                            <div className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-medium',
                              isConnected
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-background text-muted-foreground border border-border/70'
                            )}>
                              {isConnected ? 'Connected' : isLoading ? 'Connecting...' : 'Connect'}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {isConnected
                              ? 'Connected and ready to improve this result.'
                              : connectorId
                                ? 'Connect this source to unlock better live analysis and execution in this flow.'
                                : 'This connector can be completed from setup.'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {intakeStep === handoffStepIndex && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm text-muted-foreground">
                      Opening <span className="font-medium text-foreground">{selectedGoalConfig.launchTitle}</span> next.
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      First action: <span className="font-medium text-foreground">{selectedGoalConfig.firstAction}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <Button variant="ghost" onClick={() => {
                  if (intakeStep === 0) {
                    closeGoalIntake()
                    return
                  }
                  setIntakeStep((prev) => prev - 1)
                }}>
                  {intakeStep === 0 ? 'Cancel' : 'Back'}
                </Button>
                <div className="flex items-center gap-2">
                  {selectedGoalRequirement && intakeStep === requirementStepIndex ? (
                    !selectedGoalRequirement.blocking && (
                      <Button
                        variant="outline"
                        onClick={() => setIntakeStep((prev) => prev + 1)}
                      >
                        Continue without it
                      </Button>
                    )
                  ) : intakeStep === handoffStepIndex ? (
                    <Button
                      className="bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => {
                        const destination = selectedGoal
                        const launchParams = buildGoalLaunchParams(destination)
                        closeGoalIntake()
                        openGoal(destination.moduleId, launchParams)
                      }}
                    >
                      Open {selectedGoalConfig.launchTitle}
                    </Button>
                  ) : (
                    <Button
                      className="bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => setIntakeStep((prev) => Math.min(prev + 1, handoffStepIndex))}
                    >
                      Continue
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
