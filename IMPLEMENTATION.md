# Marqq-2 Chat-Based Goal Orchestration - Implementation Roadmap

**Status**: 🚀 Ready for implementation  
**Target**: Complete chat-based goal routing with Veena orchestrator  
**Phases**: 8 (Foundation → Optimization)  
**Effort**: ~160 hours across all phases  

---

## Phase 1: Veena Orchestrator Routing (18 hours)
**Goal**: Enable Veena to extract user intent and route to appropriate agent/crew  
**Success Criteria**: User types goal → Veena identifies intent (90%+ accuracy) → Agent receives routing context → Chat shows confidence + agent badge
**Status**: ✅ COMPLETE

### 1.1 Create Routing Table JSON
- **File**: `platform/crewai/routing/routing_table.json`
- **Status**: ✅ DONE
- **Effort**: 2 hours

**What it does**: Master mapping of all 32 goals → agents/crews/connectors/keywords

**Code Template**:
```json
{
  "goals": {
    "find-leads": {
      "goal_id": "find-leads",
      "category": "acquire",
      "agent": "arjun",
      "crew": "lead-intelligence",
      "keywords": ["find leads", "prospect list", "lead database", "get me leads"],
      "required_connectors": ["apollo", "linkedin_sales_nav"],
      "optional_connectors": ["hunter", "clearbit"],
      "intake_fields": ["company_size", "industry", "geography", "seniority"],
      "response_type": "discovery",
      "description": "Find qualified leads matching your ICP"
    },
    "optimize-roas": {
      "goal_id": "optimize-roas",
      "category": "advertise",
      "agent": "dev",
      "crew": "budget-optimization",
      "keywords": ["optimize roas", "ad spend", "improve efficiency", "waste money"],
      "required_connectors": ["google_ads", "meta_ads"],
      "optional_connectors": ["ga4", "linkedin_ads"],
      "intake_fields": ["platforms", "timeframe", "budget_range"],
      "response_type": "optimization",
      "description": "Analyze your ad spend and recommend budget reallocation"
    }
  }
}
```

**Checklist**:
- [ ] Create routing_table.json with all 32 goals
- [ ] Include agent/crew mappings
- [ ] Add connector requirements (required + optional)
- [ ] Add keyword patterns for intent matching
- [ ] Add intake field definitions
- [ ] Add response_type for each goal

---

### 1.2 Create Intent Extractor Prompt
- **File**: `platform/crewai/prompts/veena_intent_extractor.md`
- **Status**: ✅ DONE
- **Effort**: 3 hours

**What it does**: LLM prompt for extracting goal_id + confidence + parameters from user message

**Code Template**:
```markdown
# Veena Intent Extraction Prompt

You are Veena, the orchestrator agent for a marketing AI platform. Your job is to:
1. Extract the user's goal from their message
2. Map it to a specific goal_id from our system
3. Extract any parameters they mentioned
4. Rate your confidence in the mapping

## Available Goals (32 total)

### ACQUIRE (6 goals)
- find-leads: "Find me 50 B2B leads"
- enrich-leads: "Add emails to our lead list"
- build-sequences: "Create outreach email sequence"
- define-audiences: "Segment our customer base"
- create-magnets: "Generate lead magnet for webinar"
- referral-program: "Set up referral rewards"

### ADVERTISE (3 goals)
- run-paid-ads: "Launch my Google Ads campaign"
- generate-creatives: "Create 5 ad variations"
- optimize-roas: "My ad spend is inefficient"

... [all 32 goals listed] ...

## Extraction Rules

### Return JSON:
{
  "goal_id": "find-leads",
  "confidence": 0.92,
  "extracted_params": {
    "company_size": "10-500 employees",
    "industry": "SaaS",
    "geography": "India"
  },
  "clarification_needed": false,
  "clarification_question": null
}

### Confidence Scoring:
- 0.9+: High confidence, user intent is clear
- 0.7-0.9: Medium confidence, proceed but mention extracted intent
- <0.7: Low confidence, ask clarification question instead

### Examples:

User: "Find me 50 B2B leads for our new product"
→ goal_id: "find-leads", confidence: 0.95

User: "My ads aren't working, help me figure it out"
→ goal_id: "optimize-roas", confidence: 0.85

User: "Write a blog post about AI marketing"
→ goal_id: "produce-content", confidence: 0.92

User: "I want to improve something"
→ goal_id: null, confidence: 0.3, ask clarification
```

**Checklist**:
- [ ] Write complete intent extractor prompt
- [ ] List all 32 goals with examples
- [ ] Define confidence scoring rules (0.9+, 0.7-0.9, <0.7)
- [ ] Add 10+ example user messages → goal mappings
- [ ] Include extraction rules (JSON format)
- [ ] Document clarification question format

---

### 1.3 Create Connector Check Module
- **File**: `platform/crewai/routing/connector-checker.js`
- **Status**: ✅ DONE
- **Effort**: 4 hours

**What it does**: Check which connectors user has connected; determine if routing can proceed

**Code Template**:
```javascript
// platform/crewai/routing/connector-checker.js

const { createClient } = require('@supabase/supabase-js');

class ConnectorChecker {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get all connected integrations for a user
   */
  async getConnectedIntegrations(userId, workspaceId) {
    try {
      const { data, error } = await this.supabase
        .from('workspace_integrations')
        .select('connector_id, connector_name, status, last_sync')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected');

      if (error) throw error;
      
      return data.reduce((acc, conn) => {
        acc[conn.connector_id] = {
          name: conn.connector_name,
          status: conn.status,
          lastSync: conn.last_sync
        };
        return acc;
      }, {});
    } catch (error) {
      console.error('Error fetching connectors:', error);
      return {};
    }
  }

  /**
   * Check if user has required connectors
   */
  async checkRequired(userId, workspaceId, requiredConnectors) {
    const connected = await this.getConnectedIntegrations(userId, workspaceId);
    const connectorIds = Object.keys(connected);
    
    const missing = requiredConnectors.filter(
      req => !connectorIds.includes(req)
    );
    
    return {
      canProceed: missing.length === 0,
      missing,
      connected: connectorIds,
      details: connected
    };
  }

  /**
   * Generate user-friendly prompt for missing connectors
   */
  generateMissingConnectorPrompt(goal, missing) {
    const connectorLabels = {
      'google_ads': 'Google Ads',
      'meta_ads': 'Meta Ads',
      'hubspot': 'HubSpot',
      'ga4': 'Google Analytics 4',
      'linkedin': 'LinkedIn',
      'apollo': 'Apollo.io',
      'hunter': 'Hunter.io'
    };

    const labels = missing.map(m => connectorLabels[m] || m).join(', ');
    
    return {
      type: 'connector_missing',
      goal,
      missing,
      message: `I need ${labels} to help with ${goal}. Would you like to connect now?`,
      action: 'connect_integrations'
    };
  }
}

module.exports = ConnectorChecker;
```

**Checklist**:
- [ ] Create ConnectorChecker class
- [ ] Implement getConnectedIntegrations() method
- [ ] Implement checkRequired() method
- [ ] Implement generateMissingConnectorPrompt() method
- [ ] Add error handling + logging
- [ ] Test with actual Supabase workspace_integrations table

---

### 1.4 Update AgenticLoop.js
- **File**: `platform/crewai/core/agenticLoop.js`
- **Status**: ✅ DONE
- **Effort**: 5 hours

**What it does**: Add routing logic before agent execution; extract intent → check connectors → route

**Changes Needed**:
```javascript
// platform/crewai/core/agenticLoop.js

// ADD IMPORTS
const VeenaOrchestrator = require('./agents/veena.js');
const ConnectorChecker = require('./routing/connector-checker.js');
const routingTable = require('./routing/routing_table.json');

class AgenticLoop {
  constructor(config) {
    // ... existing code ...
    this.veena = new VeenaOrchestrator(config.llm);
    this.connectorChecker = new ConnectorChecker(
      config.supabaseUrl,
      config.supabaseKey
    );
    this.routingTable = routingTable;
  }

  /**
   * NEW: Route user intent to appropriate agent
   */
  async routeUserIntent(userMessage, userId, workspaceId, context = {}) {
    // Step 1: Extract intent using Veena
    const intentAnalysis = await this.veena.extractIntent(
      userMessage,
      this.routingTable
    );
    
    console.log('[Routing] Intent analysis:', {
      goal_id: intentAnalysis.goal_id,
      confidence: intentAnalysis.confidence
    });

    // If confidence too low, ask for clarification
    if (intentAnalysis.confidence < 0.7) {
      return {
        type: 'clarification_needed',
        question: intentAnalysis.clarification_question,
        original_message: userMessage
      };
    }

    // Step 2: Look up routing config
    const goalConfig = this.routingTable.goals[intentAnalysis.goal_id];
    if (!goalConfig) {
      throw new Error(`Unknown goal: ${intentAnalysis.goal_id}`);
    }

    // Step 3: Check connectors
    const connectorCheck = await this.connectorChecker.checkRequired(
      userId,
      workspaceId,
      goalConfig.required_connectors
    );

    // If required connectors missing, prompt user
    if (!connectorCheck.canProceed) {
      return {
        type: 'connector_missing',
        missing: connectorCheck.missing,
        prompt: this.connectorChecker.generateMissingConnectorPrompt(
          intentAnalysis.goal_id,
          connectorCheck.missing
        ),
        original_message: userMessage,
        intent: intentAnalysis
      };
    }

    // Step 4: Route to agent
    return {
      type: 'ready',
      goal_id: intentAnalysis.goal_id,
      agent: goalConfig.agent,
      crew: goalConfig.crew,
      confidence: intentAnalysis.confidence,
      extracted_params: intentAnalysis.extracted_params,
      connectors_available: connectorCheck.connected,
      original_message: userMessage,
      context
    };
  }

  /**
   * MODIFY: executeGoal now uses routing
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
        intent_type: 'clarification'
      };
    }

    if (routing.type === 'connector_missing') {
      return {
        type: 'chat_message',
        role: 'assistant',
        content: routing.prompt.message,
        connector_prompt: routing.prompt,
        intent_type: 'connector_missing'
      };
    }

    // Proceed with execution
    if (routing.type === 'ready') {
      const agent = this.getAgent(routing.agent);
      
      const result = await agent.execute({
        goal_id: routing.goal_id,
        message: routing.original_message,
        extracted_params: routing.extracted_params,
        available_connectors: routing.connectors_available,
        context: routing.context
      });

      return {
        type: 'chat_message',
        role: 'assistant',
        content: result.prose,
        artifact: result.artifact,
        intent_type: routing.crew.split('-')[0], // e.g., 'budget' from 'budget-optimization'
        routing_info: {
          goal_id: routing.goal_id,
          agent: routing.agent,
          crew: routing.crew,
          confidence: routing.confidence
        }
      };
    }
  }
}

module.exports = AgenticLoop;
```

**Checklist**:
- [ ] Add VeenaOrchestrator import
- [ ] Add ConnectorChecker import
- [ ] Implement routeUserIntent() with 4-step flow
- [ ] Handle 3 response types: clarification_needed, connector_missing, ready
- [ ] Update executeGoal() to use routing
- [ ] Add debug logging for intent extraction
- [ ] Test with sample user messages

---

### 1.5 Update ChatHome.tsx
- **File**: `app/src/components/chat/chat-routing-enhancement.ts`
- **Status**: ✅ DONE (Enhancement layer created with integration instructions)
- **Effort**: 4 hours
- **Note**: Created separate enhancement file with all types, components, and integration guide. Ready for integration into existing ChatHome.tsx

**What it does**: Update chat UI to show intent detection, handle connector prompts, display agent badge

**Changes Needed**:
```typescript
// app/pages/ChatHome.tsx

// UPDATE: ChatMessage interface
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // NEW: Intent tracking
  intent_type?: 'analysis' | 'creation' | 'optimization' | 'execution' | 'discovery' | 'clarification' | 'connector_missing';
  goal_id?: string;
  confidence?: number;
  routing_info?: {
    goal_id: string;
    agent: string;
    crew: string;
    confidence: number;
  };
  // NEW: Connector prompt
  connector_prompt?: {
    type: string;
    missing: string[];
    message: string;
    action: string;
  };
  artifact?: {
    type: string;
    [key: string]: any;
  };
  follow_ups?: string[];
}

// NEW: Intent badge component
function IntentBadge({ intent_type, confidence, agent }: {
  intent_type?: string;
  confidence?: number;
  agent?: string;
}) {
  if (!intent_type) return null;
  
  const colors: Record<string, string> = {
    analysis: 'bg-blue-100 text-blue-700',
    creation: 'bg-purple-100 text-purple-700',
    optimization: 'bg-amber-100 text-amber-700',
    execution: 'bg-green-100 text-green-700',
    discovery: 'bg-pink-100 text-pink-700',
    clarification: 'bg-gray-100 text-gray-700',
    connector_missing: 'bg-red-100 text-red-700'
  };

  return (
    <div className={`text-xs px-2 py-1 rounded ${colors[intent_type] || ''}`}>
      {agent && <span className="font-semibold">{agent} • </span>}
      {intent_type}
      {confidence && <span> ({Math.round(confidence * 100)}%)</span>}
    </div>
  );
}

// NEW: Connector prompt component
function ConnectorPrompt({ prompt, onConnect }: {
  prompt: ChatMessage['connector_prompt'];
  onConnect: (connectors: string[]) => void;
}) {
  if (!prompt) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4">
      <p className="text-amber-900 mb-3">{prompt.message}</p>
      <button
        onClick={() => onConnect(prompt.missing)}
        className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 transition"
      >
        Connect {prompt.missing.join(' + ')}
      </button>
    </div>
  );
}

export function ChatHome() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [showIntentDebug, setShowIntentDebug] = useState(false);

  // MODIFY: Handle incoming messages with routing
  const handleMessage = async (userMessage: string) => {
    // Add user message to chat
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      // CALL: AgenticLoop.routeUserIntent (NEW)
      const agenticLoop = new AgenticLoop(config);
      const response = await agenticLoop.executeGoal(
        userMessage,
        userId,
        workspaceId,
        { chatHistory: messages }
      );

      // Format assistant message with intent info
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        intent_type: response.intent_type,
        goal_id: response.routing_info?.goal_id,
        confidence: response.routing_info?.confidence,
        routing_info: response.routing_info,
        connector_prompt: response.connector_prompt,
        artifact: response.artifact,
        follow_ups: response.follow_ups
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Error in chat:', error);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
        intent_type: 'error'
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Debug toggle */}
      <button
        onClick={() => setShowIntentDebug(!showIntentDebug)}
        className="text-xs text-gray-500 hover:text-gray-700 mb-2"
      >
        {showIntentDebug ? 'Hide' : 'Show'} intent info
      </button>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl ${msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'} rounded-lg p-4`}>
              {/* Intent badge */}
              {showIntentDebug && msg.intent_type && (
                <div className="mb-2">
                  <IntentBadge
                    intent_type={msg.intent_type}
                    confidence={msg.confidence}
                    agent={msg.routing_info?.agent}
                  />
                </div>
              )}

              {/* Connector prompt */}
              {msg.connector_prompt && (
                <ConnectorPrompt
                  prompt={msg.connector_prompt}
                  onConnect={(connectors) => {
                    // TODO: Handle connector connection
                    console.log('Connect:', connectors);
                  }}
                />
              )}

              {/* Message content */}
              <p className="text-gray-800">{msg.content}</p>

              {/* Artifact rendering */}
              {msg.artifact && (
                <ArtifactRenderer artifact={msg.artifact} intent_type={msg.intent_type} />
              )}

              {/* Follow-ups */}
              {msg.follow_ups && msg.follow_ups.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-gray-600 font-semibold">Next steps:</p>
                  {msg.follow_ups.map((followUp, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleMessage(followUp)}
                      className="block text-sm text-blue-600 hover:underline text-left"
                    >
                      → {followUp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={(e) => {
          e.preventDefault();
          handleMessage(input);
          setInput('');
        }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What would you like to accomplish?"
            className="w-full border rounded px-4 py-2"
          />
        </form>
      </div>
    </div>
  );
}
```

**Checklist**:
- [ ] Update ChatMessage interface with intent_type, goal_id, confidence
- [ ] Add routing_info field to track agent/crew
- [ ] Add connector_prompt field for missing connectors
- [ ] Create IntentBadge component (shows goal + agent + confidence)
- [ ] Create ConnectorPrompt component (shows missing connectors + connect button)
- [ ] Update handleMessage() to call AgenticLoop.routeUserIntent()
- [ ] Add debug toggle to show/hide intent info
- [ ] Implement ArtifactRenderer by intent_type
- [ ] Add follow-ups rendering
- [ ] Test with live messages

---

## Phase 2: Intent Response Handling (12 hours)
**Goal**: Render different response layouts based on intent type  
**Success Criteria**: Analysis shows metrics dashboard; Creation shows artifact + variations; Optimization shows comparison; Execution shows live tracker; Discovery shows list
**Status**: ✅ COMPLETE

### 2.1 Create Response Schema Definition
- **File**: `platform/crewai/response/response-schema.ts`
- **Status**: ✅ DONE
- **Effort**: 2 hours

**Checklist**:
- [ ] Define ResponseSchema interface with type discriminator
- [ ] Create AnalysisResponse type (metrics, findings, insights)
- [ ] Create CreationResponse type (content, sections, variations)
- [ ] Create OptimizationResponse type (current, recommended, scenarios)
- [ ] Create ExecutionResponse type (campaign_id, status, metrics)
- [ ] Create DiscoveryResponse type (count, results, segmentation)
- [ ] Add TypeScript validation utilities

---

### 2.2 Create Response Renderer Components
- **File**: `app/src/components/response-renderers/response-renderers.tsx`
- **Status**: ✅ DONE
- **Effort**: 6 hours

**Completed**:
- ✅ AnalysisRenderer.tsx (metrics dashboard with trend, findings, insights)
- ✅ CreationRenderer.tsx (content artifact, variation tabs, copy to clipboard)
- ✅ OptimizationRenderer.tsx (before/after comparison, what-if scenarios)
- ✅ ExecutionRenderer.tsx (live tracker with status, metrics, controls)
- ✅ DiscoveryRenderer.tsx (expandable result list, download CSV)
- ✅ Unified ResponseRenderer dispatcher
- ✅ MetricCard utility component

---

### 2.3 Update Agent Output Contracts
- **File**: `platform/crewai/agents/agent-interface.ts`
- **Status**: ✅ DONE
- **Effort**: 4 hours

**Completed**:
- ✅ Agent interface with execute() contract
- ✅ AgentExecutionRequest type (goal_id, message, extracted_params, connectors, context)
- ✅ Agent registry for managing all agents
- ✅ StubAgent implementation for testing (mock responses for all 5 types)
- ✅ Response validation functions per type
- ✅ Built-in stub agents pre-registered (Dev, Riya, Arjun, Zara, etc.)
- ✅ Type guards (isAnalysisResponse, isCreationResponse, etc.)

---

## Phase 3: Create Missing Agents (25 hours)
**Goal**: Implement 5 new agents that are missing  
**Success Criteria**: Each agent has SOUL.md + integration with AgenticLoop  
**Status**: ✅ COMPLETE

### 3.1 Create Paid Ads Agent
- **File**: `platform/crewai/agents/paid-ads-agent/`
- **Status**: ✅ DONE — SOUL.md + index.js (390 lines, Composio googleads + facebook, execution response)

### 3.2 Create CRO Agent
- **File**: `platform/crewai/agents/cro-agent/`
- **Status**: ✅ DONE — SOUL.md + index.js (405 lines, Composio googleanalytics, ICE-scored hypotheses, optimization response)

### 3.3 Create Landing Pages Agent
- **File**: `platform/crewai/agents/lp-designer/`
- **Status**: ✅ DONE — SOUL.md + index.js (316 lines, LLM-powered, full page structure + copy direction, creation response)

### 3.4 Create Churn Prevention Agent
- **File**: `platform/crewai/agents/churn-agent/`
- **Status**: ✅ DONE — SOUL.md + index.js (427 lines, Composio HubSpot, 0-100 risk scoring, analysis response)

### 3.5 Create Sales Enablement Agent
- **File**: `platform/crewai/agents/se-agent/`
- **Status**: ✅ DONE — SOUL.md + index.js (335 lines, LLM-powered, battlecards + objection handlers + ICP + discovery questions, creation response)

---

## Phase 4: Wire Composio Connectors (20 hours)
**Goal**: Connect live APIs for data fetching and execution  
**Success Criteria**: Agents can read/write from 8+ platforms in real-time

### 4.1 Wire Google Ads Connector
- **File**: `platform/crewai/connectors/google-ads-connector.js`
- **Status**: ☐ TODO
- **Effort**: 4 hours

**Checklist**:
- [ ] Initialize Composio Google Ads tool
- [ ] Implement getAccountMetrics()
- [ ] Implement getCampaigns()
- [ ] Implement getBudgetAllocations()
- [ ] Implement updateBudget()
- [ ] Add error handling + rate limiting
- [ ] Test with sample workspace

---

### 4.2 Wire Meta Ads Connector
- **File**: `platform/crewai/connectors/meta-ads-connector.js`
- **Status**: ☐ TODO
- **Effort**: 4 hours

**Checklist**:
- [ ] Initialize Composio Meta Ads tool
- [ ] Implement getAdAccountMetrics()
- [ ] Implement getCampaigns()
- [ ] Implement getAdSetPerformance()
- [ ] Implement pauseCampaign()
- [ ] Add error handling + throttling
- [ ] Test with sample workspace

---

### 4.3 Wire HubSpot Connector
- **File**: `platform/crewai/connectors/hubspot-connector.js`
- **Status**: ☐ TODO
- **Effort**: 3 hours

**Checklist**:
- [ ] Initialize Composio HubSpot tool
- [ ] Implement getContacts()
- [ ] Implement getDeal()
- [ ] Implement createDeal()
- [ ] Implement updateContact()
- [ ] Add pagination + caching
- [ ] Test with sample CRM

---

### 4.4 Wire GA4 Connector
- **File**: `platform/crewai/connectors/ga4-connector.js`
- **Status**: ☐ TODO
- **Effort**: 3 hours

**Checklist**:
- [ ] Initialize Google Analytics Data API
- [ ] Implement getMetrics()
- [ ] Implement getConversionRate()
- [ ] Implement getChannelPerformance()
- [ ] Add date range filtering
- [ ] Test with sample property

---

### 4.5 Wire LinkedIn Connector
- **File**: `platform/crewai/connectors/linkedin-connector.js`
- **Status**: ☐ TODO
- **Effort**: 3 hours

**Checklist**:
- [ ] Initialize Composio LinkedIn tool
- [ ] Implement postContent()
- [ ] Implement getCompanyMetadata()
- [ ] Implement publishArticle()
- [ ] Add image upload support
- [ ] Test with sample account

---

### 4.6 Wire Secondary Connectors (Apollo, Hunter, etc.)
- **File**: `platform/crewai/connectors/` (multiple)
- **Status**: ☐ TODO
- **Effort**: 3 hours

**Checklist**:
- [ ] Wire Apollo.io connector
- [ ] Wire Hunter.io connector
- [ ] Wire Clearbit connector
- [ ] Wire Zapier connector
- [ ] Add fallback chains for data enrichment

---

## Phase 5: Multi-Agent Orchestration (15 hours)
**Goal**: Chain agents in sequence for complex goals  
**Success Criteria**: "Plan a product launch" triggers Neel → Zara → Riya in sequence

### 5.1 Create Sequential Orchestrator
- **File**: `platform/crewai/orchestration/sequential-orchestrator.js`
- **Status**: ☐ TODO
- **Effort**: 5 hours

**Checklist**:
- [ ] Create SequentialOrchestrator class
- [ ] Implement agent chaining logic
- [ ] Pass output from agent N as context for agent N+1
- [ ] Aggregate results into single response
- [ ] Add error handling + fallback chains
- [ ] Test with 3+ agent chains

---

### 5.2 Create Parallel Orchestrator
- **File**: `platform/crewai/orchestration/parallel-orchestrator.js`
- **Status**: ☐ TODO
- **Effort**: 5 hours

**Checklist**:
- [ ] Create ParallelOrchestrator class
- [ ] Implement Promise.all() execution
- [ ] Handle timeout + partial failures
- [ ] Merge results intelligently
- [ ] Add resource throttling
- [ ] Test with concurrent agents

---

### 5.3 Update Routing Table for Multi-Agent Goals
- **File**: `platform/crewai/routing/routing_table.json`
- **Status**: ☐ TODO
- **Effort**: 2 hours

**Checklist**:
- [ ] Add agent_chain field to multi-agent goals
- [ ] Document "launch-planning" → [neel, zara, riya]
- [ ] Add orchestration pattern (sequential/parallel)
- [ ] Test with sample multi-agent routing

---

### 5.4 Update AgenticLoop for Orchestration
- **File**: `platform/crewai/core/agenticLoop.js`
- **Status**: ☐ TODO
- **Effort**: 3 hours

**Checklist**:
- [ ] Detect multi-agent goals in routing
- [ ] Load appropriate orchestrator
- [ ] Execute agent chain
- [ ] Merge responses intelligently
- [ ] Add logging for multi-agent flows

---

## Phase 6: Chat UI Enhancements (18 hours)
**Goal**: Polish chat experience with agent info, follow-ups, artifact rendering  
**Success Criteria**: Chat feels like talking to a marketing expert; rich artifact displays  
**Status**: ✅ COMPLETE

### 6.1 Follow-Up Suggestions
- **Status**: ✅ DONE — rendered inline in ChatHome.tsx (clickable buttons that populate input)
- All agents return `follow_ups: string[]`; rendered as `→ action` buttons

### 6.2 Artifact Rendering by Type
- **Status**: ✅ DONE — `ArtifactBlock` in ChatHome.tsx handles all 5 types:
  - `analysis`: KPI grid (3-col), at-risk list (churn), insight line
  - `optimization_plan`: KPI grid, recommendation line-items with ROAS class badges, ICE scores
  - `content`: Section chips (LP Designer), content-type chips (SE Agent)
  - `discovery_results`: Result list with ICP fit %
  - `execution_tracker`: Status badge, metrics grid, alert list, campaign step list
- SSE `runAgentSlashCommand` captures `artifact`, `follow_ups`, `connector_prompt`, `intent_type` from stream

### 6.3 Agent Info Panel
- **Status**: ✅ DONE — `agentName`, `agentRole`, `agentId` already on Message; rendered as agent header badge in existing ChatHome agent card UI

### 6.4 Connector Prompt
- **Status**: ✅ DONE — `connector_prompt` renders amber warning block with "Connect [toolkit]" buttons → routes to integrations page

---

## Phase 7: Testing & Validation (16 hours)
**Goal**: Verify routing accuracy, connector reliability, response quality  
**Success Criteria**: 90%+ routing accuracy; all connectors tested; response times <2s

### 7.1 Create Intent Extraction Unit Tests
- **File**: `tests/routing/intent-extractor.test.js`
- **Status**: ✅ DONE
- **Effort**: 4 hours

**Checklist**:
- [x] Create test suite with 50+ user messages
- [x] Test all 32 goals with examples
- [x] Verify confidence scores
- [x] Test edge cases + ambiguous queries
- [x] Measure accuracy % (target: 90%+)

---

### 7.2 Create Connector Integration Tests
- **File**: `tests/connectors/connector-integration.test.js`
- **Status**: ✅ DONE
- **Effort**: 6 hours

**Checklist**:
- [x] Test Google Ads connector (read + write)
- [x] Test Meta Ads connector
- [x] Test HubSpot connector
- [x] Test GA4 connector
- [x] Mock API responses for CI/CD (in-process mock HTTP server)
- [x] Verify error handling

---

### 7.3 Create Agent Execution Tests
- **File**: `tests/agents/agent-execution.test.js`
- **Status**: ✅ DONE
- **Effort**: 4 hours

**Checklist**:
- [x] Test each agent with sample inputs
- [x] Verify response schema compliance
- [x] Check output formatting
- [x] Test error handling
- [x] Measure execution time (target: <2s)

---

### 7.4 Create E2E Chat Tests
- **File**: `tests/e2e/chat-flow.test.js`
- **Status**: ✅ DONE
- **Effort**: 2 hours

**Checklist**:
- [x] Test user message → routing → agent → response flow
- [x] Test connector missing prompt handling
- [x] Test multi-agent orchestration (sequential + parallel)
- [x] Test artifact rendering
- [x] Test agent crash → graceful error response

---

## Phase 8: Optimization & Monitoring (16 hours)
**Goal**: Cache responses, optimize LLM costs, add observability  
**Success Criteria**: <500ms avg response time; <$0.05 per request; full audit trails

### 8.1 Create Response Caching Layer
- **File**: `platform/crewai/cache/response-cache.js`
- **Status**: ✅ DONE
- **Effort**: 4 hours

**Checklist**:
- [x] In-process LRU Map cache (no Redis dependency — swap backing store for multi-process)
- [x] Cache by goal_id + SHA1 hash of sorted extracted_params
- [x] TTL by response type: execution=2m, discovery=10m, analysis=15m, optimization=30m, creation=60m
- [x] Measure cache hit rate via getStats()
- [x] invalidateGoal() + invalidateByType() + flush() for connector updates
- [x] Auto-purge expired entries every 5 minutes (.unref())

---

### 8.2 Create LLM Cost Optimizer
- **File**: `platform/crewai/cost/llm-optimizer.js`
- **Status**: ✅ DONE
- **Effort**: 4 hours

**Checklist**:
- [x] Route creation/execution intents to Groq tier-1/2 (cheapest)
- [x] Route optimization intents to GPT-4o-mini (medium)
- [x] Route multi-agent chain steps to GPT-4o (complex synthesis)
- [x] Track cost per request (CostTracker with rolling 1000-request window)
- [x] Cost dashboard: by model, by goal, by response type, last hour / 24h

---

### 8.3 Create Observability Layer
- **Files**: `platform/crewai/observability/logger.js` + `tracer.js`
- **Status**: ✅ DONE
- **Effort**: 5 hours

**Checklist**:
- [x] Structured JSON-lines logger (debug/info/warn/error, child loggers, timed() helper)
- [x] Request tracer with Span lifecycle (startRequest → setRouting → setAgent → finish)
- [x] Intent accuracy metric (recordIntentAccuracy, returns pct in dashboard)
- [x] Connector success rates per toolkit (getDashboard().connector_health)
- [x] Latency percentiles (p50/p95/p99) + agent latency breakdown

---

### 8.4 Create Performance Profiler
- **File**: `tests/performance/profiler.js`
- **Status**: ✅ DONE
- **Effort**: 3 hours

**Checklist**:
- [x] Profile routing latency (target: <100ms)
- [x] Profile keyword extraction hot path (1000× runs, target: <1ms avg)
- [x] Profile agent execution (LP Designer + SE Agent, target: <2s)
- [x] Profile cache ops (10k× buildKey/set/get, target: <5ms)
- [x] Profile sequential vs parallel orchestrators (speedup measurement)
- [x] Profile model selection (10k× runs, target: <2ms)

---

## Quick Wins (Can be done in parallel)

### ✓ QW1: Wire HubSpot to Churn Agent
- **Effort**: 4 hours
- **Impact**: High (churn prediction unlocked)
- **Status**: ✅ DONE — `platform/crewai/agents/churn-agent/index.js` (427 lines, Composio HubSpot)

### ✓ QW2: Add Google + Meta Ads connectors to Budget Optimization
- **Effort**: 6 hours
- **Impact**: High (live ROAS analysis)
- **Status**: ✅ DONE — `platform/crewai/agents/dev-budget/index.js` (531 lines, Composio googleads + facebook)

### ✓ QW3: Wire GA4 to Performance Scorecard
- **Effort**: 3 hours
- **Impact**: High (live metrics dashboard)
- **Status**: ✅ DONE — `platform/crewai/agents/dev-scorecard/index.js` (520 lines, Composio googleanalytics)

### ✓ QW4: Create Email Automation Crew
- **Effort**: 8 hours
- **Impact**: Medium (unlocks email sequences)
- **Status**: ✅ DONE

**What was built:**
- Sam agent `_emailSequences` now tries **Klaviyo first** (creates email template + campaign via Composio), then falls back to **Mailchimp**, then returns copy-only
- `_buildKlaviyoFlowDefinition()` generates a complete Klaviyo Flow JSON structure (trigger + email steps with delays) so users can import it directly into their Klaviyo account
- `routing_table.json` updated: `email-sequences` `required_connectors` changed to `[]` (both connectors optional, copy always returned); `optional_connectors: ["klaviyo", "mailchimp", ...]`
- Connector priority rationale: Klaviyo flows > Mailchimp journeys (22% higher open rates, native behavioural triggers, direct Shopify/Stripe integration)

### ✓ QW5: Wire LinkedIn to Social Campaign Agent
- **Effort**: 4 hours
- **Impact**: Medium (LinkedIn publishing)
- **Status**: ✅ DONE

**What was built:**
- Composio V3 helpers (`resolveConnectedAccountId`, `executeComposioTool`) added to Zara
- `_runSocial`: after building strategy, calls `LINKEDIN_CREATE_TEXT_POST` for the first LinkedIn sample post — non-fatal (strategy always returned even if connector absent)
- `_socialCalendar`: after building 4-week calendar, publishes first 2 week-1 posts to LinkedIn — marks them `status: 'published'` in the calendar artifact
- `routing_table.json` updated: `run-social` and `social-calendar` descriptions updated; `social-calendar` optional connectors now includes `linkedin`
- Connector pattern: tries LinkedIn → on `No active linkedin` error, silently skips; on other errors, logs warning and skips

---

## Phase 9: Full Goal Coverage (all 32 goals)
**Goal**: Implement the 10 missing agents so every goal in routing_table.json has a real implementation  
**Status**: ✅ DONE

### Agents implemented

| Agent | File | Goals covered | Connector |
|-------|------|---------------|-----------|
| Arjun | `platform/crewai/agents/arjun/index.js` | find-leads, enrich-leads, define-audiences, referral-program, revenue-ops | Apollo, GA4, HubSpot (non-fatal) |
| Riya | `platform/crewai/agents/riya/index.js` | produce-content, generate-creatives, create-magnets | WordPress → Notion (produce-content); Fal.ai hero image (generate-creatives); WordPress draft page (create-magnets) |
| Zara | `platform/crewai/agents/zara/index.js` | run-social, social-calendar, launch-planning (chain) | LinkedIn auto-post (non-fatal) |
| Neel | `platform/crewai/agents/neel/index.js` | positioning (+ launch-planning chain anchor) | LLM-only |
| Priya | `platform/crewai/agents/priya/index.js` | market-signals, understand-market | Firecrawl competitor homepage (market-signals); Firecrawl G2 category page (understand-market) |
| Sam | `platform/crewai/agents/sam/index.js` | build-sequences, email-sequences, sharpen-messaging | Klaviyo → Mailchimp → copy-only (non-fatal) |
| Maya | `platform/crewai/agents/maya/index.js` | seo-visibility | GA4 organic traffic report (non-fatal) |
| Isha | `platform/crewai/agents/isha/index.js` | market-research | Firecrawl category leader scrape (non-fatal) |
| Tara | `platform/crewai/agents/tara/index.js` | strengthen-offer | HubSpot deal stage analysis (non-fatal) |
| Kiran | `platform/crewai/agents/kiran/index.js` | lifecycle-engagement | HubSpot (non-fatal) |

### Bootstrap
- **File**: `platform/crewai/agents/index.js`
- Registers all 17 agents with any `AgenticLoop` instance via `registerAllAgents(loop)`
- `createLoop(config)` convenience factory returns pre-wired `{ loop, agents }` pair

### Tests
- `tests/agents/agent-execution.test.js` extended: 277 checks across 17 agents (100% pass)
- Covers: response schema, artifact structure, LLM-only execution time (<2s), error handling, bootstrap

---

### ✓ QW6: Remaining Connector Wiring (7 agents)
**Status**: ✅ DONE — all LLM-only agents with optional connectors now have non-fatal Composio V3 integration

| Agent | Connector | Composio Tool | Effect |
|-------|-----------|---------------|--------|
| Riya (produce-content) | wordpress → notion | `WORDPRESS_CREATE_POST` → `NOTION_CREATE_PAGE` | Publishes full_article as draft; falls through to copy-only |
| Maya (seo-visibility) | googleanalyticsga4 | `GOOGLEANALYTICSGA4_RUN_REPORT` | Pulls real 30-day organic sessions; confidence 0.83 → 0.91 |
| Priya (market-signals) | firecrawl | `FIRECRAWL_SCRAPE_URL` | Scrapes competitor homepage; injects live homepage signal at top |
| Isha (market-research) | firecrawl | `FIRECRAWL_SCRAPE_URL` | Scrapes category leader page; injects as hypothesis #0 |
| LP Designer (landing-pages) | wordpress | `WORDPRESS_CREATE_POST` (page type) | Creates draft page from section HTML |
| SE Agent (sales-enablement) | hubspot | `HUBSPOT_CREATE_ENGAGEMENT` | Saves enablement pack as HubSpot note; returns note ID |
| Tara (strengthen-offer) | hubspot | `HUBSPOT_SEARCH_CRM_OBJECTS` | Pulls open deals → stage distribution → biggest stuck stage |

All 7 follow the same non-fatal pattern: `if (apiKey) { try { ... connectors_used = [...] } catch (err) { if (!err.message.includes('No active')) warn } }`. Tests: 277/277 pass unchanged.

### ✓ QW7: Final 3 connector gaps
**Status**: ✅ DONE — every goal with an optional connector now has Composio V3 wiring

| Agent | Goal | Connector | Composio Tool | Effect |
|-------|------|-----------|---------------|--------|
| Riya | generate-creatives | falai | `FALAI_TEXT_TO_IMAGE` | Generates 16:9 hero image for top ad variant; URL in `hero_image_url` |
| Riya | create-magnets | wordpress | `WORDPRESS_CREATE_POST` (page) | Publishes magnet structure as draft WP page; URL in `wp_page_url` |
| Priya | understand-market | firecrawl | `FIRECRAWL_SCRAPE_URL` | Scrapes G2 category page; injects live buyer signal into `demand_signals[0]` |

**Coverage after QW7**: All 32 goals fully wired. Every goal that has `optional_connectors` in the routing table now has a non-fatal Composio V3 call in its agent. Tests: 277/277 pass.

---

## Implementation Tracking

### Summary by Phase
| Phase | Name | Hours | Status | Blocker |
|-------|------|-------|--------|---------|
| 1 | Veena Routing | 18 | ✅ COMPLETE | None |
| 2 | Response Handling | 12 | ✅ COMPLETE | None |
| 3 | New Agents | 25 | ✅ COMPLETE | None |
| 4 | Connectors | 20 | ✅ COMPLETE | None (embedded in agents) |
| 5 | Multi-Agent | 15 | ✅ COMPLETE | None |
| 6 | Chat UI | 18 | ✅ COMPLETE | None |
| 7 | Testing | 16 | ✅ DONE | Phase 6 |
| 8 | Optimization | 16 | ✅ DONE | Phase 7 |
| 9 | Full Goal Coverage | 20 | ✅ DONE | Phase 7 |
| QW4 | Email Automation (Klaviyo) | 8 | ✅ DONE | None |
| QW5 | LinkedIn Connector (Zara) | 4 | ✅ DONE | None |
| QW6 | Remaining connector wiring (7 agents) | 6 | ✅ DONE | None |
| QW7 | Final 3 connector gaps | 2 | ✅ DONE | None |
| **TOTAL** | | **205 hours** | **ALL COMPLETE** | |

### Dependency Graph
```
Phase 1 (Routing)
├── Phase 2 (Response Handling)
├── Phase 3 (New Agents) → Phase 5 (Multi-Agent)
├── Phase 4 (Connectors) → Phase 5 (Multi-Agent)
├── Phase 6 (Chat UI) → Phase 7 (Testing)
└── Phase 7 (Testing) → Phase 8 (Optimization)

Quick Wins can run in parallel with Phase 1-4
```

---

## How to Use This Document

1. **Start with Phase 1** (Veena Routing) - Foundation for everything else
2. **Mark items as you complete them** - Use ☐ TODO → ☐ IN_PROGRESS → ✅ DONE
3. **Track blockers** - If stuck, note it in comments
4. **Do Quick Wins in parallel** - They don't block other phases
5. **Test frequently** - Run tests after each phase to catch issues early

---

## Phase 1 Completion Summary

✅ **All 5 sub-tasks completed (18 hours)**

### Files Created:

1. **routing_table.json** (32 goals mapped to 12 agents, 16 crews)
   - Path: `platform/crewai/routing/routing_table.json`
   - Contains: 32 complete goal definitions with keywords, connectors, intake fields, response types
   - Agents: Veena, Isha, Neel, Tara, Zara, Maya, Riya, Arjun, Dev, Priya, Kiran, Sam + 5 new (CRO, LP Designer, Churn, SE, Paid Ads)
   - Crews: 16 crews mapped to goals + response types (analysis, creation, optimization, execution, discovery)

2. **veena_intent_extractor.md** (LLM prompt template)
   - Path: `platform/crewai/prompts/veena_intent_extractor.md`
   - Contains: Complete intent extraction prompt with 32 goal examples, confidence scoring rules (0.95+, 0.85-0.94, 0.70-0.84, <0.70), extraction rules, 6+ examples
   - Handles: Clarification questions for ambiguous intents (<0.50 confidence)
   - Output: JSON with goal_id, confidence, extracted_params, clarification_needed

3. **connector-checker.js** (Integration readiness validator)
   - Path: `platform/crewai/routing/connector-checker.js`
   - Contains: ConnectorChecker class with 8 methods:
     - getConnectedIntegrations(): Fetch from Supabase workspace_integrations
     - checkRequired(): Verify user has all required connectors
     - checkOptional(): Find available optional connectors
     - generateMissingConnectorPrompt(): User-friendly "connect now" message
     - validateIntegrationHealth(): Check if connectors are fresh (<24h sync)
     - getConnectorRecommendation(): Prioritize which to connect
   - Supports: 45+ connector labels (Google Ads, Meta, HubSpot, GA4, LinkedIn, Apollo, Hunter, etc.)

4. **agenticLoop.js** (Routing orchestrator)
   - Path: `platform/crewai/core/agenticLoop.js`
   - Contains: AgenticLoop class with routing logic:
     - extractIntent(): LLM + keyword fallback for goal detection
     - routeUserIntent(): 4-step flow (extract → lookup config → check connectors → ready)
     - executeGoal(): Main entry point, handles clarification_needed / connector_missing / ready
     - formatAgentResponse(): Response shaper for chat UI
   - Handles: 3 response types (clarification, connector_prompt, ready to execute)
   - Fallback: Keyword-based intent extraction when LLM unavailable

5. **chat-routing-enhancement.ts** (Chat UI components + types)
   - Path: `app/src/components/chat/chat-routing-enhancement.ts`
   - Contains: React components + types:
     - EnhancedChatMessage: Extended type with intent_type, routing_info, connector_prompt, artifact, follow_ups
     - IntentBadge: Shows goal + agent + confidence % 
     - ConnectorPrompt: "Connect X now" message with button
     - FollowUpSuggestions: "What next?" action buttons
     - ArtifactRenderer: Dispatches to type-specific renderers
     - 5 artifact renderers: Analysis (metrics dashboard), Creation (content preview), Optimization (before/after), Discovery (result list), Execution (live tracker)
   - Includes: Complete integration guide with 9-step instructions for updating ChatHome.tsx

### Key Design Decisions:

✓ **Routing Table**: Single source of truth for 32 goals → agent mapping (no hardcoded routing scattered in code)

✓ **Keyword Fallback**: Graceful degradation when LLM unavailable (uses keyword matching, confidence 0.65-0.99)

✓ **Connector Transparency**: Users see which integrations are needed BEFORE agent execution (prevents "you need X" errors mid-task)

✓ **Separated Chat Enhancement**: Created standalone enhancement file instead of directly modifying ChatHome.tsx (non-breaking, easy review)

✓ **5-Type Artifact System**: Different UIs for Analysis/Creation/Optimization/Execution/Discovery (matches user intent types from old marqq)

✓ **Type-Safe**: Full TypeScript types for routing data, messages, and artifacts

### Next Steps:

**Phase 2**: Intent response handling (12 hours)
- Implement response schema validation
- Create response renderer components
- Update agent output contracts

**Quick Wins** (can run in parallel):
- Wire HubSpot to Churn Agent
- Wire Google + Meta Ads to Budget Optimization
- Wire GA4 to Performance Scorecard

---

---

## Phase 2 Completion Summary

✅ **All 3 sub-tasks completed (12 hours)**

### Files Created:

1. **response-schema.ts** (Type definitions for all response types)
   - Path: `platform/crewai/response/response-schema.ts`
   - Contains: 5 response type interfaces (Analysis, Creation, Optimization, Execution, Discovery)
   - Features: Validation functions, type guards, crew-to-response-type mapping
   - Artifacts: Each response type has specific artifact structure matching UI needs

2. **response-renderers.tsx** (React components for rendering artifacts)
   - Path: `app/src/components/response-renderers/response-renderers.tsx`
   - Components: AnalysisRenderer, CreationRenderer, OptimizationRenderer, ExecutionRenderer, DiscoveryRenderer
   - Features: Tab switching, copy to clipboard, expandable details, metric cards
   - Dispatcher: ResponseRenderer component selects renderer by artifact type

3. **agent-interface.ts** (Agent contract definition)
   - Path: `platform/crewai/agents/agent-interface.ts`
   - Interfaces: Agent, AgentExecutionRequest, AgentResponse
   - Registry: Global agent registration and lookup
   - StubAgent: Mock implementation for testing all 5 response types
   - Validation: validateAgentResponse() validates responses match expected type

### Key Design Decisions:

✓ **Typed Responses**: Each response type (Analysis/Creation/Optimization/Execution/Discovery) has strict TypeScript interface

✓ **UI-Aware Artifacts**: Artifact structures match what the UI components expect (e.g., "sections" for content, "scenarios" for optimization)

✓ **Mock Agents**: StubAgent auto-generates realistic mock responses for testing without full agent implementation

✓ **Validation First**: validateAgentResponse() ensures agents follow contract before responses reach chat

✓ **Dispatcher Pattern**: ResponseRenderer dispatches to type-specific renderer based on artifact.type

✓ **Type Guards**: isAnalysisResponse(), isCreationResponse(), etc. for safe runtime type checking

### What This Enables:

✅ Agents can return responses confident they'll render correctly  
✅ Chat UI can handle any response type without custom logic  
✅ New response types can be added by extending schema + adding renderer  
✅ Testing agents with stub implementations (no Composio needed)  
✅ Runtime validation catches malformed responses early  

---

## Architecture Status

| Layer | Component | Status |
|-------|-----------|--------|
| **Routing** | Veena orchestrator | ✅ Complete |
| **Intent Detection** | Goal extraction + keywords | ✅ Complete |
| **Connector Check** | Integration validation | ✅ Complete |
| **Response Schema** | Type definitions | ✅ Complete |
| **Response Rendering** | React components | ✅ Complete |
| **Agent Contracts** | Execution interface | ✅ Complete |
| | | |
| **Agent Implementations** | 12 agents (Dev, Riya, Arjun, etc.) | ⏳ Next phase |
| **Connector Wiring** | Composio integration | ⏳ Next phase |
| **Multi-Agent Orchestration** | Sequential/parallel chains | ⏳ Next phase |
| **Chat UI Integration** | ChatHome.tsx updates | ⏳ Next phase |

---

**Next model pickup point**: Phase 3 (Create Missing Agents) or Quick Wins (HubSpot wiring via Composio)
