/**
 * GTM sections split:
 * - Auto (onboarding Brand-DNA-style review): generated from Brand DNA + crawl/onboarding
 * - Interview (Home GTM wizard): need real user choices
 */

export const GTM_AUTO_STRATEGY_SECTIONS = [
  {
    id: 'executive_summary',
    title: 'Executive summary',
    channel: '#executive-summary',
    blurb: 'Win condition, strategic bets, and what to cut.',
  },
  {
    id: 'market_analysis',
    title: 'Market analysis',
    channel: '#market-analysis',
    blurb: 'Beachhead, sequencing, and timing.',
  },
  {
    id: 'positioning_messaging',
    title: 'Positioning & messaging',
    channel: '#positioning-messaging',
    blurb: 'Claims, hooks, proof, and competitive counters.',
  },
  {
    id: 'distribution_channels',
    title: 'Distribution & channels',
    channel: '#distribution-channels',
    blurb: 'Primary motion and supporting channels.',
  },
  {
    id: 'marketing_strategy',
    title: 'Marketing strategy',
    channel: '#marketing-strategy',
    blurb: 'Campaign spine and demand gen toward the target.',
  },
  {
    id: 'sales_strategy',
    title: 'Sales strategy',
    channel: '#sales-strategy',
    blurb: 'Cadence, qualification SLAs, and objection handling.',
  },
  {
    id: 'launch_plan',
    title: 'Launch plan',
    channel: '#launch-plan',
    blurb: 'Pre-launch → launch → post milestones.',
  },
  {
    id: 'measurement_optimization',
    title: 'Measurement & optimization',
    channel: '#measurement',
    blurb: 'Primary KPI and weekly optimization loops.',
  },
  {
    id: 'risks_contingencies',
    title: 'Risks & contingencies',
    channel: '#risks',
    blurb: 'Kill criteria and pivot options.',
  },
  {
    id: 'timeline_roadmap',
    title: 'Timeline & roadmap',
    channel: '#timeline-roadmap',
    blurb: 'Week-by-week plan to the quantified target.',
  },
] as const;

/** Wizard interview sections that still need user input (product, ICP, pricing, goals). */
export const GTM_WIZARD_INTERVIEW_SECTION_IDS = [
  'module',
  'offer',
  'audience',
  'goals',
] as const;

export type GtmAutoStrategySectionId = (typeof GTM_AUTO_STRATEGY_SECTIONS)[number]['id'];
export type GtmWizardInterviewSectionId = (typeof GTM_WIZARD_INTERVIEW_SECTION_IDS)[number];

export interface GtmAutoSectionDraft {
  id: string;
  title: string;
  channel: string;
  summary: string;
  bullets: string[];
  body: string;
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
