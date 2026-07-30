/**
 * Normalize agent follow-ups to exactly 4 actionable options (client mirror of the runtime helper).
 */

const DEFAULT_FOLLOW_UPS = [
  'Go deeper on the strongest insight',
  'Turn this into an execution plan',
  'Open the related task channel',
  'Connect live data to refine this',
]

function toText(fu: unknown): string {
  if (typeof fu === 'string') return fu.trim()
  if (fu && typeof fu === 'object') {
    const o = fu as Record<string, unknown>
    if (typeof o.text === 'string') return o.text.trim()
    if (typeof o.label === 'string') return o.label.trim()
    if (typeof o.title === 'string') return o.title.trim()
  }
  return ''
}

export function normalizeFollowUps(
  followUps: unknown,
  ctx?: { taskTitle?: string; agentName?: string }
): string[] {
  const incoming = Array.isArray(followUps)
    ? followUps.map(toText).filter(Boolean)
    : []

  const task = ctx?.taskTitle || 'this output'
  const agent = ctx?.agentName || 'the agent'

  const fillers = [
    `Deepen ${agent}'s analysis on ${task}`,
    `Generate the next deliverable from ${task}`,
    `Deploy a follow-up workflow for ${task}`,
    `Connect an account and re-run with live data`,
    ...DEFAULT_FOLLOW_UPS,
  ]

  const out: string[] = []
  const seen = new Set<string>()
  for (const item of [...incoming, ...fillers]) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= 4) break
  }

  while (out.length < 4) {
    out.push(DEFAULT_FOLLOW_UPS[out.length] || `Continue option ${out.length + 1}`)
  }

  return out.slice(0, 4)
}

/** Sensible defaults after a CI task-channel generation completes */
export function taskChannelFollowUps(pageTitle: string, agentName?: string): string[] {
  return normalizeFollowUps(
    [
      `Refine ${pageTitle} with sharper ICP language`,
      `Open Competitor Intelligence next`,
      `Build a 90-day channel plan from this`,
      `Connect analytics and re-score ${pageTitle}`,
    ],
    { taskTitle: pageTitle, agentName }
  )
}
