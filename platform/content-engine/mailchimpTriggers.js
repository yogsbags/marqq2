/**
 * Mailchimp Composio webhook triggers:
 *   MAILCHIMP_CAMPAIGN_TRIGGER
 *   MAILCHIMP_PROFILE_UPDATE_TRIGGER
 *   MAILCHIMP_SUBSCRIBE_TRIGGER
 *   MAILCHIMP_UNSUBSCRIBE_TRIGGER
 *
 * Events land on /api/webhooks/composio (project webhook).
 */
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { upsertComposioTrigger } from './mcp-router.js'
import {
  MAILCHIMP_TRIGGER_SLUGS,
  isMailchimpTriggerSlug,
} from './lib/mailchimpToolkitCatalog.js'
import { getPreferredMailchimpListId } from './connector-preferences.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EVENTS_DIR = join(__dirname, 'data/mailchimp-events')
const REG_DIR = join(__dirname, 'data/mailchimp-triggers')

function safeId(id) {
  return String(id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
}

function eventsPath(workspaceId) {
  return join(EVENTS_DIR, `${safeId(workspaceId)}.jsonl`)
}

function regPath(workspaceId) {
  return join(REG_DIR, `${safeId(workspaceId)}.json`)
}

function appendEvent(workspaceId, event) {
  if (!fs.existsSync(EVENTS_DIR)) fs.mkdirSync(EVENTS_DIR, { recursive: true })
  fs.appendFileSync(eventsPath(workspaceId), `${JSON.stringify(event)}\n`, 'utf8')
}

function saveRegistration(workspaceId, record) {
  if (!fs.existsSync(REG_DIR)) fs.mkdirSync(REG_DIR, { recursive: true })
  fs.writeFileSync(regPath(workspaceId), JSON.stringify(record, null, 2))
}

export function getMailchimpTriggerRegistration(workspaceId = 'default') {
  try {
    const p = regPath(workspaceId)
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export function listMailchimpEvents(workspaceId = 'default', { limit = 50 } = {}) {
  try {
    const p = eventsPath(workspaceId)
    if (!fs.existsSync(p)) return []
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
    return lines.slice(-Math.max(1, limit)).map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { raw: line }
      }
    }).reverse()
  } catch {
    return []
  }
}

/**
 * Upsert all four Mailchimp audience webhook triggers for a workspace.
 * Requires list_id (audience). Falls back to connector preference mailchimp_list_id.
 */
export async function ensureMailchimpTriggers(workspaceId = 'default', { listId } = {}) {
  const audienceId = String(listId || getPreferredMailchimpListId(workspaceId) || '').trim()
  if (!audienceId) {
    return {
      ok: false,
      error: 'mailchimp_list_id required — pick an audience in Settings → Accounts',
    }
  }

  const existing = getMailchimpTriggerRegistration(workspaceId)
  if (
    existing?.list_id === audienceId &&
    Array.isArray(existing?.triggers) &&
    existing.triggers.length === MAILCHIMP_TRIGGER_SLUGS.length &&
    existing.triggers.every((t) => t.ok)
  ) {
    return { ok: true, skipped: true, list_id: audienceId, triggers: existing.triggers }
  }

  const triggers = []
  for (const slug of MAILCHIMP_TRIGGER_SLUGS) {
    const result = await upsertComposioTrigger(slug, {
      userId: workspaceId,
      triggerConfig: { list_id: audienceId },
    })
    triggers.push({
      slug,
      ok: Boolean(result?.ok),
      trigger_id: result?.trigger_id || null,
      error: result?.error || null,
    })
  }

  const record = {
    list_id: audienceId,
    workspace_id: workspaceId,
    updated_at: new Date().toISOString(),
    triggers,
  }
  saveRegistration(workspaceId, record)

  const ok = triggers.some((t) => t.ok)
  return {
    ok,
    list_id: audienceId,
    triggers,
    error: ok ? null : triggers.map((t) => t.error).filter(Boolean).join('; ') || 'trigger upsert failed',
  }
}

function normalizeMailchimpPayload(payload = {}) {
  const data = payload.data || payload.payload || payload
  const meta = payload.metadata || {}
  const slug = String(
    meta.trigger_slug || payload.trigger_slug || payload.type || payload.event || '',
  ).toUpperCase()

  return {
    slug,
    email: data.email || data.email_address || data['data[email]'] || null,
    event_type: data.event_type || data.type || data.action || slug || null,
    list_id: data.list_id || data.listId || data['data[list_id]'] || null,
    merge_fields: data.merge_fields || data.merge_vars || data.merges || null,
    timestamp: data.timestamp || data.fired_at || data.occurred_at || new Date().toISOString(),
    data,
    meta,
  }
}

/**
 * Handle a Composio Mailchimp trigger webhook payload.
 * Persists the event for newsletter / audience intelligence.
 */
export async function handleComposioMailchimpTrigger(payload = {}, { workspaceId } = {}) {
  const normalized = normalizeMailchimpPayload(payload)
  if (!isMailchimpTriggerSlug(normalized.slug) && !String(normalized.slug).includes('MAILCHIMP')) {
    return { status: 'ignored', reason: `unsupported_trigger:${normalized.slug || 'empty'}` }
  }

  const userId =
    workspaceId ||
    payload.user_id ||
    payload.userId ||
    payload.metadata?.user_id ||
    payload.metadata?.entity_id ||
    'default'

  const event = {
    id: `${normalized.slug || 'MAILCHIMP'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'composio_mailchimp_trigger',
    workspace_id: userId,
    trigger_slug: normalized.slug,
    email: normalized.email,
    event_type: normalized.event_type,
    list_id: normalized.list_id,
    merge_fields: normalized.merge_fields,
    received_at: new Date().toISOString(),
    timestamp: normalized.timestamp,
    raw: payload,
  }

  appendEvent(userId, event)

  console.log(
    `[mailchimp/trigger] ${normalized.slug} workspace=${userId} email=${normalized.email || '-'} list=${normalized.list_id || '-'}`,
  )

  return {
    status: 'recorded',
    trigger_slug: normalized.slug,
    email: normalized.email,
    list_id: normalized.list_id,
    event_id: event.id,
  }
}
