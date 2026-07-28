/**
 * Maps Company Intel / GTM artifact types + module task ids → marketing skills.
 * Skills: platform/crewai/skill-library/marketingskills/skills/<id>/SKILL.md
 * (+ optional skills/<id>/references/*.md, e.g. ads-meta Meta audit catalog)
 *
 * Packs mix Corey Haines strategy skills with Claude Ads / Nouriva platform skills
 * (ads-meta, ads-plan, ads-create, …).
 *
 * Every generate path should resolve at least one skill via this map (or DEFAULT_SKILL_PACK).
 */

import { readdir, readFile } from "node:fs/promises";
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
  icp_definition: {
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
    primary: ["content-strategy", "copywriting", "humanizer"],
    secondary: ["ai-seo", "copy-editing"],
  },
  channel_strategy: {
    primary: ["ads-meta", "paid-ads", "launch-strategy"],
    secondary: ["ads-plan", "analytics-tracking"],
  },
  social_calendar: {
    primary: ["social-content"],
    secondary: ["content-strategy", "copywriting"],
  },
  social_posts: {
    primary: ["social-content", "copywriting", "humanizer"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "community-marketing"],
  },
  b2c_organic_posts: {
    primary: ["social-content", "copywriting", "humanizer"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "community-marketing", "ad-creative"],
  },
  generate_b2c_organic_pack: {
    primary: ["social-content", "copywriting", "humanizer"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "community-marketing", "ad-creative"],
  },
  lead_magnets: {
    primary: ["lead-magnets"],
    secondary: ["copywriting", "page-cro"],
  },
  lookalike_audiences: {
    primary: ["ads-meta", "paid-ads"],
    secondary: ["analytics-tracking"],
  },
  marketing_strategy: {
    primary: ["marketing-ideas", "launch-strategy"],
    secondary: ["product-marketing-context"],
  },
  gtm_strategy: {
    primary: ["product-marketing-context", "launch-strategy", "pricing-strategy"],
    secondary: ["sales-enablement", "content-strategy", "copywriting"],
  },
  gtm_strategy_doc: {
    primary: ["product-marketing-context", "launch-strategy", "pricing-strategy"],
    secondary: ["sales-enablement", "content-strategy", "copywriting"],
  },
  website_audit: {
    primary: ["page-cro"],
    secondary: ["copywriting", "form-cro"],
  },
  opportunities: {
    primary: ["marketing-ideas"],
    secondary: ["launch-strategy"],
  },
  marketing_ideas: {
    // Authoritative: Corey Haines marketing-ideas skill + full 139-idea catalog in references/
    primary: ["marketing-ideas"],
    secondary: [
      "product-marketing-context",
      "launch-strategy",
      "programmatic-seo",
      "competitor-alternatives",
      "free-tool-strategy",
      "referral-program",
      "email-sequence",
      "ad-creative",
    ],
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
    primary: ["ads-meta", "ads-creative", "ad-creative"],
    secondary: ["paid-ads", "analytics-tracking"],
  },
  campaign_brief: {
    primary: ["ads-meta", "ads-plan", "ad-creative"],
    secondary: ["ads-create", "copywriting", "launch-strategy"],
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
    primary: ["ads-meta", "paid-ads", "analytics-tracking"],
    secondary: ["ads-budget", "ab-test-setup"],
  },
  budget_optimization: {
    primary: ["ads-meta", "paid-ads", "analytics-tracking"],
    secondary: ["ads-budget", "ab-test-setup"],
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
    primary: ["social-content", "copywriting", "humanizer", "community-marketing"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "ad-creative"],
  },
  social_media: {
    primary: ["social-content", "copywriting", "humanizer", "community-marketing"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "ad-creative"],
  },
  b2c_organic_posts: {
    primary: ["social-content", "copywriting", "humanizer"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "community-marketing", "ad-creative"],
  },
  generate_b2c_organic_pack: {
    primary: ["social-content", "copywriting", "humanizer"],
    secondary: ["marketing-psychology", "content-strategy", "copy-editing", "community-marketing", "ad-creative"],
  },
  "video-gen": {
    primary: ["ad-creative", "social-content"],
    secondary: ["copywriting"],
  },
  "content-automation": {
    primary: ["content-strategy", "copywriting", "ai-seo"],
    secondary: ["seo-audit", "humanizer"],
  },
  seo_article: {
    primary: ["ai-seo", "schema-markup", "seo-audit", "content-strategy", "copywriting"],
    secondary: ["programmatic-seo", "copy-editing", "humanizer"],
  },
  create_seo_article: {
    primary: ["ai-seo", "schema-markup", "seo-audit", "content-strategy", "copywriting"],
    secondary: ["programmatic-seo", "copy-editing", "humanizer"],
  },
  /** Newsletter / HTML email */
  generate_email_html: {
    primary: ["email-sequence", "copywriting", "copy-editing"],
    secondary: ["marketing-psychology", "humanizer"],
  },
  newsletter: {
    primary: ["email-sequence", "copywriting", "copy-editing"],
    secondary: ["marketing-psychology", "humanizer"],
  },
  email_html: {
    primary: ["email-sequence", "copywriting", "copy-editing"],
    secondary: ["marketing-psychology", "humanizer"],
  },
  generate_email: {
    primary: ["email-sequence", "copywriting", "copy-editing"],
    secondary: ["marketing-psychology", "humanizer"],
  },
  /** Landing pages */
  landing_page: {
    primary: ["page-cro", "copywriting", "form-cro"],
    secondary: ["marketing-psychology", "copy-editing", "ab-test-setup", "signup-flow-cro"],
  },
  "landing-pages": {
    primary: ["page-cro", "copywriting", "form-cro"],
    secondary: ["marketing-psychology", "copy-editing", "ab-test-setup", "signup-flow-cro"],
  },
  create_landing_page: {
    primary: ["page-cro", "copywriting", "form-cro"],
    secondary: ["marketing-psychology", "copy-editing", "ab-test-setup", "signup-flow-cro"],
  },
  build_seo_organic_plan: {
    primary: ["ai-seo", "content-strategy", "seo-audit"],
    secondary: ["programmatic-seo", "schema-markup", "copywriting"],
  },
  execute_seo_plan_articles: {
    primary: ["ai-seo", "schema-markup", "seo-audit", "copywriting", "humanizer"],
    secondary: ["content-strategy", "programmatic-seo", "copy-editing"],
  },
  /** B2C blog / SEO — humanizer + SEO skills */
  seo_article_b2c: {
    primary: ["humanizer", "ai-seo", "schema-markup", "seo-audit", "copywriting"],
    secondary: ["content-strategy", "marketing-psychology", "copy-editing", "programmatic-seo"],
  },
  "ai-content": {
    primary: ["copywriting", "content-strategy"],
    secondary: ["humanizer", "ai-seo", "social-content"],
  },
  ai_content: {
    primary: ["copywriting", "content-strategy"],
    secondary: ["humanizer", "ai-seo", "social-content"],
  },
  "ai-voice-bot": {
    primary: ["copywriting", "sales-enablement"],
    secondary: ["onboarding-cro"],
  },
  seo_audit: {
    primary: ["seo-audit", "ai-seo"],
    secondary: ["schema-markup", "content-strategy", "humanizer"],
  },
  seo_analysis: {
    primary: ["ai-seo", "seo-audit"],
    secondary: ["content-strategy", "humanizer"],
  },
  daily_market_scan: {
    primary: ["analytics-tracking", "marketing-ideas"],
    secondary: ["content-strategy"],
  },
  campaign_brief: {
    primary: ["ads-meta", "ads-plan", "ad-creative"],
    secondary: ["ads-create", "copywriting", "launch-strategy"],
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
  // Lead Outreach module + ICP → Launch Outreach deploy task_type
  "lead-outreach": {
    primary: ["cold-email"],
    secondary: ["email-sequence", "copywriting"],
  },
  lead_outreach: {
    primary: ["cold-email"],
    secondary: ["email-sequence", "copywriting"],
  },
  // Paid Ads module + ICP cohort → Create Paid Ads deploy / Zara runs
  // ads-meta = Claude Ads / Nouriva Meta deep playbook (Andromeda, Pixel/CAPI, creative diversity)
  "paid-ads": {
    primary: ["ads-meta", "paid-ads", "launch-strategy"],
    secondary: ["ads-plan", "ads-budget", "ad-creative", "analytics-tracking"],
  },
  paid_ads: {
    primary: ["ads-meta", "paid-ads", "launch-strategy"],
    secondary: ["ads-plan", "ads-budget", "ad-creative", "analytics-tracking"],
  },
  paid_ads_strategy: {
    primary: ["ads-meta", "paid-ads", "launch-strategy"],
    secondary: ["ads-plan", "ads-budget", "ad-creative", "analytics-tracking"],
  },
  paid_ads_copy: {
    primary: ["ads-create", "ads-creative", "ad-creative"],
    secondary: ["ads-meta", "copywriting", "marketing-psychology"],
  },
  "ad-creative": {
    primary: ["ads-create", "ads-creative", "ad-creative"],
    secondary: ["ads-meta", "copywriting", "marketing-psychology"],
  },
};

/**
 * Per-channel skill packs for Lead Outreach draft copy
 * (email / LinkedIn DM / WhatsApp DM / voicebot opening).
 * @type {Record<string, SkillPack>}
 */
export const OUTREACH_CHANNEL_MARKETING_SKILLS = {
  email: {
    primary: ["cold-email"],
    secondary: ["email-sequence", "copywriting"],
  },
  linkedin_dm: {
    primary: ["social-content", "copywriting"],
    secondary: ["cold-email", "marketing-psychology"],
  },
  linkedin: {
    primary: ["social-content", "copywriting"],
    secondary: ["cold-email", "marketing-psychology"],
  },
  whatsapp_dm: {
    primary: ["copywriting", "marketing-psychology"],
    secondary: ["cold-email"],
  },
  whatsapp: {
    primary: ["copywriting", "marketing-psychology"],
    secondary: ["cold-email"],
  },
  voicebot_script: {
    primary: ["sales-enablement", "copywriting"],
    secondary: ["marketing-psychology"],
  },
  voicebot: {
    primary: ["sales-enablement", "copywriting"],
    secondary: ["marketing-psychology"],
  },
};

const skillCache = new Map();
const PRIMARY_MAX_CHARS = 16_000;
const SECONDARY_MAX_CHARS = 4_000;
const REFERENCE_MAX_CHARS = 6_000;
/** marketing-ideas depends on the full 139-idea catalog in references/ */
const MARKETING_IDEAS_REFERENCE_MAX_CHARS = 14_500;

async function readSkillMarkdown(skillId) {
  const key = String(skillId || "").trim();
  if (!key) return "";
  if (skillCache.has(key)) return skillCache.get(key);

  try {
    let raw = (await readFile(join(MARKETINGSKILLS_DIR, key, "SKILL.md"), "utf-8")).trim();

    // Optional bundled references/ (e.g. ads-meta/references/meta-audit.md,
    // marketing-ideas/references/ideas-by-category.md)
    try {
      const refsDir = join(MARKETINGSKILLS_DIR, key, "references");
      const files = (await readdir(refsDir))
        .filter((name) => name.toLowerCase().endsWith(".md"))
        .sort();
      // Prefer the ideas catalog first for marketing-ideas
      const ordered =
        key === "marketing-ideas"
          ? [
              ...files.filter((f) => f.includes("ideas-by-category")),
              ...files.filter((f) => !f.includes("ideas-by-category")),
            ]
          : files;
      const refBudget =
        key === "marketing-ideas" ? MARKETING_IDEAS_REFERENCE_MAX_CHARS : REFERENCE_MAX_CHARS;
      for (const file of ordered) {
        const refBody = (await readFile(join(refsDir, file), "utf-8")).trim();
        if (!refBody) continue;
        raw += `\n\n### Skill reference: ${file}\n${truncateSkill(refBody, refBudget)}`;
      }
    } catch {
      /* no references dir — fine */
    }

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
 * Skill pack for a single outreach channel draft (email, linkedin_dm, …).
 * @param {string} copyType
 * @returns {SkillPack}
 */
export function resolveOutreachChannelSkillPack(copyType) {
  const key = String(copyType || "email").trim().toLowerCase();
  return OUTREACH_CHANNEL_MARKETING_SKILLS[key] || OUTREACH_CHANNEL_MARKETING_SKILLS.email;
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
 * Skills for one Lead Outreach channel draft (injected into that channel's system prompt).
 * @param {string} copyType email | linkedin_dm | whatsapp_dm | voicebot_script
 */
export async function loadMarketingSkillsForOutreachChannel(copyType) {
  return buildSkillBlock(resolveOutreachChannelSkillPack(copyType));
}

/** Flat skill id list for a channel (primary then secondary). */
export function listOutreachChannelSkillIds(copyType) {
  const pack = resolveOutreachChannelSkillPack(copyType);
  return Array.from(
    new Set([...(pack.primary || []), ...(pack.secondary || [])].filter(Boolean)),
  );
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
