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
import { createClient } from "@supabase/supabase-js";
import { GoogleAuth } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { WebSocketServer } from "ws";
import {
    enqueueGeneration,
    generateArtifactWithGroq,
    normalizeArtifact,
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
import { MKGService } from "./mkg-service.js";
import { extractContract, validateContract } from "./contract-validator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths relative to this file (platform/content-engine/)
const CREWAI_DIR = join(__dirname, "..", "crewai");
const HEARTBEAT_PATH = join(CREWAI_DIR, "heartbeat", "status.json");
const AGENTS_DIR = join(CREWAI_DIR, "agents");
const CTX_DIR = join(CREWAI_DIR, "client_context");
const DEPLOYMENT_QUEUE_PATH = join(CREWAI_DIR, "deployments", "queue.json");
const COMPANY_INTEL_KB_ROOT = join(__dirname, "data", "company-intel-kb");
const VOICEBOT_KB_ROOT = join(__dirname, "data", "voicebot-kb");
const VOICEBOT_CALLS_ROOT = join(__dirname, "data", "voicebot-calls");

const VALID_AGENTS = new Set([
  "veena",   // Company Intelligence — Phase 3
  "zara",
  "maya",
  "riya",
  "arjun",
  "dev",
  "priya",
  "tara",
  "neel",
  "isha",
]);
const AGENT_PROFILES = {
  zara: {
    title: "Strategy & Monetization",
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
    title: "Sales & RevOps",
    personality:
      "Analytical and conversion-oriented, with a strong bias toward qualification, prioritization, and pipeline efficiency.",
    executes: [
      "Analyze lead quality and prospect segments",
      "Surface ICP fit, enrichment, and prioritization insights",
      "Support outreach and opportunity qualification decisions",
    ],
  },
  dev: {
    title: "Paid & Distribution",
    personality:
      "Numerate, pragmatic, and focused on budget efficiency, signal quality, and measurable performance improvement.",
    executes: [
      "Review campaign performance and scorecards",
      "Recommend budget reallocations and efficiency moves",
      "Track KPI movement across channels and time horizons",
    ],
  },
  priya: {
    title: "Conversion Optimization",
    personality:
      "Research-led, positioning-aware, and strong at turning messy market inputs into sharper differentiation.",
    executes: [
      "Generate company intelligence and competitor analysis",
      "Refine messaging, positioning, and audience hypotheses",
      "Support brand, market, and narrative decisions",
    ],
  },
  tara: {
    title: "Measurement & Testing",
    personality:
      "Experiment-oriented and rigorous, focused on attribution quality, incrementality, and decision-ready KPI movement.",
    executes: [
      "Build measurement plans with cross-channel attribution guardrails",
      "Design experiment loops and testing cadences for key campaigns",
      "Turn scorecard outputs into prioritized optimization tasks",
    ],
  },
  neel: {
    title: "Retention",
    personality:
      "Lifecycle-focused operator who improves activation, engagement, and repeat conversion through focused follow-up systems.",
    executes: [
      "Build retention and re-engagement task plans from audience insights",
      "Translate segment behavior into lifecycle content and outreach actions",
      "Operationalize post-conversion and nurture workflows",
    ],
  },
  isha: {
    title: "Growth Engineering",
    personality:
      "Systems thinker with an automation mindset, focused on scalable workflows, integrations, and compounding growth loops.",
    executes: [
      "Design cross-workflow automation and orchestration tasks",
      "Turn strategic opportunities into scalable growth loops",
      "Bridge content, channel, and partner workflows into one operating system",
    ],
  },
  veena: {
    title: "Company Intelligence",
    personality:
      "Methodical and evidence-first — reports only what the website confirms, flags all assumptions explicitly, and never invents data.",
    executes: [
      "Crawl company websites to bootstrap the Marketing Knowledge Graph with all 12 fields",
      "Populate positioning, ICP, competitors, offers, messaging, channels, and funnel from public web signals",
      "Trigger the sequential onboarding chain (isha, neel, zara) after initial MKG population",
    ],
    description: "Crawls company websites to bootstrap the Marketing Knowledge Graph with all 12 fields populated before any other agent runs.",
    schedule: "Weekly Mon 06:00 IST",
    writes_to_mkg: ["positioning", "icp", "competitors", "offers", "messaging", "channels", "funnel", "metrics", "baselines", "content_pillars", "campaigns", "insights"],
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
const SARVAM_API_BASE = process.env.SARVAM_API_BASE || "https://api.sarvam.ai";
const SARVAM_TTS_ENDPOINT =
  process.env.SARVAM_TTS_ENDPOINT || `${SARVAM_API_BASE}/text-to-speech/stream`;
const SARVAM_STT_ENDPOINT =
  process.env.SARVAM_STT_ENDPOINT || `${SARVAM_API_BASE}/speech-to-text`;
const SARVAM_TTS_MODEL = process.env.SARVAM_TTS_MODEL || "bulbul:v3";
const SARVAM_STT_MODEL = process.env.SARVAM_STT_MODEL || "saaras:v3";
const VOICEBOT_DIALOGUE_MODELS = [
  process.env.GROQ_VOICEBOT_MODEL || "groq/compound",
  "llama-3.3-70b-versatile",
];
const voicebotSessions = new Map();
const twilioMediaSessions = new Map();
const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const LIVEKIT_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "martech-voicebot";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
const TWILIO_PUBLIC_BASE_URL =
  process.env.TWILIO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "";
const TWILIO_MEDIA_STREAM_WSS_URL =
  process.env.TWILIO_MEDIA_STREAM_WSS_URL || "";
const TWILIO_DEFAULT_STATUS_CALLBACK =
  process.env.TWILIO_STATUS_CALLBACK_URL || "";
const GOOGLE_SHEETS_SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
  process.env.SPREADSHEET_ID ||
  "";
const LEADS_DB_BASE_URL = String(process.env.LEADS_DB_BASE_URL || "").replace(/\/$/, "");
const LEADS_DB_BEARER_TOKEN = process.env.LEADS_DB_BEARER_TOKEN || "";
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN || "";
const HUBSPOT_API_BASE =
  process.env.HUBSPOT_API_BASE || "https://api.hubapi.com";
const TWILIO_OUTBOUND_GREETING =
  process.env.TWILIO_OUTBOUND_GREETING ||
  "Hello, this is the AI calling assistant from your marketing team.";
const TWILIO_SILENCE_FRAME_THRESHOLD = Number(
  process.env.TWILIO_SILENCE_FRAME_THRESHOLD || 18,
);
const TWILIO_SPEECH_RMS_THRESHOLD = Number(
  process.env.TWILIO_SPEECH_RMS_THRESHOLD || 350,
);
const TWILIO_BARGE_IN_FRAMES = Number(
  process.env.TWILIO_BARGE_IN_FRAMES || 4,
);
const TWILIO_TTS_PACE = Number(process.env.TWILIO_TTS_PACE || 1.1);
const TWILIO_MIN_UTTERANCE_SAMPLES = Number(
  process.env.TWILIO_MIN_UTTERANCE_SAMPLES || 6400,
);
const TWILIO_INTERRUPT_SILENCE_FRAMES = Number(
  process.env.TWILIO_INTERRUPT_SILENCE_FRAMES || 10,
);
const TWILIO_MAX_CONVERSATION_TURNS = Number(
  process.env.TWILIO_MAX_CONVERSATION_TURNS || 24,
);

const COMPANY_INTEL_KB_CATEGORIES = new Set([
  "brand_guidelines",
  "product_service_docs",
  "company_ppts",
]);

function loadEnvFileIntoProcess(envPath) {
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    raw.split("\n").forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {
    // ignore missing env files
  }
}

loadEnvFileIntoProcess(join(__dirname, "..", "..", ".env"));
loadEnvFileIntoProcess(join(__dirname, "..", "..", ".env.local"));
loadEnvFileIntoProcess(join(CREWAI_DIR, ".env"));

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const supabaseAdminClient =
  process.env.VITE_SUPABASE_URL && supabaseServiceKey
    ? createClient(process.env.VITE_SUPABASE_URL, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

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
      tara: { status: "idle", last_run: null, duration_ms: null },
      neel: { status: "idle", last_run: null, duration_ms: null },
      isha: { status: "idle", last_run: null, duration_ms: null },
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
      await Promise.all(
        entries
          .filter((entry) => entry?.status === "failed" && entry?.failedAt)
          .map((entry) =>
            syncCompanyActionStatusFromDeployment(entry, "failed", {
              error: entry?.error || "Deployment timed out before completion.",
            }),
          ),
      );
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

function companyKbDir(companyId) {
  return join(COMPANY_INTEL_KB_ROOT, companyId);
}

function voicebotKbDir() {
  return VOICEBOT_KB_ROOT;
}

function companyKbManifestPath(companyId) {
  return join(companyKbDir(companyId), "manifest.json");
}

function companyAssetManifestPath(companyId) {
  return join(companyKbDir(companyId), "assets.json");
}

function voicebotKbManifestPath() {
  return join(voicebotKbDir(), "manifest.json");
}

function companyActionStatusPath(companyId) {
  return join(companyKbDir(companyId), "action-status.json");
}

function sanitizeKnowledgeBaseFilename(name) {
  const trimmed = String(name || "file").trim() || "file";
  return trimmed.replace(/[^a-zA-Z0-9._ -]/g, "_");
}

function sanitizeVoicebotSessionId(sessionId) {
  return String(sessionId || "").trim().slice(0, 80);
}

function pickSarvamLanguageCode(language) {
  return language === "hi" ? "hi-IN" : "en-IN";
}

function pickSarvamSpeaker(language, gender) {
  if (language === "hi" && gender === "female") {
    return process.env.SARVAM_TTS_HI_FEMALE_SPEAKER || "priya";
  }
  if (language === "hi" && gender === "male") {
    return process.env.SARVAM_TTS_HI_MALE_SPEAKER || "shubh";
  }
  if (gender === "male") {
    return process.env.SARVAM_TTS_EN_MALE_SPEAKER || "shubh";
  }
  return process.env.SARVAM_TTS_EN_FEMALE_SPEAKER || "priya";
}

function mimeTypeToExtension(mimeType = "") {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "bin";
}

function trimSessionHistory(messages) {
  return messages.slice(-12);
}

function extractJsonCandidate(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const candidate = extractJsonObject(raw);
    if (!candidate) return null;
    return JSON.parse(candidate);
  }
}

async function readVoicebotKbManifest() {
  try {
    const raw = await readFile(voicebotKbManifestPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeVoicebotKbManifest(entries) {
  const dir = voicebotKbDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    voicebotKbManifestPath(),
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

async function searchVoicebotKnowledgeBase(query, limit = 6) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return [];
  const entries = await readVoicebotKbManifest();
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 2);
  const ranked = [];

  for (const entry of entries) {
    try {
      const content = await readFile(entry.path, "utf-8");
      const haystack = content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      if (!score && !haystack.includes(normalizedQuery)) continue;
      if (!score) score = 1;
      const matchIndex = Math.max(
        0,
        haystack.indexOf(tokens[0] || normalizedQuery),
      );
      const snippet = content
        .slice(Math.max(0, matchIndex - 120), matchIndex + 320)
        .replace(/\s+/g, " ")
        .trim();
      ranked.push({
        fileId: entry.id,
        fileName: entry.name,
        score,
        snippet,
      });
    } catch {
      // ignore unreadable file
    }
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

function getVoicebotSession(sessionId) {
  const safeSessionId = sanitizeVoicebotSessionId(sessionId) || randomUUID();
  const existing = voicebotSessions.get(safeSessionId);
  if (existing) return existing;
  const created = { id: safeSessionId, messages: [] };
  voicebotSessions.set(safeSessionId, created);
  return created;
}

function voicebotCallsDir() {
  return VOICEBOT_CALLS_ROOT;
}

function voicebotCallPath(callSid) {
  return join(voicebotCallsDir(), `${String(callSid || "unknown")}.json`);
}

function normalizeShortText(value, fallback = "unknown") {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function summarizeLeadQualification(turns = []) {
  const joined = turns
    .map((turn) => `${turn.role}: ${turn.text}`)
    .join(" \n")
    .toLowerCase();
  const patterns = {
    need: ["need", "problem", "challenge", "pain", "struggling", "looking for", "want to improve"],
    timing: ["this month", "next month", "this quarter", "urgent", "soon", "immediately", "timeline"],
    authority: ["i handle", "i decide", "decision maker", "team lead", "founder", "head of", "manager"],
    budget: ["budget", "cost", "price", "spend", "allocation", "approved"],
    nextStep: ["send", "demo", "meeting", "call back", "follow up", "proposal", "share details"],
  };

  const scoreBucket = {};
  for (const [key, tokens] of Object.entries(patterns)) {
    scoreBucket[key] = tokens.some((token) => joined.includes(token));
  }

  let total = 0;
  total += scoreBucket.need ? 25 : 0;
  total += scoreBucket.timing ? 20 : 0;
  total += scoreBucket.authority ? 20 : 0;
  total += scoreBucket.budget ? 15 : 0;
  total += scoreBucket.nextStep ? 20 : 0;

  return {
    heuristicScore: total,
    detectedSignals: Object.entries(scoreBucket)
      .filter(([, matched]) => matched)
      .map(([key]) => key),
  };
}

async function searchCompanySalesContext(companyId, query, limit = 5) {
  if (!companyId) return [];
  const normalizedQuery = normalizeShortText(query, "").toLowerCase();
  if (!normalizedQuery) return [];

  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 2);
  const ranked = [];
  const entry = await ensureCompanyEntry(companyId);

  if (entry?.company?.profile) {
    const profileText = JSON.stringify(entry.company.profile, null, 2);
    const haystack = profileText.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 2;
    }
    if (score) {
      ranked.push({
        source: "company_profile",
        fileName: `${entry.company.companyName || "Company"} profile`,
        score,
        snippet: profileText.slice(0, 700),
      });
    }
  }

  if (entry?.artifacts && typeof entry.artifacts === "object") {
    for (const [type, artifact] of Object.entries(entry.artifacts)) {
      const artifactText = JSON.stringify(artifact?.data || artifact || {}, null, 2);
      const haystack = artifactText.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      if (!score) continue;
      ranked.push({
        source: `artifact:${type}`,
        fileName: type,
        score,
        snippet: artifactText.slice(0, 700),
      });
    }
  }

  const files = await readKnowledgeBaseManifest(companyId);
  for (const file of files) {
    try {
      const content = await readFile(file.path, "utf-8");
      const haystack = content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 2;
      }
      if (!score && !haystack.includes(normalizedQuery)) continue;
      ranked.push({
        source: "company_kb",
        fileName: file.name,
        score: score || 1,
        snippet: content.slice(0, 700).replace(/\s+/g, " ").trim(),
      });
    } catch {
      // ignore unreadable file
    }
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function buildCompanySalesContext(companyId) {
  if (!companyId) {
    return {
      companyName: "the company",
      salesContext: "No company-specific context is available for this call.",
    };
  }

  const entry = await ensureCompanyEntry(companyId);
  const company = entry?.company || null;
  const profile = company?.profile || {};
  const artifacts = entry?.artifacts || {};

  const positioning = profile?.summary || profile?.positioning || "";
  const offerings = Array.isArray(profile?.offerings)
    ? profile.offerings.slice(0, 6)
    : Array.isArray(profile?.products)
      ? profile.products.slice(0, 6)
      : [];
  const audiences = Array.isArray(profile?.targetAudience)
    ? profile.targetAudience.slice(0, 6)
    : Array.isArray(profile?.icp)
      ? profile.icp.slice(0, 6)
      : [];
  const proofPoints = Array.isArray(profile?.proofPoints)
    ? profile.proofPoints.slice(0, 4)
    : [];
  const artifactPreviews = Object.entries(artifacts)
    .slice(0, 8)
    .map(([type, artifact]) => `${type}: ${summarizeArtifactData(artifact?.data).slice(0, 220)}`)
    .filter(Boolean);

  const salesContext = [
    `Company: ${company?.companyName || "the company"}`,
    company?.websiteUrl ? `Website: ${company.websiteUrl}` : "",
    positioning ? `Positioning: ${positioning}` : "",
    offerings.length ? `Offerings: ${offerings.join("; ")}` : "",
    audiences.length ? `Target audiences: ${audiences.join("; ")}` : "",
    proofPoints.length ? `Proof points: ${proofPoints.join("; ")}` : "",
    artifactPreviews.length ? `Relevant company intelligence:\n- ${artifactPreviews.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    companyName: company?.companyName || "the company",
    salesContext: salesContext || "No company-specific context is available for this call.",
  };
}

async function scoreVoicebotCall({
  companyId,
  companyName,
  leadId,
  leadName,
  callSid,
  turns = [],
}) {
  const transcriptText = turns.map((turn) => `${turn.role}: ${turn.text}`).join("\n");
  const heuristic = summarizeLeadQualification(turns);
  const salesContext = await buildCompanySalesContext(companyId);

  const fallback = {
    callSid,
    leadId: leadId || null,
    leadName: leadName || null,
    companyId: companyId || null,
    companyName: companyName || salesContext.companyName,
    status: heuristic.heuristicScore >= 60 ? "qualified" : heuristic.heuristicScore >= 35 ? "nurture" : "disqualified",
    fitScore: heuristic.heuristicScore,
    intentScore: heuristic.heuristicScore,
    urgencyScore: heuristic.detectedSignals.includes("timing") ? 70 : 35,
    authorityScore: heuristic.detectedSignals.includes("authority") ? 70 : 35,
    budgetScore: heuristic.detectedSignals.includes("budget") ? 65 : 30,
    leadTemperature: heuristic.heuristicScore >= 70 ? "hot" : heuristic.heuristicScore >= 40 ? "warm" : "cold",
    detectedSignals: heuristic.detectedSignals,
    objections: [],
    nextAction: heuristic.heuristicScore >= 60 ? "Route to human closer for follow-up" : "Continue nurture and gather more qualification data",
    humanCloserBrief: "Outbound salesbot call completed. Review transcript and follow up based on qualification signals.",
    recommendedCrmUpdate: {
      lifecycleStage: heuristic.heuristicScore >= 60 ? "sales_qualified_lead" : "marketing_qualified_lead",
      ownerQueue: heuristic.heuristicScore >= 60 ? "human_closers" : "nurture_queue",
      disposition: heuristic.heuristicScore >= 60 ? "follow_up_required" : "needs_more_qualification",
    },
  };

  if (!transcriptText.trim()) return fallback;

  try {
    const completion = await groq.chat.completions.create({
      model: VOICEBOT_DIALOGUE_MODELS[0] || "groq/compound",
      messages: [
        {
          role: "system",
          content: `You score outbound sales qualification calls for ${salesContext.companyName}.
Return valid JSON only.

Decide whether the lead should be handed to a human closer.
Use the transcript and company context. Be conservative about qualification.

JSON schema:
{
  "status": "qualified" | "nurture" | "disqualified",
  "fitScore": number,
  "intentScore": number,
  "urgencyScore": number,
  "authorityScore": number,
  "budgetScore": number,
  "leadTemperature": "hot" | "warm" | "cold",
  "detectedSignals": ["string"],
  "objections": ["string"],
  "nextAction": "string",
  "humanCloserBrief": "string",
  "recommendedCrmUpdate": {
    "lifecycleStage": "string",
    "ownerQueue": "string",
    "disposition": "string"
  }
}`,
        },
        {
          role: "user",
          content: `Company sales context:\n${salesContext.salesContext}\n\nLead: ${leadName || "Unknown"} (${leadId || "no lead id"})\nCall SID: ${callSid}\n\nTranscript:\n${transcriptText}`,
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 600,
      response_format: { type: "json_object" },
    });

    const parsed = extractJsonCandidate(completion.choices[0]?.message?.content || "");
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    return {
      ...fallback,
      ...parsed,
      callSid,
      leadId: leadId || null,
      leadName: leadName || null,
      companyId: companyId || null,
      companyName: companyName || salesContext.companyName,
      detectedSignals: Array.isArray(parsed.detectedSignals)
        ? parsed.detectedSignals.map((item) => normalizeShortText(item, "")).filter(Boolean)
        : fallback.detectedSignals,
      objections: Array.isArray(parsed.objections)
        ? parsed.objections.map((item) => normalizeShortText(item, "")).filter(Boolean)
        : [],
    };
  } catch {
    return fallback;
  }
}

async function persistVoicebotCallRecord(record) {
  const safeCallSid = normalizeShortText(record?.callSid, randomUUID());
  const dir = voicebotCallsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    voicebotCallPath(safeCallSid),
    JSON.stringify(
      {
        ...record,
        persistedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function splitLeadName(fullName = "") {
  const parts = normalizeShortText(fullName, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return { firstName: "Lead", lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function hubspotRequest(path, options = {}) {
  if (!HUBSPOT_ACCESS_TOKEN) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is not configured");
  }

  const response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const raw = await response.text().catch(() => "");
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(
      json?.message || raw || `HubSpot request failed with ${response.status}`,
    );
  }

  return json;
}

async function upsertHubspotContactForVoiceCall({
  phoneNumber,
  leadName,
  companyName,
  websiteUrl,
}) {
  const { firstName, lastName } = splitLeadName(leadName);
  const normalizedPhone = normalizeShortText(phoneNumber, "");
  let existingContactId = null;

  if (normalizedPhone) {
    try {
      const search = await hubspotRequest("/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "phone",
                  operator: "EQ",
                  value: normalizedPhone,
                },
              ],
            },
          ],
          properties: ["firstname", "lastname", "phone", "company", "website"],
          limit: 1,
        }),
      });
      existingContactId = search?.results?.[0]?.id || null;
    } catch (error) {
      console.warn("[HubSpot] contact search failed:", String(error));
    }
  }

  const properties = {
    firstname: firstName,
    lastname: lastName || undefined,
    phone: normalizedPhone || undefined,
    company: companyName || undefined,
    website: websiteUrl || undefined,
  };

  if (existingContactId) {
    return hubspotRequest(`/crm/v3/objects/contacts/${existingContactId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }

  return hubspotRequest("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });
}

function buildHubspotVoicebotNote({
  companyName,
  phoneNumber,
  scorecard,
  turns = [],
}) {
  const transcript = turns
    .map((turn) => `${turn.role === "assistant" ? "Salesbot" : "Lead"}: ${turn.text}`)
    .join("\n");
  const detectedSignals = Array.isArray(scorecard?.detectedSignals)
    ? scorecard.detectedSignals.join(", ")
    : "";
  const objections = Array.isArray(scorecard?.objections)
    ? scorecard.objections.join(", ")
    : "";

  return [
    `Voicebot qualification call for ${companyName || "company"}`,
    phoneNumber ? `Lead phone: ${phoneNumber}` : "",
    `Status: ${scorecard?.status || "unknown"}`,
    `Temperature: ${scorecard?.leadTemperature || "unknown"}`,
    `Fit score: ${scorecard?.fitScore ?? "n/a"}`,
    `Intent score: ${scorecard?.intentScore ?? "n/a"}`,
    `Urgency score: ${scorecard?.urgencyScore ?? "n/a"}`,
    `Authority score: ${scorecard?.authorityScore ?? "n/a"}`,
    `Budget score: ${scorecard?.budgetScore ?? "n/a"}`,
    detectedSignals ? `Detected signals: ${detectedSignals}` : "",
    objections ? `Objections: ${objections}` : "",
    scorecard?.nextAction ? `Recommended next action: ${scorecard.nextAction}` : "",
    scorecard?.humanCloserBrief ? `Closer brief: ${scorecard.humanCloserBrief}` : "",
    transcript ? `Transcript:\n${transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function syncVoicebotCallToHubspot({
  companyId,
  leadName,
  leadPhone,
  scorecard,
  turns,
}) {
  if (!HUBSPOT_ACCESS_TOKEN) return null;
  const entry = companyId ? await ensureCompanyEntry(companyId) : null;
  const companyName = entry?.company?.companyName || "the company";
  const websiteUrl = entry?.company?.websiteUrl || "";

  const contact = await upsertHubspotContactForVoiceCall({
    phoneNumber: leadPhone,
    leadName,
    companyName,
    websiteUrl,
  });

  const note = await hubspotRequest("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: buildHubspotVoicebotNote({
          companyName,
          phoneNumber: leadPhone,
          scorecard,
          turns,
        }),
        hs_timestamp: new Date().toISOString(),
      },
      associations: contact?.id
        ? [
            {
              to: { id: String(contact.id) },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202,
                },
              ],
            },
          ]
        : [],
    }),
  });

  return {
    contactId: contact?.id || null,
    noteId: note?.id || null,
  };
}

async function getGoogleSheetsClient() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SHEETS_REFRESH_TOKEN;

  if (
    refreshToken &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  ) {
    const auth = new GoogleAuth({
      credentials: {
        type: "authorized_user",
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
      },
      scopes,
    });
    return auth.getClient();
  }

  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes,
    });
    return auth.getClient();
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new GoogleAuth({ scopes });
    return auth.getClient();
  }

  throw new Error("Google Sheets credentials are not configured");
}

async function ensureGoogleSheetExists(client, spreadsheetId, title) {
  const spreadsheet = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    method: "GET",
  });
  const existingTitles = new Set(
    (spreadsheet.data?.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean),
  );

  if (existingTitles.has(title)) return;

  await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: [
        {
          addSheet: {
            properties: { title },
          },
        },
      ],
    },
  });
}

function buildVoicebotSheetRow({
  companyName,
  companyId,
  callSid,
  leadId,
  leadName,
  leadPhone,
  leadEmail = "",
  scorecard,
  turns = [],
}) {
  const { firstName, lastName } = splitLeadName(leadName);
  return [
    new Date().toISOString(),
    companyName || "",
    companyId || "",
    callSid || "",
    leadId || "",
    firstName || "",
    lastName || "",
    leadName || "",
    leadPhone || "",
    leadEmail || "",
    scorecard?.status || "",
    scorecard?.leadTemperature || "",
    scorecard?.fitScore ?? "",
    scorecard?.intentScore ?? "",
    scorecard?.urgencyScore ?? "",
    scorecard?.authorityScore ?? "",
    scorecard?.budgetScore ?? "",
    Array.isArray(scorecard?.detectedSignals) ? scorecard.detectedSignals.join(", ") : "",
    Array.isArray(scorecard?.objections) ? scorecard.objections.join(", ") : "",
    scorecard?.nextAction || "",
    scorecard?.humanCloserBrief || "",
    turns.map((turn) => `${turn.role}: ${turn.text}`).join("\n"),
  ];
}

async function readGoogleSheetValues(client, spreadsheetId, sheetName, range = "A1:Z200") {
  const response = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!${range}`)}`,
    method: "GET",
  });
  return Array.isArray(response.data?.values) ? response.data.values : [];
}

async function resolveDefaultLeadFromGoogleSheets(client, spreadsheetId) {
  const values = await readGoogleSheetValues(client, spreadsheetId, "Leads");
  if (!values.length) return null;
  const headers = values[0].map((value) => String(value || "").trim().toLowerCase());
  const rows = values.slice(1);
  const getIndex = (name) => headers.indexOf(name);
  const firstNameIndex = getIndex("first_name");
  const lastNameIndex = getIndex("last_name");
  const leadNameIndex = getIndex("lead_name");
  const phoneIndex = getIndex("lead_phone");
  const emailIndex = getIndex("email_id");

  for (const row of rows) {
    const phone = String(row[phoneIndex] || "").trim();
    if (!phone) continue;
    const firstName = String(row[firstNameIndex] || "").trim();
    const lastName = String(row[lastNameIndex] || "").trim();
    const combinedName = String(row[leadNameIndex] || "").trim() || [firstName, lastName].filter(Boolean).join(" ").trim();
    return {
      leadName: combinedName,
      firstName,
      lastName,
      leadPhone: phone,
      leadEmail: String(row[emailIndex] || "").trim(),
    };
  }

  return null;
}

function mapFetchedLeadToSheetRow(lead = {}) {
  const leadName = String(lead.full_name || "").trim();
  const { firstName, lastName } = splitLeadName(leadName);
  const cityState = [lead.city, lead.state].filter(Boolean).join(", ");
  const qualificationNotes = [
    lead.designation ? `designation=${lead.designation}` : "",
    lead.seniority ? `seniority=${lead.seniority}` : "",
    lead.industry ? `industry=${lead.industry}` : "",
    cityState ? `location=${cityState}` : "",
    lead.quality != null ? `quality=${lead.quality}` : "",
    lead.signal_count != null ? `signals=${lead.signal_count}` : "",
    "source=leads_db",
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    new Date().toISOString(),
    String(lead.company || "").trim(),
    "",
    "",
    String(lead.lead_id || lead.phone_e164 || "").trim(),
    firstName,
    lastName,
    leadName,
    String(lead.phone_e164 || "").trim(),
    String(lead.email || "").trim(),
    "queued",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "pending_salesbot_call",
    qualificationNotes,
    "",
  ];
}

async function pullIcpLeadsToGoogleSheets(fetchPayload = {}) {
  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured");
  }

  const leadsResponse = await callLeadsDb("/fetch", {
    output_format: "json",
    ...fetchPayload,
  });
  const leads = Array.isArray(leadsResponse?.leads) ? leadsResponse.leads : [];
  const client = await getGoogleSheetsClient();
  const sheetName = "Leads";

  await ensureGoogleSheetExists(client, GOOGLE_SHEETS_SPREADSHEET_ID, sheetName);

  const existing = await readGoogleSheetValues(
    client,
    GOOGLE_SHEETS_SPREADSHEET_ID,
    sheetName,
    "A1:V5000",
  ).catch(() => []);
  const headers = Array.isArray(existing[0]) ? existing[0].map((value) => String(value || "").trim().toLowerCase()) : [];
  const phoneIndex = headers.indexOf("lead_phone");
  const existingPhones = new Set(
    existing
      .slice(1)
      .map((row) => String(row[phoneIndex >= 0 ? phoneIndex : 8] || "").trim())
      .filter(Boolean),
  );

  const rowsToAppend = [];
  let skippedDuplicates = 0;
  for (const lead of leads) {
    const phone = String(lead?.phone_e164 || "").trim();
    if (!phone) continue;
    if (existingPhones.has(phone)) {
      skippedDuplicates += 1;
      continue;
    }
    existingPhones.add(phone);
    rowsToAppend.push(mapFetchedLeadToSheetRow(lead));
  }

  if (rowsToAppend.length) {
    await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      method: "POST",
      data: { values: rowsToAppend },
    });
  }

  return {
    fetched: leads.length,
    appended: rowsToAppend.length,
    skippedDuplicates,
    tableUsed: leadsResponse?.table_used || null,
    sheetName,
  };
}

function mapLeadSheetRowsToQueue(values = []) {
  if (!Array.isArray(values) || values.length < 2) {
    return { leads: [], summary: { total: 0, queued: 0, qualified: 0, nurture: 0, disqualified: 0, handoffReady: 0 } };
  }

  const headers = values[0].map((value) => String(value || "").trim());
  const rows = values.slice(1);
  const leads = rows.map((row, index) => {
    const record = {};
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] ?? "";
    });
    return {
      id: String(record.call_sid || record.lead_id || record.lead_phone || `lead-${index + 1}`),
      timestamp: String(record.timestamp || ""),
      companyName: String(record.company_name || ""),
      companyId: String(record.company_id || ""),
      callSid: String(record.call_sid || ""),
      leadId: String(record.lead_id || ""),
      firstName: String(record.first_name || ""),
      lastName: String(record.last_name || ""),
      leadName: String(record.lead_name || "").trim() || [record.first_name, record.last_name].filter(Boolean).join(" ").trim(),
      leadPhone: String(record.lead_phone || ""),
      emailId: String(record.email_id || ""),
      qualificationStatus: String(record.qualification_status || ""),
      leadTemperature: String(record.lead_temperature || ""),
      fitScore: Number(record.fit_score || 0) || null,
      intentScore: Number(record.intent_score || 0) || null,
      urgencyScore: Number(record.urgency_score || 0) || null,
      authorityScore: Number(record.authority_score || 0) || null,
      budgetScore: Number(record.budget_score || 0) || null,
      detectedSignals: String(record.detected_signals || ""),
      objections: String(record.objections || ""),
      nextAction: String(record.next_action || ""),
      closerBrief: String(record.closer_brief || ""),
      transcript: String(record.transcript || ""),
    };
  });

  const summary = leads.reduce(
    (acc, lead) => {
      acc.total += 1;
      const status = String(lead.qualificationStatus || "").toLowerCase();
      if (status === "queued") acc.queued += 1;
      if (status === "qualified") acc.qualified += 1;
      if (status === "nurture") acc.nurture += 1;
      if (status === "disqualified") acc.disqualified += 1;
      if (lead.nextAction === "pending_salesbot_call" || status === "qualified") acc.handoffReady += 1;
      return acc;
    },
    { total: 0, queued: 0, qualified: 0, nurture: 0, disqualified: 0, handoffReady: 0 },
  );

  return { leads, summary };
}

async function syncVoicebotCallToGoogleSheets({
  companyId,
  leadId,
  leadName,
  leadPhone,
  leadEmail = "",
  callSid,
  scorecard,
  turns,
}) {
  if (!GOOGLE_SHEETS_SPREADSHEET_ID) return null;
  const client = await getGoogleSheetsClient();
  const entry = companyId ? await ensureCompanyEntry(companyId) : null;
  const companyName = entry?.company?.companyName || "Unknown Company";
  const sheetName = "Leads";

  await ensureGoogleSheetExists(client, GOOGLE_SHEETS_SPREADSHEET_ID, sheetName);

  const header = [
    "timestamp",
    "company_name",
    "company_id",
    "call_sid",
    "lead_id",
    "first_name",
    "last_name",
    "lead_name",
    "lead_phone",
    "email_id",
    "qualification_status",
    "lead_temperature",
    "fit_score",
    "intent_score",
    "urgency_score",
    "authority_score",
    "budget_score",
    "detected_signals",
    "objections",
    "next_action",
    "closer_brief",
    "transcript",
  ];

  const row = buildVoicebotSheetRow({
    companyName,
    companyId,
    callSid,
    leadId,
    leadName,
    leadPhone,
    leadEmail,
    scorecard,
    turns,
  });

  let hasExistingRows = false;
  try {
    const existing = await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:A2`,
      method: "GET",
    });
    hasExistingRows = Array.isArray(existing.data?.values) && existing.data.values.length > 0;
  } catch {
    hasExistingRows = false;
  }

  await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: {
      values: hasExistingRows ? [row] : [header, row],
    },
  });

  return {
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    sheetName,
    rowLogged: true,
  };
}

async function callLeadsDb(path, payload, method = "POST") {
  if (!LEADS_DB_BASE_URL || !LEADS_DB_BEARER_TOKEN) {
    throw new Error("Leads database env is not configured");
  }

  const response = await fetch(`${LEADS_DB_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${LEADS_DB_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(payload || {}) }),
  });

  const raw = await response.text().catch(() => "");
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(
      json?.message || raw || `Leads DB request failed with ${response.status}`,
    );
  }

  return json;
}

async function synthesizeSpeechWithSarvam({
  text,
  language = "en",
  gender = "female",
}) {
  if (!process.env.SARVAM_API_KEY) {
    throw new Error("SARVAM_API_KEY is not configured");
  }

  const response = await fetch(SARVAM_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: String(text || "").trim(),
      target_language_code: pickSarvamLanguageCode(language),
      speaker: pickSarvamSpeaker(language, gender),
      model: SARVAM_TTS_MODEL,
      pace: TWILIO_TTS_PACE,
      speech_sample_rate: 22050,
      output_audio_codec: "mp3",
      enable_preprocessing: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Sarvam TTS failed with ${response.status}${details ? `: ${details}` : ""}`,
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return {
    provider: "sarvam",
    model: SARVAM_TTS_MODEL,
    speaker: pickSarvamSpeaker(language, gender),
    mimeType: "audio/mpeg",
    audioBase64: audioBuffer.toString("base64"),
  };
}

async function transcribeSpeechWithSarvam({
  audioBase64,
  mimeType = "audio/webm",
  language = "en",
}) {
  if (!process.env.SARVAM_API_KEY) {
    throw new Error("SARVAM_API_KEY is not configured");
  }

  const audioBuffer = Buffer.from(String(audioBase64 || ""), "base64");
  if (!audioBuffer.length) {
    throw new Error("No audio payload received");
  }

  const form = new FormData();
  form.set(
    "file",
    new Blob([audioBuffer], { type: mimeType }),
    `utterance.${mimeTypeToExtension(mimeType)}`,
  );
  form.set("model", SARVAM_STT_MODEL);
  form.set("mode", "transcribe");
  form.set("language_code", pickSarvamLanguageCode(language));

  const response = await fetch(SARVAM_STT_ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY,
    },
    body: form,
  });

  const rawText = await response.text().catch(() => "");
  let json = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(
      json?.error ||
        json?.message ||
        rawText ||
        `Sarvam STT failed with ${response.status}`,
    );
  }

  return {
    provider: "sarvam",
    model: SARVAM_STT_MODEL,
    transcript: String(json?.transcript || "").trim(),
    languageCode: json?.language_code || pickSarvamLanguageCode(language),
    raw: json,
  };
}

async function runVoicebotDialogue({
  sessionId,
  userText,
  language = "en",
  interruptionMode = false,
  companyId = "",
  leadName = "",
}) {
  const session = getVoicebotSession(sessionId);
  const [genericCitations, companyCitations, companySalesContext] = await Promise.all([
    searchVoicebotKnowledgeBase(userText, 2),
    searchCompanySalesContext(companyId, userText, 4),
    buildCompanySalesContext(companyId),
  ]);
  const citations = genericCitations.concat(companyCitations);
  const kbContext = citations.length
    ? citations
        .map(
          (item) =>
            `SOURCE: ${item.fileName}\nSNIPPET: ${String(item.snippet || "").slice(0, 500)}`,
        )
        .join("\n\n")
    : "No directly relevant snippets matched this turn.";

  const systemMessage = `You are an outbound AI sales development representative calling on behalf of ${companySalesContext.companyName}.
You are qualifying a lead over a live phone call so a human closer can take over only when the opportunity is real.
Answer conversationally and briefly, suitable for spoken delivery.

Rules:
- Keep responses to 2-4 short sentences.
- You are on a phone call right now. Never say you did not call, never say this is only a text chat, and never break call context.
- You represent ${companySalesContext.companyName}. Speak in first person plural when describing the company ("we", "our"), not as a detached assistant.
- Do not repeat greetings after the opening unless the caller explicitly asks if you can hear them.
- Your main goal is qualification, not support. Progress toward fit, need, urgency, authority, budget comfort, and next step.
- Ask at most one qualification question at a time.
- If the lead asks about company-specific details, use the company context and snippets when available.
- If supporting snippets are available, ground the answer in them first instead of saying information is unavailable.
- Do not claim certainty when the knowledge base does not support it.
- If the lead is clearly not a fit, close politely and avoid forcing the conversation.
- If the lead sounds qualified, steer toward a concrete next step for a human closer.
- If language is Hindi, answer in Hindi. Otherwise answer in Indian English.
- End with one natural next-step question only when it helps move the conversation forward.
${interruptionMode ? "- The caller interrupted the previous reply. Respond extremely quickly: 1-2 short spoken sentences, ideally under 20 words total.\n- Do not restate context unless absolutely necessary." : ""}

Company sales context:
${companySalesContext.salesContext}

Knowledge base context:
${kbContext}`;

  const messageHistory = trimSessionHistory([
    ...session.messages,
    { role: "user", content: String(userText || "").trim() },
  ]);

  let lastError = null;
  for (const model of VOICEBOT_DIALOGUE_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemMessage },
          ...messageHistory,
          {
            role: "user",
            content: `Language: ${language === "hi" ? "Hindi" : "English"}\nLead name: ${leadName || "Unknown"}\nUser message: ${String(userText || "").trim()}`,
          },
        ],
        temperature: 0.4,
        ...(model === "groq/compound"
          ? {
              max_completion_tokens: 500,
            }
          : {
              max_tokens: interruptionMode ? 120 : 500,
            }),
      });

      const assistantText = String(
        completion.choices[0]?.message?.content || "",
      ).trim();
      session.messages = trimSessionHistory([
        ...messageHistory,
        { role: "assistant", content: assistantText },
      ]);
      voicebotSessions.set(session.id, session);
      return { sessionId: session.id, assistantText, citations };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Voicebot dialogue failed");
}

function encodeTwilioBasicAuth() {
  return `Basic ${Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID || ""}:${process.env.TWILIO_AUTH_TOKEN || ""}`,
  ).toString("base64")}`;
}

function getTwilioWebhookBaseUrl() {
  return String(
    process.env.TWILIO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "",
  ).replace(/\/$/, "");
}

function getTwilioMediaStreamUrl() {
  if (process.env.TWILIO_MEDIA_STREAM_WSS_URL) {
    return process.env.TWILIO_MEDIA_STREAM_WSS_URL;
  }
  const baseUrl = getTwilioWebhookBaseUrl();
  if (!baseUrl) return "";
  return baseUrl
    .replace(/^http:\/\//i, "ws://")
      .replace(/^https:\/\//i, "wss://")
    .concat("/api/voicebot/twilio/media-stream");
}

function createWavBufferFromPcm16(int16Samples, sampleRate = 8000, channels = 1) {
  const pcmBuffer = Buffer.from(
    int16Samples.buffer,
    int16Samples.byteOffset,
    int16Samples.byteLength,
  );
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function decodeMuLawSample(muLawByte) {
  const MULAW_BIAS = 0x84;
  let value = ~muLawByte & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function encodeMuLawSample(sample) {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  let pcm = Math.max(-32124, Math.min(32124, Number(sample) || 0));
  let sign = pcm < 0 ? 0x80 : 0;
  if (sign) pcm = -pcm;
  pcm += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }
  let mantissa = (pcm >> (exponent + 3)) & 0x0f;
  let muLaw = ~(sign | (exponent << 4) | mantissa);
  return muLaw & 0xff;
}

function decodeTwilioMediaPayload(payload) {
  const bytes = Buffer.from(String(payload || ""), "base64");
  const pcm = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    pcm[i] = decodeMuLawSample(bytes[i]);
  }
  return pcm;
}

function computeRms(int16Samples) {
  if (!int16Samples?.length) return 0;
  let sum = 0;
  for (let i = 0; i < int16Samples.length; i += 1) {
    const sample = int16Samples[i];
    sum += sample * sample;
  }
  return Math.sqrt(sum / int16Samples.length);
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function convertMp3Base64ToTwilioMediaChunks(audioBase64) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}.mp3`);
  const outputPath = join(tmpdir(), `${id}.mulaw`);

  try {
    await writeFile(inputPath, Buffer.from(String(audioBase64 || ""), "base64"));
    await runFfmpeg([
      "-i",
      inputPath,
      "-ar",
      "8000",
      "-ac",
      "1",
      "-f",
      "mulaw",
      outputPath,
    ]);
    const muLaw = await readFile(outputPath);
    const chunks = [];
    const chunkSize = 160;
    for (let offset = 0; offset < muLaw.length; offset += chunkSize) {
      chunks.push(muLaw.subarray(offset, offset + chunkSize).toString("base64"));
    }
    return chunks;
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}

async function pushTwilioAudio(ws, streamSid, audioBase64) {
  const chunks = await convertMp3Base64ToTwilioMediaChunks(audioBase64);
  for (const payload of chunks) {
    ws.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload },
      }),
    );
  }
  console.log(`[TwilioMediaStream] queued ${chunks.length} outbound audio chunks`, {
    streamSid,
  });
  ws.send(
    JSON.stringify({
      event: "mark",
      streamSid,
      mark: { name: `done-${Date.now()}` },
    }),
  );
}

async function generateTwilioAssistantReply({
  ws,
  session,
  utterance,
}) {
  if (!utterance?.length) return;
  if (session.processingReply) return;
  session.processingReply = true;

  try {
    const wavBuffer = createWavBufferFromPcm16(utterance, 8000, 1);
    console.log("[TwilioMediaStream] finalizing user utterance", {
      streamSid: session.streamSid,
      pcmSamples: utterance.length,
    });
    const stt = await transcribeSpeechWithSarvam({
      audioBase64: wavBuffer.toString("base64"),
      mimeType: "audio/wav",
      language: session.language,
    });
    const transcript = String(stt?.transcript || "").trim();
    console.log("[TwilioMediaStream] transcript ready", {
      streamSid: session.streamSid,
      transcript,
    });
    if (!transcript) return;
    if (utterance.length < TWILIO_MIN_UTTERANCE_SAMPLES && transcript.length < 8) {
      console.log("[TwilioMediaStream] dropped micro-utterance", {
        streamSid: session.streamSid,
        transcript,
        pcmSamples: utterance.length,
      });
      return;
    }
    if (session.lastTranscript && transcript.toLowerCase() === session.lastTranscript.toLowerCase()) {
      console.log("[TwilioMediaStream] dropped duplicate transcript", {
        streamSid: session.streamSid,
        transcript,
      });
      return;
    }
    session.turns.push({
      role: "lead",
      text: transcript,
      createdAt: new Date().toISOString(),
      interruptedBot: Boolean(session.interruptedTurn),
    });
    if (session.turns.length > TWILIO_MAX_CONVERSATION_TURNS) {
      session.turns = session.turns.slice(-TWILIO_MAX_CONVERSATION_TURNS);
    }

    const dialogue = await runVoicebotDialogue({
      sessionId: session.dialogueSessionId,
      userText: transcript,
      language: session.language,
      interruptionMode: Boolean(session.interruptedTurn),
      companyId: session.companyId,
      leadName: session.leadName,
    });
    session.dialogueSessionId = dialogue.sessionId;
    session.lastTranscript = transcript;
    session.lastAssistantText = dialogue.assistantText;
    session.interruptedTurn = false;
    session.turns.push({
      role: "assistant",
      text: dialogue.assistantText,
      createdAt: new Date().toISOString(),
    });
    if (session.turns.length > TWILIO_MAX_CONVERSATION_TURNS) {
      session.turns = session.turns.slice(-TWILIO_MAX_CONVERSATION_TURNS);
    }
    console.log("[TwilioMediaStream] assistant reply ready", {
      streamSid: session.streamSid,
      assistantText: dialogue.assistantText,
    });

    const speech = await synthesizeSpeechWithSarvam({
      text: dialogue.assistantText,
      language: session.language,
      gender: session.gender,
    });
    session.assistantSpeaking = true;
    await pushTwilioAudio(ws, session.streamSid, speech.audioBase64);
  } finally {
    session.processingReply = false;
  }
}

async function readKnowledgeBaseManifest(companyId) {
  try {
    const raw = await readFile(companyKbManifestPath(companyId), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeKnowledgeBaseManifest(companyId, entries) {
  const dir = companyKbDir(companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    companyKbManifestPath(companyId),
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

async function readCompanyAssetManifest(companyId) {
  try {
    const raw = await readFile(companyAssetManifestPath(companyId), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCompanyAssetManifest(companyId, entries) {
  const dir = companyKbDir(companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    companyAssetManifestPath(companyId),
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

async function readCompanyActionStatus(companyId) {
  try {
    const raw = await readFile(companyActionStatusPath(companyId), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCompanyActionStatus(companyId, value) {
  const dir = companyKbDir(companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    companyActionStatusPath(companyId),
    JSON.stringify(value, null, 2),
    "utf-8",
  );
}

async function setCompanyActionStatus(companyId, pageId, patch = {}) {
  if (!companyId || !pageId) return null;
  const current = await readCompanyActionStatus(companyId);
  const previous =
    current[pageId] && typeof current[pageId] === "object" ? current[pageId] : {};
  const next = {
    ...previous,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  current[pageId] = next;
  await writeCompanyActionStatus(companyId, current);
  return next;
}

async function syncCompanyActionStatusFromDeployment(deployment, nextStatus, options = {}) {
  const companyId =
    typeof deployment?.companyId === "string" && deployment.companyId.trim()
      ? deployment.companyId.trim()
      : null;
  const pageId =
    typeof deployment?.sectionId === "string" && deployment.sectionId.trim()
      ? deployment.sectionId.trim()
      : null;

  if (!companyId || !pageId || deployment?.source !== "company-intelligence") {
    return null;
  }

  const now = new Date().toISOString();
  const patch = {
    status: nextStatus,
    mode: deployment?.scheduleMode || null,
    agentName: deployment?.agentName || null,
  };

  if (nextStatus === "completed") {
    patch.lastRunAt = now;
    patch.lastOutcome = "completed";
    patch.error = null;
  } else if (nextStatus === "failed") {
    patch.lastRunAt = now;
    patch.lastOutcome = "failed";
    patch.error = options?.error ? String(options.error).slice(0, 500) : null;
  } else if (nextStatus === "running") {
    patch.error = null;
  }

  return setCompanyActionStatus(companyId, pageId, patch);
}

async function createAgentNotification(notification) {
  if (!supabaseAdminClient || !notification?.user_id) return null;
  try {
    const { data, error } = await supabaseAdminClient
      .from("agent_notifications")
      .insert(notification)
      .select()
      .single();
    if (error) {
      console.warn("[AgentNotification] insert failed:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("[AgentNotification] insert failed:", err.message);
    return null;
  }
}

async function readSavedAgentContext(userId) {
  if (!userId) {
    return {
      userId: "",
      company: "",
      industry: "",
      icp: "",
      competitors: "",
      campaigns: "",
      keywords: "",
      goals: "",
    };
  }

  try {
    const raw = await readFile(join(CTX_DIR, `${userId}.md`), "utf-8");
    const matchField = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = raw.match(new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.*)`));
      const value = match?.[1]?.trim() || "";
      return value === "—" ? "" : value;
    };

    return {
      userId,
      company: matchField("Company"),
      industry: matchField("Industry"),
      icp: matchField("Target ICP"),
      competitors: matchField("Top Competitors"),
      campaigns: matchField("Current Campaigns"),
      keywords: matchField("Active Keywords"),
      goals: matchField("Key Goals this Quarter"),
    };
  } catch {
    return {
      userId,
      company: "",
      industry: "",
      icp: "",
      competitors: "",
      campaigns: "",
      keywords: "",
      goals: "",
    };
  }
}

function summarizeArtifactData(data) {
  const collected = [];
  const visit = (value, depth = 0) => {
    if (depth > 2 || collected.length >= 6) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) collected.push(trimmed.slice(0, 180));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach((item) => visit(item, depth + 1));
    }
  };
  visit(data);
  return collected.slice(0, 3);
}

async function assembleMarketingContext({ userId = "", workspaceId = "", companyId = "" } = {}) {
  const agentContext = await readSavedAgentContext(userId);
  let workspace = null;
  let company = null;
  let companyArtifacts = {};
  let knowledgeBase = [];

  if (workspaceId && supabase) {
    try {
      const { data } = await supabase
        .from("workspaces")
        .select("id,name,website_url")
        .eq("id", workspaceId)
        .single();
      workspace = data || null;
    } catch {
      workspace = null;
    }
  }

  if (companyId) {
    const entry = await ensureCompanyEntry(companyId);
    if (entry?.company) {
      company = entry.company;
      companyArtifacts = entry.artifacts || {};
      knowledgeBase = await readKnowledgeBaseManifest(companyId);
    }
  }

  const artifactSummaries = Object.entries(companyArtifacts || {})
    .map(([type, artifact]) => ({
      type,
      updatedAt: artifact?.updatedAt || null,
      preview: summarizeArtifactData(artifact?.data),
    }))
    .filter((item) => item.preview.length);

  return {
    userId: userId || null,
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          websiteUrl: workspace.website_url || null,
        }
      : null,
    agentContext,
    company: company
      ? {
          id: company.id,
          companyName: company.companyName,
          websiteUrl: company.websiteUrl || null,
          profile: company.profile || {},
        }
      : null,
    artifacts: artifactSummaries,
    knowledgeBase: knowledgeBase.map((file) => ({
      id: file.id,
      category: file.category,
      name: file.name,
      mime: file.mime,
      size: file.size,
      createdAt: file.createdAt,
    })),
  };
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

  res.json(await readSavedAgentContext(userId));
});

app.get("/api/marketing-context", async (req, res) => {
  try {
    const context = await assembleMarketingContext({
      userId: String(req.query.userId || "").trim(),
      workspaceId: String(req.query.workspaceId || "").trim(),
      companyId: String(req.query.companyId || "").trim(),
    });
    res.json(context);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/voicebot/kb/files", async (_req, res) => {
  try {
    const files = await readVoicebotKbManifest();
    res.json({
      files: files
        .map((file) => ({
          id: file.id,
          name: file.name,
          mime: file.mime,
          size: file.size,
          createdAt: file.createdAt,
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/voicebot/kb/upload", async (req, res) => {
  const { files } = req.body || {};
  if (!Array.isArray(files) || !files.length) {
    return res.status(400).json({ error: "files array is required" });
  }

  try {
    const dir = voicebotKbDir();
    const existing = await readVoicebotKbManifest();
    const created = [];
    const rejected = [];
    await mkdir(dir, { recursive: true });

    for (const file of files) {
      const name = sanitizeKnowledgeBaseFilename(file?.name || "file.txt");
      const mime = String(file?.mime || "text/plain");
      const base64 = String(file?.base64 || "");
      const size = Number(file?.size) || 0;
      if (!base64) {
        rejected.push({ name, reason: "Missing base64 payload" });
        continue;
      }

      const id = randomUUID();
      const filePath = join(dir, `${id}-${name}`);
      await writeFile(filePath, Buffer.from(base64, "base64"));
      created.push({
        id,
        name,
        mime,
        size,
        createdAt: new Date().toISOString(),
        path: filePath,
      });
    }

    await writeVoicebotKbManifest([...created, ...existing]);
    res.json({
      files: created.map((file) => ({
        id: file.id,
        name: file.name,
        mime: file.mime,
        size: file.size,
        createdAt: file.createdAt,
      })),
      rejected,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/api/voicebot/kb/files/:id", async (req, res) => {
  try {
    const files = await readVoicebotKbManifest();
    const target = files.find((file) => file.id === req.params.id);
    if (!target) return res.status(404).json({ error: "File not found" });
    const remaining = files.filter((file) => file.id !== req.params.id);
    if (target.path) {
      try {
        await unlink(target.path);
      } catch {
        // ignore
      }
    }
    await writeVoicebotKbManifest(remaining);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/voicebot/kb/search", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  const limit = Math.min(Math.max(Number(req.body?.limit) || 6, 1), 10);
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const results = await searchVoicebotKnowledgeBase(query, limit);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/voicebot/stt", async (req, res) => {
  const { audioBase64, mimeType, language } = req.body || {};
  if (!audioBase64) {
    return res.status(400).json({ error: "audioBase64 is required" });
  }

  try {
    const transcript = await transcribeSpeechWithSarvam({
      audioBase64,
      mimeType: String(mimeType || "audio/webm"),
      language: language === "hi" ? "hi" : "en",
    });
    res.json(transcript);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/voicebot/tts", async (req, res) => {
  const { text, language, gender } = req.body || {};
  if (!String(text || "").trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const result = await synthesizeSpeechWithSarvam({
      text,
      language: language === "hi" ? "hi" : "en",
      gender: gender === "male" ? "male" : "female",
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/video-gen/generate-audio", async (req, res) => {
  const { text, language, gender } = req.body || {};
  if (!String(text || "").trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const result = await synthesizeSpeechWithSarvam({
      text,
      language: language === "hi" ? "hi" : "en",
      gender: gender === "male" ? "male" : "female",
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/voicebot/dialogue", async (req, res) => {
  const { sessionId, userText, language } = req.body || {};
  if (!String(userText || "").trim()) {
    return res.status(400).json({ error: "userText is required" });
  }

  try {
    const result = await runVoicebotDialogue({
      sessionId,
      userText,
      language: language === "hi" ? "hi" : "en",
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/voicebot/livekit/config", async (_req, res) => {
  const configured = Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
  res.json({
    configured,
    livekitUrl: LIVEKIT_URL || null,
    providers: {
      stt: { provider: "sarvam", configured: Boolean(process.env.SARVAM_API_KEY) },
      tts: { provider: "sarvam", configured: Boolean(process.env.SARVAM_API_KEY) },
      llm: { provider: "openai", configured: Boolean(process.env.OPENAI_API_KEY) },
    },
    agentName: LIVEKIT_AGENT_NAME,
  });
});

app.post("/api/voicebot/livekit/token", async (req, res) => {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(400).json({ error: "LiveKit env is not configured" });
  }

  const roomName = String(req.body?.roomName || "").trim();
  const participantName = String(req.body?.participantName || "User").trim() || "User";
  const identity =
    String(req.body?.identity || "").trim() ||
    `voice-${participantName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  if (!roomName) {
    return res.status(400).json({ error: "roomName is required" });
  }

  try {
    const roomClient = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    );
    await roomClient.createRoom({ name: roomName }).catch(() => null);

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: participantName,
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    res.json({
      livekitUrl: LIVEKIT_URL,
      roomName,
      identity,
      participantName,
      token: await token.toJwt(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/voicebot/livekit/dispatch", async (req, res) => {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(400).json({ error: "LiveKit env is not configured" });
  }

  const roomName = String(req.body?.roomName || "").trim();
  if (!roomName) {
    return res.status(400).json({ error: "roomName is required" });
  }

  try {
    const dispatchClient = new AgentDispatchClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    );
    const dispatch = await dispatchClient.createDispatch(roomName, LIVEKIT_AGENT_NAME, {
      metadata: JSON.stringify({
        language: req.body?.language === "hi" ? "hi" : "en",
        gender: req.body?.gender === "male" ? "male" : "female",
      }),
    });

    res.json({
      ok: true,
      dispatchId: dispatch?.id || null,
      roomName,
      agentName: LIVEKIT_AGENT_NAME,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/voicebot/twilio/config", (_req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || "";
  const googleSheetsConnected = Boolean(
    GOOGLE_SHEETS_SPREADSHEET_ID &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CREDENTIALS_JSON ||
        process.env.GOOGLE_REFRESH_TOKEN ||
        process.env.GOOGLE_SHEETS_REFRESH_TOKEN),
  );
  res.json({
    configured: Boolean(
      accountSid && authToken && phoneNumber && getTwilioMediaStreamUrl(),
    ),
    accountSidPresent: Boolean(accountSid),
    authTokenPresent: Boolean(authToken),
    phoneNumber: phoneNumber || null,
    publicBaseUrl: getTwilioWebhookBaseUrl() || null,
    mediaStreamUrl: getTwilioMediaStreamUrl() || null,
    googleSheetsConnected,
  });
});

app.post("/api/voicebot/twilio/calls", async (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || "";
  const defaultStatusCallback =
    process.env.TWILIO_STATUS_CALLBACK_URL || "";
  const defaultGreeting =
    process.env.TWILIO_OUTBOUND_GREETING || TWILIO_OUTBOUND_GREETING;

  if (!accountSid || !authToken || !phoneNumber) {
    return res.status(400).json({ error: "Twilio env is not configured" });
  }
  if (!getTwilioWebhookBaseUrl()) {
    return res
      .status(400)
      .json({ error: "TWILIO_PUBLIC_BASE_URL or PUBLIC_BASE_URL is required" });
  }
  if (!getTwilioMediaStreamUrl()) {
    return res
      .status(400)
      .json({ error: "TWILIO_MEDIA_STREAM_WSS_URL or public base URL is required" });
  }

  const {
    to,
    companyId = "",
    campaignId = "",
    leadId = "",
    leadName = "",
    leadPhone = "",
    leadEmail = "",
    language = "en",
    gender = "female",
    openingLine = defaultGreeting,
  } = req.body || {};

  try {
    const client = GOOGLE_SHEETS_SPREADSHEET_ID ? await getGoogleSheetsClient().catch(() => null) : null;
    const fallbackLead = !String(to || "").trim() && client
      ? await resolveDefaultLeadFromGoogleSheets(client, GOOGLE_SHEETS_SPREADSHEET_ID).catch(() => null)
      : null;
    const targetPhone = String(to || fallbackLead?.leadPhone || "").trim();
    const resolvedLeadPhone = String(leadPhone || fallbackLead?.leadPhone || targetPhone).trim();
    const resolvedLeadName = String(leadName || fallbackLead?.leadName || "").trim();
    const resolvedLeadEmail = String(leadEmail || fallbackLead?.leadEmail || "").trim();

    if (!targetPhone) {
      return res.status(400).json({ error: "to is required" });
    }

    const twimlUrl = new URL(
      "/api/voicebot/twilio/twiml",
      `${getTwilioWebhookBaseUrl()}/`,
    );
    twimlUrl.searchParams.set("companyId", String(companyId || ""));
    twimlUrl.searchParams.set("campaignId", String(campaignId || ""));
    twimlUrl.searchParams.set("leadId", String(leadId || ""));
    twimlUrl.searchParams.set("leadName", resolvedLeadName);
    twimlUrl.searchParams.set("leadPhone", resolvedLeadPhone);
    twimlUrl.searchParams.set("leadEmail", resolvedLeadEmail);
    twimlUrl.searchParams.set("language", language === "hi" ? "hi" : "en");
    twimlUrl.searchParams.set("gender", gender === "male" ? "male" : "female");
    twimlUrl.searchParams.set("openingLine", String(openingLine || TWILIO_OUTBOUND_GREETING));

    const statusCallbackUrl = new URL(
      "/api/voicebot/twilio/status",
      `${getTwilioWebhookBaseUrl()}/`,
    );

    const form = new URLSearchParams({
      To: targetPhone,
      From: phoneNumber,
      Url: twimlUrl.toString(),
      StatusCallback: defaultStatusCallback || statusCallbackUrl.toString(),
      StatusCallbackMethod: "POST",
      StatusCallbackEvent: ["initiated", "ringing", "answered", "completed"].join(" "),
      MachineDetection: "Enable",
      AsyncAmd: "true",
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          authorization: encodeTwilioBasicAuth(),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(response.status).json({
        error:
          json?.message || json?.error || `Twilio call creation failed with ${response.status}`,
        details: json,
      });
    }

    res.status(201).json({
      sid: json?.sid || null,
      status: json?.status || null,
      to: json?.to || targetPhone,
      from: json?.from || phoneNumber,
      leadName: resolvedLeadName || null,
      leadPhone: resolvedLeadPhone || null,
      leadEmail: resolvedLeadEmail || null,
      twimlUrl: twimlUrl.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.all("/api/voicebot/twilio/twiml", (req, res) => {
  const source = req.method === "POST" ? req.body || {} : req.query || {};
  const defaultGreeting =
    process.env.TWILIO_OUTBOUND_GREETING || TWILIO_OUTBOUND_GREETING;
  const language = source.language === "hi" ? "hi" : "en";
  const gender = source.gender === "male" ? "male" : "female";
  const openingLine = String(source.openingLine || defaultGreeting).trim();
  const streamUrl = getTwilioMediaStreamUrl();

  if (!streamUrl) {
    return res.status(500).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Voice streaming is not configured.</Say>
  <Hangup />
</Response>`);
  }

  const safeParam = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .slice(0, 500);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${safeParam(streamUrl)}">
      <Parameter name="companyId" value="${safeParam(source.companyId)}" />
      <Parameter name="campaignId" value="${safeParam(source.campaignId)}" />
      <Parameter name="leadId" value="${safeParam(source.leadId)}" />
      <Parameter name="leadName" value="${safeParam(source.leadName)}" />
      <Parameter name="leadPhone" value="${safeParam(source.leadPhone)}" />
      <Parameter name="leadEmail" value="${safeParam(source.leadEmail)}" />
      <Parameter name="language" value="${safeParam(language)}" />
      <Parameter name="gender" value="${safeParam(gender)}" />
      <Parameter name="openingLine" value="${safeParam(openingLine)}" />
    </Stream>
  </Connect>
</Response>`;

  res.type("text/xml").send(xml);
});

app.post("/api/voicebot/twilio/status", (req, res) => {
  console.log("[TwilioStatus]", {
    callSid: req.body?.CallSid || null,
    callStatus: req.body?.CallStatus || null,
    answeredBy: req.body?.AnsweredBy || null,
    to: req.body?.To || null,
    from: req.body?.From || null,
    timestamp: new Date().toISOString(),
  });
  res.json({ ok: true });
});

app.get("/api/voicebot/twilio/calls", async (_req, res) => {
  try {
    const dir = voicebotCallsDir();
    await mkdir(dir, { recursive: true });
    const files = (await readdir(dir))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 50);
    const calls = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(join(dir, file), "utf-8");
        return JSON.parse(raw);
      }),
    );
    res.json({ calls });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/voicebot/twilio/calls/:callSid", async (req, res) => {
  try {
    const raw = await readFile(voicebotCallPath(req.params.callSid), "utf-8");
    res.json({ call: JSON.parse(raw) });
  } catch {
    res.status(404).json({ error: "Call not found" });
  }
});

app.get("/api/leads-db/metadata", async (_req, res) => {
  try {
    const data = await callLeadsDb("/metadata", null, "GET");
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/leads-db/fetch", async (req, res) => {
  try {
    const data = await callLeadsDb("/fetch", req.body || {});
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/leads-db/pull-to-sheets", async (req, res) => {
  try {
    const result = await pullIcpLeadsToGoogleSheets(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/leads-sheet/queue", async (req, res) => {
  try {
    if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
      return res.status(400).json({ error: "GOOGLE_SHEETS_SPREADSHEET_ID is not configured" });
    }
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
    const client = await getGoogleSheetsClient();
    const values = await readGoogleSheetValues(
      client,
      GOOGLE_SHEETS_SPREADSHEET_ID,
      "Leads",
      `A1:V${limit + 1}`,
    );
    const queue = mapLeadSheetRowsToQueue(values);
    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/leads-db/icp-size", async (req, res) => {
  try {
    const data = await callLeadsDb("/icp/size", req.body || {});
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/leads-db/enrich/phone", async (req, res) => {
  try {
    const data = await callLeadsDb("/enrich/phone", req.body || {});
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/leads-db/enrich/email", async (req, res) => {
  try {
    const data = await callLeadsDb("/enrich/email", req.body || {});
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/leads-db/enrich/bulk", async (req, res) => {
  try {
    const data = await callLeadsDb("/enrich/bulk", req.body || {});
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
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
    companyId,
    sectionId,
    sectionTitle,
    summary,
    bullets,
    tasks,
    scheduleMode,
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
      companyId: typeof companyId === "string" && companyId.trim() ? companyId.trim() : null,
      sectionId,
      sectionTitle,
      summary: typeof summary === "string" ? summary : "",
      bullets: Array.isArray(bullets) ? bullets : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      scheduleMode: typeof scheduleMode === "string" && scheduleMode.trim() ? scheduleMode.trim() : null,
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
  const { task, marketingContext } = req.body || {};

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
      marketingContext || null,
    );
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ── Agent Contract Persistence Helpers ────────────────────────────────────────

/**
 * saveAgentRunOutput — writes validated contract to agent_run_outputs table.
 * Idempotent: run_id has UNIQUE constraint; 23505 (unique violation) is swallowed
 * so client retries do not create duplicate rows.
 * Fire-and-log: errors are logged but never thrown.
 */
async function saveAgentRunOutput(contract, rawOutput) {
  if (!supabase || !contract.company_id) return;
  try {
    const { error } = await supabase
      .from("agent_run_outputs")
      .insert({
        run_id:        contract.run_id,
        company_id:    contract.company_id,
        agent:         contract.agent,
        task:          contract.task,
        timestamp:     contract.timestamp,
        artifact:      contract.artifact,
        context_patch: contract.context_patch,
        handoff_notes: contract.handoff_notes || null,
        missing_data:  contract.missing_data  || [],
        tasks_created: contract.tasks_created || [],
        raw_output:    rawOutput,
      });
    if (error && error.code !== "23505") {
      // 23505 = unique_violation — idempotent on retry, not an error
      console.error("[contract] saveAgentRunOutput error:", error);
    }
  } catch (err) {
    console.error("[contract] saveAgentRunOutput failed:", err);
  }
}

/**
 * createMissingDataTask — auto-creates a follow-up task when artifact.confidence < 0.5.
 * CONTRACT-03 requirement. Uses task_type='missing_data', priority='high'.
 */
async function createMissingDataTask(contract) {
  if (!supabase) return;
  if (!contract.company_id) return;
  if (contract.artifact.confidence >= 0.5) return;  // only fire for < 0.5
  try {
    const { error } = await supabase
      .from("agent_tasks")
      .insert({
        agent_name:          contract.agent,
        task_type:           "missing_data",
        status:              "scheduled",
        company_id:          contract.company_id,
        description:         `Low-confidence run (${contract.artifact.confidence.toFixed(2)}): ${contract.artifact.summary}`,
        priority:            "high",
        triggered_by_run_id: contract.run_id,
      });
    if (error) {
      console.error("[contract] createMissingDataTask error:", error);
    } else {
      console.log(`[contract] Auto-created missing_data task for ${contract.agent}/${contract.run_id} (confidence: ${contract.artifact.confidence})`);
    }
  } catch (err) {
    console.error("[contract] createMissingDataTask failed:", err);
  }
}

/**
 * writeTasksCreated — inserts one agent_tasks row per item in contract.tasks_created.
 * CONTRACT-05 requirement. Each row gets triggered_by_run_id set to this run's run_id.
 */
async function writeTasksCreated(contract) {
  if (!supabase) return;
  if (!contract.tasks_created?.length) return;
  const rows = contract.tasks_created.map((t) => ({
    agent_name:          t.agent_name,
    task_type:           t.task_type,
    status:              "scheduled",
    company_id:          contract.company_id || null,
    description:         t.description || null,
    priority:            t.priority    || "medium",
    triggered_by_run_id: contract.run_id,
  }));
  try {
    const { error } = await supabase.from("agent_tasks").insert(rows);
    if (error) {
      console.error("[contract] writeTasksCreated error:", error);
    } else {
      console.log(`[contract] Wrote ${rows.length} tasks_created for run ${contract.run_id}`);
    }
  } catch (err) {
    console.error("[contract] writeTasksCreated failed:", err);
  }
}

// ── POST /api/agents/:name/run ─────────────────────────────────────────────────
// Runs an agent interactively (triggered by slash commands in ChatHome).
// Loads SOUL.md + MEMORY.md + skills/*.md as system prompt, calls Groq, streams SSE.
// Response format: data: {"text":"..."}\n\n ... data: [DONE]\n\n

app.post("/api/agents/:name/run", async (req, res) => {
  const { name } = req.params;
  const { query, company_id, run_id: clientRunId } = req.body;

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: "Unknown agent" });
  }
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  // Generate or adopt run_id for idempotency
  const runId = (typeof clientRunId === "string" && clientRunId.trim())
    ? clientRunId.trim()
    : randomUUID();

  const companyId = (typeof company_id === "string" && company_id.trim())
    ? company_id.trim()
    : null;

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

  // Load skills from agents/{name}/skills/*.md (sorted, 00- prefix loads first)
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

  // Run context block — injected so LLM echoes correct values into contract JSON
  const runContextBlock = `\n\n## Run Context\ncompany_id: ${companyId ?? "unknown"}\nrun_id: ${runId}\n`;

  // Contract instruction — always appended LAST so it takes precedence
  const contractInstruction = `

## Output Contract (REQUIRED — do not skip)

After your COMPLETE response (all prose, analysis, and recommendations have been written),
append the following block EXACTLY at the very END. Do not include ---CONTRACT--- anywhere
else in your response.

---CONTRACT---
{
  "agent": "${name}",
  "task": "<one-line description of what you just did>",
  "company_id": "${companyId ?? "unknown"}",
  "run_id": "${runId}",
  "timestamp": "${new Date().toISOString()}",
  "input": {
    "mkg_version": null,
    "dependencies_read": [],
    "assumptions_made": []
  },
  "artifact": {
    "data": {},
    "summary": "<one paragraph summary of your output — be specific>",
    "confidence": 0.75
  },
  "context_patch": {
    "writes_to": [],
    "patch": {}
  },
  "handoff_notes": "",
  "missing_data": [],
  "tasks_created": [],
  "outcome_prediction": null
}

Replace ALL placeholder values with your actual outputs.
- confidence: your honest assessment of output quality (0.0–1.0)
- context_patch.patch: use only valid MKG field names: positioning, icp, competitors, offers, messaging, channels, funnel, metrics, baselines, content_pillars, campaigns, insights
- tasks_created: array of { "task_type": "...", "agent_name": "...", "description": "...", "priority": "low|medium|high" }
- outcome_prediction: optional — include if you can predict a measurable metric change, otherwise keep null
- The JSON must be valid JSON (no trailing commas, no comments)
`;

  const fullSystem = [
    systemPrompt,
    memory ? `\n\n## Your Recent Memory\n${memory}` : "",
    skillsBlock,
    runContextBlock,
    contractInstruction,  // always last
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
      max_tokens: 8192,  // increased from 4096 — long prose + contract block needs room
      temperature: 0.4,
    });

    // Buffer fullText while forwarding prose chunks to the client unchanged
    let fullText = "";
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) {
        fullText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // ── Post-stream: extract, validate, apply MKG patch ──────────────────────
    await markAgentHeartbeat(name, "completed", Date.now() - startedAt);

    const rawContract = extractContract(fullText);

    if (!rawContract) {
      // LLM did not produce the sentinel — soft fail, preserve UX
      console.warn(`[contract] ${name}/${runId}: ---CONTRACT--- sentinel missing from response`);
      res.write(`data: ${JSON.stringify({ contractError: "missing" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const { valid, errors } = validateContract(rawContract);

    if (!valid) {
      // Contract produced but malformed
      console.warn(`[contract] ${name}/${runId}: validation failed:`, errors);
      res.write(`data: ${JSON.stringify({ contractError: "invalid", details: errors })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // Enforce server-controlled fields (defense against agent confusion)
    rawContract.run_id = runId;
    rawContract.agent = name;
    if (companyId) rawContract.company_id = companyId;

    // Apply context_patch to MKG (fire-and-log — does not block SSE)
    if (
      companyId &&
      rawContract.context_patch?.patch &&
      Object.keys(rawContract.context_patch.patch).length > 0
    ) {
      try {
        await MKGService.patch(companyId, rawContract.context_patch.patch);
      } catch (mkgErr) {
        console.error(`[contract] MKG patch failed for ${companyId}/${runId}:`, mkgErr);
      }
    } else if (!companyId) {
      console.warn(`[contract] ${name}/${runId}: no company_id — skipping MKG patch`);
    }

    // ── Persist contract to Supabase (fire-and-log — do not await sequentially) ──
    await Promise.allSettled([
      saveAgentRunOutput(rawContract, fullText),
      createMissingDataTask(rawContract),
      writeTasksCreated(rawContract),
    ]);

    // Send validated contract event (frontend ignores unknown event shapes — safe)
    res.write(`data: ${JSON.stringify({ contract: rawContract })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();

  } catch (err) {
    await markAgentHeartbeat(name, "error", Date.now() - startedAt, String(err));
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

function attachTwilioMediaStreamServer(server) {
  const mediaWss = new WebSocketServer({
    server,
    path: "/api/voicebot/twilio/media-stream",
  });

  mediaWss.on("connection", (ws) => {
    const session = {
      streamSid: null,
      callSid: null,
      dialogueSessionId: randomUUID(),
      language: "en",
      gender: "female",
      leadId: null,
      leadName: null,
      leadPhone: null,
      leadEmail: null,
      companyId: null,
      campaignId: null,
      openingLine:
        process.env.TWILIO_OUTBOUND_GREETING || TWILIO_OUTBOUND_GREETING,
      utteranceFrames: [],
      turns: [],
      speechStarted: false,
      silenceFrames: 0,
      bargeInFrames: 0,
      processingReply: false,
      assistantSpeaking: false,
      interruptedTurn: false,
      lastTranscript: "",
      lastAssistantText: "",
      callScore: null,
    };

    ws.on("message", async (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        if (payload.event === "start") {
          session.streamSid = payload.start?.streamSid || payload.streamSid || null;
          session.callSid = payload.start?.callSid || null;
          const customParameters = payload.start?.customParameters || {};
          session.language =
            customParameters.language === "hi" ? "hi" : "en";
          session.gender =
            customParameters.gender === "male" ? "male" : "female";
          session.companyId = customParameters.companyId || null;
          session.campaignId = customParameters.campaignId || null;
          session.leadId = customParameters.leadId || null;
          session.leadName = customParameters.leadName || null;
          session.leadPhone = customParameters.leadPhone || null;
          session.leadEmail = customParameters.leadEmail || null;
          session.openingLine =
            String(
              customParameters.openingLine ||
                process.env.TWILIO_OUTBOUND_GREETING ||
                TWILIO_OUTBOUND_GREETING,
            ).trim() ||
            process.env.TWILIO_OUTBOUND_GREETING ||
            TWILIO_OUTBOUND_GREETING;
          twilioMediaSessions.set(session.streamSid, session);
          console.log("[TwilioMediaStream] stream started", {
            streamSid: session.streamSid,
            callSid: session.callSid,
            companyId: session.companyId,
            leadId: session.leadId,
            leadName: session.leadName,
            leadPhone: session.leadPhone,
            leadEmail: session.leadEmail,
            language: session.language,
          });

          session.turns.push({
            role: "assistant",
            text: session.openingLine,
            createdAt: new Date().toISOString(),
            type: "opening_line",
          });
          const greeting = await synthesizeSpeechWithSarvam({
            text: session.openingLine,
            language: session.language,
            gender: session.gender,
          });
          session.assistantSpeaking = true;
          await pushTwilioAudio(ws, session.streamSid, greeting.audioBase64);
          return;
        }

        if (payload.event === "media") {
          if (payload.media?.track && payload.media.track !== "inbound") {
            return;
          }
          const pcmFrame = decodeTwilioMediaPayload(payload.media?.payload);
          const rms = computeRms(pcmFrame);

          if (rms >= TWILIO_SPEECH_RMS_THRESHOLD) {
            if (session.assistantSpeaking) {
              session.bargeInFrames += 1;
              if (session.bargeInFrames >= TWILIO_BARGE_IN_FRAMES) {
                session.assistantSpeaking = false;
                session.bargeInFrames = 0;
                session.interruptedTurn = true;
                ws.send(
                  JSON.stringify({
                    event: "clear",
                    streamSid: session.streamSid,
                  }),
                );
                console.log("[TwilioMediaStream] barge-in detected; cleared bot audio", {
                  streamSid: session.streamSid,
                });
              }
            } else {
              session.bargeInFrames = 0;
            }
            session.speechStarted = true;
            session.silenceFrames = 0;
            session.utteranceFrames.push(pcmFrame);
            return;
          }

          session.bargeInFrames = 0;
          if (!session.speechStarted) {
            return;
          }

          session.silenceFrames += 1;
          session.utteranceFrames.push(pcmFrame);

          const silenceThreshold = session.interruptedTurn
            ? TWILIO_INTERRUPT_SILENCE_FRAMES
            : TWILIO_SILENCE_FRAME_THRESHOLD;

          if (session.silenceFrames >= silenceThreshold) {
            const utterance = Int16Array.from(
              session.utteranceFrames.flatMap((frame) => Array.from(frame)),
            );
            session.utteranceFrames = [];
            session.speechStarted = false;
            session.silenceFrames = 0;
            await generateTwilioAssistantReply({ ws, session, utterance });
          }
          return;
        }

        if (payload.event === "mark") {
          session.assistantSpeaking = false;
          session.bargeInFrames = 0;
          return;
        }

        if (payload.event === "stop") {
          if (session.utteranceFrames.length && !session.processingReply) {
            const utterance = Int16Array.from(
              session.utteranceFrames.flatMap((frame) => Array.from(frame)),
            );
            session.utteranceFrames = [];
            await generateTwilioAssistantReply({ ws, session, utterance });
          }
          const companySalesContext = await buildCompanySalesContext(session.companyId);
          const callScore = await scoreVoicebotCall({
            companyId: session.companyId,
            companyName: companySalesContext.companyName,
            leadId: session.leadId,
            leadName: session.leadName,
            callSid: session.callSid,
            turns: session.turns,
          });
          session.callScore = callScore;
          let googleSheetsSync = null;
          try {
            googleSheetsSync = await syncVoicebotCallToGoogleSheets({
              companyId: session.companyId,
              leadId: session.leadId,
              leadName: session.leadName,
              leadPhone: session.leadPhone,
              leadEmail: session.leadEmail,
              callSid: session.callSid,
              scorecard: callScore,
              turns: session.turns,
            });
          } catch (error) {
            console.warn("[GoogleSheets] voicebot sync failed:", String(error));
          }
          await persistVoicebotCallRecord({
            streamSid: session.streamSid,
            callSid: session.callSid,
            companyId: session.companyId,
            companyName: companySalesContext.companyName,
            campaignId: session.campaignId,
            leadId: session.leadId,
            leadName: session.leadName,
            leadPhone: session.leadPhone,
            leadEmail: session.leadEmail,
            language: session.language,
            openingLine: session.openingLine,
            turns: session.turns,
            scorecard: callScore,
            googleSheetsSync,
            lastTranscript: session.lastTranscript,
            lastAssistantText: session.lastAssistantText,
            endedAt: new Date().toISOString(),
          });
          if (session.streamSid) {
            twilioMediaSessions.delete(session.streamSid);
          }
          console.log("[TwilioMediaStream] stream stopped", {
            streamSid: session.streamSid,
            callSid: session.callSid,
            lastTranscript: session.lastTranscript,
            lastAssistantText: session.lastAssistantText,
            callScore,
            googleSheetsSync,
          });
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
      } catch (error) {
        console.warn("[TwilioMediaStream] message handling failed:", error);
      }
    });

    ws.on("close", () => {
      if (session.streamSid) {
        twilioMediaSessions.delete(session.streamSid);
      }
    });
  });
}

const server = app.listen(PORT, () => {
  console.log(`[content-engine] Listening on port ${PORT}`);
  startWorker();
});
attachTwilioMediaStreamServer(server);

// ── GET /api/integrations ──────────────────────────────────────────────────
// Stub endpoint — returns static connector catalog until live integrations are wired.
app.get("/api/integrations", (_req, res) => {
  const hubspotConnected = Boolean(HUBSPOT_ACCESS_TOKEN);
  const googleSheetsConnected = Boolean(
    GOOGLE_SHEETS_SPREADSHEET_ID &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CREDENTIALS_JSON ||
        process.env.GOOGLE_REFRESH_TOKEN ||
        process.env.GOOGLE_SHEETS_REFRESH_TOKEN),
  );
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
      status: hubspotConnected ? "connected" : "not_configured",
      connected: hubspotConnected,
      notes: hubspotConnected
        ? "Private app token configured. Voicebot qualification notes can sync to contacts."
        : "Sync contacts, deals, and marketing events from HubSpot.",
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
      status: googleSheetsConnected ? "connected" : "not_configured",
      connected: googleSheetsConnected,
      notes: googleSheetsConnected
        ? "Voicebot lead qualification rows can sync into the configured spreadsheet."
        : "Import marketing and reporting data from Google Sheets workbooks.",
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

async function generateAgentTaskPlan(agentName, task, profile, marketingContext = null) {
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
        marketingContext,
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

app.get("/api/company-intel/companies/:id/knowledge-base", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  const files = await readKnowledgeBaseManifest(req.params.id);
  res.json({
    files: files.sort((a, b) =>
      String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")),
    ),
  });
});

app.get("/api/company-intel/companies/:id/assets", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  const assets = await readCompanyAssetManifest(req.params.id);
  res.json({
    assets: assets.sort((a, b) =>
      String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")),
    ),
  });
});

app.get("/api/company-intel/companies/:id/action-status", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  const status = await readCompanyActionStatus(req.params.id);
  res.json({ status });
});

app.post("/api/company-intel/companies/:id/knowledge-base", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });

  const { category, name, mime, size, base64 } = req.body || {};
  if (!COMPANY_INTEL_KB_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Valid category required" });
  }
  if (!name || !base64) {
    return res.status(400).json({ error: "name and base64 are required" });
  }

  try {
    const id = randomUUID();
    const safeName = sanitizeKnowledgeBaseFilename(name);
    const dir = companyKbDir(req.params.id);
    const filePath = join(dir, `${id}-${safeName}`);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, Buffer.from(base64, "base64"));

    const existing = await readKnowledgeBaseManifest(req.params.id);
    const file = {
      id,
      category,
      name: safeName,
      mime: mime || "application/octet-stream",
      size: Number(size) || 0,
      createdAt: new Date().toISOString(),
      path: filePath,
    };

    existing.unshift(file);
    await writeKnowledgeBaseManifest(req.params.id, existing);
    res.json({
      file: {
        id: file.id,
        category: file.category,
        name: file.name,
        mime: file.mime,
        size: file.size,
        createdAt: file.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/company-intel/companies/:id/assets", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });

  const { assets, userId } = req.body || {};
  if (!Array.isArray(assets) || !assets.length) {
    return res.status(400).json({ error: "assets array required" });
  }

  try {
    const existing = await readCompanyAssetManifest(req.params.id);
    const createdAt = new Date().toISOString();
    const normalized = assets
      .filter((asset) => asset && typeof asset === "object")
      .map((asset) => ({
        id: randomUUID(),
        companyId: req.params.id,
        sourceModule: String(asset.sourceModule || "unknown"),
        sourceWorkflow: String(asset.sourceWorkflow || "unknown"),
        title: String(asset.title || "Generated asset"),
        summary: String(asset.summary || "Generated marketing collateral"),
        kind: String(asset.kind || "text"),
        format: String(asset.format || "text"),
        agentName: String(asset.agentName || "zara"),
        deliveryMode: String(asset.deliveryMode || "run_now"),
        model: String(asset.model || "workflow-native"),
        createdAt,
        archived: false,
        url: asset.url || null,
        content: asset.content || null,
        metadata: asset.metadata || null,
      }));

    const merged = [...normalized, ...existing];
    await writeCompanyAssetManifest(req.params.id, merged);

    if (userId) {
      for (const asset of normalized) {
        const sourceLabelMap = {
          "ai-content": "AI Content",
          "seo-llmo": "SEO/LLMO",
          "budget-optimization": "Budget Optimization",
          "performance-scorecard": "Performance Scorecard",
          "lead-intelligence": "Lead Intelligence",
        };
        const capabilityIdMap = {
          "ai-content": "ai_content",
          "seo-llmo": "seo_llmo",
          "budget-optimization": "budget_optimization",
          "performance-scorecard": "performance_scorecard",
          "lead-intelligence": "lead_intelligence",
        };
        const sourceLabel =
          sourceLabelMap[asset.sourceModule] || asset.sourceModule;
        const capabilityId =
          asset?.metadata?.capabilityId ||
          capabilityIdMap[asset.sourceModule] ||
          null;
        await createAgentNotification({
          user_id: userId,
          agent_name: asset.agentName,
          agent_role: AGENT_PROFILES[asset.agentName]?.title || "Workflow Agent",
          task_type: "asset_ready",
          title: `${sourceLabel}: ${asset.title}`,
          summary: `${asset.title} was added to Assets for ${entry.company.companyName}.`,
          full_output: {
            companyId: req.params.id,
            assetId: asset.id,
            sourceModule: asset.sourceModule,
            capabilityId,
            kind: asset.kind,
            format: asset.format,
          },
          action_items: [
            {
              label: "Open asset",
              priority: "medium",
              url: `#ci=assets&companyId=${encodeURIComponent(req.params.id)}&assetId=${encodeURIComponent(asset.id)}`,
              capabilityId,
            },
          ],
          status: "success",
          read: false,
        });
      }
    }

    res.json({ assets: normalized });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/company-intel/companies/:id/action-status", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  const { pageId, status, mode, agentName } = req.body || {};
  if (!pageId) return res.status(400).json({ error: "pageId is required" });

  try {
    const next = await setCompanyActionStatus(req.params.id, pageId, {
      status: String(status || "idle"),
      mode: mode || null,
      agentName: agentName || null,
    });
    res.json({ status: next });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/company-intel/companies/:id/assets/:assetId", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  const { archived } = req.body || {};
  try {
    const assets = await readCompanyAssetManifest(req.params.id);
    const target = assets.find((asset) => asset.id === req.params.assetId);
    if (!target) return res.status(404).json({ error: "Asset not found" });
    target.archived = Boolean(archived);
    await writeCompanyAssetManifest(req.params.id, assets);
    res.json({ asset: target });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/api/company-intel/companies/:id/assets/:assetId", async (req, res) => {
  const entry = await ensureCompanyEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "Company not found" });
  try {
    const assets = await readCompanyAssetManifest(req.params.id);
    const remaining = assets.filter((asset) => asset.id !== req.params.assetId);
    await writeCompanyAssetManifest(req.params.id, remaining);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete(
  "/api/company-intel/companies/:id/knowledge-base/:fileId",
  async (req, res) => {
    const entry = await ensureCompanyEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: "Company not found" });

    try {
      const files = await readKnowledgeBaseManifest(req.params.id);
      const file = files.find((item) => item.id === req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const remaining = files.filter((item) => item.id !== req.params.fileId);
      if (file.path) {
        try {
          await unlink(file.path);
        } catch {
          // non-blocking
        }
      }
      await writeKnowledgeBaseManifest(req.params.id, remaining);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

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
    fs.rmSync(companyKbDir(companyId), { recursive: true, force: true });
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
    try {
      const directGroqData = await generateArtifactWithGroq(
        type,
        entry.company.companyName,
        {
          ...(inputs || {}),
          websiteUrl: entry.company.websiteUrl,
          companyProfile: entry.company.profile,
        },
        {
          websiteUrl: entry.company.websiteUrl,
          companyProfile: entry.company.profile,
          existingArtifacts: entry.artifacts || {},
        },
      );

      entry.artifacts[type] = {
        type,
        updatedAt: now,
        data: normalizeArtifact(type, directGroqData),
      };
      directGroqError = null;
    } catch (err) {
      directGroqError = err instanceof Error ? err : new Error(String(err));
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

// ─── MKG Endpoints ───────────────────────────────────────────────────────────

// GET /api/mkg/:companyId — return the full MKG document for a company
// Returns { mkg: { company_id, updated_at, positioning, icp, ... } }
// If no mkg.json exists yet, returns an empty MKG envelope (all fields null).
app.get("/api/mkg/:companyId", async (req, res) => {
  const { companyId } = req.params;
  if (!companyId?.trim()) {
    return res.status(400).json({ error: "companyId required" });
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId)) {
    return res.status(400).json({ error: "invalid companyId" });
  }
  try {
    const mkg = await MKGService.read(companyId);
    res.json({ mkg });
  } catch (err) {
    console.error("GET /api/mkg error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/mkg/:companyId — apply a field-level patch to the MKG
// Body: { fieldName: { value, confidence, last_verified, source_agent, expires_at } }
// Only the fields present in the body are updated; all other fields are preserved.
// Returns { mkg: <updated full document> }
app.patch("/api/mkg/:companyId", async (req, res) => {
  const { companyId } = req.params;
  const patch = req.body;
  if (!companyId?.trim()) {
    return res.status(400).json({ error: "companyId required" });
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId)) {
    return res.status(400).json({ error: "invalid companyId" });
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return res.status(400).json({ error: "body must be a patch object { fieldName: { value, confidence, ... } }" });
  }
  try {
    const updated = await MKGService.patch(companyId, patch);
    res.json({ mkg: updated });
  } catch (err) {
    // MKGService.patch throws on invalid companyId (path traversal)
    if (err.message?.includes("Invalid companyId")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("PATCH /api/mkg error:", err);
    res.status(500).json({ error: String(err) });
  }
});
