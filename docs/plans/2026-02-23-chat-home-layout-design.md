# Chat-First Home Layout Design

**Date:** 2026-02-23
**Status:** Approved

---

## Problem

The current layout hides chat behind a floating toggle button. Users must navigate to a specific module before doing anything. This forces Priya (the end user) to think in modules rather than tasks, adding friction before every action.

---

## Solution

Promote chat to the home screen. Replace the module-first dashboard with a three-column layout where chat is the permanent center, the taskboard is always visible on the right, and the existing sidebar stays on the left with conversation history added under the Home item.

---

## Layout

```
┌────────┬──────────────────────────────────┬────────────────────┐
│        │                                  │  DAY  WEEK  MONTH  │
│  🏠  ▼ │                                  │ ─────────────────  │
│  · Mon campaign                           │  ✓ Published blog  │
│  · Lead scoring                           │  ✓ Scored leads    │
│  · Budget Q4                              │  ○ Schedule posts  │
│        │    [chat thread]                 │  ○ Budget review   │
│  ────  │                                  │                    │
│  📊    │                                  │  + Add task        │
│  🎯    │                                  │                    │
│  🤖    │                                  │                    │
│  🎬    │                                  │                    │
│  💰    │                                  │                    │
│  📈    │                                  │                    │
│  ✍️     │  ┌─────────────────────────┐    │                    │
│  🔍    │  │  Ask or type a task...  │    │                    │
│  👁️     │  └─────────────────────────┘    │                    │
│  ────  │                                  │                    │
│  ⚙️     │                                  │                    │
│  ❓    │                                  │                    │
└────────┴──────────────────────────────────┴────────────────────┘
```

---

## Three Columns

### Left — Sidebar (unchanged width, enhanced Home item)

- Existing module nav stays exactly as-is
- `Home` item gets a `▼/▶` toggle arrow
- Clicking the arrow expands a conversation history list below Home
- Each history item shows session name + relative time ("Monday campaign · 2d ago")
- Clicking a history item loads that conversation in the center
- Collapsing hides the history list; the Home icon remains
- When sidebar is icon-only (collapsed), history is not shown

### Center — Chat Home (permanent, full height)

- This is the default home view — replaces the module dashboard cards
- Full ChatGPT-style conversation thread (messages scroll upward)
- Input bar pinned at bottom with send button
- AI responses render rich inline content:
  - Plain text → normal message bubble
  - Lists, posts, scripts → formatted markdown blocks
  - Tables (leads, budgets) → inline data table
  - Long articles → collapsed card with title, preview, word count, and Expand button
- Each new session is auto-named from the first message and saved to conversation history
- When user clicks a module in the sidebar, the center switches to that module view (existing behavior preserved); Home button returns to chat

### Right — Taskboard (permanent, fixed width 280px)

- Always visible alongside chat; never hidden or pushed away
- Three tab filters: **Day / Week / Month**
- Each tab shows tasks scoped to that time horizon
- Task states: pending (○) and completed (✓, struck through)
- Clicking a task marks it complete (toggle)
- `+ Add task` button opens an inline text input to add a manual task
- AI automatically creates tasks when it executes an action (e.g. "write 3 posts" → creates "Review and schedule 3 LinkedIn posts" as a pending task)
- Tasks persist in localStorage (Phase 1); Supabase (Phase 2)

---

## Components

### New
| Component | Purpose |
|---|---|
| `Taskboard.tsx` | Right column — tabs, task list, add task |
| `TaskItem.tsx` | Single task row — toggle complete, label |
| `ConversationHistory.tsx` | Expandable list under Home in sidebar |
| `ChatHome.tsx` | Full-height chat view for the home route |
| `RichMessage.tsx` | Renders inline results (markdown, tables, cards) |

### Modified
| Component | Change |
|---|---|
| `MainLayout.tsx` | Three-column layout; remove chat overlay; add Taskboard |
| `Sidebar.tsx` | Add conversation history toggle under Home item |
| `ChatPanel.tsx` | Repurpose as `ChatHome` — remove overlay/slide behavior |
| `App.tsx` | Default route renders `ChatHome` instead of dashboard cards |

---

## Data

### Conversation History
```typescript
interface Conversation {
  id: string
  name: string          // auto-named from first message
  createdAt: Date
  lastMessageAt: Date
  messages: Message[]
}
```
Stored in `localStorage` key `torqq_conversations`.

### Tasks
```typescript
interface Task {
  id: string
  label: string
  completed: boolean
  horizon: 'day' | 'week' | 'month'
  createdAt: Date
  completedAt?: Date
  source: 'manual' | 'ai'   // ai = auto-created by intent router
}
```
Stored in `localStorage` key `torqq_tasks`.

---

## What Stays Unchanged

- Sidebar module nav structure, icons, active states, Company Intel submenu
- All existing module views (Lead Intelligence, Budget Optimization, etc.)
- Existing ChatPanel message/Groq logic — reused inside ChatHome
- Dark/light theme
- Auth flow

---

## Out of Scope (this phase)

- Intent router (routing chat messages to specific module backends)
- Supabase persistence for tasks and conversations
- Mobile layout
- Taskboard AI auto-population beyond manual + AI-triggered tasks
