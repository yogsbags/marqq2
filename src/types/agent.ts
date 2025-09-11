export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<any>;
}

export interface AgentMemory {
  shortTerm: Record<string, any>;
  longTerm: Record<string, any>;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
}

export interface AgentTask {
  id: string;
  type: 'lead_analysis' | 'content_generation' | 'campaign_optimization' | 'customer_segmentation';
  description: string;
  input: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  tools: AgentTool[];
  memory: AgentMemory;
  isActive: boolean;
  currentTask?: AgentTask;
  completedTasks: AgentTask[];
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  agents: Agent[];
  tasks: AgentTask[];
  status: 'idle' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}