import test from "node:test";
import assert from "node:assert/strict";

import { emitCompetitorSignal } from "../hooks/priya-hook-responder.ts";
import {
  buildPriyaWatchdogs,
  competitorWatchdogs,
  createWatchdogConnectorFetch,
  resolvePreferredConnectors,
  updateCompetitorLastChecked,
} from "./priya-swarm-config.ts";

test("competitorWatchdogs exports exactly 10 watchdog definitions", () => {
  assert.equal(competitorWatchdogs.length, 10);
  assert.ok(competitorWatchdogs.every((watchdog) => Array.isArray(watchdog.connectors) && watchdog.connectors.length > 0));
});

test("buildPriyaWatchdogs overlays MKG metadata while preserving connector defaults", () => {
  const mkg = {
    competitors: {
      value: [
        { name: "HubSpot", preferred_connectors: ["youtube"], last_checked: "2026-03-10T00:00:00.000Z" },
      ],
    },
  };

  const watchdogs = buildPriyaWatchdogs(mkg);
  assert.equal(watchdogs.length, 10);
  assert.equal(watchdogs[0].competitor.name, "HubSpot");
  assert.deepEqual(resolvePreferredConnectors(watchdogs[0].competitor), ["youtube"]);
  assert.deepEqual(resolvePreferredConnectors(watchdogs[1].competitor), ["rss", "youtube"]);
});

test("updateCompetitorLastChecked writes last_checked back through MKG writer", async () => {
  const writes = [];
  await updateCompetitorLastChecked({
    companyId: "acme",
    competitorName: "HubSpot",
    lastChecked: "2026-03-10T06:00:00.000Z",
    mkgReader: async () => ({
      competitors: {
        value: [{ name: "HubSpot", last_checked: null }],
      },
    }),
    mkgWriter: async (_companyId, patch) => {
      writes.push(patch);
      return patch;
    },
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].competitors.value[0].last_checked, "2026-03-10T06:00:00.000Z");
});

test("createWatchdogConnectorFetch respects since filtering for stub connectors", async () => {
  const items = await createWatchdogConnectorFetch({
    companyId: "acme",
    competitor: {
      name: "HubSpot",
      last_checked: "2026-03-10T00:00:00.000Z",
      fixtures: {
        rss: [
          { id: "old", published_at: "2026-03-09T23:00:00.000Z" },
          { id: "new", published_at: "2026-03-10T01:00:00.000Z" },
        ],
      },
    },
    connectorType: "rss",
  });

  assert.deepEqual(items.map((item) => item.id), ["new"]);
});

test("emitCompetitorSignal returns structured hook payload metadata", async () => {
  const emitted = [];
  const signal = await emitCompetitorSignal(
    {
      companyId: "acme",
      competitorName: "HubSpot",
      signalType: "competitor_move",
      sourceRunId: "run-1",
      payload: { headline: "New launch" },
    },
    {
      writer: async (entry) => {
        emitted.push(entry);
        return entry;
      },
    },
  );

  assert.equal(emitted.length, 1);
  assert.equal(signal.signal_type, "competitor_move");
  assert.equal(signal.payload.competitor_name, "HubSpot");
  assert.equal(signal.payload.source_run_id, "run-1");
});
