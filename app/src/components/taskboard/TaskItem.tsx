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
