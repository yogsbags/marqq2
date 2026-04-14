/**
 * Chat Routing Enhancement for ChatHome.tsx
 *
 * This file contains type definitions and utilities needed to enhance ChatHome.tsx
 * with Veena orchestrator routing. These should be integrated into ChatHome.tsx
 *
 * Updates needed in ChatHome.tsx:
 * 1. Add ChatMessage interface fields for routing
 * 2. Add IntentBadge component
 * 3. Add ConnectorPrompt component
 * 4. Update handleMessage to call routing
 * 5. Update message rendering to show intent info and artifacts
 */

// ── Type Definitions ──────────────────────────────────────────────────────

/**
 * Enhanced ChatMessage with routing information
 * Add these fields to the existing ChatMessage type in ChatHome.tsx
 */
export interface EnhancedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;

  // ── NEW: Intent tracking ──────────────────────────────────────────────
  intent_type?: 'analysis' | 'creation' | 'optimization' | 'execution' | 'discovery' | 'clarification' | 'connector_missing' | 'error';
  goal_id?: string;
  confidence?: number;

  // ── NEW: Routing information ──────────────────────────────────────────
  routing_info?: {
    goal_id: string;
    agent: string;
    crew: string;
    confidence: number;
  };

  // ── NEW: Connector handling ───────────────────────────────────────────
  connector_prompt?: {
    type: string;
    missing: string[];
    message: string;
    action: string;
    missingLabels?: string[];
    optionalLabels?: string[];
  };

  // ── NEW: Artifact rendering ───────────────────────────────────────────
  artifact?: {
    type: 'analysis' | 'creation' | 'optimization' | 'execution' | 'discovery';
    [key: string]: any;
  };

  // ── NEW: Follow-up suggestions ────────────────────────────────────────
  follow_ups?: string[];
  connectors_used?: string[];
}

// ── Component: IntentBadge ─────────────────────────────────────────────────

/**
 * Displays intent type, agent, and confidence score
 *
 * Usage in ChatHome.tsx:
 * {showIntentDebug && msg.intent_type && (
 *   <IntentBadge
 *     intent_type={msg.intent_type}
 *     confidence={msg.confidence}
 *     agent={msg.routing_info?.agent}
 *   />
 * )}
 */
export function IntentBadge({ intent_type, confidence, agent }: {
  intent_type?: string;
  confidence?: number;
  agent?: string;
}) {
  if (!intent_type) return null;

  const colorMap: Record<string, { bg: string; text: string; emoji: string }> = {
    analysis: { bg: 'bg-blue-100', text: 'text-blue-700', emoji: '📊' },
    creation: { bg: 'bg-purple-100', text: 'text-purple-700', emoji: '✍️' },
    optimization: { bg: 'bg-amber-100', text: 'text-amber-700', emoji: '🎯' },
    execution: { bg: 'bg-green-100', text: 'text-green-700', emoji: '🚀' },
    discovery: { bg: 'bg-pink-100', text: 'text-pink-700', emoji: '🔍' },
    clarification: { bg: 'bg-gray-100', text: 'text-gray-700', emoji: '❓' },
    connector_missing: { bg: 'bg-red-100', text: 'text-red-700', emoji: '⚠️' },
    error: { bg: 'bg-red-100', text: 'text-red-700', emoji: '❌' }
  };

  const colors = colorMap[intent_type] || colorMap.discovery;

  return (
    <div className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 mb-2 ${colors.bg} ${colors.text}`}>
      <span>{colors.emoji}</span>
      {agent && <span className="font-semibold">{agent}</span>}
      {agent && confidence && <span>•</span>}
      <span>{intent_type.replace('_', ' ')}</span>
      {confidence && <span>({Math.round(confidence * 100)}%)</span>}
    </div>
  );
}

// ── Component: ConnectorPrompt ────────────────────────────────────────────

/**
 * Displays missing connectors and prompts user to connect
 *
 * Usage in ChatHome.tsx:
 * {msg.connector_prompt && (
 *   <ConnectorPrompt
 *     prompt={msg.connector_prompt}
 *     onConnect={(connectors) => {
 *       // Call integration connection flow
 *       console.log('Connect:', connectors);
 *     }}
 *   />
 * )}
 */
export function ConnectorPrompt({ prompt, onConnect }: {
  prompt: EnhancedChatMessage['connector_prompt'];
  onConnect: (connectors: string[]) => void;
}) {
  if (!prompt) return null;

  const missingLabels = prompt.missingLabels?.join(' + ') || prompt.missing.join(' + ');
  const connectorNames = prompt.missing.map(c => {
    const map: Record<string, string> = {
      'google_ads': 'Google Ads',
      'meta_ads': 'Meta Ads',
      'linkedin': 'LinkedIn',
      'hubspot': 'HubSpot',
      'ga4': 'Google Analytics',
      'apollo': 'Apollo.io',
      'hunter': 'Hunter.io'
    };
    return map[c] || c;
  });

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4 flex items-start gap-3">
      <div className="text-2xl">⚠️</div>
      <div className="flex-1">
        <p className="text-amber-900 font-medium mb-3">{prompt.message}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onConnect(prompt.missing)}
            className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 transition text-sm font-medium"
          >
            Connect {connectorNames.join(' + ')}
          </button>
          <button
            className="bg-white text-amber-700 border border-amber-300 px-4 py-2 rounded hover:bg-amber-50 transition text-sm"
          >
            Proceed without
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component: FollowUpSuggestions ────────────────────────────────────────

/**
 * Displays suggested next actions
 *
 * Usage in ChatHome.tsx:
 * {msg.follow_ups && msg.follow_ups.length > 0 && (
 *   <FollowUpSuggestions
 *     suggestions={msg.follow_ups}
 *     onSelect={(suggestion) => handleMessage(suggestion)}
 *   />
 * )}
 */
export function FollowUpSuggestions({ suggestions, onSelect }: {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-gray-600 font-semibold">What would you like to do next?</p>
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(suggestion)}
          className="block w-full text-left text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded transition"
        >
          → {suggestion}
        </button>
      ))}
    </div>
  );
}

// ── Artifact Renderers ────────────────────────────────────────────────────

/**
 * Render different artifact types based on intent_type
 *
 * Usage in ChatHome.tsx:
 * {msg.artifact && (
 *   <ArtifactRenderer
 *     artifact={msg.artifact}
 *     intent_type={msg.intent_type}
 *   />
 * )}
 */
export function ArtifactRenderer({ artifact, intent_type }: {
  artifact: EnhancedChatMessage['artifact'];
  intent_type?: string;
}) {
  if (!artifact) return null;

  switch (artifact.type) {
    case 'analysis':
      return <AnalysisArtifactRenderer artifact={artifact} />;
    case 'creation':
      return <CreationArtifactRenderer artifact={artifact} />;
    case 'optimization':
      return <OptimizationArtifactRenderer artifact={artifact} />;
    case 'discovery':
      return <DiscoveryArtifactRenderer artifact={artifact} />;
    case 'execution':
      return <ExecutionArtifactRenderer artifact={artifact} />;
    default:
      return (
        <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-700">
          <pre>{JSON.stringify(artifact, null, 2)}</pre>
        </div>
      );
  }
}

/**
 * Analysis Artifact: Dashboard with metrics, findings, insights
 */
function AnalysisArtifactRenderer({ artifact }: { artifact: any }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-4">
      <h3 className="font-semibold text-blue-900 mb-3">📊 Analysis Results</h3>

      {artifact.metrics && (
        <div className="mb-4">
          <p className="text-sm text-blue-700 font-semibold mb-2">Key Metrics:</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(artifact.metrics).slice(0, 4).map(([key, value]: any) => (
              <div key={key} className="bg-white rounded p-2 border border-blue-100">
                <p className="text-xs text-gray-600">{key}</p>
                <p className="text-lg font-bold text-blue-700">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {artifact.findings && Array.isArray(artifact.findings) && (
        <div className="mb-4">
          <p className="text-sm text-blue-700 font-semibold mb-2">Findings:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {artifact.findings.slice(0, 5).map((finding: string, idx: number) => (
              <li key={idx}>{finding}</li>
            ))}
          </ul>
        </div>
      )}

      {artifact.insights && Array.isArray(artifact.insights) && (
        <div>
          <p className="text-sm text-blue-700 font-semibold mb-2">Insights:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {artifact.insights.slice(0, 3).map((insight: string, idx: number) => (
              <li key={idx}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Creation Artifact: Content with sections, variations
 */
function CreationArtifactRenderer({ artifact }: { artifact: any }) {
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 my-4">
      <h3 className="font-semibold text-purple-900 mb-3">✍️ Generated Content</h3>

      {artifact.title && (
        <h4 className="text-lg font-bold text-purple-900 mb-2">{artifact.title}</h4>
      )}

      {artifact.sections && Array.isArray(artifact.sections) && (
        <div className="space-y-3 mb-4">
          {artifact.sections.map((section: any, idx: number) => (
            <div key={idx}>
              {section.title && <p className="font-semibold text-purple-800">{section.title}</p>}
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{section.content}</p>
            </div>
          ))}
        </div>
      )}

      {artifact.variations && Array.isArray(artifact.variations) && artifact.variations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-purple-200">
          <p className="text-sm text-purple-700 font-semibold mb-2">Variations:</p>
          <div className="space-y-2">
            {artifact.variations.map((variant: string, idx: number) => (
              <button
                key={idx}
                className="block w-full text-left text-sm px-3 py-2 rounded bg-white border border-purple-200 hover:border-purple-400 transition"
              >
                {variant}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Optimization Artifact: Current state vs recommendations
 */
function OptimizationArtifactRenderer({ artifact }: { artifact: any }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4">
      <h3 className="font-semibold text-amber-900 mb-3">🎯 Optimization Plan</h3>

      {artifact.current_state && (
        <div className="mb-4">
          <p className="text-sm text-amber-700 font-semibold mb-2">Current State:</p>
          <div className="bg-white border border-amber-100 rounded p-3 text-sm text-gray-700">
            {typeof artifact.current_state === 'string'
              ? artifact.current_state
              : JSON.stringify(artifact.current_state, null, 2)}
          </div>
        </div>
      )}

      {artifact.recommendation && (
        <div className="mb-4">
          <p className="text-sm text-amber-700 font-semibold mb-2">Recommendation:</p>
          <div className="bg-amber-100 border border-amber-300 rounded p-3 text-sm text-amber-900">
            {typeof artifact.recommendation === 'string'
              ? artifact.recommendation
              : JSON.stringify(artifact.recommendation, null, 2)}
          </div>
        </div>
      )}

      {artifact.expected_impact && (
        <div>
          <p className="text-sm text-amber-700 font-semibold mb-2">Expected Impact:</p>
          <div className="bg-white border border-amber-100 rounded p-3 text-sm text-gray-700">
            {typeof artifact.expected_impact === 'string'
              ? artifact.expected_impact
              : JSON.stringify(artifact.expected_impact, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Discovery Artifact: List of results with filtering
 */
function DiscoveryArtifactRenderer({ artifact }: { artifact: any }) {
  const results = artifact.results || [];
  const count = artifact.count || results.length;

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-lg p-4 my-4">
      <h3 className="font-semibold text-pink-900 mb-3">
        🔍 Found {count} Result{count !== 1 ? 's' : ''}
      </h3>

      {results.length > 0 && (
        <div className="space-y-2 mb-4">
          {results.slice(0, 5).map((result: any, idx: number) => (
            <div key={idx} className="bg-white border border-pink-100 rounded p-3 text-sm">
              {result.name || result.title ? (
                <p className="font-semibold text-gray-900">{result.name || result.title}</p>
              ) : null}
              {Object.entries(result)
                .filter(([key]) => key !== 'name' && key !== 'title')
                .slice(0, 3)
                .map(([key, value]: any) => (
                  <p key={key} className="text-xs text-gray-600">
                    <span className="font-medium">{key}:</span> {String(value).slice(0, 50)}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}

      {count > 5 && (
        <button className="w-full text-sm text-pink-600 hover:text-pink-700 py-2 border-t border-pink-200 mt-4">
          Show {count - 5} more results
        </button>
      )}
    </div>
  );
}

/**
 * Execution Artifact: Live tracker with status
 */
function ExecutionArtifactRenderer({ artifact }: { artifact: any }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 my-4">
      <h3 className="font-semibold text-green-900 mb-3">🚀 Execution Status</h3>

      {artifact.campaign_id && (
        <p className="text-xs text-gray-600 mb-2">ID: {artifact.campaign_id}</p>
      )}

      {artifact.status && (
        <div className="mb-3 inline-block px-3 py-1 bg-green-200 text-green-900 rounded-full text-sm font-semibold">
          {artifact.status.toUpperCase()}
        </div>
      )}

      {artifact.metrics && (
        <div className="mt-3 space-y-2">
          {Object.entries(artifact.metrics).slice(0, 4).map(([key, value]: any) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-gray-600">{key}:</span>
              <span className="font-semibold text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Integration Instructions ────────────────────────────────────────────────

/**
 * HOW TO INTEGRATE THIS INTO ChatHome.tsx:
 *
 * 1. Add imports at top:
 *    import {
 *      IntentBadge,
 *      ConnectorPrompt,
 *      FollowUpSuggestions,
 *      ArtifactRenderer,
 *      type EnhancedChatMessage
 *    } from './chat-routing-enhancement';
 *    import AgenticLoop from '@/platform/crewai/core/agenticLoop';
 *
 * 2. Update ChatMessage type to extend EnhancedChatMessage:
 *    type ChatMessage = EnhancedChatMessage;
 *
 * 3. In ChatHome component state, add:
 *    const [showIntentDebug, setShowIntentDebug] = useState(false);
 *    const [agenticLoop] = useState(() => new AgenticLoop({
 *      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
 *      supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
 *      llmClient: groqService // or other LLM client
 *    }));
 *
 * 4. Modify handleMessage function:
 *    const handleMessage = async (userMessage: string) => {
 *      // Add user message
 *      const userMsg: ChatMessage = {
 *        id: crypto.randomUUID(),
 *        role: 'user',
 *        content: userMessage,
 *        timestamp: new Date()
 *      };
 *      setMessages(prev => [...prev, userMsg]);
 *
 *      try {
 *        // Call Veena routing
 *        const response = await agenticLoop.executeGoal(
 *          userMessage,
 *          user?.id || '',
 *          workspace?.id || '',
 *          { chatHistory: messages }
 *        );
 *
 *        // Format as ChatMessage
 *        const assistantMsg: ChatMessage = {
 *          id: crypto.randomUUID(),
 *          role: 'assistant',
 *          content: response.content,
 *          timestamp: new Date(),
 *          intent_type: response.intent_type,
 *          goal_id: response.routing_info?.goal_id,
 *          confidence: response.routing_info?.confidence,
 *          routing_info: response.routing_info,
 *          connector_prompt: response.connector_prompt,
 *          artifact: response.artifact,
 *          follow_ups: response.follow_ups
 *        };
 *
 *        setMessages(prev => [...prev, assistantMsg]);
 *      } catch (error) {
 *        console.error('Chat error:', error);
 *        // Handle error
 *      }
 *    };
 *
 * 5. In message rendering loop, add intent badge:
 *    {showIntentDebug && msg.intent_type && (
 *      <IntentBadge
 *        intent_type={msg.intent_type}
 *        confidence={msg.confidence}
 *        agent={msg.routing_info?.agent}
 *      />
 *    )}
 *
 * 6. Add connector prompt rendering:
 *    {msg.connector_prompt && (
 *      <ConnectorPrompt
 *        prompt={msg.connector_prompt}
 *        onConnect={(connectors) => {
 *          // Call integration flow
 *          console.log('Connecting:', connectors);
 *        }}
 *      />
 *    )}
 *
 * 7. Add artifact rendering:
 *    {msg.artifact && (
 *      <ArtifactRenderer
 *        artifact={msg.artifact}
 *        intent_type={msg.intent_type}
 *      />
 *    )}
 *
 * 8. Add follow-ups:
 *    {msg.follow_ups && msg.follow_ups.length > 0 && (
 *      <FollowUpSuggestions
 *        suggestions={msg.follow_ups}
 *        onSelect={(suggestion) => handleMessage(suggestion)}
 *      />
 *    )}
 *
 * 9. Add debug toggle button in chat header:
 *    <button
 *      onClick={() => setShowIntentDebug(!showIntentDebug)}
 *      className="text-xs text-gray-500 hover:text-gray-700"
 *    >
 *      {showIntentDebug ? 'Hide' : 'Show'} intent info
 *    </button>
 */
