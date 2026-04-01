import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Clock, CalendarDays, Play, CalendarClock, ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchJson } from '@/components/modules/company-intelligence/api'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'

const CALENDARIFIC_KEY = import.meta.env.VITE_CALENDARIFIC_API_KEY as string | undefined

type DeploymentEntry = {
  id: string
  agentName: string
  workspaceId?: string | null
  agentTarget?: string | null
  sectionTitle?: string | null
  scheduleMode?: string | null
  status?: string
  scheduledFor?: string | null
  createdAt?: string
}

type Festival = {
  name: string
  date: Date
  description: string
  type: string[]
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  onModuleSelect: (id: string) => void
}

export function MarketingCalendarPage({ onModuleSelect }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [deployments, setDeployments] = useState<DeploymentEntry[]>([])
  const [festivals, setFestivals] = useState<Festival[]>([])
  const [selected, setSelected] = useState<Date>(new Date())
  const [loading, setLoading] = useState(false)

  // Fetch deployments
  useEffect(() => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    fetchJson(`/api/workspaces/${activeWorkspace.id}/agent-deployments`)
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : (data as { deployments?: DeploymentEntry[] }).deployments ?? []
        setDeployments(arr as DeploymentEntry[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [activeWorkspace?.id])

  // Fetch festivals
  useEffect(() => {
    if (!CALENDARIFIC_KEY) return
    const year = new Date().getFullYear()
    fetch(`https://calendarific.com/api/v2/holidays?api_key=${CALENDARIFIC_KEY}&country=IN&year=${year}`)
      .then(r => r.json())
      .then((data: { response?: { holidays?: Array<{ name: string; description: string; date: { iso: string }; type: string[] }> } }) => {
        const holidays = data?.response?.holidays ?? []
        setFestivals(holidays.map(h => ({
          name: h.name,
          date: new Date(h.date.iso),
          description: h.description,
          type: h.type,
        })))
      })
      .catch(() => {})
  }, [])

  const selectedDeployments = useMemo(() => {
    return deployments.filter(d => {
      if (!d.scheduledFor) return false
      const dd = new Date(d.scheduledFor)
      return dd.toDateString() === selected.toDateString()
    })
  }, [deployments, selected])

  const selectedFestivals = useMemo(() => {
    return festivals.filter(f => f.date.toDateString() === selected.toDateString())
  }, [festivals, selected])

  // Days that have deployments (for dot indicator)
  const deploymentDays = useMemo(() => {
    const set = new Set<string>()
    deployments.forEach(d => {
      if (d.scheduledFor) set.add(new Date(d.scheduledFor).toDateString())
    })
    return set
  }, [deployments])

  const statusColor = (status?: string) => {
    if (status === 'completed') return 'bg-green-500'
    if (status === 'running') return 'bg-orange-400'
    if (status === 'failed') return 'bg-red-500'
    return 'bg-blue-500'
  }

  return (
    <div className="flex h-full gap-6 px-6 py-5">
      {/* Left: calendar picker */}
      <div className="flex-shrink-0 w-80 flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Marketing Calendar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your content schedule across all channels</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/90 p-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => d && setSelected(d)}
            className="w-full"
            modifiers={{
              hasEvent: (day) => deploymentDays.has(day.toDateString()),
            }}
            modifiersClassNames={{
              hasEvent: 'font-bold text-orange-500 underline decoration-dotted',
            }}
          />
        </div>

        <button
          onClick={() => onModuleSelect('workflow-builder')}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 py-2.5 text-sm text-muted-foreground hover:border-orange-300 hover:text-orange-600 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          Schedule content
        </button>
      </div>

      {/* Right: day detail */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{formatDate(selected)}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const d = new Date(selected); d.setDate(d.getDate() - 1); setSelected(d); }}
              className="rounded-lg border border-border/60 p-1.5 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSelected(new Date())}
              className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => { const d = new Date(selected); d.setDate(d.getDate() + 1); setSelected(d); }}
              className="rounded-lg border border-border/60 p-1.5 hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* Festivals */}
          {selectedFestivals.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Holidays & Events</p>
              {selectedFestivals.map(f => (
                <div key={f.name} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/90 px-3 py-2.5">
                  <CalendarDays className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    {f.type.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {f.type.map(t => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scheduled deployments */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Clock className="h-4 w-4 animate-spin" />
              Loading schedule...
            </div>
          ) : selectedDeployments.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Scheduled</p>
              {selectedDeployments.map(d => (
                <div key={d.id} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/90 px-3 py-2.5">
                  <div className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', statusColor(d.status))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{d.sectionTitle || d.agentName}</p>
                      {d.scheduledFor && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatTime(d.scheduledFor)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Bot className="h-3 w-3 text-muted-foreground" />
                      <p className="text-[11px] text-muted-foreground truncate">{d.agentName}</p>
                      {d.scheduleMode && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{d.scheduleMode}</Badge>
                      )}
                    </div>
                  </div>
                  {d.status === 'pending' && (
                    <button className="flex-shrink-0 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-1 hover:bg-orange-100 transition-colors">
                      <Play className="h-3 w-3 text-orange-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <CalendarClock className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">No content scheduled for this day</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Schedule agent runs or content tasks from the workflow builder</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onModuleSelect('workflow-builder')}
                className="mt-1"
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Add Content
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
