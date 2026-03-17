/**
 * Social Intelligence Handler
 * ============================
 * For each company's active social_accounts, discovers recent posts and
 * extracts structured intelligence — using Supadata /extract only.
 *
 * Two-pass Supadata strategy (1 credit each):
 *   Pass 1 — profile URL  → extract list of recent post URLs
 *   Pass 2 — each post URL → extract intelligence (summary, topics, sentiment…)
 *
 * YouTube uses yt-dlp (free) for channel discovery, then Supadata /extract per video.
 *
 * params: {
 *   platforms?:    string[]  filter to specific platforms (default: all active)
 *   account_type?: string    'competitor' | 'own' | null (default: all)
 *   limit?:        number    max new posts to process per account (default: 5)
 * }
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const POLL_MS    = 2000;
const TIMEOUT_MS = 120_000;

// ── Schema: extract list of recent posts from a profile page ──────────────────

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    recent_posts: {
      type: 'array',
      description: 'List of recent posts, reels, or videos on this profile',
      items: {
        type: 'object',
        properties: {
          url:       { type: 'string', description: 'Full URL to the individual post, reel, or video' },
          caption:   { type: 'string', description: 'Post caption or title (first 100 chars)' },
          post_type: { type: 'string', description: 'video, reel, image, tweet, or post' },
        },
        required: ['url'],
      },
    },
  },
  required: ['recent_posts'],
};

// ── Schema: extract intelligence from a single post ───────────────────────────

const INTEL_SCHEMA = {
  type: 'object',
  properties: {
    summary:      { type: 'string', description: '2-3 sentence summary of the post content' },
    topics:       { type: 'array',  items: { type: 'string' }, description: 'Main topics covered' },
    key_messages: { type: 'array',  items: { type: 'string' }, description: 'Key takeaways or insights' },
    content_type: { type: 'string', description: 'One of: educational, news_analysis, promotional, product_demo, social_campaign, event_recap, entertainment' },
    sentiment:    { type: 'string', description: 'One of: bullish, bearish, neutral, promotional' },
    entities:     { type: 'array',  items: { type: 'string' }, description: 'Stocks, funds, companies, people explicitly mentioned' },
    cta:          { type: 'string', description: 'Call to action if any, else empty string' },
  },
  required: ['summary', 'topics', 'key_messages', 'content_type', 'sentiment', 'entities', 'cta'],
};

// ── Supadata /extract (POST + poll) ──────────────────────────────────────────

async function supadataExtract(url, schema) {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return { error: 'SUPADATA_API_KEY not set' };

  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

  try {
    const submitResp = await fetch('https://api.supadata.ai/v1/extract', {
      method: 'POST', headers,
      body: JSON.stringify({ url, schema }),
    });

    if (!submitResp.ok) {
      const body = await submitResp.text().catch(() => '');
      if (submitResp.status === 429) return { error: 'rate_limited' };
      return { error: `HTTP ${submitResp.status}: ${body.slice(0, 120)}` };
    }

    const { jobId } = await submitResp.json();
    if (!jobId) return { error: 'no jobId returned' };

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const pollResp = await fetch(`https://api.supadata.ai/v1/extract/${jobId}`, { headers });
      if (!pollResp.ok) continue;
      const result = await pollResp.json();
      if (result.status === 'completed') return { data: result.data };
      if (result.status === 'failed')    return { error: result.error?.message || result.details || 'job failed' };
    }
    return { error: 'timeout' };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Pass 1: discover recent post URLs from a profile ─────────────────────────

function profileUrl(platform, handle) {
  switch (platform) {
    case 'instagram': return `https://www.instagram.com/${handle}/`;
    case 'twitter':   return `https://x.com/${handle}`;
    case 'facebook':  return `https://www.facebook.com/${handle}`;
    default:          return null;
  }
}

async function discoverPostUrls(platform, handle, limit) {
  const pUrl = profileUrl(platform, handle);
  if (!pUrl) return [];

  console.log(`[social] discovering ${platform}/${handle} via Supadata`);
  const result = await supadataExtract(pUrl, PROFILE_SCHEMA);

  if (result.error) {
    console.warn(`[social] profile discovery failed for ${platform}/${handle}: ${result.error}`);
    return [];
  }

  const posts = result.data?.recent_posts || [];
  return posts
    .filter(p => p.url && p.url.startsWith('http'))
    .slice(0, limit)
    .map(p => ({ post_url: p.url, raw_data: { caption: p.caption, post_type: p.post_type } }));
}

// ── YouTube discovery (yt-dlp, free) ─────────────────────────────────────────

async function discoverYouTubePosts(handle, limit, sortBy = 'recent') {
  const channelUrl = handle.startsWith('http') ? handle : `https://www.youtube.com/@${handle}`;
  let bin = 'yt-dlp';
  for (const c of ['yt-dlp', '/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp']) {
    try { await execFileAsync(c, ['--version']); bin = c; break; } catch {}
  }

  // For top-views: fetch a larger pool then sort. For recent: just take first N.
  const fetchLimit = sortBy === 'views' ? Math.max(limit * 4, 50) : limit;

  try {
    const { stdout } = await execFileAsync(bin, [
      '--flat-playlist', '--dump-json',
      '--playlist-end', String(fetchLimit),
      '--no-warnings', '--quiet', channelUrl,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });

    let videos = stdout.trim().split('\n').filter(Boolean).map(line => {
      try {
        const v = JSON.parse(line);
        return {
          post_url: `https://www.youtube.com/watch?v=${v.id}`,
          raw_data: { video_id: v.id, title: v.title, view_count: v.view_count || 0, duration_secs: v.duration },
        };
      } catch { return null; }
    }).filter(Boolean);

    if (sortBy === 'views') {
      videos.sort((a, b) => (b.raw_data.view_count || 0) - (a.raw_data.view_count || 0));
    }

    // Filter out videos over Supadata's 55-min limit
    videos = videos.filter(v => !v.raw_data.duration_secs || v.raw_data.duration_secs <= 3300);

    return videos.slice(0, limit);
  } catch (err) {
    console.warn(`[social] YouTube discovery failed for ${handle}: ${err.message}`);
    return [];
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function socialIntelExtract(params, companyId, supabaseClient) {
  if (!supabaseClient) return { status: 'error', error: 'supabaseClient required' };
  if (!companyId)      return { status: 'error', error: 'companyId required' };

  const limit       = params.limit        || 5;
  const platforms   = params.platforms    || null;
  const accountType = params.account_type || null;
  const sortBy      = params.sort_by      || 'recent'; // 'recent' | 'views'

  // 1. Load active social accounts for this company
  let q = supabaseClient
    .from('social_accounts')
    .select('id, platform, handle, display_name, account_type')
    .eq('company_id', companyId)
    .eq('active', true);

  if (platforms?.length) q = q.in('platform', platforms);
  if (accountType)       q = q.eq('account_type', accountType);

  const { data: accounts, error: acctErr } = await q;
  if (acctErr)          return { status: 'error', error: acctErr.message };
  if (!accounts?.length) return { status: 'completed', message: 'No active social accounts configured', new_posts: 0 };

  console.log(`[social] ${accounts.length} accounts for company ${companyId}`);

  let totalNew = 0;
  const results = [];

  for (const { id: accountId, platform, handle, account_type } of accounts) {
    // 2. Discover recent post URLs (Pass 1)
    const discovered = platform === 'youtube'
      ? await discoverYouTubePosts(handle, limit, sortBy)
      : await discoverPostUrls(platform, handle, limit);

    if (!discovered.length) {
      results.push({ platform, handle, new_count: 0, note: 'no posts discovered' });
      continue;
    }

    // 3. Skip already-stored posts
    const urls = discovered.map(d => d.post_url);
    const { data: existing } = await supabaseClient
      .from('social_posts')
      .select('post_url')
      .eq('company_id', companyId)
      .in('post_url', urls);

    const existingUrls = new Set((existing || []).map(r => r.post_url));
    const newPosts = discovered.filter(d => !existingUrls.has(d.post_url));

    console.log(`[social] ${platform}/${handle}: ${discovered.length} found, ${newPosts.length} new`);

    // 4. Extract intelligence per new post (Pass 2)
    const stored = [];
    for (const post of newPosts) {
      process.stdout.write(`[social]   ${post.post_url.slice(0, 70)}... `);

      let result = await supadataExtract(post.post_url, INTEL_SCHEMA);

      if (result.error === 'rate_limited') {
        process.stdout.write('[rate-limited, 15s] ');
        await sleep(15_000);
        result = await supadataExtract(post.post_url, INTEL_SCHEMA);
      }

      if (result.data) {
        const { error: upsertErr } = await supabaseClient
          .from('social_posts')
          .upsert({
            company_id:   companyId,
            account_id:   accountId,
            platform,
            handle,
            account_type,
            post_url:     post.post_url,
            raw_data:     post.raw_data || null,
            intelligence: result.data,
            fetched_at:   new Date().toISOString(),
          }, { onConflict: 'company_id,post_url' });

        if (!upsertErr) {
          console.log(`✓ ${result.data.content_type} | ${result.data.sentiment}`);
          stored.push({ post_url: post.post_url, ...result.data });
        } else {
          console.log(`✗ DB: ${upsertErr.message}`);
        }
      } else {
        console.log(`✗ ${result.error}`);
      }

      await sleep(500);
    }

    // 5. Update last_fetched_at
    await supabaseClient
      .from('social_accounts')
      .update({ last_fetched_at: new Date().toISOString() })
      .eq('id', accountId);

    totalNew += stored.length;
    results.push({ platform, handle, account_type, new_count: stored.length, posts: stored });
  }

  const digest = results
    .filter(r => r.new_count > 0)
    .map(r => {
      const lines = r.posts.map(p =>
        `  - ${p.content_type} | ${p.sentiment} | ${p.summary?.slice(0, 80)}`
      ).join('\n');
      return `${r.platform}/${r.handle} (${r.account_type}): ${r.new_count} new post(s):\n${lines}`;
    }).join('\n\n');

  return {
    status:    'completed',
    new_posts: totalNew,
    accounts:  results,
    digest:    digest || 'No new posts found.',
  };
}
