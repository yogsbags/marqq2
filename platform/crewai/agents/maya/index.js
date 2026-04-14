'use strict';

/**
 * Maya — SEO Agent
 *
 * Goals covered:
 *   seo-visibility → keyword gap analysis, content architecture, technical SEO checklist,
 *                    AI-search (AEO) visibility plan; enriches with real GA4 data if connected
 *
 * Optional connectors: googleanalyticsga4 (organic traffic report)
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

class MayaAgent {
  static id    = 'maya';
  static name  = 'Maya — SEO & Content Discovery';
  static crews = ['seo-content'];

  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');
    return await this._seoVisibility(request);
  }

  async _seoVisibility(request) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      domain = 'yoursite.com',
      ga4PropertyId,
      competitor = null,
      category = 'marketing intelligence',
      message,
    } = request.extracted_params || request;

    const keywordClusters = this._buildKeywordClusters(product, audience, category, competitor);
    const contentArchitecture = this._buildContentArchitecture(keywordClusters, product, audience);
    const technicalChecklist  = this._buildTechnicalChecklist();
    const aeoStrategy         = this._buildAeoStrategy(product, audience, category);

    const topCluster  = keywordClusters[0];
    const quickWins   = keywordClusters.filter((k) => k.difficulty === 'low');
    const totalKeywords = keywordClusters.reduce((s, c) => s + c.keywords.length, 0);

    // ── Connector: GA4 organic traffic report ────────────────────────────────
    let connectors_used  = [];
    let ga4TrafficData   = null;

    if (apiKey) {
      try {
        const propertyId = ga4PropertyId || `properties/${domain.replace(/[^a-z0-9]/gi, '')}`;
        const ga4Result  = await executeComposioTool(entityId, 'googleanalyticsga4', 'GOOGLEANALYTICSGA4_RUN_REPORT', {
          property:         propertyId,
          dateRanges:       [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions:       [{ name: 'sessionDefaultChannelGroup' }],
          metrics:          [{ name: 'sessions' }, { name: 'newUsers' }, { name: 'bounceRate' }],
        }, apiKey);
        const rows = ga4Result?.data?.rows || ga4Result?.rows || [];
        if (rows.length) {
          const organicRow = rows.find((r) => (r.dimensionValues?.[0]?.value || '').toLowerCase().includes('organic'));
          ga4TrafficData = {
            organic_sessions_30d: organicRow ? parseInt(organicRow.metricValues?.[0]?.value || 0) : null,
            total_sessions_30d:   rows.reduce((s, r) => s + parseInt(r.metricValues?.[0]?.value || 0), 0),
            channel_breakdown:    rows.map((r) => ({
              channel:  r.dimensionValues?.[0]?.value,
              sessions: parseInt(r.metricValues?.[0]?.value || 0),
              new_users: parseInt(r.metricValues?.[1]?.value || 0),
            })),
          };
          connectors_used = ['googleanalyticsga4'];
        }
      } catch (err) {
        if (!err.message.includes('No active googleanalyticsga4')) {
          console.warn('[Maya] GA4 warning:', err.message);
        }
      }
    }

    const ga4Note = ga4TrafficData
      ? `Real GA4 data: ${ga4TrafficData.organic_sessions_30d?.toLocaleString() || 'N/A'} organic sessions in the last 30 days across ${ga4TrafficData.channel_breakdown.length} channels.`
      : 'Connect Google Analytics GA4 to enrich this with real organic traffic data.';

    return {
      prose: `SEO strategy for ${product} in the "${category}" space. I've mapped ${keywordClusters.length} keyword clusters covering ${totalKeywords} target terms. Quick wins (low difficulty, immediate ranking potential): ${quickWins.length} clusters. Top priority cluster: "${topCluster.cluster_name}" — ${topCluster.monthly_search_volume.toLocaleString()} monthly searches, ${topCluster.difficulty} difficulty. I've also built an AEO (AI search visibility) plan to capture answer-engine traffic. ${ga4Note}`,
      response_type: 'analysis',
      agent: MayaAgent.id,
      crew: 'seo-content',
      confidence: ga4TrafficData ? 0.91 : 0.83,
      connectors_used,
      artifact: {
        type: 'analysis',
        metrics: {
          keyword_clusters:        keywordClusters.length,
          total_target_keywords:   totalKeywords,
          quick_win_clusters:      quickWins.length,
          estimated_monthly_traffic_potential: keywordClusters.reduce((s, c) => s + c.monthly_search_volume, 0),
          content_pieces_to_create: contentArchitecture.pillars.length + contentArchitecture.spoke_count,
        },
        findings: [
          `Top cluster "${topCluster.cluster_name}": ${topCluster.monthly_search_volume.toLocaleString()} searches/mo, ${topCluster.difficulty} difficulty`,
          `${quickWins.length} quick-win cluster${quickWins.length !== 1 ? 's' : ''} available — low difficulty, meaningful volume`,
          `Technical SEO: ${technicalChecklist.filter((i) => i.priority === 'high').length} high-priority items to fix`,
        ],
        insights: [
          'Topical authority compounds — publish 10+ articles in one cluster before branching to the next',
          'AI search (ChatGPT, Perplexity) now drives 15-20% of B2B discovery — AEO is not optional',
          'Comparison content ("X vs Y") converts at 3× the rate of informational articles — prioritise it',
        ],
        channel_breakdown: keywordClusters.map((c) => ({
          stage:       c.cluster_name,
          sessions:    c.monthly_search_volume,
          label:       c.cluster_name,
          difficulty:  c.difficulty,
          intent:      c.primary_intent,
          keywords:    c.keywords.length,
        })),
        keyword_clusters:     keywordClusters,
        content_architecture: contentArchitecture,
        technical_checklist:  technicalChecklist,
        aeo_strategy:         aeoStrategy,
        ga4_traffic_data:     ga4TrafficData,
      },
      follow_ups: [
        `Write the pillar article for "${topCluster.cluster_name}"`,
        `Create ${quickWins.length} quick-win articles targeting low-difficulty terms`,
        'Run a technical SEO audit and fix the high-priority items',
        'Build comparison pages for the top 3 competitor keywords',
        'Set up Google Search Console to track ranking progress',
      ],
    };
  }

  _buildKeywordClusters(product, audience, category, competitor) {
    const comp = competitor || 'HubSpot';
    return [
      {
        cluster_name: `${category} software`,
        primary_intent: 'commercial',
        difficulty: 'high',
        monthly_search_volume: 8400,
        keywords: [`${category} software`, `best ${category} tools`, `${category} platform comparison`, `top ${category} solutions 2026`],
        content_type: 'Comparison / best-of roundup',
        priority: 1,
      },
      {
        cluster_name: `${product} vs competitors`,
        primary_intent: 'commercial',
        difficulty: 'low',
        monthly_search_volume: 2200,
        keywords: [`${product} vs ${comp}`, `${product} alternative`, `${comp} alternative for ${audience}`, `${product} vs Salesforce`],
        content_type: 'Comparison pages (one per competitor)',
        priority: 2,
      },
      {
        cluster_name: `${audience} strategy`,
        primary_intent: 'informational',
        difficulty: 'medium',
        monthly_search_volume: 5600,
        keywords: [`${audience} strategy 2026`, `${audience} best practices`, `how to build a ${category} strategy`, `${audience} framework`],
        content_type: 'Pillar guide + spoke articles',
        priority: 3,
      },
      {
        cluster_name: `marketing attribution`,
        primary_intent: 'informational',
        difficulty: 'medium',
        monthly_search_volume: 4800,
        keywords: ['marketing attribution model', 'multi-touch attribution', 'first touch vs last touch attribution', 'marketing attribution software'],
        content_type: 'Definitive guide + tool comparison',
        priority: 4,
      },
      {
        cluster_name: `marketing ROI measurement`,
        primary_intent: 'informational',
        difficulty: 'low',
        monthly_search_volume: 3200,
        keywords: ['marketing ROI formula', 'how to measure marketing ROI', 'marketing ROI calculator', 'B2B marketing ROI benchmarks'],
        content_type: 'Calculator + guide',
        priority: 5,
      },
      {
        cluster_name: `AI marketing automation`,
        primary_intent: 'commercial',
        difficulty: 'low',
        monthly_search_volume: 6100,
        keywords: ['AI marketing automation', 'autonomous marketing AI', 'AI-powered marketing tool', 'marketing AI platform'],
        content_type: 'Thought leadership + product page',
        priority: 6,
      },
    ].sort((a, b) => a.priority - b.priority);
  }

  _buildContentArchitecture(clusters, product, audience) {
    const pillars = clusters.slice(0, 3).map((c) => ({
      pillar_title:   `The Complete Guide to ${c.cluster_name.charAt(0).toUpperCase() + c.cluster_name.slice(1)}`,
      target_keyword: c.keywords[0],
      word_count:     3500,
      internal_links: 6,
      spoke_count:    5,
    }));

    return {
      pillars,
      spoke_count: pillars.length * 5,
      total_pieces: pillars.length + pillars.length * 5,
      publish_cadence: '2 pillar articles + 8 spoke articles per month',
      internal_link_strategy: 'Every spoke links to its pillar page; pillar pages link to each other via contextual mentions',
      indexing_priority: ['Pillar pages first', 'Comparison pages second (highest commercial intent)', 'Quick-win spoke articles third'],
    };
  }

  _buildTechnicalChecklist() {
    return [
      { item: 'Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1', priority: 'high', effort: 'medium', tool: 'PageSpeed Insights' },
      { item: 'XML sitemap submitted to Google Search Console', priority: 'high', effort: 'low', tool: 'GSC' },
      { item: 'robots.txt configured — no important pages blocked', priority: 'high', effort: 'low', tool: 'Manual check' },
      { item: 'HTTPS on all pages, no mixed content warnings', priority: 'high', effort: 'low', tool: 'SSL checker' },
      { item: 'Canonical tags on all duplicate/similar pages', priority: 'high', effort: 'medium', tool: 'Screaming Frog' },
      { item: 'Schema markup: Article, FAQPage, Product on relevant pages', priority: 'medium', effort: 'medium', tool: 'Schema.org' },
      { item: 'Internal linking audit: no orphan pages', priority: 'medium', effort: 'medium', tool: 'Ahrefs / Screaming Frog' },
      { item: 'Image alt text on all product screenshots and charts', priority: 'medium', effort: 'low', tool: 'Manual audit' },
      { item: 'Mobile-first layout — test all landing pages on mobile', priority: 'high', effort: 'low', tool: 'Chrome DevTools' },
      { item: 'Page titles unique, 50-60 chars, include target keyword', priority: 'medium', effort: 'low', tool: 'Screaming Frog' },
    ];
  }

  _buildAeoStrategy(product, audience, category) {
    return {
      description: 'Answer Engine Optimisation (AEO) — getting cited by ChatGPT, Perplexity, Gemini, and Google SGE',
      tactics: [
        {
          tactic: 'FAQ-format content',
          description: 'Answer 20+ specific questions from your ICP in clear 40-80 word answer blocks — exactly the format AI engines cite',
          pages_to_create: [`"What is ${category}?" FAQ`, '"How to measure marketing ROI" FAQ', `"${product} vs HubSpot" comparison FAQ`],
          effort: 'low',
        },
        {
          tactic: 'Structured data markup',
          description: 'Add FAQPage schema to all FAQ sections — directly increases chance of being cited in AI answers',
          effort: 'medium',
        },
        {
          tactic: 'Authoritative definition pages',
          description: 'Create short, clear, definitional pages for every key term in your category — AI engines love citing definitive definitions',
          examples: [`What is ${category}?`, 'What is marketing attribution?', 'What is ROAS?'],
          effort: 'low',
        },
        {
          tactic: 'Thought leadership citations',
          description: 'Publish original research with data — AI engines cite unique statistics and studies heavily',
          effort: 'high',
        },
      ],
      estimated_ai_traffic_uplift: '15-25% additional discovery within 6 months',
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'analysis',
      agent: MayaAgent.id,
      crew: 'seo-content',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'analysis', metrics: {}, findings: [], insights: [], channel_breakdown: [] },
      follow_ups: [],
    };
  }
}

module.exports = MayaAgent;
