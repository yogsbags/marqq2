import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const agentsDir = await mkdtemp(join(tmpdir(), "torqq-outcomes-"));
process.env.AGENT_RUN_TEST_MODE = "1";
process.env.BACKEND_PORT = "3012";
process.env.TORQQ_AGENTS_DIR = agentsDir;

const backend = await import("./backend-server.js");
const { appendCalibrationNote } = await import("./calibration-writer.js");

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("parseOutcomeDays only accepts 7, 30, or 90 day windows", () => {
  assert.equal(backend.parseOutcomeDays(undefined), 30);
  assert.equal(backend.parseOutcomeDays("7"), 7);
  assert.equal(backend.parseOutcomeDays("30"), 30);
  assert.equal(backend.parseOutcomeDays("90"), 90);
  assert.equal(backend.parseOutcomeDays("14"), null);
  assert.equal(backend.parseOutcomeDays("abc"), null);
});

test("GET /api/outcomes validates companyId before querying the ledger", async () => {
  const req = { params: { companyId: "../bad" }, query: {} };
  const res = createResponseRecorder();
  let called = false;

  await backend.createOutcomesRouteHandler({
    listOutcomeRowsImpl: async () => {
      called = true;
      return [];
    },
  })(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "invalid companyId" });
  assert.equal(called, false);
});

test("GET /api/outcomes returns ledger rows and aggregated agent accuracy", async () => {
  const req = { params: { companyId: "acme" }, query: { days: "90" } };
  const res = createResponseRecorder();

  await backend.createOutcomesRouteHandler({
    listOutcomeRowsImpl: async (companyId, options) => {
      assert.equal(companyId, "acme");
      assert.equal(options.days, 90);
      return [
        {
          run_id: "run-2",
          company_id: "acme",
          agent: "dev",
          outcome_metric: "roas",
          baseline_value: 3.2,
          predicted_value: 3.8,
          actual_value: 2.9,
          variance_pct: -23.68,
          verified_at: "2026-03-10T00:00:00.000Z",
          created_at: "2026-03-10T00:00:00.000Z",
          ignored_field: true,
        },
        {
          run_id: "run-1",
          company_id: "acme",
          agent: "dev",
          outcome_metric: "ctr",
          baseline_value: 0.02,
          predicted_value: 0.03,
          actual_value: 0.018,
          variance_pct: -40,
          verified_at: "2026-03-09T00:00:00.000Z",
          created_at: "2026-03-09T00:00:00.000Z",
        },
        {
          run_id: "run-3",
          company_id: "acme",
          agent: "maya",
          outcome_metric: "leads",
          baseline_value: 20,
          predicted_value: 28,
          actual_value: 30,
          variance_pct: 7.14,
          verified_at: "2026-03-08T00:00:00.000Z",
          created_at: "2026-03-08T00:00:00.000Z",
        },
      ];
    },
  })(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.companyId, "acme");
  assert.equal(res.body.days, 90);
  assert.equal(res.body.rows.length, 3);
  assert.equal("ignored_field" in res.body.rows[0], false);
  assert.deepEqual(res.body.agents, [
    {
      agent: "dev",
      accuracy: 0.68,
      last_verified: "2026-03-10T00:00:00.000Z",
      variance_pct: -23.68,
    },
    {
      agent: "maya",
      accuracy: 0.93,
      last_verified: "2026-03-08T00:00:00.000Z",
      variance_pct: 7.14,
    },
  ]);
});

test("test-mode helper includes the latest calibration note and trigger metadata", async () => {
  await appendCalibrationNote({
    agent: "dev",
    companyId: "acme",
    metric: "roas",
    baselineValue: 3.2,
    predictedValue: 3.8,
    actualValue: 2.1,
    variancePct: -44.74,
    createdAt: "2026-03-10T00:00:00.000Z",
  }, { agentsDir });

  const { calibrationNote } = await backend.loadAgentPromptContext("dev", "acme", {
    agentsDir,
  });
  const contract = backend.buildTestModeContract({
    name: "dev",
    companyId: "acme",
    runId: "run-123",
    soulText: "You are dev.",
    query: "Diagnose the latest KPI movement.",
    calibrationNote,
    triggerContext: {
      triggered_by: "signal",
      trigger_id: "signal-123",
      hook_id: "traffic-drop-20pct-7d",
      task_type: "campaign_metric_diagnosis",
      trigger_metadata: {
        signal_type: "traffic_drop_20pct_7d",
        current_value: 80,
        baseline_value: 100,
      },
    },
  });

  assert.match(contract.artifact.data.calibration_note, /Calibration note for acme on roas/);
  assert.equal(contract.artifact.data.trigger_context.hook_id, "traffic-drop-20pct-7d");
  assert.equal(
    contract.artifact.data.trigger_context.trigger_metadata.signal_type,
    "traffic_drop_20pct_7d",
  );
});
