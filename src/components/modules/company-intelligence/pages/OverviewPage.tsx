import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Company</Label>
              <select
                value={selectedCompanyId}
                onChange={(e) => onSelectCompanyId(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="" disabled>
                  Select a company
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
              {company?.websiteUrl ? <div className="text-xs text-gray-600 break-all">{company.websiteUrl}</div> : null}
            </div>

            <div className="space-y-2">
              <Label>New company name</Label>
              <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="e.g., PL Capital" />
            </div>

            <div className="space-y-2">
              <Label>Website URL (optional)</Label>
              <Input value={newWebsiteUrl} onChange={(e) => setNewWebsiteUrl(e.target.value)} placeholder="e.g., https://example.com" />
              <Button onClick={onIngest} disabled={ingestDisabled || ingestBusy} className="w-full">
                {ingestBusy ? 'Ingesting…' : 'Ingest Company'}
              </Button>
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

