/**
 * Structured Lead Outreach pipeline helpers.
 * Flow: Apollo fetch (≤100) → select one prospect → stream short email → Gmail draft + schedule.
 */

import { randomUUID } from 'node:crypto'
import { executeAutomationTriggers } from './automations/registry.js'
import { executeComposioAction } from './mcp-router.js'
import { MKGService } from './mkg-service.js'
import { getLLMModel } from './llm-client.js'

export const OUTREACH_APOLLO_MAX = 100

/** In-memory run store (workspace-scoped). Swap for Supabase tables in a later phase. */
const runsById = new Map()

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

/**
 * Suggest next weekday morning send window (09:30 local).
 * Uses timezoneOffsetMinutes if provided (e.g. IST = 330), else UTC+5:30.
 */
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

  // If already past 09:30 local today, start from tomorrow
  const localMinutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  if (localMinutes >= 9 * 60 + 30) {
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  }

  // Skip weekends (UTC day of the local calendar date we constructed)
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  }

  // Convert local 09:30 back to absolute UTC
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
    status: 'fetched', // fetched | copy_ready | drafted | scheduled
    subject: '',
    body: '',
    scheduled_for: null,
    gmail_draft_id: null,
    raw,
  }
}

export function getOutreachRun(runId) {
  return runsById.get(runId) || null
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
  const capped = Math.min(Math.max(Number(limit) || OUTREACH_APOLLO_MAX, 1), OUTREACH_APOLLO_MAX)
  const entityId = workspaceId || companyId
  if (!entityId) throw new Error('workspaceId or companyId is required')

  const titleList = Array.isArray(titles) ? titles.filter(Boolean).slice(0, 8) : []
  const industryList = Array.isArray(industries) ? industries.filter(Boolean).slice(0, 8) : []
  const countryLabel = { IN: 'India', US: 'United States' }[String(country || 'IN').toUpperCase()] || country

  let leads = []
  let source = 'apollo'

  // Prefer Composio OAuth path (matches how Apollo is connected in Integrations)
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

  // Fallback: direct Apollo API key automation
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
  }
  runsById.set(run.id, run)
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

/**
 * Stream short email copy for one prospect via SSE.
 * Writes {text} tokens, then {done, subject, body}.
 */
export async function streamProspectCopy({
  runId,
  prospectId,
  groqClient,
  res,
}) {
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
  runsById.set(runId, run)

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

export async function saveProspectGmailDraft({
  runId,
  prospectId,
  subject,
  body,
  scheduledFor,
  timezoneOffsetMinutes = 330,
}) {
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
  runsById.set(runId, run)

  // Track as a lightweight campaign row for the Campaigns panel
  let campaign = run.campaigns.find((c) => c.provider === 'gmail' && c.status === 'drafts')
  if (!campaign) {
    campaign = {
      id: randomUUID(),
      provider: 'gmail',
      name: run.question?.slice(0, 80) || 'Gmail outreach drafts',
      status: 'drafts',
      createdAt: new Date().toISOString(),
      prospectIds: [],
    }
    run.campaigns.push(campaign)
  }
  if (!campaign.prospectIds.includes(prospect.id)) {
    campaign.prospectIds.push(prospect.id)
  }
  runsById.set(runId, run)

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
  runsById.set(runId, run)
  return prospect
}
