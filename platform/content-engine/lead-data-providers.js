/**
 * Provider-agnostic B2B lead data layer.
 *
 * Apollo and Hunter (and future ZoomInfo / Clearbit / etc.) implement the same
 * contract: resolve → findLeads → enrichLead. Callers should use these helpers
 * instead of hardcoding apollo_*.
 */
import {
  executeComposioActionForEntities,
  formatApolloConnectionError,
  getConnectedAccountApiKeyForEntities,
} from './mcp-router.js'
import { getConnectorPreferences } from './connector-preferences.js'

/** Connectors that can supply net-new B2B prospects / enrichment */
export const LEAD_DATA_PROVIDER_IDS = ['apollo', 'hunter']

export const LEAD_DATA_PROVIDER_META = {
  apollo: {
    id: 'apollo',
    label: 'Apollo',
    capabilities: ['people_search', 'account_search', 'enrich'],
  },
  hunter: {
    id: 'hunter',
    label: 'Hunter',
    capabilities: ['domain_search', 'email_finder', 'enrich'],
  },
}

function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean)
  if (value == null || value === '') return []
  return String(value)
    .split(/[,|]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function entityList(entityIds, companyId) {
  const ids = Array.isArray(entityIds) ? entityIds : []
  if (companyId && !ids.includes(companyId)) ids.push(companyId)
  return ids.filter(Boolean)
}

/**
 * Which lead-data connectors have a usable API key on this workspace/company.
 */
export async function listConnectedLeadProviders(entityIds = []) {
  const connected = []
  for (const id of LEAD_DATA_PROVIDER_IDS) {
    const result = await getConnectedAccountApiKeyForEntities(id, entityIds)
    if (result?.api_key) connected.push(id)
  }
  return connected
}

/**
 * Pick a provider: explicit → workspace preference → Apollo → first connected.
 */
export async function resolveLeadDataProvider({
  entityIds = [],
  companyId = null,
  preferred = null,
} = {}) {
  const ids = entityList(entityIds, companyId)
  const connected = await listConnectedLeadProviders(ids)
  if (!connected.length) {
    return {
      provider: null,
      connected: [],
      error:
        'No lead data connector connected. Connect Apollo or Hunter in Settings → Accounts.',
    }
  }

  const prefs = getConnectorPreferences(companyId || ids[0])
  const preferredId = String(preferred || prefs.lead_data_provider || '').trim().toLowerCase()

  if (preferredId && connected.includes(preferredId)) {
    return { provider: preferredId, connected, error: null }
  }
  if (connected.includes('apollo')) {
    return { provider: 'apollo', connected, error: null }
  }
  return { provider: connected[0], connected, error: null }
}

function mapApolloPersonToLead(person) {
  const phoneNumbers = Array.isArray(person.phone_numbers) ? person.phone_numbers : []
  const verifiedPhone = phoneNumbers.find((entry) => {
    const status = String(entry?.status_cd || entry?.status || '').toLowerCase()
    const confidence = String(entry?.confidence_cd || entry?.confidence || '').toLowerCase()
    return status.includes('valid') || status === 'verified' || confidence === 'high'
  })
  const phone =
    verifiedPhone?.sanitized_number
    || verifiedPhone?.raw_number
    || person.phone_number
    || person.sanitized_phone
    || person.phone
    || ''

  return {
    full_name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
    first_name: person.first_name || '',
    last_name: person.last_name || '',
    designation: person.title || person.headline || '—',
    company: person.employment_history?.find?.((job) => job.current)?.organization_name
      || person.organization?.name
      || person.organization_name
      || '—',
    city: person.city || '',
    state: person.state || '',
    icp_industry: person.organization?.industry || person.industry || '',
    seniority: person.seniority ? String(person.seniority).toUpperCase() : '',
    phone_e164: phone,
    email: person.email || '',
    email_norm: person.email || '',
    has_linkedin: Boolean(person.linkedin_url),
    linkedin_url: person.linkedin_url || '',
    quality: person.email ? 4 : 3,
    domain: person.organization?.primary_domain || person.organization?.domain || '',
    provider: 'apollo',
    has_direct_phone: person.has_direct_phone || null,
  }
}

function apolloHasVerifiedEmail(person = {}) {
  if (person.has_email === true || person.has_email === 'true' || person.has_email === 'Yes') return true
  const status = String(person.email_status || person.email_status_cd || '').toLowerCase()
  if (person.email && (status === 'verified' || status === 'valid' || !status)) return true
  return false
}

function apolloHasVerifiedDirectPhone(person = {}) {
  const flag = String(person.has_direct_phone || '').trim().toLowerCase()
  // Apollo returns "Yes" for verified/available direct dial; "Maybe: …" means not confirmed.
  return flag === 'yes' || flag === 'true'
}

function apolloPersonHasVerifiedPhone(person = {}) {
  if (apolloHasVerifiedDirectPhone(person) && (person.phone_number || person.sanitized_phone || person.phone)) {
    return true
  }
  const phones = Array.isArray(person.phone_numbers) ? person.phone_numbers : []
  return phones.some((entry) => {
    const status = String(entry?.status_cd || entry?.status || '').toLowerCase()
    const confidence = String(entry?.confidence_cd || entry?.confidence || '').toLowerCase()
    const number = entry?.sanitized_number || entry?.raw_number || entry?.number || ''
    return Boolean(number) && (status.includes('valid') || status === 'verified' || confidence === 'high')
  })
}

function mapApolloAccountToLead(account) {
  return {
    full_name: '',
    designation: 'Target Account',
    company: account.name || '—',
    city: account.city || account.organization_city || '',
    state: account.state || account.organization_state || '',
    icp_industry: account.industry || '',
    seniority: 'ACCOUNT',
    phone_e164: account.phone || account.primary_phone?.sanitized_number || '',
    email: '',
    email_norm: '',
    has_linkedin: Boolean(account.linkedin_url),
    linkedin_url: account.linkedin_url || '',
    quality: 3,
    website_url: account.website_url || '',
    domain: account.primary_domain || account.domain || '',
    provider: 'apollo',
  }
}

function mapHunterEmailToLead(entry, domainHint = '') {
  const first = entry.first_name || ''
  const last = entry.last_name || ''
  const full = [first, last].filter(Boolean).join(' ') || entry.value?.split?.('@')?.[0] || ''
  return {
    full_name: full,
    first_name: first,
    last_name: last,
    designation: entry.position || entry.seniority || '—',
    company: entry.company || domainHint || '—',
    city: '',
    state: '',
    icp_industry: '',
    seniority: entry.seniority ? String(entry.seniority).toUpperCase() : '',
    phone_e164: entry.phone_number || '',
    email: entry.value || entry.email || '',
    email_norm: entry.value || entry.email || '',
    has_linkedin: Boolean(entry.linkedin),
    linkedin_url: entry.linkedin || '',
    quality: entry.confidence ? Math.min(5, Math.ceil(Number(entry.confidence) / 20)) : 3,
    domain: domainHint || String(entry.value || '').split('@')[1] || '',
    provider: 'hunter',
  }
}

function apolloResultData(result) {
  return result?.result?.data || result?.result || {}
}

function apolloPeopleList(result) {
  const data = apolloResultData(result)
  if (Array.isArray(data.people)) return data.people
  if (Array.isArray(data.contacts)) return data.contacts
  if (Array.isArray(result?.result?.people)) return result.result.people
  if (Array.isArray(result?.result?.contacts)) return result.result.contacts
  return []
}

function apolloOrganizationsList(result) {
  const data = apolloResultData(result)
  if (Array.isArray(data.organizations)) return data.organizations
  if (Array.isArray(data.accounts)) return data.accounts
  if (Array.isArray(result?.result?.organizations)) return result.result.organizations
  if (Array.isArray(result?.result?.accounts)) return result.result.accounts
  return []
}

function apolloNormalizeSearchArgs(params = {}, { limit = 25, requireVerifiedEmail = false } = {}) {
  const countryMap = { IN: 'India', US: 'United States' }
  const country = countryMap[String(params.country || 'IN').toUpperCase()] || String(params.country || 'India')
  const titles = asList(params.designation_keywords || params.titles).slice(0, 8)
  const personLocations = [...asList(params.cities), ...asList(params.states), country].filter(Boolean).slice(0, 5)
  const domains = asList(params.domains).map(normalizeDomain).filter(Boolean).slice(0, 20)
  const companies = asList(params.companies).slice(0, 10)
  const industries = asList(params.industries).map((entry) => entry.replace(/_/g, ' ')).filter(Boolean)
  const seniorities = asList(params.seniorities).slice(0, 8)

  const args = {
    page: 1,
    per_page: Math.min(Math.max(Number(limit) || 25, 1), 100),
  }
  if (titles.length) args.person_titles = titles
  if (personLocations.length) args.person_locations = personLocations
  if (domains.length) args.q_organization_domains = domains
  if (seniorities.length) args.person_seniorities = seniorities
  if (requireVerifiedEmail) args.contact_email_status = ['verified']

  const keywordParts = [...industries, ...companies].filter(Boolean)
  if (keywordParts.length) args.q_keywords = keywordParts.join(' ')
  return args
}

async function apolloEnrichDiscoveredPeople(people = [], entityIds = [], filters = {}) {
  const enriched = []
  const requireVerifiedEmail = Boolean(filters.requireVerifiedEmail)
  const requirePhone = Boolean(filters.requirePhone)
  const requireLinkedin = Boolean(filters.requireLinkedin)

  for (const person of people) {
    if (enriched.length >= (filters.limit || people.length || 0)) break

    const payload = {
      linkedin_url: person.linkedin_url || null,
      email: person.email || null,
      first_name: person.first_name || null,
      last_name: person.last_name || null,
      organization_name: person.organization?.name || person.organization_name || null,
      domain: normalizeDomain(person.organization?.primary_domain || person.organization?.website_url || person.website_url || ''),
      reveal_personal_emails: false,
      reveal_phone_number: false,
    }
    Object.keys(payload).forEach((key) => payload[key] == null || payload[key] === '' ? delete payload[key] : null)

    let resolved = person
    if (Object.keys(payload).length) {
      const enrich = await executeComposioActionForEntities('APOLLO_PEOPLE_ENRICHMENT', payload, entityIds)
      if (!enrich.error) {
        const data = apolloResultData(enrich)
        resolved = data.person || data.match || person
      } else {
        console.warn('[lead-data:apollo] people enrichment failed; using discovery row:', enrich.error)
      }
    }

    if (requireVerifiedEmail && !apolloHasVerifiedEmail(resolved)) continue
    if (requireLinkedin && !resolved.linkedin_url) continue
    if (requirePhone && !(apolloPersonHasVerifiedPhone(resolved) || apolloHasVerifiedDirectPhone(resolved))) continue
    enriched.push(resolved)
  }

  return enriched
}

async function apolloFindLeads(params, entityIds) {
  const connected = await getConnectedAccountApiKeyForEntities('apollo', entityIds)
  if (!connected.api_key) {
    return {
      status: 'error',
      provider: 'apollo',
      error: formatApolloConnectionError(connected.error || 'Apollo API key not available'),
      leads: [],
      count: 0,
    }
  }

  const industries = asList(params.industries).map((entry) => entry.replace(/_/g, ' '))
  const titleKeywords = asList(params.designation_keywords || params.titles)
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 100)
  const requireVerifiedEmail = Boolean(params.require_verified_email)
  const requirePhone = Boolean(params.require_phone)
  const requireLinkedin = Boolean(params.require_linkedin)

  try {
    const searchArgs = apolloNormalizeSearchArgs(params, { limit, requireVerifiedEmail })
    const peopleSearch = await executeComposioActionForEntities('APOLLO_PEOPLE_SEARCH', searchArgs, entityIds)
    if (peopleSearch.error) throw new Error(peopleSearch.error)

    const discovered = apolloPeopleList(peopleSearch)
    if (discovered.length > 0) {
      const enrichedPeople = await apolloEnrichDiscoveredPeople(
        discovered,
        entityIds,
        { limit, requireVerifiedEmail, requirePhone, requireLinkedin },
      )
      const leads = enrichedPeople.map(mapApolloPersonToLead).filter((lead) => lead.company || lead.full_name)
      return {
        status: 'completed',
        provider: 'apollo',
        source: 'apollo_people_search',
        count: leads.length,
        leads,
        message: leads.length
          ? undefined
          : `Apollo returned no people matching contact filters (${[
              requireVerifiedEmail ? 'verified email' : null,
              requirePhone ? 'verified phone' : null,
              requireLinkedin ? 'linkedin' : null,
            ]
              .filter(Boolean)
              .join(', ') || 'none'})`,
      }
    }
  } catch (err) {
    console.error('[lead-data:apollo] people search failed, falling back to account search:', err.message)
  }

  // Account search cannot satisfy person contact filters (verified email/phone/linkedin)
  if (requireVerifiedEmail || requirePhone || requireLinkedin) {
    return {
      status: 'completed',
      provider: 'apollo',
      source: 'apollo_people_search',
      count: 0,
      leads: [],
      message: `Apollo returned no people matching contact filters (${[
        requireVerifiedEmail ? 'verified email' : null,
        requirePhone ? 'verified phone' : null,
        requireLinkedin ? 'linkedin' : null,
      ]
        .filter(Boolean)
        .join(', ')})`,
    }
  }

  const accountQueries = industries.length
    ? industries
    : [titleKeywords[0], params.country].filter(Boolean)

  try {
    const accountMap = new Map()
    for (const query of accountQueries) {
      if (accountMap.size >= limit) break
      const accountData = await executeComposioActionForEntities(
        'APOLLO_ORGANIZATION_SEARCH',
        {
          per_page: Math.max(1, Math.min(10, limit - accountMap.size)),
          page: 1,
          q_organization_name: query,
        },
        entityIds,
      )
      if (accountData.error) throw new Error(accountData.error)
      for (const account of apolloOrganizationsList(accountData)) {
        const key = account.primary_domain || account.domain || account.name
        if (!key || accountMap.has(key)) continue
        accountMap.set(key, account)
        if (accountMap.size >= limit) break
      }
    }
    const accounts = Array.from(accountMap.values())
    const leads = accounts.map(mapApolloAccountToLead).filter((lead) => lead.company)
    return {
      status: 'completed',
      provider: 'apollo',
      source: 'apollo_search_accounts',
      count: leads.length,
      leads,
      message: leads.length ? undefined : 'Apollo returned no matching leads or accounts',
    }
  } catch (err) {
    return { status: 'error', provider: 'apollo', error: err.message, leads: [], count: 0 }
  }
}

function titleMatches(position, titleKeywords) {
  if (!titleKeywords.length) return true
  const hay = String(position || '').toLowerCase()
  if (!hay) return true
  return titleKeywords.some((t) => hay.includes(String(t).toLowerCase()))
}

async function hunterFindLeads(params, entityIds) {
  const domains = asList(params.domains)
  const companies = asList(params.companies)
  const industries = asList(params.industries).map((e) => e.replace(/_/g, ' '))
  const titleKeywords = asList(params.designation_keywords || params.titles)
  const seniority = asList(params.seniorities).map((s) => s.replace(/_/g, ' ').toLowerCase())
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100)

  /** @type {{ domain?: string, company?: string }[]} */
  let targets = domains.map((domain) => ({ domain }))
  if (!targets.length) {
    targets = companies.map((company) => ({ company }))
  }

  // Discover companies when we only have industry signals (Hunter has no Apollo-style people search).
  if (!targets.length && industries.length) {
    const discover = await executeComposioActionForEntities(
      'HUNTER_DISCOVER_COMPANIES',
      {
        query: industries.slice(0, 3).join(' '),
        limit: Math.min(10, limit),
      },
      entityIds,
    )
    if (!discover.error) {
      const raw = discover.result
      const list =
        raw?.data?.companies
        || raw?.companies
        || raw?.data
        || (Array.isArray(raw) ? raw : [])
      if (Array.isArray(list)) {
        for (const row of list) {
          const domain = row.domain || row.website || row.company_domain
          const company = row.organization || row.name || row.company
          if (domain) targets.push({ domain: String(domain).replace(/^https?:\/\//, '').split('/')[0] })
          else if (company) targets.push({ company: String(company) })
        }
      }
    } else {
      console.warn('[lead-data:hunter] discover companies failed:', discover.error)
    }
  }

  if (!targets.length) {
    return {
      status: 'error',
      provider: 'hunter',
      error:
        'Hunter needs company domains (or connect Apollo for industry/title people search). Add domains, or set Target industries so Hunter can discover companies.',
      leads: [],
      count: 0,
    }
  }

  const leads = []
  const seenEmail = new Set()

  for (const target of targets.slice(0, 15)) {
    if (leads.length >= limit) break
    const payload = {
      limit: Math.min(20, limit - leads.length),
      type: 'personal',
    }
    if (target.domain) payload.domain = target.domain
    if (target.company) payload.company = target.company
    if (seniority.length) payload.seniority = seniority.slice(0, 3)
    if (titleKeywords.length) {
      // Hunter departments are coarse; pass required_field email and filter locally by title
      payload.required_field = ['full_name', 'position']
    }

    const res = await executeComposioActionForEntities('HUNTER_DOMAIN_SEARCH', payload, entityIds)
    if (res.error) {
      console.warn('[lead-data:hunter] domain search failed:', res.error, target)
      continue
    }
    const data = res.result?.data || res.result || {}
    const emails = data.emails || data.email || []
    const domainHint = data.domain || target.domain || ''
    const companyName = data.organization || target.company || domainHint
    for (const entry of Array.isArray(emails) ? emails : []) {
      if (leads.length >= limit) break
      const mapped = mapHunterEmailToLead({ ...entry, company: companyName }, domainHint)
      if (!titleMatches(mapped.designation, titleKeywords)) continue
      if (params.require_verified_email && !mapped.email) continue
      if (params.require_linkedin && !mapped.linkedin_url) continue
      if (params.require_phone && !mapped.phone_e164) continue
      const key = (mapped.email_norm || mapped.full_name).toLowerCase()
      if (!key || seenEmail.has(key)) continue
      seenEmail.add(key)
      leads.push(mapped)
    }
  }

  return {
    status: 'completed',
    provider: 'hunter',
    source: 'hunter_domain_search',
    count: leads.length,
    leads,
    message: leads.length ? undefined : 'Hunter returned no matching contacts for the given domains/companies',
  }
}

/**
 * Unified prospect search. Prefer Apollo for industry/title people search;
 * Hunter for domain/company email discovery.
 */
export async function findLeads(params = {}, companyId = null, entityIds = []) {
  const ids = entityList(entityIds, companyId)
  const resolved = await resolveLeadDataProvider({
    entityIds: ids,
    companyId,
    preferred: params.provider || params.lead_provider,
  })
  if (!resolved.provider) {
    return { status: 'error', error: resolved.error, leads: [], count: 0, connected: resolved.connected }
  }
  const preferred = resolved.provider
  const attemptOrder = [preferred, ...resolved.connected.filter((id) => id !== preferred)]
  const attempts = []
  let firstCompleted = null
  let lastError = null

  for (const providerId of attemptOrder) {
    const result = providerId === 'hunter'
      ? await hunterFindLeads({ ...params, provider: providerId }, ids)
      : await apolloFindLeads({ ...params, provider: providerId }, ids)

    attempts.push({
      provider: providerId,
      status: result?.status || 'error',
      count: Number(result?.count) || 0,
      message: result?.message || null,
      error: result?.error || null,
    })

    if (result?.status === 'completed') {
      if ((Number(result.count) || 0) > 0 || (Array.isArray(result.leads) && result.leads.length > 0)) {
        return {
          ...result,
          connected: resolved.connected,
          attemptedProviders: attempts,
        }
      }
      if (!firstCompleted) firstCompleted = result
      continue
    }

    if (result?.status === 'error') {
      lastError = result
    }
  }

  if (firstCompleted) {
    return {
      ...firstCompleted,
      connected: resolved.connected,
      attemptedProviders: attempts,
    }
  }

  return {
    ...(lastError || { status: 'error', provider: preferred, error: 'Lead search failed', leads: [], count: 0 }),
    connected: resolved.connected,
    attemptedProviders: attempts,
  }
}

async function apolloEnrichLead(params, entityIds) {
  const connected = await getConnectedAccountApiKeyForEntities('apollo', entityIds)
  if (!connected.api_key) {
    return {
      status: 'error',
      provider: 'apollo',
      error: formatApolloConnectionError(connected.error || 'APOLLO_API_KEY not configured'),
      person: null,
      organization: null,
    }
  }

  const payload = {
    email: params.email || null,
    domain: normalizeDomain(params.domain) || null,
    first_name: params.first_name || null,
    last_name: params.last_name || null,
    name: params.full_name || null,
    organization_name: params.company || null,
    linkedin_url: params.linkedin_url || null,
    reveal_personal_emails: false,
    reveal_phone_number: false,
  }
  Object.keys(payload).forEach((key) => payload[key] == null || payload[key] === '' ? delete payload[key] : null)

  const res = await executeComposioActionForEntities('APOLLO_PEOPLE_ENRICHMENT', payload, entityIds)
  if (res.error) {
    return {
      status: 'error',
      provider: 'apollo',
      error: formatApolloConnectionError(res.error),
      person: null,
      organization: null,
    }
  }
  const data = apolloResultData(res)
  return {
    status: 'completed',
    provider: 'apollo',
    source: 'apollo_people_match',
    person: data.person || null,
    organization: data.organization || data.person?.organization || null,
  }
}

async function hunterEnrichLead(params, entityIds) {
  if (params.email) {
    const res = await executeComposioActionForEntities(
      'HUNTER_EMAIL_VERIFIER',
      { email: params.email },
      entityIds,
    )
    if (res.error) {
      // Fall through to email finder if we have name + domain
      if (!(params.domain && (params.full_name || params.first_name))) {
        return { status: 'error', provider: 'hunter', error: res.error, person: null, organization: null }
      }
    } else {
      const data = res.result?.data || res.result || {}
      return {
        status: 'completed',
        provider: 'hunter',
        source: 'hunter_email_verifier',
        person: {
          email: params.email,
          name: data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : null,
          ...data,
        },
        organization: data.company || null,
      }
    }
  }

  if (params.domain && (params.full_name || params.first_name)) {
    const payload = { domain: params.domain }
    if (params.full_name) payload.full_name = params.full_name
    if (params.first_name) payload.first_name = params.first_name
    if (params.last_name) payload.last_name = params.last_name
    if (params.company) payload.company = params.company

    const res = await executeComposioActionForEntities('HUNTER_EMAIL_FINDER', payload, entityIds)
    if (res.error) {
      return { status: 'error', provider: 'hunter', error: res.error, person: null, organization: null }
    }
    const data = res.result?.data || res.result || {}
    return {
      status: 'completed',
      provider: 'hunter',
      source: 'hunter_email_finder',
      person: {
        email: data.email || data.value || null,
        name: [data.first_name, data.last_name].filter(Boolean).join(' ') || params.full_name || null,
        title: data.position || null,
        ...data,
      },
      organization: data.company || params.company || null,
    }
  }

  return {
    status: 'error',
    provider: 'hunter',
    error: 'Hunter enrich needs an email, or full_name/first_name + domain',
    person: null,
    organization: null,
  }
}

/**
 * Unified contact enrichment across connected lead-data providers.
 */
export async function enrichLead(params = {}, companyId = null, entityIds = []) {
  const ids = entityList(entityIds, companyId)
  const resolved = await resolveLeadDataProvider({
    entityIds: ids,
    companyId,
    preferred: params.provider || params.lead_provider,
  })
  if (!resolved.provider) {
    return {
      status: 'error',
      error: resolved.error,
      person: null,
      organization: null,
      connected: resolved.connected,
    }
  }

  if (resolved.provider === 'hunter') {
    return hunterEnrichLead(params, ids)
  }
  return apolloEnrichLead(params, ids)
}

function pickFirst(...values) {
  for (const value of values) {
    if (value == null) continue
    const text = typeof value === 'string' ? value.trim() : value
    if (text === '' || (Array.isArray(text) && !text.length)) continue
    return text
  }
  return null
}

function normalizeDomain(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase()
}

/**
 * Compact person profile for LLM personalization (no raw dump).
 */
export function summarizePersonProfile(person = {}, fallback = {}) {
  if (!person && !fallback) return null
  const p = person || {}
  const f = fallback || {}
  const employment = Array.isArray(p.employment_history) ? p.employment_history : []
  const current = employment.find((job) => job?.current) || employment[0] || null
  const prior = employment.filter((job) => job && !job.current).slice(0, 2)

  return {
    full_name: pickFirst(p.name, [p.first_name, p.last_name].filter(Boolean).join(' '), f.full_name),
    first_name: pickFirst(p.first_name, f.first_name),
    last_name: pickFirst(p.last_name, f.last_name),
    title: pickFirst(p.title, p.headline, p.position, f.title, f.designation),
    seniority: pickFirst(p.seniority, f.seniority),
    departments: pickFirst(p.departments, p.functions),
    email: pickFirst(p.email, f.email),
    linkedin_url: pickFirst(p.linkedin_url, f.linkedin_url),
    location: pickFirst(
      [p.city, p.state, p.country].filter(Boolean).join(', '),
      [f.city, f.state].filter(Boolean).join(', '),
    ),
    headline: pickFirst(p.headline),
    current_role: current
      ? {
          title: current.title || null,
          company: current.organization_name || null,
          start_date: current.start_date || null,
        }
      : null,
    prior_roles: prior.map((job) => ({
      title: job.title || null,
      company: job.organization_name || null,
      end_date: job.end_date || null,
    })),
  }
}

/**
 * Compact company / org profile for LLM personalization.
 */
export function summarizeCompanyProfile(org = {}, fallback = {}) {
  if (!org && !fallback) return null
  const o = typeof org === 'string' ? { name: org } : (org || {})
  const f = fallback || {}
  const tech = []
    .concat(o.technology_names || [])
    .concat(o.current_technologies || [])
    .concat(o.technologies || [])
    .map((t) => (typeof t === 'string' ? t : t?.name || t?.uid))
    .filter(Boolean)
    .slice(0, 12)

  return {
    name: pickFirst(o.name, o.organization_name, f.company, f.name),
    domain: normalizeDomain(pickFirst(o.primary_domain, o.domain, o.website_url, f.domain)),
    website: pickFirst(o.website_url, o.website, f.website_url),
    industry: pickFirst(o.industry, o.industries?.[0], f.industry, f.icp_industry),
    employee_count: pickFirst(o.estimated_num_employees, o.employees, o.employee_count, o.size),
    employee_range: pickFirst(o.employee_range, o.size),
    founded_year: pickFirst(o.founded_year, o.year_founded),
    revenue: pickFirst(o.annual_revenue_printed, o.annual_revenue, o.revenue),
    funding: pickFirst(
      o.total_funding_printed,
      o.latest_funding_stage,
      o.funding_stage,
      o.funding,
    ),
    latest_funding_amount: pickFirst(o.latest_funding_amount_printed, o.latest_funding_round_amount),
    description: pickFirst(o.short_description, o.seo_description, o.description, o.about),
    linkedin_url: pickFirst(o.linkedin_url),
    location: pickFirst(
      [o.city, o.state, o.country].filter(Boolean).join(', '),
      o.raw_address,
    ),
    technologies: tech,
    keywords: [].concat(o.keywords || []).slice(0, 10),
  }
}

/**
 * Derive personalization signals from person + company payloads.
 * These are observations the cold email can reference — never invent beyond this list.
 */
export function deriveOutreachSignals(person = {}, company = {}) {
  const signals = []
  const p = person || {}
  const c = company || {}
  const employment = Array.isArray(p.employment_history) ? p.employment_history : []
  const current = employment.find((job) => job?.current) || null

  if (current?.start_date) {
    const started = Date.parse(current.start_date)
    if (!Number.isNaN(started)) {
      const months = (Date.now() - started) / (1000 * 60 * 60 * 24 * 30)
      if (months >= 0 && months <= 6) {
        signals.push({
          type: 'new_role',
          strength: 'high',
          text: `Recently started as ${current.title || 'current role'}${current.organization_name ? ` at ${current.organization_name}` : ''} (within ~${Math.max(1, Math.round(months))} months)`,
        })
      }
    }
  }

  if (p.title || p.headline) {
    signals.push({
      type: 'role_focus',
      strength: 'medium',
      text: `Role focus: ${p.title || p.headline}`,
    })
  }

  if (c.funding || c.latest_funding_amount || c.latest_funding_stage) {
    signals.push({
      type: 'funding',
      strength: 'high',
      text: `Funding signal: ${[c.funding, c.latest_funding_amount, c.latest_funding_stage].filter(Boolean).join(' · ')}`,
    })
  }

  if (c.employee_count || c.employee_range) {
    signals.push({
      type: 'company_scale',
      strength: 'medium',
      text: `Company scale: ${c.employee_count || c.employee_range} employees`,
    })
  }

  if (c.industry) {
    signals.push({
      type: 'industry',
      strength: 'medium',
      text: `Industry: ${c.industry}`,
    })
  }

  if (Array.isArray(c.technologies) && c.technologies.length) {
    signals.push({
      type: 'tech_stack',
      strength: 'medium',
      text: `Tech stack includes: ${c.technologies.slice(0, 6).join(', ')}`,
    })
  }

  if (c.description) {
    signals.push({
      type: 'company_focus',
      strength: 'medium',
      text: `Company focus: ${String(c.description).slice(0, 220)}`,
    })
  }

  if (Array.isArray(c.keywords) && c.keywords.length) {
    signals.push({
      type: 'keywords',
      strength: 'low',
      text: `Company keywords: ${c.keywords.slice(0, 6).join(', ')}`,
    })
  }

  return signals.slice(0, 8)
}

async function apolloFetchCompany(entityIds, { domain, companyName } = {}) {
  const q = companyName || domain
  if (!q && !domain) return null

  if (domain) {
    const enrich = await executeComposioActionForEntities(
      'APOLLO_ORGANIZATION_ENRICHMENT',
      { domain: normalizeDomain(domain) },
      entityIds,
    )
    if (!enrich.error) {
      const data = apolloResultData(enrich)
      if (data?.organization) return data.organization
    } else {
      console.warn('[lead-data:apollo] org enrich failed:', enrich.error)
    }
  }

  try {
    const search = await executeComposioActionForEntities(
      'APOLLO_ORGANIZATION_SEARCH',
      {
        per_page: 1,
        page: 1,
        q_organization_name: q,
        ...(domain ? { q_organization_domains_list: [normalizeDomain(domain)] } : {}),
      },
      entityIds,
    )
    if (search.error) throw new Error(search.error)
    return apolloOrganizationsList(search)[0] || null
  } catch (err) {
    console.warn('[lead-data:apollo] company search failed:', err.message)
    return null
  }
}

async function hunterFetchCompany(entityIds, { domain, companyName } = {}) {
  if (domain) {
    const enrich = await executeComposioActionForEntities(
      'HUNTER_COMPANY_ENRICHMENT',
      { domain },
      entityIds,
    )
    if (!enrich.error) {
      const data = enrich.result?.data || enrich.result || {}
      return {
        name: data.name || data.organization || companyName || null,
        domain: data.domain || domain,
        industry: data.industry || data.category?.industry || null,
        description: data.description || data.site?.metaDescription || null,
        employee_count: data.metrics?.employees || data.employees || null,
        founded_year: data.foundedYear || data.founded_year || null,
        location: [data.geo?.city, data.geo?.state, data.geo?.country].filter(Boolean).join(', ') || null,
        linkedin_url: data.linkedin?.handle
          ? `https://www.linkedin.com/company/${data.linkedin.handle}`
          : null,
        technologies: [].concat(data.tech || data.technologies || []).slice(0, 12),
        website_url: data.domain ? `https://${data.domain}` : null,
        source: 'hunter_company_enrichment',
      }
    }
    console.warn('[lead-data:hunter] company enrichment failed:', enrich.error)
  }

  if (domain) {
    const domainSearch = await executeComposioActionForEntities(
      'HUNTER_DOMAIN_SEARCH',
      { domain, limit: 5 },
      entityIds,
    )
    if (!domainSearch.error) {
      const data = domainSearch.result?.data || domainSearch.result || {}
      return {
        name: data.organization || companyName || domain,
        domain: data.domain || domain,
        industry: data.industry || null,
        description: null,
        employee_count: null,
        source: 'hunter_domain_search',
      }
    }
  }
  return null
}

/**
 * Best-effort Apify homepage signals when APIFY_TOKEN is set.
 * Soft-fails on free-plan / permission errors so copy still drafts.
 */
async function apifyFetchCompanySignals({ domain, companyName } = {}) {
  const token = process.env.APIFY_TOKEN
  if (!token || (!domain && !companyName)) return null

  const startUrl = domain
    ? `https://${normalizeDomain(domain)}`
    : null
  if (!startUrl) return null

  try {
    const actorId = 'apify~website-content-crawler'
    const startResp = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${encodeURIComponent(token)}&waitForFinish=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: startUrl }],
          maxCrawlPages: 1,
          maxCrawlDepth: 0,
          crawlerType: 'cheerio',
        }),
      },
    )
    const startData = await startResp.json().catch(() => ({}))
    if (!startResp.ok || startData.error) {
      return {
        error: startData?.error?.message || `Apify start failed: ${startResp.status}`,
      }
    }
    const run = startData.data || {}
    const datasetId = run.defaultDatasetId
    if (!datasetId) {
      return { error: run.statusMessage || `Apify run status: ${run.status || 'unknown'}` }
    }
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true&limit=1`,
    )
    const items = await itemsResp.json().catch(() => [])
    const page = Array.isArray(items) ? items[0] : null
    if (!page) {
      return {
        error: page?.error || run.statusMessage || 'Apify returned no page content',
        status: run.status,
      }
    }
    if (page.error) return { error: page.error }

    const text = String(page.text || page.markdown || page.description || '').replace(/\s+/g, ' ').trim()
    return {
      name: companyName || domain,
      domain: normalizeDomain(domain),
      website: startUrl,
      description: String(page.metadata?.description || page.description || text).slice(0, 400) || null,
      title: page.metadata?.title || page.title || null,
      source: 'apify_website_content_crawler',
      signal_text: text.slice(0, 400) || null,
    }
  } catch (err) {
    return { error: err.message }
  }
}

/**
 * Fetch prospect + company profiles and derive outreach signals before drafting copy.
 * Tries preferred provider (Apollo/Hunter), then soft-falls back across connected providers + Apify.
 */
export async function enrichProspectContext(params = {}, companyId = null, entityIds = []) {
  const ids = entityList(entityIds, companyId)
  const fallbackPerson = {
    full_name: params.full_name || [params.first_name, params.last_name].filter(Boolean).join(' '),
    first_name: params.first_name,
    last_name: params.last_name,
    title: params.title || params.designation,
    email: params.email,
    linkedin_url: params.linkedin_url,
    city: params.city,
    state: params.state,
    seniority: params.seniority,
    company: params.company,
    domain: normalizeDomain(params.domain),
    industry: params.industry || params.icp_industry,
  }

  const enrichResult = await enrichLead(
    {
      provider: params.provider,
      email: params.email,
      domain: normalizeDomain(params.domain) || undefined,
      first_name: params.first_name,
      last_name: params.last_name,
      full_name: params.full_name || fallbackPerson.full_name,
      company: params.company,
    },
    companyId,
    ids,
  )

  let rawPerson = enrichResult.person || null
  let rawOrg = enrichResult.organization || null
  const sources = []
  const errors = []

  if (enrichResult.status === 'completed') {
    sources.push(enrichResult.source || enrichResult.provider)
  } else if (enrichResult.error) {
    errors.push({ provider: enrichResult.provider || 'enrich', error: enrichResult.error })
  }

  const domain =
    normalizeDomain(params.domain)
    || normalizeDomain(rawOrg?.primary_domain || rawOrg?.domain || rawOrg?.website_url)
    || normalizeDomain(String(params.email || '').split('@')[1])
  const companyName = params.company || rawOrg?.name || null

  // Apollo company enrich when person match lacked org detail
  const apolloKeyResult = await getConnectedAccountApiKeyForEntities('apollo', ids)
  if (apolloKeyResult.api_key && (!rawOrg || !rawOrg.short_description)) {
    const apolloOrg = await apolloFetchCompany(ids, { domain, companyName })
    if (apolloOrg) {
      rawOrg = { ...(typeof rawOrg === 'object' && rawOrg ? rawOrg : {}), ...apolloOrg }
      sources.push('apollo_organization')
    }
  }

  // Hunter company enrich as complement / fallback
  if (!rawOrg || !summarizeCompanyProfile(rawOrg)?.description) {
    const hunterOrg = await hunterFetchCompany(ids, { domain, companyName })
    if (hunterOrg) {
      rawOrg = { ...(typeof rawOrg === 'object' && rawOrg ? rawOrg : {}), ...hunterOrg }
      sources.push(hunterOrg.source || 'hunter_company')
    }
  }

  // Apify homepage signals (optional)
  let apifyExtra = null
  if (process.env.APIFY_TOKEN && domain) {
    apifyExtra = await apifyFetchCompanySignals({ domain, companyName })
    if (apifyExtra?.error) {
      errors.push({ provider: 'apify', error: apifyExtra.error })
    } else if (apifyExtra) {
      sources.push(apifyExtra.source || 'apify')
      rawOrg = {
        ...(typeof rawOrg === 'object' && rawOrg ? rawOrg : {}),
        description: rawOrg?.short_description || rawOrg?.description || apifyExtra.description,
        website_url: rawOrg?.website_url || apifyExtra.website,
        name: rawOrg?.name || apifyExtra.name,
        domain: rawOrg?.primary_domain || rawOrg?.domain || apifyExtra.domain,
      }
      if (apifyExtra.signal_text) {
        rawOrg.apify_homepage_excerpt = apifyExtra.signal_text
      }
    }
  }

  const personProfile = summarizePersonProfile(rawPerson, fallbackPerson)
  const companyProfile = summarizeCompanyProfile(
    typeof rawOrg === 'object' && rawOrg ? rawOrg : { name: companyName },
    fallbackPerson,
  )
  if (rawOrg?.apify_homepage_excerpt && companyProfile) {
    companyProfile.homepage_excerpt = String(rawOrg.apify_homepage_excerpt).slice(0, 300)
  }

  const signals = deriveOutreachSignals(
    { ...fallbackPerson, ...(rawPerson || {}), employment_history: rawPerson?.employment_history },
    companyProfile || {},
  )

  if (apifyExtra?.title && !signals.some((s) => s.type === 'homepage')) {
    signals.push({
      type: 'homepage',
      strength: 'low',
      text: `Homepage title: ${apifyExtra.title}`,
    })
  }

  const status = personProfile || companyProfile ? 'completed' : 'error'
  return {
    status,
    provider: enrichResult.provider || sources[0] || null,
    sources,
    errors,
    person: personProfile,
    organization: companyProfile,
    signals,
    raw: {
      person: rawPerson,
      organization: typeof rawOrg === 'object' ? rawOrg : null,
    },
  }
}

export function leadProviderLabel(providerId) {
  return LEAD_DATA_PROVIDER_META[providerId]?.label || providerId || 'lead data'
}
