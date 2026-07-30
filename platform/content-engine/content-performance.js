/**
 * Normalized owned-content performance and evidence-gated course correction.
 * Provider payloads remain in raw_metrics; normalized fields are intentionally
 * small so every channel can be compared without pretending raw likes are equal.
 */
import { executeComposioActionForEntities, getConnectors } from './mcp-router.js';

const PLATFORM_ACTIONS = {
  facebook: ['FACEBOOK_GET_PAGE_POSTS'],
  instagram: ['INSTAGRAM_GET_IG_USER_MEDIA'],
  linkedin: ['LINKEDIN_GET_POST_CONTENT'],
  youtube: ['YOUTUBE_LIST_CHANNEL_VIDEOS'],
  // X and Reddit are synced from published drafts because the provider
  // metrics are post-specific rather than a reliable account-wide feed.
  x: [],
  reddit: [],
};

const DRAFT_BACKED_PLATFORMS = new Set(['instagram', 'facebook', 'linkedin', 'youtube', 'x', 'twitter', 'reddit']);

const NATIVE_POST_ANALYTICS = {
  instagram: { action: 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS', args: (id) => [{ media_id: String(id) }, { ig_media_id: String(id) }, { id: String(id) }] },
  facebook: { action: 'FACEBOOK_GET_POST_INSIGHTS', args: (id) => [{ post_id: String(id) }, { id: String(id) }] },
  linkedin: { action: 'LINKEDIN_GET_SHARE_STATS', args: (id) => [{ share_urn: String(id) }, { share_id: String(id) }, { urn: String(id) }] },
  youtube: { action: 'YOUTUBE_GET_VIDEO_DETAILS_BATCH', args: (id) => [{ video_ids: [String(id)] }, { ids: [String(id)] }] },
};

function arr(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.posts)) return value.posts;
  if (Array.isArray(value?.videos)) return value.videos;
  return value && typeof value === 'object' ? [value] : [];
}

function number(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function metricsFor(platform, item) {
  const source = flattenProviderMetrics(item?.metrics || item?.insights || item?.statistics || item || {});
  const redditScore = number(source.score, source.post_score, source.ups, source.upvotes);
  const impressions = number(source.impressions, source.reach, source.views, source.view_count);
  const clicks = number(source.clicks, source.link_clicks, source.website_clicks);
  const likes = number(source.likes, source.like_count, source.reactions, source.reaction_count, redditScore);
  const comments = number(source.comments, source.comment_count, source.num_comments);
  const shares = number(source.shares, source.reposts, source.retweet_count);
  const saves = number(source.saves, source.bookmarks);
  const subscribers = number(source.subscribers_gained, source.subscriber_gain);
  const engagements = likes + comments + shares + saves;
  const engagementRate = impressions > 0 ? engagements / impressions : null;
  return {
    impressions, reach: number(source.reach, impressions), clicks, likes, comments, shares, saves,
    score: redditScore || null,
    subscribers, engagements, engagement_rate: engagementRate,
    watch_time_seconds: number(source.watch_time_seconds, source.watch_time),
    average_view_duration_seconds: number(source.average_view_duration_seconds, source.average_view_duration),
    ctr: impressions > 0 ? clicks / impressions : null,
  };
}

function flattenProviderMetrics(value) {
  if (!value || typeof value !== 'object') return {};
  const source = Array.isArray(value) ? value : (value.data && Array.isArray(value.data) ? value.data : value);
  if (!Array.isArray(source)) {
    const nested = value.totalShareStatistics || value.statistics || value.insights;
    return nested && nested !== value ? { ...value, ...flattenProviderMetrics(nested) } : value;
  }
  return source.reduce((out, entry) => {
    const name = entry?.name || entry?.metric || entry?.key;
    const values = entry?.values;
    const value = Array.isArray(values) ? values.at(-1)?.value : (entry?.value ?? entry?.totalValue?.value);
    if (name && value != null) out[name] = value;
    return out;
  }, {});
}

function normalize(platform, item, { companyId, sourceType = 'own', accountId = null } = {}) {
  const metrics = metricsFor(platform, item);
  const externalId = item?.id || item?.post_id || item?.video_id || item?.share_id || item?.urn || null;
  if (!externalId) return null;
  return {
    company_id: companyId,
    platform,
    external_id: String(externalId),
    source_type: sourceType,
    account_id: accountId,
    title: item?.title || item?.text || item?.message || item?.caption || null,
    url: item?.url || item?.permalink || item?.post_url || item?.video_url || null,
    published_at: item?.published_at || item?.created_time || item?.created_at || item?.upload_date || null,
    raw_metrics: item,
    metrics,
    fetched_at: new Date().toISOString(),
  };
}

function externalIdForDraft(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return row?.external_post_id || payload.external_post_id || payload.externalPostId || payload.post_id || payload.tweet_id || payload.id || null;
}

function canonicalPlatform(platform) {
  return String(platform || '').toLowerCase() === 'twitter' ? 'x' : String(platform || '').toLowerCase();
}

function draftRow(platform, row, providerData) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const externalId = externalIdForDraft(row);
  if (!externalId) return null;
  const item = providerData && typeof providerData === 'object' ? providerData : {};
  return {
    ...item,
    id: externalId,
    title: row.title || payload.title || item.title,
    text: row.post || payload.post || item.text,
    url: row.external_url || payload.external_url || payload.url || item.url,
    published_at: row.published_at || row.publish_at || row.created_at || item.published_at,
  };
}

async function invokeFirstWorking(slugs, args, companyId) {
  let last = null;
  const argVariants = Array.isArray(args) ? args : [args];
  for (const slug of slugs) {
    for (const variant of argVariants) {
      const result = await invoke(slug, variant, companyId);
      if (result.ok) return result;
      last = result;
    }
  }
  return last || { ok: false, error: 'No compatible provider action found' };
}

async function fetchDraftBackedPerformance({ platform, companyId, supabaseClient }) {
  const platformValues = platform === 'x' ? ['x', 'twitter'] : [platform];
  const { data: drafts, error } = await supabaseClient
    .from('content_drafts')
    .select('id, platform, status, title, post, payload, publish_at, published_at, external_post_id, external_url, created_at')
    .eq('company_id', companyId)
    .in('platform', platformValues)
    .eq('status', 'published')
    .not('external_post_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(100);
  if (error) return { rows: [], error: error.code === '42P01' ? 'content_drafts table not found' : error.message };

  const rows = [];
  const errors = [];
  for (const draft of drafts || []) {
    const externalId = externalIdForDraft(draft);
    if (!externalId) continue;
    const nativeAnalytics = NATIVE_POST_ANALYTICS[platform];
    if (nativeAnalytics) {
      const analytics = await invokeFirstWorking([nativeAnalytics.action], nativeAnalytics.args(externalId), companyId);
      if (!analytics.ok) {
        errors.push({ platform, external_id: String(externalId), error: analytics.error });
        continue;
      }
      const raw = analytics.data?.data || analytics.data?.items || analytics.data;
      const item = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
      const row = normalize(platform, draftRow(platform, draft, { ...item, ...flattenProviderMetrics(raw), id: externalId }), { companyId });
      if (row) rows.push(row);
      continue;
    }
    if (platform === 'x') {
      // Composio exposes native post analytics for X/Twitter. The parameter
      // name has changed across toolkit revisions, so use the current name
      // first and retain narrow compatibility fallbacks.
      const analytics = await invokeFirstWorking([
        'TWITTER_GET_POST_ANALYTICS',
      ], { post_id: String(externalId) }, companyId);
      let data = analytics.data;
      if (!analytics.ok) {
        const fallback = await invokeFirstWorking(['TWITTER_GET_POST_ANALYTICS'], { tweet_id: String(externalId) }, companyId);
        if (fallback.ok) data = fallback.data;
        else errors.push({ platform, external_id: String(externalId), error: analytics.error || fallback.error });
      }
      if (data) {
        const item = Array.isArray(data) ? data[0] : (data.data || data);
        const row = normalize('x', draftRow('x', draft, item), { companyId });
        if (row) rows.push(row);
      }
      continue;
    }

    // Reddit does not expose a dedicated post-insights action in Composio.
    // Retrieve the post and its comments; score/comment count are the
    // platform-native engagement signals available from that payload.
    const post = await invokeFirstWorking(['REDDIT_RETRIEVE_SPECIFIC_COMMENT', 'REDDIT_RETRIEVE_REDDIT_POST'], {
      post_id: String(externalId), id: String(externalId),
    }, companyId);
    if (!post.ok) {
      errors.push({ platform, external_id: String(externalId), error: post.error });
      continue;
    }
    const postData = post.data?.data || post.data;
    const item = Array.isArray(postData) ? postData[0] : postData;
    let commentData = null;
    const comments = await invoke('REDDIT_RETRIEVE_POST_COMMENTS', { post_id: String(externalId), id: String(externalId) }, companyId);
    if (comments.ok) commentData = comments.data;
    const commentItems = arr(commentData);
    const merged = { ...(item || {}), num_comments: number(item?.num_comments, item?.comment_count, commentItems.length) };
    const row = normalize('reddit', draftRow('reddit', draft, merged), { companyId });
    if (row) rows.push(row);
  }
  return { rows, errors };
}

async function invoke(slug, args, companyId) {
  try {
    const result = await executeComposioActionForEntities(slug, args, [companyId]);
    if (result?.error) return { ok: false, error: result.error };
    return { ok: true, data: result?.result || result?.data || result };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function syncOwnedContentPerformance({ companyId, supabaseClient, platforms = null } = {}) {
  if (!companyId || !supabaseClient) return { status: 'error', error: 'companyId and supabaseClient are required' };
  const connected = await getConnectors(companyId).catch(() => []);
  const ids = new Set((connected || []).filter((row) => row.connected).map((row) => row.id));
  const selected = (platforms?.length ? platforms : Object.keys(PLATFORM_ACTIONS)).map(canonicalPlatform);
  const rows = [];
  const errors = [];
  for (const platform of selected) {
    const connectorId = platform === 'x' ? 'twitter' : platform;
    if (!ids.has(connectorId)) {
      errors.push({ platform, error: `${connectorId} is not connected` });
      continue;
    }
    if (DRAFT_BACKED_PLATFORMS.has(platform)) {
      const result = await fetchDraftBackedPerformance({ platform, companyId, supabaseClient });
      rows.push(...result.rows);
      if (result.error) errors.push({ platform, error: result.error });
      if (result.errors?.length) errors.push(...result.errors);
      continue;
    }
    const result = await invoke(PLATFORM_ACTIONS[platform]?.[0], { limit: 50, max_results: 50 }, companyId);
    if (!result.ok) {
      errors.push({ platform, error: result.error });
      continue;
    }
    for (const item of arr(result.data)) {
      const row = normalize(platform, item, { companyId });
      if (row) rows.push(row);
    }
  }
  if (rows.length) {
    const { error } = await supabaseClient.from('content_performance').upsert(rows, { onConflict: 'company_id,platform,external_id' });
    if (error) return { status: 'error', error: error.message, rows: 0, errors };
  }
  return { status: 'completed', synced: rows.length, errors, fetched_at: new Date().toISOString() };
}

function average(rows, key) {
  const values = rows.map((row) => Number(row.metrics?.[key])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function reviewContentPerformance({ companyId, supabaseClient, days = 30 } = {}) {
  if (!companyId || !supabaseClient) return { status: 'error', error: 'companyId and supabaseClient are required' };
  const now = Date.now();
  const currentStart = new Date(now - days * 86400000).toISOString();
  const baselineStart = new Date(now - days * 2 * 86400000).toISOString();
  const { data, error } = await supabaseClient
    .from('content_performance')
    .select('platform, source_type, published_at, metrics, title, url')
    .eq('company_id', companyId)
    .eq('source_type', 'own')
    .gte('published_at', baselineStart)
    .order('published_at', { ascending: false })
    .limit(500);
  if (error) return { status: 'error', error: error.message };

  let goalSystem = null;
  try {
    const { data: moduleRow } = await supabaseClient
      .from('gtm_modules')
      .select('profile')
      .eq('company_id', companyId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    goalSystem = moduleRow?.profile?.goal_system || moduleRow?.profile?.goals || null;
  } catch {
    // Goal context is additive; performance review still works for legacy workspaces.
  }
  const goalAlignment = goalSystem ? {
    north_star_metric: goalSystem.north_star_metric || null,
    metric_definition: goalSystem.metric_definition || null,
    quantified_target: goalSystem.quantified_target || null,
    timeline_target: goalSystem.timeline_target || null,
    status: 'leading_indicators_only',
    note: 'Content engagement is a leading indicator. North-Star attainment must be verified from the business outcome connector, not inferred from views or posts.',
  } : null;

  const recommendations = [];
  for (const platform of [...new Set((data || []).map((row) => row.platform))]) {
    const current = (data || []).filter((row) => row.platform === platform && row.published_at && new Date(row.published_at).getTime() >= now - days * 86400000);
    const baseline = (data || []).filter((row) => row.platform === platform && row.published_at && new Date(row.published_at).getTime() < now - days * 86400000);
    // No recommendation until there are at least 3 comparable current items.
    if (current.length < 3 || baseline.length < 3) continue;
    const currentRate = average(current, 'engagement_rate');
    const baselineRate = average(baseline, 'engagement_rate');
    if (currentRate == null || baselineRate == null || baselineRate === 0) continue;
    const delta = (currentRate - baselineRate) / baselineRate;
    if (Math.abs(delta) < 0.2) continue;
    recommendations.push({
      platform,
      direction: delta > 0 ? 'increase' : 'investigate',
      confidence: current.length >= 5 ? 'medium' : 'low',
      evidence: { current_items: current.length, baseline_items: baseline.length, current_engagement_rate: currentRate, baseline_engagement_rate: baselineRate, relative_change: delta },
      recommendation: delta > 0
        ? `Keep testing ${platform} content and consider increasing its share of the calendar.`
        : `Review the last ${current.length} ${platform} posts for topic, format, hook, and distribution changes before increasing volume.`,
      requires_approval: true,
      goal_alignment: goalAlignment,
    });
  }
  if (recommendations.length) {
    await supabaseClient.from('content_course_corrections').insert(recommendations.map((item) => ({ company_id: companyId, source: 'content_performance', recommendation: item, status: 'pending' })));
  }
  return { status: 'completed', recommendations, reviewed_items: (data || []).length, goal_alignment: goalAlignment, reviewed_at: new Date().toISOString() };
}
