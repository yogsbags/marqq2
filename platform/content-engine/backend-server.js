/**
 * Torqq AI — Content Engine Backend
 * ===================================
 * Express server on port BACKEND_PORT (default 3008).
 * Spawned by server.js; all /api/* traffic is proxied here from port 3007.
 *
 * Routes:
 *   GET  /health                       — health check
 *   GET  /api/agents/status            — read heartbeat/status.json
 *   GET  /api/agents/:name/memory      — read agent MEMORY.md
 *   POST /api/agents/context           — write client context markdown
 *   POST /api/agents/:name/run         — SSE streaming Groq call (SOUL.md as system prompt)
 */

import express from "express";
import Groq from "groq-sdk";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    enqueueGeneration,
    registerArtifactCallback,
    registerArtifactFailCallback,
    startWorker,
} from "./queue.js";
import {
    clearArtifactsForCompany,
    deleteDuplicateCompaniesByWebsiteUrl,
    loadCompanies,
    loadCompanyByWebsiteUrl,
    loadCompanyWithArtifacts,
    saveArtifact,
    saveCompany,
    supabase,
} from "./supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths relative to this file (platform/content-engine/)
const CREWAI_DIR = join(__dirname, "..", "crewai");
const HEARTBEAT_PATH = join(CREWAI_DIR, "heartbeat", "status.json");
const AGENTS_DIR = join(CREWAI_DIR, "agents");
const CTX_DIR = join(CREWAI_DIR, "client_context");
const DEPLOYMENT_QUEUE_PATH = join(CREWAI_DIR, "deployments", "queue.json");

const VALID_AGENTS = new Set(["zara", "maya", "riya", "arjun", "dev", "priya"]);
const AGENT_PROFILES = {
  zara: {
    title: "Campaign Strategist",
    personality:
      "Decisive, commercially sharp, and biased toward clear GTM tradeoffs rather than vague planning.",
    executes: [
      "Turn business goals into channel-specific campaign plans",
      "Recommend launch structure, offers, and funnel sequencing",
      "Translate GTM strategy into deployable execution tasks",
    ],
  },
  maya: {
    title: "SEO & LLMO Monitor",
    personality:
      "Methodical, evidence-driven, and focused on search visibility, citations, and technical discoverability.",
    executes: [
      "Monitor SEO and AI-search visibility signals",
      "Identify ranking, indexing, and answer-engine gaps",
      "Suggest content and site updates that improve discoverability",
    ],
  },
  riya: {
    title: "Content Producer",
    personality:
      "Fast-moving, editorially minded, and tuned to shipping usable content rather than abstract ideas.",
    executes: [
      "Generate content plans, briefs, and campaign-ready assets",
      "Turn strategy into channel-specific content output",
      "Support social, messaging, and creative production flows",
    ],
  },
  arjun: {
    title: "Lead Intelligence",
    personality:
      "Analytical and conversion-oriented, with a strong bias toward qualification, prioritization, and pipeline efficiency.",
    executes: [
      "Analyze lead quality and prospect segments",
      "Surface ICP fit, enrichment, and prioritization insights",
      "Support outreach and opportunity qualification decisions",
    ],
  },
  dev: {
    title: "Performance Analyst",
    personality:
      "Numerate, pragmatic, and focused on budget efficiency, signal quality, and measurable performance improvement.",
    executes: [
      "Review campaign performance and scorecards",
      "Recommend budget reallocations and efficiency moves",
      "Track KPI movement across channels and time horizons",
    ],
  },
  priya: {
    title: "Brand Intelligence",
    personality:
      "Research-led, positioning-aware, and strong at turning messy market inputs into sharper differentiation.",
    executes: [
      "Generate company intelligence and competitor analysis",
      "Refine messaging, positioning, and audience hypotheses",
      "Support brand, market, and narrative decisions",
    ],
  },
};
const PORT = Number(process.env.BACKEND_PORT || 3008);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
const COMPANY_INTEL_GROQ_MODELS = [
  process.env.GROQ_COMPANY_INTEL_MODEL || "groq/compound",
  "llama-3.3-70b-versatile",
];
const COMPANY_PROFILE_GROQ_MODELS = [
  process.env.GROQ_COMPANY_PROFILE_MODEL ||
    process.env.GROQ_COMPANY_INTEL_MODEL ||
    "groq/compound",
  "llama-3.3-70b-versatile",
];
const AGENT_PLAN_GROQ_MODELS = [
  process.env.GROQ_AGENT_PLAN_MODEL || "groq/compound",
  "llama-3.3-70b-versatile",
];
const STALE_DEPLOYMENT_TIMEOUT_MS =
  Number(process.env.TORQQ_DEPLOYMENT_STALE_SECONDS || 1800) * 1000;

function defaultHeartbeatState() {
  return {
    updated_at: null,
    agents: {
      zara: { status: "idle", last_run: null, duration_ms: null },
      maya: { status: "idle", last_run: null, duration_ms: null },
      riya: { status: "idle", last_run: null, duration_ms: null },
      arjun: { status: "idle", last_run: null, duration_ms: null },
      dev: { status: "idle", last_run: null, duration_ms: null },
      priya: { status: "idle", last_run: null, duration_ms: null },
    },
  };
}

async function readHeartbeatState() {
  try {
    const raw = await readFile(HEARTBEAT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultHeartbeatState(),
      ...parsed,
      agents: {
        ...defaultHeartbeatState().agents,
        ...(parsed?.agents || {}),
      },
    };
  } catch {
    return defaultHeartbeatState();
  }
}

async function writeHeartbeatState(heartbeat) {
  await mkdir(dirname(HEARTBEAT_PATH), { recursive: true });
  await writeFile(HEARTBEAT_PATH, JSON.stringify(heartbeat, null, 2), "utf-8");
}

async function markAgentHeartbeat(name, status, durationMs = null, error = null) {
  const heartbeat = await readHeartbeatState();
  const now = new Date().toISOString();
  heartbeat.updated_at = now;
  heartbeat.agents[name] = {
    ...(heartbeat.agents[name] || { status: "idle", last_run: null, duration_ms: null }),
    status,
    last_run: now,
    duration_ms: durationMs,
    ...(error ? { error } : {}),
  };
  if (!error && heartbeat.agents[name]?.error) {
    delete heartbeat.agents[name].error;
  }
  await writeHeartbeatState(heartbeat);
}

function markStaleProcessingDeployments(entries) {
  const now = Date.now();
  let changed = false;

  for (const entry of entries) {
    if (entry?.status !== "processing" || !entry?.pickedAt) continue;
    const pickedAtMs = Date.parse(entry.pickedAt);
    if (Number.isNaN(pickedAtMs)) continue;
    if (now - pickedAtMs < STALE_DEPLOYMENT_TIMEOUT_MS) continue;
    entry.status = "failed";
    entry.failedAt = new Date(now).toISOString();
    entry.error =
      entry.error ||
      `Marked failed after exceeding stale timeout of ${Math.floor(
        STALE_DEPLOYMENT_TIMEOUT_MS / 1000
      )} seconds.`;
    changed = true;
  }

  return changed;
}

async function readDeploymentQueue() {
  try {
    const raw = await readFile(DEPLOYMENT_QUEUE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];
    if (markStaleProcessingDeployments(entries)) {
      await writeDeploymentQueue(entries);
    }
    return entries;
  } catch {
    return [];
  }
}

async function writeDeploymentQueue(entries) {
  await mkdir(dirname(DEPLOYMENT_QUEUE_PATH), { recursive: true });
  await writeFile(DEPLOYMENT_QUEUE_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

const app = express();
app.use(express.json());

const COMPANY_INTEL_ARTIFACT_TYPES = [
  "competitor_intelligence",
  "website_audit",
  "opportunities",
  "icps",
  "client_profiling",
  "partner_profiling",
  "social_calendar",
  "marketing_strategy",
  "positioning_messaging",
  "sales_enablement",
  "content_strategy",
  "channel_strategy",
  "pricing_intelligence",
  "lookalike_audiences",
  "lead_magnets",
];

// ── Health ─────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "content-engine" });
});

// ── GET /api/agents/status ─────────────────────────────────────────────────────
// Returns heartbeat/status.json (updated by Python scheduler after each run).
// Falls back to default idle state if file does not exist yet.

app.get("/api/agents/status", async (_req, res) => {
  try {
    res.json(await readHeartbeatState());
  } catch {
    res.json(defaultHeartbeatState());
  }
});

// ── POST /api/agents/context ───────────────────────────────────────────────────
// Saves client business context to client_context/{userId}.md.
// IMPORTANT: must be declared BEFORE /:name routes to avoid 'context' being
// matched as the :name param.

app.post("/api/agents/context", async (req, res) => {
  const {
    userId,
    company,
    industry,
    icp,
    competitors,
    campaigns,
    keywords,
    goals,
  } = req.body;

  if (!userId || !company) {
    return res.status(400).json({ error: "userId and company are required" });
  }

  const content = `# Client Context

**Company**: ${company}
**Industry**: ${industry || "—"}
**Target ICP**: ${icp || "—"}
**Top Competitors**: ${competitors || "—"}
**Current Campaigns**: ${campaigns || "—"}
**Active Keywords**: ${keywords || "—"}
**Key Goals this Quarter**: ${goals || "—"}
`;

  try {
    await mkdir(CTX_DIR, { recursive: true });
    await writeFile(join(CTX_DIR, `${userId}.md`), content, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/agents/context", async (req, res) => {
  const userId = String(req.query.userId || "").trim();

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const raw = await readFile(join(CTX_DIR, `${userId}.md`), "utf-8");
    const matchField = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = raw.match(new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.*)`));
      const value = match?.[1]?.trim() || "";
      return value === "—" ? "" : value;
    };

    res.json({
      userId,
      company: matchField("Company"),
      industry: matchField("Industry"),
      icp: matchField("Target ICP"),
      competitors: matchField("Top Competitors"),
      campaigns: matchField("Current Campaigns"),
      keywords: matchField("Active Keywords"),
      goals: matchField("Key Goals this Quarter"),
    });
  } catch {
    res.json({
      userId,
      company: "",
      industry: "",
      icp: "",
      competitors: "",
      campaigns: "",
      keywords: "",
      goals: "",
    });
  }
});

app.get("/api/agents/deployments", async (_req, res) => {
  try {
    const queue = await readDeploymentQueue();
    res.json({ deployments: queue });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/agents/:name/mark-run", async (req, res) => {
  const { name } = req.params;
  const { durationMs = 0 } = req.body ?? {};

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: "Unknown agent" });
  }

  try {
    await markAgentHeartbeat(name, "completed", Number(durationMs) || 0);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/agents/deployments", async (req, res) => {
  const {
    agentName,
    agentTarget,
    workspaceId,
    sectionId,
    sectionTitle,
    summary,
    bullets,
    tasks,
    source = "gtm-wizard",
  } = req.body ?? {};

  if (!agentName || !VALID_AGENTS.has(agentName)) {
    return res.status(400).json({ error: "Valid agentName is required" });
  }
  if (!sectionId || !sectionTitle) {
    return res.status(400).json({ error: "sectionId and sectionTitle are required" });
  }

  try {
    const queue = await readDeploymentQueue();
    const entry = {
      id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentName,
      agentTarget: agentTarget || null,
      workspaceId: typeof workspaceId === "string" && workspaceId.trim() ? workspaceId.trim() : null,
      sectionId,
      sectionTitle,
      summary: typeof summary === "string" ? summary : "",
      bullets: Array.isArray(bullets) ? bullets : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      source,
      status: "pending",
      createdAt: new Date().toISOString(),
      scheduledFor: "next_cron_run",
    };
    queue.unshift(entry);
    await writeDeploymentQueue(queue.slice(0, 200));
    res.status(201).json({ deployment: entry });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/agents/:name/memory ───────────────────────────────────────────────
// Returns the agent's MEMORY.md content.

app.get("/api/agents/:name/memory", async (req, res) => {
  const { name } = req.params;

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: "Unknown agent" });
  }

  const memoryPath = join(AGENTS_DIR, name, "memory", "MEMORY.md");
  try {
    const content = await readFile(memoryPath, "utf-8");
    res.json({ agent: name, memory: content });
  } catch {
    res.json({ agent: name, memory: "_No memory yet._" });
  }
});

// ── POST /api/agents/:name/plan ────────────────────────────────────────────────
// Breaks a user task into actionable subtasks plus an execution prompt.

app.post("/api/agents/:name/plan", async (req, res) => {
  const { name } = req.params;
  const { task } = req.body;

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: "Unknown agent" });
  }
  if (!task?.trim()) {
    return res.status(400).json({ error: "task is required" });
  }

  try {
    const plan = await generateAgentTaskPlan(
      name,
      task.trim(),
      AGENT_PROFILES[name] || {
        title: "Marketing AI agent",
        personality: "Execution-focused marketing operator.",
        executes: [],
      },
    );
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ── POST /api/agents/:name/run ─────────────────────────────────────────────────
// Runs an agent interactively (triggered by slash commands in ChatHome).
// Loads SOUL.md + MEMORY.md + skills/*.md as system prompt, calls Groq, streams SSE.
// Response format: data: {"text":"..."}\n\n ... data: [DONE]\n\n

app.post("/api/agents/:name/run", async (req, res) => {
  const { name } = req.params;
  const { query } = req.body;

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: "Unknown agent" });
  }
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  // Load SOUL.md
  const soulPath = join(AGENTS_DIR, name, "SOUL.md");
  let systemPrompt = `You are ${name}, a marketing AI agent.`;
  try {
    systemPrompt = await readFile(soulPath, "utf-8");
  } catch {
    /* use default */
  }

  // Load MEMORY.md
  const memoryPath = join(AGENTS_DIR, name, "memory", "MEMORY.md");
  let memory = "";
  try {
    memory = await readFile(memoryPath, "utf-8");
  } catch {
    /* no memory yet */
  }

  // Load skills from agents/{name}/skills/*.md
  let skillsBlock = "";
  try {
    const skillsDir = join(AGENTS_DIR, name, "skills");
    const files = (await readdir(skillsDir))
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (files.length) {
      const contents = await Promise.all(
        files.map((f) => readFile(join(skillsDir, f), "utf-8")),
      );
      skillsBlock =
        "\n\n## Your Available Skills\nYou have the following specialist workflows available. When a user request matches a skill, follow that skill's process exactly.\n\n" +
        contents
          .map((c, i) => `### ${files[i].replace(".md", "")}\n${c}`)
          .join("\n\n---\n\n");
    }
  } catch {
    /* no skills dir */
  }

  const fullSystem = [
    systemPrompt,
    memory ? `\n\n## Your Recent Memory\n${memory}` : "",
    skillsBlock,
  ].join("");

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const startedAt = Date.now();
  try {
    await markAgentHeartbeat(name, "running");
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: fullSystem },
        { role: "user", content: query },
      ],
      stream: true,
      max_tokens: 4096,
      temperature: 0.4,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
    await markAgentHeartbeat(name, "completed", Date.now() - startedAt);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    await markAgentHeartbeat(name, "error", Date.now() - startedAt, String(err));
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[content-engine] Listening on port ${PORT}`);
  startWorker();
});

// ── GET /api/integrations ──────────────────────────────────────────────────
// Stub endpoint — returns static connector catalog until live integrations are wired.
app.get("/api/integrations", (_req, res) => {
  const connectors = [
    // Advertising & acquisition
    {
      id: "google_ads",
      name: "Google Ads",
      status: "not_configured",
      connected: false,
      notes: "Sync campaigns, ad groups, and costs via OAuth.",
    },
    {
      id: "meta_ads",
      name: "Meta Ads",
      status: "not_configured",
      connected: false,
      notes: "Connect Facebook & Instagram ad accounts via OAuth.",
    },
    {
      id: "linkedin_ads",
      name: "LinkedIn Ads",
      status: "not_configured",
      connected: false,
      notes: "Bring in LinkedIn campaign performance for B2B funnels.",
    },

    // Email & messaging
    {
      id: "gmail",
      name: "Gmail",
      status: "not_configured",
      connected: false,
      notes: "Read campaign threads & outbound sequences via read-only OAuth.",
    },
    {
      id: "outlook",
      name: "Outlook",
      status: "not_configured",
      connected: false,
      notes: "Connect Outlook mailboxes for outreach and campaign monitoring.",
    },

    // CRM & customer data
    {
      id: "zoho_crm",
      name: "Zoho CRM",
      status: "not_configured",
      connected: false,
      notes: "Sync deals, contacts, and accounts with read-only agent access.",
    },
    {
      id: "hubspot",
      name: "HubSpot",
      status: "not_configured",
      connected: false,
      notes: "Sync contacts, deals, and marketing events from HubSpot.",
    },
    {
      id: "salesforce",
      name: "Salesforce",
      status: "not_configured",
      connected: false,
      notes: "Enterprise CRM accounts, opportunities, and pipelines.",
    },

    // Analytics & experimentation
    {
      id: "ga4",
      name: "Google Analytics 4",
      status: "not_configured",
      connected: false,
      notes: "Import web analytics, conversions, and funnel performance.",
    },
    {
      id: "gsc",
      name: "Google Search Console",
      status: "not_configured",
      connected: false,
      notes:
        "SEO queries, impressions, and click-through data for content performance.",
    },
    {
      id: "google_sheets",
      name: "Google Sheets",
      status: "not_configured",
      connected: false,
      notes:
        "Import marketing and reporting data from Google Sheets workbooks.",
    },
    {
      id: "microsoft_sheets",
      name: "Microsoft Excel / OneDrive",
      status: "not_configured",
      connected: false,
      notes: "Use Excel files from OneDrive as a marketing data source.",
    },
    {
      id: "semrush",
      name: "Semrush",
      status: "not_configured",
      connected: false,
      notes: "SEO and PPC competitive intelligence from Semrush.",
    },
    {
      id: "ahrefs",
      name: "Ahrefs",
      status: "not_configured",
      connected: false,
      notes: "Backlinks, keyword rankings, and content gaps from Ahrefs.",
    },

    // Engagement & product usage
    {
      id: "moengage",
      name: "MoEngage",
      status: "not_configured",
      connected: false,
      notes:
        "Stream engagement events and cohorts for activation and retention.",
    },
    {
      id: "mixpanel",
      name: "Mixpanel",
      status: "not_configured",
      connected: false,
      notes: "Product analytics events, funnels, and retention cohorts.",
    },
    {
      id: "clevertap",
      name: "CleverTap",
      status: "not_configured",
      connected: false,
      notes: "User engagement journeys, campaigns, and cohort insights.",
    },
    {
      id: "wordpress",
      name: "WordPress",
      status: "not_configured",
      connected: false,
      notes: "Blog and landing page content for SEO and content performance.",
    },

    // Commerce & data warehouse
    {
      id: "shopify",
      name: "Shopify",
      status: "not_configured",
      connected: false,
      notes: "Pull orders, products, and revenue for e-commerce analytics.",
    },
    {
      id: "snowflake",
      name: "Snowflake",
      status: "not_configured",
      connected: false,
      notes: "Connect a read-only warehouse role for advanced modeling.",
    },
  ];

  res.json({ connectors, debug: "integrations-static-v2" });
});

// ── POST /api/integrations/connect & /disconnect ──────────────────────────
app.post("/api/integrations/connect", (_req, res) => {
  res.status(501).json({ error: "Integrations not yet implemented" });
});
app.post("/api/integrations/disconnect", (_req, res) => {
  res.status(501).json({ error: "Integrations not yet implemented" });
});

// ── Company Intelligence CRUD ──────────────────────────────────────────────
// In-memory store fallback

const _companies = new Map(); // id → { company, artifacts }
let _cidCounter = 1;

function normalizeWebsiteUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url).trim().replace(/\/$/, "");
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

async function generateAgentTaskPlan(agentName, task, profile) {
  let lastError = null;

  const messages = [
    {
      role: "system",
      content: `You are an execution planner for the marketing AI agent "${agentName}".
Break a user request into a concise, actionable execution plan.

Return strict JSON only in this exact shape:
{
  "summary": "one short paragraph",
  "tasks": [
    { "label": "imperative action item", "horizon": "day" },
    { "label": "imperative action item", "horizon": "week" }
  ],
  "executionPrompt": "clear instruction the agent should execute using the approved plan"
}

Rules:
- Produce 3 to 6 tasks.
- Each task label must be specific, executable, and short.
- Use only these horizon values: "day", "week", "month".
- Avoid generic planning filler like "review strategy" unless tied to a concrete deliverable.
- The executionPrompt should tell the agent to execute the approved plan, not re-plan it.
- No markdown. JSON only.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        agent: agentName,
        agentRole: profile.title,
        agentPersonality: profile.personality,
        agentCapabilities: profile.executes,
        userTask: task,
      }),
    },
  ];

  for (const model of AGENT_PLAN_GROQ_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.35,
        ...(model === "groq/compound"
          ? {
              max_completion_tokens: 900,
            }
          : {
              response_format: { type: "json_object" },
            }),
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "";
      const candidate = model === "groq/compound" ? extractJsonObject(raw) || raw : raw;
      const parsed = JSON.parse(candidate);
      const tasks = Array.isArray(parsed.tasks)
        ? parsed.tasks
            .map((item) => ({
              label: String(item?.label || "").trim(),
              horizon: ["day", "week", "month"].includes(item?.horizon)
                ? item.horizon
                : "week",
            }))
            .filter((item) => item.label)
            .slice(0, 6)
        : [];

      if (!tasks.length) {
        throw new Error("Agent task plan returned no tasks");
      }

      return {
        summary: String(parsed.summary || "").trim() || `Execution plan for ${agentName}.`,
        tasks,
        executionPrompt:
          String(parsed.executionPrompt || "").trim() ||
          `Execute this approved task for ${agentName}: ${task}\n\nPlan:\n${tasks
            .map((item, index) => `${index + 1}. ${item.label}`)
            .join("\n")}`,
      };
    } catch (error) {
      lastError = error;
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            ...messages,
            {
              role: "user",
              content:
                "Return one strict JSON object only. Do not include markdown fences or commentary.",
            },
          ],
          temperature: 0.2,
          ...(model === "groq/compound"
            ? {
                max_completion_tokens: 900,
              }
            : {}),
        });

        const raw = completion.choices[0]?.message?.content?.trim() || "";
        const candidate = extractJsonObject(raw);
        if (!candidate) throw error;
        const parsed = JSON.parse(candidate);
        const tasks = Array.isArray(parsed.tasks)
          ? parsed.tasks
              .map((item) => ({
                label: String(item?.label || "").trim(),
                horizon: ["day", "week", "month"].includes(item?.horizon)
                  ? item.horizon
                  : "week",
              }))
              .filter((item) => item.label)
              .slice(0, 6)
          : [];
        if (!tasks.length) throw error;

        return {
          summary: String(parsed.summary || "").trim() || `Execution plan for ${agentName}.`,
          tasks,
          executionPrompt:
            String(parsed.executionPrompt || "").trim() ||
            `Execute this approved task for ${agentName}: ${task}\n\nPlan:\n${tasks
              .map((item, index) => `${index + 1}. ${item.label}`)
              .join("\n")}`,
        };
      } catch (retryError) {
        lastError = retryError;
      }
    }
  }

  throw lastError;
}

async function generateCompanyProfileWithGroq(userContent) {
  let lastError = null;

  for (const model of COMPANY_PROFILE_GROQ_MODELS) {
    const messages = [
      {
        role: "system",
        content: `You are a company research analyst. Given a website URL and homepage signals, generate a structured JSON company profile.
Extract the real company name from the page signals (prefer og:site_name, then application-name, then <title> without tagline, then <h1>).
Avoid boilerplate phrasing. Use concrete details visible from the company website whenever possible.
If details are uncertain, keep them concise and cautious instead of inventing specifics.

IMPORTANT — Social Links: Use web_search to actively find the company's official social media profiles. Search for:
- "[company name] LinkedIn official page" to find their LinkedIn URL
- "[company name] Instagram official" to find their Instagram URL
- "[company name] YouTube channel" to find their YouTube URL
- "[company name] Twitter OR X official" to find their Twitter/X URL
Only populate socialLinks with confirmed official profile URLs (e.g. https://linkedin.com/company/..., https://instagram.com/...). Do not guess or fabricate URLs. Leave null only if a profile genuinely cannot be found.

Output JSON only with exactly these fields:
{
  "companyName": "official company name as it appears on their website",
  "summary": "2-3 sentence company overview",
  "industry": "primary industry sector",
  "geoFocus": ["primary market 1", "primary market 2"],
  "offerings": ["product/service name 1", "product/service name 2"],
  "primaryAudience": ["target customer segment 1", "target customer segment 2"],
  "productsServices": [{"name":"","category":"","description":"","targetCustomer":"","differentiator":""}],
  "brandVoice": {"tone":"Professional/Friendly/Technical/etc","style":"Data-driven/Storytelling/Educational/etc"},
  "keyPages": {"about":null,"productsOrServices":null,"pricing":null,"contact":null},
  "socialLinks": {"linkedin":null,"instagram":null,"youtube":null,"twitter":null},
  "logoUrl": null,
  "sources": []
}`,
      },
      {
        role: "user",
        content: userContent,
      },
    ];

    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.35,
        ...(model === "groq/compound"
          ? {
              max_completion_tokens: 1400,
              top_p: 1,
              compound_custom: {
                tools: {
                  enabled_tools: ["web_search", "visit_website"],
                },
              },
            }
          : {
              response_format: { type: "json_object" },
            }),
      });

      return JSON.parse(
        completion.choices[0]?.message?.content?.trim() || "{}",
      );
    } catch (error) {
      lastError = error;
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            ...messages,
            {
              role: "user",
              content:
                "Return only one strict JSON object with no markdown or commentary.",
            },
          ],
          temperature: 0.2,
          ...(model === "groq/compound"
            ? {
                max_completion_tokens: 1400,
                top_p: 1,
                compound_custom: {
                  tools: {
                    enabled_tools: ["web_search", "visit_website"],
                  },
                },
              }
            : {}),
        });

        const raw = completion.choices[0]?.message?.content?.trim() || "";
        const candidate = extractJsonObject(raw);
        if (!candidate) throw error;
        return JSON.parse(candidate);
      } catch (retryError) {
        lastError = retryError;
      }
    }
  }

  throw lastError;
}

function hasNonEmptyProfile(profile) {
  return Boolean(
    profile && typeof profile === "object" && Object.keys(profile).length > 0,
  );
}

async function buildCompanyProfileUserContent(companyName, websiteUrl) {
  let pageHints = "";
  if (websiteUrl) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(websiteUrl.trim(), {
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TorqqBot/1.0)" },
      });
      clearTimeout(timer);
      if (resp.ok) {
        const html = await resp.text();
        const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
          [])[1]?.trim();
        const ogSite = (html.match(
          /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
        ) ||
          html.match(
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
          ) ||
          [])[1]?.trim();
        const appName = (html.match(
          /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["']/i,
        ) ||
          html.match(
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']application-name["']/i,
          ) ||
          [])[1]?.trim();
        const h1 = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1]?.trim();
        pageHints = [
          ogSite && `og:site_name="${ogSite}"`,
          appName && `application-name="${appName}"`,
          title && `<title>${title}</title>`,
          h1 && `<h1>${h1}</h1>`,
        ]
          .filter(Boolean)
          .join("\n");
      }
    } catch {
      // non-blocking
    }
  }

  return websiteUrl
    ? `Website: ${websiteUrl.trim()}${pageHints ? `\n\nPage signals scraped from homepage:\n${pageHints}` : ""}\n\nGenerate the company profile JSON.`
    : `Company: ${companyName.trim()}\n\nGenerate the company profile JSON.`;
}

async function refreshCompanyProfile(entry, fallbackCompanyName) {
  if (!entry?.company) return entry;
  const userContent = await buildCompanyProfileUserContent(
    fallbackCompanyName || entry.company.companyName || "Company",
    entry.company.websiteUrl || "",
  );
  const profileData = await generateCompanyProfileWithGroq(userContent);
  const resolvedName =
    typeof profileData.companyName === "string" &&
    profileData.companyName.trim()
      ? profileData.companyName.trim()
      : fallbackCompanyName || entry.company.companyName;
  delete profileData.companyName;
  entry.company.companyName = resolvedName;
  entry.company.profile = profileData;
  entry.company.updatedAt = new Date().toISOString();
  await saveCompany(entry.company);
  _companies.set(entry.company.id, entry);
  console.log(`[CompanyIngest] Profile generated for ${resolvedName}`);
  return entry;
}

async function ensureCompanyEntry(companyId) {
  let entry = _companies.get(companyId);
  const dbData = await loadCompanyWithArtifacts(companyId);

  if (dbData) {
    const inMemoryProfile = entry?.company?.profile;
    const dbProfile = dbData.company?.profile;
    const mergedProfile =
      inMemoryProfile &&
      typeof inMemoryProfile === "object" &&
      Object.keys(inMemoryProfile).length > 0
        ? inMemoryProfile
        : dbProfile || {};

    entry = {
      company: {
        ...dbData.company,
        ...(entry?.company || {}),
        profile: mergedProfile,
      },
      artifacts: { ...(entry?.artifacts || {}), ...(dbData.artifacts || {}) },
      failedArtifacts: entry?.failedArtifacts || new Set(),
    };
    _companies.set(companyId, entry);
    return entry;
  }

  return entry || null;
}

app.get("/api/company-intel/companies", async (_req, res) => {
  const dbCompanies = await loadCompanies();
  if (dbCompanies.length) {
    for (const company of dbCompanies) {
      const existing = _companies.get(company.id);
      _companies.set(company.id, {
        company,
        artifacts: existing?.artifacts || {},
        failedArtifacts: existing?.failedArtifacts || new Set(),
      });
    }
    return res.json({ companies: dbCompanies });
  }

  res.json({
    companies: Array.from(_companies.values()).map((e) => e.company),
  });
});

app.post("/api/company-intel/companies", async (req, res) => {
  const { companyName, websiteUrl } = req.body || {};
  if (!companyName?.trim())
    return res.status(400).json({ error: "companyName is required" });

  // Use UUID for easier DB sync
  import("crypto").then(async ({ randomUUID }) => {
    const normalizedWebsiteUrl = normalizeWebsiteUrl(
      websiteUrl?.trim() || null,
    );
    let existingCompany = null;

    if (normalizedWebsiteUrl) {
      existingCompany =
        Array.from(_companies.values())
          .map((entry) => entry.company)
          .find(
            (company) =>
              normalizeWebsiteUrl(company.websiteUrl) === normalizedWebsiteUrl,
          ) || (await loadCompanyByWebsiteUrl(normalizedWebsiteUrl));
    }

    const id = existingCompany?.id || randomUUID();
    const now = new Date().toISOString();
    const shouldRefreshExistingCompany = Boolean(existingCompany?.id);
    const company = {
      id,
      companyName: companyName.trim(),
      websiteUrl: normalizedWebsiteUrl,
      createdAt: existingCompany?.createdAt || now,
      updatedAt: now,
      // Same-URL ingest should refresh the snapshot instead of reusing stale profile data.
      profile: {},
    };

    // Save locally
    const existingEntry = existingCompany
      ? _companies.get(existingCompany.id) ||
        (await loadCompanyWithArtifacts(existingCompany.id))
      : null;
    if (shouldRefreshExistingCompany) {
      await clearArtifactsForCompany(id);
    }
    _companies.set(id, {
      company,
      artifacts: shouldRefreshExistingCompany
        ? {}
        : existingEntry?.artifacts || {},
      failedArtifacts: new Set(),
    });

    // Save to Supabase
    await saveCompany(company);
    if (normalizedWebsiteUrl) {
      await deleteDuplicateCompaniesByWebsiteUrl(normalizedWebsiteUrl, id);
    }

    res.json({ company });

    // Fire background profile generation — does NOT block the response.
    // The frontend polls /companies/:id every 3s so it will pick this up automatically.
    (async () => {
      try {
        const e = _companies.get(id);
        if (e) await refreshCompanyProfile(e, companyName.trim());
      } catch (err) {
        console.warn("[CompanyIngest] Profile generation failed:", err.message);
      }
    })();
  });
});

app.get("/api/company-intel/companies/:id", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: "Company not found" });
  }
  res.json({ company: entry.company, artifacts: entry.artifacts });
});

app.patch("/api/company-intel/companies/:id/artifacts", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  const { artifactType, data } = req.body || {};
  if (!artifactType)
    return res.status(400).json({ error: "artifactType required" });
  const now = new Date().toISOString();
  const artifact = { type: artifactType, updatedAt: now, data };

  entry.artifacts[artifactType] = artifact;
  entry.company.updatedAt = now;

  await saveArtifact(req.params.id, artifact);

  res.json({ artifact: entry.artifacts[artifactType] });
});

app.delete("/api/company-intel/companies/:id/artifacts", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  await clearArtifactsForCompany(req.params.id);
  entry.artifacts = {};
  res.json({ ok: true });
});

app.delete("/api/company-intel/companies/:id", async (req, res) => {
  const companyId = req.params.id;
  try {
    if (supabase) {
      await supabase
        .from("company_artifacts")
        .delete()
        .eq("company_id", companyId);
      await supabase.from("companies").delete().eq("id", companyId);
    }
    _companies.delete(companyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/company-intel/companies/:id/generate", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });

  const { type, inputs } = req.body || {};
  if (!type) return res.status(400).json({ error: "type is required" });

  try {
    if (
      !hasNonEmptyProfile(entry.company.profile) &&
      entry.company.websiteUrl
    ) {
      await refreshCompanyProfile(entry, entry.company.companyName);
    }

    const now = new Date().toISOString();
    let directGroqError = null;

    for (const model of COMPANY_INTEL_GROQ_MODELS) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content: `You are an expert marketing strategist. Generate ${type} for ${entry.company.companyName}. Output JSON only.`,
            },
            { role: "user", content: `Inputs: ${JSON.stringify(inputs)}` },
          ],
          temperature: 0.3,
          ...(model === "groq/compound"
            ? {
                max_completion_tokens: 1024,
                top_p: 1,
                compound_custom: {
                  tools: {
                    enabled_tools: ["web_search", "visit_website"],
                  },
                },
              }
            : {
                response_format: { type: "json_object" },
              }),
        });
        const data = JSON.parse(
          completion.choices[0]?.message?.content?.trim() || "{}",
        );
        entry.artifacts[type] = { type, updatedAt: now, data };
        directGroqError = null;
        break;
      } catch (err) {
        directGroqError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (directGroqError) {
      const CREWAI_URL = process.env.CREWAI_URL || "http://localhost:8002";
      console.warn(
        `Direct Groq failed, falling back to CrewAI: ${directGroqError.message}`,
      );

      const resp = await fetch(
        `${CREWAI_URL}/api/crewai/company-intel/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: entry.company.companyName,
            company_url: entry.company.websiteUrl,
            artifact_type: type,
            inputs,
            company_profile: entry.company.profile,
          }),
        },
      );

      if (!resp.ok) {
        throw new Error(`CrewAI responded with ${resp.status}`);
      }

      const crewData = await resp.json();
      if (crewData.status === "failed") {
        throw new Error(crewData.error || "CrewAI generation failed");
      }

      entry.artifacts[type] = {
        type,
        updatedAt: crewData.generated_at || now,
        data: crewData.data,
      };
    }

    entry.company.updatedAt = now;
    await saveArtifact(req.params.id, entry.artifacts[type]);
    await saveCompany(entry.company);
    res.json({ artifact: entry.artifacts[type] });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/company-intel/companies/:id/generate-all", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });

  if (!hasNonEmptyProfile(entry.company.profile) && entry.company.websiteUrl) {
    try {
      await refreshCompanyProfile(entry, entry.company.companyName);
    } catch (err) {
      console.warn(
        `[Generate-all] profile refresh failed for ${entry.company.companyName}:`,
        err.message,
      );
    }
  }

  const { inputs } = req.body || {};
  const total = COMPANY_INTEL_ARTIFACT_TYPES.length;
  const companyId = req.params.id;

  if (!entry.failedArtifacts) entry.failedArtifacts = new Set();

  // Keep the in-memory _companies map up to date as each artifact finishes or fails.
  registerArtifactCallback(companyId, (_cid, type, artifact) => {
    const e = _companies.get(companyId);
    if (e) e.artifacts[type] = artifact;
  });
  registerArtifactFailCallback(companyId, (_cid, type) => {
    const e = _companies.get(companyId);
    if (e) e.failedArtifacts.add(type);
  });

  // Enqueue each artifact type for background processing
  (async () => {
    for (const type of COMPANY_INTEL_ARTIFACT_TYPES) {
      entry.failedArtifacts.delete(type); // Clear prior failure so it can retry
      try {
        await enqueueGeneration(entry.company, type, inputs);
      } catch (err) {
        console.warn(`[Generate-all] failed to enqueue ${type}`, err.message);
        entry.failedArtifacts.add(type);
      }
    }
  })();

  res.status(202).json({ status: "started", total, companyId });
});

app.get(
  "/api/company-intel/companies/:id/generate-all/status",
  async (req, res) => {
    const entry = await ensureCompanyEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: "Company not found" });
    if (!supabase) {
      const completed = Object.keys(entry.artifacts).length;
      const failed = entry.failedArtifacts ? entry.failedArtifacts.size : 0;
      const total = COMPANY_INTEL_ARTIFACT_TYPES.length;
      const done = completed + failed >= total;
      return res.json({
        status: done ? "completed" : "running",
        completed,
        failed,
        total,
      });
    }

    try {
      const { data, error } = await supabase
        .from("generation_jobs")
        .select("artifact_type,status")
        .eq("company_id", req.params.id);

      if (error) throw error;

      const completed = (data || []).filter(
        (row) => row.status === "completed",
      ).length;
      const failed = (data || []).filter(
        (row) => row.status === "failed",
      ).length;
      const total = COMPANY_INTEL_ARTIFACT_TYPES.length;
      const done = completed + failed >= total;
      res.json({
        status: done ? "completed" : "running",
        completed,
        failed,
        total,
      });
    } catch {
      const completed = Object.keys(entry.artifacts).length;
      const failed = entry.failedArtifacts ? entry.failedArtifacts.size : 0;
      const total = COMPANY_INTEL_ARTIFACT_TYPES.length;
      const done = completed + failed >= total;
      res.json({
        status: done ? "completed" : "running",
        completed,
        failed,
        total,
      });
    }
  },
);

// ── Budget Optimization ────────────────────────────────────────────────────

const BUDGET_CONNECTORS = [
  {
    id: "meta",
    name: "Meta Ads",
    status: "not_configured",
    connected: false,
    notes: "Connect via OAuth in Integrations",
  },
  {
    id: "google_ads",
    name: "Google Ads",
    status: "not_configured",
    connected: false,
    notes: "Connect via OAuth in Integrations",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    status: "not_configured",
    connected: false,
    notes: "Connect via OAuth in Integrations",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    status: "not_configured",
    connected: false,
    notes: "Connect via OAuth in Integrations",
  },
  {
    id: "shopify",
    name: "Shopify",
    status: "not_configured",
    connected: false,
    notes: "Connect via API key in Integrations",
  },
  {
    id: "snowflake",
    name: "Snowflake",
    status: "not_configured",
    connected: false,
    notes: "Connect via credentials in Integrations",
  },
  {
    id: "manual",
    name: "Manual / CSV Upload",
    status: "available",
    connected: true,
    notes: "Paste or upload your data below",
  },
];

app.get("/api/budget-optimization/connectors", (_req, res) => {
  res.json({
    philosophy:
      "GoMarble-style: real-time connectors + AI insights (no permanent data storage).",
    rateLimit: "10 analyses per hour per user",
    cacheTtlSeconds: 300,
    connectors: BUDGET_CONNECTORS,
  });
});

// Rate-limit map: userId → last call timestamp
const _budgetRateLimit = new Map();

app.post("/api/budget-optimization/analyze", async (req, res) => {
  const {
    userId = "anonymous",
    question,
    timeframe = "last_30_days",
    currency = "INR",
    dataText = "",
  } = req.body || {};
  if (!question?.trim())
    return res.status(400).json({ error: "question is required" });

  // Simple per-user cooldown: 6 seconds
  const now = Date.now();
  if (now - (_budgetRateLimit.get(userId) || 0) < 6000) {
    return res
      .status(429)
      .json({ error: "Rate limit: wait a few seconds before analyzing again" });
  }
  _budgetRateLimit.set(userId, now);

  const systemPrompt = `You are a senior marketing analyst specialising in budget optimisation and ROAS analysis.
Timeframe: ${timeframe}. Currency: ${currency}.
Respond with ONLY a valid JSON object — no markdown, no code fences — matching this exact schema:
{
  "kpiSnapshot": { "spend": number|null, "revenue": number|null, "roas": number|null, "cpa": number|null, "cpc": number|null, "ctr": number|null, "cvr": number|null },
  "diagnosis": "string",
  "recommendations": ["string"],
  "budgetPlan": [{ "channel": "string", "currentBudget": number|null, "recommendedBudget": number|null, "rationale": "string" }],
  "creativeInsights": { "topPerformers": ["string"], "fatigue": ["string"], "toTest": ["string"] },
  "reportHtml": "string",
  "assumptions": ["string"],
  "precisionScorecard": { "threshold": 70, "overall": number, "productionReady": boolean, "dimensions": [{ "key": "string", "score": number, "reason": "string" }] }
}`;

  const userMsg = `Question: ${question}\n\nData:\n${dataText.trim() || "(No data provided — use general best-practice defaults)"}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });
    const text = completion.choices[0]?.message?.content?.trim() || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* use empty */
    }
    res.json({ timeframe, currency, ...parsed });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Upload endpoints require multipart parsing (multer not installed).
// Return 501 so the UI shows a clear "not implemented" rather than a 404 HTML error page.
app.post("/api/budget-optimization/upload", (_req, res) => {
  res
    .status(501)
    .json({ error: "File upload requires multer — run: npm install multer" });
});
app.post("/api/budget-optimization/calibration/upload", (_req, res) => {
  res
    .status(501)
    .json({ error: "File upload requires multer — run: npm install multer" });
});

// ── Performance Scorecard ──────────────────────────────────────────────────

app.get("/api/performance-scorecard/connectors", (_req, res) => {
  res.json({
    philosophy:
      "Upload or paste your marketing data; AI generates a full performance scorecard.",
    rateLimit: "10 scorecards per hour per user",
    cacheTtlSeconds: 300,
    connectors: [
      { id: "meta", name: "Meta Ads", status: "not_configured" },
      { id: "google_ads", name: "Google Ads", status: "not_configured" },
      { id: "ga4", name: "Google Analytics 4", status: "not_configured" },
      { id: "tiktok", name: "TikTok Ads", status: "not_configured" },
      { id: "manual", name: "Manual / CSV Upload", status: "available" },
    ],
  });
});

app.post("/api/performance-scorecard/generate", async (req, res) => {
  const {
    userId = "anonymous",
    timeframe = "last_30_days",
    currency = "INR",
    businessContext = "",
    dataText = "",
  } = req.body || {};

  const now = Date.now();
  if (now - (_budgetRateLimit.get(`ps_${userId}`) || 0) < 6000) {
    return res
      .status(429)
      .json({
        error: "Rate limit: wait a few seconds before generating again",
      });
  }
  _budgetRateLimit.set(`ps_${userId}`, now);

  const systemPrompt = `You are a senior marketing performance analyst.
Timeframe: ${timeframe}. Currency: ${currency}.
Respond with ONLY valid JSON (no markdown, no fences) matching this schema:
{
  "overallScore": number,
  "grade": "A+"|"A"|"B+"|"B"|"C"|"D"|"F",
  "kpis": { "spend": number|null, "revenue": number|null, "roas": number|null, "leads": number|null, "customers": number|null, "cpa": number|null, "cpc": number|null, "ctr": number|null, "cvr": number|null },
  "channelBreakdown": [{ "channel": "string", "score": number, "spend": number|null, "roas": number|null, "trend": "up"|"down"|"flat", "recommendation": "string" }],
  "benchmarks": [{ "metric": "string", "yours": number|null, "industry": number|null, "delta": number|null, "status": "above"|"below"|"at" }],
  "forecast": [{ "month": "string", "predictedSpend": number|null, "predictedRevenue": number|null, "predictedRoas": number|null }],
  "insights": ["string"],
  "reportHtml": "string",
  "assumptions": ["string"]
}`;

  const userMsg = `Business context: ${businessContext || "(none provided)"}\n\nMarketing data:\n${dataText?.trim() || "(No data — use general best-practice defaults)"}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      max_tokens: 2500,
      temperature: 0.3,
    });
    const text = completion.choices[0]?.message?.content?.trim() || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* use empty */
    }
    res.json({ timeframe, currency, ...parsed });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Workspace routes ─────────────────────────────────────────────────────

// GET /api/workspaces?userId=xxx — list workspaces for a user (auto-provisions default)
app.get("/api/workspaces", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    let { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, website_url, created_at)")
      .eq("user_id", userId);
    if (error) throw error;

    // Auto-provision default workspace for new users
    if (!data || data.length === 0) {
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert({ name: "My workspace", owner_id: userId })
        .select()
        .single();
      if (wsErr) throw wsErr;
      const { error: memErr } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
      if (memErr) throw memErr;
      return res.json({ workspaces: [{ ...ws, role: "owner" }] });
    }

    const workspaces = data.map((row) => ({
      ...row.workspace,
      role: row.role,
    }));
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces — create workspace + add owner as member
app.post("/api/workspaces", async (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name)
    return res.status(400).json({ error: "userId and name required" });
  try {
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .insert({ name, owner_id: userId })
      .select()
      .single();
    if (wsErr) throw wsErr;
    const { error: memErr } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
    if (memErr) throw memErr;
    res.json({ workspace: { ...ws, role: "owner" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workspaces/:id — update name or website_url
app.patch("/api/workspaces/:id", async (req, res) => {
  const { id } = req.params;
  const { name, website_url, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (website_url !== undefined) updates.website_url = website_url;
    const { data, error } = await supabase
      .from("workspaces")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ workspace: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspaces/:id/members — list members
app.get("/api/workspaces/:id/members", async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, joined_at, user_id")
      .eq("workspace_id", id);
    if (error) throw error;
    // Fetch user details separately since auth.users join may be restricted
    const members = (data || []).map((row) => ({
      id: row.user_id,
      email: row.user_id, // placeholder — will show user_id until auth join available
      name: "Member",
      role: row.role,
      joined_at: row.joined_at,
    }));
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/:id/invite — create pending invite
app.post("/api/workspaces/:id/invite", async (req, res) => {
  const { id } = req.params;
  const { email, invitedBy } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  try {
    const { data, error } = await supabase
      .from("workspace_invites")
      .insert({ workspace_id: id, email, invited_by: invitedBy })
      .select()
      .single();
    if (error) throw error;
    // TODO: send invite email with data.token
    console.log(
      `[invite] ${email} invited to workspace ${id} — token: ${data.token}`,
    );
    res.json({ invite: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workspaces/:id/members/:userId — remove member (cannot remove owner)
app.delete("/api/workspaces/:id/members/:userId", async (req, res) => {
  const { id, userId } = req.params;
  try {
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", id)
      .eq("user_id", userId)
      .neq("role", "owner");
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
