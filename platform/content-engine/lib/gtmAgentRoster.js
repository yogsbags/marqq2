/**
 * Adaptive GTM agent roster — stable core + dynamic specialists.
 * Priorities shift with business_archetype, goal_system, and control-loop bottleneck.
 * Named Marqq agents are execution units; specialist "missions" are capability overlays.
 */

import { normalizeGoalSystem } from "./gtmNorthStar.js";
import { normalizeControlLoopState } from "./gtmControlLoop.js";

export const AGENT_ROSTER_PRINCIPLES = `Marqq agents are an adaptive operating team, not a fixed chatbot grid.

Stable core agents exist for every client. Specialist missions activate, elevate, or retire based on:
business model, industry, customer type, North Star, GTM motion, current bottleneck, compliance risk, available data, and strategy phase.

Agents move: dormant → activated → high_priority → deprioritized/retired.

Auto-adjust allowed: roster priorities, owned metrics, experiment backlog, review frequency, instructions, dependencies.
Human approval required: North Star Metric, strategic goal, deadline, new market, pricing, high-cost campaigns, compliance/safety rules, uncertain external intel.`;

export const AGENT_STATUSES = ["dormant", "activated", "high_priority", "deprioritized", "retired"];

/** Catalog of named Marqq agents with core vs specialist tier + capability tags. */
export const AGENT_CATALOG = [
  {
    id: "veena",
    name: "Veena",
    role: "Company Intel",
    tier: "core",
    capabilities: ["context", "account_intelligence", "firmographics", "icp_accounts"],
  },
  {
    id: "isha",
    name: "Isha",
    role: "Market Research",
    tier: "core",
    capabilities: ["icp", "audience", "industry_intelligence", "market_analysis", "segments"],
  },
  {
    id: "neel",
    name: "Neel",
    role: "Strategy",
    tier: "core",
    capabilities: [
      "gtm_orchestrator",
      "north_star",
      "positioning",
      "course_correction",
      "offer_packaging",
      "roi_business_case",
    ],
  },
  {
    id: "zara",
    name: "Zara",
    role: "Channels",
    tier: "core",
    capabilities: ["channel_strategy", "campaign_orchestration", "course_correction", "budget_allocation"],
  },
  {
    id: "dev",
    name: "Dev",
    role: "Performance",
    tier: "core",
    capabilities: ["analytics", "attribution", "paid_media", "measurement", "north_star_metrics"],
  },
  {
    id: "priya",
    name: "Priya",
    role: "Intel",
    tier: "core",
    capabilities: ["external_intelligence", "competitive_watch", "trust_safety", "compliance_signals"],
  },
  {
    id: "tara",
    name: "Tara",
    role: "CRO & Offers",
    tier: "specialist",
    capabilities: [
      "conversion",
      "onboarding",
      "activation",
      "offers",
      "pricing",
      "subscription",
      "pilot_design",
      "merchandising",
    ],
  },
  {
    id: "sam",
    name: "Sam",
    role: "Copy",
    tier: "specialist",
    capabilities: [
      "messaging",
      "executive_outreach",
      "proposals",
      "sales_enablement",
      "case_studies",
      "trust_claims",
    ],
  },
  {
    id: "kiran",
    name: "Kiran",
    role: "Social",
    tier: "specialist",
    capabilities: ["social", "content_calendar", "community", "demand_acquisition", "lifecycle"],
  },
  {
    id: "maya",
    name: "Maya",
    role: "SEO",
    tier: "specialist",
    capabilities: ["seo", "aso", "search_intelligence", "programmatic_content"],
  },
  {
    id: "riya",
    name: "Riya",
    role: "Content",
    tier: "specialist",
    capabilities: ["editorial", "content_pipeline", "thought_leadership", "proof_assets"],
  },
  {
    id: "arjun",
    name: "Arjun",
    role: "Leads",
    tier: "specialist",
    capabilities: [
      "prospecting",
      "abm",
      "outbound",
      "supply_acquisition",
      "demand_acquisition",
      "stakeholder_mapping",
    ],
  },
];

const CORE_IDS = new Set(AGENT_CATALOG.filter((a) => a.tier === "core").map((a) => a.id));

/**
 * Archetype → specialist capability weights (0–1). Higher = activate sooner / elevate.
 * Generic — no brand hardcoding.
 */
export const ARCHETYPE_CAPABILITY_WEIGHTS = {
  consumer_product: {
    aso: 0.95,
    onboarding: 1,
    activation: 1,
    subscription: 0.9,
    retention: 0.85,
    conversion: 0.85,
    messaging: 0.7,
    social: 0.65,
    seo: 0.6,
    editorial: 0.55,
    trust_safety: 0.7,
    paid_media: 0.55,
  },
  b2b_services: {
    account_intelligence: 0.95,
    industry_intelligence: 0.9,
    abm: 0.95,
    executive_outreach: 1,
    proposals: 0.95,
    sales_enablement: 0.9,
    case_studies: 0.9,
    offer_packaging: 0.85,
    roi_business_case: 0.9,
    prospecting: 0.85,
    thought_leadership: 0.7,
    messaging: 0.75,
  },
  custom_delivery: {
    account_intelligence: 0.9,
    industry_intelligence: 0.85,
    roi_business_case: 1,
    pilot_design: 1,
    proposals: 0.9,
    sales_enablement: 0.85,
    stakeholder_mapping: 0.8,
    prospecting: 0.75,
    case_studies: 0.85,
    compliance_signals: 0.7,
  },
  marketplace: {
    supply_acquisition: 1,
    demand_acquisition: 1,
    abm: 0.7,
    conversion: 0.8,
    lifecycle: 0.75,
    analytics: 0.8,
    matching: 0.9,
    social: 0.55,
  },
  platform_os: {
    onboarding: 0.9,
    activation: 0.95,
    analytics: 0.9,
    channel_strategy: 0.8,
    editorial: 0.7,
    messaging: 0.75,
    sales_enablement: 0.7,
    abm: 0.65,
  },
  hybrid: {
    messaging: 0.7,
    conversion: 0.7,
    prospecting: 0.65,
    content_pipeline: 0.6,
    analytics: 0.7,
  },
  other: {
    messaging: 0.6,
    conversion: 0.6,
    prospecting: 0.55,
    analytics: 0.65,
    editorial: 0.5,
  },
};

/** Bottleneck stage text → capability boosts when diagnosis says this stage is constrained. */
const BOTTLENECK_CAPABILITY_HINTS = [
  { re: /install|signup|acquisition|top.?funnel|awareness|ctr|aso|app.?store/i, caps: ["aso", "paid_media", "social", "demand_acquisition", "seo"] },
  { re: /activat|onboard|first.?value|aha|setup|scan|personaliz/i, caps: ["onboarding", "activation", "conversion", "messaging"] },
  { re: /retain|churn|subscri|renew|ltv|habit/i, caps: ["subscription", "lifecycle", "editorial", "conversion"] },
  { re: /meeting|discovery|outreach|reply|response.?rate|pipeline.?creat/i, caps: ["executive_outreach", "prospecting", "abm", "messaging"] },
  { re: /proposal|close|win.?rate|roi|business.?case|procurement/i, caps: ["proposals", "roi_business_case", "sales_enablement", "case_studies"] },
  { re: /pilot|deliver|production|implement|outcome|readiness/i, caps: ["pilot_design", "roi_business_case", "account_intelligence", "compliance_signals"] },
  { re: /match|liquidity|supply|demand.?side|two.?sid/i, caps: ["supply_acquisition", "demand_acquisition", "conversion"] },
  { re: /trust|privacy|claim|compliance|safety|security/i, caps: ["trust_safety", "compliance_signals", "trust_claims", "messaging"] },
  { re: /content|seo|organic|thought.?lead/i, caps: ["seo", "editorial", "content_pipeline", "thought_leadership"] },
  { re: /paid|roas|cac|spend|media/i, caps: ["paid_media", "analytics", "attribution", "channel_strategy"] },
];

export const HUMAN_APPROVAL_REQUIRED = [
  "Changing the North Star Metric",
  "Changing the strategic goal",
  "Changing the deadline",
  "Entering a new market",
  "Changing pricing",
  "Launching high-cost campaigns",
  "Altering compliance or safety rules",
  "Acting on uncertain external intelligence",
];

export const AUTO_ADJUST_ALLOWED = [
  "Agent roster priorities",
  "Owned metrics",
  "Data connector emphasis",
  "Monitoring sources",
  "Review frequency",
  "Agent instructions / missions",
  "Dependencies",
  "Experiment backlog",
  "Budget allocation recommendations (below high-cost threshold)",
];

function str(v) {
  return v == null ? "" : String(v).trim();
}

function resolveArchetypeKey(goalSystem) {
  const raw = str(goalSystem?.business_archetype || goalSystem?.archetype).toLowerCase();
  if (/consumer|product_loop|app|b2c|mobile/.test(raw)) return "consumer_product";
  if (/marketplace|two.?sided|match/.test(raw)) return "marketplace";
  if (/custom_delivery|production|implementation|ai.?dev|services.?delivery/.test(raw)) {
    return "custom_delivery";
  }
  if (/b2b_services|services|consult|agency/.test(raw)) return "b2b_services";
  if (/platform_os|operating.?system|gtm.?os/.test(raw)) return "platform_os";
  if (/hybrid/.test(raw)) return "hybrid";
  if (ARCHETYPE_CAPABILITY_WEIGHTS[raw]) return raw;
  return "other";
}

function capabilityScoreForAgent(agent, weights, bottleneckCaps) {
  let score = 0;
  for (const cap of agent.capabilities || []) {
    const w = Number(weights[cap] || 0);
    score += w;
    if (bottleneckCaps.has(cap)) score += 0.55;
  }
  return score;
}

function bottleneckCapabilities(controlLoop) {
  const text = [
    controlLoop?.lastDiagnosis?.bottleneck_stage,
    controlLoop?.lastDiagnosis?.primary_constraint,
    controlLoop?.lastDiagnosis?.summary,
    controlLoop?.lastDiagnosis?.reallocation,
  ]
    .filter(Boolean)
    .join(" ");
  const set = new Set();
  if (!text) return set;
  for (const hint of BOTTLENECK_CAPABILITY_HINTS) {
    if (hint.re.test(text)) hint.caps.forEach((c) => set.add(c));
  }
  return set;
}

function missionForAgent(agent, archetypeKey, bottleneckCaps, goalSystem) {
  const nsm = str(goalSystem?.north_star_metric) || "North Star progress";
  const overlapping = (agent.capabilities || []).filter(
    (c) => bottleneckCaps.has(c) || (ARCHETYPE_CAPABILITY_WEIGHTS[archetypeKey] || {})[c] >= 0.75
  );
  if (agent.tier === "core") {
    const coreMissions = {
      veena: `Keep account/context current for ${nsm}`,
      isha: `Maintain ICP and segment truth for ${nsm}`,
      neel: `Orchestrate GTM toward ${nsm}; course-correct on variance`,
      zara: `Allocate channel effort to the constrained stage`,
      dev: `Measure ${nsm} and metric-tree leading indicators`,
      priya: `Watch external/competitive + trust signals`,
    };
    return coreMissions[agent.id] || `Support locked North Star: ${nsm}`;
  }
  if (overlapping.length) {
    return `Specialize on ${overlapping.slice(0, 3).join(", ")} to move ${nsm}`;
  }
  return `Stand by for ${archetypeKey} motions tied to ${nsm}`;
}

function ownedMetricForAgent(agent, goalSystem, controlLoop) {
  const tree = Array.isArray(goalSystem?.metric_tree) ? goalSystem.metric_tree.filter(Boolean) : [];
  const bottleneck = str(controlLoop?.lastDiagnosis?.bottleneck_stage);
  if (bottleneck && (agent.capabilities || []).some((c) => bottleneckCapabilities(controlLoop).has(c))) {
    return bottleneck;
  }
  if (agent.id === "dev" || agent.id === "neel") {
    return str(goalSystem?.north_star_metric) || tree[0] || null;
  }
  if (agent.id === "tara") return tree.find((m) => /activ|onboard|convert|trial/i.test(String(m))) || tree[1] || null;
  if (agent.id === "arjun") return tree.find((m) => /pipeline|meeting|lead|match|supply|demand/i.test(String(m))) || tree[2] || null;
  if (agent.id === "sam") return tree.find((m) => /proposal|win|reply|outreach/i.test(String(m))) || null;
  if (agent.id === "maya") return tree.find((m) => /organic|seo|install|aso/i.test(String(m))) || null;
  return tree[1] || null;
}

/**
 * Build adaptive roster from locked goal_system + optional control loop.
 * Deterministic rules fallback — prefer proposeAgentRoster(groq, …) when LLM is available.
 */
export function buildAgentRoster({ goalSystem, controlLoop, previousRoster } = {}) {
  const g = normalizeGoalSystem(goalSystem || {});
  const loop = controlLoop ? normalizeControlLoopState(controlLoop, g) : null;
  const archetypeKey = resolveArchetypeKey(g);
  const weights = { ...(ARCHETYPE_CAPABILITY_WEIGHTS[archetypeKey] || ARCHETYPE_CAPABILITY_WEIGHTS.other || {}) };
  const bottleneckCaps = bottleneckCapabilities(loop);
  const prevById = new Map(
    (Array.isArray(previousRoster?.agents) ? previousRoster.agents : []).map((a) => [a.id, a])
  );

  const scored = AGENT_CATALOG.map((agent) => {
    const score = capabilityScoreForAgent(agent, weights, bottleneckCaps);
    const isCore = CORE_IDS.has(agent.id);
    let status = "dormant";
    let reason = "Not required for current archetype/bottleneck";

    if (isCore) {
      status = "activated";
      reason = "Stable core agent for every GTM module";
      if (bottleneckCaps.size && (agent.capabilities || []).some((c) => bottleneckCaps.has(c))) {
        status = "high_priority";
        reason = `Elevated: bottleneck touches ${[...bottleneckCaps].slice(0, 3).join(", ")}`;
      }
    } else if (score >= 0.85) {
      status = "high_priority";
      reason = `High fit for ${archetypeKey}${bottleneckCaps.size ? " + active bottleneck" : ""}`;
    } else if (score >= 0.45) {
      status = "activated";
      reason = `Specialist activated for ${archetypeKey}`;
    } else if (score > 0.15) {
      status = "deprioritized";
      reason = "Secondary for this archetype; available if bottleneck shifts";
    } else {
      status = "dormant";
      reason = "Not prioritized for current strategy phase";
    }

    // Preserve explicit human retirement
    const prev = prevById.get(agent.id);
    if (prev?.status === "retired" && prev?.retiredBy === "human") {
      status = "retired";
      reason = prev.reason || "Retired by human";
    }

    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tier: agent.tier,
      capabilities: agent.capabilities,
      status,
      score: Math.round(score * 100) / 100,
      reason,
      mission: missionForAgent(agent, archetypeKey, bottleneckCaps, g),
      metric: ownedMetricForAgent(agent, g, loop),
      target: g.quantified_target || null,
      review_date: null,
      specialist_label: null,
    };
  });

  // Assign review_date: high_priority sooner
  const now = Date.now();
  for (const a of scored) {
    const days = a.status === "high_priority" ? 7 : a.status === "activated" ? 14 : 28;
    a.review_date = new Date(now + days * 86400000).toISOString().slice(0, 10);
  }

  scored.sort((a, b) => {
    const order = { high_priority: 0, activated: 1, deprioritized: 2, dormant: 3, retired: 4 };
    const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (d !== 0) return d;
    return (b.score || 0) - (a.score || 0);
  });

  return finalizeRoster(scored, {
    source: "rules",
    goalSystem: g,
    controlLoop: loop,
    archetypeKey,
  });
}

function finalizeRoster(agents, { source, goalSystem, controlLoop, archetypeKey, rationale }) {
  const g = goalSystem || {};
  const loop = controlLoop || null;
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: source || "rules",
    rationale: rationale || null,
    principles: AGENT_ROSTER_PRINCIPLES,
    archetypeKey,
    business_archetype: g.business_archetype || archetypeKey,
    north_star_metric: g.north_star_metric || null,
    quantified_target: g.quantified_target || null,
    bottleneck_stage: loop?.lastDiagnosis?.bottleneck_stage || null,
    agents,
    highPriority: agents.filter((a) => a.status === "high_priority").map((a) => a.id),
    activated: agents.filter((a) => a.status === "activated" || a.status === "high_priority").map((a) => a.id),
    dormant: agents.filter((a) => a.status === "dormant").map((a) => a.id),
    humanApprovalRequired: HUMAN_APPROVAL_REQUIRED,
    autoAdjustAllowed: AUTO_ADJUST_ALLOWED,
  };
}

function parseJsonLoose(raw) {
  try {
    return JSON.parse(String(raw || "").trim());
  } catch {
    const start = String(raw || "").indexOf("{");
    const end = String(raw || "").lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(String(raw).slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const CATALOG_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));

/**
 * LLM proposes specialist activation, priorities, missions, and owned metrics
 * from locked strategy / goal_system / bottleneck. Constrained to AGENT_CATALOG.
 * Falls back to deterministic buildAgentRoster on failure.
 */
export async function proposeAgentRoster(
  groq,
  { goalSystem, controlLoop, previousRoster, companyContext, strategySummary } = {}
) {
  const fallback = buildAgentRoster({ goalSystem, controlLoop, previousRoster });
  if (!groq) return fallback;

  const g = normalizeGoalSystem(goalSystem || {});
  const loop = controlLoop ? normalizeControlLoopState(controlLoop, g) : null;
  const archetypeKey = resolveArchetypeKey(g);
  const catalogForPrompt = AGENT_CATALOG.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    tier: a.tier,
    capabilities: a.capabilities,
  }));

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.3,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${AGENT_ROSTER_PRINCIPLES}

You compose Marqq's adaptive agent roster for THIS business after strategy / context is known.

Hard constraints:
1. You may ONLY assign statuses to agents in the provided catalog (ids). Do not invent new agent process names.
2. Core-tier agents (veena, isha, neel, zara, dev, priya) must stay at least "activated". Elevate to high_priority when they own the bottleneck.
3. Specialist-tier agents may be high_priority | activated | deprioritized | dormant based on archetype, GTM motion, and current bottleneck.
4. Never retire an agent unless previousRoster marks retiredBy=human.
5. Missions and specialist_label should be business-specific (e.g. "Proposal & ROI", "ASO & activation") but map onto an existing catalog agent.
6. Owned metric must come from the goal_system metric_tree / north_star / diagnosed bottleneck — do not invent vanity KPIs.
7. Prefer 2–4 high_priority agents max. Most specialists should be dormant or deprioritized.

Return STRICT JSON:
{
  "rationale": "2-4 sentences explaining roster composition for this business",
  "archetype_read": string,
  "agents": [
    {
      "id": "tara",
      "status": "high_priority|activated|deprioritized|dormant",
      "specialist_label": "Onboarding & Activation Agent"|null,
      "mission": string,
      "metric": string|null,
      "reason": string
    }
  ]
}
Include an entry for EVERY catalog agent id.`,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              catalog: catalogForPrompt,
              goalSystem: g,
              bottleneck: loop?.lastDiagnosis || null,
              controlLoopStatus: loop
                ? {
                    status: loop.status,
                    currentPeriod: loop.currentPeriod,
                    recovery: loop.recovery,
                  }
                : null,
              previousRoster: previousRoster
                ? {
                    source: previousRoster.source,
                    highPriority: previousRoster.highPriority,
                    agents: (previousRoster.agents || []).map((a) => ({
                      id: a.id,
                      status: a.status,
                      retiredBy: a.retiredBy || null,
                      mission: a.mission,
                    })),
                  }
                : null,
              companyContext: companyContext || null,
              strategySummary: strategySummary ? String(strategySummary).slice(0, 1200) : null,
            },
            null,
            2
          ).slice(0, 16000),
        },
      ],
    });

    const parsed = parseJsonLoose(completion.choices?.[0]?.message?.content || "");
    if (!parsed || !Array.isArray(parsed.agents) || !parsed.agents.length) {
      return fallback;
    }

    const llmById = new Map(
      parsed.agents
        .filter((a) => a && CATALOG_BY_ID.has(String(a.id || "").toLowerCase()))
        .map((a) => [String(a.id).toLowerCase(), a])
    );

    const prevById = new Map(
      (Array.isArray(previousRoster?.agents) ? previousRoster.agents : []).map((a) => [a.id, a])
    );

    const now = Date.now();
    const agents = AGENT_CATALOG.map((agent) => {
      const llm = llmById.get(agent.id);
      const prev = prevById.get(agent.id);
      const rulesRow = fallback.agents.find((a) => a.id === agent.id);

      if (prev?.status === "retired" && prev?.retiredBy === "human") {
        return {
          ...rulesRow,
          status: "retired",
          reason: prev.reason || "Retired by human",
          retiredBy: "human",
          specialist_label: prev.specialist_label || null,
        };
      }

      let status = String(llm?.status || rulesRow?.status || "dormant").toLowerCase();
      if (!AGENT_STATUSES.includes(status) || status === "retired") {
        status = rulesRow?.status || "dormant";
      }
      // Core cannot be slept by LLM
      if (CORE_IDS.has(agent.id) && (status === "dormant" || status === "deprioritized")) {
        status = "activated";
      }

      const days = status === "high_priority" ? 7 : status === "activated" ? 14 : 28;
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        tier: agent.tier,
        capabilities: agent.capabilities,
        status,
        score: rulesRow?.score ?? 0,
        reason: str(llm?.reason) || rulesRow?.reason || "LLM roster",
        mission: str(llm?.mission) || rulesRow?.mission,
        metric: str(llm?.metric) || rulesRow?.metric || null,
        target: g.quantified_target || null,
        specialist_label: str(llm?.specialist_label) || null,
        review_date: new Date(now + days * 86400000).toISOString().slice(0, 10),
      };
    });

    agents.sort((a, b) => {
      const order = { high_priority: 0, activated: 1, deprioritized: 2, dormant: 3, retired: 4 };
      const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (d !== 0) return d;
      return (b.score || 0) - (a.score || 0);
    });

    // Cap high_priority at 4 — demote extras to activated
    let highCount = 0;
    for (const a of agents) {
      if (a.status === "high_priority") {
        highCount += 1;
        if (highCount > 4) {
          a.status = "activated";
          a.reason = `${a.reason} (capped: max 4 high_priority)`;
        }
      }
    }

    return finalizeRoster(agents, {
      source: "llm",
      goalSystem: g,
      controlLoop: loop,
      archetypeKey: str(parsed.archetype_read) || archetypeKey,
      rationale: str(parsed.rationale) || null,
    });
  } catch (err) {
    console.warn("[gtm-agent-roster] LLM propose failed:", err.message);
    return fallback;
  }
}

/**
 * Re-prioritize after control-loop diagnosis without wiping human retirements.
 * Sync path — use proposeAgentRoster when groq is available.
 */
export function reprioritizeAgentRoster(previousRoster, { goalSystem, controlLoop } = {}) {
  return buildAgentRoster({
    goalSystem,
    controlLoop,
    previousRoster: previousRoster || null,
  });
}

export async function reprioritizeAgentRosterAsync(
  groq,
  previousRoster,
  { goalSystem, controlLoop, companyContext, strategySummary } = {}
) {
  return proposeAgentRoster(groq, {
    goalSystem,
    controlLoop,
    previousRoster,
    companyContext,
    strategySummary,
  });
}

export function rosterSummaryLines(roster) {
  if (!roster?.agents?.length) return [];
  const lines = [
    `Agent roster (${roster.archetypeKey}${roster.source ? `, ${roster.source}` : ""}): high_priority=[${(roster.highPriority || []).join(", ")}]`,
  ];
  if (roster.rationale) lines.push(`Roster rationale: ${roster.rationale}`);
  for (const a of roster.agents.filter((x) => x.status === "high_priority" || x.status === "activated").slice(0, 8)) {
    const label = a.specialist_label ? ` [${a.specialist_label}]` : "";
    lines.push(
      `${a.name}${label} (${a.status}): ${a.mission}${a.metric ? ` | owns: ${a.metric}` : ""} — ${a.reason}`
    );
  }
  return lines;
}

export function normalizeAgentRoster(raw, { goalSystem, controlLoop } = {}) {
  if (raw?.agents?.length && raw?.version) {
    return {
      ...raw,
      agents: raw.agents.map((a) => ({
        ...a,
        status: AGENT_STATUSES.includes(a.status) ? a.status : "dormant",
      })),
    };
  }
  return buildAgentRoster({ goalSystem, controlLoop, previousRoster: raw });
}
