/**
 * Ads Intelligence Analysis Handler
 * ==================================
 * Fetches competitor_ads for a company, combines with MKG positioning context,
 * runs Groq analysis, and stores the result in company_artifacts as 'ads_intel_analysis'.
 *
 * params: {} (no params needed — uses all stored ads for the company)
 */

import Groq from 'groq-sdk';
import { MKGService } from '../../mkg-service.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_ROOT = join(__dirname, '..', '..', '..', 'crewai', 'memory');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '' });

export async function adsIntelAnalyze(params, companyId, supabaseClient) {
  if (!supabaseClient) return { status: 'error', error: 'supabaseClient required' };
  if (!companyId)      return { status: 'error', error: 'companyId required' };

  // ── 1. Fetch all competitor ads ──────────────────────────────────────────────
  const { data: ads, error: adsError } = await supabaseClient
    .from('competitor_ads')
    .select('competitor_name,platform,headline,body,cta_text,media_type,is_active,start_date,end_date')
    .eq('company_id', companyId)
    .neq('headline', 'No ads found')
    .order('competitor_name')
    .order('platform');

  if (adsError) return { status: 'error', error: adsError.message };
  if (!ads || ads.length === 0) return { status: 'error', error: 'No ads data found. Run ads_intel_scrape first.' };

  // ── 2. Load MKG for positioning context ──────────────────────────────────────
  let positioning = null;
  let icp = null;
  let companyName = 'the company';
  try {
    const mkg = await MKGService.read(companyId);
    if (mkg) {
      positioning = mkg.positioning?.value || mkg.positioning;
      icp = mkg.icp?.value || mkg.icp;
    }
  } catch {}

  // Try to get company name from companies table
  try {
    const { data: co } = await supabaseClient
      .from('companies')
      .select('name,company_name')
      .eq('id', companyId)
      .single();
    companyName = co?.company_name || co?.name || companyName;
  } catch {}

  // ── 3. Structure ads by competitor + platform ─────────────────────────────────
  const byCompetitor = {};
  for (const ad of ads) {
    if (!byCompetitor[ad.competitor_name]) byCompetitor[ad.competitor_name] = {};
    if (!byCompetitor[ad.competitor_name][ad.platform]) byCompetitor[ad.competitor_name][ad.platform] = [];
    const copy = [ad.headline, ad.body].filter(Boolean).join(' — ');
    if (copy) byCompetitor[ad.competitor_name][ad.platform].push(copy);
    else byCompetitor[ad.competitor_name][ad.platform].push(`[${ad.media_type || 'ad'} — no copy available]`);
  }

  // Summary counts
  const platformCoverage = {};
  for (const [comp, platforms] of Object.entries(byCompetitor)) {
    platformCoverage[comp] = Object.entries(platforms).map(([p, items]) => `${p}(${items.length})`).join(', ');
  }

  // ── 4. Build prompt ───────────────────────────────────────────────────────────
  const positioningText = positioning
    ? (typeof positioning === 'string' ? positioning : JSON.stringify(positioning))
    : 'Not available';
  const icpText = icp
    ? (typeof icp === 'string' ? icp : JSON.stringify(icp?.segments?.map(s => s.segment) || icp))
    : 'HNIs and ultra-HNIs';

  const prompt = `You are a senior marketing strategist. Analyze competitor ad intelligence for ${companyName} in the Indian wealth management / broking / fintech space.

${companyName} positioning: ${positioningText}
${companyName} ICP: ${icpText}

COMPETITOR ADS DATA (organized by competitor → platform → ad copy):
${JSON.stringify(byCompetitor, null, 2)}

Platform coverage summary:
${Object.entries(platformCoverage).map(([c, p]) => `- ${c}: ${p}`).join('\n')}

Respond with a JSON object (no markdown, pure JSON) with this exact structure:
{
  "channel_gaps": [
    { "channel": "LinkedIn", "insight": "...", "competitors_active": ["..."], "recommendation": "..." }
  ],
  "messaging_themes": [
    { "theme": "...", "competitors": ["..."], "example_copy": "...", "angle": "performance_anxiety|legacy|speed|status|simplicity|trust" }
  ],
  "competitor_summary": [
    { "name": "...", "primary_message": "...", "icp_signal": "...", "ad_intensity": "high|medium|low|none" }
  ],
  "white_space": [
    { "opportunity": "...", "rationale": "..." }
  ],
  "recommended_angles": [
    { "headline": "...", "body": "...", "platform": "linkedin|facebook|google", "why": "..." }
  ],
  "generated_at": "${new Date().toISOString()}"
}

Be specific and India-market aware. recommended_angles should be 4-5 actual ad concepts tailored to ${companyName}'s HNI/ultra-HNI audience.`;

  // ── 5. Call Groq ──────────────────────────────────────────────────────────────
  let analysis;
  try {
    const resp = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });
    analysis = JSON.parse(resp.choices[0].message.content);
  } catch (err) {
    return { status: 'error', error: `LLM failed: ${err.message}` };
  }

  // ── 6. Store as file (same pattern as MKG) ───────────────────────────────────
  try {
    const dir = join(MEMORY_ROOT, companyId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'ads_analysis.json'),
      JSON.stringify({ analysis, updated_at: new Date().toISOString() }, null, 2)
    );
  } catch (e) {
    console.warn('[adsAnalysis] file write error:', e.message);
  }

  // Also try Supabase (best-effort, may fail FK constraint for some companies)
  try {
    await supabaseClient
      .from('company_artifacts')
      .upsert(
        { company_id: companyId, artifact_type: 'ads_intel_analysis', data: analysis },
        { onConflict: 'company_id,artifact_type' }
      );
  } catch {}

  return {
    status:    'completed',
    analysis,
    ads_count: ads.length,
    competitors_analyzed: Object.keys(byCompetitor).length,
  };
}
