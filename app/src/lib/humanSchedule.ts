/**
 * Parse human-readable Marqq schedule labels into cron + next run.
 * Shared by chat scheduling and the deployment queue processor.
 */

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

function parseClock(text: string): { hour: number; minute: number } {
  const m = String(text || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return { hour: 9, minute: 0 }
  let hour = Number(m[1])
  const minute = Number(m[2] || 0)
  const ampm = (m[3] || '').toLowerCase()
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  return { hour: Math.min(23, Math.max(0, hour)), minute: Math.min(59, Math.max(0, minute)) }
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

/** Build a Date that represents wall-clock time in `timeZone` */
function dateInTimeZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  // Rough UTC guess then refine with offset readout
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, timeZone)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0)
    const want = Date.UTC(year, month - 1, day, hour, minute, 0)
    guess = new Date(guess.getTime() + (want - asUtc))
  }
  return guess
}

function addDaysYmd(year: number, month: number, day: number, add: number) {
  const d = new Date(Date.UTC(year, month - 1, day + add))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function nextWeekdayAt(
  after: Date,
  weekday: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const now = zonedParts(after, timeZone)
  for (let add = 0; add <= 8; add++) {
    const ymd = addDaysYmd(now.year, now.month, now.day, add)
    const candidate = dateInTimeZone(ymd.year, ymd.month, ymd.day, hour, minute, timeZone)
    const parts = zonedParts(candidate, timeZone)
    if (parts.weekday !== weekday) continue
    if (candidate.getTime() > after.getTime() + 30_000) return candidate
  }
  // Fallback +7 days
  const ymd = addDaysYmd(now.year, now.month, now.day, 7)
  return dateInTimeZone(ymd.year, ymd.month, ymd.day, hour, minute, timeZone)
}

function firstWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  for (let day = 1; day <= 7; day++) {
    const candidate = dateInTimeZone(year, month, day, hour, minute, timeZone)
    if (zonedParts(candidate, timeZone).weekday === weekday) return candidate
  }
  return dateInTimeZone(year, month, 1, hour, minute, timeZone)
}

function nextFirstWeekdayOfMonth(
  after: Date,
  weekday: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const now = zonedParts(after, timeZone)
  let candidate = firstWeekdayOfMonth(now.year, now.month, weekday, hour, minute, timeZone)
  if (candidate.getTime() <= after.getTime() + 30_000) {
    const nextMonth = now.month === 12 ? 1 : now.month + 1
    const nextYear = now.month === 12 ? now.year + 1 : now.year
    candidate = firstWeekdayOfMonth(nextYear, nextMonth, weekday, hour, minute, timeZone)
  }
  return candidate
}

function nextDailyAt(after: Date, hour: number, minute: number, timeZone: string): Date {
  const now = zonedParts(after, timeZone)
  let candidate = dateInTimeZone(now.year, now.month, now.day, hour, minute, timeZone)
  if (candidate.getTime() <= after.getTime() + 30_000) {
    const ymd = addDaysYmd(now.year, now.month, now.day, 1)
    candidate = dateInTimeZone(ymd.year, ymd.month, ymd.day, hour, minute, timeZone)
  }
  return candidate
}

export type ParsedHumanSchedule = {
  label: string
  cron: string
  nextRunISO: string
  recurrenceMinutes: number
  recurring: boolean
}

/**
 * @param schedule e.g. "every Monday at 9am", "daily at 8am", "first Monday of month"
 * @param opts.after compute next occurrence after this instant (default now)
 * @param opts.timeZone IANA TZ (default browser/local)
 */
export function parseHumanSchedule(
  schedule: string,
  opts?: { after?: Date; timeZone?: string }
): ParsedHumanSchedule | null {
  const raw = String(schedule || '').trim()
  if (!raw) return null

  const after = opts?.after || new Date()
  const timeZone =
    opts?.timeZone ||
    (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC') ||
    'UTC'

  const lower = raw.toLowerCase()

  // first Monday of month [at 9am]
  const firstOfMonth = lower.match(/first\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?:\s+of\s+month)?(?:\s+at\s+(.+))?/i)
  if (firstOfMonth) {
    const weekday = DAY_INDEX[firstOfMonth[1].toLowerCase()] ?? 1
    const { hour, minute } = parseClock(firstOfMonth[2] || '9am')
    const next = nextFirstWeekdayOfMonth(after, weekday, hour, minute, timeZone)
    return {
      label: raw,
      cron: `${minute} ${hour} 1-7 * ${weekday}`, // approximate
      nextRunISO: next.toISOString(),
      recurrenceMinutes: 60 * 24 * 28,
      recurring: true,
    }
  }

  // every Monday at 9am / weekly on Monday at 9:00 am
  const weekly = lower.match(
    /(?:every|weekly(?:\s+on)?)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?:\s+at\s+(.+))?/i
  )
  if (weekly) {
    const weekday = DAY_INDEX[weekly[1].toLowerCase()] ?? 1
    const { hour, minute } = parseClock(weekly[2] || '9am')
    const next = nextWeekdayAt(after, weekday, hour, minute, timeZone)
    return {
      label: raw,
      cron: `${minute} ${hour} * * ${weekday}`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: 60 * 24 * 7,
      recurring: true,
    }
  }

  // daily at 8am
  const daily = lower.match(/daily(?:\s+at\s+(.+))?/i)
  if (daily || /^every\s+day/.test(lower)) {
    const { hour, minute } = parseClock(daily?.[1] || lower.match(/at\s+(.+)/i)?.[1] || '8am')
    const next = nextDailyAt(after, hour, minute, timeZone)
    return {
      label: raw,
      cron: `${minute} ${hour} * * *`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: 60 * 24,
      recurring: true,
    }
  }

  // every N hours / every 6 hours
  const everyHours = lower.match(/every\s+(\d+)\s*hours?/i)
  if (everyHours) {
    const hours = Math.max(1, Number(everyHours[1]) || 6)
    const next = new Date(after.getTime() + hours * 60 * 60_000)
    return {
      label: raw,
      cron: `0 */${hours} * * *`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: hours * 60,
      recurring: true,
    }
  }

  // Fallback: treat as one-shot in 1 minute
  return {
    label: raw,
    cron: '',
    nextRunISO: new Date(after.getTime() + 60_000).toISOString(),
    recurrenceMinutes: 0,
    recurring: false,
  }
}

export function resolveBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
