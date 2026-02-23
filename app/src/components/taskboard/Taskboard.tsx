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
