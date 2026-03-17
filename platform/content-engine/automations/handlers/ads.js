/**
 * Ads Intelligence Handler
 * ========================
 * Scrapes competitor ads from LinkedIn, Facebook, and Google using Apify MCP.
 * Stores structured ad data in competitor_ads table for competitive intelligence
 * and budget optimization context.
 *
 * params: {
 *   competitors: Array<{ name: string, linkedin_company?: string, facebook_page?: string, google_domain?: string }>
 *   platforms?:  string[]  'linkedin' | 'facebook' | 'google' (default: all)
 *   country?:    string    ISO 2-letter code (default: 'IN')
 *   limit?:      number    max ads per competitor per platform (default: 20)
 * }
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

const APIFY_BASE = 'https://api.apify.com/v2';

// ── Apify run + poll ──────────────────────────────────────────────────────────

async function runApifyActor(actorId, input) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  // Apify API uses ~ not / between username and actor name
  const safeActorId = actorId.replace('/', '~');

  // Start run
  const startResp = await fetch(`${APIFY_BASE}/acts/${safeActorId}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!startResp.ok) {
    const body = await startResp.text();
    throw new Error(`Apify start failed ${startResp.status}: ${body.slice(0, 300)}`);
  }
  const startData = await startResp.json();
  const runId = startData.data.id;
  const defaultDatasetId = startData.data.defaultDatasetId;

  // Poll until finished (max 5 min)
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const statusResp = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    const statusData = await statusResp.json();
    const status = statusData?.data?.status;
    if (status === 'SUCCEEDED') break;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${status} for actor ${actorId}`);
    }
  }

  // Fetch dataset items via datasetId (most reliable endpoint)
  const dataResp = await fetch(
    `${APIFY_BASE}/datasets/${defaultDatasetId}/items?token=${token}&limit=200`
  );
  const items = await dataResp.json();
  return Array.isArray(items) ? items : (items?.items || []);
}

// ── Platform scrapers ─────────────────────────────────────────────────────────

async function scrapeLinkedIn(competitorName, linkedinCompany, country, limit) {
  // Build LinkedIn Ad Library search URL for this company
  const companySlug = linkedinCompany.replace(/^https?:\/\/[^/]+\/company\//, '').replace(/\/$/, '');
  const searchUrl = `https://www.linkedin.com/ad-library/search?accountOwner=${encodeURIComponent(companySlug)}&countries=${country}&dateOption=last-30-days`;

  console.log(`[ads] LinkedIn scraping: ${competitorName} → ${searchUrl}`);
  const items = await runApifyActor('silva95gustavo/linkedin-ad-library-scraper', {
    startUrls: [{ url: searchUrl }],
    resultsLimit: limit,
    skipDetails: false,
  });

  return (items || []).map(item => ({
    competitor_name: competitorName,
    platform:        'linkedin',
    ad_id:           String(item.adId || item.id || Math.random().toString(36).slice(2)),
    advertiser:      item.advertiserName || item.companyName || competitorName,
    headline:        item.headline || item.title || null,
    body:            item.body || item.description || item.text || null,
    cta_text:        item.callToAction || item.cta || null,
    destination_url: item.landingPageUrl || item.url || null,
    media_type:      item.type || item.adType || null,
    media_url:       item.mediaUrl || item.imageUrl || item.videoUrl || null,
    targeting:       item.targeting ? JSON.parse(JSON.stringify(item.targeting)) : null,
    impressions_min: item.impressionsMin || null,
    impressions_max: item.impressionsMax || null,
    is_active:       item.isActive ?? true,
    start_date:      item.startDate || item.startedAt || null,
    end_date:        item.endDate || item.endedAt || null,
    raw_data:        item,
  }));
}

async function scrapeFacebook(competitorName, facebookPage, country, limit) {
  console.log(`[ads] Facebook scraping: ${competitorName} → ${facebookPage}`);
  const items = await runApifyActor('dz_omar/facebook-ads-scraper-pro', {
    searchAdvertisers: [facebookPage],
    maxResultsPerQuery: Math.max(limit, 10),  // actor minimum is 10
    countries: country,
    contentLanguages: ['en'],
    activeStatus: 'ALL',
    adType: 'ALL',
    mediaType: 'ALL',
    sortBy: 'SORT_BY_TOTAL_IMPRESSIONS',
  });

  return (items || []).map(item => ({
    competitor_name: competitorName,
    platform:        'facebook',
    ad_id:           String(item.id || item.adId || item.adArchiveID || Math.random().toString(36).slice(2)),
    advertiser:      item.pageName || item.advertiserName || competitorName,
    headline:        item.title || item.headline || null,
    body:            item.body || item.adCreativeBody || item.description || null,
    cta_text:        item.ctaText || item.callToAction?.type || null,
    destination_url: item.landingPageUrls?.[0] || item.linkUrl || null,
    media_type:      item.adCreativeMediaType || item.mediaType || null,
    media_url:       item.videoUrl || item.imageUrls?.[0] || null,
    targeting:       item.demographicDistribution
      ? { demographic: item.demographicDistribution, region: item.regionDistribution }
      : null,
    impressions_min: item.impressionsWith?.lowerBound || null,
    impressions_max: item.impressionsWith?.upperBound || null,
    spend_min:       item.spendWith?.lowerBound || null,
    spend_max:       item.spendWith?.upperBound || null,
    is_active:       item.isActive ?? null,
    start_date:      item.startDate || item.adDeliveryStartTime || null,
    end_date:        item.endDate || item.adDeliveryStopTime || null,
    raw_data:        item,
  }));
}

async function scrapeGoogle(competitorName, googleDomain, country, limit) {
  const searchUrl = `https://adstransparency.google.com/?region=${country.toUpperCase()}&domain=${encodeURIComponent(googleDomain)}`;
  console.log(`[ads] Google scraping: ${competitorName} → ${searchUrl}`);

  // ivanvs actor: reliable metadata extraction from Google Ads Transparency Center.
  // Note: Google does not expose ad copy text via the Transparency API — variants[] is always empty.
  // We store the creative page URL as destination_url so users can click through to view ads.
  const items = await runApifyActor('ivanvs/google-ads-scraper', {
    urls:       [{ url: searchUrl }],
    maxRecords: limit,
  });

  return (items || []).filter(item => item.creativeId || item.type !== 'NO_ADS').map(item => {
    const byRegion = item.stats?.byRegion?.[0] || {};
    return {
      competitor_name: competitorName,
      platform:        'google',
      ad_id:           item.creativeId || String(Math.random().toString(36).slice(2)),
      advertiser:      item.advertiser?.name || item.advertiserName || competitorName,
      headline:        item.variants?.[0]?.headline || null,
      body:            item.variants?.[0]?.description || null,
      cta_text:        null,
      destination_url: item.url || null,           // Transparency Center creative page URL
      media_type:      item.type || null,
      media_url:       null,
      targeting:       null,
      impressions_min: byRegion.impression?.min ?? null,
      impressions_max: byRegion.impression?.max ?? null,
      is_active:       item.lastShown ? true : null,
      start_date:      byRegion.firstShown || null,
      end_date:        byRegion.lastShown || item.lastShown?.split('T')[0] || null,
      raw_data:        item,
    };
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function adsIntelScrape(params, companyId, supabaseClient) {
  if (!supabaseClient) return { status: 'error', error: 'supabaseClient required' };
  if (!companyId)      return { status: 'error', error: 'companyId required' };
  if (!process.env.APIFY_TOKEN) return { status: 'error', error: 'APIFY_TOKEN not set' };

  const competitors = params.competitors || [];
  const platforms   = new Set(params.platforms || ['linkedin', 'facebook', 'google']);
  const country     = params.country || 'IN';
  const limit       = params.limit   || 20;

  if (!competitors.length) return { status: 'error', error: 'No competitors provided' };

  let totalNew = 0;
  const results = [];

  for (const competitor of competitors) {
    const { name, linkedin_company, facebook_page, google_domain } = competitor;
    console.log(`\n[ads] Processing competitor: ${name}`);

    const platformResults = [];

    // LinkedIn
    if (platforms.has('linkedin') && linkedin_company) {
      try {
        const ads = await scrapeLinkedIn(name, linkedin_company, country, limit);
        const stored = await upsertAds(supabaseClient, companyId, ads);
        totalNew += stored;
        platformResults.push({ platform: 'linkedin', scraped: ads.length, stored });
      } catch (err) {
        console.warn(`[ads] LinkedIn failed for ${name}: ${err.message}`);
        platformResults.push({ platform: 'linkedin', error: err.message });
      }
      await sleep(2000);
    }

    // Facebook
    if (platforms.has('facebook') && facebook_page) {
      try {
        const ads = await scrapeFacebook(name, facebook_page, country, limit);
        const stored = await upsertAds(supabaseClient, companyId, ads);
        totalNew += stored;
        platformResults.push({ platform: 'facebook', scraped: ads.length, stored });
      } catch (err) {
        console.warn(`[ads] Facebook failed for ${name}: ${err.message}`);
        platformResults.push({ platform: 'facebook', error: err.message });
      }
      await sleep(2000);
    }

    // Google
    if (platforms.has('google') && google_domain) {
      try {
        const ads = await scrapeGoogle(name, google_domain, country, limit);
        const stored = await upsertAds(supabaseClient, companyId, ads);
        totalNew += stored;
        platformResults.push({ platform: 'google', scraped: ads.length, stored });
      } catch (err) {
        console.warn(`[ads] Google failed for ${name}: ${err.message}`);
        platformResults.push({ platform: 'google', error: err.message });
      }
    }

    results.push({ competitor: name, platforms: platformResults });
  }

  const digest = results.map(r => {
    const lines = r.platforms.map(p =>
      p.error ? `  ${p.platform}: ✗ ${p.error}` : `  ${p.platform}: ${p.scraped} scraped, ${p.stored} new stored`
    ).join('\n');
    return `${r.competitor}:\n${lines}`;
  }).join('\n\n');

  return { status: 'completed', total_new: totalNew, results, digest };
}

async function upsertAds(supabaseClient, companyId, ads) {
  let stored = 0;
  for (const ad of ads) {
    const { error } = await supabaseClient
      .from('competitor_ads')
      .upsert({ company_id: companyId, ...ad }, { onConflict: 'company_id,platform,ad_id' });
    if (!error) stored++;
    else console.warn(`[ads] upsert error: ${error.message}`);
  }
  return stored;
}
