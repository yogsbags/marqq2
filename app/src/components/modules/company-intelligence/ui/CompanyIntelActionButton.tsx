import { useState } from 'react'
import { toast } from 'sonner'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { addAiTasks } from '@/lib/taskStore'
import { fetchJson } from '../api'

type PlannedTask = {
  label: string
  horizon: 'day' | 'week' | 'month'
}

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
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
  className?: string
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
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
  size = 'sm',
  variant = 'outline',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [plan, setPlan] = useState<{ tasks?: PlannedTask[]; executionPrompt?: string } | null>(null)

  async function openDeploy() {
    setOpen(true)
    setPlan(null)
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
      setPlan(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to prepare ${titleCase(agentName)} deployment.`)
      setOpen(false)
    } finally {
      setIsPreparing(false)
    }
  }

  async function deploy() {
    setIsDeploying(true)

    try {
      const activePlan =
        plan ||
        (await fetchJson<{ tasks?: PlannedTask[]; executionPrompt?: string }>(`/api/agents/${agentName}/plan`, {
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
        }))

      addAiTasks(
        (Array.isArray(activePlan.tasks) ? activePlan.tasks : []).map((task) => ({
          label: `[${titleCase(agentName)} • ${taskPrefix}] ${task.label}`,
          horizon: task.horizon || 'week',
        })),
      )

      if (deploymentMode === 'scheduled') {
        await fetchJson('/api/agents/deployments', {
          method: 'POST',
          body: JSON.stringify({
            agentName,
            agentTarget: agentTarget || null,
            workspaceId: getActiveWorkspaceId(),
            companyId: companyId || null,
            sectionId: sectionId || null,
            sectionTitle: sectionTitle || label,
            summary: summary || '',
            bullets: Array.isArray(bullets) ? bullets : [],
            tasks: (Array.isArray(activePlan.tasks) ? activePlan.tasks : []).map((task) => ({
              label: task.label,
              horizon: task.horizon,
            })),
            scheduleMode,
            recurrenceMinutes,
            runPrompt: String(activePlan.executionPrompt || '').trim() || taskRequest,
            source,
          }),
        })
      } else {
        await fetchJson(`/api/agents/${agentName}/run`, {
          method: 'POST',
          body: JSON.stringify({
            company_id: companyId,
            query: String(activePlan.executionPrompt || '').trim() || taskRequest,
          }),
        })
      }

      toast.success(successMessage)
      setOpen(false)
      setPlan(activePlan)
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
          'bg-orange-500 text-white hover:bg-orange-600 dark:bg-orange-600 dark:text-white dark:hover:bg-orange-500 border-transparent'
            ,
          variant === 'outline'
            ? 'shadow-sm'
            : '',
          className || '',
        ].filter(Boolean).join(' ')}
        onClick={() => void openDeploy()}
      >
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
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
                  This will create taskboard items first, then run the agent with the current company-intelligence context.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-orange-600 dark:text-orange-400">Tasks to be added</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {isPreparing ? (
                <div className="text-muted-foreground">Preparing plan...</div>
              ) : Array.isArray(plan?.tasks) && plan.tasks.length ? (
                plan.tasks.slice(0, 8).map((task, index) => (
                  <div key={`${task.label}-${index}`} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                    <div className="text-foreground">{task.label}</div>
                    <div className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{task.horizon}</div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">No task breakdown was generated yet, but the agent can still run.</div>
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
              {isDeploying ? 'Deploying...' : deploymentMode === 'scheduled' ? 'Deploy & Schedule' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
