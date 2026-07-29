/**
 * GTM sections split:
 * - Auto (onboarding Brand-DNA-style review): generated from Brand DNA + crawl/onboarding
 * - Interview-backed (Home wizard): questions → Generate X → Brand DNA review
 */

export const GTM_AUTO_STRATEGY_SECTIONS = [
  {
    id: 'executive_summary',
    title: 'Executive summary',
    blurb: 'Win condition, strategic bets, and what to cut.',
  },
  {
    id: 'market_analysis',
    title: 'Market analysis',
    blurb: 'Beachhead, sequencing, and timing.',
  },
  {
    id: 'positioning_messaging',
    title: 'Positioning & messaging',
    blurb: 'Claims, hooks, proof, and competitive counters.',
  },
  {
    id: 'distribution_channels',
    title: 'Distribution & channels',
    blurb: 'Primary motion and supporting channels.',
  },
  {
    id: 'marketing_strategy',
    title: 'Marketing strategy',
    blurb: 'Campaign spine and demand gen toward the target.',
  },
  {
    id: 'sales_strategy',
    title: 'Sales strategy',
    blurb: 'Cadence, qualification SLAs, and objection handling.',
  },
  {
    id: 'launch_plan',
    title: 'Launch plan',
    blurb: 'Pre-launch → launch → post milestones.',
  },
  {
    id: 'measurement_optimization',
    title: 'Measurement & optimization',
    blurb: 'Primary KPI and weekly optimization loops.',
  },
  {
    id: 'risks_contingencies',
    title: 'Risks & contingencies',
    blurb: 'Kill criteria and pivot options.',
  },
  {
    id: 'timeline_roadmap',
    title: 'Timeline & roadmap',
    blurb: 'Week-by-week plan to the quantified target.',
  },
] as const;

/** Strategy sections produced after wizard interview answers. */
export const GTM_INTERVIEW_STRATEGY_OUTPUTS: Record<
  string,
  {
    /** Primary CTA after questions are answered */
    cta: string;
    outputs: Array<{ id: string; title: string; cta: string; blurb: string }>;
  }
> = {
  module: {
    cta: 'Continue',
    outputs: [],
  },
  offer: {
    cta: 'Generate Product Strategy',
    outputs: [
      {
        id: 'product_strategy',
        title: 'Product strategy',
        cta: 'Generate Product Strategy',
        blurb: 'Packaging, time-to-value, and offer shape.',
      },
      {
        id: 'pricing_monetization',
        title: 'Pricing & monetization',
        cta: 'Generate Pricing',
        blurb: 'Price points, packaging, and monetization path.',
      },
    ],
  },
  audience: {
    cta: 'Generate ICP',
    outputs: [
      {
        id: 'target_customer',
        title: 'Target customer',
        cta: 'Generate ICP',
        blurb: 'ICP, personas, triggers, and disqualifiers.',
      },
    ],
  },
  goals: {
    cta: 'Generate Financial Plan',
    outputs: [
      {
        id: 'financial_plan',
        title: 'Financial plan',
        cta: 'Generate Financial Plan',
        blurb: 'Budget, CAC ceilings, and scenarios.',
      },
      {
        id: 'customer_success',
        title: 'Customer success',
        cta: 'Generate Customer Success',
        blurb: 'Activation, retention, and expansion loops.',
      },
      {
        id: 'operations_execution',
        title: 'Operations & execution',
        cta: 'Generate Operations',
        blurb: 'Owners, workflows, and stack readiness.',
      },
    ],
  },
};

/** Wizard interview sections that still need user input. */
export const GTM_WIZARD_INTERVIEW_SECTION_IDS = [
  'module',
  'offer',
  'audience',
  'goals',
] as const;

/** Full strategy doc order (16 sections). */
export const GTM_FULL_STRATEGY_SECTION_ORDER = [
  'executive_summary',
  'market_analysis',
  'target_customer',
  'product_strategy',
  'positioning_messaging',
  'pricing_monetization',
  'distribution_channels',
  'marketing_strategy',
  'sales_strategy',
  'customer_success',
  'launch_plan',
  'operations_execution',
  'financial_plan',
  'measurement_optimization',
  'risks_contingencies',
  'timeline_roadmap',
] as const;

export type GtmAutoStrategySectionId = (typeof GTM_AUTO_STRATEGY_SECTIONS)[number]['id'];
export type GtmWizardInterviewSectionId = (typeof GTM_WIZARD_INTERVIEW_SECTION_IDS)[number];

export interface GtmStrategySubsection {
  title: string;
  body: string;
  bullets?: string[];
}

export interface GtmAutoSectionDraft {
  id: string;
  title: string;
  /** @deprecated unused in final docs — kept for older drafts */
  channel?: string;
  summary: string;
  bullets: string[];
  body: string;
  subsections?: GtmStrategySubsection[];
  /** AI-proposed quantified north-star — editable before Looks good */
  proposedNorthStar?: string;
  approvedAt?: string;
}

export function gtmAutoSectionsStorageKey(workspaceId: string) {
  return `marqq_gtm_auto_sections_${workspaceId}`;
}

export function loadGtmAutoSections(workspaceId: string): GtmAutoSectionDraft[] {
  try {
    const raw = localStorage.getItem(gtmAutoSectionsStorageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.sections) ? parsed.sections : Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGtmAutoSections(workspaceId: string, sections: GtmAutoSectionDraft[]) {
  localStorage.setItem(
    gtmAutoSectionsStorageKey(workspaceId),
    JSON.stringify({
      sections,
      savedAt: new Date().toISOString(),
      coveredInterviewIds: [...GTM_WIZARD_INTERVIEW_SECTION_IDS],
      autoSectionIds: GTM_AUTO_STRATEGY_SECTIONS.map((s) => s.id),
    }),
  );
}

export function mergeStrategyDrafts(
  existing: GtmAutoSectionDraft[],
  incoming: GtmAutoSectionDraft[],
): GtmAutoSectionDraft[] {
  const map = new Map<string, GtmAutoSectionDraft>();
  for (const s of existing) map.set(s.id, s);
  for (const s of incoming) map.set(s.id, s);
  return GTM_FULL_STRATEGY_SECTION_ORDER.map((id) => map.get(id)).filter(
    Boolean,
  ) as GtmAutoSectionDraft[];
}

export function interviewGenerateMeta(sectionId: string) {
  return (
    GTM_INTERVIEW_STRATEGY_OUTPUTS[sectionId] || {
      cta: 'Continue',
      outputs: [] as Array<{ id: string; title: string; cta: string; blurb: string }>,
    }
  );
}
