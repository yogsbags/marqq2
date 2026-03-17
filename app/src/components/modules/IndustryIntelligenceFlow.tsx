import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/contexts/WorkspaceContext'

interface IntelMeta {
  generated_at: string
  source?: string
  search_query?: string
  brief?: string
  company_name?: string
}

export function IndustryIntelligenceFlow() {
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id ?? ''

  const [intel, setIntel] = useState<IntelMeta | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!companyId) return
    setLoading(true)
    fetch(`/api/industry-intel/${companyId}`)
      .then(r => r.json())
      .then(d => { if (d.generated_at) setIntel(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [companyId])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    if (!companyId) return
    setRefreshing(true)
    try {
      const resp = await fetch(`/api/industry-intel/${companyId}/refresh`, { method: 'POST' })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setIntel(data)
      const src = data.source === 'last30days' ? 'last30days (Reddit/YouTube/HN)' : 'AI synthesis'
      toast.success(`Industry intel refreshed via ${src}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRefreshing(false)
    }
  }, [companyId])

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          Industry Intelligence
        </h1>
        <p className="text-sm text-muted-foreground">
          Last-30-days signals from Reddit, YouTube, HN and AI synthesis — injected into every agent run.
        </p>
      </div>

      {!activeWorkspace && (
        <p className="text-sm text-amber-500 text-center">Select a workspace to load industry intelligence.</p>
      )}

      {activeWorkspace && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={refresh}
            disabled={refreshing || !companyId}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : intel ? 'Refresh' : 'Fetch Now'}
          </Button>
        </div>
      )}

      {loading && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      )}

      {!loading && intel && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  Industry Brief
                  {intel.source && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      intel.source === 'last30days'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    }`}>
                      {intel.source === 'last30days' ? 'last30days' : 'AI synthesis'}
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {intel.search_query && (
                    <span>query: <code className="bg-muted px-1 rounded">{intel.search_query}</code></span>
                  )}
                  <span>{new Date(intel.generated_at).toLocaleString()}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {intel.brief ? (
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                  {intel.brief}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No brief content yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && !intel && activeWorkspace && (
        <Card>
          <CardContent className="pt-6 space-y-3 text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No industry intelligence yet</p>
            <p className="text-sm text-muted-foreground">
              Click <strong>Fetch Now</strong> to pull last-30-days signals from Reddit, YouTube, and HN for your industry. This brief is automatically injected into every agent run.
            </p>
            <Button onClick={refresh} disabled={refreshing} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Fetching…' : 'Fetch Now'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
