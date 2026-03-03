import type {
  AgentTarget,
  GtmInterviewQuestion,
  GtmStrategyResponse,
  GtmStrategyBlock,
  SavedGtmStrategy,
} from '@/types/gtm';

// ---------------------------------------------------------------------------
// Hardcoded interview questions (no backend round-trip required)
// ---------------------------------------------------------------------------

export const GTM_QUESTIONS: GtmInterviewQuestion[] = [
  {
    id: 'audience',
    question: 'Who is your primary target audience?',
    type: 'single_select',
    options: [
      { value: 'wealthtech', label: 'WealthTech / FinTech consumers' },
      { value: 'b2b_saas',   label: 'B2B SaaS companies' },
      { value: 'enterprise', label: 'Enterprise businesses' },
      { value: 'smb',        label: 'SMB & Startups' },
      { value: 'ecommerce',  label: 'E-commerce brands' },
    ],
  },
  {
    id: 'goal',
    question: "What's your #1 priority for the next 90 days?",
    type: 'single_select',
    options: [
      { value: 'leads',      label: 'Generate qualified leads' },
      { value: 'awareness',  label: 'Build brand awareness' },
      { value: 'conversion', label: 'Improve conversion rates' },
      { value: 'retention',  label: 'Retain & expand customers' },
    ],
  },
  {
    id: 'stage',
    question: 'What stage is your company at?',
    type: 'single_select',
    options: [
      { value: 'prelaunch', label: 'Pre-launch' },
      { value: 'early',     label: 'Early traction (1–100 customers)' },
      { value: 'growing',   label: 'Growing (100–1,000 customers)' },
      { value: 'scaling',   label: 'Scaling (1,000+ customers)' },
    ],
  },
  {
    id: 'channel',
    question: 'Which channel do you want to lead with?',
    type: 'single_select',
    options: [
      { value: 'content', label: 'Content marketing & SEO' },
      { value: 'paid',    label: 'Paid advertising' },
      { value: 'social',  label: 'Social media & community' },
      { value: 'sales',   label: 'Sales-led / outbound' },
      { value: 'plg',     label: 'Product-led growth' },
    ],
  },
  {
    id: 'budget',
    question: "What's your marketing budget for 90 days?",
    type: 'single_select',
    options: [
      { value: 'xs', label: 'Under ₹5 Lakhs' },
      { value: 'sm', label: '₹5–20 Lakhs' },
      { value: 'md', label: '₹20–50 Lakhs' },
      { value: 'lg', label: '₹50 Lakhs+' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Direct Groq call (bypasses GroqService to control tokens & temperature)
// ---------------------------------------------------------------------------

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GTM_SECTION_TEMPLATES: Array<{
  id: string;
  title: string;
  recommendedAgentTarget: AgentTarget;
  deployLabel: string;
}> = [
  {
    id: 'positioning',
    title: 'Positioning & ICP',
    recommendedAgentTarget: 'company_intel_icp',
    deployLabel: 'Open ICP Builder',
  },
  {
    id: 'channels',
    title: 'Channel Strategy',
    recommendedAgentTarget: 'company_intel_channel_strategy',
    deployLabel: 'Open Channel Planner',
  },
  {
    id: 'content',
    title: 'Content Plan',
    recommendedAgentTarget: 'company_intel_content_strategy',
    deployLabel: 'Open Content Planner',
  },
  {
    id: 'lead_gen',
    title: 'Lead Generation',
    recommendedAgentTarget: 'lead_intelligence',
    deployLabel: 'Open Lead Intelligence',
  },
  {
    id: 'roadmap',
    title: '90-Day Roadmap',
    recommendedAgentTarget: 'performance_scorecard',
    deployLabel: 'Open Performance Scorecard',
  },
  {
    id: 'kpis',
    title: 'KPIs & Success Metrics',
    recommendedAgentTarget: 'performance_scorecard',
    deployLabel: 'Open Scorecard',
  },
];

const VALID_AGENT_TARGETS = new Set<AgentTarget>([
  'company_intel_icp',
  'company_intel_competitors',
  'company_intel_marketing_strategy',
  'company_intel_sales_enablement',
  'company_intel_pricing',
  'company_intel_content_strategy',
  'company_intel_channel_strategy',
  'company_intel_social_calendar',
  'company_intel_lead_magnets',
  'lead_intelligence',
  'budget_optimization',
  'performance_scorecard',
  'user_engagement',
]);

const ANSWER_STRATEGY_CONTEXT: Record<string, Record<string, string>> = {
  audience: {
    wealthtech: 'Audience expects trust, compliance-safe claims, education-led nurture, and high-conviction proof before converting.',
    b2b_saas: 'Audience expects category clarity, ROI framing, differentiated use cases, and tight demand capture loops.',
    enterprise: 'Audience expects multi-stakeholder messaging, proof of governance, case studies, and longer sales cycles.',
    smb: 'Audience expects fast time-to-value, simpler packaging, lower-friction offers, and practical proof points.',
    ecommerce: 'Audience expects rapid experimentation, offer velocity, retention loops, and channel-level performance clarity.',
  },
  goal: {
    leads: 'Plan should bias toward demand capture, qualification, conversion paths, and measurable pipeline creation.',
    awareness: 'Plan should bias toward category narrative, reach, repeatability, and memorable positioning.',
    conversion: 'Plan should bias toward funnel friction removal, proof, sharper CTAs, and conversion assist content.',
    retention: 'Plan should bias toward lifecycle messaging, onboarding depth, activation, and expansion plays.',
  },
  stage: {
    prelaunch: 'Assume limited proof and no mature funnel; focus on message-market fit, narrative testing, and founder-led distribution.',
    early: 'Assume some traction but limited scale; focus on repeatable acquisition plays and lightweight measurement.',
    growing: 'Assume one or two channels are working; focus on concentration, operational rigor, and scaling what already has signal.',
    scaling: 'Assume channel breadth and existing motion; focus on efficiency, segmentation, and compounding systems.',
  },
  channel: {
    content: 'Lead with editorial authority, SEO/topic clusters, repurposing, and conversion-oriented content assets.',
    paid: 'Lead with budget concentration, creative testing, landing-page alignment, and offer-market fit.',
    social: 'Lead with repeatable platform narratives, community trust loops, and high-frequency creative distribution.',
    sales: 'Lead with list quality, segmentation, outreach sequencing, objection handling, and sales enablement.',
    plg: 'Lead with activation, self-serve education, in-product conversion moments, and lifecycle nudges.',
  },
  budget: {
    xs: 'Budget is constrained; favor concentrated bets, organic leverage, founder input, and low-complexity ops.',
    sm: 'Budget supports one primary acquisition motion and one supporting motion; avoid channel sprawl.',
    md: 'Budget can support multi-channel testing with disciplined measurement and creative iteration.',
    lg: 'Budget can support broader experimentation, but strategy should still avoid diffuse channel spread.',
  },
};

function extractJson(raw: string): string {
  // Strip markdown code fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Otherwise find first {...}
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) return brace[0];
  throw new Error('No JSON found in Groq response');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|[•*-]\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeAssumptions(value: unknown): string[] {
  if (Array.isArray(value) || typeof value === 'string') {
    return asStringArray(value).slice(0, 5);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => {
        const label = key.replace(/[_-]+/g, ' ').trim();
        const text = asString(val);
        return text ? `${label}: ${text}` : '';
      })
      .filter(Boolean)
      .slice(0, 5);
  }
  return [];
}

function sectionTemplateFor(index: number) {
  return GTM_SECTION_TEMPLATES[index] || GTM_SECTION_TEMPLATES[GTM_SECTION_TEMPLATES.length - 1];
}

function inferSectionTemplate(rawSection: Record<string, unknown>, index: number) {
  const id = asString(rawSection.id).toLowerCase();
  const title = asString(rawSection.title).toLowerCase();
  const summary = asString(rawSection.summary).toLowerCase();
  const haystack = `${id} ${title} ${summary}`;

  if (haystack.includes('position')) return GTM_SECTION_TEMPLATES[0];
  if (haystack.includes('channel')) return GTM_SECTION_TEMPLATES[1];
  if (haystack.includes('content')) return GTM_SECTION_TEMPLATES[2];
  if (haystack.includes('lead')) return GTM_SECTION_TEMPLATES[3];
  if (haystack.includes('roadmap') || haystack.includes('90-day') || haystack.includes('month')) return GTM_SECTION_TEMPLATES[4];
  if (haystack.includes('kpi') || haystack.includes('metric') || haystack.includes('success')) return GTM_SECTION_TEMPLATES[5];

  return sectionTemplateFor(index);
}

function normalizeSection(rawSection: unknown, index: number) {
  const source = rawSection && typeof rawSection === 'object' ? rawSection as Record<string, unknown> : {};
  const template = inferSectionTemplate(source, index);
  const recommendedAgentTarget = asString(source.recommendedAgentTarget) as AgentTarget;
  const bullets = asStringArray(source.bullets).slice(0, template.id === 'roadmap' ? 5 : 4);

  const fallbackBullets = (() => {
    switch (template.id) {
      case 'positioning':
        return [
          'Name the highest-conviction ICP segment',
          'Sharpen the core value proposition',
          'Map the top three buyer objections',
          'Turn proof points into messaging assets',
        ];
      case 'channels':
        return [
          'Choose one primary and one supporting channel',
          'Define channel-specific offer hooks',
          'Set weekly operating cadence and owners',
          'Cut channels that dilute focus',
        ];
      case 'content':
        return [
          'Build three recurring content pillars',
          'Tie every asset to a conversion path',
          'Repurpose winning ideas across formats',
          'Publish proof-led assets early',
        ];
      case 'lead_gen':
        return [
          'Launch one high-intent conversion offer',
          'Tighten qualification before handoff',
          'Align landing pages with channel intent',
          'Track source-to-qualified-lead conversion',
        ];
      case 'roadmap':
        return [
          'Month 1: lock positioning and priority segments',
          'Month 1: launch core offer and measurement',
          'Month 2: scale highest-signal channel',
          'Month 2: repurpose top-performing assets',
          'Month 3: optimize conversion and reporting',
        ];
      case 'kpis':
        return [
          'Track weekly qualified pipeline created',
          'Measure channel-to-conversion efficiency',
          'Review content-to-lead conversion rate',
          'Run a weekly decision-making scorecard',
        ];
      default:
        return [
          `Define ${template.title.toLowerCase()} priorities`,
          'Assign owners and timeline',
          'Execute the first sprint',
          'Review progress and optimize',
        ];
    }
  })();

  return {
    id: template.id,
    title: asString(source.title) || template.title,
    summary: asString(source.summary) || `Use the next 90 days to make ${template.title.toLowerCase()} sharper, more differentiated, and easier to execute.`,
    bullets: bullets.length
      ? bullets
      : fallbackBullets.slice(0, template.id === 'roadmap' ? 5 : 4),
    recommendedAgentTarget: VALID_AGENT_TARGETS.has(recommendedAgentTarget) ? recommendedAgentTarget : template.recommendedAgentTarget,
    deployLabel: asString(source.deployLabel) || template.deployLabel,
  };
}

function normalizeGtmStrategyResponse(raw: unknown): GtmStrategyResponse {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const normalizedSections = rawSections.slice(0, GTM_SECTION_TEMPLATES.length).map(normalizeSection);

  while (normalizedSections.length < GTM_SECTION_TEMPLATES.length) {
    normalizedSections.push(normalizeSection({}, normalizedSections.length));
  }

  return {
    title: asString(source.title) || '90-Day GTM Strategy',
    executiveSummary: asString(source.executiveSummary) || 'A focused 90-day GTM plan designed to sharpen positioning, activate channels, and generate measurable pipeline.',
    assumptions: normalizeAssumptions(source.assumptions),
    sections: normalizedSections,
    nextSteps: asStringArray(source.nextSteps).slice(0, 5),
  };
}

function findAnswerValue(questionId: string, answerLabel: string): string | null {
  const question = GTM_QUESTIONS.find((item) => item.id === questionId);
  const match = question?.options?.find((option) => option.label === answerLabel);
  return match?.value || null;
}

export async function generateGtmStrategy(
  answers: Record<string, string>
): Promise<GtmStrategyResponse> {
  if (!GROQ_API_KEY) throw new Error('VITE_GROQ_API_KEY not set');

  const answerLines = GTM_QUESTIONS.map(q => `- ${q.question}: ${answers[q.id] ?? 'N/A'}`).join('\n');
  const strategicContext = Object.entries(answers)
    .map(([id, label]) => {
      const value = findAnswerValue(id, label);
      return value ? ANSWER_STRATEGY_CONTEXT[id]?.[value] || '' : '';
    })
    .filter(Boolean)
    .join('\n- ');

  const answerSummary = [
    `Primary audience: ${answers.audience ?? 'N/A'}`,
    `90-day goal: ${answers.goal ?? 'N/A'}`,
    `Company stage: ${answers.stage ?? 'N/A'}`,
    `Lead channel: ${answers.channel ?? 'N/A'}`,
    `Budget: ${answers.budget ?? 'N/A'}`,
  ].join('\n');

  const systemPrompt = `You are an expert B2B go-to-market strategist. When asked, you output ONLY valid JSON — no explanation, no markdown fences, no prose outside the JSON object.`;

  const userPrompt = `Create a 90-day GTM strategy for a company with these answers:
${answerLines}

Strategic interpretation to respect:
- ${strategicContext || 'Use the selected audience, goal, stage, channel, and budget to make the plan specific.'}

Planning brief:
${answerSummary}

Return ONLY a JSON object matching this exact structure. Do not change data types. Do not use numeric IDs. Do not invent new section names. Use only the allowed recommendedAgentTarget values shown below.

{
  "title": "string — e.g. '90-Day GTM Strategy for [Audience]'",
  "executiveSummary": "string — 2-3 sentence overview",
  "assumptions": ["string", "string", "string"],
  "sections": [
    {
      "id": "positioning",
      "title": "Positioning & ICP",
      "summary": "string — 1-2 sentences",
      "bullets": ["actionable item 1", "actionable item 2", "actionable item 3", "actionable item 4"],
      "recommendedAgentTarget": "company_intel_icp",
      "deployLabel": "Open ICP Builder"
    },
    {
      "id": "channels",
      "title": "Channel Strategy",
      "summary": "string",
      "bullets": ["item 1", "item 2", "item 3", "item 4"],
      "recommendedAgentTarget": "company_intel_channel_strategy",
      "deployLabel": "Open Channel Planner"
    },
    {
      "id": "content",
      "title": "Content Plan",
      "summary": "string",
      "bullets": ["item 1", "item 2", "item 3", "item 4"],
      "recommendedAgentTarget": "company_intel_content_strategy",
      "deployLabel": "Open Content Planner"
    },
    {
      "id": "lead_gen",
      "title": "Lead Generation",
      "summary": "string",
      "bullets": ["item 1", "item 2", "item 3", "item 4"],
      "recommendedAgentTarget": "lead_intelligence",
      "deployLabel": "Open Lead Intelligence"
    },
    {
      "id": "roadmap",
      "title": "90-Day Roadmap",
      "summary": "string",
      "bullets": ["Month 1: item", "Month 1: item", "Month 2: item", "Month 2: item", "Month 3: item"],
      "recommendedAgentTarget": "performance_scorecard",
      "deployLabel": "Open Performance Scorecard"
    },
    {
      "id": "kpis",
      "title": "KPIs & Success Metrics",
      "summary": "string",
      "bullets": ["KPI 1 with target number", "KPI 2 with target number", "KPI 3 with target number", "tracking cadence"],
      "recommendedAgentTarget": "performance_scorecard",
      "deployLabel": "Open Scorecard"
    }
  ],
  "nextSteps": ["step 1", "step 2", "step 3"]
}

Rules:
- "assumptions" must be an array of short strings, never an object.
- "sections" must contain exactly 6 entries in the same order shown.
- Every "id" must be one of: positioning, channels, content, lead_gen, roadmap, kpis.
- Every "recommendedAgentTarget" must be one of:
  company_intel_icp, company_intel_channel_strategy, company_intel_content_strategy, lead_intelligence, performance_scorecard.
- Bullet items must be concise and immediately actionable, but not generic. Use 8-16 words.
- Avoid filler like "optimize marketing," "improve engagement," or "build brand awareness" unless tied to a concrete motion.
- Make channel choices, offers, cadence, and KPIs match the selected budget and company stage.
- For low budgets, concentrate effort instead of suggesting many channels.
- For roadmap bullets, include explicit month labels.
- For KPI bullets, include directional targets or thresholds, not just metric names.
- Make the plan specific to the answers provided and suitable for execution over 90 days.
- Write like a strategist making real tradeoffs, not a template generator.`;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_completion_tokens: 3000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const jsonStr = extractJson(raw);
  return normalizeGtmStrategyResponse(JSON.parse(jsonStr));
}

// ---------------------------------------------------------------------------
// Blocks: add approved=false to each section
// ---------------------------------------------------------------------------

export function strategyToBlocks(strategy: GtmStrategyResponse): GtmStrategyBlock[] {
  return strategy.sections.map(s => ({ ...s, approved: false }));
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'torqq_gtm_strategies';

export function saveGtmStrategy(saved: SavedGtmStrategy): void {
  try {
    const existing = loadGtmStrategies();
    existing.unshift(saved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 10)));
  } catch { /* ignore */ }
}

export function loadGtmStrategies(): SavedGtmStrategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedGtmStrategy[]) : [];
  } catch {
    return [];
  }
}
