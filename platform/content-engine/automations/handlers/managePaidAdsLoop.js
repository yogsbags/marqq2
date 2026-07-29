/**
 * Post-launch paid ads closed loop
 * =================================
 * Periodically:
 *  1. Pace conversions vs Goals quantified target + timeline
 *  2. Pause low performers / scale winning ad sets (Meta)
 *  3. Detect creative fatigue → generate angle variations → create new ads
 *  4. Identify winning creative + winning cohort (breakdown)
 *
 * Skill alignment (applied as executable rules):
 *  - paid-ads (Marqq marketingskills): objective metrics, 20–30% scale steps,
 *    wait 3–5d between increases, creative testing hierarchy (angle → hook → visual)
 *  - ads-budget: 20% Rule, 3x Kill Rule, min data before kill/scale
 *  - ads-creative: Meta fatigue (freq >5 prospecting; CTR −20%), 14–21d refresh,
 *    Andromeda-distinct concepts (not micro-variants), headline ≤40 / body ≤125
 *  - ab-test-setup: hypothesis per variant, primary metric = goal, min sample
 *    before calling a winner
 *
 * Enrolled campaigns live in scheduled_automations.params.enrolled
 * for automation_id = manage_paid_ads_loop (one row per company).
 */

import { tracedLLM } from '../../langfuse.js';
import { generateSocialImage } from './contentCreation.js';
import {
  executeComposioAction,
  metaGraphProxy,
} from '../../mcp-router.js';
import { getPreferredMetaAdAccountId } from '../../connector-preferences.js';

const LOOP_AUTOMATION_ID = 'manage_paid_ads_loop';
const DEFAULT_CRON = '0 */6 * * *';

/** Executable thresholds from ads-budget / ads-creative / paid-ads / ab-test-setup */
export const SKILL_RULES = {
  skills: ['paid-ads', 'ads-budget', 'ads-creative', 'ad-creative', 'ab-test-setup', 'marketing-ideas'],
  // ads-budget: 20% Rule — never increase budget >20% at a time
  budget_scale_factor: 1.2,
  // paid-ads / ads-budget: wait 3–5 days between scale increases
  min_days_between_scale: 3,
  // ads-budget 3x Kill Rule + min data gates
  kill_cpa_multiplier: 3,
  kill_roas_vs_target: 0.5, // ROAS < 50% of target → kill/pause
  min_spend_before_kill: 100, // major currency units (account currency)
  min_clicks_before_kill: 20,
  min_impressions_ctr_kill: 1000,
  // ads-creative Meta fatigue
  fatigue_frequency_prospecting: 5,
  fatigue_ctr_vs_avg: 0.8, // CTR < 80% of peer avg
  fatigue_refresh_days_meta: 21,
  // ab-test-setup: don't call winners early
  min_impressions_declare_winner: 1000,
  min_clicks_declare_winner: 50,
  // ads-creative Meta copy limits + Andromeda distinct angles
  headline_max: 40,
  primary_text_max: 125,
  variant_count_default: 3,
  variant_count_behind: 3,
  // Distinct frameworks (paid-ads copy templates) — not micro-edits
  angle_frameworks: ['PAS', 'BAB', 'social_proof', 'feature_benefit', 'direct_response'],
};

const CONVERSION_ACTIONS = [
  'lead',
  'purchase',
  'complete_registration',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_conversion.lead_grouped',
];

// ── Goal helpers ─────────────────────────────────────────────────────────────

export function parseQuantifiedTarget(raw) {
  const text = String(raw || '');
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'thousand') n *= 1000;
  if (unit === 'm' || unit === 'million') n *= 1_000_000;
  return Number.isFinite(n) ? n : null;
}

export function parseTimelineEnd(raw, enrolledAt = new Date()) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return new Date(iso);

  const daysMatch = text.match(/(\d+)\s*days?/i);
  if (daysMatch) {
    const d = new Date(enrolledAt);
    d.setUTCDate(d.getUTCDate() + parseInt(daysMatch[1], 10));
    return d;
  }

  const weeksMatch = text.match(/(\d+)\s*weeks?/i);
  if (weeksMatch) {
    const d = new Date(enrolledAt);
    d.setUTCDate(d.getUTCDate() + parseInt(weeksMatch[1], 10) * 7);
    return d;
  }

  const monthsMatch = text.match(/(\d+)\s*months?/i);
  if (monthsMatch) {
    const d = new Date(enrolledAt);
    d.setUTCMonth(d.getUTCMonth() + parseInt(monthsMatch[1], 10));
    return d;
  }

  // "by March 2026" / "March 31 2026"
  const named = Date.parse(text.replace(/^by\s+/i, ''));
  if (!Number.isNaN(named)) return new Date(named);

  return null;
}

export function computePacing({ target, achieved, timelineEnd, enrolledAt }) {
  if (!target || target <= 0) {
    return { status: 'no_target', expected: null, achieved: achieved || 0, pace_ratio: null, days_left: null };
  }
  const start = enrolledAt ? new Date(enrolledAt) : new Date();
  const end = timelineEnd ? new Date(timelineEnd) : null;
  const now = new Date();
  const totalMs = end ? Math.max(end - start, 1) : 90 * 24 * 60 * 60 * 1000;
  const elapsedMs = Math.min(Math.max(now - start, 0), totalMs);
  const progress = elapsedMs / totalMs;
  const expected = target * progress;
  const achievedN = Number(achieved) || 0;
  const pace_ratio = expected > 0 ? achievedN / expected : achievedN > 0 ? 1 : 0;
  const days_left = end ? Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000))) : null;

  let status = 'on_track';
  if (pace_ratio < 0.75) status = 'behind';
  else if (pace_ratio > 1.15) status = 'ahead';

  return {
    status,
    target,
    expected: Math.round(expected * 10) / 10,
    achieved: achievedN,
    pace_ratio: Math.round(pace_ratio * 100) / 100,
    days_left,
    timeline_end: end ? end.toISOString() : null,
  };
}

function sumConversions(actions = []) {
  return (actions || [])
    .filter((a) => CONVERSION_ACTIONS.includes(a.action_type))
    .reduce((s, a) => s + parseFloat(a.value || 0), 0);
}

function computeRoas(ins) {
  if (ins.purchase_roas?.length) {
    const r = ins.purchase_roas.find(
      (x) => x.action_type === 'omni_purchase' || x.action_type === 'purchase'
    );
    if (r) return parseFloat(r.value);
  }
  const spend = parseFloat(ins.spend || 0);
  if (spend <= 0) return null;
  const conversions = sumConversions(ins.actions);
  return conversions > 0 ? conversions / spend : 0;
}

function creativeFatigueCheck(ads, { enrolledAt } = {}) {
  const adsWithCtr = ads.map((ad) => ({
    ...ad,
    ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
  }));
  const withImpressions = adsWithCtr.filter((a) => a.impressions >= 100);
  const averageCtr =
    withImpressions.length > 0
      ? withImpressions.reduce((sum, ad) => sum + ad.ctr, 0) / withImpressions.length
      : adsWithCtr.length > 0
        ? adsWithCtr.reduce((sum, ad) => sum + ad.ctr, 0) / adsWithCtr.length
        : 0;

  const ageDays = enrolledAt
    ? Math.max(0, (Date.now() - new Date(enrolledAt).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const fatigued_ads = [];
  const healthy_ads = [];
  for (const ad of adsWithCtr) {
    const reasons = [];
    // ads-creative: frequency >5.0 prospecting
    if (ad.frequency > SKILL_RULES.fatigue_frequency_prospecting) {
      reasons.push(`frequency ${Number(ad.frequency).toFixed(1)} > ${SKILL_RULES.fatigue_frequency_prospecting}`);
    }
    // ads-creative / paid-ads: CTR well below peers (with enough impressions)
    if (
      ad.impressions >= SKILL_RULES.min_impressions_ctr_kill &&
      averageCtr > 0 &&
      ad.ctr < averageCtr * SKILL_RULES.fatigue_ctr_vs_avg
    ) {
      reasons.push(`CTR ${(ad.ctr * 100).toFixed(2)}% < 80% of peer avg`);
    }
    // ads-creative Meta refresh cadence 14–21d + soft CTR vs peers
    if (
      ageDays != null &&
      ageDays >= SKILL_RULES.fatigue_refresh_days_meta &&
      averageCtr > 0 &&
      ad.ctr < averageCtr * SKILL_RULES.fatigue_ctr_vs_avg &&
      ad.impressions >= 500
    ) {
      reasons.push(`past ${SKILL_RULES.fatigue_refresh_days_meta}d Meta refresh window with soft CTR`);
    }

    if (reasons.length) fatigued_ads.push({ ...ad, fatigue_reasons: reasons });
    else healthy_ads.push(ad);
  }
  return { fatigued_ads, healthy_ads, averageCtr };
}

/**
 * ads-budget kill list: 3x CPA, no conversions with spend/clicks, ROAS <50% target.
 * Requires min data before pausing (avoid learning-phase false kills).
 */
function shouldKillAd(ad, { targetRoas, targetCpa, roasPause }) {
  const reasons = [];
  const hasMinData =
    ad.spend >= SKILL_RULES.min_spend_before_kill ||
    ad.clicks >= SKILL_RULES.min_clicks_before_kill;

  if (!hasMinData) return { kill: false, reasons: ['insufficient_data'] };

  if (
    ad.conversions <= 0 &&
    (ad.spend >= SKILL_RULES.min_spend_before_kill || ad.clicks >= 50)
  ) {
    reasons.push('no_conversions_after_spend');
  }

  if (ad.roas !== null && ad.roas < roasPause && ad.spend > 0) {
    reasons.push(`roas_${ad.roas}_below_pause_${roasPause}`);
  }

  if (targetRoas && ad.roas !== null && ad.roas < targetRoas * SKILL_RULES.kill_roas_vs_target) {
    reasons.push(`roas_below_50pct_of_target_${targetRoas}`);
  }

  if (targetCpa && ad.conversions > 0) {
    const cpa = ad.spend / ad.conversions;
    if (cpa > targetCpa * SKILL_RULES.kill_cpa_multiplier) {
      reasons.push(`cpa_${cpa.toFixed(2)}_gt_3x_target_${targetCpa}`);
    }
  }

  return { kill: reasons.length > 0, reasons, cpa: ad.conversions > 0 ? ad.spend / ad.conversions : null };
}

function canScaleAdset(enrollment, adsetId) {
  const map = enrollment.last_scaled_at;
  const last = map && typeof map === 'object' && !Array.isArray(map)
    ? map[adsetId]
    : typeof map === 'string'
      ? map
      : null;
  if (!last) return true;
  const days = (Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000);
  return days >= SKILL_RULES.min_days_between_scale;
}

function hasWinnerSample(ad) {
  return (
    ad.impressions >= SKILL_RULES.min_impressions_declare_winner ||
    ad.clicks >= SKILL_RULES.min_clicks_declare_winner
  );
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
    return {
      objective: goals.priority_90d || null,
      quantified_target: goals.quantified_target || null,
      timeline_target: goals.timeline_target || null,
      budget_band: goals.budget_band || null,
      channel_bet: goals.channel_bet || null,
    };
  } catch (e) {
    console.warn('[managePaidAdsLoop] loadGtmGoals:', e.message);
    return {};
  }
}

async function generateCopyVariations({ headline, primary_text, objective, fatiguedName, quantifiedTarget, count = 3 }) {
  const frameworks = SKILL_RULES.angle_frameworks.slice(0, count);
  try {
    const groq = tracedLLM({
      traceName: 'paid-ads-creative-refresh',
      tags: ['paid-ads', 'ads-creative', 'ab-test-setup', 'creative-fatigue'],
    });
    const resp = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `You are a performance creative strategist using paid-ads + ads-creative + ab-test-setup skills.

CONTEXT
- Fatigued ad: "${fatiguedName}"
- Original headline: ${headline || '(none)'}
- Original primary text: ${primary_text || '(none)'}
- Objective: ${objective || 'leads'}
- Goal / primary metric: ${quantifiedTarget || 'conversions / CPA efficiency'}

RULES (must follow)
1. Creative testing hierarchy: vary CONCEPT/ANGLE first (biggest impact), not micro-edits.
2. Andromeda (Meta): each variant must be genuinely distinct in concept — no color/word swaps.
3. Use these frameworks (one each): ${frameworks.join(', ')}
   - PAS = Problem-Agitate-Solve
   - BAB = Before-After-Bridge
   - social_proof = stat/testimonial lead
   - feature_benefit = Feature → so that → which means
   - direct_response = bold claim + proof + CTA
4. Meta limits: headline ≤${SKILL_RULES.headline_max} chars, primary_text ≤${SKILL_RULES.primary_text_max} chars.
5. ab-test-setup: each variant needs a hypothesis:
   "Because [observation], we believe [angle] will improve [primary metric] for [audience]. We'll know when [metric] beats control."

Return JSON only:
{
  "variations": [{
    "framework": "PAS|BAB|social_proof|feature_benefit|direct_response",
    "angle": string,
    "hypothesis": string,
    "headline": string,
    "primary_text": string,
    "visual_brief": string,
    "primary_metric": string,
    "guardrail_metric": string
  }]
}
Generate exactly ${count} variations. Each variation MUST include a distinct "hook" (first-line pattern interrupt — curiosity, outcome, contrarian, number, or question) separate from the full headline.`,
        },
      ],
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const list = Array.isArray(parsed.variations) ? parsed.variations.slice(0, count) : [];
    return list.map((v, i) => {
      const headline = String(v.headline || v.hook || '').slice(0, SKILL_RULES.headline_max);
      const hook = String(v.hook || headline).slice(0, SKILL_RULES.headline_max);
      return {
        ...v,
        hook,
        angle: v.angle || v.framework || frameworks[i] || `angle_${i + 1}`,
        framework: v.framework || frameworks[i],
        headline: headline || hook,
        primary_text: String(v.primary_text || '').slice(0, SKILL_RULES.primary_text_max),
        hypothesis: v.hypothesis || `Because creative fatigue, we believe ${v.angle || frameworks[i]} will lift CTR/CPA vs control.`,
        primary_metric: v.primary_metric || quantifiedTarget || 'CTR then CPA',
        guardrail_metric: v.guardrail_metric || 'CPC / CPM should not spike >30%',
        test_variable: 'angle', // ab-test-setup: one primary variable; hook rides with angle concept
      };
    });
  } catch (e) {
    console.warn('[managePaidAdsLoop] copy variations failed:', e.message);
    const baseH = (headline || 'Try a new angle').slice(0, SKILL_RULES.headline_max);
    const baseB = (primary_text || 'Fresh creative test — same offer, new hook.').slice(0, SKILL_RULES.primary_text_max);
    return frameworks.map((fw, i) => ({
      framework: fw,
      angle: fw,
      hook: baseH,
      hypothesis: `Because "${fatiguedName}" is fatigued, we believe a ${fw} angle will improve CTR for the same audience. We'll know when CTR beats control after ≥${SKILL_RULES.min_impressions_declare_winner} impressions.`,
      headline: baseH,
      primary_text: baseB,
      visual_brief: `${fw} visual — distinct concept ${i + 1}`,
      primary_metric: quantifiedTarget || 'CTR',
      guardrail_metric: 'CPC',
      test_variable: 'angle',
    }));
  }
}

async function createMetaAdVariant({
  companyId,
  adAccountId,
  pageId,
  adsetId,
  campaignName,
  variation,
  linkUrl,
  imageUrl,
  status = 'ACTIVE',
  ctaType = 'LEARN_MORE',
}) {
  const linkData = {
    message: variation.primary_text,
    link: linkUrl,
    name: variation.headline,
    call_to_action: { type: ctaType, value: { link: linkUrl } },
  };
  if (imageUrl) linkData.picture = imageUrl;

  const c3 = await metaGraphProxy(companyId, {
    method: 'POST',
    path: `/${adAccountId}/adcreatives`,
    body: {
      name: `${campaignName} — ${variation.angle || 'variant'}`,
      object_story_spec: { page_id: pageId, link_data: linkData },
    },
  });
  if (c3.error) return { ok: false, error: c3.error, step: 'creative' };
  const creativeId = c3.result?.id;
  if (!creativeId) return { ok: false, error: 'Creative missing id', step: 'creative' };

  const c4 = await metaGraphProxy(companyId, {
    method: 'POST',
    path: `/${adAccountId}/ads`,
    body: {
      name: `${campaignName} — A/B ${variation.angle || 'v'}`,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status,
    },
  });
  if (c4.error) return { ok: false, error: c4.error, step: 'ad', creative_id: creativeId };
  const adId = c4.result?.id;
  if (!adId) return { ok: false, error: 'Ad missing id', step: 'ad', creative_id: creativeId };

  return { ok: true, creative_id: creativeId, ad_id: adId, angle: variation.angle, headline: variation.headline };
}

async function pauseMetaAd(companyId, adId) {
  const r = await metaGraphProxy(companyId, {
    method: 'POST',
    path: `/${adId}`,
    body: { status: 'PAUSED' },
  });
  if (r.error) return { error: { message: r.error } };
  return r.result || { success: true };
}

async function scaleMetaAdsetBudget(companyId, adsetId, scaleFactor, budgetCap) {
  const budgetRes = await metaGraphProxy(companyId, {
    method: 'GET',
    path: `/${adsetId}`,
    query: { fields: 'daily_budget,name' },
  });
  if (budgetRes.error) return { ok: false, error: budgetRes.error };
  const budgetData = budgetRes.result || {};
  const currentBudget = parseInt(budgetData.daily_budget || 0, 10);
  const newBudget = budgetCap
    ? Math.min(Math.round(currentBudget * scaleFactor), budgetCap)
    : Math.round(currentBudget * scaleFactor);
  if (newBudget <= currentBudget) {
    return { ok: true, action: 'at_cap', budget_before: currentBudget, budget_after: currentBudget, name: budgetData.name };
  }
  const r = await metaGraphProxy(companyId, {
    method: 'POST',
    path: `/${adsetId}`,
    body: { daily_budget: newBudget },
  });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, action: 'scaled', budget_before: currentBudget, budget_after: newBudget, name: budgetData.name };
}

async function resolveMetaAuth(params, companyId) {
  let adAccountId = String(params.ad_account_id || getPreferredMetaAdAccountId(companyId) || '').trim();
  if (adAccountId && !adAccountId.startsWith('act_')) adAccountId = `act_${adAccountId}`;
  if (!adAccountId) throw new Error('Meta ad_account_id required');

  let pageId = params.page_id || null;
  if (!pageId) {
    try {
      const pages = await metaGraphProxy(companyId, {
        method: 'GET',
        path: '/me/accounts',
        query: { fields: 'id,name', limit: 25 },
      });
      pageId = pages?.result?.data?.[0]?.id || null;
    } catch {
      pageId = null;
    }
  }

  return { companyId, adAccountId, pageId };
}

/**
 * Process one enrolled Meta campaign through the closed loop.
 */
async function processMetaCampaign(enrollment, ctx) {
  const {
    companyId,
    dryRun,
    autoOptimize,
    autoRefreshCreatives,
    roasPause,
    roasScale,
    scaleFactor,
    budgetCap,
    goalTarget,
    timelineEnd,
    objective,
  } = ctx;

  const campaignId = enrollment.campaign_id;
  const adAccountId = enrollment.ad_account_id || ctx.adAccountId;
  const pageId = enrollment.page_id || ctx.pageId;
  const report = {
    campaign_id: campaignId,
    campaign_name: enrollment.campaign_name,
    channel: 'meta',
    actions: [],
    pacing: null,
    fatigue: null,
    winning_creative: null,
    winning_cohort: null,
    new_variants: [],
    paused_ads: [],
    scaled_adsets: [],
  };

  // 1. Ad-level insights
  const insightRes = await executeComposioAction(
    'METAADS_GET_INSIGHTS',
    {
      object_id: adAccountId,
      level: 'ad',
      fields: [
        'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
        'spend', 'impressions', 'clicks', 'reach', 'frequency', 'actions', 'purchase_roas', 'ctr',
      ],
      date_preset: 'last_7d',
      filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
    },
    companyId
  );

  if (insightRes.error) {
    report.error = insightRes.error;
    return report;
  }

  const rawAds = insightRes.result?.data || insightRes.result || [];
  const ads = (Array.isArray(rawAds) ? rawAds : []).map((ins) => {
    const impressions = parseFloat(ins.impressions || 0);
    const clicks = parseFloat(ins.clicks || 0);
    const reach = parseFloat(ins.reach || 0);
    const frequency =
      parseFloat(ins.frequency || 0) ||
      (reach > 0 ? impressions / reach : 0);
    return {
      ad_id: ins.ad_id,
      name: ins.ad_name,
      adset_id: ins.adset_id,
      adset_name: ins.adset_name,
      spend: parseFloat(ins.spend || 0),
      impressions,
      clicks,
      reach,
      frequency,
      conversions: sumConversions(ins.actions),
      roas: computeRoas(ins),
      ctr: impressions > 0 ? clicks / impressions : 0,
      actions: ins.actions,
    };
  });

  const totalConversions = ads.reduce((s, a) => s + a.conversions, 0);
  report.pacing = computePacing({
    target: goalTarget,
    achieved: totalConversions,
    timelineEnd,
    enrolledAt: enrollment.enrolled_at || enrollment.created_at,
  });

  // 2. Fatigue (ads-creative thresholds)
  const fatigue = creativeFatigueCheck(ads, {
    enrolledAt: enrollment.enrolled_at || enrollment.created_at,
  });
  report.fatigue = {
    fatigued_count: fatigue.fatigued_ads.length,
    healthy_count: fatigue.healthy_ads.length,
    peer_avg_ctr: Math.round(fatigue.averageCtr * 10000) / 100,
    skill: 'ads-creative',
    fatigued_ads: fatigue.fatigued_ads.map((a) => ({
      ad_id: a.ad_id,
      name: a.name,
      frequency: Math.round(a.frequency * 100) / 100,
      ctr: Math.round(a.ctr * 10000) / 100,
      reasons: a.fatigue_reasons || [],
    })),
  };

  // 3. Winning creative — ab-test-setup: require min sample before declaring
  const candidates = (fatigue.healthy_ads.length ? fatigue.healthy_ads : ads)
    .filter((a) => a.spend > 0 && hasWinnerSample(a));
  const byRoas = [...candidates].filter((a) => a.roas != null).sort((a, b) => (b.roas || 0) - (a.roas || 0));
  const byCtr = [...candidates].sort((a, b) => b.ctr - a.ctr);
  const winner = byRoas[0] || byCtr[0] || null;
  if (winner) {
    report.winning_creative = {
      ad_id: winner.ad_id,
      name: winner.name,
      roas: winner.roas,
      ctr: Math.round(winner.ctr * 10000) / 100,
      spend: winner.spend,
      conversions: winner.conversions,
      sample_ok: true,
      skill: 'ab-test-setup',
    };
  } else {
    report.winning_creative = {
      status: 'insufficient_sample',
      note: `Need ≥${SKILL_RULES.min_impressions_declare_winner} impressions or ≥${SKILL_RULES.min_clicks_declare_winner} clicks (ab-test-setup) before calling a winner.`,
    };
  }

  // 4. Winning cohort via age breakdown (min sample gate)
  try {
    const breakdownRes = await executeComposioAction(
      'METAADS_GET_INSIGHTS',
      {
        object_id: adAccountId,
        level: 'campaign',
        fields: ['impressions', 'clicks', 'spend', 'actions', 'purchase_roas'],
        date_preset: 'last_7d',
        breakdowns: ['age'],
        filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
      },
      companyId
    );
    const rows = breakdownRes.result?.data || breakdownRes.result || [];
    if (Array.isArray(rows) && rows.length) {
      const scored = rows.map((r) => {
        const spend = parseFloat(r.spend || 0);
        const conversions = sumConversions(r.actions);
        const clicks = parseFloat(r.clicks || 0);
        const impressions = parseFloat(r.impressions || 0);
        const cpl = conversions > 0 ? spend / conversions : null;
        const ctr = impressions > 0 ? clicks / impressions : 0;
        return {
          cohort: r.age || 'unknown',
          spend,
          conversions,
          clicks,
          impressions,
          cpl,
          ctr,
          score: conversions > 0 ? conversions / Math.max(spend, 0.01) : ctr,
        };
      });
      scored.sort((a, b) => b.score - a.score);
      const top = scored.find(
        (s) =>
          s.impressions >= SKILL_RULES.min_impressions_declare_winner ||
          s.clicks >= SKILL_RULES.min_clicks_declare_winner
      );
      if (top) {
        report.winning_cohort = {
          dimension: 'age',
          cohort: top.cohort,
          conversions: top.conversions,
          cpl: top.cpl,
          ctr: Math.round(top.ctr * 10000) / 100,
          recommendation: `Concentrate budget / lookalikes toward age ${top.cohort}; suppress weaker age bands in next ad set (paid-ads lookalike from best customers).`,
          skill: 'paid-ads',
        };
      } else {
        report.winning_cohort = {
          status: 'insufficient_sample',
          note: 'Age breakdown lacks min sample to declare a winning cohort yet.',
        };
      }
    }
  } catch (e) {
    report.winning_cohort = { error: e.message };
  }

  // 5. Optimize — ads-budget kill list + 20% scale rule + 3d cooldown
  // Cap scale factor at 1.20 even if caller passes higher (ads-budget 20% Rule)
  const safeScaleFactor = Math.min(scaleFactor, SKILL_RULES.budget_scale_factor + 0.0001);
  const targetRoas = ctx.targetRoas || null;
  const targetCpa = ctx.targetCpa || null;

  if (autoOptimize) {
    for (const ad of ads) {
      const decision = shouldKillAd(ad, {
        targetRoas,
        targetCpa,
        roasPause: report.pacing?.status === 'behind' ? Math.max(roasPause, roasPause * 1.1) : roasPause,
      });
      if (!decision.kill) continue;
      if (!dryRun) {
        const d = await pauseMetaAd(companyId, ad.ad_id);
        if (d.error) {
          report.paused_ads.push({ ad_id: ad.ad_id, name: ad.name, action: 'pause_failed', error: d.error.message, reasons: decision.reasons });
          continue;
        }
      }
      report.paused_ads.push({
        ad_id: ad.ad_id,
        name: ad.name,
        roas: ad.roas,
        cpa: decision.cpa,
        reasons: decision.reasons,
        action: dryRun ? 'would_pause' : 'paused',
        skill: 'ads-budget',
      });
      report.actions.push(
        dryRun
          ? `Would pause ${ad.name} [${decision.reasons.join(', ')}]`
          : `Paused ${ad.name} [${decision.reasons.join(', ')}]`
      );
    }

    const adsetMap = {};
    for (const ad of ads) {
      if (!ad.adset_id) continue;
      if (!adsetMap[ad.adset_id]) adsetMap[ad.adset_id] = { id: ad.adset_id, name: ad.adset_name, roas_values: [], conversions: 0 };
      if (ad.roas !== null) adsetMap[ad.adset_id].roas_values.push(ad.roas);
      adsetMap[ad.adset_id].conversions += ad.conversions;
    }
    const effectiveScale = report.pacing?.status === 'behind' ? Math.max(1.05, roasScale * 0.85) : roasScale;
    const toScale = Object.values(adsetMap).filter((as) => {
      if (!as.roas_values.length) return false;
      const avg = as.roas_values.reduce((a, b) => a + b, 0) / as.roas_values.length;
      return avg >= effectiveScale || (report.pacing?.status === 'behind' && avg >= effectiveScale * 0.9);
    });

    if (!enrollment.last_scaled_at || typeof enrollment.last_scaled_at !== 'object') {
      enrollment.last_scaled_at = {};
    }

    for (const as of toScale) {
      if (!canScaleAdset(enrollment, as.id)) {
        report.scaled_adsets.push({
          adset_id: as.id,
          name: as.name,
          action: 'skipped_cooldown',
          note: `ads-budget/paid-ads: wait ≥${SKILL_RULES.min_days_between_scale}d between +20% increases`,
        });
        report.actions.push(`Skipped scale ${as.name} — still in ${SKILL_RULES.min_days_between_scale}d learning cooldown`);
        continue;
      }
      if (dryRun) {
        report.scaled_adsets.push({ adset_id: as.id, name: as.name, action: 'would_scale', factor: safeScaleFactor });
        report.actions.push(`Would scale ad set ${as.name} by ${Math.round((safeScaleFactor - 1) * 100)}% (20% Rule)`);
        continue;
      }
      const scaled = await scaleMetaAdsetBudget(companyId, as.id, safeScaleFactor, budgetCap);
      report.scaled_adsets.push({ adset_id: as.id, name: as.name, ...scaled, skill: 'ads-budget' });
      if (scaled.ok && scaled.action === 'scaled') {
        enrollment.last_scaled_at[as.id] = new Date().toISOString();
        report.actions.push(`Scaled ${as.name} ${scaled.budget_before}→${scaled.budget_after} (+${Math.round((safeScaleFactor - 1) * 100)}%)`);
      }
    }
  }

  // 6. Fatigue → distinct-angle A/B variants (paid-ads frameworks + ab-test hypotheses)
  if (autoRefreshCreatives && fatigue.fatigued_ads.length && pageId) {
    const fatigued = fatigue.fatigued_ads[0];
    const adsetId = fatigued.adset_id || enrollment.adset_id;
    const linkUrl = enrollment.link_url;
    if (adsetId && linkUrl) {
      const variantCount =
        report.pacing?.status === 'behind'
          ? SKILL_RULES.variant_count_behind
          : SKILL_RULES.variant_count_default;
      const variations = await generateCopyVariations({
        headline: enrollment.headline,
        primary_text: enrollment.primary_text,
        objective: objective || enrollment.objective,
        fatiguedName: fatigued.name,
        quantifiedTarget: ctx.quantifiedTarget || null,
        count: variantCount,
      });

      for (const variation of variations) {
        let imageUrl = enrollment.image_url || null;
        if (!dryRun && variation.visual_brief) {
          try {
            const img = await generateSocialImage({
              prompt: `Paid ad creative — DISTINCT concept for Meta Andromeda (not a micro-variation). Framework: ${variation.framework || variation.angle}. Visual: ${variation.visual_brief}.`,
              aspect_ratio: '1:1',
              platform: 'facebook',
              headline: variation.headline,
              primary_text: variation.primary_text,
            }, companyId);
            if (img?.cdn_url || img?.image_url || img?.url) {
              imageUrl = img.cdn_url || img.image_url || img.url;
            }
          } catch {
            /* keep prior image */
          }
        }

        if (dryRun) {
          report.new_variants.push({ ...variation, action: 'would_create', image_url: imageUrl });
          report.actions.push(
            `Would create A/B (${variation.framework || variation.angle}): ${variation.headline} — ${variation.hypothesis || ''}`
          );
          continue;
        }

        const created = await createMetaAdVariant({
          companyId,
          adAccountId,
          pageId,
          adsetId,
          campaignName: enrollment.campaign_name || 'Campaign',
          variation,
          linkUrl,
          imageUrl,
          status: enrollment.ads_status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
          ctaType: enrollment.cta_type || 'LEARN_MORE',
        });
        report.new_variants.push({ ...created, hypothesis: variation.hypothesis, framework: variation.framework });
        if (created.ok) {
          report.actions.push(`Created A/B ad ${created.ad_id} (${variation.framework || variation.angle})`);
        }
      }

      for (const ad of fatigue.fatigued_ads) {
        if (dryRun) {
          report.actions.push(`Would pause fatigued ${ad.name}`);
          continue;
        }
        const d = await pauseMetaAd(companyId, ad.ad_id);
        if (!d.error) report.actions.push(`Paused fatigued ${ad.name}`);
      }
    } else {
      report.actions.push('Fatigue detected but missing adset_id or link_url — cannot auto-create variants');
    }
  } else if (autoRefreshCreatives && fatigue.fatigued_ads.length && !pageId) {
    report.actions.push('Fatigue detected but no Facebook Page ID — skip creative refresh');
  }

  report.skill_rules = {
    skills: SKILL_RULES.skills,
    scale_factor_applied: safeScaleFactor,
    fatigue_frequency: SKILL_RULES.fatigue_frequency_prospecting,
    min_sample_winner: SKILL_RULES.min_impressions_declare_winner,
  };

  return report;
}

/**
 * Main automation handler.
 */
export async function managePaidAdsLoop(params = {}, companyId, supabaseClient = null) {
  const dryRun = params.dry_run === true || params.dry_run === 'true';
  const autoOptimize = params.auto_optimize !== false;
  const autoRefreshCreatives = params.auto_refresh_creatives !== false;
  const roasPause = parseFloat(params.roas_threshold_pause ?? 1.0);
  const roasScale = parseFloat(params.roas_threshold_scale ?? 3.0);
  // ads-budget 20% Rule default (cap still applied inside processMetaCampaign)
  const scaleFactor = parseFloat(params.budget_scale_factor ?? SKILL_RULES.budget_scale_factor);
  const budgetCap = params.budget_scale_max ? parseInt(params.budget_scale_max, 10) : null;
  const targetRoas = params.target_roas != null ? parseFloat(params.target_roas) : null;
  const targetCpa = params.target_cpa != null ? parseFloat(params.target_cpa) : null;

  const gtmGoals = await loadGtmGoals(supabaseClient, companyId);
  const quantified =
    params.quantified_target || gtmGoals.quantified_target || null;
  const timelineRaw =
    params.timeline_target || params.timeline_end || gtmGoals.timeline_target || null;
  const objective = params.objective || gtmGoals.objective || null;
  const goalTarget = parseQuantifiedTarget(quantified);

  let enrolled = Array.isArray(params.enrolled) ? [...params.enrolled] : [];

  // Allow one-shot campaign_id without prior enroll
  if (!enrolled.length && params.campaign_id) {
    enrolled = [
      {
        campaign_id: params.campaign_id,
        adset_id: params.adset_id,
        ad_account_id: params.ad_account_id,
        channel: params.channel || 'meta',
        campaign_name: params.campaign_name || params.campaign_id,
        link_url: params.link_url,
        headline: params.headline,
        primary_text: params.primary_text,
        image_url: params.image_url,
        page_id: params.page_id,
        objective,
        enrolled_at: new Date().toISOString(),
      },
    ];
  }

  if (!enrolled.length) {
    return {
      status: 'completed',
      message: 'No campaigns enrolled in the paid ads loop yet.',
      campaigns: [],
      goals: { quantified_target: quantified, timeline_target: timelineRaw, objective },
    };
  }

  const campaignReports = [];
  let metaAuth = null;

  for (const enrollment of enrolled) {
    const channel = String(enrollment.channel || 'meta').toLowerCase();
    if (channel !== 'meta' && channel !== 'facebook' && channel !== 'instagram' && channel !== 'facebook_instagram') {
      campaignReports.push({
        campaign_id: enrollment.campaign_id,
        channel,
        status: 'monitor_only',
        message: 'Auto pause/scale/creative refresh is Meta-only for now. Enrollment tracked for pacing reports.',
        pacing: computePacing({
          target: goalTarget,
          achieved: enrollment.last_conversions || 0,
          timelineEnd: parseTimelineEnd(timelineRaw, enrollment.enrolled_at),
          enrolledAt: enrollment.enrolled_at,
        }),
      });
      continue;
    }

    try {
      if (!metaAuth) {
        metaAuth = await resolveMetaAuth(
          { ad_account_id: enrollment.ad_account_id || params.ad_account_id, page_id: enrollment.page_id || params.page_id },
          companyId
        );
      }
      const timelineEnd = parseTimelineEnd(timelineRaw, enrollment.enrolled_at || new Date());
      const report = await processMetaCampaign(enrollment, {
        ...metaAuth,
        companyId,
        dryRun,
        autoOptimize,
        autoRefreshCreatives,
        roasPause,
        roasScale,
        scaleFactor,
        budgetCap,
        goalTarget,
        timelineEnd,
        objective,
        quantifiedTarget: quantified,
        targetRoas,
        targetCpa,
      });
      campaignReports.push(report);

      // Persist last conversions + scale cooldowns onto enrollment
      enrollment.last_conversions = report.pacing?.achieved ?? enrollment.last_conversions;
      enrollment.last_loop_at = new Date().toISOString();
      enrollment.last_winning_creative = report.winning_creative || null;
      enrollment.last_winning_cohort = report.winning_cohort || null;
      if (report.scaled_adsets?.some((s) => s.action === 'scaled') && enrollment.last_scaled_at) {
        // already mutated on enrollment object inside processMetaCampaign
      }
    } catch (e) {
      campaignReports.push({
        campaign_id: enrollment.campaign_id,
        channel: 'meta',
        status: 'error',
        error: e.message,
      });
    }
  }

  // Persist updated enrolled state + last report on the schedule row
  if (supabaseClient && companyId) {
    try {
      const { data: existing } = await supabaseClient
        .from('scheduled_automations')
        .select('id, params')
        .eq('company_id', companyId)
        .eq('automation_id', LOOP_AUTOMATION_ID)
        .maybeSingle();

      if (existing?.id) {
        const nextParams = {
          ...(existing.params || {}),
          ...params,
          enrolled,
          quantified_target: quantified,
          timeline_target: timelineRaw,
          objective,
          last_report: {
            at: new Date().toISOString(),
            campaigns: campaignReports.map((c) => ({
              campaign_id: c.campaign_id,
              pacing: c.pacing,
              winning_creative: c.winning_creative,
              winning_cohort: c.winning_cohort,
              actions: c.actions,
              fatigue: c.fatigue,
            })),
          },
        };
        await supabaseClient
          .from('scheduled_automations')
          .update({ params: nextParams, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
    } catch (e) {
      console.warn('[managePaidAdsLoop] persist params:', e.message);
    }
  }

  const actionsTaken = campaignReports.reduce(
    (n, c) => n + (c.actions?.filter((a) => !String(a).startsWith('Would')).length || 0),
    0
  );

  return {
    status: 'completed',
    dry_run: dryRun,
    skill_alignment: SKILL_RULES.skills,
    skill_rules: {
      budget_scale_factor: SKILL_RULES.budget_scale_factor,
      min_days_between_scale: SKILL_RULES.min_days_between_scale,
      fatigue_frequency_prospecting: SKILL_RULES.fatigue_frequency_prospecting,
      min_impressions_declare_winner: SKILL_RULES.min_impressions_declare_winner,
      kill_cpa_multiplier: SKILL_RULES.kill_cpa_multiplier,
    },
    goals: {
      quantified_target: quantified,
      target_number: goalTarget,
      timeline_target: timelineRaw,
      objective,
      from_gtm: Boolean(gtmGoals.quantified_target),
      target_roas: targetRoas,
      target_cpa: targetCpa,
    },
    enrolled_count: enrolled.length,
    actions_taken: dryRun ? 0 : actionsTaken,
    campaigns: campaignReports,
    report: campaignReports
      .map((c) => {
        const pace = c.pacing
          ? `Pace ${c.pacing.status}: ${c.pacing.achieved}/${c.pacing.target ?? '?'} (expected ${c.pacing.expected}, ${c.pacing.days_left ?? '?'}d left)`
          : 'No pacing';
        const win = c.winning_creative
          ? `Winner creative: ${c.winning_creative.name} (ROAS ${c.winning_creative.roas ?? 'n/a'}, CTR ${c.winning_creative.ctr}%)`
          : 'No winning creative yet';
        const cohort = c.winning_cohort?.cohort
          ? `Winning cohort (age): ${c.winning_cohort.cohort}`
          : 'No cohort winner yet';
        const acts = (c.actions || []).join('; ') || 'No actions';
        return `### ${c.campaign_name || c.campaign_id}\n${pace}\n${win}\n${cohort}\nActions: ${acts}`;
      })
      .join('\n\n'),
  };
}

/**
 * Enroll a newly created campaign into the 6h closed loop schedule.
 * Merges into existing enrolled[] for the company.
 */
export async function enrollPaidAdsLoop(companyId, enrollment, opts = {}) {
  if (!companyId || !enrollment?.campaign_id) {
    return { ok: false, error: 'companyId and campaign_id required' };
  }

  let supabaseClient = opts.supabaseClient || null;
  if (!supabaseClient) {
    try {
      const mod = await import('../../supabase.js');
      supabaseClient = mod.supabaseAdmin || mod.supabase || null;
    } catch {
      supabaseClient = null;
    }
  }
  if (!supabaseClient) return { ok: false, error: 'Supabase unavailable — cannot schedule loop' };

  const { upsertScheduledAutomation } = await import('../registry.js');

  const gtmGoals = await loadGtmGoals(supabaseClient, companyId);
  const quantified = opts.quantified_target || gtmGoals.quantified_target || null;
  const timeline = opts.timeline_target || gtmGoals.timeline_target || null;
  const objective = opts.objective || enrollment.objective || gtmGoals.objective || null;

  const { data: existing } = await supabaseClient
    .from('scheduled_automations')
    .select('*')
    .eq('company_id', companyId)
    .eq('automation_id', LOOP_AUTOMATION_ID)
    .maybeSingle();

  const prevEnrolled = Array.isArray(existing?.params?.enrolled) ? existing.params.enrolled : [];
  const nextEnrollment = {
    campaign_id: String(enrollment.campaign_id),
    adset_id: enrollment.adset_id ? String(enrollment.adset_id) : null,
    ad_id: enrollment.ad_id ? String(enrollment.ad_id) : null,
    creative_id: enrollment.creative_id ? String(enrollment.creative_id) : null,
    ad_account_id: enrollment.ad_account_id || null,
    page_id: enrollment.page_id || null,
    channel: enrollment.channel || 'meta',
    campaign_name: enrollment.campaign_name || enrollment.campaign_id,
    link_url: enrollment.link_url || null,
    headline: enrollment.headline || null,
    primary_text: enrollment.primary_text || null,
    image_url: enrollment.image_url || null,
    cta_type: enrollment.cta_type || 'LEARN_MORE',
    ads_status: enrollment.ads_status || enrollment.status || 'PAUSED',
    objective,
    enrolled_at: new Date().toISOString(),
  };

  const enrolled = [
    ...prevEnrolled.filter((e) => String(e.campaign_id) !== nextEnrollment.campaign_id),
    nextEnrollment,
  ];

  const params = {
    ...(existing?.params || {}),
    enrolled,
    quantified_target: quantified,
    timeline_target: timeline,
    objective,
    auto_optimize: opts.auto_optimize !== false,
    auto_refresh_creatives: opts.auto_refresh_creatives !== false,
    dry_run: opts.dry_run === true,
    roas_threshold_pause: opts.roas_threshold_pause ?? 1.0,
    roas_threshold_scale: opts.roas_threshold_scale ?? 3.0,
    budget_scale_factor: opts.budget_scale_factor ?? SKILL_RULES.budget_scale_factor,
    target_roas: opts.target_roas ?? null,
    target_cpa: opts.target_cpa ?? null,
    skill_alignment: SKILL_RULES.skills,
    ad_account_id: nextEnrollment.ad_account_id,
  };

  const scheduled = await upsertScheduledAutomation(
    companyId,
    { automation_id: LOOP_AUTOMATION_ID, cron: opts.cron || DEFAULT_CRON, params },
    opts.agentName || 'zara',
    supabaseClient
  );

  return {
    ok: true,
    automation_id: LOOP_AUTOMATION_ID,
    cron: scheduled.cron,
    next_run: scheduled.next_run,
    enrolled_count: enrolled.length,
    goals: { quantified_target: quantified, timeline_target: timeline, objective },
  };
}

export { LOOP_AUTOMATION_ID, DEFAULT_CRON };
