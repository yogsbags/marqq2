/**
 * Canonical task → marketing skill + connector map (frontend).
 *
 * Connectors are NOT required for every task:
 * - Crawl/GTM-context tasks (ICPs, positioning, …) → requiredConnectors: []
 * - Live-data tasks (ads, CRM leads, social publish, …) → hard gate (≥1 required)
 * - optionalConnectors = soft enrichers only (nudge, never block)
 */

import type { CompanyIntelPageId } from '@/components/modules/company-intelligence/pages'
import type { AgentTarget } from '@/types/gtm'

export type SkillPack = {
  marketingSkills: string[]
  agentName?: string
  /** Hard gate: connect ≥1 before generate. Empty = crawl/GTM is enough. */
  requiredConnectors: string[]
  /** Soft enrichers — never block */
  optionalConnectors?: string[]
}

/** Every Company Intel page */
export const CI_PAGE_SKILLS: Record<CompanyIntelPageId, SkillPack> = {
  overview: {
    agentName: 'veena',
    marketingSkills: ['product-marketing-context', 'site-architecture', 'customer-research'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'gsc'],
  },
  client_profiling: {
    agentName: 'isha',
    marketingSkills: ['deep-company-analyser', 'customer-research', 'persona-definer', 'product-marketing-context'],
    // Stronger with CRM, but crawl + GTM still usable
    requiredConnectors: [],
    optionalConnectors: ['hubspot', 'salesforce', 'apollo', 'ga4'],
  },
  icps: {
    agentName: 'neel',
    marketingSkills: ['icp-definer', 'persona-definer', 'product-marketing-context', 'deep-company-analyser'],
    // ICPs come from site crawl + onboarding/GTM context — no connector required
    requiredConnectors: [],
    optionalConnectors: ['hubspot', 'apollo', 'ga4'],
  },
  partner_profiling: {
    agentName: 'isha',
    marketingSkills: ['marketing-ideas', 'launch-strategy', 'referral-program'],
    requiredConnectors: [],
    optionalConnectors: ['hubspot', 'linkedin', 'apollo'],
  },
  competitor_intelligence: {
    agentName: 'isha',
    marketingSkills: ['competitor-alternatives'],
    // Primary: crawl + research; SEO tools enrich
    requiredConnectors: [],
    optionalConnectors: ['semrush', 'ahrefs', 'gsc'],
  },
  social_intel: {
    agentName: 'kiran',
    marketingSkills: ['social-content', 'community-marketing', 'competitor-alternatives'],
    requiredConnectors: ['linkedin', 'instagram', 'facebook', 'twitter'],
    optionalConnectors: [],
  },
  ads_intel: {
    agentName: 'zara',
    marketingSkills: ['paid-ads', 'ad-creative', 'analytics-tracking'],
    requiredConnectors: ['meta_ads', 'google_ads', 'linkedin_ads'],
    optionalConnectors: ['ga4'],
  },
  website_audit: {
    agentName: 'tara',
    marketingSkills: ['page-cro', 'copywriting', 'form-cro'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'gsc'],
  },
  opportunities: {
    agentName: 'neel',
    marketingSkills: ['marketing-ideas', 'launch-strategy'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'gsc', 'hubspot'],
  },
  marketing_ideas: {
    agentName: 'neel',
    // Primary skill only on the UI badge — generation loads full pack via artifactMarketingSkills
    marketingSkills: ['marketing-ideas'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'gsc', 'meta_ads', 'google_ads'],
  },
  marketing_strategy: {
    agentName: 'neel',
    marketingSkills: ['gtm-action-thinker', 'marketing-ideas', 'launch-strategy', 'icp-definer', 'product-marketing-context'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'gsc', 'hubspot'],
  },
  positioning_messaging: {
    agentName: 'neel',
    marketingSkills: ['product-marketing-context', 'offer-definer', 'copywriting', 'campaign-angle-finder'],
    requiredConnectors: [],
    optionalConnectors: ['gsc', 'ga4'],
  },
  pricing_intelligence: {
    agentName: 'tara',
    marketingSkills: ['pricing-strategy'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'shopify'],
  },
  channel_strategy: {
    agentName: 'dev',
    marketingSkills: ['paid-ads', 'launch-strategy', 'analytics-tracking'],
    // Mix plan can start from GTM; paid platforms enrich
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'google_ads', 'meta_ads', 'linkedin_ads', 'gsc'],
  },
  content_strategy: {
    agentName: 'sam',
    marketingSkills: ['content-strategy', 'copywriting', 'humanizer', 'ai-seo'],
    requiredConnectors: [],
    optionalConnectors: ['gsc', 'ga4', 'ahrefs', 'semrush'],
  },
  sales_enablement: {
    agentName: 'sam',
    marketingSkills: ['sales-enablement', 'offer-definer', 'pain-identifier', 'copywriting'],
    // Battlecards from competitors + positioning still work; CRM enriches objections
    requiredConnectors: [],
    optionalConnectors: ['hubspot', 'salesforce', 'apollo'],
  },
  social_calendar: {
    agentName: 'riya',
    marketingSkills: ['social-content', 'content-strategy', 'copywriting', 'community-marketing'],
    // Calendar ideas from brand context; publishing channels needed for live sync
    requiredConnectors: [],
    optionalConnectors: ['linkedin', 'facebook', 'instagram', 'twitter', 'google_calendar'],
  },
  lead_magnets: {
    agentName: 'tara',
    marketingSkills: ['lead-magnets', 'copywriting', 'page-cro'],
    requiredConnectors: [],
    optionalConnectors: ['ga4', 'hubspot', 'klaviyo', 'wordpress', 'webflow', 'wix', 'shopify', 'github', 'railway'],
  },
  lookalike_audiences: {
    agentName: 'zara',
    marketingSkills: ['paid-ads', 'analytics-tracking'],
    // Needs ad platform / audience source to be actionable
    requiredConnectors: ['meta_ads', 'google_ads', 'ga4'],
    optionalConnectors: ['hubspot'],
  },
}

/** GTM execute / standalone modules */
export const AGENT_TARGET_SKILLS: Record<AgentTarget, SkillPack> = {
  company_intel_icp: CI_PAGE_SKILLS.icps,
  company_intel_competitors: CI_PAGE_SKILLS.competitor_intelligence,
  company_intel_marketing_strategy: CI_PAGE_SKILLS.positioning_messaging,
  company_intel_sales_enablement: CI_PAGE_SKILLS.sales_enablement,
  company_intel_pricing: CI_PAGE_SKILLS.pricing_intelligence,
  company_intel_content_strategy: CI_PAGE_SKILLS.content_strategy,
  company_intel_channel_strategy: CI_PAGE_SKILLS.channel_strategy,
  company_intel_social_calendar: CI_PAGE_SKILLS.social_calendar,
  company_intel_lead_magnets: CI_PAGE_SKILLS.lead_magnets,
  company_intel_marketing_ideas: CI_PAGE_SKILLS.marketing_ideas,
  lead_intelligence: {
    agentName: 'arjun',
    marketingSkills: ['icp-definer', 'outbound-campaign-architect', 'cold-email', 'trigger-finder', 'revops'],
    // At least one lead-data provider (Apollo or Hunter) — soft pool in workflowRequirements
    requiredConnectors: ['apollo', 'hunter'],
    optionalConnectors: ['instantly', 'hubspot', 'salesforce', 'gmail'],
  },
  budget_optimization: {
    agentName: 'dev',
    marketingSkills: ['paid-ads', 'analytics-tracking', 'ab-test-setup'],
    requiredConnectors: ['google_ads', 'meta_ads', 'ga4', 'linkedin_ads'],
    optionalConnectors: [],
  },
  performance_scorecard: {
    agentName: 'dev',
    marketingSkills: ['analytics-tracking', 'revops', 'ab-test-setup'],
    requiredConnectors: ['ga4', 'gsc', 'google_ads', 'meta_ads'],
    optionalConnectors: [],
  },
  user_engagement: {
    agentName: 'kiran',
    marketingSkills: ['onboarding-cro', 'churn-prevention', 'referral-program', 'email-sequence'],
    requiredConnectors: ['ga4', 'mixpanel', 'amplitude'],
    optionalConnectors: ['klaviyo', 'moengage'],
  },
}

export const MODULE_SKILLS: Record<string, SkillPack> = {
  'lead-intelligence': AGENT_TARGET_SKILLS.lead_intelligence,
  'lead-outreach': {
    agentName: 'sam',
    // First-touch drafting stays lean. Sequence/analyzer/refiner skills are
    // loaded only for the corresponding planning or revision action.
    marketingSkills: [
      'copywriting-first-touch',
      'cold-email',
      'linkedin-outbound-angle',
    ],
    requiredConnectors: ['instantly'],
    optionalConnectors: ['apollo', 'hunter', 'gmail', 'hubspot'],
  },
  'outreach-follow-up': {
    agentName: 'sam',
    marketingSkills: ['copywriting-follow-up', 'cta-designer'],
    requiredConnectors: ['instantly'],
    optionalConnectors: ['gmail', 'heyreach', 'hubspot'],
  },
  'linkedin-sequence': {
    agentName: 'sam',
    marketingSkills: ['linkedin-sequence', 'linkedin-outbound-angle'],
    requiredConnectors: ['heyreach'],
    optionalConnectors: ['apollo', 'hubspot'],
  },
  'reply-handler': {
    agentName: 'sam',
    marketingSkills: ['reply-handler', 'cta-designer'],
    requiredConnectors: [],
    optionalConnectors: ['gmail', 'instantly', 'heyreach', 'whatsapp'],
  },
  'outbound-analysis': {
    agentName: 'sam',
    marketingSkills: ['outbound-analyst', 'analytics-tracking', 'revops'],
    requiredConnectors: [],
    optionalConnectors: ['instantly', 'heyreach', 'hubspot', 'ga4'],
  },
  'value-prop-lister': {
    agentName: 'sam',
    marketingSkills: ['value-prop-lister', 'product-marketing-context', 'offer-definer'],
    requiredConnectors: [],
    optionalConnectors: ['google_drive', 'notion'],
  },
  'budget-optimization': AGENT_TARGET_SKILLS.budget_optimization,
  'performance-scorecard': AGENT_TARGET_SKILLS.performance_scorecard,
  'user-engagement': AGENT_TARGET_SKILLS.user_engagement,
  'email-sequence': {
    agentName: 'sam',
    marketingSkills: ['email-sequence', 'copywriting', 'marketing-psychology'],
    requiredConnectors: ['klaviyo', 'mailchimp', 'sendgrid'],
    optionalConnectors: ['hubspot', 'gmail'],
  },
  newsletter: {
    agentName: 'sam',
    marketingSkills: ['email-sequence', 'copywriting', 'copy-editing', 'marketing-psychology', 'humanizer'],
    requiredConnectors: [],
    optionalConnectors: ['mailchimp', 'klaviyo', 'gmail'],
  },
  generate_email_html: {
    agentName: 'riya',
    marketingSkills: ['email-sequence', 'copywriting', 'copy-editing', 'marketing-psychology', 'humanizer'],
    requiredConnectors: [],
    optionalConnectors: ['mailchimp', 'klaviyo', 'gmail'],
  },
  landing_page: {
    agentName: 'riya',
    marketingSkills: ['page-cro', 'copywriting', 'form-cro', 'marketing-psychology', 'copy-editing', 'ab-test-setup'],
    requiredConnectors: [],
    optionalConnectors: ['webflow', 'wordpress', 'ga4'],
  },
  'landing-pages': {
    agentName: 'riya',
    marketingSkills: ['page-cro', 'copywriting', 'form-cro', 'marketing-psychology', 'copy-editing', 'ab-test-setup'],
    requiredConnectors: [],
    optionalConnectors: ['webflow', 'wordpress', 'ga4'],
  },
  create_landing_page: {
    agentName: 'riya',
    marketingSkills: ['page-cro', 'copywriting', 'form-cro', 'marketing-psychology', 'copy-editing', 'ab-test-setup'],
    requiredConnectors: [],
    optionalConnectors: ['webflow', 'wordpress', 'ga4'],
  },
  'social-media': {
    agentName: 'kiran',
    marketingSkills: [
      'social-content',
      'copywriting',
      'humanizer',
      'community-marketing',
      'marketing-psychology',
      'content-strategy',
      'copy-editing',
      'ad-creative',
    ],
    requiredConnectors: ['linkedin', 'instagram', 'facebook', 'twitter'],
    optionalConnectors: ['meta_ads'],
  },
  b2c_organic_posts: {
    agentName: 'kiran',
    marketingSkills: [
      'social-content',
      'copywriting',
      'humanizer',
      'marketing-psychology',
      'content-strategy',
      'copy-editing',
      'community-marketing',
      'ad-creative',
    ],
    requiredConnectors: ['linkedin', 'instagram', 'facebook', 'twitter'],
    optionalConnectors: [],
  },
  'video-gen': {
    agentName: 'riya',
    marketingSkills: ['ad-creative', 'social-content', 'copywriting'],
    requiredConnectors: [],
    optionalConnectors: ['linkedin', 'instagram', 'meta_ads'],
  },
  'content-automation': {
    agentName: 'riya',
    marketingSkills: [
      'content-strategy',
      'copywriting',
      'ai-seo',
      'seo-audit',
      'humanizer',
      'marketing-psychology',
      'copy-editing',
    ],
    requiredConnectors: [],
    optionalConnectors: ['semrush', 'ahrefs', 'gsc', 'ga4', 'apify', 'firecrawl', 'github', 'railway', 'wordpress', 'webflow', 'wix', 'shopify', 'hostinger'],
  },
  seo_article: {
    agentName: 'riya',
    marketingSkills: [
      'ai-seo',
      'schema-markup',
      'seo-audit',
      'content-strategy',
      'copywriting',
      'programmatic-seo',
      'humanizer',
    ],
    requiredConnectors: [],
    optionalConnectors: ['semrush', 'ahrefs', 'gsc', 'apify', 'firecrawl', 'github', 'railway', 'wordpress', 'webflow', 'wix', 'shopify', 'hostinger'],
  },
  seo_article_b2c: {
    agentName: 'riya',
    marketingSkills: [
      'humanizer',
      'ai-seo',
      'schema-markup',
      'seo-audit',
      'copywriting',
      'content-strategy',
      'marketing-psychology',
      'copy-editing',
      'programmatic-seo',
    ],
    requiredConnectors: [],
    optionalConnectors: ['semrush', 'ahrefs', 'gsc', 'apify', 'firecrawl', 'github', 'railway', 'wordpress', 'webflow', 'wix', 'shopify', 'hostinger'],
  },
  'ai-voice-bot': {
    agentName: 'sam',
    marketingSkills: ['copywriting', 'sales-enablement', 'onboarding-cro'],
    requiredConnectors: [],
    optionalConnectors: ['hubspot', 'salesforce'],
  },
}

export function skillsForCiPage(pageId: CompanyIntelPageId): SkillPack {
  return (
    CI_PAGE_SKILLS[pageId] || {
      agentName: 'veena',
      marketingSkills: ['product-marketing-context', 'marketing-ideas'],
      requiredConnectors: [],
    }
  )
}

export function skillsForAgentTarget(target: AgentTarget): SkillPack {
  return (
    AGENT_TARGET_SKILLS[target] || {
      marketingSkills: ['marketing-ideas', 'product-marketing-context'],
      requiredConnectors: [],
    }
  )
}

export function skillsForModuleId(moduleId: string | null | undefined): SkillPack | null {
  if (!moduleId) return null
  if (moduleId.startsWith('ci-')) {
    const pageId = moduleId.slice(3) as CompanyIntelPageId
    return skillsForCiPage(pageId)
  }
  return MODULE_SKILLS[moduleId] || null
}
