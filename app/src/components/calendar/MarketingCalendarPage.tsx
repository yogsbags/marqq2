import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  Mail,
  CalendarDays,
  PlusCircle,
  Play,
  X,
  Clock,
  Image as ImageIcon,
  ChevronDown,
  PlusSquare,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchJson } from '@/components/modules/company-intelligence/api'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'

const CALENDARIFIC_KEY = import.meta.env.VITE_CALENDARIFIC_API_KEY as string | undefined

// ── Types ─────────────────────────────────────────────────────────────────────

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

type ViewMode = 'today' | 'month' | 'week'

type NewPostModal = {
  platformId: string
  platformLabel: string
  day: Date
}

// ── Platforms ─────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'blog',      label: 'WordPress', Icon: FileText,  color: 'text-slate-400 dark:text-slate-500',  iconColor: 'text-slate-400' },
  { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin,  color: 'text-blue-400 dark:text-blue-500',    iconColor: 'text-blue-400'  },
  { id: 'twitter',   label: 'X',         Icon: Twitter,   color: 'text-slate-400 dark:text-slate-500',  iconColor: 'text-slate-400' },
  { id: 'instagram', label: 'Instagram', Icon: Instagram, color: 'text-pink-400 dark:text-pink-500',    iconColor: 'text-pink-400'  },
  { id: 'facebook',  label: 'Meta',      Icon: Facebook,  color: 'text-blue-500 dark:text-blue-600',    iconColor: 'text-blue-500'  },
  { id: 'email',     label: 'Email',     Icon: Mail,      color: 'text-rose-400 dark:text-rose-500',    iconColor: 'text-rose-400'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function getMonthWeeks(anchor: Date): Date[][] {
  const year  = anchor.getFullYear()
  const month = anchor.getMonth()
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const weeks: Date[][] = []
  let cur = new Date(start)
  while (cur <= last || weeks.length < 4) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
    if (cur > last && weeks.length >= 4) break
  }
  return weeks
}

const DAY_NAMES   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_SHORT   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isSameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString() }
function isWeekend(d: Date)          { return d.getDay() === 0 || d.getDay() === 6 }

function formatRangeLabel(days: Date[]) {
  const first = days[0]
  const last  = days[days.length - 1]
  const fStr  = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const lStr  = last.toLocaleDateString('en-US',  { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fStr} – ${lStr}`
}

function formatDayDetailLabel(d: Date) {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()} (${DAY_SHORT[d.getDay()]})`
}

function formatModalDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── New Post Modal ─────────────────────────────────────────────────────────────

interface NewPostModalProps {
  modal: NewPostModal
  onClose: () => void
}

function NewPostModalDialog({ modal, onClose }: NewPostModalProps) {
  const { platformId, platformLabel, day } = modal

  const [calTitle,   setCalTitle]   = useState('')
  const [contentTab, setContentTab] = useState<string>(() => {
    if (platformId === 'blog' || platformId === 'email') return 'blog'
    if (platformId === 'instagram') return 'media'
    return 'text'
  })
  const [blogTitle,  setBlogTitle]  = useState('')
  const [bodyText,   setBodyText]   = useState('')
  const [time]                      = useState('9:00 AM')
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const tabs: { id: string; label: string }[] = useMemo(() => {
    if (platformId === 'blog' || platformId === 'email') return []
    if (platformId === 'instagram') return [{ id: 'media', label: 'Media' }, { id: 'carousel', label: 'Carousel' }]
    return [{ id: 'text', label: 'Text' }, { id: 'image', label: 'Image' }, { id: 'video', label: 'Video' }]
  }, [platformId])

  const bodyPlaceholder = useMemo(() => {
    if (platformId === 'twitter')   return "What's happening?"
    if (platformId === 'instagram') return 'Write a caption...'
    if (platformId === 'facebook')  return "What's on your mind?"
    return 'Share your thoughts...'
  }, [platformId])

  const showUploadZone = useMemo(() => {
    if (platformId === 'instagram' && (contentTab === 'media' || contentTab === 'carousel')) return true
    if (['linkedin', 'twitter', 'facebook'].includes(platformId) && (contentTab === 'image' || contentTab === 'video')) return true
    return false
  }, [platformId, contentTab])

  const uploadLabel = useMemo(() => {
    if (contentTab === 'carousel')  return 'Add Carousel Items'
    if (platformId === 'instagram') return 'Upload Image or Video'
    if (contentTab === 'video')     return 'Upload Video'
    return 'Upload Image'
  }, [platformId, contentTab])

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div
        className="relative w-full max-w-[540px] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-[15px] font-semibold text-foreground">
            New {platformLabel} Post for {formatModalDate(day)}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">

          {/* Calendar title */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Calendar title</label>
            <input
              type="text"
              value={calTitle}
              onChange={e => setCalTitle(e.target.value)}
              placeholder={`Add a title for ${platformLabel}`}
              className="w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
            />
            <p className="text-[12px] text-muted-foreground">
              This title only appears inside your calendar to help identify the post.
            </p>
          </div>

          <div className="border-t border-border/60" />

          {/* Blog & Email: Title + body */}
          {(platformId === 'blog' || platformId === 'email') && (
            <div className="space-y-3">
              <input
                type="text"
                value={blogTitle}
                onChange={e => setBlogTitle(e.target.value)}
                placeholder="Title..."
                className="w-full border-b border-border/60 bg-transparent px-0 py-1 text-[22px] font-medium text-foreground/50 placeholder:text-foreground/30 focus:outline-none focus:text-foreground/80 transition-colors"
              />
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder="Write your content..."
                rows={8}
                className="w-full bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors"
              />
            </div>
          )}

          {/* Social platforms: tabs + content */}
          {tabs.length > 0 && (
            <div className="space-y-3">
              {/* Tab pills */}
              <div
                className="grid rounded-xl bg-muted/50 p-1"
                style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
              >
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setContentTab(tab.id)}
                    className={cn(
                      'rounded-lg py-1.5 text-[13px] font-medium transition-colors',
                      contentTab === tab.id
                        ? 'bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-black/5'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Upload zone */}
              {showUploadZone && (
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer py-8 px-4 text-center">
                  <input
                    type="file"
                    className="sr-only"
                    multiple={contentTab === 'carousel'}
                    accept={contentTab === 'video' ? 'video/*' : 'image/*,video/*'}
                  />
                  {contentTab === 'carousel'
                    ? <PlusSquare className="h-8 w-8 text-muted-foreground/50" />
                    : <ImageIcon  className="h-8 w-8 text-muted-foreground/50" />
                  }
                  <span className="text-[13px] font-semibold text-foreground">{uploadLabel}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {contentTab === 'carousel'
                      ? '2-10 images or videos — drag & drop or click to browse'
                      : 'Drag & drop or click to browse'}
                  </span>
                </label>
              )}

              {/* Body textarea */}
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder={bodyPlaceholder}
                rows={showUploadZone ? 3 : 8}
                className="w-full bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 px-5 py-3 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900">
          <button className="flex items-center gap-2 rounded-xl border border-border/70 bg-white dark:bg-zinc-800 px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 transition-colors">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {time}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-border/70 bg-white dark:bg-zinc-800 px-4 py-2 text-[13px] font-semibold text-foreground hover:bg-muted/40 transition-colors">
              Save Draft
            </button>
            <button className="rounded-xl border border-border/70 bg-white dark:bg-zinc-800 px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
              Schedule Post
            </button>
            <button className="rounded-xl border border-border/70 bg-white dark:bg-zinc-800 px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
              Publish Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onModuleSelect: (id: string) => void
}

export function MarketingCalendarPage({ onModuleSelect }: Props) {
  const { activeWorkspace } = useWorkspace()
  const today = useMemo(() => new Date(), [])

  const [view, setView]               = useState<ViewMode>('week')
  const [anchor, setAnchor]           = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<Date>(new Date())
  const [deployments, setDeployments] = useState<DeploymentEntry[]>([])
  const [festivals, setFestivals]     = useState<Festival[]>([])
  const [newPostModal, setNewPostModal] = useState<NewPostModal | null>(null)

  // Fetch deployments
  useEffect(() => {
    if (!activeWorkspace?.id) return
    fetchJson(`/api/workspaces/${activeWorkspace.id}/agent-deployments`)
      .then((data: unknown) => {
        const arr = Array.isArray(data)
          ? data
          : (data as { deployments?: DeploymentEntry[] }).deployments ?? []
        setDeployments(arr as DeploymentEntry[])
      })
      .catch(() => {})
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

  const deploymentDaySet = useMemo(() => {
    const s = new Set<string>()
    deployments.forEach(d => { if (d.scheduledFor) s.add(new Date(d.scheduledFor).toDateString()) })
    return s
  }, [deployments])

  const festivalDaySet = useMemo(() => {
    const s = new Set<string>()
    festivals.forEach(f => s.add(f.date.toDateString()))
    return s
  }, [festivals])

  const navigate = useCallback((dir: -1 | 1) => {
    setAnchor(prev => {
      const d = new Date(prev)
      if (view === 'week' || view === 'today') d.setDate(d.getDate() + dir * 7)
      else d.setMonth(d.getMonth() + dir)
      return d
    })
  }, [view])

  const goToday  = useCallback(() => { setAnchor(new Date()); setSelectedDay(new Date()) }, [])

  const navigateDay = useCallback((dir: -1 | 1) => {
    setSelectedDay(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir)
      return d
    })
  }, [])

  const weekDays   = useMemo(() => getWeekDays(anchor), [anchor])
  const monthWeeks = useMemo(() => getMonthWeeks(anchor), [anchor])

  const rangeLabel = useMemo(() => {
    if (view === 'month') return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
    return formatRangeLabel(weekDays)
  }, [view, anchor, weekDays])

  const openNewPost = useCallback((platformId: string, platformLabel: string, day: Date) => {
    setNewPostModal({ platformId, platformLabel, day })
  }, [])

  // Selected day's content
  const selectedDayDeployments = useMemo(
    () => deployments.filter(d => d.scheduledFor && isSameDay(new Date(d.scheduledFor), selectedDay)),
    [deployments, selectedDay]
  )
  const selectedDayFestivals = useMemo(
    () => festivals.filter(f => isSameDay(f.date, selectedDay)),
    [festivals, selectedDay]
  )

  // ── Week grid ────────────────────────────────────────────────────────────────

  function WeekGrid() {
    return (
      <div className="h-full overflow-auto px-4 pt-3 pb-2">
        {/* Column headers */}
        <div className="grid mb-1" style={{ gridTemplateColumns: '52px repeat(7, 1fr)', gap: '4px' }}>
          <div /> {/* spacer for row labels */}
          {weekDays.map((day, i) => {
            const isToday    = isSameDay(day, today)
            const isSelected = isSameDay(day, selectedDay)
            const weekend    = isWeekend(day)
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(day)}
                className="flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors hover:bg-muted/40"
              >
                <span className={cn(
                  'text-[10px] font-semibold tracking-widest uppercase',
                  isToday    ? 'text-teal-600 dark:text-teal-400'
                  : weekend  ? 'text-red-400'
                  : 'text-muted-foreground'
                )}>
                  {DAY_NAMES[day.getDay()]}
                </span>
                <span className={cn(
                  'h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold leading-none',
                  isToday
                    ? 'bg-teal-500 text-white'
                    : isSelected
                      ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                      : weekend
                        ? 'text-red-400 dark:text-red-500'
                        : 'text-foreground'
                )}>
                  {day.getDate()}
                </span>
              </button>
            )
          })}
        </div>

        {/* Platform rows */}
        {PLATFORMS.map(platform => (
          <div
            key={platform.id}
            className="grid mb-1"
            style={{ gridTemplateColumns: '52px repeat(7, 1fr)', gap: '4px' }}
          >
            {/* Row label */}
            <div className="flex items-center justify-end pr-2 h-14">
              <platform.Icon className={cn('h-3.5 w-3.5', platform.iconColor, 'opacity-60')} />
            </div>

            {/* Day cards */}
            {weekDays.map((day, i) => {
              const isToday    = isSameDay(day, today)
              const isSelected = isSameDay(day, selectedDay)
              const hasEvent   = deploymentDaySet.has(day.toDateString()) && platform.id === 'blog'
              const hasFest    = festivalDaySet.has(day.toDateString())
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDay(day); openNewPost(platform.id, platform.label, day) }}
                  className={cn(
                    'h-14 rounded-xl border transition-all flex items-center justify-center group',
                    isToday
                      ? 'border-teal-400/70 bg-teal-50/60 dark:bg-teal-900/15'
                      : isSelected
                        ? 'border-teal-300/60 border-dashed bg-teal-50/30 dark:bg-teal-900/10'
                        : 'border-border/50 border-dashed bg-white/60 dark:bg-zinc-900/40 hover:border-teal-300/60 hover:bg-teal-50/20'
                  )}
                >
                  {hasEvent || hasFest ? (
                    <div className="h-6 w-6 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <platform.Icon className="h-3 w-3 text-orange-500" />
                    </div>
                  ) : (
                    <platform.Icon className={cn(
                      'h-4 w-4 transition-opacity',
                      platform.iconColor,
                      'opacity-30 group-hover:opacity-60'
                    )} />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── Month view ───────────────────────────────────────────────────────────────

  function MonthGrid() {
    return (
      <div className="h-full overflow-auto">
        {/* Day-of-week header row */}
        <div className="grid sticky top-0 z-10 bg-background border-b border-border/60" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DAY_NAMES.map((name, i) => (
            <div
              key={name}
              className={cn(
                'py-2 text-center text-[11px] font-semibold tracking-widest uppercase border-r border-border/40 last:border-r-0',
                (i === 0 || i === 6) ? 'text-red-400' : 'text-muted-foreground'
              )}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {monthWeeks.map((week, wi) => (
          <div key={wi} className="grid border-b border-border/40" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {week.map((day, di) => {
              const isToday    = isSameDay(day, today)
              const isSelected = isSameDay(day, selectedDay)
              const inMonth    = day.getMonth() === anchor.getMonth()
              const hasEvent   = deploymentDaySet.has(day.toDateString())
              const hasFest    = festivalDaySet.has(day.toDateString())
              const weekend    = isWeekend(day)
              return (
                <div
                  key={di}
                  className={cn(
                    'border-r border-border/40 last:border-r-0 cursor-pointer transition-colors',
                    isToday    ? 'bg-blue-50/70 dark:bg-blue-900/10'
                    : isSelected ? 'bg-blue-50/40 dark:bg-blue-900/5'
                    : weekend  ? 'bg-rose-50/30 dark:bg-rose-900/5'
                    : 'bg-white dark:bg-transparent hover:bg-muted/30',
                    !inMonth   && 'opacity-35'
                  )}
                  onClick={() => setSelectedDay(day)}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-center pt-1.5 pb-1">
                    <span className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-full text-[13px] font-semibold',
                      isToday    ? 'bg-blue-500 text-white'
                      : weekend  ? 'text-red-400 dark:text-red-500'
                      : 'text-foreground'
                    )}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Platform icon rows */}
                  {PLATFORMS.map(platform => {
                    const hasEntry = hasEvent && platform.id === 'blog'
                    const hasFestEntry = hasFest && platform.id === 'blog'
                    return (
                      <div
                        key={platform.id}
                        onClick={e => { e.stopPropagation(); setSelectedDay(day); openNewPost(platform.id, platform.label, day) }}
                        className={cn(
                          'flex items-center px-1.5 h-[22px] border-t border-dashed border-border/30',
                          'hover:bg-black/5 dark:hover:bg-white/5 transition-colors group'
                        )}
                      >
                        {hasEntry || hasFestEntry ? (
                          <div className="h-4 w-4 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            <platform.Icon className="h-2.5 w-2.5 text-orange-500" />
                          </div>
                        ) : (
                          <platform.Icon className={cn(
                            'h-3 w-3 transition-opacity',
                            platform.iconColor,
                            'opacity-25 group-hover:opacity-50'
                          )} />
                        )}
                      </div>
                    )
                  })}

                  {/* Festival dot */}
                  {hasFest && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── Today view ───────────────────────────────────────────────────────────────

  function TodayGrid() {
    const dayDeployments = deployments.filter(d => d.scheduledFor && isSameDay(new Date(d.scheduledFor), today))
    const dayFestivals   = festivals.filter(f => isSameDay(f.date, today))
    return (
      <div className="h-full overflow-auto p-6">
        <div className="max-w-xl mx-auto space-y-3">
          {dayFestivals.map(f => (
            <div key={f.name} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
              <CalendarDays className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{f.name}</p>
                {f.type.length > 0 && <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 capitalize">{f.type.join(' · ')}</p>}
              </div>
            </div>
          ))}
          {dayDeployments.length > 0 ? dayDeployments.map(d => (
            <div key={d.id} className="rounded-xl border border-border/60 bg-background/90 px-4 py-3 flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{d.sectionTitle || d.agentName}</p>
                <p className="text-[11px] text-muted-foreground">{d.agentName}</p>
              </div>
              {d.status === 'pending' && (
                <button className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-1.5 hover:bg-orange-100 transition-colors">
                  <Play className="h-3.5 w-3.5 text-orange-500" />
                </button>
              )}
            </div>
          )) : (
            <div className="text-center py-16 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nothing scheduled for today</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Day detail panel ─────────────────────────────────────────────────────────

  function DayDetailPanel() {
    const hasContent = selectedDayDeployments.length > 0 || selectedDayFestivals.length > 0
    return (
      <div className="flex-shrink-0 mx-4 mb-4 rounded-2xl border border-border/60 bg-muted/20 dark:bg-zinc-900/40 overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
          <button
            onClick={() => navigateDay(-1)}
            className="h-8 w-8 rounded-full border border-teal-400/60 text-teal-600 dark:text-teal-400 flex items-center justify-center hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="text-[15px] font-bold text-foreground">
            {formatDayDetailLabel(selectedDay)}
          </span>

          <button
            onClick={() => navigateDay(1)}
            className="h-8 w-8 rounded-full border border-teal-400/60 text-teal-600 dark:text-teal-400 flex items-center justify-center hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Panel body */}
        <div className="px-5 py-4 min-h-[120px]">
          {hasContent ? (
            <div className="space-y-2">
              {selectedDayFestivals.map(f => (
                <div key={f.name} className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
                  <CalendarDays className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                  <p className="text-[13px] font-medium text-amber-900 dark:text-amber-200">{f.name}</p>
                </div>
              ))}
              {selectedDayDeployments.map(d => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-teal-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{d.sectionTitle || d.agentName}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{d.status ?? 'scheduled'}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-4 gap-3">
              <p className="text-[13px] text-muted-foreground">No content scheduled for this day.</p>
              <button
                onClick={() => setNewPostModal({
                  platformId: 'blog',
                  platformLabel: 'WordPress',
                  day: selectedDay,
                })}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white px-5 py-2 text-[13px] font-semibold transition-colors"
              >
                Add Content
              </button>
            </div>
          )}
        </div>

        {/* Panel footer — quick platform add buttons */}
        {hasContent && (
          <div className="border-t border-border/40 px-5 py-2.5 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground mr-1">Add:</span>
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => openNewPost(p.id, p.label, selectedDay)}
                className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-white dark:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-teal-300/60 hover:bg-teal-50/30 transition-colors"
              >
                <p.Icon className={cn('h-3 w-3', p.iconColor)} />
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-full bg-background">

        {/* Page header */}
        <div className="px-6 pt-5 pb-3 flex-shrink-0">
          <h1 className="text-xl font-semibold text-foreground">Marketing Calendar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your content schedule across all channels</p>
        </div>

        {/* Toolbar */}
        <div className="px-6 pb-3 flex items-center justify-between gap-4 flex-shrink-0">
          {/* Left: keyboard nav hints */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
              <ChevronLeft className="h-3 w-3" /><span className="hidden sm:inline">Navigate</span><ChevronRight className="h-3 w-3" />
            </div>
            <button
              onClick={goToday}
              className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <kbd className="font-mono text-[10px] bg-border/60 rounded px-0.5">T</kbd>Today
            </button>
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
              <kbd className="font-mono text-[10px] bg-border/60 rounded px-0.5">V</kbd><span className="hidden sm:inline">Toggle View</span>
            </div>
          </div>

          {/* Center: date range nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="rounded-lg border border-border/60 p-1.5 hover:bg-muted transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-medium text-foreground min-w-[180px] text-center">{rangeLabel}</span>
            <button onClick={() => navigate(1)} className="rounded-lg border border-border/60 p-1.5 hover:bg-muted transition-colors">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right: view tabs + schedule button */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border/60 overflow-hidden text-[11px] font-medium">
              {(['today', 'month', 'week'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3 py-1.5 capitalize transition-colors',
                    view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-dashed"
              onClick={() => onModuleSelect('workflow-builder')}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Schedule
            </Button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-hidden border-t border-border/60 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden">
            {view === 'week'  && <WeekGrid />}
            {view === 'month' && <MonthGrid />}
            {view === 'today' && <TodayGrid />}
          </div>

          {/* Day detail panel — only in week/today view */}
          {(view === 'week' || view === 'today') && <DayDetailPanel />}
        </div>
      </div>

      {/* New Post Modal */}
      {newPostModal && (
        <NewPostModalDialog
          modal={newPostModal}
          onClose={() => setNewPostModal(null)}
        />
      )}
    </>
  )
}
