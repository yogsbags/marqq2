'use strict';

/**
 * CRO Agent — Conversion Rate Optimization
 *
 * Fetches GA4 funnel + goal data via Composio, computes drop-off rates,
 * and produces ICE-scored A/B test hypotheses.
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

function getDateRange(days = 30) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const fmt = (d) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ── ICE scoring ───────────────────────────────────────────────────────────────

/**
 * ICE score: Impact × Confidence / Ease (each 1-10)
 * Higher = test this first
 */
function iceScore(impact, confidence, ease) {
  return Math.round((impact * confidence) / ease * 10) / 10;
}

// ── Hypothesis library ────────────────────────────────────────────────────────

/**
 * Generate data-driven hypotheses based on funnel metrics.
 * Returns array of hypothesis objects with ICE scores.
 */
function generateHypotheses(metrics) {
  const { bounceRate, convRate, avgSessionDuration, sessions, pageViews } = metrics;
  const pagesPerSession = sessions > 0 ? pageViews / sessions : 0;
  const hypotheses = [];

  // High bounce rate → above-the-fold hypothesis
  if (bounceRate > 60) {
    hypotheses.push({
      id: 'h1',
      element: 'Hero / Above the Fold',
      hypothesis: 'Visitors are leaving before engaging because the hero section fails to communicate value clearly.',
      test: 'A/B test hero headline: control (current) vs. benefit-led headline that names the visitor\'s specific pain point.',
      primary_metric: 'Bounce Rate',
      current_value: `${bounceRate.toFixed(1)}%`,
      expected_lift: bounceRate > 75 ? '15-25% bounce rate reduction' : '8-15% bounce rate reduction',
      minimum_sample: 1000,
      impact: bounceRate > 75 ? 9 : 7,
      confidence: 8,
      ease: 4,
    });
  }

  // Low conversion rate → CTA hypothesis
  if (convRate < 2) {
    hypotheses.push({
      id: 'h2',
      element: 'Primary CTA',
      hypothesis: 'The primary CTA is not compelling enough to drive action — it likely uses generic text ("Submit", "Learn More") with low urgency.',
      test: 'Test CTA copy: control vs. action-led CTA naming the outcome (e.g. "Get My Free Report", "Start Saving Today").',
      primary_metric: 'Conversion Rate',
      current_value: `${convRate.toFixed(2)}%`,
      expected_lift: '10-20% conversion rate improvement',
      minimum_sample: 500,
      impact: 9,
      confidence: 9,
      ease: 9,
    });
  }

  // Low time on site → content relevance hypothesis
  if (avgSessionDuration < 60) {
    hypotheses.push({
      id: 'h3',
      element: 'Page Content / Trust Signals',
      hypothesis: 'Short session duration suggests visitors are not finding the content relevant or credible.',
      test: 'Add social proof above the fold (customer count, logos, review score). Test control vs. social proof variant.',
      primary_metric: 'Avg. Session Duration',
      current_value: `${Math.floor(avgSessionDuration / 60)}m ${avgSessionDuration % 60}s`,
      expected_lift: '20-30% session duration increase',
      minimum_sample: 800,
      impact: 7,
      confidence: 7,
      ease: 6,
    });
  }

  // Low pages/session → navigation/internal linking hypothesis
  if (pagesPerSession < 2 && sessions > 100) {
    hypotheses.push({
      id: 'h4',
      element: 'Navigation / Internal Links',
      hypothesis: 'Visitors are not exploring beyond the landing page, suggesting poor navigation cues or lack of relevant next steps.',
      test: 'Add inline content recommendations or a "What to do next" section at 75% scroll depth.',
      primary_metric: 'Pages per Session',
      current_value: pagesPerSession.toFixed(1),
      expected_lift: '25-35% pages per session increase',
      minimum_sample: 600,
      impact: 6,
      confidence: 7,
      ease: 7,
    });
  }

  // Universal quick win: form length
  hypotheses.push({
    id: 'h5',
    element: 'Lead Form',
    hypothesis: 'Forms with more than 3 fields have measurable drop-off. Reducing to name + email could increase form completions.',
    test: 'A/B test: current form vs. 2-field form (name + email), move extra fields to post-conversion onboarding.',
    primary_metric: 'Form Completion Rate',
    current_value: 'Unknown (instrument form tracking)',
    expected_lift: '20-40% form completion increase',
    minimum_sample: 400,
    impact: 8,
    confidence: 9,
    ease: 8,
  });

  // Score and sort
  return hypotheses
    .map((h) => ({ ...h, ice_score: iceScore(h.impact, h.confidence, h.ease) }))
    .sort((a, b) => b.ice_score - a.ice_score);
}

// ── Funnel analysis ───────────────────────────────────────────────────────────

function normaliseFunnelReport(data) {
  if (!data) return null;
  const report = data.reports?.[0] || data.report || data;
  const rows = report.rows || data.rows || [];
  const totals = report.totals?.[0]?.metricValues || [];

  const metricOrder = [
    'sessions', 'totalUsers', 'bounceRate', 'averageSessionDuration',
    'screenPageViews', 'conversions', 'engagementRate',
  ];

  const result = {};
  metricOrder.forEach((m, i) => {
    result[m] = parseFloat(totals[i]?.value || 0) ||
      rows.reduce((s, r) => s + parseFloat(r.metricValues?.[i]?.value || 0), 0);
  });

  return {
    sessions: Math.round(result.sessions),
    users: Math.round(result.totalUsers),
    bounceRate: Math.round(result.bounceRate * 100) / 100,
    avgSessionDuration: Math.round(result.averageSessionDuration),
    pageViews: Math.round(result.screenPageViews),
    conversions: Math.round(result.conversions),
    convRate: result.sessions > 0
      ? Math.round((result.conversions / result.sessions) * 10000) / 100
      : 0,
    engagementRate: Math.round(result.engagementRate * 10000) / 100,
  };
}

// ── Agent ─────────────────────────────────────────────────────────────────────

class CroAgent {
  static id = 'cro-agent';
  static name = 'CRO Agent';
  static role = 'Conversion Rate Optimization Agent';
  static crews = ['cro'];

  async execute(request = {}) {
    const {
      entityId,
      apiKey = process.env.COMPOSIO_API_KEY,
      propertyId,
      pageUrl,
      lookbackDays = 30,
    } = request;

    if (!entityId) return this._error('entityId is required.');
    if (!apiKey) return this._error('COMPOSIO_API_KEY is not set.');

    const { startDate, endDate } = getDateRange(lookbackDays);

    const GA4_METRICS = [
      'sessions', 'totalUsers', 'bounceRate', 'averageSessionDuration',
      'screenPageViews', 'conversions', 'engagementRate',
    ];

    const baseArgs = { property_id: propertyId, metrics: GA4_METRICS, start_date: startDate, end_date: endDate };

    // Fetch site-wide metrics + page-specific if URL provided
    const [siteResult, pageResult, funnelResult] = await Promise.all([
      executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', baseArgs, apiKey),
      pageUrl
        ? executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', {
            ...baseArgs,
            dimensions: ['pagePath'],
            dimension_filter: { filter: { fieldName: 'pagePath', stringFilter: { value: pageUrl, matchType: 'CONTAINS' } } },
          }, apiKey)
        : Promise.resolve({ successful: false }),
      executeComposioTool(entityId, 'googleanalytics', 'GOOGLEANALYTICS_RUN_REPORT', {
        property_id: propertyId,
        dimensions: ['pagePath'],
        metrics: ['sessions', 'bounceRate', 'conversions', 'averageSessionDuration'],
        start_date: startDate,
        end_date: endDate,
        order_bys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }, apiKey),
    ]);

    if (!siteResult.successful) return this._connectorError(siteResult.error);

    const siteMetrics = normaliseFunnelReport(siteResult.data);
    if (!siteMetrics) return this._error('GA4 returned no data for the selected period.');

    // Page-level metrics (if requested)
    const pageMetrics = pageResult.successful ? normaliseFunnelReport(pageResult.data) : null;
    const analysisMetrics = pageMetrics || siteMetrics;

    // Top pages with drop-off data
    const funnelRows = funnelResult.successful
      ? (funnelResult.data?.rows || funnelResult.data?.report?.rows || [])
      : [];

    const topPagesFunnel = funnelRows.map((row) => {
      const pagePath = row.dimensionValues?.[0]?.value || '/';
      const sessions = Math.round(parseFloat(row.metricValues?.[0]?.value || 0));
      const bounceRate = Math.round(parseFloat(row.metricValues?.[1]?.value || 0) * 100) / 100;
      const conversions = Math.round(parseFloat(row.metricValues?.[2]?.value || 0));
      const avgDuration = Math.round(parseFloat(row.metricValues?.[3]?.value || 0));
      return {
        page: pagePath,
        sessions,
        bounce_rate_pct: bounceRate,
        conversions,
        conv_rate_pct: sessions > 0 ? Math.round((conversions / sessions) * 10000) / 100 : 0,
        avg_duration_sec: avgDuration,
        priority: bounceRate > 70 && sessions > 100 ? 'high' : bounceRate > 50 ? 'medium' : 'low',
      };
    }).slice(0, 8);

    // Generate hypotheses
    const hypotheses = generateHypotheses(analysisMetrics);

    // Confidence based on data volume
    const confidence = analysisMetrics.sessions >= 1000 ? 0.88
      : analysisMetrics.sessions >= 200 ? 0.72
      : 0.55;

    const findings = [
      `Analysed ${analysisMetrics.sessions.toLocaleString()} sessions over ${lookbackDays} days${pageUrl ? ` on ${pageUrl}` : ' site-wide'}.`,
      `Overall conversion rate: ${analysisMetrics.convRate}% | Bounce rate: ${analysisMetrics.bounceRate}%`,
      `${hypotheses.length} A/B test hypotheses generated, ranked by ICE score.`,
      `Top priority test: "${hypotheses[0]?.element}" (ICE: ${hypotheses[0]?.ice_score}) — expected lift: ${hypotheses[0]?.expected_lift}.`,
      topPagesFunnel.filter((p) => p.priority === 'high').length > 0
        ? `${topPagesFunnel.filter((p) => p.priority === 'high').length} high-priority pages with bounce rate > 70% identified.`
        : 'No critical bounce-rate pages detected.',
    ];

    const insights = [
      `Start with "${hypotheses[0]?.element}": ${hypotheses[0]?.test}`,
      analysisMetrics.convRate < 1
        ? 'Conversion rate below 1% suggests a fundamental messaging or trust issue. Prioritise social proof and CTA clarity before other tests.'
        : 'Conversion rate is in acceptable range. Focus on incremental improvements via targeted A/B tests.',
      `Minimum sample size for first test: ${hypotheses[0]?.minimum_sample?.toLocaleString()} sessions. At current traffic, allow ${Math.ceil(hypotheses[0]?.minimum_sample / (analysisMetrics.sessions / lookbackDays))} days.`,
    ];

    const prose = `I analysed ${analysisMetrics.sessions.toLocaleString()} sessions${pageUrl ? ` on ${pageUrl}` : ''} and found a ${analysisMetrics.convRate}% conversion rate with ${analysisMetrics.bounceRate}% bounce rate. I've generated ${hypotheses.length} prioritised A/B test hypotheses. The highest-impact test to run first: ${hypotheses[0]?.test}`;

    return {
      prose,
      response_type: 'optimization',
      agent: CroAgent.id,
      crew: 'cro',
      confidence,
      connectors_used: ['ga4'],
      artifact: {
        type: 'optimization_plan',
        current_state: {
          sessions: analysisMetrics.sessions,
          conversion_rate_pct: analysisMetrics.convRate,
          bounce_rate_pct: analysisMetrics.bounceRate,
          avg_session_duration_sec: analysisMetrics.avgSessionDuration,
          engagement_rate_pct: analysisMetrics.engagementRate,
          period_days: lookbackDays,
          scope: pageUrl || 'site-wide',
        },
        recommendation: {
          line_items: hypotheses.map((h) => ({
            id: h.id,
            element: h.element,
            hypothesis: h.hypothesis,
            test: h.test,
            primary_metric: h.primary_metric,
            current_value: h.current_value,
            expected_lift: h.expected_lift,
            minimum_sample: h.minimum_sample,
            ice_score: h.ice_score,
            impact: h.impact,
            confidence: h.confidence,
            ease: h.ease,
          })),
          summary: {
            total_hypotheses: hypotheses.length,
            top_test: hypotheses[0]?.element,
            estimated_total_lift: '20-40% conversion improvement if top 3 tests win',
            confidence: confidence > 0.8 ? 'high' : confidence > 0.7 ? 'medium' : 'low',
          },
        },
        expected_impact: {
          current_conv_rate: analysisMetrics.convRate,
          projected_conv_rate: Math.round((analysisMetrics.convRate * 1.25) * 100) / 100,
          projected_lift_pct: 25,
          confidence: confidence > 0.8 ? 'high' : 'medium',
        },
        funnel_analysis: topPagesFunnel,
        findings,
        insights,
      },
      follow_ups: [
        `Set up the "${hypotheses[0]?.element}" A/B test`,
        'Show me the top 5 pages by bounce rate',
        'Generate copy variants for the primary CTA',
        'What trust signals are most effective for our industry?',
        'Create a 90-day CRO testing roadmap',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem with the CRO analysis: ${message}`,
      response_type: 'optimization',
      agent: CroAgent.id,
      crew: 'cro',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'optimization_plan', current_state: {}, recommendation: {}, expected_impact: {}, findings: [message], insights: [] },
      follow_ups: [],
    };
  }

  _connectorError(errorDetail) {
    return {
      prose: 'I need access to Google Analytics 4 to run a CRO analysis. Please connect GA4 in your Integrations settings.',
      response_type: 'optimization',
      agent: CroAgent.id,
      crew: 'cro',
      confidence: 0,
      connectors_used: [],
      connector_missing: 'ga4',
      connector_error: errorDetail,
      artifact: { type: 'optimization_plan', current_state: {}, recommendation: {}, expected_impact: {}, findings: [`GA4 not connected.`], insights: [] },
      follow_ups: ['Connect Google Analytics 4 integration'],
    };
  }
}

module.exports = CroAgent;
module.exports.default = CroAgent;
