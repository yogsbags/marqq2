# Chat-First Home Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the module-card dashboard with a permanent three-column layout — sidebar (with collapsible conversation history under Home) | full-height ChatGPT-style chat | persistent Taskboard.

**Architecture:** Extract ChatPanel overlay logic into a standalone `ChatHome` component that occupies the center column. Add `Taskboard` as a fixed-width right column in `MainLayout`. Add `ConversationHistory` as a collapsible list under the Home sidebar item. Persist conversations and tasks in `localStorage`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Button, ScrollArea, Tabs, Input, Separator), Groq (existing service), localStorage

**Design doc:** `docs/plans/2026-02-23-chat-home-layout-design.md`

---

## Files Overview

| Action | Path |
|---|---|
| Create | `app/src/types/chat.ts` |
| Create | `app/src/components/taskboard/TaskItem.tsx` |
| Create | `app/src/components/taskboard/Taskboard.tsx` |
| Create | `app/src/components/chat/ChatHome.tsx` |
| Create | `app/src/components/chat/ConversationHistory.tsx` |
| Modify | `app/src/components/layout/Sidebar.tsx` |
| Modify | `app/src/components/layout/MainLayout.tsx` |
| Modify | `app/src/App.tsx` |

---

## Task 1: Shared Types

**Files:**
- Create: `app/src/types/chat.ts`

**Step 1: Write the types file**

```typescript
// app/src/types/chat.ts

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
```

**Step 2: Verify no TypeScript errors**

```bash
cd /Users/yogs87/Downloads/sanity/projects/martech && npm run typecheck 2>&1 | tail -5
```
Expected: `Found 0 errors`

**Step 3: Commit**

```bash
git add app/src/types/chat.ts
git commit -m "feat: add Conversation and Task types for chat-first layout"
```

---

## Task 2: TaskItem Component

**Files:**
- Create: `app/src/components/taskboard/TaskItem.tsx`

**Step 1: Write TaskItem**

```tsx
// app/src/components/taskboard/TaskItem.tsx
import { cn } from '@/lib/utils';
import type { Task } from '@/types/chat';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
}

export function TaskItem({ task, onToggle }: TaskItemProps) {
  return (
    <div
      className="flex items-start gap-2 py-1.5 px-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-900/10 group cursor-pointer"
      onClick={() => onToggle(task.id)}
    >
      {/* Toggle circle / checkmark */}
      <div className={cn(
        "mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
        task.completed
          ? "bg-orange-500 border-orange-500"
          : "border-gray-400 group-hover:border-orange-400"
      )}>
        {task.completed && (
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      <span className={cn(
        "text-sm leading-snug flex-1",
        task.completed
          ? "line-through text-gray-400 dark:text-gray-600"
          : "text-gray-700 dark:text-gray-300"
      )}>
        {task.label}
      </span>

      {task.source === 'ai' && (
        <span className="text-[10px] text-orange-500 opacity-70 mt-0.5 flex-shrink-0">AI</span>
      )}
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add app/src/components/taskboard/TaskItem.tsx
git commit -m "feat: add TaskItem component"
```

---

## Task 3: Taskboard Component

**Files:**
- Create: `app/src/components/taskboard/Taskboard.tsx`

**Step 1: Write Taskboard**

```tsx
// app/src/components/taskboard/Taskboard.tsx
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TaskItem } from './TaskItem';
import type { Task } from '@/types/chat';

type Horizon = 'day' | 'week' | 'month';

const STORAGE_KEY = 'torqq_tasks';

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Task[];
    return parsed.map(t => ({
      ...t,
      createdAt: new Date(t.createdAt),
      completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
    }));
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function Taskboard() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [horizon, setHorizon] = useState<Horizon>('day');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const visibleTasks = tasks.filter(t => t.horizon === horizon);

  const toggleTask = useCallback((id: string) => {
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === id
          ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date() : undefined }
          : t
      );
      saveTasks(updated);
      return updated;
    });
  }, []);

  const addTask = () => {
    const label = newLabel.trim();
    if (!label) return;
    const task: Task = {
      id: `task-${Date.now()}`,
      label,
      completed: false,
      horizon,
      createdAt: new Date(),
      source: 'manual',
    };
    setTasks(prev => {
      const updated = [...prev, task];
      saveTasks(updated);
      return updated;
    });
    setNewLabel('');
    setAdding(false);
  };

  const pending = visibleTasks.filter(t => !t.completed);
  const completed = visibleTasks.filter(t => t.completed);

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col border-l bg-white dark:bg-gray-950 h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Tasks</h2>

        {/* Horizon tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
          {(['day', 'week', 'month'] as Horizon[]).map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={cn(
                "flex-1 text-xs py-1 rounded-md font-medium transition-colors capitalize",
                horizon === h
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1 px-3">
        {pending.length === 0 && completed.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-8">No tasks for this {horizon}</p>
        ) : (
          <>
            {pending.map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggleTask} />
            ))}
            {completed.length > 0 && pending.length > 0 && (
              <div className="border-t my-2" />
            )}
            {completed.map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggleTask} />
            ))}
          </>
        )}
      </ScrollArea>

      {/* Add task */}
      <div className="px-3 pb-4 pt-2 border-t">
        {adding ? (
          <div className="flex gap-1">
            <Input
              autoFocus
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addTask();
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
              }}
              placeholder="Task name…"
              className="h-7 text-xs"
            />
            <Button size="sm" className="h-7 px-2 bg-orange-500 hover:bg-orange-600 text-white text-xs" onClick={addTask}>Add</Button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-600 hover:text-orange-500 dark:hover:text-orange-400 transition-colors w-full"
          >
            <span className="text-base leading-none">+</span>
            <span>Add task</span>
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Export from taskboard index**

Create `app/src/components/taskboard/index.ts`:
```typescript
export { Taskboard } from './Taskboard';
export { TaskItem } from './TaskItem';
```

**Step 3: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add app/src/components/taskboard/
git commit -m "feat: add Taskboard component with day/week/month horizon filter"
```

---

## Task 4: ChatHome Component

The core of the layout — a permanent full-height chat view. This is **ChatPanel minus the overlay shell**.

**Files:**
- Create: `app/src/components/chat/ChatHome.tsx`

**What changes from ChatPanel:**
- Remove `isOpen`/`onClose` props — ChatHome is always mounted
- Remove `position: fixed`, `transform translate-x`, backdrop, close button
- Remove the outer slide-in shell; render the inner chat content directly
- Keep ALL message logic, Groq calls, slash commands, file upload, markdown rendering
- Add conversation session management (auto-name from first message, save to localStorage)
- Accept an optional `activeConversationId` prop so Sidebar history clicks load sessions

**Step 1: Write ChatHome (key structural parts shown — full 1:1 migration of inner logic)**

```tsx
// app/src/components/chat/ChatHome.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  HiPaperAirplane as Send,
  HiChat as Bot,
  HiUser as User,
  HiTrash as Trash2,
  HiPaperClip as Paperclip,
} from 'react-icons/hi';
import { cn } from '@/lib/utils';
import { GroqService } from '@/services/groqService';
import { toast } from 'sonner';
import type { Message, Conversation } from '@/types/chat';

// Re-use all SLASH_COMMANDS, detectGuidedGoal, markdownToRichText, FormattedMessage
// from ChatPanel.tsx verbatim — copy those definitions here.

const CONV_KEY = 'torqq_conversations';

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.map(c => ({
      ...c,
      createdAt: new Date(c.createdAt),
      lastMessageAt: new Date(c.lastMessageAt),
      messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(CONV_KEY, JSON.stringify(convs));
}

function generateName(firstUserMessage: string): string {
  return firstUserMessage.trim().slice(0, 40) || 'New conversation';
}

interface ChatHomeProps {
  onModuleSelect?: (moduleId: string | null) => void;
  activeConversationId?: string | null;
  onConversationsChange?: () => void;
}

export function ChatHome({ onModuleSelect, activeConversationId, onConversationsChange }: ChatHomeProps) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm your AI assistant. Ask me anything or type a task to get started.",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // ... (rest of state: showSuggestions, filteredCommands, selectedFile, etc.)
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation when activeConversationId changes
  useEffect(() => {
    if (!activeConversationId) return;
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      setMessages(conv.messages);
      setCurrentConvId(conv.id);
    }
  }, [activeConversationId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const persistMessages = useCallback((msgs: Message[], convId: string | null) => {
    setConversations(prev => {
      let updated: Conversation[];
      if (convId) {
        updated = prev.map(c =>
          c.id === convId
            ? { ...c, messages: msgs, lastMessageAt: new Date() }
            : c
        );
      } else {
        // Create new conversation named from first user message
        const firstUserMsg = msgs.find(m => m.sender === 'user');
        if (!firstUserMsg) return prev;
        const newConv: Conversation = {
          id: `conv-${Date.now()}`,
          name: generateName(firstUserMsg.content),
          createdAt: new Date(),
          lastMessageAt: new Date(),
          messages: msgs,
        };
        setCurrentConvId(newConv.id);
        updated = [newConv, ...prev];
      }
      saveConversations(updated);
      return updated;
    });
    onConversationsChange?.();
  }, [onConversationsChange]);

  const handleSendMessage = async () => {
    // ... (same logic as ChatPanel.handleSendMessage)
    // After updating messages, call persistMessages(newMessages, currentConvId)
  };

  const handleNewConversation = () => {
    setCurrentConvId(null);
    setMessages([{
      id: Date.now().toString(),
      content: "Hello! I'm your AI assistant. Ask me anything or type a task to get started.",
      sender: 'ai',
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map(message => (
            <div key={message.id} className={cn(
              "flex gap-3",
              message.sender === 'user' ? "justify-end" : "justify-start"
            )}>
              {message.sender === 'ai' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-orange-500 text-white">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5",
                message.sender === 'user'
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              )}>
                <FormattedMessage content={message.content} isAI={message.sender === 'ai'} />
              </div>
              {message.sender === 'user' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gray-200 dark:bg-gray-700">
                    <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-orange-500 text-white">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2.5">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input bar — pinned at bottom */}
      <div className="border-t px-4 py-3 bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto">
          {/* Slash command suggestions (same as ChatPanel) */}
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Ask or type a task…"
              className="flex-1 rounded-xl border-gray-200 dark:border-gray-700 focus:border-orange-400"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isTyping}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

> **Implementation note:** Copy ALL logic from `ChatPanel.tsx` verbatim:
> `SLASH_COMMANDS`, `detectGuidedGoal`, `toActionPlanMessage`, `markdownToRichText`, `FormattedMessage`, `handleInputChange`, `executeSlashCommand`, `handleSendMessage`, `handleFileUpload` — then **remove** the overlay shell (`isOpen` check, `translate-x`, `fixed` positioning, close button).

**Step 2: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add app/src/components/chat/ChatHome.tsx
git commit -m "feat: add ChatHome — permanent full-height chat, no overlay"
```

---

## Task 5: ConversationHistory Component

**Files:**
- Create: `app/src/components/chat/ConversationHistory.tsx`

**Step 1: Write ConversationHistory**

```tsx
// app/src/components/chat/ConversationHistory.tsx
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/chat';

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (hours < 1) return `${minutes}m ago`;
  if (days < 1) return `${hours}h ago`;
  return `${days}d ago`;
}

interface ConversationHistoryProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationHistory({ conversations, activeId, onSelect }: ConversationHistoryProps) {
  if (conversations.length === 0) {
    return (
      <div className="ml-6 px-2 py-1">
        <p className="text-[11px] text-gray-400 dark:text-gray-600">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="ml-6 space-y-0.5">
      {conversations.slice(0, 10).map(conv => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={cn(
            "w-full text-left px-2 py-1 rounded-md transition-colors",
            "text-[11px] leading-snug",
            activeId === conv.id
              ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          )}
        >
          <span className="block truncate">{conv.name}</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-600">{relativeTime(conv.lastMessageAt)}</span>
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add app/src/components/chat/ConversationHistory.tsx
git commit -m "feat: add ConversationHistory list with relative timestamps"
```

---

## Task 6: Sidebar — Add History Toggle Under Home

**Files:**
- Modify: `app/src/components/layout/Sidebar.tsx`

**What changes:**
1. Add `historyOpen` state (default `true`)
2. Add `conversations` and `activeConversationId` props
3. Add `onConversationSelect` prop
4. The Home nav item gets a `▼/▶` arrow button on the right
5. When `historyOpen && !collapsed`, render `<ConversationHistory>` below Home

**Step 1: Modify Sidebar props interface**

In `Sidebar.tsx`, change:
```typescript
// OLD
interface SidebarProps {
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// NEW
import type { Conversation } from '@/types/chat';
import { ConversationHistory } from '@/components/chat/ConversationHistory';
import { HiChevronDown as ChevronDown, HiChevronRight as ChevronRight } from 'react-icons/hi';

interface SidebarProps {
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  conversations?: Conversation[];
  activeConversationId?: string | null;
  onConversationSelect?: (id: string) => void;
}
```

**Step 2: Add historyOpen state inside Sidebar function**

```typescript
const [historyOpen, setHistoryOpen] = useState(true);
```

**Step 3: Replace the Home item render block**

Find the render block for the Home item (`item.id === 'home'`) and change it to:

```tsx
{item.id === 'home' ? (
  <div key="home" className="space-y-1">
    <div className="flex items-center gap-1">
      <Button
        variant={isSelected ? "default" : "ghost"}
        className={cn(
          "flex-1 justify-start transition-all duration-200 hover:scale-[1.02]",
          collapsed ? "px-2" : "px-3 py-2.5",
          isSelected
            ? "bg-orange-500 text-white hover:bg-orange-600"
            : "bg-transparent text-gray-700 hover:bg-orange-50 hover:text-orange-700 dark:text-gray-300 dark:hover:bg-orange-900/20"
        )}
        onClick={() => onModuleSelect('home')}
      >
        <item.icon className={cn("h-4 w-4", collapsed ? "" : "mr-2")} />
        {!collapsed && <span className="font-medium text-left">Home</span>}
      </Button>

      {!collapsed && (
        <button
          onClick={() => setHistoryOpen(prev => !prev)}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={historyOpen ? "Collapse history" : "Expand history"}
        >
          {historyOpen
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />
          }
        </button>
      )}
    </div>

    {historyOpen && !collapsed && conversations && (
      <ConversationHistory
        conversations={conversations}
        activeId={activeConversationId ?? null}
        onSelect={(id) => {
          onConversationSelect?.(id);
          onModuleSelect('home');
        }}
      />
    )}
  </div>
) : (
  // ... existing render for all other nav items (unchanged)
)}
```

**Step 4: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```

**Step 5: Commit**

```bash
git add app/src/components/layout/Sidebar.tsx app/src/components/chat/ConversationHistory.tsx
git commit -m "feat: add conversation history toggle under Home in sidebar"
```

---

## Task 7: MainLayout — Three-Column Layout

**Files:**
- Modify: `app/src/components/layout/MainLayout.tsx`

**What changes:**
- Remove `chatOpen`, `chatMessages`, `ChatPanel`, `ChatToggle` state and imports
- Remove the overlay chat logic entirely
- Add `Taskboard` as a permanent right column
- Pass `conversations` and `onConversationSelect` down to `Sidebar`
- The center `{children}` area stays — but now sits between sidebar and taskboard

**Step 1: Replace MainLayout.tsx entirely**

```tsx
// app/src/components/layout/MainLayout.tsx
import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Taskboard } from '@/components/taskboard/Taskboard';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/chat';

interface MainLayoutProps {
  children: React.ReactNode;
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  // Passed down from App so Sidebar can show conversation history
  conversations: Conversation[];
  activeConversationId: string | null;
  onConversationSelect: (id: string) => void;
}

export function MainLayout({
  children,
  selectedModule,
  onModuleSelect,
  conversations,
  activeConversationId,
  onConversationSelect,
}: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left: Sidebar */}
      <Sidebar
        selectedModule={selectedModule}
        onModuleSelect={onModuleSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onConversationSelect={onConversationSelect}
      />

      {/* Center: Main content (chat home or module view) */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarCollapsed ? "ml-16" : "ml-72"
      )}>
        <DashboardHeader selectedModule={selectedModule} onModuleSelect={onModuleSelect} />

        <main className="flex-1 overflow-auto bg-gradient-to-br from-orange-50/30 via-white to-orange-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-300">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Right: Taskboard (always visible) */}
      <Taskboard />
    </div>
  );
}
```

> **Note:** The `DashboardHeader` becomes optional when `selectedModule` is null/home. If it clutters the chat view, it can be hidden with `{selectedModule !== null && selectedModule !== 'home' && <DashboardHeader ... />}` — use your judgement when implementing.

**Step 2: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add app/src/components/layout/MainLayout.tsx
git commit -m "feat: MainLayout becomes three-column layout with permanent Taskboard"
```

---

## Task 8: App.tsx — Wire ChatHome as Default View

**Files:**
- Modify: `app/src/App.tsx`

**What changes:**
1. Add `activeConversationId` state
2. Import `ChatHome`
3. `selectedModule === null` → render `ChatHome` (not `DashboardContent`)
4. `selectedModule === 'home'` → render `ChatHome` (not `HomePanel`)
5. Pass `conversations`, `activeConversationId`, `onConversationSelect` to `MainLayout`
6. Remove `DashboardContent` import (no longer the default view)

**Step 1: Add conversation state to Dashboard function**

```typescript
// Add inside Dashboard() function, alongside selectedModule state:
const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
const [conversations, setConversations] = useState<Conversation[]>(() => {
  try {
    const raw = localStorage.getItem('torqq_conversations');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.map(c => ({
      ...c,
      createdAt: new Date(c.createdAt),
      lastMessageAt: new Date(c.lastMessageAt),
      messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
});

const handleConversationSelect = (id: string) => {
  setActiveConversationId(id);
  setSelectedModule('home');
};

const handleConversationsChange = () => {
  // Re-read from localStorage to refresh sidebar history
  try {
    const raw = localStorage.getItem('torqq_conversations');
    if (raw) {
      const parsed = JSON.parse(raw) as Conversation[];
      setConversations(parsed.map(c => ({
        ...c,
        createdAt: new Date(c.createdAt),
        lastMessageAt: new Date(c.lastMessageAt),
        messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
      })));
    }
  } catch { /* ignore */ }
};
```

**Step 2: Update renderContent in Dashboard**

```typescript
// Replace the renderContent function:
const renderContent = () => {
  // Home and default both show ChatHome
  if (!selectedModule || selectedModule === 'home') {
    return (
      <ChatHome
        onModuleSelect={handleModuleSelect}
        activeConversationId={activeConversationId}
        onConversationsChange={handleConversationsChange}
      />
    );
  }
  if (selectedModule === 'settings') return <SettingsPanel />;
  if (selectedModule === 'help') return <HelpPanel />;
  if (currentModule) {
    return (
      <ModuleDetail
        module={currentModule}
        onBack={() => setSelectedModule(null)}
        autoStart={autoStartModule}
      />
    );
  }
  // Fallback: also show ChatHome (shouldn't reach here normally)
  return <ChatHome onModuleSelect={handleModuleSelect} onConversationsChange={handleConversationsChange} />;
};
```

**Step 3: Update MainLayout call to pass new props**

```tsx
return (
  <MainLayout
    selectedModule={selectedModule}
    onModuleSelect={handleModuleSelect}
    conversations={conversations}
    activeConversationId={activeConversationId}
    onConversationSelect={handleConversationSelect}
  >
    {renderContent()}
  </MainLayout>
);
```

**Step 4: Add required imports**

```typescript
import { ChatHome } from '@/components/chat/ChatHome';
import type { Conversation } from '@/types/chat';
```

**Step 5: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: `Found 0 errors`

**Step 6: Run a full build to confirm no broken imports**

```bash
npm run build 2>&1 | tail -10
```
Expected: `✓ built in` with no errors

**Step 7: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat: wire ChatHome as default home view, remove dashboard-card default"
```

---

## Final Verification

**Step 1: Start dev server and manually verify**

```bash
npm run dev
```

Open `http://localhost:5173` and verify:
- [ ] App loads → 3 columns visible: sidebar | chat | taskboard
- [ ] Input bar at bottom of center column
- [ ] Home item in sidebar has ▼ arrow
- [ ] Click ▼ → conversation history list appears below Home
- [ ] Send a message → appears in thread, AI responds
- [ ] Session appears in conversation history with auto-name
- [ ] Click history item → loads that conversation in center
- [ ] Click Day/Week/Month tabs in taskboard → filters change
- [ ] Click `+ Add task` → inline input, Enter to save
- [ ] Task appears, clicking toggles complete (strikethrough + orange check)
- [ ] Click a module in sidebar → center switches to module view
- [ ] Click Home → returns to chat

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: complete chat-first home layout (ChatHome + Taskboard + ConversationHistory)"
```
