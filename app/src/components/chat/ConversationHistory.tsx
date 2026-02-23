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
      {[...conversations]
        .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
        .slice(0, 10)
        .map(conv => (
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
