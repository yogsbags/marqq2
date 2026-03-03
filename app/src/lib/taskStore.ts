import type { Task } from '@/types/chat';

const STORAGE_KEY = 'torqq_tasks';

function normalizeTaskLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\[gtm\s*•\s*/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Write one AI-sourced task to localStorage and notify Taskboard. */
export function addAiTask(label: string, horizon: Task['horizon'] = 'week'): void {
  try {
    const tasks = loadTasks();
    const normalizedLabel = normalizeTaskLabel(label);
    const duplicate = tasks.some((task) => normalizeTaskLabel(task.label) === normalizedLabel);
    if (duplicate) return;
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      completed: false,
      horizon,
      createdAt: new Date(),
      source: 'ai',
    };
    tasks.push(task);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('torqq:task-added'));
  } catch {
    // ignore storage errors
  }
}

export function addAiTasks(tasksToAdd: Array<{ label: string; horizon?: Task['horizon'] }>): void {
  try {
    const tasks = loadTasks();
    let added = false;

    for (const taskToAdd of tasksToAdd) {
      const normalizedLabel = normalizeTaskLabel(taskToAdd.label);
      const duplicate = tasks.some((task) => normalizeTaskLabel(task.label) === normalizedLabel);
      if (duplicate) continue;

      tasks.push({
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: taskToAdd.label,
        completed: false,
        horizon: taskToAdd.horizon || 'week',
        createdAt: new Date(),
        source: 'ai',
      });
      added = true;
    }

    if (!added) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('torqq:task-added'));
  } catch {
    // ignore storage errors
  }
}

/**
 * Parse action items from a markdown AI response.
 * Looks for sections headed with "action", "plan", "task", "step", "next", or "todo"
 * and returns up to 5 bullet items from that section.
 */
export function extractActionItems(aiResponse: string): string[] {
  const lines = aiResponse.split('\n');
  const actionHeadingRe = /^#{1,3}\s+.*(action|plan|task|step|next|to.?do)/i;
  const bulletRe = /^[-\u2022*]\s+(.+)$/;

  let inSection = false;
  const items: string[] = [];

  for (const line of lines) {
    if (actionHeadingRe.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s/.test(line)) break;

    if (inSection) {
      const m = bulletRe.exec(line.trim());
      if (m) items.push(m[1].trim());
      if (items.length >= 5) break;
    }
  }

  return items;
}
