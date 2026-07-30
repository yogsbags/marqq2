/**
 * Maps Company Intel / GTM artifact types + module task ids → marketing skills.
 * Skills: platform/agent-runtime/skills/marketingskills/skills/<id>/SKILL.md
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
  "agent-runtime",
  "skills",
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
    primary: ["icp-definer", "persona-definer", "product-marketing-context"],
    secondary: ["deep-company-analyser", "customer-research", "pain-identifier", "trigger-finder"],
  },
  icp_definition: {
    primary: ["icp-definer", "persona-definer", "product-marketing-context"],
    secondary: ["deep-company-analyser", "customer-research", "pain-identifier", "trigger-finder"],
  },
  client_profiling: {
    primary: ["deep-company-analyser", "customer-research"],
    secondary: ["persona-definer", "pain-identifier", "product-marketing-context"],
  },
  partner_profiling: {
    primary: ["marketing-ideas", "referral-program"],
    secondary: ["launch-strategy"],
  },
  competitor_intelligence: {
    primary: ["competitor-alternatives"],
  },
  positioning_messaging: {
    primary: ["product-marketing-context", "offer-definer", "copywriting"],
    secondary: ["campaign-angle-finder", "pain-identifier", "copywriting-refiner"],
  },
  sales_enablement: {
    primary: ["sales-enablement", "offer-definer"],
    secondary: ["pain-identifier", "copywriting", "competitor-alternatives", "trigger-finder"],
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
    primary: ["gtm-action-thinker", "marketing-ideas", "launch-strategy", "icp-definer"],
    secondary: ["product-marketing-context", "offer-definer", "campaign-angle-finder"],
  },
  gtm_strategy: {
    primary: ["product-marketing-context", "gtm-action-thinker", "launch-strategy", "icp-definer"],
    secondary: ["offer-definer", "trigger-finder", "campaign-angle-finder", "pricing-strategy", "sales-enablement"],
  },
  gtm_strategy_doc: {
    primary: ["product-marketing-context", "gtm-action-thinker", "launch-strategy", "icp-definer"],
    secondary: ["offer-definer", "trigger-finder", "campaign-angle-finder", "pricing-strategy", "sales-enablement"],
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
    primary: ["icp-definer", "outbound-campaign-architect", "cold-email"],
    secondary: ["persona-definer", "trigger-finder", "revops", "form-cro", "signup-flow-cro"],
  },
  lead_intelligence: {
    primary: ["icp-definer", "outbound-campaign-architect", "cold-email"],
    secondary: ["persona-definer", "trigger-finder", "revops", "form-cro", "signup-flow-cro"],
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
    primary: ["icp-definer", "persona-definer", "product-marketing-context"],
    secondary: ["deep-company-analyser", "customer-research", "pain-identifier"],
  },
  // Lead Outreach module + ICP → Launch Outreach deploy task_type
  "lead-outreach": {
    primary: ["outbound-campaign-architect", "copywriting-first-touch", "cold-email"],
    secondary: [
      "linkedin-outbound-angle",
      "campaign-angle-finder",
    ],
  },
  youtube_content_package: {
    primary: ["content-strategy", "copywriting", "social-content"],
    secondary: ["ai-seo", "ad-creative", "humanizer", "copy-editing"],
  },
  generate_youtube_content_package: {
    primary: ["content-strategy", "copywriting", "social-content"],
    secondary: ["ai-seo", "ad-creative", "humanizer", "copy-editing"],
  },
  repurpose_content_package: {
    primary: ["content-strategy", "social-content", "copywriting"],
    secondary: ["humanizer", "copy-editing", "community-marketing", "ai-seo"],
  },
  lead_outreach: {
    primary: ["outbound-campaign-architect", "copywriting-first-touch", "cold-email"],
    secondary: [
      "linkedin-outbound-angle",
      "campaign-angle-finder",
    ],
  },
  // Event-scoped outreach capabilities. These are loaded only when the
  // corresponding workflow action is requested, never for first-touch copy.
  cta_designer: {
    primary: ["cta-designer"],
    secondary: ["offer-definer"],
  },
  outreach_follow_up: {
    primary: ["copywriting-follow-up"],
    secondary: ["cold-email", "cta-designer"],
  },
  linkedin_sequence: {
    primary: ["linkedin-sequence"],
    secondary: ["linkedin-outbound-angle", "cta-designer"],
  },
  reply_handler: {
    primary: ["reply-handler"],
    secondary: ["copywriting", "cta-designer"],
  },
  outbound_analysis: {
    primary: ["outbound-analyst"],
    secondary: ["analytics-tracking", "revops"],
  },
  value_prop_lister: {
    primary: ["value-prop-lister"],
    secondary: ["product-marketing-context", "offer-definer"],
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
    primary: ["copywriting-first-touch", "cold-email"],
    secondary: [],
  },
  linkedin_dm: {
    primary: ["linkedin-outbound-angle", "copywriting"],
    secondary: [],
  },
  linkedin: {
    primary: ["linkedin-outbound-angle", "copywriting"],
    secondary: [],
  },
  whatsapp_dm: {
    primary: ["copywriting", "marketing-psychology"],
    secondary: [],
  },
  whatsapp: {
    primary: ["copywriting", "marketing-psychology"],
    secondary: [],
  },
  voicebot_script: {
    primary: ["sales-enablement", "copywriting"],
    secondary: [],
  },
  voicebot: {
    primary: ["sales-enablement", "copywriting"],
    secondary: [],
  },
};

/**
 * Revision is an explicit user action. Keep its pack separate so analyzer /
 * refiner guidance is not paid for or mixed into every first-touch draft.
 * @type {Record<string, SkillPack>}
 */
export const OUTREACH_REVISION_MARKETING_SKILLS = {
  email: {
    primary: ["cold-email", "copywriting-refiner"],
    secondary: [],
  },
  linkedin_dm: {
    primary: ["linkedin-outbound-angle", "copywriting-refiner"],
    secondary: [],
  },
  linkedin: {
    primary: ["linkedin-outbound-angle", "copywriting-refiner"],
    secondary: [],
  },
  whatsapp_dm: {
    primary: ["copywriting", "copywriting-refiner"],
    secondary: [],
  },
  whatsapp: {
    primary: ["copywriting", "copywriting-refiner"],
    secondary: [],
  },
  voicebot_script: {
    primary: ["sales-enablement", "copywriting-refiner"],
    secondary: [],
  },
  voicebot: {
    primary: ["sales-enablement", "copywriting-refiner"],
    secondary: [],
  },
};

const skillCache = new Map();
const PRIMARY_MAX_CHARS = 16_000;
const SECONDARY_MAX_CHARS = 4_000;
// Outreach prompts need the prospect and GTM context to remain dominant.
const OUTREACH_CONTEXT_MAX_CHARS = 14_000;
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
export function resolveOutreachChannelSkillPack(copyType, mode = "draft") {
  const key = String(copyType || "email").trim().toLowerCase();
  const source = mode === "revision"
    ? OUTREACH_REVISION_MARKETING_SKILLS
    : OUTREACH_CHANNEL_MARKETING_SKILLS;
  return source[key] || source.email;
}

/**
 * @param {SkillPack} mapping
 * @returns {Promise<string>}
 */
async function buildSkillBlock(mapping, { maxChars = null } = {}) {
  const primaryIds = Array.isArray(mapping.primary) ? mapping.primary : [];
  const secondaryIds = Array.isArray(mapping.secondary) ? mapping.secondary : [];
  const skillCount = new Set([...primaryIds, ...secondaryIds].filter(Boolean)).size;
  // Reserve room for the wrapper and separators, then distribute the outreach
  // budget so one large skill cannot crowd every other required playbook out.
  const compactSkillMaxChars = maxChars && skillCount
    ? Math.max(1_000, Math.floor((maxChars - 1_200) / skillCount))
    : null;
  const sections = [];

  for (const skillId of primaryIds) {
    const body = truncateSkill(
      await readSkillMarkdown(skillId),
      compactSkillMaxChars || PRIMARY_MAX_CHARS,
    );
    if (body) sections.push(`### Marketing skill: ${skillId} (primary)\n${body}`);
  }

  for (const skillId of secondaryIds) {
    const body = truncateSkill(
      await readSkillMarkdown(skillId),
      compactSkillMaxChars || SECONDARY_MAX_CHARS,
    );
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

  const block = [
    "## Required marketing skill playbook",
    "Execute this task using the marketing skill(s) below as the authoritative method.",
    "Follow their frameworks, checklists, and output structure where they do not conflict with any required JSON schema above.",
    "Prefer skill-specific terminology and quality bars over generic LLM advice.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n");

  return maxChars && block.length > maxChars ? truncateSkill(block, maxChars) : block;
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
  const key = String(taskKey || "").trim().toLowerCase();
  const maxChars = key === "lead-outreach" || key === "lead_outreach"
    ? OUTREACH_CONTEXT_MAX_CHARS
    : null;
  return buildSkillBlock(resolveSkillPack(taskKey), { maxChars });
}

/**
 * Skills for one Lead Outreach channel draft (injected into that channel's system prompt).
 * @param {string} copyType email | linkedin_dm | whatsapp_dm | voicebot_script
 */
export async function loadMarketingSkillsForOutreachChannel(copyType, { mode = "draft" } = {}) {
  return buildSkillBlock(resolveOutreachChannelSkillPack(copyType, mode), {
    maxChars: OUTREACH_CONTEXT_MAX_CHARS,
  });
}

/** Flat skill id list for a channel (primary then secondary). */
export function listOutreachChannelSkillIds(copyType, { mode = "draft" } = {}) {
  const pack = resolveOutreachChannelSkillPack(copyType, mode);
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
