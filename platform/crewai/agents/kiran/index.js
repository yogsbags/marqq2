'use strict';

/**
 * Kiran — Lifecycle & Engagement Agent
 *
 * Goals covered:
 *   lifecycle-engagement → retention lifecycle map, re-engagement flows,
 *                          community touchpoints, churn-prevention triggers (requires hubspot)
 */

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

class KiranAgent {
  static id    = 'kiran';
  static name  = 'Kiran — Lifecycle & Engagement';
  static crews = ['lifecycle-retention'];

  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');
    return this._lifecycleEngagement(request);
  }

  async _lifecycleEngagement(request) {
    const {
      entityId, apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      extracted_params = {},
    } = request;

    // Fetch active contacts from HubSpot for segmentation context
    let contactStats = null;
    let connectorUsed = false;

    if (apiKey) {
      try {
        const result = await executeComposioTool(
          entityId, 'hubspot', 'HUBSPOT_GET_CONTACTS',
          {
            properties: ['email', 'lifecyclestage', 'hs_email_last_email_date', 'hs_last_sales_activity_date', 'createdate'],
            limit: 100,
          },
          apiKey
        );

        const contacts = result?.results || result?.contacts || [];
        const stages = {};
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 86400000;
        const ninetyDaysAgo = now - 90 * 86400000;

        for (const c of contacts) {
          const props = c.properties || c;
          const stage = props.lifecyclestage || 'unknown';
          if (!stages[stage]) stages[stage] = { count: 0, active: 0, dormant: 0 };
          stages[stage].count++;

          const lastActivity = new Date(props.hs_email_last_email_date || props.hs_last_sales_activity_date || 0).getTime();
          if (lastActivity > thirtyDaysAgo) stages[stage].active++;
          else if (lastActivity < ninetyDaysAgo) stages[stage].dormant++;
        }

        contactStats = {
          total: contacts.length,
          by_stage: Object.entries(stages).map(([stage, data]) => ({ stage, ...data })),
          dormant_count: Object.values(stages).reduce((s, v) => s + v.dormant, 0),
        };
        connectorUsed = true;
      } catch (err) {
        if (err.message.includes('No active hubspot')) {
          return this._connectorMissing('hubspot', err.message, product, audience);
        }
        // Non-fatal — continue with plan-only response
      }
    }

    const lifecycleMap    = this._buildLifecycleMap(product, audience);
    const reEngagement    = this._buildReEngagementFlow(product, audience, contactStats);
    const touchpointPlan  = this._buildTouchpointPlan(product, audience);
    const churnTriggers   = this._buildChurnTriggers(product);

    const dormantCount = contactStats?.dormant_count ?? 0;

    return {
      prose: `Lifecycle engagement plan for ${product} covering ${lifecycleMap.stages.length} customer stages.${contactStats ? ` From HubSpot: ${contactStats.total} contacts analysed, ${dormantCount} dormant (>90 days inactive) — immediate re-engagement opportunity.` : ''} I've designed 4 re-engagement flows, a 6-touchpoint engagement rhythm, and ${churnTriggers.length} automated churn-prevention triggers.`,
      response_type: 'execution',
      agent: KiranAgent.id,
      crew: 'lifecycle-retention',
      confidence: 0.82,
      connectors_used: connectorUsed ? ['hubspot'] : [],
      artifact: {
        type: 'execution_tracker',
        status: connectorUsed ? 'data_loaded' : 'plan_ready',
        metrics: {
          lifecycle_stages:     lifecycleMap.stages.length,
          re_engagement_flows:  reEngagement.flows.length,
          touchpoints_per_month: touchpointPlan.touchpoints_per_month,
          churn_triggers:       churnTriggers.length,
          dormant_contacts:     dormantCount,
          ...(contactStats ? { total_contacts: contactStats.total } : {}),
        },
        steps: [
          { step: 'Map contacts to lifecycle stages in HubSpot', status: connectorUsed ? 'complete' : 'pending', owner: 'Marketing Ops' },
          { step: 'Activate churn-prevention triggers', status: 'pending', owner: 'Marketing Ops' },
          { step: 'Launch re-engagement campaign for dormant contacts', status: 'pending', owner: 'Marketing' },
          { step: 'Set up NPS survey at 30-day mark', status: 'pending', owner: 'Customer Success' },
          { step: 'Build community touchpoint rhythm', status: 'pending', owner: 'Marketing' },
          { step: 'Review lifecycle health metrics monthly', status: 'pending', owner: 'Marketing Ops' },
        ],
        current_state: contactStats || { note: 'Connect HubSpot to load live contact data' },
        lifecycle_map:    lifecycleMap,
        re_engagement:    reEngagement,
        touchpoint_plan:  touchpointPlan,
        churn_triggers:   churnTriggers,
      },
      follow_ups: [
        dormantCount > 0 ? `Re-engage ${dormantCount} dormant contacts with the win-back campaign` : 'Build a re-engagement campaign for contacts > 90 days inactive',
        'Set up NPS surveys at day 30, 90, and 180 touchpoints',
        'Create a customer community or Slack group for peer-to-peer engagement',
        'Build the automated churn-prevention email triggers in HubSpot',
        'Design a customer referral loop from the retention stage',
      ],
    };
  }

  _buildLifecycleMap(product, audience) {
    return {
      stages: [
        {
          stage:    'New (days 0-14)',
          goal:     'Drive first activation — connect data source, see first insight',
          health_metric: 'Activation rate (target: 60%+)',
          engagement: ['Day 1 welcome + setup guide', 'Day 3 quick win email', 'Day 7 check-in + milestone'],
          risk:     'Churns if no activation in first 7 days',
        },
        {
          stage:    'Active (days 15-90)',
          goal:     'Build habit — weekly dashboard check, expand to 2nd use case',
          health_metric: 'Weekly active usage (target: 3+ sessions/week)',
          engagement: ['Week 3 power tip', 'Month 1 usage review', 'Month 2 team invite nudge'],
          risk:     'At risk if usage drops below 1 session/week',
        },
        {
          stage:    'Engaged (90-365 days)',
          goal:     'Deepen integration — connect all data sources, expand team',
          health_metric: 'Product depth score (target: 3+ integrations, 3+ users)',
          engagement: ['Quarterly business review email', 'Case study feature offer', 'Referral programme invite'],
          risk:     'Contract renewal risk if usage is single-user or single-integration',
        },
        {
          stage:    'Advocate (365+ days)',
          goal:     'Activate referrals, generate social proof',
          health_metric: 'NPS score (target: 50+), referrals generated',
          engagement: ['NPS survey + follow-up', 'Case study/testimonial request', 'Beta feature early access'],
          risk:     'Low — needs maintenance, not intervention',
        },
        {
          stage:    'At Risk (usage declining)',
          goal:     'Prevent churn — identify root cause, intervene within 48h',
          health_metric: 'Days since last login (trigger: >14 days)',
          engagement: ['Automated risk alert to CSM', 'Personal outreach from account manager', 'Emergency success call offer'],
          risk:     'High — requires immediate human intervention',
        },
      ],
    };
  }

  _buildReEngagementFlow(product, audience, contactStats) {
    const dormantNote = contactStats?.dormant_count > 0
      ? `Priority audience: ${contactStats.dormant_count} dormant HubSpot contacts`
      : 'Target: contacts with no email open in 90+ days';

    return {
      flows: [
        {
          flow:       'Win-back campaign (90+ days inactive)',
          trigger:    'No login or email engagement in 90 days',
          audience:   dormantNote,
          emails:     [
            { day: 0,  subject: `We noticed you have been away — what happened?`, type: 'personal_check_in' },
            { day: 5,  subject: `What changed at ${product} while you were away`, type: 'product_update' },
            { day: 10, subject: `One thing we built for ${audience} in the last 90 days`, type: 'value_proof' },
            { day: 15, subject: `We are closing this loop — should we keep your account?`, type: 'break_up' },
          ],
          expected_reactivation_rate: '8-15%',
        },
        {
          flow:       'Expansion trigger (power user detected)',
          trigger:    'User hits usage limit or creates 10+ automations in 30 days',
          emails:     [
            { day: 0,  subject: `You are getting serious about ${product} — here is what is next`, type: 'expansion_offer' },
            { day: 3,  subject: `How to unlock the full ${product} stack`, type: 'upgrade_nudge' },
          ],
          expected_upgrade_rate: '22%',
        },
        {
          flow:       'NPS follow-up',
          trigger:    'NPS score submitted',
          emails:     [
            { day: 0, subject: 'Thank you for your feedback', type: 'promoter' },
            { day: 0, subject: 'Tell us what we can do better', type: 'detractor_follow_up' },
          ],
          expected_outcome: 'Promoters → referral; Detractors → CSM outreach within 24h',
        },
        {
          flow:       'Milestone celebration',
          trigger:    'Customer hits 90 days, first report generated, first team invite',
          emails:     [
            { day: 0, subject: `You just hit your first milestone with ${product}`, type: 'milestone' },
          ],
          expected_outcome: 'Reinforces habit, creates natural referral moment',
        },
      ],
    };
  }

  _buildTouchpointPlan(product, audience) {
    return {
      touchpoints_per_month: 6,
      rhythm: [
        { week: 1, touchpoint: 'Product tip of the week (email)', effort: 'low', channel: 'Email' },
        { week: 2, touchpoint: 'Community post or LinkedIn engagement prompt', effort: 'low', channel: 'Social' },
        { week: 3, touchpoint: 'Usage insight ("You saved X hours this month")', effort: 'medium', channel: 'In-app + email' },
        { week: 4, touchpoint: 'Customer story or case study share', effort: 'low', channel: 'Email' },
        { monthly: true, touchpoint: 'Product update newsletter (new features, improvements)', effort: 'medium', channel: 'Email' },
        { quarterly: true, touchpoint: 'Business review + renewal conversation (for Growth+ accounts)', effort: 'high', channel: 'Video call' },
      ],
      community_channels: [
        { channel: 'Slack community', purpose: 'Peer-to-peer support + product feedback', target_size: 500 },
        { channel: 'LinkedIn group', purpose: 'Thought leadership + customer advocacy', target_size: 2000 },
        { channel: 'Monthly webinar', purpose: 'Product education + case study sharing', target_attendance: 100 },
      ],
    };
  }

  _buildChurnTriggers(product) {
    return [
      {
        trigger:      'No login in 14 days',
        severity:     'medium',
        action:       'Automated email: "We noticed you have not been around — here is a quick win to get back on track"',
        escalation:   'If no response in 5 days → CSM notified',
        automation:   'HubSpot workflow: delay 14d → send email → if no open in 5d → create CSM task',
      },
      {
        trigger:      'No login in 30 days',
        severity:     'high',
        action:       'Personal email from account manager + calendar link for success call',
        escalation:   'Immediate → flag for churn risk in CRM, assign save play',
        automation:   'HubSpot workflow: set deal risk = high → notify CSM → send personal email template',
      },
      {
        trigger:      'Support ticket volume spikes (3+ in 7 days)',
        severity:     'high',
        action:       'CSM proactive outreach: "We noticed you had a few issues this week — can we hop on a call?"',
        escalation:   'Escalate to product team if recurring technical issue',
        automation:   'HubSpot: ticket count property trigger → CSM task created',
      },
      {
        trigger:      'Cancelled credit card / payment failure',
        severity:     'critical',
        action:       'Immediate email: "Update your payment details to avoid interruption" + 3-day grace period',
        escalation:   'Day 4 → account suspended + CSM outreach',
        automation:   'Stripe webhook → HubSpot lifecycle stage → email sequence',
      },
      {
        trigger:      'NPS score ≤ 6 submitted',
        severity:     'high',
        action:       'Personal email from CSM within 24h: "Thank you for the feedback — I want to understand what went wrong"',
        escalation:   'Call within 48h; log root cause; route to product if feature-related',
        automation:   'NPS form trigger → HubSpot task → CSM assigned',
      },
    ];
  }

  _connectorMissing(toolkit, detail, product, audience) {
    const lifecycleMap   = this._buildLifecycleMap(product, audience);
    const touchpointPlan = this._buildTouchpointPlan(product, audience);
    const churnTriggers  = this._buildChurnTriggers(product);

    return {
      prose: `I've built the full lifecycle engagement plan for ${product}, but I need HubSpot connected to load live contact data and activate the automation triggers. ${detail ? `(${detail.slice(0, 100)})` : ''}`,
      response_type: 'execution',
      agent: KiranAgent.id,
      crew: 'lifecycle-retention',
      confidence: 0.75,
      connectors_used: [],
      connector_missing: toolkit,
      artifact: {
        type: 'execution_tracker',
        status: 'plan_ready_connector_needed',
        metrics: { lifecycle_stages: lifecycleMap.stages.length, churn_triggers: churnTriggers.length },
        steps: [{ step: 'Connect HubSpot to activate lifecycle automations', status: 'blocked', owner: 'Marketing Ops' }],
        current_state: {},
        lifecycle_map:   lifecycleMap,
        touchpoint_plan: touchpointPlan,
        churn_triggers:  churnTriggers,
      },
      follow_ups: ['Connect HubSpot to activate lifecycle automations and load contact data'],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'execution',
      agent: KiranAgent.id,
      crew: 'lifecycle-retention',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'execution_tracker', status: 'error', metrics: {}, steps: [], current_state: {} },
      follow_ups: [],
    };
  }
}

module.exports = KiranAgent;
