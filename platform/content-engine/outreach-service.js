/**
 * Structured Lead Outreach pipeline.
 * Apollo ≤100 → select one prospect → stream short email → Gmail draft + schedule → auto-send → replies.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executeAutomationTriggers } from './automations/registry.js'
import { executeComposioAction } from './mcp-router.js'
import { MKGService } from './mkg-service.js'
import { getLLMModel } from './llm-client.js'

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
    sent_at: raw.sent_at || null,
    send_error: raw.send_error || null,
    replies: Array.isArray(raw.replies) ? raw.replies : [],
    raw: raw.raw || raw,
  }
}

async function ensureDataDir() {
  await mkdir(OUTREACH_DATA_DIR, { recursive: true })
}

function runFilePath(runId) {
  return join(OUTREACH_DATA_DIR, `${runId}.json`)
}

async function persistRun(run) {
  if (!run?.id) return
  runsById.set(run.id, run)
  persistQueue = persistQueue
    .then(async () => {
      await ensureDataDir()
      await writeFile(runFilePath(run.id), JSON.stringify(run, null, 2), 'utf8')
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
      await ensureDataDir()
      const files = await readdir(OUTREACH_DATA_DIR)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const raw = await readFile(join(OUTREACH_DATA_DIR, file), 'utf8')
          const run = JSON.parse(raw)
          if (run?.id) {
            run.prospects = (run.prospects || []).map((p, i) => normalizeProspect(p, i))
            run.campaigns = Array.isArray(run.campaigns) ? run.campaigns : []
            run.replies = Array.isArray(run.replies) ? run.replies : []
            runsById.set(run.id, run)
          }
        } catch (err) {
          console.warn('[outreach] skip corrupt run file', file, err.message)
        }
      }
      hydrated = true
      console.info(`[outreach] hydrated ${runsById.size} run(s) from disk`)
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

  const titleList = Array.isArray(titles) ? titles.filter(Boolean).slice(0, 8) : []
  const industryList = Array.isArray(industries) ? industries.filter(Boolean).slice(0, 8) : []
  const countryLabel = { IN: 'India', US: 'United States' }[String(country || 'IN').toUpperCase()] || country

  let leads = []
  let source = 'apollo'

  const composioSearch = await executeComposioAction(
    'APOLLO_IO_SEARCH_CONTACTS',
    {
      per_page: capped,
      page: 1,
      person_titles: titleList,
      organization_locations: countryLabel ? [countryLabel] : [],
      q_keywords: [industryList.join(' '), String(question || '').slice(0, 200)].filter(Boolean).join(' ').trim(),
    },
    entityId,
  )

  if (!composioSearch.error) {
    const data = composioSearch.result || {}
    const people = data.contacts || data.people || data.matches || data?.data?.contacts || data?.data?.people || []
    if (Array.isArray(people) && people.length) {
      leads = people.slice(0, capped).map((person) => ({
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
      source = 'apollo_composio_search'
    }
  }

  if (!leads.length) {
    const results = await executeAutomationTriggers(
      {
        automation_triggers: [
          {
            automation_id: 'apollo_find_leads',
            params: {
              country,
              industries: industryList,
              designation_keywords: titleList.join(', '),
              limit: capped,
            },
          },
        ],
      },
      entityId,
    )

    const apolloWrap = results[0] || {}
    const apollo = apolloWrap.result || apolloWrap
    if (apollo.status === 'error' || apolloWrap.status === 'error') {
      const msg =
        composioSearch.error ||
        apollo.error ||
        apolloWrap.error ||
        'Apollo search failed — reconnect Apollo in Integrations'
      throw new Error(msg)
    }

    leads = Array.isArray(apollo.leads) ? apollo.leads.slice(0, capped) : []
    source = apollo.source || 'apollo'
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
      return { method: 'gmail_send_draft', result: sendDraft.result }
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
  return { method: 'gmail_send_email', result: sendEmail.result }
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

  const email = String(
    payload.email ||
      payload.from_email ||
      payload.from ||
      payload.lead_email ||
      payload.prospect_email ||
      '',
  )
    .trim()
    .toLowerCase()
  const campaignExternalId = String(
    payload.campaign_id || payload.campaignId || payload.external_campaign_id || '',
  ).trim()
  const body = String(payload.body || payload.text || payload.reply || payload.message || '').trim()
  const subject = String(payload.subject || '').trim()
  const receivedAt = payload.received_at || payload.timestamp || new Date().toISOString()
  const externalId = String(payload.id || payload.email_id || payload.message_id || randomUUID())

  if (!email && !campaignExternalId) {
    throw new Error('Reply payload needs email or campaign_id')
  }

  let matched = null

  for (const run of runsById.values()) {
    for (const prospect of run.prospects || []) {
      const prospectEmail = String(prospect.email || '').trim().toLowerCase()
      if (email && prospectEmail && prospectEmail === email) {
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
    provider: payload.provider || payload.source || 'webhook',
    raw: payload,
  }

  prospect.replies = Array.isArray(prospect.replies) ? prospect.replies : []
  if (!prospect.replies.some((r) => r.id === reply.id)) {
    prospect.replies.push(reply)
  }
  prospect.status = 'replied'

  run.replies = Array.isArray(run.replies) ? run.replies : []
  if (!run.replies.some((r) => r.id === reply.id)) {
    run.replies.push({ ...reply, prospectId: prospect.id })
  }

  const campaign = upsertGmailCampaign(run, prospect.id)
  campaign.replyCount = (campaign.replyCount || 0) + 1
  campaign.status = 'active'

  await persistRun(run)

  return {
    status: 'recorded',
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
