'use strict';

/**
 * Sequential Orchestrator
 *
 * Chains agents in order, passing each agent's output as context
 * for the next agent. Used for complex multi-step goals like:
 *   "Plan a launch" → Neel (strategy) → Zara (social) → Riya (content)
 *
 * Usage:
 *   const orchestrator = new SequentialOrchestrator(agentRegistry);
 *   const result = await orchestrator.run(chain, baseRequest);
 */

class SequentialOrchestrator {
  /**
   * @param {Object} agentRegistry - Map of agentId → agent instance with execute()
   */
  constructor(agentRegistry = {}) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * Execute a chain of agents sequentially.
   *
   * @param {Array<{agentId: string, goalId: string, crew: string, label?: string}>} chain
   * @param {Object} baseRequest - Base request object shared by all agents
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=30000]  - Per-agent timeout
   * @param {Function} [options.onStep]         - Callback(stepResult, stepIndex) for streaming
   * @returns {Promise<Object>} Merged orchestration result
   */
  async run(chain, baseRequest, options = {}) {
    const { timeoutMs = 30_000, onStep } = options;

    if (!Array.isArray(chain) || chain.length === 0) {
      throw new Error('Sequential orchestrator requires a non-empty chain array.');
    }

    const stepResults = [];
    let accumulatedContext = { ...baseRequest };

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      const agent = this.agentRegistry[step.agentId];

      if (!agent) {
        console.warn(`[SequentialOrchestrator] Agent "${step.agentId}" not found. Skipping step ${i + 1}.`);
        stepResults.push({
          agentId: step.agentId,
          goalId: step.goalId,
          label: step.label || step.agentId,
          skipped: true,
          reason: `Agent "${step.agentId}" not registered`,
        });
        continue;
      }

      console.log(`[SequentialOrchestrator] Step ${i + 1}/${chain.length}: ${step.agentId} (${step.goalId})`);

      try {
        const request = this._buildStepRequest(step, accumulatedContext, stepResults);
        const result = await this._executeWithTimeout(agent, request, timeoutMs);

        const stepResult = {
          agentId: step.agentId,
          goalId: step.goalId,
          label: step.label || agent.name || step.agentId,
          crew: step.crew,
          prose: result.prose,
          artifact: result.artifact,
          follow_ups: result.follow_ups,
          response_type: result.response_type,
          confidence: result.confidence,
          connectors_used: result.connectors_used || [],
          connector_missing: result.connector_missing,
          skipped: false,
        };

        stepResults.push(stepResult);

        // Notify caller of each step completion (enables streaming to chat)
        if (onStep) {
          try { onStep(stepResult, i); } catch { /* ignore callback errors */ }
        }

        // Accumulate context for next step: add this step's key findings
        accumulatedContext = this._mergeContext(accumulatedContext, result, step);

      } catch (err) {
        console.error(`[SequentialOrchestrator] Step ${i + 1} failed:`, err.message);
        const failedStep = {
          agentId: step.agentId,
          goalId: step.goalId,
          label: step.label || step.agentId,
          skipped: true,
          reason: `Agent error: ${err.message}`,
        };
        stepResults.push(failedStep);
        if (onStep) {
          try { onStep(failedStep, i); } catch { /* ignore */ }
        }
        // Continue chain even on error — partial results are still valuable
      }
    }

    return this._mergeResults(chain, stepResults, baseRequest);
  }

  /**
   * Build a request for this step, injecting context from prior steps.
   */
  _buildStepRequest(step, baseRequest, priorResults) {
    const successfulPrior = priorResults.filter((r) => !r.skipped);
    const priorContext = successfulPrior.map((r) => ({
      agent: r.label,
      key_output: r.prose?.slice(0, 400) || '',
      artifact_type: r.artifact?.type,
    }));

    return {
      ...baseRequest,
      goal_id: step.goalId,
      crew_id: step.crew,
      context: {
        ...(baseRequest.context || {}),
        prior_agents: priorContext,
        orchestration_step: `${priorResults.length + 1}/${priorResults.length + 1 /* approximate */}`,
      },
    };
  }

  /**
   * Merge agent output into the accumulated context for the next step.
   */
  _mergeContext(existing, result, step) {
    return {
      ...existing,
      context: {
        ...(existing.context || {}),
        [`${step.agentId}_output`]: {
          prose: result.prose?.slice(0, 500),
          artifact_type: result.artifact?.type,
          key_metrics: result.artifact?.metrics,
        },
      },
    };
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
   * Merge all step results into a single orchestration response.
   */
  _mergeResults(chain, stepResults, baseRequest) {
    const successful = stepResults.filter((r) => !r.skipped);
    const failed = stepResults.filter((r) => r.skipped);

    // Build combined prose
    const combinedProse = successful.length > 0
      ? successful.map((r, i) => `**${r.label}:**\n${r.prose}`).join('\n\n')
      : 'The orchestrated workflow completed but all agents were skipped or failed.';

    // Collect all follow-ups, deduplicated
    const allFollowUps = [...new Set(
      successful.flatMap((r) => r.follow_ups || [])
    )].slice(0, 6);

    // Collect all artifacts
    const artifacts = successful
      .filter((r) => r.artifact)
      .map((r) => ({ agent: r.agentId, label: r.label, artifact: r.artifact }));

    // Collect connectors used
    const connectorsUsed = [...new Set(
      successful.flatMap((r) => r.connectors_used || [])
    )];

    // Aggregate confidence
    const avgConfidence = successful.length > 0
      ? successful.reduce((s, r) => s + (r.confidence || 0.75), 0) / successful.length
      : 0;

    return {
      type: 'orchestrated_sequence',
      prose: combinedProse,
      response_type: 'creation', // Default; caller can override
      agent: 'orchestrator',
      crew: 'multi-agent',
      confidence: Math.round(avgConfidence * 100) / 100,
      connectors_used: connectorsUsed,
      steps: stepResults,
      successful_steps: successful.length,
      total_steps: chain.length,
      failed_steps: failed.length,
      artifact: {
        type: 'orchestration',
        step_artifacts: artifacts,
        summary: {
          steps_total: chain.length,
          steps_completed: successful.length,
          steps_failed: failed.length,
          agents: successful.map((r) => r.label),
          connectors_used: connectorsUsed,
        },
      },
      follow_ups: allFollowUps,
    };
  }
}

module.exports = SequentialOrchestrator;
