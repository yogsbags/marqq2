export function buildJobWindow(now = new Date(), cadenceHours = 24) {
  const end = new Date(now);
  const start = new Date(end.getTime() - cadenceHours * 60 * 60 * 1000);

  return {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
  };
}

export async function scheduleSwarmRun({
  activeRuns = 0,
  maxConcurrency = 2,
  cadenceHours = 24,
  now = new Date(),
  persistJob = async (job) => job,
}) {
  if (activeRuns >= maxConcurrency) {
    return {
      accepted: false,
      reason: "max_concurrency_reached",
      maxConcurrency,
      activeRuns,
      jobWindow: buildJobWindow(now, cadenceHours),
      next_run_at: new Date(now.getTime() + cadenceHours * 60 * 60 * 1000).toISOString(),
    };
  }

  const jobWindow = buildJobWindow(now, cadenceHours);
  const scheduled = {
    accepted: true,
    activeRuns,
    maxConcurrency,
    jobWindow,
    next_run_at: new Date(now.getTime() + cadenceHours * 60 * 60 * 1000).toISOString(),
  };

  const persisted = await persistJob(scheduled);
  return {
    ...scheduled,
    persisted,
  };
}
