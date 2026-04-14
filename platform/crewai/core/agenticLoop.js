/**
 * AgenticLoop - Veena Orchestrator with Intent Routing
 *
 * Responsibilities:
 * 1. Extract user intent from message (using LLM + keyword matching)
 * 2. Check required connectors are available
 * 3. Route to appropriate agent/crew
 * 4. Handle responses and format for chat UI
 *
 * Response Types:
 * - clarification_needed: User input too vague, ask question
 * - connector_missing: Required integrations not connected, offer to connect
 * - ready: All checks passed, routing can proceed
 */

const ConnectorChecker = require('../routing/connector-checker');
const routingTable = require('../routing/routing_table.json');
const SequentialOrchestrator = require('../orchestration/sequential-orchestrator');
const ParallelOrchestrator = require('../orchestration/parallel-orchestrator');

class AgenticLoop {
  constructor(config = {}) {
    this.config = config;
    this.supabaseUrl = config.supabaseUrl || process.env.VITE_SUPABASE_URL;
    this.supabaseKey = config.supabaseKey || process.env.VITE_SUPABASE_ANON_KEY;
    this.llmClient = config.llmClient; // Groq/OpenAI client
    this.agents = new Map(); // Map of agent instances

    // Initialize connector checker
    if (this.supabaseUrl && this.supabaseKey) {
      this.connectorChecker = new ConnectorChecker(this.supabaseUrl, this.supabaseKey);
    }

    this.routingTable = routingTable;
    this.intentExtractorPrompt = config.intentExtractorPrompt || null;

    console.log('[AgenticLoop] Initialized with', Object.keys(this.routingTable.goals).length, 'goals');
  }

  /**
   * Register an agent with the loop
   * @param {string} agentId - Agent identifier (e.g., 'arjun', 'riya')
   * @param {Object} agent - Agent instance with execute() method
   */
  registerAgent(agentId, agent) {
    if (!agent || typeof agent.execute !== 'function') {
      throw new Error(`Agent must have execute() method. Got: ${typeof agent}`);
    }
    this.agents.set(agentId, agent);
    console.log(`[AgenticLoop] Registered agent: ${agentId}`);
  }

  /**
   * Get registered agent by ID
   * @param {string} agentId - Agent identifier
   * @returns {Object|null} Agent instance or null if not found
   */
  getAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`[AgenticLoop] Agent not found: ${agentId}`);
    }
    return agent;
  }

  /**
   * Extract user intent from message using LLM
   * @param {string} userMessage - User's natural language message
   * @returns {Promise<Object>} Intent analysis with goal_id, confidence, params
   */
  async extractIntent(userMessage) {
    if (!this.llmClient) {
      console.warn('[AgenticLoop] No LLM client configured, using keyword matching only');
      return this._extractIntentByKeywords(userMessage);
    }

    try {
      // Use LLM to extract intent (if configured)
      // For now, fall back to keyword matching
      return this._extractIntentByKeywords(userMessage);
    } catch (error) {
      console.error('[AgenticLoop] Error extracting intent:', error);
      // Gracefully fall back to keyword matching
      return this._extractIntentByKeywords(userMessage);
    }
  }

  /**
   * Extract intent using keyword matching (fallback method)
   * @param {string} userMessage - User's message
   * @returns {Object} Intent analysis
   */
  _extractIntentByKeywords(userMessage) {
    const messageLower = userMessage.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    // Score each goal based on keyword matches
    for (const [goalId, goalConfig] of Object.entries(this.routingTable.goals)) {
      let score = 0;

      // Check keywords
      if (goalConfig.keywords && Array.isArray(goalConfig.keywords)) {
        for (const keyword of goalConfig.keywords) {
          if (messageLower.includes(keyword.toLowerCase())) {
            score += 1.0; // Full point for keyword match
          }
        }
      }

      // Check description terms
      if (goalConfig.description) {
        const descWords = goalConfig.description.toLowerCase().split(' ');
        for (const word of descWords) {
          if (word.length > 3 && messageLower.includes(word)) {
            score += 0.1; // Smaller point for description match
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = goalId;
      }
    }

    // Convert score to confidence
    let confidence = 0;
    if (bestScore >= 2) {
      confidence = 0.95; // Multiple keywords matched
    } else if (bestScore >= 1) {
      confidence = 0.85; // One keyword matched
    } else if (bestScore > 0) {
      confidence = 0.65; // Partial match
    } else {
      confidence = 0.3; // No match, need clarification
    }

    // If confidence too low, ask clarification
    if (confidence < 0.5) {
      return {
        goal_id: null,
        confidence: confidence,
        extracted_params: {},
        clarification_needed: true,
        clarification_question: this._generateClarificationQuestion(),
        reasoning: 'User intent is unclear. Need clarification.'
      };
    }

    return {
      goal_id: bestMatch,
      confidence: Math.min(confidence, 0.99), // Cap at 0.99 for keyword matching
      extracted_params: this._extractParameters(userMessage, bestMatch),
      clarification_needed: false,
      clarification_question: null,
      reasoning: `Matched goal ${bestMatch} with keyword score ${bestScore.toFixed(2)}`
    };
  }

  /**
   * Extract parameters from user message for intake
   * @param {string} userMessage - User message
   * @param {string} goalId - The identified goal
   * @returns {Object} Extracted parameters
   */
  _extractParameters(userMessage, goalId) {
    const params = {};
    const goalConfig = this.routingTable.goals[goalId];

    if (!goalConfig || !goalConfig.intake_fields) {
      return params;
    }

    const messageLower = userMessage.toLowerCase();

    // Simple heuristic: look for numbers, dates, quoted strings
    const numbers = userMessage.match(/\d+/g) || [];
    const quoted = userMessage.match(/"([^"]+)"/g) || [];

    // Store anything that might be relevant
    if (numbers.length > 0) {
      params.numbers_mentioned = numbers.slice(0, 5); // First 5 numbers
    }

    if (quoted.length > 0) {
      params.quoted_values = quoted.slice(0, 3).map(q => q.replace(/"/g, ''));
    }

    // Check for specific patterns based on goal type
    if (goalId.includes('lead')) {
      // Look for size/industry patterns
      if (messageLower.includes('saas')) params.vertical = 'SaaS';
      if (messageLower.includes('india')) params.geography = 'India';
      if (messageLower.includes('founder') || messageLower.includes('ceo')) params.seniority = 'C-level';
    }

    if (goalId.includes('ads') || goalId.includes('optimize')) {
      // Look for platform mentions
      if (messageLower.includes('google')) params.platforms = params.platforms || [];
      if (!params.platforms) params.platforms = [];
      if (messageLower.includes('google')) params.platforms.push('google_ads');
      if (messageLower.includes('meta') || messageLower.includes('facebook')) params.platforms.push('meta_ads');
      if (messageLower.includes('linkedin')) params.platforms.push('linkedin_ads');

      // Look for timeframe
      if (messageLower.includes('30')) params.timeframe = '30 days';
      if (messageLower.includes('90')) params.timeframe = '90 days';
      if (messageLower.includes('week')) params.timeframe = 'last week';
      if (messageLower.includes('month')) params.timeframe = 'this month';
    }

    return params;
  }

  /**
   * Generate a clarification question for vague user input
   * @returns {string} Clarification question
   */
  _generateClarificationQuestion() {
    const questions = [
      'I can help with several things! Are you looking to: (1) find leads, (2) create content, (3) optimize ad spend, or (4) something else?',
      'Let me point you to the right specialist. What are you focused on? For example: lead generation, content creation, ad optimization, or customer insights?',
      'To help you best, could you tell me: are you trying to find prospects, create marketing assets, improve your ad performance, or analyze what\'s working?'
    ];
    return questions[Math.floor(Math.random() * questions.length)];
  }

  /**
   * Main routing function - route user intent to appropriate agent
   * @param {string} userMessage - User's message
   * @param {string} userId - Supabase user ID
   * @param {string} workspaceId - Workspace ID
   * @param {Object} context - Additional context (chat history, etc.)
   * @returns {Promise<Object>} Routing result with type, goal_id, agent, crew, etc.
   */
  async routeUserIntent(userMessageOrOpts, userId, workspaceId, context = {}) {
    // Support both positional args and a single options object
    let userMessage, connectors_available;
    if (userMessageOrOpts && typeof userMessageOrOpts === 'object' && !Array.isArray(userMessageOrOpts)) {
      userMessage = userMessageOrOpts.message ?? '';
      userId      = userMessageOrOpts.userId ?? userId;
      workspaceId = userMessageOrOpts.workspaceId ?? workspaceId;
      connectors_available = userMessageOrOpts.connectors_available;
      context     = userMessageOrOpts.context ?? context;
    } else {
      userMessage = userMessageOrOpts ?? '';
    }
    console.log('[AgenticLoop.routeUserIntent] Starting for message:', String(userMessage).substring(0, 60) + '...');

    // Step 1: Extract intent using LLM
    const intentAnalysis = await this.extractIntent(userMessage);

    console.log('[AgenticLoop] Intent analysis:', {
      goal_id: intentAnalysis.goal_id,
      confidence: intentAnalysis.confidence
    });

    // If confidence too low, ask for clarification
    if (intentAnalysis.clarification_needed || !intentAnalysis.goal_id) {
      return {
        type: 'clarification_needed',
        question: intentAnalysis.clarification_question,
        original_message: userMessage,
        intent_analysis: intentAnalysis
      };
    }

    // Step 2: Look up routing config
    const goalConfig = this.routingTable.goals[intentAnalysis.goal_id];
    if (!goalConfig) {
      return {
        type: 'error',
        error: `Unknown goal: ${intentAnalysis.goal_id}`,
        original_message: userMessage
      };
    }

    // Step 3: Check connectors
    let connectorCheck = null;
    const required = goalConfig.required_connectors || [];

    if (Array.isArray(connectors_available) && required.length > 0) {
      // Fast path: caller supplied connector list (used in tests + chat UI)
      const missing = required.filter((c) => !connectors_available.includes(c));
      connectorCheck = { canProceed: missing.length === 0, missing, connected: connectors_available };
    } else if (userId && workspaceId && this.connectorChecker) {
      connectorCheck = await this.connectorChecker.checkRequired(
        userId,
        workspaceId,
        required
      );
    }

    if (connectorCheck) {
      console.log('[AgenticLoop] Connector check:', {
        canProceed: connectorCheck.canProceed,
        missing: connectorCheck.missing
      });

      // If required connectors missing, prompt user
      if (!connectorCheck.canProceed) {
        const missingList = connectorCheck.missing;
        const prompt = this.connectorChecker
          ? this.connectorChecker.generateMissingConnectorPrompt(intentAnalysis.goal_id, missingList)
          : `To run this goal, please connect: ${missingList.join(', ')}.`;

        return {
          type: 'connector_missing',
          goal_id: intentAnalysis.goal_id,
          missing_connectors: missingList,
          missing: missingList,   // legacy alias
          message: prompt,
          prompt,
          original_message: userMessage,
          intent: intentAnalysis,
          routing: {
            goal_id: intentAnalysis.goal_id,
            agent: goalConfig.agent,
            crew: goalConfig.crew
          }
        };
      }
    }

    // Step 4: All checks passed, ready to route
    return {
      type: 'ready',
      goal_id: intentAnalysis.goal_id,
      agent: goalConfig.agent,
      crew: goalConfig.crew,
      confidence: intentAnalysis.confidence,
      extracted_params: intentAnalysis.extracted_params,
      connectors_available: connectorCheck ? connectorCheck.connected : [],
      original_message: userMessage,
      context,
      agent_chain: goalConfig.agent_chain || [goalConfig.agent],
      orchestration_pattern: goalConfig.orchestration_pattern || 'single'
    };
  }

  /**
   * Execute goal - main entry point
   * @param {string} userMessage - User's message
   * @param {string} userId - User ID
   * @param {string} workspaceId - Workspace ID
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Response for chat UI
   */
  async executeGoal(userMessage, userId, workspaceId, context = {}) {
    // Route first
    const routing = await this.routeUserIntent(
      userMessage,
      userId,
      workspaceId,
      context
    );

    // Handle special cases
    if (routing.type === 'clarification_needed') {
      return {
        type: 'chat_message',
        role: 'assistant',
        content: routing.question,
        intent_type: 'clarification',
        routing_info: null
      };
    }

    if (routing.type === 'connector_missing') {
      return {
        type: 'chat_message',
        role: 'assistant',
        content: routing.prompt.message,
        connector_prompt: routing.prompt,
        intent_type: 'connector_missing',
        routing_info: routing.routing
      };
    }

    if (routing.type === 'error') {
      return {
        type: 'chat_message',
        role: 'assistant',
        content: `Sorry, I couldn't understand that request. ${routing.error}`,
        intent_type: 'error',
        routing_info: null
      };
    }

    // Proceed with execution
    if (routing.type === 'ready') {
      return this._executeWithRouting(routing);
    }

    // Unexpected routing type
    return {
      type: 'chat_message',
      role: 'assistant',
      content: 'Something went wrong with routing. Please try again.',
      intent_type: 'error',
      routing_info: null
    };
  }

  /**
   * Execute agent after successful routing.
   * Detects multi-agent goals and delegates to the appropriate orchestrator.
   *
   * @param {Object} routing - Routing result from routeUserIntent
   * @param {Object} [options]
   * @param {Function} [options.onStep] - Callback for sequential step completion (streaming)
   * @returns {Promise<Object>} Agent response
   */
  async _executeWithRouting(routing, options = {}) {
    const { goal_id, crew, original_message, extracted_params, connectors_available } = routing;
    const goalConfig = this.routingTable.goals[goal_id] || {};

    // ── Multi-agent path ───────────────────────────────────────────────────
    if (goalConfig.agent_chain && Array.isArray(goalConfig.agent_chain) && goalConfig.agent_chain.length > 1) {
      return this._executeMultiAgent(routing, goalConfig, options);
    }

    // ── Single-agent path ──────────────────────────────────────────────────
    const agentId = routing.agent;
    const agent = this.getAgent(agentId);
    if (!agent) {
      return {
        type: 'chat_message',
        role: 'assistant',
        content: `Agent ${agentId} is not available. Please try another action.`,
        intent_type: 'error',
        routing_info: { goal_id, agent: agentId, crew },
      };
    }

    try {
      const result = await agent.execute({
        goal_id,
        message: original_message,
        extracted_params,
        available_connectors: connectors_available,
        context: routing.context,
      });

      if (!result.prose) {
        console.warn('[AgenticLoop] Agent returned no prose. Using default message.');
        result.prose = 'The agent processed your request but returned no response. Please try again.';
      }

      let intent_type = 'discovery';
      if (crew.includes('automation') || crew.includes('content')) intent_type = 'creation';
      if (crew.includes('optimization') || crew.includes('budget')) intent_type = 'optimization';
      if (crew.includes('performance') || crew.includes('scorecard') || crew.includes('analytics')) intent_type = 'analysis';
      if (result.response_type) intent_type = result.response_type;

      return {
        type: 'chat_message',
        role: 'assistant',
        content: result.prose,
        artifact: result.artifact,
        intent_type,
        routing_info: {
          goal_id,
          agent: agentId,
          crew,
          confidence: routing.confidence,
        },
        follow_ups: result.follow_ups || [],
        connectors_used: result.connectors_used || [],
        ...(result.connector_missing && { connector_prompt: {
          missing: Array.isArray(result.connector_missing) ? result.connector_missing : [result.connector_missing],
          message: result.prose,
        }}),
      };
    } catch (error) {
      console.error('[AgenticLoop] Agent execution error:', error);
      return {
        type: 'chat_message',
        role: 'assistant',
        content: `The agent encountered an error: ${error.message}. Please try again or ask for help.`,
        intent_type: 'error',
        routing_info: { goal_id, agent: agentId, crew },
      };
    }
  }

  /**
   * Execute a multi-agent goal using sequential or parallel orchestration.
   */
  async _executeMultiAgent(routing, goalConfig, options = {}) {
    const { goal_id, original_message, extracted_params, connectors_available } = routing;
    const { agent_chain, orchestration_pattern = 'sequential' } = goalConfig;

    console.log(`[AgenticLoop] Multi-agent execution: ${orchestration_pattern} for ${goal_id} → [${agent_chain.join(' → ')}]`);

    // Build agent registry from current agents Map
    const agentRegistry = Object.fromEntries(this.agents);

    // Build chain descriptors
    const chain = agent_chain.map((agentId) => ({
      agentId,
      goalId: goal_id,
      crew: goalConfig.crew || 'multi-agent',
      label: agentId,
    }));

    const baseRequest = {
      goal_id,
      message: original_message,
      extracted_params,
      available_connectors: connectors_available,
      context: routing.context,
    };

    try {
      let result;

      if (orchestration_pattern === 'parallel') {
        const orchestrator = new ParallelOrchestrator(agentRegistry);
        result = await orchestrator.run(chain, baseRequest, { onComplete: options.onStep });
      } else {
        const orchestrator = new SequentialOrchestrator(agentRegistry);
        result = await orchestrator.run(chain, baseRequest, { onStep: options.onStep });
      }

      return {
        type: 'chat_message',
        role: 'assistant',
        content: result.prose,
        artifact: result.artifact,
        intent_type: result.response_type || 'creation',
        routing_info: {
          goal_id,
          agent: `orchestrator:${orchestration_pattern}`,
          crew: goalConfig.crew || 'multi-agent',
          confidence: result.confidence,
          agents: agent_chain,
        },
        follow_ups: result.follow_ups || [],
        connectors_used: result.connectors_used || [],
        orchestration: {
          pattern: orchestration_pattern,
          agents: agent_chain,
          steps_completed: result.successful_steps,
          steps_total: result.total_steps,
        },
      };
    } catch (error) {
      console.error('[AgenticLoop] Multi-agent orchestration error:', error);
      return {
        type: 'chat_message',
        role: 'assistant',
        content: `The orchestrated workflow encountered an error: ${error.message}. Please try again.`,
        intent_type: 'error',
        routing_info: { goal_id, agent: 'orchestrator', crew: goalConfig.crew },
      };
    }
  }

  /**
   * Format agent response for chat UI
   * @param {Object} agentResponse - Response from agent.execute()
   * @param {string} goal_id - Goal ID
   * @param {string} agent - Agent name
   * @param {string} crew - Crew name
   * @returns {Object} Formatted response for chat
   */
  formatAgentResponse(agentResponse, goal_id, agent, crew) {
    return {
      type: 'chat_message',
      role: 'assistant',
      content: agentResponse.prose || '',
      artifact: agentResponse.artifact || null,
      intent_type: agentResponse.response_type || 'creation',
      routing_info: {
        goal_id,
        agent,
        crew,
        confidence: 0.95 // After execution
      },
      follow_ups: agentResponse.follow_ups || [],
      connectors_used: agentResponse.connectors_used || []
    };
  }
}

module.exports = AgenticLoop;
