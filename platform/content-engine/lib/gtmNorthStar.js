/**
 * Dynamic North-Star Goal System for Marqq GTM OS.
 * Infers archetype + metrics from company context — never hardcodes a specific brand.
 */

export const NORTH_STAR_PRINCIPLES = `You are defining the North Star Metric that Marqq agents will optimize for a customer organization.

Marqq is a GTM operating system: identify the customer's business/product outcome, then coordinate every agent toward that outcome.

Infer the business archetype ONLY from provided context (site crawl, Brand DNA, offer, audience). Do NOT assume a named company template.

Archetype patterns (use as guidance, pick one that fits context):
- b2b_services: paid engagements / outcome-defined client work (not lead volume alone)
- consumer_product: repeated users completing the core product value loop (not downloads/scans alone)
- marketplace: qualified two-sided matches (not signups or listings alone)
- platform_os: customer orgs making measurable progress on THEIR goal (not AI artifacts generated)
- custom_delivery: solutions reaching production with verified client outcomes (not projects started alone)
- hybrid: blend carefully and explain

Rules for the operational North Star (what agents optimize):
1. Measure customer/product VALUE progress, not Marqq activity vanity (strategies written, chats, agent outputs).
2. Include an exact qualifying DEFINITION (what counts as one unit).
3. Prefer a metric agents can influence inside the stated timeline.
4. Also propose an ultimate_outcome_metric that is longer-horizon / partially external if needed.
5. Explicitly list vanity metrics to REJECT for this business (rejects_as_nsm).
6. Build a short metric_tree (north star → leading drivers).
7. Add guardrails so agents cannot game volume with low-quality activity.
8. quantified_target must be a concrete sentence: number + unit + by-when.
9. Never invent fake baselines — leave baseline null if unknown.
10. Do not default to "leads / discovery calls / ROAS" unless the context truly is a volume-led growth motion.`;

/**
 * @param {unknown} raw
 * @param {{ timeline?: string, objective?: string }=} hints
 */
export function normalizeGoalSystem(raw, hints = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const str = (v) => (v == null ? "" : String(v).trim());
  const arr = (v, max = 12) =>
    (Array.isArray(v) ? v : [])
      .map((x) => str(x))
      .filter(Boolean)
      .slice(0, max);

  const northStar = str(src.north_star_metric || src.northStarMetric);
  const definition = str(src.metric_definition || src.definition || src.metricDefinition);
  const quantified = str(
    src.quantified_target ||
      src.quantifiedTarget ||
      (src.target != null && northStar
        ? `${src.target} ${northStar}${hints.timeline ? ` by ${hints.timeline}` : ""}`
        : "")
  );
  const timeline = str(src.timeline_target || src.timeline || hints.timeline || "");
  const sectionTargets = (Array.isArray(src.sectionTargets) ? src.sectionTargets : [])
    .map((t) => ({
      sectionId: str(t?.sectionId || t?.section_id),
      metric: str(t?.metric),
      contribution: str(t?.contribution),
      byWhen: str(t?.byWhen || t?.by_when || timeline),
    }))
    .filter((t) => t.sectionId);

  return {
    business_archetype: str(src.business_archetype || src.archetype) || null,
    north_star_metric: northStar || quantified || null,
    metric_definition: definition || null,
    ultimate_outcome_metric: str(src.ultimate_outcome_metric || src.ultimateOutcome) || null,
    quantified_target: quantified || northStar || null,
    timeline_target: timeline || null,
    priority_90d: str(src.priority_90d || hints.objective) || null,
    channel_bet: str(src.channel_bet) || null,
    baseline: src.baseline == null || src.baseline === "" ? null : str(src.baseline),
    target: src.target == null || src.target === "" ? null : src.target,
    measurement_period: str(src.measurement_period || src.measurementPeriod) || null,
    metric_tree: arr(src.metric_tree || src.metricTree, 8),
    guardrails: arr(src.guardrails, 10),
    primary_loop: arr(src.primary_loop || src.primary_flywheel || src.primaryProductLoop, 8),
    rejects_as_nsm: arr(src.rejects_as_nsm || src.rejectsAsNsm, 8),
    sectionTargets,
  };
}

export function goalSystemToQuantifiedLabel(goalSystem) {
  const g = normalizeGoalSystem(goalSystem);
  if (g.quantified_target) return g.quantified_target;
  if (g.north_star_metric && g.target != null) {
    return `${g.target} ${g.north_star_metric}${g.timeline_target ? ` by ${g.timeline_target}` : ""}`;
  }
  return g.north_star_metric || "";
}

export function isWeakGoalSystem(goalSystem) {
  const g = normalizeGoalSystem(goalSystem);
  const v = String(g.quantified_target || g.north_star_metric || "").toLowerCase();
  if (!v || v.length < 8) return true;
  return /^(unset|tbd|n\/?a|ai_recommend|let marqq|not sure|unknown|none|skip)$/i.test(v);
}

/**
 * Build LLM context blob from module profile + source (no brand hardcoding).
 */
export function buildNorthStarContext(moduleRow, answers = {}) {
  const profile = moduleRow?.profile || {};
  const source = moduleRow?.source_context || {};
  const label = (id) => {
    const a = answers?.[id];
    if (!a) return profile?.goals?.[id] || "";
    if (typeof a === "string") return a;
    return String(a.label || a.value || "");
  };
  return {
    companyName:
      profile?.module?.name ||
      source?.onboarding?.company ||
      moduleRow?.name ||
      null,
    websiteUrl: source?.onboarding?.websiteUrl || source?.onboarding?.website_url || null,
    industry: source?.onboarding?.industry || profile?.offer?.category || null,
    module: profile.module || null,
    offer: profile.offer || null,
    audience: profile.audience || null,
    brandDna: source.brandDna || source.brand_dna || null,
    crawlDigest: source.crawlDigest || source.crawl_digest || null,
    onboarding: source.onboarding || null,
    goalsAnswers: {
      priority_90d: label("priority_90d"),
      timeline_target: label("timeline_target"),
      quantified_target: label("quantified_target"),
      channel_bet: label("channel_bet"),
      budget_band: label("budget_band"),
      success_baseline: label("success_baseline"),
    },
    existingGoalSystem: profile.goal_system || null,
  };
}

/**
 * Propose a full goal system via LLM. Returns normalized object or null.
 */
export async function proposeGoalSystem(groq, moduleRow, answers = {}) {
  if (!groq) return null;
  const ctx = buildNorthStarContext(moduleRow, answers);
  const timeline = ctx.goalsAnswers.timeline_target || "90 days";
  const objective = ctx.goalsAnswers.priority_90d || "";

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.35,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${NORTH_STAR_PRINCIPLES}

Return STRICT JSON only:
{
  "business_archetype": "b2b_services|consumer_product|marketplace|platform_os|custom_delivery|hybrid|other",
  "north_star_metric": "name of the operational metric agents optimize",
  "metric_definition": "exact qualifying definition of one unit",
  "ultimate_outcome_metric": "longer-horizon outcome or null",
  "quantified_target": "concrete sentence with number + unit + by-when for the given timeline",
  "timeline_target": "echo timeline",
  "baseline": null,
  "target": number_or_string,
  "measurement_period": "e.g. weekly|monthly|quarterly|90 days",
  "metric_tree": ["north star", "driver", "..."],
  "guardrails": ["..."],
  "primary_loop": ["step1", "step2", "..."],
  "rejects_as_nsm": ["vanity metrics to avoid for THIS business"],
  "rationale": "2-3 sentences why this NSM fits the business"
}`,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              timeline,
              objective,
              context: ctx,
            },
            null,
            2
          ).slice(0, 16000),
        },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || "";
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } catch {
          parsed = null;
        }
      }
    }
    if (!parsed) return null;
    return normalizeGoalSystem(parsed, { timeline, objective });
  } catch (err) {
    console.warn("[gtm-north-star] proposeGoalSystem failed:", err.message);
    return null;
  }
}

/**
 * Minimal non-hardcoded fallback when LLM is unavailable.
 * Uses only labels already present in answers/profile — never invents lead counts.
 */
export function structuralGoalSystemFallback(moduleRow, answers = {}) {
  const ctx = buildNorthStarContext(moduleRow, answers);
  const timeline = ctx.goalsAnswers.timeline_target || "90 days";
  const objective = ctx.goalsAnswers.priority_90d || "business outcome progress";
  const existing = ctx.goalsAnswers.quantified_target;
  const company = ctx.companyName || "this organization";
  const quantified =
    existing && existing.length > 8 && !/ai_recommend|let marqq/i.test(existing)
      ? existing
      : `Define and hit a measurable ${objective} target for ${company} within ${timeline}`;

  return normalizeGoalSystem(
    {
      business_archetype: "other",
      north_star_metric: objective,
      metric_definition:
        "A unit counts only when it represents real customer/product value progress agreed for this business — not vanity activity.",
      ultimate_outcome_metric: null,
      quantified_target: quantified,
      timeline_target: timeline,
      baseline: null,
      target: null,
      measurement_period: timeline,
      metric_tree: [
        "North-star outcome progress",
        "Executed GTM actions",
        "Qualified pipeline or activated users",
        "Onboarded GTM plan",
      ],
      guardrails: [
        "Quality over volume",
        "Do not optimize vanity activity metrics",
        "Respect compliance and trust",
      ],
      primary_loop: [
        "Define outcome",
        "Quantify target",
        "Execute GTM actions",
        "Measure progress",
        "Adjust",
      ],
      rejects_as_nsm: [
        "Raw lead volume without quality",
        "AI strategies generated",
        "Unqualified meetings",
        "Vanity impressions",
      ],
    },
    { timeline, objective }
  );
}
