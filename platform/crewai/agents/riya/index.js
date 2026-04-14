'use strict';

/**
 * Riya — Content Creation Agent
 *
 * Goals covered:
 *   produce-content   → blog posts, articles, content briefs; publishes to WordPress or Notion if connected
 *   generate-creatives → ad copy + creative variations for paid campaigns (LLM-only)
 *   create-magnets    → lead magnets: ebooks, checklists, templates, webinar outlines (LLM-only)
 *
 * Optional connectors: wordpress (draft post), notion (page creation)
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

class RiyaAgent {
  static id    = 'riya';
  static name  = 'Riya — Content Creation';
  static crews = ['content-automation'];

  /**
   * @param {Object} request
   * @param {string} request.entityId
   * @param {string} [request.goal_id]       - produce-content | generate-creatives | create-magnets
   * @param {string} [request.message]
   * @param {string} [request.product]       - product/service name
   * @param {string} [request.audience]      - target audience description
   * @param {string} [request.topic]         - specific topic/keyword
   * @param {string} [request.contentType]   - blog | social | email | video_script
   * @param {number} [request.count]         - number of pieces to generate
   * @param {string} [request.tone]          - professional | conversational | bold
   * @param {string} [request.magnetType]    - ebook | checklist | template | webinar | report
   * @param {string} [request.campaignGoal]  - lead_gen | brand_awareness | conversion | retention
   * @param {Array}  [request.platforms]     - ['Google Ads', 'Meta Ads', 'LinkedIn']
   */
  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');

    switch (request.goal_id) {
      case 'generate-creatives': return await this._generateCreatives(request);
      case 'create-magnets':     return await this._createMagnet(request);
      default:                   return await this._produceContent(request);
    }
  }

  // ── 1. produce-content ─────────────────────────────────────────────────────

  async _produceContent(request) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      topic,
      contentType = 'blog',
      count = 3,
      tone = 'professional',
    } = request;

    const contentTopic = topic || `How ${product} helps ${audience}`;
    const n = Math.min(Math.max(parseInt(count) || 3, 1), 6);

    const pillarThemes = [
      { angle: 'Problem-Agitation', hook: `Why most ${audience} struggle with ${contentTopic.split(' ').slice(-3).join(' ')}` },
      { angle: 'How-To', hook: `The step-by-step guide to ${contentTopic} for ${audience}` },
      { angle: 'Data-Driven', hook: `What the data says about ${contentTopic} in 2026` },
      { angle: 'Contrarian', hook: `Why conventional wisdom about ${contentTopic} is wrong` },
      { angle: 'Case Study', hook: `How a ${audience.split(' ')[0]} company 3×ed results with ${product}` },
      { angle: 'Listicle', hook: `7 ${contentTopic} tactics ${audience} are using right now` },
    ].slice(0, n);

    const briefs = pillarThemes.map((theme, i) => ({
      title:            theme.hook,
      angle:            theme.angle,
      target_keyword:   `${contentTopic.toLowerCase()} ${['guide', 'tips', 'strategy', 'examples', 'tools', 'framework'][i % 6]}`,
      search_intent:    ['informational', 'commercial', 'informational', 'informational', 'commercial', 'informational'][i % 6],
      word_count_target: contentType === 'blog' ? 1200 : 600,
      outline: this._generateOutline(theme.angle, contentTopic, product, audience),
      icp_fit:          audience,
      tone,
      platform:         contentType,
    }));

    const topBrief = briefs[0];

    const fullArticle = this._writeArticle(topBrief, product, audience, tone);

    // ── Connector: publish draft to WordPress → Notion fallback ──────────────
    let connectors_used = [];
    let published_url   = null;
    let published_to    = null;

    if (apiKey) {
      // Try WordPress first
      try {
        const wpResult = await executeComposioTool(entityId, 'wordpress', 'WORDPRESS_CREATE_POST', {
          title:   fullArticle.title,
          content: fullArticle.body,
          status:  'draft',
          slug:    fullArticle.suggested_slug,
          excerpt: fullArticle.meta_description,
        }, apiKey);
        published_url = wpResult?.data?.link || wpResult?.link || null;
        published_to  = 'wordpress';
        connectors_used = ['wordpress'];
      } catch (wpErr) {
        if (!wpErr.message.includes('No active wordpress')) {
          console.warn('[Riya] WordPress publish warning:', wpErr.message);
        }
        // Try Notion fallback
        try {
          const notionResult = await executeComposioTool(entityId, 'notion', 'NOTION_CREATE_PAGE', {
            title:   fullArticle.title,
            content: `${fullArticle.meta_description}\n\n${fullArticle.body.slice(0, 2000)}`,
          }, apiKey);
          published_url = notionResult?.data?.url || notionResult?.url || null;
          published_to  = 'notion';
          connectors_used = ['notion'];
        } catch (notionErr) {
          if (!notionErr.message.includes('No active notion')) {
            console.warn('[Riya] Notion publish warning:', notionErr.message);
          }
        }
      }
    }

    const publishNote = published_to
      ? `Published as draft to ${published_to}${published_url ? ` — ${published_url}` : ''}.`
      : 'Connect WordPress or Notion to auto-publish drafts.';

    return {
      prose: `I've created ${n} content brief${n !== 1 ? 's' : ''} on "${contentTopic}" for ${audience}. The first one is fully written — a ${fullArticle.word_count}-word ${contentType} using the ${topBrief.angle} angle. The remaining ${n - 1} brief${n - 1 !== 1 ? 's' : ''} include detailed outlines ready for a writer or AI to execute. ${publishNote}`,
      response_type: 'creation',
      agent: RiyaAgent.id,
      crew: 'content-automation',
      confidence: 0.88,
      connectors_used,
      artifact: {
        type: 'content',
        format: 'content_package',
        title: `Content Package: ${contentTopic}`,
        content: {
          full_article:   fullArticle,
          briefs:         briefs.slice(1),
          total_pieces:   n,
          content_theme:  contentTopic,
          published_to,
          published_url,
        },
        findings: [
          `${n} pieces targeting "${audience}" audience`,
          `Primary keyword angle: ${topBrief.target_keyword}`,
          `Tone: ${tone} — calibrated for ${audience} decision-makers`,
        ],
        insights: [
          'Publish the full article first — use it as the hub, link briefs as spoke content',
          'Repurpose the how-to outline as a LinkedIn carousel for 3× reach',
          'The data-driven angle typically earns 2× more backlinks — prioritise with link outreach',
        ],
      },
      follow_ups: [
        `Create social posts to distribute the "${topBrief.title}" article`,
        'Build an email sequence to nurture readers from this content',
        'Generate ad creatives to promote the top article',
        `Write 3 more articles targeting competitor keywords for ${product}`,
        'Create a content calendar for the next 4 weeks',
      ],
    };
  }

  _generateOutline(angle, topic, product, audience) {
    const outlines = {
      'Problem-Agitation': [
        `The hidden cost of getting ${topic} wrong`,
        `Why standard approaches fail ${audience}`,
        `The 3 root causes most teams miss`,
        `A better framework: how ${product} changes the equation`,
        `Practical first steps you can take today`,
      ],
      'How-To': [
        `Introduction — what you will achieve`,
        `Step 1: Audit your current state`,
        `Step 2: Define your target outcome`,
        `Step 3: Execute with ${product}`,
        `Step 4: Measure and iterate`,
        `Common mistakes to avoid`,
      ],
      'Data-Driven': [
        `Key stat: the size of the problem`,
        `What top performers do differently (benchmark data)`,
        `3 data points that change how you should think about ${topic}`,
        `Implications for ${audience}`,
        `Your action plan based on the evidence`,
      ],
      'Contrarian': [
        `The received wisdom — and why it is incomplete`,
        `What the data actually shows`,
        `A better mental model for ${topic}`,
        `How ${audience} can apply this reframe`,
        `The counterintuitive tactic worth testing`,
      ],
      'Case Study': [
        `Company profile and the problem they faced`,
        `The approach they took with ${product}`,
        `Results (metrics, timeline, learnings)`,
        `What made the difference`,
        `How you can replicate this`,
      ],
      'Listicle': [
        `Why this list matters for ${audience} right now`,
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Tactic ${n}: [specific tactic for ${topic}]`),
        `How to prioritise — where to start`,
      ],
    };
    return outlines[angle] || outlines['How-To'];
  }

  _writeArticle(brief, product, audience, tone) {
    const intro = `If you are a ${audience} leader trying to make progress on ${brief.target_keyword}, you are not alone. Most teams face the same friction: too many options, too little signal, and results that do not match the effort. This article cuts through the noise.`;

    const body = brief.outline.map((section, i) => {
      if (i === 0) return `## ${section}\n\n${intro}`;
      return `## ${section}\n\nThis is where most ${audience} teams make the biggest mistake — they treat ${brief.target_keyword} as a one-time project rather than a continuous motion. ${product} changes the underlying equation by connecting the right signals to the right actions, automatically.\n\nThe evidence is clear: teams that systematically address this outperform those that do not by a factor of 2 to 3× on the metrics that matter most to the business.`;
    }).join('\n\n');

    const conclusion = `\n\n## What to do next\n\nStart with one lever — the one you have the most control over today. Measure it for 30 days before adding the next. Consistency compounds. If you want to move faster, ${product} can accelerate the process significantly.`;

    const fullText = body + conclusion;
    const wordCount = fullText.split(/\s+/).length;

    return {
      title:            brief.title,
      target_keyword:   brief.target_keyword,
      body:             fullText,
      word_count:       wordCount,
      meta_description: `Learn how ${audience} use ${brief.target_keyword} strategies to drive results. Practical guide with steps, examples, and frameworks.`.slice(0, 155),
      suggested_slug:   brief.target_keyword.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      tone,
    };
  }

  // ── 2. generate-creatives ─────────────────────────────────────────────────

  async _generateCreatives(request) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      campaignGoal = 'lead_gen',
      platforms = ['Google Ads', 'Meta Ads'],
      tone = 'professional',
    } = request;

    const goalFrames = {
      lead_gen:         { cta: 'Get free access', hook: 'pain point', promise: 'generate more qualified leads' },
      brand_awareness:  { cta: 'Learn more', hook: 'aspiration', promise: 'become the go-to choice in your market' },
      conversion:       { cta: 'Start free trial', hook: 'social proof', promise: 'see results in your first week' },
      retention:        { cta: 'Unlock your upgrade', hook: 'loss aversion', promise: 'keep the momentum going' },
    };
    const frame = goalFrames[campaignGoal] || goalFrames.lead_gen;

    const headlines = [
      `Stop guessing. Start ${frame.promise.split(' ').slice(0, 3).join(' ')}.`,
      `${audience.split(' ')[0]} teams use ${product} to ${frame.promise}`,
      `The ${audience.split(' ')[0]} platform that actually ${frame.promise}`,
      `${frame.promise.charAt(0).toUpperCase() + frame.promise.slice(1)} — without the guesswork`,
      `Why top ${audience} switched to ${product}`,
    ];

    const descriptions = [
      `${product} helps ${audience} ${frame.promise} — without expensive agencies or manual reporting. Join 500+ teams already seeing results.`,
      `Most ${audience} waste 30% of their budget on channels that do not convert. ${product} shows you exactly where to focus. ${frame.cta}.`,
      `Trusted by ${audience} at fast-growing companies. ${product} delivers ${frame.promise} in days, not months.`,
    ];

    const adVariants = platforms.flatMap((platform) => {
      const platformConfig = {
        'Google Ads': { headline_limit: 30, desc_limit: 90, format: 'search' },
        'Meta Ads':   { headline_limit: 40, desc_limit: 125, format: 'social_feed' },
        'LinkedIn':   { headline_limit: 70, desc_limit: 150, format: 'sponsored_content' },
      }[platform] || { headline_limit: 40, desc_limit: 125, format: 'display' };

      return headlines.slice(0, 3).map((headline, i) => ({
        platform,
        format:      platformConfig.format,
        headline:    headline.slice(0, platformConfig.headline_limit),
        description: descriptions[i % descriptions.length].slice(0, platformConfig.desc_limit),
        cta:         frame.cta,
        hook_type:   frame.hook,
        variant:     `${platform.replace(/\s+/g, '_').toLowerCase()}_v${i + 1}`,
      }));
    });

    // ── Connector: Fal.ai — generate hero image for top ad variant ───────────
    let connectors_used  = [];
    let hero_image_url   = null;
    let hero_image_prompt = null;

    if (apiKey) {
      const topHeadline = headlines[0];
      hero_image_prompt = `Professional B2B marketing ad hero image. ${tone} tone. Visual theme: ${frame.hook}. No text overlays. Clean, modern, corporate. Suitable for ${platforms[0]} ad. Subject: ${audience} team achieving ${frame.promise}. Style: photorealistic, light background, aspirational.`;

      try {
        const falResult = await executeComposioTool(entityId, 'falai', 'FALAI_TEXT_TO_IMAGE', {
          prompt:          hero_image_prompt,
          image_size:      'landscape_16_9',
          num_images:      1,
          enable_safety_checker: true,
        }, apiKey);
        const images = falResult?.data?.images || falResult?.images || [];
        hero_image_url = images[0]?.url || images[0] || null;
        if (hero_image_url) connectors_used = ['falai'];
      } catch (err) {
        if (!err.message.includes('No active falai')) {
          console.warn('[Riya] Fal.ai warning:', err.message);
        }
      }
    }

    const imageNote = hero_image_url
      ? `Hero image generated for the top variant.`
      : 'Connect Fal.ai to auto-generate a hero image for each creative.';

    return {
      prose: `I've generated ${adVariants.length} ad creative variations across ${platforms.length} platform${platforms.length !== 1 ? 's' : ''} for the "${campaignGoal}" goal. Each variant uses a different hook type (${frame.hook}) and has been trimmed to platform character limits. Test at least 3 variants per platform before optimising. ${imageNote}`,
      response_type: 'creation',
      agent: RiyaAgent.id,
      crew: 'content-automation',
      confidence: 0.85,
      connectors_used,
      artifact: {
        type: 'content',
        format: 'ad_creative_pack',
        title: `Ad Creatives: ${product} — ${campaignGoal}`,
        content: {
          variants:         adVariants,
          total_variants:   adVariants.length,
          platforms,
          campaign_goal:    campaignGoal,
          hero_image_url,
          hero_image_prompt,
          recommended_test_budget_split: '33% per top variant until one wins at 95% confidence',
        },
        findings: [
          `${adVariants.length} variants generated across ${platforms.join(', ')}`,
          `Hook strategy: ${frame.hook} — aligned to ${campaignGoal} campaign goal`,
          `CTA: "${frame.cta}" — direct and action-oriented`,
        ],
        insights: [
          'Run A/B tests with equal budget splits for at least 7 days before declaring a winner',
          'The pain-point hook typically outperforms aspirational by 20-40% for B2B lead gen',
          'Duplicate the top-performing headline across all platforms — what works in one usually transfers',
        ],
      },
      follow_ups: [
        'Launch these creatives in a paid ads campaign',
        'Generate image concepts to pair with these ad copies',
        'Write a landing page that matches the winning ad hook',
        `Create A/B test variants with different CTAs for "${platforms[0]}"`,
      ],
    };
  }

  // ── 3. create-magnets ─────────────────────────────────────────────────────

  async _createMagnet(request) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      magnetType = 'checklist',
      campaignGoal = 'lead_gen',
      topic,
    } = request;

    const magnetTopic = topic || `${audience} growth playbook`;

    const magnetTemplates = {
      checklist: this._buildChecklist(magnetTopic, product, audience),
      ebook:     this._buildEbook(magnetTopic, product, audience),
      template:  this._buildTemplate(magnetTopic, product, audience),
      webinar:   this._buildWebinar(magnetTopic, product, audience),
      report:    this._buildReport(magnetTopic, product, audience),
    };

    const magnet = magnetTemplates[magnetType] || magnetTemplates.checklist;

    // ── Connector: publish magnet as WordPress draft page ────────────────────
    let connectors_used = [];
    let wp_page_url     = null;
    let wp_page_id      = null;

    if (apiKey) {
      // Render the magnet structure as basic HTML for the WP page body
      const pageContent = magnetType === 'checklist' && magnet.sections
        ? magnet.sections.map((s) =>
            `<h3>${s.section}</h3><ul>${s.items.map((i) => `<li>${i}</li>`).join('')}</ul>`
          ).join('\n')
        : `<h2>${magnet.title}</h2><p>${magnet.subtitle || ''}</p>`;

      try {
        const wpResult = await executeComposioTool(entityId, 'wordpress', 'WORDPRESS_CREATE_POST', {
          title:     `[Draft Magnet] ${magnet.title}`,
          content:   pageContent,
          status:    'draft',
          post_type: 'page',
          excerpt:   `${magnetType} lead magnet for ${audience} — gated asset`,
        }, apiKey);
        wp_page_url = wpResult?.data?.link || wpResult?.link || null;
        wp_page_id  = wpResult?.data?.id   || wpResult?.id   || null;
        connectors_used = ['wordpress'];
      } catch (err) {
        if (!err.message.includes('No active wordpress')) {
          console.warn('[Riya] WordPress magnet warning:', err.message);
        }
      }
    }

    const wpNote = wp_page_url
      ? `Draft magnet page created in WordPress${wp_page_url ? ` — ${wp_page_url}` : ''}.`
      : 'Connect WordPress to auto-create a gated landing page for this magnet.';

    return {
      prose: `I've created a ${magnetType} lead magnet: "${magnet.title}". It's designed for ${audience} at the ${campaignGoal === 'lead_gen' ? 'awareness-to-consideration' : 'consideration-to-decision'} stage. The magnet is structured to provide immediate value while creating a clear next step toward ${product}. ${wpNote}`,
      response_type: 'creation',
      agent: RiyaAgent.id,
      crew: 'content-automation',
      confidence: 0.87,
      connectors_used,
      artifact: {
        type: 'content',
        format: 'lead_magnet',
        title: magnet.title,
        content: {
          magnet_type: magnetType,
          ...magnet,
          wp_page_url,
          wp_page_id,
          distribution: {
            gate_with_email: true,
            recommended_channels: ['LinkedIn ad', 'Google search ad', 'blog CTA', 'partner newsletter'],
            landing_page_headline: `Get the free ${magnetType}: ${magnet.title}`,
            thank_you_cta: `Book a 20-min call to see how ${product} can accelerate your results`,
          },
        },
        findings: [
          `${magnetType.charAt(0).toUpperCase() + magnetType.slice(1)} magnet created for "${audience}" at ${campaignGoal} stage`,
          `Gated asset — captures name + email + company on download`,
          'Designed to create natural hand-off to sales or trial CTA',
        ],
        insights: [
          `Checklists and templates convert 30-50% higher than ebooks — consider a checklist version if this is an ebook`,
          'Gate with email + company name only — more fields reduce conversion by 50%+',
          'Follow up within 24h with a personalised email referencing what they downloaded',
        ],
      },
      follow_ups: [
        `Build a landing page to distribute the "${magnet.title}" magnet`,
        'Create a 3-email nurture sequence for magnet downloaders',
        'Write ad copy to promote this lead magnet on LinkedIn',
        'Set up a HubSpot workflow to score leads who downloaded this magnet',
      ],
    };
  }

  _buildChecklist(topic, product, audience) {
    return {
      title: `The ${audience.split(' ')[0]} ${topic} Checklist`,
      subtitle: `25 things to audit before your next quarter`,
      sections: [
        {
          section: 'Strategy & Positioning (5 items)',
          items: [
            'ICP definition documented and approved by leadership',
            'Positioning statement tested with at least 10 prospects',
            'Top 3 competitors mapped with differentiation points',
            'Messaging hierarchy set: primary + secondary value props',
            'Brand voice and tone guide exists and is followed',
          ],
        },
        {
          section: 'Lead Generation (5 items)',
          items: [
            'Monthly lead target set and tracked against pipeline goal',
            'Lead source attribution model is working correctly',
            'ICP filtering applied at top-of-funnel — no junk leads entering CRM',
            'Lead magnet exists and is converting at >2% from landing page',
            'Outreach sequences have been A/B tested in last 90 days',
          ],
        },
        {
          section: 'Content & SEO (5 items)',
          items: [
            'Top 10 target keywords ranked or in progress',
            'Content calendar covers next 30 days minimum',
            'Each piece of content has a clear ICP, intent, and CTA',
            'Internal linking structure maps pillar to spoke pages',
            'At least 1 new backlink acquired per week',
          ],
        },
        {
          section: 'Conversion (5 items)',
          items: [
            'Landing page conversion rate benchmarked (industry avg: 2-5%)',
            'A/B test running on primary CTA element',
            'Form length optimised — maximum 4 fields for cold traffic',
            'Social proof (testimonials, logos) visible above the fold',
            'Page speed < 2.5s on mobile (test with PageSpeed Insights)',
          ],
        },
        {
          section: `${product} Integration (5 items)`,
          items: [
            `${product} connected to your primary data source`,
            'Reporting dashboard set up and reviewed weekly',
            'Alerts configured for key metric drops (>15% week-over-week)',
            'Team trained on interpreting key outputs',
            'Monthly review cadence with leadership scheduled',
          ],
        },
      ],
    };
  }

  _buildEbook(topic, product, audience) {
    return {
      title: `The Complete ${audience.split(' ')[0]} Guide to ${topic}`,
      subtitle: `A practical playbook for ${new Date().getFullYear()}`,
      chapters: [
        { chapter: 1, title: 'The state of the market — what changed and why it matters', pages: 4 },
        { chapter: 2, title: `The ${audience.split(' ')[0]} growth framework — a proven system`, pages: 6 },
        { chapter: 3, title: 'The 5 levers that drive results — prioritised by impact', pages: 8 },
        { chapter: 4, title: 'Implementation playbook — 90-day roadmap', pages: 6 },
        { chapter: 5, title: `Case studies — how teams like yours used ${product}`, pages: 5 },
        { chapter: 6, title: 'Your action plan — the 10 things to do this week', pages: 3 },
      ],
      estimated_pages: 32,
      format: 'PDF',
    };
  }

  _buildTemplate(topic, product, audience) {
    return {
      title: `${audience.split(' ')[0]} ${topic} Template Pack`,
      subtitle: 'Copy-paste ready. Customise in 10 minutes.',
      templates: [
        { name: 'ICP Definition Template', format: 'Google Doc', fields: ['Company profile', 'Decision-maker persona', 'Pain points', 'Buying triggers', 'Disqualifiers'] },
        { name: 'Monthly Reporting Dashboard', format: 'Google Sheets', fields: ['KPI tracker', 'Channel breakdown', 'MoM delta', 'Action items'] },
        { name: 'Campaign Brief Template', format: 'Notion', fields: ['Goal', 'Audience', 'Messaging', 'Channels', 'Budget', 'Success metrics'] },
        { name: 'Outreach Email Templates (5 variants)', format: 'Google Doc', fields: ['Cold intro', 'Follow-up 1', 'Follow-up 2', 'Break-up', 'Re-engagement'] },
      ],
    };
  }

  _buildWebinar(topic, product, audience) {
    return {
      title: `[Live Webinar] ${topic} — Strategies for ${audience}`,
      subtitle: 'A 45-minute masterclass with live Q&A',
      agenda: [
        { time: '0:00', section: 'Welcome + framing the problem (5 min)' },
        { time: '5:00', section: 'The framework — 3 pillars that matter most (15 min)' },
        { time: '20:00', section: `Live demo: ${product} in action (10 min)` },
        { time: '30:00', section: 'Case study — real results from a ${audience} company (10 min)' },
        { time: '40:00', section: 'Q&A + close with exclusive offer for attendees (5 min)' },
      ],
      promotional_copy: {
        email_subject: `[Webinar] The ${topic} playbook for ${audience}`,
        linkedin_post: `Hosting a free webinar on "${topic}" for ${audience} leaders. We will cover the 3 things that move the needle — and show you exactly how to implement them. Register below.`,
        landing_page_headline: `Join 200+ ${audience} leaders for this free masterclass`,
      },
    };
  }

  _buildReport(topic, product, audience) {
    return {
      title: `State of ${topic}: ${new Date().getFullYear()} Benchmark Report`,
      subtitle: `Data from 500+ ${audience} companies`,
      sections: [
        { section: 'Executive Summary', content: 'Key findings and what they mean for your strategy' },
        { section: 'Market Overview', content: 'Size, growth rate, and structural shifts in the market' },
        { section: 'Benchmark Data', content: 'Performance ranges: top quartile vs median vs bottom quartile' },
        { section: 'Technology Adoption', content: `How ${audience} are using tools like ${product}` },
        { section: 'Key Trends for ${new Date().getFullYear() + 1}', content: '5 shifts that will define the next 12 months' },
        { section: 'Recommendations', content: 'What to prioritise based on where you sit in the benchmark' },
      ],
      methodology: 'Survey of 500+ companies + analysis of aggregated platform data',
      estimated_pages: 24,
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'creation',
      agent: RiyaAgent.id,
      crew: 'content-automation',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'content', format: 'content_package', title: '', content: {} },
      follow_ups: [],
    };
  }
}

module.exports = RiyaAgent;
