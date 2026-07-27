/**
 * CRM list + normalize — HubSpot / Zoho via Composio.
 */

import {
  executeComposioActionForEntities,
  getConnectors,
} from './mcp-router.js'

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickProps(obj = {}) {
  return obj.properties && typeof obj.properties === 'object' ? obj.properties : obj
}

function normalizeHubspotContact(raw = {}) {
  const props = pickProps(raw)
  const first = asString(props.firstname || props.firstName)
  const last = asString(props.lastname || props.lastName)
  const name =
    asString(props.name) ||
    [first, last].filter(Boolean).join(' ') ||
    asString(props.email, 'Unknown')
  return {
    id: String(raw.id || props.hs_object_id || props.vid || ''),
    name,
    title: asString(props.jobtitle || props.job_title),
    company: asString(props.company || props.company_name),
    email: asString(props.email || props.work_email),
    phone: asString(props.phone || props.mobilephone || props.mobile),
    status: asString(props.lifecyclestage || props.hs_lead_status, 'lead'),
    owner: asString(props.hubspot_owner_id || props.ownername),
    source: 'hubspot',
    connector: 'hubspot',
    url: raw.id ? `https://app.hubspot.com/contacts/${raw.id}` : null,
    raw,
  }
}

function normalizeZohoRecord(raw = {}, moduleHint = 'Contacts') {
  const first = asString(raw.First_Name || raw.first_name)
  const last = asString(raw.Last_Name || raw.last_name)
  const name =
    asString(raw.Full_Name || raw.full_name || raw.Name) ||
    [first, last].filter(Boolean).join(' ') ||
    asString(raw.Email || raw.email, 'Unknown')
  const id = String(raw.id || raw.Id || '')
  return {
    id,
    name,
    title: asString(raw.Title || raw.Designation || raw.title),
    company: asString(raw.Company || raw.Account_Name || raw.company),
    email: asString(raw.Email || raw.email),
    phone: asString(raw.Phone || raw.Mobile || raw.phone),
    status: asString(raw.Lead_Status || raw.Status || moduleHint.toLowerCase(), 'lead'),
    owner: asString(raw.Owner?.name || raw.Owner),
    source: 'zoho_crm',
    connector: 'zoho_crm',
    module: moduleHint,
    url: null,
    raw,
  }
}

function unwrapList(result) {
  const r = result?.result || result?.data || result || {}
  if (Array.isArray(r.results)) return r.results
  if (Array.isArray(r.data)) return r.data
  if (Array.isArray(r.contacts)) return r.contacts
  if (Array.isArray(r.leads)) return r.leads
  if (Array.isArray(r.records)) return r.records
  if (Array.isArray(r.objects)) return r.objects
  if (Array.isArray(r)) return r
  if (Array.isArray(r?.data?.results)) return r.data.results
  return []
}

async function connectedSet(entityId) {
  const list = await getConnectors(entityId)
  return new Set(
    (list || [])
      .filter((c) => c?.connected || c?.status === 'active')
      .map((c) => c.id),
  )
}

async function listHubspotContacts(entityIds, { query = '', limit = 50 } = {}) {
  const properties = [
    'firstname',
    'lastname',
    'email',
    'phone',
    'mobilephone',
    'company',
    'jobtitle',
    'lifecyclestage',
    'hs_lead_status',
    'hubspot_owner_id',
  ]
  let res
  if (query) {
    res = await executeComposioActionForEntities(
      'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA',
      { query, limit: Math.min(100, limit), properties },
      entityIds,
    )
  } else {
    res = await executeComposioActionForEntities(
      'HUBSPOT_LIST_CONTACTS',
      { limit: Math.min(100, limit), properties, archived: false },
      entityIds,
    )
  }
  if (res?.error) {
    // Fallback to CRM objects search (newer slug)
    const fallback = await executeComposioActionForEntities(
      'HUBSPOT_SEARCH_CRM_OBJECTS_BY_CRITERIA',
      {
        objectType: 'contacts',
        limit: Math.min(100, limit),
        properties,
        ...(query ? { query } : {}),
      },
      entityIds,
    )
    if (fallback?.error) return { ok: false, error: res.error || fallback.error, contacts: [] }
    return {
      ok: true,
      tool: 'HUBSPOT_SEARCH_CRM_OBJECTS_BY_CRITERIA',
      contacts: unwrapList(fallback).map(normalizeHubspotContact).filter((c) => c.id || c.email),
    }
  }
  return {
    ok: true,
    tool: query ? 'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA' : 'HUBSPOT_LIST_CONTACTS',
    contacts: unwrapList(res).map(normalizeHubspotContact).filter((c) => c.id || c.email),
  }
}

async function listZohoContacts(entityIds, { query = '', limit = 50 } = {}) {
  const listRes = await executeComposioActionForEntities(
    query ? 'ZOHO_SEARCH_CONTACTS' : 'ZOHO_LIST_CONTACTS',
    query
      ? { criteria: `(Email:starts_with:${query})`, word: query, page: 1, per_page: Math.min(100, limit) }
      : { page: 1, per_page: Math.min(100, limit) },
    entityIds,
  )
  let contacts = []
  if (!listRes?.error) {
    contacts = unwrapList(listRes).map((r) => normalizeZohoRecord(r, 'Contacts'))
  }

  const leadRes = await executeComposioActionForEntities(
    query ? 'ZOHO_SEARCH_LEADS' : 'ZOHO_LIST_LEADS',
    query
      ? { criteria: `(Email:starts_with:${query})`, word: query, page: 1, per_page: Math.min(50, limit) }
      : { page: 1, per_page: Math.min(50, limit) },
    entityIds,
  )
  if (!leadRes?.error) {
    contacts = [
      ...contacts,
      ...unwrapList(leadRes).map((r) => normalizeZohoRecord(r, 'Leads')),
    ]
  }

  if (listRes?.error && leadRes?.error) {
    return { ok: false, error: listRes.error || leadRes.error, contacts: [] }
  }
  return {
    ok: true,
    tool: query ? 'ZOHO_SEARCH_*' : 'ZOHO_LIST_*',
    contacts: contacts.filter((c) => c.id || c.email).slice(0, limit),
  }
}

/**
 * @param {{ workspaceId?: string, companyId?: string, preferredConnector?: string, query?: string, limit?: number }} opts
 */
export async function listCrmContacts(opts = {}) {
  const entityIds = [opts.workspaceId, opts.companyId].filter(Boolean)
  if (!entityIds.length) {
    return { ok: false, error: 'workspaceId is required', contacts: [], missing: ['hubspot', 'zoho_crm'] }
  }

  const connected = await connectedSet(entityIds[0])
  if (entityIds[1] && entityIds[1] !== entityIds[0]) {
    const extra = await connectedSet(entityIds[1])
    for (const id of extra) connected.add(id)
  }

  const preferred = asString(opts.preferredConnector)
  const candidates = ['hubspot', 'zoho_crm'].filter((id) => connected.has(id))
  if (!candidates.length) {
    return {
      ok: false,
      error: 'Connect HubSpot or Zoho CRM first',
      contacts: [],
      missing: ['hubspot', 'zoho_crm'],
      connected: [],
    }
  }

  const connector =
    preferred && candidates.includes(preferred) ? preferred : candidates[0]

  const listed =
    connector === 'zoho_crm'
      ? await listZohoContacts(entityIds, { query: asString(opts.query), limit: opts.limit || 50 })
      : await listHubspotContacts(entityIds, { query: asString(opts.query), limit: opts.limit || 50 })

  return {
    ...listed,
    connector,
    connected: candidates,
  }
}
