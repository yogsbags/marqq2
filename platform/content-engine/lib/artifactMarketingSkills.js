/**
 * Maps Company Intel / GTM artifact types + module task ids → Corey Haines marketing skills.
 * Skills: platform/crewai/skill-library/marketingskills/skills/<id>/SKILL.md
 *
 * Every generate path should resolve at least one skill via this map (or DEFAULT_SKILL_PACK).
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKETINGSKILLS_DIR = join(
  __dirname,
  "..",
  "..",
  "crewai",
  "skill-library",
  "marketingskills",
  "skills"
);

/** @typedef {{ primary: string[], secondary?: string[] }} SkillPack */

/** @type {SkillPack} */
export const DEFAULT_SKILL_PACK = {
  primary: ["marketing-ideas", "product-marketing-context"],
};

/** @type {Record<string, SkillPack>} */
export const ARTIFACT_MARKETING_SKILLS = {
  icps: {
    primary: ["product-marketing-context", "customer-research"],
  },
  client_profiling: {
    primary: ["customer-research"],
    secondary: ["product-marketing-context"],
  },
  partner_profiling: {
    primary: ["marketing-ideas", "referral-program"],
    secondary: ["launch-strategy"],
  },
  competitor_intelligence: {
    primary: ["competitor-alternatives"],
  },
  positioning_messaging: {
    primary: ["product-marketing-context", "copywriting"],
  },
  sales_enablement: {
    primary: ["sales-enablement"],
    secondary: ["copywriting", "competitor-alternatives"],
  },
  pricing_intelligence: {
    primary: ["pricing-strategy"],
  },
  content_strategy: {
    primary: ["content-strategy"],
    secondary: ["copywriting"],
  },
  channel_strategy: {
    primary: ["paid-ads", "launch-strategy"],
    secondary: ["analytics-tracking"],
  },
  social_calendar: {
    primary: ["social-content"],
    secondary: ["content-strategy"],
  },
  lead_magnets: {
    primary: ["lead-magnets"],
    secondary: ["copywriting", "page-cro"],
  },
  lookalike_audiences: {
    primary: ["paid-ads"],
    secondary: ["analytics-tracking"],
  },
  marketing_strategy: {
    primary: ["marketing-ideas", "launch-strategy"],
    secondary: ["product-marketing-context"],
  },
  website_audit: {
    primary: ["page-cro"],
    secondary: ["copywriting", "form-cro"],
  },
  opportunities: {
    primary: ["marketing-ideas"],
    secondary: ["launch-strategy"],
  },
  // Non-JSON / connector-led pages — still mapped so agent assists use skills
  overview: {
    primary: ["product-marketing-context", "site-architecture"],
    secondary: ["customer-research"],
  },
  social_intel: {
    primary: ["social-content", "community-marketing"],
    secondary: ["competitor-alternatives"],
  },
  ads_intel: {
    primary: ["paid-ads", "ad-creative"],
    secondary: ["analytics-tracking"],
  },
};

/** Standalone module / deployment task ids */
/** @type {Record<string, SkillPack>} */
export const MODULE_MARKETING_SKILLS = {
  "lead-intelligence": {
    primary: ["cold-email", "revops"],
    secondary: ["form-cro", "signup-flow-cro"],
  },
  lead_intelligence: {
    primary: ["cold-email", "revops"],
    secondary: ["form-cro", "signup-flow-cro"],
  },
  "budget-optimization": {
    primary: ["paid-ads", "analytics-tracking"],
    secondary: ["ab-test-setup"],
  },
  budget_optimization: {
    primary: ["paid-ads", "analytics-tracking"],
    secondary: ["ab-test-setup"],
  },
  "performance-scorecard": {
    primary: ["analytics-tracking", "revops"],
    secondary: ["ab-test-setup"],
  },
  performance_scorecard: {
    primary: ["analytics-tracking", "revops"],
    secondary: ["ab-test-setup"],
  },
  "user-engagement": {
    primary: ["onboarding-cro", "churn-prevention"],
    secondary: ["referral-program", "email-sequence"],
  },
  user_engagement: {
    primary: ["onboarding-cro", "churn-prevention"],
    secondary: ["referral-program", "email-sequence"],
  },
  "email-sequence": {
    primary: ["email-sequence", "copywriting"],
    secondary: ["marketing-psychology"],
  },
  "social-media": {
    primary: ["social-content", "community-marketing"],
    secondary: ["ad-creative"],
  },
  "video-gen": {
    primary: ["ad-creative", "social-content"],
    secondary: ["copywriting"],
  },
  "content-automation": {
    primary: ["content-strategy", "copywriting"],
    secondary: ["ai-seo", "seo-audit"],
  },
  "ai-voice-bot": {
    primary: ["copywriting", "sales-enablement"],
    secondary: ["onboarding-cro"],
  },
  seo_audit: {
    primary: ["seo-audit", "ai-seo"],
    secondary: ["schema-markup", "content-strategy"],
  },
  daily_market_scan: {
    primary: ["analytics-tracking", "marketing-ideas"],
    secondary: ["content-strategy"],
  },
  campaign_brief: {
    primary: ["paid-ads", "ad-creative"],
    secondary: ["copywriting", "launch-strategy"],
  },
  social_monitor: {
    primary: ["social-content", "community-marketing"],
    secondary: ["analytics-tracking"],
  },
  report_delivery: {
    primary: ["email-sequence", "analytics-tracking"],
    secondary: ["copywriting"],
  },
  lead_score: {
    primary: ["revops", "cold-email"],
    secondary: ["form-cro"],
  },
  icp_build: {
    primary: ["product-marketing-context", "customer-research"],
  },
};

const skillCache = new Map();
const PRIMARY_MAX_CHARS = 14_000;
const SECONDARY_MAX_CHARS = 4_000;

async function readSkillMarkdown(skillId) {
  const key = String(skillId || "").trim();
  if (!key) return "";
  if (skillCache.has(key)) return skillCache.get(key);

  try {
    const raw = (await readFile(join(MARKETINGSKILLS_DIR, key, "SKILL.md"), "utf-8")).trim();
    skillCache.set(key, raw);
    return raw;
  } catch {
    skillCache.set(key, "");
    return "";
  }
}

function truncateSkill(content, maxChars) {
  const text = String(content || "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[…skill truncated for context budget…]`;
}

/**
 * @param {string} taskKey artifact type, page id, or module id
 * @returns {SkillPack}
 */
export function resolveSkillPack(taskKey) {
  const key = String(taskKey || "").trim();
  if (!key) return DEFAULT_SKILL_PACK;
  return (
    ARTIFACT_MARKETING_SKILLS[key] ||
    MODULE_MARKETING_SKILLS[key] ||
    DEFAULT_SKILL_PACK
  );
}

/**
 * @param {SkillPack} mapping
 * @returns {Promise<string>}
 */
async function buildSkillBlock(mapping) {
  const primaryIds = Array.isArray(mapping.primary) ? mapping.primary : [];
  const secondaryIds = Array.isArray(mapping.secondary) ? mapping.secondary : [];
  const sections = [];

  for (const skillId of primaryIds) {
    const body = truncateSkill(await readSkillMarkdown(skillId), PRIMARY_MAX_CHARS);
    if (body) sections.push(`### Marketing skill: ${skillId} (primary)\n${body}`);
  }

  for (const skillId of secondaryIds) {
    const body = truncateSkill(await readSkillMarkdown(skillId), SECONDARY_MAX_CHARS);
    if (body) sections.push(`### Marketing skill: ${skillId} (supporting)\n${body}`);
  }

  // Guarantee at least the default pack if named skills failed to load
  if (!sections.length) {
    for (const skillId of DEFAULT_SKILL_PACK.primary) {
      const body = truncateSkill(await readSkillMarkdown(skillId), PRIMARY_MAX_CHARS);
      if (body) sections.push(`### Marketing skill: ${skillId} (fallback)\n${body}`);
    }
  }

  if (!sections.length) return "";

  return [
    "## Required marketing skill playbook",
    "Execute this task using the marketing skill(s) below as the authoritative method.",
    "Follow their frameworks, checklists, and output structure where they do not conflict with any required JSON schema above.",
    "Prefer skill-specific terminology and quality bars over generic LLM advice.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n");
}

/**
 * @param {string} artifactType
 * @returns {Promise<string>}
 */
export async function loadMarketingSkillsForArtifact(artifactType) {
  return buildSkillBlock(resolveSkillPack(artifactType));
}

/**
 * For agent / module runs that are not CI artifacts (chat schedules, budget, leads, …).
 * @param {string} taskKey
 */
export async function loadMarketingSkillsForTask(taskKey) {
  return buildSkillBlock(resolveSkillPack(taskKey));
}

/**
 * @param {string} systemPrompt
 * @param {string} artifactType
 */
export async function enrichSystemPromptWithMarketingSkills(systemPrompt, artifactType) {
  const block = await loadMarketingSkillsForArtifact(artifactType);
  if (!block) return String(systemPrompt || "");
  return `${String(systemPrompt || "").trim()}\n\n${block}`;
}

export function marketingSkillsDir() {
  return MARKETINGSKILLS_DIR;
}
