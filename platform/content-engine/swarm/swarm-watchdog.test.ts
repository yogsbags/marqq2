import test from "node:test";
import assert from "node:assert/strict";

import { buildWatchdogDelta } from "./swarm-watchdog-helper.ts";
import { runPriyaSwarm } from "./swarm-runner.ts";
import { scheduleSwarmRun } from "./run-scheduler.ts";

test("buildWatchdogDelta filters items older than last_checked", () => {
  const delta = buildWatchdogDelta({
    competitor: { last_checked: "2026-03-10T00:00:00.000Z" },
    items: [
      { id: "old", published_at: "2026-03-09T23:00:00.000Z" },
      { id: "new", published_at: "2026-03-10T05:00:00.000Z" },
    ],
    now: new Date("2026-03-10T06:00:00.000Z"),
  });

  assert.equal(delta.hasDelta, true);
  assert.deepEqual(delta.items.map((item) => item.id), ["new"]);
});

test("scheduleSwarmRun enforces max concurrency and exposes jobWindow metadata", async () => {
  const result = await scheduleSwarmRun({
    activeRuns: 2,
    maxConcurrency: 2,
    now: new Date("2026-03-10T06:00:00.000Z"),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "max_concurrency_reached");
  assert.equal(result.jobWindow.endedAt, "2026-03-10T06:00:00.000Z");
});

test("runPriyaSwarm fans out watchdogs concurrently, skips no-delta work, and waits for synthesis", async () => {
  const telemetry = [];
  const updatedMkgPatches = [];
  const timeline = [];

  const competitors = Array.from({ length: 10 }, (_, index) => ({
    name: `Competitor ${index + 1}`,
    last_checked: "2026-03-10T00:00:00.000Z",
  }));

  const result = await runPriyaSwarm({
    companyId: "acme",
    runId: "run-1",
    mkgReader: async () => ({
      competitors: {
        value: competitors,
      },
    }),
    mkgWriter: async (_companyId, patch) => {
      updatedMkgPatches.push(patch);
      return patch;
    },
    connectorResolver: (competitor) => ({
      type: "rss",
      async fetch() {
        timeline.push(`start:${competitor.name}`);
        await new Promise((resolve) => setTimeout(resolve, competitor.name.endsWith("1") ? 20 : 5));
        timeline.push(`end:${competitor.name}`);
        if (competitor.name.endsWith("10")) {
          return [{ id: "stale", published_at: "2026-03-09T00:00:00.000Z" }];
        }
        return [{ id: competitor.name, published_at: "2026-03-10T05:00:00.000Z" }];
      },
    }),
    analyzeItems: async ({ competitor, items }) => ({
      status: "completed",
      tokensUsed: items.length * 11,
      metadata: { competitor: competitor.name },
    }),
    synthesis: async ({ watcherResults }) => {
      timeline.push("synthesis");
      return { completed: watcherResults.length };
    },
    telemetryWriter: async (entry) => {
      telemetry.push(entry);
      return entry;
    },
    now: new Date("2026-03-10T06:00:00.000Z"),
  });

  assert.equal(result.watcherResults.length, 10);
  assert.ok(timeline.indexOf("start:Competitor 2") < timeline.indexOf("end:Competitor 1"));
  assert.equal(timeline.at(-1), "synthesis");
  assert.equal(
    result.watcherResults.filter((entry) => entry.status === "skipped_no_delta").length,
    1,
  );
  assert.equal(telemetry.length, 10);
  assert.ok(telemetry.every((entry) => "delta_start" in entry && "delta_end" in entry && "status" in entry));
  assert.equal(updatedMkgPatches.length, 1);
  assert.equal(updatedMkgPatches[0].competitors.value.length, 10);
});
