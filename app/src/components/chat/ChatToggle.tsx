import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatToggleProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function ChatToggle({ onClick, hasUnread = false }: ChatToggleProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-30",
        "bg-orange-500 hover:bg-orange-600 text-white",
        "transition-all duration-200 hover:shadow-xl hover:bg-orange-600",
        "animate-in slide-in-from-bottom-5 fade-in-50"
      )}
    >
      <MessageCircle className="h-6 w-6" />
      {hasUnread && (
        <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full animate-pulse" />
      )}
    </Button>
  );
}