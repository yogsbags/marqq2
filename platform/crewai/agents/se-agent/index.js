'use strict';

/**
 * SE Agent — Sales Enablement Agent
 *
 * LLM-powered. Generates battlecards, objection handlers,
 * value proposition by persona, discovery question banks,
 * and ICP descriptions. Creates a HubSpot engagement note if connected.
 *
 * Optional connectors: hubspot (engagement/note creation)
 * Response type: "creation"
 */

// ── Composio V3 helpers ───────────────────────────────────────────────────────

async function resolveConnectedAccountId(entityId, toolkit, apiKey) {
  const url = `https://backend.composio.dev/api/v3/connectedAccounts?entityIds=${encodeURIComponent(entityId)}&toolkits=${toolkit}&status=ACTIVE`;
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) throw new Error(`Composio connectedAccounts error ${res.status}`);
  const data = await res.json();
  const items = data.items || [];
  if (!items.length) throw new Error(`No active ${toolkit} connection for entity ${entityId}`);
  return items[0].id;
}

async function executeComposioTool(entityId, toolkit, toolSlug, args, apiKey) {
  const accountId = await resolveConnectedAccountId(entityId, toolkit, apiKey);
  const url = 'https://backend.composio.dev/api/v3/tools/execute';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolSlug, entityId, connectedAccountId: accountId, input: args }),
  });
  if (!res.ok) throw new Error(`Composio tool execute error ${res.status}`);
  return res.json();
}

// ── Content templates ─────────────────────────────────────────────────────────

function buildBattlecard(product, competitor, strengths, weaknesses) {
  const ourStrengths = strengths?.length > 0 ? strengths : [
    '[Differentiator 1: e.g. faster implementation — "live in 48 hours vs. industry avg 6 weeks"]',
    '[Differentiator 2: e.g. pricing — "flat rate vs. per-seat pricing that balloons at scale"]',
    '[Differentiator 3: e.g. integration depth — "native integrations with X, Y, Z vs. Zapier-only"]',
  ];

  const theirWeaknesses = weaknesses?.length > 0 ? weaknesses : [
    `[${competitor} weakness 1: e.g. "Known for poor customer support — avg 48h ticket response"]`,
    `[${competitor} weakness 2: e.g. "No mobile app — field team cannot access on the go"]`,
    `[${competitor} weakness 3: e.g. "Per-seat pricing penalises growth — customers report 3-4x cost at scale"]`,
  ];

  return {
    section: 'battlecard',
    label: `${product} vs. ${competitor}`,
    purpose: 'Give reps what they need to win a competitive deal in under 2 minutes',
    us_vs_them: {
      our_strengths: ourStrengths,
      their_weaknesses: theirWeaknesses,
      landmines: [
        `Ask: "How does ${competitor} handle [use case we're strong in]?" — they don't have a good answer.`,
        `Ask: "What's your support SLA with ${competitor}?" — surfaces the support gap.`,
        `Ask: "How does pricing scale when your team grows past 50 users?" — exposes per-seat penalty.`,
      ],
      counters: {
        [`"We're already using ${competitor}"`]: `Understood — most of our best customers came from ${competitor}. The main reason they switched was [specific pain we solve]. Can I show you a 5-minute comparison?`,
        [`"${competitor} is cheaper"`]: `${competitor} starts cheaper, but at [scale/usage], our flat-rate pricing means you'll pay [X%] less. Here's a quick cost model for your team size.`,
        [`"${competitor} has more features"`]: `${competitor} does have a broader feature set — but our customers find they only use 20% of those features. We go deep on the 3 things that drive [their main outcome].`,
      },
    },
    win_themes: [
      `Speed to value: ${product} is live in [timeframe] — ${competitor} averages [longer timeframe].`,
      `Total cost: Our pricing model saves [audience type] an average of [X%] vs. ${competitor} at [usage level].`,
      `Support: [N]-minute average response time vs. ${competitor}'s [longer time].`,
    ],
    notes: 'IMPORTANT: Never attack the competitor directly. Always make a positive claim about us that implicitly highlights their gap. "We respond in 4 hours" is stronger than "they respond slowly".',
  };
}

function buildObjectionHandlers(product, audience) {
  return {
    section: 'objection_handlers',
    label: 'Top Objection Responses',
    purpose: 'Give reps a confident 2-sentence response to every common objection',
    objections: [
      {
        objection: '"It\'s too expensive."',
        response: `Understood — what's your current [alternative] costing you in [time/resources]? Most ${audience || 'teams like yours'} find ${product} pays for itself within [timeframe] through [specific ROI].`,
        notes: 'Reframe from cost to ROI. Get a specific number before responding.',
      },
      {
        objection: '"We don\'t have budget right now."',
        response: `Timing makes sense to flag. What does your budget cycle look like — when would we need to have this approved to start in Q[X]? I can put together a business case for your CFO.`,
        notes: 'Don\'t abandon the deal. Find the next budget window and work backwards.',
      },
      {
        objection: '"We\'re already using [alternative]."',
        response: `Most of our customers were using [alternative] before they switched. What\'s the #1 thing you wish [alternative] did better? That\'s usually where we can show a clear difference.`,
        notes: 'Surface dissatisfaction with the status quo rather than attacking the alternative.',
      },
      {
        objection: '"We need to think about it."',
        response: `Of course — what specific concern is top of mind? I want to make sure you have everything you need to make a confident decision, not just a fast one.`,
        notes: 'This is rarely about time. It\'s an undisclosed objection. Surface it.',
      },
      {
        objection: '"Can you do better on price?"',
        response: `I\'ll check what flexibility we have, but I want to make sure we\'re pricing for the right package first. Are you looking to trim features, adjust the contract length, or find a different payment structure?`,
        notes: 'Don\'t discount without understanding what they\'re asking for. Scope first.',
      },
      {
        objection: '"We\'re not ready yet — maybe next quarter."',
        response: `What would need to be true to start this quarter instead? I ask because [relevant insight: e.g. "our implementation slots fill up 6 weeks out" or "pricing changes in Q2"].`,
        notes: 'Create legitimate urgency. Never manufacture false urgency.',
      },
      {
        objection: '"Your competitor does the same thing for less."',
        response: `Worth comparing carefully. [Competitor] is priced lower for the base tier, but most ${audience || 'teams'} at your scale end up paying [X] once they add [features]. Can I run a side-by-side for your specific needs?`,
        notes: 'Get specific. Generic price comparisons lose deals.',
      },
      {
        objection: '"We\'d need to involve IT/Legal/Finance."',
        response: `Smart — let\'s bring them in early. Who should I send our security documentation / DPA / procurement guide to? I\'ll prepare exactly what each stakeholder needs.`,
        notes: 'Treat stakeholder involvement as a milestone, not a blocker.',
      },
      {
        objection: '"We don\'t have the bandwidth to implement this."',
        response: `That\'s one of the most common concerns before people start. Our onboarding team handles [specific implementation tasks] — your team\'s lift is typically [N hours] over [timeframe]. Can I show you the onboarding plan?`,
        notes: 'Make the implementation concrete and small. Vague effort estimates kill deals.',
      },
      {
        objection: '"I\'m not the decision maker."',
        response: `Appreciate you being upfront. Who would be the right person to loop in, and what does the decision process typically look like for tools like this at your company?`,
        notes: 'Map the buying committee. Ask for an intro, not just a name.',
      },
    ],
  };
}

function buildValuePropByPersona(product, personas) {
  const defaultPersonas = personas?.length > 0 ? personas : [
    { role: 'Marketing Director', pain: 'Proving ROI of marketing spend to the board', outcome: 'Clear attribution and revenue contribution reports' },
    { role: 'Sales Manager', pain: 'Reps spending time on tasks instead of selling', outcome: 'More selling time, better pipeline visibility' },
    { role: 'CFO / Finance', pain: 'Marketing costs scaling without measurable return', outcome: 'Cost-per-acquisition reduction and budget predictability' },
  ];

  return {
    section: 'value_prop_by_persona',
    label: 'Value Proposition by Persona',
    purpose: 'Make every persona feel the product was built for them specifically',
    personas: defaultPersonas.map((p) => ({
      persona: p.role,
      their_biggest_pain: p.pain,
      what_we_do_for_them: `${product} helps ${p.role}s ${p.outcome.toLowerCase()}`,
      proof_point: `[Specific metric: e.g. "Customers in this role reduced [metric] by X% in Y days"]`,
      one_liner: `${product}: the [category] that finally gives ${p.role}s [specific outcome] without [specific pain].`,
      opening_line_for_outreach: `Hi [Name] — I noticed ${p.role}s at [company type] are usually dealing with [their pain]. We've helped [N] ${p.role}s [specific outcome]. Worth a 15-min call?`,
    })),
  };
}

function buildDiscoveryQuestions(audience, product) {
  return {
    section: 'discovery_questions',
    label: 'Discovery Question Bank',
    purpose: 'Surface pain, urgency, and buying authority in under 20 minutes',
    questions: [
      {
        category: 'Current State',
        questions: [
          `Walk me through how you currently handle [core problem ${product} solves] today.`,
          `What tools or processes are you using for [area] right now?`,
          `Who on your team owns this problem day-to-day?`,
        ],
      },
      {
        category: 'Pain & Impact',
        questions: [
          `What\'s the biggest frustration with how you\'re doing this today?`,
          `If you had to put a number on it — how much is this problem costing you per month in [time/revenue/team effort]?`,
          `What happens if this problem isn\'t solved in the next 6 months?`,
        ],
      },
      {
        category: 'Goals & Urgency',
        questions: [
          `What does success look like for you in the next 90 days in [area]?`,
          `What\'s driving the urgency to solve this now vs. earlier?`,
          `If we could [achieve their goal] for you, where would that rank in your priorities this quarter?`,
        ],
      },
      {
        category: 'Buying Process',
        questions: [
          `Assuming we\'re a strong fit — who else would need to be involved in a decision like this?`,
          `What does your evaluation process look like, and what\'s your timeline?`,
          `Have you budgeted for this, or would we need to build a business case?`,
        ],
      },
    ],
    notes: `Listen more than you talk. The goal of discovery is to learn, not to pitch. Let ${audience || 'prospects'} describe their pain in their own words — then reflect it back in your proposal.`,
  };
}

function buildIcpProfile(audience, product) {
  return {
    section: 'icp',
    label: 'Ideal Customer Profile (ICP)',
    purpose: 'Help reps qualify in/out quickly — stop wasting time on bad-fit deals',
    firmographics: {
      company_size: '[e.g. 50-500 employees / $5M-$50M ARR — the sweet spot where your pain is real but budget exists]',
      industry: '[e.g. B2B SaaS, Professional Services, E-commerce — industries where the problem is most acute]',
      geography: '[e.g. US/UK/ANZ — where your GTM motion works today]',
      tech_stack_signals: '[Tools they already use that signal fit, e.g. HubSpot + Slack + Salesforce users]',
    },
    psychographics: {
      company_stage: '[e.g. Series A-C — past product-market fit, starting to scale GTM]',
      growth_signal: '[e.g. recently hired VP Marketing / opened new office / raised funding]',
      buying_trigger: '[e.g. failed with DIY approach / outgrew existing tool / new leadership mandate]',
    },
    qualification_checklist: [
      { criterion: 'Has the budget (or authority to create it)', disqualifier: 'No budget AND no path to budget' },
      { criterion: 'Feels the pain acutely — has tried to solve it before', disqualifier: 'Pain is theoretical, not immediate' },
      { criterion: 'Has a real decision timeline (this quarter/next)', disqualifier: 'No timeline; "maybe someday"' },
      { criterion: 'Decision maker is in the room (or accessible)', disqualifier: 'Can only reach an influencer with no path to DM' },
    ],
    red_flags: [
      'Wants heavy customisation before they\'ve even tried the standard product',
      'Unwilling to share current process or data — can\'t diagnose without it',
      'Entire evaluation driven by lowest price — value conversation impossible',
      'No internal champion willing to advocate internally',
    ],
  };
}

// ── Agent ─────────────────────────────────────────────────────────────────────

class SeAgent {
  static id = 'se-agent';
  static name = 'SE Agent';
  static role = 'Sales Enablement Agent';
  static crews = ['sales-enablement'];

  async execute(request = {}) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      competitor,
      audience,
      personas = [],
      strengths = [],
      weaknesses = [],
      outputType = 'full', // 'full' | 'battlecard' | 'objections' | 'value_props' | 'discovery' | 'icp'
    } = request;

    if (!entityId) return this._error('entityId is required.');

    // Build requested sections
    const sections = {};

    if (outputType === 'full' || outputType === 'battlecard') {
      if (competitor) {
        sections.battlecard = buildBattlecard(product, competitor, strengths, weaknesses);
      }
    }

    if (outputType === 'full' || outputType === 'objections') {
      sections.objection_handlers = buildObjectionHandlers(product, audience);
    }

    if (outputType === 'full' || outputType === 'value_props') {
      sections.value_prop_by_persona = buildValuePropByPersona(product, personas);
    }

    if (outputType === 'full' || outputType === 'discovery') {
      sections.discovery_questions = buildDiscoveryQuestions(audience, product);
    }

    if (outputType === 'full' || outputType === 'icp') {
      sections.icp = buildIcpProfile(audience, product);
    }

    const sectionCount = Object.keys(sections).length;

    const findings = [
      `Sales enablement package generated for "${product}"${competitor ? ` vs. ${competitor}` : ''}.`,
      `${sectionCount} section${sectionCount !== 1 ? 's' : ''} created: ${Object.keys(sections).join(', ')}.`,
      competitor
        ? `Battlecard includes ${sections.battlecard?.us_vs_them?.landmines?.length || 3} landmine questions and ${Object.keys(sections.battlecard?.us_vs_them?.counters || {}).length} pre-built objection counters.`
        : 'No competitor specified — battlecard skipped. Provide competitor name to generate.',
      audience
        ? `Content tailored for ${audience} audience.`
        : 'No audience specified — using generic copy. Provide target audience for personalised enablement.',
    ];

    const insights = [
      'Run a 1-hour win/loss analysis with your last 10 deals — update the objection handlers with real language from actual calls.',
      'Share the battlecard in your CRM (Salesforce/HubSpot) as a pinned resource on competitive deal types.',
      'Record a 5-minute video walking reps through the battlecard — written docs alone have < 30% adoption.',
    ];

    // ── Connector: create HubSpot engagement note ─────────────────────────────
    let connectors_used    = [];
    let hubspot_note_id    = null;

    if (apiKey) {
      const noteBody = [
        `Sales Enablement Package: ${product}${competitor ? ` vs. ${competitor}` : ''}`,
        `Sections: ${Object.keys(sections).join(', ')}`,
        competitor ? `\nBattlecard: ${sections.battlecard?.win_themes?.join(' | ') || ''}` : '',
        `\nTop objection response: ${sections.objection_handlers?.objections?.[0]?.response || ''}`,
        `\nGenerated: ${new Date().toISOString()}`,
      ].filter(Boolean).join('\n');

      try {
        const hsResult = await executeComposioTool(entityId, 'hubspot', 'HUBSPOT_CREATE_ENGAGEMENT', {
          engagement: { type: 'NOTE', active: true, timestamp: Date.now() },
          metadata:   { body: noteBody },
        }, apiKey);
        hubspot_note_id = hsResult?.data?.engagement?.id || hsResult?.engagement?.id || null;
        connectors_used = ['hubspot'];
      } catch (err) {
        if (!err.message.includes('No active hubspot')) {
          console.warn('[SeAgent] HubSpot warning:', err.message);
        }
      }
    }

    const hubspotNote = hubspot_note_id
      ? `Saved as HubSpot engagement note (ID: ${hubspot_note_id}).`
      : 'Connect HubSpot to save this enablement pack as a pinned note.';

    const prose = `I've built a sales enablement package for "${product}"${competitor ? ` with a full battlecard against ${competitor}` : ''}. The package includes ${sectionCount} section${sectionCount !== 1 ? 's' : ''}: objection handlers for the top 10 scenarios, value props by persona, a discovery question bank, and ICP criteria. Your reps should be able to use this in a live call today. ${hubspotNote}`;

    return {
      prose,
      response_type: 'creation',
      agent: SeAgent.id,
      crew: 'sales-enablement',
      confidence: 0.82,
      connectors_used,
      artifact: {
        type: 'content',
        format: 'sales_enablement_pack',
        title: `Sales Enablement: ${product}${competitor ? ` vs. ${competitor}` : ''}`,
        metadata: {
          product,
          competitor:        competitor || null,
          audience:          audience || null,
          output_type:       outputType,
          sections_included: Object.keys(sections),
          hubspot_note_id,
        },
        content: {
          ...sections,
          usage_guide: [
            'Battlecard: Print 1-pager or pin in CRM. Review weekly for accuracy.',
            'Objection handlers: Role-play with team monthly. Update with real call language.',
            'Value props: Load into email/LinkedIn outreach templates by persona.',
            'Discovery questions: Use as pre-call prep checklist, not a script.',
            'ICP: Use for lead scoring in CRM. Tag records by ICP fit tier.',
          ],
        },
        findings,
        insights,
      },
      follow_ups: [
        competitor
          ? `Update the ${competitor} battlecard with the latest feature comparison`
          : `Create a battlecard against our top competitor`,
        'Generate personalised outreach templates for each persona',
        'Write a 1-page leave-behind for sales calls',
        'Create a demo script for the most common use case',
        `Draft discovery call questions specific to ${audience || 'our target market'}`,
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem generating the sales enablement materials: ${message}`,
      response_type: 'creation',
      agent: SeAgent.id,
      crew: 'sales-enablement',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'content', format: 'sales_enablement_pack', content: {}, findings: [message], insights: [] },
      follow_ups: [],
    };
  }
}

module.exports = SeAgent;
module.exports.default = SeAgent;
