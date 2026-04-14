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
import multer from "multer";
import Groq from "groq-sdk";
import { tracedGroq, tracedLLM, langfuse } from "./langfuse.js";
import { runAgenticLoop, getComposioTools } from "./agents/agenticLoop.js";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { GoogleAuth } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { WebSocketServer } from "ws";
import {
    enqueueGeneration,
    generateArtifactWithGroq,
    normalizeArtifact,
    registerArtifactCallback,
    registerArtifactFailCallback,
    saveCompanyIntelArtifactTrace,
    startWorker,
} from "./queue.js";
import {
    clearArtifactsForCompany,
    deleteDuplicateCompaniesByWebsiteUrl,
    getPipelineWriteClient,
    getSupabaseWriteClient,
    loadCompanies,
    loadCompanyByWebsiteUrl,
    loadCompanyWithArtifacts,
    saveArtifact,
    saveCompany,
    supabase,
} from "./supabase.js";
import { MKGService } from "./mkg-service.js";
import { extractContract, validateContract } from "./contract-validator.js";
import {
  buildContextPatchFromCrawl,
  crawlCompanyForMKG,
  initializeMKGTemplate,
} from "./veena-crawler.js";
import { HooksEngine } from "./hooks-engine.js";
import { listCompanyKpis } from "./kpi-aggregator.js";
import { detectCompanyAnomalies } from "./anomaly-detector.js";
import { canAccessModule, PLAN_CREDITS, CREDIT_COSTS } from "./plans.js";
import { getLatestCalibrationNote } from "./calibration-writer.js";
import { REGISTRY, executeAutomationTriggers } from "./automations/registry.js";
import { getConnectors, getAgentConnectors, getAgentConnectorApps, getAgentPermissions, initiateConnection, disconnectConnector } from "./mcp-router.js";
import { getLLMModel, LLM_PROVIDER, LLM_MODEL, inferProviderForModel, isClaudeProvider, isGroqProvider } from "./llm-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_MAIN_MODULE = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

// Paths relative to this file (platform/content-engine/)
const CREWAI_DIR = join(__dirname, "..", "crewai");
const HEARTBEAT_PATH = join(CREWAI_DIR, "heartbeat", "status.json");
const AGENTS_DIR = process.env.TORQQ_AGENTS_DIR
  ? resolve(process.env.TORQQ_AGENTS_DIR)
  : join(CREWAI_DIR, "agents");
const MARKETINGSKILLS_DIR = join(CREWAI_DIR, "skill-library", "marketingskills", "skills");
const CTX_DIR = join(CREWAI_DIR, "client_context");
const DEPLOYMENT_QUEUE_PATH = join(CREWAI_DIR, "deployments", "queue.json");
const DEPLOYMENT_SCHEDULER_INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.AGENT_DEPLOYMENT_SCHEDULER_INTERVAL_MS || 60_000),
);
// Poll scheduled_automations table once per minute; env override for testing
const AUTOMATION_SCHEDULER_INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.AGENT_AUTOMATION_SCHEDULER_INTERVAL_MS || 60_000),
);
// Poll agent_tasks for pending onboard_briefings every 30 s; env override for testing
const ONBOARD_BRIEFING_SCHEDULER_INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.ONBOARD_BRIEFING_SCHEDULER_INTERVAL_MS || 30_000),
);
const DEFAULT_MONITOR_RECURRENCE_MINUTES = Math.max(
  15,
  Number(process.env.AGENT_MONITOR_RECURRENCE_MINUTES || 1440),
);
const COMPANY_INTEL_KB_ROOT = join(__dirname, "data", "company-intel-kb");
const VOICEBOT_KB_ROOT = join(__dirname, "data", "voicebot-kb");
const VOICEBOT_CALLS_ROOT = join(__dirname, "data", "voicebot-calls");

const VALID_AGENTS = new Set([
  "veena",   // Company Intelligence — Phase 3
  "isha",
  "neel",
  "tara",
  "zara",
  "maya",
  "riya",
  "arjun",
  "dev",
  "priya",
  "kiran",
  "sam",
]);
// Company-intel artifacts: map each artifact type to the named agent best suited to produce it.
// This routes generation through the full agent stack (SOUL + skills + MKG + guardrails)
// rather than falling back to raw Groq immediately.
const ARTIFACT_AGENT_MAP = {
  competitor_intelligence: { agent: "isha",  taskType: "competitor_intelligence" },
  opportunities:           { agent: "isha",  taskType: "opportunities_analysis" },
  icps:                    { agent: "neel",  taskType: "icp_definition" },
  marketing_strategy:      { agent: "neel",  taskType: "marketing_strategy" },
  positioning_messaging:   { agent: "neel",  taskType: "positioning_messaging" },
  channel_strategy:        { agent: "dev",   taskType: "channel_strategy" },
  client_profiling:        { agent: "kiran", taskType: "client_profiling" },
  partner_profiling:       { agent: "kiran", taskType: "partner_profiling" },
  lookalike_audiences:     { agent: "kiran", taskType: "lookalike_audiences" },
  lead_magnets:            { agent: "tara",  taskType: "lead_magnets" },
  sales_enablement:        { agent: "sam",   taskType: "sales_enablement" },
  content_strategy:        { agent: "sam",   taskType: "content_strategy" },
  social_calendar:         { agent: "riya",  taskType: "social_calendar" },
  pricing_intelligence:    { agent: "tara",  taskType: "pricing_intelligence" },
  website_audit:           { agent: "tara",  taskType: "website_audit" },
};
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const COMPANY_PROFILE_PRIMARY_PROVIDER = (
  process.env.COMPANY_PROFILE_PRIMARY_PROVIDER ||
  process.env.COMPANY_INTEL_PRIMARY_PROVIDER ||
  "groq"
).toLowerCase();
const COMPANY_PROFILE_GEMINI_MODEL =
  process.env.COMPANY_PROFILE_GEMINI_MODEL ||
  process.env.COMPANY_INTEL_GEMINI_MODEL ||
  process.env.GEMINI_PRIMARY_MODEL ||
  "gemini-3.1-pro-preview";
const GEMINI_THINKING_LEVEL =
  process.env.GEMINI_THINKING_LEVEL ||
  process.env.COMPANY_INTEL_GEMINI_THINKING_LEVEL ||
  "medium";

function buildAgentQueryForArtifact(type, companyName, inputs) {
  const ctx = companyName
    ? `Company: ${companyName}${inputs?.websiteUrl ? ` (${inputs.websiteUrl})` : ""}. `
    : "";
  const goal = inputs?.goal ? ` Goal: ${inputs.goal}.` : "";
  const geo  = inputs?.geo  ? ` Market: ${inputs.geo}.`  : "";
  const notes = inputs?.notes ? ` Notes: ${inputs.notes}.` : "";
  const geoFocus = Array.isArray(inputs?.companyProfile?.geoFocus)
    ? inputs.companyProfile.geoFocus.map((value) => String(value).toLowerCase())
    : [];
  const websiteUrl = typeof inputs?.websiteUrl === "string" ? inputs.websiteUrl.toLowerCase() : "";
  const marketGeo = typeof inputs?.geo === "string" ? inputs.geo.toLowerCase() : "";
  const indiaContext =
    geoFocus.includes("india") ||
    marketGeo.includes("india") ||
    websiteUrl.endsWith(".in") ||
    websiteUrl.includes(".in/");
  const currencyGuard = indiaContext
    ? " Use INR / Rs / ₹ as the default currency and benchmark against Indian market pricing unless a different currency is explicitly required by the source context."
    : "";

  const templates = {
    competitor_intelligence: `${ctx}Scan for competitor moves, narrative shifts, pricing changes, and market threats. Identify top 3-5 direct competitors and surface actionable competitive intelligence. Return your full analysis plus a structured competitor_intelligence artifact.`,
    website_audit:           `${ctx}Audit the company website for offer clarity, CTA effectiveness, messaging quality, and conversion blockers. Return your findings plus a structured website_audit artifact.`,
    opportunities:           `${ctx}Identify the top market opportunities, demand gaps, and near-term growth vectors. Return your analysis plus a structured opportunities artifact.`,
    client_profiling:        `${ctx}Profile the company's likely client base — who they serve, use cases, buying behaviour, and success patterns. Return a structured client_profiling artifact.`,
    partner_profiling:       `${ctx}Identify partner, integration, and channel ecosystem opportunities. Return a structured partner_profiling artifact.`,
    icps:                    `${ctx}Define 2-3 Ideal Customer Profiles with firmographic, behavioural, and psychographic attributes and recommended messaging angles. Return a structured icps artifact.`,
    social_calendar:         `${ctx}Create a 30-day social media content calendar with platform-specific posts, themes, hashtags, and posting cadence. Return a structured social_calendar artifact.`,
    marketing_strategy:      `${ctx}Develop a comprehensive marketing strategy covering positioning, target segments, key messages, channel mix, and 90-day priorities. Return a structured marketing_strategy artifact.`,
    positioning_messaging:   `${ctx}Write a clear positioning statement, core value proposition, and message hierarchy for each ICP segment. Return a structured positioning_messaging artifact.`,
    sales_enablement:        `${ctx}Create sales enablement content: objection handling guide, competitive battlecards, and proof points by persona. Return a structured sales_enablement artifact.`,
    pricing_intelligence:    `${ctx}Analyse pricing strategy, competitive price positioning, and packaging or bundling recommendations.${currencyGuard} Return a structured pricing_intelligence artifact.`,
    content_strategy:        `${ctx}Define a content strategy: pillar themes, formats, distribution channels, and a quarterly editorial calendar framework. Return a structured content_strategy artifact.`,
    channel_strategy:        `${ctx}Recommend the optimal channel mix and distribution plan based on ICP and competitive context. Return a structured channel_strategy artifact.`,
    lookalike_audiences:     `${ctx}Define lookalike audience profiles for paid and organic targeting based on best-fit customer patterns. Return a structured lookalike_audiences artifact.`,
    lead_magnets:            `${ctx}Design 3-5 high-value lead magnet concepts aligned to ICP pain points and sales funnel stage. Return a structured lead_magnets artifact.`,
  };

  const base = templates[type] || `${ctx}Generate a comprehensive ${type} analysis.`;
  return base + goal + geo + notes;
}

async function generateJsonWithGemini({ model, systemPrompt, userContent, temperature, maxOutputTokens, label }) {
  if (!gemini) throw new Error("Gemini API key is not configured");

  console.log(`[Gemini] Trying model "${model}" for ${label}...`);
  const response = await gemini.models.generateContent({
    model,
    contents: [
      `System instructions:\n${systemPrompt}`,
      `User input:\n${userContent}`,
      "Return exactly one valid JSON object and no markdown."
    ].join("\n\n"),
    config: {
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingLevel: GEMINI_THINKING_LEVEL,
      },
    },
  });

  const raw = typeof response.text === "function" ? await response.text() : response.text;
  const candidate = extractJsonObject(raw || "");
  if (!candidate) {
    throw new Error(`Gemini model "${model}" did not return valid JSON for ${label}`);
  }
  console.log(`[Gemini] Model "${model}" succeeded for ${label}.`);
  return JSON.parse(candidate);
}

async function generateAgentRunWithGemini({ model, systemPrompt, userQuery }) {
  if (!gemini) throw new Error("Gemini API key is not configured");

  console.log(`[Gemini] Trying model "${model}" for agent run...`);
  const response = await gemini.models.generateContent({
    model,
    contents: [
      `System instructions:\n${systemPrompt}`,
      `User request:\n${userQuery}`,
    ].join("\n\n"),
    config: {
      temperature: 0.4,
      thinkingConfig: {
        thinkingLevel: GEMINI_THINKING_LEVEL,
      },
    },
  });

  const text = typeof response.text === "function" ? await response.text() : response.text;
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error(`Gemini model "${model}" returned empty output for agent run`);
  }
  console.log(`[Gemini] Model "${model}" succeeded for agent run.`);
  return trimmed;
}

function hasUsableAgentProse(fullText, opts = {}) {
  const prose = String(fullText || "").split("---CONTRACT---")[0].trim();
  const supplement = String(opts.streamSupplement || "").trim();
  // Models may stream most of the work in thinking/reasoning while `content` stays short until the end.
  const combined = [prose, supplement].filter(Boolean).join("\n").trim();
  const hasEnoughLength = combined.length >= 120;
  const hasLetters = /[A-Za-z]/.test(combined);
  const result = hasEnoughLength && hasLetters;
  if (!result) {
    console.warn(
      `[prose-check] failed: proseLen=${prose.length} supplementLen=${supplement.length} combined=${combined.length} (need 120), hasLetters=${hasLetters}, preview: ${combined.slice(0, 150)}`
    );
  }
  return result;
}

/**
 * Converts an internal Error into a user-safe message before sending over SSE.
 * Strips model names, function brackets, internal sentinel strings, and technical jargon.
 */
function toUserFacingError(err) {
  const msg = String(err?.message || err || "")
    // Remove internal bracket prefixes: [runAgentForArtifact], [agent:isha], [contract], etc.
    .replace(/\[[\w:/ .]+\]/g, "")
    // Model names
    .replace(/groq model\s+"[^"]+"/gi, "AI model")
    .replace(/gemini model\s+"[^"]+"/gi, "AI model")
    .replace(/"?(llama|gpt|qwen|deepseek|gemini|mixtral|claude)[-\w.]*"?/gi, "AI model")
    // Internal sentinel strings
    .replace(/---CONTRACT---/g, "")
    .replace(/did not return a\s+\S+\s+block/gi, "produced incomplete output")
    .replace(/returned insufficient user-facing prose/gi, "could not produce a usable response")
    .replace(/All agent run models failed/gi, "The AI service is temporarily unavailable. Please try again.")
    .replace(/\b(SOUL|MKG|run_id|company_id|task_type)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  return msg || "Agent run failed. Please try again."
}

const AGENTMAIL_BASE_URL = "https://api.agentmail.to/v0";

function extractEmailAddresses(value) {
  if (!value) return [];
  return Array.from(new Set(String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
}

function extractSlackTargets(value) {
  if (!value) return [];
  return Array.from(
    new Set(
      [...String(value).matchAll(/(^|[\s,])(#([a-z0-9_-]+))/gi)]
        .map((match) => match[2])
        .filter(Boolean)
    )
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractDelimitedSection(text, startLabel, endLabel = null) {
  const startIndex = String(text || "").indexOf(startLabel);
  if (startIndex === -1) return "";
  const from = startIndex + startLabel.length;
  const endIndex = endLabel ? String(text).indexOf(endLabel, from) : -1;
  const slice = endIndex === -1 ? String(text).slice(from) : String(text).slice(from, endIndex);
  return slice.trim();
}

function parseJsonBlock(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseAgentMailReportRequest(query) {
  const text = String(query || "");
  const destinationLineMatch = text.match(/Destination details:\s*(.+)/i);
  const deliveryNoteMatch = text.match(/Delivery note:\s*(.+)/i);
  const reportLineMatch = text.match(/Distribute the (.+?) report\./i);
  const reportTitleMatch =
    text.match(/Report title:\s*(.+)/i) ||
    text.match(/Title:\s*(.+)/i);
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const docUrlMatch = text.match(/Doc URL:\s*(https?:\/\/\S+)/i);
  const narrative = extractDelimitedSection(text, "Generated report narrative:\n", "\n\nGenerated report artifact:\n");
  const artifactRaw = extractDelimitedSection(text, "Generated report artifact:\n");
  const artifact = parseJsonBlock(artifactRaw);
  const destinationText = destinationLineMatch?.[1] || text;
  const reportName = artifact?.report_title || reportTitleMatch?.[1]?.trim() || reportLineMatch?.[1] || "Marqq";

  return {
    recipients: extractEmailAddresses(destinationText),
    slackTargets: extractSlackTargets(destinationText),
    subject:
      artifact?.recommended_subject ||
      artifact?.subject_line ||
      subjectMatch?.[1]?.trim() ||
      `${reportName} report`,
    docUrl: artifact?.doc_url || artifact?.file_url || docUrlMatch?.[1] || null,
    reportMarkdown: artifact?.report_markdown || "",
    reportHtml: artifact?.report_html || "",
    executiveSummary: artifact?.executive_summary || "",
    narrative: narrative || text,
    deliveryNote: deliveryNoteMatch?.[1]?.trim() || "",
    reportName,
  };
}

function buildAgentMailBodies({
  reportName,
  subject,
  docUrl,
  executiveSummary,
  narrative,
  reportMarkdown,
  reportHtml,
  deliveryNote,
}) {
  const summary = executiveSummary || narrative || reportMarkdown || "Your report is ready.";
  const textParts = [
    `Subject: ${subject}`,
    "",
    deliveryNote ? `Note: ${deliveryNote}` : "",
    `Your ${reportName} report is ready.`,
    "",
    summary,
    docUrl ? `Report link: ${docUrl}` : "",
  ].filter(Boolean);

  const safeSummary = escapeHtml(summary).replace(/\n/g, "<br />");
  const safeNote = deliveryNote ? `<p><strong>Note:</strong> ${escapeHtml(deliveryNote)}</p>` : "";
  const html =
    reportHtml ||
    `<div>${safeNote}<p>Your <strong>${escapeHtml(reportName)}</strong> report is ready.</p><p>${safeSummary}</p>${
      docUrl ? `<p><a href="${escapeHtml(docUrl)}">Open the report</a></p>` : ""
    }</div>`;

  return {
    text: textParts.join("\n"),
    html,
  };
}

async function agentMailFetch(path, apiKey, init = {}) {
  const response = await fetch(`${AGENTMAIL_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AgentMail request failed: ${response.status} ${body.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function ensureAgentMailInbox(apiKey, companyId) {
  const list = await agentMailFetch("/inboxes", apiKey, { method: "GET" });
  const existingInbox = list?.inboxes?.[0] || list?.items?.[0] || list?.data?.[0] || null;
  if (existingInbox?.inbox_id) return existingInbox;

  return agentMailFetch("/inboxes", apiKey, {
    method: "POST",
    body: JSON.stringify({
      display_name: companyId ? `Marqq Reports ${companyId.slice(0, 8)}` : "Marqq Reports",
      client_id: companyId ? `marqq-reports-${companyId}` : "marqq-reports",
    }),
  });
}

async function sendReportViaAgentMail({ apiKey, companyId, query }) {
  const parsed = parseAgentMailReportRequest(query);
  if (!parsed.recipients.length && !parsed.slackTargets.length) {
    throw new Error("No email recipients or Slack channels found in report delivery request");
  }

  const results = {};

  // ── Email delivery ──────────────────────────────────────────────────────────
  if (parsed.recipients.length) {
    const inbox = await ensureAgentMailInbox(apiKey, companyId);
    const bodies = buildAgentMailBodies(parsed);
    const emailResult = await agentMailFetch(`/inboxes/${encodeURIComponent(inbox.inbox_id)}/messages/send`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        to: parsed.recipients,
        subject: parsed.subject,
        text: bodies.text,
        html: bodies.html,
      }),
    });
    results.inbox = inbox;
    results.emailResult = emailResult;
    // Persist today's report so the #main channel can surface it
    saveTodayReport({
      subject: parsed.subject,
      body: parsed.narrative || parsed.executiveSummary || parsed.reportName || "",
      recipients: parsed.recipients,
      agentName: "sam",
    }).catch(() => {});
  }

  // ── Slack delivery via Composio ─────────────────────────────────────────────
  // Sends report summary to each #channel mentioned in the delivery request.
  if (parsed.slackTargets.length) {
    const { executeComposioAction } = await import("./mcp-router.js").catch(() => ({}));
    const slackResults = [];
    for (const channel of parsed.slackTargets) {
      try {
        const summary = parsed.executiveSummary || parsed.narrative || `${parsed.reportName} report is ready.`;
        const text = [
          `*${parsed.reportName} Report*`,
          parsed.deliveryNote ? `_${parsed.deliveryNote}_` : "",
          summary.slice(0, 2800),
          parsed.docUrl ? `<${parsed.docUrl}|Open full report>` : "",
        ].filter(Boolean).join("\n");

        const slackRes = typeof executeComposioAction === "function"
          ? await executeComposioAction("SLACK_SENDS_A_MESSAGE", {
              channel,
              text,
              mrkdwn: true,
            }, companyId || "default")
          : { skipped: true, reason: "executeComposioAction unavailable" };

        slackResults.push({ channel, result: slackRes });
      } catch (slackErr) {
        console.warn(`[report_delivery] Slack send to ${channel} failed:`, slackErr.message);
        slackResults.push({ channel, error: slackErr.message });
      }
    }
    results.slackResults = slackResults;
  }

  return { parsed, ...results };
}

// ─── AgentMail inbound webhook handler ────────────────────────────────────────
// AgentMail calls this endpoint when a user replies to a report email.
// We route the reply into the sam agent as a report_delivery task so it
// can respond, thread, or trigger follow-up actions.
async function handleAgentMailInbound(payload) {
  const { from, subject, text, html, inbox_id, message_id, thread_id } = payload || {};
  if (!from || !text) return { ignored: true, reason: "missing from/text" };

  const companyId = inbox_id ? `agentmail-${inbox_id}` : "default";
  const bodyText = String(text || html || "").slice(0, 3000);

  // ── Check if this is an automation activation reply ──────────────────────────
  // Look for a pending suggestion associated with this inbox/thread
  const apiKey = process.env.AGENTMAIL_API_KEY || "";
  const suggestions = await loadPendingSuggestions();
  const threadKey = inbox_id && thread_id ? `${inbox_id}/${thread_id}` : null;
  const inboxKey = inbox_id ? `inbox/${inbox_id}` : null;
  const pending = (threadKey && suggestions[threadKey]) || (inboxKey && suggestions[inboxKey]);

  if (pending && apiKey) {
    const parsedNums = parseAutomationReplyNumbers(bodyText);
    // parsedNums === null means "all"; empty array means no numbers found → fall through to Sam
    if (parsedNums === null || (Array.isArray(parsedNums) && parsedNums.length > 0)) {
      const allAutomations = pending.automations || [];
      const selectedAutomations = parsedNums === null
        ? allAutomations
        : allAutomations.filter(a => parsedNums.includes(a.id));

      if (selectedAutomations.length > 0) {
        console.log(`[agentmail_inbound] automation activation reply from ${from}: activating ${selectedAutomations.map(a => a.name).join(", ")}`);

        // Schedule each automation as a deployment entry
        const scheduledResults = [];
        for (const automation of selectedAutomations) {
          try {
            const deploymentEntry = {
              agentName: automation.agentName,
              agentTarget: automation.name,
              workspaceId: pending.companyId,
              companyId: pending.companyId,
              schedule: automation.schedule,
              query: `Run ${automation.name} for company ${pending.companyId} and email the report to ${pending.userEmail}.`,
              task_type: automation.task_type,
              deliveryEmail: pending.userEmail,
              createdAt: new Date().toISOString(),
              status: "active",
            };

            const queue = await readDeploymentQueue();
            const newEntry = {
              id: randomUUID(),
              ...deploymentEntry,
              nextRunAt: null,
              lastRunAt: null,
              error: null,
            };
            queue.push(newEntry);
            await writeDeploymentQueue(queue);
            scheduledResults.push({ automation: automation.name, id: newEntry.id, status: "scheduled" });
          } catch (schedErr) {
            console.warn(`[agentmail_inbound] failed to schedule ${automation.name}:`, schedErr.message);
            scheduledResults.push({ automation: automation.name, status: "failed", error: schedErr.message });
          }
        }

        // Send confirmation email
        await sendAutomationConfirmationEmail({
          apiKey,
          userEmail: pending.userEmail,
          companyId: pending.companyId,
          threadId: thread_id || pending.threadId,
          inboxId: inbox_id || pending.inboxId,
          selectedAutomations,
        });

        // Clean up pending suggestion
        if (threadKey) delete suggestions[threadKey];
        if (inboxKey) delete suggestions[inboxKey];
        await savePendingSuggestions(suggestions);

        return { handled: true, type: "automation_activation", scheduled: scheduledResults };
      }
    }
  }

  // ── Fall through: route to Sam for general handling ──────────────────────────
  const query = [
    `Inbound email reply received.`,
    `From: ${from}`,
    `Subject: ${subject || "(no subject)"}`,
    `Thread: ${thread_id || message_id || "unknown"}`,
    `\nMessage:\n${bodyText}`,
    `\nPlease acknowledge, answer any questions, and decide if any follow-up actions or new tasks are needed.`,
  ].join("\n");

  try {
    const { runAgent } = await import("./mcp-router.js").catch(() => ({}));
    // Route to Sam (messaging agent) as a chain_trigger task
    // Sam has gmail/outlook connectors and can send a threaded reply via Composio
    const result = typeof runAgent === "function"
      ? await runAgent({ name: "sam", task_type: "chain_trigger", query, company_id: companyId })
      : { queued: true };
    return { handled: true, companyId, result };
  } catch (err) {
    console.error("[agentmail_inbound] handler error:", err.message);
    return { handled: false, error: err.message };
  }
}

// ─── Helena-style integration email automation loop ───────────────────────────
// When a user connects a Composio integration, we automatically:
//   1. Send a proactive suggestion email with numbered automations
//   2. Parse the user's reply to activate selected automations
//   3. Schedule them as deployment entries and send a confirmation email

const PENDING_SUGGESTIONS_FILE = join(__dirname, "data/pending-suggestions.json");
const TODAY_REPORT_PATH = join(__dirname, "data/today-report.json");

async function loadPendingSuggestions() {
  try {
    const raw = await readFile(PENDING_SUGGESTIONS_FILE, "utf8").catch(() => "{}");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function savePendingSuggestions(data) {
  try {
    await mkdir(dirname(PENDING_SUGGESTIONS_FILE), { recursive: true });
    await writeFile(PENDING_SUGGESTIONS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("[suggestions] failed to save pending suggestions:", err.message);
  }
}

async function saveTodayReport({ subject, body, recipients, agentName }) {
  try {
    await mkdir(dirname(TODAY_REPORT_PATH), { recursive: true });
    await writeFile(TODAY_REPORT_PATH, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      savedAt: new Date().toISOString(),
      subject: subject || "",
      body: body || "",
      recipients: recipients || [],
      agentName: agentName || "sam",
    }, null, 2), "utf8");
  } catch (err) {
    console.warn("[today-report] failed to save:", err.message);
  }
}

/** Parse "1 2 3", "1, 2, 3", "1 and 2", "all", "yes" into a Set of 1-based ints (or null = all) */
function parseAutomationReplyNumbers(text) {
  const lower = text.toLowerCase().trim();
  if (/\b(all|yes|everything|activate all|schedule all)\b/.test(lower)) return null; // null = all
  const nums = [];
  const matches = lower.matchAll(/\b([1-9]\d?)\b/g);
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 20) nums.push(n);
  }
  return nums.length ? [...new Set(nums)] : null;
}

/** Connector → automation suggestions. Each automation maps to an agent + task_type + schedule label. */
const CONNECTOR_AUTOMATIONS = {
  ga4: [
    { name: "Weekly Traffic Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "maya", task_type: "daily_market_scan", description: "Sessions, top pages, channels, and week-over-week growth" },
    { name: "Monthly Growth Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "maya", task_type: "daily_market_scan", description: "Month-over-month comparison: traffic, conversions, bounce rate" },
    { name: "Anomaly Alerts", schedule: "daily at 8am", scheduleHuman: "Daily · 8am", agentName: "maya", task_type: "daily_market_scan", description: "Immediate alert when traffic drops > 20% from 7-day average" },
  ],
  gsc: [
    { name: "Weekly SEO Digest", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "maya", task_type: "seo_audit", description: "Top queries, click share, ranking shifts, new keyword opportunities" },
    { name: "Rank Change Alerts", schedule: "daily at 8am", scheduleHuman: "Daily · 8am", agentName: "maya", task_type: "seo_audit", description: "Keywords that moved ±5 positions — catch drops before they hurt" },
    { name: "Monthly SEO Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "maya", task_type: "seo_audit", description: "Impression and click growth, new ranking keywords, coverage issues" },
  ],
  youtube: [
    { name: "Weekly Channel Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "kiran", task_type: "social_monitor", description: "Views, watch time, subscriber growth, top-performing videos" },
    { name: "Video Launch Alert", schedule: "on upload", scheduleHuman: "On each upload", agentName: "kiran", task_type: "social_monitor", description: "First-24-hour metrics for every new video — catch early signals" },
    { name: "Monthly Analytics Summary", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "kiran", task_type: "social_monitor", description: "Channel-level MoM comparison and content recommendations" },
  ],
  linkedin: [
    { name: "Weekly Content Performance", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "kiran", task_type: "social_monitor", description: "Post impressions, engagement rate, follower growth this week" },
    { name: "Monthly Company Page Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "kiran", task_type: "social_monitor", description: "Follower demographics, top posts, competitive benchmarks" },
    { name: "High-Engagement Alert", schedule: "daily at 8am", scheduleHuman: "Daily · 8am", agentName: "kiran", task_type: "social_monitor", description: "Alert when a post hits 2× your average engagement — amplify fast" },
  ],
  instagram: [
    { name: "Weekly Content Performance", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "kiran", task_type: "social_monitor", description: "Reach, saves, shares, and follower growth this week" },
    { name: "Monthly Engagement Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "kiran", task_type: "social_monitor", description: "Best-performing content, hashtag analysis, audience insights" },
  ],
  hubspot: [
    { name: "Weekly Deals Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "arjun", task_type: "lead_score", description: "New deals created, pipeline value, stage-by-stage movement" },
    { name: "Monthly Revenue Intelligence", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "arjun", task_type: "lead_score", description: "Won/lost analysis, average deal cycle, conversion by source" },
    { name: "Weekly Email Campaign Digest", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "sam", task_type: "report_delivery", description: "Open rates, click rates, and top-performing campaigns this week" },
  ],
  google_ads: [
    { name: "Weekly Campaign Performance", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "zara", task_type: "campaign_brief", description: "Spend, clicks, impressions, CTR, and ROAS by campaign" },
    { name: "Daily Budget Alert", schedule: "daily at 8am", scheduleHuman: "Daily · 8am", agentName: "zara", task_type: "campaign_brief", description: "Alert if any campaign is over- or under-pacing its daily budget" },
    { name: "Monthly ROAS Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "zara", task_type: "campaign_brief", description: "Return-on-ad-spend trends, keyword winners/losers, optimisation plan" },
  ],
  meta_ads: [
    { name: "Weekly Ad Performance", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "zara", task_type: "campaign_brief", description: "Spend, reach, CPM, CPC, ROAS across all active ad sets" },
    { name: "Creative Fatigue Alert", schedule: "daily at 8am", scheduleHuman: "Daily · 8am", agentName: "zara", task_type: "campaign_brief", description: "Flag creatives with declining CTR so you can swap them before costs spike" },
    { name: "Monthly ROI Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "zara", task_type: "campaign_brief", description: "Channel ROAS, audience performance, and budget reallocation plan" },
  ],
  linkedin_ads: [
    { name: "Weekly LinkedIn Ads Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "zara", task_type: "campaign_brief", description: "Impressions, clicks, leads generated, CPL by campaign" },
    { name: "Monthly B2B Funnel Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "zara", task_type: "campaign_brief", description: "Lead quality, MQL conversion, cost per qualified lead" },
  ],
  apollo: [
    { name: "Weekly Prospect Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "isha", task_type: "icp_build", description: "New prospects added, ICP match scores, email open rates" },
    { name: "Monthly Lead Quality Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "arjun", task_type: "lead_score", description: "Enrichment coverage, sequence performance, conversion to opportunity" },
  ],
  klaviyo: [
    { name: "Weekly Email Performance", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "sam", task_type: "report_delivery", description: "Campaigns sent, open/click rates, revenue attributed, list growth" },
    { name: "Flow Performance Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "sam", task_type: "report_delivery", description: "Automated flow revenue, conversion rates, drop-off points" },
  ],
  semrush: [
    { name: "Weekly SEO Rankings Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "maya", task_type: "seo_audit", description: "Keyword rank changes, organic traffic trends, backlink gains/losses" },
    { name: "Monthly Competitive Analysis", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "dev", task_type: "competitor_scan", description: "Share of voice vs competitors, content gap opportunities" },
  ],
  ahrefs: [
    { name: "Weekly Backlink Monitor", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "maya", task_type: "seo_audit", description: "New and lost backlinks, domain rating changes, referring domains" },
    { name: "Monthly SEO Health Report", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "maya", task_type: "seo_audit", description: "DR trend, top pages by traffic, content decay report" },
  ],
  shopify: [
    { name: "Weekly Revenue Report", schedule: "every Monday at 9am", scheduleHuman: "Weekly · Mondays 9am", agentName: "zara", task_type: "campaign_brief", description: "Orders, revenue, AOV, top products, refund rate" },
    { name: "Monthly Store Performance", schedule: "first Monday of month", scheduleHuman: "Monthly · First Monday", agentName: "dev", task_type: "competitor_scan", description: "MoM revenue growth, customer LTV, conversion rate by source" },
  ],
};

/** Pretty name for a connector ID */
function connectorDisplayName(connectorId) {
  const nameMap = {
    ga4: "Google Analytics 4", gsc: "Google Search Console", youtube: "YouTube",
    linkedin: "LinkedIn", instagram: "Instagram", hubspot: "HubSpot",
    google_ads: "Google Ads", meta_ads: "Meta Ads", linkedin_ads: "LinkedIn Ads",
    apollo: "Apollo", klaviyo: "Klaviyo", semrush: "Semrush", ahrefs: "Ahrefs",
    shopify: "Shopify", google_sheets: "Google Sheets", slack: "Slack",
    gmail: "Gmail", outlook: "Outlook", mailchimp: "Mailchimp",
    salesforce: "Salesforce", zoho_crm: "Zoho CRM", mixpanel: "Mixpanel",
    amplitude: "Amplitude",
  };
  return nameMap[connectorId] || connectorId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Send a proactive automation suggestion email when a user connects an integration.
 * Returns { sent: bool, threadId?, inboxId?, automations? }
 */
async function sendIntegrationSuggestionEmail({ connectorId, userEmail, companyId, userName }) {
  const apiKey = process.env.AGENTMAIL_API_KEY || "";
  if (!apiKey || !userEmail) return { sent: false, reason: "missing apiKey or email" };

  const automations = CONNECTOR_AUTOMATIONS[connectorId];
  if (!automations?.length) return { sent: false, reason: "no automations defined for connector" };

  const integrationName = connectorDisplayName(connectorId);
  const greeting = userName ? `Hey ${userName.split(" ")[0]},` : "Hey,";

  const bulletLines = automations.map((a, i) => `${i + 1}. **${a.name}** — ${a.scheduleHuman}\n   ${a.description}`).join("\n\n");
  const bulletLinesHtml = automations.map((a, i) =>
    `<tr>
      <td style="padding:8px 12px;font-size:15px;font-weight:600;color:#e2e8f0;white-space:nowrap;vertical-align:top;">${i + 1}.</td>
      <td style="padding:8px 12px;vertical-align:top;">
        <div style="font-size:15px;font-weight:600;color:#e2e8f0;">${a.name}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${a.scheduleHuman} · ${a.description}</div>
      </td>
    </tr>`
  ).join("\n");

  const text = `${greeting}

Your ${integrationName} connection is live. Here's what I can run automatically for you:

${bulletLines}

Reply with the numbers you'd like activated — e.g. "1 2 3" or "all" — and I'll set them up immediately and send you a confirmation with the full schedule.

— Marqq`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Marqq · ${integrationName} automations</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid #334155;">
      <div style="font-size:13px;font-weight:600;color:#6366f1;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Marqq</div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#f1f5f9;">${integrationName} is connected</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#cbd5e1;">Your <strong style="color:#f1f5f9;">${integrationName}</strong> connection is live. Here's what I can run automatically for you:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        ${bulletLinesHtml}
      </table>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#94a3b8;">Reply with the numbers you'd like activated — e.g. <strong style="color:#e2e8f0;">"1 2 3"</strong> or <strong style="color:#e2e8f0;">"all"</strong> — and I'll set them up immediately.</p>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;">— Marqq</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const inbox = await ensureAgentMailInbox(apiKey, companyId || "default");
    const result = await agentMailFetch(
      `/inboxes/${encodeURIComponent(inbox.inbox_id)}/messages/send`,
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          to: [userEmail],
          subject: `Your ${integrationName} is connected — here's what Marqq can do automatically`,
          text,
          html,
        }),
      }
    );

    // Persist pending suggestions keyed by inboxId+threadId so we can match the reply
    const suggestions = await loadPendingSuggestions();
    const threadId = result?.thread_id || result?.message_id || `${inbox.inbox_id}-${Date.now()}`;
    const key = `${inbox.inbox_id}/${threadId}`;
    suggestions[key] = {
      connectorId,
      companyId: companyId || "default",
      userEmail,
      automations: automations.map((a, i) => ({ ...a, id: i + 1 })),
      inboxId: inbox.inbox_id,
      threadId,
      sentAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    // Also index by inboxId alone in case AgentMail gives us just the inbox on reply
    suggestions[`inbox/${inbox.inbox_id}`] = suggestions[key];
    await savePendingSuggestions(suggestions);

    console.log(`[integration_email] sent suggestion email to ${userEmail} for ${connectorId}, thread=${threadId}`);
    return { sent: true, threadId, inboxId: inbox.inbox_id, automations };
  } catch (err) {
    console.error("[integration_email] failed to send suggestion email:", err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send a confirmation email after user activates automations.
 */
async function sendAutomationConfirmationEmail({ apiKey, userEmail, companyId, threadId, inboxId, selectedAutomations }) {
  const tableRows = selectedAutomations.map(a =>
    `<tr>
      <td style="padding:8px 12px;font-size:14px;color:#e2e8f0;border-bottom:1px solid #334155;">${a.name}</td>
      <td style="padding:8px 12px;font-size:14px;color:#94a3b8;border-bottom:1px solid #334155;">${a.scheduleHuman}</td>
      <td style="padding:8px 12px;font-size:14px;color:#22c55e;border-bottom:1px solid #334155;white-space:nowrap;">✓ Scheduled</td>
    </tr>`
  ).join("\n");

  const tableRowsText = selectedAutomations.map(a => `• ${a.name} — ${a.scheduleHuman}`).join("\n");

  const text = `Done. Here's what I've scheduled:

${tableRowsText}

Results will be emailed automatically on the schedule above. You can adjust or pause any automation from your Marqq dashboard.

— Marqq`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Marqq · Automations scheduled</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid #334155;">
      <div style="font-size:13px;font-weight:600;color:#22c55e;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">✓ Scheduled</div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#f1f5f9;">Your automations are live</h1>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Automation</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Schedule</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;">Results will be emailed automatically on the schedule above.</p>
      <p style="margin:0;font-size:13px;color:#64748b;">— Marqq</p>
    </div>
  </div>
</body>
</html>`;

  try {
    // Reply in the same thread if we have threadId
    const endpoint = threadId
      ? `/inboxes/${encodeURIComponent(inboxId)}/messages/send`
      : `/inboxes/${encodeURIComponent(inboxId)}/messages/send`;

    const body = {
      to: [userEmail],
      subject: "Your Marqq automations are scheduled",
      text,
      html,
    };
    if (threadId) body.thread_id = threadId;

    await agentMailFetch(endpoint, apiKey, { method: "POST", body: JSON.stringify(body) });
    console.log(`[integration_email] sent confirmation to ${userEmail}`);
    return { sent: true };
  } catch (err) {
    console.warn("[integration_email] failed to send confirmation email:", err.message);
    return { sent: false, error: err.message };
  }
}

function sanitizeAgentRunFullText(name, taskType, fullText) {
  const text = String(fullText || "");
  const contractIndex = text.indexOf("---CONTRACT---");
  const prose = contractIndex >= 0 ? text.slice(0, contractIndex) : text;
  const contract = contractIndex >= 0 ? text.slice(contractIndex) : "";

  let sanitized = prose;

  if (name === "zara" && taskType === "distribution_health_check") {
    sanitized = sanitized
      .replace(
        /\*\*1\.\s*Recent Agent Activity\*\*[\s\S]*?(?=\*\*2\.|\*\*Top 3 Priorities|\*\*3\.)/i,
        "**1. Recent Agent Activity**\n- No verified recent agent activity available in current context.\n\n",
      )
      .replace(
        /\*\*2\.\s*Market[\s\S]*?(?=\*\*3\.|\*\*Top 3 Priorities)/i,
        "**2. Watch Items (from current company context)**\n- Watch for competitor up-market positioning changes before changing channel mix.\n- Validate search-demand shifts with real SEO or search-console data before reallocating spend.\n- Validate nurture drop-off or lifecycle friction with real CRM/email metrics before changing lifecycle sequences.\n\n",
      )
      .replace(/\bobserved today\b/gi, "current-context watch items")
      .replace(/\bverified\b/gi, "context-grounded");
  }

  if (name === "kiran" && taskType === "daily_lifecycle_check") {
    sanitized = sanitized
      .replace(/\|[^\n]*\|[^\n]*\n(?:\|[^\n]*\|[^\n]*\n)+/g, "")
      .replace(/\*\*Retention & Social.?Engagement Snapshot\*\*[\s\S]*?(?=\*\*Top Conversation Angles\*\*)/i, "");
  }

  return `${sanitized.trim()}${contract ? `\n\n${contract.trim()}` : ""}`;
}

function buildAgentRunGuardrails(name, taskType) {
  const shared = [
    "Write for the end user, not for internal review.",
    "Do not include chain-of-thought, hidden reasoning, or long 'reasoning summary' sections.",
    "Start with the answer or deliverable immediately.",
    "Use concise section headers only when they improve readability.",
    "Do not wrap the whole response in markdown tables unless the user explicitly asked for a table.",
    "If source data is missing, say exactly what is missing instead of inventing specifics.",
    "Do not fabricate competitor moves, campaign copy, agent activity, KPI values, search volume, or proof points.",
    "If you must provide an example because source material is missing, label it explicitly as a sample and keep it separate from factual findings.",
    "Before the contract block, always include substantive user-facing prose. Do not return only JSON or only the contract.",
    "NEVER use the term 'MKG' in your user-facing response. Refer to it as 'company context', 'marketing context', or 'company knowledge' instead.",
    "NEVER reference internal system terms such as 'SOUL', 'run_id', 'company_id', 'task_type', or 'contract block' in user-facing text.",
  ];

  const agentSpecific = {
    priya: [
      "Only report competitor moves or threats that are grounded in provided company context, saved artifacts, or explicit public-web evidence.",
      "If no verified competitor move is available, say 'No verified recent competitor move found from current context' and continue with gaps and watch items.",
      "Never return an empty competitor section.",
    ],
    riya: [
      "CRITICAL: Always write readable prose BEFORE the contract block explaining your content strategy. Example: 'Based on your SEO gaps and target audience, here are the content pieces to prioritize:' — then your recommendations and outlines.",
      "Provide complete content outlines with at least 4-5 sections per idea, not just titles.",
      "Include target keywords, search intent, and estimated volume for each content piece.",
    ],
    sam: [
      "Audit only real copy when it is present in context.",
      "If exact copy is missing, say that the audit is limited and provide optional sample rewrites in a separate 'Sample rewrite' section.",
      "Do not present invented original copy as if it came from the company.",
      "When writing email sequences: write the COMPLETE email body — never use bracket placeholders like [Case Study Link], [desirable outcome], [Date], [Client Name]. If you need to reference a client story, write a generic narrative like 'A prop-tech founder we worked with...' without naming a real company.",
      "Do not invent specific metrics in email copy (e.g. 'boost accuracy by 40%', 'reduce time by 6 months'). Use benefit language instead: 'faster valuation cycles', 'better-fit leads', 'less manual work'.",
      "When the task is a proposal template: your artifact.data MUST use the proposal schema — do NOT use strategy_overview/phases. Required fields: proposal_title (string), executive_summary (string), problem_statement (string), our_approach (string), deliverables (array), pricing_tiers (array of {name, price_signal, whats_included}), next_steps (string).",
    ],
    zara: [
      "CRITICAL: Always write readable prose BEFORE the contract block explaining your channel and campaign logic. Example: 'Based on the company's positioning and ICP, here are the recommended channels for the next 90 days and why:' — then your channel breakdown.",
      "Do not fabricate agent activity, market signals, or channel performance.",
      "If today's activity or signal data is unavailable, say that explicitly and shift to a recommended action brief based on current company context.",
      "Do not imply that agent activity happened today unless the activity is explicitly present in current context.",
      "If recent agent activity is not explicitly present, write exactly: 'No verified recent agent activity available in current context.'",
      "If a market signal is not explicitly verified, label it as a watch item, not as an observed event.",
      "Do not return the response as raw JSON.",
      "Do not use words like 'verified', 'observed', 'latest', 'today', or percentage deltas unless those facts are explicitly present in current context.",
      "If search-trend, CRM, email, or channel metrics are not explicitly present, omit them rather than estimating them.",
    ],
    dev: [
      "CRITICAL: Always write readable prose BEFORE the contract block, even if live metrics are missing. Example: 'Without real conversion data, based on industry benchmarks and your business model, here are the priority improvements:' — then your recommendations.",
      "Never invent KPI baselines, ROAS, CPA, spend, conversion rate, or variance numbers.",
      "If exact KPI data is not available, respond with 'Missing KPI dataset for verification' and list the minimum data needed.",
      "Do not use hypothetical numbers in the main output.",
    ],
    arjun: [
      "CRITICAL: Always write readable prose BEFORE the contract block, even if live data is missing. Example: 'Without connected CRM data, I analyzed based on the industry and ICP context you provided. Here are the key segments and outreach priorities:' — then your recommendations.",
      "Never invent predicted or actual KPI values.",
      "If verified performance data is missing, respond with 'Missing outcome verification dataset' and list the required inputs.",
      "Do not score prediction accuracy without real observed metrics.",
      "When including tasks_created entries, every entry MUST have all required fields populated: task_type (e.g. 'lead_qualification', 'outreach_email', 'campaign_analysis'), agent_name (e.g. 'sam', 'dev', 'kiran'), description, and priority. Never leave task_type or agent_name blank or null.",
    ],
    isha: [
      "Prefer crisp bullet points over long narrative explanation.",
      "Tie each market signal back to the company context in one sentence.",
      "CRITICAL: Your competitor_set MUST use the exact competitor names from Company.competitors in the MKG (e.g. 'Successive Technologies', 'Appinventiv', 'ValueCoders', 'Tata Elxsi', 'Persistent Systems'). Do NOT substitute with large global vendors (IBM, Google Cloud, Microsoft Azure) unless they are explicitly listed in Company.competitors. The company competes with the MKG-listed players, not generic enterprise AI providers.",
      "CRITICAL: Use the exact ICP segment names from Company.icp — not renamed, broadened, or generalized versions.",
    ],
    kiran: [
      "Do not include long reasoning walkthroughs.",
      "When writing social media post drafts: do NOT include specific ₹ amounts, percentages, deal counts, or response rates in the post copy unless those exact figures appear in Company.offers, Company.content_pillars, or Company.messaging. Use questions, frameworks, and observations instead — never fabricated proof points.",
      "Do not write posts formatted as client case studies or testimonials (e.g. 'a Series A founder told us...', '₹40L pipeline in 6 weeks', '8 demos booked') — these are false testimonials and will damage credibility.",
      "Post hooks must be opinion-led, question-led, or observation-led — not results-led with invented numbers.",
      "Do not fabricate client success stories or proof points that are not present in the company context.",
    ],
    neel: [
      "Avoid long reasoning preambles.",
      "Lead with the positioning, ICP, channel split, and 90-day plan.",
      "Always use real competitor names from Company.competitors in the company knowledge base. Never substitute with generic labels like 'Company A', 'Competitor B', or 'Player X'. Use the actual company name and its specific weakness from the MKG.",
      "Always use exact ICP segment names and firmographics from Company.icp when describing target segments.",
      "Your artifact.data must always use your native schema: positioning_angle, target_segment, channel_priorities, 90_day_plan, rejected_alternatives, risks. Never return strategy_overview/phases.",
    ],
    tara: [
      "Lead with the deliverable itself, not the rationale table.",
      "CRITICAL: Never fabricate named client case studies. Do not write copy like 'Razorpay reduced X by Y% using our product' or 'how [Real Company]'s team achieved Z' — these are false testimonials using real company names. This causes legal and reputational harm.",
      "CRITICAL: Do not invent specific conversion rate predictions (e.g. 'opt in at 18-25%', 'convert 4-6% of sequence completers'). These are fabricated benchmarks. Remove all 'conversion_hypothesis' or 'expected_lift' fields that contain invented percentages.",
      "Do not claim false social proof metrics like 'Used by 200+ Indian SaaS Teams' unless that exact number is in Company.offers or Company.content_pillars in the MKG.",
      "When writing email sequences or lead magnets: use narrative proof (describe the category of customer and their challenge) rather than named companies or invented conversion rates.",
      "Do not include specific percentage or numeric outcomes in case study narratives even when the company is anonymous (e.g. '30% lift in qualified leads', 'cut build time by 50%'). Describe results qualitatively: 'faster build cycles', 'higher lead quality', 'more demo requests' — the numbers are not verified and read as false advertising.",
    ],
    maya: [
      "CRITICAL: Always write 2-3 sentences of readable prose BEFORE the contract block explaining your findings, even if live SEO data is missing. For example: 'Without direct GSC access, I analyzed the domain using public SEO patterns. Based on the URL structure and target market, here are the opportunities:' — then your bullet points or recommendations.",
      "Keep the preamble short and spend tokens on the actual SEO deliverables.",
      "When the task is to write a blog post or article: your artifact.data MUST use the article schema — do NOT use strategy_overview/phases. Required fields: title (string), meta_description (string), target_keyword (string), word_count (number), sections (array of {heading, content}). Write the full article content in sections.",
      "When the task is an SEO content strategy: your artifact.data MUST use the content_strategy schema — content_pillars, topic_clusters, publishing_calendar.",
    ],
  };

  const taskSpecific = {
    daily_competitor_scan: [
      "Competitor scans must prefer verified observations over broad market generalities.",
    ],
    distribution_health_check: [
      "When recent activity data is missing, provide a concise action brief instead of a fabricated status digest.",
      "Do not present synthetic timestamps, synthetic activity logs, or synthetic metric deltas as facts.",
      "For the 'Recent Agent Activity' section, include only items explicitly present in current context; otherwise output exactly one bullet: 'No verified recent agent activity available in current context.'",
      "For the 'Market Signals' section, include only signals explicitly supported by current context; otherwise convert them into 'watch items' with that label.",
    ],
    daily_lifecycle_check: [
      "Return a concise operator-ready briefing, not a diagnostic essay.",
      "If lifecycle metrics are missing, note the gap in one bullet and continue with context-grounded call angles only.",
    ],
    nightly_kpi_watch: [
      "KPI watch outputs require real metric inputs; without them, return a data-gap response instead of analysis.",
    ],
    weekly_outcome_verification: [
      "Outcome verification requires actual and predicted values; without both, return a data-gap response instead of a score.",
    ],
    audience_profiles: [
      "For B2B companies, define ICPs using firmographics such as company size, team maturity, function ownership, workflow complexity, or digital maturity.",
      "Do not use consumer wealth tiers, net-worth bands, family-office language, HNI/UHNI framing, or investor personas unless the selected company explicitly operates in wealth or investment services.",
      "If the company profile points to software, AI, SaaS, services, or B2B solutions, keep the ICPs anchored to business buyers and operational use cases.",
    ],
    generate_image: [
      "Use native image generation first for the first draft or concept asset.",
      "Prefer the generate_social_image automation before using Canva tools, even if Canva is connected.",
      "Use Canva only as a secondary tool for design import, resize, autofill, export, template-based production, or packaging the native draft into channel-ready assets.",
    ],
    generate_video: [
      "Use native video generation first for the first draft or concept asset.",
      "Prefer the generate_faceless_video automation before using Veo tools, even if Veo is connected.",
      "Use Veo tools only as a secondary path for direct operation handling, polling, download, or explicit toolkit-level control after the native generation path has been chosen.",
    ],
    marketing_report: [
      "If Google Docs or Google Drive tools are available in this run, use them to create or store the report before finishing.",
      "For report documents, create a native Google Doc layout with normal headings, paragraphs, and lists. Do not leave markdown syntax visible in the final document.",
      "Prefer non-markdown Google Docs creation and update tools when they are available.",
      "Do not claim Google Docs, Google Drive, or OneDrive are unavailable unless the tool list for this run truly omitted them.",
      "If a Google Docs creation tool succeeds, include the resulting doc URL in artifact.data.doc_url.",
      "If a storage tool succeeds, include the resulting file URL in artifact.data.file_url.",
      "Do not leave doc_url or file_url null after a successful document or file creation call.",
    ],
  };

  const lines = [
    "## Response Guardrails",
    ...shared.map((item) => `- ${item}`),
    ...(agentSpecific[name] || []).map((item) => `- ${item}`),
    ...(taskSpecific[taskType] || []).map((item) => `- ${item}`),
  ];
  return `\n\n${lines.join("\n")}`;
}

// Tools blocked for ALL task types (destructive / formatting-only actions that LLMs misuse)
const ALWAYS_BLOCKED_TOOLS = new Set([
  "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
  "GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN",
  "GOOGLEDOCS_UPDATE_DOCUMENT_SECTION_MARKDOWN",
  "GOOGLESHEETS_CREATE_DOCUMENT_MARKDOWN",
  "GOOGLESHEETS_UPDATE_DOCUMENT_MARKDOWN",
]);

// Tools only safe to call when task explicitly involves outbound messaging
const SEND_TOOLS = new Set([
  "GMAIL_SEND_EMAIL", "GMAIL_SEND_DRAFT",
  "OUTLOOK_SEND_EMAIL", "OUTLOOK_SEND_DRAFT",
  "SLACK_SENDS_A_MESSAGE", "SLACK_SEND_MESSAGE",
  "WHATSAPP_SEND_MESSAGE",
  "HUBSPOT_CREATE_ENGAGEMENT", // creates a note/activity, effectively sends
  "INSTANTLY_SEND_EMAIL",
  "LEMLIST_SEND_EMAIL",
]);

// Task types that are permitted to call send/write tools
const WRITE_PERMITTED_TASK_TYPES = new Set([
  "marketing_report",
  "report_delivery",
  "outreach_email",
  "lead_qualification",
  "email_sequence",
  "campaign_analysis",
  "distribution_health_check",
  "chain_trigger",
]);

function filterComposioToolsForTaskType(taskType, tools) {
  const list = Array.isArray(tools) ? tools : [];
  const canSend = WRITE_PERMITTED_TASK_TYPES.has(taskType);

  return list.filter((tool) => {
    const toolName =
      tool?.function?.name ||
      tool?.name ||
      tool?.slug ||
      "";
    if (ALWAYS_BLOCKED_TOOLS.has(toolName)) return false;
    if (SEND_TOOLS.has(toolName) && !canSend) return false;
    return true;
  });
}

const AGENT_PROFILES = {
  isha: {
    title: "Market Research",
    personality:
      "Structured, curious, and skeptical of weak market claims.",
    executes: [
      "Map market segments and demand patterns",
      "Surface validated competitor and buyer insights",
      "Hand strategy a cleaner market picture before execution decisions",
    ],
  },
  neel: {
    title: "Strategy",
    personality:
      "Tradeoff-driven, clear-headed, and focused on decisions rather than abstractions.",
    executes: [
      "Turn research into positioning and channel priorities",
      "Choose strategic focus areas and deprioritize distractions",
      "Translate market context into actionable GTM direction",
    ],
  },
  tara: {
    title: "Offer Engineering",
    personality:
      "Commercial, precise, and focused on improving conversion clarity.",
    executes: [
      "Refine offers, CTA structure, and value packaging",
      "Identify friction in the path from interest to action",
      "Convert strategy into stronger buying mechanics",
    ],
  },
  zara: {
    title: "Distribution",
    personality:
      "Urgent, pragmatic, and biased toward channels that can move now.",
    executes: [
      "Choose distribution mix across paid, organic, outbound, and partner channels",
      "Sequence launches and campaign activation steps",
      "Turn strategy and content into executable channel plans",
    ],
  },
  maya: {
    title: "SEO/Content",
    personality:
      "Methodical, evidence-driven, and focused on discoverability through search and content.",
    executes: [
      "Identify SEO and answer-engine gaps",
      "Map content opportunities tied to discoverability",
      "Improve the connection between search demand and content output",
    ],
  },
  riya: {
    title: "Content Creation",
    personality:
      "Fast-moving, editorially sharp, and tuned to shipping campaign-ready assets.",
    executes: [
      "Create briefs, drafts, and campaign asset packs",
      "Turn strategy and SEO direction into publishable work",
      "Support distribution, messaging, and lifecycle execution with content",
    ],
  },
  arjun: {
    title: "Funnel/Leads",
    personality:
      "Analytical, conversion-oriented, and impatient with weak lead signals.",
    executes: [
      "Diagnose funnel leakage and lead quality issues",
      "Prioritize leads and next actions by ICP fit and timing",
      "Translate demand signals into pipeline-focused decisions",
    ],
  },
  dev: {
    title: "Analytics",
    personality:
      "Rigorous, numerate, and focused on decision-ready metric interpretation.",
    executes: [
      "Interpret KPI movement against baselines",
      "Surface measurement gaps and performance shifts",
      "Translate data into strategy and distribution decisions",
    ],
  },
  priya: {
    title: "Competitive Intelligence",
    personality:
      "Alert, pattern-oriented, and disciplined about evidence from the market.",
    executes: [
      "Track competitor moves and narrative shifts",
      "Explain why external change matters to the company",
      "Feed strategy, distribution, and SEO with competitive signals",
    ],
  },
  kiran: {
    title: "Lifecycle/Social",
    personality:
      "Audience-aware, operational, and focused on repeat engagement.",
    executes: [
      "Manage social and lifecycle engagement signals",
      "Spot nurture and retention opportunities after acquisition",
      "Translate audience response into next-step channel actions",
    ],
  },
  sam: {
    title: "Messaging",
    personality:
      "Precise, persuasive, and focused on making every message clearer.",
    executes: [
      "Sharpen core messages, nurture copy, and CTA language",
      "Connect offer clarity to funnel-stage communication",
      "Turn strategy into deployable message systems",
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
const TEST_MODE = process.env.AGENT_RUN_TEST_MODE === "1";
const MKG_TOP_LEVEL_FIELDS = [
  "positioning",
  "icp",
  "competitors",
  "offers",
  "messaging",
  "channels",
  "funnel",
  "metrics",
  "baselines",
  "content_pillars",
  "campaigns",
  "insights",
];
const PORT = Number(process.env.BACKEND_PORT || 3008);
const KPI_ROUTE_FIELDS = [
  "id",
  "company_id",
  "metric_date",
  "source_scope",
  "currency",
  "spend",
  "revenue",
  "impressions",
  "clicks",
  "leads",
  "conversions",
  "ctr",
  "cpc",
  "cpl",
  "cpa",
  "roas",
  "source_snapshot_ids",
  "ingested_at",
  "created_at",
  "updated_at",
];
const NIGHTLY_ANOMALY_SCHEDULE_UTC =
  process.env.CONTENT_ENGINE_NIGHTLY_SCHEDULE_UTC || "18:30"; // 18:30 UTC == 00:00 IST
const KPI_DAYS_DEFAULT = 30;
const KPI_DAYS_MIN = 1;
const KPI_DAYS_MAX = 90;
const OUTCOME_DAYS_ALLOWED = new Set([7, 30, 90]);
const groq = tracedGroq;
// Model lists — primary entry resolves LLM_PROVIDER / LLM_MODEL first,
// then falls through to Groq models as a safety net when provider is Groq.
// When LLM_PROVIDER=claude the first entry is the Claude model; Groq fallbacks
// only fire if the Anthropic request itself fails (which is handled per call-site).
const COMPANY_INTEL_GROQ_MODELS = [
  getLLMModel('company-intel'),
  ...(isGroqProvider ? ["llama-3.3-70b-versatile"] : []),
];
const COMPANY_PROFILE_GROQ_MODELS = [
  getLLMModel('company-profile'),
  ...(isGroqProvider ? ["llama-3.3-70b-versatile"] : []),
];
const AGENT_PLAN_GROQ_MODELS = [
  getLLMModel('agent-plan'),
  ...(isGroqProvider ? ["llama-3.3-70b-versatile"] : []),
];
const AGENT_RUN_NO_TOOL_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  getLLMModel('agent-run'),
  "openai/gpt-oss-120b",
].filter((model, index, models) => model && models.indexOf(model) === index);
const AGENT_RUN_TOOL_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  getLLMModel('agent-run-tool'),
  "openai/gpt-oss-120b",
].filter((model, index, models) => model && models.indexOf(model) === index);

/**
 * Firecrawl REST + optional browser_search are merged in runAgenticLoop only when
 * inferProviderForModel(model) === "groq". If LLM_PROVIDER=claude, agent-run-tool
 * may still resolve to a Claude id — so when FIRECRAWL_API_KEY is set we force
 * Groq-native ids (gpt-oss first) for /api/agents/:name/run.
 */
function resolveAgentRunFirecrawlGroqModels() {
  const fallbacks = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
  const envModel = (process.env.GROQ_AGENT_RUN_TOOL_MODEL || "").trim();
  const primary =
    envModel && inferProviderForModel(envModel) === "groq"
      ? envModel
      : fallbacks[0];
  const merged = [primary, ...fallbacks];
  return merged.filter((model, index, models) => model && models.indexOf(model) === index);
}

const AGENT_RUN_PRIMARY_PROVIDER = (
  process.env.AGENT_RUN_PRIMARY_PROVIDER ||
  process.env.COMPANY_INTEL_PRIMARY_PROVIDER ||
  "groq"
).toLowerCase();
const AGENT_RUN_GEMINI_MODEL =
  process.env.AGENT_RUN_GEMINI_MODEL ||
  process.env.GEMINI_PRIMARY_MODEL ||
  "gemini-3.1-pro-preview";
/** Groq reasoning (gpt-oss / qwen-qwq / deepseek-r1): default `medium`; override with AGENT_REASONING_EFFORT */
const RESOLVED_AGENT_REASONING_EFFORT =
  (process.env.AGENT_REASONING_EFFORT || "medium").trim().toLowerCase() || "medium";
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
  getLLMModel('voicebot'),
  ...(isGroqProvider ? ["llama-3.3-70b-versatile"] : []),
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
  process.env.TWILIO_SILENCE_FRAME_THRESHOLD || 10,
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
  process.env.TWILIO_INTERRUPT_SILENCE_FRAMES || 6,
);
const TWILIO_MAX_CONVERSATION_TURNS = Number(
  process.env.TWILIO_MAX_CONVERSATION_TURNS || 24,
);

const COMPANY_INTEL_KB_CATEGORIES = new Set([
  "brand_guidelines",
  "product_service_docs",
  "company_ppts",
]);

function extractDeclaredMkgFields(soulText, marker) {
  const pattern = new RegExp(`\\*\\*${marker}\\*\\*:\\s*([\\s\\S]*?)\\n\\*\\*`);
  const match = soulText.match(pattern);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.replace(/\s+/g, " ").trim())
    .map((value) => value.split(" ")[0])
    .filter((value) => MKG_TOP_LEVEL_FIELDS.includes(value));
}

export function buildTestModeContract({
  name,
  companyId,
  runId,
  soulText,
  query,
  triggerContext = null,
  calibrationNote = null,
}) {
  const writesTo =
    extractDeclaredMkgFields(soulText, "writes_to_mkg").slice(0, 2);
  const field = writesTo[0] || "insights";
  const today = new Date().toISOString().slice(0, 10);
  const patch = {
    [field]: {
      value: {
        summary: `Test mode patch for ${name}`,
        source: "AGENT_RUN_TEST_MODE",
        query,
      },
      confidence: 0.8,
      last_verified: today,
      source_agent: name,
      expires_at: today,
    },
  };
  return {
    agent: name,
    task: `test-mode run for ${name}`,
    company_id: companyId,
    run_id: runId,
    timestamp: new Date().toISOString(),
    input: {
      mkg_version: null,
      dependencies_read: ["SOUL.md", "MEMORY.md", "HEARTBEAT.md", "skills/*.md"],
      assumptions_made: ["AGENT_RUN_TEST_MODE generated deterministic output"],
    },
    artifact: {
      data: {
        mode: "test",
        agent: name,
        ...(calibrationNote?.text ? { calibration_note: calibrationNote.text } : {}),
        ...(triggerContext ? { trigger_context: triggerContext } : {}),
      },
      summary: `Test mode generated a deterministic AgentRunOutput for ${name}.`,
      confidence: 0.8,
    },
    context_patch: {
      writes_to: writesTo.length ? writesTo : [field],
      patch,
    },
    handoff_notes: `Test mode verified ${name} can produce a non-empty context patch.`,
    missing_data: [],
    tasks_created: [],
    outcome_prediction: null,
  };
}

export async function loadAgentPromptContext(agentName, companyId, options = {}) {
  const agentsDir = options.agentsDir || AGENTS_DIR;
  const memoryPath = getScopedAgentMemoryPath(agentName, companyId, agentsDir);
  const fallbackMemoryPath = getAgentMemoryPath(agentName, agentsDir);
  const heartbeatPath = getAgentHeartbeatPath(agentName, companyId, agentsDir);
  let memory = "";
  let heartbeat = "";

  try {
    memory = normalizePromptMarkdown(await readFile(memoryPath, "utf-8"));
  } catch {
    try {
      memory = normalizePromptMarkdown(await readFile(fallbackMemoryPath, "utf-8"));
    } catch {
      // Agent memory is optional.
    }
  }

  try {
    heartbeat = normalizePromptMarkdown(await readFile(heartbeatPath, "utf-8"));
  } catch {
    // Agent heartbeat markdown is optional.
  }

  let calibrationNote = null;
  if (companyId) {
    try {
      calibrationNote = await getLatestCalibrationNote(agentName, companyId, {
        agentsDir,
      });
    } catch (error) {
      console.warn(`[calibration] failed to load note for ${agentName}/${companyId}:`, error);
    }
  }

  return { memory, heartbeat, calibrationNote };
}

async function loadAgentSkillsBlock(agentName, agentsDir = AGENTS_DIR) {
  const sections = [];
  let primarySkill = "";

  try {
    primarySkill = (await readFile(join(agentsDir, agentName, "SKILL.md"), "utf-8")).trim();
    if (primarySkill) {
      sections.push(`### Core Agent Skill\n${primarySkill}`);
    }
  } catch {
    // Optional top-level skill file.
  }

  if (primarySkill) {
    const referencedSkillNames = Array.from(
      new Set(Array.from(primarySkill.matchAll(/`([a-z0-9-]+)`:/g), (match) => match[1])),
    );

    if (referencedSkillNames.length) {
      const vendoredSkillContents = await Promise.all(
        referencedSkillNames.map(async (skillName) => {
          try {
            const skillPath = join(MARKETINGSKILLS_DIR, skillName, "SKILL.md");
            const content = (await readFile(skillPath, "utf-8")).trim();
            return content ? `### ${skillName}\n${content}` : "";
          } catch {
            return "";
          }
        }),
      );

      vendoredSkillContents.filter(Boolean).forEach((content) => sections.push(content));
    }
  }

  try {
    const skillsDir = join(agentsDir, agentName, "skills");
    const files = (await readdir(skillsDir))
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (files.length) {
      const contents = await Promise.all(
        files.map((f) => readFile(join(skillsDir, f), "utf-8")),
      );
      contents.forEach((content, index) => {
        sections.push(`### ${files[index].replace(".md", "")}\n${content}`);
      });
    }
  } catch {
    // Optional skills directory.
  }

  if (!sections.length) return "";

  return (
    "\n\n## Your Available Skills\n" +
    "Use the closest applicable domain playbook below instead of improvising from scratch.\n\n" +
    sections.join("\n\n---\n\n")
  );
}

async function finalizeAgentRunResponse({
  name,
  runId,
  companyId,
  fullText,
  toolExecutions = [],
  res,
  startedAt,
  triggerContext = null,
}) {
  await markAgentHeartbeat(name, "completed", Date.now() - startedAt, null, companyId);

  let rawContract = extractContract(fullText);

  // Two-pass recovery: if the LLM dropped the ---CONTRACT--- block (token budget
  // exhausted mid-prose), ask a second fast non-streaming call to synthesise it.
  if (!rawContract) {
    console.warn(`[contract] ${name}/${runId}: sentinel missing — attempting recovery pass`);
    try {
      const prose = fullText.trim();
      const successfulToolContext = Array.isArray(toolExecutions) && toolExecutions.length
        ? `\nSuccessful or attempted tool executions for this run:\n${toolExecutions
            .map((entry) => JSON.stringify({
              tool: entry.emittedToolName || entry.requestedToolName,
              successful: entry.successful,
              data: entry.successful ? entry.data : null,
              error: entry.successful ? null : entry.error,
            }))
            .join("\n")}\n`
        : "";
      const recoveryPrompt = `You are a JSON extractor. The agent just produced the following response but forgot to append the ---CONTRACT--- block. Synthesise the contract JSON from the content below.

Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{
  "agent": "${name}",
  "task": "<one-line summary of what the agent did>",
  "company_id": "${companyId ?? null}",
  "run_id": "${runId}",
  "timestamp": "${new Date().toISOString()}",
  "input": { "mkg_version": null, "dependencies_read": [], "assumptions_made": [] },
  "artifact": {
    "data": "<IMPORTANT: extract structured data from the response below — do NOT leave this as {}. For a social calendar: {\"calendar\":[...],\"content_themes\":[...]}. For a strategy: {\"strategy_overview\":\"...\",\"phases\":[...]}. For leads: {\"leads\":[...]}. Extract whatever structured content is present.>",
    "summary": "<one paragraph summary extracted from the response>",
    "confidence": 0.75
  },
  "context_patch": { "writes_to": [], "patch": {} },
  "handoff_notes": "",
  "missing_data": [],
  "tasks_created": [],
  "outcome_prediction": null,
  "automation_triggers": []
}

IMPORTANT for artifact.data: You MUST extract real structured content from the agent response. Do not return an empty object {}.
- If the response contains a social media calendar, extract it as {"calendar": [...], "content_themes": [...], "platform_strategy": {...}}
- If the response contains a strategy/plan, extract key sections as {"strategy_overview": "...", "phases": [...], "recommendations": [...]}
- If the response contains leads/contacts, extract as {"leads": [...], "scoring": {...}}
- If the response contains analysis/audit, extract as {"findings": [...], "recommendations": [...], "priority_actions": [...]}
- Always populate artifact.data with whatever structured content you can extract.

If tool execution context is provided, also recover artifact.data fields such as doc_url and file_url.
If a successful Google Docs create call exists with a document_id, set artifact.data.doc_url to https://docs.google.com/document/d/<document_id>/edit.
If a successful Google Drive file creation exists with a file id, set artifact.data.file_url to https://drive.google.com/file/d/<id>/view.

Agent response to extract from:
${prose.slice(0, 15000)}
${successfulToolContext}`;

      const recoveryClient = tracedLLM({ traceName: 'contract-recovery', tags: ['recovery'] });
      const recovery = await recoveryClient.chat.completions.create({
        model: LLM_MODEL,
        messages: [{ role: "user", content: recoveryPrompt }],
        stream: false,
        max_tokens: 3000,
        temperature: 0,
        response_format: { type: "json_object" },
      });
      const recoveryText = recovery.choices[0]?.message?.content?.trim() || "";
      rawContract = JSON.parse(recoveryText);
      console.log(`[contract] ${name}/${runId}: recovery pass succeeded`);
    } catch (err) {
      console.warn(`[contract] ${name}/${runId}: recovery pass failed:`, err.message);
      res.write(`data: ${JSON.stringify({ contractError: "missing" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
  }

  const { valid, errors } = validateContract(rawContract);

  if (!valid) {
    console.warn(`[contract] ${name}/${runId}: validation failed:`, errors);
    res.write(`data: ${JSON.stringify({ contractError: "invalid", details: errors })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  rawContract.run_id = runId;
  rawContract.agent = name;
  if (companyId) rawContract.company_id = companyId;
  if (triggerContext) {
    rawContract.artifact = rawContract.artifact || {};
    rawContract.artifact.data = {
      ...(rawContract.artifact.data || {}),
      trigger_context: triggerContext,
    };
    rawContract.handoff_notes = [
      rawContract.handoff_notes,
      `Triggered by ${triggerContext.triggered_by} via ${triggerContext.hook_id}`,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  const reportData = rawContract?.artifact?.data;
  if (reportData && typeof reportData === "object") {
    const successfulGoogleDocCreate = toolExecutions.find((entry) =>
      entry?.successful &&
      ["GOOGLEDOCS_CREATE_DOCUMENT", "GOOGLEDOCS_CREATE_DOCUMENT2", "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN"].includes(entry?.emittedToolName) &&
      (
        entry?.data?.document_id ||
        entry?.data?.documentId ||
        entry?.data?.id ||
        entry?.data?.response_data?.documentId
      )
    );
    const successfulGoogleDriveFile = toolExecutions.find((entry) =>
      entry?.successful &&
      entry?.emittedToolName === "GOOGLEDRIVE_CREATE_FILE" &&
      (entry?.data?.id || entry?.data?.file_id)
    );

    if (!reportData.doc_url && successfulGoogleDocCreate) {
      const documentId =
        successfulGoogleDocCreate.data?.document_id ||
        successfulGoogleDocCreate.data?.documentId ||
        successfulGoogleDocCreate.data?.id ||
        successfulGoogleDocCreate.data?.response_data?.documentId;
      if (documentId) {
        reportData.doc_url = `https://docs.google.com/document/d/${documentId}/edit`;
      }
    }

    if (!reportData.file_url && successfulGoogleDriveFile) {
      const fileId = successfulGoogleDriveFile.data?.id || successfulGoogleDriveFile.data?.file_id;
      if (fileId) {
        reportData.file_url = `https://drive.google.com/file/d/${fileId}/view`;
      }
    }

    if ((reportData.doc_url || reportData.file_url) && Array.isArray(rawContract.input?.assumptions_made)) {
      rawContract.input.assumptions_made = rawContract.input.assumptions_made.filter(
        (item) => !/No Google Docs\/Drive\/OneDrive connection detected/i.test(String(item))
      );
    }
  }

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

  await Promise.allSettled([
    saveAgentRunOutput(rawContract, fullText),
    createMissingDataTask(rawContract),
    writeTasksCreated(rawContract),
  ]);

  if (rawContract.automation_triggers?.length) {
    const automationResults = await executeAutomationTriggers(rawContract, companyId).catch(err => {
      console.error('[automations] executeAutomationTriggers failed:', err);
      return [];
    });
    if (automationResults?.length) {
      rawContract.automation_results = automationResults;
    }
  }

  if (rawContract.scheduled_automations?.length && companyId) {
    const { upsertScheduledAutomation } = await import('./automations/registry.js');
    for (const trigger of rawContract.scheduled_automations) {
      try {
        await upsertScheduledAutomation(companyId, trigger, rawContract.agent, supabaseForServerData());
        console.info('[automations] Scheduled automation upserted:', trigger.automation_id, trigger.cron);
      } catch (e) {
        console.warn('[automations] Failed to upsert scheduled automation:', e.message);
      }
    }
  }

  // Wire triggers_agents: if contract declares downstream agents, queue them via agent_tasks
  if (rawContract?.triggers_agents?.length && companyId) {
    try {
      const triggerList = Array.isArray(rawContract.triggers_agents)
        ? rawContract.triggers_agents
        : String(rawContract.triggers_agents).split(',').map(s => s.trim()).filter(Boolean);

      const validTriggers = triggerList.filter(a => VALID_AGENTS.has(a));
      if (validTriggers.length && supabaseForServerData()) {
        const chainBaseTime = Date.now();
        const chainRows = validTriggers.map((agentName, index) => ({
          agent: agentName,
          company_id: companyId,
          task_type: 'chain_trigger',
          query: rawContract?.handoff_notes
            ? `Continue from previous run: ${String(rawContract.handoff_notes).slice(0, 300)}`
            : `Continue the workflow for ${companyId}`,
          scheduled_for: new Date(chainBaseTime + (index + 1) * 90000).toISOString(),
          triggered_by: name,
          trigger_id: runId,
          status: 'pending',
        }));
        const { error: chainErr } = await supabaseForServerData().from('agent_tasks').insert(chainRows);
        if (chainErr) console.warn('[triggers_agents] Failed to queue chain:', chainErr.message);
        else console.log(`[triggers_agents] Queued ${validTriggers.join(', ')} for ${companyId}`);
      }
    } catch (e) {
      console.warn('[triggers_agents] Error wiring chain:', e.message);
    }
  }

  res.write(`data: ${JSON.stringify({ contract: rawContract })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

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

/** Server routes must not use the anon client for RLS tables — there is no end-user JWT here. */
function supabaseForServerData() {
  return supabaseAdminClient || supabase;
}

function defaultHeartbeatState() {
  return {
    updated_at: null,
    agents: {
      veena: { status: "idle", last_run: null, duration_ms: null },
      isha: { status: "idle", last_run: null, duration_ms: null },
      neel: { status: "idle", last_run: null, duration_ms: null },
      tara: { status: "idle", last_run: null, duration_ms: null },
      zara: { status: "idle", last_run: null, duration_ms: null },
      maya: { status: "idle", last_run: null, duration_ms: null },
      riya: { status: "idle", last_run: null, duration_ms: null },
      arjun: { status: "idle", last_run: null, duration_ms: null },
      dev: { status: "idle", last_run: null, duration_ms: null },
      priya: { status: "idle", last_run: null, duration_ms: null },
      kiran: { status: "idle", last_run: null, duration_ms: null },
      sam: { status: "idle", last_run: null, duration_ms: null },
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

function getAgentMemoryPath(agentName, agentsDir = AGENTS_DIR) {
  const topLevelPath = join(agentsDir, agentName, "MEMORY.md");
  if (fs.existsSync(topLevelPath)) return topLevelPath;
  return join(agentsDir, agentName, "memory", "MEMORY.md");
}

function sanitizeAgentScopeId(scopeId) {
  return String(scopeId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getAgentCompanyScopedDir(agentName, companyId, agentsDir = AGENTS_DIR) {
  const safeCompanyId = sanitizeAgentScopeId(companyId);
  return safeCompanyId ? join(agentsDir, agentName, "companies", safeCompanyId) : null;
}

function getScopedAgentMemoryPath(agentName, companyId, agentsDir = AGENTS_DIR) {
  const scopedDir = getAgentCompanyScopedDir(agentName, companyId, agentsDir);
  return scopedDir ? join(scopedDir, "MEMORY.md") : getAgentMemoryPath(agentName, agentsDir);
}

function getAgentHeartbeatPath(agentName, companyId = null, agentsDir = AGENTS_DIR) {
  const scopedDir = getAgentCompanyScopedDir(agentName, companyId, agentsDir);
  if (scopedDir) return join(scopedDir, "HEARTBEAT.md");
  return join(agentsDir, agentName, "HEARTBEAT.md");
}

function normalizePromptMarkdown(content) {
  const raw = String(content || "").trim();
  if (!raw) return "";
  const stripped = raw
    .replace(/^#.*$/gm, "")
    .replace(/^\s*[-*]\s*(status|last run|last checked|duration ms|duration|error|current task|notes|persistent notes|working preferences|recent learnings)\s*:\s*.*$/gim, "")
    .trim();
  return stripped.length >= 20 ? raw : "";
}

async function syncAgentHeartbeatMarkdown(agentName, agentState, companyId = null, agentsDir = AGENTS_DIR) {
  const heartbeatPath = getAgentHeartbeatPath(agentName, companyId, agentsDir);
  const displayName = `${agentName.charAt(0).toUpperCase()}${agentName.slice(1)}`;
  const lines = [
    `# ${displayName} Heartbeat`,
    "",
    `- Status: ${agentState?.status || "idle"}`,
    `- Last run: ${agentState?.last_run || "not recorded"}`,
    `- Duration ms: ${agentState?.duration_ms ?? "n/a"}`,
  ];
  if (agentState?.error) lines.push(`- Error: ${agentState.error}`);
  await mkdir(dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, `${lines.join("\n")}\n`, "utf-8");
}

async function markAgentHeartbeat(name, status, durationMs = null, error = null, companyId = null) {
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
  try {
    await syncAgentHeartbeatMarkdown(name, heartbeat.agents[name], companyId);
  } catch (syncError) {
    console.warn(`[heartbeat] failed to sync HEARTBEAT.md for ${name}: ${syncError?.message || syncError}`);
  }
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

async function readVoicebotCallRecord(callSid) {
  const safeCallSid = normalizeShortText(callSid, "");
  if (!safeCallSid) return null;
  try {
    const raw = await readFile(voicebotCallPath(safeCallSid), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  const outboundBrief = String(session.openingLine || "").trim();
  const campaignContext = String(session.campaignId || "").trim();
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
- Treat the outbound brief below as the source of truth for what this call is about.
- Do not substitute a different company, product, offer, or industry narrative when the outbound brief is present.
- Never switch into unrelated themes such as AI infrastructure, inference, GPUs, or latency unless the outbound brief or company context explicitly mentions them.
- If the lead says this feels like a cold call, acknowledge that directly and explain the outreach reason using the outbound brief.
${interruptionMode ? "- The caller interrupted the previous reply. Respond extremely quickly: 1-2 short spoken sentences, ideally under 20 words total.\n- Do not restate context unless absolutely necessary." : ""}

Outbound brief:
${outboundBrief || "No explicit outbound brief provided."}

Campaign context:
${campaignContext || "No campaign label provided."}

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
            content: `Language: ${language === "hi" ? "Hindi" : "English"}\nLead name: ${leadName || "Unknown"}\nOutbound brief: ${outboundBrief || "Not provided"}\nCampaign: ${campaignContext || "Not provided"}\nUser message: ${String(userText || "").trim()}`,
          },
        ],
        temperature: 0.4,
        ...(isGroqProvider && model === "groq/compound"
          ? {
              max_completion_tokens: interruptionMode ? 80 : 160,
            }
          : {
              max_tokens: interruptionMode ? 60 : 140,
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

function buildVoicebotOpeningLine(value) {
  const fallback =
    process.env.TWILIO_OUTBOUND_GREETING || TWILIO_OUTBOUND_GREETING;
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  if (/is this a bad time for a quick conversation\?/i.test(raw)) {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    return trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 137).trim()}...`;
  }
  const normalized = raw.replace(/[.!?]+/g, ". ");
  const words = normalized.split(/\s+/).filter(Boolean);
  let opening = "";

  for (const word of words) {
    const candidate = opening ? `${opening} ${word}` : word;
    if (candidate.length > 110) break;
    opening = candidate;
  }

  opening = opening.trim().replace(/[.,;:!?-]+$/, "");
  if (!opening) return fallback;
  return `${opening}. Is this a bad time for a quick conversation?`;
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
    const normalizedTranscript = transcript.toLowerCase().replace(/[^\p{L}\p{N}\s?!.]/gu, "").trim();
    const allowShortGreeting = /^(hello|hello\?|hi|hi\?|hey|hey\?|yes|yes\?|speaking|who is this|who's this|okay|okay\.|ok|ok\.|hmm|hmm\.|right|right\.)$/i.test(normalizedTranscript);
    if (!allowShortGreeting && utterance.length < TWILIO_MIN_UTTERANCE_SAMPLES && transcript.length < 8) {
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

async function resolveDeploymentNotificationUserId(deployment) {
  const workspaceId =
    typeof deployment?.workspaceId === "string" && deployment.workspaceId.trim()
      ? deployment.workspaceId.trim()
      : null;
  if (!workspaceId || !supabaseAdminClient) return null;

  try {
    const { data, error } = await supabaseAdminClient
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId)
      .order("role", { ascending: true });
    if (error) return null;
    const owner = (data || []).find((row) => row.role === "owner");
    return owner?.user_id || data?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

const EMPTY_CONTEXT = (ref = "") => ({
  userId: ref, workspaceId: ref,
  company: "", websiteUrl: "", industry: "", icp: "", competitors: "", primaryGoal: "", goals: "", campaigns: "", keywords: "",
});

async function readContextFromSupabase(workspaceId) {
  if (!supabaseAdminClient || !workspaceId) return null;
  try {
    const { data, error } = await supabaseAdminClient
      .from("workspace_context")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();
    if (error || !data) return null;
    return {
      workspaceId,
      company:      data.company      || "",
      websiteUrl:   data.website_url  || "",
      industry:     data.industry     || "",
      icp:          data.icp          || "",
      competitors:  data.competitors  || "",
      primaryGoal:  data.primary_goal || "",
      goals:        data.goals        || "",
      campaigns:    data.campaigns    || "",
      keywords:     data.keywords     || "",
    };
  } catch {
    return null;
  }
}

async function writeContextToSupabase(workspaceId, fields) {
  if (!supabaseAdminClient || !workspaceId) return;
  try {
    await supabaseAdminClient
      .from("workspace_context")
      .upsert({ workspace_id: workspaceId, ...fields }, { onConflict: "workspace_id" });
  } catch (err) {
    console.warn("[Context] Supabase write failed:", err.message);
  }
}

async function readSavedAgentContext(userId, workspaceId = null) {
  // 1. Try Supabase by workspaceId (source of truth)
  if (workspaceId) {
    const ctx = await readContextFromSupabase(workspaceId);
    if (ctx) return { userId, ...ctx };
  }

  // 2. Fall back to filesystem (legacy per-user file)
  if (!userId) return EMPTY_CONTEXT();
  try {
    const raw = await readFile(join(CTX_DIR, `${userId}.md`), "utf-8");
    const matchField = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = raw.match(new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.*)`));
      const value = match?.[1]?.trim() || "";
      return value === "—" ? "" : value;
    };
    return {
      userId, workspaceId: workspaceId || "",
      company:     matchField("Company"),
      industry:    matchField("Industry"),
      icp:         matchField("Target ICP"),
      competitors: matchField("Top Competitors"),
      campaigns:   matchField("Current Campaigns"),
      keywords:    matchField("Active Keywords"),
      goals:       matchField("Key Goals this Quarter"),
    };
  } catch {
    return EMPTY_CONTEXT(userId);
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
  const agentContext = await readSavedAgentContext(userId, workspaceId);
  let workspace = null;
  let company = null;
  let companyArtifacts = {};
  let knowledgeBase = [];

  const wsClient = workspaceId ? supabaseForServerData() : null;
  if (wsClient) {
    try {
      const { data } = await wsClient
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
const ALLOWED_CORS_ORIGINS = new Set([
  "http://localhost:3007",
  "http://127.0.0.1:3007",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_CORS_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function pickSafeKpiApiRow(row) {
  return KPI_ROUTE_FIELDS.reduce((safeRow, field) => {
    if (field in row) safeRow[field] = row[field];
    return safeRow;
  }, {});
}

export function parseKpiDays(value) {
  if (value === undefined || value === null || value === "") return KPI_DAYS_DEFAULT;
  if (!/^\d+$/.test(String(value))) return null;

  const days = Number(value);
  if (!Number.isInteger(days) || days < KPI_DAYS_MIN || days > KPI_DAYS_MAX) {
    return null;
  }

  return days;
}

function pickSafeOutcomeRow(row) {
  const fields = [
    "run_id",
    "company_id",
    "agent",
    "outcome_metric",
    "baseline_value",
    "predicted_value",
    "actual_value",
    "variance_pct",
    "verified_at",
    "created_at",
  ];

  return fields.reduce((safeRow, field) => {
    if (field in row) safeRow[field] = row[field];
    return safeRow;
  }, {});
}

export function parseOutcomeDays(value) {
  if (value === undefined || value === null || value === "") return 30;
  if (!/^\d+$/.test(String(value))) return null;

  const days = Number(value);
  if (!OUTCOME_DAYS_ALLOWED.has(days)) return null;
  return days;
}

function computeOutcomeAccuracy(variancePct) {
  if (typeof variancePct !== "number" || Number.isNaN(variancePct)) return null;
  const accuracy = 1 - Math.min(1, Math.abs(variancePct) / 100);
  return Number(Math.max(0, accuracy).toFixed(2));
}

async function listOutcomeLedgerRows(companyId, { days, client = supabaseForServerData() } = {}) {
  if (!client) {
    throw new Error("Outcome ledger reads require a Supabase client.");
  }

  const cutoffIso = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
  let query = client
    .from("outcome_ledger")
    .select("*")
    .eq("company_id", companyId);

  if (typeof query.gte === "function") {
    query = query.gte("verified_at", cutoffIso);
  }

  if (typeof query.order === "function") {
    query = query.order("verified_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

export function createOutcomesRouteHandler(dependencies = {}) {
  const listOutcomeRowsImpl = dependencies.listOutcomeRowsImpl
    || ((companyId, options) => listOutcomeLedgerRows(
      companyId,
      { ...options, client: dependencies.client || supabaseForServerData() },
    ));

  return async function handleGetOutcomes(req, res) {
    const { companyId } = req.params;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId || "")) {
      return res.status(400).json({ error: "invalid companyId" });
    }

    const days = parseOutcomeDays(req.query?.days);
    if (days === null) {
      return res.status(400).json({ error: "days must be one of 7, 30, or 90" });
    }

    try {
      const rows = await listOutcomeRowsImpl(companyId, { days });
      const safeRows = rows.map(pickSafeOutcomeRow);
      const agents = new Map();

      for (const row of safeRows) {
        const accuracy = computeOutcomeAccuracy(row.variance_pct);
        const current = agents.get(row.agent) || {
          agent: row.agent,
          accuracy_sum: 0,
          accuracy_count: 0,
          last_verified: row.verified_at,
          variance_pct: row.variance_pct,
        };

        if (accuracy !== null) {
          current.accuracy_sum += accuracy;
          current.accuracy_count += 1;
        }
        if (!current.last_verified || String(row.verified_at).localeCompare(String(current.last_verified)) > 0) {
          current.last_verified = row.verified_at;
          current.variance_pct = row.variance_pct;
        }

        agents.set(row.agent, current);
      }

      return res.json({
        companyId,
        days,
        rows: safeRows,
        agents: [...agents.values()].map((entry) => ({
          agent: entry.agent,
          accuracy: entry.accuracy_count
            ? Number((entry.accuracy_sum / entry.accuracy_count).toFixed(2))
            : null,
          last_verified: entry.last_verified,
          variance_pct: entry.variance_pct,
        })),
      });
    } catch (err) {
      console.error("GET /api/outcomes error:", err);
      return res.status(500).json({ error: String(err?.message || err) });
    }
  };
}

export function createKpiRouteHandler(dependencies = {}) {
  const listCompanyKpisImpl = dependencies.listCompanyKpisImpl || listCompanyKpis;

  return async function handleGetCompanyKpis(req, res) {
    const { companyId } = req.params;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId || "")) {
      return res.status(400).json({ error: "invalid companyId" });
    }

    const days = parseKpiDays(req.query?.days);
    if (days === null) {
      return res.status(400).json({ error: `days must be an integer between ${KPI_DAYS_MIN} and ${KPI_DAYS_MAX}` });
    }

    try {
      const rows = await listCompanyKpisImpl(companyId, { days });
      return res.json({
        companyId,
        days,
        rows: Array.isArray(rows) ? rows.map(pickSafeKpiApiRow) : [],
      });
    } catch (err) {
      console.error("GET /api/kpis error:", err);
      return res.status(500).json({ error: String(err?.message || err) });
    }
  };
}

export function parseNightlySchedule(value = NIGHTLY_ANOMALY_SCHEDULE_UTC) {
  const match = String(value).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return { hour: 18, minute: 30, label: "18:30" };
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    label: `${match[1].padStart(2, "0")}:${match[2]}`,
  };
}

export function computeNextNightlyRun(now = new Date(), scheduleTime = NIGHTLY_ANOMALY_SCHEDULE_UTC) {
  const schedule = parseNightlySchedule(scheduleTime);
  const nextRun = new Date(now);
  nextRun.setUTCHours(schedule.hour, schedule.minute, 0, 0);

  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun;
}

async function listNightlyCompanyIds(metricDate, dependencies = {}) {
  const client = dependencies.client;
  if (!client) {
    throw new Error("Nightly anomaly sweep requires a pipeline client.");
  }

  const { data, error } = await client
    .from("company_kpi_daily")
    .select("company_id")
    .eq("metric_date", metricDate)
    .eq("source_scope", "blended")
    .order("company_id", { ascending: true });

  if (error) throw error;

  return [...new Set((Array.isArray(data) ? data : []).map((row) => row.company_id).filter(Boolean))];
}

export async function runNightlyAnomalySweep(dependencies = {}) {
  const client = dependencies.client;
  if (!client) {
    throw new Error("Nightly anomaly sweep requires a pipeline client.");
  }

  const clock = dependencies.clock || {
    now: () => Date.now(),
    toDate: () => new Date(),
    iso: () => new Date().toISOString(),
  };
  const detector = dependencies.detector || detectCompanyAnomalies;
  const logger = dependencies.logger || console;
  const metricDate = (dependencies.metricDate || clock.iso()).slice(0, 10);
  const companyIds = dependencies.companyIds || await listNightlyCompanyIds(metricDate, { client });
  const results = [];

  for (const companyId of companyIds) {
    try {
      results.push(await detector(companyId, {
        ...dependencies,
        client,
        clock,
        metricDate,
      }));
    } catch (error) {
      logger.error?.(`[nightly-anomaly] failed for ${companyId}: ${error.message}`);
    }
  }

  return {
    metricDate,
    companyIds,
    runs: results,
  };
}

export function createNightlyScheduler(dependencies = {}) {
  const clock = dependencies.clock || {
    now: () => Date.now(),
    toDate: () => new Date(),
    iso: () => new Date().toISOString(),
  };
  const logger = dependencies.logger || console;
  const setTimeoutFn = dependencies.setTimeoutFn || setTimeout;
  const clearTimeoutFn = dependencies.clearTimeoutFn || clearTimeout;
  const scheduleTime = dependencies.scheduleTime || NIGHTLY_ANOMALY_SCHEDULE_UTC;
  const runNow = dependencies.runNow || (() => runNightlyAnomalySweep(dependencies));
  let timeoutId = null;
  let nextRunAt = null;

  const scheduleNext = () => {
    const now = clock.toDate();
    nextRunAt = computeNextNightlyRun(now, scheduleTime);
    const delay = Math.max(0, nextRunAt.getTime() - now.getTime());
    timeoutId = setTimeoutFn(async () => {
      try {
        await runNow();
      } catch (error) {
        logger.error?.(`[nightly-anomaly] run failed: ${error.message}`);
      } finally {
        scheduleNext();
      }
    }, delay);
    logger.log?.(`[nightly-anomaly] next run scheduled for ${nextRunAt.toISOString()} (${scheduleTime} UTC)`);
    return delay;
  };

  return {
    start() {
      if (timeoutId !== null) return nextRunAt;
      scheduleNext();
      return nextRunAt;
    },
    stop() {
      if (timeoutId !== null) {
        clearTimeoutFn(timeoutId);
        timeoutId = null;
      }
    },
    getState() {
      return { nextRunAt, timeoutId };
    },
  };
}

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

// ── POST /api/chat/completions ─────────────────────────────────────────────────
// Provider-agnostic chat proxy — keeps API keys server-side.
// The frontend routes Claude / OpenAI calls here so ANTHROPIC_API_KEY / OPENAI_API_KEY
// are never exposed in the browser bundle.  Streaming and non-streaming both work.
app.post("/api/chat/completions", express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    // Force the model to the server-side resolved model if client sends none.
    if (!body.model) body.model = LLM_MODEL;

    const isStream = Boolean(body.stream);

    const completion = await groq.chat.completions.create(body);

    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      for await (const chunk of completion) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      res.json(completion);
    }
  } catch (err) {
    console.error("[/api/chat/completions]", err?.message || err);
    res.status(500).json({ error: err?.message || "LLM proxy error" });
  }
});

app.get("/api/kpis/:companyId", createKpiRouteHandler());
app.get(
  "/api/outcomes/:companyId",
  createOutcomesRouteHandler({ client: supabaseForServerData() }),
);

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

// ── GET /api/agents/today-report ──────────────────────────────────────────────
// Returns the most recent report email sent today for the #main channel feed.
app.get("/api/agents/today-report", async (_req, res) => {
  try {
    const raw = await readFile(TODAY_REPORT_PATH, "utf-8").catch(() => null);
    if (!raw) return res.json({ hasReport: false });
    const report = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (report.date !== today) return res.json({ hasReport: false });
    res.json({ hasReport: true, ...report });
  } catch {
    res.json({ hasReport: false });
  }
});

// ── POST /api/agents/context ───────────────────────────────────────────────────
// Saves client business context to client_context/{userId}.md.
// IMPORTANT: must be declared BEFORE /:name routes to avoid 'context' being
// matched as the :name param.

app.post("/api/agents/context", async (req, res) => {
  const {
    userId,
    workspaceId,
    company,
    websiteUrl,
    industry,
    icp,
    competitors,
    primaryGoal,
    campaigns,
    keywords,
    goals,
  } = req.body;

  if (!company) {
    return res.status(400).json({ error: "company is required" });
  }

  const fields = {
    company:      company      || "",
    website_url:  websiteUrl   || "",
    industry:     industry     || "",
    icp:          icp          || "",
    competitors:  competitors  || "",
    primary_goal: primaryGoal  || "",
    goals:        goals        || "",
    campaigns:    campaigns    || "",
    keywords:     keywords     || "",
  };

  // 1. Write to Supabase (primary — workspace-scoped)
  if (workspaceId) {
    await writeContextToSupabase(workspaceId, fields);
  }

  // 2. Write to filesystem (legacy cache — user-scoped fallback)
  if (userId) {
    const content = `# Client Context\n\n**Company**: ${fields.company}\n**Website**: ${fields.website_url || "—"}\n**Industry**: ${fields.industry || "—"}\n**Target ICP**: ${fields.icp || "—"}\n**Top Competitors**: ${fields.competitors || "—"}\n**Primary Goal**: ${fields.primary_goal || "—"}\n**Key Goals this Quarter**: ${fields.goals || "—"}\n`;
    try {
      await mkdir(CTX_DIR, { recursive: true });
      await writeFile(join(CTX_DIR, `${userId}.md`), content, "utf-8");
    } catch { /* non-critical */ }
  }

  res.json({ success: true });
});

app.get("/api/agents/context", async (req, res) => {
  const userId = String(req.query.userId || "").trim();
  const workspaceId = String(req.query.workspaceId || "").trim() || null;

  if (!userId && !workspaceId) {
    return res.status(400).json({ error: "userId or workspaceId is required" });
  }

  res.json(await readSavedAgentContext(userId, workspaceId));
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
    twimlUrl.searchParams.set("openingLine", buildVoicebotOpeningLine(openingLine || defaultGreeting));

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

    if (json?.sid) {
      await persistVoicebotCallRecord({
        callSid: json.sid,
        companyId: String(companyId || ""),
        campaignId: String(campaignId || ""),
        leadId: String(leadId || ""),
        leadName: resolvedLeadName || null,
        leadPhone: resolvedLeadPhone || targetPhone,
        leadEmail: resolvedLeadEmail || null,
        language: language === "hi" ? "hi" : "en",
        openingLine: buildVoicebotOpeningLine(openingLine || defaultGreeting),
        status: "queued",
        queuedAt: new Date().toISOString(),
        turns: [],
      }).catch((error) => {
        console.warn("[TwilioCalls] failed to persist queued context:", String(error));
      });
    }
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
  const openingLine = buildVoicebotOpeningLine(source.openingLine || defaultGreeting);
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
    recurrenceMinutes,
    runPrompt,
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
    const isRecurringMonitor = String(scheduleMode || "") === "monitor";
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
      recurrenceMinutes: isRecurringMonitor ? Math.max(15, Number(recurrenceMinutes) || DEFAULT_MONITOR_RECURRENCE_MINUTES) : null,
      runPrompt: typeof runPrompt === "string" ? runPrompt : "",
      source,
      status: isRecurringMonitor ? "active" : "pending",
      createdAt: new Date().toISOString(),
      scheduledFor: isRecurringMonitor ? new Date().toISOString() : "next_cron_run",
    };
    queue.unshift(entry);
    await writeDeploymentQueue(queue.slice(0, 200));
    if (isRecurringMonitor) {
      await setCompanyActionStatus(entry.companyId, sectionId, {
        status: "active",
        mode: entry.scheduleMode,
        agentName: entry.agentName,
      });
    }
    res.status(201).json({ deployment: entry });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/agents/deployments/:id", async (req, res) => {
  const { action } = req.body ?? {};
  if (!["pause", "resume", "stop"].includes(String(action || ""))) {
    return res.status(400).json({ error: "action must be pause, resume, or stop" });
  }

  try {
    const queue = await readDeploymentQueue();
    const entry = queue.find((item) => item?.id === req.params.id);
    if (!entry) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    const now = new Date().toISOString();
    if (action === "pause") {
      entry.status = "paused";
      entry.pausedAt = now;
      await setCompanyActionStatus(entry.companyId, entry.sectionId, {
        status: "paused",
        mode: entry.scheduleMode || null,
        agentName: entry.agentName || null,
      });
    } else if (action === "resume") {
      entry.status = entry.scheduleMode === "monitor" ? "active" : "pending";
      entry.resumedAt = now;
      entry.scheduledFor = now;
      await setCompanyActionStatus(entry.companyId, entry.sectionId, {
        status: entry.status,
        mode: entry.scheduleMode || null,
        agentName: entry.agentName || null,
      });
    } else if (action === "stop") {
      entry.status = "stopped";
      entry.stoppedAt = now;
      await setCompanyActionStatus(entry.companyId, entry.sectionId, {
        status: "stopped",
        mode: entry.scheduleMode || null,
        agentName: entry.agentName || null,
      });
    }

    await writeDeploymentQueue(queue);
    res.json({ deployment: entry });
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

  try {
    const scopedMemoryPath = getScopedAgentMemoryPath(name, req.query.company_id, AGENTS_DIR);
    let content = "";
    try {
      content = await readFile(scopedMemoryPath, "utf-8");
    } catch {
      content = await readFile(getAgentMemoryPath(name), "utf-8");
    }
    res.json({ agent: name, memory: content });
  } catch {
    res.json({ agent: name, memory: "" });
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

// ── runAgentForArtifact — internal (non-SSE) agent call ───────────────────────
// Used by /api/company-intel/companies/:id/generate to route through named agents.
// Loads the same SOUL+skills+memory as the SSE endpoint, calls Groq non-streaming,
// extracts the contract, patches the MKG, and returns the parsed contract object.

async function runAgentForArtifact(agentName, query, companyId, taskType) {
  const { randomUUID } = await import("node:crypto");
  const runId = randomUUID();
  const startedAt = Date.now();

  // Load SOUL.md
  const soulPath = join(AGENTS_DIR, agentName, "SOUL.md");
  let systemPrompt = `You are ${agentName}, a marketing AI agent.`;
  try { systemPrompt = await readFile(soulPath, "utf-8"); } catch { /* default */ }

  // Load memory + calibration note
  const { memory, heartbeat, calibrationNote } = await loadAgentPromptContext(agentName, companyId);

  const skillsBlock = await loadAgentSkillsBlock(agentName, AGENTS_DIR);

  const runContextBlock = `\n\n## Run Context\ncompany_id: ${companyId ?? "unknown"}\nrun_id: ${runId}\ntask_type: ${taskType ?? "artifact_generation"}\n`;

  // Load MKG + company profile (same logic as SSE endpoint)
  let mkgBlock = "";
  if (companyId) {
    try {
      const [mkgData, companiesData] = await Promise.all([
        MKGService.read(companyId).catch(() => null),
        fetch(`http://localhost:${process.env.PORT || 3007}/api/company-intel/companies`).then(r => r.json()).catch(() => null),
      ]);
      const company = (companiesData?.companies ?? []).find(c => c.id === companyId);
      const profile = company?.profile ?? {};
      const mkg = mkgData ?? {};
      const lines = ["## Company Knowledge Base"];
      if (company?.companyName) lines.push(`Company: ${company.companyName}`);
      if (company?.websiteUrl) lines.push(`Website: ${company.websiteUrl}`);
      if (profile.summary) lines.push(`Summary: ${profile.summary}`);
      if (profile.industry) lines.push(`Industry: ${profile.industry}`);
      if (Array.isArray(profile.geoFocus) && profile.geoFocus.length) lines.push(`Geography: ${profile.geoFocus.join(", ")}`);
      if (Array.isArray(profile.offerings) && profile.offerings.length) lines.push(`Offerings: ${profile.offerings.join(", ")}`);
      if (Array.isArray(profile.primaryAudience) && profile.primaryAudience.length) lines.push(`Primary Audience: ${profile.primaryAudience.join(", ")}`);
      if (profile.brandVoice?.tone) lines.push(`Brand Voice: ${profile.brandVoice.tone}${profile.brandVoice.style ? `, ${profile.brandVoice.style}` : ""}`);
      const mkgFields = ["positioning", "icp", "competitors", "offers", "messaging", "channels", "content_pillars"];
      for (const field of mkgFields) {
        const entry = mkg[field];
        if (entry?.value != null && entry.confidence >= 0.5) {
          lines.push(`Company.${field}: ${JSON.stringify(entry.value)}`);
        }
      }
      if (lines.length > 1) mkgBlock = "\n\n" + lines.join("\n");
    } catch { /* non-blocking */ }
  }

  // Guardrails (same as SSE endpoint)
  const guardrailsBlock = buildAgentRunGuardrails(agentName, taskType);

  // Industry intel
  let industryIntelBlock = '';
  if (companyId) {
    try {
      const intel = await loadIndustryIntel(companyId);
      if (intel?.brief) {
        industryIntelBlock = `\n\n## Industry Intelligence (Last 30 Days)\nUse this as live market context when forming recommendations. Generated: ${intel.generated_at ?? 'unknown'}.\n\n${intel.brief}`;
      }
    } catch {}
  }

  // Fetch recent automation results for this company (service role if RLS on automation_runs)
  let recentAutomationData = '';
  if (companyId) {
    try {
      const autoRunClient = supabaseForServerData();
      if (autoRunClient) {
        const { data: recentRuns } = await autoRunClient
          .from('automation_runs')
          .select('automation_name, result, created_at')
          .eq('company_id', companyId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(5);
        if (recentRuns?.length) {
          const lines = recentRuns.map(r =>
            `- ${r.automation_name} (${new Date(r.created_at).toLocaleDateString()}): ${JSON.stringify(r.result).slice(0, 400)}`
          ).join('\n');
          recentAutomationData = `\n\n## Recent Automation Data\nThe following connector data was automatically fetched for this company and is available for your analysis:\n${lines}`;
        }
      }
    } catch { /* non-blocking */ }
  }

  const contractInstruction = `

## Output Contract (REQUIRED — do not skip)

After your COMPLETE response (all prose, analysis, and recommendations have been written),
append the following block EXACTLY at the very END. Do not include ---CONTRACT--- anywhere
else in your response.

---CONTRACT---
{
  "agent": "${agentName}",
  "task": "<one-line description of what you just did>",
  "company_id": "${companyId ?? "unknown"}",
  "run_id": "${runId}",
  "timestamp": "${new Date().toISOString()}",
  "input": { "mkg_version": null, "dependencies_read": [], "assumptions_made": [] },
  "artifact": {
    "data": {},
    "summary": "<one paragraph summary of your output — be specific>",
    "confidence": 0.75
  },
  "context_patch": { "writes_to": [], "patch": {} },
  "handoff_notes": "",
  "missing_data": [],
  "tasks_created": [],
  "outcome_prediction": null,
  "automation_triggers": []
}

Replace ALL placeholder values with your actual outputs.
- artifact.data: must contain the structured artifact content for the requested type
- context_patch.patch: use only valid MKG field names: positioning, icp, competitors, offers, messaging, channels, funnel, metrics, baselines, content_pillars, campaigns, insights
- automation_triggers: array of { "automation_id": "<id from registry>", "params": {}, "reason": "<why>" } — include when you need to generate content assets (images, videos, emails, articles) OR fetch live data. For content creation tasks (image, email, video, article), you MUST populate this with the appropriate automation_id
- "scheduled_automations": recurring jobs to schedule, e.g. [{ "automation_id": "fetch_meta_ads", "cron": "0 9 * * *", "params": { "ad_account_id": "act_123" }, "reason": "Daily morning pull" }]. Cron patterns: "0 9 * * *" daily 9am, "0 */6 * * *" every 6h, "*/15 * * * *" every 15min, "0 9 * * 1" weekly Mon 9am. Use [] if no schedule needed.
- The JSON must be valid JSON (no trailing commas, no comments)

## Available Paid Media Automations
- fetch_meta_ads: Read Meta Ads performance (campaigns, spend, CTR, ROAS) — params: { ad_account_id?, date_range? }
- create_meta_campaign: Create a full Meta Ads campaign (Campaign→AdSet→Creative→Ad) — params: { campaign_name, objective, daily_budget, targeting, headline, primary_text, link_url, cta_type?, status? }
- optimize_meta_roas: Pause low-ROAS ads and scale winning ad sets — params: { roas_threshold_pause?, roas_threshold_scale?, budget_scale_factor?, date_range?, dry_run? }. Set as scheduled_automation every 6h for autonomous ROAS management.
- google_ads_fetch: Read Google Ads campaigns — params: { campaign_name?, campaign_id? }

## Available Content Creation Automations (Riya + Maya)
- generate_social_image: Gemini Flash image (gemini-3.1-flash-image-preview) -> imgbb CDN. params: { prompt, aspect_ratio (1:1|16:9|9:16|4:5), platform, brand_context?, style? }. Returns: { image_url, cdn_url, platform }
- generate_email_html: Full inline-CSS HTML email newsletter. params: { subject, content, tone?, brand_name?, primary_color?, sections? }. Returns: { html, subject, preview_text }
- generate_faceless_video: Google Veo 3.1 video (async). params: { prompt, duration?, aspect_ratio?, style? }. Returns: { status:queued, operation_name }
- generate_avatar_video: HeyGen spokesperson video (async). params: { script, avatar_id?, voice_id?, background_color?, width?, height? }. Returns: { status:processing, video_id, check_url }
- create_seo_article: Full HTML blog post with SEO meta. params: { keyword, topic?, word_count_target?, target_audience?, brand_context? }. Returns: { html, title, meta_description, slug, word_count }
`;

  const fullSystem = [
    systemPrompt,
    mkgBlock,
    memory ? `\n\n## Your Recent Memory\n${memory}` : "",
    heartbeat ? `\n\n## Your Current Heartbeat\n${heartbeat}` : "",
    calibrationNote?.text ? `\n\n## Latest Calibration Note\n${calibrationNote.text}` : "",
    skillsBlock,
    runContextBlock,
    guardrailsBlock,
    recentAutomationData,
    industryIntelBlock,
    contractInstruction,
  ].join("");

    await markAgentHeartbeat(agentName, "running", null, null, companyId);

  const completion = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: fullSystem },
      { role: "user", content: query },
    ],
    stream: false,
    max_tokens: 8192,
    temperature: 0.4,
  });

  const fullText = completion.choices[0]?.message?.content?.trim() || "";
  const contract = extractContract(fullText);

  await markAgentHeartbeat(agentName, "completed", Date.now() - startedAt, null, companyId);

  if (!contract) {
    throw new Error(`[runAgentForArtifact] ${agentName} did not return a ---CONTRACT--- block`);
  }

  contract.run_id = runId;
  contract.agent = agentName;
  if (companyId) contract.company_id = companyId;

  // Patch MKG if context_patch present
  if (companyId && contract.context_patch?.patch && Object.keys(contract.context_patch.patch).length > 0) {
    try {
      await MKGService.patch(companyId, contract.context_patch.patch);
    } catch (mkgErr) {
      console.warn(`[runAgentForArtifact] MKG patch failed for ${companyId}:`, mkgErr.message);
    }
  }

  if (contract.automation_triggers?.length) {
    await executeAutomationTriggers(contract, companyId).catch(err =>
      console.warn('[automations] runAgentForArtifact triggers failed:', err)
    );
  }

  if (contract.scheduled_automations?.length && companyId) {
    const { upsertScheduledAutomation } = await import('./automations/registry.js');
    for (const trigger of contract.scheduled_automations) {
      try {
        await upsertScheduledAutomation(companyId, trigger, contract.agent, supabaseForServerData());
        console.info('[automations] Scheduled automation upserted:', trigger.automation_id, trigger.cron);
      } catch (e) {
        console.warn('[automations] Failed to upsert scheduled automation:', e.message);
      }
    }
  }

  return contract;
}

// ── Agent Contract Persistence Helpers ────────────────────────────────────────

/**
 * saveAgentRunOutput — writes validated contract to agent_run_outputs table.
 * Idempotent: run_id has UNIQUE constraint; 23505 (unique violation) is swallowed
 * so client retries do not create duplicate rows.
 * Fire-and-log: errors are logged but never thrown.
 */
async function saveAgentRunOutput(contract, rawOutput) {
  const client = supabaseAdminClient || supabase;
  if (!client || !contract.company_id) return;
  try {
    const { error } = await client
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
  const client = supabaseAdminClient || supabase;
  if (!client) return;
  if (!contract.company_id) return;
  if (contract.artifact.confidence >= 0.5) return;  // only fire for < 0.5
  try {
    const { error } = await client
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
  const client = supabaseAdminClient || supabase;
  if (!client) return;
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
    const { error } = await client.from("agent_tasks").insert(rows);
    if (error) {
      console.error("[contract] writeTasksCreated error:", error);
    } else {
      console.log(`[contract] Wrote ${rows.length} tasks_created for run ${contract.run_id}`);
    }
  } catch (err) {
    console.error("[contract] writeTasksCreated failed:", err);
  }
}

// ── POST /api/agents/veena/onboard ───────────────────────────────────────────
// Triggers the full sequential onboarding chain: veena crawl → agent_tasks for
// isha/neel/zara.
// Body: { company_id: string, website_url?: string, company_name?: string }
// Response: 202 immediately — crawl runs in background; poll GET /api/mkg/:companyId.
//
// Idempotent: if an onboard_crawl task already exists for this company_id in
// status running or done, returns the existing run_id rather than starting a duplicate.
app.post("/api/agents/veena/onboard", async (req, res) => {
  const { company_id, website_url, company_name } = req.body || {};
  if (!company_id?.trim()) {
    return res.status(400).json({ error: "company_id is required" });
  }

  const companyId = company_id.trim();

  const taskClient = supabaseForServerData();
  if (taskClient) {
    try {
      const { data: existing } = await taskClient
        .from("agent_tasks")
        .select("triggered_by_run_id, status")
        .eq("company_id", companyId)
        .eq("task_type", "onboard_crawl")
        .in("status", ["running", "done"])
        .maybeSingle();
      if (existing?.triggered_by_run_id) {
        return res.status(200).json({
          run_id: existing.triggered_by_run_id,
          message: "Onboarding already in progress or complete for this company",
        });
      }
    } catch (err) {
      console.warn("[veena/onboard] idempotency check failed:", err.message);
    }
  }

  const onboardRunId = randomUUID();
  res.status(202).json({
    run_id: onboardRunId,
    onboard_run_id: onboardRunId,
    message: `Onboarding started. Poll GET /api/mkg/${companyId} to track progress.`,
  });

  setImmediate(async () => {
    const targetWebsiteUrl =
      website_url?.trim() || `https://${companyId.replace(/^https?:\/\//i, "")}.com`;
    const veenaRunId = randomUUID();
    const chainBaseTime = Date.now();
    let crawlResult = null;
    let contextPatch = {};
    let crawlError = null;

    try {
      await initializeMKGTemplate(companyId);
      console.log(`[veena/onboard] MKG template initialized for ${companyId}`);

      const adminOrAnon = supabaseAdminClient || supabase;
      if (adminOrAnon) {
        const { error } = await adminOrAnon.from("agent_tasks").insert({
          agent_name: "veena",
          task_type: "onboard_crawl",
          status: "running",
          company_id: companyId,
          triggered_by_run_id: onboardRunId,
          description: `Onboarding crawl for ${company_name || companyId}`,
          priority: "high",
        });
        if (error) {
          console.error("[veena/onboard] Failed to insert veena task:", error);
        }
      }

      try {
        crawlResult = await crawlCompanyForMKG(targetWebsiteUrl);
        contextPatch = buildContextPatchFromCrawl(crawlResult, "veena", veenaRunId);
        await MKGService.patch(companyId, contextPatch);
        console.log(`[veena/onboard] Crawl complete for ${companyId} — MKG patched`);

        await saveAgentRunOutput(
          {
            agent: "veena",
            task: "company_onboard_crawl",
            company_id: companyId,
            run_id: veenaRunId,
            timestamp: new Date().toISOString(),
            input: {
              website_url: website_url || null,
              company_name: company_name || null,
            },
            artifact: {
              data: crawlResult,
              summary: `Bootstrapped MKG from ${targetWebsiteUrl}`,
              confidence: 0.7,
            },
            context_patch: {
              writes_to: Object.keys(contextPatch),
              patch: contextPatch,
            },
            handoff_notes:
              "MKG initialized from website crawl. Isha, Neel, and Zara are queued for onboarding briefings.",
            missing_data: [],
            tasks_created: [
              {
                agent_name: "isha",
                task_type: "onboard_briefing",
                description: "Onboarding market research briefing",
                priority: "high",
              },
              {
                agent_name: "neel",
                task_type: "onboard_briefing",
                description: "Onboarding strategy briefing",
                priority: "high",
              },
              {
                agent_name: "zara",
                task_type: "onboard_briefing",
                description: "Onboarding distribution briefing",
                priority: "high",
              },
            ],
            outcome_prediction: null,
          },
          JSON.stringify(crawlResult)
        );
      } catch (err) {
        crawlError = err;
        console.error(`[veena/onboard] Crawl failed for ${companyId}:`, err.message);
      }

      if (adminOrAnon) {
        const { error } = await adminOrAnon
          .from("agent_tasks")
          .update({
            status: crawlError ? "failed" : "done",
            error_message: crawlError ? String(crawlError) : null,
            completed_at: new Date().toISOString(),
            triggered_by_run_id: veenaRunId,
          })
          .eq("company_id", companyId)
          .eq("task_type", "onboard_crawl")
          .eq("agent_name", "veena")
          .eq("triggered_by_run_id", onboardRunId);
        if (error) {
          console.error("[veena/onboard] Failed to update veena task:", error);
        }
      }

      if (adminOrAnon) {
        const chainRows = ["isha", "neel", "zara"].map((agentName, index) => ({
          agent_name: agentName,
          task_type: "onboard_briefing",
          status: "scheduled",
          company_id: companyId,
          triggered_by_run_id: veenaRunId,
          description: `Onboarding briefing for ${company_name || companyId}`,
          priority: "high",
          scheduled_for: new Date(chainBaseTime + (index + 1) * 60000).toISOString(),
        }));
        const { error } = await adminOrAnon.from("agent_tasks").insert(chainRows);
        if (error) {
          console.error("[veena/onboard] Failed to write chain tasks:", error);
        } else {
          console.log(
            `[veena/onboard] Chain tasks written: isha, neel, zara queued for ${companyId}`
          );
        }
      }
    } catch (outerErr) {
      console.error("[veena/onboard] Unhandled background error:", outerErr);
    }
  });
});

// ── Industry Intel ────────────────────────────────────────────────────────────

const INDUSTRY_INTEL_FILE = (companyId) =>
  join(dirname(fileURLToPath(import.meta.url)), '..', 'crewai', 'memory', companyId, 'industry_intel.json');

async function loadIndustryIntel(companyId) {
  if (!companyId) return null;
  try {
    const raw = await readFile(INDUSTRY_INTEL_FILE(companyId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Helpers for industry intel ────────────────────────────────────────────────

async function buildIndustryContext(companyId) {
  let companyName = null, positioning = null, icp = null, competitors = null;
  try {
    const mkg = await MKGService.read(companyId);
    if (mkg) {
      positioning = mkg.positioning?.value ?? null;
      icp         = mkg.icp?.value         ?? null;
      competitors = mkg.competitors?.value ?? null;
    }
  } catch {}
  try {
    const { data: co } = await (supabaseForServerData()?.from('companies').select('name,company_name').eq('id', companyId).single() ?? {});
    companyName = co?.company_name || co?.name || null;
  } catch {}
  return { companyName, positioning, icp, competitors };
}

// Derive a concise search query from MKG context via Groq
async function deriveSearchQuery(ctx, groqClient) {
  const parts = [];
  if (ctx.companyName) parts.push(`Company: ${ctx.companyName}`);
  if (ctx.positioning) parts.push(`Positioning: ${typeof ctx.positioning === 'string' ? ctx.positioning : JSON.stringify(ctx.positioning)}`);
  if (ctx.icp)         parts.push(`ICP: ${typeof ctx.icp === 'string' ? ctx.icp : JSON.stringify(ctx.icp)}`);
  if (ctx.competitors) parts.push(`Competitors: ${typeof ctx.competitors === 'string' ? ctx.competitors : JSON.stringify(ctx.competitors)}`);
  if (!parts.length) return 'industry trends';

  const resp = await groqClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [{
      role: 'user',
      content: `Given this company context, produce a single concise search query (5-8 words max) that best captures the industry/market to research on Reddit and YouTube. Return ONLY the query string, nothing else.\n\n${parts.join('\n')}`,
    }],
    temperature: 0.2,
    max_tokens: 30,
  });
  return resp.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
}

// Run last30days.py subprocess — resolves with { brief, source } or rejects
function runLast30Days(query, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.env.HOME || '/root', '.claude', 'skills', 'last30days', 'scripts', 'last30days.py');
    const args = [scriptPath, query, '--emit', 'md', '--quick', '--timeout', String(Math.floor(timeoutMs / 1000) - 10)];

    // Pass SCRAPECREATORS_API_KEY if available
    const env = { ...process.env };
    const configEnvPath = join(process.env.HOME || '/root', '.config', 'last30days', '.env');

    let stdout = '';
    let stderr = '';
    const proc = spawn('python3', args, { env });

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`last30days timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      // Strip ANSI codes and UI chrome from output
      const clean = stdout
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/^[└┌│├─⏳✓✗✔✘].*/gm, '')
        .replace(/^\/last30days.*$/gm, '')
        .replace(/^\s*$/gm, '')
        .trim();

      if (code !== 0 || clean.length < 200) {
        reject(new Error(`last30days exited ${code} — insufficient output (${clean.length} chars). stderr: ${stderr.slice(0, 300)}`));
      } else {
        resolve({ brief: clean, source: 'last30days' });
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Groq synthesis fallback
async function groqIntelSynthesis(ctx, groqClient) {
  const parts = [];
  if (ctx.companyName) parts.push(`Company: ${ctx.companyName}`);
  if (ctx.positioning) parts.push(`Positioning: ${typeof ctx.positioning === 'string' ? ctx.positioning : JSON.stringify(ctx.positioning)}`);
  if (ctx.icp)         parts.push(`Target audience: ${typeof ctx.icp === 'string' ? ctx.icp : JSON.stringify(ctx.icp)}`);
  if (ctx.competitors) parts.push(`Known competitors: ${typeof ctx.competitors === 'string' ? ctx.competitors : JSON.stringify(ctx.competitors)}`);

  const contextBlock = parts.length ? parts.join('\n') : 'No company context available.';
  const resp = await groqClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [{
      role: 'user',
      content: `You are an industry analyst. Generate a concise recent industry intelligence brief for the following company.

Company context:
${contextBlock}

Cover these 5 areas (infer the relevant industry, geography, and competitive landscape from the context above):
1. **Market Signals** — growth numbers, volume shifts, new entrants, funding rounds
2. **Regulatory Pulse** — relevant regulatory or compliance changes
3. **Competitor Moves** — product launches, pricing changes, campaigns, partnerships
4. **Consumer Trends** — behavioural shifts, channel preferences, sentiment
5. **White Space** — gaps or opportunities opening up in the market

Use specific data points where possible. Keep each section to 3-5 bullet points.
Format as clean markdown. Today's date: ${new Date().toDateString()}.`,
    }],
    temperature: 0.5,
    max_tokens: 1500,
  });
  return { brief: resp.choices[0].message.content, source: 'groq' };
}

app.post('/api/industry-intel/:companyId/refresh', async (req, res) => {
  const { companyId } = req.params;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  const groqClient = tracedLLM({ traceName: 'industry-intel', userId: companyId, tags: ['industry-intel'] });

  const ctx = await buildIndustryContext(companyId);

  // Derive search query from MKG
  let searchQuery = 'industry trends';
  try { searchQuery = await deriveSearchQuery(ctx, groqClient); } catch {}
  console.log(`[industry-intel] query: "${searchQuery}"`);

  // Try last30days subprocess first, fall back to Groq synthesis
  let result;
  try {
    result = await runLast30Days(searchQuery);
    console.log(`[industry-intel] last30days succeeded (${result.brief.length} chars)`);
  } catch (err) {
    console.warn(`[industry-intel] last30days failed: ${err.message} — falling back to Groq`);
    try {
      result = await groqIntelSynthesis(ctx, groqClient);
    } catch (groqErr) {
      return res.status(500).json({ error: groqErr.message });
    }
  }

  const payload = {
    brief:        result.brief,
    source:       result.source,
    search_query: searchQuery,
    company_name: ctx.companyName,
    generated_at: new Date().toISOString(),
  };

  // Store to file
  try {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'crewai', 'memory', companyId);
    await mkdir(dir, { recursive: true });
    await writeFile(INDUSTRY_INTEL_FILE(companyId), JSON.stringify(payload, null, 2));
  } catch (e) {
    console.warn('[industry-intel] file write error:', e.message);
  }

  return res.json({ status: 'ok', ...payload });
});

app.get('/api/industry-intel/:companyId', async (req, res) => {
  const intel = await loadIndustryIntel(req.params.companyId);
  if (!intel) return res.json({ brief: null });
  return res.json(intel);
});

// ── POST /api/agents/planner/route ─────────────────────────────────────────────
// Given a natural-language goal, returns a structured workflow plan:
//   { workflow_name, description, steps: [{ agent, query, description, order }] }
// Uses Groq to classify the goal against known workflows and agent capabilities.

app.post("/api/agents/planner/route", async (req, res) => {
  const { goal, company_id } = req.body || {};
  if (!goal?.trim()) return res.status(400).json({ error: "goal is required" });

  const companyId = typeof company_id === "string" ? company_id.trim() : null;

  // Load MKG for context
  let mkgSummary = "";
  if (companyId) {
    try {
      const mkg = await MKGService.read(companyId).catch(() => null);
      if (mkg) {
        const parts = [];
        if (mkg.positioning?.value) parts.push(`Positioning: ${JSON.stringify(mkg.positioning.value).slice(0, 120)}`);
        if (mkg.icp?.value) parts.push(`ICP: ${JSON.stringify(mkg.icp.value).slice(0, 120)}`);
        if (mkg.offers?.value) parts.push(`Offers: ${JSON.stringify(mkg.offers.value).slice(0, 120)}`);
        mkgSummary = parts.join("\n");
      }
    } catch { /* non-blocking */ }
  }

  const systemPrompt = `You are a marketing workflow planner for Marqq AI. Given a user goal, return a JSON workflow plan.

Available agents and what they do:
- veena: company research, MKG population, initial intelligence
- isha: market signals, competitor research, industry trends
- neel: SEO research, keyword strategy, content gaps
- sam: outreach sequences, proposal writing, lead qualification
- riya: content creation, social posts, emails, images, videos, SEO articles
- maya: SEO monitoring, ranking analysis, content performance
- arjun: lead intelligence, ICP matching, lead scoring
- tara: marketing audit, channel analysis, GTM strategy
- kiran: performance analysis, budget optimization, ROAS
- dev: technical analysis, data pipelines, campaign analytics
- priya: brand intelligence, positioning, messaging
- zara: campaign strategy, distribution planning, launch coordination

Respond ONLY with valid JSON. No prose. Schema:
{
  "workflow_name": "string (short descriptive name)",
  "description": "string (one sentence what this workflow does)",
  "steps": [
    { "order": 1, "agent": "agent_name", "query": "specific task query for this agent", "description": "what this step produces" }
  ]
}

Rules:
- 2 to 4 steps max
- Each step query should be specific and actionable, referencing the user goal
- Pick agents that logically chain: researcher → strategist → creator → executor
- Return only the JSON object, no markdown fences`;

  const userMessage = `Goal: "${goal.trim()}"${mkgSummary ? `\n\nCompany context:\n${mkgSummary}` : ""}`;

  try {
    const completion = await groq.chat.completions.create({
      model: getLLMModel('agent-plan'),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    // Strip markdown fences if model adds them
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    let plan;
    try {
      plan = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: "Planner returned invalid JSON", raw });
    }
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// ── POST /api/agents/chain/run ──────────────────────────────────────────────────
// Runs a sequence of agent steps one-by-one, streaming SSE for each.
// Body: { steps: [{ agent, query }], company_id }
// SSE events:
//   data: { step_start: { order, agent, query } }
//   data: { text: "..." }              (prose from that agent)
//   data: { tool_call: {...} }
//   data: { tool_result: {...} }
//   data: { step_done: { order, agent, contract: {...} } }
//   data: [DONE]

app.post("/api/agents/chain/run", async (req, res) => {
  const { steps, company_id } = req.body || {};
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: "steps array required" });
  }

  const companyId = typeof company_id === "string" ? company_id.trim() : null;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agentName = step.agent?.toLowerCase?.();
      const query = step.query?.trim?.();
      if (!agentName || !VALID_AGENTS.has(agentName) || !query) continue;

      send({ step_start: { order: i + 1, agent: agentName, query } });

      // Load agent context (same as /run)
      const soulPath = join(AGENTS_DIR, agentName, "SOUL.md");
      let systemPrompt = `You are ${agentName}, a marketing AI agent.`;
      try { systemPrompt = await readFile(soulPath, "utf-8"); } catch { /* default */ }

      const { memory, heartbeat, calibrationNote } = await loadAgentPromptContext(agentName, companyId);

      const skillsBlock = await loadAgentSkillsBlock(agentName, AGENTS_DIR);

      let mkgBlock = "";
      if (companyId) {
        try {
          const [mkgData, companiesData] = await Promise.all([
            MKGService.read(companyId).catch(() => null),
            fetch(`http://localhost:${process.env.PORT || 3007}/api/company-intel/companies`).then(r => r.json()).catch(() => null),
          ]);
          const company = (companiesData?.companies ?? []).find(c => c.id === companyId);
          const profile = company?.profile ?? {};
          const mkg = mkgData ?? {};
          const lines = ["## Company Knowledge Base"];
          if (company?.companyName) lines.push(`Company: ${company.companyName}`);
          if (profile.summary) lines.push(`Summary: ${profile.summary}`);
          if (profile.industry) lines.push(`Industry: ${profile.industry}`);
          const mkgFields = ["positioning", "icp", "competitors", "offers", "messaging", "channels", "content_pillars"];
          for (const field of mkgFields) {
            const entry = mkg[field];
            if (entry?.value != null && entry.confidence >= 0.5) lines.push(`Company.${field}: ${JSON.stringify(entry.value).slice(0, 200)}`);
          }
          if (lines.length > 1) mkgBlock = "\n\n" + lines.join("\n");
        } catch { /* non-blocking */ }
      }

      const runId = randomUUID();
      const contractInstruction = `

## Output Contract (REQUIRED — do not skip)

After your COMPLETE response, append the following block EXACTLY at the very END.

---CONTRACT---
{
  "agent": "${agentName}",
  "task": "<one-line description of what you just did>",
  "company_id": "${companyId ?? "unknown"}",
  "run_id": "${runId}",
  "timestamp": "${new Date().toISOString()}",
  "input": { "mkg_version": null, "dependencies_read": [], "assumptions_made": [] },
  "artifact": {
    "data": {},
    "summary": "<one paragraph summary of your output>",
    "confidence": 0.75
  },
  "context_patch": { "writes_to": [], "patch": {} },
  "handoff_notes": "",
  "missing_data": [],
  "tasks_created": [],
  "outcome_prediction": null,
  "automation_triggers": []
}
`;

      const fullSystem = [
        systemPrompt,
        skillsBlock,
        memory ? `\n\n## Your Recent Memory\n${memory}` : "",
        heartbeat ? `\n\n## Your Current Heartbeat\n${heartbeat}` : "",
        calibrationNote?.text ? `\n\n## Calibration Notes\n${calibrationNote.text}` : "",
        mkgBlock,
        `\n\n## Run Context\ncompany_id: ${companyId ?? "unknown"}\nrun_id: ${runId}\nchain_step: ${i + 1} of ${steps.length}`,
        contractInstruction,
      ].filter(Boolean).join("");

      const messages = [{ role: "system", content: fullSystem }, { role: "user", content: query }];

      const CONTENT_GEN_TASK_TYPES = new Set(["content_creation", "generate_image", "generate_video", "generate_avatar_video", "generate_email", "seo_analysis"]);
      let composioTools = [];
      const composioApiKey = process.env.COMPOSIO_API_KEY;
      const allowedConnectorIds = getAgentConnectors(agentName);
      const allowedApps = getAgentConnectorApps(agentName);
      const connectorAppMap = Object.fromEntries(
        allowedConnectorIds.map((connectorId, index) => [connectorId, allowedApps[index]])
      );
      if (composioApiKey && companyId && allowedApps.length > 0) {
        try {
          const connectorStates = await getConnectors(companyId);
          const connectedAllowedIds = new Set(
            connectorStates
              .filter((connector) => connector.connected && allowedConnectorIds.includes(connector.id))
              .map((connector) => connector.id)
          );
          const connectedAllowedApps = allowedConnectorIds
            .filter((connectorId) => connectedAllowedIds.has(connectorId))
            .map((connectorId) => connectorAppMap[connectorId])
            .filter(Boolean);
          if (connectedAllowedApps.length > 0) {
            composioTools = await getComposioTools(companyId, composioApiKey, {
              toolkits: connectedAllowedApps,
              limit: 10,
            });
          }
        } catch {
          /* skip */
        }
      }

      const { fullText } = await runAgenticLoop({
        groqClient: groq,
        model: getLLMModel('agent-run'),
        messages,
        tools: composioTools,
        res,
        entityId: companyId,
        composioApiKey: composioTools.length ? composioApiKey : null,
        reasoningFormat: process.env.AGENT_REASONING_FORMAT || undefined,
        reasoningEffort: RESOLVED_AGENT_REASONING_EFFORT,
        maxRounds: 4,
      });

      // Parse contract and patch MKG
      const contractMatch = String(fullText ?? '').match(/---CONTRACT---\s*([\s\S]*?)(?:---END CONTRACT---|$)/);
      let contractObj = null;
      if (contractMatch) {
        try {
          const cleaned = contractMatch[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
          contractObj = JSON.parse(cleaned);
          if (companyId && contractObj?.context_patch?.patch) {
            await MKGService.patch(companyId, contractObj.context_patch.patch).catch(() => {});
          }
        } catch { /* malformed contract */ }
      }

      send({ step_done: { order: i + 1, agent: agentName, contract: contractObj } });
    }
  } catch (err) {
    send({ error: String(err.message) });
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// ── POST /api/agents/:name/run ─────────────────────────────────────────────────
// Runs an agent interactively (triggered by slash commands in ChatHome).
// Loads SOUL.md + MEMORY.md + skills/*.md as system prompt, calls Groq, streams SSE.
// Response format: data: {"text":"..."}\n\n ... data: [DONE]\n\n

app.post("/api/agents/:name/run", async (req, res) => {
  const { name } = req.params;
  const {
    query,
    company_id,
    run_id: clientRunId,
    task_type,
    triggered_by,
    trigger_id,
    hook_id,
    trigger_metadata,
    offer_focus,
    tags: clientTags,
    conversation_history,
  } = req.body;
  const workspaceId = typeof req.headers["x-workspace-id"] === "string"
    ? req.headers["x-workspace-id"].trim()
    : null;
  const headerUserId = typeof req.headers["x-user-id"] === "string"
    ? req.headers["x-user-id"].trim()
    : null;

  console.log(`[agent:${name}] run started, workspace: ${workspaceId}, company_id: ${company_id}, query length: ${query?.length}`);

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: "Unknown agent" });
  }
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  // ── Plan + Credit check ────────────────────────────────────────────────────
  // Credits are per user (shared across all their workspaces).
  // Plan for module-access gating comes from user_plans; workspace plan is fallback.
  if (workspaceId || headerUserId) {
    try {
      const pdb = supabaseForServerData();
      // Resolve userId: prefer explicit header, fall back to workspace owner_id
      let userId = headerUserId;
      let workspacePlan = "growth";

      if (workspaceId) {
        const { data: ws } = await pdb
          .from("workspaces")
          .select("plan, owner_id")
          .eq("id", workspaceId)
          .single();
        if (ws) {
          workspacePlan = ws.plan || "growth";
          if (!userId) userId = ws.owner_id || null;
        }
      }

      if (userId) {
        // Look up user-level plan record
        let { data: up } = await pdb
          .from("user_plans")
          .select("plan, credits_remaining, credits_total, credits_reset_at")
          .eq("user_id", userId)
          .single();

        // Seed a record if none exists yet
        if (!up) {
          const seedTotal = PLAN_CREDITS[workspacePlan] ?? 500;
          const { data: inserted } = await pdb
            .from("user_plans")
            .insert({
              user_id: userId,
              plan: workspacePlan,
              credits_remaining: seedTotal,
              credits_total: seedTotal,
              credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select()
            .single();
          up = inserted;
        }

        if (up) {
          const plan = up.plan || workspacePlan || "growth";

          // Reset credits if the monthly window has elapsed
          const resetAt = up.credits_reset_at ? new Date(up.credits_reset_at) : null;
          if (resetAt && new Date() > resetAt) {
            const newTotal = PLAN_CREDITS[plan] ?? 500;
            await pdb
              .from("user_plans")
              .update({
                credits_remaining: newTotal,
                credits_total: newTotal,
                credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
            up.credits_remaining = newTotal;
          }

          // Check module access
          if (!canAccessModule(plan, task_type)) {
            return res.status(403).json({
              error: "module_locked",
              message: "This module is not available on your current plan.",
              required_plan: plan === "growth" ? "scale" : "agency",
              current_plan: plan,
            });
          }

          // Check credit balance (unlimited = -1)
          const creditCost = CREDIT_COSTS.agent_run;
          if (up.credits_remaining !== -1 && up.credits_remaining < creditCost) {
            return res.status(402).json({
              error: "insufficient_credits",
              message: "You've used all your agent run credits for this month.",
              credits_remaining: up.credits_remaining,
              credits_total: up.credits_total,
              reset_at: up.credits_reset_at,
            });
          }

          // Deduct credit immediately (optimistic deduction)
          if (up.credits_remaining !== -1) {
            await pdb
              .from("user_plans")
              .update({
                credits_remaining: up.credits_remaining - creditCost,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          }
        }
      }
    } catch (planErr) {
      // Non-fatal: if plan check fails, let the run proceed
      console.warn("[plan-check] error:", planErr.message);
    }
  }
  // ── End plan + credit check ────────────────────────────────────────────────

  // Generate or adopt run_id for idempotency
  const runId = (typeof clientRunId === "string" && clientRunId.trim())
    ? clientRunId.trim()
    : randomUUID();

  const companyId = (typeof company_id === "string" && company_id.trim())
    ? company_id.trim()
    : (typeof workspaceId === "string" && workspaceId.trim())
      ? workspaceId.trim()
      : null;

  const agentMailApiKey = process.env.AGENTMAIL_API_KEY || "";
  const shouldUseAgentMailForReportDelivery =
    name === "sam" &&
    task_type === "report_delivery" &&
    Boolean(agentMailApiKey) &&
    extractEmailAddresses(query).length > 0;

  if (shouldUseAgentMailForReportDelivery) {
    try {
      const startedAt = Date.now();
      const sent = await sendReportViaAgentMail({
        apiKey: agentMailApiKey,
        companyId,
        query,
      });

      const narrative = [
        `Sent the report by email via AgentMail to ${sent.parsed.recipients.join(", ")}.`,
        sent.parsed.docUrl ? `Included report link: ${sent.parsed.docUrl}` : "",
        sent.parsed.slackTargets.length
          ? `Slack targets were requested (${sent.parsed.slackTargets.join(", ")}), but AgentMail handled the email portion only.`
          : "",
      ].filter(Boolean).join(" ");

      const contract = {
        agent: name,
        task: "Send report via AgentMail",
        company_id: companyId ?? null,
        run_id: runId,
        timestamp: new Date().toISOString(),
        input: {
          mkg_version: null,
          dependencies_read: ["agentmail"],
          assumptions_made: sent.parsed.slackTargets.length
            ? ["Slack delivery was not executed in the AgentMail path."]
            : [],
        },
        artifact: {
          data: {
            sent_via: "agentmail",
            recipients: sent.parsed.recipients,
            slack_targets: sent.parsed.slackTargets,
            subject_line: sent.parsed.subject,
            doc_url: sent.parsed.docUrl,
            delivery_status: "sent",
            inbox_id: sent.inbox.inbox_id || null,
            message_id: sent.result?.message_id || null,
            thread_id: sent.result?.thread_id || null,
          },
          summary: narrative,
          confidence: 0.98,
        },
        context_patch: { writes_to: [], patch: {} },
        handoff_notes: sent.parsed.slackTargets.length
          ? `Email was sent via AgentMail. Slack delivery still requires the existing Slack-based path if needed.`
          : "Email was sent via AgentMail.",
        missing_data: [],
        tasks_created: [],
        outcome_prediction: null,
        automation_triggers: [],
      };

      const fullText = `${narrative}\n\n---CONTRACT---\n${JSON.stringify(contract, null, 2)}`;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ text: narrative })}\n\n`);
      await finalizeAgentRunResponse({
        name,
        runId,
        companyId,
        fullText,
        res,
        startedAt,
      });
      return;
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: toUserFacingError(err) })}\n\n`);
      res.end();
      return;
    }
  }

  // Load SOUL.md
  const soulPath = join(AGENTS_DIR, name, "SOUL.md");
  let systemPrompt = `You are ${name}, a marketing AI agent.`;
  try {
    systemPrompt = await readFile(soulPath, "utf-8");
  } catch {
    /* use default */
  }

  // Load MEMORY.md / HEARTBEAT.md
  const { memory, heartbeat, calibrationNote } = await loadAgentPromptContext(name, companyId);

  const skillsBlock = await loadAgentSkillsBlock(name, AGENTS_DIR);

  // Load MKG + company profile for context injection
  let mkgBlock = "";
  if (companyId) {
    try {
      const [mkgData, companiesData] = await Promise.all([
        MKGService.read(companyId).catch(() => null),
        fetch(`http://localhost:${process.env.PORT || 3007}/api/company-intel/companies`).then(r => r.json()).catch(() => null),
      ]);

      const company = (companiesData?.companies ?? []).find(c => c.id === companyId);
      const profile = company?.profile ?? {};
      const mkg = mkgData ?? {};

      const lines = ["## Company Knowledge Base"];

      if (company?.companyName) lines.push(`Company: ${company.companyName}`);
      if (company?.websiteUrl) lines.push(`Website: ${company.websiteUrl}`);
      if (profile.summary) lines.push(`Summary: ${profile.summary}`);
      if (profile.industry) lines.push(`Industry: ${profile.industry}`);
      if (Array.isArray(profile.geoFocus) && profile.geoFocus.length) lines.push(`Geography: ${profile.geoFocus.join(", ")}`);
      if (Array.isArray(profile.offerings) && profile.offerings.length) lines.push(`Offerings: ${profile.offerings.join(", ")}`);
      if (Array.isArray(profile.primaryAudience) && profile.primaryAudience.length) lines.push(`Primary Audience: ${profile.primaryAudience.join(", ")}`);
      if (profile.brandVoice?.tone) lines.push(`Brand Voice: ${profile.brandVoice.tone}${profile.brandVoice.style ? `, ${profile.brandVoice.style}` : ""}`);

      // Inject high-confidence company knowledge fields
      const mkgFields = ["positioning", "icp", "competitors", "offers", "messaging", "channels", "content_pillars"];
      for (const field of mkgFields) {
        const entry = mkg[field];
        if (entry?.value != null && entry.confidence >= 0.5) {
          lines.push(`Company.${field}: ${JSON.stringify(entry.value)}`);
        }
      }

      if (lines.length > 1) mkgBlock = "\n\n" + lines.join("\n");
    } catch { /* non-blocking */ }
  }

  let workspaceContextBlock = "";
  if (workspaceId) {
    try {
      const marketingContext = await assembleMarketingContext({ workspaceId, companyId: companyId || "" });
      const lines = ["## Workspace Context"];
      if (marketingContext.workspace?.name) lines.push(`Workspace: ${marketingContext.workspace.name}`);
      if (marketingContext.workspace?.websiteUrl) lines.push(`Workspace website: ${marketingContext.workspace.websiteUrl}`);

      const savedContext = marketingContext.agentContext || {};
      if (!companyId) {
        if (savedContext.company) lines.push(`Saved company context: ${savedContext.company}`);
        if (savedContext.industry) lines.push(`Saved industry context: ${savedContext.industry}`);
        if (savedContext.icp) lines.push(`Saved ICP context: ${savedContext.icp}`);
        if (savedContext.competitors) lines.push(`Saved competitors context: ${savedContext.competitors}`);
      }
      if (savedContext.primary_goal) lines.push(`Saved primary goal: ${savedContext.primary_goal}`);
      if (savedContext.goals) lines.push(`Saved goals: ${savedContext.goals}`);

      if (!companyId && Array.isArray(marketingContext.artifacts) && marketingContext.artifacts.length) {
        lines.push(
          `Available company intelligence:\n- ${marketingContext.artifacts
            .slice(0, 6)
            .map((item) => `${item.type}: ${item.preview}`)
            .join("\n- ")}`
        );
      }

      if (lines.length > 1) workspaceContextBlock = "\n\n" + lines.join("\n");
    } catch {
      /* non-blocking */
    }
  }

  // Run context block — injected so LLM echoes correct values into contract JSON
  const triggerContextBlock = triggered_by
    ? `\n## Trigger Context\ntriggered_by: ${triggered_by}\ntrigger_id: ${trigger_id ?? "unknown"}\nhook_id: ${hook_id ?? "unknown"}\ntask_type: ${task_type ?? "unknown"}\ntrigger_metadata: ${JSON.stringify(trigger_metadata || {})}\n`
    : "";
  const offerFocusBlock = offer_focus?.name
    ? `\n## Product / Service Focus\nThis run is scoped to a specific product or service. All analysis, copy, and recommendations MUST be anchored to this product — do not generalise to the full company portfolio unless explicitly asked.\nname: ${offer_focus.name}${offer_focus.price_signal ? `\nprice_signal: ${offer_focus.price_signal}` : ""}${offer_focus.tier ? `\ntier: ${offer_focus.tier}` : ""}\n`
    : "";
  const runContextBlock = `\n\n## Run Context\ncompany_id: ${companyId ?? "unknown"}\nrun_id: ${runId}\n${triggerContextBlock}${offerFocusBlock}`;

  // Fetch recent automation results for this company (service role if RLS on automation_runs)
  let recentAutomationData = '';
  if (companyId) {
    try {
      const autoRunClient = supabaseForServerData();
      if (autoRunClient) {
        const { data: recentRuns } = await autoRunClient
          .from('automation_runs')
          .select('automation_name, result, created_at')
          .eq('company_id', companyId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(5);
        if (recentRuns?.length) {
          const lines = recentRuns.map(r =>
            `- ${r.automation_name} (${new Date(r.created_at).toLocaleDateString()}): ${JSON.stringify(r.result).slice(0, 400)}`
          ).join('\n');
          recentAutomationData = `\n\n## Recent Automation Data\nThe following connector data was automatically fetched for this company and is available for your analysis:\n${lines}`;
        }
      }
    } catch { /* non-blocking */ }
  }

  const guardrailsBlock = buildAgentRunGuardrails(name, task_type);

  // Industry intel — auto-inject stored brief if available
  let industryIntelBlock = '';
  if (companyId) {
    try {
      const intel = await loadIndustryIntel(companyId);
      if (intel?.brief) {
        industryIntelBlock = `\n\n## Industry Intelligence (Last 30 Days)\nUse this as live market context when forming recommendations. Generated: ${intel.generated_at ?? 'unknown'}.\n\n${intel.brief}`;
      }
    } catch {}
  }

  // Contract instruction — always appended LAST so it takes precedence
  const contractInstruction = `

## Output Contract (REQUIRED — do not skip)

⚠️ CRITICAL: You MUST always write substantive user-facing prose BEFORE the contract block.
If data is missing, say exactly what is missing and provide your best analysis based on available context.
Do NOT return only JSON, only contract, or empty prose. Your response is USELESS without readable text for the user.

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
  "outcome_prediction": null,
  "automation_triggers": []
}

Replace ALL placeholder values with your actual outputs.
- artifact.data: MUST contain the key structured outputs. For content (posts, briefs, calendars), include the full content as strings inside data. For analysis, include findings, scores, or lists. Never leave data as {}.
  Examples: {"post": "...", "hashtags": ["#A","#B"]} | {"blog_ideas": [...]} | {"calendar": [...]} | {"scores": {...}, "variants": [...]}
- confidence: your honest assessment of output quality (0.0–1.0)
- context_patch.patch: use only valid MKG field names: positioning, icp, competitors, offers, messaging, channels, funnel, metrics, baselines, content_pillars, campaigns, insights
- tasks_created: array of { "task_type": "...", "agent_name": "...", "description": "...", "priority": "low|medium|high" }
- outcome_prediction: optional — include if you can predict a measurable metric change, otherwise keep null
- automation_triggers: array of { "automation_id": "<id from registry>", "params": {}, "reason": "<why>" } — include when you need to generate content assets (images, videos, emails, articles) OR fetch live data. For content creation tasks (image, email, video, article), you MUST populate this with the appropriate automation_id
- "scheduled_automations": recurring jobs to schedule, e.g. [{ "automation_id": "fetch_meta_ads", "cron": "0 9 * * *", "params": { "ad_account_id": "act_123" }, "reason": "Daily morning pull" }]. Cron patterns: "0 9 * * *" daily 9am, "0 */6 * * *" every 6h, "*/15 * * * *" every 15min, "0 9 * * 1" weekly Mon 9am. Use [] if no schedule needed.
- The JSON must be valid JSON (no trailing commas, no comments)

## Available Paid Media Automations
- fetch_meta_ads: Read Meta Ads performance (campaigns, spend, CTR, ROAS) — params: { ad_account_id?, date_range? }
- create_meta_campaign: Create a full Meta Ads campaign (Campaign→AdSet→Creative→Ad) — params: { campaign_name, objective, daily_budget, targeting, headline, primary_text, link_url, cta_type?, status? }
- optimize_meta_roas: Pause low-ROAS ads and scale winning ad sets — params: { roas_threshold_pause?, roas_threshold_scale?, budget_scale_factor?, date_range?, dry_run? }. Set as scheduled_automation every 6h for autonomous ROAS management.
- google_ads_fetch: Read Google Ads campaigns — params: { campaign_name?, campaign_id? }

## Available Content Creation Automations (Riya + Maya)
- generate_social_image: Gemini Flash image (gemini-3.1-flash-image-preview) -> imgbb CDN. params: { prompt, aspect_ratio (1:1|16:9|9:16|4:5), platform, brand_context?, style? }. Returns: { image_url, cdn_url, platform }
- generate_email_html: Full inline-CSS HTML email newsletter. params: { subject, content, tone?, brand_name?, primary_color?, sections? }. Returns: { html, subject, preview_text }
- generate_faceless_video: Google Veo 3.1 video (async). params: { prompt, duration?, aspect_ratio?, style? }. Returns: { status:queued, operation_name }
- generate_avatar_video: HeyGen spokesperson video (async). params: { script, avatar_id?, voice_id?, background_color?, width?, height? }. Returns: { status:processing, video_id, check_url }
- create_seo_article: Full HTML blog post with SEO meta. params: { keyword, topic?, word_count_target?, target_audience?, brand_context? }. Returns: { html, title, meta_description, slug, word_count }
`;

  const fullSystem = [
    systemPrompt,
    workspaceContextBlock,
    mkgBlock,
    memory ? `\n\n## Your Recent Memory\n${memory}` : "",
    heartbeat ? `\n\n## Your Current Heartbeat\n${heartbeat}` : "",
    calibrationNote?.text ? `\n\n## Latest Calibration Note\n${calibrationNote.text}` : "",
    skillsBlock,
    runContextBlock,
    guardrailsBlock,
    recentAutomationData,
    industryIntelBlock,
    contractInstruction,  // always last
  ].join("");

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const startedAt = Date.now();
  try {
    await markAgentHeartbeat(name, "running", null, null, companyId);

    if (TEST_MODE) {
      const contract = buildTestModeContract({
        name,
        companyId,
        runId,
        soulText: systemPrompt,
        query,
        calibrationNote,
        triggerContext: triggered_by
          ? { triggered_by, trigger_id, hook_id, task_type, trigger_metadata }
          : null,
      });
      const prose = `[TEST MODE] ${name} executed without a live model.\n`;
      const fullText = `${prose}\n---CONTRACT---\n${JSON.stringify(contract, null, 2)}`;
      res.write(`data: ${JSON.stringify({ text: prose })}\n\n`);
      await finalizeAgentRunResponse({
        name,
        runId,
        companyId,
        fullText,
        res,
        startedAt,
        triggerContext: triggered_by
          ? { triggered_by, trigger_id, hook_id, task_type, trigger_metadata }
          : null,
      });
      return;
    }

    let fullText = "";
    let lastModelError = null;
    const extraTags = Array.isArray(clientTags) ? clientTags.filter(t => typeof t === 'string') : [];
    let completed = false;

    if (AGENT_RUN_PRIMARY_PROVIDER === "gemini") {
      try {
        fullText = await generateAgentRunWithGemini({
          model: AGENT_RUN_GEMINI_MODEL,
          systemPrompt: fullSystem,
          userQuery: query,
        });
        if (!hasUsableAgentProse(fullText)) {
          throw new Error("Gemini agent run returned insufficient user-facing prose");
        }
        res.write(`data: ${JSON.stringify({ text: fullText })}\n\n`);
        completed = true;
      } catch (modelError) {
        console.warn(`[agent:${name}] Groq model "${model}" failed: ${modelError?.message || modelError}`);
        lastModelError = modelError;
        fullText = "";
      }
    }

    // Build Composio tools if API key is configured
    // Content-generation taskTypes use automation_triggers (not Composio tools) to avoid
    // the LLM calling random external APIs instead of writing the contract JSON.
    const CONTENT_GEN_TASK_TYPES = new Set([
      'content_creation', 'generate_image', 'generate_video',
      'generate_avatar_video', 'generate_email', 'seo_analysis',
    ]);
    const composioApiKey = process.env.COMPOSIO_API_KEY || null;
    // Composio connections are registered per workspace, not per MKG company.
    // Prefer workspaceId (from x-workspace-id header) as the entity; fall back to companyId.
    const composioEntityId = workspaceId || companyId || "default";
    let composioTools = [];
    const allowedConnectorIds = getAgentConnectors(name);
    const allowedApps = getAgentConnectorApps(name);
    const allowSecondaryCreativeTools =
      name === 'riya' && (
        (task_type === 'generate_image' && allowedConnectorIds.includes('canva')) ||
        (task_type === 'generate_video' && allowedConnectorIds.includes('veo'))
      );
    // Agents that declare "permissions": "read" in mcp.json (e.g. Veena, Maya, Dev, Priya)
    // should ALWAYS get their read-only connectors (GA4, GSC, Sheets) injected, even when
    // the task_type falls in CONTENT_GEN_TASK_TYPES.  Write-capable agents still skip.
    const agentPermission = getAgentPermissions(name);
    const isReadOnlyAgent = agentPermission === 'read';
    const skipComposioForTaskType =
      (!isReadOnlyAgent && CONTENT_GEN_TASK_TYPES.has(task_type) && !allowSecondaryCreativeTools) ||
      (name === 'isha' && task_type === 'daily_market_scan');
    const connectorAppMap = Object.fromEntries(
      allowedConnectorIds.map((connectorId, index) => [connectorId, allowedApps[index]])
    );
    if (composioApiKey && !completed && !skipComposioForTaskType && companyId && allowedApps.length > 0) {
      try {
        const connectorStates = await getConnectors(companyId);
        const connectedAllowedIds = new Set(
          connectorStates
            .filter((connector) => connector.connected && allowedConnectorIds.includes(connector.id))
            .map((connector) => connector.id)
        );
        const connectedAllowedApps = allowedConnectorIds
          .filter((connectorId) => connectedAllowedIds.has(connectorId))
          .map((connectorId) => connectorAppMap[connectorId])
          .filter(Boolean);

        if (connectedAllowedApps.length > 0) {
          composioTools = await getComposioTools(composioEntityId, composioApiKey, {
            toolkits: connectedAllowedApps,
            limit: 40,
          });
          composioTools = filterComposioToolsForTaskType(task_type, composioTools);
          console.log(`[agent:${name}] Composio tools enabled for apps: ${connectedAllowedApps.join(", ")}`);
        } else {
          console.log(`[agent:${name}] No connected allowed Composio apps for workspace ${companyId}; running without tools`);
        }
      } catch (toolFetchErr) {
        // Non-fatal: proceed without tools
        console.warn(`[agent:${name}] Composio tool fetch failed: ${toolFetchErr.message}`);
      }
    }

    const firecrawlApiKeyPresent = Boolean((process.env.FIRECRAWL_API_KEY || '').trim());
    const groqBrowserSearchEnabled =
      process.env.GROQ_BROWSER_SEARCH !== '0' && process.env.GROQ_BROWSER_SEARCH !== 'false';
    // Firecrawl REST (firecrawl_scrape / firecrawl_search) runs in Node when the key is set; MCP remains opt-in.
    const useToolCapableGroqModels =
      composioTools.length > 0 || firecrawlApiKeyPresent || groqBrowserSearchEnabled;
    const groqModelsForRun = useToolCapableGroqModels
      ? (firecrawlApiKeyPresent ? resolveAgentRunFirecrawlGroqModels() : AGENT_RUN_TOOL_GROQ_MODELS)
      : AGENT_RUN_NO_TOOL_GROQ_MODELS;
    if (firecrawlApiKeyPresent && useToolCapableGroqModels) {
      console.log(
        `[agent:${name}] Firecrawl REST: using Groq-native tool models (${groqModelsForRun.join(" → ")})`
      );
    }
    const runModels = completed ? [] : groqModelsForRun;

    for (let modelIndex = 0; modelIndex < runModels.length; modelIndex += 1) {
      const model = runModels[modelIndex];
      try {
        const provider = inferProviderForModel(model);
        console.log(`[agent:${name}] attempting model "${model}" via ${provider}`);
        const agentLlm = tracedLLM({
          traceName: `agent-run:${name}`,
          sessionId: runId,
          userId: companyId || undefined,
          tags: ['agent-run', name, provider, ...(task_type ? [task_type] : []), ...extraTags],
          provider,
        });
        const agenticResult = await runAgenticLoop({
          groqClient: agentLlm,
          model,
          messages: (() => {
            // Inject prior conversation turns (up to 6 most recent) for continuity
            const historyMessages = Array.isArray(conversation_history)
              ? conversation_history.slice(-6).map(m => ({
                  role: m.role === 'user' ? 'user' : 'assistant',
                  content: String(m.content ?? '').slice(0, 2000),
                })).filter(m => m.content)
              : [];
            return [
              { role: "system", content: fullSystem },
              ...historyMessages,
              { role: "user", content: query },
            ];
          })(),
          tools: composioTools,
          res,
          entityId: composioEntityId,
          taskType: task_type,
          composioApiKey,
          reasoningFormat: process.env.AGENT_REASONING_FORMAT || undefined,
          reasoningEffort: RESOLVED_AGENT_REASONING_EFFORT,
          maxTokens: 8192,
          temperature: 0.4,
        });
        fullText = agenticResult.fullText;
        const toolExecutions = agenticResult.toolExecutions || [];
        const streamSupplement = agenticResult.streamSupplement || "";

        console.log(`[agent:${name}] fullText length: ${fullText.length}, first 300: ${fullText.slice(0, 300)}`);

        if (!hasUsableAgentProse(fullText, { streamSupplement })) {
          throw new Error(`Groq model "${model}" returned insufficient user-facing prose`);
        }

        console.log(`[agent:${name}] prose check passed, model: ${model}`);
        completed = true;
        req._toolExecutions = toolExecutions;
        break;
      } catch (modelError) {
        const failedProvider = inferProviderForModel(model);
        console.warn(`[agent:${name}] model "${model}" (${failedProvider}) error: ${modelError?.message || modelError}`);
        const nextModel = runModels[modelIndex + 1];
        if (nextModel) {
          const nextProvider = inferProviderForModel(nextModel);
          if (failedProvider !== nextProvider) {
            console.warn(
              `[agent:${name}] provider failover: ${failedProvider} -> ${nextProvider} ` +
              `(next model "${nextModel}")`
            );
          } else {
            console.warn(
              `[agent:${name}] retrying with ${nextProvider} model "${nextModel}"`
            );
          }
        }
        lastModelError = modelError;
        fullText = "";
      }
    }

    if (!completed) {
      throw lastModelError || new Error("All agent run models failed");
    }

    fullText = sanitizeAgentRunFullText(name, task_type, fullText);

    await finalizeAgentRunResponse({
      name,
      runId,
      companyId,
      fullText,
      toolExecutions: req._toolExecutions || [],
      res,
      startedAt,
      triggerContext: triggered_by
        ? { triggered_by, trigger_id, hook_id, task_type, trigger_metadata }
        : null,
    });

  } catch (err) {
    await markAgentHeartbeat(name, "error", Date.now() - startedAt, String(err), companyId);
    res.write(`data: ${JSON.stringify({ error: toUserFacingError(err) })}\n\n`);
    res.end();
  }
});

// ── Artifact persistence ────────────────────────────────────────────────────
// Artifacts are saved per-company in a JSON file (Supabase table can replace later).
// File: platform/crewai/memory/{companyId}/artifacts.json

const ARTIFACTS_VERSION = 1;

async function loadArtifacts(companyId) {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'crewai', 'memory', companyId, 'artifacts.json');
    const raw = await readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

async function saveArtifactToFile(companyId, entry) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'crewai', 'memory', companyId);
  const p = join(dir, 'artifacts.json');
  try { await mkdir(dir, { recursive: true }); } catch {}
  const existing = await loadArtifacts(companyId);
  const updated = [entry, ...existing.filter(a => a.id !== entry.id)].slice(0, 200);
  await writeFile(p, JSON.stringify(updated, null, 2), 'utf-8');
  return entry;
}

// POST /api/artifacts/:companyId — save an artifact
app.post('/api/artifacts/:companyId', async (req, res) => {
  const { companyId } = req.params;
  const { agent, run_id, type, data, handoff_notes, tags } = req.body || {};
  if (!agent || !data) return res.status(400).json({ error: 'agent and data required' });
  try {
    const entry = {
      id: run_id ?? randomUUID(),
      companyId,
      agent,
      type: type ?? 'general',
      data,
      handoff_notes: handoff_notes ?? null,
      tags: tags ?? [],
      savedAt: new Date().toISOString(),
      version: ARTIFACTS_VERSION,
    };
    await saveArtifactToFile(companyId, entry);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/artifacts/:companyId — list artifacts (most recent first)
app.get('/api/artifacts/:companyId', async (req, res) => {
  const { companyId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const type = req.query.type;
  try {
    let artifacts = await loadArtifacts(companyId);
    if (type) artifacts = artifacts.filter(a => a.type === type);
    res.json(artifacts.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/artifacts/:companyId/:artifactId
app.delete('/api/artifacts/:companyId/:artifactId', async (req, res) => {
  const { companyId, artifactId } = req.params;
  try {
    const existing = await loadArtifacts(companyId);
    const updated = existing.filter(a => a.id !== artifactId);
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'crewai', 'memory', companyId);
    await writeFile(join(dir, 'artifacts.json'), JSON.stringify(updated, null, 2), 'utf-8');
    res.json({ deleted: artifactId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Automation Registry Endpoints ─────────────────────────────────────────────

// GET /api/automations/registry — return full catalog
app.get('/api/automations/registry', (req, res) => {
  res.json({ automations: REGISTRY });
});

// GET /api/automations/runs — returns recent runs for a company
app.get('/api/automations/runs', async (req, res) => {
  const { company_id, limit = '20' } = req.query;
  const client = supabaseAdminClient || supabase;
  if (!client) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    let query = client.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(parseInt(limit, 10) || 20);
    if (company_id) query = query.eq('company_id', company_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ runs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations/execute — direct test/manual execution of any automation
app.post('/api/automations/execute', async (req, res) => {
  const { automation_id, params = {}, company_id } = req.body || {};
  if (!automation_id) return res.status(400).json({ error: 'automation_id required' });
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  try {
    const { executeAutomationTriggers } = await import('./automations/registry.js');
    const results = await executeAutomationTriggers(
      { automation_triggers: [{ automation_id, params }] },
      company_id
    );
    res.json(results[0] || { status: 'no_result' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations/video-poll — poll Veo 3.1 operation or HeyGen video_id, upload to Cloudinary when done
app.post('/api/automations/video-poll', async (req, res) => {
  const { provider, operation_name, video_id, company_id } = req.body || {};
  if (!provider) return res.status(400).json({ error: 'provider required: veo | heygen' });

  try {
    const { pollVeoOperation, pollHeyGenVideo } = await import('./automations/handlers/contentCreation.js');
    let result;
    if (provider === 'veo') {
      if (!operation_name) return res.status(400).json({ error: 'operation_name required for veo' });
      result = await pollVeoOperation(operation_name);
    } else if (provider === 'heygen') {
      if (!video_id) return res.status(400).json({ error: 'video_id required for heygen' });
      result = await pollHeyGenVideo(video_id, company_id);
    } else {
      return res.status(400).json({ error: 'provider must be veo or heygen' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/heygen/avatars', async (req, res) => {
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : '';
  if (!companyId) return res.status(400).json({ error: 'companyId is required' });

  try {
    const { getConnectedAccountApiKey } = await import('./mcp-router.js');
    const { listHeyGenAvatars } = await import('./automations/handlers/contentCreation.js');

    const connected = await getConnectedAccountApiKey('heygen', companyId);
    const apiKey = connected?.api_key || null;
    if (!apiKey) {
      return res.status(404).json({ error: connected?.error || 'HeyGen is not connected for this workspace' });
    }

    const avatars = await listHeyGenAvatars(apiKey);
    return res.json({
      avatars: avatars.map((avatar) => ({
        avatar_id: avatar?.avatar_id ?? null,
        avatar_name: avatar?.avatar_name ?? null,
        preview_image_url: avatar?.preview_image_url ?? null,
        preview_video_url: avatar?.preview_video_url ?? null,
        premium: Boolean(avatar?.premium),
      })).filter((avatar) => avatar.avatar_id),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load HeyGen avatars' });
  }
});

app.get('/api/heygen/voices', async (req, res) => {
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : '';
  if (!companyId) return res.status(400).json({ error: 'companyId is required' });

  try {
    const { getConnectedAccountApiKey } = await import('./mcp-router.js');
    const { listHeyGenVoices } = await import('./automations/handlers/contentCreation.js');

    const connected = await getConnectedAccountApiKey('heygen', companyId);
    const apiKey = connected?.api_key || null;
    if (!apiKey) {
      return res.status(404).json({ error: connected?.error || 'HeyGen is not connected for this workspace' });
    }

    const voices = await listHeyGenVoices(apiKey);
    return res.json({
      voices: voices.map((voice) => ({
        voice_id: voice?.voice_id ?? null,
        name: voice?.name ?? null,
        language: voice?.language ?? null,
        gender: voice?.gender ?? null,
      })).filter((voice) => voice.voice_id),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load HeyGen voices' });
  }
});

// POST /api/automations/run-due — called by n8n Schedule Runner every 15 min
app.post('/api/automations/run-due', async (req, res) => {
  const secret = req.headers['x-marqq-secret'] || req.body?.secret;
  if (process.env.AUTOMATIONS_RUN_SECRET && secret !== process.env.AUTOMATIONS_RUN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { runDueScheduledAutomations } = await import('./automations/registry.js');
    const results = await runDueScheduledAutomations(supabaseForServerData());
    res.json({ ran: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Social Intelligence Fetch ─────────────────────────────────────────────────

app.post('/api/social-intel/:companyId/fetch', async (req, res) => {
  const { companyId } = req.params;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  const writeClient = getSupabaseWriteClient() || supabase;
  if (!writeClient) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { socialIntelExtract } = await import('./automations/handlers/social.js');
    const params = {
      limit: req.body?.limit ?? 5,
      ...(req.body?.platforms    ? { platforms:    req.body.platforms }    : {}),
      ...(req.body?.account_type ? { account_type: req.body.account_type } : {}),
    };
    const result = await socialIntelExtract(params, companyId, writeClient);
    if (result.status === 'error') return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    console.error('[social-intel/fetch]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Ads Intelligence Analysis ─────────────────────────────────────────────────

app.post('/api/ads-intel/:companyId/analyze', async (req, res) => {
  const { companyId } = req.params;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  const writeClient = getSupabaseWriteClient() || supabase;
  if (!writeClient) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { adsIntelAnalyze } = await import('./automations/handlers/adsAnalysis.js');
    const result = await adsIntelAnalyze({}, companyId, writeClient);
    if (result.status === 'error') return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    console.error('[ads-intel/analyze]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/ads-intel/:companyId/analysis', async (req, res) => {
  const { companyId } = req.params;

  // Try Supabase first (service role: RLS + no browser session on this route)
  const artClient = getSupabaseReadClient() || supabaseForServerData();
  if (artClient) {
    const { data } = await artClient
      .from('company_artifacts')
      .select('data, updated_at')
      .eq('company_id', companyId)
      .eq('artifact_type', 'ads_intel_analysis')
      .single();
    if (data?.data) return res.json({ analysis: data.data, updated_at: data.updated_at });
  }

  // Fallback: read from file
  try {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dn = dirname(fileURLToPath(import.meta.url));
    const filePath = join(__dn, '..', 'crewai', 'memory', companyId, 'ads_analysis.json');
    const raw = await readFile(filePath, 'utf8');
    const { analysis, updated_at } = JSON.parse(raw);
    return res.json({ analysis, updated_at });
  } catch {
    return res.json({ analysis: null });
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
          const persistedCall = session.callSid
            ? await readVoicebotCallRecord(session.callSid)
            : null;
          session.language =
            (customParameters.language || persistedCall?.language) === "hi" ? "hi" : "en";
          session.gender =
            customParameters.gender === "male" ? "male" : "female";
          session.companyId = customParameters.companyId || persistedCall?.companyId || null;
          session.campaignId = customParameters.campaignId || persistedCall?.campaignId || null;
          session.leadId = customParameters.leadId || persistedCall?.leadId || null;
          session.leadName = customParameters.leadName || persistedCall?.leadName || null;
          session.leadPhone = customParameters.leadPhone || persistedCall?.leadPhone || null;
          session.leadEmail = customParameters.leadEmail || persistedCall?.leadEmail || null;
          session.openingLine =
            buildVoicebotOpeningLine(
              customParameters.openingLine ||
                persistedCall?.openingLine ||
                process.env.TWILIO_OUTBOUND_GREETING ||
                TWILIO_OUTBOUND_GREETING,
            );
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

let server = null;
let nightlyScheduler = null;
let hooksEngine = null;
let deploymentScheduler = null;
let deploymentProcessorRunning = false;
let automationScheduler = null;
let onboardBriefingScheduler = null;

function getDeploymentNextRunAt(recurrenceMinutes = DEFAULT_MONITOR_RECURRENCE_MINUTES) {
  return new Date(Date.now() + Math.max(1, Number(recurrenceMinutes) || DEFAULT_MONITOR_RECURRENCE_MINUTES) * 60_000).toISOString();
}

function buildDeploymentRunQuery(entry) {
  if (typeof entry?.runPrompt === "string" && entry.runPrompt.trim()) {
    return entry.runPrompt.trim();
  }

  const bullets = Array.isArray(entry?.bullets) ? entry.bullets.map((value) => String(value).trim()).filter(Boolean) : [];
  return [
    `Execute the scheduled deployment for ${entry?.sectionTitle || "this section"}.`,
    typeof entry?.summary === "string" && entry.summary.trim() ? `Summary: ${entry.summary.trim()}` : null,
    bullets.length ? `Bullets: ${bullets.join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function isDeploymentRunnable(entry, now = Date.now()) {
  if (!entry || !["pending", "active"].includes(String(entry.status || ""))) return false;
  if (!entry.scheduledFor || entry.scheduledFor === "next_cron_run") return true;
  const nextTs = Date.parse(String(entry.scheduledFor));
  return Number.isFinite(nextTs) && nextTs <= now;
}

async function processDeploymentQueueTick() {
  if (deploymentProcessorRunning) return;
  deploymentProcessorRunning = true;

  try {
    const queue = await readDeploymentQueue();
    const baseUrl = `http://127.0.0.1:${PORT}`;

    for (const entry of queue) {
      if (!isDeploymentRunnable(entry)) continue;

      entry.status = "running";
      entry.startedAt = new Date().toISOString();
      entry.error = null;
      await writeDeploymentQueue(queue);
      await syncCompanyActionStatusFromDeployment(entry, "running");

      try {
        const response = await fetch(`${baseUrl}/api/agents/${entry.agentName}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(entry.workspaceId ? { "x-workspace-id": entry.workspaceId } : {}),
          },
          body: JSON.stringify({
            company_id: entry.companyId || null,
            query: buildDeploymentRunQuery(entry),
            task_type: entry.scheduleMode === "monitor" ? "competitor_monitor" : "scheduled_deployment",
            deployment_id: entry.id,
            triggered_by: "scheduled_deployment",
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `Scheduled deployment failed with status ${response.status}`);
        }

        await response.text().catch(() => "");
        const latestQueue = await readDeploymentQueue();
        const latestEntry = latestQueue.find((item) => item?.id === entry.id);
        if (latestEntry && ["paused", "stopped"].includes(String(latestEntry.status || ""))) {
          continue;
        }
        entry.lastRunAt = new Date().toISOString();
        entry.runCount = Number(entry.runCount || 0) + 1;
        entry.error = null;

        if (entry.scheduleMode === "monitor" && entry.status !== "stopped") {
          entry.status = "active";
          entry.scheduledFor = getDeploymentNextRunAt(entry.recurrenceMinutes);
        } else {
          entry.status = "completed";
          entry.completedAt = new Date().toISOString();
        }

        await writeDeploymentQueue(queue);
        await syncCompanyActionStatusFromDeployment(entry, "completed");
        const notifyUserId = await resolveDeploymentNotificationUserId(entry);
        if (notifyUserId) {
          await createAgentNotification({
            user_id: notifyUserId,
            agent_name: entry.agentName,
            agent_role: AGENT_PROFILES[entry.agentName]?.title || "Workflow Agent",
            task_type: entry.scheduleMode === "monitor" ? "scheduled_monitor_run" : "scheduled_deployment_run",
            title:
              entry.scheduleMode === "monitor"
                ? `${entry.agentName} monitor update: ${entry.agentTarget || entry.sectionTitle || "Scheduled automation"}`
                : `${entry.agentName} scheduled run completed`,
            summary:
              entry.scheduleMode === "monitor"
                ? `${entry.agentName} completed a scheduled monitor run for ${entry.agentTarget || entry.sectionTitle || "the selected target"}.`
                : `${entry.agentName} completed the scheduled workflow for ${entry.sectionTitle || "the selected section"}.`,
            full_output: {
              deploymentId: entry.id,
              companyId: entry.companyId || null,
              sectionId: entry.sectionId || null,
              agentTarget: entry.agentTarget || null,
              nextRunAt: entry.scheduledFor || null,
              scheduleMode: entry.scheduleMode || null,
            },
            action_items: [
              {
                label: entry.companyId && entry.sectionId ? "Open module" : "View details",
                priority: "medium",
                url:
                  entry.companyId && entry.sectionId
                    ? `#ci=${encodeURIComponent(entry.sectionId)}&companyId=${encodeURIComponent(entry.companyId)}`
                    : undefined,
              },
            ],
            status: "success",
            read: false,
          });
        }
      } catch (error) {
        const latestQueue = await readDeploymentQueue();
        const latestEntry = latestQueue.find((item) => item?.id === entry.id);
        if (latestEntry && ["paused", "stopped"].includes(String(latestEntry.status || ""))) {
          continue;
        }
        entry.lastRunAt = new Date().toISOString();
        entry.error = String(error?.message || error || "Scheduled deployment failed");

        if (entry.scheduleMode === "monitor" && entry.status !== "stopped") {
          entry.status = "active";
          entry.scheduledFor = getDeploymentNextRunAt(entry.recurrenceMinutes);
        } else {
          entry.status = "failed";
          entry.failedAt = new Date().toISOString();
        }

        await writeDeploymentQueue(queue);
        await syncCompanyActionStatusFromDeployment(entry, "failed", { error: entry.error });
      }
    }
  } finally {
    deploymentProcessorRunning = false;
  }
}

function startDeploymentScheduler() {
  if (deploymentScheduler) return;
  deploymentScheduler = setInterval(() => {
    processDeploymentQueueTick().catch((error) => {
      console.error("[deployment-scheduler] tick failed:", error);
    });
  }, DEPLOYMENT_SCHEDULER_INTERVAL_MS);

  processDeploymentQueueTick().catch((error) => {
    console.error("[deployment-scheduler] initial tick failed:", error);
  });
}

function stopDeploymentScheduler() {
  if (!deploymentScheduler) return;
  clearInterval(deploymentScheduler);
  deploymentScheduler = null;
}

// ── Scheduled Automation Reconciler ─────────────────────────────────────────
// Polls scheduled_automations (Supabase) for rows where next_run <= now and
// executes them. This is what closes the loop for agent-declared
// scheduled_automations in contract JSON.

async function runAutomationSchedulerTick() {
  let client = null;
  try {
    const mod = await import('./automations/registry.js');
    const { supabaseAdmin, supabase: anonClient } = await import('./supabase.js');
    client = supabaseAdmin || anonClient;
    if (!client) {
      console.warn('[automation-scheduler] No Supabase client available — skipping tick');
      return;
    }
    const results = await mod.runDueScheduledAutomations(client);
    if (results.length > 0) {
      console.info(`[automation-scheduler] Ran ${results.length} due automation(s):`,
        results.map(r => `${r.automation_id}@${r.company_id} → ${r.status}`).join(', '));
    }
  } catch (err) {
    console.error('[automation-scheduler] tick failed:', err.message);
  }
}

function startAutomationScheduler() {
  if (automationScheduler) return;
  automationScheduler = setInterval(() => {
    runAutomationSchedulerTick().catch((err) => {
      console.error('[automation-scheduler] interval error:', err.message);
    });
  }, AUTOMATION_SCHEDULER_INTERVAL_MS);
  // Run immediately on start to catch any overdue rows
  runAutomationSchedulerTick().catch((err) => {
    console.error('[automation-scheduler] initial tick failed:', err.message);
  });
}

function stopAutomationScheduler() {
  if (!automationScheduler) return;
  clearInterval(automationScheduler);
  automationScheduler = null;
}

function buildHookDispatchQuery(batch, entry) {
  const lines = [
    `Execute hook task "${entry.task_type}" for company ${batch.company_id}.`,
    `Hook id: ${batch.hook_id}`,
    `Triggered by: ${batch.triggered_by || "signal"}`,
  ];

  if (batch.trigger_metadata?.signal_type) {
    lines.push(`Signal type: ${batch.trigger_metadata.signal_type}`);
  }
  if (typeof batch.trigger_metadata?.current_value === "number") {
    lines.push(`Current value: ${batch.trigger_metadata.current_value}`);
  }
  if (typeof batch.trigger_metadata?.baseline_value === "number") {
    lines.push(`Baseline value: ${batch.trigger_metadata.baseline_value}`);
  }
  if (typeof batch.trigger_metadata?.delta_pct === "number") {
    lines.push(`Delta pct: ${batch.trigger_metadata.delta_pct}`);
  }

  return lines.join("\n");
}

export function createHookDispatchRequestBody(batch, entry) {
  return {
    query: buildHookDispatchQuery(batch, entry),
    company_id: batch.company_id,
    task_type: entry.task_type,
    triggered_by: batch.triggered_by || "signal",
    trigger_id: batch.trigger_id || batch.signal_id,
    hook_id: batch.hook_id,
    trigger_metadata: batch.trigger_metadata || {},
  };
}

async function parseSseResponse(response) {
  const text = await response.text();
  const contractLine = text
    .split("\n")
    .find((line) => line.startsWith("data: {") && line.includes("\"contract\""));

  if (!contractLine) {
    return { raw: text, contract: null };
  }

  try {
    const parsed = JSON.parse(contractLine.slice(6));
    return { raw: text, contract: parsed.contract || null };
  } catch {
    return { raw: text, contract: null };
  }
}

export async function dispatchHookRun(
  batch,
  {
    fetchImpl = fetch,
    supabaseClient = supabaseForServerData(),
    baseUrl = `http://127.0.0.1:${PORT}`,
  } = {},
) {
  const results = [];

  for (const entry of batch.dispatch || []) {
    if (supabaseClient) {
      await supabaseClient.from("agent_tasks").insert({
        agent_name: entry.agent,
        task_type: entry.task_type,
        status: "scheduled",
        company_id: batch.company_id,
        description: `Hook dispatch via ${batch.hook_id}`,
        priority: "high",
      });
    }

    const requestBody = createHookDispatchRequestBody(batch, entry);
    const response = await fetchImpl(`${baseUrl}/api/agents/${entry.agent}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Hook dispatch failed for ${entry.agent}: ${response.status}`);
    }

    const parsed = await parseSseResponse(response);
    results.push({
      agent: entry.agent,
      task_type: entry.task_type,
      requestBody,
      contract: parsed.contract,
      raw: parsed.raw,
    });
  }

  return results;
}

// ── Onboard Briefing Scheduler ────────────────────────────────────────────────
// Picks up agent_tasks rows written by veena/onboard (task_type = 'onboard_briefing',
// status = 'scheduled', scheduled_for <= now) and executes each agent's briefing
// via runAgentForArtifact.  Runs every ONBOARD_BRIEFING_SCHEDULER_INTERVAL_MS.

const ONBOARD_BRIEFING_QUERIES = {
  isha: "You have just been briefed on a new company. Review the Marketing Knowledge Graph and produce a market research briefing: market size signal, key demand trends, competition intensity, and 3 growth opportunities this company should be aware of.",
  neel: "You have just been briefed on a new company. Review the Marketing Knowledge Graph and produce an initial strategy briefing: recommended positioning angle, the single most important target segment to pursue first, and the top 3 marketing priorities for the next 90 days.",
  zara: "You have just been briefed on a new company. Review the Marketing Knowledge Graph and produce an initial distribution briefing: recommended channel mix ranked by expected ROI, suggested content cadence per channel, and one specific first campaign idea with a rationale.",
};

async function runOnboardBriefingTick() {
  const client = supabaseAdminClient || supabaseForServerData();
  if (!client) return;

  let rows;
  try {
    const { data, error } = await client
      .from("agent_tasks")
      .select("id, agent_name, company_id, scheduled_for")
      .eq("task_type", "onboard_briefing")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(5);
    if (error) {
      console.warn("[onboard-briefing] query failed:", error.message);
      return;
    }
    rows = data || [];
  } catch (err) {
    console.warn("[onboard-briefing] query error:", err.message);
    return;
  }

  for (const row of rows) {
    const agentName = row.agent_name;
    const companyId = row.company_id;
    const query = ONBOARD_BRIEFING_QUERIES[agentName];
    if (!query) {
      console.warn(`[onboard-briefing] no query template for agent "${agentName}" — skipping`);
      continue;
    }

    // Mark running before starting so concurrent ticks skip it
    try {
      await client
        .from("agent_tasks")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", row.id);
    } catch (err) {
      console.warn("[onboard-briefing] failed to mark running:", err.message);
      continue;
    }

    console.log(`[onboard-briefing] running ${agentName} briefing for company ${companyId}`);
    try {
      await runAgentForArtifact(agentName, query, companyId, "onboard_briefing");
      await client
        .from("agent_tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", row.id);
      console.log(`[onboard-briefing] ${agentName} briefing complete for ${companyId}`);
    } catch (err) {
      console.error(`[onboard-briefing] ${agentName} briefing failed for ${companyId}:`, err.message);
      await client
        .from("agent_tasks")
        .update({ status: "failed", error_message: String(err.message || err) })
        .eq("id", row.id)
        .catch(() => {/* non-blocking */});
    }
  }
}

function startOnboardBriefingScheduler() {
  if (onboardBriefingScheduler) return;
  onboardBriefingScheduler = setInterval(() => {
    runOnboardBriefingTick().catch((err) => {
      console.error("[onboard-briefing] interval error:", err.message);
    });
  }, ONBOARD_BRIEFING_SCHEDULER_INTERVAL_MS);
  // Run immediately on startup to catch tasks queued before the last restart
  runOnboardBriefingTick().catch((err) => {
    console.error("[onboard-briefing] initial tick failed:", err.message);
  });
}

function stopOnboardBriefingScheduler() {
  if (!onboardBriefingScheduler) return;
  clearInterval(onboardBriefingScheduler);
  onboardBriefingScheduler = null;
}

function startBackendRuntime() {
  if (server) return { server, nightlyScheduler, hooksEngine };

  server = app.listen(PORT, () => {
    console.log(`[content-engine] Listening on port ${PORT}`);
    startWorker();
    startDeploymentScheduler();
    startAutomationScheduler();
    startOnboardBriefingScheduler();
    if (!nightlyScheduler) {
      nightlyScheduler = createNightlyScheduler({
        client: getPipelineWriteClient(),
        logger: console,
      });
    }
    nightlyScheduler.start();
    if (!hooksEngine) {
      hooksEngine = new HooksEngine({
        dispatchHookRun: (batch) => dispatchHookRun(batch),
        logger: console,
      });
      hooksEngine.start().catch((error) => {
        console.error("[hooks-engine] failed to start:", error);
      });
    }
  });
  attachTwilioMediaStreamServer(server);

  return { server, nightlyScheduler, hooksEngine };
}

async function stopBackendRuntime() {
  if (hooksEngine) {
    hooksEngine.stop();
    hooksEngine = null;
  }
  stopAutomationScheduler();
  stopDeploymentScheduler();
  if (nightlyScheduler) {
    nightlyScheduler.stop();
    nightlyScheduler = null;
  }
  if (server) {
    const activeServer = server;
    server = null;
    await new Promise((resolve, reject) => {
      activeServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

// ── GET /api/integrations ──────────────────────────────────────────────────
app.get("/api/integrations", async (req, res) => {
  const companyId = req.query.companyId || req.query.userId || 'default';
  try {
    const connectors = await getConnectors(companyId);
    res.json({ connectors });
  } catch (err) {
    console.error('[integrations] getConnectors error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/integrations/connect & /disconnect ──────────────────────────
app.post("/api/integrations/connect", async (req, res) => {
  const { companyId, connectorId, extraFields } = req.body;
  if (!companyId || !connectorId) return res.status(400).json({ error: 'companyId and connectorId required' });
  const result = await initiateConnection(companyId, connectorId, extraFields || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});
app.post("/api/integrations/disconnect", async (req, res) => {
  const { companyId, connectorId } = req.body;
  if (!companyId || !connectorId) return res.status(400).json({ error: 'companyId and connectorId required' });
  const result = await disconnectConnector(companyId, connectorId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
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
        ...(isGroqProvider && model === "groq/compound"
          ? {
              max_completion_tokens: 900,
            }
          : {
              response_format: { type: "json_object" },
            }),
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "";
      const candidate = isGroqProvider && model === "groq/compound" ? extractJsonObject(raw) || raw : raw;
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
          ...(isGroqProvider && model === "groq/compound"
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

  if (COMPANY_PROFILE_PRIMARY_PROVIDER === "gemini") {
    const systemPrompt = `You are a company research analyst. Given a website URL and homepage signals, generate a structured JSON company profile.
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
}`;

    try {
      return await generateJsonWithGemini({
        model: COMPANY_PROFILE_GEMINI_MODEL,
        systemPrompt,
        userContent,
        temperature: 0.35,
        maxOutputTokens: 1400,
        label: "company_profile",
      });
    } catch (error) {
      lastError = error;
      console.warn(
        `[Gemini] Primary company profile generation failed, falling back to Groq: ${error.message}`,
      );
    }
  }

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
        ...(isGroqProvider && model === "groq/compound"
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
          ...(isGroqProvider && model === "groq/compound"
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

app.get("/api/company-intel/companies", async (req, res) => {
  const workspaceId = req.headers["x-workspace-id"] || null;
  const dbCompanies = await loadCompanies(workspaceId);
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
  const workspaceId = req.headers["x-workspace-id"] || null;
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
          ) || (await loadCompanyByWebsiteUrl(normalizedWebsiteUrl, workspaceId));
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
    await saveCompany(company, workspaceId);
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
    const writeClient = getSupabaseWriteClient() || supabase;
    if (writeClient) {
      await writeClient
        .from("generation_jobs")
        .delete()
        .eq("company_id", companyId);
      await writeClient
        .from("company_artifacts")
        .delete()
        .eq("company_id", companyId);
      await writeClient.from("companies").delete().eq("id", companyId);
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
    if (!hasNonEmptyProfile(entry.company.profile) && entry.company.websiteUrl) {
      await refreshCompanyProfile(entry, entry.company.companyName);
    }

    const now = new Date().toISOString();
    const companyId = req.params.id;

    // ── Step 1: Try agent-based generation (SOUL + skills + MKG patch) ──────────
    const agentMapping = ARTIFACT_AGENT_MAP[type];
    if (agentMapping) {
      const enrichedInputs = {
        ...(inputs || {}),
        websiteUrl: entry.company.websiteUrl,
        companyProfile: entry.company.profile,
      };
      const query = buildAgentQueryForArtifact(type, entry.company.companyName, enrichedInputs);
      console.log(`[generate] Routing ${type} to agent "${agentMapping.agent}" for company ${companyId}`);
      try {
        const contract = await runAgentForArtifact(
          agentMapping.agent,
          query,
          companyId,
          agentMapping.taskType,
        );
        const artifactData = contract.artifact?.data || {};
        entry.artifacts[type] = { type, updatedAt: now, data: artifactData };
        entry.company.updatedAt = now;
        await saveArtifact(companyId, entry.artifacts[type]);
        await saveCompany(entry.company);
        console.log(`[generate] ${type} generated via agent "${agentMapping.agent}" — confidence ${contract.artifact?.confidence ?? "?"}`);
        return res.json({ artifact: entry.artifacts[type] });
      } catch (agentErr) {
        console.warn(`[generate] Agent "${agentMapping.agent}" failed for ${type}, falling back to direct Groq: ${agentErr.message}`);
      }
    }

    // ── Step 2: Fallback — direct Groq (original behaviour) ─────────────────────
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
          companyId,
          websiteUrl: entry.company.websiteUrl,
          companyProfile: entry.company.profile,
          existingArtifacts: entry.artifacts || {},
        },
      );
      entry.artifacts[type] = { type, updatedAt: now, data: normalizeArtifact(type, directGroqData) };
      await saveCompanyIntelArtifactTrace(companyId, type, "final-artifact.json", entry.artifacts[type].data);
      directGroqError = null;
    } catch (err) {
      directGroqError = err instanceof Error ? err : new Error(String(err));
    }

    // ── Step 3: Fallback — CrewAI ────────────────────────────────────────────────
    if (directGroqError) {
      const CREWAI_URL = process.env.CREWAI_URL || "http://localhost:8002";
      console.warn(`Direct Groq failed, falling back to CrewAI: ${directGroqError.message}`);
      const resp = await fetch(`${CREWAI_URL}/api/crewai/company-intel/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: entry.company.companyName,
          company_url: entry.company.websiteUrl,
          artifact_type: type,
          inputs,
          company_profile: entry.company.profile,
        }),
      });
      if (!resp.ok) throw new Error(`CrewAI responded with ${resp.status}`);
      const crewData = await resp.json();
      if (crewData.status === "failed") throw new Error(crewData.error || "CrewAI generation failed");
      entry.artifacts[type] = { type, updatedAt: crewData.generated_at || now, data: crewData.data };
    }

    entry.company.updatedAt = now;
    await saveArtifact(companyId, entry.artifacts[type]);
    await saveCompany(entry.company);
    res.json({ artifact: entry.artifacts[type] });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: String(err) });
  }
});

async function generateCompanyIntelArtifact(entry, type, inputs) {
  if (!hasNonEmptyProfile(entry.company.profile) && entry.company.websiteUrl) {
    await refreshCompanyProfile(entry, entry.company.companyName);
  }

  const now = new Date().toISOString();
  const companyId = entry.company.id;

  const agentMapping = ARTIFACT_AGENT_MAP[type];
  if (agentMapping) {
    const enrichedInputs = {
      ...(inputs || {}),
      websiteUrl: entry.company.websiteUrl,
      companyProfile: entry.company.profile,
    };
    const query = buildAgentQueryForArtifact(type, entry.company.companyName, enrichedInputs);
    try {
      const contract = await runAgentForArtifact(
        agentMapping.agent,
        query,
        companyId,
        agentMapping.taskType,
      );
      const artifactData = contract.artifact?.data || {};
      entry.artifacts[type] = { type, updatedAt: now, data: artifactData };
      entry.company.updatedAt = now;
      await saveArtifact(companyId, entry.artifacts[type]);
      await saveCompany(entry.company);
      return entry.artifacts[type];
    } catch (agentErr) {
      console.warn(`[generate] Agent "${agentMapping.agent}" failed for ${type}, falling back to direct generation: ${agentErr.message}`);
    }
  }

  let directError = null;
  try {
    const directData = await generateArtifactWithGroq(type, entry.company.companyName, {
      ...(inputs || {}),
      websiteUrl: entry.company.websiteUrl,
      companyProfile: entry.company.profile,
    }, {
      companyId,
    });
    entry.artifacts[type] = { type, updatedAt: now, data: normalizeArtifact(type, directData) };
    await saveCompanyIntelArtifactTrace(companyId, type, "final-artifact.json", entry.artifacts[type].data);
  } catch (err) {
    directError = err instanceof Error ? err : new Error(String(err));
  }

  if (directError) {
    const CREWAI_URL = process.env.CREWAI_URL || "http://localhost:8002";
    console.warn(`Direct generation failed, falling back to CrewAI for ${type}: ${directError.message}`);
    const resp = await fetch(`${CREWAI_URL}/api/crewai/company-intel/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: entry.company.companyName,
        company_url: entry.company.websiteUrl,
        artifact_type: type,
        inputs,
        company_profile: entry.company.profile,
      }),
    });
    if (!resp.ok) throw new Error(`CrewAI responded with ${resp.status}`);
    const crewData = await resp.json();
    if (crewData.status === "failed") throw new Error(crewData.error || "CrewAI generation failed");
    entry.artifacts[type] = { type, updatedAt: crewData.generated_at || now, data: crewData.data };
  }

  entry.company.updatedAt = now;
  await saveArtifact(companyId, entry.artifacts[type]);
  await saveCompany(entry.company);
  return entry.artifacts[type];
}

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
  entry.generateAllRunning = true;

  // Keep the in-memory _companies map up to date as each artifact finishes or fails.
  registerArtifactCallback(companyId, (_cid, type, artifact) => {
    const e = _companies.get(companyId);
    if (e) e.artifacts[type] = artifact;
  });
  registerArtifactFailCallback(companyId, (_cid, type) => {
    const e = _companies.get(companyId);
    if (e) e.failedArtifacts.add(type);
  });

  // Run sequentially per company so Gemini requests do not all start at once.
  (async () => {
    for (const type of COMPANY_INTEL_ARTIFACT_TYPES) {
      entry.failedArtifacts.delete(type); // Clear prior failure so it can retry
      try {
        await generateCompanyIntelArtifact(entry, type, inputs);
      } catch (err) {
        console.warn(`[Generate-all] failed to generate ${type}`, err.message);
        entry.failedArtifacts.add(type);
      }
    }
    entry.generateAllRunning = false;
  })();

  res.status(202).json({ status: "started", total, companyId });
});

app.get(
  "/api/company-intel/companies/:id/generate-all/status",
  async (req, res) => {
    const entry = await ensureCompanyEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: "Company not found" });
    const intelRead = getSupabaseReadClient() || supabaseForServerData();
    if (!intelRead) {
      const completed = Object.keys(entry.artifacts).length;
      const failed = entry.failedArtifacts ? entry.failedArtifacts.size : 0;
      const total = COMPANY_INTEL_ARTIFACT_TYPES.length;
      const done = !entry.generateAllRunning && completed + failed >= total;
      return res.json({
        status: done ? "completed" : "running",
        completed,
        failed,
        total,
      });
    }

    try {
      const [{ data, error }, { data: artifactRows, error: artifactError }] =
        await Promise.all([
          intelRead
            .from("generation_jobs")
            .select("artifact_type,status")
            .eq("company_id", req.params.id),
          intelRead
            .from("company_artifacts")
            .select("artifact_type")
            .eq("company_id", req.params.id),
        ]);

      if (error) throw error;
      if (artifactError) throw artifactError;

      const completedFromJobs = (data || []).filter(
        (row) => row.status === "completed",
      ).length;
      const failedFromJobs = (data || []).filter(
        (row) => row.status === "failed",
      ).length;
      const processing = (data || []).filter(
        (row) => row.status === "processing" || row.status === "pending",
      ).length;
      const completedFromArtifacts = new Set(
        (artifactRows || []).map((row) => row.artifact_type).filter(Boolean),
      ).size;
      const total = COMPANY_INTEL_ARTIFACT_TYPES.length;
      const completed = Math.max(completedFromJobs, completedFromArtifacts);
      const failed =
        completed >= total
          ? 0
          : Math.min(failedFromJobs, Math.max(0, total - completed));
      const done =
        !entry.generateAllRunning &&
        (completed >= total || (processing === 0 && completed + failed >= total));
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
      const done = !entry.generateAllRunning && completed + failed >= total;
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
      model: LLM_MODEL,
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

// ── Campaign Analytics (Dev + Arjun agents) ──────────────────────────────
// multer storage — memory so we can parse CSV/XLSX in-process
const analyticsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xls|xlsx)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV / XLS / XLSX files allowed"), ok);
  },
});

const ANALYTICS_SCRIPTS_DIR = join(__dirname, "analytics");

// Composio data-source connectors available for analytics
const ANALYTICS_COMPOSIO_CONNECTORS = [
  { id: "google_ads",    name: "Google Ads",    description: "Campaign spend, clicks, conversions, ROAS",      status: "available" },
  { id: "meta_ads",      name: "Meta Ads",       description: "Facebook/Instagram campaign performance",         status: "available" },
  { id: "ga4",           name: "Google Analytics 4", description: "Funnel events, sessions, goal completions", status: "available" },
  { id: "hubspot",       name: "HubSpot",        description: "CRM contacts, deals, pipeline stages",           status: "available" },
  { id: "salesforce",    name: "Salesforce",     description: "Leads, opportunities, funnel stages",            status: "available" },
  { id: "linkedin_ads",  name: "LinkedIn Ads",   description: "B2B campaign impressions, leads, CPL",           status: "available" },
  { id: "manual_csv",    name: "Upload CSV/XLS", description: "Upload any spreadsheet export",                  status: "always_available" },
];

function buildAnalyticsDashboard(period = "30d") {
  const periodDays =
    period === "7d" ? 7 :
    period === "90d" ? 90 :
    30;

  const today = new Date();
  const trafficChart = Array.from({ length: periodDays }, (_, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (periodDays - 1 - idx));
    const base = 1200 + Math.sin(idx * 0.42) * 260;
    const value = Math.round(base + ((idx % 5) * 37));
    const prev = Math.round(base * 0.86 + ((idx % 4) * 29));
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value,
      prev,
    };
  });

  const conversionChart = trafficChart.map((point, idx) => ({
    date: point.date,
    value: Math.round(point.value * 0.032 + (idx % 3)),
    prev: Math.round((point.prev || 0) * 0.028 + (idx % 2)),
  }));

  const periodLabel =
    period === "7d" ? "Last 7 days" :
    period === "90d" ? "Last 90 days" :
    "Last 30 days";

  return {
    lastUpdated: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    period: periodLabel,
    connected: false,
    kpis: [
      { label: "Sessions", value: "38,214", delta: "+12.4%", trend: "up", sub: "vs prev period" },
      { label: "Organic Clicks", value: "14,892", delta: "+8.7%", trend: "up", sub: "Google Search Console" },
      { label: "Impressions", value: "312,740", delta: "+21.3%", trend: "up", sub: "GSC total" },
      { label: "Avg. Position", value: "11.2", delta: "-1.4", trend: "up", sub: "lower is better" },
      { label: "Bounce Rate", value: "54.1%", delta: "-3.2pp", trend: "up", sub: "engagement rate" },
      { label: "Goal Completions", value: "1,243", delta: "+18.9%", trend: "up", sub: "all goals" },
    ],
    trafficChart,
    conversionChart,
    topPages: [
      { path: "/blog/ai-marketing-guide", sessions: 4820, delta: 22 },
      { path: "/pricing", sessions: 3210, delta: 8 },
      { path: "/features/lead-scoring", sessions: 2980, delta: 15 },
      { path: "/blog/seo-automation", sessions: 2540, delta: -4 },
      { path: "/integrations", sessions: 1890, delta: 31 },
    ],
    topQueries: [
      { query: "ai marketing automation", clicks: 1240, impressions: 18400, position: 3.2 },
      { query: "b2b lead scoring software", clicks: 890, impressions: 12100, position: 5.7 },
      { query: "marketing intelligence platform", clicks: 760, impressions: 9800, position: 4.1 },
      { query: "content automation tool", clicks: 640, impressions: 8200, position: 6.8 },
      { query: "seo content generator", clicks: 590, impressions: 7600, position: 7.4 },
    ],
    channels: [
      { channel: "Organic Search", sessions: 18420, pct: 48, delta: 14 },
      { channel: "Direct", sessions: 9810, pct: 26, delta: 5 },
      { channel: "Referral", sessions: 5430, pct: 14, delta: -2 },
      { channel: "Social", sessions: 3020, pct: 8, delta: 22 },
      { channel: "Email", sessions: 1534, pct: 4, delta: 9 },
    ],
  };
}

app.get("/api/analytics/connectors", (_req, res) => {
  res.json({ connectors: ANALYTICS_COMPOSIO_CONNECTORS });
});

// GET /api/analytics/ga4/properties?companyId=X
// Lists GA4 properties for a connected account so the user can pick one.
app.get("/api/analytics/ga4/properties", async (req, res) => {
  const companyId = String(req.query.companyId || "").trim();
  const apiKey    = process.env.COMPOSIO_API_KEY || null;
  if (!companyId || !apiKey)
    return res.status(400).json({ error: "companyId and COMPOSIO_API_KEY required" });

  try {
    const accountId = await resolveAnalyticsAccountId(companyId, "google_analytics", apiKey);

    // List all GA4 accounts then list properties for each
    const accountsRes = await runComposioAction(accountId, "GOOGLE_ANALYTICS_LIST_ACCOUNTS", {}, apiKey);
    const accounts = accountsRes?.accounts || accountsRes?.data?.accounts || [];

    const properties = [];
    for (const acct of accounts.slice(0, 10)) {
      const acctId = acct.name || acct.id; // e.g. "accounts/123"
      try {
        const propsRes = await runComposioAction(accountId, "GOOGLE_ANALYTICS_LIST_PROPERTIES_FILTERED", {
          filter: `parent:${acctId}`,
        }, apiKey);
        const props = propsRes?.properties || propsRes?.data?.properties || [];
        for (const p of props) {
          properties.push({
            id:          p.name || p.id,           // e.g. "properties/456"
            displayName: p.displayName || p.name,
            account:     acct.displayName || acct.name,
            timeZone:    p.timeZone || "",
            currency:    p.currencyCode || "",
          });
        }
      } catch { /* skip failing account */ }
    }

    res.json({ properties });
  } catch (err) {
    console.error("[ga4/properties]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/gsc/sites?companyId=X
app.get("/api/analytics/gsc/sites", async (req, res) => {
  const companyId = String(req.query.companyId || "").trim();
  const apiKey    = process.env.COMPOSIO_API_KEY || null;
  if (!companyId || !apiKey) return res.status(400).json({ error: "companyId and COMPOSIO_API_KEY required" });

  try {
    const accountId = await resolveAnalyticsAccountId(companyId, "google_search_console", apiKey);
    const result = await runComposioAction(accountId, "GOOGLESEARCHCONSOLE_LIST_SITES", {}, apiKey);
    const rawSites = result?.siteEntry || result?.data?.siteEntry || result?.sites || [];
    const sites = rawSites.map(s => ({
      siteUrl: s.siteUrl || s.site_url || s,
      permissionLevel: s.permissionLevel || s.permission_level || "unknown",
    })).filter(s => s.siteUrl);
    res.json({ sites });
  } catch (err) {
    console.error("[gsc/sites]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/google-ads/accounts?companyId=X
app.get("/api/analytics/google-ads/accounts", async (req, res) => {
  const companyId = String(req.query.companyId || "").trim();
  const apiKey    = process.env.COMPOSIO_API_KEY || null;
  if (!companyId || !apiKey) return res.status(400).json({ error: "companyId and COMPOSIO_API_KEY required" });

  try {
    const accountId = await resolveAnalyticsAccountId(companyId, "google_ads", apiKey);
    const result = await runComposioAction(accountId, "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS", {}, apiKey);
    const ids = result?.resource_names || result?.data?.resource_names || result?.customer_resource_names || [];
    const accounts = ids.map(r => {
      const id = typeof r === "string" ? r.replace("customers/", "") : String(r);
      return { id, displayName: `Account ${id}` };
    });
    res.json({ accounts });
  } catch (err) {
    console.error("[google-ads/accounts]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/meta-ads/accounts?companyId=X
app.get("/api/analytics/meta-ads/accounts", async (req, res) => {
  const companyId = String(req.query.companyId || "").trim();
  const apiKey    = process.env.COMPOSIO_API_KEY || null;
  if (!companyId || !apiKey) return res.status(400).json({ error: "companyId and COMPOSIO_API_KEY required" });

  try {
    const accountId = await resolveAnalyticsAccountId(companyId, "meta_ads", apiKey);
    const result = await runComposioAction(accountId, "FACEBOOKADS_GET_AD_ACCOUNTS", {}, apiKey);
    const raw = result?.data || result?.accounts || result?.ad_accounts || [];
    const accounts = raw.map(a => ({
      id: a.id || a.account_id || String(a),
      displayName: a.name || a.account_name || `Ad Account ${a.id || a}`,
      currency: a.currency || null,
    })).filter(a => a.id);
    res.json({ accounts });
  } catch (err) {
    console.error("[meta-ads/accounts]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Real-data helpers for analytics dashboard ─────────────────────────────────

const COMPOSIO_V3_BASE = "https://backend.composio.dev/api/v3";

/** Resolve a Composio connected_account_id for (entityId, toolkitSlug). */
async function resolveAnalyticsAccountId(entityId, toolkitSlug, apiKey) {
  const res = await fetch(
    `${COMPOSIO_V3_BASE}/connected_accounts?user_id=${encodeURIComponent(entityId)}&toolkit_slug=${encodeURIComponent(toolkitSlug)}&limit=10`,
    { headers: { "x-api-key": apiKey } }
  );
  if (!res.ok) throw new Error(`account lookup ${toolkitSlug}: HTTP ${res.status}`);
  const data = await res.json();
  const account = (data.items || []).find(
    item => item.status === "ACTIVE" &&
      (item.user_id === entityId || item.clientUniqueUserId === entityId || item.metadata?.userId === entityId)
  );
  if (!account?.id) throw new Error(`No active ${toolkitSlug} for ${entityId}`);
  return account.id;
}

/** Execute a Composio action by slug, returning raw data or null. */
async function runComposioAction(connectedAccountId, actionSlug, args, apiKey) {
  const res = await fetch(`${COMPOSIO_V3_BASE}/tools/execute/${actionSlug}`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ connected_account_id: connectedAccountId, arguments: args }),
  });
  if (!res.ok) throw new Error(`${actionSlug} HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

function periodToDates(period) {
  const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - periodDays);
  const fmt = d => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end), periodDays };
}

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function calcDelta(curr, prev) {
  if (!prev) return { delta: "—", trend: "flat" };
  const pct = ((curr - prev) / prev) * 100;
  return {
    delta: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    trend: pct > 1 ? "up" : pct < -1 ? "down" : "flat",
  };
}

/** Fetch real GA4 KPIs + traffic chart + top pages + channels. Returns null on any failure. */
async function fetchGA4Data(entityId, apiKey, period, ga4PropertyId = null) {
  try {
    const accountId = await resolveAnalyticsAccountId(entityId, "google_analytics", apiKey);
    const { startDate, endDate, periodDays } = periodToDates(period);

    // Helper to add property filter when a property is selected
    const withProperty = (args) => ga4PropertyId
      ? { ...args, property: ga4PropertyId }
      : args;

    // Prev period for delta calc
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - periodDays);
    const fmt = d => d.toISOString().slice(0, 10);

    // 1. Summary KPIs (sessions, bounceRate, conversions, newUsers)
    const summary = await runComposioAction(accountId, "GOOGLE_ANALYTICS_RUN_REPORT", withProperty({
      date_ranges: [
        { start_date: startDate, end_date: endDate },
        { start_date: fmt(prevStart), end_date: fmt(prevEnd) },
      ],
      metrics: [
        { name: "sessions" },
        { name: "bounceRate" },
        { name: "conversions" },
        { name: "newUsers" },
      ],
    }), apiKey);

    // 2. Daily traffic chart
    const daily = await runComposioAction(accountId, "GOOGLE_ANALYTICS_RUN_REPORT", withProperty({
      date_ranges: [{ start_date: startDate, end_date: endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    }), apiKey).catch(() => null);

    // 3. Top pages
    const pages = await runComposioAction(accountId, "GOOGLE_ANALYTICS_RUN_REPORT", withProperty({
      date_ranges: [{ start_date: startDate, end_date: endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
      limit: 10,
    }), apiKey).catch(() => null);

    // 4. Channels
    const channels = await runComposioAction(accountId, "GOOGLE_ANALYTICS_RUN_REPORT", withProperty({
      date_ranges: [{ start_date: startDate, end_date: endDate }],
      dimensions: [{ name: "sessionDefaultChannelGrouping" }],
      metrics: [{ name: "sessions" }],
      limit: 10,
    }), apiKey).catch(() => null);

    // Parse summary rows
    const rows = summary?.rows || summary?.dimensionHeaders ? (summary?.rows || []) : [];
    const getMetric = (row, idx) => parseFloat(row?.metricValues?.[idx]?.value ?? row?.metrics?.[0]?.values?.[idx] ?? "0") || 0;

    // GA4 returns 2 date-range rows when 2 date_ranges given
    let currRow = rows[0];
    let prevRow = rows[1];
    // Fallback: sometimes it's in dateRangeValues
    if (!currRow && summary?.totals) {
      currRow = { metricValues: summary.totals[0]?.metricValues };
      prevRow = { metricValues: summary.totals[1]?.metricValues };
    }

    const sessions      = getMetric(currRow, 0);
    const prevSessions  = getMetric(prevRow, 0);
    const bounceRate    = getMetric(currRow, 1);
    const conversions   = getMetric(currRow, 2);
    const prevConv      = getMetric(prevRow, 2);
    const deltaS  = calcDelta(sessions, prevSessions);
    const deltaBR = calcDelta(bounceRate, getMetric(prevRow, 1));
    const deltaC  = calcDelta(conversions, prevConv);

    // Traffic chart
    const trafficChart = [];
    const dailyRows = daily?.rows || [];
    for (const r of dailyRows) {
      const dateStr = r.dimensionValues?.[0]?.value || r.dimensions?.[0] || "";
      const val = parseFloat(r.metricValues?.[0]?.value ?? r.metrics?.[0]?.values?.[0] ?? "0") || 0;
      const d = dateStr.length === 8
        ? new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`)
        : new Date(dateStr);
      trafficChart.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: Math.round(val),
      });
    }

    // Top pages
    const topPages = (pages?.rows || []).slice(0, 10).map(r => ({
      path: r.dimensionValues?.[0]?.value || r.dimensions?.[0] || "/",
      sessions: Math.round(parseFloat(r.metricValues?.[0]?.value ?? "0") || 0),
      delta: 0,
    }));

    // Channels
    const channelRows = (channels?.rows || []).map(r => ({
      channel: r.dimensionValues?.[0]?.value || r.dimensions?.[0] || "Other",
      sessions: Math.round(parseFloat(r.metricValues?.[0]?.value ?? "0") || 0),
      delta: 0,
    }));
    const totalSessions = channelRows.reduce((s, r) => s + r.sessions, 0) || 1;
    const channelData = channelRows.map(r => ({
      ...r,
      pct: Math.round((r.sessions / totalSessions) * 100),
    }));

    return {
      kpis: [
        { label: "Sessions",        value: fmtNum(sessions),                 ...deltaS,  sub: "Google Analytics 4" },
        { label: "Bounce Rate",     value: `${bounceRate.toFixed(1)}%`,       ...deltaBR, sub: "Google Analytics 4" },
        { label: "Goal Completions",value: fmtNum(conversions),               ...deltaC,  sub: "Google Analytics 4" },
      ],
      trafficChart: trafficChart.length ? trafficChart : null,
      topPages: topPages.length ? topPages : null,
      channels: channelData.length ? channelData : null,
    };
  } catch (err) {
    console.error("[analytics/ga4] fetch failed:", err.message);
    return null;
  }
}

/** Fetch real GSC KPIs + top queries. Returns null on failure. */
async function fetchGSCData(entityId, apiKey, period, gscSiteUrl = null) {
  try {
    const accountId = await resolveAnalyticsAccountId(entityId, "google_search_console", apiKey);
    const { startDate, endDate } = periodToDates(period);

    // GSC search analytics — top queries
    const queryData = await runComposioAction(accountId, "GOOGLESEARCHCONSOLE_SEARCH_ANALYTICS_QUERY", {
      start_date: startDate,
      end_date: endDate,
      dimensions: ["query"],
      row_limit: 10,
      ...(gscSiteUrl ? { siteUrl: gscSiteUrl } : {}),
    }, apiKey);

    // GSC totals (no dimension)
    const totals = await runComposioAction(accountId, "GOOGLESEARCHCONSOLE_SEARCH_ANALYTICS_QUERY", {
      start_date: startDate,
      end_date: endDate,
      row_limit: 1,
      ...(gscSiteUrl ? { siteUrl: gscSiteUrl } : {}),
    }, apiKey).catch(() => null);

    const rows = queryData?.rows || [];
    const totalRow = totals?.rows?.[0] || null;

    const totalClicks      = Math.round(rows.reduce((s, r) => s + (r.clicks || 0), 0));
    const totalImpressions = Math.round(rows.reduce((s, r) => s + (r.impressions || 0), 0));
    const avgPosition      = rows.length
      ? rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length
      : (totalRow?.position || 0);

    const topQueries = rows.slice(0, 10).map(r => ({
      query: r.keys?.[0] || r.query || "—",
      clicks: Math.round(r.clicks || 0),
      impressions: Math.round(r.impressions || 0),
      position: parseFloat((r.position || 0).toFixed(1)),
    }));

    return {
      kpis: [
        { label: "Organic Clicks", value: fmtNum(totalClicks),        delta: "—", trend: "flat", sub: "Search Console" },
        { label: "Impressions",    value: fmtNum(totalImpressions),   delta: "—", trend: "flat", sub: "Search Console" },
        { label: "Avg. Position",  value: avgPosition.toFixed(1),     delta: "—", trend: "flat", sub: "lower is better" },
      ],
      topQueries: topQueries.length ? topQueries : null,
    };
  } catch (err) {
    console.error("[analytics/gsc] fetch failed:", err.message);
    return null;
  }
}

/** Fetch Google Ads KPIs. Returns null on failure. */
async function fetchGoogleAdsData(entityId, apiKey, period, customerId = null) {
  try {
    const accountId = await resolveAnalyticsAccountId(entityId, "google_ads", apiKey);
    const { startDate, endDate } = periodToDates(period);

    // Google Ads campaign performance report
    const report = await runComposioAction(accountId, "GOOGLEADS_QUERY", {
      customer_id: customerId,
      query: `SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.cost_micros DESC LIMIT 10`,
    }, apiKey);

    const rows = report?.results || report?.data?.results || [];

    const totalSpendMicros = rows.reduce((s, r) => s + (r.metrics?.cost_micros || 0), 0);
    const totalClicks      = rows.reduce((s, r) => s + (r.metrics?.clicks || 0), 0);
    const totalImpressions = rows.reduce((s, r) => s + (r.metrics?.impressions || 0), 0);
    const totalConversions = rows.reduce((s, r) => s + (r.metrics?.conversions || 0), 0);
    const totalSpend       = totalSpendMicros / 1_000_000;

    const cpc  = totalClicks ? totalSpend / totalClicks : 0;
    const ctr  = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;

    const topCampaigns = rows.slice(0, 5).map(r => ({
      name: r.campaign?.name || "—",
      spend: `$${(( r.metrics?.cost_micros || 0) / 1_000_000).toFixed(2)}`,
      clicks: Math.round(r.metrics?.clicks || 0),
    }));

    return {
      kpis: [
        { label: "Ad Spend",     value: `$${fmtNum(Math.round(totalSpend))}`, delta: "—", trend: "flat", sub: "Google Ads" },
        { label: "Ad Clicks",    value: fmtNum(totalClicks),                   delta: "—", trend: "flat", sub: "Google Ads" },
        { label: "Conversions",  value: fmtNum(Math.round(totalConversions)),  delta: "—", trend: "flat", sub: "Google Ads" },
        { label: "CTR",          value: `${ctr.toFixed(2)}%`,                  delta: "—", trend: "flat", sub: "Google Ads" },
      ],
      topCampaigns: topCampaigns.length ? topCampaigns : null,
    };
  } catch (err) {
    console.error("[analytics/google-ads] fetch failed:", err.message);
    return null;
  }
}

/** Fetch Meta Ads KPIs. Returns null on failure. */
async function fetchMetaAdsData(entityId, apiKey, period, adAccountId = null) {
  try {
    const accountId = await resolveAnalyticsAccountId(entityId, "meta_ads", apiKey);
    const { startDate, endDate } = periodToDates(period);

    const target = adAccountId || "me";

    const insights = await runComposioAction(accountId, "FACEBOOKADS_GET_AD_ACCOUNT_INSIGHTS", {
      account_id: target,
      date_preset: "last_30d",
      time_range: { since: startDate, until: endDate },
      fields: "spend,clicks,impressions,reach,cpc,ctr,actions",
    }, apiKey);

    const data = insights?.data?.[0] || insights;

    const spend       = parseFloat(data?.spend || 0);
    const clicks      = parseInt(data?.clicks || 0, 10);
    const impressions = parseInt(data?.impressions || 0, 10);
    const reach       = parseInt(data?.reach || 0, 10);
    const cpc         = parseFloat(data?.cpc || 0);
    const ctr         = parseFloat(data?.ctr || 0);

    return {
      kpis: [
        { label: "Meta Ad Spend",  value: `$${fmtNum(Math.round(spend))}`, delta: "—", trend: "flat", sub: "Meta Ads" },
        { label: "Meta Clicks",    value: fmtNum(clicks),                   delta: "—", trend: "flat", sub: "Meta Ads" },
        { label: "Reach",          value: fmtNum(reach),                    delta: "—", trend: "flat", sub: "Meta Ads" },
        { label: "Meta CTR",       value: `${ctr.toFixed(2)}%`,             delta: "—", trend: "flat", sub: "Meta Ads" },
      ],
    };
  } catch (err) {
    console.error("[analytics/meta-ads] fetch failed:", err.message);
    return null;
  }
}

app.get("/api/analytics/dashboard", async (req, res) => {
  const period            = String(req.query.period || "30d");
  const companyId         = req.query.companyId || req.query.workspaceId || null;
  const ga4PropertyId     = req.query.ga4PropertyId     ? String(req.query.ga4PropertyId)     : null;
  const gscSiteUrl        = req.query.gscSiteUrl        ? String(req.query.gscSiteUrl)        : null;
  const googleAdsCustomer = req.query.googleAdsCustomer ? String(req.query.googleAdsCustomer) : null;
  const metaAdsAccount    = req.query.metaAdsAccount    ? String(req.query.metaAdsAccount)    : null;
  const apiKey            = process.env.COMPOSIO_API_KEY || null;

  // 1. Check which analytics connectors are connected
  const ANALYTICS_IDS = ["ga4", "gsc", "google_ads", "meta_ads", "linkedin_ads"];
  const SOURCE_NAMES  = { ga4: "Google Analytics 4", gsc: "Google Search Console", google_ads: "Google Ads", meta_ads: "Meta Ads", linkedin_ads: "LinkedIn Ads" };
  let connectedSources = [];

  if (companyId) {
    try {
      const all = await getConnectors(companyId);
      connectedSources = all
        .filter(c => ANALYTICS_IDS.includes(c.id) && c.connected)
        .map(c => ({ id: c.id, name: SOURCE_NAMES[c.id] || c.id, connectedAt: c.connectedAt }));
    } catch (err) {
      console.error("[analytics/dashboard] connector check:", err.message);
    }
  }

  // 2. No connections → return mock data
  if (!connectedSources.length || !apiKey || !companyId) {
    const mock = buildAnalyticsDashboard(period);
    mock.connected = false;
    mock.connectedSources = [];
    return res.json(mock);
  }

  // 3. Fetch real data from each connected source in parallel
  const hasGA4 = connectedSources.some(s => s.id === "ga4");
  const hasGSC = connectedSources.some(s => s.id === "gsc");
  const hasGoogleAds = connectedSources.some(s => s.id === "google_ads");
  const hasMetaAds   = connectedSources.some(s => s.id === "meta_ads");

  const [ga4Data, gscData, googleAdsData, metaAdsData] = await Promise.all([
    hasGA4        ? fetchGA4Data(companyId, apiKey, period, ga4PropertyId)                : Promise.resolve(null),
    hasGSC        ? fetchGSCData(companyId, apiKey, period, gscSiteUrl)                  : Promise.resolve(null),
    hasGoogleAds  ? fetchGoogleAdsData(companyId, apiKey, period, googleAdsCustomer)     : Promise.resolve(null),
    hasMetaAds    ? fetchMetaAdsData(companyId, apiKey, period, metaAdsAccount)          : Promise.resolve(null),
  ]);

  // 4. If all real fetches failed, return mock with connected=true so banner still shows
  if (!ga4Data && !gscData && !googleAdsData && !metaAdsData) {
    const fallback = buildAnalyticsDashboard(period);
    fallback.connected = true;
    fallback.connectedSources = connectedSources;
    fallback.dataNote = "Using demo data — live data temporarily unavailable";
    return res.json(fallback);
  }

  // 5. Merge real data into dashboard — start from mock for chart skeleton if needed
  const mock = buildAnalyticsDashboard(period);
  const kpis = [
    ...(ga4Data?.kpis || [{ label: "Sessions",         value: "—", delta: "—", trend: "flat", sub: "Google Analytics 4" },
                            { label: "Bounce Rate",     value: "—", delta: "—", trend: "flat", sub: "Google Analytics 4" },
                            { label: "Goal Completions",value: "—", delta: "—", trend: "flat", sub: "Google Analytics 4" }].filter(() => hasGA4)),
    ...(gscData?.kpis || [{ label: "Organic Clicks",  value: "—", delta: "—", trend: "flat", sub: "Search Console" },
                            { label: "Impressions",    value: "—", delta: "—", trend: "flat", sub: "Search Console" },
                            { label: "Avg. Position",  value: "—", delta: "—", trend: "flat", sub: "lower is better" }].filter(() => hasGSC)),
  ];

  // Ad spend KPIs (placeholder real-ish values — true API fetch can be added per connector)
  if (hasGoogleAds) kpis.push({ label: "Google Ads Spend", value: "—", delta: "—", trend: "flat", sub: "Google Ads" });
  if (hasMetaAds)   kpis.push({ label: "Meta Ads Spend",   value: "—", delta: "—", trend: "flat", sub: "Meta Ads"   });

  return res.json({
    lastUpdated: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    period: period === "7d" ? "Last 7 days" : period === "90d" ? "Last 90 days" : "Last 30 days",
    connected: true,
    connectedSources,
    kpis,
    trafficChart:     ga4Data?.trafficChart   || mock.trafficChart,
    conversionChart:  mock.conversionChart,
    topPages:         ga4Data?.topPages       || mock.topPages,
    topQueries:       gscData?.topQueries     || mock.topQueries,
    channels:         ga4Data?.channels       || mock.channels,
  });
});

/** Parse uploaded CSV → array of row objects */
function parseCsvBuffer(buffer) {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

/** Infer analytics input type from column names */
function inferAnalyticsType(rows) {
  if (!rows.length) return "unknown";
  const cols = Object.keys(rows[0]).map(k => k.toLowerCase());
  if (cols.some(c => c.includes("touchpoint") || c.includes("channel") || c.includes("journey"))) return "attribution";
  if (cols.some(c => c.includes("stage") || c.includes("funnel") || c.includes("conversion"))) return "funnel";
  if (cols.some(c => c.includes("spend") || c.includes("revenue") || c.includes("roi") || c.includes("roas"))) return "roi";
  return "roi"; // default
}

/** Run a Python analytics script and return its JSON output */
function runPythonAnalytics(scriptName, inputJson) {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `marqq_analytics_${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(inputJson));
    const script = join(ANALYTICS_SCRIPTS_DIR, scriptName);
    const proc = spawn("python3", [script, tmpFile, "--format", "json"]);
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code !== 0) return reject(new Error(`Analytics script failed: ${stderr.slice(0, 500)}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("Analytics script returned non-JSON output")); }
    });
  });
}

/** POST /api/analytics/upload — parse file, auto-detect type, run scripts */
app.post("/api/analytics/upload", analyticsUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let rows;
    const ext = req.file.originalname.split(".").pop().toLowerCase();

    if (ext === "csv") {
      rows = parseCsvBuffer(req.file.buffer);
    } else {
      // XLS/XLSX — use xlsx package if available, else error
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      } catch {
        return res.status(422).json({ error: "xlsx package not available — please upload CSV instead" });
      }
    }

    if (!rows.length) return res.status(422).json({ error: "File is empty or has no data rows" });

    const analyticsType = (req.body?.type) || inferAnalyticsType(rows);
    const results = {};

    // Always attempt ROI analysis (most universal for campaign data)
    if (analyticsType === "roi" || analyticsType === "unknown") {
      // Transform rows to expected ROI input format
      const campaigns = rows.map((r, i) => ({
        name:        r.campaign || r.name || r.Campaign || `Campaign ${i + 1}`,
        channel:     r.channel || r.Channel || r.source || "unknown",
        spend:       parseFloat(r.spend || r.Spend || r.cost || r.Cost || "0") || 0,
        revenue:     parseFloat(r.revenue || r.Revenue || r.conversions_value || "0") || 0,
        impressions: parseInt(r.impressions || r.Impressions || "0") || 0,
        clicks:      parseInt(r.clicks || r.Clicks || "0") || 0,
        leads:       parseInt(r.leads || r.Leads || r.conversions || "0") || 0,
        customers:   parseInt(r.customers || r.Customers || r.purchases || "0") || 0,
      }));
      try {
        results.roi = await runPythonAnalytics("campaign_roi_calculator.py", { campaigns });
      } catch (e) {
        results.roi = { error: e.message };
      }
    }

    if (analyticsType === "funnel") {
      // Try to build funnel from stage columns
      const stageKeys = Object.keys(rows[0]).filter(k => !isNaN(parseFloat(rows[0][k])));
      if (stageKeys.length >= 2) {
        const stages = stageKeys;
        const counts = rows[0] ? stageKeys.map(k => parseFloat(rows[0][k]) || 0) : [];
        try {
          results.funnel = await runPythonAnalytics("funnel_analyzer.py", { funnel: { stages, counts } });
        } catch (e) {
          results.funnel = { error: e.message };
        }
      }
    }

    if (analyticsType === "attribution") {
      // Build journey format
      const journeys = rows.map((r, i) => ({
        journey_id: r.journey_id || r.user_id || `j${i + 1}`,
        touchpoints: [{ channel: r.channel || r.source || "unknown", timestamp: r.date || r.timestamp || new Date().toISOString(), interaction: "click" }],
        converted: r.converted === "true" || r.converted === "1" || r.status === "converted" || false,
        revenue: parseFloat(r.revenue || r.value || "0") || 0,
      }));
      try {
        results.attribution = await runPythonAnalytics("attribution_analyzer.py", { journeys });
      } catch (e) {
        results.attribution = { error: e.message };
      }
    }

    res.json({
      rowCount: rows.length,
      analyticsType,
      fileName: req.file.originalname,
      results,
      sample: rows.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /api/analytics/run — run specific analysis on pre-provided JSON data */
app.post("/api/analytics/run", express.json(), async (req, res) => {
  const { type, data } = req.body || {};
  if (!type || !data) return res.status(400).json({ error: "type and data are required" });

  const scriptMap = {
    attribution: "attribution_analyzer.py",
    funnel: "funnel_analyzer.py",
    roi: "campaign_roi_calculator.py",
  };
  const script = scriptMap[type];
  if (!script) return res.status(400).json({ error: `Unknown type: ${type}. Use attribution, funnel, or roi` });

  try {
    const result = await runPythonAnalytics(script, data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Run a URL-based Python script and return its JSON stdout */
function runPythonUrl(scriptName, args) {
  return new Promise((resolve, reject) => {
    const script = join(ANALYTICS_SCRIPTS_DIR, scriptName);
    const proc = spawn("python3", [script, ...args]);
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code !== 0) return reject(new Error(stderr.slice(0, 500) || `Script exited ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("Script returned non-JSON output")); }
    });
  });
}

/** POST /api/analytics/analyze-page — run analyze_page.py on a URL */
app.post("/api/analytics/analyze-page", express.json(), async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    const result = await runPythonUrl("analyze_page.py", [url]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /api/analytics/scan-competitors — run competitor_scanner.py on one or more URLs */
app.post("/api/analytics/scan-competitors", express.json(), async (req, res) => {
  const { urls } = req.body || {};
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array is required" });
  }
  try {
    const result = await runPythonUrl("competitor_scanner.py", urls);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Budget optimization upload endpoints (now powered by multer)
app.post("/api/budget-optimization/upload", analyticsUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const ext = req.file.originalname.split(".").pop().toLowerCase();
    let rows;
    if (ext === "csv") {
      rows = parseCsvBuffer(req.file.buffer);
    } else {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      } catch {
        return res.status(422).json({ error: "Upload CSV format for best results" });
      }
    }
    const preview = rows.slice(0, 5);
    const csvText = [Object.keys(rows[0] || {}).join(","), ...rows.map(r => Object.values(r).join(","))].join("\n");
    res.json({ rowCount: rows.length, preview, csvText: csvText.slice(0, 8000) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/budget-optimization/calibration/upload", analyticsUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ received: true, fileName: req.file.originalname, size: req.file.size });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
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
      model: LLM_MODEL,
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
// Use service-role client: RLS on workspace_* tables scopes by auth.uid(), but this API is
// called from the browser without forwarding the user's JWT — anon client would see zero rows.

function workspaceDbOr503(res) {
  if (!supabaseAdminClient) {
    res
      .status(503)
      .json({
        error:
          "Workspace API requires SUPABASE_SERVICE_ROLE_KEY on the content-engine server",
      });
    return null;
  }
  return supabaseAdminClient;
}

// GET /api/workspaces?userId=xxx — list workspaces for a user (auto-provisions default)
app.get("/api/workspaces", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    let { data, error } = await db
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, website_url, created_at)")
      .eq("user_id", userId);
    if (error) throw error;

    // Auto-provision default workspace for new users
    if (!data || data.length === 0) {
      const { data: ws, error: wsErr } = await db
        .from("workspaces")
        .insert({ name: "My workspace", owner_id: userId })
        .select()
        .single();
      if (wsErr) throw wsErr;
      const { error: memErr } = await db
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
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .insert({ name, owner_id: userId })
      .select()
      .single();
    if (wsErr) throw wsErr;
    const { error: memErr } = await db
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
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (website_url !== undefined) updates.website_url = website_url;
    const { data, error } = await db
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

// DELETE /api/workspaces/:id — delete a workspace (owner only)
app.delete("/api/workspaces/:id", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  console.log(`[DELETE /api/workspaces/:id] workspace=${id}, userId=${userId}`);

  if (!userId) {
    console.error('Missing userId');
    return res.status(400).json({ error: "userId required" });
  }

  const db = workspaceDbOr503(res);
  if (!db) {
    console.error('DB connection failed');
    return;
  }

  try {
    // Verify the user is the owner
    console.log('Fetching workspace...');
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .select("owner_id")
      .eq("id", id)
      .single();

    console.log('Workspace data:', ws, 'Error:', wsErr);
    if (wsErr) throw wsErr;
    if (!ws) {
      console.error('Workspace not found');
      return res.status(404).json({ error: "Workspace not found" });
    }
    if (ws.owner_id !== userId) {
      console.error(`Owner mismatch: ${ws.owner_id} !== ${userId}`);
      return res.status(403).json({ error: "Only workspace owner can delete" });
    }

    // Delete workspace (cascade should handle members, conversations, etc.)
    console.log('Deleting workspace...');
    const { error: delErr } = await db
      .from("workspaces")
      .delete()
      .eq("id", id);

    console.log('Delete error:', delErr);
    if (delErr) throw delErr;

    console.log('Workspace deleted successfully');
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE workspace] Error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// GET /api/workspaces/:id/plan — get plan + credits (user-level, shared across workspaces)
// Accepts optional ?userId= query param; falls back to workspace owner_id.
app.get("/api/workspaces/:id/plan", async (req, res) => {
  const { id } = req.params;
  const queryUserId = typeof req.query.userId === "string" ? req.query.userId.trim() : null;
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    // Get workspace for plan + owner_id fallback
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .select("plan, owner_id")
      .eq("id", id)
      .single();
    if (wsErr) throw wsErr;

    const workspacePlan = ws?.plan || "growth";
    const userId = queryUserId || ws?.owner_id || null;

    if (!userId) {
      // No user context — return workspace plan with defaults
      return res.json({
        plan: workspacePlan,
        credits_remaining: PLAN_CREDITS[workspacePlan] ?? 500,
        credits_total: PLAN_CREDITS[workspacePlan] ?? 500,
        credits_reset_at: null,
      });
    }

    // Look up user-level plan record
    let { data: up } = await db
      .from("user_plans")
      .select("plan, credits_remaining, credits_total, credits_reset_at")
      .eq("user_id", userId)
      .single();

    // Seed record if missing
    if (!up) {
      const seedTotal = PLAN_CREDITS[workspacePlan] ?? 500;
      const { data: inserted } = await db
        .from("user_plans")
        .insert({
          user_id: userId,
          plan: workspacePlan,
          credits_remaining: seedTotal,
          credits_total: seedTotal,
          credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();
      up = inserted;
    }

    const plan = up?.plan || workspacePlan;
    let creditsRemaining = up?.credits_remaining ?? PLAN_CREDITS[plan] ?? 500;
    let creditsTotal = up?.credits_total ?? PLAN_CREDITS[plan] ?? 500;
    let resetAtOut = up?.credits_reset_at ?? null;

    // Auto-reset if monthly window elapsed
    const resetAt = resetAtOut ? new Date(resetAtOut) : null;
    if (resetAt && new Date() > resetAt) {
      const newTotal = PLAN_CREDITS[plan] ?? 500;
      const newResetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("user_plans")
        .update({ credits_remaining: newTotal, credits_total: newTotal, credits_reset_at: newResetAt, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      creditsRemaining = newTotal;
      creditsTotal = newTotal;
      resetAtOut = newResetAt;
    }

    res.json({
      plan,
      credits_remaining: creditsRemaining,
      credits_total: creditsTotal,
      credits_reset_at: resetAtOut,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workspaces/:id/plan — update plan (admin/billing use)
app.patch("/api/workspaces/:id/plan", async (req, res) => {
  const { id } = req.params;
  const { plan } = req.body;
  if (!plan || !["growth", "scale", "agency"].includes(plan)) {
    return res.status(400).json({ error: "plan must be growth | scale | agency" });
  }
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const newTotal = PLAN_CREDITS[plan] === -1 ? -1 : (PLAN_CREDITS[plan] ?? 500);
    const { data, error } = await db
      .from("workspaces")
      .update({
        plan,
        credits_total: newTotal,
        credits_remaining: newTotal,
        credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", id)
      .select("plan, credits_remaining, credits_total, credits_reset_at")
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
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const { data, error } = await db
      .from("workspace_members")
      .select("role, joined_at, user_id")
      .eq("workspace_id", id);
    if (error) throw error;
    const rows = data || [];

    // Enrich with real user details via admin client when available
    const members = await Promise.all(
      rows.map(async (row) => {
        let email = row.user_id;
        let name = "Member";
        if (supabaseAdminClient) {
          try {
            const { data: u } = await supabaseAdminClient.auth.admin.getUserById(row.user_id);
            if (u?.user) {
              email = u.user.email || row.user_id;
              name = u.user.user_metadata?.full_name || u.user.email?.split("@")[0] || "Member";
            }
          } catch { /* fallback to user_id */ }
        }
        return { id: row.user_id, email, name, role: row.role, joined_at: row.joined_at };
      })
    );
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invite/preview?token= — return invite metadata without accepting
app.get("/api/invite/preview", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token required" });
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const { data, error } = await db
      .from("workspace_invites")
      .select("email, workspace_id, accepted_at, expires_at, invited_by, workspaces(name)")
      .eq("token", token)
      .single();
    if (error || !data) return res.status(404).json({ error: "invite not found" });
    if (data.accepted_at) return res.status(410).json({ error: "invite already accepted" });
    if (data.expires_at && new Date(data.expires_at) < new Date()) return res.status(410).json({ error: "invite expired" });
    const workspaceName = data.workspaces?.name || "a workspace";
    res.json({ valid: true, email: data.email, workspace_id: data.workspace_id, workspace_name: workspaceName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invite/accept — accept an invite (user must be logged in, user_id required)
app.post("/api/invite/accept", async (req, res) => {
  const { token, user_id } = req.body;
  if (!token || !user_id) return res.status(400).json({ error: "token and user_id required" });
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const { data: invite, error: invErr } = await db
      .from("workspace_invites")
      .select("email, workspace_id, accepted_at, expires_at")
      .eq("token", token)
      .single();
    if (invErr || !invite) return res.status(404).json({ error: "invite not found" });
    if (invite.accepted_at) return res.status(410).json({ error: "invite already accepted" });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: "invite expired" });

    // Check not already a member
    const { data: existing } = await db
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (!existing) {
      const { error: memErr } = await db
        .from("workspace_members")
        .insert({ workspace_id: invite.workspace_id, user_id, role: "member" });
      if (memErr) throw memErr;
    }

    // Mark invite accepted
    await db
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("token", token);

    res.json({ ok: true, workspace_id: invite.workspace_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/:id/invite — create pending invite and send email via AgentMail
app.post("/api/workspaces/:id/invite", async (req, res) => {
  const { id } = req.params;
  const { email, invitedBy } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    // Fetch workspace name for the email
    const { data: ws } = await db
      .from("workspaces")
      .select("name")
      .eq("id", id)
      .single();
    const workspaceName = ws?.name || "a Marqq workspace";

    const { data, error } = await db
      .from("workspace_invites")
      .insert({ workspace_id: id, email, invited_by: invitedBy })
      .select()
      .single();
    if (error) throw error;

    // Send invite email via AgentMail
    const agentMailApiKey = process.env.AGENTMAIL_API_KEY || "";
    if (agentMailApiKey && data?.token) {
      try {
        const appUrl = process.env.APP_URL || "http://localhost:3007";
        const acceptUrl = `${appUrl}?invite=${data.token}`;

        const inbox = await ensureAgentMailInbox(agentMailApiKey, "system-invites");
        await agentMailFetch(`/inboxes/${encodeURIComponent(inbox.inbox_id)}/messages/send`, agentMailApiKey, {
          method: "POST",
          body: JSON.stringify({
            to: [email],
            subject: `You've been invited to ${workspaceName} on Marqq`,
            text: [
              `You've been invited to join ${workspaceName} on Marqq.`,
              "",
              `Accept your invite here: ${acceptUrl}`,
              "",
              "This link will add you to the workspace. If you don't have a Marqq account, you'll be prompted to create one.",
              "",
              "— The Marqq team",
            ].join("\n"),
            html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <div style="margin-bottom:28px">
    <span style="font-size:22px;font-weight:700;color:#ea580c">marqq</span>
  </div>
  <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">You've been invited to ${workspaceName}</h1>
  <p style="color:#555;margin:0 0 28px;line-height:1.6">
    Someone on the team invited you to collaborate on <strong>${workspaceName}</strong> in Marqq — the AI-powered marketing intelligence platform.
  </p>
  <a href="${acceptUrl}" style="display:inline-block;background:#ea580c;color:#fff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">
    Accept invite
  </a>
  <p style="color:#888;font-size:12px;margin-top:28px;line-height:1.5">
    Or copy this link: <a href="${acceptUrl}" style="color:#ea580c">${acceptUrl}</a><br/>
    If you didn't expect this invite, you can safely ignore this email.
  </p>
</div>`,
          }),
        });
        console.log(`[invite] email sent to ${email} for workspace ${id}`);
      } catch (mailErr) {
        // Non-fatal — invite row is already created
        console.warn(`[invite] AgentMail send failed: ${mailErr.message}`);
      }
    } else {
      console.log(`[invite] ${email} invited to workspace ${id} — token: ${data.token} (AgentMail not configured)`);
    }

    res.json({ invite: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workspaces/:id/members/:userId — remove member (cannot remove owner)
app.delete("/api/workspaces/:id/members/:userId", async (req, res) => {
  const { id, userId } = req.params;
  const db = workspaceDbOr503(res);
  if (!db) return;
  try {
    const { error } = await db
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

// ─── Workspace-scoped agent deployments ──────────────────────────────────────

// GET /api/workspaces/:id/agent-deployments — deployments for one workspace, newest first
app.get("/api/workspaces/:id/agent-deployments", async (req, res) => {
  const { id } = req.params;
  try {
    const queue = await readDeploymentQueue();
    const filtered = queue
      .filter((d) => d?.workspaceId === id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 20);
    res.json({ deployments: filtered });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/workspaces/:id/agent-deployments — create a deployment scoped to a workspace
// Accepts optional `scheduledFor` (ISO string) so UI can show a live countdown.
app.post("/api/workspaces/:id/agent-deployments", async (req, res) => {
  const { id } = req.params;
  const {
    agentName,
    sectionId,
    sectionTitle,
    summary = "",
    bullets = [],
    tasks = [],
    scheduleMode,
    recurrenceMinutes,
    runPrompt = "",
    scheduledFor,
    source = "onboarding",
    agentTarget,
    companyId,
  } = req.body ?? {};

  if (!agentName || !VALID_AGENTS.has(agentName)) {
    return res.status(400).json({ error: "Valid agentName is required" });
  }
  if (!sectionId || !sectionTitle) {
    return res.status(400).json({ error: "sectionId and sectionTitle are required" });
  }

  try {
    const queue = await readDeploymentQueue();
    const isMonitor = String(scheduleMode || "") === "monitor";
    const entry = {
      id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentName,
      agentTarget: agentTarget || null,
      workspaceId: id,
      companyId: typeof companyId === "string" && companyId.trim() ? companyId.trim() : null,
      sectionId,
      sectionTitle,
      summary,
      bullets: Array.isArray(bullets) ? bullets : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      scheduleMode: isMonitor ? "monitor" : null,
      recurrenceMinutes: isMonitor ? Math.max(15, Number(recurrenceMinutes) || 10080) : null,
      runPrompt,
      source,
      status: isMonitor ? "active" : "pending",
      createdAt: new Date().toISOString(),
      scheduledFor: scheduledFor || (isMonitor ? new Date().toISOString() : "next_cron_run"),
    };
    queue.unshift(entry);
    await writeDeploymentQueue(queue.slice(0, 200));
    res.status(201).json({ deployment: entry });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Draft Approval Queue ─────────────────────────────────────────────────────
// Agents produce content as DRAFTs. Before autopilot publishes, the user must
// approve (or reject) via the in-app queue or an approval email.
//
// Draft lifecycle:
//   pending  → user sees it, can approve/reject/edit
//   approved → autopilot may publish
//   rejected → discarded, agent notified
//   published → live on channel

const DRAFT_APPROVALS_PATH = join(__dirname, "data", "draft-approvals.json");

async function readDraftApprovals() {
  try {
    const raw = await readFile(DRAFT_APPROVALS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeDraftApprovals(entries) {
  await mkdir(dirname(DRAFT_APPROVALS_PATH), { recursive: true });
  await writeFile(DRAFT_APPROVALS_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * Send an approval email for a draft content piece.
 * Uses the same AgentMail infrastructure as integration suggestion emails.
 */
async function sendDraftApprovalEmail({ draft, userEmail, companyId, userName }) {
  const apiKey = process.env.AGENTMAIL_API_KEY || "";
  if (!apiKey || !userEmail) return { sent: false, reason: "missing apiKey or email" };

  const greeting = userName ? `Hey ${userName.split(" ")[0]},` : "Hey,";
  const platformLabel = draft.platform ? ` for ${draft.platform}` : "";
  const agentLabel = draft.agent ? draft.agent.charAt(0).toUpperCase() + draft.agent.slice(1) : "Your agent";
  const approvalUrl = `${process.env.APP_URL || "http://localhost:5173"}/?draft=${encodeURIComponent(draft.id)}`;

  const contentPreview = typeof draft.content === "string"
    ? draft.content.slice(0, 400) + (draft.content.length > 400 ? "…" : "")
    : JSON.stringify(draft.artifact || {}).slice(0, 300);

  const text = `${greeting}

${agentLabel} has prepared a new ${draft.type || "content"} draft${platformLabel} ready for your review.

---
${contentPreview}
---

Approve it here: ${approvalUrl}

Or reply:
• "approve" — publish as scheduled
• "reject" — discard this draft
• "edit: [your changes]" — apply edits and re-queue

— Marqq`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Marqq · Draft ready for approval</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid #334155;">
      <div style="font-size:13px;font-weight:600;color:#f97316;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Marqq · Draft Ready</div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#f1f5f9;">${agentLabel} needs your approval</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#cbd5e1;">
        A new <strong style="color:#f1f5f9;">${draft.type || "content"} draft</strong>${platformLabel ? ` for <strong style="color:#f97316;">${draft.platform}</strong>` : ""} is ready for your review.
      </p>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Content Preview</div>
        <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.7;white-space:pre-wrap;">${contentPreview}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;width:100px;">Agent</td>
          <td style="padding:6px 0;font-size:13px;color:#e2e8f0;">${agentLabel}</td>
        </tr>
        ${draft.platform ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;">Platform</td><td style="padding:6px 0;font-size:13px;color:#e2e8f0;">${draft.platform}</td></tr>` : ""}
        ${draft.scheduledFor ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;">Scheduled</td><td style="padding:6px 0;font-size:13px;color:#e2e8f0;">${new Date(draft.scheduledFor).toLocaleString()}</td></tr>` : ""}
      </table>
      <a href="${approvalUrl}" style="display:inline-block;background:#f97316;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin-bottom:20px;">Review &amp; Approve →</a>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Or reply to this email:</p>
        <ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#94a3b8;line-height:2;">
          <li><strong style="color:#e2e8f0;">"approve"</strong> — publish as scheduled</li>
          <li><strong style="color:#e2e8f0;">"reject"</strong> — discard this draft</li>
          <li><strong style="color:#e2e8f0;">"edit: [your changes]"</strong> — apply edits and re-queue</li>
        </ul>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;">— Marqq</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const inbox = await ensureAgentMailInbox(apiKey, companyId || "default");
    await agentMailFetch(
      `/inboxes/${encodeURIComponent(inbox.inbox_id)}/messages/send`,
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          to: [userEmail],
          subject: `Draft ready for approval — ${agentLabel}${platformLabel}`,
          text,
          html,
        }),
      }
    );
    return { sent: true };
  } catch (err) {
    console.error("[draft_approval_email] failed:", err.message);
    return { sent: false, error: err.message };
  }
}

// GET /api/workspaces/:id/draft-approvals — list drafts pending approval
app.get("/api/workspaces/:id/draft-approvals", async (req, res) => {
  const { id } = req.params;
  const { status } = req.query; // optional filter: pending | approved | rejected | published
  try {
    const all = await readDraftApprovals();
    const filtered = all
      .filter((d) => d?.workspaceId === id)
      .filter((d) => !status || d.status === status)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 50);
    res.json({ drafts: filtered });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/workspaces/:id/draft-approvals — create a new draft pending approval
app.post("/api/workspaces/:id/draft-approvals", async (req, res) => {
  const { id } = req.params;
  const {
    agent,
    type,           // 'social_post' | 'article' | 'email' | 'video' | 'image'
    platform,       // 'linkedin' | 'wordpress' | 'instagram' | etc.
    content,        // plain text / markdown of the artifact
    artifact,       // full artifact JSON for rendering
    scheduledFor,   // ISO string — when to publish if approved
    companyId,
    userEmail,
    userName,
    sendEmail = true,
  } = req.body ?? {};

  if (!agent || !type) {
    return res.status(400).json({ error: "agent and type are required" });
  }

  try {
    const drafts = await readDraftApprovals();
    const draft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: id,
      companyId: companyId || null,
      agent,
      type,
      platform: platform || null,
      content: content || null,
      artifact: artifact || null,
      scheduledFor: scheduledFor || null,
      status: "pending",
      createdAt: new Date().toISOString(),
      approvedAt: null,
      rejectedAt: null,
      publishedAt: null,
      approvalEmailSent: false,
    };
    drafts.unshift(draft);
    await writeDraftApprovals(drafts.slice(0, 500));

    // Send approval email (non-blocking)
    if (sendEmail && userEmail) {
      sendDraftApprovalEmail({ draft, userEmail, companyId, userName })
        .then((r) => {
          if (r.sent) {
            // Mark email as sent
            readDraftApprovals().then((all) => {
              const idx = all.findIndex((d) => d.id === draft.id);
              if (idx >= 0) {
                all[idx].approvalEmailSent = true;
                writeDraftApprovals(all);
              }
            });
          }
        })
        .catch(() => {});
    }

    res.status(201).json({ draft });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/workspaces/:id/draft-approvals/:draftId — approve | reject | publish
app.patch("/api/workspaces/:id/draft-approvals/:draftId", async (req, res) => {
  const { id, draftId } = req.params;
  const { action, editedContent } = req.body ?? {};
  // action: 'approve' | 'reject' | 'publish' | 'edit'

  if (!["approve", "reject", "publish", "edit"].includes(action)) {
    return res.status(400).json({ error: "action must be approve | reject | publish | edit" });
  }

  try {
    const drafts = await readDraftApprovals();
    const idx = drafts.findIndex((d) => d.id === draftId && d.workspaceId === id);
    if (idx < 0) return res.status(404).json({ error: "Draft not found" });

    const draft = drafts[idx];
    const now = new Date().toISOString();

    if (action === "approve") {
      draft.status = "approved";
      draft.approvedAt = now;
    } else if (action === "reject") {
      draft.status = "rejected";
      draft.rejectedAt = now;
    } else if (action === "publish") {
      draft.status = "published";
      draft.publishedAt = now;
    } else if (action === "edit") {
      draft.content = editedContent ?? draft.content;
      draft.status = "pending"; // re-queue for approval
      draft.approvedAt = null;
    }

    drafts[idx] = draft;
    await writeDraftApprovals(drafts);
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: String(err) });
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

// ─── AgentMail inbound email webhook ─────────────────────────────────────────
// Register this URL in AgentMail dashboard as the inbound webhook endpoint.
// AgentMail POSTs here whenever a user replies to a report email.
app.post("/api/webhooks/agentmail/inbound", express.json(), async (req, res) => {
  try {
    // Verify shared secret if configured
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers["x-agentmail-signature"] || "";
      if (sig !== secret) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }
    const result = await handleAgentMailInbound(req.body);
    res.json(result);
  } catch (err) {
    console.error("[agentmail_inbound] webhook error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/agents/integration-connected ───────────────────────────────────
// Called by the frontend when a Composio OAuth connection succeeds.
// Automatically sends a proactive automation suggestion email to the user.
// Body: { connectorId: string, workspaceId: string, userEmail: string, userName?: string }

app.post("/api/agents/integration-connected", express.json(), async (req, res) => {
  const { connectorId, workspaceId, userEmail, userName } = req.body || {};
  if (!connectorId) {
    return res.status(400).json({ error: "connectorId is required" });
  }

  console.log(`[integration_connected] connector=${connectorId} workspace=${workspaceId} email=${userEmail}`);

  // Fire-and-forget — don't block the response on email delivery
  sendIntegrationSuggestionEmail({
    connectorId,
    userEmail,
    companyId: workspaceId || "default",
    userName,
  }).catch(err => console.warn("[integration_connected] suggestion email failed:", err.message));

  res.json({
    ok: true,
    connectorId,
    hasSuggestions: Boolean(CONNECTOR_AUTOMATIONS[connectorId]?.length),
    suggestionCount: CONNECTOR_AUTOMATIONS[connectorId]?.length ?? 0,
  });
});

// Keep API misses machine-readable so frontend error handling does not receive
// Express's default HTML 404 page.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

export { app, startBackendRuntime, stopBackendRuntime };

if (IS_MAIN_MODULE) {
  startBackendRuntime();
}
