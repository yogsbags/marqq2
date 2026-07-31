import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  BlogArticleBrowserPreview,
  EmailClientPreview,
  LandingPageBrowserPreview,
  MetaAdsManagerPreview,
  NewsletterEmailPreview,
  OutcomeGoLiveCta,
  SocialPostPreview,
} from '@/components/outcome-previews'

type Artifact = Record<string, unknown>

function record(value: unknown): Artifact | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Artifact : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function sectionsFrom(value: unknown): Array<{ heading?: string; content?: string }> {
  if (!Array.isArray(value)) return []
  const sections: Array<{ heading?: string; content?: string }> = []
  for (const section of value) {
    const item = record(section)
    if (!item) continue
    const parsed = {
      heading: stringValue(item.heading) || stringValue(item.title),
      content: stringValue(item.content) || stringValue(item.body) || stringValue(item.copy),
    }
    if (parsed.heading || parsed.content) sections.push(parsed)
  }
  return sections
}

export function isChatVisualOutcome(artifact: Artifact): boolean {
  const nestedEmail = record(artifact.generate_email_html)
  const nestedArticle = record(artifact.create_seo_article)
  const nestedImage = record(artifact.generate_social_image)
  return Boolean(
    stringValue(artifact.post) ||
    stringValue(artifact.body) ||
    (stringValue(artifact.title) && (sectionsFrom(artifact.sections).length > 0 || stringValue(artifact.html))) ||
    stringValue(artifact.html) ||
    Array.isArray(artifact.page_structure) ||
    stringValue(artifact.headline) ||
    nestedEmail?.html ||
    nestedArticle?.html ||
    nestedImage?.cdn_url ||
    nestedImage?.image_url ||
    artifact.generate_faceless_video ||
    artifact.generate_avatar_video,
  )
}

export function ChatOutcomePreview({ artifact }: { artifact: Artifact }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id || ''
  const companyId = activeWorkspace?.id || null
  const nestedEmail = record(artifact.generate_email_html)
  const nestedArticle = record(artifact.create_seo_article)
  const nestedImage = record(artifact.generate_social_image)

  if (nestedImage?.cdn_url || nestedImage?.image_url) {
    const imageUrl = String(nestedImage.cdn_url || nestedImage.image_url)
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          <span>Generated creative preview</span>
          <span className="text-[10px] font-normal text-zinc-500">{stringValue(nestedImage.platform) || 'Social'}</span>
        </div>
        <img src={imageUrl} alt="Generated creative" className="mx-auto max-h-[520px] w-full rounded-xl object-contain" />
      </div>
    )
  }

  if (artifact.generate_faceless_video || artifact.generate_avatar_video) {
    const video = record(artifact.generate_faceless_video || artifact.generate_avatar_video)
    const videoUrl = stringValue(video?.video_url) || stringValue(video?.download_url)
    if (videoUrl) {
      return <video src={videoUrl} controls playsInline className="mt-3 w-full rounded-2xl border border-border/70" />
    }
  }

  if (nestedEmail?.html) {
    return (
      <div className="mt-3 space-y-3">
        <NewsletterEmailPreview
            from={stringValue(nestedEmail.from)}
            subject={stringValue(nestedEmail.subject) || 'Campaign email'}
            html={String(nestedEmail.html)}
          />
        {workspaceId && <OutcomeGoLiveCta kind="newsletter" workspaceId={workspaceId} companyId={companyId} payload={nestedEmail} />}
      </div>
    )
  }

  if (nestedArticle?.html) {
    const title = stringValue(nestedArticle.title) || 'Article'
    return (
      <div className="mt-3 space-y-3">
        <BlogArticleBrowserPreview
          title={title}
          metaDescription={stringValue(nestedArticle.meta_description)}
          html={String(nestedArticle.html)}
          urlLabel="blog.yoursite.com"
        />
        {workspaceId && <OutcomeGoLiveCta kind="blog" workspaceId={workspaceId} companyId={companyId} payload={nestedArticle} />}
      </div>
    )
  }

  // Direct tool artifacts are common in scoped chats. Classify them before the
  // generic HTML branch so an email/article is never rendered as a landing page.
  if (stringValue(artifact.html) && (stringValue(artifact.subject) || stringValue(artifact.from) || stringValue(artifact.to))) {
    return (
      <div className="mt-3 space-y-3">
        <NewsletterEmailPreview
          from={stringValue(artifact.from) || stringValue(artifact.from_email)}
          subject={stringValue(artifact.subject) || 'Campaign email'}
          html={String(artifact.html)}
        />
        {workspaceId && <OutcomeGoLiveCta kind="newsletter" workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  if (stringValue(artifact.html) && stringValue(artifact.title)) {
    return (
      <div className="mt-3 space-y-3">
        <BlogArticleBrowserPreview
          title={String(artifact.title)}
          metaDescription={stringValue(artifact.meta_description)}
          html={String(artifact.html)}
          urlLabel="blog.yoursite.com"
        />
        {workspaceId && <OutcomeGoLiveCta kind="blog" workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  const pageStructure = Array.isArray(artifact.page_structure) ? artifact.page_structure : []
  if (pageStructure.length > 0 || (stringValue(artifact.html) && (stringValue(artifact.format) === 'landing_page' || stringValue(artifact.type) === 'landing_page'))) {
    const title = stringValue(artifact.title) || stringValue(artifact.page_title) || 'Landing page'
    const sections = pageStructure.map((section) => {
      const item = record(section) || {}
      return {
        label: stringValue(item.label),
        heading: stringValue(item.heading) || stringValue(item.title),
        content: stringValue(item.content) || stringValue(item.copy),
        cta: stringValue(item.cta),
      }
    })
    return (
      <div className="mt-3 space-y-3">
        <LandingPageBrowserPreview title={title} sections={sections} html={stringValue(artifact.html)} />
        {workspaceId && <OutcomeGoLiveCta kind="landing_page" workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  if (stringValue(artifact.post)) {
    const hashtags = Array.isArray(artifact.hashtags) ? artifact.hashtags.map(String) : []
    const platform = stringValue(artifact.platform) || stringValue(artifact.channel) || 'social'
    return (
      <div className="mt-3 space-y-3">
        <SocialPostPreview
          platform={platform}
          authorName={stringValue(artifact.author_name) || 'Your Brand'}
          post={String(artifact.post)}
          hook={stringValue(artifact.hook)}
          hashtags={hashtags}
          cta={stringValue(artifact.cta)}
          imageUrl={stringValue(artifact.image_url) || stringValue(artifact.cdn_url)}
          videoUrl={stringValue(artifact.video_url)}
        />
        {workspaceId && <OutcomeGoLiveCta kind="social" workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  if (stringValue(artifact.body)) {
    const kind = stringValue(artifact.channel) || stringValue(artifact.platform) || 'email'
    return (
      <div className="mt-3 space-y-3">
        <EmailClientPreview
          from={stringValue(artifact.from) || stringValue(artifact.from_email)}
          to={stringValue(artifact.to) || stringValue(artifact.to_email)}
          subject={stringValue(artifact.subject)}
          previewText={stringValue(artifact.preview_text)}
          body={String(artifact.body)}
          cta={stringValue(artifact.cta)}
        />
        {workspaceId && <OutcomeGoLiveCta kind={kind.toLowerCase().includes('newsletter') ? 'newsletter' : 'email'} workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  if (stringValue(artifact.headline) || stringValue(artifact.ad_headline) || stringValue(artifact.primary_headline)) {
    const rawBudget = artifact.daily_budget ?? artifact.budget ?? artifact.daily_budget_rupees
    const dailyBudget = typeof rawBudget === 'string' || typeof rawBudget === 'number' ? rawBudget : undefined
    return (
      <div className="mt-3 space-y-3">
        <MetaAdsManagerPreview
          campaignName={stringValue(artifact.campaign_name) || stringValue(artifact.name)}
          objective={stringValue(artifact.objective) || stringValue(artifact.goal)}
          dailyBudget={dailyBudget}
          headline={stringValue(artifact.headline) || stringValue(artifact.ad_headline) || stringValue(artifact.primary_headline)}
          primaryText={stringValue(artifact.primary_text) || stringValue(artifact.ad_copy) || stringValue(artifact.copy)}
          linkUrl={stringValue(artifact.link_url) || stringValue(artifact.destination_url)}
          ctaType={stringValue(artifact.cta_type) || stringValue(artifact.cta)}
          imageUrl={stringValue(artifact.image_url) || stringValue(artifact.cdn_url)}
        />
        {workspaceId && <OutcomeGoLiveCta kind="paid_ads" workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  if (stringValue(artifact.title) && sectionsFrom(artifact.sections).length > 0) {
    return (
      <div className="mt-3 space-y-3">
        <BlogArticleBrowserPreview title={String(artifact.title)} metaDescription={stringValue(artifact.meta_description)} sections={sectionsFrom(artifact.sections)} />
        {workspaceId && <OutcomeGoLiveCta kind="blog" workspaceId={workspaceId} companyId={companyId} payload={artifact} />}
      </div>
    )
  }

  return null
}
