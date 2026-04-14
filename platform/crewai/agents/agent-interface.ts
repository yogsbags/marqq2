/**
 * Agent Interface & Contracts
 *
 * All agents must implement this interface and return responses
 * that match the expected schema for their crew's response type
 */

import type {
  AgentResponse,
  AnalysisResponse,
  CreationResponse,
  OptimizationResponse,
  ExecutionResponse,
  DiscoveryResponse,
  ResponseType
} from '../response/response-schema';

// ── Agent Interface ────────────────────────────────────────────────────────

/**
 * Base interface all agents must implement
 */
export interface Agent {
  /**
   * Agent unique identifier (e.g., 'arjun', 'riya', 'dev')
   */
  id: string;

  /**
   * Agent name (e.g., 'Arjun', 'Riya', 'Dev')
   */
  name: string;

  /**
   * Agent role/specialty
   */
  role: string;

  /**
   * List of crew IDs this agent is part of
   */
  crews: string[];

  /**
   * Execute a goal and return response
   */
  execute(request: AgentExecutionRequest): Promise<AgentResponse>;
}

// ── Execution Request ──────────────────────────────────────────────────────

/**
 * What an agent receives when asked to execute
 */
export interface AgentExecutionRequest {
  // Goal identification
  goal_id: string;
  crew_id: string;

  // User input
  message: string; // Original user message
  extracted_params?: Record<string, unknown>; // Parameters from intent extraction

  // Execution context
  available_connectors: string[]; // Connectors user has connected
  context?: {
    chatHistory?: any[];
    mkg?: Record<string, unknown>; // Company context
    workspace?: string;
    userId?: string;
  };

  // Options
  options?: {
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
  };
}

// ── Agent Factory ──────────────────────────────────────────────────────────

/**
 * Registry of all agents
 */
export const AGENT_REGISTRY: Record<string, Agent> = {};

/**
 * Register an agent
 */
export function registerAgent(agent: Agent) {
  AGENT_REGISTRY[agent.id] = agent;
  console.log(`[AgentRegistry] Registered agent: ${agent.name} (${agent.id})`);
}

/**
 * Get agent by ID
 */
export function getAgent(agentId: string): Agent | null {
  return AGENT_REGISTRY[agentId] || null;
}

/**
 * Get all agents
 */
export function getAllAgents(): Agent[] {
  return Object.values(AGENT_REGISTRY);
}

// ── Stub Agents (for testing) ──────────────────────────────────────────────

/**
 * Stub agent that can be used for testing
 * Returns mock responses matching the expected response type
 */
export class StubAgent implements Agent {
  id: string;
  name: string;
  role: string;
  crews: string[];
  responseType: ResponseType;

  constructor(agentId: string, agentName: string, crews: string[], responseType: ResponseType) {
    this.id = agentId;
    this.name = agentName;
    this.role = `${agentName} Agent`;
    this.crews = crews;
    this.responseType = responseType;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentResponse> {
    console.log(`[${this.name}] Executing ${request.goal_id}...`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    switch (this.responseType) {
      case 'analysis':
        return this._mockAnalysisResponse(request);
      case 'creation':
        return this._mockCreationResponse(request);
      case 'optimization':
        return this._mockOptimizationResponse(request);
      case 'execution':
        return this._mockExecutionResponse(request);
      case 'discovery':
        return this._mockDiscoveryResponse(request);
      default:
        throw new Error(`Unknown response type: ${this.responseType}`);
    }
  }

  private _mockAnalysisResponse(request: AgentExecutionRequest): AnalysisResponse {
    return {
      prose: `Analysis complete for ${request.goal_id}. Key findings: ${request.message.slice(0, 50)}...`,
      response_type: 'analysis',
      artifact: {
        type: 'analysis',
        metrics: {
          metric1: 100,
          metric2: 250,
          metric3: '45%'
        },
        findings: [
          'Finding 1 based on data analysis',
          'Finding 2 with key insight',
          'Finding 3 indicating trend'
        ],
        insights: [
          'Actionable insight for immediate impact',
          'Strategic insight for long-term planning'
        ]
      },
      agent: this.name,
      follow_ups: [
        'Get more details on finding 1',
        'Explore what-if scenario'
      ]
    };
  }

  private _mockCreationResponse(request: AgentExecutionRequest): CreationResponse {
    return {
      prose: `Content created for ${request.goal_id}. Ready to review and publish.`,
      response_type: 'creation',
      artifact: {
        type: 'content',
        title: `Generated Content for ${request.goal_id}`,
        sections: [
          {
            title: 'Introduction',
            content: 'This is a mock introduction section demonstrating the content structure.'
          },
          {
            title: 'Main Body',
            content: 'This is the main body with detailed information and insights.'
          },
          {
            title: 'Conclusion',
            content: 'Summary and call to action.'
          }
        ],
        wordCount: 450,
        format: 'markdown'
      },
      agent: this.name,
      follow_ups: [
        'Generate alternative version',
        'Adjust tone or length',
        'Publish now'
      ]
    };
  }

  private _mockOptimizationResponse(request: AgentExecutionRequest): OptimizationResponse {
    return {
      prose: `Optimization analysis for ${request.goal_id}. Current performance is below potential. Recommended changes will improve results by ~25%.`,
      response_type: 'optimization',
      artifact: {
        type: 'optimization_plan',
        current_state: {
          description: 'Current state analysis shows room for improvement',
          metrics: {
            'Current ROAS': '2.5:1',
            'Current CAC': '$45',
            'Conversion Rate': '2.1%'
          }
        },
        recommendation: {
          description: 'Reallocate budget from underperforming channels to high-performers',
          changes: [
            { field: 'Google Ads Budget', current: '$5,000', recommended: '$7,500' },
            { field: 'Meta Ads Budget', current: '$5,000', recommended: '$2,500' },
            { field: 'LinkedIn Ads Budget', current: '$3,000', recommended: '$3,000' }
          ]
        },
        expected_impact: {
          description: 'Expected 25% improvement in overall ROAS from budget reallocation',
          metrics: {
            'New ROAS': '3.1:1',
            'New CAC': '$35',
            'Estimated Monthly Gain': '+$1,200'
          },
          improvement: 25,
          confidence: 0.85
        }
      },
      agent: this.name,
      follow_ups: [
        'Apply this recommendation',
        'See conservative scenario',
        'Generate new Meta Ads copy'
      ]
    };
  }

  private _mockExecutionResponse(request: AgentExecutionRequest): ExecutionResponse {
    return {
      prose: `Campaign ${request.goal_id} is now live! Monitoring real-time metrics...`,
      response_type: 'execution',
      artifact: {
        type: 'execution_tracker',
        campaign_id: `camp_${Date.now()}`,
        campaign_name: `Campaign for ${request.goal_id}`,
        status: 'running',
        metrics: {
          created: 500,
          sent: 485,
          delivered: 480,
          opened: 145,
          clicked: 32,
          converted: 8
        },
        startedAt: new Date().toISOString(),
        controls: [
          { action: 'pause', label: 'Pause Campaign' },
          { action: 'adjust', label: 'Adjust Budget' },
          { action: 'stop', label: 'Stop Campaign' }
        ]
      },
      agent: this.name,
      follow_ups: [
        'Pause campaign',
        'View detailed analytics',
        'Adjust targeting'
      ]
    };
  }

  private _mockDiscoveryResponse(request: AgentExecutionRequest): DiscoveryResponse {
    return {
      prose: `Found 47 results matching your criteria for ${request.goal_id}. Top results show strong ICP fit.`,
      response_type: 'discovery',
      artifact: {
        type: 'discovery_results',
        count: 47,
        results: [
          {
            id: '1',
            name: 'TechCorp Inc',
            revenue: '$50M+',
            employees: 500,
            icp_fit: 0.95
          },
          {
            id: '2',
            name: 'StartupXYZ',
            revenue: '$5-10M',
            employees: 50,
            icp_fit: 0.91
          },
          {
            id: '3',
            name: 'Enterprise Solutions',
            revenue: '$100M+',
            employees: 1000,
            icp_fit: 0.88
          }
        ],
        downloadUrl: 'https://example.com/results.csv',
        downloadFormat: 'csv'
      },
      agent: this.name,
      follow_ups: [
        'Download all results',
        'Enrich with contact info',
        'Start outreach sequence'
      ]
    };
  }
}

// ── Agent Response Validator ───────────────────────────────────────────────

/**
 * Validate agent response structure
 */
export function validateAgentResponse(
  response: unknown,
  expectedType: ResponseType
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response must be an object'] };
  }

  const resp = response as Record<string, unknown>;

  // Check required fields
  if (typeof resp.prose !== 'string' || !resp.prose.trim()) {
    errors.push('Missing or empty prose field');
  }

  if (resp.response_type !== expectedType) {
    errors.push(`Expected response_type "${expectedType}", got "${resp.response_type}"`);
  }

  if (!resp.artifact || typeof resp.artifact !== 'object') {
    errors.push('Missing artifact');
  }

  // Type-specific validation
  const artifact = resp.artifact as Record<string, unknown>;

  switch (expectedType) {
    case 'analysis':
      if (artifact.type !== 'analysis') errors.push('Analysis artifact must have type="analysis"');
      if (!Array.isArray(artifact.metrics) && typeof artifact.metrics !== 'object') {
        errors.push('Analysis artifact must have metrics');
      }
      break;

    case 'creation':
      if (artifact.type !== 'content') errors.push('Creation artifact must have type="content"');
      if (!artifact.title && !artifact.content) {
        errors.push('Creation artifact must have title or content');
      }
      break;

    case 'optimization':
      if (artifact.type !== 'optimization_plan') {
        errors.push('Optimization artifact must have type="optimization_plan"');
      }
      if (!artifact.recommendation) errors.push('Optimization artifact must have recommendation');
      break;

    case 'execution':
      if (artifact.type !== 'execution_tracker') {
        errors.push('Execution artifact must have type="execution_tracker"');
      }
      if (!artifact.campaign_id) errors.push('Execution artifact must have campaign_id');
      break;

    case 'discovery':
      if (artifact.type !== 'discovery_results') {
        errors.push('Discovery artifact must have type="discovery_results"');
      }
      if (!Array.isArray(artifact.results)) errors.push('Discovery artifact must have results array');
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ── Built-in Stub Agents (for development/testing) ────────────────────────

/**
 * Create and register stub agents for all main agent types
 * Useful for testing without full agent implementation
 */
export function createStubAgents() {
  const stubConfigs = [
    // Analysis agents
    { id: 'dev', name: 'Dev', crews: ['performance-scorecard', 'unified-customer-view'], type: 'analysis' as ResponseType },
    { id: 'dev-scorecard', name: 'Dev Scorecard', crews: ['analytics'], type: 'analysis' as ResponseType },
    { id: 'churn-agent', name: 'Churn Agent', crews: ['churn-prevention'], type: 'analysis' as ResponseType },
    { id: 'priya', name: 'Priya', crews: ['competitor-intelligence'], type: 'analysis' as ResponseType },
    { id: 'kiran', name: 'Kiran', crews: ['customer-view'], type: 'analysis' as ResponseType },

    // Creation agents
    { id: 'riya', name: 'Riya', crews: ['content-automation'], type: 'creation' as ResponseType },
    { id: 'sam', name: 'Sam', crews: ['email-automation', 'messaging'], type: 'creation' as ResponseType },
    { id: 'zara', name: 'Zara', crews: ['social-campaign'], type: 'creation' as ResponseType },
    { id: 'lp-designer', name: 'LP Designer', crews: ['landing-pages'], type: 'creation' as ResponseType },
    { id: 'se-agent', name: 'Sales Enablement', crews: ['sales-enablement'], type: 'creation' as ResponseType },
    { id: 'neel', name: 'Neel', crews: ['strategy'], type: 'creation' as ResponseType },
    { id: 'maya', name: 'Maya', crews: ['content-automation'], type: 'creation' as ResponseType },

    // Optimization agents
    { id: 'cro-agent', name: 'CRO Agent', crews: ['cro'], type: 'optimization' as ResponseType },
    { id: 'dev-budget', name: 'Dev Budget', crews: ['paid-ads-optimization'], type: 'optimization' as ResponseType },
    { id: 'tara', name: 'Tara', crews: ['offer-design'], type: 'optimization' as ResponseType },

    // Execution agents
    { id: 'paid-ads-agent', name: 'Paid Ads Agent', crews: ['paid-ads'], type: 'execution' as ResponseType },

    // Discovery agents
    { id: 'arjun', name: 'Arjun', crews: ['lead-intelligence'], type: 'discovery' as ResponseType },
    { id: 'isha', name: 'Isha', crews: ['market-research', 'competitor-intelligence'], type: 'discovery' as ResponseType },
  ];

  stubConfigs.forEach(config => {
    const agent = new StubAgent(config.id, config.name, config.crews, config.type);
    registerAgent(agent);
  });

  console.log('[AgentRegistry] Registered', stubConfigs.length, 'stub agents for testing');
}

// Auto-register stub agents on import
if (typeof window === 'undefined') {
  // Only in Node/SSR environment
  try {
    createStubAgents();
  } catch (e) {
    // Silently fail if already registered
  }
}
