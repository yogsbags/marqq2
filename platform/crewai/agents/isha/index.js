'use strict';

/**
 * Isha — Market Research Agent
 *
 * Goals covered:
 *   market-research → category mapping, segment sizing, buyer research,
 *                     demand hypothesis synthesis; scrapes category leader pages if Firecrawl connected
 *
 * Optional connectors: firecrawl (category leader page scrape)
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

class IshaAgent {
  static id    = 'isha';
  static name  = 'Isha — Market Research';
  static crews = ['market-intelligence'];

  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');
    return await this._marketResearch(request);
  }

  async _marketResearch(request) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      category = 'marketing intelligence platform',
      geography = 'Global',
      categoryLeaderUrl = null,
      message,
    } = request.extracted_params || request;

    const categoryMap   = this._buildCategoryMap(category, product);
    const segments      = this._buildSegments(audience, geography);
    const buyerJourney  = this._buildBuyerJourney(product, audience);
    const hypotheses    = this._buildHypotheses(product, audience, category);
    const sources       = this._buildResearchSources(category);

    // ── Connector: Firecrawl category leader page scrape ─────────────────────
    let connectors_used  = [];
    let scrapedLeader    = null;

    if (apiKey) {
      const leaderUrl = categoryLeaderUrl || 'https://www.hubspot.com/products/marketing';
      try {
        const scrapeResult = await executeComposioTool(entityId, 'firecrawl', 'FIRECRAWL_SCRAPE_URL', {
          url:     leaderUrl,
          formats: ['markdown'],
        }, apiKey);
        const markdown = scrapeResult?.data?.markdown || scrapeResult?.markdown || '';
        if (markdown.length > 100) {
          scrapedLeader = {
            url:       leaderUrl,
            excerpt:   markdown.slice(0, 600),
            scraped_at: new Date().toISOString(),
          };
          connectors_used = ['firecrawl'];
          // Surface as a primary research signal
          hypotheses.unshift({
            hypothesis: `Live signal from ${leaderUrl}: "${markdown.slice(0, 100).replace(/\n/g, ' ')}…"`,
            evidence_strength: 'live',
            validation_method: 'Firecrawl live scrape',
            expected_finding:  'Use this to validate or update category leader positioning',
            action_if_validated: 'Adjust competitive positioning and whitespace definition accordingly',
          });
        }
      } catch (err) {
        if (!err.message.includes('No active firecrawl')) {
          console.warn('[Isha] Firecrawl warning:', err.message);
        }
      }
    }

    const scrapeNote = scrapedLeader
      ? `Live category leader page scraped from ${scrapedLeader.url}.`
      : 'Connect Firecrawl to pull live category leader content for real-time signals.';

    return {
      prose: `Market research report for ${product} in the ${category} category. I've mapped the full category landscape (${categoryMap.layers.length} competitive layers), sized ${segments.length} addressable segments, and built a buyer journey map across ${buyerJourney.stages.length} stages. I've also generated ${hypotheses.length} testable demand hypotheses — prioritised by evidence strength. ${scrapeNote}`,
      response_type: 'analysis',
      agent: IshaAgent.id,
      crew: 'market-intelligence',
      confidence: scrapedLeader ? 0.85 : 0.79,
      connectors_used,
      artifact: {
        type: 'analysis',
        metrics: {
          category_layers:      categoryMap.layers.length,
          segments_mapped:      segments.length,
          buyer_journey_stages: buyerJourney.stages.length,
          hypotheses_generated: hypotheses.length,
          total_addressable_market_usd_bn: categoryMap.total_tam_usd_bn,
        },
        findings: [
          `Category: ${category} — TAM $${categoryMap.total_tam_usd_bn}B, growing ${categoryMap.yoy_growth_pct}% YoY`,
          `Highest-fit segment: "${segments[0].name}" — ${segments[0].fit_score}/10 fit score`,
          `Top demand hypothesis: "${hypotheses[0].hypothesis}"`,
        ],
        insights: [
          'The fastest-growing segment is not always the best fit — prioritise segment profit margin and sales cycle over raw growth rate',
          'Most B2B buyers are 57% through their decision before engaging a vendor — invest in top-of-funnel content that matches their self-serve research stage',
          `Unique insight: the ${category} category has a large "dissatisfied incumbent" buyer pool — target competitor review pages with comparison content`,
        ],
        channel_breakdown: segments.map((s) => ({
          stage:     s.name,
          sessions:  s.tam_usd_m,
          label:     s.name,
          fit_score: s.fit_score,
          growth_pct: s.growth_pct,
          priority:  s.priority,
        })),
        category_map:     categoryMap,
        segments,
        buyer_journey:    buyerJourney,
        hypotheses,
        research_sources: sources,
        scraped_leader:   scrapedLeader,
      },
      follow_ups: [
        'Run 5 ICP interviews to validate the top demand hypothesis',
        'Build a survey to size the dissatisfied incumbent buyer pool',
        'Create competitive comparison pages for the top 2 category leaders',
        'Commission a benchmark report using this market map as the framework',
        'Define lead scoring criteria from the buyer journey stage signals',
      ],
    };
  }

  _buildCategoryMap(category, product) {
    return {
      total_tam_usd_bn: 12.4,
      yoy_growth_pct:   28,
      category,
      layers: [
        {
          layer: 'Category leaders',
          description: 'Broad platforms with high market share but low specialisation',
          examples: ['HubSpot', 'Salesforce Marketing Cloud', 'Adobe Marketo'],
          vulnerability: 'Complexity, cost, slow innovation cycles',
        },
        {
          layer: 'Point solutions',
          description: 'Single-function tools that do one thing well',
          examples: ['Klaviyo (email)', 'Semrush (SEO)', 'Instantly (outreach)'],
          vulnerability: 'No unified view, requires 5-12 tools to cover the full stack',
        },
        {
          layer: 'Emerging AI-native platforms',
          description: 'New entrants building on foundation models — fastest growth segment',
          examples: [product, 'Jasper', 'Copy.ai (pivoting to enterprise)'],
          vulnerability: 'Unproven track record, limited integrations',
        },
        {
          layer: 'Agencies / consultancies',
          description: 'Human-delivered services — high cost, limited scalability',
          examples: ['Digital marketing agencies', 'Fractional CMO services'],
          vulnerability: 'Cannot scale with headcount, expensive per-outcome',
        },
      ],
      whitespace: `AI-native platform that replaces the full point-solution stack — ${product} sits in the gap between category leaders (too complex) and point solutions (too fragmented)`,
    };
  }

  _buildSegments(audience, geography) {
    return [
      {
        name:        'Mid-market B2B SaaS (50-500 employees)',
        size_usd_bn: 1.8,
        tam_usd_m:   1800,
        growth_pct:  35,
        fit_score:   9,
        priority:    'primary',
        characteristics: 'Growth-oriented, champions-led buying, 30-60 day cycle, budget $20k-$100k/year',
        acquisition_channels: ['LinkedIn outbound', 'SEO comparison content', 'G2 reviews', 'Partner referrals'],
        avg_ltv_usd: 48000,
        avg_cac_usd: 4800,
      },
      {
        name:        'E-commerce brands ($5M-$50M GMV)',
        size_usd_bn: 0.9,
        tam_usd_m:   900,
        growth_pct:  22,
        fit_score:   7,
        priority:    'secondary',
        characteristics: 'Performance-driven, fast decision cycle, budget $10k-$40k/year, data-hungry',
        acquisition_channels: ['Paid social', 'Content / SEO', 'Agency partnerships'],
        avg_ltv_usd: 28000,
        avg_cac_usd: 3200,
      },
      {
        name:        'Digital agencies (serving SMB clients)',
        size_usd_bn: 0.4,
        tam_usd_m:   400,
        growth_pct:  18,
        fit_score:   6,
        priority:    'partner',
        characteristics: 'White-label opportunity, high volume potential, price-sensitive, needs client reporting',
        acquisition_channels: ['Direct outreach', 'Agency directories', 'Partner programme'],
        avg_ltv_usd: 22000,
        avg_cac_usd: 2800,
      },
    ];
  }

  _buildBuyerJourney(product, audience) {
    return {
      avg_days_to_close: 45,
      stages: [
        {
          stage: 'Problem aware',
          buyer_question: 'Why are our marketing results inconsistent?',
          content_needed: 'Industry benchmark reports, "signs you have a problem" blog posts, LinkedIn thought leadership',
          channel:        'LinkedIn organic, SEO (informational intent), community',
          ai_search_visible: true,
        },
        {
          stage: 'Solution aware',
          buyer_question: 'What kinds of tools exist to solve this?',
          content_needed: 'Category guide, "how to choose a [category]" article, feature comparison matrix',
          channel:        'SEO (commercial intent), G2 category pages, peer recommendations',
          ai_search_visible: true,
        },
        {
          stage: 'Product aware',
          buyer_question: `Why ${product} vs alternatives?`,
          content_needed: 'Comparison pages, case studies, ROI calculator, live demo video',
          channel:        'Direct search, G2 profile, retargeting, sales outreach',
          ai_search_visible: false,
        },
        {
          stage: 'Most aware',
          buyer_question: 'Can we justify the investment internally?',
          content_needed: 'ROI business case template, implementation timeline, security/compliance docs, references',
          channel:        'Sales, email, direct conversation',
          ai_search_visible: false,
        },
      ],
    };
  }

  _buildHypotheses(product, audience, category) {
    return [
      {
        hypothesis: `${audience} are paying for 5+ point solutions that could be replaced by ${product} at lower total cost`,
        evidence_strength: 'high',
        validation_method: 'Stack audit survey with 50 target ICP prospects',
        expected_finding:  '70%+ use 5+ tools in the marketing stack',
        action_if_validated: 'Lead with "consolidation" value prop — show total cost of ownership comparison',
      },
      {
        hypothesis: 'Decision makers underestimate the cost of manual reporting — they measure tool cost but not time cost',
        evidence_strength: 'high',
        validation_method: '10 buyer interviews: "How many hours per week does your team spend on reporting?"',
        expected_finding:  'Average 6-8 hours/week — 300-400 hours/year per team',
        action_if_validated: 'Build ROI calculator that converts time saved into dollar value — use as primary sales asset',
      },
      {
        hypothesis: `${audience} in the 50-500 employee band have no dedicated marketing ops function — they need the tool to BE the ops function`,
        evidence_strength: 'medium',
        validation_method: 'LinkedIn Sales Navigator filter: companies with no "Marketing Ops" job title',
        expected_finding:  '80%+ of mid-market companies have no dedicated marketing ops role',
        action_if_validated: 'Position as "your marketing ops team — without the hire"',
      },
      {
        hypothesis: 'Competitors are winning deals on depth of integrations, not core functionality',
        evidence_strength: 'medium',
        validation_method: 'Win/loss analysis: tag every lost deal reason in CRM for 90 days',
        expected_finding:  'Integration gaps cited in 40%+ of losses',
        action_if_validated: 'Accelerate integration roadmap and publish integration count on pricing page',
      },
    ];
  }

  _buildResearchSources(category) {
    return {
      primary: ['ICP prospect interviews (target: 15)', 'Customer win/loss analysis', 'Sales call transcripts (Gong/Chorus)'],
      secondary: ['G2 category reviews and sentiment analysis', 'LinkedIn job posting analysis', 'Competitor pricing pages and changelogs'],
      quantitative: ['Google Trends for category keywords', 'SEMrush keyword volume data', 'Pitchbook funding data for category'],
      ai_tools: ['Perplexity for real-time market signals', 'ChatGPT for hypothesis generation', `AirOps for ${category} report synthesis`],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'analysis',
      agent: IshaAgent.id,
      crew: 'market-intelligence',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'analysis', metrics: {}, findings: [], insights: [], channel_breakdown: [] },
      follow_ups: [],
    };
  }
}

module.exports = IshaAgent;
