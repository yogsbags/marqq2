import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  CalendarClock, Pause, Play, Pencil, Trash2,
  Plus, Clock, CheckCircle2, AlertCircle, Loader2,
  RefreshCw, Hash,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'active' | 'paused' | 'error'

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

// ─── Mock / fallback data ─────────────────────────────────────────────────────

const MOCK_JOBS: ScheduledJob[] = [
  {
    id: 'job-1',
    title: 'Weekly LinkedIn Content Brief',
    description: 'Generates a curated content plan for LinkedIn posts covering trending topics, competitor moves, and product highlights.',
    schedule: 'Every Monday at 9:00 AM (Asia/Kolkata)',
    status: 'active',
    agentName: 'Veena',
    lastRun: undefined,
    nextRun: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    channel: 'LinkedIn',
  },
  {
    id: 'job-2',
    title: 'Weekly Automation Suggestions',
    description: 'Reviews recent campaign data and suggests new automations, A/B tests, or optimisation opportunities for the week ahead.',
    schedule: 'Every Tuesday at 4:00 PM (Asia/Kolkata)',
    status: 'active',
    agentName: 'Veena',
    lastRun: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    nextRun: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    channel: undefined,
  },
  {
    id: 'job-3',
    title: 'Monthly SEO Performance Report',
    description: 'Compiles organic traffic trends, keyword movements, and top-performing pages from the past month into a shareable report.',
    schedule: 'First Monday of every month at 8:00 AM',
    status: 'paused',
    agentName: 'Dev',
    lastRun: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    nextRun: undefined,
    channel: undefined,
  },
]

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
      'bg-red-500/10 text-red-600 dark:text-red-400'
    )}>
      {status === 'active' && <CheckCircle2 className="h-2.5 w-2.5" />}
      {status === 'paused' && <Pause className="h-2.5 w-2.5" />}
      {status === 'error'  && <AlertCircle className="h-2.5 w-2.5" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Delete this task?</span>
      <button onClick={onConfirm} className="text-red-500 font-medium hover:underline">Yes, delete</button>
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
  onToggle: (id: string) => void
  onDelete: (id: string) => void
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
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {job.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            title="Edit"
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete"
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
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirm
          onConfirm={() => { onDelete(job.id); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function ScheduledJobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const resp = await fetch('/api/agent-deployments')
      if (resp.ok) {
        const json = await resp.json()
        if (Array.isArray(json) && json.length > 0) {
          // Map API shape to our ScheduledJob shape
          const mapped: ScheduledJob[] = json.map((d: any) => ({
            id: d.id || d.deploymentId,
            title: d.name || d.title || 'Scheduled Task',
            description: d.description || '',
            schedule: d.schedule || d.cron || 'On demand',
            status: d.status === 'paused' ? 'paused' : d.status === 'error' ? 'error' : 'active',
            agentName: d.agentName || d.agent || 'Veena',
            lastRun: d.lastRun || d.lastRunAt,
            nextRun: d.nextRun || d.nextRunAt,
            channel: d.channel,
          }))
          setJobs(mapped)
          return
        }
      }
    } catch { /* fallthrough */ }
    setJobs(MOCK_JOBS)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function toggleJob(id: string) {
    setJobs(prev => prev.map(j =>
      j.id !== id ? j : { ...j, status: j.status === 'active' ? 'paused' : 'active' }
    ))
  }

  function deleteJob(id: string) {
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const active = jobs.filter(j => j.status === 'active')
  const paused = jobs.filter(j => j.status !== 'active')

  return (
    <ScrollArea className="h-full">
      <div className="px-6 pb-10 pt-4 max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Tasks</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Tasks that run automatically on a schedule.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              New task
            </button>
          </div>
        </div>

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
            <button className="flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 transition-colors mt-1">
              <Plus className="h-3.5 w-3.5" />
              New task
            </button>
          </div>
        )}

      </div>
    </ScrollArea>
  )
}
