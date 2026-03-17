import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactRecord, Company } from './company-intelligence/api'
import { fetchJson } from './company-intelligence/api'
import { COMPANY_INTEL_PAGES, getCompanyIntelPageTitle, type CompanyIntelPageId } from './company-intelligence/pages'
import { GenericArtifactPage } from './company-intelligence/pages/GenericArtifactPage'
import { SocialIntelPage } from './company-intelligence/pages/SocialIntelPage'
import { AdsIntelPage } from './company-intelligence/pages/AdsIntelPage'
import { OverviewPage } from './company-intelligence/pages/OverviewPage'
import { clearActiveCompanyContext, persistActiveCompanyContext } from '@/lib/agentContext'
import { notifyCompanyIntelListUpdated } from '@/lib/companyIntelEvents'

type GuidedGoal = 'leads' | 'roi' | 'content'

interface CompanyIntelligenceFlowProps {
  guidedGoal?: GuidedGoal | null
  advancedMode?: boolean
  onModuleSelect?: (moduleId: string) => void
}

function hasQueuedCompanyIntelAutorun() {
  try {
    return Boolean(sessionStorage.getItem('marqq_company_intel_autorun'))
  } catch {
    return false
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

export function CompanyIntelligenceFlow({ guidedGoal = null, advancedMode = true, onModuleSelect }: CompanyIntelligenceFlowProps) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [companyDetails, setCompanyDetails] = useState<{ company: Company; artifacts: Record<string, ArtifactRecord> } | null>(
    null
  )

  const [activePage, setActivePage] = useState<CompanyIntelPageId>('overview')


  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [companiesLoaded, setCompaniesLoaded] = useState(false)
  const autoRunFiredRef = useRef(false)
  const [backgroundGenStatus, setBackgroundGenStatus] = useState<{ status: string; completed: number; total: number } | null>(null)
  const [chatActionPlan, setChatActionPlan] = useState<GuidedActionPlan | null>(null)
  const [queuedAutorunPending, setQueuedAutorunPending] = useState(() => hasQueuedCompanyIntelAutorun())

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
  }, [guidedGoal])

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
      setNewCompanyName('')
      setNewWebsiteUrl('')
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
    setActivePage(pageId)
    setHashCi(pageId)
  }

  const title = getCompanyIntelPageTitle(activePage)
  const showStartingScanState =
    activePage !== 'overview' &&
    !!selectedCompanyId &&
    backgroundGenStatus?.status === 'running' &&
    !activeArtifact

  return (
    <div className="space-y-4">
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : null}

      {chatActionPlan ? (
        <Card className="border-emerald-200 bg-emerald-50">
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
        <div className="space-y-2 text-center">
          <div className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
            {title}
          </div>
          <div className="text-sm text-muted-foreground">
            Research, generate, and review company intelligence in one place.
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {visiblePages.map((page) => {
            const isActive = page.id === activePage
            return (
              <Button
                key={page.id}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className={isActive ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                onClick={() => navigate(page.id)}
              >
                {page.title}
              </Button>
            )
          })}
        </div>

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
                    <CardTitle className="text-lg text-orange-700 dark:text-orange-300">Starting Company Scan</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    We&apos;re generating this company-intelligence module now. This screen will populate automatically as soon
                    as the scan completes.
                  </CardContent>
                </Card>
              ) : null}

              {!showStartingScanState && activePage === 'social_intel' ? (
                <SocialIntelPage companyId={currentCompany?.id} />
              ) : null}

              {!showStartingScanState && activePage === 'ads_intel' ? (
                <AdsIntelPage companyId={currentCompany?.id} />
              ) : null}

              {!showStartingScanState && activePage !== 'social_intel' && activePage !== 'ads_intel' ? (
                <GenericArtifactPage
                  title={getCompanyIntelPageTitle(activePage)}
                  pageId={activePage}
                  artifact={activeArtifact}
                  companyId={currentCompany?.id}
                  companyName={currentCompany?.companyName}
                  websiteUrl={currentCompany?.websiteUrl}
                />
              ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
