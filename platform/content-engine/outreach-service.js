/**
 * Structured Lead Outreach pipeline.
 * Apollo ≤100 → select one prospect → stream short email → Gmail draft + schedule → auto-send → replies.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  executeComposioAction,
  executeComposioActionForEntities,
  formatApolloConnectionError,
  getConnectedAccountApiKeyForEntities,
  upsertComposioTrigger,
} from './mcp-router.js'
import { MKGService } from './mkg-service.js'
import { getLLMModel } from './llm-client.js'
import { getSupabaseReadClient, getSupabaseWriteClient } from './supabase.js'

export const OUTREACH_APOLLO_MAX = 100

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTREACH_DATA_DIR = join(__dirname, 'data', 'outreach-runs')

/** In-memory + disk-backed run store */
const runsById = new Map()
let hydrated = false
let hydratePromise = null
let persistQueue = Promise.resolve()

function flattenMkgText(value, depth = 0) {
  if (value == null || depth > 4) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map((item) => flattenMkgText(item, depth + 1)).filter(Boolean).join(' · ')
  }
  if (typeof value === 'object') {
    if (value.value != null) return flattenMkgText(value.value, depth + 1)
    return Object.values(value)
      .map((item) => flattenMkgText(item, depth + 1))
      .filter(Boolean)
      .slice(0, 8)
      .join(' · ')
  }
  return ''
}

function getMkgField(mkg, key) {
  if (!mkg || typeof mkg !== 'object') return null
  return mkg[key] ?? mkg?.fields?.[key] ?? null
}

export function suggestAptSendTime({ timezoneOffsetMinutes = 330, from = new Date() } = {}) {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000
  const local = new Date(from.getTime() + offsetMs)
  let day = new Date(Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    9,
    30,
    0,
  ))

  const localMinutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  if (localMinutes >= 9 * 60 + 30) {
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  }

  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  }

  return new Date(day.getTime() - offsetMs).toISOString()
}

function normalizeProspect(raw, index = 0) {
  const fullName =
    raw.full_name ||
    raw.name ||
    [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim() ||
    'Unknown'

  return {
    id: String(raw.id || raw.apollo_id || `p-${index}-${Date.now()}`),
    full_name: fullName,
    first_name: raw.first_name || fullName.split(' ')[0] || '',
    last_name: raw.last_name || fullName.split(' ').slice(1).join(' ') || '',
    title: raw.designation || raw.title || raw.headline || '',
    company: raw.company || raw.organization_name || raw.organization?.name || '',
    industry: raw.icp_industry || raw.industry || raw.organization?.industry || '',
    email: raw.email || raw.email_norm || '',
    linkedin_url: raw.linkedin_url || '',
    city: raw.city || '',
    state: raw.state || '',
    seniority: raw.seniority || '',
    status: raw.status || 'fetched',
    subject: raw.subject || '',
    body: raw.body || '',
    scheduled_for: raw.scheduled_for || null,
    gmail_draft_id: raw.gmail_draft_id || null,
    gmail_thread_id: raw.gmail_thread_id || null,
    sent_at: raw.sent_at || null,
    send_error: raw.send_error || null,
    send_meta: raw.send_meta || null,
    replies: Array.isArray(raw.replies) ? raw.replies : [],
    raw: raw.raw || raw,
  }
}

function getOutreachDbClient() {
  return getSupabaseWriteClient()
}

function prospectToRow(runId, prospect) {
  return {
    id: prospect.id,
    run_id: runId,
    full_name: prospect.full_name || null,
    first_name: prospect.first_name || null,
    last_name: prospect.last_name || null,
    title: prospect.title || null,
    company: prospect.company || null,
    industry: prospect.industry || null,
    email: prospect.email || null,
    linkedin_url: prospect.linkedin_url || null,
    city: prospect.city || null,
    state: prospect.state || null,
    seniority: prospect.seniority || null,
    status: prospect.status || 'fetched',
    subject: prospect.subject || null,
    body: prospect.body || null,
    scheduled_for: prospect.scheduled_for || null,
    gmail_draft_id: prospect.gmail_draft_id || null,
    gmail_thread_id: prospect.gmail_thread_id || null,
    sent_at: prospect.sent_at || null,
    send_error: prospect.send_error || null,
    send_meta: prospect.send_meta || null,
    replies: prospect.replies || [],
    raw: prospect.raw || null,
  }
}

function prospectFromRow(row) {
  return normalizeProspect({
    ...row,
    scheduled_for: row.scheduled_for || null,
    sent_at: row.sent_at || null,
  })
}

function runToRow(run) {
  return {
    id: run.id,
    workspace_id: run.workspaceId,
    company_id: run.companyId || null,
    company_name: run.companyName || null,
    question: run.question || null,
    channel: run.channel || 'email',
    target: run.target || 'decision',
    goal: run.goal || 'reply',
    source: run.source || null,
    campaigns: run.campaigns || [],
    replies: run.replies || [],
    created_at: run.createdAt || new Date().toISOString(),
  }
}

function runFromDbRow(runRow, prospectRows = []) {
  return {
    id: runRow.id,
    workspaceId: runRow.workspace_id,
    companyId: runRow.company_id || null,
    companyName: runRow.company_name || '',
    question: runRow.question || '',
    channel: runRow.channel || 'email',
    target: runRow.target || 'decision',
    goal: runRow.goal || 'reply',
    source: runRow.source || '',
    createdAt: runRow.created_at,
    prospects: prospectRows.map(prospectFromRow),
    campaigns: Array.isArray(runRow.campaigns) ? runRow.campaigns : [],
    replies: Array.isArray(runRow.replies) ? runRow.replies : [],
  }
}

function registerRunInMemory(run) {
  if (!run?.id) return run
  run.prospects = (run.prospects || []).map((p, i) => normalizeProspect(p, i))
  run.campaigns = Array.isArray(run.campaigns) ? run.campaigns : []
  run.replies = Array.isArray(run.replies) ? run.replies : []
  runsById.set(run.id, run)
  return run
}

async function persistRunToSupabase(run) {
  const client = getOutreachDbClient()
  if (!client) return false

  const runRow = runToRow(run)
  const { error: runError } = await client
    .from('outreach_runs')
    .upsert(runRow, { onConflict: 'id' })

  if (runError) {
    if (runError.code === '42P01') {
      console.warn('[outreach] outreach_runs table missing — run database/migrations/outreach-runs.sql')
      return false
    }
    throw runError
  }

  const { error: deleteError } = await client
    .from('outreach_prospects')
    .delete()
    .eq('run_id', run.id)

  if (deleteError && deleteError.code !== '42P01') {
    throw deleteError
  }

  const prospectRows = (run.prospects || []).map((p) => prospectToRow(run.id, p))
  if (prospectRows.length) {
    const { error: prospectError } = await client.from('outreach_prospects').insert(prospectRows)
    if (prospectError) {
      if (prospectError.code === '42P01') return false
      throw prospectError
    }
  }

  return true
}

async function loadRunsFromSupabase() {
  const client = getSupabaseReadClient()
  if (!client) return []

  const { data: runRows, error } = await client
    .from('outreach_runs')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') {
      console.warn('[outreach] outreach_runs table missing — using disk fallback')
      return []
    }
    throw error
  }

  if (!runRows?.length) return []

  const runIds = runRows.map((row) => row.id)
  const { data: prospectRows, error: prospectError } = await client
    .from('outreach_prospects')
    .select('*')
    .in('run_id', runIds)

  if (prospectError && prospectError.code !== '42P01') {
    throw prospectError
  }

  const prospectsByRun = new Map()
  for (const row of prospectRows || []) {
    if (!prospectsByRun.has(row.run_id)) prospectsByRun.set(row.run_id, [])
    prospectsByRun.get(row.run_id).push(row)
  }

  return runRows.map((row) => runFromDbRow(row, prospectsByRun.get(row.id) || []))
}

async function loadRunsFromDisk() {
  const loaded = []
  try {
    await ensureDataDir()
    const files = await readdir(OUTREACH_DATA_DIR)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(OUTREACH_DATA_DIR, file), 'utf8')
        const run = JSON.parse(raw)
        if (run?.id) {
          loaded.push({
            ...run,
            prospects: (run.prospects || []).map((p, i) => normalizeProspect(p, i)),
            campaigns: Array.isArray(run.campaigns) ? run.campaigns : [],
            replies: Array.isArray(run.replies) ? run.replies : [],
          })
        }
      } catch (err) {
        console.warn('[outreach] skip corrupt run file', file, err.message)
      }
    }
  } catch (err) {
    console.warn('[outreach] disk load failed:', err.message)
  }
  return loaded
}

async function ensureDataDir() {
  await mkdir(OUTREACH_DATA_DIR, { recursive: true })
}

function runFilePath(runId) {
  return join(OUTREACH_DATA_DIR, `${runId}.json`)
}

async function persistRun(run) {
  if (!run?.id) return
  registerRunInMemory(run)
  persistQueue = persistQueue
    .then(async () => {
      const savedToDb = await persistRunToSupabase(run).catch((err) => {
        console.error('[outreach] supabase persist failed:', err.message)
        return false
      })
      if (!savedToDb) {
        await ensureDataDir()
        await writeFile(runFilePath(run.id), JSON.stringify(run, null, 2), 'utf8')
      }
    })
    .catch((err) => {
      console.error('[outreach] persist failed:', err.message)
    })
  return persistQueue
}

export async function hydrateOutreachStore() {
  if (hydrated) return
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    try {
      const supabaseRuns = await loadRunsFromSupabase().catch((err) => {
        console.error('[outreach] supabase hydrate failed:', err.message)
        return []
      })

      for (const run of supabaseRuns) {
        registerRunInMemory(run)
      }

      const diskRuns = await loadRunsFromDisk()
      for (const run of diskRuns) {
        if (runsById.has(run.id)) continue
        registerRunInMemory(run)
        await persistRunToSupabase(run).catch((err) => {
          console.warn('[outreach] disk→supabase migration failed for', run.id, err.message)
        })
      }

      hydrated = true
      const source =
        supabaseRuns.length > 0
          ? `supabase (${supabaseRuns.length})`
          : diskRuns.length > 0
            ? `disk (${diskRuns.length})`
            : 'empty'
      console.info(`[outreach] hydrated ${runsById.size} run(s) from ${source}`)
    } catch (err) {
      console.error('[outreach] hydrate failed:', err.message)
      hydrated = true
    }
  })()
  return hydratePromise
}

export function getOutreachRun(runId) {
  return runsById.get(runId) || null
}

export function listOutreachRunsForWorkspace(workspaceId) {
  const id = String(workspaceId || '').trim()
  if (!id) return []
  return Array.from(runsById.values())
    .filter((run) => run.workspaceId === id || run.companyId === id)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

export function getWorkspaceOutreachSummary(workspaceId) {
  const runs = listOutreachRunsForWorkspace(workspaceId)
  const campaigns = []
  const replies = []
  const scheduled = []
  const sent = []

  for (const run of runs) {
    for (const campaign of run.campaigns || []) {
      campaigns.push({
        ...campaign,
        runId: run.id,
        question: run.question,
        companyName: run.companyName,
      })
    }
    for (const prospect of run.prospects || []) {
      if (prospect.status === 'scheduled') {
        scheduled.push({
          runId: run.id,
          prospectId: prospect.id,
          full_name: prospect.full_name,
          company: prospect.company,
          email: prospect.email,
          scheduled_for: prospect.scheduled_for,
          subject: prospect.subject,
        })
      }
      if (prospect.status === 'sent') {
        sent.push({
          runId: run.id,
          prospectId: prospect.id,
          full_name: prospect.full_name,
          company: prospect.company,
          email: prospect.email,
          sent_at: prospect.sent_at,
          subject: prospect.subject,
        })
      }
      for (const reply of prospect.replies || []) {
        replies.push({
          ...reply,
          runId: run.id,
          prospectId: prospect.id,
          prospect_name: prospect.full_name,
          prospect_company: prospect.company,
          prospect_email: prospect.email,
        })
      }
    }
    for (const reply of run.replies || []) {
      if (!replies.some((r) => r.id === reply.id)) {
        replies.push({ ...reply, runId: run.id })
      }
    }
  }

  replies.sort((a, b) => String(b.received_at || '').localeCompare(String(a.received_at || '')))
  scheduled.sort((a, b) => String(a.scheduled_for || '').localeCompare(String(b.scheduled_for || '')))
  sent.sort((a, b) => String(b.sent_at || '').localeCompare(String(a.sent_at || '')))

  return { runs, campaigns, scheduled, sent, replies }
}

export async function createOutreachRun({
  workspaceId,
  companyId,
  companyName = '',
  question = '',
  channel = 'email',
  target = 'decision',
  goal = 'reply',
  industries = [],
  titles = [],
  country = 'IN',
  limit = OUTREACH_APOLLO_MAX,
}) {
  await hydrateOutreachStore()
  const capped = Math.min(Math.max(Number(limit) || OUTREACH_APOLLO_MAX, 1), OUTREACH_APOLLO_MAX)
  const entityId = workspaceId || companyId
  if (!entityId) throw new Error('workspaceId or companyId is required')

  const titleList = Array.isArray(titles)
    ? titles
        .map((t) => String(t || '').trim())
        // Composio: each entry must be a plain title string — no "A OR B"
        .filter((t) => t && !/\bOR\b/i.test(t))
        .slice(0, 8)
    : []
  const industryList = Array.isArray(industries)
    ? industries.map(String).map((i) => i.replace(/_/g, ' ').trim()).filter(Boolean).slice(0, 8)
    : []
  const countryLabel =
    { IN: 'India', US: 'United States' }[String(country || 'IN').toUpperCase()] ||
    String(country || '').trim()

  // Map outreach "target" to Apollo person_seniorities (schema examples: Director, VP, Senior)
  const seniorityByTarget = {
    decision: ['c_suite', 'founder', 'owner', 'partner', 'vp', 'head', 'director'],
    champion: ['director', 'manager', 'head', 'senior'],
    all: [],
  }
  const seniorityList = seniorityByTarget[String(target || 'decision').toLowerCase()] || seniorityByTarget.decision

  let leads = []
  let source = 'apollo'

  /**
   * Build APOLLO_PEOPLE_SEARCH args from Composio schema only.
   * Omit empty values — empty arrays commonly cause 422.
   * Start broad: titles + location (+ optional seniorities). Do not dump the
   * full ICP question into q_keywords (docs: AND search → zero/invalid results).
   */
  const buildPeopleSearchArgs = (mode = 'full') => {
    const args = {
      page: 1,
      per_page: Math.min(Math.max(capped, 1), 100),
    }
    if (mode === 'full' && titleList.length) args.person_titles = titleList
    if (mode === 'full' && seniorityList.length) args.person_seniorities = seniorityList
    if (countryLabel) args.person_locations = [countryLabel]
    // Short industry keyword only — not the full briefing question
    if (mode === 'full' && industryList.length === 1 && industryList[0].split(/\s+/).length <= 4) {
      args.q_keywords = industryList[0]
    }
    return args
  }

  const unwrapApolloPeople = (payload) => {
    let data = payload
    // Composio schema types `data` as string — may arrive JSON-encoded
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        return []
      }
    }
    if (!data || typeof data !== 'object') return []
    if (typeof data.data === 'string') {
      try {
        data = { ...data, ...(JSON.parse(data.data) || {}) }
      } catch {
        /* keep */
      }
    }
    const nested = data.data && typeof data.data === 'object' ? data.data : null
    const list =
      data.people ||
      data.contacts ||
      data.matches ||
      nested?.people ||
      nested?.contacts ||
      (Array.isArray(data.data) ? data.data : null) ||
      (Array.isArray(data) ? data : null) ||
      []
    return Array.isArray(list) ? list : []
  }

  const mapPeopleToLeads = (people) =>
    people.slice(0, capped).map((person) => ({
      id: person.id,
      full_name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
      first_name: person.first_name,
      last_name: person.last_name,
      designation: person.title || person.headline,
      company: person.organization?.name || person.organization_name,
      icp_industry: person.organization?.industry || person.industry,
      email: person.email,
      email_norm: person.email,
      linkedin_url: person.linkedin_url,
      city: person.city,
      state: person.state,
      seniority: person.seniority,
    }))

  const isApolloAuthError = (message) =>
    /401|403|unauthorized|invalid api key|authorization failed|master api key/i.test(String(message || ''))

  /**
   * Composio's APOLLO_PEOPLE_SEARCH action has been observed to 403
   * ("Authorization failed. Make sure you're using a master API key.") even when the
   * connected account genuinely holds a master key — this looks like an issue in how
   * Composio proxies this specific Apollo endpoint, not a bad credential. Fall back to
   * calling Apollo directly with the same master key Composio already has on file.
   */
  const apolloPeopleSearchDirect = async (entityIds, args) => {
    const connected = await getConnectedAccountApiKeyForEntities('apollo', entityIds)
    const apiKey = connected?.api_key
    if (!apiKey) return { error: connected?.error || 'No Apollo API key available' }
    try {
      const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          accept: 'application/json',
        },
        body: JSON.stringify(args),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const base = data?.error || data?.error_message || data?.message || `Apollo API failed: ${res.status}`
        console.error(`[outreach] Apollo direct fallback ${res.status}:`, JSON.stringify(data).slice(0, 500))
        return { error: base }
      }
      return { result: data }
    } catch (err) {
      return { error: err.message }
    }
  }

  // Composio Apollo toolkit: APOLLO_PEOPLE_SEARCH (try workspace + company entity IDs)
  const composioEntityIds = [workspaceId, companyId].filter(Boolean)
  let composioSearch = await executeComposioActionForEntities(
    'APOLLO_PEOPLE_SEARCH',
    buildPeopleSearchArgs('full'),
    composioEntityIds,
  )

  // Retry once: drop seniorities/keywords if Apollo rejects the filter set
  if (
    composioSearch.error &&
    /422|invalid request parameters|invalid parameters/i.test(String(composioSearch.error))
  ) {
    composioSearch = await executeComposioActionForEntities(
      'APOLLO_PEOPLE_SEARCH',
      buildPeopleSearchArgs('minimal'),
      composioEntityIds,
    )
  }

  if (!composioSearch.error) {
    const people = unwrapApolloPeople(composioSearch.result)
    if (people.length) {
      leads = mapPeopleToLeads(people)
      source = 'apollo_people_search'
    }
  }

  // Composio proxy failed on an auth-shaped error — retry once against Apollo directly
  // using the same connected master key before giving up.
  if (!leads.length && composioSearch.error && isApolloAuthError(composioSearch.error)) {
    console.error('[outreach] Composio Apollo search failed, trying direct API fallback:', composioSearch.error)
    const direct = await apolloPeopleSearchDirect(composioEntityIds, buildPeopleSearchArgs('full'))
    if (direct.error) {
      console.error('[outreach] Apollo direct fallback also failed:', direct.error)
    } else {
      const people = unwrapApolloPeople(direct.result)
      if (people.length) {
        leads = mapPeopleToLeads(people)
        source = 'apollo_people_search_direct'
      }
    }
  }

  if (!leads.length) {
    if (composioSearch.error) {
      // Log the raw Composio/Apollo error - formatApolloConnectionError() collapses
      // everything into a generic "reconnect" message for the UI, which makes
      // "still fails after reconnecting with a valid key" reports impossible to diagnose.
      console.error('[outreach] Apollo people search failed:', composioSearch.error)
      throw new Error(formatApolloConnectionError(composioSearch.error))
    }
    throw new Error('No prospects matched your filters in Apollo. Try broader titles or location.')
  }

  const prospects = leads.map((lead, i) => normalizeProspect(lead, i))

  const run = {
    id: randomUUID(),
    workspaceId: entityId,
    companyId: companyId || null,
    companyName,
    question,
    channel,
    target,
    goal,
    source,
    createdAt: new Date().toISOString(),
    prospects,
    campaigns: [],
    replies: [],
  }
  await persistRun(run)
  return run
}

export function buildProspectCopyPrompt({
  prospect,
  companyName,
  question,
  goal,
  channel,
  mkg,
}) {
  const positioning = flattenMkgText(getMkgField(mkg, 'positioning')).slice(0, 600)
  const messaging = flattenMkgText(getMkgField(mkg, 'messaging')).slice(0, 600)
  const offer = flattenMkgText(getMkgField(mkg, 'offer') || getMkgField(mkg, 'offers')).slice(0, 500)
  const icp = flattenMkgText(getMkgField(mkg, 'icp')).slice(0, 400)

  return [
    `Write ONE short first-touch cold email for a single B2B prospect.`,
    `Sender company: ${companyName || 'our company'}.`,
    `Campaign intent: ${question || 'outbound outreach'}.`,
    `Primary goal: ${goal || 'earn a reply'}.`,
    `Channel: ${channel || 'email'}.`,
    '',
    'Prospect:',
    `- Name: ${prospect.full_name}`,
    `- Title: ${prospect.title || 'n/a'}`,
    `- Company: ${prospect.company || 'n/a'}`,
    `- Industry: ${prospect.industry || 'n/a'}`,
    `- Location: ${[prospect.city, prospect.state].filter(Boolean).join(', ') || 'n/a'}`,
    '',
    'Our value context (use only what is relevant to THIS prospect company):',
    `- Positioning: ${positioning || 'not available'}`,
    `- Messaging: ${messaging || 'not available'}`,
    `- Offer: ${offer || 'not available'}`,
    `- ICP notes: ${icp || 'not available'}`,
    '',
    'Rules:',
    '- Personalize the value to the prospect company / role — not generic fluff.',
    '- Keep body under 120 words. One clear CTA.',
    '- No markdown. No bullet lists in the body.',
    '- Do not invent fake mutual connections or fake metrics.',
    '',
    'Return plain text exactly as:',
    'SUBJECT: <subject line>',
    'BODY:',
    '<email body>',
  ].join('\n')
}

export function parseEmailCopy(text) {
  const trimmed = String(text || '').trim()
  const subjectMatch = trimmed.match(/SUBJECT:\s*(.+)/i)
  const bodyMatch = trimmed.match(/BODY:\s*([\s\S]+)/i)
  return {
    subject: (subjectMatch?.[1] || '').trim() || 'Quick question',
    body: (bodyMatch?.[1] || trimmed).trim(),
  }
}

export async function streamProspectCopy({
  runId,
  prospectId,
  groqClient,
  res,
}) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const prospect = run.prospects.find((p) => p.id === prospectId)
  if (!prospect) throw new Error('Prospect not found')

  const mkg = run.companyId
    ? await MKGService.read(run.companyId).catch(() => null)
    : null

  const prompt = buildProspectCopyPrompt({
    prospect,
    companyName: run.companyName,
    question: run.question,
    goal: run.goal,
    channel: run.channel,
    mkg,
  })

  const model = getLLMModel('agent-run') || getLLMModel('company-intel')
  const stream = await groqClient.chat.completions.create({
    model,
    stream: true,
    temperature: 0.6,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content:
          'You write concise, personalized B2B cold emails. Follow the output format exactly.',
      },
      { role: 'user', content: prompt },
    ],
  })

  let fullText = ''
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content || ''
    if (!token) continue
    fullText += token
    res.write(`data: ${JSON.stringify({ text: token })}\n\n`)
  }

  const parsed = parseEmailCopy(fullText)
  prospect.subject = parsed.subject
  prospect.body = parsed.body
  prospect.status = 'copy_ready'
  await persistRun(run)

  res.write(
    `data: ${JSON.stringify({
      done: true,
      subject: parsed.subject,
      body: parsed.body,
      prospectId,
    })}\n\n`,
  )
  res.write('data: [DONE]\n\n')
  return { subject: parsed.subject, body: parsed.body }
}

function upsertGmailCampaign(run, prospectId) {
  let campaign = run.campaigns.find((c) => c.provider === 'gmail')
  if (!campaign) {
    campaign = {
      id: randomUUID(),
      provider: 'gmail',
      name: run.question?.slice(0, 80) || 'Gmail outreach',
      status: 'active',
      createdAt: new Date().toISOString(),
      prospectIds: [],
      sentCount: 0,
      replyCount: 0,
    }
    run.campaigns.push(campaign)
  }
  if (!campaign.prospectIds.includes(prospectId)) {
    campaign.prospectIds.push(prospectId)
  }
  return campaign
}

export async function saveProspectGmailDraft({
  runId,
  prospectId,
  subject,
  body,
  scheduledFor,
  timezoneOffsetMinutes = 330,
}) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const prospect = run.prospects.find((p) => p.id === prospectId)
  if (!prospect) throw new Error('Prospect not found')

  const finalSubject = (subject || prospect.subject || '').trim()
  const finalBody = (body || prospect.body || '').trim()
  if (!finalSubject || !finalBody) {
    throw new Error('Subject and body are required before saving a Gmail draft')
  }
  if (!prospect.email) {
    throw new Error('Prospect has no email — enrich or pick another contact')
  }

  const draftRes = await executeComposioAction(
    'GMAIL_CREATE_EMAIL_DRAFT',
    {
      recipient_email: prospect.email,
      to: prospect.email,
      subject: finalSubject,
      body: finalBody,
      message_body: finalBody,
    },
    run.workspaceId,
  )

  if (draftRes.error) {
    throw new Error(draftRes.error)
  }

  const draftId =
    draftRes.result?.id ||
    draftRes.result?.draft_id ||
    draftRes.result?.data?.id ||
    draftRes.result?.message?.id ||
    null

  const apt =
    scheduledFor ||
    suggestAptSendTime({ timezoneOffsetMinutes })

  prospect.subject = finalSubject
  prospect.body = finalBody
  prospect.gmail_draft_id = draftId
  prospect.scheduled_for = apt
  prospect.status = 'scheduled'
  prospect.send_error = null

  const campaign = upsertGmailCampaign(run, prospect.id)
  campaign.status = 'scheduled'
  await persistRun(run)

  // Register Composio inbox trigger so replies can push via webhook (poll is backup)
  void ensureGmailReplyTrigger(run.workspaceId || 'default').catch((err) => {
    console.warn('[outreach] ensureGmailReplyTrigger:', err?.message || err)
  })

  return {
    prospect,
    draftId,
    scheduled_for: apt,
    campaign,
  }
}

export function updateProspectCopy(runId, prospectId, { subject, body }) {
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const prospect = run.prospects.find((p) => p.id === prospectId)
  if (!prospect) throw new Error('Prospect not found')
  if (typeof subject === 'string') prospect.subject = subject
  if (typeof body === 'string') prospect.body = body
  if (prospect.subject && prospect.body) prospect.status = 'copy_ready'
  void persistRun(run)
  return prospect
}

async function sendProspectNow(run, prospect) {
  const subject = (prospect.subject || '').trim()
  const body = (prospect.body || '').trim()
  if (!subject || !body) {
    throw new Error('Missing subject/body')
  }
  if (!prospect.email) {
    throw new Error('Missing prospect email')
  }

  // Prefer sending the existing draft when we have an id
  if (prospect.gmail_draft_id) {
    const sendDraft = await executeComposioAction(
      'GMAIL_SEND_DRAFT',
      {
        draft_id: prospect.gmail_draft_id,
        id: prospect.gmail_draft_id,
      },
      run.workspaceId,
    )
    if (!sendDraft.error) {
      const threadId = extractGmailThreadId(sendDraft.result)
      if (threadId) prospect.gmail_thread_id = threadId
      return { method: 'gmail_send_draft', result: sendDraft.result, thread_id: threadId }
    }
  }

  const sendEmail = await executeComposioAction(
    'GMAIL_SEND_EMAIL',
    {
      recipient_email: prospect.email,
      to: prospect.email,
      subject,
      body,
      message_body: body,
    },
    run.workspaceId,
  )

  if (sendEmail.error) {
    throw new Error(sendEmail.error)
  }
  const threadId = extractGmailThreadId(sendEmail.result)
  if (threadId) prospect.gmail_thread_id = threadId
  return { method: 'gmail_send_email', result: sendEmail.result, thread_id: threadId }
}

function extractEmailAddress(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const angle = raw.match(/<([^>]+)>/)
  const candidate = (angle?.[1] || raw).trim()
  const match = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0].toLowerCase() : ''
}

function extractGmailThreadId(payload) {
  if (!payload || typeof payload !== 'object') return null
  return (
    payload.thread_id ||
    payload.threadId ||
    payload.data?.thread_id ||
    payload.data?.threadId ||
    payload.message?.thread_id ||
    payload.message?.threadId ||
    payload.response_data?.thread_id ||
    payload.response_data?.threadId ||
    null
  )
}

function gmailAfterQueryDate(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

function unwrapMessages(result) {
  if (!result) return []
  if (Array.isArray(result)) return result
  const candidates = [
    result.messages,
    result.data?.messages,
    result.response_data?.messages,
    result.items,
    result.data?.items,
    result.emails,
    result.data?.emails,
  ]
  for (const list of candidates) {
    if (Array.isArray(list)) return list
  }
  // Single message object
  if (result.message_id || result.messageId || result.id || result.thread_id || result.threadId) {
    return [result]
  }
  return []
}

function normalizeGmailMessage(raw) {
  if (!raw || typeof raw !== 'object') return null
  const headers = raw.payload?.headers || raw.headers || []
  const headerMap = Object.fromEntries(
    (Array.isArray(headers) ? headers : []).map((h) => [
      String(h?.name || '').toLowerCase(),
      String(h?.value || ''),
    ]),
  )
  const from =
    raw.sender ||
    raw.from ||
    raw.from_email ||
    headerMap.from ||
    raw.payload?.headers?.find?.((h) => /from/i.test(h?.name))?.value ||
    ''
  const subject =
    raw.subject ||
    headerMap.subject ||
    raw.preview?.subject ||
    ''
  const body =
    raw.message_text ||
    raw.body ||
    raw.text ||
    raw.snippet ||
    raw.preview?.body ||
    raw.payload?.body?.data ||
    ''
  const messageId =
    raw.message_id ||
    raw.messageId ||
    raw.id ||
    headerMap['message-id'] ||
    null
  const threadId = raw.thread_id || raw.threadId || null
  const receivedAt =
    raw.message_timestamp ||
    raw.internalDate ||
    raw.date ||
    headerMap.date ||
    null

  return {
    from: extractEmailAddress(from),
    from_raw: from,
    subject: String(subject || '').trim(),
    body: typeof body === 'string' ? body.trim() : String(body || '').trim(),
    message_id: messageId ? String(messageId) : null,
    thread_id: threadId ? String(threadId) : null,
    received_at: receivedAt
      ? new Date(Number.isFinite(Number(receivedAt)) ? Number(receivedAt) : receivedAt).toISOString()
      : new Date().toISOString(),
    raw,
  }
}

/**
 * Ensure Composio GMAIL_NEW_GMAIL_MESSAGE trigger exists for this workspace user.
 * Requires project webhook URL configured in Composio dashboard.
 */
export async function ensureGmailReplyTrigger(workspaceId = 'default') {
  const interval = Math.max(1, Number(process.env.GMAIL_REPLY_TRIGGER_INTERVAL_MIN || 1))
  const result = await upsertComposioTrigger('GMAIL_NEW_GMAIL_MESSAGE', {
    userId: workspaceId,
    triggerConfig: {
      interval,
      labelIds: 'INBOX',
      userId: 'me',
      query: 'in:inbox -category:promotions -category:social',
    },
  })
  return result
}

/**
 * Handle a Composio GMAIL_NEW_GMAIL_MESSAGE (or generic) trigger payload.
 */
export async function handleComposioGmailTrigger(payload = {}) {
  const data = payload.data || payload.payload || payload
  const meta = payload.metadata || {}
  const slug = String(
    meta.trigger_slug || payload.trigger_slug || payload.type || '',
  ).toUpperCase()

  if (slug && !slug.includes('GMAIL') && !slug.includes('NEW_GMAIL_MESSAGE')) {
    return { status: 'ignored', reason: `unsupported_trigger:${slug}` }
  }

  const normalized = normalizeGmailMessage({
    ...data,
    sender: data.sender || data.from || data.from_email,
    message_text: data.message_text || data.body || data.text,
    message_id: data.message_id || data.messageId || data.id,
    thread_id: data.thread_id || data.threadId,
    message_timestamp: data.message_timestamp || data.timestamp || data.date,
  })

  if (!normalized?.from) {
    return { status: 'ignored', reason: 'missing_from' }
  }

  return recordOutreachReply({
    provider: 'composio_gmail_trigger',
    email: normalized.from,
    subject: normalized.subject,
    body: normalized.body,
    id: normalized.message_id || `gmail-${normalized.thread_id || randomUUID()}`,
    received_at: normalized.received_at,
    thread_id: normalized.thread_id,
    source: 'composio',
    raw: payload,
  })
}

async function fetchGmailMessagesForQuery(workspaceId, query, maxResults = 15) {
  const res = await executeComposioAction(
    'GMAIL_FETCH_EMAILS',
    {
      query,
      q: query,
      max_results: maxResults,
      maxResults,
      label_ids: ['INBOX'],
      labelIds: ['INBOX'],
      user_id: 'me',
      userId: 'me',
      include_payload: true,
      verbose: true,
    },
    workspaceId,
  )
  if (res.error) return { error: res.error, messages: [] }
  const messages = unwrapMessages(res.result)
    .map(normalizeGmailMessage)
    .filter(Boolean)
  return { messages, raw: res.result }
}

/**
 * Poll Gmail inboxes for replies to sent outreach prospects.
 */
export async function processGmailReplyPolls() {
  await hydrateOutreachStore()

  /** @type {Map<string, Array<{ run: any, prospect: any }>>} */
  const byWorkspace = new Map()
  for (const run of runsById.values()) {
    const workspaceId = run.workspaceId || 'default'
    for (const prospect of run.prospects || []) {
      if (prospect.status !== 'sent') continue
      if (!prospect.email) continue
      if (!byWorkspace.has(workspaceId)) byWorkspace.set(workspaceId, [])
      byWorkspace.get(workspaceId).push({ run, prospect })
    }
  }

  const results = []

  for (const [workspaceId, items] of byWorkspace.entries()) {
    // Best-effort: keep trigger registered for push path
    try {
      await ensureGmailReplyTrigger(workspaceId)
    } catch {
      /* non-fatal */
    }

    // Chunk prospects to keep Gmail query size reasonable
    const chunkSize = 5
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)
      const fromClauses = chunk.map(({ prospect }) => `from:${prospect.email}`)
      const earliestSent = chunk
        .map(({ prospect }) => prospect.sent_at)
        .filter(Boolean)
        .sort()[0]
      const after = earliestSent ? gmailAfterQueryDate(earliestSent) : null
      const queryParts = [`(${fromClauses.join(' OR ')})`, 'in:inbox', '-in:sent']
      if (after) queryParts.push(`after:${after}`)
      const query = queryParts.join(' ')

      const fetched = await fetchGmailMessagesForQuery(workspaceId, query, 25)
      if (fetched.error) {
        results.push({ workspaceId, status: 'error', error: fetched.error, query })
        continue
      }

      const emailSet = new Set(
        chunk.map(({ prospect }) => String(prospect.email).trim().toLowerCase()),
      )

      for (const msg of fetched.messages) {
        if (!msg.from || !emailSet.has(msg.from)) continue
        try {
          const recorded = await recordOutreachReply({
            provider: 'gmail_poll',
            email: msg.from,
            subject: msg.subject,
            body: msg.body,
            id: msg.message_id || `gmail-poll-${msg.thread_id || randomUUID()}`,
            received_at: msg.received_at,
            thread_id: msg.thread_id,
          })
          results.push({
            workspaceId,
            status: recorded.status,
            email: msg.from,
            messageId: msg.message_id,
            runId: recorded.runId,
            prospectId: recorded.prospectId,
          })
        } catch (err) {
          results.push({
            workspaceId,
            status: 'error',
            email: msg.from,
            error: err.message || String(err),
          })
        }
      }

      // Thread-id fallback for prospects whose from: query missed (alias / different From)
      for (const { prospect } of chunk) {
        const threadId = prospect.gmail_thread_id || extractGmailThreadId(prospect.send_meta)
        if (!threadId) continue
        const threadRes = await executeComposioAction(
          'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
          {
            thread_id: threadId,
            threadId,
            user_id: 'me',
            userId: 'me',
          },
          workspaceId,
        )
        if (threadRes.error) continue
        const threadMessages = unwrapMessages(threadRes.result)
          .map(normalizeGmailMessage)
          .filter(Boolean)
        for (const msg of threadMessages) {
          if (!msg.from) continue
          if (msg.from === String(prospect.email).trim().toLowerCase()) {
            try {
              const recorded = await recordOutreachReply({
                provider: 'gmail_thread_poll',
                email: msg.from,
                subject: msg.subject,
                body: msg.body,
                id: msg.message_id || `gmail-thread-${threadId}-${msg.received_at}`,
                received_at: msg.received_at,
                thread_id: threadId,
              })
              results.push({
                workspaceId,
                status: recorded.status,
                email: msg.from,
                messageId: msg.message_id,
                runId: recorded.runId,
                prospectId: recorded.prospectId,
              })
            } catch (err) {
              results.push({
                workspaceId,
                status: 'error',
                email: msg.from,
                error: err.message || String(err),
              })
            }
          }
        }
      }
    }
  }

  return results
}

/**
 * Process due scheduled outreach sends. Returns summary of attempts.
 */
export async function processDueOutreachSends({ now = new Date() } = {}) {
  await hydrateOutreachStore()
  const nowMs = now.getTime()
  const results = []

  for (const run of runsById.values()) {
    let dirty = false
    for (const prospect of run.prospects || []) {
      if (prospect.status !== 'scheduled') continue
      if (!prospect.scheduled_for) continue
      const dueMs = Date.parse(prospect.scheduled_for)
      if (!Number.isFinite(dueMs) || dueMs > nowMs) continue

      try {
        const sendResult = await sendProspectNow(run, prospect)
        prospect.status = 'sent'
        prospect.sent_at = new Date().toISOString()
        prospect.send_error = null
        prospect.send_meta = sendResult
        const campaign = upsertGmailCampaign(run, prospect.id)
        campaign.sentCount = (campaign.sentCount || 0) + 1
        campaign.status = 'sending'
        dirty = true
        results.push({
          runId: run.id,
          prospectId: prospect.id,
          status: 'sent',
          email: prospect.email,
        })
      } catch (err) {
        prospect.send_error = err.message || String(err)
        // Keep scheduled so a later tick can retry; bump schedule +5 min to avoid hot-loop
        prospect.scheduled_for = new Date(nowMs + 5 * 60 * 1000).toISOString()
        dirty = true
        results.push({
          runId: run.id,
          prospectId: prospect.id,
          status: 'error',
          error: prospect.send_error,
        })
      }
    }
    if (dirty) await persistRun(run)
  }

  return results
}

/**
 * Ingest a reply webhook payload (Instantly / Gmail / generic).
 */
export async function recordOutreachReply(payload = {}) {
  await hydrateOutreachStore()

  const email = extractEmailAddress(
    payload.email ||
      payload.from_email ||
      payload.from ||
      payload.lead_email ||
      payload.prospect_email ||
      '',
  )
  const campaignExternalId = String(
    payload.campaign_id || payload.campaignId || payload.external_campaign_id || '',
  ).trim()
  const threadId = String(payload.thread_id || payload.threadId || '').trim()
  const body = String(payload.body || payload.text || payload.reply || payload.message || '').trim()
  const subject = String(payload.subject || '').trim()
  const receivedAt = payload.received_at || payload.timestamp || new Date().toISOString()
  const externalId = String(payload.id || payload.email_id || payload.message_id || randomUUID())

  if (!email && !campaignExternalId && !threadId) {
    throw new Error('Reply payload needs email, campaign_id, or thread_id')
  }

  let matched = null

  for (const run of runsById.values()) {
    for (const prospect of run.prospects || []) {
      const prospectEmail = String(prospect.email || '').trim().toLowerCase()
      if (email && prospectEmail && prospectEmail === email) {
        matched = { run, prospect }
        break
      }
      if (
        threadId &&
        (prospect.gmail_thread_id === threadId ||
          extractGmailThreadId(prospect.send_meta) === threadId)
      ) {
        matched = { run, prospect }
        break
      }
    }
    if (matched) break
  }

  // Fallback: match by workspace/campaign if only one recent sent prospect
  if (!matched && campaignExternalId) {
    for (const run of runsById.values()) {
      const campaign = (run.campaigns || []).find(
        (c) => c.id === campaignExternalId || c.external_id === campaignExternalId,
      )
      if (!campaign) continue
      const sentProspect = (run.prospects || []).find((p) => p.status === 'sent' && !p.replies?.length)
      if (sentProspect) {
        matched = { run, prospect: sentProspect }
        break
      }
    }
  }

  if (!matched) {
    return { status: 'unmatched', email, externalId }
  }

  const { run, prospect } = matched
  const reply = {
    id: externalId,
    email: email || prospect.email,
    subject,
    body,
    received_at: receivedAt,
    thread_id: threadId || prospect.gmail_thread_id || null,
    provider: payload.provider || payload.source || 'webhook',
    raw: payload,
  }

  prospect.replies = Array.isArray(prospect.replies) ? prospect.replies : []
  const already = prospect.replies.some((r) => r.id === reply.id)
  if (!already) {
    prospect.replies.push(reply)
  }
  prospect.status = 'replied'
  if (threadId && !prospect.gmail_thread_id) {
    prospect.gmail_thread_id = threadId
  }

  run.replies = Array.isArray(run.replies) ? run.replies : []
  if (!run.replies.some((r) => r.id === reply.id)) {
    run.replies.push({ ...reply, prospectId: prospect.id })
  }

  const campaign = upsertGmailCampaign(run, prospect.id)
  if (!already) {
    campaign.replyCount = (campaign.replyCount || 0) + 1
  }
  campaign.status = 'active'

  await persistRun(run)

  return {
    status: already ? 'duplicate' : 'recorded',
    runId: run.id,
    prospectId: prospect.id,
    reply,
  }
}

export async function sendProspectImmediately(runId, prospectId) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const prospect = run.prospects.find((p) => p.id === prospectId)
  if (!prospect) throw new Error('Prospect not found')

  const sendResult = await sendProspectNow(run, prospect)
  prospect.status = 'sent'
  prospect.sent_at = new Date().toISOString()
  prospect.send_error = null
  prospect.send_meta = sendResult
  const campaign = upsertGmailCampaign(run, prospect.id)
  campaign.sentCount = (campaign.sentCount || 0) + 1
  campaign.status = 'sending'
  await persistRun(run)
  return { prospect, sendResult, campaign }
}
