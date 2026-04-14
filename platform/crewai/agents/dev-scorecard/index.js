'use strict';

/**
 * Dev — Performance Scorecard Agent
 *
 * Connects to GA4 via Composio to:
 * 1. Fetch sessions, users, bounce rate, engagement, conversions, revenue
 * 2. Break down by channel (organic, paid, direct, social, referral, email)
 * 3. Compare current period vs prior period
 * 4. Surface top pages and anomalies
 *
 * Response type: "analysis"
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

function getDateRanges(days = 30) {
  const now = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];

  const endCurrent = new Date(now);
  endCurrent.setDate(endCurrent.getDate() - 1); // Yesterday (GA4 data lag)
  const startCurrent = new Date(endCurrent);
  startCurrent.setDate(startCurrent.getDate() - (days - 1));

  const endPrior = new Date(startCurrent);
  endPrior.setDate(endPrior.getDate() - 1);
  const startPrior = new Date(endPrior);
  startPrior.setDate(startPrior.getDate() - (days - 1));

  return {
    current: { startDate: fmt(startCurrent), endDate: fmt(endCurrent) },
    prior: { startDate: fmt(startPrior), endDate: fmt(endPrior) },
  };
}

// ── Metric extraction ─────────────────────────────────────────────────────────

/**
 * Extract a named metric value from GA4 report rows.
 * GA4 returns rows with dimensionValues + metricValues arrays.
 */
function extractMetricSum(rows = [], metricNames = [], metricIndex = 0) {
  return rows.reduce((sum, row) => {
    const val = parseFloat(
      row.metricValues?.[metricIndex]?.value ||
      row.metrics?.[metricIndex]?.values?.[0] ||
      0
    );
    return sum + val;
  }, 0);
}

function extractMetricByDimension(rows = [], dimensionIndex = 0, metricIndex = 0) {
  const map = {};
  rows.forEach((row) => {
    const dim = row.dimensionValues?.[dimensionIndex]?.value ||
                row.dimensions?.[dimensionIndex] ||
                'unknown';
    const val = parseFloat(
      row.metricValues?.[metricIndex]?.value ||
      row.metrics?.[metricIndex]?.values?.[0] ||
      0
    );
    map[dim] = (map[dim] || 0) + val;
  });
  return map;
}

// ── GA4 data normalisers ──────────────────────────────────────────────────────

/**
 * Parse GA4 RunReport response into a flat KPI object.
 * Handles both GA4 Data API v1 format and Composio wrapper variations.
 */
function normaliseGA4Report(data) {
  if (!data) return null;

  // Flatten nested Composio wrapper if present
  const report = data.reports?.[0] || data.report || data;
  const rows = report.rows || data.rows || [];

  // GA4 standard metrics we request
  const metricOrder = [
    'sessions', 'totalUsers', 'newUsers',
    'bounceRate', 'averageSessionDuration', 'screenPageViews',
    'conversions', 'totalRevenue', 'engagementRate',
  ];

  // If rows exist, sum each metric across all rows
  const totals = {};
  metricOrder.forEach((metric, idx) => {
    totals[metric] = extractMetricSum(rows, metricOrder, idx);
  });

  // Also try top-level totals from GA4 (totals array)
  const topTotals = report.totals?.[0]?.metricValues || [];
  if (topTotals.length > 0) {
    metricOrder.forEach((metric, idx) => {
      if (topTotals[idx]) {
        totals[metric] = parseFloat(topTotals[idx].value || 0);
      }
    });
  }

  return {
    sessions: Math.round(totals.sessions || 0),
    users: Math.round(totals.totalUsers || 0),
    newUsers: Math.round(totals.newUsers || 0),
    bounceRate: Math.round((totals.bounceRate || 0) * 100) / 100,
    avgSessionDuration: Math.round(totals.averageSessionDuration || 0),
    pageViews: Math.round(totals.screenPageViews || 0),
    conversions: Math.round(totals.conversions || 0),
    revenue: Math.round((totals.totalRevenue || 0) * 100) / 100,
    engagementRate: Math.round((totals.engagementRate || 0) * 10000) / 100, // as %
    rows,
  };
}

// ── Delta calculation ─────────────────────────────────────────────────────────

function delta(current, prior) {
  if (!prior || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10; // percent, 1dp
}

function deltaLabel(pct) {
  if (pct === null) return 'no prior data';
  if (pct > 20) return `+${pct}% ⚠️ significant increase`;
  if (pct > 0) return `+${pct}%`;
  if (pct < -20) return `${pct}% ⚠️ significant drop`;
  return `${pct}%`;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

function detectAnomalies(current, prior) {
  const anomalies = [];
  const checks = [
    { key: 'sessions', label: 'Sessions', invertedBad: false },
    { key: 'conversions', label: 'Conversions', invertedBad: false },
    { key: 'bounceRate', label: 'Bounce Rate', invertedBad: true },
    { key: 'revenue', label: 'Revenue', invertedBad: false },
  ];

  checks.forEach(({ key, label, invertedBad }) => {
    const pct = delta(current[key], prior[key]);
    if (pct === null) return;
    if (Math.abs(pct) >= 20) {
      const isBad = invertedBad ? pct > 0 : pct < 0;
      anomalies.push({
        metric: label,
        change_pct: pct,
        direction: pct > 0 ? 'up' : 'down',
        severity: Math.abs(pct) >= 40 ? 'high' : 'medium',
        is_negative: isBad,
        message: `${label} ${pct > 0 ? 'increased' : 'dropped'} by ${Math.abs(pct)}% vs prior period — ${isBad ? 'requires attention' : 'positive signal'}.`,
      });
    }
  });

  return anomalies;
}

// ── Confidence ────────────────────────────────────────────────────────────────

function confidenceLevel(sessions) {
  if (sessions >= 1000) return 'high';
  if (sessions >= 100) return 'medium';
  return 'low';
}

// ── Agent class ───────────────────────────────────────────────────────────────

class DevScorecardAgent {
  static id = 'dev-scorecard';
  static name = 'Dev — Performance Scorecard Agent';
  static role = 'Performance Scorecard Agent';
  static crews = ['analytics'];

  /**
   * Execute GA4 performance scorecard.
   *
   * @param {Object} request
   * @param {string} request.entityId          - Workspace / user ID for Composio
   * @param {string} [request.apiKey]          - Composio API key (falls back to env)
   * @param {string} [request.propertyId]      - GA4 property ID (e.g. '123456789')
   * @param {number} [request.lookbackDays=30] - Days of data to analyse
   * @returns {Promise<Object>} Analysis response
   */
  async execute(request = {}) {
    const {
      entityId,
      apiKey = process.env.COMPOSIO_API_KEY,
      propertyId,
      lookbackDays = 30,
    } = request;

    if (!entityId) return this._error('entityId is required.');
    if (!apiKey) return this._error('COMPOSIO_API_KEY is not set.');

    const { current: curr, prior } = getDateRanges(lookbackDays);

    const GA4_METRICS = [
      'sessions', 'totalUsers', 'newUsers',
      'bounceRate', 'averageSessionDuration', 'screenPageViews',
      'conversions', 'totalRevenue', 'engagementRate',
    ];

    const commonArgs = {
      property_id: propertyId,
      metrics: GA4_METRICS,
    };

    // Fetch current + prior periods + channel breakdown in parallel
    const [currentResult, priorResult, channelResult, pagesResult] = await Promise.all([
      executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', {
        ...commonArgs,
        start_date: curr.startDate,
        end_date: curr.endDate,
      }, apiKey),
      executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', {
        ...commonArgs,
        start_date: prior.startDate,
        end_date: prior.endDate,
      }, apiKey),
      executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', {
        property_id: propertyId,
        dimensions: ['sessionDefaultChannelGroup'],
        metrics: ['sessions', 'conversions', 'totalRevenue'],
        start_date: curr.startDate,
        end_date: curr.endDate,
      }, apiKey),
      executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', {
        property_id: propertyId,
        dimensions: ['pagePath'],
        metrics: ['sessions', 'screenPageViews', 'conversions'],
        start_date: curr.startDate,
        end_date: curr.endDate,
        order_bys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }, apiKey),
    ]);

    if (!currentResult.successful) {
      return this._connectorError(currentResult.error || 'GA4 report fetch failed');
    }

    // ── Parse data ────────────────────────────────────────────────────────────
    const currentKpis = normaliseGA4Report(currentResult.data);
    const priorKpis = priorResult.successful ? normaliseGA4Report(priorResult.data) : null;

    if (!currentKpis) {
      return this._error('GA4 returned no data for the selected period.');
    }

    // ── Channel breakdown ─────────────────────────────────────────────────────
    const channelRows = channelResult.successful
      ? (channelResult.data?.rows || channelResult.data?.report?.rows || [])
      : [];

    const channelBreakdown = channelRows
      .map((row) => ({
        channel: row.dimensionValues?.[0]?.value || row.dimensions?.[0] || 'Unknown',
        sessions: Math.round(parseFloat(row.metricValues?.[0]?.value || 0)),
        conversions: Math.round(parseFloat(row.metricValues?.[1]?.value || 0)),
        revenue: Math.round(parseFloat(row.metricValues?.[2]?.value || 0) * 100) / 100,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);

    // ── Top pages ─────────────────────────────────────────────────────────────
    const pagesRows = pagesResult.successful
      ? (pagesResult.data?.rows || pagesResult.data?.report?.rows || [])
      : [];

    const topPages = pagesRows
      .map((row) => ({
        path: row.dimensionValues?.[0]?.value || row.dimensions?.[0] || '/',
        sessions: Math.round(parseFloat(row.metricValues?.[0]?.value || 0)),
        pageViews: Math.round(parseFloat(row.metricValues?.[1]?.value || 0)),
        conversions: Math.round(parseFloat(row.metricValues?.[2]?.value || 0)),
      }))
      .slice(0, 5);

    // ── Period-over-period deltas ─────────────────────────────────────────────
    const deltas = priorKpis ? {
      sessions: delta(currentKpis.sessions, priorKpis.sessions),
      users: delta(currentKpis.users, priorKpis.users),
      bounceRate: delta(currentKpis.bounceRate, priorKpis.bounceRate),
      conversions: delta(currentKpis.conversions, priorKpis.conversions),
      revenue: delta(currentKpis.revenue, priorKpis.revenue),
      engagementRate: delta(currentKpis.engagementRate, priorKpis.engagementRate),
    } : {};

    // ── Anomalies ─────────────────────────────────────────────────────────────
    const anomalies = priorKpis ? detectAnomalies(currentKpis, priorKpis) : [];

    // ── Confidence ────────────────────────────────────────────────────────────
    const confidence = confidenceLevel(currentKpis.sessions);
    const confidenceScore = confidence === 'high' ? 0.92 : confidence === 'medium' ? 0.75 : 0.55;

    // ── Findings & insights ───────────────────────────────────────────────────
    const findings = [
      `${currentKpis.sessions.toLocaleString()} sessions from ${currentKpis.users.toLocaleString()} users in the past ${lookbackDays} days.`,
      priorKpis
        ? `Sessions ${deltas.sessions !== null ? deltaLabel(deltas.sessions) : 'N/A'} vs prior ${lookbackDays}-day period.`
        : 'No prior period data available for comparison.',
      `Conversion rate: ${currentKpis.sessions > 0 ? ((currentKpis.conversions / currentKpis.sessions) * 100).toFixed(2) : 0}% (${currentKpis.conversions.toLocaleString()} conversions).`,
      currentKpis.revenue > 0
        ? `Total revenue: $${currentKpis.revenue.toLocaleString()} ${deltas.revenue !== null ? `(${deltaLabel(deltas.revenue)} vs prior period)` : ''}.`
        : 'No revenue data available — ensure GA4 e-commerce tracking is configured.',
      `Engagement rate: ${currentKpis.engagementRate}% | Avg session: ${Math.floor(currentKpis.avgSessionDuration / 60)}m ${currentKpis.avgSessionDuration % 60}s.`,
    ];

    const positiveAnomalies = anomalies.filter((a) => !a.is_negative);
    const negativeAnomalies = anomalies.filter((a) => a.is_negative);

    const insights = [
      negativeAnomalies.length > 0
        ? `Watch out: ${negativeAnomalies[0].message}`
        : 'No significant negative anomalies detected — metrics are within normal range.',
      positiveAnomalies.length > 0
        ? `Positive signal: ${positiveAnomalies[0].message}`
        : null,
      channelBreakdown.length > 0
        ? `Top traffic source: ${channelBreakdown[0].channel} (${channelBreakdown[0].sessions.toLocaleString()} sessions). ${channelBreakdown[0].conversions > 0 ? `Driving ${channelBreakdown[0].conversions} conversions.` : ''}`
        : null,
      topPages.length > 0
        ? `Most-visited page: ${topPages[0].path} (${topPages[0].sessions.toLocaleString()} sessions). ${topPages[0].conversions > 0 ? `${topPages[0].conversions} conversions from this page.` : ''}`
        : null,
    ].filter(Boolean);

    // ── Prose ─────────────────────────────────────────────────────────────────
    const topFinding = negativeAnomalies.length > 0
      ? `Key concern: ${negativeAnomalies[0].metric} is down ${Math.abs(negativeAnomalies[0].change_pct)}% — investigate immediately.`
      : positiveAnomalies.length > 0
        ? `Good news: ${positiveAnomalies[0].metric} is up ${positiveAnomalies[0].change_pct}%.`
        : 'Metrics are stable with no major anomalies.';

    const prose = [
      `Here's your ${lookbackDays}-day performance scorecard from GA4.`,
      ` You had ${currentKpis.sessions.toLocaleString()} sessions and ${currentKpis.conversions.toLocaleString()} conversions`,
      priorKpis && deltas.sessions !== null
        ? ` (sessions ${deltaLabel(deltas.sessions)} vs prior period)`
        : '',
      currentKpis.revenue > 0 ? `, generating $${currentKpis.revenue.toLocaleString()} in revenue` : '',
      `. ${topFinding}`,
    ].join('');

    return {
      prose,
      response_type: 'analysis',
      agent: DevScorecardAgent.id,
      crew: 'analytics',
      confidence: confidenceScore,
      connectors_used: ['ga4'],
      artifact: {
        type: 'analysis',
        metrics: {
          // Current period
          sessions: currentKpis.sessions,
          users: currentKpis.users,
          new_users: currentKpis.newUsers,
          page_views: currentKpis.pageViews,
          bounce_rate_pct: currentKpis.bounceRate,
          avg_session_duration_sec: currentKpis.avgSessionDuration,
          engagement_rate_pct: currentKpis.engagementRate,
          conversions: currentKpis.conversions,
          conversion_rate_pct: currentKpis.sessions > 0
            ? Math.round((currentKpis.conversions / currentKpis.sessions) * 10000) / 100
            : 0,
          revenue: currentKpis.revenue,
          // Period
          period_days: lookbackDays,
          start_date: curr.startDate,
          end_date: curr.endDate,
          data_confidence: confidence,
          // Deltas
          ...(priorKpis ? {
            sessions_delta_pct: deltas.sessions,
            users_delta_pct: deltas.users,
            bounce_rate_delta_pct: deltas.bounceRate,
            conversions_delta_pct: deltas.conversions,
            revenue_delta_pct: deltas.revenue,
            engagement_rate_delta_pct: deltas.engagementRate,
          } : {}),
        },
        findings,
        insights,
        // Extended data for UI rendering
        channel_breakdown: channelBreakdown,
        top_pages: topPages,
        anomalies,
        prior_period: priorKpis ? {
          sessions: priorKpis.sessions,
          conversions: priorKpis.conversions,
          revenue: priorKpis.revenue,
          start_date: prior.startDate,
          end_date: prior.endDate,
        } : null,
      },
      follow_ups: [
        'Show me a 90-day trend for sessions and conversions',
        'Which pages have the highest drop-off rate?',
        'Break down conversions by traffic source',
        'Compare organic vs paid performance this month',
        'Set up weekly performance alerts for these metrics',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem generating the performance scorecard: ${message}`,
      response_type: 'analysis',
      agent: DevScorecardAgent.id,
      crew: 'analytics',
      confidence: 0,
      connectors_used: [],
      artifact: {
        type: 'analysis',
        metrics: {},
        findings: [`Error: ${message}`],
        insights: [],
        channel_breakdown: [],
        top_pages: [],
        anomalies: [],
      },
      follow_ups: [],
    };
  }

  _connectorError(errorDetail) {
    return {
      prose: `I need access to Google Analytics 4 to generate the performance scorecard, but the connection isn't active. Please connect GA4 in your Integrations settings and try again.`,
      response_type: 'analysis',
      agent: DevScorecardAgent.id,
      crew: 'analytics',
      confidence: 0,
      connectors_used: [],
      connector_missing: 'ga4',
      connector_error: errorDetail,
      artifact: {
        type: 'analysis',
        metrics: {},
        findings: [`GA4 connector not active. Error: ${errorDetail}`],
        insights: ['Connect Google Analytics 4 via the Integrations page to enable performance scorecards.'],
        channel_breakdown: [],
        top_pages: [],
        anomalies: [],
      },
      follow_ups: ['Connect Google Analytics 4 integration', 'Re-run scorecard after connecting'],
    };
  }
}

module.exports = DevScorecardAgent;
module.exports.default = DevScorecardAgent;
