/**
 * B2C Organic Posts — Instagram / Facebook / LinkedIn / X
 *
 * CTA flow:
 *  1. Soft-ask for social connectors (IG, FB, LI, X)
 *  2. Generate 3 image posts × channel (Gemini + captions)
 *  3. Each card = channel-native outcome preview
 *  4. Post Now → go-live (hard gate if connector missing)
 *  5. Schedule → content_drafts.publish_at → Marketing Calendar
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConnectorGateCard } from '@/components/integrations/ConnectorGateCard'
import { SocialPostPreview, OutcomeGoLiveCta, outcomeKindFromPlatform } from '@/components/outcome-previews'
import { isConnectorActive } from '@/lib/connectorMeta'
import { CalendarDays, Image as ImageIcon, Loader2, Sparkles, Clock, Save } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const B2C_CONNECTORS = ['instagram', 'facebook', 'linkedin', 'twitter', 'reddit'] as const

type OrganicPost = {
  id: string
  channel: string
  channel_label: string
  connector: string
  angle: string
  angle_label: string
  aspect_ratio: string
  dimensions: string
  hook: string
  caption: string
  hashtags: string[]
  cta: string
  image_url: string | null
  video_url?: string | null
  format?: string
  video_error?: string | null
  post: string
  status: string
}

type PackResult = {
  status: string
  posts?: OrganicPost[]
  message?: string
  error?: string
  cta_flow?: { steps: string[]; connectors: string[]; skills?: string[] }
  skill_alignment?: {
    pack?: string
    skills?: string[]
    playbook_loaded?: boolean
    humanizer?: { skill?: string; upstream?: string; applied?: boolean; reason?: string }
  }
  ready_count?: number
}

function defaultScheduleIso(daysAhead = 1) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(10, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

function PostCard({
  post,
  brand,
  companyId,
  onScheduled,
}: {
  post: OrganicPost
  brand: string
  companyId: string
  onScheduled: () => void
}) {
  const [scheduleAt, setScheduleAt] = useState(() => defaultScheduleIso())
  const [scheduling, setScheduling] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [subreddit, setSubreddit] = useState('')

  const payload = useMemo(
    () => ({
      post: post.post || [post.hook, post.caption].filter(Boolean).join('\n\n'),
      caption: post.caption,
      hook: post.hook,
      hashtags: post.hashtags,
      cta: post.cta,
      image_url: post.image_url || undefined,
      cdn_url: post.image_url || undefined,
      video_url: post.video_url || undefined,
      videoUrl: post.video_url || undefined,
      title: `${post.channel_label} · ${post.angle_label}`,
      channel: post.channel,
      platform: post.channel,
      angle: post.angle,
      aspect_ratio: post.aspect_ratio,
      market: 'b2c',
      format: post.format || (post.video_url ? (post.channel === 'instagram' ? 'reel' : 'video_post') : 'image_post'),
      subreddit: subreddit.trim().replace(/^r\//, ''),
    }),
    [post, subreddit],
  )

  const schedulePost = async () => {
    if (!post.image_url && !post.video_url && post.channel !== 'reddit') {
      toast.error('Creative missing — regenerate this post first')
      return
    }
    if (!scheduleAt) {
      toast.error('Pick a schedule time')
      return
    }
    setScheduling(true)
    try {
      const res = await fetch('/api/content-studio/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          mode: 'schedule',
          platform: post.channel,
          publishAt: new Date(scheduleAt).toISOString(),
          payload,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Schedule failed')
      toast.success(json.summary || `Scheduled on ${post.channel_label} — visible on calendar`)
      setShowSchedule(false)
      onScheduled()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Schedule failed')
    } finally {
      setScheduling(false)
    }
  }

  const saveDraft = async () => {
    setSavingDraft(true)
    try {
      const res = await fetch('/api/content-studio/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'draft', platform: post.channel, payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not save draft')
      toast.success('Saved to Content Studio drafts')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save draft')
    } finally {
      setSavingDraft(false)
    }
  }

  return (
    <Card className="rounded-[1.5rem] border-border/70 bg-background/90 overflow-hidden">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">{post.channel_label}</Badge>
          <Badge variant="secondary" className="text-[11px]">{post.angle_label}</Badge>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {post.dimensions} · {post.aspect_ratio}
          </span>
        </div>
        <CardTitle className="text-sm font-medium leading-snug">{post.hook || post.angle_label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {post.channel === 'reddit' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Subreddit</Label>
            <Input value={subreddit} onChange={(e) => setSubreddit(e.target.value)} placeholder="e.g. nutrition (without r/)" />
            <p className="text-[11px] text-muted-foreground">Choose a community whose rules and audience match this post.</p>
          </div>
        )}
        <SocialPostPreview
          platform={post.channel}
          authorName={brand || 'Your Brand'}
          post={post.caption || post.post}
          hook={post.hook}
          hashtags={post.hashtags}
          cta={post.cta}
          imageUrl={post.image_url || undefined}
          videoUrl={post.video_url || undefined}
        />

        {!post.image_url && !post.video_url && post.channel !== 'reddit' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Creative failed — caption is ready; regenerate pack or retry this channel.
          </p>
        )}

        <div className="space-y-2 rounded-[1rem] border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={savingDraft} onClick={() => void saveDraft()}>
              {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save draft
            </Button>
            <span className="self-center text-[11px] text-muted-foreground">Review and approve before publishing live.</span>
          </div>
          <OutcomeGoLiveCta
            kind={outcomeKindFromPlatform(post.channel)}
            workspaceId={companyId}
            companyId={companyId}
            payload={payload}
            preferredConnector={post.connector}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowSchedule((v) => !v)}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </Button>
          </div>

          {showSchedule && (
            <div className="flex flex-col sm:flex-row gap-2 items-end pt-1">
              <div className="flex-1 w-full space-y-1">
                <Label className="text-[11px] text-muted-foreground">Publish at</Label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={scheduling}
                onClick={() => void schedulePost()}
              >
                {scheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                Add to calendar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function B2cOrganicPostsFlow() {
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id || ''

  const [brand, setBrand] = useState('')
  const [offer, setOffer] = useState('')
  const [audience, setAudience] = useState('Everyday consumers')
  const [includeVideo, setIncludeVideo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pack, setPack] = useState<PackResult | null>(null)
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [scheduleTick, setScheduleTick] = useState(0)

  const refreshConnectors = useCallback(async () => {
    if (!companyId) return
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`)
      const json = res.ok ? await res.json().catch(() => ({})) : {}
      const ids = (json?.connectors ?? [])
        .filter((c: { id?: string; connected?: boolean; status?: string }) => isConnectorActive(c))
        .map((c: { id: string }) => c.id)
      setConnectedIds(ids)
    } catch {
      setConnectedIds([])
    }
  }, [companyId])

  useEffect(() => {
    void refreshConnectors()
  }, [refreshConnectors])

  const missing = B2C_CONNECTORS.filter((id) => !connectedIds.includes(id))

  const generate = async () => {
    if (!companyId) {
      toast.error('Select a workspace first')
      return
    }
    if (!offer.trim() && !brand.trim()) {
      toast.error('Add a brand or product/offer')
      return
    }
    setLoading(true)
    setPack(null)
    try {
      const res = await fetch('/api/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automation_id: 'generate_b2c_organic_pack',
          company_id: companyId,
          params: {
            brand: brand.trim() || 'Your Brand',
            offer: offer.trim(),
            audience: audience.trim() || 'B2C consumers',
            include_video: includeVideo,
            channels: ['instagram', 'facebook', 'linkedin', 'twitter', 'reddit'],
          },
        }),
      })
      const json = (await res.json().catch(() => ({}))) as PackResult
      if (!res.ok || json.status === 'error') {
        throw new Error(json.error || json.message || 'Pack generation failed')
      }
      setPack(json)
      toast.success(json.message || `Ready: ${json.ready_count ?? 0} posts`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  const byChannel = useMemo(() => {
    const map: Record<string, OrganicPost[]> = {}
    for (const p of pack?.posts || []) {
      if (!map[p.channel]) map[p.channel] = []
      map[p.channel].push(p)
    }
    return map
  }, [pack])

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-1 pb-10">
      <section className="rounded-[2rem] border border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-background to-amber-50/40 p-6 dark:border-orange-900/50 dark:from-zinc-950 dark:via-zinc-950 dark:to-orange-950/30">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/50 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-800 dark:text-orange-200">
          <ImageIcon className="h-3.5 w-3.5" /> B2C Organic · Posts & video
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          Channel-ready posts for Instagram, Facebook, LinkedIn, X & Reddit
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          3 creative angles per channel (pain hook · social proof · offer CTA). Gemini assets at native
          dimensions.           Guided by <span className="text-foreground font-medium">social-content</span>,{' '}
          <span className="text-foreground font-medium">copywriting</span>,{' '}
          <span className="text-foreground font-medium">humanizer</span> (blader/humanizer),{' '}
          <span className="text-foreground font-medium">marketing-psychology</span>, and{' '}
          <span className="text-foreground font-medium">content-strategy</span>. Preview → Post Now or
          Schedule onto the marketing calendar.
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={includeVideo} onChange={(e) => setIncludeVideo(e.target.checked)} className="h-4 w-4 accent-orange-500" />
          Include Instagram Reel and Facebook video variants
          <span className="text-[11px]">(adds 6 video generations)</span>
        </label>
        {(pack?.skill_alignment?.skills || pack?.cta_flow?.skills)?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(pack.skill_alignment?.skills || pack.cta_flow?.skills || []).map((skill) => (
              <Badge key={skill} variant="secondary" className="text-[10px] font-normal">
                {skill}
              </Badge>
            ))}
            {pack?.skill_alignment?.humanizer?.applied ? (
              <Badge variant="outline" className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                humanizer applied
              </Badge>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['social-content', 'copywriting', 'humanizer', 'marketing-psychology', 'content-strategy', 'copy-editing', 'community-marketing', 'ad-creative'].map((skill) => (
              <Badge key={skill} variant="outline" className="text-[10px] font-normal">
                {skill}
              </Badge>
            ))}
          </div>
        )}
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
          {(pack?.cta_flow?.steps || [
            'Connect IG / FB / LinkedIn / X',
            'Generate 3×4 image posts',
            'Post Now on each outcome card',
            'Or Schedule → calendar',
          ]).map((step, i) => (
            <li key={step} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
              <span className="font-semibold text-orange-600 dark:text-orange-400">{i + 1}.</span> {step}
            </li>
          ))}
        </ol>
      </section>

      <ConnectorGateCard
        connectorIds={[...B2C_CONNECTORS]}
        connectedConnectorIds={connectedIds}
        missingConnectorIds={missing}
        taskLabel="B2C organic publishing (Post Now)"
        workspaceId={companyId}
        hardGate={false}
        onConnected={() => void refreshConnectors()}
        onSkip={() => toast.message('You can still generate drafts — connect before Post Now')}
      />

      <Card className="rounded-[1.5rem] border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Brief</CardTitle>
          <CardDescription>Used for captions + Gemini visual prompts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Nouriva AI" />
          </div>
          <div className="space-y-1.5">
            <Label>Product / offer</Label>
            <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Food scan that explains macros for your labs" />
          </div>
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Health-conscious consumers" />
          </div>
          <div className="sm:col-span-3">
            <Button onClick={() => void generate()} disabled={loading || !companyId} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Generating 12 image posts…' : 'Generate B2C pack (3×4 channels)'}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Instagram 4:5 · Facebook 16:9 · LinkedIn 1:1 · X 16:9 — gemini-3.1-flash-lite-image
            </p>
          </div>
        </CardContent>
      </Card>

      {pack?.posts && pack.posts.length > 0 && (
        <div className="space-y-8">
          {Object.entries(byChannel).map(([channel, posts]) => (
            <section key={channel} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  {posts[0]?.channel_label || channel}
                </h2>
                <Badge variant="outline" className="text-[10px]">
                  {posts.length} image posts
                </Badge>
              </div>
              <div className={cn('grid gap-4', 'md:grid-cols-2 xl:grid-cols-3')}>
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    brand={brand || 'Your Brand'}
                    companyId={companyId}
                    onScheduled={() => setScheduleTick((n) => n + 1)}
                  />
                ))}
              </div>
            </section>
          ))}
          <p className="text-[11px] text-muted-foreground" data-schedule-tick={scheduleTick}>
            Scheduled posts appear under Marketing Calendar for the chosen day and channel.
          </p>
        </div>
      )}
    </div>
  )
}
