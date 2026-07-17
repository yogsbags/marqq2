import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { ConnectorGateCard } from '@/components/integrations/ConnectorGateCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { addIntegrationConnectedListener } from '@/lib/composio'
import { isConnectorActive } from '@/lib/connectorMeta'
import {
  checkConnectorReadiness,
  hasWorkflowForm,
  WORKFLOW_CONNECTOR_REQUIREMENTS,
  WORKFLOW_FORMS,
} from '@/lib/workflowRequirements'
import { cn } from '@/lib/utils'

import { fetchJson } from '../api'

type PlannedTask = {
  label: string
  horizon: 'day' | 'week' | 'month'
}

type EditableTask = PlannedTask & { id: string }
type DialogStep = 'configure' | 'tasks'

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

/** Module channel → agent task_type used for Composio tool filtering on runs. */
const MODULE_TASK_TYPES: Record<string, string> = {
  'lead-outreach': 'lead_outreach',
  'audience-profiles': 'audience_profiles',
  'email-sequence': 'email_sequence',
  'lead-intelligence': 'lead_score',
}

function resolveDeploymentTaskType(moduleId?: string) {
  const id = typeof moduleId === 'string' ? moduleId.trim() : ''
  return id && MODULE_TASK_TYPES[id] ? MODULE_TASK_TYPES[id] : null
}

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

function toEditableTasks(tasks: PlannedTask[] | undefined, fallbackLabel: string): EditableTask[] {
  if (!Array.isArray(tasks) || !tasks.length) {
    return [{ id: newTaskId(), label: fallbackLabel, horizon: 'week' }]
  }
  return tasks.slice(0, 12).map((task) => ({
    id: newTaskId(),
    label: String(task.label || '').trim(),
    horizon: normalizeHorizon(task.horizon),
  }))
}

function buildAnswersBlock(
  formFields: Array<{ id: string; label: string; options?: Array<{ value: string; label: string }> }>,
  values: Record<string, string>,
) {
  return formFields
    .map((field) => {
      const raw = String(values[field.id] || '').trim()
      if (!raw) return null
      const label = field.options?.find((opt) => opt.value === raw)?.label ?? raw
      return `${field.label}: ${label}.`
    })
    .filter(Boolean)
    .join(' ')
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
  const { activeWorkspace } = useWorkspace()
  // Prefer context, fall back to localStorage (same source deploy uses)
  const workspaceId = activeWorkspace?.id || getActiveWorkspaceId() || undefined

  const workflowForm = useMemo(() => {
    const moduleId = typeof navigateModuleId === 'string' ? navigateModuleId.trim() : ''
    if (!moduleId || !hasWorkflowForm(moduleId)) return null
    return WORKFLOW_FORMS[moduleId]
  }, [navigateModuleId])

  const targetModuleId = typeof navigateModuleId === 'string' ? navigateModuleId.trim() : ''
  const requiredConnectors = WORKFLOW_CONNECTOR_REQUIREMENTS[targetModuleId] ?? []

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<DialogStep>('configure')
  const [isPreparing, setIsPreparing] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [executionPrompt, setExecutionPrompt] = useState('')
  const [editableTasks, setEditableTasks] = useState<EditableTask[]>([])
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [activeConnectorIds, setActiveConnectorIds] = useState<string[]>([])
  const [connectorsLoading, setConnectorsLoading] = useState(false)

  const connectorReadiness = useMemo(
    () => checkConnectorReadiness(targetModuleId, activeConnectorIds),
    [targetModuleId, activeConnectorIds],
  )

  async function refreshConnectors() {
    if (!workspaceId || requiredConnectors.length === 0) {
      setActiveConnectorIds([])
      return
    }
    setConnectorsLoading(true)
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      const ids: string[] = (json?.connectors ?? [])
        .filter((c: { id?: string; connected?: boolean; status?: string }) => Boolean(c.id) && isConnectorActive(c))
        .map((c: { id: string }) => c.id)
      setActiveConnectorIds(ids)
    } catch {
      setActiveConnectorIds([])
    } finally {
      setConnectorsLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !workspaceId || requiredConnectors.length === 0) return
    void refreshConnectors()
    return addIntegrationConnectedListener((detail) => {
      if (detail.companyId !== workspaceId) return
      setActiveConnectorIds((prev) => (prev.includes(detail.connectorId) ? prev : [...prev, detail.connectorId]))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, targetModuleId])

  function resetDialogState() {
    setStep(workflowForm ? 'configure' : 'tasks')
    setExecutionPrompt('')
    setEditableTasks([])
    setFormValues({})
    setIsPreparing(false)
  }

  function seedFormValues() {
    const next: Record<string, string> = {}
    if (workflowForm) {
      for (const field of workflowForm.fields) {
        const preset = moduleWorkflowParams?.[field.id]
        if (typeof preset === 'string' && preset.trim()) next[field.id] = preset.trim()
      }
    }
    // Keep free-text question from CTA context when the form uses "question"
    if (workflowForm?.fields.some((field) => field.id === 'question') && !next.question) {
      const fromParams = moduleWorkflowParams?.question
      if (typeof fromParams === 'string' && fromParams.trim()) next.question = fromParams.trim()
    }
    if (workflowForm?.fields.some((field) => field.id === 'delivery') && !next.delivery) {
      next.delivery = 'draft'
    }
    setFormValues(next)
  }

  async function prepareTaskPlan(values: Record<string, string>) {
    setStep('tasks')
    setIsPreparing(true)
    setEditableTasks([])
    setExecutionPrompt('')

    try {
      const answersBlock = workflowForm ? buildAnswersBlock(workflowForm.fields, values) : ''
      const enrichedTask = [taskRequest, answersBlock ? `User options: ${answersBlock}` : null]
        .filter(Boolean)
        .join(' ')

      const result = await fetchJson<{ tasks?: PlannedTask[]; executionPrompt?: string }>(`/api/agents/${agentName}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          task: enrichedTask,
          marketingContext: {
            companyId,
            companyName,
            websiteUrl,
            workflowAnswers: values,
            ...(marketingContext || {}),
          },
        }),
      })
      setExecutionPrompt(String(result.executionPrompt || '').trim())
      setEditableTasks(toEditableTasks(result.tasks, taskPrefix || label))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to prepare ${titleCase(agentName)} deployment.`)
      if (workflowForm) setStep('configure')
      else {
        setOpen(false)
        resetDialogState()
      }
    } finally {
      setIsPreparing(false)
    }
  }

  async function openDeploy() {
    setOpen(true)
    seedFormValues()
    if (workflowForm) {
      setStep('configure')
      setEditableTasks([])
      setExecutionPrompt('')
      void refreshConnectors()
      return
    }
    setStep('tasks')
    await prepareTaskPlan(moduleWorkflowParams || {})
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
        moduleId: typeof navigateModuleId === 'string' ? navigateModuleId.trim() || null : null,
        taskType: resolveDeploymentTaskType(navigateModuleId),
        deliveryMode: formValues.delivery === 'live' ? 'live' : 'draft',
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
        const answersBlock = workflowForm ? buildAnswersBlock(workflowForm.fields, formValues) : ''
        const enrichedTask = [taskRequest, answersBlock ? `User options: ${answersBlock}` : null]
          .filter(Boolean)
          .join(' ')
        const result = await fetchJson<{ tasks?: PlannedTask[]; executionPrompt?: string }>(`/api/agents/${agentName}/plan`, {
          method: 'POST',
          body: JSON.stringify({
            task: enrichedTask,
            marketingContext: {
              companyId,
              companyName,
              websiteUrl,
              workflowAnswers: formValues,
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
      const mergedWorkflowParams = {
        ...(moduleWorkflowParams || {}),
        ...formValues,
        question: formValues.question || moduleWorkflowParams?.question || runPrompt || taskRequest,
      }

      if (deploymentMode === 'run_now') {
        const targetModule = typeof navigateModuleId === 'string' ? navigateModuleId.trim() : ''
        const shouldChatHandoff = chatHandoff ?? !targetModule

        if (targetModule) {
          window.dispatchEvent(
            new CustomEvent('marqq:workflow-params', {
              detail: {
                moduleId: targetModule,
                params: mergedWorkflowParams,
              },
            }),
          )
          try {
            sessionStorage.setItem('marqq_cta_skip_welcome', '1')
            sessionStorage.setItem(
              'marqq_agent_module_autorun',
              JSON.stringify({ moduleId: targetModule, agentName }),
            )
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {step === 'configure'
                ? 'Answer a few options first (like the GTM wizard). Then we will draft editable tasks before deploy.'
                : dialogDescription}
            </DialogDescription>
          </DialogHeader>

          <Card className="border-orange-200/70 bg-orange-50/70 dark:border-orange-900/40 dark:bg-orange-950/10">
            <CardContent className="flex items-start gap-4 p-4">
              <AgentAvatar name={agentName} size="lg" className="h-12 w-12 rounded-full" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">
                  {titleCase(agentName)} · {step === 'configure' ? 'Configure' : 'Task Deployment'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {step === 'configure'
                    ? `Step 1 of 2 — choose options for ${workflowForm?.moduleName || 'this deployment'}.`
                    : navigateModuleId
                      ? `Step 2 of 2 — edit tasks, then open #${navigateModuleId.replace(/-/g, ' ')}. Does not send LinkedIn/email by itself.`
                      : `Step 2 of 2 — edit tasks, then deploy. Does not send LinkedIn/email by itself.`}
                </div>
              </div>
            </CardContent>
          </Card>

          {step === 'configure' && workflowForm ? (
            <div className="space-y-4">
              {requiredConnectors.length > 0 && !connectorsLoading && !connectorReadiness.ready ? (
                <ConnectorGateCard
                  missingConnectorIds={connectorReadiness.missing}
                  taskLabel={workflowForm.moduleName}
                  workspaceId={workspaceId}
                  hardGate
                  onConnected={(connectorId) => {
                    setActiveConnectorIds((prev) =>
                      prev.includes(connectorId) ? prev : [...prev, connectorId],
                    )
                    toast.success('Connector linked — continue when ready.')
                  }}
                />
              ) : null}
              {requiredConnectors.length > 0 && connectorReadiness.ready ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  Connected for {workflowForm.moduleName}: {connectorReadiness.connected.join(', ')}. Drafts
                  use this live account context; send still needs approval later.
                </div>
              ) : null}
              {connectorsLoading ? (
                <div className="text-xs text-muted-foreground">Checking connected accounts…</div>
              ) : null}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-orange-600 dark:text-orange-400">{workflowForm.moduleName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{workflowForm.prompt}</p>
                  {workflowForm.fields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
                      {field.type === 'text' ? (
                        <Input
                          value={formValues[field.id] ?? ''}
                          onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                          placeholder={field.placeholder}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(field.options || []).map((opt) => {
                            const selected = formValues[field.id] === opt.value
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setFormValues((prev) => ({
                                    ...prev,
                                    [field.id]: selected ? '' : opt.value,
                                  }))
                                }
                                className={cn(
                                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                  selected
                                    ? 'border-orange-400 bg-orange-100 text-orange-700 dark:border-orange-600 dark:bg-orange-900/30 dark:text-orange-300'
                                    : 'border-border/60 bg-background/70 text-muted-foreground hover:border-orange-300 hover:text-foreground',
                                )}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base text-orange-600 dark:text-orange-400">Tasks to be added</CardTitle>
                <div className="flex items-center gap-2">
                  {workflowForm ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      disabled={isPreparing || isDeploying}
                      onClick={() => setStep('configure')}
                    >
                      Edit options
                    </Button>
                  ) : null}
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
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {isPreparing ? (
                  <div className="text-muted-foreground">Preparing plan from your options...</div>
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
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {step === 'configure' ? (
              <Button
                type="button"
                className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                disabled={
                  isPreparing ||
                  connectorsLoading ||
                  (requiredConnectors.length > 0 && !connectorReadiness.ready)
                }
                onClick={() => void prepareTaskPlan(formValues)}
              >
                {requiredConnectors.length > 0 && !connectorReadiness.ready
                  ? 'Connect an account to continue'
                  : 'Continue to tasks'}
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                disabled={isPreparing || isDeploying}
                onClick={() => void deploy()}
              >
                {isDeploying
                  ? 'Deploying...'
                  : deploymentMode === 'scheduled'
                    ? 'Deploy & Schedule'
                    : navigateModuleId
                      ? 'Deploy & Open Channel'
                      : 'Deploy & Open Chat'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
