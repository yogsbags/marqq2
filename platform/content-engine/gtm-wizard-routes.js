/**
 * GTM Module Wizard — API routes
 * Sequential section-locked interview with 4-option questions.
 * Silent prep (crawl) without onboard briefing chain.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** In-flight quiet prep per workspace — starts on onboarding URL, merges later answers. */
const quietPrepByWorkspace = new Map();

export const GTM_INTERVIEW_SECTIONS = [
  {
    id: "module",
    title: "Module",
    description: "What product, service, app, or business line is this GTM for?",
    questions: [
      {
        id: "module_type",
        question: "What are you building a go-to-market plan for?",
        helperText: "This scopes every later answer to one offer line.",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "product", label: "Product", recommended: true },
          { value: "service", label: "Service" },
          { value: "app", label: "App" },
          { value: "business_line", label: "Business line / brand" },
        ],
      },
      {
        id: "module_name",
        question: "What should we call this module?",
        helperText: "Pick a clear name your team will recognize — or type your own.",
        type: "single_select",
        allowCustomAnswer: true,
      },
    ],
  },
  {
    id: "offer",
    title: "Offer",
    description: "What it is, how it makes money, and how you price it.",
    questions: [
      {
        id: "category",
        question: "Which category best describes this offer?",
        helperText: "How a buyer would search for you on a shelf.",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "one_liner",
        question: "Which one-liner best describes what it does?",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "business_model",
        question: "What is the primary business model?",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "saas_subscription", label: "SaaS / subscription", recommended: true },
          { value: "one_time", label: "One-time / project fee" },
          { value: "marketplace", label: "Marketplace / take-rate" },
          { value: "usage", label: "Usage-based / credits" },
        ],
      },
      {
        id: "pricing_strategy",
        question: "What is your pricing strategy?",
        helperText: "How you package and charge — select all that apply.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "value_based", label: "Value-based pricing", recommended: true },
          { value: "tiered_plans", label: "Tiered plans (Good / Better / Best)" },
          { value: "freemium_trial", label: "Freemium or free trial" },
          { value: "custom_enterprise", label: "Custom / enterprise quotes" },
        ],
      },
    ],
  },
  {
    id: "audience",
    title: "Audience",
    description: "Who buys, why they care, and when you need them.",
    questions: [
      {
        id: "icp",
        question: "Who is the ideal customer for this module?",
        helperText: "Select all that apply if you sell to more than one ICP.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "persona",
        question: "Who is the primary decision-maker or champion?",
        helperText: "You can select multiple stakeholders.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "jtbd",
        question: "What job are they hiring this offer to do?",
        helperText: "Select every job that is truly common — or type your own.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "target_timeline",
        question: "What timeline are you targeting for this audience?",
        helperText: "When do you need pipeline or adoption from this target?",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "0_30d", label: "Next 30 days", recommended: true },
          { value: "30_90d", label: "30–90 days" },
          { value: "90_180d", label: "This half (90–180 days)" },
          { value: "6_12m", label: "6–12 month horizon" },
        ],
      },
    ],
  },
  {
    id: "problem",
    title: "Problem",
    description: "Why buyers need a change now.",
    questions: [
      {
        id: "core_pain",
        question: "What is the core pain before they find you?",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "status_quo",
        question: "What do they use or do today instead?",
        helperText: "Select all common alternatives.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "cost_of_inaction",
        question: "What does inaction cost them most?",
        type: "single_select",
        allowCustomAnswer: true,
      },
    ],
  },
  {
    id: "positioning",
    title: "Positioning",
    description: "Why you win — statement, pitch, and proof.",
    questions: [
      {
        id: "differentiation",
        question: "What is your sharpest point of difference?",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "positioning_statement",
        question: "Which positioning statement fits best?",
        helperText: "For [target] who [need], [product] is [category] that [benefit].",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "elevator_pitch",
        question: "Which elevator pitch should agents lead with?",
        helperText: "A 20–30 second spoken pitch — or type your own.",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "competitors",
        question: "Who do buyers compare you against most often?",
        helperText: "Select every competitor or alternative that comes up regularly.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "proof",
        question: "What proof best earns trust in the first conversation?",
        helperText: "Select all proof points you can use.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
    ],
  },
  {
    id: "distribution",
    title: "Distribution",
    description: "How you reach buyers and what assets you already have.",
    questions: [
      {
        id: "distribution_strategy",
        question: "What is your primary distribution strategy?",
        helperText: "Select all routes you will use to put the offer in front of buyers.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "direct_sales", label: "Direct sales / outbound", recommended: true },
          { value: "partner_channel", label: "Partners / resellers / affiliates" },
          { value: "product_led", label: "Product-led / self-serve" },
          { value: "marketplace_platforms", label: "Marketplaces / platforms" },
        ],
      },
      {
        id: "marketing_assets",
        question: "Which marketing assets do you already have?",
        helperText: "Select what exists today — gaps become agent tasks.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "website_landing", label: "Website / landing pages", recommended: true },
          { value: "case_studies_deck", label: "Case studies / sales deck" },
          { value: "demo_video", label: "Demo / product video" },
          { value: "thin_assets", label: "Thin or outdated assets only" },
        ],
      },
    ],
  },
  {
    id: "content",
    title: "Content & Social",
    description: "How you educate, prove, and show up publicly.",
    questions: [
      {
        id: "content_strategy",
        question: "What should content strategy prioritize?",
        helperText: "Select all that matter for the next cycle.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "seo_thought_leadership", label: "SEO / thought leadership", recommended: true },
          { value: "product_education", label: "Product education / how-tos" },
          { value: "case_studies_proof", label: "Case studies / social proof" },
          { value: "demand_capture", label: "Demand-capture landing content" },
        ],
      },
      {
        id: "social_media_strategy",
        question: "What is your social media strategy?",
        helperText: "Where and how you show up — select all that apply.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "linkedin_b2b", label: "LinkedIn-first B2B", recommended: true },
          { value: "community_groups", label: "Community / groups / forums" },
          { value: "short_form_video", label: "Short-form video (Reels / Shorts)" },
          { value: "light_social", label: "Light presence — support other channels" },
        ],
      },
    ],
  },
  {
    id: "leads",
    title: "Lead Ops",
    description: "How leads are managed, scored, qualified, and followed up.",
    questions: [
      {
        id: "lead_mgmt_process",
        question: "How do you manage leads today?",
        helperText: "Select the process that matches reality — or type your own.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "crm_pipeline", label: "CRM pipeline with stages", recommended: true },
          { value: "spreadsheet_inbox", label: "Spreadsheet / shared inbox" },
          { value: "agency_handoff", label: "Agency or SDR handoff" },
          { value: "ad_hoc", label: "Ad hoc / founder-managed" },
        ],
      },
      {
        id: "lead_scoring",
        question: "How should leads be scored?",
        helperText: "What signals make a lead hot?",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "fit_intent", label: "ICP fit + buying intent", recommended: true },
          { value: "engagement_behavior", label: "Engagement / content behavior" },
          { value: "firmographic", label: "Firmographics (size, industry, geo)" },
          { value: "manual_sdr", label: "Manual SDR judgment only" },
        ],
      },
      {
        id: "tat_outreach_segment",
        question: "What TAT / outreach segment should we prioritize first?",
        helperText: "Turnaround focus for outbound — who gets contacted first.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "hot_inbound_24h", label: "Hot inbound — respond in 24h", recommended: true },
          { value: "warm_mql_48h", label: "Warm MQLs — 48h outreach" },
          { value: "cold_icp_weekly", label: "Cold ICP — weekly sequences" },
          { value: "expansion_accounts", label: "Expansion / existing accounts" },
        ],
      },
      {
        id: "lead_qualification",
        question: "What is your lead qualification process?",
        helperText: "How a lead becomes sales-ready.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "bant_meddic", label: "BANT / MEDDIC-style discovery", recommended: true },
          { value: "demo_request", label: "Demo / meeting booked = qualified" },
          { value: "score_threshold", label: "Score threshold then human review" },
          { value: "founder_call", label: "Founder / AE gut-check call" },
        ],
      },
    ],
  },
  {
    id: "goals",
    title: "Goals",
    description: "What success looks like in the next 90 days.",
    questions: [
      {
        id: "priority_90d",
        question: "What is the #1 priority for the next 90 days?",
        helperText: "Select one or more priorities if they are equally urgent.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "leads", label: "Generate qualified leads", recommended: true },
          { value: "awareness", label: "Build brand awareness" },
          { value: "conversion", label: "Improve conversion rates" },
          { value: "retention", label: "Retain and expand customers" },
        ],
      },
      {
        id: "channel_bet",
        question: "Which channel should lead first?",
        helperText: "Select the channels you want to lead with.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "content_seo", label: "Content / SEO" },
          { value: "paid", label: "Paid acquisition" },
          { value: "social", label: "Social / community" },
          { value: "sales_led", label: "Sales-led outreach", recommended: true },
        ],
      },
      {
        id: "budget_band",
        question: "What is the approximate marketing budget for 90 days?",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "under_5l", label: "Under ₹5L / $6k" },
          { value: "5_20l", label: "₹5–20L / $6–25k", recommended: true },
          { value: "20_50l", label: "₹20–50L / $25–60k" },
          { value: "50l_plus", label: "₹50L+ / $60k+" },
        ],
      },
    ],
  },
];

export const GTM_SECTION_ORDER = GTM_INTERVIEW_SECTIONS.map((s) => s.id);

export const EXECUTE_TASK_CATALOG = [
  {
    id: "icp_brief",
    title: "Build ICP brief",
    description: "Turn locked audience answers into a usable ICP card.",
    agentTarget: "company_intel_icp",
  },
  {
    id: "competitors",
    title: "Competitor landscape",
    description: "Map alternatives and where you win/lose.",
    agentTarget: "company_intel_competitors",
  },
  {
    id: "channel_plan",
    title: "90-day channel plan",
    description: "Rank channels and draft the first campaign idea.",
    agentTarget: "company_intel_channel_strategy",
  },
  {
    id: "content_messaging",
    title: "Content & messaging starter",
    description: "Outline content pillars and core message angles.",
    agentTarget: "company_intel_content_strategy",
  },
  {
    id: "lead_magnet",
    title: "Lead magnet outline",
    description: "Propose a lead magnet matched to ICP pains.",
    agentTarget: "company_intel_lead_magnets",
  },
];

function db(supabaseAdminClient, supabase) {
  return supabaseAdminClient || supabase;
}

function parseJsonLoose(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mkgDigest(mkg) {
  if (!mkg || typeof mkg !== "object") return {};
  const out = {};
  for (const [key, envelope] of Object.entries(mkg)) {
    if (!envelope || typeof envelope !== "object") continue;
    if (envelope.value == null) continue;
    out[key] = {
      value: envelope.value,
      confidence: envelope.confidence ?? 0,
    };
  }
  return out;
}

function sectionDef(sectionId) {
  return GTM_INTERVIEW_SECTIONS.find((s) => s.id === sectionId) || null;
}

function nextSectionId(sectionId) {
  const idx = GTM_SECTION_ORDER.indexOf(sectionId);
  if (idx < 0 || idx >= GTM_SECTION_ORDER.length - 1) return null;
  return GTM_SECTION_ORDER[idx + 1];
}

function prevSectionId(sectionId) {
  const idx = GTM_SECTION_ORDER.indexOf(sectionId);
  if (idx <= 0) return null;
  return GTM_SECTION_ORDER[idx - 1];
}

function allInterviewLocked(sectionState) {
  return GTM_SECTION_ORDER.every((id) => sectionState?.[id]?.locked === true);
}

function fallbackOptions(question, sourceContext, profile) {
  const company = sourceContext?.onboarding?.company || "Your company";
  const industry = sourceContext?.onboarding?.industry || "your industry";
  const icp = sourceContext?.onboarding?.icp || "your ideal customer";
  const crawl = sourceContext?.crawlDigest || {};
  const positioning =
    typeof crawl.positioning?.value === "string"
      ? crawl.positioning.value
      : `${company} — AI-assisted marketing`;

  const banks = {
    module_name: [
      { value: company, label: company, recommended: true },
      { value: `${company} — Core`, label: `${company} — Core` },
      { value: `${company} — ${industry}`, label: `${company} — ${industry}` },
      { value: `${company} — Growth offer`, label: `${company} — Growth offer` },
    ],
    category: [
      { value: `${industry} software`, label: `${industry} software`, recommended: true },
      { value: "B2B SaaS", label: "B2B SaaS" },
      { value: "Professional services", label: "Professional services" },
      { value: "Consumer app", label: "Consumer app" },
    ],
    one_liner: [
      {
        value: positioning.slice(0, 120),
        label: positioning.slice(0, 120),
        recommended: true,
      },
      {
        value: `${company} helps ${icp} get marketing outcomes with AI agents.`,
        label: `${company} helps ${icp} get marketing outcomes with AI agents.`,
      },
      {
        value: `An AI marketing OS for ${industry} teams.`,
        label: `An AI marketing OS for ${industry} teams.`,
      },
      {
        value: `${company} replaces agency busywork with autonomous GTM execution.`,
        label: `${company} replaces agency busywork with autonomous GTM execution.`,
      },
    ],
    icp: [
      { value: icp, label: icp, recommended: true },
      { value: `SMB marketing leaders in ${industry}`, label: `SMB marketing leaders in ${industry}` },
      { value: "Agency owners managing multiple clients", label: "Agency owners managing multiple clients" },
      { value: "Founder-led sales teams without a full marketing hire", label: "Founder-led sales teams without a full marketing hire" },
    ],
    persona: [
      { value: "Head of Marketing / CMO", label: "Head of Marketing / CMO", recommended: true },
      { value: "Founder / CEO", label: "Founder / CEO" },
      { value: "Growth / Demand Gen lead", label: "Growth / Demand Gen lead" },
      { value: "Agency account director", label: "Agency account director" },
    ],
    jtbd: [
      { value: "Launch GTM without hiring an agency", label: "Launch GTM without hiring an agency", recommended: true },
      { value: "Produce consistent pipeline every month", label: "Produce consistent pipeline every month" },
      { value: "Replace fragmented marketing tools", label: "Replace fragmented marketing tools" },
      { value: "Run multi-client marketing faster", label: "Run multi-client marketing faster" },
    ],
    core_pain: [
      { value: "Marketing execution is slow and fragmented", label: "Marketing execution is slow and fragmented", recommended: true },
      { value: "Dependence on expensive agencies", label: "Dependence on expensive agencies" },
      { value: "No clear ICP or messaging", label: "No clear ICP or messaging" },
      { value: "Content and campaigns lack compounding learning", label: "Content and campaigns lack compounding learning" },
    ],
    status_quo: [
      { value: "Freelance marketers + point SaaS tools", label: "Freelance marketers + point SaaS tools", recommended: true },
      { value: "Full-service agency retainer", label: "Full-service agency retainer" },
      { value: "In-house junior + ChatGPT ad hoc", label: "In-house junior + ChatGPT ad hoc" },
      { value: "Founder doing marketing themselves", label: "Founder doing marketing themselves" },
    ],
    cost_of_inaction: [
      { value: "Missed pipeline and slower revenue", label: "Missed pipeline and slower revenue", recommended: true },
      { value: "Burned budget on unfocused campaigns", label: "Burned budget on unfocused campaigns" },
      { value: "Team burnout from manual GTM work", label: "Team burnout from manual GTM work" },
      { value: "Losing share to more consistent competitors", label: "Losing share to more consistent competitors" },
    ],
    differentiation: [
      {
        value: "Autonomous multi-agent marketing OS with company memory",
        label: "Autonomous multi-agent marketing OS with company memory",
        recommended: true,
      },
      { value: "Faster time-to-brief than agencies", label: "Faster time-to-brief than agencies" },
      { value: "India-first pricing with global quality", label: "India-first pricing with global quality" },
      { value: "Outcome ledger that improves per company over time", label: "Outcome ledger that improves per company over time" },
    ],
    competitors: [
      { value: "Marketing agencies", label: "Marketing agencies", recommended: true },
      { value: "HubSpot + Semrush stack", label: "HubSpot + Semrush stack" },
      { value: "Generic AI content tools", label: "Generic AI content tools" },
      { value: "In-house marketing hire", label: "In-house marketing hire" },
    ],
    proof: [
      { value: "Pilot case study / before-after metrics", label: "Pilot case study / before-after metrics", recommended: true },
      { value: "Live demo of agent briefing", label: "Live demo of agent briefing" },
      { value: "Founder expertise / domain credibility", label: "Founder expertise / domain credibility" },
      { value: "Transparent workflow outputs customers can review", label: "Transparent workflow outputs customers can review" },
    ],
    positioning_statement: [
      {
        value: `For ${icp} who need a better way to get results, ${company} is a ${industry} solution that delivers clearer outcomes without the usual friction.`,
        label: `For ${icp} who need a better way to get results, ${company} is a ${industry} solution that delivers clearer outcomes without the usual friction.`,
        recommended: true,
      },
      {
        value:
          typeof crawl.positioning?.value === "string" && String(crawl.positioning.value).length > 48
            ? String(crawl.positioning.value).slice(0, 220)
            : `For ${icp} who are underserved by generic alternatives, ${company} is the ${industry} option that makes the hard part simple.`,
        label:
          typeof crawl.positioning?.value === "string" && String(crawl.positioning.value).length > 48
            ? String(crawl.positioning.value).slice(0, 220)
            : `For ${icp} who are underserved by generic alternatives, ${company} is the ${industry} option that makes the hard part simple.`,
      },
      {
        value: `For buyers comparing crowded ${industry} options, ${company} is the choice that wins on clarity, proof, and speed to value.`,
        label: `For buyers comparing crowded ${industry} options, ${company} is the choice that wins on clarity, proof, and speed to value.`,
      },
      {
        value: `For ${icp} who cannot afford guesswork, ${company} is a focused ${industry} product that turns intent into measurable progress.`,
        label: `For ${icp} who cannot afford guesswork, ${company} is a focused ${industry} product that turns intent into measurable progress.`,
      },
    ],
    elevator_pitch: [
      {
        value: `${company} helps ${icp} get better ${industry} outcomes faster — without the usual complexity, delay, or generic advice.`,
        label: `${company} helps ${icp} get better ${industry} outcomes faster — without the usual complexity, delay, or generic advice.`,
        recommended: true,
      },
      {
        value: `Most options in ${industry} are noisy and generic. ${company} is built around ${icp}, so every recommendation feels relevant from day one.`,
        label: `Most options in ${industry} are noisy and generic. ${company} is built around ${icp}, so every recommendation feels relevant from day one.`,
      },
      {
        value: `In thirty seconds: ${company} takes your context, focuses on what matters for ${icp}, and turns it into clear next steps.`,
        label: `In thirty seconds: ${company} takes your context, focuses on what matters for ${icp}, and turns it into clear next steps.`,
      },
      {
        value: `Think of ${company} as the ${industry} partner that removes guesswork and compounds results over time.`,
        label: `Think of ${company} as the ${industry} partner that removes guesswork and compounds results over time.`,
      },
    ],
  };

  const picked = banks[question.id];
  if (picked) return picked.slice(0, 4);

  return [
    { value: "option_a", label: "Option A", recommended: true },
    { value: "option_b", label: "Option B" },
    { value: "option_c", label: "Option C" },
    { value: "option_d", label: "Option D" },
  ];
}

function resolveGtmContext(sourceContext, profile) {
  const onboarding = sourceContext?.onboarding || {};
  const crawl = sourceContext?.crawlDigest || {};
  const company =
    (typeof profile?.module?.name === "string" && profile.module.name) ||
    (typeof profile?.module?.module_name === "string" && profile.module.module_name) ||
    onboarding.company ||
    "Your company";
  const industry =
    (typeof profile?.offer?.category === "string" && profile.offer.category) ||
    onboarding.industry ||
    "your category";
  const icp =
    (typeof profile?.audience?.icp === "string" && profile.audience.icp) ||
    onboarding.icp ||
    "your ideal customer";
  const oneLiner =
    (typeof profile?.offer?.one_liner === "string" && profile.offer.one_liner) ||
    (typeof crawl.positioning?.value === "string" && crawl.positioning.value) ||
    "";
  const differentiation =
    (typeof profile?.positioning?.differentiation === "string" &&
      profile.positioning.differentiation) ||
    "";
  return { company, industry, icp, oneLiner, differentiation, crawl };
}

/**
 * Positioning + elevator pitch must never be short feature chips.
 * Build full statements/pitches from locked profile + onboarding context.
 */
function deterministicMessagingOptions(questionId, sourceContext, profile) {
  const { company, industry, icp, oneLiner, differentiation } = resolveGtmContext(
    sourceContext,
    profile
  );

  if (questionId === "positioning_statement") {
    const statements = [
      `For ${icp} who need a better way to get results, ${company} is a ${industry} solution that delivers clearer outcomes without the usual friction.`,
      `For ${icp} frustrated by generic alternatives, ${company} is the ${industry} option that makes the hard part simple and personal.`,
      differentiation
        ? `For ${icp} who want a clear edge, ${company} stands apart because ${differentiation}.`
        : `For buyers comparing crowded ${industry} choices, ${company} is the one that wins on clarity, proof, and speed to value.`,
      oneLiner && oneLiner.length > 48
        ? oneLiner.slice(0, 220)
        : `For ${icp} who cannot afford guesswork, ${company} is a focused ${industry} product that turns intent into measurable progress.`,
    ];
    return statements.slice(0, 4).map((label, i) => ({
      value: `pos_${i + 1}`,
      label: String(label).slice(0, 220),
      recommended: i === 0,
    }));
  }

  if (questionId === "elevator_pitch") {
    const pitches = [
      `${company} helps ${icp} get better ${industry} outcomes faster — without the usual complexity, delay, or generic advice.`,
      `Most ${industry} tools feel generic. ${company} is built around ${icp}, so every recommendation is relevant from day one.`,
      `In thirty seconds: ${company} takes your context, focuses on what matters for ${icp}, and turns it into clear next steps.`,
      differentiation
        ? `Here’s the difference: ${differentiation}. That’s why ${icp} choose ${company}.`
        : `Think of ${company} as the ${industry} partner that removes guesswork and compounds results over time.`,
    ];
    return pitches.slice(0, 4).map((label, i) => ({
      value: `pitch_${i + 1}`,
      label: String(label).slice(0, 220),
      recommended: i === 0,
    }));
  }

  return null;
}

function optionLabelLimit(questionId) {
  if (
    questionId === "positioning_statement" ||
    questionId === "elevator_pitch" ||
    questionId === "one_liner"
  ) {
    return 220;
  }
  return 120;
}

function optionsLookValid(questionId, options) {
  if (!Array.isArray(options) || options.length < 4) return false;
  if (questionId === "positioning_statement") {
    return options.every((o) => {
      const label = String(o.label || "").trim();
      return (
        label.length >= 48 &&
        /\b(for|who|is|that|helps|enables)\b/i.test(label)
      );
    });
  }
  if (questionId === "elevator_pitch") {
    return options.every((o) => {
      const label = String(o.label || "").trim();
      // Reject title-case feature chips ("Lab Report Integration")
      const wordCount = label.split(/\s+/).filter(Boolean).length;
      return label.length >= 48 && wordCount >= 8 && /[.!?,]|helps|for |we /i.test(label);
    });
  }
  return true;
}

function questionOptionGuidance(question) {
  const id = question.id;
  const guides = {
    positioning_statement: `Each option MUST be a full positioning statement in this shape:
"For [target buyer] who [need/problem], [product] is a [category] that [key benefit]."
Do NOT output product features, feature names, category chips, or short titles.`,
    elevator_pitch: `Each option MUST be a spoken 1–3 sentence elevator pitch (20–30 seconds).
Do NOT output feature lists or short product names.`,
    differentiation: `Each option is a sharp point of difference vs alternatives — a benefit claim, not a feature name alone.`,
    one_liner: `Each option is a single sentence product one-liner.`,
    icp: `Each option names a concrete ideal customer segment.`,
    persona: `Each option is a buyer persona / role title.`,
    jtbd: `Each option is a job-to-be-done the buyer hires the product for.`,
    competitors: `Each option is a competitor brand, category alternative, or status-quo substitute.`,
    proof: `Each option is a proof asset or trust signal usable in sales.`,
  };
  return guides[id] || "Options must directly answer the question. No unrelated feature lists.";
}

async function generateOptionsForQuestion(groq, question, sourceContext, profile) {
  if (Array.isArray(question.fixedOptions) && question.fixedOptions.length === 4) {
    return question.fixedOptions;
  }

  // Never let the LLM invent feature chips for messaging questions
  const deterministic = deterministicMessagingOptions(
    question.id,
    sourceContext,
    profile
  );
  if (deterministic) return deterministic;

  const labelMax = optionLabelLimit(question.id);
  const system = `You generate exactly 4 multiple-choice options for a GTM interview question.
Return JSON only: {"options":[{"value":"short_slug","label":"Human-readable option text","recommended":true|false}]}
Rules:
- Exactly 4 options
- At most one recommended:true
- Prefer language grounded in onboarding + website crawl + locked profile
- Labels max ${labelMax} characters
- value is a short slug; label is what the user reads
- No markdown
- CRITICAL: answer THIS question only — do not reuse product feature names unless the question asks for features
${questionOptionGuidance(question)}`;

  const user = JSON.stringify({
    question: question.question,
    helperText: question.helperText || "",
    questionId: question.id,
    sourceContext: {
      onboarding: sourceContext?.onboarding || {},
      crawlDigest: sourceContext?.crawlDigest || {},
    },
    lockedProfile: profile,
  });

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.35,
      max_tokens: 900,
    });
    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = parseJsonLoose(raw);
    const options = Array.isArray(parsed?.options) ? parsed.options : [];
    const cleaned = options
      .map((o, i) => ({
        value: String(o.value || `opt_${i + 1}`).slice(0, 80),
        label: String(o.label || o.value || `Option ${i + 1}`).slice(0, labelMax),
        recommended: Boolean(o.recommended),
      }))
      .filter((o) => o.label.trim());
    if (cleaned.length >= 4 && optionsLookValid(question.id, cleaned)) {
      const four = cleaned.slice(0, 4);
      if (!four.some((o) => o.recommended)) four[0].recommended = true;
      return four;
    }
  } catch (err) {
    console.warn("[gtm-wizard] option generation failed:", err.message);
  }

  return fallbackOptions(question, sourceContext, profile);
}

async function syncModuleContextToAgents(deps, moduleRow) {
  const { CTX_DIR, writeContextToSupabase } = deps;
  const profile = moduleRow.profile || {};
  const onboarding = moduleRow.source_context?.onboarding || {};
  const fields = {
    company: profile.module?.name || onboarding.company || moduleRow.name || "",
    website_url: onboarding.websiteUrl || onboarding.website_url || "",
    industry: profile.offer?.category || onboarding.industry || "",
    icp: profile.audience?.icp || onboarding.icp || "",
    competitors: profile.positioning?.competitors || onboarding.competitors || "",
    primary_goal: profile.goals?.priority_90d || onboarding.primaryGoal || "",
    goals: [
      profile.goals?.priority_90d,
      profile.goals?.channel_bet,
      profile.offer?.one_liner,
      profile.audience?.target_timeline,
      profile.offer?.pricing_strategy,
      profile.positioning?.positioning_statement,
      profile.positioning?.elevator_pitch,
      profile.distribution?.distribution_strategy,
      profile.content?.content_strategy,
      profile.content?.social_media_strategy,
      profile.leads?.lead_qualification,
      profile.leads?.tat_outreach_segment,
    ]
      .filter(Boolean)
      .join(" | "),
    campaigns: "",
    keywords: "",
  };

  if (moduleRow.workspace_id && typeof writeContextToSupabase === "function") {
    await writeContextToSupabase(moduleRow.workspace_id, fields);
  }

  if (moduleRow.user_id && CTX_DIR) {
    const content = `# Client Context — GTM Module

**Module**: ${moduleRow.name}
**Type**: ${moduleRow.module_type}
**Company**: ${fields.company}
**Website**: ${fields.website_url || "—"}
**Industry**: ${fields.industry || "—"}
**Target ICP**: ${fields.icp || "—"}
**Target timeline**: ${profile.audience?.target_timeline || "—"}
**Pricing strategy**: ${profile.offer?.pricing_strategy || "—"}
**Positioning**: ${profile.positioning?.positioning_statement || "—"}
**Elevator pitch**: ${profile.positioning?.elevator_pitch || "—"}
**Distribution**: ${profile.distribution?.distribution_strategy || "—"}
**Marketing assets**: ${profile.distribution?.marketing_assets || "—"}
**Content strategy**: ${profile.content?.content_strategy || "—"}
**Social strategy**: ${profile.content?.social_media_strategy || "—"}
**Lead mgmt**: ${profile.leads?.lead_mgmt_process || "—"}
**Lead scoring**: ${profile.leads?.lead_scoring || "—"}
**TAT / outreach segment**: ${profile.leads?.tat_outreach_segment || "—"}
**Lead qualification**: ${profile.leads?.lead_qualification || "—"}
**Competitors**: ${fields.competitors || "—"}
**Primary Goal**: ${fields.primary_goal || "—"}
**Key Goals**: ${fields.goals || "—"}

## Locked GTM Profile
\`\`\`json
${JSON.stringify(profile, null, 2)}
\`\`\`
`;
    try {
      await mkdir(CTX_DIR, { recursive: true });
      await writeFile(join(CTX_DIR, `${moduleRow.user_id}.md`), content, "utf-8");
      await writeFile(
        join(CTX_DIR, `module_${moduleRow.id}.md`),
        content,
        "utf-8"
      );
    } catch {
      /* non-critical */
    }
  }
}

async function loadModule(client, id) {
  const { data, error } = await client.from("gtm_modules").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

function progressPayload(moduleRow) {
  const sectionState = moduleRow.section_state || {};
  const current =
    GTM_SECTION_ORDER.find((id) => !sectionState[id]?.locked) || null;
  return {
    sections: GTM_INTERVIEW_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      locked: Boolean(sectionState[s.id]?.locked),
      lockedAt: sectionState[s.id]?.locked_at || null,
      answerCount: Object.keys(sectionState[s.id]?.answers || {}).length,
      totalQuestions: s.questions.length,
    })),
    currentSectionId: allInterviewLocked(sectionState) ? "execute" : current,
    allLocked: allInterviewLocked(sectionState),
    status: moduleRow.status,
  };
}

/**
 * @param {import('express').Express} app
 * @param {object} deps
 */
export function registerGtmWizardRoutes(app, deps) {
  const {
    groq,
    supabaseAdminClient,
    supabase,
    MKGService,
    crawlCompanyForMKG,
    buildContextPatchFromCrawl,
    initializeMKGTemplate,
    writeContextToSupabase,
    CTX_DIR,
  } = deps;

  const client = () => db(supabaseAdminClient, supabase);

  // ── List modules ──────────────────────────────────────────────────────────
  app.get("/api/gtm/modules", async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || "").trim();
      const userId = String(req.query.userId || "").trim();
      if (!workspaceId && !userId) {
        return res.status(400).json({ error: "workspaceId or userId is required" });
      }
      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });

      let q = c.from("gtm_modules").select("*").neq("status", "archived").order("updated_at", { ascending: false });
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      else q = q.eq("user_id", userId);

      const { data, error } = await q;
      if (error) throw error;
      res.json({ modules: data || [] });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Create module ─────────────────────────────────────────────────────────
  app.post("/api/gtm/modules", async (req, res) => {
    try {
      const {
        workspaceId,
        userId,
        companyId,
        name,
        moduleType,
        sourceContext,
        active = true,
      } = req.body || {};

      if (!workspaceId || !userId) {
        return res.status(400).json({ error: "workspaceId and userId are required" });
      }

      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });

      const type = ["product", "service", "app", "business_line"].includes(moduleType)
        ? moduleType
        : "product";

      const row = {
        workspace_id: workspaceId,
        user_id: userId,
        company_id: companyId || null,
        name: String(name || "Untitled module").trim() || "Untitled module",
        module_type: type,
        status: "draft",
        source_context: sourceContext || {},
        profile: {
          module: { type, name: String(name || "").trim() },
          locked_sections: [],
          inferences: {},
        },
        section_state: {},
        active: Boolean(active),
      };

      const { data, error } = await c.from("gtm_modules").insert(row).select("*").single();
      if (error) throw error;
      res.status(201).json({ module: data, progress: progressPayload(data) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Get one module ────────────────────────────────────────────────────────
  app.get("/api/gtm/modules/:id", async (req, res) => {
    try {
      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const data = await loadModule(c, req.params.id);
      if (!data) return res.status(404).json({ error: "Module not found" });
      res.json({ module: data, progress: progressPayload(data) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Patch module (rename / set active / type) ──────────────────────────────
  app.patch("/api/gtm/modules/:id", async (req, res) => {
    try {
      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const existing = await loadModule(c, req.params.id);
      if (!existing) return res.status(404).json({ error: "Module not found" });

      const patch = {};
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        patch.name = req.body.name.trim();
      }
      if (["product", "service", "app", "business_line"].includes(req.body?.moduleType)) {
        patch.module_type = req.body.moduleType;
      }
      if (typeof req.body?.active === "boolean") patch.active = req.body.active;
      if (["draft", "in_progress", "ready", "archived"].includes(req.body?.status)) {
        patch.status = req.body.status;
      }

      const profile = { ...(existing.profile || {}) };
      if (patch.name || patch.module_type) {
        profile.module = {
          ...(profile.module || {}),
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.module_type ? { type: patch.module_type } : {}),
        };
        patch.profile = profile;
      }

      const { data, error } = await c
        .from("gtm_modules")
        .update(patch)
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error) throw error;

      if (data.active) {
        await syncModuleContextToAgents(
          { CTX_DIR, writeContextToSupabase },
          data
        );
      }

      res.json({ module: data, progress: progressPayload(data) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Silent prep (crawl + context, NO briefing chain) ──────────────────────
  app.post("/api/gtm/prep", async (req, res) => {
    try {
      const {
        workspaceId,
        userId,
        companyId,
        websiteUrl,
        companyName,
        onboarding = {},
        moduleId = null,
      } = req.body || {};

      if (!workspaceId || !userId) {
        return res.status(400).json({ error: "workspaceId and userId are required" });
      }

      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });

      let resolvedCompanyId = companyId || null;
      const normalizedUrl = websiteUrl
        ? String(websiteUrl).startsWith("http")
          ? String(websiteUrl)
          : `https://${String(websiteUrl)}`
        : null;

      // Ensure company exists for intel/MKG when URL provided
      if (!resolvedCompanyId && normalizedUrl) {
        try {
          const existing = await c
            .from("companies")
            .select("id, website_url")
            .eq("workspace_id", workspaceId)
            .limit(50);
          const match = (existing.data || []).find(
            (row) =>
              row.website_url &&
              String(row.website_url).replace(/\/$/, "") ===
                normalizedUrl.replace(/\/$/, "")
          );
          if (match) resolvedCompanyId = match.id;
          else {
            const newId = randomUUID();
            const { data: created } = await c
              .from("companies")
              .insert({
                id: newId,
                company_name: companyName || onboarding.company || "Company",
                website_url: normalizedUrl,
                workspace_id: workspaceId,
                profile: {},
              })
              .select("id")
              .single();
            resolvedCompanyId = created?.id || newId;
          }
        } catch (err) {
          console.warn("[gtm/prep] company ensure failed:", err.message);
        }
      }

      const urlKey = (normalizedUrl || "").replace(/\/$/, "");
      const existingPrep = quietPrepByWorkspace.get(workspaceId);
      const sameUrlRecent =
        existingPrep &&
        existingPrep.urlKey === urlKey &&
        Date.now() - existingPrep.startedAt < 12 * 60 * 1000;

      if (sameUrlRecent) {
        existingPrep.onboarding = {
          ...existingPrep.onboarding,
          ...(onboarding || {}),
          company: companyName || onboarding.company || existingPrep.onboarding.company || "",
          websiteUrl: normalizedUrl || onboarding.websiteUrl || existingPrep.onboarding.websiteUrl || "",
        };
        existingPrep.companyName = companyName || existingPrep.companyName;
        if (moduleId) existingPrep.moduleId = moduleId;
        if (resolvedCompanyId) existingPrep.companyId = resolvedCompanyId;

        if (!existingPrep.done) {
          return res.status(202).json({
            prep_id: existingPrep.prepId,
            companyId: existingPrep.companyId,
            moduleId: existingPrep.moduleId || null,
            deduped: true,
            message: "Prep already in progress. Poll GET /api/gtm/prep/status?workspaceId=…",
          });
        }

        // Crawl already finished — merge richer onboarding into saved module (no second Compound run)
        try {
          const { data: modules } = await c
            .from("gtm_modules")
            .select("id, source_context")
            .eq("workspace_id", workspaceId)
            .neq("status", "archived")
            .order("updated_at", { ascending: false })
            .limit(5);
          const target =
            (moduleId && (modules || []).find((m) => m.id === moduleId)) ||
            (modules || []).find((m) => m.source_context?.prep_id === existingPrep.prepId) ||
            (modules || [])[0];
          if (target) {
            const prev = target.source_context || {};
            await c
              .from("gtm_modules")
              .update({
                source_context: {
                  ...prev,
                  onboarding: {
                    ...(prev.onboarding || {}),
                    ...existingPrep.onboarding,
                  },
                },
              })
              .eq("id", target.id);
          }
        } catch (err) {
          console.warn("[gtm/prep] post-crawl onboarding merge failed:", err.message);
        }

        return res.status(202).json({
          prep_id: existingPrep.prepId,
          companyId: existingPrep.companyId,
          moduleId: existingPrep.moduleId || moduleId || null,
          deduped: true,
          already_ready: true,
          message: "Prep already complete; onboarding context updated.",
        });
      }

      const prepId = randomUUID();
      quietPrepByWorkspace.set(workspaceId, {
        prepId,
        urlKey,
        startedAt: Date.now(),
        done: false,
        companyId: resolvedCompanyId,
        moduleId: moduleId || null,
        companyName: companyName || onboarding.company || "Company",
        onboarding: {
          company: companyName || onboarding.company || "",
          websiteUrl: normalizedUrl || onboarding.websiteUrl || "",
          industry: onboarding.industry || "",
          icp: onboarding.icp || "",
          competitors: onboarding.competitors || "",
          connectedIntegrations: onboarding.connectedIntegrations || "",
        },
      });

      res.status(202).json({
        prep_id: prepId,
        companyId: resolvedCompanyId,
        moduleId: moduleId || null,
        message: "Prep started. Poll GET /api/gtm/prep/status?workspaceId=…",
      });

      // Background quiet crawl — no Isha/Neel/Zara chain
      setImmediate(async () => {
        let crawlDigest = {};
        let crawlError = null;
        let inferences = [];
        const state = quietPrepByWorkspace.get(workspaceId) || {};

        try {
          if (resolvedCompanyId && typeof initializeMKGTemplate === "function") {
            await initializeMKGTemplate(resolvedCompanyId);
          }

          if (normalizedUrl && typeof crawlCompanyForMKG === "function") {
            const crawlResult = await crawlCompanyForMKG(
              normalizedUrl,
              state.companyName || companyName || onboarding.company
            );
            if (resolvedCompanyId && typeof buildContextPatchFromCrawl === "function") {
              const patch = buildContextPatchFromCrawl(
                crawlResult,
                "veena",
                randomUUID()
              );
              await MKGService.patch(resolvedCompanyId, patch);
            }
            if (resolvedCompanyId) {
              const mkg = await MKGService.read(resolvedCompanyId);
              crawlDigest = mkgDigest(mkg);
            } else {
              crawlDigest = crawlResult || {};
            }
            inferences = Object.entries(crawlDigest)
              .filter(([, v]) => v && (v.confidence ?? 0) > 0)
              .slice(0, 8)
              .map(([k, v]) => `${k}: ${typeof v.value === "string" ? v.value : JSON.stringify(v.value)}`);
          }
        } catch (err) {
          crawlError = String(err.message || err);
          console.error("[gtm/prep] quiet crawl failed:", crawlError);
        }

        // Re-read state so industry/ICP filled later in onboarding are included
        const latest = quietPrepByWorkspace.get(workspaceId) || state;
        const mergedOnboarding = {
          company: latest.companyName || companyName || onboarding.company || "",
          websiteUrl: normalizedUrl || onboarding.websiteUrl || "",
          industry: "",
          icp: "",
          competitors: "",
          connectedIntegrations: "",
          ...(latest.onboarding || {}),
        };

        const sourceContext = {
          prep_id: prepId,
          prepared_at: new Date().toISOString(),
          onboarding: mergedOnboarding,
          companyId: latest.companyId || resolvedCompanyId,
          crawlDigest,
          crawlError,
          inferences: { from_crawl: inferences, confidence: crawlError ? 0.2 : 0.7 },
        };
        const persistModuleId = latest.moduleId || moduleId;

        try {
          const companyIdToSave = latest.companyId || resolvedCompanyId;
          if (persistModuleId) {
            await c
              .from("gtm_modules")
              .update({
                source_context: sourceContext,
                company_id: companyIdToSave,
                status: "in_progress",
                active: true,
                profile: {
                  locked_sections: [],
                  inferences: sourceContext.inferences,
                },
              })
              .eq("id", persistModuleId);
          } else {
            const { data: modules } = await c
              .from("gtm_modules")
              .select("id, status")
              .eq("workspace_id", workspaceId)
              .neq("status", "archived")
              .order("updated_at", { ascending: false })
              .limit(5);

            const draft = (modules || []).find(
              (m) => m.status === "draft" || m.status === "in_progress"
            );

            if (draft) {
              await c
                .from("gtm_modules")
                .update({
                  source_context: sourceContext,
                  company_id: companyIdToSave,
                  status: "in_progress",
                })
                .eq("id", draft.id);
            } else {
              await c.from("gtm_modules").insert({
                workspace_id: workspaceId,
                user_id: userId,
                company_id: companyIdToSave,
                name: mergedOnboarding.company || "Untitled module",
                module_type: "product",
                status: "in_progress",
                source_context: sourceContext,
                profile: {
                  locked_sections: [],
                  inferences: sourceContext.inferences,
                },
                section_state: {},
                active: true,
              });
            }
          }
        } catch (err) {
          console.error("[gtm/prep] failed to persist source_context:", err.message);
        } finally {
          const fin = quietPrepByWorkspace.get(workspaceId);
          if (fin && fin.prepId === prepId) {
            fin.done = true;
            // Keep briefly so a late merge can still patch; then drop
            setTimeout(() => {
              const cur = quietPrepByWorkspace.get(workspaceId);
              if (cur && cur.prepId === prepId) quietPrepByWorkspace.delete(workspaceId);
            }, 60_000);
          }
        }
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // Prep status via latest module source_context for workspace
  app.get("/api/gtm/prep/status", async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || "").trim();
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId is required" });
      }
      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });

      const { data, error } = await c
        .from("gtm_modules")
        .select("*")
        .eq("workspace_id", workspaceId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const ready = Boolean(data?.source_context?.prepared_at);
      res.json({
        ready,
        module: data || null,
        progress: data ? progressPayload(data) : null,
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Section questions (4 options) ─────────────────────────────────────────
  app.post("/api/gtm/sections/:sectionId/questions", async (req, res) => {
    try {
      const sectionId = req.params.sectionId;
      const def = sectionDef(sectionId);
      if (!def) return res.status(404).json({ error: "Unknown section" });

      const { moduleId } = req.body || {};
      if (!moduleId) return res.status(400).json({ error: "moduleId is required" });

      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const moduleRow = await loadModule(c, moduleId);
      if (!moduleRow) return res.status(404).json({ error: "Module not found" });

      const sectionState = moduleRow.section_state || {};
      if (sectionState[sectionId]?.locked) {
        return res.status(409).json({
          error: "Section already locked",
          section: sectionState[sectionId],
        });
      }

      // Enforce sequence: prior sections must be locked (except first)
      const idx = GTM_SECTION_ORDER.indexOf(sectionId);
      for (let i = 0; i < idx; i++) {
        const prior = GTM_SECTION_ORDER[i];
        if (!sectionState[prior]?.locked) {
          return res.status(409).json({
            error: `Lock section "${prior}" before "${sectionId}"`,
            currentSectionId: prior,
          });
        }
      }

      const sourceContext = moduleRow.source_context || {};
      const profile = moduleRow.profile || {};
      const draftAnswers = sectionState[sectionId]?.answers || {};

      const questions = [];
      for (const q of def.questions) {
        const options = await generateOptionsForQuestion(
          groq,
          q,
          sourceContext,
          profile
        );
        questions.push({
          id: q.id,
          question: q.question,
          helperText: q.helperText || "",
          type: q.type === "multi_select" ? "multi_select" : "single_select",
          options,
          // Always offer a free-text escape hatch — fixed option lists included.
          allowCustomAnswer: true,
          selectedValue: draftAnswers[q.id]?.value ?? null,
          selectedLabel: draftAnswers[q.id]?.label ?? null,
        });
      }

      res.json({
        sectionId,
        title: def.title,
        description: def.description,
        questions,
        progress: progressPayload(moduleRow),
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Save draft answers (before lock) ──────────────────────────────────────
  app.post("/api/gtm/sections/:sectionId/answers", async (req, res) => {
    try {
      const sectionId = req.params.sectionId;
      const def = sectionDef(sectionId);
      if (!def) return res.status(404).json({ error: "Unknown section" });

      const { moduleId, answers } = req.body || {};
      if (!moduleId || !answers || typeof answers !== "object") {
        return res.status(400).json({ error: "moduleId and answers are required" });
      }

      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const moduleRow = await loadModule(c, moduleId);
      if (!moduleRow) return res.status(404).json({ error: "Module not found" });

      const sectionState = { ...(moduleRow.section_state || {}) };
      if (sectionState[sectionId]?.locked) {
        return res.status(409).json({ error: "Section already locked" });
      }

      const normalized = {};
      for (const q of def.questions) {
        const a = answers[q.id];
        if (!a) continue;
        normalized[q.id] = {
          value: String(a.value ?? a).trim(),
          label: String(a.label ?? a.value ?? a).trim(),
        };
      }

      sectionState[sectionId] = {
        ...(sectionState[sectionId] || {}),
        locked: false,
        answers: {
          ...(sectionState[sectionId]?.answers || {}),
          ...normalized,
        },
      };

      const { data, error } = await c
        .from("gtm_modules")
        .update({
          section_state: sectionState,
          status: "in_progress",
        })
        .eq("id", moduleId)
        .select("*")
        .single();
      if (error) throw error;

      res.json({ module: data, progress: progressPayload(data) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Lock section ──────────────────────────────────────────────────────────
  app.post("/api/gtm/sections/:sectionId/lock", async (req, res) => {
    try {
      const sectionId = req.params.sectionId;
      const def = sectionDef(sectionId);
      if (!def) return res.status(404).json({ error: "Unknown section" });

      const { moduleId, answers } = req.body || {};
      if (!moduleId) return res.status(400).json({ error: "moduleId is required" });

      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const moduleRow = await loadModule(c, moduleId);
      if (!moduleRow) return res.status(404).json({ error: "Module not found" });

      const sectionState = { ...(moduleRow.section_state || {}) };
      const mergedAnswers = {
        ...(sectionState[sectionId]?.answers || {}),
        ...(answers || {}),
      };

      // Normalize + require all questions
      const normalized = {};
      for (const q of def.questions) {
        const a = mergedAnswers[q.id];
        if (!a || !(a.value || a.label || typeof a === "string")) {
          return res.status(400).json({
            error: `Missing answer for question "${q.id}"`,
          });
        }
        normalized[q.id] = {
          value: String(a.value ?? a).trim(),
          label: String(a.label ?? a.value ?? a).trim(),
        };
      }

      const idx = GTM_SECTION_ORDER.indexOf(sectionId);
      for (let i = 0; i < idx; i++) {
        if (!sectionState[GTM_SECTION_ORDER[i]]?.locked) {
          return res.status(409).json({
            error: `Lock prior section "${GTM_SECTION_ORDER[i]}" first`,
          });
        }
      }

      sectionState[sectionId] = {
        locked: true,
        locked_at: new Date().toISOString(),
        answers: normalized,
      };

      const profile = { ...(moduleRow.profile || {}) };
      const flat = {};
      for (const [qid, ans] of Object.entries(normalized)) {
        flat[qid] = ans.label || ans.value;
      }
      profile[sectionId] = flat;
      profile.locked_sections = GTM_SECTION_ORDER.filter(
        (id) => sectionState[id]?.locked
      );
      if (moduleRow.source_context?.inferences) {
        profile.inferences = moduleRow.source_context.inferences;
      }

      let name = moduleRow.name;
      let moduleType = moduleRow.module_type;
      if (sectionId === "module") {
        if (normalized.module_name?.label) name = normalized.module_name.label;
        if (normalized.module_type?.value) {
          moduleType = ["product", "service", "app", "business_line"].includes(
            normalized.module_type.value
          )
            ? normalized.module_type.value
            : moduleType;
        }
        profile.module = {
          type: moduleType,
          name,
        };
      }

      const lockedAll = allInterviewLocked(sectionState);
      const { data, error } = await c
        .from("gtm_modules")
        .update({
          section_state: sectionState,
          profile,
          name,
          module_type: moduleType,
          status: lockedAll ? "ready" : "in_progress",
          active: true,
        })
        .eq("id", moduleId)
        .select("*")
        .single();
      if (error) throw error;

      await syncModuleContextToAgents(
        { CTX_DIR, writeContextToSupabase },
        data
      );

      res.json({
        module: data,
        progress: progressPayload(data),
        nextSectionId: lockedAll ? "execute" : nextSectionId(sectionId),
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Unlock last section only ──────────────────────────────────────────────
  app.post("/api/gtm/sections/:sectionId/unlock", async (req, res) => {
    try {
      const sectionId = req.params.sectionId;
      const { moduleId } = req.body || {};
      if (!moduleId) return res.status(400).json({ error: "moduleId is required" });

      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const moduleRow = await loadModule(c, moduleId);
      if (!moduleRow) return res.status(404).json({ error: "Module not found" });

      const sectionState = { ...(moduleRow.section_state || {}) };
      const lockedIds = GTM_SECTION_ORDER.filter((id) => sectionState[id]?.locked);
      const lastLocked = lockedIds[lockedIds.length - 1];
      if (sectionId !== lastLocked) {
        return res.status(409).json({
          error: "Only the last locked section can be unlocked",
          lastLocked,
        });
      }

      sectionState[sectionId] = {
        ...sectionState[sectionId],
        locked: false,
        locked_at: null,
      };

      const profile = { ...(moduleRow.profile || {}) };
      delete profile[sectionId];
      profile.locked_sections = GTM_SECTION_ORDER.filter(
        (id) => sectionState[id]?.locked
      );

      // Also unlock (clear) any later sections if present — shouldn't exist
      for (const later of GTM_SECTION_ORDER.slice(
        GTM_SECTION_ORDER.indexOf(sectionId) + 1
      )) {
        delete sectionState[later];
        delete profile[later];
      }

      const { data, error } = await c
        .from("gtm_modules")
        .update({
          section_state: sectionState,
          profile,
          status: "in_progress",
        })
        .eq("id", moduleId)
        .select("*")
        .single();
      if (error) throw error;

      res.json({ module: data, progress: progressPayload(data) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Execute options ───────────────────────────────────────────────────────
  app.get("/api/gtm/modules/:id/execute-options", async (req, res) => {
    try {
      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const moduleRow = await loadModule(c, req.params.id);
      if (!moduleRow) return res.status(404).json({ error: "Module not found" });

      if (!allInterviewLocked(moduleRow.section_state)) {
        return res.status(409).json({
          error: "Lock all interview sections before executing",
          progress: progressPayload(moduleRow),
        });
      }

      const profile = moduleRow.profile || {};
      const priority = profile.goals?.priority_90d || "";
      const channel = profile.goals?.channel_bet || "";

      const options = EXECUTE_TASK_CATALOG.map((task, i) => {
        let recommended = i === 0;
        if (/lead/i.test(priority) && task.id === "icp_brief") recommended = true;
        if (/aware|content|seo/i.test(String(channel)) && task.id === "content_messaging") {
          recommended = true;
        }
        if (/paid|sales/i.test(String(channel)) && task.id === "channel_plan") {
          recommended = true;
        }
        return {
          ...task,
          recommended,
          contextSummary: [
            profile.module?.name,
            profile.offer?.one_liner,
            profile.audience?.icp,
            profile.audience?.target_timeline,
            profile.positioning?.elevator_pitch || profile.positioning?.positioning_statement,
            profile.distribution?.distribution_strategy,
            profile.leads?.tat_outreach_segment,
            profile.goals?.priority_90d,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      });

      // Ensure only one recommended
      let seen = false;
      for (const o of options) {
        if (o.recommended) {
          if (seen) o.recommended = false;
          else seen = true;
        }
      }
      if (!seen && options[0]) options[0].recommended = true;

      res.json({ options, progress: progressPayload(moduleRow), profile });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // ── Execute one task ──────────────────────────────────────────────────────
  app.post("/api/gtm/modules/:id/execute", async (req, res) => {
    try {
      const { taskId } = req.body || {};
      const c = client();
      if (!c) return res.status(503).json({ error: "Database unavailable" });
      const moduleRow = await loadModule(c, req.params.id);
      if (!moduleRow) return res.status(404).json({ error: "Module not found" });

      if (!allInterviewLocked(moduleRow.section_state)) {
        return res.status(409).json({ error: "Complete and lock all sections first" });
      }

      const task = EXECUTE_TASK_CATALOG.find((t) => t.id === taskId);
      if (!task) return res.status(400).json({ error: "Unknown taskId" });

      // Mark active + sync context for agents
      const { data: updated, error } = await c
        .from("gtm_modules")
        .update({
          active: true,
          status: "ready",
          profile: {
            ...(moduleRow.profile || {}),
            last_executed_task: {
              taskId: task.id,
              agentTarget: task.agentTarget,
              at: new Date().toISOString(),
            },
          },
        })
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error) throw error;

      await syncModuleContextToAgents(
        { CTX_DIR, writeContextToSupabase },
        updated
      );

      res.json({
        ok: true,
        task,
        agentTarget: task.agentTarget,
        module: updated,
        deployContext: {
          sectionId: task.id,
          sectionTitle: task.title,
          summary: task.description,
          bullets: [
            updated.profile?.offer?.one_liner,
            updated.profile?.audience?.icp,
            updated.profile?.goals?.priority_90d,
          ].filter(Boolean),
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  // Schema / constants for client
  app.get("/api/gtm/schema", (_req, res) => {
    res.json({
      sections: GTM_INTERVIEW_SECTIONS.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        questionIds: s.questions.map((q) => q.id),
      })),
      executeTasks: EXECUTE_TASK_CATALOG,
    });
  });
}
