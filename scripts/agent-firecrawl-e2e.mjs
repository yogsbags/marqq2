#!/usr/bin/env node
/**
 * Full agentic loop + Firecrawl REST (no HTTP): same runAgenticLoop as /api/agents/:name/run,
 * but forces Groq tool model so firecrawl_scrape / firecrawl_search are merged (Groq-only tools).
 *
 * Usage (from repo root):
 *   node --env-file=.env scripts/agent-firecrawl-e2e.mjs
 *
 * Requires: GROQ_API_KEY, FIRECRAWL_API_KEY
 */
import { randomUUID } from "node:crypto";
import { runAgenticLoop } from "../platform/content-engine/agents/agenticLoop.js";
import { tracedLLM } from "../platform/content-engine/langfuse.js";
import { inferProviderForModel } from "../platform/content-engine/llm-client.js";

const model =
  process.env.GROQ_AGENT_RUN_TOOL_MODEL ||
  process.env.GROQ_E2E_MODEL ||
  "openai/gpt-oss-120b";

if (!(process.env.FIRECRAWL_API_KEY || "").trim()) {
  console.error("FAIL: FIRECRAWL_API_KEY is not set");
  process.exit(1);
}
if (!(process.env.GROQ_API_KEY || "").trim()) {
  console.error("FAIL: GROQ_API_KEY is not set");
  process.exit(1);
}

const provider = inferProviderForModel(model);
const agentLlm = tracedLLM({
  traceName: "agent-firecrawl-e2e",
  sessionId: randomUUID(),
  tags: ["e2e", "firecrawl"],
  provider,
});

const res = { write() {} };

const messages = [
  {
    role: "system",
    content: [
      "You are a minimal test agent.",
      "You MUST call the tool firecrawl_scrape exactly once with argument {\"url\":\"https://example.com\"}.",
      "Do not claim you scraped unless you actually invoked the tool.",
      "After the tool result, write one sentence citing what you saw.",
      "End with ---CONTRACT--- and valid JSON: agent, task, run_id, timestamp, input {}, artifact { summary, data: { scraped: true }, confidence: 0.9 }, context_patch { writes_to: [], patch: {} }, handoff_notes \"\", missing_data [], tasks_created [].",
    ].join(" "),
  },
  { role: "user", content: "Call firecrawl_scrape for https://example.com now." },
];

const result = await runAgenticLoop({
  groqClient: agentLlm,
  model,
  messages,
  tools: [],
  res,
  entityId: "e2e",
  composioApiKey: null,
  maxRounds: 5,
  maxTokens: 4096,
  temperature: 0.2,
});

const execs = result.toolExecutions || [];
const fc = execs.filter((t) => /^firecrawl_/i.test(t.requestedToolName || ""));

console.log("E2E model:", model, "| provider:", provider);
console.log("E2E fullText chars:", (result.fullText || "").length);
console.log(
  "E2E toolExecutions (firecrawl):",
  JSON.stringify(
    fc.map((t) => ({
      name: t.requestedToolName,
      successful: t.successful,
      hasData: t.data != null,
      err: t.error || null,
    })),
    null,
    2
  )
);

if (fc.length === 0) {
  console.error(
    "FAIL: No firecrawl_* execution. If your app uses LLM_PROVIDER=claude, /api/agents/.../run uses Claude first and does not merge Firecrawl (Groq-only). This script forces a Groq tool model."
  );
  process.exit(1);
}

const ok = fc.some((t) => t.successful && t.data != null);
if (!ok) {
  console.error("FAIL: firecrawl tool did not return successful data");
  process.exit(1);
}

console.log("PASS: complete agentic loop executed firecrawl_* with successful API data");
process.exit(0);
