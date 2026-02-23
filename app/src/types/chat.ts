export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  file?: {
    name: string;
    size: number;
    type: string;
    url?: string;
  };
}

export interface Conversation {
  id: string;
  name: string;          // auto-named from first user message (first 40 chars)
  createdAt: Date;
  lastMessageAt: Date;
  messages: Message[];
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
