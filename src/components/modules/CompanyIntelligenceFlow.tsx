import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ArtifactRecord, Company } from './company-intelligence/api'
import { fetchJson } from './company-intelligence/api'
import { COMPANY_INTEL_PAGES, getCompanyIntelPageTitle, type CompanyIntelPageId } from './company-intelligence/pages'
import { OverviewPage } from './company-intelligence/pages/OverviewPage'
import { GenerateControls } from './company-intelligence/ui/GenerateControls'
import { MarketingStrategyPage } from './company-intelligence/pages/MarketingStrategyPage'
import { SocialCalendarPage } from './company-intelligence/pages/SocialCalendarPage'
import { CompetitorIntelligencePage } from './company-intelligence/pages/CompetitorIntelligencePage'
import { OpportunitiesPage } from './company-intelligence/pages/OpportunitiesPage'
import { IcpsPage } from './company-intelligence/pages/IcpsPage'
import { ClientProfilingPage } from './company-intelligence/pages/ClientProfilingPage'
import { PartnerProfilingPage } from './company-intelligence/pages/PartnerProfilingPage'
import { ContentStrategyPage } from './company-intelligence/pages/ContentStrategyPage'
import { ChannelStrategyPage } from './company-intelligence/pages/ChannelStrategyPage'
import { LookalikeAudiencesPage } from './company-intelligence/pages/LookalikeAudiencesPage'
import { LeadMagnetsPage } from './company-intelligence/pages/LeadMagnetsPage'

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

export function CompanyIntelligenceFlow() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [companyDetails, setCompanyDetails] = useState<{ company: Company; artifacts: Record<string, ArtifactRecord> } | null>(
    null
  )

  const [activePage, setActivePage] = useState<CompanyIntelPageId>('overview')

  const [newCompanyName, setNewCompanyName] = useState('')
  const [newWebsiteUrl, setNewWebsiteUrl] = useState('')

  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    const fromHash = parseHashParam('ci')
    if (fromHash && COMPANY_INTEL_PAGES.some((p) => p.id === (fromHash as any))) {
      setActivePage(fromHash as CompanyIntelPageId)
    } else {
      setActivePage('overview')
    }

    const onHash = () => {
      const v = parseHashParam('ci')
      if (v && COMPANY_INTEL_PAGES.some((p) => p.id === (v as any))) setActivePage(v as CompanyIntelPageId)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        const data = await fetchJson<{ companies: Company[] }>('/api/company-intel/companies')
        if (cancelled) return
        setCompanies(data.companies || [])
        if (!selectedCompanyId && data.companies?.[0]?.id) {
          setSelectedCompanyId(data.companies[0].id)
        }
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || 'Failed to load companies')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedCompanyId])

  useEffect(() => {
    if (!selectedCompanyId) return
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        const data = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
          `/api/company-intel/companies/${selectedCompanyId}`
        )
        if (cancelled) return
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

  async function ingestCompany() {
    try {
      setLoading('ingest')
      setError(null)
      const data = await fetchJson<{ company: Company }>('/api/company-intel/companies', {
        method: 'POST',
        body: JSON.stringify({ companyName: newCompanyName, websiteUrl: newWebsiteUrl })
      })
      setNewCompanyName('')
      setNewWebsiteUrl('')
      setSelectedCompanyId(data.company.id)
      setActivePage('overview')
      setHashCi('overview')
    } catch (e: any) {
      setError(e?.message || 'Company ingestion failed')
    } finally {
      setLoading(null)
    }
  }

  async function generate(type: string, inputs: Record<string, unknown>) {
    if (!selectedCompanyId) return
    try {
      setLoading(`generate:${type}`)
      setError(null)
      await fetchJson<{ artifact: ArtifactRecord }>(`/api/company-intel/companies/${selectedCompanyId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ type, inputs })
      })
      const refreshed = await fetchJson<{ company: Company; artifacts: Record<string, ArtifactRecord> }>(
        `/api/company-intel/companies/${selectedCompanyId}`
      )
      setCompanyDetails(refreshed)
    } catch (e: any) {
      setError(e?.message || 'Generation failed')
    } finally {
      setLoading(null)
    }
  }

  function navigate(pageId: CompanyIntelPageId) {
    setActivePage(pageId)
    setHashCi(pageId)
  }

  const title = getCompanyIntelPageTitle(activePage)

  return (
    <div className="space-y-4">
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : null}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold">{title}</div>
            <div className="text-xs text-gray-600">{currentCompany?.companyName || 'Select or ingest a company'}</div>
          </div>
        </div>

        {activePage === 'overview' ? (
          <OverviewPage
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onSelectCompanyId={(id) => setSelectedCompanyId(id)}
            company={currentCompany}
            artifacts={currentArtifacts}
            newCompanyName={newCompanyName}
            newWebsiteUrl={newWebsiteUrl}
            setNewCompanyName={setNewCompanyName}
            setNewWebsiteUrl={setNewWebsiteUrl}
            ingestDisabled={!newCompanyName.trim() && !newWebsiteUrl.trim()}
            ingestBusy={loading === 'ingest'}
            onIngest={ingestCompany}
            onNavigate={navigate}
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-4 space-y-4">
              <GenerateControls
                title="Controls"
                disabled={!selectedCompanyId || !activeArtifactType}
                isGenerating={loading === `generate:${activeArtifactType}`}
                artifact={activeArtifact}
                onGenerate={(inputs) => generate(String(activeArtifactType), inputs)}
              />
            </div>

            <div className="xl:col-span-8 space-y-4">
              {activePage === 'marketing_strategy' ? (
                <MarketingStrategyPage artifact={activeArtifact} />
              ) : null}
              {activePage === 'social_calendar' ? <SocialCalendarPage artifact={activeArtifact} /> : null}
              {activePage === 'competitor_intelligence' ? <CompetitorIntelligencePage artifact={activeArtifact} /> : null}
              {activePage === 'opportunities' ? <OpportunitiesPage artifact={activeArtifact} /> : null}
              {activePage === 'icps' ? <IcpsPage artifact={activeArtifact} /> : null}

              {activePage === 'client_profiling' ? <ClientProfilingPage artifact={activeArtifact} /> : null}
              {activePage === 'partner_profiling' ? <PartnerProfilingPage artifact={activeArtifact} /> : null}
              {activePage === 'content_strategy' ? <ContentStrategyPage artifact={activeArtifact} /> : null}
              {activePage === 'channel_strategy' ? <ChannelStrategyPage artifact={activeArtifact} /> : null}
              {activePage === 'lookalike_audiences' ? <LookalikeAudiencesPage artifact={activeArtifact} /> : null}
              {activePage === 'lead_magnets' ? <LeadMagnetsPage artifact={activeArtifact} /> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
