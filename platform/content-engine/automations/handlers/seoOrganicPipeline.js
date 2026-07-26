/**
 * SEO Organic Pipeline
 * ====================
 * Research → plan → article execution.
 *
 * Stages:
 *   1. Optional Semrush / Ahrefs (enrich when connected)
 *   2. Else: estimate keyword volume via Groq compound web_search
 *   3. Organic keyword inventory
 *   4. Topical authority score + gaps
 *   5. Topic clusters (hub + spokes)
 *   6. SEO plan sized to GTM quantified_target + timeline
 *   7. Optional: execute create_seo_article for priority queue
 */

import {
  executeComposioActionForEntities,
  composioEntityCandidates,
} from '../../mcp-router.js';
import { createSeoArticle } from './contentCreation.js';
import {
  SEO_PIPELINE_AHREFS_TOOLS,
  SEO_PIPELINE_GSC_TOOLS,
  SEO_PIPELINE_SEMRUSH_TOOLS,
} from '../../lib/seoToolkitCatalog.js';
import { getPreferredGscSiteUrl } from '../../connector-preferences.js';

const SEO_TOOLKITS = ['semrush', 'ahrefs', 'gsc'];

function asString(v, fallback = '') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function normalizeDomain(input) {
  let s = asString(input).toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return s;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseTimelineDays(raw) {
  const s = String(raw || '').toLowerCase();
  const m = s.match(/(\d+)\s*d/);
  if (m) return Number(m[1]);
  if (/30/.test(s)) return 30;
  if (/60/.test(s)) return 60;
  if (/90/.test(s)) return 90;
  if (/180|6\s*mo/.test(s)) return 180;
  return 90;
}

/** Extract leading number from GTM quantified_target enums / free text */
function parseQuantifiedNumber(raw) {
  const s = String(raw || '').toLowerCase().replace(/,/g, '');
  if (!s) return null;
  const m =
    s.match(/(\d+(?:\.\d+)?)\s*k/) ||
    s.match(/(\d+(?:\.\d+)?)\s*m/) ||
    s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (/k_|\dk|k\b|100k/.test(s) && !/\d+k_qualified/.test(s)) {
    if (s.includes('100k') || /reach|impression|traffic/.test(s)) n = n >= 1000 ? n : n * 1000;
  }
  if (/m\b|million/.test(s) && n < 1000) n *= 1_000_000;
  return Number.isFinite(n) ? n : null;
}

function classifyGoalKind(quantified) {
  const s = String(quantified || '').toLowerCase();
  if (/lead|sql|mql|demo|trial|signup|sign.?up/.test(s)) return 'leads';
  if (/reach|impression|traffic|visit|session|view/.test(s)) return 'traffic';
  if (/revenue|arr|mrr|\$|sales/.test(s)) return 'revenue';
  return 'growth';
}

/**
 * Map GTM numeric goal → organic article volume for the timeline.
 * Conservative: content is an assist channel, not the only acquisition lever.
 */
export function articlesNeededForGoal({ quantified_target, timeline_target, channel_bet }) {
  const days = parseTimelineDays(timeline_target);
  const n = parseQuantifiedNumber(quantified_target);
  const kind = classifyGoalKind(quantified_target);
  const seoBet = /content_seo|seo|organic|blog/.test(String(channel_bet || '').toLowerCase());
  const weight = seoBet ? 1 : 0.55;

  let articles = 8;
  if (n != null) {
    if (kind === 'leads') {
      // ~1 assisted lead per 8–12 articles; floor 4, cap 40 for the window
      articles = Math.ceil((n / 10) * weight);
    } else if (kind === 'traffic') {
      // ~2–5k incremental organic sessions per strong article over 90d (order-of-magnitude)
      articles = Math.ceil((n / 4000) * weight);
    } else if (kind === 'revenue') {
      articles = Math.ceil((Math.min(n, 500) / 25) * weight);
    } else {
      articles = Math.ceil(8 * weight);
    }
  }

  // Pace by timeline (90d baseline)
  articles = Math.round(articles * (days / 90));
  articles = Math.max(4, Math.min(40, articles));

  const perWeek = Math.max(1, Math.round((articles / Math.max(days, 7)) * 7));

  return {
    articles_total: articles,
    articles_per_week: perWeek,
    timeline_days: days,
    goal_kind: kind,
    goal_number: n,
    seo_channel_bet: seoBet,
    weight,
  };
}

async function loadGtmGoals(supabaseClient, companyId) {
  if (!supabaseClient || !companyId) return {};
  try {
    let { data } = await supabaseClient
      .from('gtm_modules')
      .select('profile, status, updated_at, workspace_id, company_id')
      .eq('company_id', companyId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (!data?.length) {
      const alt = await supabaseClient
        .from('gtm_modules')
        .select('profile, status, updated_at, workspace_id')
        .eq('workspace_id', companyId)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false })
        .limit(5);
      data = alt.data;
    }

    const locked =
      (data || []).find((m) => m.status === 'strategy_ready' || m.status === 'locked') ||
      (data || [])[0];
    const goals = locked?.profile?.goals || {};
    const onboarding = locked?.profile?.onboarding || locked?.profile?.company || {};
    return {
      objective: goals.priority_90d || null,
      quantified_target: goals.quantified_target || null,
      timeline_target: goals.timeline_target || null,
      budget_band: goals.budget_band || null,
      channel_bet: goals.channel_bet || null,
      website_url:
        onboarding.websiteUrl ||
        onboarding.website_url ||
        locked?.profile?.website_url ||
        null,
      brand_name: onboarding.brandName || onboarding.company_name || onboarding.name || null,
    };
  } catch (e) {
    console.warn('[seoOrganicPipeline] loadGtmGoals:', e.message);
    return {};
  }
}

async function loadWorkspaceDomain(supabaseClient, companyId) {
  if (!supabaseClient || !companyId) return '';
  try {
    const { data } = await supabaseClient
      .from('workspaces')
      .select('website_url, name')
      .eq('id', companyId)
      .maybeSingle();
    return {
      domain: normalizeDomain(data?.website_url || ''),
      name: data?.name || null,
    };
  } catch {
    return { domain: '', name: null };
  }
}

function isConnectionError(err) {
  return /no active|connect it in settings|no connected account|missing or stale|not connected|unauthorized|401|403/i.test(
    String(err || ''),
  );
}

async function runSeoTool(slug, args, entityIds) {
  const res = await executeComposioActionForEntities(slug, args, entityIds);
  if (res.error) {
    return { ok: false, error: res.error, slug, connection: isConnectionError(res.error) };
  }
  return { ok: true, result: res.result, slug };
}

function extractCsvRows(payload) {
  const text =
    typeof payload === 'string'
      ? payload
      : payload?.data || payload?.result || payload?.text || payload?.csv || '';
  if (typeof text !== 'string' || !text.includes(';')) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.keywords)) return payload.keywords;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }
  if (/ERROR\s*\d+/i.test(text)) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(';');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i];
    });
    return row;
  });
}

function normalizeKeywordRows(rows) {
  return (rows || [])
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const keyword =
        r.Ph || r.Keyword || r.keyword || r.phrase || r.query || r.term || '';
      const position = Number(r.Po || r.Position || r.position || r.best_position || 0) || null;
      const volume = Number(r.Nq || r.Volume || r.volume || r.search_volume || 0) || 0;
      const traffic = Number(r.Tr || r.Traffic || r.traffic || 0) || 0;
      const difficulty = Number(r.Kd || r.Difficulty || r.difficulty || r.kd || 0) || null;
      const url = r.Ur || r.Url || r.url || r.page || null;
      if (!keyword) return null;
      return {
        keyword: String(keyword),
        position,
        volume,
        traffic,
        difficulty,
        url: url ? String(url) : null,
      };
    })
    .filter(Boolean)
    .slice(0, 200);
}

async function fetchDomainMetrics({ domain, database, entityIds, preferred }) {
  const attempts = [];
  const order =
    preferred === 'ahrefs'
      ? ['ahrefs', 'semrush']
      : preferred === 'semrush'
        ? ['semrush', 'ahrefs']
        : ['ahrefs', 'semrush']; // prefer Ahrefs when both available (richer site explorer)

  let metrics = null;
  let keywords = [];
  let relatedTerms = [];
  let phraseQuestions = [];
  let competitors = [];
  let provider = null;
  let connectionOk = { semrush: false, ahrefs: false };
  const db = database || 'us';
  const country = db.slice(0, 2);

  for (const toolkit of order) {
    if (toolkit === 'semrush') {
      const kw = await runSeoTool(
        'SEMRUSH_DOMAIN_ORGANIC_SEARCH_KEYWORDS',
        {
          domain,
          database: db,
          display_limit: 100,
          display_sort: 'tr_desc',
          export_columns: 'Ph,Po,Nq,Tr,Kd,Ur',
        },
        entityIds,
      );
      attempts.push({ slug: kw.slug, ok: kw.ok, error: kw.error || null });
      if (kw.connection) {
        /* try next toolkit */
      } else if (kw.ok) {
        connectionOk.semrush = true;
        keywords = normalizeKeywordRows(extractCsvRows(kw.result));
        provider = provider || 'semrush';
      }

      const authority = await runSeoTool(
        'SEMRUSH_AUTHORITY_SCORE_PROFILE',
        { target: domain },
        entityIds,
      );
      attempts.push({ slug: authority.slug, ok: authority.ok, error: authority.error || null });
      if (authority.ok) {
        connectionOk.semrush = true;
        metrics = {
          provider: 'semrush',
          domain,
          raw: { authority: authority.result },
          summary: summarizeMetrics(authority.result, 'semrush'),
        };
        provider = 'semrush';
      }

      const backlinks = await runSeoTool(
        'SEMRUSH_BACKLINKS_OVERVIEW',
        { target: domain },
        entityIds,
      );
      attempts.push({ slug: backlinks.slug, ok: backlinks.ok, error: backlinks.error || null });
      if (backlinks.ok) {
        connectionOk.semrush = true;
        metrics = metrics || { provider: 'semrush', domain, raw: {}, summary: {} };
        metrics.raw = { ...(metrics.raw || {}), backlinks: backlinks.result };
        metrics.summary = {
          ...summarizeMetrics(backlinks.result, 'semrush'),
          ...(metrics.summary || {}),
        };
      }

      const pages = await runSeoTool(
        'SEMRUSH_DOMAIN_ORGANIC_PAGES',
        {
          domain,
          database: db,
          display_limit: 50,
          display_sort: 'tr_desc',
        },
        entityIds,
      );
      attempts.push({ slug: pages.slug, ok: pages.ok, error: pages.error || null });
      if (pages.ok) {
        connectionOk.semrush = true;
        metrics = metrics || { provider: 'semrush', domain, raw: {}, summary: {} };
        metrics.top_pages = extractCsvRows(pages.result).slice(0, 25);
        metrics.raw = { ...(metrics.raw || {}), pages: pages.result };
      }

      const comps = await runSeoTool(
        'SEMRUSH_COMPETITORS_IN_ORGANIC_SEARCH',
        { domain, database: db, display_limit: 20 },
        entityIds,
      );
      attempts.push({ slug: comps.slug, ok: comps.ok, error: comps.error || null });
      if (comps.ok) {
        connectionOk.semrush = true;
        competitors = extractCompetitorRows(comps.result);
      }

      // Secondary keywords + FAQ seeds from top ranking phrase
      const seedKw = keywords[0]?.keyword || domain.split('.')[0];
      if (seedKw) {
        const related = await runSeoTool(
          'SEMRUSH_RELATED_KEYWORDS',
          { phrase: seedKw, database: db, display_limit: 30 },
          entityIds,
        );
        attempts.push({ slug: related.slug, ok: related.ok, error: related.error || null });
        if (related.ok) {
          relatedTerms = extractPhraseList(related.result);
        }

        const questions = await runSeoTool(
          'SEMRUSH_PHRASE_QUESTIONS',
          { phrase: seedKw, database: db, display_limit: 20 },
          entityIds,
        );
        attempts.push({ slug: questions.slug, ok: questions.ok, error: questions.error || null });
        if (questions.ok) {
          phraseQuestions = extractPhraseList(questions.result);
        }
      }
    }

    if (toolkit === 'ahrefs') {
      const date = todayIso();
      const site = await runSeoTool(
        'AHREFS_RETRIEVE_SITE_EXPLORER_METRICS',
        {
          target: domain,
          date,
          mode: 'subdomains',
          protocol: 'both',
          country,
        },
        entityIds,
      );
      attempts.push({ slug: site.slug, ok: site.ok, error: site.error || null });
      if (site.connection) {
        /* try next */
      } else if (site.ok) {
        connectionOk.ahrefs = true;
        metrics = {
          provider: 'ahrefs',
          domain,
          raw: { site_explorer: site.result },
          summary: summarizeMetrics(site.result, 'ahrefs'),
        };
        provider = 'ahrefs';
      }

      const dr = await runSeoTool(
        'AHREFS_DOMAIN_RATING_FOR_SITE_EXPLORER',
        { target: domain, date },
        entityIds,
      );
      attempts.push({ slug: dr.slug, ok: dr.ok, error: dr.error || null });
      if (dr.ok) {
        connectionOk.ahrefs = true;
        metrics = metrics || { provider: 'ahrefs', domain, raw: {}, summary: {} };
        metrics.raw = { ...(metrics.raw || {}), domain_rating: dr.result };
        const drSummary = summarizeMetrics(dr.result, 'ahrefs');
        metrics.summary = { ...(metrics.summary || {}), ...drSummary };
      }

      const blStats = await runSeoTool(
        'AHREFS_BACKLINKS_STATS_RETRIEVAL',
        { target: domain, date, mode: 'subdomains' },
        entityIds,
      );
      attempts.push({ slug: blStats.slug, ok: blStats.ok, error: blStats.error || null });
      if (blStats.ok) {
        connectionOk.ahrefs = true;
        metrics = metrics || { provider: 'ahrefs', domain, raw: {}, summary: {} };
        metrics.raw = { ...(metrics.raw || {}), backlinks_stats: blStats.result };
      }

      const org = await runSeoTool(
        'AHREFS_RETRIEVE_ORGANIC_KEYWORDS',
        {
          target: domain,
          country,
          date,
          limit: 100,
          order_by: 'traffic:desc',
        },
        entityIds,
      );
      attempts.push({ slug: org.slug, ok: org.ok, error: org.error || null });
      if (org.ok) {
        connectionOk.ahrefs = true;
        const rows = Array.isArray(org.result?.keywords)
          ? org.result.keywords
          : Array.isArray(org.result)
            ? org.result
            : extractCsvRows(org.result);
        keywords = normalizeKeywordRows(rows);
        provider = provider || 'ahrefs';
      }

      const topPages = await runSeoTool(
        'AHREFS_RETRIEVE_TOP_PAGES_FROM_SITE_EXPLORER',
        { target: domain, date, country, limit: 50 },
        entityIds,
      );
      attempts.push({ slug: topPages.slug, ok: topPages.ok, error: topPages.error || null });
      if (topPages.ok) {
        connectionOk.ahrefs = true;
        metrics = metrics || { provider: 'ahrefs', domain, raw: {}, summary: {} };
        metrics.top_pages = Array.isArray(topPages.result?.pages)
          ? topPages.result.pages.slice(0, 25)
          : topPages.result;
      }

      const comps = await runSeoTool(
        'AHREFS_RETRIEVE_ORGANIC_COMPETITORS',
        { target: domain, country, date, limit: 20 },
        entityIds,
      );
      attempts.push({ slug: comps.slug, ok: comps.ok, error: comps.error || null });
      if (comps.ok) {
        connectionOk.ahrefs = true;
        competitors = extractCompetitorRows(comps.result);
      }

      const seedKw = keywords[0]?.keyword || domain.split('.')[0];
      if (seedKw) {
        const related = await runSeoTool(
          'AHREFS_RETRIEVE_RELATED_TERMS',
          { keyword: seedKw, country, limit: 30 },
          entityIds,
        );
        attempts.push({ slug: related.slug, ok: related.ok, error: related.error || null });
        if (related.ok) relatedTerms = extractPhraseList(related.result);

        const matching = await runSeoTool(
          'AHREFS_EXPLORE_MATCHING_TERMS_FOR_KEYWORDS',
          { keywords: [seedKw], country, limit: 30 },
          entityIds,
        );
        attempts.push({ slug: matching.slug, ok: matching.ok, error: matching.error || null });
        if (matching.ok) {
          relatedTerms = [...relatedTerms, ...extractPhraseList(matching.result)];
        }

        const suggestions = await runSeoTool(
          'AHREFS_SEARCH_SUGGESTIONS_EXPLORER',
          { keyword: seedKw, country, limit: 20 },
          entityIds,
        );
        attempts.push({ slug: suggestions.slug, ok: suggestions.ok, error: suggestions.error || null });
        if (suggestions.ok) {
          phraseQuestions = [
            ...phraseQuestions,
            ...extractPhraseList(suggestions.result).filter((p) => p.includes('?') || /^(how|what|why|when|where|who|can|does|is|are)\b/i.test(p)),
          ];
          relatedTerms = [...relatedTerms, ...extractPhraseList(suggestions.result)];
        }

        const overview = await runSeoTool(
          'AHREFS_EXPLORE_KEYWORDS_OVERVIEW',
          { keywords: [seedKw], country },
          entityIds,
        );
        attempts.push({ slug: overview.slug, ok: overview.ok, error: overview.error || null });
        if (overview.ok) {
          metrics = metrics || { provider: 'ahrefs', domain, raw: {}, summary: {} };
          metrics.raw = { ...(metrics.raw || {}), seed_keyword_overview: overview.result };
        }
      }
    }

    if (metrics || keywords.length) break;
  }

  // Dedupe enrichment lists
  relatedTerms = [...new Set(relatedTerms.map((s) => String(s).trim()).filter(Boolean))].slice(0, 40);
  phraseQuestions = [...new Set(phraseQuestions.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);

  return {
    metrics,
    keywords,
    relatedTerms,
    phraseQuestions,
    competitors,
    provider,
    connectionOk,
    attempts,
  };
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function pickGscSiteUrl(sites, domain, preferred) {
  const list = (sites || [])
    .map((s) => String(s?.siteUrl || s?.site_url || s?.id || s || '').trim())
    .filter(Boolean);
  if (preferred && list.includes(preferred)) return preferred;
  if (preferred) return preferred;
  const domainLc = String(domain || '').toLowerCase();
  const exact =
    list.find((u) => u.toLowerCase() === `sc-domain:${domainLc}`) ||
    list.find((u) => u.toLowerCase().includes(domainLc));
  return exact || list[0] || null;
}

function extractGscRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.result?.rows)) return payload.result.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeGscQueryRows(rows) {
  return (rows || [])
    .map((r) => {
      const query = String(r?.keys?.[0] || r?.query || r?.keys || '').trim();
      if (!query || query.startsWith('http')) return null;
      const clicks = Math.round(Number(r.clicks || 0) || 0);
      const impressions = Math.round(Number(r.impressions || 0) || 0);
      const position = Number(r.position || 0) || null;
      const ctr = Number(r.ctr || 0) || null;
      return {
        keyword: query,
        position,
        volume: impressions, // GSC impressions as demand proxy
        traffic: clicks,
        difficulty: null,
        url: null,
        ctr,
        impressions,
        clicks,
        source: 'gsc',
        opportunity:
          position != null && position >= 8 && position <= 20 && impressions >= 30
            ? 'striking_distance'
            : clicks > 0
              ? 'winning'
              : 'monitor',
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function normalizeGscPageRows(rows) {
  return (rows || [])
    .map((r) => {
      const page = String(r?.keys?.[0] || r?.page || r?.url || '').trim();
      if (!page) return null;
      return {
        page,
        clicks: Math.round(Number(r.clicks || 0) || 0),
        impressions: Math.round(Number(r.impressions || 0) || 0),
        position: Number(r.position || 0) || null,
        ctr: Number(r.ctr || 0) || null,
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}

function mergeKeywordsWithGsc(baseKeywords, gscKeywords) {
  const byKey = new Map();
  for (const k of baseKeywords || []) {
    const key = String(k.keyword || '').toLowerCase();
    if (!key) continue;
    byKey.set(key, { ...k });
  }
  for (const g of gscKeywords || []) {
    const key = String(g.keyword || '').toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...g });
      continue;
    }
    byKey.set(key, {
      ...existing,
      position: existing.position ?? g.position,
      traffic: Math.max(Number(existing.traffic || 0), Number(g.traffic || 0)),
      volume: Math.max(Number(existing.volume || 0), Number(g.volume || 0)),
      clicks: g.clicks ?? existing.clicks,
      impressions: g.impressions ?? existing.impressions,
      ctr: g.ctr ?? existing.ctr,
      opportunity: g.opportunity || existing.opportunity,
      source: existing.source ? `${existing.source}+gsc` : 'gsc',
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.traffic || b.clicks || 0) - Number(a.traffic || a.clicks || 0) ||
      Number(b.volume || b.impressions || 0) - Number(a.volume || a.impressions || 0),
  );
}

/**
 * Pull live Search Console performance (optional enricher).
 * Uses GOOGLE_SEARCH_CONSOLE_* Composio tools only.
 */
async function fetchGscInsights({ domain, entityIds, companyId, siteUrlHint }) {
  const attempts = [];
  const preferred = siteUrlHint || (companyId ? getPreferredGscSiteUrl(companyId) : null);

  const listed = await runSeoTool('GOOGLE_SEARCH_CONSOLE_LIST_SITES', {}, entityIds);
  attempts.push({ slug: listed.slug, ok: listed.ok, error: listed.error || null });
  if (listed.connection) {
    return {
      ok: false,
      connection: true,
      connectionOk: false,
      siteUrl: null,
      queries: [],
      pages: [],
      sitemaps: [],
      strikingDistance: [],
      attempts,
      error: listed.error,
    };
  }

  const siteEntry =
    listed.result?.siteEntry ||
    listed.result?.data?.siteEntry ||
    listed.result?.sites ||
    listed.result?.data?.sites ||
    (Array.isArray(listed.result) ? listed.result : []);
  const siteUrl = pickGscSiteUrl(siteEntry, domain, preferred);

  if (!siteUrl) {
    return {
      ok: false,
      connectionOk: listed.ok,
      siteUrl: null,
      queries: [],
      pages: [],
      sitemaps: [],
      strikingDistance: [],
      attempts,
      error: 'gsc_site_not_found',
    };
  }

  // Soft validate preferred / matched property
  const siteMeta = await runSeoTool(
    'GOOGLE_SEARCH_CONSOLE_GET_SITE',
    { siteUrl, site_url: siteUrl },
    entityIds,
  );
  attempts.push({ slug: siteMeta.slug, ok: siteMeta.ok, error: siteMeta.error || null });

  const endDate = isoDaysAgo(3); // GSC data lag
  const startDate = isoDaysAgo(31);
  const analyticsArgs = {
    siteUrl,
    site_url: siteUrl,
    startDate,
    start_date: startDate,
    endDate,
    end_date: endDate,
    rowLimit: 50,
    row_limit: 50,
  };

  const queryRes = await runSeoTool(
    'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY',
    { ...analyticsArgs, dimensions: ['query'] },
    entityIds,
  );
  attempts.push({ slug: queryRes.slug, ok: queryRes.ok, error: queryRes.error || null });

  const pageRes = await runSeoTool(
    'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY',
    { ...analyticsArgs, dimensions: ['page'] },
    entityIds,
  );
  attempts.push({ slug: pageRes.slug, ok: pageRes.ok, error: pageRes.error || null });

  const smRes = await runSeoTool(
    'GOOGLE_SEARCH_CONSOLE_LIST_SITEMAPS',
    { siteUrl, site_url: siteUrl },
    entityIds,
  );
  attempts.push({ slug: smRes.slug, ok: smRes.ok, error: smRes.error || null });

  const queries = queryRes.ok ? normalizeGscQueryRows(extractGscRows(queryRes.result)) : [];
  const pages = pageRes.ok ? normalizeGscPageRows(extractGscRows(pageRes.result)) : [];
  const sitemaps = smRes.ok
    ? (smRes.result?.sitemap || smRes.result?.data?.sitemap || smRes.result?.sitemaps || []).slice(0, 10)
    : [];
  const strikingDistance = queries.filter((q) => q.opportunity === 'striking_distance');

  const connectionOk = listed.ok || queryRes.ok || pageRes.ok;
  return {
    ok: queries.length > 0 || pages.length > 0,
    connectionOk,
    siteUrl,
    queries,
    pages,
    sitemaps,
    strikingDistance,
    attempts,
    kpis: {
      clicks: queries.reduce((s, q) => s + (q.clicks || 0), 0),
      impressions: queries.reduce((s, q) => s + (q.impressions || 0), 0),
      query_count: queries.length,
      page_count: pages.length,
      striking_distance: strikingDistance.length,
    },
    error: null,
  };
}

function extractPhraseList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload
      .map((row) => {
        if (typeof row === 'string') return row;
        return row?.phrase || row?.keyword || row?.term || row?.Ph || row?.question || row?.suggestion || '';
      })
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  const rows = extractCsvRows(payload);
  if (rows.length) {
    return rows
      .map((r) => r.Ph || r.Keyword || r.keyword || r.phrase || r.Question || r.question || '')
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  if (Array.isArray(payload?.keywords)) return extractPhraseList(payload.keywords);
  if (Array.isArray(payload?.terms)) return extractPhraseList(payload.terms);
  if (Array.isArray(payload?.data)) return extractPhraseList(payload.data);
  if (Array.isArray(payload?.suggestions)) return extractPhraseList(payload.suggestions);
  return [];
}

function extractCompetitorRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.competitors)
      ? payload.competitors
      : extractCsvRows(payload);
  return rows
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const domain = r.Dn || r.domain || r.competitor || r.target || r.host || '';
      if (!domain) return null;
      return {
        domain: String(domain),
        competition: Number(r.Cr || r.competition || r.common_keywords || 0) || null,
        traffic: Number(r.Ot || r.traffic || r.org_traffic || 0) || null,
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Fallback when Semrush/Ahrefs are not connected:
 * use Groq compound web_search to estimate keyword volumes,
 * related terms, FAQ questions, and topical gaps for the domain.
 */
async function estimateKeywordsViaWebSearch({
  domain,
  brand,
  brand_context,
  database = 'us',
}) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: 'GROQ_API_KEY not configured',
      keywords: [],
      relatedTerms: [],
      phraseQuestions: [],
      competitors: [],
      metrics: null,
    };
  }

  const countryHint =
    database === 'in' || database === 'mobile-in'
      ? 'India'
      : database === 'uk' || database === 'gb'
        ? 'United Kingdom'
        : database === 'au'
          ? 'Australia'
          : 'United States / global English';

  const system = `You are an SEO researcher with web_search. Estimate realistic monthly search volumes and keyword opportunities for a website when Semrush/Ahrefs are unavailable.

Rules:
- Use web_search for: "[brand/domain] competitors", "[category] keywords", "search volume [keyword]", site/about pages.
- Volumes are ESTIMATES (label clearly). Prefer order-of-magnitude ranges grounded in public SERP competition signals.
- Never invent exact Ahrefs/Semrush scores you did not see.
- Return ONLY one JSON object (no markdown).`;

  const user = `Domain: ${domain}
Brand: ${brand || domain}
Brand context: ${brand_context || 'n/a'}
Market / DB hint: ${countryHint}

Search the web, then return JSON:
{
  "metrics": {
    "provider": "web_search_estimate",
    "summary": {
      "domain_rating": null,
      "organic_traffic": null,
      "organic_keywords": null,
      "estimated_category": "short category label",
      "confidence": "low|medium|high",
      "notes": "1-2 sentences on how estimates were formed"
    }
  },
  "keywords": [
    { "keyword": "phrase", "volume": 1200, "position": null, "traffic": 0, "difficulty": 35, "url": null, "estimated": true }
  ],
  "related_terms": ["..."],
  "phrase_questions": ["What is ...?", "How to ...?"],
  "competitors": [{ "domain": "competitor.com", "competition": null, "traffic": null }]
}

Need 15–40 keywords spanning head + mid-tail + long-tail. Include volume integers (monthly searches, estimated). Include 10+ related_terms and 8+ phrase_questions.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'groq/compound',
        temperature: 0.3,
        max_completion_tokens: 4000,
        compound_custom: {
          tools: { enabled_tools: ['web_search', 'visit_website'] },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      // Fallback: plain LLM estimate without compound tools
      console.warn('[seoOrganicPipeline] compound web_search failed', res.status, t.slice(0, 200));
      return estimateKeywordsViaLlmOnly({ domain, brand, brand_context, database, apiKey });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return estimateKeywordsViaLlmOnly({ domain, brand, brand_context, database, apiKey });
    }
    return normalizeWebEstimate(parsed);
  } catch (err) {
    console.warn('[seoOrganicPipeline] web_search estimate error:', err.message);
    return estimateKeywordsViaLlmOnly({ domain, brand, brand_context, database, apiKey });
  }
}

async function estimateKeywordsViaLlmOnly({ domain, brand, brand_context, database, apiKey }) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Estimate SEO keyword opportunities as JSON. Mark volumes as estimates. No invented tool scores.',
          },
          {
            role: 'user',
            content: `Domain ${domain}, brand ${brand || domain}, context ${brand_context || 'n/a'}, market ${database}.
Return JSON: { "metrics": { "provider":"llm_estimate", "summary": { "estimated_category":"", "confidence":"low", "notes":"" } }, "keywords":[{"keyword":"","volume":0,"position":null,"traffic":0,"difficulty":null,"url":null,"estimated":true}], "related_terms":[], "phrase_questions":[], "competitors":[{"domain":""}] }
Provide 20 keywords with estimated monthly volumes.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `llm_estimate_http_${res.status}`,
        keywords: [],
        relatedTerms: [],
        phraseQuestions: [],
        competitors: [],
        metrics: null,
      };
    }
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    return normalizeWebEstimate(parsed, 'llm_estimate');
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      keywords: [],
      relatedTerms: [],
      phraseQuestions: [],
      competitors: [],
      metrics: null,
    };
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeWebEstimate(parsed, providerOverride) {
  const keywords = normalizeKeywordRows(
    Array.isArray(parsed?.keywords) ? parsed.keywords : [],
  ).map((k) => ({ ...k, estimated: true }));
  const relatedTerms = Array.isArray(parsed?.related_terms)
    ? parsed.related_terms.map(String).filter(Boolean)
    : Array.isArray(parsed?.relatedTerms)
      ? parsed.relatedTerms.map(String).filter(Boolean)
      : [];
  const phraseQuestions = Array.isArray(parsed?.phrase_questions)
    ? parsed.phrase_questions.map(String).filter(Boolean)
    : Array.isArray(parsed?.phraseQuestions)
      ? parsed.phraseQuestions.map(String).filter(Boolean)
      : [];
  const competitors = Array.isArray(parsed?.competitors)
    ? parsed.competitors
        .map((c) => ({
          domain: String(c?.domain || c?.Dn || '').trim(),
          competition: c?.competition ?? null,
          traffic: c?.traffic ?? null,
        }))
        .filter((c) => c.domain)
    : [];

  const provider = providerOverride || parsed?.metrics?.provider || 'web_search_estimate';
  const summary = parsed?.metrics?.summary || {
    estimated_category: parsed?.category || null,
    confidence: 'low',
    notes: 'Web/LLM keyword volume estimates (Semrush/Ahrefs not connected)',
  };

  return {
    ok: keywords.length > 0,
    provider,
    keywords,
    relatedTerms,
    phraseQuestions,
    competitors,
    metrics: {
      provider,
      domain: null,
      estimated: true,
      raw: parsed?.metrics || {},
      summary: {
        ...summary,
        organic_keywords: keywords.length,
        domain_rating: summary.domain_rating ?? null,
        organic_traffic: summary.organic_traffic ?? null,
      },
    },
    error: keywords.length ? null : 'empty_web_estimate',
  };
}

function summarizeMetrics(raw, provider) {
  if (!raw || typeof raw !== 'object') {
    return { provider, note: 'raw metrics attached', keys: [] };
  }
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] != null) return raw[k];
      if (raw?.metrics?.[k] != null) return raw.metrics[k];
      if (raw?.data?.[k] != null) return raw.data[k];
    }
    return null;
  };
  return {
    provider,
    domain_rating: pick('domain_rating', 'domainRating', 'dr', 'authority_score', 'authorityScore'),
    organic_traffic: pick('org_traffic', 'organic_traffic', 'organicTraffic', 'traffic'),
    organic_keywords: pick('org_keywords', 'organic_keywords', 'organicKeywords', 'keywords'),
    referring_domains: pick('refdomains', 'referring_domains', 'referringDomains'),
    keys: Object.keys(raw).slice(0, 20),
  };
}

async function synthesizeAuthorityAndPlan({
  domain,
  brand,
  keywords,
  metrics,
  relatedTerms = [],
  phraseQuestions = [],
  competitors = [],
  gscInsights = null,
  gtmGoals,
  volumeTarget,
  brand_context,
}) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    return fallbackPlan({ domain, keywords, relatedTerms, phraseQuestions, gtmGoals, volumeTarget });
  }

  const prompt = `You are an SEO strategist building a topical authority plan from live ranking data (Ahrefs/Semrush) plus Google Search Console performance when available.

Domain: ${domain}
Brand: ${brand || 'n/a'}
Brand context: ${brand_context || 'n/a'}

GTM goals:
${JSON.stringify(gtmGoals, null, 2)}

Numeric article target for this window: ${volumeTarget.articles_total} articles (~${volumeTarget.articles_per_week}/week over ${volumeTarget.timeline_days} days). Goal kind: ${volumeTarget.goal_kind}. Goal number: ${volumeTarget.goal_number}.

Domain metrics summary:
${JSON.stringify(metrics?.summary || metrics || {}, null, 2)}

Organic competitors (live):
${JSON.stringify((competitors || []).slice(0, 15), null, 2)}

Top organic keywords (live / merged with GSC):
${JSON.stringify(keywords.slice(0, 80), null, 2)}

Google Search Console (last ~28d, when connected):
${JSON.stringify(
  gscInsights
    ? {
        siteUrl: gscInsights.siteUrl,
        kpis: gscInsights.kpis,
        striking_distance_queries: (gscInsights.strikingDistance || []).slice(0, 25),
        top_queries: (gscInsights.queries || []).slice(0, 25),
        top_pages: (gscInsights.pages || []).slice(0, 15),
      }
    : { connected: false },
  null,
  2,
)}

Related / matching terms (for secondary keywords):
${JSON.stringify((relatedTerms || []).slice(0, 40), null, 2)}

Phrase questions / suggestion seeds (for FAQ):
${JSON.stringify((phraseQuestions || []).slice(0, 20), null, 2)}

Return ONLY JSON:
{
  "topical_authority": {
    "score": 0-100,
    "strengths": ["..."],
    "gaps": ["..."],
    "rationale": "2-3 sentences"
  },
  "topic_clusters": [
    {
      "pillar": "hub topic",
      "intent": "informational|commercial|transactional",
      "authority_role": "defend|expand|conquer",
      "spokes": ["keyword1", "keyword2"],
      "priority": 1
    }
  ],
  "article_queue": [
    {
      "keyword": "exact primary target keyword",
      "secondary_keywords": ["related phrase 1", "related phrase 2", "related phrase 3"],
      "faq_questions": ["Question one?", "Question two?", "Question three?", "Question four?"],
      "topic": "working title",
      "cluster": "pillar name",
      "intent": "...",
      "priority": 1,
      "estimated_impact": "high|medium|low",
      "why": "one line linking to GTM numeric goal",
      "word_count_target": 1200
    }
  ],
  "goal_alignment": {
    "quantified_target": "...",
    "timeline_target": "...",
    "articles_planned": number,
    "expected_contribution": "how these articles move the numeric goal",
    "milestones": [{ "week": 2, "articles": 2, "checkpoint": "..." }]
  }
}

Rules:
- Create exactly ${volumeTarget.articles_total} items in article_queue (or as close as data allows, min 4).
- Prefer GSC striking-distance queries (position 8–20, solid impressions) and mid-volume gaps over vanity head terms.
- Prefer refreshing / expanding topics for pages that already get GSC impressions with weak CTR.
- Never invent ranking numbers not in the source data.
- Prioritize clusters that support the GTM goal kind (${volumeTarget.goal_kind}).
- Every article_queue item MUST include 3–5 secondary_keywords drawn from related/matching terms (not duplicates of primary) and 4 faq_questions (prefer phrase-question seeds when relevant).
- Secondary keywords must be natural search phrases — never stuffed comma lists.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an SEO strategist. Return JSON only. Align article volume to GTM numeric goals. Prefer GSC striking-distance + live toolkit keywords. Do not invent metrics. Prefer live related terms for secondaries and phrase questions for FAQs.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[seoOrganicPipeline] groq plan failed', res.status, t.slice(0, 200));
      return fallbackPlan({ domain, keywords, relatedTerms, phraseQuestions, gtmGoals, volumeTarget });
    }
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    return normalizePlan(parsed, volumeTarget, gtmGoals, { relatedTerms, phraseQuestions });
  } catch (err) {
    console.warn('[seoOrganicPipeline] synthesize error:', err.message);
    return fallbackPlan({ domain, keywords, relatedTerms, phraseQuestions, gtmGoals, volumeTarget });
  }
}

function normalizePlan(parsed, volumeTarget, gtmGoals, enrich = {}) {
  const relatedPool = Array.isArray(enrich.relatedTerms) ? enrich.relatedTerms : [];
  const faqPool = Array.isArray(enrich.phraseQuestions) ? enrich.phraseQuestions : [];
  const clusters = Array.isArray(parsed?.topic_clusters) ? parsed.topic_clusters : [];
  let queue = Array.isArray(parsed?.article_queue) ? parsed.article_queue : [];
  if (queue.length > volumeTarget.articles_total) {
    queue = queue.slice(0, volumeTarget.articles_total);
  }
  queue = queue.map((item, idx) => {
    const primary = asString(item?.keyword || item?.topic, `topic-${idx + 1}`);
    let secondary = Array.isArray(item?.secondary_keywords)
      ? item.secondary_keywords.map(asString).filter(Boolean).slice(0, 6)
      : Array.isArray(item?.secondaryKeywords)
        ? item.secondaryKeywords.map(asString).filter(Boolean).slice(0, 6)
        : [];
    if (secondary.length < 3 && relatedPool.length) {
      secondary = [
        ...secondary,
        ...relatedPool.filter((k) => k.toLowerCase() !== primary.toLowerCase()),
      ].slice(0, 5);
    }
    let faqs = Array.isArray(item?.faq_questions)
      ? item.faq_questions.map(asString).filter(Boolean).slice(0, 6)
      : [];
    if (faqs.length < 4 && faqPool.length) {
      faqs = [...faqs, ...faqPool].slice(0, 6);
    }
    if (!faqs.length) {
      faqs = [
        `What is ${primary}?`,
        `How does ${primary} work?`,
        `Who is ${primary} for?`,
        `What are best practices for ${primary}?`,
      ];
    }
    return {
      ...item,
      keyword: primary,
      secondary_keywords: [...new Set(secondary.map((k) => k.trim()).filter(Boolean))]
        .filter((k) => k.toLowerCase() !== primary.toLowerCase())
        .slice(0, 5),
      faq_questions: [...new Set(faqs)].slice(0, 6),
    };
  });
  const authority = parsed?.topical_authority || {
    score: 50,
    strengths: [],
    gaps: ['Insufficient synthesis'],
    rationale: 'Fallback authority block',
  };
  const goal_alignment = {
    quantified_target: gtmGoals.quantified_target || null,
    timeline_target: gtmGoals.timeline_target || null,
    articles_planned: queue.length || volumeTarget.articles_total,
    articles_target: volumeTarget.articles_total,
    articles_per_week: volumeTarget.articles_per_week,
    timeline_days: volumeTarget.timeline_days,
    goal_kind: volumeTarget.goal_kind,
    expected_contribution:
      parsed?.goal_alignment?.expected_contribution ||
      `Publish ~${volumeTarget.articles_total} SEO articles over ${volumeTarget.timeline_days}d to support ${gtmGoals.quantified_target || 'GTM goal'}.`,
    milestones: Array.isArray(parsed?.goal_alignment?.milestones)
      ? parsed.goal_alignment.milestones
      : [],
  };
  return { topical_authority: authority, topic_clusters: clusters, article_queue: queue, goal_alignment };
}

function fallbackPlan({ domain, keywords, relatedTerms = [], phraseQuestions = [], gtmGoals, volumeTarget }) {
  const seeds = (keywords || []).slice(0, volumeTarget.articles_total);
  while (seeds.length < Math.min(4, volumeTarget.articles_total)) {
    seeds.push({
      keyword: `${domain} guide ${seeds.length + 1}`,
      volume: 0,
      position: null,
    });
  }
  const clusters = [
    {
      pillar: 'Core category education',
      intent: 'informational',
      authority_role: 'expand',
      spokes: seeds.slice(0, 5).map((k) => k.keyword),
      priority: 1,
    },
  ];
  const article_queue = seeds.slice(0, volumeTarget.articles_total).map((k, i) => ({
    keyword: k.keyword,
    secondary_keywords: relatedTerms
      .filter((t) => t.toLowerCase() !== String(k.keyword).toLowerCase())
      .slice(i * 3, i * 3 + 4)
      .concat(
        seeds
          .filter((_, j) => j !== i)
          .slice(0, 2)
          .map((x) => x.keyword),
      )
      .slice(0, 5),
    faq_questions: (phraseQuestions.length
      ? phraseQuestions.slice(i * 2, i * 2 + 4)
      : [
          `What is ${k.keyword}?`,
          `How does ${k.keyword} work?`,
          `Who should use ${k.keyword}?`,
          `What are common ${k.keyword} mistakes?`,
        ]
    ).slice(0, 6),
    topic: `Complete guide: ${k.keyword}`,
    cluster: 'Core category education',
    intent: 'informational',
    priority: i + 1,
    estimated_impact: i < 3 ? 'high' : 'medium',
    why: `Supports GTM ${gtmGoals.quantified_target || 'growth'} via organic coverage`,
    word_count_target: 1200,
  }));
  return normalizePlan(
    {
      topical_authority: {
        score: keywords.length ? 55 : 35,
        strengths: keywords.length ? ['Existing ranking inventory available'] : [],
        gaps: ['Need deeper cluster coverage', 'Connect more keyword data if sparse'],
        rationale:
          'Heuristic plan from keyword inventory because LLM synthesis was unavailable.',
      },
      topic_clusters: clusters,
      article_queue,
      goal_alignment: {},
    },
    volumeTarget,
    gtmGoals,
    { relatedTerms, phraseQuestions },
  );
}

/**
 * Stage pipeline: metrics → authority → clusters → goal-aligned SEO plan
 */
export async function buildSeoOrganicPlan(params = {}, companyId, supabaseClient) {
  const entityIds = composioEntityCandidates(companyId, params.workspace_id, params.workspaceId);
  const gtmGoals = await loadGtmGoals(supabaseClient, companyId);
  const workspace = await loadWorkspaceDomain(supabaseClient, companyId);

  const domain = normalizeDomain(
    params.domain || params.website_url || params.websiteUrl || gtmGoals.website_url || workspace.domain,
  );
  if (!domain) {
    return {
      status: 'error',
      error: 'domain_required',
      message: 'Provide a domain (or set workspace website URL) before running the SEO pipeline.',
      needs: { domain: true, connectors: SEO_TOOLKITS },
    };
  }

  const database = asString(params.database || params.country, 'us').toLowerCase();
  const preferred = asString(params.preferred_toolkit || params.toolkit, '').toLowerCase();
  const brand_context = asString(params.brand_context || params.brandContext, '');
  const brand = asString(params.brand || gtmGoals.brand_name || workspace.name, domain);

  const volumeTarget = articlesNeededForGoal({
    quantified_target: params.quantified_target || gtmGoals.quantified_target,
    timeline_target: params.timeline_target || gtmGoals.timeline_target,
    channel_bet: params.channel_bet || gtmGoals.channel_bet,
  });

  const fetched = await fetchDomainMetrics({ domain, database, entityIds, preferred });
  const gsc = await fetchGscInsights({
    domain,
    entityIds,
    companyId,
    siteUrlHint: asString(params.gsc_site_url || params.gscSiteUrl || params.site_url, ''),
  });

  const connectionOk = {
    ...fetched.connectionOk,
    gsc: Boolean(gsc.connectionOk),
  };
  const liveConnected = connectionOk.semrush || connectionOk.ahrefs;
  const gscConnected = connectionOk.gsc;
  let dataSource = fetched.provider || null;
  let keywords = fetched.keywords || [];
  let metrics = fetched.metrics;
  let relatedTerms = fetched.relatedTerms || [];
  let phraseQuestions = fetched.phraseQuestions || [];
  let competitors = fetched.competitors || [];
  let estimateMeta = null;

  // Semrush/Ahrefs optional — fall back to web_search volume estimates
  if (!keywords.length || (!liveConnected && !metrics)) {
    const estimate = await estimateKeywordsViaWebSearch({
      domain,
      brand,
      brand_context,
      database,
    });
    estimateMeta = {
      ok: estimate.ok,
      provider: estimate.provider || 'web_search_estimate',
      error: estimate.error || null,
    };
    if (estimate.ok) {
      if (!keywords.length) keywords = estimate.keywords;
      if (!relatedTerms.length) relatedTerms = estimate.relatedTerms;
      if (!phraseQuestions.length) phraseQuestions = estimate.phraseQuestions;
      if (!competitors.length) competitors = estimate.competitors;
      if (!metrics) metrics = estimate.metrics;
      dataSource = liveConnected ? fetched.provider : estimate.provider || 'web_search_estimate';
    }
  }

  // Merge GSC queries (impressions/clicks/position) into keyword inventory
  if (gsc.queries?.length) {
    keywords = mergeKeywordsWithGsc(keywords, gsc.queries);
    if (!dataSource || String(dataSource).includes('estimate')) {
      dataSource = liveConnected ? fetched.provider : 'gsc+web_estimate';
    } else if (gscConnected) {
      dataSource = `${dataSource}+gsc`;
    }
  }

  // If toolkit/estimate failed but GSC has queries, use those as the seed set
  if (!keywords.length && gsc.queries?.length) {
    keywords = gsc.queries;
    dataSource = 'gsc';
  }

  if (!keywords.length) {
    return {
      status: 'error',
      error: 'seo_research_failed',
      message:
        'Could not load Semrush/Ahrefs/GSC data or estimate keywords via web search. Check GROQ_API_KEY, or connect Semrush, Ahrefs, or Search Console.',
      needs: { connectors: SEO_TOOLKITS, optional: true, domain: false },
      domain,
      tool_attempts: [...(fetched.attempts || []), ...(gsc.attempts || [])],
      estimate: estimateMeta,
      gsc: {
        ok: gsc.ok,
        connectionOk: gsc.connectionOk,
        siteUrl: gsc.siteUrl,
        error: gsc.error,
      },
      stages: {
        connectors: {
          ok: liveConnected || gscConnected,
          connected: connectionOk,
          optional: true,
        },
        web_estimate: estimateMeta,
        gsc_performance: { ok: gsc.ok, error: gsc.error },
      },
      gtm_goals: gtmGoals,
      volume_target: volumeTarget,
    };
  }

  const plan = await synthesizeAuthorityAndPlan({
    domain,
    brand,
    keywords,
    metrics,
    relatedTerms,
    phraseQuestions,
    competitors,
    gscInsights: gsc.ok || gscConnected ? gsc : null,
    gtmGoals: {
      ...gtmGoals,
      quantified_target: params.quantified_target || gtmGoals.quantified_target,
      timeline_target: params.timeline_target || gtmGoals.timeline_target,
      channel_bet: params.channel_bet || gtmGoals.channel_bet,
    },
    volumeTarget,
    brand_context,
  });

  const usingEstimate =
    String(dataSource || '').includes('estimate') || String(dataSource || '').includes('web_search');
  const liveSources = [liveConnected && 'Semrush/Ahrefs', gscConnected && 'Search Console']
    .filter(Boolean)
    .join(' + ');

  return {
    status: 'success',
    domain,
    database,
    provider: dataSource,
    data_source: usingEstimate && !gscConnected
      ? 'web_search_estimate'
      : gscConnected && !liveConnected && usingEstimate
        ? 'gsc+web_search_estimate'
        : gscConnected || liveConnected
          ? 'live_seo_toolkit'
          : usingEstimate
            ? 'web_search_estimate'
            : 'live_seo_toolkit',
    connectors: connectionOk,
    connectors_optional: true,
    gsc: {
      ok: gsc.ok,
      connectionOk: gscConnected,
      siteUrl: gsc.siteUrl,
      kpis: gsc.kpis || null,
      striking_distance: (gsc.strikingDistance || []).slice(0, 20),
      top_queries: (gsc.queries || []).slice(0, 20),
      top_pages: (gsc.pages || []).slice(0, 15),
      sitemaps: gsc.sitemaps || [],
    },
    stages: {
      connectors: {
        ok: liveConnected || gscConnected,
        connected: connectionOk,
        optional: true,
        note: liveSources
          ? `Using live ${liveSources} data`
          : 'Semrush/Ahrefs/GSC not connected — used web search keyword volume estimates',
      },
      domain_metrics: { ok: Boolean(metrics), data: metrics },
      organic_keywords: {
        ok: keywords.length > 0,
        count: keywords.length,
        sample: keywords.slice(0, 25),
        estimated: usingEstimate,
      },
      gsc_performance: {
        ok: gsc.ok,
        siteUrl: gsc.siteUrl,
        kpis: gsc.kpis,
        striking_distance_count: (gsc.strikingDistance || []).length,
        sample_queries: (gsc.queries || []).slice(0, 12),
        sample_pages: (gsc.pages || []).slice(0, 8),
      },
      related_terms: {
        ok: relatedTerms.length > 0,
        count: relatedTerms.length,
        sample: relatedTerms.slice(0, 20),
      },
      phrase_questions: {
        ok: phraseQuestions.length > 0,
        count: phraseQuestions.length,
        sample: phraseQuestions.slice(0, 12),
      },
      competitors: {
        ok: competitors.length > 0,
        count: competitors.length,
        sample: competitors.slice(0, 10),
      },
      web_estimate: estimateMeta,
      topical_authority: { ok: true, data: plan.topical_authority },
      topic_clusters: { ok: plan.topic_clusters.length > 0, data: plan.topic_clusters },
      seo_plan: { ok: plan.article_queue.length > 0, data: plan.article_queue },
      goal_alignment: { ok: true, data: plan.goal_alignment },
    },
    topical_authority: plan.topical_authority,
    topic_clusters: plan.topic_clusters,
    article_queue: plan.article_queue,
    goal_alignment: plan.goal_alignment,
    related_terms: relatedTerms,
    phrase_questions: phraseQuestions,
    competitors,
    volume_target: volumeTarget,
    gtm_goals: gtmGoals,
    tool_attempts: [...(fetched.attempts || []), ...(gsc.attempts || [])],
    toolkit_tools: {
      semrush: SEO_PIPELINE_SEMRUSH_TOOLS,
      ahrefs: SEO_PIPELINE_AHREFS_TOOLS,
      gsc: SEO_PIPELINE_GSC_TOOLS,
    },
    next_actions: [
      liveSources
        ? 'Review topic clusters and priority queue (GSC striking-distance prioritized when available)'
        : 'Optional: connect Semrush/Ahrefs/GSC for live ranking + query performance',
      'Run execute_seo_plan_articles for the top N keywords',
      'Publish via Webflow / WordPress / Content Studio go-live',
      gscConnected ? 'After publish: submit/verify sitemap via GOOGLE_SEARCH_CONSOLE_SUBMIT_SITEMAP' : null,
    ].filter(Boolean),
    message: usingEstimate && !gscConnected
      ? `SEO plan ready for ${domain} via web-search volume estimates (${plan.article_queue.length} articles). Connect Semrush/Ahrefs/GSC anytime for live data.`
      : `SEO plan ready for ${domain}: ${plan.article_queue.length} articles aligned to ${plan.goal_alignment.quantified_target || 'GTM goal'} over ${volumeTarget.timeline_days}d${gscConnected ? ' (enriched with Search Console)' : ''}.`,
  };
}

/**
 * Execute priority articles from a plan (create_seo_article × N).
 */
export async function executeSeoPlanArticles(params = {}, companyId, supabaseClient) {
  const queue = Array.isArray(params.article_queue)
    ? params.article_queue
    : Array.isArray(params.articles)
      ? params.articles
      : [];

  let plan = null;
  if (!queue.length) {
    plan = await buildSeoOrganicPlan(params, companyId, supabaseClient);
    if (plan.status !== 'success') return plan;
  }

  const articles = (queue.length ? queue : plan.article_queue || []).slice(
    0,
    Math.min(Number(params.limit) || 3, 5),
  );

  if (!articles.length) {
    return { status: 'error', error: 'empty_article_queue', message: 'No articles to write.' };
  }

  const brand_context = asString(params.brand_context, '');
  const target_audience = asString(params.target_audience, 'everyday consumers');
  const market_type = asString(params.market_type || params.marketType, '');
  const results = [];

  for (const item of articles) {
    const keyword = asString(item.keyword || item.topic);
    if (!keyword) continue;
    const article = await createSeoArticle(
      {
        keyword,
        primary_keyword: keyword,
        secondary_keywords: Array.isArray(item.secondary_keywords)
          ? item.secondary_keywords
          : item.secondaryKeywords,
        faq_questions: Array.isArray(item.faq_questions) ? item.faq_questions : item.faqQuestions,
        topic: asString(item.topic, keyword),
        word_count_target: Number(item.word_count_target) || 1200,
        target_audience,
        brand_context: brand_context || `SEO cluster: ${item.cluster || 'organic'}`,
        market_type: market_type || undefined,
        humanize: params.humanize,
        site_url: params.site_url || params.siteUrl,
        brand_name: params.brand_name || params.brandName,
      },
      companyId,
    );
    results.push({
      keyword,
      secondary_keywords: item.secondary_keywords || [],
      topic: item.topic,
      priority: item.priority,
      cluster: item.cluster,
      article,
    });
  }

  const ok = results.filter((r) => r.article?.status === 'success' || r.article?.html).length;

  return {
    status: ok ? 'success' : 'error',
    written: ok,
    attempted: results.length,
    results,
    plan_snapshot: plan
      ? {
          domain: plan.domain,
          goal_alignment: plan.goal_alignment,
          topical_authority: plan.topical_authority,
        }
      : params.plan_snapshot || null,
    message: `Wrote ${ok}/${results.length} SEO articles from the goal-aligned plan.`,
  };
}
