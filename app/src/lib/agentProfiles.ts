/**
 * Shared digital-employee dossiers for command-deck / dashboard surfaces.
 */

export type AgentProfileId =
  | 'veena'
  | 'isha'
  | 'neel'
  | 'tara'
  | 'sam'
  | 'kiran'
  | 'zara'
  | 'maya'
  | 'riya'
  | 'arjun'
  | 'dev'
  | 'priya'

export type AgentProfile = {
  id: AgentProfileId
  displayName: string
  title: string
  personality: string
  executes: string[]
  objectives: string[]
  /** Accent used for rings / status — keep Marqq orange-ish or per-agent hue */
  accent: string
  statusLabel: string
}

export const AGENT_PROFILES: Record<AgentProfileId, AgentProfile> = {
  veena: {
    id: 'veena',
    displayName: 'Veena',
    title: 'Company Intelligence Lead',
    personality:
      'Detail-oriented and systematic. Builds rich company profiles from public signals and turns them into actionable sales and marketing context.',
    executes: [
      'Ingest company websites and public signals',
      'Build structured company profiles',
      'Hand context to specialist agents',
    ],
    objectives: [
      'Reduce account research time to minutes',
      'Give sales and marketing a shared company context',
      'Surface the right accounts at the right moment',
    ],
    accent: '#2DD4BF',
    statusLabel: 'ONLINE',
  },
  isha: {
    id: 'isha',
    displayName: 'Isha',
    title: 'Market & Audience Researcher',
    personality:
      'Curious, pattern-seeking, and skilled at synthesising fragmented market signals into crisp audience and ICP definitions.',
    executes: [
      'Map the competitive landscape and category dynamics',
      'Build detailed ICP cards with firmographic and psychographic depth',
      'Identify whitespace, audience segments, and market shifts',
    ],
    objectives: [
      'Give the team a clear picture of who to target',
      'Reduce time spent on manual market research',
      'Keep ICP definitions current as the market evolves',
    ],
    accent: '#F59E0B',
    statusLabel: 'ONLINE',
  },
  neel: {
    id: 'neel',
    displayName: 'Neel',
    title: 'Strategy & Positioning Lead',
    personality:
      'Sharp and commercially minded. Translates market context into differentiated positioning and actionable strategy.',
    executes: [
      'Develop and refine positioning and messaging architecture',
      'Define Ideal Customer Profiles from GTM context',
      'Map pricing intelligence and competitive differentiation',
    ],
    objectives: [
      'Maintain a clear, differentiated market position',
      'Align marketing and sales on a single strategic narrative',
      'Adapt strategy quickly as market conditions change',
    ],
    accent: '#60A5FA',
    statusLabel: 'ONLINE',
  },
  tara: {
    id: 'tara',
    displayName: 'Tara',
    title: 'Offer & CRO Designer',
    personality:
      'Conversion-obsessed and empathy-driven. Identifies friction, designs compelling offers, and writes CTAs that move people to act.',
    executes: [
      'Audit offers for friction, clarity, and conversion gaps',
      'Design lead magnets and high-intent CTAs',
      'Review landing page copy for conversion effectiveness',
    ],
    objectives: [
      'Increase offer-to-conversion rates',
      'Remove friction from the buyer journey',
      'Ensure every touchpoint has a clear, compelling CTA',
    ],
    accent: '#C084FC',
    statusLabel: 'ONLINE',
  },
  sam: {
    id: 'sam',
    displayName: 'Sam',
    title: 'Messaging & Copy Strategist',
    personality:
      'Empathetic, precise, and fluent in the language of buyers. Turns positioning into copy that resonates across every channel.',
    executes: [
      'Review and refresh messaging across website, ads, and email',
      'Write channel-specific copy variants for testing',
      'Align copy to positioning and ICP language',
    ],
    objectives: [
      'Improve message-market fit',
      'Reduce copy inconsistency across channels',
      'Accelerate copy production without sacrificing quality',
    ],
    accent: '#86EFAC',
    statusLabel: 'ONLINE',
  },
  kiran: {
    id: 'kiran',
    displayName: 'Kiran',
    title: 'Social Calendar Manager',
    personality:
      'Creative, organised, and aware of platform dynamics. Keeps the content engine running with a consistent, on-brand social presence.',
    executes: [
      'Build and maintain a 30-day social content calendar',
      'Generate daily post ideas tailored to each platform',
      'Coordinate content themes with campaign and product launches',
    ],
    objectives: [
      'Maintain consistent social publishing cadence',
      'Increase organic engagement and follower growth',
      'Reduce manual effort in weekly social planning',
    ],
    accent: '#F9A8D4',
    statusLabel: 'ONLINE',
  },
  zara: {
    id: 'zara',
    displayName: 'Zara',
    title: 'Campaign Strategist',
    personality:
      'Decisive, commercially sharp, and biased toward clear GTM tradeoffs rather than vague planning.',
    executes: [
      'Turn business goals into channel-specific campaign plans',
      'Recommend launch structure, offers, and funnel sequencing',
      'Translate GTM strategy into deployable execution tasks',
    ],
    objectives: [
      'Launch campaigns faster',
      'Improve channel mix decisions',
      'Keep GTM work aligned to revenue outcomes',
    ],
    accent: '#FF6521',
    statusLabel: 'ONLINE',
  },
  maya: {
    id: 'maya',
    displayName: 'Maya',
    title: 'SEO & LLMO Monitor',
    personality:
      'Methodical, evidence-driven, and focused on search visibility, citations, and technical discoverability.',
    executes: [
      'Monitor SEO and AI-search visibility signals',
      'Identify ranking, indexing, and answer-engine gaps',
      'Suggest content and site updates that improve discoverability',
    ],
    objectives: [
      'Increase organic visibility',
      'Catch SEO regressions early',
      'Improve AI citation readiness',
    ],
    accent: '#22D3EE',
    statusLabel: 'ONLINE',
  },
  riya: {
    id: 'riya',
    displayName: 'Riya',
    title: 'Content Producer',
    personality:
      'Fast-moving, editorially minded, and tuned to shipping usable content rather than abstract ideas.',
    executes: [
      'Generate content plans, briefs, and campaign-ready assets',
      'Turn strategy into channel-specific content output',
      'Support social, messaging, and creative production flows',
    ],
    objectives: [
      'Maintain content velocity',
      'Improve campaign consistency',
      'Reduce time from idea to published asset',
    ],
    accent: '#A78BFA',
    statusLabel: 'ONLINE',
  },
  arjun: {
    id: 'arjun',
    displayName: 'Arjun',
    title: 'Lead Intelligence',
    personality:
      'Analytical and conversion-oriented, with a strong bias toward qualification, prioritization, and pipeline efficiency.',
    executes: [
      'Analyze lead quality and prospect segments',
      'Surface ICP fit, enrichment, and prioritization insights',
      'Support outreach and opportunity qualification decisions',
    ],
    objectives: [
      'Improve lead quality',
      'Prioritize the right accounts faster',
      'Strengthen sales and marketing handoff',
    ],
    accent: '#4ADE80',
    statusLabel: 'ONLINE',
  },
  dev: {
    id: 'dev',
    displayName: 'Dev',
    title: 'Performance Analyst',
    personality:
      'Numerate, pragmatic, and focused on budget efficiency, signal quality, and measurable performance improvement.',
    executes: [
      'Review campaign performance and scorecards',
      'Recommend budget reallocations and efficiency moves',
      'Track KPI movement across channels and time horizons',
    ],
    objectives: [
      'Improve ROI and spend efficiency',
      'Spot underperformance quickly',
      'Support budget decisions with data',
    ],
    accent: '#FCD34D',
    statusLabel: 'ONLINE',
  },
  priya: {
    id: 'priya',
    displayName: 'Priya',
    title: 'Brand Intelligence',
    personality:
      'Research-led, positioning-aware, and strong at turning messy market inputs into sharper differentiation.',
    executes: [
      'Generate company intelligence and competitor analysis',
      'Refine messaging, positioning, and audience hypotheses',
      'Support brand, market, and narrative decisions',
    ],
    objectives: [
      'Sharpen market positioning',
      'Improve competitive awareness',
      'Create stronger strategic messaging',
    ],
    accent: '#FB7185',
    statusLabel: 'ONLINE',
  },
}

export function resolveAgentProfile(name?: string | null): AgentProfile {
  const key = String(name || 'neel').toLowerCase() as AgentProfileId
  return AGENT_PROFILES[key] || AGENT_PROFILES.neel
}

/** Pipeline steps shown while an agent is generating a task-channel artifact */
export function agentWorkSteps(taskTitle: string): string[] {
  return [
    'Ingesting locked GTM profile',
    'Reading company crawl context',
    `Reasoning through ${taskTitle}`,
    'Structuring deliverable',
    'Writing channel output',
  ]
}
