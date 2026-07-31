import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageSectionHeader } from '@/components/layout/PageSectionHeader'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CalendarClock, Pause, Play, Trash2,
  Plus, Clock, CheckCircle2, AlertCircle, Loader2,
  RefreshCw, Hash,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'active' | 'paused' | 'stopped' | 'error'

type ScheduledJob = {
  id: string
  title: string
  description: string
  schedule: string          // human-readable e.g. "Every Monday at 9 AM"
  status: JobStatus
  agentName: string
  lastRun?: string          // ISO date string
  nextRun?: string          // ISO date string
  channel?: string          // e.g. "LinkedIn", "Email"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays < 8) return `in ${diffDays}d`
  if (diffDays < 0 && diffDays > -8) return `${Math.abs(diffDays)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
      status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
      status === 'paused' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
      status === 'stopped' ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400' :
      'bg-red-500/10 text-red-600 dark:text-red-400'
    )}>
      {status === 'active' && <CheckCircle2 className="h-2.5 w-2.5" />}
      {status === 'paused' && <Pause className="h-2.5 w-2.5" />}
      {status === 'stopped' && <AlertCircle className="h-2.5 w-2.5" />}
      {status === 'error'  && <AlertCircle className="h-2.5 w-2.5" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => Promise<void>; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Stop this task?</span>
      <button onClick={() => { void onConfirm() }} className="text-red-500 font-medium hover:underline">Yes, stop</button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">Cancel</button>
    </div>
  )
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onToggle,
  onDelete,
}: {
  job: ScheduledJob
  onToggle: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className={cn(
      'rounded-xl border border-border/60 bg-background/80 p-5 flex flex-col gap-3 transition-opacity',
      job.status === 'paused' && 'opacity-70',
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CalendarClock className="h-4 w-4 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{job.title}</p>
              <StatusBadge status={job.status} />
              {job.channel && (
                <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">{job.channel}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{job.description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onToggle(job.id)}
            title={job.status === 'active' ? 'Pause' : 'Resume'}
            disabled={job.status === 'stopped' || job.status === 'error'}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {job.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            title="Stop"
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Schedule + run info */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {job.schedule}
        </span>
        <span className="flex items-center gap-1">
          Agent: <span className="text-foreground font-medium">{job.agentName}</span>
        </span>
        {job.lastRun && (
          <span>Last run: <span className="text-foreground">{fmtDate(job.lastRun)}</span></span>
        )}
        {job.nextRun && job.status === 'active' && (
          <span>Next run: <span className="text-foreground">{fmtDate(job.nextRun)}</span></span>
        )}
        {job.status === 'paused' && (
          <span className="text-amber-500">Paused — resume to schedule next run</span>
        )}
        {job.status === 'stopped' && <span className="text-muted-foreground">Stopped — create a new task to restart it</span>}
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirm
          onConfirm={() => onDelete(job.id).finally(() => setConfirmDelete(false))}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function NewTaskDialog({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('Weekly performance review')
  const [agentName, setAgentName] = useState('dev')
  const [prompt, setPrompt] = useState('Review connected analytics, compare progress with the active goal, and recommend only evidence-backed course-corrections.')
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'monthly' | 'once'>('weekly')
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [time, setTime] = useState('09:00')
  const [deliveryMode, setDeliveryMode] = useState<'draft' | 'live'>('draft')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!title.trim() || !prompt.trim()) return
    setBusy(true)
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const scheduledFor = new Date(`${date}T${time}:00`).toISOString()
      const [hour, minute] = time.split(':').map(Number)
      const timeLabel = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'pm' : 'am'}`
      const schedule = cadence === 'daily' ? `every day at ${timeLabel}` : cadence === 'monthly' ? `every month on the 1st at ${timeLabel}` : `every Monday at ${timeLabel}`
      const response = await fetch(`/api/workspaces/${encodeURIComponent(companyId)}/agent-deployments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          sectionId: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'scheduled_task',
          sectionTitle: title.trim(), summary: prompt.trim(), runPrompt: prompt.trim(),
          scheduleMode: cadence === 'once' ? undefined : 'recurring',
          schedule: cadence === 'once' ? undefined : schedule, scheduledFor, timeZone, deliveryMode,
          source: 'scheduled_tasks_ui', companyId,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'Could not create scheduled task')
      toast.success('Scheduled task created')
      onCreated(); onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create scheduled task')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Create scheduled task</h2><p className="mt-1 text-xs text-muted-foreground">Choose the agent, goal, cadence, and approval mode.</p></div><button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">×</button></div>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium">Task name<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">Agent<select value={agentName} onChange={(event) => setAgentName(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="dev">Dev · Performance</option><option value="maya">Maya · SEO</option><option value="riya">Riya · Content</option><option value="zara">Zara · Campaigns</option><option value="arjun">Arjun · Outreach</option><option value="sam">Sam · Email</option></select></label>
            <label className="block text-xs font-medium">Cadence<select value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
          </div>
          <label className="block text-xs font-medium">What should the agent do?<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-5" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium">First run date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm" /></label><label className="block text-xs font-medium">Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm" /></label></div>
          <label className="block text-xs font-medium">Execution mode<select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value as typeof deliveryMode)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="draft">Draft / notify me</option><option value="live">Live after approval</option></select></label>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={busy || !title.trim() || !prompt.trim()} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create task'}</Button></div>
      </div>
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function ScheduledJobsPage() {
  const { activeWorkspace } = useWorkspace()
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  const load = useCallback(async () => {
    if (!activeWorkspace?.id) {
      setJobs([])
      return
    }

    try {
      const resp = await fetch(`/api/workspaces/${activeWorkspace.id}/agent-deployments`)
      if (resp.ok) {
        const json = await resp.json()
        const deployments = Array.isArray(json) ? json : Array.isArray(json?.deployments) ? json.deployments : []
        if (deployments.length > 0) {
          // Map API shape to our ScheduledJob shape
          const mapped: ScheduledJob[] = deployments.map((d: any) => ({
            id: d.id || d.deploymentId,
            title: d.sectionTitle || d.name || d.title || 'Scheduled Task',
            description: d.summary || d.description || '',
            schedule: d.schedule || d.cron || (d.scheduledFor ? new Date(d.scheduledFor).toLocaleString() : 'On demand'),
            status: d.status === 'paused' ? 'paused' : d.status === 'stopped' ? 'stopped' : d.status === 'error' ? 'error' : 'active',
            agentName: d.agentName || d.agent || 'Veena',
            lastRun: d.lastRun || d.lastRunAt || (d.status === 'completed' ? d.scheduledFor : undefined),
            nextRun: d.nextRun || d.nextRunAt || (d.status !== 'completed' ? d.scheduledFor : undefined),
            channel: d.channel,
          }))
          setJobs(mapped)
          return
        }
        setJobs([])
        return
      }
      setJobs([])
    } catch {
      setJobs([])
    }
  }, [activeWorkspace?.id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function toggleJob(id: string) {
    const job = jobs.find((item) => item.id === id)
    if (!job) return
    const action = job.status === 'active' ? 'pause' : 'resume'
    try {
      const response = await fetch(`/api/agents/deployments/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || `Could not ${action} task`)
      setJobs(prev => prev.map(item => item.id === id ? { ...item, status: json.deployment?.status === 'paused' ? 'paused' : 'active' } : item))
      toast.success(action === 'pause' ? 'Task paused' : 'Task resumed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update task')
    }
  }

  async function deleteJob(id: string) {
    try {
      const response = await fetch(`/api/agents/deployments/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'Could not stop task')
      setJobs(prev => prev.filter(item => item.id !== id))
      toast.success('Task stopped')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not stop task')
    }
  }

  const active = jobs.filter(j => j.status === 'active')
  const paused = jobs.filter(j => j.status !== 'active')

  return (
    <ScrollArea className="h-full">
      <div className="w-full px-6 pb-10 pt-4 space-y-6">

        <PageSectionHeader
          eyebrow="Automation"
          title="Tasks"
          description="Tasks that run automatically on a schedule so Veena and the specialist agents keep work moving without manual follow-up."
          actions={(
            <>
              <button
                onClick={refresh}
                className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                Refresh
              </button>
              <button onClick={() => setNewTaskOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-2 transition-colors">
                <Plus className="h-3.5 w-3.5" />
                New task
              </button>
            </>
          )}
        />

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading tasks…</span>
          </div>
        )}

        {/* Active */}
        {!loading && active.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active — {active.length}
            </p>
            {active.map(j => (
              <JobCard key={j.id} job={j} onToggle={toggleJob} onDelete={deleteJob} />
            ))}
          </div>
        )}

        {/* Paused / other */}
        {!loading && paused.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Paused — {paused.length}
            </p>
            {paused.map(j => (
              <JobCard key={j.id} job={j} onToggle={toggleJob} onDelete={deleteJob} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
              <Hash className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No scheduled tasks yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Create a task to have Veena automatically run reports, generate content, or take action on a schedule.
            </p>
            <button onClick={() => setNewTaskOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 transition-colors mt-1">
              <Plus className="h-3.5 w-3.5" />
              New task
            </button>
          </div>
        )}

        {newTaskOpen && activeWorkspace?.id && <NewTaskDialog companyId={activeWorkspace.id} onClose={() => setNewTaskOpen(false)} onCreated={() => void refresh()} />}
      </div>
    </ScrollArea>
  )
}
