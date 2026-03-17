import { useState } from 'react'
import { ExternalLink, TrendingUp, Eye, Sparkles, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdsIntel } from '@/hooks/useAdsIntel'
import { useAdsAnalysis } from '@/hooks/useAdsAnalysis'

type Props = {
  companyId?: string
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  google:   'Google',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  facebook: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  google:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

function fmtImpressions(min: number | null, max: number | null) {
  if (!min && !max) return null
  const lo = min ? (min >= 1_000_000 ? `${(min/1_000_000).toFixed(1)}M` : min >= 1000 ? `${(min/1000).toFixed(0)}K` : String(min)) : '?'
  const hi = max ? (max >= 1_000_000 ? `${(max/1_000_000).toFixed(1)}M` : max >= 1000 ? `${(max/1000).toFixed(0)}K` : String(max)) : '?'
  return `${lo}–${hi}`
}

function fmtSpend(min: number | null, max: number | null, currency: string) {
  if (!min && !max) return null
  const fmt = (n: number) => n >= 100000 ? `${(n/100000).toFixed(1)}L` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n)
  return `${currency} ${fmt(min || 0)}–${fmt(max || 0)}`
}

const INTENSITY_COLORS: Record<string, string> = {
  high:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  low:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  none:   'bg-muted text-muted-foreground',
}

export function AdsIntelPage({ companyId }: Props) {
  const { ads, byCompetitor, byPlatform, competitors, loading, error } = useAdsIntel(companyId)
  const { analysis, updatedAt, analyzing, error: analysisError, runAnalysis } = useAdsAnalysis(companyId)

  const [activePlatform, setActivePlatform] = useState<string>('all')
  const [activeCompetitor, setActiveCompetitor] = useState<string>('all')
  const [showAnalysis, setShowAnalysis] = useState(true)

  const filtered = ads.filter(ad => {
    if (activePlatform !== 'all' && ad.platform !== activePlatform) return false
    if (activeCompetitor !== 'all' && ad.competitor_name !== activeCompetitor) return false
    return true
  })

  const activePlatforms = [...new Set(ads.map(a => a.platform))]

  if (!companyId) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Select a company to view ads intelligence.</CardContent></Card>
  }

  return (
    <div className="space-y-4">

      {/* Analysis Panel */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> AI Analysis
              </CardTitle>
              {updatedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={runAnalysis} disabled={analyzing}>
                <RefreshCw className={`h-3 w-3 ${analyzing ? 'animate-spin' : ''}`} />
                {analyzing ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze'}
              </Button>
              {analysis && (
                <button onClick={() => setShowAnalysis(v => !v)} className="text-muted-foreground hover:text-foreground">
                  {showAnalysis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        {analysisError && (
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-destructive">{analysisError}</p>
          </CardContent>
        )}

        {analyzing && (
          <CardContent className="pt-0 pb-4">
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          </CardContent>
        )}

        {analysis && showAnalysis && !analyzing && (
          <CardContent className="pt-0 pb-4 space-y-4">

            {/* Competitor Summary */}
            {analysis.competitor_summary?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Competitor Snapshot</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysis.competitor_summary.map((c, i) => (
                    <div key={i} className="border rounded p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{c.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${INTENSITY_COLORS[c.ad_intensity] || INTENSITY_COLORS.none}`}>
                          {c.ad_intensity}
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{c.primary_message}</p>
                      <p className="text-xs text-muted-foreground italic">{c.icp_signal}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Channel Gaps */}
            {analysis.channel_gaps?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Channel Gaps</p>
                <div className="space-y-2">
                  {analysis.channel_gaps.map((g, i) => (
                    <div key={i} className="border rounded p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">{g.channel}</span>
                        {g.competitors_active?.length > 0 && (
                          <span className="text-xs text-muted-foreground">Active: {g.competitors_active.join(', ')}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{g.insight}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">{g.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* White Space */}
            {analysis.white_space?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">White Space Opportunities</p>
                <div className="space-y-1.5">
                  {analysis.white_space.map((w, i) => (
                    <div key={i} className="border-l-2 border-orange-400 pl-3">
                      <p className="text-xs font-medium">{w.opportunity}</p>
                      <p className="text-xs text-muted-foreground">{w.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Ad Angles */}
            {analysis.recommended_angles?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recommended Ad Angles</p>
                <div className="grid grid-cols-1 gap-2">
                  {analysis.recommended_angles.map((a, i) => (
                    <div key={i} className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[a.platform] || 'bg-muted text-muted-foreground'}`}>
                          {PLATFORM_LABELS[a.platform] || a.platform}
                        </span>
                      </div>
                      <p className="text-sm font-semibold">{a.headline}</p>
                      {a.body && <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>}
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 italic">{a.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </CardContent>
        )}

        {!analysis && !analyzing && !analysisError && (
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground">Click Analyze to generate competitive intelligence from your ads data.</p>
          </CardContent>
        )}
      </Card>

      {/* Stats */}
      {ads.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{ads.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Ads collected</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{competitors.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Competitors tracked</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{ads.filter(a => a.is_active).length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active ads</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{activePlatforms.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Platforms</div>
          </CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Left: breakdown panels */}
        <div className="space-y-3">

          {/* Per-competitor counts */}
          {competitors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">By Competitor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div
                  className={`flex justify-between text-xs cursor-pointer py-0.5 px-1 rounded ${activeCompetitor === 'all' ? 'bg-orange-100 dark:bg-orange-900/30 font-medium' : 'hover:bg-muted'}`}
                  onClick={() => setActiveCompetitor('all')}
                >
                  <span>All</span><span className="text-muted-foreground">{ads.length}</span>
                </div>
                {competitors.map(c => (
                  <div
                    key={c}
                    className={`flex justify-between text-xs cursor-pointer py-0.5 px-1 rounded ${activeCompetitor === c ? 'bg-orange-100 dark:bg-orange-900/30 font-medium' : 'hover:bg-muted'}`}
                    onClick={() => setActiveCompetitor(c)}
                  >
                    <span className="truncate">{c}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">{byCompetitor[c]?.length || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Per-platform counts */}
          {activePlatforms.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">By Platform</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {(['linkedin', 'facebook', 'google'] as const).filter(p => byPlatform[p]?.length).map(p => (
                  <div
                    key={p}
                    className={`flex justify-between items-center text-xs cursor-pointer py-0.5 px-1 rounded ${activePlatform === p ? 'bg-orange-100 dark:bg-orange-900/30 font-medium' : 'hover:bg-muted'}`}
                    onClick={() => setActivePlatform(activePlatform === p ? 'all' : p)}
                  >
                    <span className={`px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[p]}`}>{PLATFORM_LABELS[p]}</span>
                    <span className="text-muted-foreground">{byPlatform[p]?.length || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* How to populate */}
          {ads.length === 0 && !loading && (
            <Card>
              <CardContent className="pt-4 space-y-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm">No ads yet</p>
                <p>Click <strong>Analyze</strong> above to generate AI-powered competitive ad intelligence from your MKG data — no manual setup needed.</p>
                <Button size="sm" variant="outline" className="w-full gap-1.5"
                  onClick={runAnalysis} disabled={analyzing}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {analyzing ? 'Analyzing…' : 'Run Analysis'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: ads feed */}
        <div className="lg:col-span-3 space-y-3">

          {/* Platform filter pills */}
          {activePlatforms.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={activePlatform === 'all' ? 'default' : 'outline'}
                className={activePlatform === 'all' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                onClick={() => setActivePlatform('all')}>All</Button>
              {activePlatforms.map(p => (
                <Button key={p} size="sm"
                  variant={activePlatform === p ? 'default' : 'outline'}
                  className={activePlatform === p ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                  onClick={() => setActivePlatform(p)}>{PLATFORM_LABELS[p]}</Button>
              ))}
            </div>
          )}

          {loading && <Card><CardContent className="pt-6 text-sm text-muted-foreground">Loading ads…</CardContent></Card>}
          {error && <Card><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card>}

          {!loading && filtered.length === 0 && ads.length > 0 && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">No ads match current filters.</CardContent></Card>
          )}

          <div className="space-y-3">
            {filtered.map(ad => (
              <Card key={ad.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 space-y-2">

                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[ad.platform]}`}>
                        {PLATFORM_LABELS[ad.platform]}
                      </span>
                      <span className="text-sm font-semibold">{ad.competitor_name}</span>
                      {ad.advertiser && ad.advertiser !== ad.competitor_name && (
                        <span className="text-xs text-muted-foreground">{ad.advertiser}</span>
                      )}
                      {ad.is_active && (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-1.5 py-0.5 rounded font-medium">active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      {fmtImpressions(ad.impressions_min, ad.impressions_max) && (
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {fmtImpressions(ad.impressions_min, ad.impressions_max)}
                        </span>
                      )}
                      {fmtSpend(ad.spend_min, ad.spend_max, ad.currency) && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {fmtSpend(ad.spend_min, ad.spend_max, ad.currency)}
                        </span>
                      )}
                      {ad.destination_url && (
                        <a href={ad.destination_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Headline */}
                  {ad.headline && (
                    <p className="text-sm font-medium">{ad.headline}</p>
                  )}

                  {/* Body */}
                  {ad.body && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{ad.body}</p>
                  )}

                  {/* Google: no copy available via Transparency API — show link to creative */}
                  {!ad.headline && !ad.body && ad.platform === 'google' && ad.destination_url && (
                    <a
                      href={ad.destination_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View ad on Google Transparency Center
                    </a>
                  )}

                  {/* Footer */}
                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    {ad.media_type && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{ad.media_type}</span>
                    )}
                    {ad.cta_text && (
                      <span className="text-xs font-medium text-orange-600 dark:text-orange-400">CTA: {ad.cta_text}</span>
                    )}
                    {(ad.start_date || ad.end_date) && (
                      <span className="text-xs text-muted-foreground">
                        {ad.start_date ? new Date(ad.start_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '?'}
                        {' → '}
                        {ad.end_date ? new Date(ad.end_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'ongoing'}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
