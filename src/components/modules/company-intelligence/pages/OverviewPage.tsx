import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ArtifactRecord, Company } from '../api'
import { COMPANY_INTEL_PAGES, type CompanyIntelPageId } from '../pages'

type Props = {
  companies: Company[]
  selectedCompanyId: string
  onSelectCompanyId: (id: string) => void
  company: Company | null
  artifacts: Record<string, ArtifactRecord>
  newCompanyName: string
  newWebsiteUrl: string
  setNewCompanyName: (v: string) => void
  setNewWebsiteUrl: (v: string) => void
  ingestDisabled: boolean
  ingestBusy: boolean
  onIngest: () => Promise<void>
  onNavigate: (pageId: CompanyIntelPageId) => void
}

export function OverviewPage({
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  company,
  artifacts,
  newCompanyName,
  newWebsiteUrl,
  setNewCompanyName,
  setNewWebsiteUrl,
  ingestDisabled,
  ingestBusy,
  onIngest,
  onNavigate
}: Props) {
  const artifactCards = COMPANY_INTEL_PAGES.filter((p) => p.artifactType).map((p) => {
    const rec = p.artifactType ? artifacts?.[p.artifactType] : null
    return { id: p.id, title: p.title, updatedAt: rec?.updatedAt || null }
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Selector</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Create / Ingest Company</Label>
              <div className="space-y-2">
                <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name (e.g., PL Capital)" />
                <Input value={newWebsiteUrl} onChange={(e) => setNewWebsiteUrl(e.target.value)} placeholder="Website URL (optional, e.g., https://example.com)" />
                <Button onClick={onIngest} disabled={ingestDisabled || ingestBusy} className="w-full">
                  {ingestBusy ? 'Ingesting…' : 'Ingest Company'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Companies</Label>
              <div className="max-h-[280px] overflow-auto space-y-2">
                {companies.length ? (
                  companies.map((c) => {
                    const isSelected = c.id === selectedCompanyId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectCompanyId(c.id)}
                        className={cn(
                          'w-full text-left border rounded-md p-3 transition-colors',
                          isSelected ? 'border-orange-400 bg-orange-50' : 'hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm text-gray-900">{c.companyName}</div>
                          <div className="text-xs text-gray-600">{new Date(c.updatedAt || c.createdAt).toLocaleDateString()}</div>
                        </div>
                        {c.websiteUrl ? <div className="text-xs text-gray-600 break-all mt-1">{c.websiteUrl}</div> : null}
                      </button>
                    )
                  })
                ) : (
                  <div className="text-sm text-gray-600">No companies yet. Ingest one to get started.</div>
                )}
              </div>
              {company?.websiteUrl ? <div className="text-xs text-gray-600 break-all">Selected: {company.websiteUrl}</div> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {company?.profile ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Profile Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto">
              {JSON.stringify(company.profile, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-gray-700">
              Pick a sub-module to generate AI outputs for the selected company.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onNavigate('marketing_strategy')} disabled={!selectedCompanyId}>
                Marketing Strategy
              </Button>
              <Button variant="outline" onClick={() => onNavigate('social_calendar')} disabled={!selectedCompanyId}>
                Social Calendar
              </Button>
              <Button variant="outline" onClick={() => onNavigate('icps')} disabled={!selectedCompanyId}>
                ICPs
              </Button>
              <Button variant="outline" onClick={() => onNavigate('competitor_intelligence')} disabled={!selectedCompanyId}>
                Competitors
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Outputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {artifactCards.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 border rounded-md p-2">
                <div className="text-sm font-medium">{c.title}</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-600">
                    {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : 'Not generated'}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onNavigate(c.id)} disabled={!selectedCompanyId}>
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
