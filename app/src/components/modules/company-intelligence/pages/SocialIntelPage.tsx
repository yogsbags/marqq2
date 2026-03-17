import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, RefreshCw, ExternalLink, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSocialIntel, type SocialAccount } from '@/hooks/useSocialIntel'
import { supabase } from '@/lib/supabase'

type Props = {
  companyId?: string
}

const PLATFORMS = ['instagram', 'twitter', 'facebook', 'youtube'] as const
type Platform = typeof PLATFORMS[number]

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  twitter:   'Twitter / X',
  facebook:  'Facebook',
  youtube:   'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  twitter:   'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  facebook:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  youtube:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const SENTIMENT_COLORS: Record<string, string> = {
  bullish:     'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  bearish:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  neutral:     'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  promotional: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
}

const CONTENT_TYPE_COLORS: Record<string, string> = {
  educational:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  news_analysis:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  promotional:    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  product_demo:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  social_campaign:'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  event_recap:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  entertainment:  'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
}

export function SocialIntelPage({ companyId }: Props) {
  const { posts, accounts, byHandle, sentimentCounts, contentTypeCounts, loading, error } = useSocialIntel(companyId)

  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('all')
  const [activeHandle, setActiveHandle] = useState<string | 'all'>('all')

  // Add account form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newHandle, setNewHandle] = useState('')
  const [newPlatform, setNewPlatform] = useState<Platform>('instagram')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newAccountType, setNewAccountType] = useState<'competitor' | 'own'>('competitor')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ new_posts: number; digest?: string } | null>(null)

  const fetchNow = useCallback(async () => {
    if (!companyId) return
    setFetching(true)
    setFetchResult(null)
    try {
      const resp = await fetch(`/api/social-intel/${companyId}/fetch`, { method: 'POST' })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setFetchResult({ new_posts: data.new_posts ?? 0, digest: data.digest })
      toast.success(`Fetched ${data.new_posts ?? 0} new posts`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setFetching(false)
    }
  }, [companyId])

  // Filtered posts
  const filteredPosts = posts.filter(p => {
    if (activePlatform !== 'all' && p.platform !== activePlatform) return false
    if (activeHandle !== 'all' && p.handle !== activeHandle) return false
    return true
  })

  const handles = [...new Set(posts.map(p => p.handle))]

  async function addAccount() {
    if (!companyId || !newHandle.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('social_accounts').insert({
        company_id:   companyId,
        platform:     newPlatform,
        handle:       newHandle.trim().replace(/^@/, ''),
        display_name: newDisplayName.trim() || null,
        account_type: newAccountType,
        active:       true,
      })
      if (error) throw error
      toast.success(`${newPlatform}/${newHandle} added`)
      setNewHandle('')
      setNewDisplayName('')
      setShowAddForm(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteAccount(id: string) {
    setDeletingId(id)
    try {
      const { error } = await supabase.from('social_accounts').update({ active: false }).eq('id', id)
      if (error) throw error
      toast.success('Account removed')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  if (!companyId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Select a company to view social intelligence.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">

      {/* Stats row */}
      {posts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{posts.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Posts analysed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{handles.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Accounts tracked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold capitalize">
                {Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Dominant sentiment</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold capitalize">
                {Object.entries(contentTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, ' ') || '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Top content type</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Left: accounts panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">Tracked Accounts</CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm" variant="outline"
                    onClick={fetchNow}
                    disabled={fetching || accounts.length === 0}
                    title="Fetch latest posts from all tracked accounts"
                  >
                    {fetching
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                    <span className="ml-1 hidden sm:inline">{fetching ? 'Fetching…' : 'Fetch'}</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddForm(v => !v)}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>
              {fetchResult && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last fetch: {fetchResult.new_posts} new post{fetchResult.new_posts !== 1 ? 's' : ''}
                  {fetchResult.digest ? ` — ${fetchResult.digest}` : ''}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {showAddForm && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                  <select
                    value={newPlatform}
                    onChange={e => setNewPlatform(e.target.value as Platform)}
                    className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                  >
                    {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                  <Input
                    placeholder="handle (no @)"
                    value={newHandle}
                    onChange={e => setNewHandle(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Display name (optional)"
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    className="text-sm"
                  />
                  <select
                    value={newAccountType}
                    onChange={e => setNewAccountType(e.target.value as 'competitor' | 'own')}
                    className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                  >
                    <option value="competitor">Competitor</option>
                    <option value="own">Own</option>
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addAccount} disabled={saving || !newHandle.trim()} className="flex-1">
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {accounts.length === 0 && !showAddForm && (
                <p className="text-xs text-muted-foreground">No accounts yet. Add competitor handles to start monitoring.</p>
              )}

              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between gap-2 text-sm py-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[acc.platform] || ''}`}>
                        {acc.platform}
                      </span>
                      <span className="font-medium truncate">@{acc.handle}</span>
                    </div>
                    {acc.display_name && (
                      <div className="text-xs text-muted-foreground truncate">{acc.display_name}</div>
                    )}
                    <div className="text-xs text-muted-foreground">{acc.account_type}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === acc.id}
                    onClick={() => deleteAccount(acc.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sentiment breakdown */}
          {Object.keys(sentimentCounts).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">Sentiment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                  <div key={s} className="flex items-center justify-between text-xs">
                    <span className={`px-1.5 py-0.5 rounded capitalize font-medium ${SENTIMENT_COLORS[s] || 'bg-gray-100 text-gray-700'}`}>{s}</span>
                    <span className="text-muted-foreground">{count} posts</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Content type breakdown */}
          {Object.keys(contentTypeCounts).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">Content Types</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {Object.entries(contentTypeCounts).sort((a, b) => b[1] - a[1]).map(([t, count]) => (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className={`px-1.5 py-0.5 rounded capitalize font-medium ${CONTENT_TYPE_COLORS[t] || 'bg-gray-100 text-gray-700'}`}>
                      {t.replace(/_/g, ' ')}
                    </span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: posts feed */}
        <div className="lg:col-span-3 space-y-3">

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" variant={activePlatform === 'all' ? 'default' : 'outline'}
              className={activePlatform === 'all' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
              onClick={() => setActivePlatform('all')}
            >All platforms</Button>
            {PLATFORMS.filter(p => posts.some(post => post.platform === p)).map(p => (
              <Button
                key={p} size="sm"
                variant={activePlatform === p ? 'default' : 'outline'}
                className={activePlatform === p ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                onClick={() => setActivePlatform(p)}
              >{PLATFORM_LABELS[p]}</Button>
            ))}
          </div>

          {handles.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={activeHandle === 'all' ? 'secondary' : 'ghost'} onClick={() => setActiveHandle('all')}>
                All accounts
              </Button>
              {handles.map(h => (
                <Button key={h} size="sm" variant={activeHandle === h ? 'secondary' : 'ghost'} onClick={() => setActiveHandle(h)}>
                  @{h}
                </Button>
              ))}
            </div>
          )}

          {/* Loading / empty states */}
          {loading && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading social intelligence…
            </CardContent></Card>
          )}

          {!loading && accounts.length === 0 && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <p className="text-sm font-medium">No accounts tracked yet</p>
                <p className="text-sm text-muted-foreground">
                  Add competitor handles on the left to start monitoring their social activity.
                </p>
                <Button size="sm" onClick={fetchNow} disabled={fetching || accounts.length === 0} className="bg-orange-500 hover:bg-orange-600 text-white">
                  {fetching ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                  {fetching ? 'Fetching…' : 'Fetch Now'}
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && accounts.length > 0 && filteredPosts.length === 0 && (
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm font-medium">No posts extracted yet</p>
                <p className="text-sm text-muted-foreground">
                  Click <strong>Fetch</strong> to pull latest posts from all tracked accounts, or ask an agent to run <code className="text-xs bg-muted px-1 rounded">social_intel_extract</code>.
                </p>
                <Button size="sm" onClick={fetchNow} disabled={fetching} className="bg-orange-500 hover:bg-orange-600 text-white">
                  {fetching ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                  {fetching ? 'Fetching…' : 'Fetch Now'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Posts */}
          <div className="space-y-3">
            {filteredPosts.map(post => {
              const intel = post.intelligence
              return (
                <Card key={post.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 space-y-2">

                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[post.platform] || ''}`}>
                          {post.platform}
                        </span>
                        <span className="text-sm font-medium">@{post.handle}</span>
                        <span className="text-xs text-muted-foreground capitalize">{post.account_type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {intel?.content_type && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CONTENT_TYPE_COLORS[intel.content_type] || ''}`}>
                            {intel.content_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {intel?.sentiment && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SENTIMENT_COLORS[intel.sentiment] || ''}`}>
                            {intel.sentiment}
                          </span>
                        )}
                        <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      </div>
                    </div>

                    {/* Summary */}
                    {intel?.summary && (
                      <p className="text-sm text-foreground">{intel.summary}</p>
                    )}

                    {/* Key messages */}
                    {intel?.key_messages?.length > 0 && (
                      <ul className="space-y-0.5">
                        {intel.key_messages.map((msg, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{msg}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Footer: topics + entities + CTA */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {intel?.topics?.slice(0, 4).map((t, i) => (
                        <span key={i} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>

                    {intel?.entities?.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Mentions: {intel.entities.slice(0, 5).join(', ')}
                      </div>
                    )}

                    {intel?.cta && (
                      <div className="text-xs font-medium text-orange-600 dark:text-orange-400">
                        CTA: {intel.cta}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground pt-1">
                      Fetched {new Date(post.fetched_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
