import { randomUUID } from "node:crypto";

import { MKGService } from "../mkg-service.js";
import { scheduleSwarmRun } from "./run-scheduler.ts";
import { executeWatchdog } from "./swarm-watchdog-helper.ts";

function normalizeCompetitors(mkg = {}) {
  const competitors = mkg?.competitors?.value;
  return Array.isArray(competitors) ? competitors.slice(0, 10) : [];
}

export async function fanOutWatchdogs({
  runId,
  companyId,
  competitors,
  connectorResolver,
  analyzeItems,
  telemetryWriter,
  telemetrySupabase,
  now = new Date(),
}) {
  const watchdogs = competitors.map(async (competitor) => {
    const connector = connectorResolver(competitor);
    return executeWatchdog({
      runId,
      companyId,
      competitor,
      connectorType: connector.type,
      fetchItems: () => connector.fetch(competitor),
      analyzeItems: (items) => analyzeItems({ competitor, connectorType: connector.type, items }),
      telemetryWriter,
      telemetrySupabase,
      now,
    });
  });

  return Promise.all(watchdogs);
}

export async function runPriyaSwarm({
  companyId,
  runId = randomUUID(),
  mkgReader = MKGService.read.bind(MKGService),
  mkgWriter = MKGService.patch.bind(MKGService),
  connectorResolver,
  analyzeItems = async ({ items }) => ({
    status: "completed",
    itemsReviewed: items.length,
    tokensUsed: items.length * 10,
    metadata: { mode: "stub" },
  }),
  synthesis = async ({ watcherResults }) => ({
    summary: `Reviewed ${watcherResults.length} watchdogs`,
    completedWatchdogs: watcherResults.filter((result) => result.status !== "skipped_no_delta").length,
  }),
  telemetryWriter,
  telemetrySupabase,
  schedulerPersistJob,
  activeRuns = 0,
  maxConcurrency = 2,
  now = new Date(),
}) {
  const scheduled = await scheduleSwarmRun({
    activeRuns,
    maxConcurrency,
    now,
    persistJob: schedulerPersistJob,
  });

  if (!scheduled.accepted) {
    return {
      runId,
      companyId,
      scheduled,
      watcherResults: [],
      synthesis: null,
    };
  }

  const mkg = await mkgReader(companyId);
  const competitors = normalizeCompetitors(mkg);
  const watcherResults = await fanOutWatchdogs({
    runId,
    companyId,
    competitors,
    connectorResolver,
    analyzeItems,
    telemetryWriter,
    telemetrySupabase,
    now,
  });

  const synthesisResult = await synthesis({ companyId, runId, watcherResults, scheduled });

  const updatedCompetitors = competitors.map((competitor) => {
    const result = watcherResults.find((entry) => entry.competitorName === competitor.name);
    if (!result) return competitor;
    return {
      ...competitor,
      last_checked: result.lastChecked,
      watchdog_history: {
        ...(competitor.watchdog_history || {}),
        last_checked: result.lastChecked,
        last_status: result.status,
        last_run_id: runId,
      },
    };
  });

  if (updatedCompetitors.length > 0) {
    await mkgWriter(companyId, {
      competitors: {
        ...(mkg?.competitors || {}),
        value: updatedCompetitors,
        source_agent: "priya",
        last_verified: now.toISOString(),
      },
    });
  }

  return {
    runId,
    companyId,
    scheduled,
    watcherResults,
    synthesis: synthesisResult,
  };
}
