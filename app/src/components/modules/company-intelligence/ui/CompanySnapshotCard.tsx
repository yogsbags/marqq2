import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

type Props = {
  companyName: string
  websiteUrl: string | null
  profile: unknown
}

function asObj(value: unknown): any {
  return value && typeof value === 'object' ? (value as any) : null
}

function safeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function buildCategorySeries(productsServices: any[]) {
  const counts = new Map<string, number>()
  for (const p of productsServices) {
    const cat = safeString(p?.category) || 'Other'
    counts.set(cat, (counts.get(cat) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

const COLORS = ['#0e0e6a', '#3c3cf8', '#00d084', '#66e766', '#f59e0b', '#ef4444', '#8b5cf6']

export function CompanySnapshotCard({ companyName, websiteUrl, profile }: Props) {
  const p = asObj(profile) || {}
  const summary = safeString(p.summary) || safeString(p.positioning)
  const industry = safeString(p.industry)
  const geoFocus = safeArray(p.geoFocus).map((v) => safeString(v)).filter(Boolean)
  const offerings = safeArray(p.offerings).map((v) => safeString(v)).filter(Boolean)
  const primaryAudience = safeArray(p.primaryAudience).map((v) => safeString(v)).filter(Boolean)

  const productsServices = safeArray(p.productsServices).filter((x) => x && typeof x === 'object')
  const categorySeries = buildCategorySeries(productsServices)

  const brandVoice = asObj(p.brandVoice) || {}
  const tone = safeString(brandVoice.tone)
  const style = safeString(brandVoice.style)

  const keyPages = asObj(p.keyPages) || {}
  const socialLinks = asObj(p.socialLinks) || {}
  const logoUrl = safeString(p.logoUrl)
  const sources = safeArray(p.sources).map((v) => safeString(v)).filter(Boolean)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">Company</div>
              <div className="flex items-center gap-2 mt-1">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${companyName} logo`}
                    className="h-8 w-8 rounded object-contain border bg-white flex-shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                ) : null}
                <div className="text-sm font-semibold text-foreground">{companyName}</div>
              </div>
              {websiteUrl ? (
                <a className="text-xs text-blue-600 underline break-all" href={websiteUrl} target="_blank" rel="noreferrer">
                  {websiteUrl}
                </a>
              ) : null}
            </div>
            <div className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">Industry</div>
              <div className="text-sm text-foreground">{industry || '—'}</div>
              <div className="text-xs text-muted-foreground mt-2">Geo focus</div>
              <div className="text-sm text-foreground">{geoFocus.length ? geoFocus.join(', ') : '—'}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">Brand voice</div>
              <div className="text-sm text-foreground">{tone || '—'}</div>
              <div className="text-xs text-muted-foreground mt-2">Style</div>
              <div className="text-sm text-foreground">{style || '—'}</div>
            </div>
          </div>

          {summary ? (
            <div className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">Summary</div>
              <div className="text-sm text-foreground">{summary}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">Offerings</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {offerings.length ? (
                  offerings.slice(0, 18).map((o, idx) => (
                    <span key={idx} className="text-xs bg-muted border rounded-full px-2 py-1">
                      {o}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">—</div>
                )}
              </div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">Primary audience</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {primaryAudience.length ? (
                  primaryAudience.slice(0, 18).map((o, idx) => (
                    <span key={idx} className="text-xs bg-muted border rounded-full px-2 py-1">
                      {o}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">—</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Products & Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {productsServices.length ? (
              productsServices.slice(0, 12).map((ps, idx) => (
                <div key={idx} className="border rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{safeString(ps.name) || `Item ${idx + 1}`}</div>
                    <div className="text-xs text-muted-foreground">{safeString(ps.category) || '—'}</div>
                  </div>
                  <div className="text-sm text-foreground mt-1">{safeString(ps.description)}</div>
                  <div className="text-xs text-muted-foreground mt-2">For: {safeString(ps.targetCustomer) || '—'}</div>
                  <div className="text-xs text-muted-foreground">Differentiator: {safeString(ps.differentiator) || '—'}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No products/services detected yet. Re-ingest with a valid website URL.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category Mix</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {categorySeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categorySeries} dataKey="value" nameKey="name" outerRadius={90}>
                    {categorySeries.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key Links</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-1">Pages</div>
            <div>About: {keyPages.about ? <a className="text-blue-600 underline break-all" href={keyPages.about} target="_blank" rel="noreferrer">{keyPages.about}</a> : '—'}</div>
            <div>Products/Services: {keyPages.productsOrServices ? <a className="text-blue-600 underline break-all" href={keyPages.productsOrServices} target="_blank" rel="noreferrer">{keyPages.productsOrServices}</a> : '—'}</div>
            <div>Pricing: {keyPages.pricing ? <a className="text-blue-600 underline break-all" href={keyPages.pricing} target="_blank" rel="noreferrer">{keyPages.pricing}</a> : '—'}</div>
            <div>Contact: {keyPages.contact ? <a className="text-blue-600 underline break-all" href={keyPages.contact} target="_blank" rel="noreferrer">{keyPages.contact}</a> : '—'}</div>
          </div>
          <div className="border rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-1">Social</div>
            <div>LinkedIn: {socialLinks.linkedin ? <a className="text-blue-600 underline break-all" href={socialLinks.linkedin} target="_blank" rel="noreferrer">{socialLinks.linkedin}</a> : '—'}</div>
            <div>Instagram: {socialLinks.instagram ? <a className="text-blue-600 underline break-all" href={socialLinks.instagram} target="_blank" rel="noreferrer">{socialLinks.instagram}</a> : '—'}</div>
            <div>YouTube: {socialLinks.youtube ? <a className="text-blue-600 underline break-all" href={socialLinks.youtube} target="_blank" rel="noreferrer">{socialLinks.youtube}</a> : '—'}</div>
            <div>Twitter/X: {socialLinks.twitter ? <a className="text-blue-600 underline break-all" href={socialLinks.twitter} target="_blank" rel="noreferrer">{socialLinks.twitter}</a> : '—'}</div>
          </div>
        </CardContent>
      </Card>

      {sources.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sources (grounded)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {sources.slice(0, 12).map((s, idx) => (
              <div key={idx}>
                <a className="text-blue-600 underline break-all" href={s} target="_blank" rel="noreferrer">
                  {s}
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
