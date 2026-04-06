import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Upload, Users, Target, UserPlus, Send, BarChart3,
  CheckCircle, AlertCircle, FileSpreadsheet, Brain, Zap,
  Mail, Phone, Linkedin, RefreshCw, Download, ChevronRight,
  Database, Search, Loader2, ChevronDown,
  Briefcase, MessageCircle, Bot, Pin, Star, Ban, Landmark, Ruler,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from '@/components/agent/AgentRunPanel'
import { OfferSelector, type Offer } from '@/components/agent/OfferSelector'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  full_name?: string
  designation?: string
  company?: string
  city?: string
  state?: string
  icp_industry?: string
  seniority?: string
  job_fn?: string
  phone_e164?: string
  email?: string
  email_norm?: string
  has_linkedin?: boolean
  linkedin_url?: string
  quality?: number
  spam_count?: number
  [key: string]: unknown
}

interface FetchResult {
  count: number
  table_used: string
  leads: Lead[]
}

interface ICPFilters {
  industries: string[]
  seniorities: string[]
  designation_keywords: string
  cities: string
  states: string
  quality_min: number
  has_phone: boolean
  has_email: boolean
  has_linkedin: boolean
  channel: string
  limit: number
  country: string
}

interface SizeResult {
  estimated_count: number
  table: string
  filters_applied: Record<string, unknown>
}

interface EnrichResult {
  matched: number
  unmatched: number
  unmatched_list: string[]
  data: Lead[]
}

interface OutreachResult {
  status: string
  campaign_id?: string
  campaign_name?: string
  leads_added?: number
  sent_count?: number
  action?: string
  unread_count?: number | null
  analytics?: Record<string, unknown> | null
  sending_status?: Record<string, unknown> | string | null
  campaigns?: Array<Record<string, unknown>>
  emails?: Array<Record<string, unknown>>
  conversations?: Array<Record<string, unknown>>
  credits_remaining?: number | string | Record<string, unknown> | null
  message?: string
  error?: string
}

type LeadTabKey = 'fetch' | 'enrich' | 'route' | 'outreach' | 'agents'
type WorkflowStageKey = 'fetch' | 'enrich' | 'route' | 'outreach'
type OutreachChannel = 'email' | 'linkedin' | 'whatsapp' | 'voicebot'

interface IntegrationStatus {
  id: string
  name: string
  connected: boolean
  status?: string
}

interface LeadIntakePreset {
  leadType?: string
  priority?: string
  source?: string
  missingFields?: string
}

type MkgRecord = Record<string, { value?: unknown; confidence?: number }>

interface LeadSourceStrategy {
  mode: 'enrich_existing' | 'linkedin_apollo' | 'leads_db_primary'
  title: string
  description: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'IT_SERVICES', 'FINANCE', 'MANUFACTURING', 'HEALTHCARE', 'MEDIA',
  'EDUCATION', 'FOOD_BEVERAGE', 'CONSULTING', 'REAL_ESTATE', 'RETAIL',
  'LOGISTICS', 'LEGAL', 'ENERGY', 'TEXTILES', 'GEMS_JEWELRY',
  'AUTOMOTIVE', 'TELECOM', 'AGRICULTURE', 'CONSTRUCTION', 'HOSPITALITY',
  'PHARMA', 'SPORTS', 'TRAVEL', 'ECOMMERCE',
]

const SENIORITIES = ['C_SUITE', 'VP', 'DIRECTOR', 'MANAGER', 'IC', 'PARTNER', 'OWNER']

const CHANNELS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: Phone },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { value: 'any', label: 'Any Channel', icon: Zap },
]

const DEFAULT_ICP: ICPFilters = {
  industries: [],
  seniorities: [],
  designation_keywords: '',
  cities: '',
  states: '',
  quality_min: 3,
  has_phone: false,
  has_email: false,
  has_linkedin: false,
  channel: 'any',
  limit: 500,
  country: 'IN',
}

const INDUSTRY_ALIASES: Record<string, string[]> = {
  IT_SERVICES: ['it services', 'software', 'saas', 'technology', 'tech services', 'app development'],
  FINANCE: ['finance', 'fintech', 'banking', 'insurance', 'wealth', 'lending'],
  HEALTHCARE: ['healthcare', 'health tech', 'healthtech', 'medical', 'hospital'],
  REAL_ESTATE: ['real estate', 'proptech', 'property', 'housing'],
  RETAIL: ['retail', 'consumer retail'],
  ECOMMERCE: ['ecommerce', 'e-commerce', 'marketplace', 'online retail', 'd2c'],
  EDUCATION: ['education', 'edtech'],
  LOGISTICS: ['logistics', 'supply chain', 'shipping'],
  MANUFACTURING: ['manufacturing', 'industrial'],
  CONSULTING: ['consulting', 'agency', 'services'],
}

const TITLE_HINTS = ['founder', 'ceo', 'cto', 'co-founder', 'director', 'vp', 'head', 'manager', 'owner', 'partner']

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string'
        ? item
        : typeof item === 'object' && item && 'name' in item
          ? String((item as { name?: unknown }).name || '')
          : ''))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function getMkgValue(mkg: MkgRecord | null, key: string) {
  const entry = mkg?.[key]
  if (!entry?.value) return null
  if (Number(entry.confidence ?? 0) < 0.5) return null
  return entry.value
}

function flattenMkgText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenMkgText).join(' ')
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flattenMkgText).join(' ')
  return ''
}

function inferFiltersFromMkg(mkg: MkgRecord | null) {
  const sourceText = [
    flattenMkgText(getMkgValue(mkg, 'icp')),
    flattenMkgText(getMkgValue(mkg, 'positioning')),
    flattenMkgText(getMkgValue(mkg, 'messaging')),
    flattenMkgText(getMkgValue(mkg, 'offers')),
  ].join(' ').toLowerCase()

  const channels = normalizeList(getMkgValue(mkg, 'channels')).map((item) => item.toLowerCase())
  const industries = Object.entries(INDUSTRY_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => sourceText.includes(alias)))
    .map(([industry]) => industry)
    .slice(0, 4)

  const designationKeywords = TITLE_HINTS.filter((hint) => sourceText.includes(hint))
  const seniorities = Array.from(new Set([
    designationKeywords.some((hint) => ['founder', 'ceo', 'cto', 'owner', 'partner'].includes(hint)) ? 'C_SUITE' : null,
    designationKeywords.some((hint) => ['director', 'head'].includes(hint)) ? 'DIRECTOR' : null,
    designationKeywords.includes('vp') ? 'VP' : null,
    designationKeywords.includes('manager') ? 'MANAGER' : null,
  ].filter(Boolean) as string[]))

  return {
    industries,
    designationKeywords,
    seniorities,
    channels,
  }
}

function deriveLeadSourceStrategy({
  preset,
  filters,
  hasApolloConnected,
}: {
  preset?: LeadIntakePreset
  filters: ICPFilters
  hasApolloConnected: boolean
}): LeadSourceStrategy {
  if (preset?.leadType === 'existing') {
    return {
      mode: 'enrich_existing',
      title: 'Existing list workflow',
      description: 'This goal is better handled in Enrich because you already have a lead list to improve.',
    }
  }

  const needsLinkedInLeads = filters.channel === 'linkedin' || filters.has_linkedin
  if (needsLinkedInLeads && hasApolloConnected) {
    return {
      mode: 'linkedin_apollo',
      title: 'Apollo people search',
      description: 'LinkedIn outreach needs person-level Apollo results with profile data, so Apollo becomes the required source for this run.',
    }
  }

  return {
    mode: 'leads_db_primary',
    title: 'Leads DB first, enrichment second',
    description: 'Start with the internal leads database for coverage, then use Apollo or Hunter in Enrich to fill missing email or phone fields.',
  }
}

function summarizeLeadSegment(leads: Lead[]) {
  const companies = new Set(leads.map((lead) => String(lead.company || '').trim()).filter(Boolean))
  const industries = new Set(leads.map((lead) => String(lead.icp_industry || '').trim()).filter(Boolean))
  const seniorities = new Set(leads.map((lead) => String(lead.seniority || '').trim()).filter(Boolean))
  return `${leads.length} leads across ${companies.size || leads.length} companies, industries: ${Array.from(industries).slice(0, 4).join(', ') || 'unknown'}, seniorities: ${Array.from(seniorities).slice(0, 4).join(', ') || 'unknown'}`
}

function extractOfferNames(mkg: MkgRecord | null) {
  const offers = getMkgValue(mkg, 'offers')
  if (Array.isArray(offers)) {
    return offers
      .map((offer) => {
        if (typeof offer === 'string') return offer.trim()
        if (offer && typeof offer === 'object' && 'name' in offer) return String((offer as { name?: unknown }).name || '').trim()
        return ''
      })
      .filter(Boolean)
  }
  return normalizeList(offers)
}

function buildDraftPrompt({
  channel,
  leads,
  offerName,
  mkg,
  companyName,
}: {
  channel: OutreachChannel
  leads: Lead[]
  offerName: string
  mkg: MkgRecord | null
  companyName: string
}) {
  const positioning = flattenMkgText(getMkgValue(mkg, 'positioning')).slice(0, 700)
  const messaging = flattenMkgText(getMkgValue(mkg, 'messaging')).slice(0, 700)
  const icp = flattenMkgText(getMkgValue(mkg, 'icp')).slice(0, 700)
  const selectedOffer = offerName || extractOfferNames(mkg)[0] || `the most relevant ${companyName} offer`
  const leadSummary = summarizeLeadSegment(leads.slice(0, 50))

  if (channel === 'email') {
    return `Write outreach copy for ${companyName}.\nChannel: email.\nOffer focus: ${selectedOffer}.\nLead segment summary: ${leadSummary}.\nCompany positioning: ${positioning || 'Not available'}.\nMessaging context: ${messaging || 'Not available'}.\nICP context: ${icp || 'Not available'}.\n\nReturn plain text only in this exact format:\nSUBJECT: <one short subject line>\nBODY:\n<email body with {{first_name}} and {{company}} placeholders where helpful>\n\nKeep it concise, specific, and focused on one offer angle plus one CTA.`
  }

  if (channel === 'linkedin') {
    return `Write outreach copy for ${companyName}.\nChannel: LinkedIn connection or DM.\nOffer focus: ${selectedOffer}.\nLead segment summary: ${leadSummary}.\nCompany positioning: ${positioning || 'Not available'}.\nMessaging context: ${messaging || 'Not available'}.\nICP context: ${icp || 'Not available'}.\n\nReturn plain text only in this exact format:\nMESSAGE:\n<short LinkedIn message with {{first_name}} and {{company}} placeholders where helpful>\n\nKeep it natural and short enough for first-touch outreach.`
  }

  if (channel === 'voicebot') {
    return `Write outreach copy for ${companyName}.\nChannel: outbound voice call opener.\nOffer focus: ${selectedOffer}.\nLead segment summary: ${leadSummary}.\nCompany positioning: ${positioning || 'Not available'}.\nMessaging context: ${messaging || 'Not available'}.\nICP context: ${icp || 'Not available'}.\n\nReturn plain text only in this exact format:\nMESSAGE:\n<short voicebot opening line with {{first_name}} and {{company}} placeholders where helpful>\n\nKeep it natural, conversational, and suitable as an outbound call opener.`
  }

  return `Write outreach copy for ${companyName}.\nChannel: WhatsApp.\nOffer focus: ${selectedOffer}.\nLead segment summary: ${leadSummary}.\nCompany positioning: ${positioning || 'Not available'}.\nMessaging context: ${messaging || 'Not available'}.\nICP context: ${icp || 'Not available'}.\n\nReturn plain text only in this exact format:\nMESSAGE:\n<short WhatsApp outreach message with {{first_name}} and {{company}} placeholders where helpful>\n\nKeep it brief, conversational, and first-touch appropriate.`
}

function parseDraftResponse(channel: OutreachChannel, text: string) {
  const trimmed = text.trim()
  if (channel === 'email') {
    const subjectMatch = trimmed.match(/SUBJECT:\s*(.+)/i)
    const bodyMatch = trimmed.match(/BODY:\s*([\s\S]+)/i)
    return {
      subject: subjectMatch?.[1]?.trim() || 'Quick question, {{first_name}}',
      body: bodyMatch?.[1]?.trim() || trimmed,
    }
  }

  const messageMatch = trimmed.match(/MESSAGE:\s*([\s\S]+)/i)
  return {
    body: messageMatch?.[1]?.trim() || trimmed,
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiLeads(path: string, body?: unknown, method = 'POST') {
  const res = await fetch(`/api/leads-db${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`)
  return data
}

async function apiAutomation(automation_id: string, params: Record<string, unknown>, company_id: string) {
  const res = await fetch('/api/automations/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ automation_id, params, company_id }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

function buildFetchPayload(f: ICPFilters) {
  const payload: Record<string, unknown> = {
    country: f.country,
    quality_min: f.quality_min,
    channel: f.channel,
    limit: f.limit,
    output_format: 'json',
  }
  if (f.industries.length) payload.industries = f.industries
  if (f.seniorities.length) payload.seniorities = f.seniorities
  if (f.designation_keywords.trim()) payload.designation_keywords = f.designation_keywords.split(',').map(s => s.trim()).filter(Boolean)
  if (f.cities.trim()) payload.cities = f.cities.split(',').map(s => s.trim()).filter(Boolean)
  if (f.states.trim()) payload.states = f.states.split(',').map(s => s.trim()).filter(Boolean)
  if (f.has_phone) payload.has_phone = true
  if (f.has_email) payload.has_email = true
  if (f.has_linkedin) payload.has_linkedin = true
  return payload
}

function formatMetricValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value
  return null
}

function extractAnalyticsSummary(analytics: Record<string, unknown> | null | undefined) {
  if (!analytics || typeof analytics !== 'object') return []
  const candidates: Array<[string, unknown]> = [
    ['Sent', analytics.sent_count ?? analytics.sent ?? analytics.total_sent],
    ['Delivered', analytics.delivered_count ?? analytics.delivered ?? analytics.total_delivered],
    ['Opened', analytics.opened_count ?? analytics.opens ?? analytics.open_count],
    ['Replied', analytics.replied_count ?? analytics.replies ?? analytics.reply_count],
    ['Bounced', analytics.bounced_count ?? analytics.bounces ?? analytics.bounce_count],
  ]
  return candidates
    .map(([label, value]) => ({ label, value: formatMetricValue(value) }))
    .filter((entry): entry is { label: string; value: string } => Boolean(entry.value))
}

function formatSendingStatus(sendingStatus: Record<string, unknown> | string | null | undefined) {
  if (!sendingStatus) return null
  if (typeof sendingStatus === 'string') return sendingStatus
  if (typeof sendingStatus !== 'object') return null
  return (
    formatMetricValue(sendingStatus.status)
    || formatMetricValue(sendingStatus.state)
    || formatMetricValue(sendingStatus.sending_status)
    || formatMetricValue(sendingStatus.label)
    || null
  )
}

function formatEmailTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function downloadCSV(leads: Lead[], filename = 'leads.csv') {
  if (!leads.length) return
  const keys = Object.keys(leads[0])
  const rows = [keys.join(','), ...leads.map(l => keys.map(k => JSON.stringify(l[k] ?? '')).join(','))]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function dedupeLeads(leads: Lead[]) {
  const seen = new Set<string>()
  return leads.filter((lead, index) => {
    const key = String(
      lead.email_norm ||
      lead.email ||
      lead.phone_e164 ||
      lead.linkedin_url ||
      `${lead.full_name || 'lead'}-${lead.company || 'company'}-${index}`
    ).toLowerCase()

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function summarizeLeadSource(leads: Lead[]) {
  return {
    total: leads.length,
    emails: leads.filter((lead) => lead.email || lead.email_norm).length,
    phones: leads.filter((lead) => lead.phone_e164).length,
    linkedin: leads.filter((lead) => lead.linkedin_url || lead.has_linkedin).length,
  }
}

function applyLeadFetchPreset(preset?: LeadIntakePreset, mkg?: MkgRecord | null): ICPFilters {
  const next = { ...DEFAULT_ICP }

  if (preset?.leadType === 'buyers') {
    next.seniorities = ['MANAGER', 'DIRECTOR', 'VP', 'C_SUITE']
    next.designation_keywords = 'CEO, Founder, Director, VP, Head'
    next.has_email = true
    next.has_linkedin = true
  } else if (preset?.leadType === 'companies') {
    next.seniorities = ['DIRECTOR', 'VP', 'C_SUITE', 'OWNER', 'PARTNER']
    next.designation_keywords = 'Founder, CEO, Director, VP'
  }

  if (preset?.priority === 'quality') {
    next.quality_min = 4
    next.limit = 300
    next.has_email = true
  } else if (preset?.priority === 'volume') {
    next.quality_min = 2
    next.limit = 1200
  } else if (preset?.priority === 'speed') {
    next.quality_min = 3
    next.limit = 200
  }

  const inferred = inferFiltersFromMkg(mkg || null)
  if (!next.industries.length && inferred.industries.length) next.industries = inferred.industries
  if (!next.seniorities.length && inferred.seniorities.length) next.seniorities = inferred.seniorities
  if (!next.designation_keywords.trim() && inferred.designationKeywords.length) {
    next.designation_keywords = inferred.designationKeywords.map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase())).join(', ')
  }

  if (!preset?.source && inferred.channels.some((channel) => channel.includes('linkedin'))) {
    next.channel = 'linkedin'
    next.has_linkedin = true
  } else if (!preset?.source && inferred.channels.some((channel) => channel.includes('email'))) {
    next.channel = 'email'
    next.has_email = true
  }

  return next
}

function buildRoutingText(leads: Lead[]) {
  return leads
    .map((lead) => [lead.full_name, lead.designation, lead.company, lead.email || lead.email_norm, lead.phone_e164]
      .filter(Boolean)
      .join(', '))
    .join('\n')
}

function buildAgentLeadContext(leads: Lead[]) {
  if (!leads.length) return ''
  const summary = summarizeLeadSource(leads)
  const sample = leads.slice(0, 10).map((lead, index) => (
    `${index + 1}. ${lead.full_name || 'Unknown'} | ${lead.designation || 'Unknown role'} | ${lead.company || 'Unknown company'} | ${lead.email || lead.email_norm || 'no email'} | ${lead.phone_e164 || 'no phone'} | ${lead.linkedin_url || 'no linkedin'}`
  )).join('\n')

  return [
    `Lead set summary: ${summary.total} leads, ${summary.emails} emails, ${summary.phones} phones, ${summary.linkedin} LinkedIn profiles.`,
    'Use this lead set as the basis for your answer. Do not answer generically.',
    'Lead sample:',
    sample,
  ].join('\n')
}

async function readIdentifiersFromFile(file: File) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const firstSheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })

  const values = rows.flatMap((row) =>
    Object.values(row)
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  )

  return Array.from(new Set(values))
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QualityBadge({ q }: { q?: number }) {
  if (q == null) return null
  const map: Record<number, string> = { 5: 'bg-purple-100 text-purple-800', 4: 'bg-blue-100 text-blue-800', 3: 'bg-green-100 text-green-800', 2: 'bg-yellow-100 text-yellow-800', 1: 'bg-gray-100 text-gray-600' }
  const labels: Record<number, string> = { 5: 'Premium', 4: 'High', 3: 'Good', 2: 'Fair', 1: 'Low' }
  return <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', map[q] || map[1])}>{labels[q] || `Q${q}`}</span>
}

function StageActionBar({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string
  description: string
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean }
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  return (
    <div className="sticky top-3 z-10 rounded-2xl border border-orange-200/70 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-orange-900/40 dark:bg-zinc-950/90">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {secondaryAction && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button size="sm" className="h-8 text-xs shadow-sm" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function LeadTable({
  leads,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
}: {
  leads: Lead[]
  selectable?: boolean
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
}) {
  if (!leads.length) return <p className="text-sm text-muted-foreground text-center py-6">No leads to display.</p>
  const visibleLeads = leads.slice(0, 200)
  const keyForLead = (lead: Lead, index: number) => String(
    lead.email_norm ||
    lead.email ||
    lead.phone_e164 ||
    lead.linkedin_url ||
    `${lead.full_name || 'lead'}-${lead.company || 'company'}-${index}`
  ).toLowerCase()
  const visibleKeys = visibleLeads.map((lead, index) => keyForLead(lead, index))
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.includes(key))

  const toggleKey = (key: string) => {
    if (!onSelectionChange) return
    onSelectionChange(selectedKeys.includes(key)
      ? selectedKeys.filter((entry) => entry !== key)
      : [...selectedKeys, key]
    )
  }

  const toggleAllVisible = () => {
    if (!onSelectionChange) return
    if (allVisibleSelected) {
      onSelectionChange(selectedKeys.filter((key) => !visibleKeys.includes(key)))
      return
    }
    onSelectionChange(Array.from(new Set([...selectedKeys, ...visibleKeys])))
  }

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/60">
          <tr>
            {selectable && (
              <th className="px-3 py-2 text-left">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
              </th>
            )}
            {['Name', 'Designation', 'Company', 'City', 'Industry', 'Seniority', 'Phone', 'Email', 'LinkedIn', 'Quality'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleLeads.map((l, i) => {
            const leadKey = keyForLead(l, i)
            return (
            <tr key={i} className="border-t hover:bg-muted/30">
              {selectable && (
                <td className="px-3 py-2 align-top">
                  <Checkbox checked={selectedKeys.includes(leadKey)} onCheckedChange={() => toggleKey(leadKey)} />
                </td>
              )}
              <td className="px-3 py-2 font-medium whitespace-nowrap max-w-[140px] truncate">{l.full_name || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[120px] truncate">{l.designation || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[120px] truncate">{l.company || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.city || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.icp_industry || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.seniority || '—'}</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">{l.phone_e164 ? '✓' : '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[140px] truncate">{l.email || l.email_norm || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.has_linkedin ? '✓' : '—'}</td>
              <td className="px-3 py-2"><QualityBadge q={l.quality as number} /></td>
            </tr>
          )})}
        </tbody>
      </table>
      {leads.length > 200 && (
        <p className="text-xs text-muted-foreground text-center py-2 border-t">Showing 200 of {leads.length} leads</p>
      )}
    </div>
  )
}

// ── Tab: ICP Builder + Fetch Leads ────────────────────────────────────────────

function ICPFetchTab({
  companyId,
  hasApolloConnected,
  mkg,
  onAdoptLeads,
  onNavigate,
  preset,
}: {
  companyId: string
  hasApolloConnected: boolean
  mkg: MkgRecord | null
  onAdoptLeads: (leads: Lead[], source: string, stage: WorkflowStageKey) => void
  onNavigate: (tab: LeadTabKey) => void
  preset?: LeadIntakePreset
}) {
  const [filters, setFilters] = useState<ICPFilters>(() => applyLeadFetchPreset(preset, mkg))
  const [sizeResult, setSizeResult] = useState<SizeResult | null>(null)
  const [sizing, setSizing] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [result, setResult] = useState<FetchResult | null>(null)
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<string[]>([])
  const sourceStrategy = deriveLeadSourceStrategy({ preset, filters, hasApolloConnected })

  useEffect(() => {
    setFilters(applyLeadFetchPreset(preset, mkg))
  }, [preset?.leadType, preset?.priority, preset?.source, mkg])

  const set = (k: keyof ICPFilters, v: unknown) => setFilters(p => ({ ...p, [k]: v }))

  const toggleIndustry = (ind: string) =>
    set('industries', filters.industries.includes(ind)
      ? filters.industries.filter(i => i !== ind)
      : [...filters.industries, ind])

  const toggleSeniority = (s: string) =>
    set('seniorities', filters.seniorities.includes(s)
      ? filters.seniorities.filter(x => x !== s)
      : [...filters.seniorities, s])

  const handleSize = async () => {
    setSizing(true); setSizeResult(null)
    try {
      const data = await apiLeads('/icp-size', buildFetchPayload(filters))
      setSizeResult(data)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Size estimate failed')
    } finally { setSizing(false) }
  }

  const handleFetch = async () => {
    setFetching(true); setResult(null)
    try {
      const needsLinkedInLeads = sourceStrategy.mode === 'linkedin_apollo'
      const shouldUseApollo = hasApolloConnected && sourceStrategy.mode === 'linkedin_apollo'
      if (needsLinkedInLeads && !shouldUseApollo) {
        toast.error('Connect Apollo to fetch LinkedIn-ready leads. The internal leads database does not include LinkedIn prospects.')
        return
      }

      if (needsLinkedInLeads && shouldUseApollo) {
        const apolloData = await apiAutomation('apollo_find_leads', {
          country: filters.country,
          industries: filters.industries,
          seniorities: filters.seniorities,
          designation_keywords: filters.designation_keywords,
          cities: filters.cities,
          states: filters.states,
          limit: filters.limit,
        }, companyId)

        if (apolloData?.status === 'completed' && Array.isArray(apolloData?.leads) && apolloData.leads.length > 0) {
          const apolloLeads = apolloData.leads as Lead[]
          if (needsLinkedInLeads) {
            const linkedinReadyLeads = apolloLeads.filter((lead) => Boolean(lead.full_name && lead.linkedin_url))
            if (apolloData.source !== 'apollo_people_search' || linkedinReadyLeads.length === 0) {
              toast.error('Apollo did not return LinkedIn-ready people. Internal DB fallback was skipped because it does not include LinkedIn prospects.')
              return
            }
          }

          const sourceLabel = apolloData.source === 'apollo_people_search' ? 'Apollo people search' : 'Apollo account search'
          const nextResult: FetchResult = {
            count: Number(apolloData.count || apolloLeads.length),
            table_used: sourceLabel,
            leads: apolloLeads,
          }
          setResult(nextResult)
          setSelectedLeadKeys([])
          onAdoptLeads(nextResult.leads, `Fetched from ${sourceLabel}`, 'fetch')
          toast.success(`Fetched ${nextResult.count.toLocaleString()} leads from ${sourceLabel}`)
          return
        }

        if (apolloData?.status === 'error') {
          if (needsLinkedInLeads) {
            toast.error('Apollo search could not complete. Internal DB fallback was skipped because it does not include LinkedIn prospects.')
            return
          }
          toast.info('Apollo search could not complete. Falling back to leads database.')
        } else {
          if (needsLinkedInLeads) {
            toast.error('Apollo returned no LinkedIn-ready leads. Internal DB fallback was skipped because it does not include LinkedIn prospects.')
            return
          }
          toast.info('Apollo returned no matching leads. Falling back to leads database.')
        }
      }

      const data: FetchResult = await apiLeads('/fetch', buildFetchPayload(filters))
      setResult(data)
      setSelectedLeadKeys([])
      onAdoptLeads(data.leads, `Fetched from ${data.table_used}`, 'fetch')
      toast.success(`Fetched ${data.count.toLocaleString()} leads from ${data.table_used}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Fetch failed')
    } finally { setFetching(false) }
  }

  const selectedLeads = result?.leads.filter((lead, index) => {
    const key = String(lead.email_norm || lead.email || lead.phone_e164 || lead.linkedin_url || `${lead.full_name || 'lead'}-${lead.company || 'company'}-${index}`).toLowerCase()
    return selectedLeadKeys.includes(key)
  }) || []

  return (
    <div className="space-y-4">
      <StageActionBar
        title="Stage 1: Build your lead set"
        description="Start broad, size the market, then fetch a working set you can enrich, route, or hand to AI copilots."
        primaryAction={{ label: fetching ? 'Fetching…' : 'Fetch Leads', onClick: handleFetch, disabled: fetching }}
        secondaryAction={{ label: sizing ? 'Sizing…' : 'Estimate Market Size', onClick: handleSize, disabled: sizing }}
      />
      {(preset?.leadType || preset?.priority) && (
        <div className="rounded-xl border border-orange-200/70 bg-orange-50/70 px-4 py-3 text-xs text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
          Veena preconfigured this lead search for
          {preset?.leadType ? ` ${preset.leadType === 'buyers' ? 'decision-makers' : preset.leadType === 'companies' ? 'ICP-fit accounts' : 'your existing list'}` : ''}
          {preset?.leadType && preset?.priority ? ' and ' : ''}
          {preset?.priority ? ` ${preset.priority === 'quality' ? 'higher lead quality' : preset.priority === 'volume' ? 'more lead volume' : 'faster lead discovery'}` : ''}.
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Filters Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-orange-500" />ICP Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">

              {/* Country */}
              <div className="space-y-1.5">
                <Label className="text-xs">Country</Label>
                <Select value={filters.country} onValueChange={v => set('country', v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">India</SelectItem>
                    <SelectItem value="US">USA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Channel */}
              <div className="space-y-1.5">
                <Label className="text-xs">Outreach Channel</Label>
                <Select value={filters.channel} onValueChange={v => set('channel', v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Industries */}
              <div className="space-y-1.5">
                <Label className="text-xs">Industries</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center justify-between h-8 px-3 rounded-md border border-input bg-background text-xs hover:bg-accent transition-colors">
                      <span className="truncate text-left">
                        {filters.industries.length === 0
                          ? 'All industries'
                          : filters.industries.length === 1
                            ? filters.industries[0].replace(/_/g, ' ')
                            : `${filters.industries.length} selected`}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-1" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-2 max-h-64 overflow-y-auto" align="start">
                    {INDUSTRIES.map(ind => (
                      <div
                        key={ind}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                        onClick={() => toggleIndustry(ind)}
                      >
                        <Checkbox checked={filters.industries.includes(ind)} onCheckedChange={() => toggleIndustry(ind)} />
                        <span className="text-xs">{ind.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Seniority */}
              <div className="space-y-1.5">
                <Label className="text-xs">Seniority</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center justify-between h-8 px-3 rounded-md border border-input bg-background text-xs hover:bg-accent transition-colors">
                      <span className="truncate text-left">
                        {filters.seniorities.length === 0
                          ? 'All levels'
                          : filters.seniorities.length === 1
                            ? filters.seniorities[0].replace(/_/g, ' ')
                            : `${filters.seniorities.length} selected`}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-1" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2 max-h-56 overflow-y-auto" align="start">
                    {SENIORITIES.map(s => (
                      <div
                        key={s}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                        onClick={() => toggleSeniority(s)}
                      >
                        <Checkbox checked={filters.seniorities.includes(s)} onCheckedChange={() => toggleSeniority(s)} />
                        <span className="text-xs">{s.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Keywords */}
              <div className="space-y-1.5">
                <Label className="text-xs">Designation Keywords (comma-sep)</Label>
                <Input className="h-8 text-xs" placeholder="CEO, Founder, Director" value={filters.designation_keywords} onChange={e => set('designation_keywords', e.target.value)} />
              </div>

              {/* Geo */}
              <div className="space-y-1.5">
                <Label className="text-xs">Cities (comma-sep)</Label>
                <Input className="h-8 text-xs" placeholder="Mumbai, Delhi, Bangalore" value={filters.cities} onChange={e => set('cities', e.target.value)} />
              </div>

              {/* Quality */}
              <div className="space-y-2">
                <Label className="text-xs">Min Quality: <span className="font-semibold">{filters.quality_min}</span></Label>
                <Slider min={1} max={5} step={1} value={[filters.quality_min]} onValueChange={([v]) => set('quality_min', v)} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 (Broad)</span><span>5 (Premium)</span>
                </div>
              </div>

              {/* Contact flags */}
              <div className="space-y-2">
                <Label className="text-xs">Must Have</Label>
                <div className="flex items-center gap-4">
                  {[['has_email', 'Email'], ['has_phone', 'Phone'], ['has_linkedin', 'LinkedIn']].map(([k, label]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <Checkbox id={k} checked={filters[k as keyof ICPFilters] as boolean} onCheckedChange={v => set(k as keyof ICPFilters, v)} />
                      <label htmlFor={k} className="text-xs cursor-pointer">{label}</label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Limit */}
              <div className="space-y-1.5">
                <Label className="text-xs">Max Leads: <span className="font-semibold">{filters.limit.toLocaleString()}</span></Label>
                <Slider min={100} max={5000} step={100} value={[filters.limit]} onValueChange={([v]) => set('limit', v)} />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={handleSize} disabled={sizing}>
                  {sizing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                  Estimate Size
                </Button>
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleFetch} disabled={fetching}>
                  {fetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
                  Fetch Leads
                </Button>
              </div>

              {sizeResult && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 text-xs">
                  <div className="font-medium text-blue-800 dark:text-blue-200">
                    ~{sizeResult.estimated_count.toLocaleString()} leads match
                  </div>
                  <div className="text-blue-600 dark:text-blue-300 mt-0.5">Table: {sizeResult.table}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-3">
          {result ? (
            <Card className="border-emerald-200/70 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-green-500" />
                    {result.count.toLocaleString()} Leads — {result.table_used}
                  </CardTitle>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadCSV(result.leads, 'icp-leads.csv')}>
                    <Download className="h-3 w-3 mr-1" />CSV
                  </Button>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {result.leads.filter(l => l.email || l.email_norm).length} emails</span>
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {result.leads.filter(l => l.phone_e164).length} phones</span>
                  <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> {result.leads.filter(l => l.has_linkedin).length} LinkedIn</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-8 text-xs shadow-sm" onClick={() => onNavigate('enrich')}>
                    Next: Enrich Contacts
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onNavigate('route')}>
                    Skip to Channel Routing
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {selectedLeads.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-orange-200/70 bg-orange-50/70 p-3 text-xs dark:border-orange-900/40 dark:bg-orange-950/20">
                    <span className="font-medium">{selectedLeads.length} selected</span>
                    <Button size="sm" className="h-8 text-xs shadow-sm" onClick={() => {
                      onAdoptLeads(selectedLeads, 'Selected leads from fetch', 'fetch')
                      onNavigate('route')
                    }}>
                      Route Selected
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                      onAdoptLeads(selectedLeads, 'Selected leads from fetch', 'fetch')
                      onNavigate('outreach')
                    }}>
                      Send Selected to Outreach
                    </Button>
                  </div>
                )}
                <LeadTable leads={result.leads} selectable selectedKeys={selectedLeadKeys} onSelectionChange={setSelectedLeadKeys} />
              </CardContent>
            </Card>
          ) : (
            <Card className="flex min-h-[300px] items-center justify-center border-dashed border-border/70 bg-muted/20">
              <div className="text-center space-y-2 text-muted-foreground">
                <Database className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">Choose your ICP filters, then fetch a lead set to start the workflow.</p>
                <p className="text-xs max-w-sm mx-auto">Your fetched leads will automatically carry into Enrich, Routing, Outreach, and AI Copilots.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Upload + Enrich ──────────────────────────────────────────────────────

function EnrichTab({
  companyId,
  sharedLeads,
  sharedLeadSource,
  onAdoptLeads,
  onNavigate,
  preset,
}: {
  companyId: string
  sharedLeads: Lead[]
  sharedLeadSource: string
  onAdoptLeads: (leads: Lead[], source: string, stage: WorkflowStageKey) => void
  onNavigate: (tab: LeadTabKey) => void
  preset?: LeadIntakePreset
}) {
  const [file, setFile] = useState<File | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [result, setResult] = useState<EnrichResult | null>(null)
  const [enrichMode, setEnrichMode] = useState<'phone' | 'email'>(() =>
    preset?.missingFields === 'contact' || preset?.missingFields === 'both' ? 'email' : 'phone'
  )
  const [pastedData, setPastedData] = useState('')
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<string[]>([])

  useEffect(() => {
    setEnrichMode(preset?.missingFields === 'contact' || preset?.missingFields === 'both' ? 'email' : 'phone')
  }, [preset?.missingFields])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    try {
      const values = await readIdentifiersFromFile(f)
      setPastedData(values.join('\n'))
      toast.success(`${f.name} loaded with ${values.length} values`)
    } catch {
      toast.error('Could not read file')
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    setFile(f)
    try {
      const values = await readIdentifiersFromFile(f)
      setPastedData(values.join('\n'))
      toast.success(`${f.name} loaded with ${values.length} values`)
    } catch {
      toast.error('Could not read file')
    }
  }

  const hydrateFromSharedLeads = () => {
    const values = sharedLeads
      .map((lead) => enrichMode === 'phone' ? lead.phone_e164 : lead.email || lead.email_norm)
      .filter((value): value is string => Boolean(value))
    setPastedData(Array.from(new Set(values)).join('\n'))
    toast.success(`Loaded ${values.length} ${enrichMode === 'phone' ? 'phones' : 'emails'} from current lead set`)
  }

  const handleEnrich = async () => {
    const values = pastedData
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 1000)

    if (!values.length) {
      toast.error('Paste phone numbers or emails to enrich')
      return
    }

    setEnriching(true); setResult(null)
    try {
      const payload = enrichMode === 'phone' ? { phones: values } : { emails: values }
      const data: EnrichResult = await apiLeads('/enrich/bulk', payload)
      setResult(data)
      setSelectedLeadKeys([])
      if (data.data.length > 0) {
        onAdoptLeads(data.data, `Enriched from ${sharedLeadSource || 'manual input'}`, 'enrich')
      }

      if (data.matched === 0) {
        // Fallback to Apollo
        toast.info(`Not found in leads DB (${data.unmatched} unmatched) — trying Apollo fallback…`)
        try {
          const apolloRes = await apiAutomation('apollo_lead_enrich', {
            [enrichMode === 'email' ? 'email' : 'phone']: values[0],
          }, companyId)
          toast.success(`Apollo enriched: ${apolloRes?.person?.name || 'record found'}`)
        } catch {
          toast.warning('Apollo fallback also returned no results')
        }
      } else {
        toast.success(`Enriched ${data.matched} / ${values.length} records from leads DB`)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Enrichment failed')
    } finally { setEnriching(false) }
  }

  const selectedLeads = result?.data.filter((lead, index) => {
    const key = String(lead.email_norm || lead.email || lead.phone_e164 || lead.linkedin_url || `${lead.full_name || 'lead'}-${lead.company || 'company'}-${index}`).toLowerCase()
    return selectedLeadKeys.includes(key)
  }) || []

  return (
    <div className="space-y-4">
      <StageActionBar
        title="Stage 2: Fill contact gaps"
        description={
          preset?.source === 'crm'
            ? 'Start from CRM records or paste/import identifiers to enrich contacts before routing or outreach.'
            : 'Use your current lead set, a spreadsheet, or pasted identifiers to enrich contacts before routing or outreach.'
        }
        primaryAction={{ label: enriching ? 'Enriching…' : 'Run Enrichment', onClick: handleEnrich, disabled: enriching }}
        secondaryAction={sharedLeads.length > 0 ? { label: `Use ${sharedLeads.length} Current Leads`, onClick: hydrateFromSharedLeads } : undefined}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4 text-blue-500" />Upload or Paste Leads</CardTitle>
            <CardDescription className="text-xs">Bring in contact identifiers from your current lead set, a file, or pasted values.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sharedLeads.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                Ready to enrich: {sharedLeads.length} leads from {sharedLeadSource || 'the current workflow'}.
                <div className="mt-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={hydrateFromSharedLeads}>
                    Pull Identifiers from Current Leads
                  </Button>
                </div>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-2">
              {(['phone', 'email'] as const).map(m => (
                <button key={m} onClick={() => setEnrichMode(m)}
                  className={cn('flex-1 text-xs py-1.5 rounded border transition-colors capitalize',
                    enrichMode === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary')}>
                  {m === 'phone' ? <Phone className="h-3 w-3 inline mr-1" /> : <Mail className="h-3 w-3 inline mr-1" />}{m}
                </button>
              ))}
            </div>

            {/* File drop */}
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
              onDragOver={e => e.preventDefault()} onDrop={handleDrop}
              onClick={() => document.getElementById('enrich-file')?.click()}
            >
              <FileSpreadsheet className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">{file ? file.name : 'Drop CSV/Excel or click to browse'}</p>
              <input id="enrich-file" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>

            {/* Paste */}
            <div className="space-y-1">
              <Label className="text-xs">Or paste {enrichMode === 'phone' ? 'phone numbers' : 'emails'} (one per line)</Label>
              <textarea
                className="w-full text-xs border rounded p-2 h-28 resize-none bg-background font-mono"
                placeholder={enrichMode === 'phone' ? '+919876543210\n+918765432109' : 'ceo@company.com\ncto@startup.in'}
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{pastedData.split(/[\n,]/).filter(s => s.trim()).length} entries</p>
            </div>

            <Button className="h-9 w-full text-xs shadow-sm" onClick={handleEnrich} disabled={enriching}>
              {enriching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
              Enrich — Leads DB → Apollo Fallback
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" />Enrichment Results</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Matched', value: result.matched, color: 'text-green-600' },
                    { label: 'Unmatched', value: result.unmatched, color: 'text-red-500' },
                  ].map(s => (
                    <div key={s.label} className="p-3 bg-muted/40 rounded text-center">
                      <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
                {result.data.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => downloadCSV(result.data, 'enriched.csv')}>
                      <Download className="h-3 w-3 mr-1" />Download Enriched CSV
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="h-8 text-xs shadow-sm" onClick={() => onNavigate('route')}>
                        Next: Route by Channel
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onNavigate('outreach')}>
                        Send to Outreach
                      </Button>
                    </div>
                    {selectedLeads.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200/70 bg-orange-50/70 p-3 text-xs dark:border-orange-900/40 dark:bg-orange-950/20">
                        <span className="font-medium">{selectedLeads.length} selected</span>
                        <Button size="sm" className="h-8 text-xs shadow-sm" onClick={() => {
                          onAdoptLeads(selectedLeads, 'Selected leads from enrich', 'enrich')
                          onNavigate('route')
                        }}>
                          Route Selected
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                          onAdoptLeads(selectedLeads, 'Selected leads from enrich', 'enrich')
                          onNavigate('outreach')
                        }}>
                          Outreach Selected
                        </Button>
                      </div>
                    )}
                    <LeadTable leads={result.data} selectable selectedKeys={selectedLeadKeys} onSelectionChange={setSelectedLeadKeys} />
                  </>
                )}
                {result.unmatched_list.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Unmatched (first 10):</p>
                    <div className="font-mono space-y-0.5">{result.unmatched_list.slice(0, 10).map((u, i) => <div key={i}>{u}</div>)}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-center text-muted-foreground">
                <div>
                  <Brain className="h-8 w-8 mx-auto opacity-30 mb-2" />
                  <p className="text-xs">Add emails or phone numbers, then run enrichment to build a cleaner working lead set.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Tab: Outreach Setup ───────────────────────────────────────────────────────

function OutreachTab({
  companyId,
  workspaceName,
  sharedLeads,
  sharedLeadSource,
  aiOutreachDraft,
  mkg,
  preferredChannel,
  integrations,
  onStageComplete,
}: {
  companyId: string
  workspaceName: string
  sharedLeads: Lead[]
  sharedLeadSource: string
  aiOutreachDraft: string
  mkg: MkgRecord | null
  preferredChannel: OutreachChannel
  integrations: IntegrationStatus[]
  onStageComplete: (stage: WorkflowStageKey) => void
}) {
  const [channel, setChannel] = useState<OutreachChannel>(preferredChannel)
  const [linkedinProvider, setLinkedinProvider] = useState<'heyreach' | 'lemlist'>('heyreach')
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsJson, setLeadsJson] = useState('')
  const [launching, setLaunching] = useState(false)
  const [monitoringInstantly, setMonitoringInstantly] = useState(false)
  const [updatingInstantly, setUpdatingInstantly] = useState(false)
  const [monitoringLinkedin, setMonitoringLinkedin] = useState(false)
  const [updatingLemlist, setUpdatingLemlist] = useState(false)
  const [result, setResult] = useState<OutreachResult | null>(null)
  const [offerName, setOfferName] = useState('')
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null)
  const [copyApproved, setCopyApproved] = useState(false)
  const [draftSource, setDraftSource] = useState<'sam' | 'ai-copilot' | 'manual' | null>(null)
  const samDraftRun = useAgentRun(undefined, companyId ? `lead-intel-outreach-draft-${companyId}` : undefined)

  // Email campaign config
  const [campaignName, setCampaignName] = useState('Marqq ICP Outreach')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [dailyLimit, setDailyLimit] = useState(50)

  useEffect(() => {
    if (sharedLeads.length > 0 && leads.length === 0) {
      setLeads(sharedLeads)
    }
  }, [sharedLeads, leads.length])

  useEffect(() => {
    setChannel(preferredChannel)
  }, [preferredChannel])

  useEffect(() => {
    const hasLemlist = integrations.some((connector) => connector.id === 'lemlist' && connector.connected)
    const hasHeyreach = integrations.some((connector) => connector.id === 'heyreach' && connector.connected)
    if (hasLemlist) setLinkedinProvider('lemlist')
    else if (hasHeyreach) setLinkedinProvider('heyreach')
  }, [integrations])

  useEffect(() => {
    if (aiOutreachDraft && !body.trim()) {
      const parsed = parseDraftResponse(channel, aiOutreachDraft)
      if (parsed.subject) setSubject(parsed.subject)
      setBody(parsed.body)
      setDraftSource('ai-copilot')
      setCopyApproved(false)
    }
  }, [aiOutreachDraft, body, channel])

  useEffect(() => {
    setCopyApproved(false)
  }, [channel])

  const useCurrentLeadSet = () => {
    setLeads(sharedLeads)
    setLeadsJson(JSON.stringify(sharedLeads, null, 2))
    setCopyApproved(false)
    toast.success(`Loaded ${sharedLeads.length} leads from current workflow`)
  }

  const parseLeads = () => {
    try {
      const parsed = JSON.parse(leadsJson)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      setLeads(arr)
      setCopyApproved(false)
      toast.success(`Loaded ${arr.length} leads`)
    } catch {
      // try CSV
      const rows = leadsJson.trim().split('\n')
      const headers = rows[0].split(',').map(h => h.trim())
      const parsed = rows.slice(1).map(row => {
        const vals = row.split(',')
        return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim()]))
      })
      setLeads(parsed)
      setCopyApproved(false)
      toast.success(`Parsed ${parsed.length} leads from CSV`)
    }
  }

  const requiresSubject = channel === 'email'
  const isCopyReady = Boolean(body.trim()) && (!requiresSubject || Boolean(subject.trim()))

  const handleGenerateDraft = async () => {
    if (!leads.length) {
      toast.error('Load leads before generating outreach copy')
      return
    }

    await samDraftRun.run(
      'sam',
      buildDraftPrompt({
        channel,
        leads,
        offerName: selectedOffer?.name || offerName,
        mkg,
        companyName: workspaceName,
      }),
      'proposal_draft',
      companyId || undefined,
      selectedOffer,
    )
  }

  useEffect(() => {
    if (!samDraftRun.text.trim()) return
    const parsed = parseDraftResponse(channel, samDraftRun.text)
    if (parsed.subject) setSubject(parsed.subject)
    setBody(parsed.body)
    setDraftSource('sam')
    setCopyApproved(false)
  }, [samDraftRun.text, channel])

  const handleEmailOutreach = async () => {
    if (!leads.length) { toast.error('Use the current lead set or import leads before launching outreach'); return }
    if (!subject || !body) { toast.error('Subject and body required'); return }
    if (!copyApproved) { toast.error('Approve the offer copy before launch'); return }

    setLaunching(true); setResult(null)
    try {
      // Create campaign via Instantly (Composio)
      const res = await apiAutomation('instantly_create_campaign', {
        name: campaignName,
        subject,
        body,
        from_email: senderEmail,
        daily_limit: dailyLimit,
        leads: leads.slice(0, 500).map(l => ({
          email: l.email || l.email_norm,
          first_name: l.full_name?.split(' ')[0] || '',
          last_name: l.full_name?.split(' ').slice(1).join(' ') || '',
          company_name: l.company || '',
          personalization: `${l.designation || ''} at ${l.company || ''} in ${l.city || ''}`.trim(),
        })).filter(l => l.email),
      }, companyId)

      setResult({ ...res, leads_added: leads.length })
      onStageComplete('outreach')
      toast.success('Email campaign created in Instantly!')
      if ((res as OutreachResult)?.campaign_id) {
        void handleRefreshInstantlyMonitor((res as OutreachResult).campaign_id, (res as OutreachResult).campaign_name || campaignName)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Launch failed'
      setResult({ status: 'error', error: msg })
      toast.error(msg)
    } finally { setLaunching(false) }
  }

  const handleRefreshInstantlyMonitor = async (campaignIdOverride?: string, campaignNameOverride?: string) => {
    const targetCampaignId = campaignIdOverride || result?.campaign_id
    const targetCampaignName = campaignNameOverride || result?.campaign_name || campaignName
    if (!companyId || !targetCampaignId) return

    setMonitoringInstantly(true)
    try {
      const [statusRes, analyticsRes, campaignsRes, unreadRes, emailsRes] = await Promise.all([
        apiAutomation('instantly_get_campaign_status', { campaign_id: targetCampaignId }, companyId),
        apiAutomation('instantly_get_campaign_analytics', { campaign_id: targetCampaignId }, companyId),
        apiAutomation('instantly_list_campaigns', { limit: 10, search: targetCampaignName }, companyId),
        apiAutomation('instantly_count_unread_emails', {}, companyId),
        apiAutomation('instantly_list_emails', { campaign_id: targetCampaignId, limit: 5 }, companyId),
      ])

      setResult((current) => {
        if (!current) return current
        return {
          ...current,
          sending_status: (statusRes as OutreachResult)?.sending_status ?? null,
          analytics: (analyticsRes as OutreachResult)?.analytics ?? null,
          campaigns: Array.isArray((campaignsRes as OutreachResult)?.campaigns) ? (campaignsRes as OutreachResult).campaigns : [],
          unread_count: (unreadRes as OutreachResult)?.unread_count ?? null,
          emails: Array.isArray((emailsRes as OutreachResult)?.emails) ? (emailsRes as OutreachResult).emails : [],
        }
      })
      toast.success('Instantly campaign status refreshed')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not refresh Instantly status'
      toast.error(msg)
    } finally {
      setMonitoringInstantly(false)
    }
  }

  const handleInstantlyAction = async (action: 'pause' | 'activate') => {
    const targetCampaignId = result?.campaign_id
    if (!companyId || !targetCampaignId) return

    setUpdatingInstantly(true)
    try {
      const automationId = action === 'pause' ? 'instantly_pause_campaign' : 'instantly_activate_campaign'
      await apiAutomation(automationId, { campaign_id: targetCampaignId }, companyId)
      await handleRefreshInstantlyMonitor(targetCampaignId, result?.campaign_name || campaignName)
      toast.success(action === 'pause' ? 'Instantly campaign paused' : 'Instantly campaign activated')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Could not ${action} campaign`
      toast.error(msg)
    } finally {
      setUpdatingInstantly(false)
    }
  }

  const handleRefreshLinkedinMonitor = async () => {
    if (!companyId) return

    setMonitoringLinkedin(true)
    try {
      if (linkedinProvider === 'heyreach') {
        const [campaignsRes, conversationsRes] = await Promise.all([
          apiAutomation('heyreach_list_campaigns', { limit: 10, keyword: result?.campaign_name || campaignName }, companyId),
          apiAutomation('heyreach_list_conversations', { campaign_id: result?.campaign_id, limit: 5 }, companyId),
        ])
        setResult((current) => current ? {
          ...current,
          campaigns: Array.isArray((campaignsRes as OutreachResult)?.campaigns) ? (campaignsRes as OutreachResult).campaigns : [],
          conversations: Array.isArray((conversationsRes as OutreachResult as { conversations?: Array<Record<string, unknown>> })?.conversations)
            ? (conversationsRes as OutreachResult as { conversations?: Array<Record<string, unknown>> }).conversations
            : [],
        } : current)
      } else {
        const [campaignsRes, statsRes, creditsRes] = await Promise.all([
          apiAutomation('lemlist_list_campaigns', { limit: 10 }, companyId),
          result?.campaign_id ? apiAutomation('lemlist_get_campaign_stats', { campaign_id: result.campaign_id }, companyId) : Promise.resolve({ analytics: null }),
          apiAutomation('lemlist_get_team_credits', {}, companyId),
        ])
        setResult((current) => current ? {
          ...current,
          campaigns: Array.isArray((campaignsRes as OutreachResult)?.campaigns) ? (campaignsRes as OutreachResult).campaigns : [],
          analytics: (statsRes as OutreachResult)?.analytics ?? current.analytics ?? null,
          credits_remaining: (creditsRes as OutreachResult)?.credits_remaining ?? null,
        } : current)
      }
      toast.success(`${linkedinProvider === 'heyreach' ? 'HeyReach' : 'Lemlist'} status refreshed`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not refresh LinkedIn status'
      toast.error(msg)
    } finally {
      setMonitoringLinkedin(false)
    }
  }

  const handleLemlistPause = async () => {
    if (!companyId || !result?.campaign_id) return
    setUpdatingLemlist(true)
    try {
      await apiAutomation('lemlist_pause_campaign', { campaign_id: result.campaign_id }, companyId)
      await handleRefreshLinkedinMonitor()
      toast.success('Lemlist campaign paused')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not pause Lemlist campaign'
      toast.error(msg)
    } finally {
      setUpdatingLemlist(false)
    }
  }

  const handleLinkedInOutreach = async () => {
    if (!leads.length) { toast.error('Use the current lead set or import leads before launching outreach'); return }
    if (!body.trim()) { toast.error('Message required'); return }
    if (!copyApproved) { toast.error('Approve the offer copy before launch'); return }
    setLaunching(true); setResult(null)
    try {
      const linkedinLeads = leads.slice(0, 100).map(l => ({
        linkedin_url: l.linkedin_url,
        email: l.email || l.email_norm,
        first_name: l.full_name?.split(' ')[0] || '',
        last_name: l.full_name?.split(' ').slice(1).join(' ') || '',
        company: l.company || '',
        personalization: `${l.designation || ''} at ${l.company || ''}`.trim(),
      }))

      const res = linkedinProvider === 'lemlist'
        ? await apiAutomation('lemlist_linkedin_campaign', {
            campaign_name: campaignName,
            leads: linkedinLeads.filter(l => l.email),
            linkedin_message: body || 'Hi {{first_name}}, I noticed your work at {{company}} — would love to connect!',
            email_subject: subject || 'Quick question, {{first_name}}',
            email_body: body || 'Hi {{first_name}}, I noticed your work at {{company}} — would love to connect!',
          }, companyId)
        : await apiAutomation('heyreach_linkedin_campaign', {
            campaign_name: campaignName,
            leads: linkedinLeads.filter(l => l.linkedin_url),
            message_template: body || 'Hi {{first_name}}, I noticed your work at {{company}} — would love to connect!',
          }, companyId)
      setResult(res)
      onStageComplete('outreach')
      toast.success(`LinkedIn campaign created in ${linkedinProvider === 'lemlist' ? 'Lemlist' : 'HeyReach'}!`)
      void handleRefreshLinkedinMonitor()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Launch failed'
      setResult({ status: 'error', error: msg })
      toast.error(msg)
    } finally { setLaunching(false) }
  }

  const handleVoicebotOutreach = async () => {
    if (!leads.length) { toast.error('Use the current lead set or import leads before launching outreach'); return }
    if (!body.trim()) { toast.error('Call opening line required'); return }
    if (!copyApproved) { toast.error('Approve the offer copy before launch'); return }

    setLaunching(true); setResult(null)
    try {
      const res = await apiAutomation('voicebot_campaign_launch', {
        campaign_name: campaignName,
        script_hint: body,
        leads: leads.slice(0, 100).map(l => ({
          phone: l.phone_e164,
          name: l.full_name,
          company: l.company,
          email: l.email || l.email_norm,
        })).filter(l => l.phone),
      }, companyId)
      setResult(res)
      onStageComplete('outreach')
      toast.success('Voicebot campaign queued!')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Launch failed'
      setResult({ status: 'error', error: msg })
      toast.error(msg)
    } finally { setLaunching(false) }
  }

  const handleWhatsAppOutreach = async () => {
    if (!leads.length) { toast.error('Use the current lead set or import leads before launching outreach'); return }
    if (!body.trim()) { toast.error('Message required'); return }
    if (!copyApproved) { toast.error('Approve the offer copy before launch'); return }

    setLaunching(true); setResult(null)
    try {
      const res = await apiAutomation('whatsapp_send_campaign', {
        campaign_name: campaignName,
        text: body,
        leads: leads.slice(0, 200).map(l => ({
          phone: l.phone_e164,
          full_name: l.full_name || '',
          first_name: l.full_name?.split(' ')[0] || '',
          last_name: l.full_name?.split(' ').slice(1).join(' ') || '',
          company: l.company || '',
        })).filter(l => l.phone),
      }, companyId)
      setResult(res)
      onStageComplete('outreach')
      toast.success('WhatsApp outreach sent!')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Launch failed'
      setResult({ status: 'error', error: msg })
      toast.error(msg)
    } finally { setLaunching(false) }
  }

  const handleLaunch = () => {
    if (channel === 'email') handleEmailOutreach()
    else if (channel === 'linkedin') handleLinkedInOutreach()
    else if (channel === 'voicebot') handleVoicebotOutreach()
    else handleWhatsAppOutreach()
  }

  return (
    <div className="space-y-4">
      <StageActionBar
        title="Stage 4: Launch outreach"
        description="Create the offer copy, approve it, then launch the active channel with the current lead set."
        secondaryAction={sharedLeads.length > 0 ? {
          label: 'Use Current Lead Set',
          onClick: useCurrentLeadSet,
        } : undefined}
        primaryAction={{
          label: channel === 'email' ? 'Launch Email Campaign' : channel === 'linkedin' ? 'Launch LinkedIn Campaign' : channel === 'voicebot' ? 'Launch Voicebot Campaign' : 'Launch WhatsApp Outreach',
          onClick: handleLaunch,
          disabled: launching || !leads.length || !copyApproved || !isCopyReady,
        }}
      />
      {/* Channel selector */}
      <div className="flex gap-2">
        {([
          { id: 'email', label: 'Email via Instantly', icon: Mail },
          { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
          { id: 'voicebot', label: 'AI Voice Bot', icon: Phone },
          { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
        ] as const).map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors',
              channel === c.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary')}>
            <c.icon className="h-4 w-4" />{c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads Input */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" />Load Leads</CardTitle>
            <CardDescription className="text-xs">Start with the workflow lead set. Paste JSON or CSV only when you need to bring in a separate list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sharedLeads.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                Outreach-ready lead set: {sharedLeads.length} leads from {sharedLeadSource || 'the current workflow'}.
                <div className="mt-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={useCurrentLeadSet}>
                    Load Current Lead Set
                  </Button>
                </div>
              </div>
            )}
            <textarea
              className="w-full text-xs border rounded p-2 h-40 resize-none bg-background font-mono"
              placeholder={'[{"full_name":"Rahul Sharma","email":"rahul@co.in","company":"Acme"}]'}
              value={leadsJson}
              onChange={e => setLeadsJson(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={parseLeads}>
              Parse {leadsJson.split('\n').length} lines
            </Button>
            {leads.length > 0 && (
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 text-xs">
                ✓ {leads.length} leads loaded — {leads.filter(l => l.email || l.email_norm).length} emails, {leads.filter(l => l.phone_e164).length} phones, {leads.filter(l => l.linkedin_url).length} LinkedIn
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaign Config */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-orange-500" />Campaign Config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900/30 dark:bg-orange-950/20">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Offer copy approval</div>
                  <p className="text-xs text-muted-foreground">Draft the outreach, edit it, then approve it before anything sends.</p>
                </div>
                {draftSource && (
                  <Badge variant="outline" className="text-[11px] capitalize">
                    {draftSource === 'ai-copilot' ? 'AI Copilot draft' : `${draftSource} draft`}
                  </Badge>
                )}
              </div>
              <div className="mt-3 space-y-3">
                <OfferSelector
                  companyId={companyId}
                  value={offerName}
                  onChange={(name, offer) => {
                    setOfferName(name)
                    setSelectedOffer(offer)
                    setCopyApproved(false)
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-8 text-xs shadow-sm" onClick={handleGenerateDraft} disabled={samDraftRun.streaming || !leads.length}>
                    {samDraftRun.streaming ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
                    Draft with Sam
                  </Button>
                  {aiOutreachDraft && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        const parsed = parseDraftResponse(channel, aiOutreachDraft)
                        if (parsed.subject) setSubject(parsed.subject)
                        setBody(parsed.body)
                        setDraftSource('ai-copilot')
                        setCopyApproved(false)
                      }}
                    >
                      Use AI Copilot Draft
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={copyApproved ? 'secondary' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setCopyApproved(true)}
                    disabled={!isCopyReady}
                  >
                    {copyApproved ? 'Approved for Launch' : 'Approve Copy'}
                  </Button>
                </div>
                {samDraftRun.error && (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
                    {samDraftRun.error}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1"><Label className="text-xs">Campaign Name</Label>
              <Input className="h-8 text-xs" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
            </div>

            {channel === 'email' && (
              <>
                <div className="space-y-1"><Label className="text-xs">From Email</Label>
                  <Input className="h-8 text-xs" placeholder="you@yourdomain.com" value={senderEmail} onChange={e => setSenderEmail(e.target.value)} />
                </div>
                <div className="space-y-1"><Label className="text-xs">Subject</Label>
                  <Input className="h-8 text-xs" placeholder="Quick question, {{first_name}}" value={subject} onChange={e => { setSubject(e.target.value); setCopyApproved(false); setDraftSource('manual') }} />
                </div>
              </>
            )}

            {channel === 'linkedin' && (
              <div className="space-y-1">
                <Label className="text-xs">LinkedIn Launch Provider</Label>
                <Select value={linkedinProvider} onValueChange={(value: 'heyreach' | 'lemlist') => setLinkedinProvider(value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="heyreach">HeyReach</SelectItem>
                    <SelectItem value="lemlist">Lemlist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1"><Label className="text-xs">
              {channel === 'email'
                ? 'Email Body'
                : channel === 'linkedin'
                  ? `Connection Message (use {{first_name}}, {{company}})`
                  : channel === 'voicebot'
                    ? 'Voicebot Opening Line'
                    : 'WhatsApp Message'}
            </Label>
              <textarea
                className="w-full text-xs border rounded p-2 h-28 resize-none bg-background"
                placeholder={channel === 'email'
                  ? 'Hi {{first_name}}, saw your work at {{company}}...'
                  : channel === 'linkedin'
                    ? 'Hi {{first_name}}, impressed by what you are building at {{company}}...'
                    : channel === 'voicebot'
                      ? `Hi {{first_name}}, this is ${workspaceName} calling because {{company}} may be a fit for our outreach automation workflows...`
                    : 'Hi {{first_name}}, reaching out because {{company}} looks like a strong fit...'}
                value={body} onChange={e => { setBody(e.target.value); setCopyApproved(false); setDraftSource('manual') }}
              />
            </div>

            {channel === 'email' && (
              <div className="space-y-1"><Label className="text-xs">Daily Limit: {dailyLimit}</Label>
                <Slider min={10} max={200} step={10} value={[dailyLimit]} onValueChange={([v]) => setDailyLimit(v)} />
              </div>
            )}

            <Button className="h-9 w-full text-xs shadow-sm" onClick={handleLaunch} disabled={launching || !leads.length || !copyApproved || !isCopyReady}>
              {launching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Launch {channel === 'email' ? 'Email Campaign' : channel === 'linkedin' ? 'LinkedIn Campaign' : channel === 'voicebot' ? 'Voicebot Campaign' : 'WhatsApp Outreach'}
            </Button>

            {result && (
              <div className={cn('p-3 rounded border text-xs', result.status === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700')}>
                {result.status === 'error'
                  ? <div className="flex gap-1"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{result.error}</div>
                  : <div className="space-y-0.5">
                      <div className="font-medium">✓ Campaign launched!</div>
                      {result.campaign_id && <div>ID: <code className="font-mono">{result.campaign_id}</code></div>}
                      {typeof result.leads_added === 'number' && <div>{result.leads_added} leads queued</div>}
                      {typeof result.sent_count === 'number' && <div>{result.sent_count} messages sent</div>}
                      {(result as { queued_count?: number }).queued_count != null && <div>{(result as { queued_count?: number }).queued_count} calls queued</div>}
                      {channel === 'email' && result.campaign_id && (
                        <div className="mt-2 rounded border border-green-200/70 bg-white/70 p-2 text-foreground dark:border-green-900/30 dark:bg-background/40">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-xs">Instantly monitor</div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => void handleInstantlyAction('pause')}
                                disabled={updatingInstantly || monitoringInstantly}
                              >
                                {updatingInstantly ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                Pause
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => void handleInstantlyAction('activate')}
                                disabled={updatingInstantly || monitoringInstantly}
                              >
                                Activate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => void handleRefreshInstantlyMonitor()}
                                disabled={monitoringInstantly || updatingInstantly}
                              >
                                {monitoringInstantly ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                                Refresh
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 space-y-2">
                            {formatSendingStatus(result.sending_status) && (
                              <div className="text-[11px]">
                                Sending status: <span className="font-medium">{formatSendingStatus(result.sending_status)}</span>
                              </div>
                            )}
                            {typeof result.unread_count === 'number' && (
                              <div className="text-[11px]">
                                Inbox unread: <span className="font-medium">{result.unread_count}</span>
                              </div>
                            )}
                            {extractAnalyticsSummary(result.analytics).length > 0 && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {extractAnalyticsSummary(result.analytics).map((metric) => (
                                  <div key={metric.label} className="rounded border border-border/60 bg-background/80 px-2 py-1">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
                                    <div className="text-xs font-semibold">{metric.value}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {Array.isArray(result.campaigns) && result.campaigns.length > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                Matching campaigns found: {result.campaigns.length}
                              </div>
                            )}
                            {Array.isArray(result.emails) && result.emails.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-medium">Recent campaign emails</div>
                                <div className="space-y-1">
                                  {result.emails.slice(0, 3).map((email, index) => (
                                    <div key={String(email.id || email.thread_id || index)} className="rounded border border-border/60 bg-background/80 px-2 py-1 text-[11px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="font-medium truncate">{String(email.subject || '(No subject)')}</div>
                                        {email.is_unread ? <Badge variant="outline" className="h-5 text-[10px]">Unread</Badge> : null}
                                      </div>
                                      <div className="text-muted-foreground truncate">
                                        {String(email.to_email || email.from_email || '')}
                                        {formatEmailTimestamp(email.created_at) ? ` • ${formatEmailTimestamp(email.created_at)}` : ''}
                                      </div>
                                      {email.body_preview ? (
                                        <div className="mt-1 text-muted-foreground line-clamp-2">{String(email.body_preview)}</div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {channel === 'linkedin' && (
                        <div className="mt-2 rounded border border-green-200/70 bg-white/70 p-2 text-foreground dark:border-green-900/30 dark:bg-background/40">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-xs">{linkedinProvider === 'heyreach' ? 'HeyReach monitor' : 'Lemlist monitor'}</div>
                            <div className="flex items-center gap-2">
                              {linkedinProvider === 'lemlist' && result.campaign_id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() => void handleLemlistPause()}
                                  disabled={updatingLemlist || monitoringLinkedin}
                                >
                                  {updatingLemlist ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                  Pause
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => void handleRefreshLinkedinMonitor()}
                                disabled={monitoringLinkedin || updatingLemlist}
                              >
                                {monitoringLinkedin ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                                Refresh
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 space-y-2">
                            {Array.isArray(result.campaigns) && result.campaigns.length > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                Matching campaigns found: {result.campaigns.length}
                              </div>
                            )}
                            {linkedinProvider === 'lemlist' && extractAnalyticsSummary(result.analytics).length > 0 && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {extractAnalyticsSummary(result.analytics).map((metric) => (
                                  <div key={metric.label} className="rounded border border-border/60 bg-background/80 px-2 py-1">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
                                    <div className="text-xs font-semibold">{metric.value}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {linkedinProvider === 'lemlist' && result.credits_remaining != null && (
                              <div className="text-[11px]">
                                Team credits: <span className="font-medium">{typeof result.credits_remaining === 'object' ? JSON.stringify(result.credits_remaining) : String(result.credits_remaining)}</span>
                              </div>
                            )}
                            {linkedinProvider === 'heyreach' && Array.isArray(result.conversations) && result.conversations.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-medium">Recent LinkedIn conversations</div>
                                <div className="space-y-1">
                                  {result.conversations.slice(0, 3).map((conversation, index) => (
                                    <div key={String(conversation.id || conversation.profile_url || index)} className="rounded border border-border/60 bg-background/80 px-2 py-1 text-[11px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="font-medium truncate">{String(conversation.lead_name || 'Lead')}</div>
                                        {conversation.seen === false ? <Badge variant="outline" className="h-5 text-[10px]">Unseen</Badge> : null}
                                      </div>
                                      {conversation.profile_url ? <div className="text-muted-foreground truncate">{String(conversation.profile_url)}</div> : null}
                                      {conversation.snippet ? <div className="mt-1 text-muted-foreground line-clamp-2">{String(conversation.snippet)}</div> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div>Next step: monitor replies or return to Routing to prepare another channel batch.</div>
                    </div>
                }
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Tab: Agent Intelligence ───────────────────────────────────────────────────

function AgentTab({
  companyId,
  sharedLeads,
  onUseRoutingInput,
  onUseOutreachInput,
  onNavigate,
}: {
  companyId: string
  sharedLeads: Lead[]
  onUseRoutingInput: (value: string) => void
  onUseOutreachInput: (value: string) => void
  onNavigate: (tab: LeadTabKey) => void
}) {
  const ishaRun = useAgentRun(undefined, companyId ? `lead-intel-isha-${companyId}` : undefined)
  const priyaRun = useAgentRun(undefined, companyId ? `lead-intel-priya-${companyId}` : undefined)
  const samRun = useAgentRun(undefined, companyId ? `lead-intel-sam-${companyId}` : undefined)
  const hasLeadContext = sharedLeads.length > 0
  const leadContext = buildAgentLeadContext(sharedLeads)

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {hasLeadContext
            ? `AI copilots will analyze the current lead set (${sharedLeads.length} leads). Use Isha or Priya to improve routing decisions, then send Sam's draft straight into Outreach.`
            : 'Fetch or load a lead set first. The AI copilots work best when they can analyze real leads instead of giving generic suggestions.'}
        </CardContent>
      </Card>
      {/* Container-aware columns so cards don't become narrow/elongated on smaller max-width layouts */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-stretch">
        {[
          {
            run: ishaRun,
            agent: 'isha',
            label: 'Isha — Lead Scoring & ICP',
            prompt: 'Score and profile the lead list. Identify top ICP matches, flag low-fit leads, recommend prioritisation order with reasoning.',
            trigger: 'market_landscape_bootstrap',
            btnLabel: 'Run Isha — Lead Scoring',
            color: 'text-purple-500',
          },
          {
            run: priyaRun,
            agent: 'priya',
            label: 'Priya — Competitive Intel',
            prompt: 'Review the lead list against competitor activity. Flag leads competitors are likely targeting, recommend personalised outreach angles.',
            trigger: 'daily_competitor_scan',
            btnLabel: 'Run Priya — Competitor Context',
            color: 'text-blue-500',
          },
          {
            run: samRun,
            agent: 'sam',
            label: 'Sam — Outreach Proposals',
            prompt: 'For the top 10 ICP leads, write personalised outreach proposals including email subject, opening line, value prop, and CTA.',
            trigger: 'proposal_draft',
            btnLabel: 'Run Sam — Draft Proposals',
            color: 'text-orange-500',
          },
        ].map(({ run, agent, label, prompt, trigger, btnLabel, color }) => (
          <div key={agent} className="space-y-2 min-w-0 w-full flex flex-col">
            <div className="flex gap-2">
              <Button size="sm" disabled={run.streaming || !hasLeadContext}
                className="flex-1 h-auto min-h-9 whitespace-normal text-left leading-5 text-xs"
                onClick={() => run.run(agent, `${prompt}\n\n${leadContext}`, trigger, companyId || undefined)}>
                {run.streaming ? <Loader2 className="h-3 w-3 animate-spin mr-1 shrink-0" /> : null}
                {btnLabel}
              </Button>
              {(run.text || run.error) && <Button size="sm" variant="ghost" className="h-9" onClick={run.reset}><RefreshCw className="h-3 w-3" /></Button>}
            </div>
            <AgentRunPanel
              agentName={agent}
              label={label}
              onUseAsInput={(value) => {
                if (agent === 'sam') {
                  onUseOutreachInput(value)
                  onNavigate('outreach')
                  return
                }

                onUseRoutingInput(value)
                onNavigate(agent === 'priya' ? 'route' : 'route')
              }}
              {...run}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Channel Routing ──────────────────────────────────────────────────────

interface RoutingGroup {
  count: number
  pct: number
  avg_icp_score: number
}

interface RoutingSummary {
  total: number
  by_channel: Record<string, RoutingGroup>
  high_value: number
  multichannel: number
  agent_driven?: number
  rules_driven?: number
}

interface RoutedLead {
  full_name?: string
  designation?: string
  company?: string
  email?: string
  phone?: string
  linkedin_url?: string
  seniority?: string
  icp_industry?: string
  quality?: number
  routing: {
    primary: string
    icp_score: number
    sequence: Array<{ step: number; channel: string; delay_days: number }>
    reasons: string[]
    channel_scores: Record<string, number>
  }
}

interface RouteResult {
  status: string
  total: number
  mode: 'agent' | 'rules'
  mkg_loaded: boolean
  agent_notes: string | null
  summary?: RoutingSummary
  groups?: Record<string, RoutedLead[]>
  routed_leads?: RoutedLead[]
  error?: string
}

const CHANNEL_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  linkedin: { label: 'LinkedIn',  color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',       icon: Linkedin },
  email:    { label: 'Email',     color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20',     icon: Mail },
  whatsapp: { label: 'WhatsApp',  color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: MessageCircle },
  voicebot: { label: 'Voicebot',  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20',   icon: Bot },
  phone:    { label: 'Phone',     color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20',   icon: Phone },
}

function normalizeRouteResult(data: RouteResult): RouteResult & { summary: RoutingSummary; groups: Record<string, RoutedLead[]>; routed_leads: RoutedLead[] } {
  return {
    ...data,
    summary: data.summary ?? {
      total: data.total ?? 0,
      by_channel: {},
      high_value: 0,
      multichannel: 0,
      agent_driven: 0,
      rules_driven: 0,
    },
    groups: data.groups ?? {},
    routed_leads: data.routed_leads ?? [],
  }
}

function RoutingTab({
  companyId,
  sharedLeads,
  sharedLeadSource,
  aiRoutingNotes,
  onAdoptLeads,
  onStageComplete,
  onNavigate,
  onPrepareOutreachChannel,
}: {
  companyId: string
  sharedLeads: Lead[]
  sharedLeadSource: string
  aiRoutingNotes: string
  onAdoptLeads: (leads: Lead[], source: string, stage: WorkflowStageKey) => void
  onStageComplete: (stage: WorkflowStageKey) => void
  onNavigate: (tab: LeadTabKey) => void
  onPrepareOutreachChannel: (channel: OutreachChannel) => void
}) {
  const [leadsJson, setLeadsJson]   = useState('')
  const [routing, setRouting]       = useState(false)
  const [result, setResult]         = useState<RouteResult | null>(null)
  const [selected, setSelected]     = useState<string | null>(null)
  const [launching, setLaunching]   = useState<string | null>(null)
  const [launchResults, setLaunchResults] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (sharedLeads.length > 0 && !leadsJson.trim()) {
      setLeadsJson(buildRoutingText(sharedLeads))
    }
  }, [sharedLeads, leadsJson])

  const handleRoute = async () => {
    const structuredLeads = sharedLeads.length > 0 ? sharedLeads : []
    const lines = structuredLeads.length === 0
      ? leadsJson
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
      : []

    if (!structuredLeads.length && !lines.length) {
      toast.error('Paste some lead lines first')
      return
    }

    const leads = structuredLeads.length > 0
      ? structuredLeads.map((lead) => ({
          full_name: lead.full_name,
          designation: lead.designation,
          company: lead.company,
          email: lead.email || lead.email_norm,
          phone: lead.phone_e164,
          linkedin_url: lead.linkedin_url,
          seniority: lead.seniority,
          icp_industry: lead.icp_industry,
          quality: lead.quality,
          city: lead.city,
        }))
      : lines.map(line => ({ raw: line }))

    setRouting(true); setResult(null)
    try {
      const data = normalizeRouteResult(await apiAutomation('route_leads', { leads }, companyId) as RouteResult)
      setResult(data)
      onStageComplete('route')
      toast.success(`Routed ${data.total} leads across ${Object.keys(data.summary.by_channel).length} channels`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Routing failed')
    } finally { setRouting(false) }
  }

  const handleLaunch = async (channel: string) => {
    if (!result) return
    const channelLeads = (result.groups ?? {})[channel] || []
    if (!channelLeads.length) { toast.error('No leads for this channel'); return }

    setLaunching(channel)
    try {
      let res: unknown
      if (channel === 'linkedin') {
        // Use HeyReach for LinkedIn
        res = await apiAutomation('heyreach_linkedin_campaign', {
          campaign_name: `ICP LinkedIn — ${new Date().toLocaleDateString('en-IN')}`,
          leads: channelLeads.map(l => ({
            linkedin_url: l.linkedin_url,
            first_name: l.full_name?.split(' ')[0] || '',
            last_name: l.full_name?.split(' ').slice(1).join(' ') || '',
            company: l.company || '',
          })).filter(l => l.linkedin_url),
          message_template: 'Hi {{first_name}}, noticed your work at {{company}} — would love to connect!',
        }, companyId)
      } else if (channel === 'email') {
        res = await apiAutomation('instantly_create_campaign', {
          name: `ICP Email — ${new Date().toLocaleDateString('en-IN')}`,
          subject: 'Quick question, {{first_name}}',
          body: 'Hi {{first_name}},\n\nI came across {{company}} and thought there could be a great fit...\n\nWould a 15-min call work this week?',
          daily_limit: 50,
          leads: channelLeads.map(l => ({
            email: l.email,
            first_name: l.full_name?.split(' ')[0] || '',
            last_name: l.full_name?.split(' ').slice(1).join(' ') || '',
            company_name: l.company || '',
            personalization: `${l.designation || ''} at ${l.company || ''} in ${(l as RoutedLead & { city?: string }).city || ''}`.trim(),
          })).filter(l => l.email),
        }, companyId)
      } else if (channel === 'whatsapp') {
        res = await apiAutomation('whatsapp_send_campaign', {
          campaign_name: `ICP WhatsApp — ${new Date().toLocaleDateString('en-IN')}`,
          text: `Hi {{first_name}}, this is ${workspaceName}. Reaching out because {{company}} looks like a strong fit for our AI growth and outreach workflows. Open to a quick conversation?`,
          leads: channelLeads.map(l => ({
            phone: l.phone,
            full_name: l.full_name || '',
            first_name: l.full_name?.split(' ')[0] || '',
            last_name: l.full_name?.split(' ').slice(1).join(' ') || '',
            company: l.company || '',
          })).filter(l => l.phone),
        }, companyId)
      } else if (channel === 'voicebot') {
        res = await apiAutomation('voicebot_campaign_launch', {
          campaign_name: `ICP Voicebot — ${new Date().toLocaleDateString('en-IN')}`,
          script_hint: `Hi {{first_name}}, this is ${workspaceName} calling because {{company}} may be a fit for our AI growth and outreach workflows. Is this a bad time for a quick conversation?`,
          leads: channelLeads.map(l => ({
            phone: l.phone,
            name: l.full_name || '',
            company: l.company || '',
            email: l.email || '',
          })).filter(l => l.phone),
        }, companyId)
      } else {
        toast.info(`${channel} launch coming soon`)
        setLaunching(null)
        return
      }
      setLaunchResults(p => ({ ...p, [channel]: res }))
      toast.success(`${CHANNEL_META[channel]?.label || channel} campaign launched!`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Launch failed')
    } finally { setLaunching(null) }
  }

  const routeSummary = result?.summary ?? {
    total: result?.total ?? 0,
    by_channel: {},
    high_value: 0,
    multichannel: 0,
    agent_driven: 0,
    rules_driven: 0,
  }
  const routeGroups = result?.groups ?? {}

  return (
    <div className="space-y-4">
      <StageActionBar
        title="Stage 3: Assign the best channel"
        description="Route the current workflow lead set into the next outreach motion. Keep routing close to the results so you can iterate quickly."
        secondaryAction={sharedLeads.length > 0 ? {
          label: 'Use Current Lead Set',
          onClick: () => setLeadsJson(buildRoutingText(sharedLeads)),
        } : undefined}
        primaryAction={{
          label: routing ? 'Routing Leads...' : 'Route Leads by Channel',
          onClick: handleRoute,
          disabled: routing,
        }}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Input */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-primary" />
              Route Your Leads
            </CardTitle>
            <CardDescription className="text-xs">
              Route the current workflow lead set into the best-fit channel mix. Paste freeform lead lines only if you are working from an external list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sharedLeads.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                Routing source: {sharedLeads.length} leads from {sharedLeadSource || 'the current workflow'}.
                <div className="mt-1">This tab will use that lead set automatically.</div>
              </div>
            )}
            {aiRoutingNotes && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3 text-xs text-violet-800 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-violet-300">
                <div className="font-medium">AI copilot routing notes</div>
                <p className="mt-1 whitespace-pre-wrap">{aiRoutingNotes}</p>
              </div>
            )}
            <textarea
              className="w-full text-xs border rounded p-2 h-48 resize-none bg-background font-mono"
              placeholder={
                'Paste leads from the ICP tab here, one per line.\n\nExample:\nRahul Sharma, Founder & CEO, Acme Fintech, rahul@acmefintech.com\nAnita Verma, Growth Lead, Alpha CRM, anita@alphacrm.io'
              }
              value={leadsJson}
              onChange={e => setLeadsJson(e.target.value)}
            />
            <Button className="h-9 w-full text-xs shadow-sm" onClick={handleRoute} disabled={routing}>
              {routing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
              Route Leads by Channel
            </Button>

            {/* Decision rules summary */}
            <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t">
              <p className="font-medium text-foreground">Routing rules:</p>
              <p><Briefcase className="h-3 w-3 inline mr-1" /><strong>C_SUITE / VP</strong> → LinkedIn first</p>
              <p><Mail className="h-3 w-3 inline mr-1" /><strong>MANAGER / IC</strong> → Email → WhatsApp</p>
              <p><MessageCircle className="h-3 w-3 inline mr-1" /><strong>REAL_ESTATE / RETAIL</strong> → WhatsApp boost</p>
              <p><Landmark className="h-3 w-3 inline mr-1" /><strong>FINANCE / LEGAL / HEALTHCARE</strong> → Formal only</p>
              <p><Star className="h-3 w-3 inline mr-1" /><strong>Quality ≥ 4</strong> → Full multichannel sequence</p>
              <p><Ban className="h-3 w-3 inline mr-1" /><strong>Spam count ≥ 5</strong> → Skip WhatsApp/Phone</p>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-3">
          {result ? (
            <>
              {/* Mode banner */}
              <div className={cn('rounded-lg px-3 py-2 text-xs flex items-center gap-2 border',
                result.mode === 'agent'
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 text-purple-800 dark:text-purple-200'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 text-amber-800 dark:text-amber-200'
              )}>
                {result.mode === 'agent' ? <Bot className="h-4 w-4 shrink-0" /> : <Ruler className="h-4 w-4 shrink-0" />}
                <div>
                  <span className="font-semibold">{result.mode === 'agent' ? 'Agent-driven routing' : 'Rules-based routing'}</span>
                  {result.mode === 'agent' && result.mkg_loaded && <span className="ml-1">(MKG loaded ✓)</span>}
                  {result.mode === 'rules' && <span className="ml-1">— connect a company with MKG to enable Isha routing</span>}
                  {result.agent_notes && <p className="mt-0.5 italic">"{result.agent_notes}"</p>}
                </div>
                <div className="ml-auto text-xs opacity-70">
                  {routeSummary.agent_driven ?? 0} agent · {routeSummary.rules_driven ?? 0} rules
                </div>
              </div>

              {/* Summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Total Routed', value: result.total, color: 'text-foreground' },
                  { label: 'High-Value (70+)', value: routeSummary.high_value, color: 'text-purple-600' },
                  { label: 'Multi-Channel', value: routeSummary.multichannel, color: 'text-blue-600' },
                  { label: 'Channels Used', value: Object.keys(routeSummary.by_channel).length, color: 'text-green-600' },
                ].map(s => (
                  <Card key={s.label} className="p-3 text-center">
                    <div className={cn('text-xl font-bold', s.color)}>{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </Card>
                ))}
              </div>

              {/* Channel breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(routeSummary.by_channel)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([ch, stats]) => {
                    const meta = CHANNEL_META[ch] || { label: ch, color: 'text-foreground', bg: 'bg-muted', icon: Pin }
                    const launched = launchResults[ch] as Record<string, unknown> | undefined
                    return (
                      <Card key={ch} className={cn('cursor-pointer transition-all border-2', selected === ch ? 'border-primary' : 'border-transparent')}
                        onClick={() => setSelected(selected === ch ? null : ch)}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <meta.icon className={cn('h-4 w-4', meta.color)} />
                              <div>
                                <div className={cn('font-semibold text-sm', meta.color)}>{meta.label}</div>
                                <div className="text-xs text-muted-foreground">{stats.count} leads · {stats.pct}% · avg ICP {stats.avg_icp_score}/100</div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              {!launched && (ch === 'linkedin' || ch === 'email' || ch === 'whatsapp' || ch === 'voicebot') && (
                                <Button size="sm" className="h-8 text-xs shadow-sm" disabled={launching === ch}
                                  onClick={e => { e.stopPropagation(); handleLaunch(ch) }}>
                                  {launching === ch ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                </Button>
                              )}
                              {launched != null && <CheckCircle className="h-5 w-5 text-green-500" />}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', ch === 'linkedin' ? 'bg-blue-500' : ch === 'email' ? 'bg-green-500' : ch === 'whatsapp' ? 'bg-emerald-500' : ch === 'voicebot' ? 'bg-orange-500' : 'bg-purple-500')}
                              style={{ width: `${stats.pct}%` }} />
                          </div>

                          {/* Launch result */}
                          {launched && (
                            <div className="text-xs bg-green-50 dark:bg-green-900/20 rounded p-2 text-green-700 dark:text-green-300">
                              ✓ Campaign launched — {(launched as { leads_added?: number })?.leads_added || (launched as { leads_in_list?: number })?.leads_in_list || (launched as { sent_count?: number })?.sent_count || (launched as { queued_count?: number })?.queued_count || stats.count} leads queued
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                })}
              </div>

              {(routeGroups.email?.length || routeGroups.linkedin?.length || routeGroups.whatsapp?.length || routeGroups.voicebot?.length) && (
                <div className="flex flex-wrap gap-2">
                  {routeGroups.email?.length > 0 && (
                    <Button
                      size="sm"
                      className="h-8 text-xs shadow-sm"
                      onClick={() => {
                        onAdoptLeads(routeGroups.email as unknown as Lead[], 'Routed email-ready leads', 'route')
                        onPrepareOutreachChannel('email')
                        onNavigate('outreach')
                      }}
                    >
                      Use Email Segment in Outreach
                    </Button>
                  )}
                  {routeGroups.linkedin?.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        onAdoptLeads(routeGroups.linkedin as unknown as Lead[], 'Routed LinkedIn-ready leads', 'route')
                        onPrepareOutreachChannel('linkedin')
                        onNavigate('outreach')
                      }}
                    >
                      Use LinkedIn Segment in Outreach
                    </Button>
                  )}
                  {routeGroups.whatsapp?.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        onAdoptLeads(routeGroups.whatsapp as unknown as Lead[], 'Routed WhatsApp-ready leads', 'route')
                        onPrepareOutreachChannel('whatsapp')
                        onNavigate('outreach')
                      }}
                    >
                      Use WhatsApp Segment in Outreach
                    </Button>
                  )}
                  {routeGroups.voicebot?.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        onAdoptLeads(routeGroups.voicebot as unknown as Lead[], 'Routed voicebot-ready leads', 'route')
                        onPrepareOutreachChannel('voicebot')
                        onNavigate('outreach')
                      }}
                    >
                      Use Voicebot Segment in Outreach
                    </Button>
                  )}
                </div>
              )}

              {/* Expanded lead list for selected channel */}
              {selected && routeGroups[selected]?.length > 0 && (
                <Card className="border-border/70 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {(() => {
                        const ChannelIcon = CHANNEL_META[selected]?.icon
                        return ChannelIcon ? <ChannelIcon className="mr-1 inline h-4 w-4" /> : null
                      })()}
                      {CHANNEL_META[selected]?.label} Leads ({routeGroups[selected].length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {routeGroups[selected].slice(0, 50).map((lead, i) => (
                        <div key={i} className="text-xs border rounded p-2 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-medium">{lead.full_name || '—'}</span>
                              <span className="text-muted-foreground"> · {lead.designation} @ {lead.company}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-muted-foreground">ICP</span>
                              <span className="font-bold text-primary">{lead.routing.icp_score}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {lead.routing.sequence.map((s, si) => (
                              <span key={si} className={cn('px-1.5 py-0.5 rounded text-xs', CHANNEL_META[s.channel]?.bg, CHANNEL_META[s.channel]?.color)}>
                                Day {s.delay_days}: {s.channel}
                              </span>
                            ))}
                          </div>
                          {lead.routing.reasons.slice(0, 1).map((r, ri) => (
                            <p key={ri} className="text-muted-foreground italic">→ {r}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="flex min-h-[300px] items-center justify-center border-dashed border-border/70 bg-muted/20">
              <div className="text-center space-y-2 text-muted-foreground">
                <ChevronRight className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm font-medium">Load a lead set, then route it into the best-fit outreach channel.</p>
                <p className="text-xs max-w-xs">Routing uses seniority, industry, contact data, quality, and company context when available.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface LeadIntelligenceFlowProps {
  autoStart?: boolean
  initialTab?: string
  initialLeadPreset?: LeadIntakePreset
}

export function LeadIntelligenceFlow({ autoStart = false, initialTab, initialLeadPreset }: LeadIntelligenceFlowProps) {
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id || ''
  const workspaceName = activeWorkspace?.name || 'No workspace selected'
  const websiteUrl = activeWorkspace?.website_url || null
  const normalizeInitialTab = (value?: string): LeadTabKey => {
    if (value === 'fetch' || value === 'enrich' || value === 'route' || value === 'outreach' || value === 'agents') return value
    return 'fetch'
  }
  const [tab, setTab] = useState<LeadTabKey>(() => normalizeInitialTab(initialTab))
  const [sharedLeads, setSharedLeads] = useState<Lead[]>([])
  const [sharedLeadSource, setSharedLeadSource] = useState('')
  const [workflowStatus, setWorkflowStatus] = useState<Record<WorkflowStageKey, boolean>>({
    fetch: false,
    enrich: false,
    route: false,
    outreach: false,
  })
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [mkg, setMkg] = useState<MkgRecord | null>(null)
  const [mkgReady, setMkgReady] = useState(false)
  const [aiRoutingNotes, setAiRoutingNotes] = useState('')
  const [aiOutreachDraft, setAiOutreachDraft] = useState('')
  const [preferredOutreachChannel, setPreferredOutreachChannel] = useState<OutreachChannel>('email')

  useEffect(() => {
    if (!initialTab) return
    setTab(normalizeInitialTab(initialTab))
  }, [initialTab])

  useEffect(() => {
    if (!companyId) {
      setIntegrations([])
      setMkg(null)
      setMkgReady(false)
      return
    }

    Promise.all([
      fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`).then((res) => res.json()).catch(() => ({ connectors: [] })),
      fetch(`/api/mkg/${encodeURIComponent(companyId)}`).then((res) => res.json()).catch(() => ({ mkg: null })),
    ]).then(([integrationData, mkgData]) => {
      setIntegrations(Array.isArray(integrationData?.connectors) ? integrationData.connectors : [])
      const mkg = mkgData?.mkg as Record<string, { value?: unknown; confidence?: number }> | null
      setMkg(mkg)
      const meaningfulFields = ['positioning', 'icp', 'competitors', 'messaging', 'channels']
      const readyCount = meaningfulFields.filter((field) => {
        const entry = mkg?.[field]
        return Boolean(entry?.value) && Number(entry?.confidence ?? 0) >= 0.5
      }).length
      setMkgReady(readyCount >= 2)
    })
  }, [companyId])

  const adoptLeads = (leads: Lead[], source: string, stage: WorkflowStageKey) => {
    const nextLeads = dedupeLeads(leads)
    setSharedLeads(nextLeads)
    setSharedLeadSource(source)
    setWorkflowStatus((current) => ({ ...current, [stage]: true, fetch: current.fetch || stage === 'fetch' || nextLeads.length > 0 }))
  }

  const markStageComplete = (stage: WorkflowStageKey) => {
    setWorkflowStatus((current) => ({ ...current, [stage]: true }))
  }

  const leadSummary = summarizeLeadSource(sharedLeads)
  const connectedConnectorIds = integrations.filter((connector) => connector.connected).map((connector) => connector.id)
  const outreachReady = connectedConnectorIds.some((id) => ['instantly', 'heyreach', 'linkedin', 'gmail', 'outlook'].includes(id))
  const researchReady = connectedConnectorIds.some((id) => ['semrush', 'ahrefs', 'google_sheets', 'ga4'].includes(id))

  const stages: Array<{ key: LeadTabKey; label: string; description: string; complete?: boolean }> = [
    { key: 'fetch', label: '1. Find leads', description: 'Build ICP and fetch a working lead set', complete: workflowStatus.fetch },
    { key: 'enrich', label: '2. Enrich contacts', description: 'Fill in emails or phones', complete: workflowStatus.enrich },
    { key: 'route', label: '3. Pick channel', description: 'Assign the best outreach path', complete: workflowStatus.route },
    { key: 'outreach', label: '4. Launch outreach', description: 'Send campaigns or handoff lists', complete: workflowStatus.outreach },
    { key: 'agents', label: 'AI Copilots', description: 'Analyze and draft from the current lead set' },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] p-5 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
          <Users className="h-3.5 w-3.5" />
          Lead Workspace
        </div>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-1">
            <h1 className="font-brand-syne text-2xl font-semibold tracking-tight text-foreground md:text-[2.05rem]">
              Build the lead set first, then enrich, route, and launch.
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              This flow works best when used in order. Start with a focused lead set, then move only the strongest contacts into enrichment or outreach.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current step</div>
            <div className="mt-1 font-medium text-foreground">
              {stages.find((stage) => stage.key === tab)?.label || 'Find leads'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {stages.map((stage) => (
          <button
            key={stage.key}
            type="button"
            onClick={() => setTab(stage.key)}
            className={cn(
              'rounded-[24px] border p-4 text-left transition-all duration-200',
              tab === stage.key
                ? 'border-primary bg-primary/8 shadow-sm ring-1 ring-primary/10'
                : 'border-border bg-background/80 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/30 hover:shadow-sm'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{stage.label}</div>
              {stage.complete && <CheckCircle className="h-4 w-4 text-green-500" />}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{stage.description}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(value) => setTab(normalizeInitialTab(value))}>
        <TabsList className="grid w-full grid-cols-5 rounded-xl border border-border/70 bg-muted/50 p-1 xl:hidden">
          <TabsTrigger value="fetch" className="text-xs"><Target className="h-3 w-3 mr-1" />ICP Fetch</TabsTrigger>
          <TabsTrigger value="enrich" className="text-xs"><Brain className="h-3 w-3 mr-1" />Enrich</TabsTrigger>
          <TabsTrigger value="route" className="text-xs"><ChevronRight className="h-3 w-3 mr-1" />Route</TabsTrigger>
          <TabsTrigger value="outreach" className="text-xs"><Send className="h-3 w-3 mr-1" />Outreach</TabsTrigger>
          <TabsTrigger value="agents" className="text-xs"><Zap className="h-3 w-3 mr-1" />AI Agents</TabsTrigger>
        </TabsList>

        <div role="tabpanel" hidden={tab !== 'fetch'} className={tab === 'fetch' ? 'mt-2' : 'hidden'}>
          <ICPFetchTab
            companyId={companyId}
            hasApolloConnected={connectedConnectorIds.includes('apollo')}
            mkg={mkg}
            onAdoptLeads={adoptLeads}
            onNavigate={setTab}
            preset={initialLeadPreset}
          />
        </div>
        <div role="tabpanel" hidden={tab !== 'enrich'} className={tab === 'enrich' ? 'mt-2' : 'hidden'}>
          <EnrichTab
            companyId={companyId}
            sharedLeads={sharedLeads}
            sharedLeadSource={sharedLeadSource}
            onAdoptLeads={adoptLeads}
            onNavigate={setTab}
            preset={initialLeadPreset}
          />
        </div>
        <div role="tabpanel" hidden={tab !== 'route'} className={tab === 'route' ? 'mt-2' : 'hidden'}>
          <RoutingTab
            companyId={companyId}
            sharedLeads={sharedLeads}
            sharedLeadSource={sharedLeadSource}
            aiRoutingNotes={aiRoutingNotes}
            onAdoptLeads={adoptLeads}
            onStageComplete={markStageComplete}
            onNavigate={setTab}
            onPrepareOutreachChannel={setPreferredOutreachChannel}
          />
        </div>
        <div role="tabpanel" hidden={tab !== 'outreach'} className={tab === 'outreach' ? 'mt-2' : 'hidden'}>
          <OutreachTab
            companyId={companyId}
            workspaceName={workspaceName}
            sharedLeads={sharedLeads}
            sharedLeadSource={sharedLeadSource}
            aiOutreachDraft={aiOutreachDraft}
            mkg={mkg}
            preferredChannel={preferredOutreachChannel}
            integrations={integrations}
            onStageComplete={markStageComplete}
          />
        </div>
        <div role="tabpanel" hidden={tab !== 'agents'} className={tab === 'agents' ? 'mt-2' : 'hidden'}>
          <AgentTab
            companyId={companyId}
            sharedLeads={sharedLeads}
            onUseRoutingInput={setAiRoutingNotes}
            onUseOutreachInput={setAiOutreachDraft}
            onNavigate={setTab}
          />
        </div>
      </Tabs>
    </div>
  )
}
