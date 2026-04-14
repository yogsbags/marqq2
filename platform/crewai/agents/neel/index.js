'use strict';

/**
 * Neel — Strategy Agent
 *
 * Goals covered:
 *   positioning     → GTM positioning statement, differentiation map, messaging pillars (LLM-only)
 *   launch-planning → strategy layer for product/campaign launch (chain member — neel runs first)
 *
 * No connector required — synthesises from brand/ICP context.
 */

class NeelAgent {
  static id    = 'neel';
  static name  = 'Neel — Strategy';
  static crews = ['strategy'];

  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');

    // Both positioning and launch-planning chain use the same positioning output as their foundation
    return this._positioning(request);
  }

  _positioning(request) {
    const {
      product = 'your product',
      audience = 'B2B marketing teams',
      competitor = null,
      painPoint = 'fragmented marketing data and slow decision cycles',
      uniqueStrength = 'unified AI-driven automation',
      category = 'marketing intelligence platform',
      message,
    } = request.extracted_params || request;

    // ── Positioning statement (Geoffrey Moore format) ──────────────────────
    const positioningStatement = `For ${audience} who struggle with ${painPoint}, ${product} is a ${category} that ${uniqueStrength}. Unlike ${competitor || 'traditional point solutions'}, ${product} connects every marketing motion into a single intelligent system — so teams spend less time on analysis and more time on execution.`;

    // ── 2×2 Differentiation map ────────────────────────────────────────────
    const differentiationAxes = {
      x_axis: { label: 'Automation depth', low: 'Manual / reports only', high: 'Fully autonomous execution' },
      y_axis: { label: 'Data integration breadth', low: 'Single channel', high: 'All channels unified' },
    };

    const competitorMap = [
      { name: competitor || 'HubSpot',    x: 0.5, y: 0.6, description: 'Good CRM, limited automation depth' },
      { name: 'Salesforce',              x: 0.6, y: 0.7, description: 'Broad platform, complex to configure' },
      { name: 'Point solutions (5+ tools)', x: 0.3, y: 0.3, description: 'Fragmented, no unified view' },
      { name: product,                   x: 0.9, y: 0.9, description: 'Unified + autonomous — clear whitespace' },
    ];

    // ── Message-market fit pillars ─────────────────────────────────────────
    const messagingPillars = [
      {
        pillar: 'Speed to insight',
        primary_message: `${product} gives ${audience} answers in seconds, not days`,
        supporting_proof: ['Average 90% reduction in reporting time', 'No-code connector setup in under 30 minutes', 'Pre-built dashboards for every marketing function'],
        objection_handled: 'We already have a BI tool',
        counter: `BI tools show you what happened. ${product} tells you what to do next — automatically.`,
      },
      {
        pillar: 'Execution without headcount',
        primary_message: 'Do the work of a full marketing ops team without hiring one',
        supporting_proof: ['AI agents execute campaigns end-to-end', 'Automatic budget reallocation as performance shifts', 'Outreach sequences that self-optimise'],
        objection_handled: 'We do not have budget for another tool',
        counter: `${product} replaces 3-5 point solutions and the agency retainer that manages them. Most teams recoup the cost in month 2.`,
      },
      {
        pillar: 'Compounding intelligence',
        primary_message: 'The more you use it, the smarter it gets about your business',
        supporting_proof: ['Memory layer learns your ICP, offers, and what converts', 'Agents share context across every marketing function', 'Recommendations improve with each campaign cycle'],
        objection_handled: 'AI tools are generic and do not understand our market',
        counter: `${product} learns your specific ICP, positioning, and historical performance. It is not a general chatbot — it is a trained ops layer for your marketing function.`,
      },
    ];

    // ── Channel-message fit matrix ─────────────────────────────────────────
    const channelFit = [
      { channel: 'LinkedIn (organic)',     best_pillar: 'Speed to insight',          content_type: 'Thought leadership + data posts' },
      { channel: 'LinkedIn (paid)',         best_pillar: 'Execution without headcount', content_type: 'ROI-focused ads targeting marketing leaders' },
      { channel: 'Google Search',           best_pillar: 'Speed to insight',          content_type: 'Comparison and category keywords' },
      { channel: 'Cold email outreach',     best_pillar: 'Execution without headcount', content_type: '3-line problem-aware opener + single CTA' },
      { channel: 'Content / SEO',           best_pillar: 'Compounding intelligence',   content_type: 'Deep-dive guides + benchmark reports' },
      { channel: 'Partner / co-marketing',  best_pillar: 'Compounding intelligence',   content_type: 'Joint webinars + co-authored reports' },
    ];

    // ── Strategic priorities (ICE-scored) ──────────────────────────────────
    const strategicPriorities = [
      { priority: 'Nail ICP before scaling spend', impact: 9, confidence: 9, ease: 8, ice: 8.7, action: 'Define top 3 ICP segments with firmographic + behavioural criteria this sprint' },
      { priority: 'Build comparison content', impact: 8, confidence: 8, ease: 7, ice: 7.7, action: `Create "X vs ${product}" pages targeting competitor-aware buyers` },
      { priority: 'Activate referral layer', impact: 7, confidence: 7, ease: 6, ice: 6.7, action: 'Set up referral programme for existing customers — target 15% of new pipeline from referrals' },
      { priority: 'Outbound motion with Arjun', impact: 8, confidence: 7, ease: 7, ice: 7.3, action: 'Run 500 ICP-filtered outreach sequences in next 30 days — measure reply rate target >8%' },
      { priority: 'Content moat via SEO', impact: 7, confidence: 8, ease: 6, ice: 7.0, action: 'Publish 2 pillar pages + 8 spoke articles per month for 6 months' },
    ].sort((a, b) => b.ice - a.ice);

    return {
      prose: `I've built the strategic positioning layer for ${product}. Positioning statement: "${positioningStatement.slice(0, 120)}..." — anchored on 3 messaging pillars: Speed to insight, Execution without headcount, and Compounding intelligence. I've mapped ${competitorMap.length} competitors on a 2×2 differentiation grid to show where ${product} has the clearest whitespace, and prioritised 5 strategic moves by ICE score.`,
      response_type: 'creation',
      agent: NeelAgent.id,
      crew: 'strategy',
      confidence: 0.87,
      connectors_used: [],
      artifact: {
        type: 'content',
        format: 'strategy_framework',
        title: `Positioning & Strategy: ${product}`,
        content: {
          positioning_statement:   positioningStatement,
          differentiation_axes:    differentiationAxes,
          competitor_map:          competitorMap,
          messaging_pillars:       messagingPillars,
          channel_fit_matrix:      channelFit,
          strategic_priorities:    strategicPriorities,
          category,
        },
        findings: [
          `Positioning anchored in clear whitespace: high automation depth × broad data integration`,
          `3 messaging pillars with proof points and objection handlers`,
          `Top priority: "${strategicPriorities[0].priority}" (ICE: ${strategicPriorities[0].ice})`,
        ],
        insights: [
          'Positioning is only as strong as the proof behind it — collect 3 customer case studies to validate each pillar within 60 days',
          `Competitor ${competitorMap[0].name} is most vulnerable on automation depth — lead with that angle in head-to-head comparisons`,
          'The messaging pillars should gate everything: blog outlines, ad copy, sales scripts — consistency drives conversion',
        ],
      },
      follow_ups: [
        'Build a sales battlecard based on this positioning',
        'Write a landing page using the strongest messaging pillar',
        'Create a competitive comparison page for the top competitor',
        'Develop a brand narrative document from these pillars',
        'Run a positioning test with 5 ICP prospects using these messages',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'creation',
      agent: NeelAgent.id,
      crew: 'strategy',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'content', format: 'strategy_framework', title: '', content: {} },
      follow_ups: [],
    };
  }
}

module.exports = NeelAgent;
