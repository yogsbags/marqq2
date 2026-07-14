/**
 * Parse human-readable Marqq schedule labels into cron + next run.
 * Mirrors app/src/lib/humanSchedule.ts for the deployment queue processor.
 */

const DAY_INDEX = {
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
};

function parseClock(text) {
  const m = String(text || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return { hour: 9, minute: 0 };
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const ampm = (m[3] || "").toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  return { hour: Math.min(23, Math.max(0, hour)), minute: Math.min(59, Math.max(0, minute)) };
}

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function dateInTimeZone(year, month, day, hour, minute, timeZone) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess = new Date(guess.getTime() + (want - asUtc));
  }
  return guess;
}

function addDaysYmd(year, month, day, add) {
  const d = new Date(Date.UTC(year, month - 1, day + add));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function nextWeekdayAt(after, weekday, hour, minute, timeZone) {
  const now = zonedParts(after, timeZone);
  for (let add = 0; add <= 8; add++) {
    const ymd = addDaysYmd(now.year, now.month, now.day, add);
    const candidate = dateInTimeZone(ymd.year, ymd.month, ymd.day, hour, minute, timeZone);
    const parts = zonedParts(candidate, timeZone);
    if (parts.weekday !== weekday) continue;
    if (candidate.getTime() > after.getTime() + 30_000) return candidate;
  }
  const ymd = addDaysYmd(now.year, now.month, now.day, 7);
  return dateInTimeZone(ymd.year, ymd.month, ymd.day, hour, minute, timeZone);
}

function firstWeekdayOfMonth(year, month, weekday, hour, minute, timeZone) {
  for (let day = 1; day <= 7; day++) {
    const candidate = dateInTimeZone(year, month, day, hour, minute, timeZone);
    if (zonedParts(candidate, timeZone).weekday === weekday) return candidate;
  }
  return dateInTimeZone(year, month, 1, hour, minute, timeZone);
}

function nextFirstWeekdayOfMonth(after, weekday, hour, minute, timeZone) {
  const now = zonedParts(after, timeZone);
  let candidate = firstWeekdayOfMonth(now.year, now.month, weekday, hour, minute, timeZone);
  if (candidate.getTime() <= after.getTime() + 30_000) {
    const nextMonth = now.month === 12 ? 1 : now.month + 1;
    const nextYear = now.month === 12 ? now.year + 1 : now.year;
    candidate = firstWeekdayOfMonth(nextYear, nextMonth, weekday, hour, minute, timeZone);
  }
  return candidate;
}

function nextDailyAt(after, hour, minute, timeZone) {
  const now = zonedParts(after, timeZone);
  let candidate = dateInTimeZone(now.year, now.month, now.day, hour, minute, timeZone);
  if (candidate.getTime() <= after.getTime() + 30_000) {
    const ymd = addDaysYmd(now.year, now.month, now.day, 1);
    candidate = dateInTimeZone(ymd.year, ymd.month, ymd.day, hour, minute, timeZone);
  }
  return candidate;
}

/**
 * @param {string} schedule
 * @param {{ after?: Date, timeZone?: string }} [opts]
 */
export function parseHumanSchedule(schedule, opts = {}) {
  const raw = String(schedule || "").trim();
  if (!raw) return null;

  const after = opts.after || new Date();
  const timeZone = opts.timeZone || "UTC";
  const lower = raw.toLowerCase();

  const firstOfMonth = lower.match(
    /first\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?:\s+of\s+month)?(?:\s+at\s+(.+))?/i
  );
  if (firstOfMonth) {
    const weekday = DAY_INDEX[firstOfMonth[1].toLowerCase()] ?? 1;
    const { hour, minute } = parseClock(firstOfMonth[2] || "9am");
    const next = nextFirstWeekdayOfMonth(after, weekday, hour, minute, timeZone);
    return {
      label: raw,
      cron: `${minute} ${hour} 1-7 * ${weekday}`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: 60 * 24 * 28,
      recurring: true,
    };
  }

  const weekly = lower.match(
    /(?:every|weekly(?:\s+on)?)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)(?:\s+at\s+(.+))?/i
  );
  if (weekly) {
    const weekday = DAY_INDEX[weekly[1].toLowerCase()] ?? 1;
    const { hour, minute } = parseClock(weekly[2] || "9am");
    const next = nextWeekdayAt(after, weekday, hour, minute, timeZone);
    return {
      label: raw,
      cron: `${minute} ${hour} * * ${weekday}`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: 60 * 24 * 7,
      recurring: true,
    };
  }

  const daily = lower.match(/daily(?:\s+at\s+(.+))?/i);
  if (daily || /^every\s+day/.test(lower)) {
    const { hour, minute } = parseClock(daily?.[1] || lower.match(/at\s+(.+)/i)?.[1] || "8am");
    const next = nextDailyAt(after, hour, minute, timeZone);
    return {
      label: raw,
      cron: `${minute} ${hour} * * *`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: 60 * 24,
      recurring: true,
    };
  }

  const everyHours = lower.match(/every\s+(\d+)\s*hours?/i);
  if (everyHours) {
    const hours = Math.max(1, Number(everyHours[1]) || 6);
    const next = new Date(after.getTime() + hours * 60 * 60_000);
    return {
      label: raw,
      cron: `0 */${hours} * * *`,
      nextRunISO: next.toISOString(),
      recurrenceMinutes: hours * 60,
      recurring: true,
    };
  }

  return {
    label: raw,
    cron: "",
    nextRunISO: new Date(after.getTime() + 60_000).toISOString(),
    recurrenceMinutes: 0,
    recurring: false,
  };
}

export function isRecurringDeployment(entry) {
  const mode = String(entry?.scheduleMode || "").toLowerCase();
  if (mode === "monitor" || mode === "recurring") return true;
  if (entry?.schedule && parseHumanSchedule(String(entry.schedule))?.recurring) return true;
  return false;
}

/**
 * Next run for a deployment entry after a completed (or failed) tick.
 * Prefers human `schedule` (+ timezone), then `cron` via caller-supplied computeNextRun.
 */
export function resolveDeploymentNextRun(entry, after = new Date(), computeNextRunFromCron = null) {
  const timeZone = entry?.timeZone || "UTC";
  if (entry?.schedule) {
    const parsed = parseHumanSchedule(String(entry.schedule), { after, timeZone });
    if (parsed?.nextRunISO) return parsed.nextRunISO;
  }
  if (entry?.cron && typeof computeNextRunFromCron === "function") {
    try {
      const next = computeNextRunFromCron(String(entry.cron));
      if (next instanceof Date && !Number.isNaN(next.getTime())) {
        // computeNextRun is "from now"; if that's still <= after, bump by recurrence
        if (next.getTime() > after.getTime() + 30_000) return next.toISOString();
      }
    } catch {
      /* fall through */
    }
  }
  const minutes = Math.max(15, Number(entry?.recurrenceMinutes) || 60 * 24 * 7);
  return new Date(after.getTime() + minutes * 60_000).toISOString();
}
