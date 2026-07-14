import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { fetchJson } from '../api'

type PlannedTask = {
  label: string
  horizon: 'day' | 'week' | 'month'
}

type EditableTask = PlannedTask & { id: string }

type Props = {
  label: string
  agentName: string
  companyId?: string
  companyName?: string
  websiteUrl?: string | null
  agentTarget?: string
  sectionId?: string
  sectionTitle?: string
  summary?: string
  bullets?: string[]
  taskRequest: string
  marketingContext?: Record<string, unknown>
  taskPrefix: string
  successMessage: string
  dialogTitle: string
  dialogDescription: string
  deploymentMode?: 'run_now' | 'scheduled'
  scheduleMode?: string | null
  recurrenceMinutes?: number
  source?: string
  /** Pin + open this module channel after deploy (e.g. lead-outreach → #outreach). */
  navigateModuleId?: string
  /** Params for ModuleDetail / workflow forms when navigating to a module. */
  moduleWorkflowParams?: Record<string, string>
  /**
   * When true, hand off a single agent run into #main chat.
   * Defaults to false when navigateModuleId is set (module is the work surface).
   */
  chatHandoff?: boolean
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
  className?: string
}

const HORIZONS: PlannedTask['horizon'][] = ['day', 'week', 'month']

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item'
}

function getActiveWorkspaceId() {
  try {
    const raw = localStorage.getItem('marqq_active_workspace')
    const parsed = raw ? JSON.parse(raw) : null
    return typeof parsed?.id === 'string' ? parsed.id : null
  } catch {
    return null
  }
}

function newTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeHorizon(value: unknown): PlannedTask['horizon'] {
  return HORIZONS.includes(value as PlannedTask['horizon']) ? (value as PlannedTask['horizon']) : 'week'
}

function toEditableTasks(tasks: PlannedTask[] | undefined): EditableTask[] {
  if (!Array.isArray(tasks) || !tasks.length) return []
  return tasks.slice(0, 12).map((task) => ({
    id: newTaskId(),
    label: String(task.label || '').trim(),
    horizon: normalizeHorizon(task.horizon),
  }))
}

export type OpenAgentTaskDetail = {
  agent: string
  task: string
  companyId?: string | null
  autoRun?: boolean
}

/** Persist pending agent handoff for ChatHome after navigation remount. */
export function queueOpenAgentTask(detail: OpenAgentTaskDetail) {
  try {
    sessionStorage.setItem('marqq_pending_agent_task', JSON.stringify(detail))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('marqq:open-agent-task', { detail }))
}

export function CompanyIntelActionButton({
  label,
  agentName,
  companyId,
  companyName,
  websiteUrl,
  agentTarget,
  sectionId,
  sectionTitle,
  summary,
  bullets,
  taskRequest,
  marketingContext,
  taskPrefix,
  successMessage,
  dialogTitle,
  dialogDescription,
  deploymentMode = 'run_now',
  scheduleMode = null,
  recurrenceMinutes,
  source = 'company-intelligence',
  navigateModuleId,
  moduleWorkflowParams,
  chatHandoff,
  size = 'sm',
  variant = 'outline',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [executionPrompt, setExecutionPrompt] = useState('')
  const [editableTasks, setEditableTasks] = useState<EditableTask[]>([])

  function resetDialogState() {
    setExecutionPrompt('')
    setEditableTasks([])
  }

  async function openDeploy() {
    setOpen(true)
    resetDialogState()
    setIsPreparing(true)

    try {
      const result = await fetchJson<{ tasks?: PlannedTask[]; executionPrompt?: string }>(`/api/agents/${agentName}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          task: taskRequest,
          marketingContext: {
            companyId,
            companyName,
            websiteUrl,
            ...(marketingContext || {}),
          },
        }),
      })
      setExecutionPrompt(String(result.executionPrompt || '').trim())
      const nextTasks = toEditableTasks(result.tasks)
      setEditableTasks(
        nextTasks.length
          ? nextTasks
          : [{ id: newTaskId(), label: taskPrefix || label, horizon: 'week' }],
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to prepare ${titleCase(agentName)} deployment.`)
      setOpen(false)
    } finally {
      setIsPreparing(false)
    }
  }

  function updateTask(id: string, patch: Partial<PlannedTask>) {
    setEditableTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    )
  }

  function removeTask(id: string) {
    setEditableTasks((prev) => prev.filter((task) => task.id !== id))
  }

  function addTask() {
    setEditableTasks((prev) => [
      ...prev,
      { id: newTaskId(), label: '', horizon: 'week' },
    ])
  }

  async function persistWorkspaceDeployment(activePlan: { tasks: PlannedTask[]; executionPrompt?: string }) {
    const workspaceId = getActiveWorkspaceId()
    if (!workspaceId) {
      throw new Error('Select a workspace before deploying tasks.')
    }

    const resolvedSectionId =
      (typeof sectionId === 'string' && sectionId.trim()) ||
      `ci-${slugify(taskPrefix || label)}`
    const resolvedSectionTitle =
      (typeof sectionTitle === 'string' && sectionTitle.trim()) ||
      label ||
      taskPrefix
    const runPrompt = String(activePlan.executionPrompt || '').trim() || taskRequest
    const plannedTasks = activePlan.tasks.map((task) => ({
      label: task.label,
      horizon: task.horizon,
    }))

    const scheduledFor =
      deploymentMode === 'scheduled' && scheduleMode === 'monitor'
        ? new Date().toISOString()
        : new Date(Date.now() + 20 * 60 * 1000).toISOString()

    await fetchJson(`/api/workspaces/${workspaceId}/agent-deployments`, {
      method: 'POST',
      body: JSON.stringify({
        agentName,
        agentTarget: agentTarget || null,
        companyId: companyId || null,
        sectionId: resolvedSectionId,
        sectionTitle: resolvedSectionTitle,
        summary: summary || '',
        bullets: Array.isArray(bullets) ? bullets : [],
        tasks: plannedTasks,
        scheduleMode: deploymentMode === 'scheduled' ? scheduleMode : null,
        recurrenceMinutes: deploymentMode === 'scheduled' ? recurrenceMinutes : undefined,
        runPrompt,
        scheduledFor,
        source,
      }),
    })

    window.dispatchEvent(new CustomEvent('marqq:deployment-created'))
    return runPrompt
  }

  async function deploy() {
    const cleanedTasks = editableTasks
      .map((task) => ({
        label: task.label.trim(),
        horizon: normalizeHorizon(task.horizon),
      }))
      .filter((task) => task.label.length > 0)

    if (!cleanedTasks.length) {
      toast.error('Add at least one task before deploying.')
      return
    }

    setIsDeploying(true)

    try {
      let prompt = executionPrompt
      if (!prompt) {
        const result = await fetchJson<{ tasks?: PlannedTask[]; executionPrompt?: string }>(`/api/agents/${agentName}/plan`, {
          method: 'POST',
          body: JSON.stringify({
            task: taskRequest,
            marketingContext: {
              companyId,
              companyName,
              websiteUrl,
              ...(marketingContext || {}),
            },
          }),
        })
        prompt = String(result.executionPrompt || '').trim()
        setExecutionPrompt(prompt)
      }

      const activePlan = {
        tasks: cleanedTasks,
        executionPrompt: prompt || taskRequest,
      }

      const runPrompt = await persistWorkspaceDeployment(activePlan)

      if (deploymentMode === 'run_now') {
        const targetModule = typeof navigateModuleId === 'string' ? navigateModuleId.trim() : ''
        const shouldChatHandoff = chatHandoff ?? !targetModule

        if (targetModule) {
          if (moduleWorkflowParams && Object.keys(moduleWorkflowParams).length) {
            window.dispatchEvent(
              new CustomEvent('marqq:workflow-params', {
                detail: {
                  moduleId: targetModule,
                  params: {
                    ...moduleWorkflowParams,
                    question: moduleWorkflowParams.question || runPrompt || taskRequest,
                  },
                },
              }),
            )
          } else {
            window.dispatchEvent(
              new CustomEvent('marqq:workflow-params', {
                detail: {
                  moduleId: targetModule,
                  params: { question: runPrompt || taskRequest },
                },
              }),
            )
          }
          try {
            sessionStorage.setItem('marqq_cta_skip_welcome', '1')
          } catch {
            /* ignore */
          }
          window.dispatchEvent(
            new CustomEvent('marqq:navigate', {
              detail: { moduleId: targetModule, autoStart: true },
            }),
          )
        } else if (shouldChatHandoff) {
          try {
            sessionStorage.setItem('marqq_cta_skip_welcome', '1')
          } catch {
            /* ignore */
          }
          queueOpenAgentTask({
            agent: agentName,
            task: runPrompt,
            companyId: companyId || null,
            autoRun: true,
          })
          window.dispatchEvent(new CustomEvent('marqq:navigate', { detail: { moduleId: 'home' } }))
        }
      }

      toast.success(successMessage)
      setOpen(false)
      resetDialogState()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to deploy ${titleCase(agentName)}.`)
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={[
          'font-bold transition-colors',
          'bg-orange-500 text-white hover:bg-orange-600 dark:bg-orange-600 dark:text-white dark:hover:bg-orange-500 border-transparent',
          variant === 'outline' ? 'shadow-sm' : '',
          className || '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => void openDeploy()}
      >
        {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) resetDialogState()
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <Card className="border-orange-200/70 bg-orange-50/70 dark:border-orange-900/40 dark:bg-orange-950/10">
            <CardContent className="flex items-start gap-4 p-4">
              <AgentAvatar name={agentName} size="lg" className="h-12 w-12 rounded-full" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">{titleCase(agentName)} · Task Deployment</div>
                <div className="text-sm text-muted-foreground">
                  {navigateModuleId
                    ? `Edit the tasks below, then add them to Upcoming Tasks and open #${navigateModuleId.replace(/-/g, ' ')}. It does not send LinkedIn, email, or ads by itself.`
                    : `Edit the tasks below, then add them to Upcoming Tasks and open ${titleCase(agentName)}. It does not send LinkedIn, email, or ads by itself.`}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base text-orange-600 dark:text-orange-400">Tasks to be added</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                disabled={isPreparing || isDeploying}
                onClick={addTask}
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {isPreparing ? (
                <div className="text-muted-foreground">Preparing plan...</div>
              ) : editableTasks.length ? (
                editableTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-md border border-border/60 px-2 py-2"
                  >
                    <Input
                      value={task.label}
                      onChange={(e) => updateTask(task.id, { label: e.target.value })}
                      placeholder="Task description"
                      className="flex-1 h-9"
                      disabled={isDeploying}
                    />
                    <Select
                      value={task.horizon}
                      onValueChange={(value) => updateTask(task.id, { horizon: normalizeHorizon(value) })}
                      disabled={isDeploying}
                    >
                      <SelectTrigger className="w-full sm:w-[110px] h-9">
                        <SelectValue placeholder="Horizon" />
                      </SelectTrigger>
                      <SelectContent>
                        {HORIZONS.map((horizon) => (
                          <SelectItem key={horizon} value={horizon}>
                            {horizon}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={isDeploying || editableTasks.length <= 1}
                      onClick={() => removeTask(task.id)}
                      aria-label="Remove task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">No tasks yet — add at least one before deploying.</div>
              )}
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
              disabled={isPreparing || isDeploying}
              onClick={() => void deploy()}
            >
              {isDeploying ? 'Deploying...' : deploymentMode === 'scheduled' ? 'Deploy & Schedule' : navigateModuleId ? 'Deploy & Open Channel' : 'Deploy & Open Chat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
