import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendCalibrationNote,
  getLatestCalibrationNote,
} from "./calibration-writer.js";

test("appendCalibrationNote writes a readable note and getLatestCalibrationNote reads it back", async () => {
  const agentsDir = await mkdtemp(join(tmpdir(), "torqq-calibration-"));

  const result = await appendCalibrationNote({
    agent: "dev",
    companyId: "acme",
    metric: "roas",
    baselineValue: 3.2,
    predictedValue: 3.8,
    actualValue: 2.1,
    variancePct: -44.74,
    createdAt: "2026-03-10T00:00:00.000Z",
  }, { agentsDir });

  assert.equal(result.appended, true);
  assert.match(result.note.guidance, /Lower roas predictions/i);

  const latest = await getLatestCalibrationNote("dev", "acme", { agentsDir });
  assert.equal(latest?.metric, "roas");
  assert.equal(latest?.variancePct, -44.74);
  assert.match(latest?.text || "", /Calibration note for acme on roas/i);

  const memory = await readFile(join(agentsDir, "dev", "memory", "MEMORY.md"), "utf8");
  assert.match(memory, /## Calibration Note/);
  assert.match(memory, /Guidance:/);
});

test("appendCalibrationNote dedupes repeated company metric variance combinations", async () => {
  const agentsDir = await mkdtemp(join(tmpdir(), "torqq-calibration-"));

  const first = await appendCalibrationNote({
    agent: "maya",
    companyId: "acme",
    metric: "ctr",
    baselineValue: 0.02,
    predictedValue: 0.025,
    actualValue: 0.018,
    variancePct: -28,
    createdAt: "2026-03-10T00:00:00.000Z",
  }, { agentsDir });
  const second = await appendCalibrationNote({
    agent: "maya",
    companyId: "acme",
    metric: "ctr",
    baselineValue: 0.02,
    predictedValue: 0.025,
    actualValue: 0.018,
    variancePct: -28,
    createdAt: "2026-03-11T00:00:00.000Z",
  }, { agentsDir });

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(second.deduped, true);

  const memory = await readFile(join(agentsDir, "maya", "memory", "MEMORY.md"), "utf8");
  assert.equal((memory.match(/CALIBRATION_NOTE/g) || []).length, 1);
});
