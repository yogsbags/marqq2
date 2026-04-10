import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/types/chat'
import { deleteConversation as deleteConversationFromStorage } from '@/lib/conversationPersistence'
import { BRAND } from '@/lib/brand'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  MessageSquare, Trash2, Search, CalendarClock,
  Clock, ChevronRight,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(date: Date) {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins  = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays  = Math.floor(diffMs / 86_400_000)
  if (diffMins  < 2)   return 'Just now'
  if (diffMins  < 60)  return `${diffMins}m ago`
  if (diffHours < 24)  return `${diffHours}h ago`
  if (diffDays  < 7)   return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function lastUserMessage(conv: Conversation): string {
  const msgs = [...conv.messages].reverse()
  const m = msgs.find(m => m.sender === 'user')
  if (!m) return 'No messages'
  const text = typeof m.content === 'string' ? m.content : ''
  return text.length > 120 ? text.slice(0, 120) + '…' : text
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConvRow({
  conv,
  onSelect,
  onDelete,
}: {
  conv: Conversation
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const preview = lastUserMessage(conv)
  const msgCount = conv.messages.length

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3.5 hover:border-orange-300/40 dark:hover:border-orange-800/40 transition-colors">
      {/* Icon */}
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Content */}
      <button
        className="flex-1 min-w-0 text-left"
        onClick={() => onSelect(conv.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate">{conv.name || 'Untitled conversation'}</p>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtRelative(conv.lastMessageAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-2.5 w-2.5" />
            {msgCount} message{msgCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {conv.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!confirmDelete ? (
          <>
            <button
              onClick={() => onSelect(conv.id)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Open"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1 text-[11px]">
            <button onClick={() => onDelete(conv.id)} className="text-red-500 font-medium hover:underline px-1">Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-muted-foreground hover:text-foreground px-1">Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

type Tab = 'conversations' | 'tasks'

type ChatSessionsPageProps = {
  conversations: Conversation[]
  onConversationSelect: (id: string) => void
  onConversationsChange: () => void
}

export function ChatSessionsPage({
  conversations,
  onConversationSelect,
  onConversationsChange,
}: ChatSessionsPageProps) {
  const { activeWorkspace } = useWorkspace()
  const [tab, setTab] = useState<Tab>('conversations')
  const [search, setSearch] = useState('')

  function deleteConversation(id: string) {
    // Remove from localStorage + Supabase (fire-and-forget)
    deleteConversationFromStorage(id, activeWorkspace?.id, 'veena-dm').then(() => {
      onConversationsChange()
    }).catch(() => {
      onConversationsChange()
    })
  }

  const filtered = conversations.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.messages.some(m => typeof m.content === 'string' && m.content.toLowerCase().includes(q))
    )
  })

  const sorted = [...filtered].sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  )

  return (
    <ScrollArea className="h-full">
      <div className="px-6 pb-10 pt-4 max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-foreground">Chat History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">View and manage your conversation history.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border/60">
          {(['conversations', 'tasks'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                tab === t
                  ? 'border-orange-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
              {t === 'conversations' && conversations.length > 0 && (
                <span className="ml-1.5 text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {conversations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab === 'conversations' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orange-500/50"
            />
          </div>
        )}

        {/* Conversations tab */}
        {tab === 'conversations' && (
          <div className="space-y-2">
            {sorted.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {search ? 'No matching conversations' : 'No conversations yet'}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {search
                    ? 'Try a different search term.'
                    : `Open Veena direct messages and start chatting with ${BRAND.agentName}.`}
                </p>
              </div>
            )}
            {sorted.map(c => (
              <ConvRow
                key={c.id}
                conv={c}
                onSelect={id => {
                  onConversationSelect(id)
                }}
                onDelete={deleteConversation}
              />
            ))}
          </div>
        )}

        {/* Tasks tab — placeholder (tasks are on ScheduledJobsPage) */}
        {tab === 'tasks' && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Scheduled tasks</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Task run history will appear here. View and manage recurring tasks from the Tasks page.
            </p>
          </div>
        )}

      </div>
    </ScrollArea>
  )
}
