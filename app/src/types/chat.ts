// ── Workflow orchestration types ──────────────────────────────────────────────

export type WorkflowState =
  | 'gathering_inputs'      // Veena is asking workflow-specific questions
  | 'awaiting_confirmation' // Summary shown, waiting for user OK
  | 'executing';            // Agent/module is running

export interface WorkflowFormOption {
  value: string;
  label: string;
}

export interface WorkflowFormField {
  id: string;
  label: string;
  type: 'text' | 'select';
  options?: WorkflowFormOption[];
  placeholder?: string;
  required?: boolean;
}

export interface WorkflowFormData {
  moduleId: string;
  moduleName: string;
  prompt: string;           // e.g. "To get the best from Revenue Ops, tell me a bit more:"
  fields: WorkflowFormField[];
}

// ── Core chat types ───────────────────────────────────────────────────────────

export interface Message {
  id: string;
  content: string;
  reasoning?: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  file?: {
    name: string;
    size: number;
    type: string;
    url?: string;
  };
  // Set when the message is from a specialist subagent (not Veena)
  agentName?: string;
  agentRole?: string;
  agentId?: string;
  // Live tool-call status line (Helena-style: "Working on google_analytics…")
  // Cleared when the agent run completes; rendered as a faint status indicator.
  toolStatus?: string;

  // ── Workflow orchestration fields ─────────────────────────────────────────
  // When set, the message renders a workflow input form instead of text
  workflowForm?: WorkflowFormData;
  workflowState?: WorkflowState;
  // Collected param values — used in 'awaiting_confirmation' state
  workflowParams?: Record<string, string>;
}

export interface Conversation {
  id: string;
  name: string;          // auto-named from first user message (first 40 chars)
  createdAt: Date;
  lastMessageAt: Date;
  messages: Message[];
  // ── Channel routing ──────────────────────────────────────────────────────
  channelId?: string;    // e.g. 'revenue-ops', 'seo-llmo', 'main'
}

export interface Task {
  id: string;
  label: string;
  completed: boolean;
  horizon: 'day' | 'week' | 'month';
  createdAt: Date;
  completedAt?: Date;
  source: 'manual' | 'ai';
}
