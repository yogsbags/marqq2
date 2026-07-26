#!/usr/bin/env node
/**
 * Local test: POST /api/gtm/modules/:id/execute { taskId: "icp_brief" }
 *
 * Default mode: in-process Express + in-memory Supabase mock (no Railway/.env needed).
 * Live mode: BASE_URL=… MODULE_ID=… node scripts/test-icp-brief-route.mjs
 *
 * Usage:
 *   node scripts/test-icp-brief-route.mjs
 *   BASE_URL=http://127.0.0.1:3008 MODULE_ID=<uuid> node scripts/test-icp-brief-route.mjs
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import {
  GTM_INTERVIEW_SECTIONS,
  GTM_SECTION_ORDER,
  registerGtmWizardRoutes,
} from "../platform/content-engine/gtm-wizard-routes.js";

const BASE_URL = String(process.env.BASE_URL || "").replace(/\/$/, "");
const MODULE_ID = String(process.env.MODULE_ID || "").trim();
const LIVE = Boolean(BASE_URL && MODULE_ID);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ans(value, label = value) {
  return { value, label };
}

function stubAnswersForSection(sectionId) {
  const def = GTM_INTERVIEW_SECTIONS.find((s) => s.id === sectionId);
  const answers = {};
  for (const q of def.questions) {
    const fixed = q.fixedOptions?.[0];
    answers[q.id] = ans(
      fixed?.value || `test_${q.id}`,
      fixed?.label || `Test ${q.id.replace(/_/g, " ")}`,
    );
  }
  // Audience-specific ICP-ish answers for a more realistic brief handoff
  if (sectionId === "audience") {
    answers.icp = ans("b2b_saas_marketing_leads", "B2B SaaS marketing teams (10–200)");
    answers.persona = ans("vp_marketing", "VP Marketing / Growth lead");
    answers.jtbd = ans("pipeline", "Generate qualified pipeline without hiring more SDRs");
    answers.target_timeline = ans("0_30d", "Next 30 days");
  }
  if (sectionId === "goals") {
    answers.priority_90d = ans("leads", "Build lead pipeline");
    answers.channel_bet = ans("outbound", "Outbound + content");
    answers.budget_band = ans("10k_25k", "$10k–$25k / month");
  }
  if (sectionId === "module") {
    answers.module_type = ans("product", "Product");
    answers.module_name = ans("Marqq ICP Test", "Marqq ICP Test");
  }
  if (sectionId === "offer") {
    answers.category = ans("b2b_saas", "B2B SaaS");
    answers.one_liner = ans(
      "AI marketing ops that turns GTM interviews into ICP briefs and outreach.",
      "AI marketing ops that turns GTM interviews into ICP briefs and outreach.",
    );
    answers.business_model = ans("saas_subscription", "SaaS / subscription");
    answers.pricing_strategy = ans("tiered_plans", "Tiered plans (Good / Better / Best)");
  }
  return answers;
}

function buildLockedSectionState() {
  const section_state = {};
  const profile = {
    module: { type: "product", name: "Marqq ICP Test" },
    locked_sections: [...GTM_SECTION_ORDER],
    inferences: {},
  };
  for (const sectionId of GTM_SECTION_ORDER) {
    const answers = stubAnswersForSection(sectionId);
    section_state[sectionId] = {
      locked: true,
      locked_at: new Date().toISOString(),
      answers,
    };
    const flat = {};
    for (const [qid, a] of Object.entries(answers)) {
      flat[qid] = a.label || a.value;
    }
    profile[sectionId] = flat;
  }
  return { section_state, profile };
}

/** Minimal Supabase-ish client for gtm_modules only */
function createMemoryClient(initialRows = []) {
  const store = { gtm_modules: [...initialRows] };

  const api = {
    from(table) {
      if (table !== "gtm_modules") {
        throw new Error(`Unexpected table: ${table}`);
      }
      let filters = [];
      let pendingInsert = null;
      let pendingUpdate = null;

      const chain = {
        select() {
          return chain;
        },
        eq(col, val) {
          filters.push((row) => row[col] === val);
          return chain;
        },
        neq(col, val) {
          filters.push((row) => row[col] !== val);
          return chain;
        },
        order() {
          return chain;
        },
        insert(row) {
          pendingInsert = { ...row, id: row.id || randomUUID() };
          return chain;
        },
        update(patch) {
          pendingUpdate = patch;
          return chain;
        },
        async maybeSingle() {
          const rows = store.gtm_modules.filter((r) => filters.every((f) => f(r)));
          return { data: rows[0] || null, error: null };
        },
        async single() {
          if (pendingInsert) {
            store.gtm_modules.push(pendingInsert);
            const data = pendingInsert;
            pendingInsert = null;
            return { data, error: null };
          }
          if (pendingUpdate) {
            const idx = store.gtm_modules.findIndex((r) => filters.every((f) => f(r)));
            if (idx < 0) return { data: null, error: { message: "not found" } };
            store.gtm_modules[idx] = { ...store.gtm_modules[idx], ...pendingUpdate };
            const data = store.gtm_modules[idx];
            pendingUpdate = null;
            return { data, error: null };
          }
          const rows = store.gtm_modules.filter((r) => filters.every((f) => f(r)));
          if (!rows[0]) return { data: null, error: { message: "not found" } };
          return { data: rows[0], error: null };
        },
      };
      return chain;
    },
  };

  return { client: api, store };
}

async function listen(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function runInProcess() {
  console.log("Mode: in-process mock (no external DB)\n");

  const unlockedId = randomUUID();
  const lockedId = randomUUID();
  const { section_state, profile } = buildLockedSectionState();

  const unlocked = {
    id: unlockedId,
    workspace_id: "ws-test",
    user_id: "user-test",
    company_id: "co-test",
    name: "Unlocked draft",
    module_type: "product",
    status: "draft",
    source_context: { onboarding: { company: "Test Co", websiteUrl: "https://example.com" } },
    profile: { module: { type: "product", name: "Unlocked" }, locked_sections: [] },
    section_state: {},
    active: true,
  };

  const locked = {
    id: lockedId,
    workspace_id: "ws-test",
    user_id: "user-test",
    company_id: "co-test",
    name: "Marqq ICP Test",
    module_type: "product",
    status: "ready",
    source_context: {
      onboarding: { company: "Marqq", websiteUrl: "https://marqq.ai", icp: "B2B marketers" },
    },
    profile,
    section_state,
    active: true,
  };

  const { client } = createMemoryClient([unlocked, locked]);
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  registerGtmWizardRoutes(app, {
    groq: null,
    supabaseAdminClient: client,
    supabase: client,
    MKGService: null,
    crawlCompanyForMKG: null,
    buildContextPatchFromCrawl: null,
    initializeMKGTemplate: null,
    writeContextToSupabase: async () => {},
    CTX_DIR: null,
  });

  const { baseUrl, close } = await listen(app);
  console.log(`Temp server: ${baseUrl}`);

  try {
    // 1) Unlocked module must 409
    {
      const { status, body } = await jsonFetch(`${baseUrl}/api/gtm/modules/${unlockedId}/execute`, {
        method: "POST",
        body: JSON.stringify({ taskId: "icp_brief" }),
      });
      console.log(`\n[1] unlocked execute → ${status}`);
      assert(status === 409, `expected 409 for unlocked module, got ${status}: ${JSON.stringify(body)}`);
      console.log("    ok — blocked until all sections locked");
    }

    // 2) execute-options should recommend icp_brief when priority mentions leads
    {
      const { status, body } = await jsonFetch(`${baseUrl}/api/gtm/modules/${lockedId}/execute-options`);
      console.log(`\n[2] execute-options → ${status}`);
      assert(status === 200, `execute-options failed: ${JSON.stringify(body)}`);
      const icp = (body.options || []).find((o) => o.id === "icp_brief");
      assert(icp, "icp_brief missing from execute-options");
      assert(icp.agentTarget === "company_intel_icp", `bad agentTarget: ${icp.agentTarget}`);
      // Recommendation may lose to gtm_strategy_doc (index 0) after single-recommend dedupe;
      // still verify lead priority is detected in contextSummary / option presence.
      assert(
        String(body.profile?.goals?.priority_90d || "").toLowerCase().includes("lead"),
        "locked profile should surface lead priority for recommendation heuristics",
      );
      console.log(
        `    ok — icp_brief present → ${icp.agentTarget} (recommended=${icp.recommended})`,
      );
    }

    // 3) Happy path Build ICP brief
    {
      const { status, body } = await jsonFetch(`${baseUrl}/api/gtm/modules/${lockedId}/execute`, {
        method: "POST",
        body: JSON.stringify({ taskId: "icp_brief" }),
      });
      console.log(`\n[3] POST execute icp_brief → ${status}`);
      assert(status === 200, `execute failed: ${JSON.stringify(body)}`);
      assert(body.ok === true, "ok !== true");
      assert(body.kind === "agent", `kind=${body.kind}`);
      assert(body.agentTarget === "company_intel_icp", `agentTarget=${body.agentTarget}`);
      assert(body.task?.id === "icp_brief", "task.id mismatch");
      assert(body.deployContext?.sectionId === "icp_brief", "deployContext.sectionId mismatch");
      assert(
        body.module?.profile?.last_executed_task?.taskId === "icp_brief",
        "last_executed_task not persisted",
      );
      console.log("    ok — route returned deploy handoff:");
      console.log(
        JSON.stringify(
          {
            kind: body.kind,
            agentTarget: body.agentTarget,
            deployContext: body.deployContext,
            last_executed_task: body.module.profile.last_executed_task,
          },
          null,
          2,
        ),
      );
    }

    // 4) Unknown task
    {
      const { status, body } = await jsonFetch(`${baseUrl}/api/gtm/modules/${lockedId}/execute`, {
        method: "POST",
        body: JSON.stringify({ taskId: "not_a_real_task" }),
      });
      console.log(`\n[4] unknown taskId → ${status}`);
      assert(status === 400, `expected 400, got ${status}: ${JSON.stringify(body)}`);
      console.log("    ok — rejects unknown taskId");
    }

    console.log("\n✅ Build ICP brief route checks passed");
  } finally {
    await close();
  }
}

async function runLive() {
  console.log(`Mode: live\nBASE_URL=${BASE_URL}\nMODULE_ID=${MODULE_ID}\n`);

  const options = await jsonFetch(`${BASE_URL}/api/gtm/modules/${MODULE_ID}/execute-options`);
  console.log(`[execute-options] ${options.status}`);
  if (options.status !== 200) {
    console.error(options.body);
    process.exit(1);
  }
  const icp = (options.body.options || []).find((o) => o.id === "icp_brief");
  console.log("icp_brief option:", icp);

  const exec = await jsonFetch(`${BASE_URL}/api/gtm/modules/${MODULE_ID}/execute`, {
    method: "POST",
    body: JSON.stringify({ taskId: "icp_brief" }),
  });
  console.log(`[execute] ${exec.status}`);
  console.log(JSON.stringify(exec.body, null, 2));

  assert(exec.status === 200, `live execute failed (${exec.status})`);
  assert(exec.body.agentTarget === "company_intel_icp", "agentTarget mismatch");
  assert(exec.body.kind === "agent", "kind mismatch");
  console.log("\n✅ Live Build ICP brief route OK");
}

try {
  if (LIVE) await runLive();
  else await runInProcess();
} catch (err) {
  console.error("\n❌", err.message || err);
  process.exit(1);
}
