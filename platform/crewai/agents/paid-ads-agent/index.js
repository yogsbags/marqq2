'use strict';

/**
 * Paid Ads Agent
 *
 * Fetches live campaign status from Google Ads + Meta Ads via Composio,
 * surfaces spend pace, anomalies, and recommended adjustments.
 *
 * Response type: "execution" (live tracker)
 */

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';

// ── Composio helpers ──────────────────────────────────────────────────────────

async function resolveConnectedAccountId(entityId, toolkit, apiKey) {
  const res = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&toolkit_slug=${encodeURIComponent(toolkit)}&limit=10`,
    { headers: { 'x-api-key': apiKey } }
  );
  if (!res.ok) throw new Error(`Account lookup failed for ${toolkit}: ${res.status}`);
  const data = await res.json();
  const account = (data.items || []).find(
    (i) => (i.user_id === entityId || i.entity_id === entityId) && i.status === 'ACTIVE'
  );
  if (!account?.id) throw new Error(`No active ${toolkit} connection for ${entityId}`);
  return account.id;
}

async function executeComposioTool(entityId, toolkit, toolSlug, args, apiKey) {
  let connectedAccountId;
  try {
    connectedAccountId = await resolveConnectedAccountId(entityId, toolkit, apiKey);
  } catch (err) {
    return { successful: false, data: null, error: String(err.message) };
  }
  try {
    const resp = await fetch(`${COMPOSIO_V3}/tools/execute/${toolSlug}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected_account_id: connectedAccountId, arguments: args }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return { successful: false, data: null, error: `HTTP ${resp.status}: ${t.slice(0, 200)}` };
    }
    const result = await resp.json();
    return { successful: result.successful ?? true, data: result.data ?? result, error: result.error ?? null };
  } catch (err) {
    return { successful: false, data: null, error: String(err.message) };
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayRange() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
  return { startDate: thirtyDaysAgo, endDate: today };
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseGoogleCampaign(raw) {
  const m = raw.metrics || {};
  const c = raw.campaign || {};
  const spend = parseFloat(m.cost_micros || 0) / 1_000_000;
  const budget = parseFloat(m.campaign_budget_amount_micros || m.budget_amount_micros || 0) / 1_000_000;
  const clicks = parseInt(m.clicks || 0, 10);
  const impressions = parseInt(m.impressions || 0, 10);
  const conversions = parseFloat(m.conversions || 0);
  const convValue = parseFloat(m.conversions_value || 0);

  return {
    id: c.id || null,
    name: c.name || 'Unknown',
    platform: 'Google Ads',
    status: c.status || 'UNKNOWN',
    spend,
    budget,
    spendPacePct: budget > 0 ? (spend / budget) * 100 : null,
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    conversions,
    roas: spend > 0 ? convValue / spend : 0,
  };
}

function normaliseMetaCampaign(raw) {
  const spend = parseFloat(raw.spend || 0);
  const clicks = parseInt(raw.clicks || 0, 10);
  const impressions = parseInt(raw.impressions || 0, 10);
  const conversions = parseFloat(
    raw.actions?.find((a) => a.action_type === 'purchase')?.value || 0
  );
  const convValue = parseFloat(
    raw.action_values?.find((a) => a.action_type === 'purchase')?.value || 0
  );
  const budget = parseFloat(raw.daily_budget || raw.lifetime_budget || 0);

  return {
    id: raw.campaign_id || raw.id || null,
    name: raw.campaign_name || raw.name || 'Unknown',
    platform: 'Meta Ads',
    status: raw.effective_status || raw.status || 'UNKNOWN',
    spend,
    budget,
    spendPacePct: budget > 0 ? (spend / budget) * 100 : null,
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    conversions,
    roas: spend > 0 ? convValue / spend : 0,
  };
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

function detectCampaignAnomalies(campaign) {
  const alerts = [];

  if (campaign.spendPacePct !== null && campaign.spendPacePct >= 90) {
    alerts.push({
      type: 'budget_exhaustion',
      severity: campaign.spendPacePct >= 100 ? 'critical' : 'high',
      message: `Budget ${campaign.spendPacePct >= 100 ? 'exhausted' : 'nearly exhausted'} (${campaign.spendPacePct.toFixed(0)}% spent). Increase budget or risk going dark.`,
    });
  }

  if (campaign.ctr > 0 && campaign.ctr < 0.5) {
    alerts.push({
      type: 'low_ctr',
      severity: 'medium',
      message: `CTR is ${campaign.ctr.toFixed(2)}% — below 0.5% threshold. Consider refreshing ad creative or tightening targeting.`,
    });
  }

  if (campaign.roas > 0 && campaign.roas < 1.0) {
    alerts.push({
      type: 'below_breakeven_roas',
      severity: 'high',
      message: `ROAS is ${campaign.roas.toFixed(2)}x — below break-even. Pause underperforming ad sets within this campaign.`,
    });
  }

  if (campaign.status === 'PAUSED' || campaign.status === 'paused') {
    alerts.push({
      type: 'campaign_paused',
      severity: 'medium',
      message: `Campaign is paused. Confirm whether this is intentional.`,
    });
  }

  return alerts;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

class PaidAdsAgent {
  static id = 'paid-ads-agent';
  static name = 'Paid Ads Agent';
  static role = 'Paid Advertising Agent';
  static crews = ['paid-ads'];

  async execute(request = {}) {
    const {
      entityId,
      apiKey = process.env.COMPOSIO_API_KEY,
      mode = 'status', // 'status' | 'brief'
      campaignBrief,   // Used when mode = 'brief'
    } = request;

    if (!entityId) return this._error('entityId is required.');
    if (!apiKey) return this._error('COMPOSIO_API_KEY is not set.');

    // ── Brief mode: produce campaign setup brief (no live data needed) ─────────
    if (mode === 'brief' && campaignBrief) {
      return this._buildCampaignBrief(campaignBrief);
    }

    // ── Status mode: fetch live campaign data ─────────────────────────────────
    const { startDate, endDate } = todayRange();

    const [googleResult, metaResult] = await Promise.all([
      executeComposioTool(entityId, 'googleads', 'GOOGLEADS_LIST_CAMPAIGNS', {
        start_date: startDate,
        end_date: endDate,
        fields: [
          'campaign.id', 'campaign.name', 'campaign.status',
          'metrics.cost_micros', 'metrics.clicks', 'metrics.impressions',
          'metrics.conversions', 'metrics.conversions_value',
          'campaign_budget.amount_micros',
        ].join(','),
      }, apiKey),
      executeComposioTool(entityId, 'facebook', 'FACEBOOK_GET_AD_INSIGHTS', {
        level: 'campaign',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        fields: 'campaign_id,campaign_name,spend,clicks,impressions,actions,action_values,effective_status,daily_budget',
      }, apiKey),
    ]);

    const googleOk = googleResult.successful;
    const metaOk = metaResult.successful;

    if (!googleOk && !metaOk) {
      return this._connectorError(['google_ads', 'meta_ads']);
    }

    const googleCampaigns = googleOk
      ? (Array.isArray(googleResult.data) ? googleResult.data
          : googleResult.data?.campaigns || googleResult.data?.results || [])
          .map(normaliseGoogleCampaign)
      : [];

    const metaCampaigns = metaOk
      ? (Array.isArray(metaResult.data) ? metaResult.data
          : metaResult.data?.data || metaResult.data?.campaigns || [])
          .map(normaliseMetaCampaign)
      : [];

    const all = [...googleCampaigns, ...metaCampaigns];
    if (all.length === 0) return this._error('No campaign data found for the past 30 days.');

    // ── Aggregate ─────────────────────────────────────────────────────────────
    const totalSpend = all.reduce((s, c) => s + c.spend, 0);
    const totalConversions = all.reduce((s, c) => s + c.conversions, 0);
    const totalClicks = all.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = all.reduce((s, c) => s + c.impressions, 0);

    // ── Anomaly scan ──────────────────────────────────────────────────────────
    const allAlerts = all.flatMap((c) =>
      detectCampaignAnomalies(c).map((a) => ({ campaign: c.name, platform: c.platform, ...a }))
    );
    const criticalAlerts = allAlerts.filter((a) => a.severity === 'critical');
    const highAlerts = allAlerts.filter((a) => a.severity === 'high');

    // ── Findings ──────────────────────────────────────────────────────────────
    const findings = [
      `${all.length} campaigns active across ${[googleOk && 'Google Ads', metaOk && 'Meta Ads'].filter(Boolean).join(' and ')}.`,
      `Total spend (last 30 days): $${totalSpend.toFixed(0)} | Clicks: ${totalClicks.toLocaleString()} | Conversions: ${totalConversions.toFixed(0)}`,
      allAlerts.length > 0
        ? `${allAlerts.length} alert${allAlerts.length > 1 ? 's' : ''} detected: ${criticalAlerts.length} critical, ${highAlerts.length} high severity.`
        : 'No anomalies detected. All campaigns within normal parameters.',
    ];

    const insights = allAlerts.length > 0
      ? allAlerts.slice(0, 3).map((a) => `[${a.platform}] ${a.campaign}: ${a.message}`)
      : ['Campaigns are running normally. Review ROAS weekly for reallocation opportunities.'];

    const topBySpend = [...all].sort((a, b) => b.spend - a.spend).slice(0, 5);

    const prose = allAlerts.length > 0
      ? `I found ${allAlerts.length} issue${allAlerts.length > 1 ? 's' : ''} across your ${all.length} active campaigns. ${criticalAlerts.length > 0 ? `Critical: ${criticalAlerts[0].message}` : highAlerts[0]?.message || ''}`
      : `Your ${all.length} campaigns are running normally. Total spend: $${totalSpend.toFixed(0)} with ${totalConversions.toFixed(0)} conversions over the past 30 days.`;

    return {
      prose,
      response_type: 'execution',
      agent: PaidAdsAgent.id,
      crew: 'paid-ads',
      confidence: all.length >= 3 ? 0.88 : 0.72,
      connectors_used: [googleOk && 'google_ads', metaOk && 'meta_ads'].filter(Boolean),
      artifact: {
        type: 'execution_tracker',
        status: criticalAlerts.length > 0 ? 'action_required' : allAlerts.length > 0 ? 'warnings' : 'healthy',
        steps: all.map((c) => ({
          id: c.id,
          name: `${c.platform}: ${c.name}`,
          status: c.status === 'ENABLED' || c.status === 'ACTIVE' ? 'running'
            : c.status === 'PAUSED' || c.status === 'paused' ? 'paused'
            : 'unknown',
          spend: Math.round(c.spend * 100) / 100,
          roas: Math.round(c.roas * 100) / 100,
          ctr_pct: Math.round(c.ctr * 100) / 100,
          cpc: Math.round(c.cpc * 100) / 100,
          conversions: Math.round(c.conversions),
          alerts: detectCampaignAnomalies(c),
        })),
        metrics: {
          total_spend: Math.round(totalSpend * 100) / 100,
          total_conversions: Math.round(totalConversions),
          total_clicks: totalClicks,
          total_impressions: totalImpressions,
          blended_ctr_pct: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
          blended_cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
          active_campaigns: all.filter((c) => c.status === 'ENABLED' || c.status === 'ACTIVE').length,
          paused_campaigns: all.filter((c) => c.status === 'PAUSED' || c.status === 'paused').length,
          alert_count: allAlerts.length,
        },
        alerts: allAlerts,
        top_campaigns_by_spend: topBySpend.map((c) => ({
          name: c.name,
          platform: c.platform,
          spend: Math.round(c.spend * 100) / 100,
          roas: Math.round(c.roas * 100) / 100,
        })),
        findings,
        insights,
      },
      follow_ups: [
        'Show me which ad sets within the top campaigns need pausing',
        'Recommend bid adjustments for the highest-spend campaigns',
        'What creative changes would improve CTR on underperforming campaigns?',
        'Set up daily spend alerts for all campaigns',
        'Optimize ROAS across these campaigns',
      ],
    };
  }

  /** Return a structured campaign launch brief (LLM-free — structured template) */
  _buildCampaignBrief(brief) {
    const { campaignName, goal, budget, audience, platforms = [], startDate } = brief;
    const recommendedPlatforms = platforms.length > 0 ? platforms : ['Google Ads', 'Meta Ads'];

    return {
      prose: `Here's the campaign brief for "${campaignName}". I've outlined the recommended settings for ${recommendedPlatforms.join(' and ')} based on your goal and budget.`,
      response_type: 'execution',
      agent: PaidAdsAgent.id,
      crew: 'paid-ads',
      confidence: 0.75,
      connectors_used: [],
      artifact: {
        type: 'execution_tracker',
        status: 'pending_launch',
        campaign_brief: {
          name: campaignName,
          goal: goal || 'conversions',
          budget_daily: budget,
          audience,
          platforms: recommendedPlatforms,
          start_date: startDate || new Date().toISOString().split('T')[0],
          recommended_settings: recommendedPlatforms.map((p) => ({
            platform: p,
            campaign_type: goal === 'awareness' ? 'Display / Reach' : 'Search / Performance Max',
            bidding_strategy: goal === 'awareness' ? 'Target CPM' : 'Target CPA',
            daily_budget: budget ? (budget / recommendedPlatforms.length).toFixed(0) : 'TBD',
            audience_targeting: audience || 'Broad with interest refinement',
          })),
        },
        steps: [],
        metrics: {},
        alerts: [],
        findings: [`Campaign brief generated for "${campaignName}" across ${recommendedPlatforms.join(', ')}.`],
        insights: [
          'Connect your ad accounts to enable live campaign monitoring after launch.',
          'Start with a test budget for 7 days before scaling to identify the winning creative.',
        ],
      },
      follow_ups: [
        `Generate ad copy variants for "${campaignName}"`,
        'Review and optimize this campaign after 7 days',
        'Set up conversion tracking before launch',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem checking campaign status: ${message}`,
      response_type: 'execution',
      agent: PaidAdsAgent.id,
      crew: 'paid-ads',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'execution_tracker', status: 'error', steps: [], metrics: {}, alerts: [], findings: [message], insights: [] },
      follow_ups: [],
    };
  }

  _connectorError(toolkits = []) {
    const labels = toolkits.map((t) => t === 'google_ads' ? 'Google Ads' : 'Meta Ads').join(' and ');
    return {
      prose: `I need access to ${labels} to check campaign status. Please connect them in your Integrations settings.`,
      response_type: 'execution',
      agent: PaidAdsAgent.id,
      crew: 'paid-ads',
      confidence: 0,
      connectors_used: [],
      connector_missing: toolkits,
      artifact: { type: 'execution_tracker', status: 'connector_missing', steps: [], metrics: {}, alerts: [], findings: [`${labels} not connected.`], insights: [] },
      follow_ups: toolkits.map((t) => `Connect ${t === 'google_ads' ? 'Google Ads' : 'Meta Ads'} integration`),
    };
  }
}

module.exports = PaidAdsAgent;
module.exports.default = PaidAdsAgent;
