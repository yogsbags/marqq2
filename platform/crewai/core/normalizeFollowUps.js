/**
 * Normalize agent follow-ups to exactly 4 actionable options.
 */

const DEFAULT_FOLLOW_UPS = [
  'Go deeper on the strongest insight',
  'Turn this into an execution plan',
  'Open the related task channel',
  'Connect live data to refine this',
]

function toText(fu) {
  if (typeof fu === 'string') return fu.trim()
  if (fu && typeof fu === 'object') {
    if (typeof fu.text === 'string') return fu.text.trim()
    if (typeof fu.label === 'string') return fu.label.trim()
    if (typeof fu.title === 'string') return fu.title.trim()
  }
  return ''
}

/**
 * @param {unknown} followUps
 * @param {{ taskTitle?: string, agentName?: string }} [ctx]
 * @returns {string[]}
 */
export function normalizeFollowUps(followUps, ctx = {}) {
  const incoming = Array.isArray(followUps)
    ? followUps.map(toText).filter(Boolean)
    : []

  const task = ctx.taskTitle ? String(ctx.taskTitle) : 'this output'
  const agent = ctx.agentName ? String(ctx.agentName) : 'the agent'

  const fillers = [
    `Deepen ${agent}'s analysis on ${task}`,
    `Generate the next deliverable from ${task}`,
    `Deploy a follow-up workflow for ${task}`,
    `Connect an account and re-run with live data`,
    ...DEFAULT_FOLLOW_UPS,
  ]

  const out = []
  const seen = new Set()
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
