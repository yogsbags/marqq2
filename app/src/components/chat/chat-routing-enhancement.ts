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

// This file is currently an integration note and is not imported by ChatHome.
// Keep these exports JSX-free so the `.ts` file remains valid TypeScript.
export type IntentBadgeProps = {
  intent_type?: string;
  confidence?: number;
  agent?: string;
};

export type ConnectorPromptProps = {
  prompt: EnhancedChatMessage['connector_prompt'];
  onConnect: (connectors: string[]) => void;
};

export type FollowUpSuggestionsProps = {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
};

export type ArtifactRendererProps = {
  artifact: EnhancedChatMessage['artifact'];
  intent_type?: string;
};

export function IntentBadge(_props: IntentBadgeProps) {
  return null;
}

export function ConnectorPrompt(_props: ConnectorPromptProps) {
  return null;
}

export function FollowUpSuggestions(_props: FollowUpSuggestionsProps) {
  return null;
}

export function ArtifactRenderer(_props: ArtifactRendererProps) {
  return null;
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
