import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactRecord, Company } from './company-intelligence/api'
import { fetchJson } from './company-intelligence/api'
import { COMPANY_INTEL_PAGES, getCompanyIntelPageTitle, type CompanyIntelPageId } from './company-intelligence/pages'
import { GenericArtifactPage } from './company-intelligence/pages/GenericArtifactPage'
import { SocialIntelPage } from './company-intelligence/pages/SocialIntelPage'
import { AdsIntelPage } from './company-intelligence/pages/AdsIntelPage'
import { LeadMagnetsPage } from './company-intelligence/pages/LeadMagnetsPage'
import { OverviewPage } from './company-intelligence/pages/OverviewPage'
import { IcpsPage } from './company-intelligence/pages/IcpsPage'
import { CompetitorIntelligencePage } from './company-intelligence/pages/CompetitorIntelligencePage'
import { PositioningMessagingPage } from './company-intelligence/pages/PositioningMessagingPage'
import { SalesEnablementPage } from './company-intelligence/pages/SalesEnablementPage'
import { PricingIntelligencePage } from './company-intelligence/pages/PricingIntelligencePage'
import { ContentStrategyPage } from './company-intelligence/pages/ContentStrategyPage'
import { ChannelStrategyPage } from './company-intelligence/pages/ChannelStrategyPage'
import { SocialCalendarPage } from './company-intelligence/pages/SocialCalendarPage'
import { LookalikeAudiencesPage } from './company-intelligence/pages/LookalikeAudiencesPage'
import { ClientProfilingPage } from './company-intelligence/pages/ClientProfilingPage'
import { PartnerProfilingPage } from './company-intelligence/pages/PartnerProfilingPage'
import { WebsiteAuditPage } from './company-intelligence/pages/WebsiteAuditPage'
import { OpportunitiesPage } from './company-intelligence/pages/OpportunitiesPage'
import { MarketingIdeasPage } from './company-intelligence/pages/MarketingIdeasPage'
import { MarketingStrategyPage } from './company-intelligence/pages/MarketingStrategyPage'
import { clearActiveCompanyContext, persistActiveCompanyContext } from '@/lib/agentContext'
import { notifyCompanyIntelListUpdated } from '@/lib/companyIntelEvents'
import {
  agentForCiPage,
  ciChannelIdForPage,
  evaluateTaskConnectors,
  getCiTaskByPage,
  GTM_TASK_AUTORUN_KEY,
  type GtmTaskAutorunPayload,
} from '@/lib/gtmTaskRegistry'
import { skillsForCiPage } from '@/lib/marketingSkillMap'
import { TaskAgentCommandDeck, type TaskAgentRunState } from '@/components/agents/TaskAgentCommandDeck'
import { ConnectorGateCard } from '@/components/integrations/ConnectorGateCard'
import { isConnectorActive } from '@/lib/connectorMeta'
import { addIntegrationConnectedListener } from '@/lib/composio'
import { AgentFollowUpOptions } from '@/components/chat/AgentFollowUpOptions'
import { taskChannelFollowUps } from '@/lib/normalizeFollowUps'
import { useWorkspace } from '@/contexts/WorkspaceContext'

type GuidedGoal = 'leads' | 'roi' | 'content'

type ArtifactPageProps = {
  artifact: ArtifactRecord | null
  companyId?: string
  companyName?: string
  websiteUrl?: string | null
  industry?: string
}

/** Route each CI page to its purpose-built layout (not the generic JSON dump). */
function renderCiArtifactPage(pageId: CompanyIntelPageId, props: ArtifactPageProps) {
  const { artifact, companyId, companyName, websiteUrl, industry } = props

  switch (pageId) {
    case 'icps':
      return <IcpsPage artifact={artifact} companyId={companyId} companyName={companyName} websiteUrl={websiteUrl} />
    case 'competitor_intelligence':
      return (
        <CompetitorIntelligencePage
          artifact={artifact}
          companyId={companyId}
          companyName={companyName}
          websiteUrl={websiteUrl}
        />
      )
    case 'positioning_messaging':
      return <PositioningMessagingPage artifact={artifact} companyName={companyName} industry={industry} />
    case 'sales_enablement':
      return <SalesEnablementPage artifact={artifact} />
    case 'pricing_intelligence':
      return <PricingIntelligencePage artifact={artifact} companyName={companyName} />
    case 'content_strategy':
      return (
        <ContentStrategyPage
          artifact={artifact}
          companyId={companyId}
          companyName={companyName}
          websiteUrl={websiteUrl}
        />
      )
    case 'channel_strategy':
      return <ChannelStrategyPage artifact={artifact} />
    case 'social_calendar':
      return <SocialCalendarPage artifact={artifact} />
    case 'lead_magnets':
      return <LeadMagnetsPage artifact={artifact} />
    case 'lookalike_audiences':
      return <LookalikeAudiencesPage artifact={artifact} />
    case 'client_profiling':
      return <ClientProfilingPage artifact={artifact} />
    case 'partner_profiling':
      return <PartnerProfilingPage artifact={artifact} />
    case 'website_audit':
      return (
        <WebsiteAuditPage
          artifact={artifact}
          companyId={companyId}
          companyName={companyName}
          websiteUrl={websiteUrl}
        />
      )
    case 'opportunities':
      return (
        <OpportunitiesPage
          artifact={artifact}
          companyId={companyId}
          companyName={companyName}
          websiteUrl={websiteUrl}
        />
      )
    case 'marketing_ideas':
      return (
        <MarketingIdeasPage
          artifact={artifact}
          companyId={companyId}
          companyName={companyName}
          websiteUrl={websiteUrl}
        />
      )
    case 'marketing_strategy':
      return <MarketingStrategyPage artifact={artifact} />
    default:
      return (
        <GenericArtifactPage
          title={getCompanyIntelPageTitle(pageId)}
          pageId={pageId}
          artifact={artifact}
          companyId={companyId}
          companyName={companyName}
          websiteUrl={websiteUrl}
        />
      )
  }
}

interface CompanyIntelligenceFlowProps {
  guidedGoal?: GuidedGoal | null
  advancedMode?: boolean
  onModuleSelect?: (moduleId: string) => void
  /** Lock UI to one CI page (used by #icps / task channels) */
  focusPage?: CompanyIntelPageId
  /** Task-channel presentation: hide mega tab strip, show run status */
  taskChannelMode?: boolean
}

function hasQueuedCompanyIntelAutorun() {
  try {
    return Boolean(sessionStorage.getItem('marqq_company_intel_autorun'))
  } catch {
    return false
  }
}

function readGtmTaskAutorun(): GtmTaskAutorunPayload | null {
  try {
    const raw = sessionStorage.getItem(GTM_TASK_AUTORUN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GtmTaskAutorunPayload
  } catch {
    return null
  }
}

type GuidedActionPlan = {
  goal: GuidedGoal
  what_to_do_this_week: string[]
  owner: string
  expected_impact: string
}

const GUIDED_PAGE_MAP: Record<GuidedGoal, CompanyIntelPageId[]> = {
  leads: ['icps', 'competitor_intelligence', 'lead_magnets', 'social_calendar'],
  roi: ['opportunities', 'pricing_intelligence', 'website_audit', 'sales_enablement'],
  content: ['content_strategy', 'channel_strategy', 'social_calendar', 'marketing_strategy'],
}

function parseHashParam(key: string): string | null {
  const raw = window.location.hash || ''
  if (!raw.startsWith('#')) return null
  const value = raw.slice(1)
  if (!value) return null

  // Support either "#ci=marketing_strategy" or "#company-intel:marketing_strategy"
  if (value.startsWith('company-intel:')) {
    const candidate = value.slice('company-intel:'.length)
    return key === 'ci' ? candidate : null
  }

  const params = new URLSearchParams(value.replace(/^(\?|&)/, ''))
  return params.get(key)
}

function setHashCi(pageId: CompanyIntelPageId) {
  const next = `ci=${encodeURIComponent(pageId)}`
  if (window.location.hash === `#${next}`) return
  window.location.hash = next
}

export function CompanyIntelligenceFlow({
  guidedGoal = null,
  advancedMode = true,
  onModuleSelect,
  focusPage,
  taskChannelMode = false,
}: CompanyIntelligenceFlowProps) {
  const { activeWorkspace } = useWorkspace()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [companyDetails, setCompanyDetails] = useState<{ company: Company; artifacts: Record<string, ArtifactRecord> } | null>(
    null
  )

  const [activePage, setActivePage] = useState<CompanyIntelPageId>(focusPage || 'overview')


  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [companiesLoaded, setCompaniesLoaded] = useState(false)
  const autoRunFiredRef = useRef(false)
  const gtmTaskFiredRef = useRef(false)
  const [backgroundGenStatus, setBackgroundGenStatus] = useState<{ status: string; completed: number; total: number } | null>(null)
  const [chatActionPlan, setChatActionPlan] = useState<GuidedActionPlan | null>(null)
  const [queuedAutorunPending, setQueuedAutorunPending] = useState(() => hasQueuedCompanyIntelAutorun())
  const [taskGenPending, setTaskGenPending] = useState(() => Boolean(readGtmTaskAutorun()?.autoGenerate))
  const [taskRunMeta, setTaskRunMeta] = useState<GtmTaskAutorunPayload | null>(() => readGtmTaskAutorun())
  const [activeConnectorIds, setActiveConnectorIds] = useState<string[]>([])
  const [connectorsLoaded, setConnectorsLoaded] = useState(false)
  const [connectorGate, setConnectorGate] = useState<{
    hard: boolean
    missing: string[]
    /** Full list to show (connected + missing) so linked accounts stay visible */
    allIds: string[]
    pending: GtmTaskAutorunPayload
  } | null>(null)
  const [followUpOptions, setFollowUpOptions] = useState<string[]>([])
  const pendingGenerateRef = useRef<GtmTaskAutorunPayload | null>(null)

  const currentCompany = useMemo(() => companyDetails?.company || null, [companyDetails])
  const currentArtifacts = useMemo(() => companyDetails?.artifacts || {}, [companyDetails])

  const activeArtifactType = useMemo(() => {
    const page = COMPANY_INTEL_PAGES.find((p) => p.id === activePage)
    return page?.artifactType || null
  }, [activePage])

  const activeArtifact = useMemo(() => {
    if (!activeArtifactType) return null
    return currentArtifacts?.[activeArtifactType] || null
  }, [activeArtifactType, currentArtifacts])

  useEffect(() => {
    if (!taskChannelMode || !activeArtifact || followUpOptions.length) return
    setFollowUpOptions(taskChannelFollowUps(getCompanyIntelPageTitle(activePage), agentForCiPage(activePage)))
  }, [taskChannelMode, activeArtifact, activePage, followUpOptions.length])

  const recommendedPages = useMemo(() => {
    if (!guidedGoal) return COMPANY_INTEL_PAGES.filter((p) => !!p.artifactType)
    const allowed = new Set(GUIDED_PAGE_MAP[guidedGoal])
    return COMPANY_INTEL_PAGES.filter((p) => p.id !== 'overview' && allowed.has(p.id))
  }, [guidedGoal])

  const visiblePages = useMemo(() => {
    if (!guidedGoal || advancedMode) return COMPANY_INTEL_PAGES
    const allowed = new Set<CompanyIntelPageId>(['overview', 'social_intel', 'ads_intel', ...GUIDED_PAGE_MAP[guidedGoal]])
    return COMPANY_INTEL_PAGES.filter((page) => allowed.has(page.id))
  }, [advancedMode, guidedGoal])

  useEffect(() => {
    if (currentCompany?.id) {
      persistActiveCompanyContext({
        id: currentCompany.id,
        companyName: currentCompany.companyName,
        websiteUrl: currentCompany.websiteUrl,
      })
      return
    }

    if (!selectedCompanyId) {
      clearActiveCompanyContext()
    }
  }, [currentCompany, selectedCompanyId])

  useEffect(() => {
    if (focusPage) {
      setActivePage(focusPage)
      setHashCi(focusPage)
      return
    }

    const fromHash = parseHashParam('ci')
    if (fromHash && COMPANY_INTEL_PAGES.some((p) => p.id === (fromHash as any))) {
      setActivePage(fromHash as CompanyIntelPageId)
    } else {
      if (guidedGoal) {
        setActivePage(GUIDED_PAGE_MAP[guidedGoal][0] || 'overview')
      } else {
        setActivePage('overview')
      }
    }

    const onHash = () => {
      const v = parseHashParam('ci')
      if (v && COMPANY_INTEL_PAGES.some((p) => p.id === (v as any))) setActivePage(v as CompanyIntelPageId)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [guidedGoal, focusPage])

  useEffect(() => {
    if (!guidedGoal || advancedMode) return
    const allowed = new Set<CompanyIntelPageId>(['overview', ...GUIDED_PAGE_MAP[guidedGoal]])
    if (!allowed.has(activePage)) {
      const fallback = GUIDED_PAGE_MAP[guidedGoal][0] || 'overview'
      setActivePage(fallback)
      setHashCi(fallback)
    }
  }, [activePage, advancedMode, guidedGoal])

  useEffect(() => {
    if (!guidedGoal) {
      setChatActionPlan(null)
      return
    }

    try {
      const raw = sessionStorage.getItem(`guided_action_plan_${guidedGoal}`)
      if (!raw) {
        setChatActionPlan(null)
        return
      }

      const parsed = JSON.parse(raw) as GuidedActionPlan
      if (!parsed?.what_to_do_this_week?.length) {
        setChatActionPlan(null)
        return
      }
      setChatActionPlan(parsed)
    } catch {
      setChatActionPlan(null)
    }
  }, [guidedGoal])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          setError(null)
          const data = await fetchJson<{ companies: Company[] }>('/api/company-intel/companies')
          if (cancelled) return
          console.info('[CompanyIntel] Loaded companies list.', {
            count: data.companies?.length || 0,
            companyIds: (data.companies || []).map((company) => company.id)
          })
          setCompanies(data.companies || [])
          if (!selectedCompanyId && data.companies?.[0]?.id) {
            setSelectedCompanyId(data.companies[0].id)
          }
          setCompaniesLoaded(true)
        } catch (e: any) {
          if (cancelled) return
          setError(e?.message || 'Failed to load companies')
          setCompaniesLoaded(true)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [selectedCompanyId])

  useEffect(() => {
    if (!selectedCompanyId) return
    let cancelled = false
      ; (async () => {
        try {
          setError(null)
          const data = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
            `/api/company-intel/companies/${selectedCompanyId}`
          )
          if (cancelled) return
          console.info('[CompanyIntel] Loaded company details.', {
            companyId: selectedCompanyId,
            companyName: data.company?.companyName,
            profileKeys: Object.keys(data.company?.profile || {}),
            artifactCount: Object.keys(data.artifacts || {}).length
          })
          setCompanyDetails(data)
        } catch (e: any) {
          if (cancelled) return
          setError(e?.message || 'Failed to load company')
        }
      })()
    return () => {
      cancelled = true
    }
  }, [selectedCompanyId])

  async function startGenerateAll(companyId: string) {
    setLoading('generate-all')
    await fetchJson(`/api/company-intel/companies/${companyId}/generate-all`, {
      method: 'POST',
      body: JSON.stringify({
        inputs: {
          goal: 'Increase qualified leads',
          geo: 'India',
          timeframe: '90 days',
          channels: ['instagram', 'linkedin', 'youtube', 'whatsapp'],
          notes: 'Keep it compliance-safe (no guaranteed returns).'
        }
      })
    })
    console.info('[CompanyIntel] Started generate-all.', { companyId })
    setBackgroundGenStatus({ status: 'running', completed: 0, total: 14 })
    setLoading(null)

    const poll = async () => {
      try {
        const [status, refreshed] = await Promise.all([
          fetchJson<{ status: string; completed: number; total: number }>(
            `/api/company-intel/companies/${companyId}/generate-all/status`
          ),
          fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
            `/api/company-intel/companies/${companyId}`
          )
        ])
        setCompanyDetails(refreshed)
        setBackgroundGenStatus(status)
        console.info('[CompanyIntel] Background refresh tick.', {
          companyId,
          status: status.status,
          completed: status.completed,
          total: status.total,
          profileKeys: Object.keys(refreshed.company?.profile || {}),
          artifactCount: Object.keys(refreshed.artifacts || {}).length
        })
        if (status.status === 'running') {
          setTimeout(poll, 3000)
        } else {
          setTimeout(() => setBackgroundGenStatus(null), 5000)
        }
      } catch {
        setBackgroundGenStatus(null)
      }
    }

    setTimeout(poll, 3000)
  }

  // Auto-trigger company ingestion when navigating from the Getting Started checklist.
  // The checklist writes { companyName, websiteUrl } to sessionStorage before navigating here.
  useEffect(() => {
    if (!companiesLoaded || autoRunFiredRef.current) return
    autoRunFiredRef.current = true

    const raw = sessionStorage.getItem('marqq_company_intel_autorun')
    if (!raw) {
      setQueuedAutorunPending(false)
      return
    }
    sessionStorage.removeItem('marqq_company_intel_autorun')

    let payload: { companyId?: string; companyName?: string; websiteUrl?: string }
    try { payload = JSON.parse(raw) } catch {
      setQueuedAutorunPending(false)
      return
    }

    const { companyId, companyName, websiteUrl } = payload

    if (companyId) {
      setSelectedCompanyId(companyId)
      setActivePage('overview')
      setHashCi('overview')
      void (async () => {
        try {
          const existingDetails = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
            `/api/company-intel/companies/${companyId}`
          )
          setCompanyDetails(existingDetails)
          console.info('[CompanyIntel] Loaded existing company snapshot/artifacts before autorun regeneration.', {
            companyId,
            artifactCount: Object.keys(existingDetails.artifacts || {}).length
          })
          await startGenerateAll(companyId)
        } catch (e: any) {
          setError(e?.message || 'Failed to start company intelligence generation')
        } finally {
          setQueuedAutorunPending(false)
          setLoading(null)
        }
      })()
      return
    }

    if (!websiteUrl) {
      setQueuedAutorunPending(false)
      return
    }

    // Same-URL reruns should refresh the company snapshot/artifacts instead of
    // re-ingesting and wiping visible state first. Keep the current snapshot/artifacts
    // on screen, then regenerate in the background.
    const existing = companies.find((c) => c.websiteUrl === websiteUrl)
    if (existing) {
      setSelectedCompanyId(existing.id)
      setActivePage('overview')
      setHashCi('overview')
      void (async () => {
        try {
          const existingDetails = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
            `/api/company-intel/companies/${existing.id}`
          )
          setCompanyDetails(existingDetails)
          console.info('[CompanyIntel] Reusing existing company snapshot/artifacts for same-URL autorun.', {
            companyId: existing.id,
            artifactCount: Object.keys(existingDetails.artifacts || {}).length
          })
          await startGenerateAll(existing.id)
        } catch (e: any) {
          setError(e?.message || 'Failed to start company intelligence generation')
        } finally {
          setQueuedAutorunPending(false)
          setLoading(null)
        }
      })()
      return
    }

    // Otherwise ingest it and kick off background generation
    void ingestCompany(companyName || 'My Company', websiteUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesLoaded])

  // Load Composio connection state for task-channel gates
  useEffect(() => {
    const workspaceId = activeWorkspace?.id
    if (!workspaceId) {
      setConnectorsLoaded(true)
      return
    }
    let cancelled = false

    const refresh = () => {
      fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return
          const ids = (json?.connectors || [])
            .filter(
              (c: { connected?: boolean; status?: string; id?: string }) =>
                Boolean(c.id) && isConnectorActive(c),
            )
            .map((c: { id: string }) => c.id)
          setActiveConnectorIds(ids)
        })
        .catch(() => {
          if (!cancelled) setActiveConnectorIds([])
        })
        .finally(() => {
          if (!cancelled) setConnectorsLoaded(true)
        })
    }

    refresh()
    const removeListener = addIntegrationConnectedListener((detail) => {
      if (detail.companyId !== workspaceId) return
      setActiveConnectorIds((prev) =>
        prev.includes(detail.connectorId) ? prev : [...prev, detail.connectorId],
      )
      refresh()
    })

    return () => {
      cancelled = true
      removeListener()
    }
  }, [activeWorkspace?.id])

  const runTaskGenerate = useCallback(async (payload: GtmTaskAutorunPayload) => {
    setTaskGenPending(true)
    setConnectorGate(null)
    setFollowUpOptions([])
    try {
      let companyId = payload.companyId || selectedCompanyId || companies[0]?.id || ''
      if (payload.companyId) {
        setSelectedCompanyId(payload.companyId)
      } else if (!selectedCompanyId && companies[0]?.id) {
        setSelectedCompanyId(companies[0].id)
        companyId = companies[0].id
      }
      if (!companyId) {
        setError('No company found yet. Complete onboarding website crawl, then retry this task.')
        setTaskGenPending(false)
        return
      }

      const existingDetails = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
        `/api/company-intel/companies/${companyId}`
      )
      setCompanyDetails(existingDetails)
      setSelectedCompanyId(companyId)

      const notes = [
        payload.summary,
        ...(payload.bullets || []),
        'Use the locked GTM module profile for this company.',
      ]
        .filter(Boolean)
        .join('\n')

      setLoading(`generate:${payload.artifactType}`)
      await fetchJson<{ artifact: ArtifactRecord }>(`/api/company-intel/companies/${companyId}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          type: payload.artifactType,
          inputs: {
            goal: payload.summary || 'Increase qualified leads',
            geo: 'India',
            timeframe: '90 days',
            channels: ['instagram', 'linkedin', 'youtube', 'whatsapp'],
            notes,
            gtmAgentTarget: payload.agentTarget,
            agentName: payload.agentName,
          },
        }),
      })

      const refreshed = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
        `/api/company-intel/companies/${companyId}`
      )
      setCompanyDetails(refreshed)
      setFollowUpOptions(
        taskChannelFollowUps(getCompanyIntelPageTitle(payload.pageId), payload.agentName)
      )
    } catch (e: any) {
      setError(e?.message || 'Failed to generate task output')
    } finally {
      setTaskGenPending(false)
      setLoading(null)
      pendingGenerateRef.current = null
    }
  }, [companies, selectedCompanyId])

  // GTM execute → task channel: connector gate then generate
  useEffect(() => {
    if (!companiesLoaded || !connectorsLoaded || gtmTaskFiredRef.current) return
    const payload = readGtmTaskAutorun()
    if (!payload?.autoGenerate || !payload.artifactType) return
    if (focusPage && payload.pageId !== focusPage) return

    gtmTaskFiredRef.current = true
    try {
      sessionStorage.removeItem(GTM_TASK_AUTORUN_KEY)
    } catch {
      /* ignore */
    }

    setTaskRunMeta(payload)
    setActivePage(payload.pageId)
    setHashCi(payload.pageId)

    const taskDef = getCiTaskByPage(payload.pageId)
    const required = taskDef?.requiredConnectors || []
    const optional = taskDef?.optionalConnectors || []
    const allIds = Array.from(new Set([...required, ...optional]))
    const gate = evaluateTaskConnectors(
      {
        requiredConnectors: required,
        optionalConnectors: optional,
      },
      activeConnectorIds
    )

    if (gate.hardBlocked) {
      pendingGenerateRef.current = payload
      setTaskGenPending(false)
      setConnectorGate({ hard: true, missing: gate.showIds, allIds, pending: payload })
      return
    }

    if (gate.softNudge) {
      pendingGenerateRef.current = payload
      setTaskGenPending(false)
      setConnectorGate({ hard: false, missing: gate.showIds, allIds, pending: payload })
      return
    }

    void runTaskGenerate(payload)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesLoaded, connectorsLoaded, focusPage, activeConnectorIds, runTaskGenerate])

  async function ingestCompany(overrideName?: string, overrideUrl?: string) {
    const companyNameVal = overrideName ?? ''
    const websiteUrlVal = overrideUrl ?? ''
    try {
      setLoading('ingest')
      setError(null)
      const data = await fetchJson<{ company: Company }>('/api/company-intel/companies', {
        method: 'POST',
        body: JSON.stringify({ companyName: companyNameVal, websiteUrl: websiteUrlVal })
      })
      console.info('[CompanyIntel] Ingested company profile request.', {
        companyId: data.company.id,
        companyName: data.company.companyName,
        websiteUrl: data.company.websiteUrl,
        profileKeys: Object.keys(data.company.profile || {})
      })
      setCompanies((prev) => {
        const next = [...prev]
        const index = next.findIndex((company) => company.id === data.company.id)
        if (index >= 0) next[index] = data.company
        else next.unshift(data.company)
        return next
      })
      notifyCompanyIntelListUpdated()
      setCompanyDetails({ company: data.company, artifacts: {} })
      console.info('[CompanyIntel] Cleared visible company snapshot/artifacts for fresh regeneration.', {
        companyId: data.company.id
      })
      setSelectedCompanyId(data.company.id)
      setActivePage('overview')
      setHashCi('overview')

      // Kick off background generation (returns 202 immediately)
      await startGenerateAll(data.company.id)
    } catch (e: any) {
      setError(e?.message || 'Company ingestion failed')
    } finally {
      setQueuedAutorunPending(false)
      setLoading(null)
    }
  }

  async function generate(type: string, inputs: Record<string, unknown>) {
    if (!selectedCompanyId) return
    try {
      setLoading(`generate:${type}`)
      setError(null)

      // The Node.js backend now handles CrewAI delegation & fallback logic,
      // avoiding data loss if the browser tab is closed during waiting.
      await fetchJson<{ artifact: ArtifactRecord }>(`/api/company-intel/companies/${selectedCompanyId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ type, inputs })
      })

      // Refresh company details to show new artifact
      const refreshed = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
        `/api/company-intel/companies/${selectedCompanyId}`
      )
      setCompanyDetails(refreshed)
      if (taskChannelMode) {
        setFollowUpOptions(
          taskChannelFollowUps(getCompanyIntelPageTitle(activePage), agentForCiPage(activePage))
        )
      }
    } catch (e: any) {
      console.error('Generation error:', e)
      setError(e?.message || 'Generation failed')
    } finally {
      setLoading(null)
    }
  }

  async function deleteCompany(companyId: string) {
    try {
      setLoading(`delete:${companyId}`)
      setError(null)
      await fetchJson(`/api/company-intel/companies/${companyId}`, {
        method: 'DELETE'
      })

      const remainingCompanies = companies.filter((company) => company.id !== companyId)
      setCompanies(remainingCompanies)
      notifyCompanyIntelListUpdated()

      if (selectedCompanyId === companyId) {
        const nextSelectedCompanyId = remainingCompanies[0]?.id || ''
        setSelectedCompanyId(nextSelectedCompanyId)
        setCompanyDetails(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to delete company')
    } finally {
      setLoading(null)
    }
  }

  function navigate(pageId: CompanyIntelPageId) {
    // Tabs become channels: e.g. Ideal Customer Profiles → #icps
    if (pageId !== 'overview' && onModuleSelect) {
      onModuleSelect(ciChannelIdForPage(pageId))
      return
    }
    setActivePage(pageId)
    setHashCi(pageId)
  }

  const title = getCompanyIntelPageTitle(activePage)
  const showStartingScanState =
    activePage !== 'overview' &&
    !!selectedCompanyId &&
    ((backgroundGenStatus?.status === 'running' && !activeArtifact) ||
      (taskGenPending && !activeArtifact) ||
      loading === `generate:${activeArtifactType}`)

  const deckAgentName = taskRunMeta?.agentName || agentForCiPage(activePage) || 'neel'
  const deckMarketingSkills =
    getCiTaskByPage(activePage)?.marketingSkills ||
    skillsForCiPage(activePage).marketingSkills
  const deckChannelTitle =
    activePage === 'icps'
      ? 'icps'
      : activePage.replace(/_/g, '-').slice(0, 16)
  const deckRunState: TaskAgentRunState = connectorGate
    ? 'idle'
    : error
      ? 'error'
      : showStartingScanState || taskGenPending
        ? 'running'
        : activeArtifact
          ? 'ready'
          : 'idle'
  const deckSummary =
    taskRunMeta?.summary ||
    (taskRunMeta?.bullets?.length ? taskRunMeta.bullets.slice(0, 2).join(' · ') : null)

  return (
    <div className="space-y-4">
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : null}

      {chatActionPlan ? (
        <Card className="border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900">This Week Action Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-emerald-900">
            <ul className="list-disc pl-5 space-y-1">
              {chatActionPlan.what_to_do_this_week.map((item, index) => (
                <li key={`${chatActionPlan.goal}-${index}`}>{item}</li>
              ))}
            </ul>
            <div className="text-xs">
              Owner: <span className="font-semibold">{chatActionPlan.owner}</span>
            </div>
            <div className="text-xs">
              Expected impact: <span className="font-semibold">{chatActionPlan.expected_impact}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {taskChannelMode ? (
          <TaskAgentCommandDeck
            agentName={deckAgentName}
            taskTitle={title}
            channelTitle={deckChannelTitle}
            companyName={currentCompany?.companyName || companies.find((c) => c.id === selectedCompanyId)?.companyName}
            marketingSkills={deckMarketingSkills}
            runState={deckRunState}
            summary={deckSummary}
            onOpenHub={onModuleSelect ? () => onModuleSelect('company-intelligence') : undefined}
          />
        ) : (
          <div className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] px-5 py-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-500">
              Company Intelligence
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl space-y-1">
                <h1 className="font-brand-syne text-2xl font-semibold tracking-tight text-foreground md:text-[2.05rem]">
                  {title}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Review a company once, then move through the specific intelligence views only when you need them.
                </p>
              </div>
            </div>
          </div>
        )}

        {taskChannelMode && connectorGate ? (
          <ConnectorGateCard
            connectorIds={connectorGate.allIds}
            connectedConnectorIds={activeConnectorIds.filter((id) =>
              connectorGate.allIds.includes(id),
            )}
            taskLabel={title}
            workspaceId={activeWorkspace?.id}
            hardGate={connectorGate.hard}
            onConnected={(connectorId) => {
              const nextIds = [...activeConnectorIds.filter((id) => id !== connectorId), connectorId]
              setActiveConnectorIds(nextIds)
              const pending = connectorGate.pending
              const taskDef = getCiTaskByPage(pending.pageId)
              const required = taskDef?.requiredConnectors || []
              const optional = taskDef?.optionalConnectors || []
              const allIds = Array.from(new Set([...required, ...optional]))
              const gate = evaluateTaskConnectors(
                {
                  requiredConnectors: required,
                  optionalConnectors: optional,
                },
                nextIds
              )
              if (connectorGate.hard) {
                if (!gate.hardBlocked) void runTaskGenerate(pending)
                else setConnectorGate({ hard: true, missing: gate.showIds, allIds, pending })
              } else if (gate.softNudge) {
                // Keep full list so Apollo stays visible as Connected
                setConnectorGate({ hard: false, missing: gate.showIds, allIds, pending })
              } else {
                setConnectorGate({ hard: false, missing: [], allIds, pending })
              }
            }}
            onSkip={() => {
              if (connectorGate.hard) {
                setConnectorGate(null)
                pendingGenerateRef.current = null
                return
              }
              const pending = connectorGate.pending
              void runTaskGenerate(pending)
            }}
          />
        ) : null}

        {!taskChannelMode ? (
          <div className="flex flex-wrap gap-2">
            {visiblePages.map((page) => {
              const isActive = page.id === activePage
              return (
                <Button
                  key={page.id}
                  type="button"
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className={isActive ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'rounded-full'}
                  onClick={() => navigate(page.id)}
                >
                  {page.title}
                </Button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {COMPANY_INTEL_PAGES.filter((p) => p.id !== 'overview' && p.artifactType).slice(0, 8).map((page) => {
              const isActive = page.id === activePage
              return (
                <Button
                  key={page.id}
                  type="button"
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'rounded-full text-muted-foreground'}
                  onClick={() => navigate(page.id)}
                >
                  #{page.id === 'icps' ? 'icps' : page.id.replace(/_/g, '-').slice(0, 14)}
                </Button>
              )
            })}
          </div>
        )}

        {activePage === 'overview' ? (
          <OverviewPage
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onSelectCompanyId={(id) => setSelectedCompanyId(id)}
            onDeleteCompany={deleteCompany}
            company={currentCompany}
            artifacts={currentArtifacts}
            onNavigate={navigate}
            onRunAction={(moduleId, agentName) => {
              if (!onModuleSelect) return
              try {
                sessionStorage.setItem('marqq_agent_module_autorun', JSON.stringify({ moduleId, agentName }))
              } catch {
                // ignore session storage issues
              }
              onModuleSelect(moduleId)
            }}
            queuedAutorunPending={queuedAutorunPending}
            backgroundGenStatus={backgroundGenStatus}
            quickStartPages={recommendedPages.map((p) => ({ id: p.id, title: p.title }))}
            simpleMode={!advancedMode}
          />
        ) : (
          <div className="space-y-4">
              {showStartingScanState ? (
                <Card className="border-orange-200/70 bg-gradient-to-br from-orange-50 to-amber-50 dark:border-orange-900/40 dark:from-orange-950/20 dark:to-amber-950/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-orange-700 dark:text-orange-300">
                      {taskChannelMode
                        ? `Running ${taskRunMeta?.agentName || 'agent'}…`
                        : 'Starting Company Scan'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {taskChannelMode
                      ? 'Generating this channel from your locked GTM profile. Output appears here when ready.'
                      : "We're generating this company-intelligence module now. This screen will populate automatically as soon as the scan completes."}
                  </CardContent>
                </Card>
              ) : null}

              {!showStartingScanState && !connectorGate && !activeArtifact && activeArtifactType && selectedCompanyId ? (
                <Card className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">No output yet</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Run the agent for this channel to generate {getCompanyIntelPageTitle(activePage)}.
                    </p>
                    <Button
                      type="button"
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                      disabled={Boolean(loading)}
                      onClick={() => {
                        const taskDef = getCiTaskByPage(activePage)
                        const gate = evaluateTaskConnectors(
                          {
                            requiredConnectors: taskDef?.requiredConnectors || [],
                            optionalConnectors: taskDef?.optionalConnectors || [],
                          },
                          activeConnectorIds
                        )
                        const pending: GtmTaskAutorunPayload = {
                          channelId: ciChannelIdForPage(activePage),
                          pageId: activePage,
                          artifactType: activeArtifactType,
                          agentTarget: 'company_intel_icp',
                          agentName: taskDef?.agentName || agentForCiPage(activePage),
                          companyId: selectedCompanyId,
                          autoGenerate: true,
                        }
                        if (gate.hardBlocked || gate.softNudge) {
                          pendingGenerateRef.current = pending
                          const allIds = Array.from(
                            new Set([
                              ...(taskDef?.requiredConnectors || []),
                              ...(taskDef?.optionalConnectors || []),
                            ]),
                          )
                          setConnectorGate({
                            hard: gate.hardBlocked,
                            missing: gate.showIds,
                            allIds,
                            pending,
                          })
                          return
                        }
                        void generate(activeArtifactType, {
                          goal: 'Increase qualified leads',
                          geo: 'India',
                          timeframe: '90 days',
                          channels: ['instagram', 'linkedin', 'youtube', 'whatsapp'],
                          notes: 'Generate from company profile and GTM context.',
                        })
                      }}
                    >
                      {loading === `generate:${activeArtifactType}` ? 'Generating…' : 'Generate now'}
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {!showStartingScanState && activePage === 'social_intel' ? (
                <SocialIntelPage companyId={currentCompany?.id} />
              ) : null}

              {!showStartingScanState && activePage === 'ads_intel' ? (
                <AdsIntelPage companyId={currentCompany?.id} />
              ) : null}

              {!showStartingScanState &&
              activePage !== 'social_intel' &&
              activePage !== 'ads_intel'
                ? renderCiArtifactPage(activePage, {
                    artifact: activeArtifact,
                    companyId: currentCompany?.id,
                    companyName: currentCompany?.companyName,
                    websiteUrl: currentCompany?.websiteUrl,
                    industry:
                      currentCompany?.profile &&
                      typeof currentCompany.profile === 'object' &&
                      typeof (currentCompany.profile as { industry?: unknown }).industry === 'string'
                        ? (currentCompany.profile as { industry: string }).industry
                        : undefined,
                  })
                : null}

              {taskChannelMode && activeArtifact && followUpOptions.length > 0 ? (
                <AgentFollowUpOptions
                  options={followUpOptions}
                  onSelect={(option) => {
                    if (/competitor/i.test(option) && onModuleSelect) {
                      onModuleSelect(ciChannelIdForPage('competitor_intelligence'))
                      return
                    }
                    if (/channel plan|90-day/i.test(option) && onModuleSelect) {
                      onModuleSelect(ciChannelIdForPage('channel_strategy'))
                      return
                    }
                    if (/connect/i.test(option)) {
                      const taskDef = getCiTaskByPage(activePage)
                      const soft = (taskDef?.optionalConnectors || []).concat(taskDef?.requiredConnectors || [])
                      if (soft.length) {
                        setConnectorGate({
                          hard: false,
                          missing: soft.filter((id) => !activeConnectorIds.includes(id)),
                          allIds: Array.from(new Set(soft)),
                          pending: taskRunMeta || {
                            channelId: ciChannelIdForPage(activePage),
                            pageId: activePage,
                            artifactType: activeArtifactType || activePage,
                            agentTarget: 'company_intel_icp',
                            agentName: agentForCiPage(activePage),
                            autoGenerate: true,
                          },
                        })
                      }
                      return
                    }
                    // Default: regenerate / deepen via generate again
                    if (activeArtifactType) {
                      void generate(activeArtifactType, {
                        goal: option,
                        notes: option,
                        geo: 'India',
                        timeframe: '90 days',
                      })
                    }
                  }}
                />
              ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
