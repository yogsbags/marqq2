/**
 * Maps GTM execute targets → task channels, CI pages, agents, and artifact types.
 * Task channels use ids like `ci-icps` so each workstream pins as its own sidebar channel.
 */

import type { AgentTarget } from '@/types/gtm';
import type { CompanyIntelPageId } from '@/components/modules/company-intelligence/pages';

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
  /**
   * Hard gate: at least one must be connected before auto-generate.
   * Empty = no hard gate (crawl/GTM context enough).
   */
  requiredConnectors?: string[];
  /** Soft enrichers — nudge but allow skip */
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
  >,
  CiTaskDef
> = {
  company_intel_icp: {
    channelTitle: 'icps',
    channelDescription: 'Ideal customer profiles · Neel',
    hash: 'ci=icps',
    pageId: 'icps',
    artifactType: 'icps',
    agentName: 'neel',
    requiredConnectors: [],
    optionalConnectors: ['hubspot', 'ga4', 'apollo'],
  },
  company_intel_competitors: {
    channelTitle: 'competitors',
    channelDescription: 'Competitor landscape · Isha',
    hash: 'ci=competitor_intelligence',
    pageId: 'competitor_intelligence',
    artifactType: 'competitor_intelligence',
    agentName: 'isha',
    requiredConnectors: [],
    optionalConnectors: ['semrush', 'ahrefs', 'gsc'],
  },
  company_intel_marketing_strategy: {
    channelTitle: 'positioning',
    channelDescription: 'Positioning & messaging · Neel',
    hash: 'ci=positioning_messaging',
    pageId: 'positioning_messaging',
    artifactType: 'positioning_messaging',
    agentName: 'neel',
    requiredConnectors: [],
    optionalConnectors: ['gsc', 'ga4'],
  },
  company_intel_sales_enablement: {
    channelTitle: 'sales-enable',
    channelDescription: 'Sales enablement · Sam',
    hash: 'ci=sales_enablement',
    pageId: 'sales_enablement',
    artifactType: 'sales_enablement',
    agentName: 'sam',
    requiredConnectors: ['hubspot', 'salesforce'],
    optionalConnectors: ['apollo'],
  },
  company_intel_pricing: {
    channelTitle: 'pricing',
    channelDescription: 'Pricing intelligence · Tara',
    hash: 'ci=pricing_intelligence',
    pageId: 'pricing_intelligence',
    artifactType: 'pricing_intelligence',
    agentName: 'tara',
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'shopify'],
  },
  company_intel_content_strategy: {
    channelTitle: 'content',
    channelDescription: 'Content strategy · Sam',
    hash: 'ci=content_strategy',
    pageId: 'content_strategy',
    artifactType: 'content_strategy',
    agentName: 'sam',
    requiredConnectors: [],
    optionalConnectors: ['gsc', 'ga4'],
  },
  company_intel_channel_strategy: {
    channelTitle: 'channels',
    channelDescription: 'Channel strategy · Dev',
    hash: 'ci=channel_strategy',
    pageId: 'channel_strategy',
    artifactType: 'channel_strategy',
    agentName: 'dev',
    requiredConnectors: ['ga4', 'google_ads', 'meta_ads', 'linkedin_ads'],
    optionalConnectors: ['gsc'],
  },
  company_intel_social_calendar: {
    channelTitle: 'social-cal',
    channelDescription: 'Social calendar · Riya',
    hash: 'ci=social_calendar',
    pageId: 'social_calendar',
    artifactType: 'social_calendar',
    agentName: 'riya',
    requiredConnectors: ['linkedin', 'facebook', 'instagram'],
    optionalConnectors: ['google_calendar'],
  },
  company_intel_lead_magnets: {
    channelTitle: 'lead-magnets',
    channelDescription: 'Lead magnets · Tara',
    hash: 'ci=lead_magnets',
    pageId: 'lead_magnets',
    artifactType: 'lead_magnets',
    agentName: 'tara',
    requiredConnectors: ['ga4', 'hubspot'],
    optionalConnectors: [],
  },
};

const STANDALONE: Partial<Record<AgentTarget, GtmTaskDestination>> = {
  lead_intelligence: {
    channelId: 'lead-intelligence',
    channelTitle: 'lead-intel',
    channelDescription: 'Lead intelligence · Arjun',
    moduleId: 'lead-intelligence',
    agentName: 'arjun',
    requiredConnectors: ['apollo', 'hubspot', 'salesforce'],
  },
  budget_optimization: {
    channelId: 'budget-optimization',
    channelTitle: 'budget',
    channelDescription: 'Budget optimization · Dev',
    moduleId: 'budget-optimization',
    agentName: 'dev',
    requiredConnectors: ['google_ads', 'meta_ads', 'ga4', 'linkedin_ads'],
  },
  performance_scorecard: {
    channelId: 'performance-scorecard',
    channelTitle: 'performance',
    channelDescription: 'Performance scorecard',
    moduleId: 'performance-scorecard',
    agentName: 'dev',
    requiredConnectors: ['ga4', 'gsc', 'google_ads', 'meta_ads'],
  },
  user_engagement: {
    channelId: 'user-engagement',
    channelTitle: 'engagement',
    channelDescription: 'User engagement',
    moduleId: 'user-engagement',
    requiredConnectors: ['ga4', 'mixpanel', 'amplitude'],
  },
};

export function isCiTaskChannel(moduleId: string | null | undefined): boolean {
  return Boolean(moduleId && moduleId.startsWith(CI_TASK_CHANNEL_PREFIX));
}

export function ciChannelIdForPage(pageId: CompanyIntelPageId): string {
  return `${CI_TASK_CHANNEL_PREFIX}${pageId}`;
}

export function pageIdFromCiChannel(moduleId: string): CompanyIntelPageId | null {
  if (!isCiTaskChannel(moduleId)) return null;
  return moduleId.slice(CI_TASK_CHANNEL_PREFIX.length) as CompanyIntelPageId;
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
  return Object.values(CI_TASKS).find((t) => t.pageId === pageId) || null;
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
  return match?.agentName;
}

/**
 * Hard gate when required list is non-empty and none are connected (at least one of required).
 * Soft nudge when only optional are missing.
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
  const softNudge = !hardBlocked && missingOptional.length > 0 && optional.some((id) => !active.has(id));
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
