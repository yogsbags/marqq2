'use strict';

/**
 * Dev — Budget Optimization Agent
 *
 * Connects to Google Ads and Meta Ads via Composio to:
 * 1. Fetch campaign-level spend, ROAS, CPC, CTR, conversions
 * 2. Identify inefficiencies: over-spend on low-ROAS campaigns, under-spend on high-ROAS
 * 3. Produce a reallocation plan with conservative/aggressive scenarios
 *
 * Response type: "optimization"
 */

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';

// ── Composio helpers ──────────────────────────────────────────────────────────

async function resolveConnectedAccountId(entityId, toolkit, apiKey) {
  const res = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&toolkit_slug=${encodeURIComponent(toolkit)}&limit=10`,
    { headers: { 'x-api-key': apiKey } }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Connected account lookup failed for ${toolkit}: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const account = (data.items || []).find(
    (item) =>
      (item.user_id === entityId || item.entity_id === entityId) &&
      item.status === 'ACTIVE'
  );

  if (!account?.id) {
    throw new Error(`No active ${toolkit} connection for user ${entityId}`);
  }

  return account.id;
}

async function executeComposioTool(entityId, toolkit, toolSlug, args, apiKey) {
  let connectedAccountId;
  try {
    connectedAccountId = await resolveConnectedAccountId(entityId, toolkit, apiKey);
  } catch (err) {
    return { successful: false, data: null, error: String(err.message || err) };
  }

  let resp;
  try {
    resp = await fetch(`${COMPOSIO_V3}/tools/execute/${toolSlug}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected_account_id: connectedAccountId, arguments: args }),
    });
  } catch (networkErr) {
    return { successful: false, data: null, error: String(networkErr.message) };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return { successful: false, data: null, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` };
  }

  const result = await resp.json();
  return {
    successful: result.successful ?? true,
    data: result.data ?? result,
    error: result.error ?? null,
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDateRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().split('T')[0]; // YYYY-MM-DD
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ── Metric normalisers ────────────────────────────────────────────────────────

/**
 * Normalise a Google Ads campaign record to a flat CampaignMetrics shape.
 */
function normaliseGoogleCampaign(raw) {
  const m = raw.metrics || {};
  const c = raw.campaign || {};
  const spend = parseFloat(m.cost_micros || m.costMicros || 0) / 1_000_000;
  const conversions = parseFloat(m.conversions || 0);
  const conversionValue = parseFloat(m.conversions_value || m.conversionsValue || 0);
  const clicks = parseInt(m.clicks || 0, 10);
  const impressions = parseInt(m.impressions || 0, 10);

  return {
    id: c.id || raw.id || null,
    name: c.name || raw.name || 'Unknown Campaign',
    source: 'google_ads',
    spend,
    conversions,
    conversionValue,
    clicks,
    impressions,
    roas: spend > 0 ? conversionValue / spend : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    convRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
    status: c.status || raw.status || 'UNKNOWN',
  };
}

/**
 * Normalise a Meta Ads campaign record.
 */
function normaliseMetaCampaign(raw) {
  const spend = parseFloat(raw.spend || 0);
  const conversions = parseFloat(
    raw.actions?.find((a) => a.action_type === 'purchase')?.value ||
    raw.conversions ||
    0
  );
  const conversionValue = parseFloat(
    raw.action_values?.find((a) => a.action_type === 'purchase')?.value ||
    raw.conversion_values ||
    0
  );
  const clicks = parseInt(raw.clicks || raw.unique_clicks || 0, 10);
  const impressions = parseInt(raw.impressions || 0, 10);

  return {
    id: raw.campaign_id || raw.id || null,
    name: raw.campaign_name || raw.name || 'Unknown Campaign',
    source: 'meta_ads',
    spend,
    conversions,
    conversionValue,
    clicks,
    impressions,
    roas: spend > 0 ? conversionValue / spend : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    convRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
    status: raw.effective_status || raw.status || 'UNKNOWN',
  };
}

// ── Budget analysis ───────────────────────────────────────────────────────────

const ROAS_THRESHOLDS = {
  excellent: 4.0,  // Increase budget 20-30%
  good: 2.0,       // Maintain or modest increase
  break_even: 1.0, // Borderline — review creative
  poor: 0.5,       // Reduce budget 20-30%
};

function classifyRoas(roas) {
  if (roas >= ROAS_THRESHOLDS.excellent) return 'excellent';
  if (roas >= ROAS_THRESHOLDS.good) return 'good';
  if (roas >= ROAS_THRESHOLDS.break_even) return 'break_even';
  return 'poor';
}

function buildReallocationPlan(campaigns, totalBudget, aggressiveness = 'conservative') {
  const shift = aggressiveness === 'aggressive' ? 0.30 : 0.20;

  const excellent = campaigns.filter((c) => classifyRoas(c.roas) === 'excellent');
  const poor = campaigns.filter((c) => classifyRoas(c.roas) === 'poor');

  // Amount to shift = sum of poor × shift%
  const toReduce = poor.reduce((sum, c) => sum + c.spend * shift, 0);

  const plan = campaigns.map((c) => {
    const roasClass = classifyRoas(c.roas);
    let adjustment = 0;

    if (roasClass === 'poor') {
      adjustment = -(c.spend * shift);
    } else if (roasClass === 'excellent' && excellent.length > 0) {
      // Distribute freed budget proportionally to excellent campaigns
      const share = c.spend / excellent.reduce((s, e) => s + e.spend, 0.01);
      adjustment = toReduce * share;
    }

    return {
      id: c.id,
      name: c.name,
      source: c.source,
      current_spend: Math.round(c.spend * 100) / 100,
      recommended_spend: Math.max(0, Math.round((c.spend + adjustment) * 100) / 100),
      adjustment: Math.round(adjustment * 100) / 100,
      current_roas: Math.round(c.roas * 100) / 100,
      roas_class: roasClass,
      rationale: roasClass === 'poor'
        ? `ROAS ${c.roas.toFixed(2)}x is below break-even. Reduce spend by ${Math.round(shift * 100)}% and pause underperforming ad sets.`
        : roasClass === 'excellent'
          ? `ROAS ${c.roas.toFixed(2)}x signals untapped capacity. Increase budget to capture incremental conversions.`
          : `ROAS ${c.roas.toFixed(2)}x is acceptable. Maintain spend; focus on creative refresh.`,
    };
  });

  // Project ROAS improvement
  const currentTotalValue = campaigns.reduce((s, c) => s + c.conversionValue, 0);
  const projectedValue = excellent.reduce((s, c) => {
    const rec = plan.find((p) => p.id === c.id);
    const spendRatio = rec ? rec.recommended_spend / (c.spend || 1) : 1;
    return s + c.conversionValue * spendRatio * 0.85; // 85% efficiency on incremental
  }, 0) + campaigns
    .filter((c) => classifyRoas(c.roas) !== 'excellent' && classifyRoas(c.roas) !== 'poor')
    .reduce((s, c) => s + c.conversionValue, 0);

  const projectedRoas = totalBudget > 0 ? projectedValue / totalBudget : 0;
  const currentRoas = totalBudget > 0 ? currentTotalValue / totalBudget : 0;
  const roasLift = currentRoas > 0 ? ((projectedRoas - currentRoas) / currentRoas) * 100 : 0;

  return {
    line_items: plan,
    summary: {
      budget_shifted: Math.round(toReduce * 100) / 100,
      campaigns_increased: excellent.length,
      campaigns_decreased: poor.length,
      projected_roas: Math.round(projectedRoas * 100) / 100,
      current_roas: Math.round(currentRoas * 100) / 100,
      projected_roas_lift_pct: Math.round(roasLift * 10) / 10,
      confidence: poor.length > 0 || excellent.length > 0 ? 'medium' : 'low',
    },
  };
}

// ── Agent class ───────────────────────────────────────────────────────────────

class DevBudgetAgent {
  static id = 'dev-budget';
  static name = 'Dev — Budget Optimization Agent';
  static role = 'Budget Optimization Agent';
  static crews = ['paid-ads-optimization'];

  /**
   * Execute budget optimization analysis.
   *
   * @param {Object} request
   * @param {string} request.entityId          - Workspace / user ID for Composio
   * @param {string} [request.apiKey]          - Composio API key (falls back to env)
   * @param {number} [request.lookbackDays=30] - Days of data to analyse
   * @param {string} [request.currency='USD']  - Currency for display
   * @param {string} [request.aggressiveness='conservative'] - 'conservative' | 'aggressive'
   * @returns {Promise<Object>} Optimization response
   */
  async execute(request = {}) {
    const {
      entityId,
      apiKey = process.env.COMPOSIO_API_KEY,
      lookbackDays = 30,
      currency = 'USD',
      aggressiveness = 'conservative',
    } = request;

    if (!entityId) return this._error('entityId is required.');
    if (!apiKey) return this._error('COMPOSIO_API_KEY is not set.');

    const { startDate, endDate } = getDateRange(lookbackDays);

    // ── 1. Fetch Google Ads campaigns ─────────────────────────────────────────
    const [googleResult, metaResult] = await Promise.all([
      executeComposioTool(
        entityId,
        'googleads',
        'GOOGLEADS_LIST_CAMPAIGNS',
        {
          start_date: startDate,
          end_date: endDate,
          fields: [
            'campaign.id',
            'campaign.name',
            'campaign.status',
            'metrics.cost_micros',
            'metrics.clicks',
            'metrics.impressions',
            'metrics.conversions',
            'metrics.conversions_value',
          ].join(','),
        },
        apiKey
      ),
      executeComposioTool(
        entityId,
        'facebook',
        'FACEBOOK_GET_AD_INSIGHTS',
        {
          level: 'campaign',
          time_range: JSON.stringify({ since: startDate, until: endDate }),
          fields: 'campaign_id,campaign_name,spend,clicks,impressions,actions,action_values,effective_status',
        },
        apiKey
      ),
    ]);

    const googleOk = googleResult.successful;
    const metaOk = metaResult.successful;

    // If both connectors are missing, return connector error
    if (!googleOk && !metaOk) {
      return this._connectorError(
        [
          !googleOk ? `Google Ads: ${googleResult.error}` : null,
          !metaOk ? `Meta Ads: ${metaResult.error}` : null,
        ].filter(Boolean).join(' | '),
        ['google_ads', 'meta_ads']
      );
    }

    // ── 2. Normalise campaigns ────────────────────────────────────────────────
    const googleCampaigns = googleOk
      ? (Array.isArray(googleResult.data)
          ? googleResult.data
          : googleResult.data?.campaigns || googleResult.data?.results || []
        ).map(normaliseGoogleCampaign)
      : [];

    const metaCampaigns = metaOk
      ? (Array.isArray(metaResult.data)
          ? metaResult.data
          : metaResult.data?.data || metaResult.data?.campaigns || []
        ).map(normaliseMetaCampaign)
      : [];

    const allCampaigns = [...googleCampaigns, ...metaCampaigns];

    if (allCampaigns.length === 0) {
      return this._error(
        'No campaign data found for the selected period. Ensure campaigns were active and have spend data.'
      );
    }

    // ── 3. Aggregate cross-channel KPIs ───────────────────────────────────────
    const totalSpend = allCampaigns.reduce((s, c) => s + c.spend, 0);
    const totalValue = allCampaigns.reduce((s, c) => s + c.conversionValue, 0);
    const totalConversions = allCampaigns.reduce((s, c) => s + c.conversions, 0);
    const totalClicks = allCampaigns.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = allCampaigns.reduce((s, c) => s + c.impressions, 0);
    const blendedRoas = totalSpend > 0 ? totalValue / totalSpend : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgConvRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // ── 4. Build reallocation plan ────────────────────────────────────────────
    const conservativePlan = buildReallocationPlan(allCampaigns, totalSpend, 'conservative');
    const aggressivePlan = buildReallocationPlan(allCampaigns, totalSpend, 'aggressive');

    const primaryPlan = aggressiveness === 'aggressive' ? aggressivePlan : conservativePlan;

    // ── 5. Channel breakdown ──────────────────────────────────────────────────
    const channelBreakdown = [
      googleOk && {
        channel: 'Google Ads',
        spend: googleCampaigns.reduce((s, c) => s + c.spend, 0),
        roas: (() => {
          const sp = googleCampaigns.reduce((s, c) => s + c.spend, 0);
          const val = googleCampaigns.reduce((s, c) => s + c.conversionValue, 0);
          return sp > 0 ? val / sp : 0;
        })(),
        campaigns: googleCampaigns.length,
        status: 'connected',
      },
      metaOk && {
        channel: 'Meta Ads',
        spend: metaCampaigns.reduce((s, c) => s + c.spend, 0),
        roas: (() => {
          const sp = metaCampaigns.reduce((s, c) => s + c.spend, 0);
          const val = metaCampaigns.reduce((s, c) => s + c.conversionValue, 0);
          return sp > 0 ? val / sp : 0;
        })(),
        campaigns: metaCampaigns.length,
        status: 'connected',
      },
    ].filter(Boolean);

    // ── 6. Build findings ─────────────────────────────────────────────────────
    const poor = allCampaigns.filter((c) => classifyRoas(c.roas) === 'poor');
    const excellent = allCampaigns.filter((c) => classifyRoas(c.roas) === 'excellent');

    const findings = [
      `Analysed ${allCampaigns.length} campaigns across ${channelBreakdown.length} channel${channelBreakdown.length > 1 ? 's' : ''} over ${lookbackDays} days.`,
      `Total spend: ${currency} ${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} | Blended ROAS: ${blendedRoas.toFixed(2)}x`,
      `${excellent.length} campaigns are high-performers (ROAS ≥ ${ROAS_THRESHOLDS.excellent}x) — candidates for budget increase.`,
      `${poor.length} campaigns are below break-even (ROAS < 1.0) — consuming ${currency} ${poor.reduce((s, c) => s + c.spend, 0).toFixed(0)} with minimal return.`,
    ];

    if (primaryPlan.summary.budget_shifted > 0) {
      findings.push(
        `${aggressiveness === 'aggressive' ? 'Aggressive' : 'Conservative'} reallocation shifts ${currency} ${primaryPlan.summary.budget_shifted.toFixed(0)}, projecting ROAS improvement of +${primaryPlan.summary.projected_roas_lift_pct}%.`
      );
    }

    const insights = [
      excellent.length > 0
        ? `Scale up: ${excellent.map((c) => c.name).slice(0, 2).join(', ')} are delivering strong returns — increase their budgets first.`
        : 'No campaigns are currently delivering excellent ROAS. Focus on improving ad creative and targeting before scaling spend.',
      poor.length > 0
        ? `Cut or pause: ${poor.map((c) => c.name).slice(0, 2).join(', ')} have ROAS below 1.0 — every dollar spent is losing money.`
        : 'No campaigns are in loss-making territory. Good foundation for incremental scaling.',
      `Average CPC across channels: ${currency} ${avgCpc.toFixed(2)}. Target CPC should be below ${currency} ${(totalValue / (totalConversions || 1) * 0.3).toFixed(2)} to maintain 30% margin.`,
    ];

    // ── 7. Build prose ────────────────────────────────────────────────────────
    const prose = [
      `I analysed ${allCampaigns.length} active campaigns across ${channelBreakdown.map((c) => c.channel).join(' and ')} over the past ${lookbackDays} days.`,
      `Your blended ROAS is ${blendedRoas.toFixed(2)}x on ${currency} ${totalSpend.toLocaleString()} spend, generating ${currency} ${totalValue.toLocaleString()} in conversion value.`,
      poor.length > 0
        ? ` ${poor.length} campaign${poor.length > 1 ? 's are' : ' is'} below break-even — I recommend reallocating ${currency} ${primaryPlan.summary.budget_shifted.toFixed(0)} from these to your top performers.`
        : ' All campaigns are above break-even.',
      primaryPlan.summary.projected_roas_lift_pct > 0
        ? ` The ${aggressiveness} reallocation plan projects a +${primaryPlan.summary.projected_roas_lift_pct}% ROAS improvement with no increase in total budget.`
        : '',
    ].join('');

    return {
      prose,
      response_type: 'optimization',
      agent: DevBudgetAgent.id,
      crew: 'paid-ads-optimization',
      confidence: primaryPlan.summary.confidence === 'medium' ? 0.78 : 0.55,
      connectors_used: [
        googleOk && 'google_ads',
        metaOk && 'meta_ads',
      ].filter(Boolean),
      artifact: {
        type: 'optimization_plan',
        current_state: {
          period_days: lookbackDays,
          start_date: startDate,
          end_date: endDate,
          total_spend: Math.round(totalSpend * 100) / 100,
          total_conversion_value: Math.round(totalValue * 100) / 100,
          total_conversions: Math.round(totalConversions),
          blended_roas: Math.round(blendedRoas * 100) / 100,
          avg_cpc: Math.round(avgCpc * 100) / 100,
          avg_ctr_pct: Math.round(avgCtr * 100) / 100,
          avg_conv_rate_pct: Math.round(avgConvRate * 100) / 100,
          currency,
          channel_breakdown: channelBreakdown.map((c) => ({
            ...c,
            spend: Math.round(c.spend * 100) / 100,
            roas: Math.round(c.roas * 100) / 100,
          })),
          campaigns: allCampaigns.map((c) => ({
            id: c.id,
            name: c.name,
            source: c.source,
            spend: Math.round(c.spend * 100) / 100,
            roas: Math.round(c.roas * 100) / 100,
            roas_class: classifyRoas(c.roas),
            cpc: Math.round(c.cpc * 100) / 100,
            ctr_pct: Math.round(c.ctr * 100) / 100,
            conv_rate_pct: Math.round(c.convRate * 100) / 100,
          })),
        },
        recommendation: primaryPlan,
        scenarios: {
          conservative: conservativePlan.summary,
          aggressive: aggressivePlan.summary,
        },
        expected_impact: {
          current_roas: Math.round(blendedRoas * 100) / 100,
          projected_roas: primaryPlan.summary.projected_roas,
          roas_lift_pct: primaryPlan.summary.projected_roas_lift_pct,
          budget_shifted: primaryPlan.summary.budget_shifted,
          confidence: primaryPlan.summary.confidence,
        },
        findings,
        insights,
      },
      follow_ups: [
        'Show me the worst-performing ad sets within these campaigns',
        'What creative changes would improve ROAS on the underperforming campaigns?',
        `Draft a ${lookbackDays}-day budget reallocation schedule`,
        'Compare ROAS trends week-over-week for the past 90 days',
        'Set up weekly budget optimization alerts',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem with the budget analysis: ${message}`,
      response_type: 'optimization',
      agent: DevBudgetAgent.id,
      crew: 'paid-ads-optimization',
      confidence: 0,
      connectors_used: [],
      artifact: {
        type: 'optimization_plan',
        current_state: {},
        recommendation: {},
        expected_impact: {},
        findings: [`Error: ${message}`],
        insights: [],
      },
      follow_ups: [],
    };
  }

  _connectorError(errorDetail, toolkits = []) {
    const labels = toolkits.map((t) => t === 'google_ads' ? 'Google Ads' : t === 'meta_ads' ? 'Meta Ads' : t).join(' and ');
    return {
      prose: `I need access to ${labels} to run budget analysis, but the connection${toolkits.length > 1 ? 's are' : ' is'} not active. Please connect them in your Integrations settings and try again.`,
      response_type: 'optimization',
      agent: DevBudgetAgent.id,
      crew: 'paid-ads-optimization',
      confidence: 0,
      connectors_used: [],
      connector_missing: toolkits,
      connector_error: errorDetail,
      artifact: {
        type: 'optimization_plan',
        current_state: {},
        recommendation: {},
        expected_impact: {},
        findings: [`${labels} connector not active.`],
        insights: [`Connect ${labels} via the Integrations page to enable budget optimization.`],
      },
      follow_ups: toolkits.map((t) => `Connect ${t === 'google_ads' ? 'Google Ads' : 'Meta Ads'} integration`),
    };
  }
}

module.exports = DevBudgetAgent;
module.exports.default = DevBudgetAgent;
