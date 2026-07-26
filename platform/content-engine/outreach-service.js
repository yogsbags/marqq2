/**
 * Structured Lead Outreach pipeline.
 * Find leads ≤100 → enrich person/company + signals → stream short email → Gmail draft → send → replies.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  executeComposioAction,
  getConnectedAccountApiKey,
  upsertComposioTrigger,
} from './mcp-router.js'
import { enrichProspectContext, findLeads, leadProviderLabel } from './lead-data-providers.js'
import {
  loadMarketingSkillsForOutreachChannel,
  listOutreachChannelSkillIds,
} from './lib/artifactMarketingSkills.js'
import { MKGService } from './mkg-service.js'
import { defaultLLMClient, getLLMModel } from './llm-client.js'
import { getSupabaseReadClient, getSupabaseWriteClient } from './supabase.js'

export const OUTREACH_APOLLO_MAX = 100
export const OUTREACH_LEAD_MAX = 100

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
    domain: raw.domain || raw.organization?.primary_domain || raw.organization?.domain || '',
    phone_e164: raw.phone_e164 || raw.phone || '',
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
    enrichment: raw.enrichment || raw.raw?.enrichment || null,
    person_profile: raw.person_profile || raw.raw?.person_profile || null,
    company_profile: raw.company_profile || raw.raw?.company_profile || null,
    signals: Array.isArray(raw.signals)
      ? raw.signals
      : (Array.isArray(raw.raw?.signals) ? raw.raw.signals : []),
    channel_copies: raw.channel_copies || raw.raw?.channel_copies || null,
    launch_connectors: Array.isArray(raw.launch_connectors)
      ? raw.launch_connectors
      : (Array.isArray(raw.raw?.launch_connectors) ? raw.raw.launch_connectors : []),
    copy_locked: Boolean(raw.copy_locked || raw.raw?.copy_locked),
    locked_at: raw.locked_at || raw.raw?.locked_at || null,
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
    raw: {
      ...(prospect.raw && typeof prospect.raw === 'object' ? prospect.raw : {}),
      enrichment: prospect.enrichment || null,
      person_profile: prospect.person_profile || null,
      company_profile: prospect.company_profile || null,
      signals: prospect.signals || [],
      channel_copies: prospect.channel_copies || null,
      launch_connectors: prospect.launch_connectors || [],
      phone_e164: prospect.phone_e164 || null,
      copy_locked: Boolean(prospect.copy_locked),
      locked_at: prospect.locked_at || null,
    },
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
  contactChannels = [],
  target = 'decision',
  goal = 'reply',
  industries = [],
  titles = [],
  domains = [],
  companies = [],
  country = 'IN',
  limit = OUTREACH_LEAD_MAX,
  provider = null,
}) {
  await hydrateOutreachStore()
  const capped = Math.min(Math.max(Number(limit) || OUTREACH_LEAD_MAX, 1), OUTREACH_LEAD_MAX)
  const entityId = workspaceId || companyId
  if (!entityId) throw new Error('workspaceId or companyId is required')

  const titleList = Array.isArray(titles)
    ? titles
        .map((t) => String(t || '').trim())
        .filter((t) => t && !/\bOR\b/i.test(t))
        .slice(0, 8)
    : []
  const industryList = Array.isArray(industries)
    ? industries.map(String).map((i) => i.replace(/_/g, ' ').trim()).filter(Boolean).slice(0, 8)
    : []
  const domainList = Array.isArray(domains)
    ? domains.map(String).map((d) => d.trim().replace(/^https?:\/\//, '').split('/')[0]).filter(Boolean).slice(0, 20)
    : []
  const companyList = Array.isArray(companies)
    ? companies.map(String).map((c) => c.trim()).filter(Boolean).slice(0, 20)
    : []

  const normalizedContactChannels = (Array.isArray(contactChannels) ? contactChannels : String(contactChannels || '').split(','))
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v === 'email' || v === 'phone' || v === 'linkedin')
  const requireEmail = normalizedContactChannels.includes('email') || normalizedContactChannels.length === 0
  const requirePhone = normalizedContactChannels.includes('phone')
  const requireLinkedin = normalizedContactChannels.includes('linkedin')

  // Map outreach "target" to seniority filters (Apollo person_seniorities / Hunter seniority)
  const seniorityByTarget = {
    decision: ['c_suite', 'founder', 'owner', 'partner', 'vp', 'head', 'director'],
    champion: ['director', 'manager', 'head', 'senior'],
    champions: ['director', 'manager', 'head', 'senior'],
    all: [],
  }
  const seniorityList = seniorityByTarget[String(target || 'decision').toLowerCase()] || seniorityByTarget.decision

  const search = await findLeads(
    {
      provider: provider || undefined,
      country,
      industries: industryList,
      titles: titleList,
      designation_keywords: titleList.join(', '),
      seniorities: seniorityList,
      domains: domainList,
      companies: companyList,
      limit: capped,
      require_verified_email: requireEmail,
      require_phone: requirePhone,
      require_linkedin: requireLinkedin,
      contact_channels: normalizedContactChannels,
    },
    companyId || entityId,
    [workspaceId, companyId].filter(Boolean),
  )

  if (search.status === 'error') {
    console.error('[outreach] lead search failed:', search.provider || 'none', search.error)
    throw new Error(search.error || 'Lead search failed')
  }

  const leads = Array.isArray(search.leads) ? search.leads : []
  if (!leads.length) {
    const label = leadProviderLabel(search.provider)
    throw new Error(
      `No prospects matched your filters in ${label}. Try broader titles, add company domains (helps Hunter), or switch lead-data provider in Settings.`,
    )
  }

  const prospects = leads.map((lead, i) => normalizeProspect(lead, i))
  const source = search.source || search.provider || 'lead_data'

  const run = {
    id: randomUUID(),
    workspaceId: entityId,
    companyId: companyId || null,
    companyName,
    question,
    channel,
    contactChannels: normalizedContactChannels,
    target,
    goal,
    source,
    provider: search.provider || null,
    createdAt: new Date().toISOString(),
    prospects,
    campaigns: [],
    replies: [],
  }
  await persistRun(run)
  return run
}

export function resolveOutreachCopyTypes(contactChannels = [], channel = 'email') {
  const selected = (Array.isArray(contactChannels) ? contactChannels : String(contactChannels || '').split(','))
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v === 'email' || v === 'phone' || v === 'linkedin')
  const effective = selected.length
    ? selected
    : channel === 'linkedin'
      ? ['linkedin']
      : channel === 'multi'
        ? ['email', 'linkedin']
        : ['email']

  const types = []
  if (effective.includes('email')) types.push('email')
  if (effective.includes('linkedin')) types.push('linkedin_dm')
  if (effective.includes('phone')) {
    types.push('whatsapp_dm')
    types.push('voicebot_script')
  }
  return Array.from(new Set(types))
}

export function resolveOutreachLaunchConnectors(contactChannels = [], channel = 'email') {
  const selected = (Array.isArray(contactChannels) ? contactChannels : String(contactChannels || '').split(','))
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v === 'email' || v === 'phone' || v === 'linkedin')
  const effective = selected.length
    ? selected
    : channel === 'linkedin'
      ? ['linkedin']
      : channel === 'multi'
        ? ['email', 'linkedin']
        : ['email']

  const connectors = []
  if (effective.includes('email')) connectors.push('instantly')
  if (effective.includes('linkedin')) connectors.push('heyreach')
  if (effective.includes('phone')) connectors.push('whatsapp')
  return Array.from(new Set(connectors))
}

function sharedProspectContextBlock({
  prospect,
  companyName,
  question,
  goal,
  mkg,
  personProfile = null,
  companyProfile = null,
  signals = [],
}) {
  const positioning = flattenMkgText(getMkgField(mkg, 'positioning')).slice(0, 600)
  const messaging = flattenMkgText(getMkgField(mkg, 'messaging')).slice(0, 600)
  const offer = flattenMkgText(getMkgField(mkg, 'offer') || getMkgField(mkg, 'offers')).slice(0, 500)
  const icp = flattenMkgText(getMkgField(mkg, 'icp')).slice(0, 400)
  const person = personProfile || {}
  const company = companyProfile || {}
  const signalLines = (Array.isArray(signals) ? signals : [])
    .map((s) => `- [${s.strength || 'medium'}] ${s.text || s.type}`)
    .filter(Boolean)
  const priorRoles = Array.isArray(person.prior_roles) && person.prior_roles.length
    ? person.prior_roles
        .map((r) => `${r.title || 'role'}${r.company ? ` @ ${r.company}` : ''}`)
        .join('; ')
    : ''

  return [
    `Sender company: ${companyName || 'our company'}.`,
    `Campaign intent: ${question || 'outbound outreach'}.`,
    `Primary goal: ${goal || 'earn a reply'}.`,
    '',
    'Prospect profile (from lead-data enrichment — treat as ground truth):',
    `- Name: ${person.full_name || prospect.full_name}`,
    `- Title: ${person.title || prospect.title || 'n/a'}`,
    `- Seniority: ${person.seniority || prospect.seniority || 'n/a'}`,
    `- Location: ${person.location || [prospect.city, prospect.state].filter(Boolean).join(', ') || 'n/a'}`,
    `- LinkedIn: ${person.linkedin_url || prospect.linkedin_url || 'n/a'}`,
    `- Email: ${person.email || prospect.email || 'n/a'}`,
    `- Phone: ${prospect.phone_e164 || prospect.phone || 'n/a'}`,
    `- Current role start: ${person.current_role?.start_date || 'n/a'}`,
    `- Prior roles: ${priorRoles || 'n/a'}`,
    '',
    'Prospect company profile (from lead-data enrichment):',
    `- Company: ${company.name || prospect.company || 'n/a'}`,
    `- Domain: ${company.domain || 'n/a'}`,
    `- Industry: ${company.industry || prospect.industry || 'n/a'}`,
    `- Employees: ${company.employee_count || company.employee_range || 'n/a'}`,
    `- Funding: ${company.funding || company.latest_funding_amount || 'n/a'}`,
    `- Description: ${(company.description || 'n/a').toString().slice(0, 280)}`,
    `- Technologies: ${Array.isArray(company.technologies) && company.technologies.length ? company.technologies.slice(0, 6).join(', ') : 'n/a'}`,
    company.homepage_excerpt ? `- Homepage excerpt: ${String(company.homepage_excerpt).slice(0, 220)}` : null,
    '',
    'Personalization signals (use at most ONE strong signal as the observation — do not invent others):',
    ...(signalLines.length ? signalLines : ['- none verified — keep observation light and role/company based only']),
    '',
    'Our value context (use only what is relevant to THIS prospect company):',
    `- Positioning: ${positioning || 'not available'}`,
    `- Messaging: ${messaging || 'not available'}`,
    `- Offer: ${offer || 'not available'}`,
    `- ICP notes: ${icp || 'not available'}`,
  ].filter((line) => line != null)
}

export function buildProspectCopyPrompt({
  prospect,
  companyName,
  question,
  goal,
  channel,
  copyType = 'email',
  mkg,
  personProfile = null,
  companyProfile = null,
  signals = [],
}) {
  const shared = sharedProspectContextBlock({
    prospect,
    companyName,
    question,
    goal,
    mkg,
    personProfile,
    companyProfile,
    signals,
  })

  const type = String(copyType || channel || 'email').toLowerCase()

  if (type === 'linkedin_dm' || type === 'linkedin') {
    return [
      'Write ONE short first-touch LinkedIn DM / connection note for a single B2B prospect (HeyReach-ready).',
      'Follow the social-content + copywriting (+ cold-email personalization) skill playbooks in the system prompt.',
      ...shared,
      '',
      'Rules:',
      '- Under 300 characters preferred; max ~450.',
      '- Peer tone. One observation + soft ask. No markdown.',
      '- Do not invent buying triggers beyond the signals list.',
      '',
      'Return plain text exactly as:',
      'MESSAGE:',
      '<linkedin dm body>',
    ].join('\n')
  }

  if (type === 'whatsapp_dm' || type === 'whatsapp') {
    return [
      'Write ONE short first-touch WhatsApp DM for a single B2B prospect.',
      'Follow the copywriting + marketing-psychology (+ cold-email brevity) skill playbooks in the system prompt.',
      ...shared,
      '',
      'Rules:',
      '- Under 60 words. Conversational, mobile-native. One CTA.',
      '- No markdown. No fake urgency. Do not invent triggers beyond signals.',
      '',
      'Return plain text exactly as:',
      'MESSAGE:',
      '<whatsapp dm body>',
    ].join('\n')
  }

  if (type === 'voicebot_script' || type === 'voicebot') {
    return [
      'Write ONE short outbound voicebot opening script for a single B2B prospect.',
      'Follow the sales-enablement + copywriting skill playbooks in the system prompt.',
      ...shared,
      '',
      'Rules:',
      '- 2–4 spoken sentences. Natural, polite, permission-based.',
      '- State who you are briefly after a personalized opener. One clear next step.',
      '- Do not invent metrics or triggers beyond the signals list.',
      '',
      'Return plain text exactly as:',
      'MESSAGE:',
      '<voicebot opening script>',
    ].join('\n')
  }

  return [
    'Write ONE short first-touch cold email for a single B2B prospect (Instantly / Gmail ready).',
    'Follow the cold-email (+ email-sequence / copywriting) skill playbooks in the system prompt.',
    ...shared,
    '',
    'Rules (aligned to cold-email skill):',
    '- Personalize from prospect profile + company profile + signals above. Observation must connect to the ask.',
    '- Lead with their world (you/your), not our pitch. Write like a peer, not a vendor.',
    '- Keep body under 120 words. One clear low-friction CTA (reply-oriented).',
    '- No markdown. No bullet lists in the body.',
    '- Do not invent fake mutual connections, fake metrics, funding, hiring, or AI clichés.',
    '- If signals are empty, stay generic to role/company — do not fabricate triggers.',
    '- Do not open with who we are; earn the right to pitch.',
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

export function parseChannelCopy(copyType, text) {
  const type = String(copyType || 'email').toLowerCase()
  if (type === 'email') return { ...parseEmailCopy(text), copy_type: 'email' }
  const trimmed = String(text || '').trim()
  const messageMatch = trimmed.match(/MESSAGE:\s*([\s\S]+)/i)
  return {
    subject: '',
    body: (messageMatch?.[1] || trimmed).trim(),
    copy_type: type,
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
  if (prospect.copy_locked) {
    throw new Error('Copy is locked. Unlock to regenerate.')
  }

  const mkg = run.companyId
    ? await MKGService.read(run.companyId).catch(() => null)
    : null

  // Enrich person + company + signals before drafting (Apollo / Hunter / Apify best-effort)
  res.write(`data: ${JSON.stringify({ stage: 'enriching', text: '' })}\n\n`)
  let enrichment = prospect.enrichment || null
  try {
    const domainGuess =
      prospect.domain
      || prospect.raw?.domain
      || (prospect.email && String(prospect.email).includes('@')
        ? String(prospect.email).split('@')[1]
        : '')
      || ''

    enrichment = await enrichProspectContext(
      {
        provider: run.provider || undefined,
        email: prospect.email || undefined,
        first_name: prospect.first_name || undefined,
        last_name: prospect.last_name || undefined,
        full_name: prospect.full_name || undefined,
        company: prospect.company || undefined,
        domain: domainGuess || undefined,
        title: prospect.title || undefined,
        linkedin_url: prospect.linkedin_url || undefined,
        city: prospect.city || undefined,
        state: prospect.state || undefined,
        industry: prospect.industry || undefined,
        seniority: prospect.seniority || undefined,
      },
      run.companyId,
      [run.workspaceId, run.companyId].filter(Boolean),
    )

    prospect.enrichment = {
      status: enrichment.status,
      provider: enrichment.provider,
      sources: enrichment.sources || [],
      errors: enrichment.errors || [],
      enriched_at: new Date().toISOString(),
    }
    prospect.person_profile = enrichment.person || null
    prospect.company_profile = enrichment.organization || null
    prospect.signals = enrichment.signals || []

    // Backfill contact fields when enrichment found better data
    if (enrichment.person?.email && !prospect.email) prospect.email = enrichment.person.email
    if (enrichment.person?.title) prospect.title = enrichment.person.title
    if (enrichment.person?.linkedin_url) prospect.linkedin_url = enrichment.person.linkedin_url
    if (enrichment.organization?.name && (!prospect.company || prospect.company === '—')) {
      prospect.company = enrichment.organization.name
    }
    if (enrichment.organization?.industry) prospect.industry = enrichment.organization.industry
    if (enrichment.organization?.domain) prospect.domain = enrichment.organization.domain

    prospect.status = 'enriched'
    await persistRun(run)

    res.write(
      `data: ${JSON.stringify({
        stage: 'enriched',
        enrichment: prospect.enrichment,
        signals: prospect.signals,
        person_profile: prospect.person_profile,
        company_profile: prospect.company_profile,
      })}\n\n`,
    )
  } catch (err) {
    console.warn('[outreach] enrich before copy failed (continuing with thin profile):', err.message)
    prospect.enrichment = {
      status: 'error',
      error: err.message,
      enriched_at: new Date().toISOString(),
    }
    res.write(
      `data: ${JSON.stringify({
        stage: 'enrich_failed',
        error: err.message,
      })}\n\n`,
    )
  }

  res.write(`data: ${JSON.stringify({ stage: 'drafting', text: '' })}\n\n`)

  const copyTypes = resolveOutreachCopyTypes(run.contactChannels, run.channel)
  const launchConnectors = resolveOutreachLaunchConnectors(run.contactChannels, run.channel)
  const model = getLLMModel('agent-run') || getLLMModel('company-intel')
  const channelCopies = { ...(prospect.channel_copies || {}) }

  for (const copyType of copyTypes) {
    res.write(
      `data: ${JSON.stringify({
        stage: 'drafting',
        copy_type: copyType,
        text: '',
      })}\n\n`,
    )

    const channelSkillBlock = await loadMarketingSkillsForOutreachChannel(copyType).catch(() => '')

    const prompt = buildProspectCopyPrompt({
      prospect,
      companyName: run.companyName,
      question: run.question,
      goal: run.goal,
      channel: run.channel,
      copyType,
      mkg,
      personProfile: prospect.person_profile,
      companyProfile: prospect.company_profile,
      signals: prospect.signals,
    })

    const formatHint =
      copyType === 'email'
        ? 'Output format is mandatory — SUBJECT: then BODY: only. No markdown fences.'
        : 'Output format is mandatory — MESSAGE: then the body only. No markdown fences.'

    const skillLabel =
      copyType === 'email'
        ? 'cold-email'
        : copyType === 'linkedin_dm'
          ? 'social-content / copywriting'
          : copyType === 'whatsapp_dm'
            ? 'copywriting / marketing-psychology'
            : 'sales-enablement / copywriting'

    const systemContent = [
      'You write concise, personalized B2B outreach as Sam, Marqq outreach specialist.',
      `Follow the ${skillLabel} marketing skill playbook(s) below as the authoritative method for ${String(copyType).replace(/_/g, ' ')}.`,
      'Voice: peer-level, short, one low-friction CTA. No template fluff.',
      'Use ONLY the provided prospect profile, company profile, and signals for personalization. Never invent buying triggers.',
      formatHint,
      channelSkillBlock || '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const stream = await groqClient.chat.completions.create({
      model,
      stream: true,
      temperature: 0.6,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt },
      ],
    })

    let fullText = ''
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content || ''
      if (!token) continue
      fullText += token
      res.write(`data: ${JSON.stringify({ text: token, copy_type: copyType })}\n\n`)
    }

    const parsed = parseChannelCopy(copyType, fullText)
    channelCopies[copyType] = {
      subject: parsed.subject || '',
      body: parsed.body || '',
      connector:
        copyType === 'email'
          ? 'instantly'
          : copyType === 'linkedin_dm'
            ? 'heyreach'
            : copyType === 'whatsapp_dm'
              ? 'whatsapp'
              : 'voicebot',
      skills: listOutreachChannelSkillIds(copyType),
      generated_at: new Date().toISOString(),
    }
  }

  prospect.channel_copies = channelCopies
  prospect.launch_connectors = launchConnectors
  // Keep primary email fields for existing Gmail draft / Instantly paths
  if (channelCopies.email) {
    prospect.subject = channelCopies.email.subject || ''
    prospect.body = channelCopies.email.body || ''
  } else {
    const first = channelCopies[copyTypes[0]]
    prospect.subject = first?.subject || ''
    prospect.body = first?.body || ''
  }
  prospect.status = 'copy_ready'
  await persistRun(run)

  res.write(
    `data: ${JSON.stringify({
      done: true,
      subject: prospect.subject,
      body: prospect.body,
      prospectId,
      channel_copies: channelCopies,
      launch_connectors: launchConnectors,
      copy_types: copyTypes,
      enrichment: prospect.enrichment,
      signals: prospect.signals || [],
      person_profile: prospect.person_profile,
      company_profile: prospect.company_profile,
    })}\n\n`,
  )
  res.write('data: [DONE]\n\n')
  return { subject: prospect.subject, body: prospect.body, channel_copies: channelCopies }
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
  return updateOutreachProspect(runId, prospectId, { subject, body })
}

/**
 * Update prospect profile fields and/or channel copies.
 * Locked prospects reject copy edits unless unlock is requested.
 */
export function updateOutreachProspect(runId, prospectId, patch = {}) {
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const prospect = run.prospects.find((p) => p.id === prospectId)
  if (!prospect) throw new Error('Prospect not found')

  const unlock = patch.unlock === true || patch.copy_locked === false
  if (unlock) {
    prospect.copy_locked = false
    if (prospect.status === 'copy_locked') prospect.status = 'copy_ready'
  }

  const locked = Boolean(prospect.copy_locked)
  const wantsCopyChange =
    typeof patch.subject === 'string' ||
    typeof patch.body === 'string' ||
    (patch.channel_copies && typeof patch.channel_copies === 'object') ||
    typeof patch.copy_type === 'string'

  if (locked && wantsCopyChange && !unlock) {
    throw new Error('Copy is locked. Unlock to edit or revise with AI.')
  }

  const stringFields = [
    'full_name',
    'first_name',
    'last_name',
    'title',
    'company',
    'industry',
    'email',
    'linkedin_url',
    'city',
    'state',
    'phone_e164',
    'phone',
    'domain',
  ]
  for (const key of stringFields) {
    if (typeof patch[key] === 'string') prospect[key] = patch[key].trim()
  }

  if (typeof patch.subject === 'string') prospect.subject = patch.subject
  if (typeof patch.body === 'string') prospect.body = patch.body

  if (patch.channel_copies && typeof patch.channel_copies === 'object') {
    prospect.channel_copies = {
      ...(prospect.channel_copies || {}),
      ...patch.channel_copies,
    }
  }

  // Sync active channel copy into top-level subject/body when provided
  const copyType = typeof patch.copy_type === 'string' ? patch.copy_type : null
  if (copyType && (typeof patch.subject === 'string' || typeof patch.body === 'string')) {
    prospect.channel_copies = {
      ...(prospect.channel_copies || {}),
      [copyType]: {
        ...((prospect.channel_copies || {})[copyType] || {}),
        subject: typeof patch.subject === 'string' ? patch.subject : ((prospect.channel_copies || {})[copyType]?.subject || ''),
        body: typeof patch.body === 'string' ? patch.body : ((prospect.channel_copies || {})[copyType]?.body || ''),
        connector:
          (prospect.channel_copies || {})[copyType]?.connector ||
          (copyType === 'email'
            ? 'instantly'
            : copyType === 'linkedin_dm'
              ? 'heyreach'
              : copyType === 'whatsapp_dm'
                ? 'whatsapp'
                : 'voicebot'),
        updated_at: new Date().toISOString(),
      },
    }
  }

  if (patch.copy_locked === true) {
    prospect.copy_locked = true
    prospect.status = 'copy_locked'
    prospect.locked_at = new Date().toISOString()
  }

  if (!prospect.copy_locked && (prospect.subject || prospect.body || prospect.channel_copies)) {
    if (prospect.status === 'fetched' || prospect.status === 'enriched') {
      // keep
    } else if (prospect.status !== 'sent' && prospect.status !== 'scheduled') {
      prospect.status = 'copy_ready'
    }
  }

  void persistRun(run)
  return prospect
}

export function removeOutreachProspect(runId, prospectId) {
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const idx = (run.prospects || []).findIndex((p) => p.id === prospectId)
  if (idx < 0) throw new Error('Prospect not found')
  const [removed] = run.prospects.splice(idx, 1)
  for (const campaign of run.campaigns || []) {
    if (Array.isArray(campaign.prospectIds)) {
      campaign.prospectIds = campaign.prospectIds.filter((id) => id !== prospectId)
    }
  }
  void persistRun(run)
  return { removed, remaining: run.prospects.length, run }
}

/**
 * AI follow-up revise for one channel draft (streaming).
 * Does not re-enrich; uses current copy + user instruction.
 */
export async function streamProspectCopyRevision({
  runId,
  prospectId,
  copyType = 'email',
  instruction,
  groqClient,
  res,
}) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const prospect = run.prospects.find((p) => p.id === prospectId)
  if (!prospect) throw new Error('Prospect not found')
  if (prospect.copy_locked) {
    throw new Error('Copy is locked. Unlock to revise with AI.')
  }

  const type = String(copyType || 'email').toLowerCase()
  const existing = (prospect.channel_copies || {})[type] || {}
  const currentSubject = existing.subject || prospect.subject || ''
  const currentBody = existing.body || prospect.body || ''
  if (!currentBody.trim()) {
    throw new Error('No draft copy yet — generate copy first, then revise.')
  }

  const note = String(instruction || '').trim()
  if (!note) throw new Error('Add a revision instruction for the AI')

  const channelSkillBlock = await loadMarketingSkillsForOutreachChannel(type).catch(() => '')
  const model = getLLMModel('agent-run') || getLLMModel('company-intel')
  const shared = sharedProspectContextBlock({
    prospect,
    companyName: run.companyName,
    question: run.question,
    goal: run.goal,
    mkg: null,
    personProfile: prospect.person_profile,
    companyProfile: prospect.company_profile,
    signals: prospect.signals,
  })

  const formatHint =
    type === 'email'
      ? 'Output format is mandatory — SUBJECT: then BODY: only. No markdown fences.'
      : 'Output format is mandatory — MESSAGE: then the body only. No markdown fences.'

  const systemContent = [
    'You revise B2B outreach copy as Sam, Marqq outreach specialist.',
    'Apply the user revision instruction precisely while keeping personalization grounded in the prospect profile and signals.',
    'Do not invent buying triggers. Keep channel-native length and tone.',
    formatHint,
    channelSkillBlock || '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const userPrompt = [
    `Revise this ${type.replace(/_/g, ' ')} draft for one prospect.`,
    ...shared,
    '',
    'Current draft:',
    type === 'email' ? `SUBJECT: ${currentSubject}` : null,
    type === 'email' ? `BODY:\n${currentBody}` : `MESSAGE:\n${currentBody}`,
    '',
    `Revision instruction from user:\n${note}`,
    '',
    'Return the full revised draft only in the required format.',
  ]
    .filter(Boolean)
    .join('\n')

  res.write(`data: ${JSON.stringify({ stage: 'revising', copy_type: type, text: '' })}\n\n`)

  const stream = await groqClient.chat.completions.create({
    model,
    stream: true,
    temperature: 0.55,
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userPrompt },
    ],
  })

  let fullText = ''
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content || ''
    if (!token) continue
    fullText += token
    res.write(`data: ${JSON.stringify({ text: token, copy_type: type })}\n\n`)
  }

  const parsed = parseChannelCopy(type, fullText)
  const channelCopies = {
    ...(prospect.channel_copies || {}),
    [type]: {
      subject: parsed.subject || '',
      body: parsed.body || '',
      connector:
        type === 'email'
          ? 'instantly'
          : type === 'linkedin_dm'
            ? 'heyreach'
            : type === 'whatsapp_dm'
              ? 'whatsapp'
              : 'voicebot',
      skills: listOutreachChannelSkillIds(type),
      revised_at: new Date().toISOString(),
      last_instruction: note,
    },
  }
  prospect.channel_copies = channelCopies
  if (type === 'email') {
    prospect.subject = parsed.subject || prospect.subject
    prospect.body = parsed.body || prospect.body
  } else if (!channelCopies.email) {
    prospect.body = parsed.body || prospect.body
  }
  prospect.status = 'copy_ready'
  prospect.copy_locked = false
  await persistRun(run)

  res.write(
    `data: ${JSON.stringify({
      done: true,
      copy_type: type,
      subject: type === 'email' ? prospect.subject : '',
      body: parsed.body,
      channel_copies: channelCopies,
      prospectId,
    })}\n\n`,
  )
  res.write('data: [DONE]\n\n')
  return { subject: prospect.subject, body: parsed.body, channel_copies: channelCopies }
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

function normalizePhoneDigits(value) {
  return String(value || '').replace(/[^\d]/g, '')
}

function phonesMatch(a, b) {
  const da = normalizePhoneDigits(a)
  const db = normalizePhoneDigits(b)
  if (!da || !db) return false
  if (da === db) return true
  const tail = (v) => (v.length > 10 ? v.slice(-10) : v)
  return tail(da) === tail(db)
}

function normalizeLinkedInUrl(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  const m = raw.match(/linkedin\.com\/in\/([^/?#]+)/)
  if (m?.[1]) return `linkedin.com/in/${m[1].replace(/\/$/, '')}`
  return raw.replace(/\/$/, '')
}

function publicWebhookUrl(pathSuffix) {
  const base = String(
    process.env.PUBLIC_BASE_URL ||
      process.env.TWILIO_PUBLIC_BASE_URL ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      '',
  ).replace(/\/$/, '')
  if (!base) return null
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`
  const path = String(pathSuffix || '').startsWith('/')
    ? String(pathSuffix)
    : `/${pathSuffix || ''}`
  return `${withScheme}${path}`
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
 * Ingest a reply webhook payload (Instantly / Gmail / HeyReach / WhatsApp / generic).
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
  const phone = normalizePhoneDigits(
    payload.phone ||
      payload.phone_e164 ||
      payload.from_phone ||
      payload.wa_id ||
      payload.mobile ||
      '',
  )
  const linkedinUrl = normalizeLinkedInUrl(
    payload.linkedin_url ||
      payload.linkedinUrl ||
      payload.profile_url ||
      payload.lead_linkedin_url ||
      '',
  )
  const conversationId = String(
    payload.conversation_id ||
      payload.conversationId ||
      payload.heyreach_conversation_id ||
      '',
  ).trim()
  const campaignExternalId = String(
    payload.campaign_id || payload.campaignId || payload.external_campaign_id || '',
  ).trim()
  const threadId = String(payload.thread_id || payload.threadId || conversationId || '').trim()
  const body = String(payload.body || payload.text || payload.reply || payload.message || '').trim()
  const subject = String(payload.subject || '').trim()
  const receivedAt = payload.received_at || payload.timestamp || new Date().toISOString()
  const externalId = String(
    payload.id || payload.email_id || payload.message_id || payload.wamid || randomUUID(),
  )

  if (!email && !phone && !linkedinUrl && !campaignExternalId && !threadId && !conversationId) {
    throw new Error(
      'Reply payload needs email, phone, linkedin_url, conversation_id, campaign_id, or thread_id',
    )
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
        phone &&
        phonesMatch(phone, prospect.phone_e164 || prospect.phone || '')
      ) {
        matched = { run, prospect }
        break
      }
      if (
        linkedinUrl &&
        normalizeLinkedInUrl(prospect.linkedin_url) &&
        normalizeLinkedInUrl(prospect.linkedin_url) === linkedinUrl
      ) {
        matched = { run, prospect }
        break
      }
      if (
        conversationId &&
        (prospect.heyreach_conversation_id === conversationId ||
          prospect.conversation_id === conversationId)
      ) {
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
        (c) =>
          c.id === campaignExternalId ||
          String(c.external_id) === String(campaignExternalId),
      )
      if (!campaign) continue
      const sentProspect = (run.prospects || []).find(
        (p) =>
          (p.status === 'sent' || p.status === 'replied') &&
          (!p.replies?.length ||
            phonesMatch(phone, p.phone_e164) ||
            (linkedinUrl && normalizeLinkedInUrl(p.linkedin_url) === linkedinUrl)),
      )
      if (sentProspect) {
        matched = { run, prospect: sentProspect }
        break
      }
    }
  }

  if (!matched) {
    return {
      status: 'unmatched',
      email,
      phone: phone || null,
      linkedin_url: linkedinUrl || null,
      externalId,
    }
  }

  const { run, prospect } = matched
  const provider = String(payload.provider || payload.source || 'webhook').toLowerCase()
  const reply = {
    id: externalId,
    email: email || prospect.email,
    phone: phone || prospect.phone_e164 || prospect.phone || null,
    linkedin_url: linkedinUrl || prospect.linkedin_url || null,
    subject,
    body,
    received_at: receivedAt,
    thread_id: threadId || prospect.gmail_thread_id || null,
    conversation_id: conversationId || prospect.heyreach_conversation_id || null,
    linkedin_account_id:
      payload.linkedin_account_id ||
      payload.linkedInAccountId ||
      payload.account_id ||
      prospect.heyreach_linkedin_account_id ||
      null,
    phone_number_id:
      payload.phone_number_id ||
      payload.phoneNumberId ||
      prospect.whatsapp_phone_number_id ||
      null,
    provider,
    channel:
      payload.channel ||
      (provider.includes('heyreach') || provider.includes('linkedin')
        ? 'linkedin_dm'
        : provider.includes('whatsapp')
          ? 'whatsapp_dm'
          : 'email'),
    raw: payload,
  }

  prospect.replies = Array.isArray(prospect.replies) ? prospect.replies : []
  const already = prospect.replies.some((r) => r.id === reply.id)
  if (!already) {
    prospect.replies.push(reply)
  }
  prospect.status = 'replied'
  if (threadId && !prospect.gmail_thread_id && !provider.includes('heyreach') && !provider.includes('whatsapp')) {
    prospect.gmail_thread_id = threadId
  }
  if (conversationId) {
    prospect.heyreach_conversation_id = conversationId
  }
  if (reply.linkedin_account_id) {
    prospect.heyreach_linkedin_account_id = reply.linkedin_account_id
  }
  if (reply.phone_number_id) {
    prospect.whatsapp_phone_number_id = reply.phone_number_id
  }
  if (phone && !prospect.phone_e164) {
    prospect.phone_e164 = phone.startsWith('+') ? phone : `+${phone}`
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

  let autoReply = null
  if (!already) {
    try {
      autoReply = await draftAutoReplyForRecordedReply(run, prospect, reply)
    } catch (err) {
      console.warn('[outreach/auto-reply-draft]', err?.message || err)
      autoReply = { status: 'draft_failed', error: err?.message || String(err) }
    }
  }

  const stored =
    (prospect.replies || []).find((r) => r.id === reply.id) ||
    (run.replies || []).find((r) => r.id === reply.id) ||
    reply

  return {
    status: already ? 'duplicate' : 'recorded',
    runId: run.id,
    prospectId: prospect.id,
    reply: stored,
    auto_reply: autoReply,
  }
}

/**
 * HeyReach MESSAGE_REPLY / EVERY_MESSAGE_REPLY webhook → outreach inbox draft.
 */
export async function handleHeyReachReplyWebhook(payload = {}) {
  const eventType = String(
    payload.eventType ||
      payload.event_type ||
      payload.type ||
      payload.EventType ||
      '',
  ).toUpperCase()

  const isReplyEvent =
    !eventType ||
    eventType.includes('REPLY') ||
    eventType.includes('EVERY_MESSAGE') ||
    Boolean(payload.message || payload.messageText || payload.Message)

  if (!isReplyEvent) {
    return { status: 'ignored', reason: `non_reply_event:${eventType || 'unknown'}` }
  }

  const lead = payload.lead || payload.Lead || payload.correspondent || {}
  const messageText = String(
    payload.message ||
      payload.messageText ||
      payload.Message ||
      payload.text ||
      payload.body ||
      lead.lastMessage ||
      '',
  ).trim()

  const conversationId = String(
    payload.conversationId ||
      payload.conversation_id ||
      payload.ConversationId ||
      payload.chatId ||
      '',
  ).trim()

  const linkedinUrl =
    lead.linkedinUrl ||
    lead.linkedin_url ||
    lead.profileUrl ||
    payload.linkedinUrl ||
    payload.linkedin_url ||
    ''

  const email = lead.email || lead.Email || payload.email || ''
  const linkedInAccountId =
    payload.linkedInAccountId ||
    payload.linkedin_account_id ||
    payload.accountId ||
    payload.AccountId ||
    null

  return recordOutreachReply({
    provider: 'heyreach',
    channel: 'linkedin_dm',
    id:
      payload.messageId ||
      payload.message_id ||
      payload.id ||
      (conversationId ? `heyreach-${conversationId}-${Date.now()}` : undefined),
    body: messageText,
    subject: '',
    email,
    linkedin_url: linkedinUrl,
    conversation_id: conversationId,
    linkedin_account_id: linkedInAccountId,
    campaign_id: payload.campaignId || payload.campaign_id || null,
    received_at: payload.timestamp || payload.createdAt || new Date().toISOString(),
    raw: payload,
  })
}

/**
 * Meta WhatsApp Cloud API inbound webhook → outreach inbox draft.
 * Handles both full Meta payloads and flattened shapes.
 */
export async function handleWhatsAppInboundWebhook(payload = {}) {
  const results = []

  // Meta challenge is handled at the route layer (GET). POST body:
  const entries = Array.isArray(payload.entry) ? payload.entry : null
  if (entries) {
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : []
      for (const change of changes) {
        const value = change.value || {}
        if (change.field && change.field !== 'messages') continue
        const phoneNumberId = value.metadata?.phone_number_id || value.phone_number_id || null
        const messages = Array.isArray(value.messages) ? value.messages : []
        const contacts = Array.isArray(value.contacts) ? value.contacts : []
        for (const msg of messages) {
          if (msg.type && msg.type !== 'text' && !msg.text?.body && !msg.button?.text) {
            results.push({ status: 'ignored', reason: `unsupported_type:${msg.type}`, id: msg.id })
            continue
          }
          const from = msg.from || contacts[0]?.wa_id || ''
          const text =
            msg.text?.body ||
            msg.button?.text ||
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            ''
          const recorded = await recordOutreachReply({
            provider: 'whatsapp',
            channel: 'whatsapp_dm',
            id: msg.id || `wa-${from}-${msg.timestamp || Date.now()}`,
            body: text,
            subject: '',
            phone: from,
            phone_number_id: phoneNumberId,
            received_at: msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
            raw: { entry, change, message: msg, contacts },
          })
          results.push(recorded)
        }
      }
    }
    return {
      status: results.some((r) => r.status === 'recorded')
        ? 'recorded'
        : results[0]?.status || 'ignored',
      results,
    }
  }

  // Flattened / test payloads
  return recordOutreachReply({
    provider: 'whatsapp',
    channel: 'whatsapp_dm',
    id: payload.id || payload.message_id || payload.wamid,
    body: payload.body || payload.text || payload.message || '',
    subject: '',
    phone: payload.phone || payload.from || payload.wa_id || payload.from_phone,
    phone_number_id: payload.phone_number_id || payload.phoneNumberId,
    received_at: payload.timestamp || payload.received_at || new Date().toISOString(),
    raw: payload,
  })
}

export async function registerHeyReachReplyWebhook(companyId, { webhookName } = {}) {
  const target = publicWebhookUrl('/api/webhooks/heyreach')
  if (!target) {
    return {
      status: 'error',
      error: 'PUBLIC_BASE_URL required to register HeyReach reply webhook',
    }
  }

  const name = String(webhookName || 'Marqq replies').slice(0, 25)
  // Prefer every-reply so follow-ups also land in Marqq
  const eventTypes = [
    'EVERY_MESSAGE_REPLY_RECEIVED',
    'MESSAGE_REPLY_RECEIVED',
    'INMAIL_REPLY_RECEIVED',
  ]

  let lastError = null
  for (const eventType of eventTypes) {
    const res = await executeComposioAction(
      'HEYREACH_CREATE_WEBHOOK',
      {
        webhookName: name.slice(0, 25),
        webhook_name: name.slice(0, 25),
        webhookUrl: target,
        webhook_url: target,
        eventType,
        event_type: eventType,
      },
      companyId,
    )
    if (!res.error) {
      return {
        status: 'completed',
        webhook_url: target,
        event_type: eventType,
        result: res.result || null,
      }
    }
    lastError = res.error
    // If every-reply unsupported, try next
    if (!/event|invalid|not.?support|unknown/i.test(String(res.error))) {
      break
    }
  }

  // Direct HeyReach API fallback
  try {
    const connected = await getConnectedAccountApiKey('heyreach', companyId)
    if (connected.api_key) {
      for (const eventType of eventTypes) {
        const res = await fetch('https://api.heyreach.io/api/public/webhook/Create', {
          method: 'POST',
          headers: {
            'X-API-KEY': connected.api_key,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            webhookName: name,
            webhookUrl: target,
            eventType,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          return {
            status: 'completed',
            webhook_url: target,
            event_type: eventType,
            method: 'heyreach_api',
            result: data,
          }
        }
        lastError = data?.message || data?.error || `HTTP ${res.status}`
      }
    } else {
      lastError = connected.error || lastError
    }
  } catch (err) {
    lastError = err?.message || String(err)
  }

  return { status: 'error', error: lastError || 'HeyReach webhook register failed', webhook_url: target }
}

/** Instantly CRM interest values used for subsequence / lead status */
const INTEREST_VALUE_BY_CLASS = {
  interested: '1',
  meeting_booked: '2',
  not_interested: '-1',
  ooo: null,
  question: null,
  other: null,
}

function parseJsonObjectFromLlm(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim())
      } catch {
        /* fall through */
      }
    }
    const brace = raw.match(/\{[\s\S]*\}/)
    if (brace?.[0]) {
      try {
        return JSON.parse(brace[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function syncReplyOnRun(run, prospect, replyId, mutator) {
  const touch = (list) => {
    if (!Array.isArray(list)) return
    const idx = list.findIndex((r) => r.id === replyId)
    if (idx < 0) return
    list[idx] = mutator({ ...list[idx] })
  }
  touch(prospect.replies)
  touch(run.replies)
  const fromProspect = (prospect.replies || []).find((r) => r.id === replyId)
  const fromRun = (run.replies || []).find((r) => r.id === replyId)
  return fromProspect || fromRun || null
}

function findReplyInRun(run, replyId) {
  for (const prospect of run.prospects || []) {
    const hit = (prospect.replies || []).find((r) => r.id === replyId)
    if (hit) return { prospect, reply: hit }
  }
  const runReply = (run.replies || []).find((r) => r.id === replyId)
  if (runReply) {
    const prospect =
      (run.prospects || []).find((p) => p.id === runReply.prospectId) || null
    return { prospect, reply: runReply }
  }
  return null
}

/**
 * Classify inbound reply + draft an AI response. Never sends — status stays `draft`.
 */
export async function draftAutoReplyForRecordedReply(run, prospect, reply) {
  const inboundBody = String(reply?.body || '').trim()
  const inboundSubject = String(reply?.subject || '').trim()
  if (!inboundBody && !inboundSubject) {
    return { status: 'skipped', reason: 'empty_inbound' }
  }

  const channel = String(reply.channel || '').toLowerCase()
  const provider = String(reply.provider || '').toLowerCase()
  const isLinkedIn =
    channel === 'linkedin_dm' || provider.includes('heyreach') || provider.includes('linkedin')
  const isWhatsApp = channel === 'whatsapp_dm' || provider.includes('whatsapp')
  const channelLabel = isLinkedIn ? 'LinkedIn DM' : isWhatsApp ? 'WhatsApp' : 'email'

  const model = getLLMModel('agent-run') || getLLMModel('company-intel')
  const originalSubject = String(prospect.subject || '').trim()
  const originalBody = String(
    prospect.channel_copies?.[isLinkedIn ? 'linkedin_dm' : isWhatsApp ? 'whatsapp_dm' : 'email']
      ?.body ||
      prospect.body ||
      '',
  ).trim()

  const completion = await defaultLLMClient.chat.completions.create({
    model,
    temperature: 0.35,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content: [
          'You are Sam, Marqq B2B outreach specialist.',
          `Classify the prospect reply and draft a short ${channelLabel} reply.`,
          'Never invent facts, meetings, or product claims not in the original outreach.',
          'Return ONLY valid JSON with keys:',
          'classification (interested|not_interested|question|ooo|meeting_booked|other),',
          'confidence (0-1 number),',
          'rationale (short string),',
          'should_reply (boolean),',
          'subject (string; empty for LinkedIn/WhatsApp),',
          'body (string).',
          'If OOO or clear not_interested with no question, should_reply may be false and body empty.',
          isLinkedIn || isWhatsApp
            ? 'Reply body: under 60 words, conversational, one clear next step. No email signature.'
            : 'Reply body: under 90 words, peer tone, one clear next step when appropriate.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            channel: channelLabel,
            prospect: {
              name: prospect.full_name,
              title: prospect.title,
              company: prospect.company,
              email: prospect.email,
              linkedin_url: prospect.linkedin_url,
              phone: prospect.phone_e164 || prospect.phone,
            },
            original_outreach: { subject: originalSubject, body: originalBody },
            inbound_reply: { subject: inboundSubject, body: inboundBody },
            company_context: run.companyName || '',
            goal: run.goal || 'reply',
          },
          null,
          2,
        ),
      },
    ],
  })

  const rawText = completion.choices?.[0]?.message?.content || ''
  const parsed = parseJsonObjectFromLlm(rawText) || {}
  const classification = String(parsed.classification || 'other')
    .toLowerCase()
    .replace(/\s+/g, '_')
  const allowed = new Set([
    'interested',
    'not_interested',
    'question',
    'ooo',
    'meeting_booked',
    'other',
  ])
  const classSafe = allowed.has(classification) ? classification : 'other'
  const shouldReply =
    parsed.should_reply != null
      ? Boolean(parsed.should_reply)
      : !['ooo', 'not_interested'].includes(classSafe)
  const draftSubject = isLinkedIn || isWhatsApp
    ? ''
    : String(parsed.subject || '').trim() ||
      (inboundSubject
        ? inboundSubject.startsWith('Re:')
          ? inboundSubject
          : `Re: ${inboundSubject}`
        : 'Re: your note')
  const draftBody = String(parsed.body || '').trim()

  const autoReplyDraft = {
    status: 'draft',
    classification: classSafe,
    confidence: Number(parsed.confidence) || null,
    rationale: String(parsed.rationale || '').trim() || null,
    should_reply: shouldReply,
    subject: shouldReply ? draftSubject : '',
    body: shouldReply ? draftBody : '',
    channel: isLinkedIn ? 'linkedin_dm' : isWhatsApp ? 'whatsapp_dm' : 'email',
    interest_value: INTEREST_VALUE_BY_CLASS[classSafe] ?? null,
    created_at: new Date().toISOString(),
    approved_at: null,
    sent_at: null,
    send_meta: null,
    error: null,
  }

  const updated = syncReplyOnRun(run, prospect, reply.id, (r) => ({
    ...r,
    classification: classSafe,
    auto_reply_draft: autoReplyDraft,
  }))
  await persistRun(run)

  return {
    status: 'draft',
    classification: classSafe,
    draft: updated?.auto_reply_draft || autoReplyDraft,
  }
}

export async function updateOutreachReplyDraft(runId, replyId, patch = {}) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const found = findReplyInRun(run, replyId)
  if (!found?.reply) throw new Error('Reply not found')
  const { prospect, reply } = found
  if (!prospect) throw new Error('Prospect not found for reply')

  const draft = reply.auto_reply_draft || {
    status: 'draft',
    classification: reply.classification || 'other',
    should_reply: true,
    subject: '',
    body: '',
    interest_value: null,
    created_at: new Date().toISOString(),
  }
  if (draft.status === 'sent') {
    throw new Error('Reply already sent — unlock is not available')
  }

  if (patch.subject != null) draft.subject = String(patch.subject)
  if (patch.body != null) draft.body = String(patch.body)
  if (patch.classification != null) {
    draft.classification = String(patch.classification).toLowerCase()
    draft.interest_value = INTEREST_VALUE_BY_CLASS[draft.classification] ?? draft.interest_value
  }
  if (patch.should_reply != null) draft.should_reply = Boolean(patch.should_reply)
  draft.status = 'draft'
  draft.error = null
  draft.updated_at = new Date().toISOString()

  const updated = syncReplyOnRun(run, prospect, replyId, (r) => ({
    ...r,
    classification: draft.classification,
    auto_reply_draft: { ...draft },
  }))
  await persistRun(run)
  return updated
}

export async function rejectOutreachReplyDraft(runId, replyId) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const found = findReplyInRun(run, replyId)
  if (!found?.reply) throw new Error('Reply not found')
  const { prospect } = found

  const updated = syncReplyOnRun(run, prospect, replyId, (r) => ({
    ...r,
    auto_reply_draft: r.auto_reply_draft
      ? {
          ...r.auto_reply_draft,
          status: 'rejected',
          rejected_at: new Date().toISOString(),
        }
      : {
          status: 'rejected',
          rejected_at: new Date().toISOString(),
        },
  }))
  await persistRun(run)
  return updated
}

async function resolveInstantlyReplyTarget(companyId, reply, prospect) {
  const replyToUuid =
    reply.id && !String(reply.id).startsWith('gmail-')
      ? String(reply.id)
      : String(reply.raw?.id || reply.raw?.email_id || reply.raw?.uuid || '').trim()

  let eaccount =
    String(
      reply.raw?.eaccount ||
        reply.raw?.account ||
        reply.raw?.to_address ||
        reply.raw?.to ||
        '',
    ).trim() || ''

  if (replyToUuid && eaccount) {
    return { reply_to_uuid: replyToUuid, eaccount }
  }

  // Look up Unibox email for this lead
  try {
    const listRes = await executeComposioAction(
      'INSTANTLY_LIST_EMAILS',
      {
        limit: 25,
        is_unread: true,
        sort_order: 'desc',
        ...(reply.raw?.campaign_id || reply.campaign_id
          ? { campaign_id: reply.raw?.campaign_id || reply.campaign_id }
          : {}),
      },
      companyId,
    )
    const rawEmails =
      listRes.result?.items ||
      listRes.result?.emails ||
      listRes.result?.data ||
      listRes.result ||
      []
    const emails = Array.isArray(rawEmails) ? rawEmails : []
    const leadEmail = String(prospect.email || reply.email || '').toLowerCase()
    const match = emails.find((e) => {
      const from = String(e.from_email || e.from || '').toLowerCase()
      const to = String(e.to_email || e.to || e.lead || '').toLowerCase()
      return (
        (leadEmail && (from === leadEmail || to.includes(leadEmail))) ||
        (replyToUuid && e.id === replyToUuid)
      )
    })
    if (match?.id) {
      const acct =
        eaccount ||
        String(match.eaccount || match.account || match.to_email || match.to || '').trim()
      return { reply_to_uuid: match.id, eaccount: acct }
    }
  } catch (err) {
    console.warn('[outreach/instantly-list-emails]', err?.message || err)
  }

  // Fallback: first Instantly sender account as eaccount
  if (!eaccount) {
    try {
      const accounts = await executeComposioAction('INSTANTLY_LIST_ACCOUNTS', {}, companyId)
      const items =
        accounts.result?.items ||
        accounts.result?.accounts ||
        accounts.result?.data ||
        accounts.result ||
        []
      const first = Array.isArray(items) ? items[0] : null
      eaccount = String(first?.email || first?.account || '').trim()
    } catch {
      /* non-fatal */
    }
  }

  return { reply_to_uuid: replyToUuid || null, eaccount: eaccount || null }
}

async function sendInstantlyUniboxReply({ companyId, eaccount, replyToUuid, subject, body }) {
  if (!replyToUuid) throw new Error('Missing Instantly reply_to_uuid')
  if (!eaccount) throw new Error('Missing Instantly sending account (eaccount)')

  const composio = await executeComposioAction(
    'INSTANTLY_REPLY_TO_AN_EMAIL',
    {
      eaccount,
      reply_to_uuid: replyToUuid,
      subject,
      body: { text: body },
      body_text: body,
      text: body,
    },
    companyId,
  )
  if (!composio.error) {
    return { method: 'instantly_composio_reply', result: composio.result }
  }

  // Direct Instantly API fallback
  const connected = await getConnectedAccountApiKey('instantly', companyId)
  if (connected.error || !connected.api_key) {
    throw new Error(
      composio.error ||
        connected.error ||
        'Instantly reply failed (Composio + API key unavailable)',
    )
  }

  const res = await fetch('https://api.instantly.ai/api/v2/emails/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connected.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eaccount,
      reply_to_uuid: replyToUuid,
      subject,
      body: { text: body },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || `Instantly reply HTTP ${res.status}`,
    )
  }
  return { method: 'instantly_api_reply', result: data }
}

async function sendGmailThreadReply({ workspaceId, threadId, to, subject, body }) {
  if (!threadId) throw new Error('Missing Gmail thread_id')
  const res = await executeComposioAction(
    'GMAIL_REPLY_TO_THREAD',
    {
      thread_id: threadId,
      threadId,
      recipient_email: to,
      to,
      subject,
      body,
      message_body: body,
      user_id: 'me',
    },
    workspaceId,
  )
  if (res.error) throw new Error(res.error)
  return { method: 'gmail_reply_to_thread', result: res.result }
}

async function sendHeyReachInboxReply({ companyId, conversationId, linkedInAccountId, message, subject }) {
  if (!conversationId) throw new Error('Missing HeyReach conversation_id')
  if (!linkedInAccountId) throw new Error('Missing HeyReach linkedInAccountId')
  if (!String(message || '').trim()) throw new Error('Missing HeyReach reply message')

  const payload = {
    conversationId: String(conversationId),
    conversation_id: String(conversationId),
    linkedInAccountId: Number(linkedInAccountId) || linkedInAccountId,
    linkedin_account_id: Number(linkedInAccountId) || linkedInAccountId,
    message: String(message).trim(),
    ...(subject ? { subject: String(subject) } : {}),
  }

  // Try common Composio slugs first
  for (const slug of ['HEYREACH_SEND_MESSAGE', 'HEYREACH_INBOX_SEND_MESSAGE', 'HEYREACH_SEND_MESSAGE_IN_CONVERSATION']) {
    const res = await executeComposioAction(slug, payload, companyId)
    if (!res.error) {
      return { method: `heyreach_composio:${slug}`, result: res.result }
    }
  }

  const connected = await getConnectedAccountApiKey('heyreach', companyId)
  if (connected.error || !connected.api_key) {
    throw new Error(connected.error || 'HeyReach API key unavailable for inbox reply')
  }

  const paths = ['/inbox/SendMessage', '/inbox/send', '/Inbox/SendMessage']
  let lastError = null
  for (const path of paths) {
    const res = await fetch(`https://api.heyreach.io/api/public${path}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': connected.api_key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        conversationId: String(conversationId),
        linkedInAccountId: Number(linkedInAccountId) || linkedInAccountId,
        message: String(message).trim(),
        ...(subject ? { subject: String(subject) } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return { method: `heyreach_api:${path}`, result: data }
    }
    lastError = data?.message || data?.title || data?.error || `HTTP ${res.status}`
  }
  throw new Error(lastError || 'HeyReach inbox send failed')
}

async function sendWhatsAppReply({ companyId, toNumber, text, phoneNumberId }) {
  const to = normalizePhoneDigits(toNumber)
  if (!to) throw new Error('Missing WhatsApp recipient phone')
  if (!String(text || '').trim()) throw new Error('Missing WhatsApp reply text')

  let resolvedPhoneNumberId = phoneNumberId
  if (!resolvedPhoneNumberId) {
    const phoneRes = await executeComposioAction('WHATSAPP_GET_PHONE_NUMBERS', { limit: 25 }, companyId)
    resolvedPhoneNumberId =
      phoneRes.result?.data?.[0]?.id ||
      phoneRes.result?.phone_numbers?.[0]?.id ||
      phoneRes.result?.[0]?.id ||
      null
  }
  if (!resolvedPhoneNumberId) {
    throw new Error('No WhatsApp Business phone_number_id available')
  }

  const res = await executeComposioAction(
    'WHATSAPP_SEND_MESSAGE',
    {
      phone_number_id: resolvedPhoneNumberId,
      to_number: to,
      text: String(text).trim(),
    },
    companyId,
  )
  if (res.error) throw new Error(res.error)
  return {
    method: 'whatsapp_send_message',
    phone_number_id: resolvedPhoneNumberId,
    to_number: to,
    result: res.result,
  }
}

/**
 * Explicit approve → apply Instantly interest (if any) + send drafted reply live.
 */
export async function approveOutreachReply(runId, replyId, { send = true } = {}) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')
  const found = findReplyInRun(run, replyId)
  if (!found?.reply) throw new Error('Reply not found')
  const { prospect, reply } = found
  if (!prospect) throw new Error('Prospect not found for reply')

  const draft = reply.auto_reply_draft
  if (!draft) throw new Error('No auto-reply draft to approve — regenerate from inbox')
  if (draft.status === 'sent') {
    return { status: 'already_sent', reply }
  }
  if (draft.status === 'rejected') {
    throw new Error('Draft was rejected — edit or wait for a new reply draft')
  }

  const companyId = run.companyId || run.workspaceId
  const interestValue =
    draft.interest_value != null
      ? String(draft.interest_value)
      : INTEREST_VALUE_BY_CLASS[draft.classification] != null
        ? String(INTEREST_VALUE_BY_CLASS[draft.classification])
        : null

  let interestResult = null
  const provider = String(reply.provider || '').toLowerCase()
  const channel = String(reply.channel || draft.channel || '').toLowerCase()
  const isHeyReach = provider.includes('heyreach') || channel === 'linkedin_dm'
  const isWhatsApp = provider.includes('whatsapp') || channel === 'whatsapp_dm'
  const isInstantly =
    !isHeyReach &&
    !isWhatsApp &&
    (provider.includes('instantly') || Boolean(reply.raw?.campaign_id))

  if (interestValue != null && companyId && isInstantly) {
    try {
      const campaignId =
        reply.raw?.campaign_id ||
        (run.campaigns || []).find((c) => c.provider === 'instantly')?.external_id ||
        null
      const res = await executeComposioAction(
        'INSTANTLY_UPDATE_LEAD_INTEREST_STATUS',
        {
          lead_email: prospect.email || reply.email,
          interest_value: interestValue,
          ...(campaignId ? { campaign_id: campaignId } : {}),
        },
        companyId,
      )
      interestResult = res.error
        ? { status: 'error', error: res.error }
        : { status: 'completed', interest_value: interestValue, result: res.result }
    } catch (err) {
      interestResult = { status: 'error', error: err?.message || String(err) }
    }
  }

  let sendResult = null
  const shouldSend =
    send !== false &&
    draft.should_reply !== false &&
    String(draft.body || '').trim()

  if (shouldSend) {
    const subject = String(draft.subject || '').trim() || 'Re: your note'
    const body = String(draft.body || '').trim()

    try {
      if (isHeyReach && companyId) {
        const conversationId =
          reply.conversation_id ||
          prospect.heyreach_conversation_id ||
          reply.raw?.conversationId ||
          reply.raw?.conversation_id
        const linkedInAccountId =
          reply.linkedin_account_id ||
          prospect.heyreach_linkedin_account_id ||
          reply.raw?.linkedInAccountId ||
          reply.raw?.linkedin_account_id
        sendResult = await sendHeyReachInboxReply({
          companyId,
          conversationId,
          linkedInAccountId,
          message: body,
          subject: subject || undefined,
        })
      } else if (isWhatsApp && companyId) {
        sendResult = await sendWhatsAppReply({
          companyId,
          toNumber:
            reply.phone ||
            prospect.phone_e164 ||
            prospect.phone ||
            reply.raw?.from,
          text: body,
          phoneNumberId:
            reply.phone_number_id ||
            prospect.whatsapp_phone_number_id ||
            reply.raw?.phone_number_id,
        })
      } else if (isInstantly && companyId) {
        const target = await resolveInstantlyReplyTarget(companyId, reply, prospect)
        sendResult = await sendInstantlyUniboxReply({
          companyId,
          eaccount: target.eaccount,
          replyToUuid: target.reply_to_uuid,
          subject,
          body,
        })
      } else {
        const threadId =
          reply.thread_id || prospect.gmail_thread_id || extractGmailThreadId(prospect.send_meta)
        sendResult = await sendGmailThreadReply({
          workspaceId: run.workspaceId || companyId,
          threadId,
          to: prospect.email || reply.email,
          subject,
          body,
        })
      }
    } catch (err) {
      // Instantly → Gmail fallback only
      if (isInstantly) {
        try {
          const threadId =
            reply.thread_id || prospect.gmail_thread_id || extractGmailThreadId(prospect.send_meta)
          if (threadId) {
            sendResult = await sendGmailThreadReply({
              workspaceId: run.workspaceId || companyId,
              threadId,
              to: prospect.email || reply.email,
              subject,
              body,
            })
          } else {
            throw err
          }
        } catch (err2) {
          syncReplyOnRun(run, prospect, replyId, (r) => ({
            ...r,
            auto_reply_draft: {
              ...r.auto_reply_draft,
              status: 'draft',
              error: err2?.message || err?.message || 'Send failed',
            },
          }))
          await persistRun(run)
          throw new Error(err2?.message || err?.message || 'Approve send failed')
        }
      } else {
        syncReplyOnRun(run, prospect, replyId, (r) => ({
          ...r,
          auto_reply_draft: {
            ...r.auto_reply_draft,
            status: 'draft',
            error: err?.message || 'Send failed',
          },
        }))
        await persistRun(run)
        throw err
      }
    }
  }

  const now = new Date().toISOString()
  const updated = syncReplyOnRun(run, prospect, replyId, (r) => ({
    ...r,
    auto_reply_draft: {
      ...r.auto_reply_draft,
      status: shouldSend ? 'sent' : 'approved',
      approved_at: now,
      sent_at: shouldSend ? now : null,
      send_meta: sendResult,
      interest_result: interestResult,
      error: null,
    },
  }))
  await persistRun(run)

  return {
    status: shouldSend ? 'sent' : 'approved',
    reply: updated,
    interest: interestResult,
    send: sendResult,
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

function splitName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || '',
  }
}

function prospectChannelCopy(prospect, copyType) {
  const copies = prospect?.channel_copies || {}
  const entry = copies[copyType] || null
  if (!entry) return { subject: '', body: '' }
  return {
    subject: String(entry.subject || ''),
    body: String(entry.body || ''),
  }
}

function upsertProviderCampaign(run, provider, name, prospectIds = []) {
  let campaign = (run.campaigns || []).find((c) => c.provider === provider)
  if (!campaign) {
    campaign = {
      id: randomUUID(),
      provider,
      name: name || `${provider} outreach`,
      status: 'active',
      createdAt: new Date().toISOString(),
      prospectIds: [],
      sentCount: 0,
      replyCount: 0,
    }
    if (!Array.isArray(run.campaigns)) run.campaigns = []
    run.campaigns.push(campaign)
  }
  for (const id of prospectIds) {
    if (id && !campaign.prospectIds.includes(id)) campaign.prospectIds.push(id)
  }
  return campaign
}

/**
 * Launch Instantly / HeyReach / WhatsApp / voicebot for an outreach run
 * based on selected contact channels and generated channel_copies.
 */
export async function launchOutreachGoLive({
  runId,
  prospectIds = null,
  activate = false,
  channelCopiesOverride = null,
  companyId: companyIdOverride = null,
} = {}) {
  await hydrateOutreachStore()
  const run = runsById.get(runId)
  if (!run) throw new Error('Outreach run not found')

  const companyId = companyIdOverride || run.companyId || run.workspaceId
  if (!companyId) throw new Error('companyId is required to launch campaigns')

  // Apply UI edits for the selected prospect before launch
  if (channelCopiesOverride && typeof channelCopiesOverride === 'object') {
    const overrideProspectId = Array.isArray(prospectIds) && prospectIds[0]
      ? prospectIds[0]
      : null
    const target = overrideProspectId
      ? run.prospects.find((p) => p.id === overrideProspectId)
      : run.prospects.find((p) => p.status === 'copy_ready') || run.prospects[0]
    if (target) {
      target.channel_copies = {
        ...(target.channel_copies || {}),
        ...channelCopiesOverride,
      }
      const emailCopy = prospectChannelCopy(target, 'email')
      if (emailCopy.body) {
        target.subject = emailCopy.subject || target.subject || ''
        target.body = emailCopy.body
      }
    }
  }

  const idSet = Array.isArray(prospectIds) && prospectIds.length
    ? new Set(prospectIds.map(String))
    : null
  const candidates = (run.prospects || []).filter((p) => {
    if (idSet && !idSet.has(p.id)) return false
    if (p.channel_copies && Object.keys(p.channel_copies).length) return true
    return p.status === 'copy_ready' || p.status === 'copy_locked' || Boolean(p.body)
  })
  if (!candidates.length) {
    throw new Error('No prospects with outreach copy ready to launch')
  }

  const unlocked = candidates.filter((p) => !p.copy_locked)
  if (unlocked.length) {
    throw new Error(
      `Lock draft copy before Go Live (${unlocked.length} unlocked). Edit/revise freely, then Lock copy.`,
    )
  }

  const copyTypes = resolveOutreachCopyTypes(run.contactChannels, run.channel)
  const campaignNameBase =
    (run.question || 'Marqq Outreach').slice(0, 60) || 'Marqq Outreach'
  const dateLabel = new Date().toLocaleDateString('en-IN')

  const pickTemplate = (copyType) => {
    for (const p of candidates) {
      const copy = prospectChannelCopy(p, copyType)
      if (copy.body.trim()) return { prospect: p, ...copy }
    }
    if (copyType === 'email') {
      const p = candidates.find((c) => c.body)
      if (p) return { prospect: p, subject: p.subject || '', body: p.body || '' }
    }
    return null
  }

  const toLead = (p) => {
    const names = splitName(p.full_name || p.first_name || '')
    return {
      email: p.email || '',
      first_name: p.first_name || names.first_name,
      last_name: names.last_name,
      full_name: p.full_name || '',
      company: p.company || '',
      company_name: p.company || '',
      linkedin_url: p.linkedin_url || '',
      phone: p.phone_e164 || p.phone || '',
      phone_e164: p.phone_e164 || p.phone || '',
      personalization: `${p.title || ''} at ${p.company || ''}`.trim(),
      name: p.full_name || '',
    }
  }

  const triggers = []
  const planned = []

  if (copyTypes.includes('email')) {
    const template = pickTemplate('email')
    const emailLeads = candidates.map(toLead).filter((l) => l.email)
    if (template?.body && emailLeads.length) {
      triggers.push({
        automation_id: 'instantly_create_campaign',
        params: {
          name: `${campaignNameBase} · Email · ${dateLabel}`,
          subject: template.subject || 'Quick question, {{first_name}}',
          body: template.body,
          daily_limit: 50,
          register_webhook: true,
          create_interested_subsequence: false,
          activate: Boolean(activate),
          enrich_leads: true,
          enrich_mode: 'supersearch',
          leads: emailLeads,
        },
      })
      planned.push({ channel: 'email', connector: 'instantly', leads: emailLeads.length })
    } else {
      planned.push({
        channel: 'email',
        connector: 'instantly',
        skipped: true,
        reason: !template?.body ? 'No email copy' : 'No leads with email',
      })
    }
  }

  if (copyTypes.includes('linkedin_dm')) {
    const template = pickTemplate('linkedin_dm')
    const liLeads = candidates.map(toLead).filter((l) => l.linkedin_url)
    if (!activate) {
      planned.push({
        channel: 'linkedin',
        connector: 'heyreach',
        skipped: true,
        reason: 'Draft mode — LinkedIn/HeyReach push waits for live Go Live',
        prepared_leads: liLeads.length,
        has_copy: Boolean(template?.body),
      })
    } else if (template?.body && liLeads.length) {
      triggers.push({
        automation_id: 'heyreach_linkedin_campaign',
        params: {
          campaign_name: `${campaignNameBase} · LinkedIn · ${dateLabel}`,
          message_template: template.body,
          leads: liLeads,
        },
      })
      planned.push({ channel: 'linkedin', connector: 'heyreach', leads: liLeads.length })
    } else {
      planned.push({
        channel: 'linkedin',
        connector: 'heyreach',
        skipped: true,
        reason: !template?.body ? 'No LinkedIn DM copy' : 'No leads with LinkedIn URL',
      })
    }
  }

  if (copyTypes.includes('whatsapp_dm')) {
    const template = pickTemplate('whatsapp_dm')
    const phoneLeads = candidates.map(toLead).filter((l) => l.phone)
    if (!activate) {
      planned.push({
        channel: 'whatsapp',
        connector: 'whatsapp',
        skipped: true,
        reason: 'Draft mode — WhatsApp send waits for live Go Live',
        prepared_leads: phoneLeads.length,
        has_copy: Boolean(template?.body),
      })
    } else if (template?.body && phoneLeads.length) {
      triggers.push({
        automation_id: 'whatsapp_send_campaign',
        params: {
          campaign_name: `${campaignNameBase} · WhatsApp · ${dateLabel}`,
          text: template.body,
          leads: phoneLeads,
        },
      })
      planned.push({ channel: 'whatsapp', connector: 'whatsapp', leads: phoneLeads.length })
    } else {
      planned.push({
        channel: 'whatsapp',
        connector: 'whatsapp',
        skipped: true,
        reason: !template?.body ? 'No WhatsApp copy' : 'No leads with phone',
      })
    }
  }

  if (copyTypes.includes('voicebot_script')) {
    const template = pickTemplate('voicebot_script')
    const phoneLeads = candidates.map(toLead).filter((l) => l.phone)
    if (!activate) {
      planned.push({
        channel: 'voicebot',
        connector: 'voicebot',
        skipped: true,
        reason: 'Draft mode — voicebot calls wait for live Go Live',
        prepared_leads: phoneLeads.length,
        has_copy: Boolean(template?.body),
      })
    } else if (template?.body && phoneLeads.length) {
      triggers.push({
        automation_id: 'voicebot_campaign_launch',
        params: {
          campaign_name: `${campaignNameBase} · Voicebot · ${dateLabel}`,
          script_hint: template.body,
          leads: phoneLeads,
        },
      })
      planned.push({ channel: 'voicebot', connector: 'voicebot', leads: phoneLeads.length })
    } else {
      planned.push({
        channel: 'voicebot',
        connector: 'voicebot',
        skipped: true,
        reason: !template?.body ? 'No voicebot script' : 'No leads with phone',
      })
    }
  }

  if (!triggers.length) {
    const draftReady = planned.some((p) => p.skipped && /draft mode/i.test(String(p.reason || '')))
    if (draftReady && !activate) {
      run.last_go_live = {
        launched_at: new Date().toISOString(),
        activate: false,
        planned,
        channels: [],
        note: 'Draft mode: Instantly may still create a draft campaign; LinkedIn/WhatsApp/voicebot wait for live Go Live.',
      }
      await persistRun(run)
      return {
        runId: run.id,
        activate: false,
        prospects_launched: candidates.length,
        planned,
        channels: [],
        skipped: planned.filter((p) => p.skipped),
        status: 'draft',
        message:
          'Draft saved where supported (Instantly). LinkedIn, WhatsApp, and voicebot stay prepared until you choose live delivery and click Go Live.',
        campaigns: run.campaigns,
        prospects: candidates,
      }
    }
    throw new Error(
      `Nothing to launch. ${planned.map((p) => `${p.channel}: ${p.reason || 'ok'}`).join('; ')}`,
    )
  }

  const { executeAutomationTriggers } = await import('./automations/registry.js')
  const results = await executeAutomationTriggers(
    {
      automation_triggers: triggers,
      run_id: run.id,
      agent: 'sam',
    },
    companyId,
  )

  const launchedAt = new Date().toISOString()
  const channelResults = results.map((row) => {
    const automationId = row.automation_id
    const status = row.status || row.result?.status || 'unknown'
    const provider =
      automationId === 'instantly_create_campaign'
        ? 'instantly'
        : automationId === 'heyreach_linkedin_campaign'
          ? 'heyreach'
          : automationId === 'whatsapp_send_campaign'
            ? 'whatsapp'
            : automationId === 'voicebot_campaign_launch'
              ? 'voicebot'
              : automationId

    const ok = status === 'completed' || status === 'partial'
    if (ok) {
      const campaign = upsertProviderCampaign(
        run,
        provider,
        row.result?.campaign_name || row.result?.name || `${provider} · ${dateLabel}`,
        candidates.map((p) => p.id),
      )
      campaign.status = activate || provider !== 'instantly' ? 'sending' : 'draft'
      campaign.sentCount = (campaign.sentCount || 0) + candidates.length
      campaign.launch_meta = {
        automation_id: automationId,
        result: row.result || null,
        launched_at: launchedAt,
        activate: Boolean(activate),
      }
    }

    return {
      automation_id: automationId,
      provider,
      status,
      error: row.result?.error || (status === 'error' ? 'Launch failed' : null),
      result: row.result || null,
    }
  })

  for (const prospect of candidates) {
    const anyOk = channelResults.some((r) => r.status === 'completed' || r.status === 'partial')
    if (anyOk) {
      prospect.status = 'sent'
      prospect.sent_at = launchedAt
      prospect.send_error = null
      prospect.send_meta = {
        mode: 'multi_channel_go_live',
        activate: Boolean(activate),
        channels: channelResults,
        launched_at: launchedAt,
      }
      const wa = channelResults.find(
        (r) => r.provider === 'whatsapp' && (r.status === 'completed' || r.status === 'partial'),
      )
      if (wa?.result?.phone_number_id) {
        prospect.whatsapp_phone_number_id = wa.result.phone_number_id
      }
    } else {
      prospect.send_error = channelResults.map((r) => r.error).filter(Boolean).join('; ') || 'Launch failed'
    }
  }

  run.last_go_live = {
    launched_at: launchedAt,
    activate: Boolean(activate),
    planned,
    channels: channelResults,
  }
  await persistRun(run)

  const successCount = channelResults.filter((r) => r.status === 'completed' || r.status === 'partial').length
  return {
    runId: run.id,
    activate: Boolean(activate),
    prospects_launched: candidates.length,
    planned,
    channels: channelResults,
    skipped: planned.filter((p) => p.skipped),
    status: successCount === channelResults.length
      ? 'completed'
      : successCount > 0
        ? 'partial'
        : 'error',
    campaigns: run.campaigns,
    prospects: candidates,
  }
}
