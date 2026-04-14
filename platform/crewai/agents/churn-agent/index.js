'use strict';

/**
 * Churn Agent — HubSpot-powered churn risk identification
 *
 * Connects to HubSpot via Composio to:
 * 1. Fetch contacts with no activity for 30+ days
 * 2. Score each contact's churn risk (days inactive, deal count, engagement)
 * 3. Return a ranked at-risk list with recommended retention actions
 *
 * Response type: "analysis"
 */

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';
const TOOLKIT_SLUG = 'hubspot';

// ── Composio helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the connected_account_id for a given entityId + toolkit.
 */
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

/**
 * Execute a single Composio tool action.
 */
async function executeComposioTool(entityId, toolSlug, args, apiKey) {
  let connectedAccountId;
  try {
    connectedAccountId = await resolveConnectedAccountId(entityId, TOOLKIT_SLUG, apiKey);
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

// ── Churn scoring ─────────────────────────────────────────────────────────────

const RISK_THRESHOLDS = {
  critical: 80,  // Take action this week
  high: 60,      // Personalise outreach
  medium: 40,    // Monitor closely
};

/**
 * Compute a 0-100 churn risk score from HubSpot contact properties.
 *
 * Inputs (all optional — degrades gracefully):
 *   daysInactive  Number of days since last engagement activity
 *   dealCount     Total associated deals
 *   pageViews     Recent page/session count from HS tracking
 *   lifecycleStage  HubSpot lifecycle stage string
 */
function scoreChurnRisk({ daysInactive = 0, dealCount = 0, pageViews = 0, lifecycleStage = '' }) {
  let score = 0;

  // Days inactive (max 50 pts)
  if (daysInactive >= 90) score += 50;
  else if (daysInactive >= 60) score += 40;
  else if (daysInactive >= 30) score += 25;
  else score += 0;

  // Deal depth (max 20 pts) — fewer deals = higher risk
  if (dealCount === 0) score += 20;
  else if (dealCount === 1) score += 10;
  else score += 0;

  // Page views (max 20 pts) — low views = higher risk
  if (pageViews === 0) score += 20;
  else if (pageViews <= 5) score += 10;
  else score += 0;

  // Lifecycle stage (max 10 pts) — lead/subscriber more at-risk than customer
  const stage = String(lifecycleStage).toLowerCase();
  if (stage === 'lead' || stage === 'subscriber') score += 10;
  else if (stage === 'marketingqualifiedlead' || stage === 'salesqualifiedlead') score += 5;
  else score += 0;

  return Math.min(score, 100);
}

function riskLabel(score) {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function retentionAction(score, daysInactive, lifecycleStage) {
  if (score >= RISK_THRESHOLDS.critical) {
    return 'Immediate personal outreach — schedule a call or send a handwritten note from the account owner.';
  }
  if (score >= RISK_THRESHOLDS.high) {
    return `Send a personalised re-engagement email referencing their last interaction (~${daysInactive} days ago). Offer a quick win or exclusive insight.`;
  }
  if (score >= RISK_THRESHOLDS.medium) {
    return 'Add to nurture sequence focused on product value and new features. Monitor for another 14 days.';
  }
  return 'No immediate action required. Continue standard lifecycle engagement.';
}

// ── Contact normalisation ─────────────────────────────────────────────────────

/**
 * Parse raw HubSpot contact object into a flat, typed record.
 */
function normaliseContact(raw) {
  const p = raw.properties || raw;

  const lastActivityRaw = p.notes_last_activity_date || p.last_activity_date || p.hs_last_activity_date || null;
  const daysInactive = lastActivityRaw
    ? Math.floor((Date.now() - new Date(lastActivityRaw).getTime()) / 86_400_000)
    : 999; // Never active — treat as max inactive

  return {
    id: raw.id || p.hs_object_id || null,
    name: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || 'Unknown',
    email: p.email || null,
    company: p.company || null,
    lifecycleStage: p.lifecyclestage || p.hs_lifecyclestage || '',
    dealCount: parseInt(p.num_associated_deals || p.associated_deals_count || '0', 10) || 0,
    pageViews: parseInt(p.hs_analytics_num_page_views || '0', 10) || 0,
    lastActivityDate: lastActivityRaw,
    daysInactive,
  };
}

// ── Agent class ───────────────────────────────────────────────────────────────

class ChurnAgent {
  static id = 'churn-agent';
  static name = 'Churn Agent';
  static role = 'Churn Prevention Agent';
  static crews = ['churn-prevention'];

  /**
   * Execute churn analysis.
   *
   * @param {Object} request
   * @param {string} request.entityId    - Workspace / user ID for Composio
   * @param {string} [request.apiKey]    - Composio API key (falls back to env)
   * @param {number} [request.inactiveDays=30] - Minimum days inactive to flag
   * @param {number} [request.limit=50]  - Max contacts to analyse
   * @returns {Promise<Object>} Analysis response
   */
  async execute(request = {}) {
    const {
      entityId,
      apiKey = process.env.COMPOSIO_API_KEY,
      inactiveDays = 30,
      limit = 50,
    } = request;

    if (!entityId) {
      return this._error('entityId is required to run churn analysis.');
    }
    if (!apiKey) {
      return this._error('COMPOSIO_API_KEY is not set. Please configure the Composio API key.');
    }

    // ── 1. Fetch contacts from HubSpot ────────────────────────────────────────
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
    const cutoffIso = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const contactsResult = await executeComposioTool(
      entityId,
      'HUBSPOT_LIST_CONTACTS',
      {
        count: limit,
        properties: [
          'firstname',
          'lastname',
          'email',
          'company',
          'lifecyclestage',
          'notes_last_activity_date',
          'last_activity_date',
          'hs_last_activity_date',
          'num_associated_deals',
          'hs_analytics_num_page_views',
        ].join(','),
        // Filter: last activity before cutoff (HubSpot filter format)
        filterGroups: JSON.stringify([
          {
            filters: [
              {
                propertyName: 'notes_last_activity_date',
                operator: 'LT',
                value: cutoffIso,
              },
            ],
          },
        ]),
      },
      apiKey
    );

    if (!contactsResult.successful) {
      // Try a fallback without the filter — some HubSpot scopes don't support filter on list endpoint
      const fallbackResult = await executeComposioTool(
        entityId,
        'HUBSPOT_LIST_CONTACTS',
        {
          count: limit,
          properties: 'firstname,lastname,email,company,lifecyclestage,notes_last_activity_date,last_activity_date,hs_last_activity_date,num_associated_deals,hs_analytics_num_page_views',
        },
        apiKey
      );

      if (!fallbackResult.successful) {
        return this._connectorError(
          contactsResult.error || 'HubSpot contact fetch failed',
          'hubspot'
        );
      }
      contactsResult.successful = true;
      contactsResult.data = fallbackResult.data;
    }

    // ── 2. Parse contacts ─────────────────────────────────────────────────────
    const rawContacts = Array.isArray(contactsResult.data)
      ? contactsResult.data
      : contactsResult.data?.contacts ||
        contactsResult.data?.results ||
        contactsResult.data?.items ||
        [];

    const contacts = rawContacts.map(normaliseContact);

    // ── 3. Filter to genuinely inactive contacts ──────────────────────────────
    const inactive = contacts.filter((c) => c.daysInactive >= inactiveDays);

    // ── 4. Score and rank ─────────────────────────────────────────────────────
    const scored = inactive
      .map((c) => {
        const score = scoreChurnRisk({
          daysInactive: c.daysInactive,
          dealCount: c.dealCount,
          pageViews: c.pageViews,
          lifecycleStage: c.lifecycleStage,
        });
        return {
          ...c,
          churnScore: score,
          riskLevel: riskLabel(score),
          recommendedAction: retentionAction(score, c.daysInactive, c.lifecycleStage),
        };
      })
      .sort((a, b) => b.churnScore - a.churnScore);

    // ── 5. Build metrics + findings ───────────────────────────────────────────
    const critical = scored.filter((c) => c.riskLevel === 'critical').length;
    const high = scored.filter((c) => c.riskLevel === 'high').length;
    const medium = scored.filter((c) => c.riskLevel === 'medium').length;
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, c) => sum + c.churnScore, 0) / scored.length)
      : 0;

    const findings = [
      `${scored.length} contacts inactive for ${inactiveDays}+ days out of ${contacts.length} fetched.`,
      `${critical} at critical risk (score ≥ ${RISK_THRESHOLDS.critical}) — immediate action required.`,
      `${high} at high risk — targeted re-engagement recommended this week.`,
      `${medium} at medium risk — add to nurture sequences.`,
    ];

    if (scored.length > 0) {
      findings.push(
        `Top at-risk contact: ${scored[0].name}${scored[0].company ? ` (${scored[0].company})` : ''} — ${scored[0].daysInactive} days inactive, score ${scored[0].churnScore}/100.`
      );
    }

    const insights = [
      critical > 0
        ? `Priority: Personally reach out to the ${critical} critical-risk contact${critical > 1 ? 's' : ''} this week.`
        : 'No critical-risk contacts. Maintain regular check-in cadence.',
      high + medium > 0
        ? `Set up a re-engagement sequence for the ${high + medium} high/medium-risk contacts using Sam's email automation.`
        : 'Engagement health looks stable across monitored contacts.',
      'Consider adding lifecycle triggers in HubSpot to auto-flag inactivity > 30 days going forward.',
    ];

    // ── 6. Build prose ────────────────────────────────────────────────────────
    const prose = scored.length === 0
      ? `Good news — no contacts have been inactive for more than ${inactiveDays} days in HubSpot. Engagement looks healthy across the contacts I reviewed.`
      : `I analysed ${contacts.length} HubSpot contacts and found ${scored.length} showing churn risk signals. ` +
        `${critical} are at critical risk, ${high} at high risk, and ${medium} at medium risk. ` +
        `Average churn score is ${avgScore}/100. ` +
        (scored[0]
          ? `Your most at-risk contact is ${scored[0].name}${scored[0].company ? ` at ${scored[0].company}` : ''}, ` +
            `inactive for ${scored[0].daysInactive} days (score: ${scored[0].churnScore}/100). `
          : '') +
        `I recommend prioritising personal outreach to critical-risk accounts immediately.`;

    return {
      prose,
      response_type: 'analysis',
      agent: ChurnAgent.id,
      crew: 'churn-prevention',
      confidence: scored.length > 0 ? 0.82 : 0.95,
      connectors_used: ['hubspot'],
      artifact: {
        type: 'analysis',
        metrics: {
          total_contacts_analysed: contacts.length,
          at_risk_contacts: scored.length,
          critical_risk: critical,
          high_risk: high,
          medium_risk: medium,
          avg_churn_score: avgScore,
          inactivity_threshold_days: inactiveDays,
          analysis_date: new Date().toISOString().split('T')[0],
        },
        findings,
        insights,
        // Extended: full ranked list for UI table rendering
        at_risk_customers: scored.slice(0, 20).map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          company: c.company,
          days_inactive: c.daysInactive,
          deal_count: c.dealCount,
          churn_score: c.churnScore,
          risk_level: c.riskLevel,
          recommended_action: c.recommendedAction,
        })),
      },
      follow_ups: [
        `Draft a re-engagement email for the ${critical + high} high/critical risk contacts`,
        'Set up HubSpot lifecycle triggers to auto-flag inactive contacts',
        'Create a retention campaign for medium-risk contacts',
        'Schedule a weekly churn review to track score movement',
      ],
    };
  }

  /** Internal: return a structured error response */
  _error(message) {
    return {
      prose: `I ran into a problem running the churn analysis: ${message}`,
      response_type: 'analysis',
      agent: ChurnAgent.id,
      crew: 'churn-prevention',
      confidence: 0,
      connectors_used: [],
      artifact: {
        type: 'analysis',
        metrics: {},
        findings: [`Error: ${message}`],
        insights: [],
        at_risk_customers: [],
      },
      follow_ups: [],
    };
  }

  /** Internal: return a connector-missing response */
  _connectorError(errorDetail, toolkit) {
    return {
      prose: `I need access to ${toolkit} to run churn analysis, but the connection isn't active. Please connect ${toolkit} in your integrations settings and try again.`,
      response_type: 'analysis',
      agent: ChurnAgent.id,
      crew: 'churn-prevention',
      confidence: 0,
      connectors_used: [],
      connector_missing: toolkit,
      connector_error: errorDetail,
      artifact: {
        type: 'analysis',
        metrics: {},
        findings: [`${toolkit} connector not active. Error: ${errorDetail}`],
        insights: ['Connect HubSpot via the Integrations page to enable churn analysis.'],
        at_risk_customers: [],
      },
      follow_ups: [`Connect ${toolkit} integration`, 'Re-run churn analysis after connecting'],
    };
  }
}

module.exports = ChurnAgent;
module.exports.default = ChurnAgent;
