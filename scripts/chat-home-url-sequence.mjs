#!/usr/bin/env node
/**
 * Simulates ChatHome URL fast-path: buildUrlAnalysisSequence(url) → sequential POST /api/agents/:name/run
 * Usage: node scripts/chat-home-url-sequence.mjs [url]
 * Env: BACKEND_URL default http://127.0.0.1:3008 — optional x-workspace-id / x-user-id / company_id via env
 */
const BASE = process.env.BACKEND_URL || "http://127.0.0.1:3008";
const url = process.argv[2] || "https://productverse.in";

const concise =
  "\n\nProvide 2-3 clear bulleted paragraphs with specific, actionable recommendations. No headers or filler.";

/** @type {{ name: string; displayName: string; role: string; query: string }[]} */
const sequence = [
  {
    name: "maya",
    displayName: "Maya",
    role: "SEO & LLMO Monitor",
    query: `Analyse the SEO and AI answer engine (LLMO) presence for ${url}. Surface the top 3 keyword opportunities and the single most urgent ranking gap. Use any connected Google Search Console or Ahrefs data if available via Composio.${concise}`,
  },
  {
    name: "arjun",
    displayName: "Arjun",
    role: "Lead Intelligence",
    query: `Based on the business at ${url}, define the ideal customer profile. Name the top 2 target segments and the recommended first outreach move. Use Apollo or LinkedIn data if available via Composio.${concise}`,
  },
  {
    name: "dev",
    displayName: "Dev",
    role: "Performance Analyst",
    query: `Analyse the estimated performance footprint for ${url}. What are the top 3 conversion improvements to prioritise? Use GA4 or PostHog data if connected via Composio.${concise}`,
  },
  {
    name: "riya",
    displayName: "Riya",
    role: "Content Producer",
    query: `Review the content strategy visible at ${url}. Name the biggest content gap and the top 3 pieces to publish next for maximum organic impact.${concise}`,
  },
  {
    name: "zara",
    displayName: "Zara",
    role: "Campaign Strategist",
    query: `Based on the website ${url} and its market position, what channels and campaign angles should be prioritised for the next 90 days?${concise}`,
  },
];

function parseSseStats(text) {
  let toolCalls = 0;
  let toolOk = 0;
  let textChars = 0;
  let err = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") continue;
    try {
      const j = JSON.parse(raw);
      if (j.tool_call) toolCalls += 1;
      if (j.tool_result?.successful) toolOk += 1;
      if (typeof j.text === "string") textChars += j.text.length;
      if (j.error) err = String(j.error);
    } catch {
      /* ignore */
    }
  }
  return { toolCalls, toolOk, textChars, err };
}

async function runOne(agent) {
  const headers = {
    "Content-Type": "application/json",
    ...(process.env.X_WORKSPACE_ID ? { "x-workspace-id": process.env.X_WORKSPACE_ID } : {}),
    ...(process.env.X_USER_ID ? { "x-user-id": process.env.X_USER_ID } : {}),
  };
  const body = {
    query: agent.query,
    ...(process.env.COMPANY_ID ? { company_id: process.env.COMPANY_ID } : {}),
  };
  const started = Date.now();
  const res = await fetch(`${BASE}/api/agents/${agent.name}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const buf = await res.text();
  const ms = Date.now() - started;
  if (!res.ok) {
    return {
      agent: agent.name,
      ok: false,
      status: res.status,
      ms,
      error: buf.slice(0, 500),
      stats: null,
    };
  }
  return {
    agent: agent.name,
    ok: true,
    status: res.status,
    ms,
    stats: parseSseStats(buf),
    error: null,
  };
}

console.log(`ChatHome URL sequence simulation`);
console.log(`URL: ${url}`);
console.log(`Backend: ${BASE}`);
console.log(`Agents: ${sequence.map((a) => a.name).join(" → ")}\n`);

for (const agent of sequence) {
  process.stdout.write(`→ ${agent.displayName} (${agent.name}) … `);
  try {
    const r = await runOne(agent);
    if (!r.ok) {
      console.log(`FAIL HTTP ${r.status} (${r.ms}ms)`);
      console.log(r.error);
      process.exitCode = 1;
      break;
    }
    const s = r.stats;
    console.log(
      `OK ${r.ms}ms | streamed ~${s.textChars} chars | tool_call events: ${s.toolCalls} | tool OK: ${s.toolOk}${s.err ? ` | stream error: ${s.err}` : ""}`
    );
  } catch (e) {
    console.log(`ERROR ${e?.message || e}`);
    process.exitCode = 1;
    break;
  }
}
