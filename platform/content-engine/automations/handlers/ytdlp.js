/**
 * yt-dlp YouTube Handler
 * ======================
 * Fetches latest videos + transcripts from YouTube channels using yt-dlp.
 * Deduplicates against youtube_videos table — only processes new videos.
 *
 * params: {
 *   company_id:        string
 *   channels:          Array<{ url: string, type: 'own'|'competitor', name?: string }>
 *   limit:             number  (videos per channel, default 20)
 *   fetch_transcripts: boolean (default true)
 * }
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── yt-dlp binary resolution ────────────────────────────────────────────────

async function getYtDlpBin() {
  // 1. Prefer yt-dlp-wrap auto-managed binary
  try {
    const { default: YTDlpWrap } = await import('yt-dlp-wrap');
    const wrap = new YTDlpWrap();
    const binPath = wrap.binaryPath;
    if (binPath) {
      try { await execFileAsync(binPath, ['--version']); return { bin: binPath, wrap }; } catch {}
    }
    console.log('[ytdlp] downloading yt-dlp binary...');
    await YTDlpWrap.downloadFromGithub();
    return { bin: new YTDlpWrap().binaryPath, wrap: new YTDlpWrap() };
  } catch {}

  // 2. Fallback: system yt-dlp
  for (const candidate of ['yt-dlp', '/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']) {
    try {
      await execFileAsync(candidate, ['--version']);
      return { bin: candidate, wrap: null };
    } catch {}
  }

  throw new Error('yt-dlp not found. Install with: pip3 install yt-dlp');
}

// ─── Supadata extract (POST + poll) ──────────────────────────────────────────

// Schema for structured video intelligence — used for all platforms (YT, IG, TW, FB)
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    summary:      { type: 'string',  description: '2-3 sentence summary of the video' },
    topics:       { type: 'array',   items: { type: 'string' }, description: 'Main topics covered' },
    key_messages: { type: 'array',   items: { type: 'string' }, description: 'Key takeaways or insights' },
    content_type: { type: 'string',  description: 'One of: educational, news_analysis, promotional, product_demo, social_campaign, event_recap, entertainment' },
    sentiment:    { type: 'string',  description: 'One of: bullish, bearish, neutral, promotional' },
    entities:     { type: 'array',   items: { type: 'string' }, description: 'Stocks, funds, indices, companies, people explicitly mentioned' },
    cta:          { type: 'string',  description: 'Call to action if any, else empty string' },
  },
  required: ['summary', 'topics', 'key_messages', 'content_type', 'sentiment', 'entities', 'cta'],
};

async function fetchExtractSupadata(videoUrl, { pollIntervalMs = 2000, timeoutMs = 120_000 } = {}) {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null;

  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

  try {
    // 1. Submit extraction job
    const submitResp = await fetch('https://api.supadata.ai/v1/extract', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: videoUrl, schema: EXTRACT_SCHEMA }),
    });

    if (!submitResp.ok) {
      const body = await submitResp.text().catch(() => '');
      console.warn(`[supadata/extract] submit failed ${submitResp.status}: ${body.slice(0, 120)}`);
      return null;
    }

    const { jobId } = await submitResp.json();
    if (!jobId) return null;

    // 2. Poll until completed or timeout
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      const pollResp = await fetch(`https://api.supadata.ai/v1/extract/${jobId}`, { headers });
      if (!pollResp.ok) continue;

      const result = await pollResp.json();

      if (result.status === 'completed') return result.data || null;
      if (result.status === 'failed') {
        console.warn(`[supadata/extract] job ${jobId} failed: ${result.error?.message || 'unknown'}`);
        return null;
      }
      // queued / active — keep polling
    }

    console.warn(`[supadata/extract] job ${jobId} timed out after ${timeoutMs}ms`);
    return null;
  } catch (err) {
    console.warn(`[supadata/extract] ${err.message}`);
    return null;
  }
}

// ─── Fetch channel video list ─────────────────────────────────────────────────

async function fetchChannelVideos(bin, channelUrl, limit = 20) {
  try {
    const { stdout } = await execFileAsync(bin, [
      '--flat-playlist',
      '--dump-json',
      '--playlist-end', String(limit),
      '--no-warnings',
      '--quiet',
      channelUrl,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean)
      .map(v => ({
        video_id:      v.id,
        title:         v.title || '',
        channel_id:    v.channel_id || v.uploader_id || '',
        channel_name:  v.channel || v.uploader || '',
        upload_date:   v.upload_date ? `${v.upload_date.slice(0,4)}-${v.upload_date.slice(4,6)}-${v.upload_date.slice(6,8)}` : null,
        duration_secs: v.duration || null,
        view_count:    v.view_count || null,
        thumbnail_url: v.thumbnail || null,
        url:           v.url || `https://www.youtube.com/watch?v=${v.id}`,
      }));
  } catch (err) {
    console.warn(`[ytdlp] fetchChannelVideos failed for ${channelUrl}: ${err.message}`);
    return [];
  }
}

// ─── Fetch full metadata + transcript for a single video ─────────────────────

async function fetchVideoDetail(bin, videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    // Metadata via yt-dlp
    const { stdout } = await execFileAsync(bin, [
      '--dump-json', '--no-warnings', '--quiet', videoUrl,
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 60_000 });

    const meta = JSON.parse(stdout.trim().split('\n').pop());

    // Structured intelligence + transcript via Supadata extract
    const intel = await fetchExtractSupadata(videoUrl);

    return {
      video_id:        meta.id,
      title:           meta.title || '',
      description:     (meta.description || '').slice(0, 2000),
      tags:            meta.tags || [],
      view_count:      meta.view_count || null,
      like_count:      meta.like_count || null,
      comment_count:   meta.comment_count || null,
      duration_secs:   meta.duration || null,
      upload_date:     meta.upload_date
        ? `${meta.upload_date.slice(0,4)}-${meta.upload_date.slice(4,6)}-${meta.upload_date.slice(6,8)}`
        : null,
      thumbnail_url:   meta.thumbnail || null,
      channel_id:      meta.channel_id || meta.uploader_id || '',
      channel_name:    meta.channel || meta.uploader || '',
      transcript:      null,
      transcript_lang: null,
      intelligence:    intel || null,
    };
  } catch (err) {
    console.warn(`[ytdlp] fetchVideoDetail failed for ${videoId}: ${err.message}`);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function ytDlpYoutubeFetch(params, companyId, supabaseClient) {
  const channels         = params.channels || [];
  const limit            = params.limit || 20;
  const fetchTranscripts = params.fetch_transcripts !== false; // default true

  if (!channels.length) {
    return { status: 'error', error: 'No channels provided', new_videos: 0 };
  }

  const { bin } = await getYtDlpBin();
  const results = [];
  let totalNew = 0;

  for (const ch of channels) {
    const { url: channelUrl, type: channelType = 'competitor', name: channelLabel } = ch;
    console.log(`[ytdlp] fetching ${channelType} channel: ${channelUrl}`);

    // 1. Get latest video list
    const videoList = await fetchChannelVideos(bin, channelUrl, limit);
    if (!videoList.length) continue;

    const videoIds = videoList.map(v => v.video_id);

    // 2. Check which IDs already exist in Supabase
    const { data: existing } = await supabaseClient
      .from('youtube_videos')
      .select('video_id')
      .eq('company_id', companyId)
      .in('video_id', videoIds);

    const existingIds = new Set((existing || []).map(r => r.video_id));
    const newVideos   = videoList.filter(v => !existingIds.has(v.video_id));

    console.log(`[ytdlp] ${channelUrl}: ${videoList.length} fetched, ${newVideos.length} new`);

    // 3. For each new video: fetch full detail + transcript
    const stored = [];
    for (const v of newVideos) {
      let detail = v;
      if (fetchTranscripts) {
        const full = await fetchVideoDetail(bin, v.video_id);
        if (full) detail = { ...v, ...full };
      }

      const row = {
        company_id:      companyId,
        channel_id:      detail.channel_id || videoList[0]?.channel_id || '',
        video_id:        detail.video_id,
        channel_name:    detail.channel_name || channelLabel || '',
        channel_type:    channelType,
        title:           detail.title,
        description:     detail.description || null,
        tags:            detail.tags || [],
        view_count:      detail.view_count,
        like_count:      detail.like_count || null,
        comment_count:   detail.comment_count || null,
        duration_secs:   detail.duration_secs,
        upload_date:     detail.upload_date,
        thumbnail_url:   detail.thumbnail_url,
        transcript:      detail.transcript || null,
        transcript_lang: detail.transcript_lang || null,
        intelligence:    detail.intelligence || null,
      };

      const { error } = await supabaseClient
        .from('youtube_videos')
        .upsert(row, { onConflict: 'company_id,video_id' });

      if (!error) stored.push(row);
      else console.warn(`[ytdlp] upsert failed for ${detail.video_id}: ${error.message}`);
    }

    // 4. Update last_fetched_at on youtube_channels
    await supabaseClient
      .from('youtube_channels')
      .upsert({
        company_id:     companyId,
        channel_url:    channelUrl,
        channel_id:     stored[0]?.channel_id || null,
        channel_name:   stored[0]?.channel_name || channelLabel || null,
        type:           channelType,
        last_fetched_at: new Date().toISOString(),
      }, { onConflict: 'company_id,channel_url' });

    totalNew += stored.length;
    results.push({
      channel:   channelUrl,
      type:      channelType,
      new_count: stored.length,
      videos:    stored.map(v => ({
        video_id:     v.video_id,
        title:        v.title,
        upload_date:  v.upload_date,
        view_count:   v.view_count,
        has_transcript: !!v.transcript,
      })),
    });
  }

  // 5. Build agent-readable digest
  const digest = results.map(r => {
    if (!r.new_count) return `${r.type} channel ${r.channel}: no new videos.`;
    const lines = r.videos.map(v =>
      `  - "${v.title}" (${v.upload_date}, ${(v.view_count || 0).toLocaleString()} views${v.has_transcript ? ', transcript ✓' : ''})`
    ).join('\n');
    return `${r.type} channel ${r.channel}: ${r.new_count} new video(s):\n${lines}`;
  }).join('\n\n');

  return {
    status:     'completed',
    new_videos: totalNew,
    channels:   results,
    digest,
  };
}
