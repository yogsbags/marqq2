/**
 * Response Schema Definitions
 *
 * Defines the contract for all agent responses
 * Each response type maps to an intent type and has specific required fields
 */

// ── Base Response Type ─────────────────────────────────────────────────────

export interface AgentResponse {
  // Required by all responses
  prose: string; // Natural language explanation for user
  response_type: ResponseType; // What kind of response this is
  follow_ups?: string[]; // Suggested next actions
  connectors_used?: string[]; // Which connectors were accessed

  // Optional: Agent metadata
  agent?: string;
  crew?: string;
  confidence?: number;

  // Type-specific payload
  artifact?: unknown; // Type depends on response_type
}

// ── Response Types ─────────────────────────────────────────────────────────

export type ResponseType = 'analysis' | 'creation' | 'optimization' | 'execution' | 'discovery';

// ── ANALYSIS Response ──────────────────────────────────────────────────────
/**
 * Analysis response: Dashboard/report with metrics, findings, insights
 * Used by: Performance Scorecard, Customer View, Competitive Intelligence
 *
 * Example:
 * - "Your LinkedIn Ads show 5.2:1 ROAS vs Meta at 2.1:1"
 * - "Top 3 churn risks: Company X, Company Y, Company Z"
 * - "Channel health: Google Ads healthy, Meta needs attention"
 */

export interface AnalysisResponse extends AgentResponse {
  response_type: 'analysis';
  artifact: {
    type: 'analysis';
    metrics: Record<string, number | string>; // KPI snapshot
    findings: string[]; // Key findings (3-5 bullets)
    insights: string[]; // Actionable insights (2-4)

    // Optional: Enhanced analytics
    trend?: {
      direction: 'up' | 'down' | 'flat';
      percentChange: number;
      period: string;
    };

    comparisons?: Array<{
      name: string;
      value: number;
      percentile?: number;
    }>;
  };
}

// ── CREATION Response ──────────────────────────────────────────────────────
/**
 * Creation response: Generated artifact (content, copy, design)
 * Used by: Content Automation, Email Automation, Landing Pages
 *
 * Example:
 * - Blog post with title, sections, word count
 * - Email sequence with 3-5 emails
 * - Landing page copy with headline, CTA
 */

export interface CreationResponse extends AgentResponse {
  response_type: 'creation';
  artifact: {
    type: 'content';
    title: string; // Artifact name/title

    // Content structure (vary by type)
    sections?: Array<{
      title: string;
      content: string;
    }>;

    emails?: Array<{
      subject: string;
      body: string;
      cta?: string;
      index?: number;
    }>;

    content?: string; // Raw content if not sectioned
    format?: 'markdown' | 'html' | 'json' | 'plaintext';

    // Metadata
    wordCount?: number;
    estimatedReadTime?: number;
    seoKeyword?: string;
    seoScore?: number;

    // Variations
    variations?: string[]; // "Alternative approach", "Shorter version", etc.
  };
}

// ── OPTIMIZATION Response ──────────────────────────────────────────────────
/**
 * Optimization response: Analysis + recommendations + what-if scenarios
 * Used by: Budget Optimization, CRO, Offer Design
 *
 * Example:
 * - "Current: $5K Google, $5K Meta. Recommended: $7K Google, $3K Meta"
 * - "Landing page converts at 2%. Tests show 3.1% possible with headline change"
 * - "Current offer: $99/mo. Test: $79/mo or $149/year bundle"
 */

export interface OptimizationResponse extends AgentResponse {
  response_type: 'optimization';
  artifact: {
    type: 'optimization_plan';

    // Current state analysis
    current_state: {
      description?: string;
      metrics: Record<string, number | string>;
    };

    // Recommendation
    recommendation: {
      description: string; // What to change and why
      changes: Array<{
        field: string;
        current: string | number;
        recommended: string | number;
      }>;
    };

    // Impact projection
    expected_impact: {
      description: string;
      metrics: Record<string, string>; // e.g., "ROAS: 3.2 → 3.8"
      improvement: number; // Percentage improvement
      confidence: number; // 0-1
    };

    // What-if scenarios (optional)
    whatIfScenarios?: Array<{
      name: string; // "Aggressive", "Conservative"
      changes: Record<string, unknown>;
      projectedImpact: Record<string, string>;
    }>;
  };
}

// ── EXECUTION Response ─────────────────────────────────────────────────────
/**
 * Execution response: Live campaign tracker with real-time metrics
 * Used by: Paid Ads, Outreach Automation, Referral Programs
 *
 * Example:
 * - Campaign live: "142 emails sent, 34 opens (23.9%), 8 conversions"
 * - Ad running: "2.5K impressions, 140 clicks (5.6% CTR), $89 spend"
 */

export interface ExecutionResponse extends AgentResponse {
  response_type: 'execution';
  artifact: {
    type: 'execution_tracker';

    campaign_id: string;
    campaign_name?: string;
    status: 'queued' | 'running' | 'paused' | 'completed' | 'error';

    // Real-time metrics
    metrics: {
      created?: number;
      sent?: number;
      delivered?: number;
      opened?: number;
      clicked?: number;
      converted?: number;
      cost?: number;
      ctr?: number;
      conversionRate?: number;
    };

    // Timeline
    startedAt?: string; // ISO timestamp
    completedAt?: string;
    estimatedCompletion?: string;

    // Control panel
    controls?: Array<{
      action: 'pause' | 'resume' | 'stop' | 'adjust';
      label: string;
    }>;
  };
}

// ── DISCOVERY Response ─────────────────────────────────────────────────────
/**
 * Discovery response: List of results (leads, audiences, insights)
 * Used by: Lead Intelligence, Market Research, Audience Definition
 *
 * Example:
 * - Found 47 B2B SaaS companies in India: TechCorp, StartupXYZ, ...
 * - 3 customer segments: Enterprise (40%), Mid-market (35%), SMB (25%)
 * - Top 5 competitors: Company A, B, C, D, E
 */

export interface DiscoveryResponse extends AgentResponse {
  response_type: 'discovery';
  artifact: {
    type: 'discovery_results';

    count: number; // Total results found

    // Result list
    results: Array<{
      id?: string;
      name?: string;
      title?: string;
      [key: string]: unknown; // Flexible result structure
    }>;

    // Optional: Segmentation/grouping
    segmentation?: {
      [segmentName: string]: unknown[];
    };

    // Metadata
    filters?: Record<string, string>; // Applied filters
    sortBy?: string; // Sort field used

    // Download option
    downloadUrl?: string;
    downloadFormat?: 'csv' | 'json' | 'xlsx';
  };
}

// ── Response Validation ────────────────────────────────────────────────────

/**
 * Validate response structure matches expected type
 * @param response - Response to validate
 * @param expectedType - Expected response type
 * @returns Validation result
 */
export function validateResponse(
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

  // Type-specific validation
  const artifactType = (resp.artifact as Record<string, unknown>)?.type;

  switch (expectedType) {
    case 'analysis':
      if (!resp.artifact || artifactType !== 'analysis') {
        errors.push('Analysis response must have artifact.type = "analysis"');
      }
      if (!Array.isArray((resp.artifact as any)?.findings)) {
        errors.push('Analysis must have findings array');
      }
      break;

    case 'creation':
      if (!resp.artifact || artifactType !== 'content') {
        errors.push('Creation response must have artifact.type = "content"');
      }
      if (!resp.artifact || (!('title' in resp.artifact) && !('content' in resp.artifact))) {
        errors.push('Creation must have title or content');
      }
      break;

    case 'optimization':
      if (!resp.artifact || artifactType !== 'optimization_plan') {
        errors.push('Optimization response must have artifact.type = "optimization_plan"');
      }
      if (!resp.artifact || !('recommendation' in resp.artifact)) {
        errors.push('Optimization must have recommendation');
      }
      break;

    case 'execution':
      if (!resp.artifact || artifactType !== 'execution_tracker') {
        errors.push('Execution response must have artifact.type = "execution_tracker"');
      }
      if (!resp.artifact || !('campaign_id' in resp.artifact)) {
        errors.push('Execution must have campaign_id');
      }
      break;

    case 'discovery':
      if (!resp.artifact || artifactType !== 'discovery_results') {
        errors.push('Discovery response must have artifact.type = "discovery_results"');
      }
      if (!Array.isArray((resp.artifact as any)?.results)) {
        errors.push('Discovery must have results array');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ── Response Type Mapping ──────────────────────────────────────────────────

/**
 * Map agent/crew to expected response type
 */
export const CREW_TO_RESPONSE_TYPE: Record<string, ResponseType> = {
  // Analysis crews
  'performance-scorecard': 'analysis',
  'unified-customer-view': 'analysis',
  'competitor-intelligence': 'analysis',

  // Creation crews
  'content-automation': 'creation',
  'email-automation': 'creation',
  'landing-pages': 'creation',
  'social-campaign': 'creation',
  'messaging': 'creation',
  'sales-enablement': 'creation',

  // Optimization crews
  'budget-optimization': 'optimization',
  'cro': 'optimization',
  'offer-design': 'optimization',
  'strategy': 'optimization',

  // Execution crews
  'paid-ads': 'execution',
  'outreach-automation': 'execution',
  'customer-view': 'execution',
  'churn-prevention': 'analysis', // Can also be optimization

  // Discovery crews
  'lead-intelligence': 'discovery',
  'market-research': 'discovery'
};

/**
 * Get expected response type for a crew
 * @param crewId - Crew identifier
 * @returns Expected response type
 */
export function getExpectedResponseType(crewId: string): ResponseType {
  return CREW_TO_RESPONSE_TYPE[crewId] || 'discovery';
}

// ── Type Guards ────────────────────────────────────────────────────────────

export function isAnalysisResponse(resp: AgentResponse): resp is AnalysisResponse {
  return resp.response_type === 'analysis' && !!resp.artifact?.type === 'analysis';
}

export function isCreationResponse(resp: AgentResponse): resp is CreationResponse {
  return resp.response_type === 'creation' && !!resp.artifact?.type === 'content';
}

export function isOptimizationResponse(resp: AgentResponse): resp is OptimizationResponse {
  return resp.response_type === 'optimization' && !!resp.artifact?.type === 'optimization_plan';
}

export function isExecutionResponse(resp: AgentResponse): resp is ExecutionResponse {
  return resp.response_type === 'execution' && !!resp.artifact?.type === 'execution_tracker';
}

export function isDiscoveryResponse(resp: AgentResponse): resp is DiscoveryResponse {
  return resp.response_type === 'discovery' && !!resp.artifact?.type === 'discovery_results';
}
