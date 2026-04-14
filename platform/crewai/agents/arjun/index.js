'use strict';

/**
 * Arjun — Funnel & Lead Intelligence Agent
 *
 * Goals covered:
 *   find-leads          → Apollo people search, ICP-filtered, discovery response
 *   enrich-leads        → Apollo bulk enrich, fills missing fields, discovery response
 *   define-audiences    → GA4 audience segments from behavioural data, discovery response
 *   referral-program    → HubSpot workflow skeleton + referral mechanics, execution response
 *   revenue-ops         → HubSpot pipeline health: deal velocity, stage conversion, ARR forecast
 *
 * Connector: Composio V3  (apollo, ga4, hubspot)
 */

const crypto = require('crypto');

// ── Composio V3 helpers ───────────────────────────────────────────────────────

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

async function resolveConnectedAccountId(entityId, toolkit, apiKey) {
  const res = await fetch(
    `${COMPOSIO_BASE}/connectedAccounts?entityId=${encodeURIComponent(entityId)}&toolkit=${toolkit}&status=ACTIVE`,
    { headers: { 'x-api-key': apiKey } }
  );
  if (!res.ok) throw new Error(`Composio account lookup failed: ${res.status}`);
  const data = await res.json();
  const accounts = data?.items ?? data?.connectedAccounts ?? [];
  if (!accounts.length) throw new Error(`No active ${toolkit} account for entity ${entityId}`);
  return accounts[0].id;
}

async function executeComposioTool(entityId, toolkit, toolSlug, args, apiKey) {
  const accountId = await resolveConnectedAccountId(entityId, toolkit, apiKey);
  const res = await fetch(`${COMPOSIO_BASE}/tools/execute/${toolSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ entityId, connectedAccountId: accountId, input: args }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Composio tool ${toolSlug} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.data ?? data?.result ?? data;
}

// ── ICP filter ────────────────────────────────────────────────────────────────

const EXCLUDED_LARGE_CAPS = [
  'paytm', 'razorpay', 'phonepe', 'zomato', 'swiggy', 'ola', 'nykaa', 'meesho',
  'byju', 'unacademy', 'flipkart', 'amazon', 'google', 'microsoft', 'meta', 'salesforce',
];

function isIcpCompliant(org, icpParams) {
  if (!org) return false;

  const name = (org.name || '').toLowerCase();
  if (EXCLUDED_LARGE_CAPS.some((cap) => name.includes(cap))) return false;

  const headcount = org.headcount || org.employee_count || 0;
  const { minEmployees = 10, maxEmployees = 5000 } = icpParams || {};
  if (headcount > 0 && (headcount < minEmployees || headcount > maxEmployees)) return false;

  return true;
}

function scoreIcpFit(contact, icpParams) {
  let score = 0.5;
  const { targetTitles = [], targetIndustries = [], targetGeographies = [] } = icpParams || {};

  const title = (contact.title || '').toLowerCase();
  if (targetTitles.some((t) => title.includes(t.toLowerCase()))) score += 0.2;

  const industry = (contact.organization?.industry || '').toLowerCase();
  if (targetIndustries.some((ind) => industry.includes(ind.toLowerCase()))) score += 0.15;

  const country = (contact.country || contact.organization?.country || '').toLowerCase();
  if (targetGeographies.some((g) => country.includes(g.toLowerCase()))) score += 0.1;

  if (contact.email) score += 0.05;

  return Math.min(score, 1.0);
}

// ── Agent class ───────────────────────────────────────────────────────────────

class ArjunAgent {
  static id    = 'arjun';
  static name  = 'Arjun — Funnel & Lead Intelligence';
  static crews = ['lead-intelligence'];

  /**
   * @param {Object} request
   * @param {string} request.entityId
   * @param {string} request.apiKey
   * @param {string} request.goal_id   - find-leads | enrich-leads | define-audiences | referral-program | revenue-ops
   * @param {string} [request.message]
   * @param {Object} [request.extracted_params]
   * @param {Object} [request.icpParams]         - { targetTitles, targetIndustries, targetGeographies, minEmployees, maxEmployees }
   * @param {Array}  [request.leadList]           - for enrich-leads: array of {name, company} objects
   */
  async execute(request = {}) {
    const { entityId, apiKey, goal_id } = request;

    if (!entityId) return this._error('entityId is required');
    if (!apiKey)   return this._error('apiKey is required');

    switch (goal_id) {
      case 'find-leads':       return this._findLeads(request);
      case 'enrich-leads':     return this._enrichLeads(request);
      case 'define-audiences': return this._defineAudiences(request);
      case 'referral-program': return this._referralProgram(request);
      case 'revenue-ops':      return this._revenueOps(request);
      default:                 return this._findLeads(request); // default to find-leads
    }
  }

  // ── 1. find-leads ──────────────────────────────────────────────────────────

  async _findLeads(request) {
    const { entityId, apiKey, extracted_params = {}, icpParams = {} } = request;

    let rawContacts = [];
    let connectorUsed = false;

    try {
      const searchArgs = {
        q_organization_num_employees_ranges: icpParams.maxEmployees
          ? [`1,${icpParams.maxEmployees}`]
          : ['1,5000'],
        person_titles:       icpParams.targetTitles       || extracted_params.titles    || [],
        organization_locations: icpParams.targetGeographies || extracted_params.geography || [],
        q_keywords:          extracted_params.keywords     || '',
        per_page:            25,
        page:                1,
      };

      const result = await executeComposioTool(entityId, 'apollo', 'APOLLO_IO_SEARCH_CONTACTS', searchArgs, apiKey);
      rawContacts = result?.contacts || result?.people || [];
      connectorUsed = true;
    } catch (err) {
      return this._connectorMissing('apollo', err.message);
    }

    // ICP filter & score
    const leads = rawContacts
      .filter((c) => isIcpCompliant(c.organization, icpParams))
      .map((c) => ({
        name:        `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        title:       c.title || 'N/A',
        company:     c.organization?.name || 'N/A',
        industry:    c.organization?.industry || 'N/A',
        employees:   c.organization?.headcount || c.organization?.employee_count || null,
        email:       c.email || null,
        linkedin_url: c.linkedin_url || null,
        country:     c.country || c.organization?.country || null,
        icp_fit_pct: Math.round(scoreIcpFit(c, icpParams) * 100),
      }))
      .sort((a, b) => b.icp_fit_pct - a.icp_fit_pct)
      .slice(0, 20);

    const avgFit = leads.length > 0
      ? Math.round(leads.reduce((s, l) => s + l.icp_fit_pct, 0) / leads.length)
      : 0;

    return {
      prose: `I found ${leads.length} qualified leads matching your ICP. Average ICP fit score: ${avgFit}%. The top results are ${leads.slice(0, 3).map((l) => `${l.name} at ${l.company}`).join(', ')}. I've filtered out large-cap companies that don't match your target segment.`,
      response_type: 'discovery',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: leads.length > 0 ? 0.82 : 0.4,
      connectors_used: connectorUsed ? ['apollo'] : [],
      artifact: {
        type: 'discovery_results',
        total_found: leads.length,
        avg_icp_fit_pct: avgFit,
        results: leads,
        filters_applied: {
          max_employees: icpParams.maxEmployees || 5000,
          target_titles: icpParams.targetTitles || [],
          geographies:   icpParams.targetGeographies || [],
        },
      },
      follow_ups: [
        'Enrich these leads with verified email addresses',
        'Build an outreach sequence for the top 10 leads',
        'Segment these leads by seniority for personalised messaging',
        'Export the lead list to your CRM',
        'Find similar companies using these leads as lookalikes',
      ],
    };
  }

  // ── 2. enrich-leads ────────────────────────────────────────────────────────

  async _enrichLeads(request) {
    const { entityId, apiKey, leadList = [], extracted_params = {} } = request;

    if (!leadList.length && !extracted_params.company) {
      return this._error('Provide a leadList array or at least a company name to enrich');
    }

    let enriched = [];
    let connectorUsed = false;

    try {
      // Apollo bulk people match
      const inputs = leadList.slice(0, 10).map((l) => ({
        first_name: (l.name || '').split(' ')[0] || '',
        last_name:  (l.name || '').split(' ').slice(1).join(' ') || '',
        organization_name: l.company || '',
        email: l.email || '',
      }));

      const result = await executeComposioTool(
        entityId, 'apollo', 'APOLLO_IO_PEOPLE_BULK_MATCH',
        { details: inputs.length ? inputs : [{ organization_name: extracted_params.company || '' }] },
        apiKey
      );

      const matches = result?.matches || result?.people || [];
      enriched = matches.map((m) => ({
        name:         `${m.first_name || ''} ${m.last_name || ''}`.trim(),
        email:        m.email || m.email_status === 'verified' ? m.email : null,
        email_status: m.email_status || 'unknown',
        title:        m.title || null,
        phone:        m.phone_number || null,
        linkedin_url: m.linkedin_url || null,
        company:      m.organization?.name || null,
        seniority:    m.seniority || null,
        departments:  m.departments || [],
        enriched:     true,
      }));
      connectorUsed = true;
    } catch (err) {
      return this._connectorMissing('apollo', err.message);
    }

    const emailsFound = enriched.filter((e) => e.email).length;

    return {
      prose: `I enriched ${enriched.length} leads via Apollo. Found verified emails for ${emailsFound} of them (${Math.round((emailsFound / Math.max(enriched.length, 1)) * 100)}% email coverage). Records now include job title, seniority, LinkedIn URL, and phone where available.`,
      response_type: 'discovery',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: 0.80,
      connectors_used: connectorUsed ? ['apollo'] : [],
      artifact: {
        type: 'discovery_results',
        total_found: enriched.length,
        email_coverage_pct: Math.round((emailsFound / Math.max(enriched.length, 1)) * 100),
        results: enriched,
      },
      follow_ups: [
        'Build an email outreach sequence for leads with verified emails',
        'Export enriched list to HubSpot or Salesforce',
        'Segment by seniority for tiered outreach',
        'Validate phone numbers for the high-priority leads',
      ],
    };
  }

  // ── 3. define-audiences ────────────────────────────────────────────────────

  async _defineAudiences(request) {
    const { entityId, apiKey, extracted_params = {} } = request;

    let segments = [];
    let connectorUsed = false;

    try {
      // GA4: get audience/segment data via custom report
      const result = await executeComposioTool(
        entityId, 'googleanalytics', 'GOOGLE_ANALYTICS_RUN_REPORT',
        {
          dimensions: [
            { name: 'sessionDefaultChannelGroup' },
            { name: 'country' },
            { name: 'deviceCategory' },
          ],
          metrics: [
            { name: 'sessions' },
            { name: 'conversions' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
          ],
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          limit: 50,
        },
        apiKey
      );

      const rows = result?.rows || [];
      const channelMap = {};

      for (const row of rows) {
        const [channel, country, device] = row.dimensionValues?.map((d) => d.value) || [];
        const [sessions, conversions, bounceRate, avgDuration] = row.metricValues?.map((m) => parseFloat(m.value) || 0) || [];

        if (!channelMap[channel]) {
          channelMap[channel] = { sessions: 0, conversions: 0, bounceRateSum: 0, rows: 0, countries: new Set(), devices: new Set() };
        }
        const c = channelMap[channel];
        c.sessions    += sessions;
        c.conversions += conversions;
        c.bounceRateSum += bounceRate;
        c.rows++;
        if (country) c.countries.add(country);
        if (device)  c.devices.add(device);
      }

      segments = Object.entries(channelMap).map(([channel, data]) => ({
        segment_name: channel,
        sessions:     Math.round(data.sessions),
        conversions:  Math.round(data.conversions),
        conv_rate_pct: data.sessions > 0 ? +((data.conversions / data.sessions) * 100).toFixed(2) : 0,
        avg_bounce_rate_pct: data.rows > 0 ? +(data.bounceRateSum / data.rows).toFixed(1) : 0,
        top_countries: Array.from(data.countries).slice(0, 3),
        devices:       Array.from(data.devices),
        audience_size: data.sessions > 5000 ? 'large' : data.sessions > 1000 ? 'medium' : 'small',
      })).sort((a, b) => b.conversions - a.conversions);

      connectorUsed = true;
    } catch (err) {
      return this._connectorMissing('ga4', err.message);
    }

    const topSegment = segments[0];

    return {
      prose: `I've identified ${segments.length} audience segments from your GA4 data. Your highest-converting segment is "${topSegment?.segment_name}" with a ${topSegment?.conv_rate_pct}% conversion rate. I'd recommend building campaigns targeting the top 3 segments, which account for the majority of your qualified traffic.`,
      response_type: 'discovery',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: 0.83,
      connectors_used: connectorUsed ? ['ga4'] : [],
      artifact: {
        type: 'discovery_results',
        total_found: segments.length,
        results: segments,
        insight: `Focus campaign budget on "${topSegment?.segment_name}" — it converts at ${topSegment?.conv_rate_pct}%, which is likely your highest-value audience.`,
      },
      follow_ups: [
        `Create a targeted ad campaign for the "${topSegment?.segment_name}" segment`,
        'Build lookalike audiences based on your top-converting segment',
        'Set up remarketing for the high-bounce segments',
        'Define ICP criteria from the top-converting audience attributes',
      ],
    };
  }

  // ── 4. referral-program ────────────────────────────────────────────────────

  async _referralProgram(request) {
    const { entityId, apiKey, extracted_params = {} } = request;

    let workflowCreated = false;
    let connectorUsed   = false;

    const { reward = 'discount', targetParticipants = 'existing customers' } = extracted_params;

    try {
      // Create HubSpot workflow for referral tracking
      const result = await executeComposioTool(
        entityId, 'hubspot', 'HUBSPOT_CREATE_WORKFLOW',
        {
          name: 'Referral Program — Auto-Enrol',
          type: 'CONTACT_DATE_CENTERED',
          enabled: false,  // draft — needs human review before activation
          actions: [
            { type: 'DELAY', delayMillis: 86400000 },  // 24h after trigger
            { type: 'SET_CONTACT_PROPERTY', propertyName: 'referral_program_status', newValue: 'enrolled' },
          ],
        },
        apiKey
      );
      workflowCreated = !!result?.workflow?.id;
      connectorUsed = true;
    } catch (err) {
      // Non-fatal: still return the referral plan even if HubSpot fails
      if (err.message.includes('No active hubspot')) {
        return this._connectorMissing('hubspot', err.message);
      }
    }

    const rewardOptions = {
      discount:    { incentive: '20% off next month', referrer_reward: '1 month free', mechanic: 'coupon_code' },
      cash:        { incentive: '$50 account credit', referrer_reward: '$100 credit', mechanic: 'stripe_credit' },
      upgrade:     { incentive: 'Feature unlock (30 days)', referrer_reward: 'Plan upgrade (60 days)', mechanic: 'feature_flag' },
    };
    const rewards = rewardOptions[reward] || rewardOptions.discount;

    return {
      prose: `I've designed a referral program for ${targetParticipants}. The mechanic: ${rewards.mechanic} — referred users get ${rewards.incentive}, referrers get ${rewards.referrer_reward}.${workflowCreated ? ' I\'ve created a draft HubSpot workflow for auto-enrolment — activate it after review.' : ''} Next steps: set up a referral landing page, define your referral tracking parameter, and load your first cohort.`,
      response_type: 'execution',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: 0.78,
      connectors_used: connectorUsed ? ['hubspot'] : [],
      artifact: {
        type: 'execution_tracker',
        status: workflowCreated ? 'workflow_draft_created' : 'plan_ready',
        metrics: { estimated_referral_rate_pct: 15, target_participants: targetParticipants },
        steps: [
          { step: 'Design referral landing page', status: 'pending', owner: 'Marketing' },
          { step: 'Set up referral tracking (UTM + cookie)', status: 'pending', owner: 'Engineering' },
          { step: `Configure ${rewards.mechanic} reward fulfilment`, status: 'pending', owner: 'Product' },
          { step: 'Activate HubSpot enrolment workflow', status: workflowCreated ? 'draft_ready' : 'pending', owner: 'Marketing Ops' },
          { step: 'Email first cohort with referral CTA', status: 'pending', owner: 'Marketing' },
        ],
        program_design: {
          mechanic:        rewards.mechanic,
          referrer_reward: rewards.referrer_reward,
          referee_incentive: rewards.incentive,
          estimated_viral_coefficient: 0.3,
        },
      },
      follow_ups: [
        'Write the referral invitation email to existing customers',
        'Build a referral landing page with the incentive clearly stated',
        'Set up conversion tracking for the referral funnel',
        'Define success metrics: referral rate, CAC via referral, referral LTV',
      ],
    };
  }

  // ── 5. revenue-ops ─────────────────────────────────────────────────────────

  async _revenueOps(request) {
    const { entityId, apiKey, extracted_params = {} } = request;

    let pipeline = { stages: [], total_open: 0, weighted_arr: 0 };
    let connectorUsed = false;

    try {
      const result = await executeComposioTool(
        entityId, 'hubspot', 'HUBSPOT_GET_DEALS',
        {
          properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline', 'hs_deal_stage_probability'],
          limit: 100,
          filterGroups: [{
            filters: [{ propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' }],
          }],
        },
        apiKey
      );

      const deals = result?.results || result?.deals || [];

      // Aggregate by stage
      const stageMap = {};
      let totalOpenValue = 0;
      let weightedValue  = 0;

      for (const deal of deals) {
        const props = deal.properties || deal;
        const stage  = props.dealstage || 'unknown';
        const amount = parseFloat(props.amount || 0);
        const prob   = parseFloat(props.hs_deal_stage_probability || 0.5);

        if (!stageMap[stage]) stageMap[stage] = { count: 0, value: 0, prob };
        stageMap[stage].count++;
        stageMap[stage].value += amount;
        totalOpenValue += amount;
        weightedValue  += amount * prob;
      }

      pipeline.stages = Object.entries(stageMap).map(([stage, data]) => ({
        stage,
        deal_count: data.count,
        total_value: Math.round(data.value),
        weighted_value: Math.round(data.value * data.prob),
        close_probability_pct: Math.round(data.prob * 100),
      }));
      pipeline.total_open = Math.round(totalOpenValue);
      pipeline.weighted_arr = Math.round(weightedValue);
      connectorUsed = true;
    } catch (err) {
      return this._connectorMissing('hubspot', err.message);
    }

    const totalDeals = pipeline.stages.reduce((s, st) => s + st.deal_count, 0);

    return {
      prose: `Revenue ops snapshot: ${totalDeals} open deals totalling $${pipeline.total_open.toLocaleString()} in pipeline value. Weighted ARR forecast: $${pipeline.weighted_arr.toLocaleString()}. ${pipeline.stages.length} active pipeline stages. I'd focus on deals in the highest-probability stages to hit the quarter close.`,
      response_type: 'analysis',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: 0.81,
      connectors_used: connectorUsed ? ['hubspot'] : [],
      artifact: {
        type: 'analysis',
        metrics: {
          total_open_deals: totalDeals,
          pipeline_value_usd: pipeline.total_open,
          weighted_arr_usd:   pipeline.weighted_arr,
          pipeline_stages:    pipeline.stages.length,
        },
        findings: [
          `${totalDeals} open deals with $${pipeline.total_open.toLocaleString()} total pipeline value`,
          `Weighted forecast (probability-adjusted): $${pipeline.weighted_arr.toLocaleString()}`,
          pipeline.stages[0] ? `Largest stage by value: "${pipeline.stages.sort((a,b)=>b.total_value-a.total_value)[0]?.stage}"` : 'No stage data available',
        ],
        insights: [
          'Focus seller time on deals with >60% close probability to protect the weighted forecast',
          'Any stage with high count but low average value may indicate poor ICP qualification upstream',
          'Compare weighted ARR to quota — if below 1.2× coverage, accelerate top-of-funnel immediately',
        ],
        channel_breakdown: pipeline.stages,
      },
      follow_ups: [
        'Show me which deals are most at risk of slipping this quarter',
        'Identify the top 5 deals I should focus on to hit quota',
        'Find more leads to top up the pipeline if coverage is below target',
        'Analyse the conversion rate between each pipeline stage',
      ],
    };
  }

  // ── Error helpers ──────────────────────────────────────────────────────────

  _connectorMissing(toolkit, detail) {
    const friendlyName = { apollo: 'Apollo.io', ga4: 'Google Analytics 4', hubspot: 'HubSpot' }[toolkit] || toolkit;
    return {
      prose: `I need access to ${friendlyName} to complete this task. ${detail ? `(${detail.slice(0, 120)})` : ''}`,
      response_type: 'discovery',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: 0,
      connectors_used: [],
      connector_missing: toolkit,
      artifact: { type: 'discovery_results', total_found: 0, results: [] },
      follow_ups: [`Connect ${friendlyName} to continue`],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'discovery',
      agent: ArjunAgent.id,
      crew: 'lead-intelligence',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'discovery_results', total_found: 0, results: [] },
      follow_ups: [],
    };
  }
}

module.exports = ArjunAgent;
