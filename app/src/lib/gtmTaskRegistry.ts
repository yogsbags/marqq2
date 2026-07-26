/**
 * Maps GTM execute targets → task channels, CI pages, agents, and artifact types.
 * Task channels use ids like `ci-icps` so each workstream pins as its own sidebar channel.
 */

import type { AgentTarget } from '@/types/gtm';
import {
  COMPANY_INTEL_PAGES,
  type CompanyIntelPageId,
} from '@/components/modules/company-intelligence/pages';
import { skillsForAgentTarget, skillsForCiPage } from '@/lib/marketingSkillMap';

export const CI_TASK_CHANNEL_PREFIX = 'ci-';

export type GtmTaskDestination = {
  /** Sidebar / App module id — e.g. ci-icps */
  channelId: string;
  /** Short #channel title */
  channelTitle: string;
  channelDescription: string;
  /** Module id used for non-CI destinations */
  moduleId: string;
  /** Hash fragment for Company Intel routing */
  hash?: string;
  /** Company Intel page when module is company-intel */
  pageId?: CompanyIntelPageId;
  /** Artifact type to generate on open */
  artifactType?: string;
  /** Primary agent for this task */
  agentName?: string;
  /** Primary marketing skill ids (Corey Haines skill-library) — always set for every task */
  marketingSkills: string[];
  /**
   * Hard gate only when non-empty: user must connect ≥1 before generate.
   * Empty = task runs from crawl + GTM context (e.g. ICPs).
   */
  requiredConnectors: string[];
  /** Soft enrichers — nudge but never block */
  optionalConnectors?: string[];
};

type CiTaskDef = Omit<GtmTaskDestination, 'moduleId' | 'channelId'> & {
  pageId: CompanyIntelPageId;
  artifactType: string;
};

const CI_TASKS: Record<
  Extract<
    AgentTarget,
    | 'company_intel_icp'
    | 'company_intel_competitors'
    | 'company_intel_marketing_strategy'
    | 'company_intel_sales_enablement'
    | 'company_intel_pricing'
    | 'company_intel_content_strategy'
    | 'company_intel_channel_strategy'
    | 'company_intel_social_calendar'
    | 'company_intel_lead_magnets'
    | 'company_intel_marketing_ideas'
  >,
  CiTaskDef
> = {
  company_intel_icp: {
    channelTitle: 'icps',
    channelDescription: 'Ideal customer profiles · Neel',
    hash: 'ci=icps',
    pageId: 'icps',
    artifactType: 'icps',
    agentName: skillsForAgentTarget('company_intel_icp').agentName || 'neel',
    marketingSkills: skillsForAgentTarget('company_intel_icp').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_icp').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_icp').optionalConnectors || [],
  },
  company_intel_competitors: {
    channelTitle: 'competitors',
    channelDescription: 'Competitor landscape · Isha',
    hash: 'ci=competitor_intelligence',
    pageId: 'competitor_intelligence',
    artifactType: 'competitor_intelligence',
    agentName: skillsForAgentTarget('company_intel_competitors').agentName || 'isha',
    marketingSkills: skillsForAgentTarget('company_intel_competitors').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_competitors').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_competitors').optionalConnectors || [],
  },
  company_intel_marketing_strategy: {
    channelTitle: 'positioning',
    channelDescription: 'Positioning & messaging · Neel',
    hash: 'ci=positioning_messaging',
    pageId: 'positioning_messaging',
    artifactType: 'positioning_messaging',
    agentName: skillsForAgentTarget('company_intel_marketing_strategy').agentName || 'neel',
    marketingSkills: skillsForAgentTarget('company_intel_marketing_strategy').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_marketing_strategy').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_marketing_strategy').optionalConnectors || [],
  },
  company_intel_sales_enablement: {
    channelTitle: 'sales-enable',
    channelDescription: 'Sales enablement · Sam',
    hash: 'ci=sales_enablement',
    pageId: 'sales_enablement',
    artifactType: 'sales_enablement',
    agentName: skillsForAgentTarget('company_intel_sales_enablement').agentName || 'sam',
    marketingSkills: skillsForAgentTarget('company_intel_sales_enablement').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_sales_enablement').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_sales_enablement').optionalConnectors || [],
  },
  company_intel_pricing: {
    channelTitle: 'pricing',
    channelDescription: 'Pricing intelligence · Tara',
    hash: 'ci=pricing_intelligence',
    pageId: 'pricing_intelligence',
    artifactType: 'pricing_intelligence',
    agentName: skillsForAgentTarget('company_intel_pricing').agentName || 'tara',
    marketingSkills: skillsForAgentTarget('company_intel_pricing').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_pricing').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_pricing').optionalConnectors || [],
  },
  company_intel_content_strategy: {
    channelTitle: 'content',
    channelDescription: 'Content strategy · Sam',
    hash: 'ci=content_strategy',
    pageId: 'content_strategy',
    artifactType: 'content_strategy',
    agentName: skillsForAgentTarget('company_intel_content_strategy').agentName || 'sam',
    marketingSkills: skillsForAgentTarget('company_intel_content_strategy').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_content_strategy').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_content_strategy').optionalConnectors || [],
  },
  company_intel_channel_strategy: {
    channelTitle: 'channels',
    channelDescription: 'Channel strategy · Dev',
    hash: 'ci=channel_strategy',
    pageId: 'channel_strategy',
    artifactType: 'channel_strategy',
    agentName: skillsForAgentTarget('company_intel_channel_strategy').agentName || 'dev',
    marketingSkills: skillsForAgentTarget('company_intel_channel_strategy').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_channel_strategy').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_channel_strategy').optionalConnectors || [],
  },
  company_intel_social_calendar: {
    channelTitle: 'social-cal',
    channelDescription: 'Social calendar · Riya',
    hash: 'ci=social_calendar',
    pageId: 'social_calendar',
    artifactType: 'social_calendar',
    agentName: skillsForAgentTarget('company_intel_social_calendar').agentName || 'riya',
    marketingSkills: skillsForAgentTarget('company_intel_social_calendar').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_social_calendar').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_social_calendar').optionalConnectors || [],
  },
  company_intel_lead_magnets: {
    channelTitle: 'lead-magnets',
    channelDescription: 'Lead magnets · Tara',
    hash: 'ci=lead_magnets',
    pageId: 'lead_magnets',
    artifactType: 'lead_magnets',
    agentName: skillsForAgentTarget('company_intel_lead_magnets').agentName || 'tara',
    marketingSkills: skillsForAgentTarget('company_intel_lead_magnets').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_lead_magnets').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_lead_magnets').optionalConnectors || [],
  },
  company_intel_marketing_ideas: {
    channelTitle: 'mkt-ideas',
    channelDescription: 'Marketing ideas · Neel',
    hash: 'ci=marketing_ideas',
    pageId: 'marketing_ideas',
    artifactType: 'marketing_ideas',
    agentName: skillsForAgentTarget('company_intel_marketing_ideas').agentName || 'neel',
    marketingSkills: skillsForAgentTarget('company_intel_marketing_ideas').marketingSkills,
    requiredConnectors: skillsForAgentTarget('company_intel_marketing_ideas').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('company_intel_marketing_ideas').optionalConnectors || [],
  },
};

const STANDALONE: Partial<Record<AgentTarget, GtmTaskDestination>> = {
  lead_intelligence: {
    channelId: 'lead-intelligence',
    channelTitle: 'lead-intel',
    channelDescription: 'Lead intelligence · Arjun',
    moduleId: 'lead-intelligence',
    agentName: skillsForAgentTarget('lead_intelligence').agentName || 'arjun',
    marketingSkills: skillsForAgentTarget('lead_intelligence').marketingSkills,
    requiredConnectors: skillsForAgentTarget('lead_intelligence').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('lead_intelligence').optionalConnectors || [],
  },
  budget_optimization: {
    channelId: 'budget-optimization',
    channelTitle: 'budget',
    channelDescription: 'Budget optimization · Dev',
    moduleId: 'budget-optimization',
    agentName: skillsForAgentTarget('budget_optimization').agentName || 'dev',
    marketingSkills: skillsForAgentTarget('budget_optimization').marketingSkills,
    requiredConnectors: skillsForAgentTarget('budget_optimization').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('budget_optimization').optionalConnectors || [],
  },
  performance_scorecard: {
    channelId: 'performance-scorecard',
    channelTitle: 'performance',
    channelDescription: 'Performance scorecard',
    moduleId: 'performance-scorecard',
    agentName: skillsForAgentTarget('performance_scorecard').agentName || 'dev',
    marketingSkills: skillsForAgentTarget('performance_scorecard').marketingSkills,
    requiredConnectors: skillsForAgentTarget('performance_scorecard').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('performance_scorecard').optionalConnectors || [],
  },
  user_engagement: {
    channelId: 'user-engagement',
    channelTitle: 'engagement',
    channelDescription: 'User engagement',
    moduleId: 'user-engagement',
    agentName: skillsForAgentTarget('user_engagement').agentName || 'kiran',
    marketingSkills: skillsForAgentTarget('user_engagement').marketingSkills,
    requiredConnectors: skillsForAgentTarget('user_engagement').requiredConnectors,
    optionalConnectors: skillsForAgentTarget('user_engagement').optionalConnectors || [],
  },
};

export function isCiTaskChannel(moduleId: string | null | undefined): boolean {
  return Boolean(moduleId && moduleId.startsWith(CI_TASK_CHANNEL_PREFIX));
}

export function ciChannelIdForPage(pageId: CompanyIntelPageId): string {
  return `${CI_TASK_CHANNEL_PREFIX}${pageId}`;
}

export function moduleIdFromCiHash(hash?: string): string | null {
  const raw = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!value) return null;

  const candidate = value.startsWith('company-intel:')
    ? value.slice('company-intel:'.length)
    : new URLSearchParams(value.replace(/^(\?|&)/, '')).get('ci');

  if (!candidate) return null;
  const page = COMPANY_INTEL_PAGES.find(({ id }) => id === candidate);
  return page ? ciChannelIdForPage(page.id) : null;
}

export function pageIdFromCiChannel(moduleId: string): CompanyIntelPageId | null {
  if (!isCiTaskChannel(moduleId)) return null;
  const candidate = moduleId.slice(CI_TASK_CHANNEL_PREFIX.length);
  return COMPANY_INTEL_PAGES.some(({ id }) => id === candidate)
    ? candidate as CompanyIntelPageId
    : null;
}

export function getGtmTaskDestination(target: AgentTarget): GtmTaskDestination | null {
  const ci = CI_TASKS[target as keyof typeof CI_TASKS];
  if (ci) {
    const channelId = ciChannelIdForPage(ci.pageId);
    return {
      ...ci,
      channelId,
      moduleId: channelId,
    };
  }
  return STANDALONE[target] || null;
}

export function getCiTaskByPage(pageId: CompanyIntelPageId): CiTaskDef | null {
  const fromExecute = Object.values(CI_TASKS).find((t) => t.pageId === pageId);
  if (fromExecute) return fromExecute;

  // Pages that aren't GTM "Execute" targets still need skills + agent for the task deck
  const pack = skillsForCiPage(pageId);
  const artifactType =
    pageId === 'overview' || pageId === 'social_intel' || pageId === 'ads_intel'
      ? undefined
      : pageId;
  if (!artifactType && pageId !== 'overview' && pageId !== 'social_intel' && pageId !== 'ads_intel') {
    return null;
  }
  return {
    channelTitle: pageId.replace(/_/g, '-').slice(0, 18),
    channelDescription: `${pageId.replace(/_/g, ' ')} · ${pack.agentName || 'agent'}`,
    hash: `ci=${pageId}`,
    pageId,
    artifactType: artifactType || pageId,
    agentName: pack.agentName,
    marketingSkills: pack.marketingSkills,
    requiredConnectors: pack.requiredConnectors || [],
    optionalConnectors: pack.optionalConnectors || [],
  };
}

/** Prefer channel title for any known CI task page. */
export function channelMetaForModule(moduleId: string): { name: string; description: string } | null {
  if (!isCiTaskChannel(moduleId)) return null;
  const pageId = pageIdFromCiChannel(moduleId);
  if (!pageId) return null;
  const match = Object.values(CI_TASKS).find((t) => t.pageId === pageId);
  if (match) {
    return { name: match.channelTitle, description: match.channelDescription };
  }
  return { name: pageId.replace(/_/g, '-'), description: 'Company intelligence task' };
}

export function agentForCiPage(pageId: CompanyIntelPageId): string | undefined {
  const match = Object.values(CI_TASKS).find((t) => t.pageId === pageId);
  return match?.agentName || skillsForCiPage(pageId).agentName;
}

/**
 * Hard gate when required list is non-empty and none are connected (need ≥1).
 * Soft nudge when required is satisfied but optionals are still missing.
 */
export function evaluateTaskConnectors(
  dest: Pick<GtmTaskDestination, 'requiredConnectors' | 'optionalConnectors'>,
  activeConnectorIds: string[]
): {
  hardBlocked: boolean;
  softNudge: boolean;
  missingRequired: string[];
  missingOptional: string[];
  showIds: string[];
} {
  const active = new Set(activeConnectorIds);
  const required = dest.requiredConnectors || [];
  const optional = dest.optionalConnectors || [];
  const missingRequired = required.filter((id) => !active.has(id));
  const missingOptional = optional.filter((id) => !active.has(id));
  const hardBlocked = required.length > 0 && missingRequired.length === required.length;
  const softNudge =
    !hardBlocked && optional.length > 0 && missingOptional.length > 0;
  const showIds = hardBlocked
    ? missingRequired
    : softNudge
      ? missingOptional
      : [];
  return { hardBlocked, softNudge, missingRequired, missingOptional, showIds };
}

export const GTM_TASK_AUTORUN_KEY = 'marqq_gtm_task_autorun';

export type GtmTaskAutorunPayload = {
  channelId: string;
  pageId: CompanyIntelPageId;
  artifactType: string;
  agentTarget: AgentTarget;
  agentName?: string;
  companyId?: string | null;
  summary?: string;
  bullets?: string[];
  autoGenerate: boolean;
};
