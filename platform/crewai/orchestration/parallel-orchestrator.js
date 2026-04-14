'use strict';

/**
 * Parallel Orchestrator
 *
 * Runs multiple agents simultaneously and merges their results.
 * Used for independent analyses that don't depend on each other, e.g.:
 *   "Full marketing audit" → Dev (budget) + Kiran (customer) + Priya (competitive) in parallel
 *
 * Usage:
 *   const orchestrator = new ParallelOrchestrator(agentRegistry);
 *   const result = await orchestrator.run(tasks, baseRequest);
 */

class ParallelOrchestrator {
  /**
   * @param {Object} agentRegistry - Map of agentId → agent instance with execute()
   */
  constructor(agentRegistry = {}) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * Execute multiple agents in parallel and merge results.
   *
   * @param {Array<{agentId: string, goalId: string, crew: string, label?: string}>} tasks
   * @param {Object} baseRequest - Shared base request for all agents
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=30000]   - Per-agent timeout
   * @param {number} [options.maxConcurrent=5]   - Max simultaneous agents
   * @param {Function} [options.onComplete]      - Callback when any agent completes
   * @returns {Promise<Object>} Merged orchestration result
   */
  async run(tasks, baseRequest, options = {}) {
    const { timeoutMs = 30_000, maxConcurrent = 5, onComplete } = options;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Parallel orchestrator requires a non-empty tasks array.');
    }

    // Resolve agents, skip missing ones early
    const resolvedTasks = tasks.map((task) => ({
      ...task,
      agent: this.agentRegistry[task.agentId] || null,
    }));

    const missing = resolvedTasks.filter((t) => !t.agent);
    const runnable = resolvedTasks.filter((t) => t.agent !== null);

    if (missing.length > 0) {
      console.warn(
        `[ParallelOrchestrator] Agents not found, skipping: ${missing.map((t) => t.agentId).join(', ')}`
      );
    }

    console.log(`[ParallelOrchestrator] Running ${runnable.length} agents in parallel (max ${maxConcurrent} concurrent)`);

    // Chunk into batches of maxConcurrent
    const batches = [];
    for (let i = 0; i < runnable.length; i += maxConcurrent) {
      batches.push(runnable.slice(i, i + maxConcurrent));
    }

    const allResults = [];

    for (const batch of batches) {
      const batchPromises = batch.map(async (task) => {
        try {
          const request = {
            ...baseRequest,
            goal_id: task.goalId,
            crew_id: task.crew,
          };

          const result = await this._executeWithTimeout(task.agent, request, timeoutMs);

          const taskResult = {
            agentId: task.agentId,
            goalId: task.goalId,
            label: task.label || task.agent.name || task.agentId,
            crew: task.crew,
            prose: result.prose,
            artifact: result.artifact,
            follow_ups: result.follow_ups,
            response_type: result.response_type,
            confidence: result.confidence,
            connectors_used: result.connectors_used || [],
            connector_missing: result.connector_missing,
            skipped: false,
          };

          if (onComplete) {
            try { onComplete(taskResult); } catch { /* ignore */ }
          }

          return taskResult;
        } catch (err) {
          console.error(`[ParallelOrchestrator] Agent "${task.agentId}" failed:`, err.message);
          return {
            agentId: task.agentId,
            goalId: task.goalId,
            label: task.label || task.agentId,
            skipped: true,
            reason: `Agent error: ${err.message}`,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults);
    }

    // Add skipped (missing agent) entries
    const skippedMissing = missing.map((t) => ({
      agentId: t.agentId,
      goalId: t.goalId,
      label: t.label || t.agentId,
      skipped: true,
      reason: `Agent "${t.agentId}" not registered`,
    }));

    return this._mergeResults(tasks, [...allResults, ...skippedMissing], baseRequest);
  }

  /**
   * Execute an agent with a timeout.
   */
  async _executeWithTimeout(agent, request, timeoutMs) {
    return Promise.race([
      agent.execute(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Agent timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Merge all parallel results into a single orchestration response.
   *
   * Strategy:
   * - Prose: section per agent (sorted by response quality)
   * - Artifacts: listed as sections
   * - Follow-ups: deduplicated union
   * - Metrics: merged into a single dashboard object
   */
  _mergeResults(tasks, results, baseRequest) {
    const successful = results.filter((r) => !r.skipped);
    const failed = results.filter((r) => r.skipped);

    // Sort by confidence descending so highest-quality responses come first
    const sorted = [...successful].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Build combined prose — one section per agent
    const combinedProse = sorted.length > 0
      ? sorted.map((r) => `**${r.label}:**\n${r.prose}`).join('\n\n')
      : 'The parallel workflow completed, but all agents were skipped or failed.';

    // Collect all follow-ups, deduplicated
    const allFollowUps = [...new Set(
      sorted.flatMap((r) => r.follow_ups || [])
    )].slice(0, 6);

    // Collect all artifacts
    const artifacts = sorted
      .filter((r) => r.artifact)
      .map((r) => ({ agent: r.agentId, label: r.label, artifact: r.artifact }));

    // Connectors used
    const connectorsUsed = [...new Set(
      sorted.flatMap((r) => r.connectors_used || [])
    )];

    // Missing connectors
    const connectorsMissing = [
      ...new Set(
        results
          .filter((r) => r.connector_missing)
          .flatMap((r) =>
            Array.isArray(r.connector_missing) ? r.connector_missing : [r.connector_missing]
          )
      ),
    ];

    // Aggregate confidence
    const avgConfidence = sorted.length > 0
      ? sorted.reduce((s, r) => s + (r.confidence || 0.75), 0) / sorted.length
      : 0;

    // Merge scalar metrics from all analysis artifacts
    const mergedMetrics = {};
    sorted
      .filter((r) => r.artifact?.metrics && typeof r.artifact.metrics === 'object')
      .forEach((r) => {
        Object.entries(r.artifact.metrics).forEach(([k, v]) => {
          if (typeof v === 'string' || typeof v === 'number') {
            mergedMetrics[`${r.agentId}_${k}`] = v;
          }
        });
      });

    return {
      type: 'orchestrated_parallel',
      prose: combinedProse,
      response_type: 'analysis', // Parallel runs are typically multi-dimensional analysis
      agent: 'orchestrator',
      crew: 'multi-agent',
      confidence: Math.round(avgConfidence * 100) / 100,
      connectors_used: connectorsUsed,
      connector_missing: connectorsMissing.length > 0 ? connectorsMissing : undefined,
      steps: results,
      successful_steps: successful.length,
      total_steps: tasks.length,
      failed_steps: failed.length,
      artifact: {
        type: 'analysis',
        metrics: mergedMetrics,
        findings: sorted.map((r) => `${r.label}: ${r.prose?.slice(0, 120) || 'No summary'}`),
        insights: sorted.flatMap((r) => {
          if (!r.artifact) return [];
          const art = r.artifact;
          const insights = art.insights;
          return Array.isArray(insights) ? insights.slice(0, 1).map((i) => `[${r.label}] ${i}`) : [];
        }),
        step_artifacts: artifacts,
        summary: {
          steps_total: tasks.length,
          steps_completed: successful.length,
          steps_failed: failed.length,
          agents: sorted.map((r) => r.label),
          connectors_used: connectorsUsed,
        },
      },
      follow_ups: allFollowUps,
    };
  }
}

module.exports = ParallelOrchestrator;
