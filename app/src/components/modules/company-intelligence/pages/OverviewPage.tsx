import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import type { ArtifactRecord, Company } from '../api'
import { COMPANY_INTEL_PAGES, type CompanyIntelPageId } from '../pages'
import { CompanySnapshotCard } from '../ui/CompanySnapshotCard'

type Props = {
  companies: Company[]
  selectedCompanyId: string
  onSelectCompanyId: (id: string) => void
  onDeleteCompany: (id: string) => Promise<void>
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
  backgroundGenStatus?: { status: string; completed: number; failed?: number; total: number } | null
  quickStartPages?: Array<{ id: CompanyIntelPageId; title: string }>
  simpleMode?: boolean
}

export function OverviewPage({
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  onDeleteCompany,
  company,
  artifacts,
  newCompanyName,
  newWebsiteUrl,
  setNewCompanyName,
  setNewWebsiteUrl,
  ingestDisabled,
  ingestBusy,
  onIngest,
  onNavigate,
  backgroundGenStatus,
  quickStartPages,
  simpleMode = false
}: Props) {
  const displayPages = quickStartPages?.length
    ? quickStartPages
    : COMPANY_INTEL_PAGES.filter((p) => p.artifactType).map((p) => ({ id: p.id, title: p.title }))

  const artifactCards = displayPages.map((p) => {
    const source = COMPANY_INTEL_PAGES.find((item) => item.id === p.id)
    const artifactType = source?.artifactType
    const rec = artifactType ? artifacts?.[artifactType] : null
    return { id: p.id, title: p.title, updatedAt: rec?.updatedAt || null }
  })

  const hasExistingCompany = companies.length > 0
  const showIngestForm = !simpleMode || !hasExistingCompany

  return (
    <div className="space-y-4">
      {simpleMode ? (
        <Card className="border-amber-400/50 bg-amber-500/10">
          <CardContent className="py-3 text-sm text-amber-600 dark:text-amber-400">
            Simple mode is on. You are seeing the recommended pages only. Switch to Advanced mode to access all analysis tools.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Profile</Label>
              {showIngestForm ? (
                <div className="space-y-2">
                  <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name (e.g., PL Capital)" />
                  <Input value={newWebsiteUrl} onChange={(e) => setNewWebsiteUrl(e.target.value)} placeholder="Website URL (optional, e.g., https://example.com)" />
                  <Button onClick={() => { void onIngest() }} disabled={ingestDisabled || ingestBusy} className="w-full">
                    {ingestBusy ? 'Saving profile…' : 'Save Company Profile'}
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                  One-time company setup is complete. Reusing your existing company profile for guided workflows.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Companies</Label>
              <div className="max-h-[280px] overflow-auto space-y-2">
                {companies.length ? (
                  companies.map((c) => {
                    const isSelected = c.id === selectedCompanyId
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'border rounded-md p-3 transition-colors',
                          isSelected ? 'border-orange-400 bg-orange-500/10' : 'hover:bg-muted'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" onClick={() => onSelectCompanyId(c.id)} className="min-w-0 flex-1 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold text-sm text-foreground">{c.companyName}</div>
                              <div className="text-xs text-muted-foreground">{new Date(c.updatedAt || c.createdAt).toLocaleDateString()}</div>
                            </div>
                            {c.websiteUrl ? <div className="text-xs text-muted-foreground break-all mt-1">{c.websiteUrl}</div> : null}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 border border-border/60 bg-background/80 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive dark:bg-card/80"
                            aria-label={`Delete ${c.companyName}`}
                            title={`Delete ${c.companyName}`}
                            onClick={() => {
                              void onDeleteCompany(c.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">No companies yet. Ingest one to get started.</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {backgroundGenStatus && backgroundGenStatus.status === 'running' ? (
        <Card className="border-blue-400/50 bg-blue-500/10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Auto-generating sub-modules...
              </div>
              <div className="text-xs text-blue-500 dark:text-blue-400 font-medium">
                {backgroundGenStatus.completed} / {backgroundGenStatus.total} completed{backgroundGenStatus.failed ? ` · ${backgroundGenStatus.failed} failed` : ''}
              </div>
            </div>
            <div className="w-full bg-blue-500/20 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${(backgroundGenStatus.completed / backgroundGenStatus.total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {company?.profile ? (
        <CompanySnapshotCard companyName={company.companyName} websiteUrl={company.websiteUrl} profile={company.profile} />
      ) : null}
    </div>
  )
}
