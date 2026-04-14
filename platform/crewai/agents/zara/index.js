'use strict';

/**
 * Zara — Distribution & Social Campaign Agent
 *
 * Goals covered:
 *   run-social      → multi-platform social strategy + optional LinkedIn post publish
 *   social-calendar → 4-week content calendar with optional LinkedIn week-1 publish
 *   launch-planning → full product/campaign launch plan (multi-agent chain member)
 *
 * Connector: Composio V3 (linkedin) — optional, non-fatal
 *
 * QW5 — LinkedIn connector:
 *   When linkedin is connected via Composio, Zara publishes the first sample post
 *   (run-social) or the week-1 posts (social-calendar) to LinkedIn automatically.
 *   If linkedin is not connected, full copy is still returned for manual posting.
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

const PLATFORMS = ['LinkedIn', 'Instagram', 'X (Twitter)', 'Facebook', 'YouTube'];

class ZaraAgent {
  static id    = 'zara';
  static name  = 'Zara — Distribution & Social';
  static crews = ['social-campaign'];

  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');

    switch (request.goal_id) {
      case 'social-calendar': return this._socialCalendar(request);
      case 'launch-planning': return this._launchPlan(request);
      default:                return this._runSocial(request);
    }
  }

  // ── 1. run-social ──────────────────────────────────────────────────────────

  async _runSocial(request) {
    const {
      entityId, apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      platforms = ['LinkedIn', 'Instagram'],
      campaignGoal = 'brand_awareness',
      message,
    } = request;

    const activePlatforms = platforms.length ? platforms : ['LinkedIn', 'Instagram'];

    const platformStrategies = activePlatforms.map((platform) => ({
      platform,
      ...this._platformStrategy(platform, product, audience, campaignGoal),
    }));

    const contentMix = {
      thought_leadership: 30,
      educational_how_to: 25,
      social_proof:       20,
      behind_the_scenes:  15,
      promotional:        10,
    };

    const kpis = {
      LinkedIn:     { primary: 'engagement_rate', target: '3-5%', secondary: 'link_clicks', posting_freq: '4-5× / week' },
      Instagram:    { primary: 'reach',           target: '+20% MoM', secondary: 'saves', posting_freq: '1× / day' },
      'X (Twitter)': { primary: 'impressions',    target: '10k / week', secondary: 'profile_clicks', posting_freq: '2-3× / day' },
      Facebook:     { primary: 'page_reach',      target: '+15% MoM', secondary: 'shares', posting_freq: '1× / day' },
      YouTube:      { primary: 'watch_time',      target: '500h / month', secondary: 'subscribers', posting_freq: '1-2× / week' },
    };

    const samplePosts = activePlatforms.slice(0, 2).map((platform) =>
      this._writeSamplePost(platform, product, audience, campaignGoal)
    );

    // ── QW5: Publish first LinkedIn sample post if connector available ─────────
    let linkedinPostPublished = false;
    let linkedinPostUrn       = null;

    if (apiKey && activePlatforms.includes('LinkedIn')) {
      const linkedinPost = samplePosts.find((p) => p.platform === 'LinkedIn') || samplePosts[0];
      if (linkedinPost) {
        try {
          const result = await executeComposioTool(
            entityId, 'linkedin', 'LINKEDIN_CREATE_TEXT_POST',
            {
              text:       linkedinPost.post,
              visibility: 'PUBLIC',
            },
            apiKey
          );
          linkedinPostPublished = true;
          linkedinPostUrn       = result?.id || result?.urn || null;
        } catch (err) {
          // Non-fatal — LinkedIn not connected or post failed; strategy still returned
          if (err.message && !err.message.includes('No active linkedin')) {
            console.warn('[Zara] LinkedIn post failed (non-fatal):', err.message.slice(0, 100));
          }
        }
      }
    }

    return {
      prose: `I've built a social media strategy across ${activePlatforms.join(', ')} for the "${campaignGoal}" goal. Each platform has a tailored posting cadence, content mix, and KPI target. I've included 2 ready-to-post examples to kick off this week.${linkedinPostPublished ? ' The first LinkedIn sample post has been published.' : ''}`,
      response_type: 'creation',
      agent: ZaraAgent.id,
      crew: 'social-campaign',
      confidence: 0.86,
      connectors_used: linkedinPostPublished ? ['linkedin'] : [],
      artifact: {
        type: 'content',
        format: 'social_strategy',
        title: `Social Strategy: ${product} — ${campaignGoal}`,
        content: {
          platforms:              platformStrategies,
          content_mix_pct:        contentMix,
          sample_posts:           samplePosts,
          campaign_goal:          campaignGoal,
          kpis:                   Object.fromEntries(activePlatforms.map((p) => [p, kpis[p] || kpis.LinkedIn])),
          linkedin_post_published: linkedinPostPublished,
          linkedin_post_urn:       linkedinPostUrn,
        },
        findings: [
          `Strategy built for ${activePlatforms.length} platform${activePlatforms.length !== 1 ? 's' : ''}`,
          `Campaign goal: ${campaignGoal} — content mix weighted accordingly`,
          `Thought leadership (30%) + educational content (25%) = 55% of all posts`,
          linkedinPostPublished ? 'First LinkedIn post published — engagement data available in 24h' : 'Connect LinkedIn to publish posts automatically',
        ],
        insights: [
          'LinkedIn outperforms all other platforms for B2B lead gen — if bandwidth is limited, start here',
          'Repurpose each LinkedIn post as an Instagram carousel to double reach with minimal extra effort',
          'Post between 8-10am Tuesday-Thursday for B2B audiences on LinkedIn',
        ],
      },
      follow_ups: [
        linkedinPostPublished ? 'Check LinkedIn analytics in 24h to see reach and engagement on the first post' : 'Connect LinkedIn to publish posts directly from Marqq',
        'Build a 4-week content calendar with specific post copy',
        'Generate image or video creative for the top 3 posts',
        'Set up a social scheduling tool (Buffer, Hootsuite) to automate posting',
        `Write 5 ready-to-post LinkedIn articles on ${product}`,
      ],
    };
  }

  _platformStrategy(platform, product, audience, goal) {
    const strategies = {
      LinkedIn: {
        role: 'Primary B2B demand gen channel',
        content_types: ['Thought leadership articles', 'Data posts with charts', 'Customer quotes', 'Short-form carousels', 'Team culture posts'],
        posting_frequency: '4-5× per week',
        best_times: 'Tue-Thu 8-10am local time',
        format_priority: ['Text + image', 'Carousel PDF', 'Poll', 'Video'],
      },
      Instagram: {
        role: 'Brand awareness and visual storytelling',
        content_types: ['Product screenshots', 'Quote graphics', 'Behind the scenes', 'Reels (30-60s)', 'UGC reposts'],
        posting_frequency: '1× per day',
        best_times: '11am-1pm, 7-9pm',
        format_priority: ['Reel', 'Carousel', 'Single image', 'Story'],
      },
      'X (Twitter)': {
        role: 'Real-time engagement and thought leadership',
        content_types: ['Quick insights', 'Industry commentary', 'Thread breakdowns', 'Polls', 'Reply conversations'],
        posting_frequency: '2-3× per day',
        best_times: '8am, 12pm, 5pm',
        format_priority: ['Thread', 'Single tweet', 'Poll', 'Image tweet'],
      },
      Facebook: {
        role: 'Community and retargeting',
        content_types: ['Long-form posts', 'Video', 'Group engagement', 'Event promotion', 'Customer stories'],
        posting_frequency: '1× per day',
        best_times: '1-4pm weekdays',
        format_priority: ['Video', 'Image', 'Link post', 'Story'],
      },
      YouTube: {
        role: 'Long-form education and SEO',
        content_types: ['How-to tutorials', 'Product demos', 'Customer case studies', 'Webinar recordings', 'Thought leadership interviews'],
        posting_frequency: '1-2× per week',
        best_times: 'Friday-Saturday 12-3pm',
        format_priority: ['Tutorial (8-15 min)', 'Shorts (< 60s)', 'Webinar recording'],
      },
    };
    return strategies[platform] || strategies.LinkedIn;
  }

  _writeSamplePost(platform, product, audience, goal) {
    const hooks = {
      brand_awareness: `Most ${audience} don't realise this about their strategy:`,
      lead_gen:        `We helped a ${audience.split(' ')[0]} team go from 50 to 500 qualified leads in 90 days. Here is what changed:`,
      conversion:      `Why are conversion rates down across the board? We analysed 200 campaigns and found 3 patterns:`,
      retention:       `The number 1 reason customers churn isn't price. It's this:`,
    };

    const hook = hooks[goal] || hooks.brand_awareness;

    return {
      platform,
      post: `${hook}\n\nMost teams focus on the wrong lever entirely. They optimise the thing they can measure easily — not the thing that actually drives the outcome.\n\nHere is the framework we use at ${product}:\n\n1. Identify the constraint (not the symptom)\n2. Fix the root cause before adding volume\n3. Measure the leading indicator, not the lagging one\n\nThis sounds obvious. Almost nobody does it.\n\nWhat is the biggest lever you are currently under-investing in?\n\n#B2BMarketing #${product.replace(/\s+/g, '')} #GrowthStrategy`,
      character_count: 450,
      hook_type: goal,
      cta: 'Comment below or DM me',
      estimated_reach: platform === 'LinkedIn' ? '2k-8k' : '500-2k',
    };
  }

  // ── 2. social-calendar ───────────────────────────────────────────────────

  async _socialCalendar(request) {
    const {
      entityId, apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      platforms = ['LinkedIn'],
      weeks = 4,
    } = request;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (1 - startDate.getDay() + 7) % 7 || 7); // next Monday

    const themes = [
      'Awareness & Education',
      'Social Proof & Trust',
      'Product Value & Features',
      'Community & Engagement',
    ];

    const contentTypes = [
      { type: 'thought_leadership', format: 'Text post', effort: 'low' },
      { type: 'how_to',            format: 'Carousel', effort: 'medium' },
      { type: 'social_proof',      format: 'Quote graphic', effort: 'low' },
      { type: 'educational',       format: 'Thread', effort: 'medium' },
      { type: 'promotional',       format: 'Image post', effort: 'low' },
    ];

    const calendar = [];
    const platform = platforms[0] || 'LinkedIn';
    const postsPerWeek = platform === 'LinkedIn' ? 5 : platform === 'Instagram' ? 7 : 5;

    for (let w = 0; w < Math.min(weeks, 4); w++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + w * 7);
      const theme = themes[w % themes.length];

      const weekPosts = [];
      for (let d = 0; d < postsPerWeek; d++) {
        const postDate = new Date(weekStart);
        postDate.setDate(weekStart.getDate() + d);
        const ct = contentTypes[d % contentTypes.length];

        weekPosts.push({
          date:         postDate.toISOString().split('T')[0],
          day:          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][postDate.getDay() === 0 ? 6 : postDate.getDay() - 1],
          platform,
          theme,
          content_type: ct.type,
          format:       ct.format,
          topic:        this._calendarTopic(ct.type, product, audience, theme),
          post_copy:    this._calendarPost(ct.type, product, audience),
          hashtags:     this._hashtags(ct.type, product),
          effort:       ct.effort,
          status:       'draft',
        });
      }

      calendar.push({
        week:       w + 1,
        week_start: weekStart.toISOString().split('T')[0],
        theme,
        post_count: weekPosts.length,
        posts:      weekPosts,
      });
    }

    const totalPosts = calendar.reduce((s, w) => s + w.post_count, 0);

    // ── QW5: Publish week-1 posts to LinkedIn if connector available ──────────
    let linkedinPublishedCount = 0;
    const linkedinPublishedUrns = [];

    if (apiKey && platform === 'LinkedIn' && calendar[0]) {
      const week1Posts = calendar[0].posts.slice(0, 2); // publish first 2 posts of week 1
      for (const post of week1Posts) {
        try {
          const result = await executeComposioTool(
            entityId, 'linkedin', 'LINKEDIN_CREATE_TEXT_POST',
            {
              text:       `${post.post_copy}\n\n${post.hashtags.join(' ')}`,
              visibility: 'PUBLIC',
            },
            apiKey
          );
          linkedinPublishedCount++;
          if (result?.id || result?.urn) linkedinPublishedUrns.push(result?.id || result?.urn);
          // Mark post as published in calendar
          post.status = 'published';
        } catch (err) {
          if (err.message && !err.message.includes('No active linkedin')) {
            console.warn('[Zara] LinkedIn calendar post failed (non-fatal):', err.message.slice(0, 100));
          }
          break; // Stop trying if connector fails
        }
      }
    }

    const connectorsUsed = linkedinPublishedCount > 0 ? ['linkedin'] : [];

    return {
      prose: `I've built a ${weeks}-week social calendar for ${platform} with ${totalPosts} ready-to-post entries. Each week has a clear theme (${themes.slice(0, weeks).join(' → ')}) to create a narrative arc across the month. Every post includes copy, hashtags, and format guidance.${linkedinPublishedCount > 0 ? ` ${linkedinPublishedCount} week-1 post${linkedinPublishedCount !== 1 ? 's' : ''} published to LinkedIn.` : ''}`,
      response_type: 'creation',
      agent: ZaraAgent.id,
      crew: 'social-campaign',
      confidence: 0.88,
      connectors_used: connectorsUsed,
      artifact: {
        type: 'content',
        format: 'social_calendar',
        title: `${weeks}-Week Social Calendar: ${platform}`,
        content: {
          calendar,
          total_posts:              totalPosts,
          platform,
          weekly_themes:            themes.slice(0, weeks),
          posting_frequency:        `${postsPerWeek} posts / week`,
          linkedin_published_count: linkedinPublishedCount,
          linkedin_published_urns:  linkedinPublishedUrns,
        },
        findings: [
          `${totalPosts} posts planned across ${weeks} weeks`,
          `Platform: ${platform} — ${postsPerWeek} posts/week cadence`,
          `Themes rotate to build a complete brand narrative`,
          linkedinPublishedCount > 0
            ? `${linkedinPublishedCount} week-1 post${linkedinPublishedCount !== 1 ? 's' : ''} published live to LinkedIn`
            : 'Connect LinkedIn to publish posts automatically from the calendar',
        ],
        insights: [
          'Batch-create all posts in one session on Monday — schedule via Buffer or LinkedIn native scheduler',
          'Engagement posts (questions, polls) on Wednesdays consistently outperform other days',
          'Save top-performing posts and repurpose them 8-10 weeks later with a fresh angle',
        ],
      },
      follow_ups: [
        linkedinPublishedCount > 0
          ? `Check LinkedIn analytics in 24-48h for reach data on the ${linkedinPublishedCount} published posts`
          : 'Connect LinkedIn to publish posts automatically from the calendar',
        'Generate image assets for the carousel posts in this calendar',
        'Set up Buffer or Hootsuite to schedule all posts automatically',
        'Write 3 LinkedIn articles to anchor the thought leadership weeks',
        'Build a tracking sheet to measure engagement vs benchmarks',
      ],
    };
  }

  _calendarTopic(type, product, audience, theme) {
    const topics = {
      thought_leadership: `An unpopular truth about ${audience} strategy`,
      how_to:             `How to set up ${product} in under 30 minutes`,
      social_proof:       `What our customers say about ${product}`,
      educational:        `3 things most ${audience} teams get wrong`,
      promotional:        `Why we built ${product} — and what is coming next`,
    };
    return topics[type] || `${theme} — ${product}`;
  }

  _calendarPost(type, product, audience) {
    const posts = {
      thought_leadership: `Here is a counterintuitive take on ${audience} growth:\n\nThe teams that grow fastest are not doing more. They are doing fewer things — with more discipline.\n\nMost teams chase the next channel or tactic before mastering the current one. The compounding happens in the depth, not the breadth.\n\nWhat is the one thing you wish your team would go deeper on?`,
      how_to: `Step-by-step: how to get ${product} running in under 30 minutes.\n\n1. Connect your primary data source\n2. Define your top 3 KPIs\n3. Set your weekly review cadence\n4. Configure your first alert\n\nMost teams are live within a working day. No engineering required.\n\nWant a walkthrough? Drop a comment.`,
      social_proof: `"We cut our reporting time from 4 hours to 20 minutes with ${product}."\n\n— Growth Lead at a Series B SaaS company\n\nTime you spend on reporting is time you are not spending on strategy. That is the trade-off most teams do not realise they are making.`,
      educational: `3 things ${audience} teams consistently underinvest in:\n\n1. Leading indicators (vs lagging metrics)\n2. Audience definition (too broad = too expensive)\n3. Speed of experimentation (waiting 30 days to declare a winner)\n\nWhich one is your biggest gap right now?`,
      promotional: `We launched something new in ${product} this week.\n\nIf you have been waiting to make your reporting more actionable — this is the moment.\n\nLink in comments.`,
    };
    return posts[type] || `Content from ${product} for ${audience}.`;
  }

  _hashtags(type, product) {
    const tag = product.replace(/\s+/g, '');
    const base = [`#${tag}`, '#B2BMarketing', '#MarketingStrategy'];
    const extra = {
      thought_leadership: ['#Leadership', '#GrowthMindset'],
      how_to:             ['#ProductTips', '#Tutorial'],
      social_proof:       ['#CustomerSuccess', '#SocialProof'],
      educational:        ['#MarketingTips', '#GrowthHacking'],
      promotional:        ['#ProductUpdate', '#SaaS'],
    };
    return [...base, ...(extra[type] || [])];
  }

  // ── 3. launch-planning ─────────────────────────────────────────────────────

  _launchPlan(request) {
    const {
      product = 'your product',
      audience = 'B2B marketing teams',
      message,
      context = {},
    } = request;

    // When used as chain member, incorporate prior agent outputs
    const priorStrategy = context.prior_outputs?.neel?.artifact?.content?.positioning_statement || '';

    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() + 30);
    const launchDateStr = launchDate.toISOString().split('T')[0];

    const phases = [
      {
        phase: 'Pre-launch (weeks 1-2)',
        goal: 'Build anticipation and prime the audience',
        activities: [
          'Publish 2 teaser articles on core pain point without naming the solution',
          'Run a LinkedIn poll: "What is your biggest challenge with [category]?"',
          'Email existing list with early access opportunity',
          'Brief 5 key customers/partners for launch-day testimonials',
          'Set up launch landing page with waitlist capture',
        ],
        channels:   ['LinkedIn', 'Email', 'Landing page'],
        kpi:        'Waitlist sign-ups — target 200+',
      },
      {
        phase: 'Launch week',
        goal: 'Maximum reach and conversion in 7 days',
        activities: [
          `Publish launch post on LinkedIn — "${product} is live. Here is what we built and why."`,
          'Email waitlist and existing customers with launch announcement',
          'Run paid LinkedIn + Google ads targeting ICP for 7 days',
          'Get 3 partners to co-post or share the launch',
          'PR: submit to Product Hunt, relevant newsletters, industry blogs',
          'Host a live demo/webinar for waitlist sign-ups',
        ],
        channels:   ['LinkedIn', 'Email', 'Paid ads', 'PR', 'Product Hunt'],
        kpi:        'New sign-ups — target 500+ in launch week',
      },
      {
        phase: 'Post-launch (weeks 3-4)',
        goal: 'Convert interest into activated users',
        activities: [
          'Publish a "first 100 customers" learnings post',
          'Share 3 customer results/quotes as social proof',
          'Send onboarding email sequence to all sign-ups (days 1, 3, 7)',
          'Retarget website visitors who did not convert with testimonial ads',
          'Collect and publish first case study',
        ],
        channels:   ['LinkedIn', 'Email', 'Retargeting ads'],
        kpi:        'Activation rate — target 40%+ of sign-ups complete core action',
      },
    ];

    const distributionPlan = {
      owned:   ['Email list', 'LinkedIn company page', 'Blog', 'Waitlist'],
      earned:  ['PR coverage', 'Partner shares', 'Customer testimonials', 'Product Hunt'],
      paid:    ['LinkedIn Ads (ICP-targeted)', 'Google Search (brand + category)', 'Retargeting'],
    };

    return {
      prose: `I've built a 30-day launch plan for ${product} targeting ${audience}. The plan runs in 3 phases: pre-launch (days 1-14), launch week, and post-launch consolidation. Target: 500+ sign-ups in launch week, 40%+ activation rate by day 30.${priorStrategy ? ` Aligned to the positioning: "${priorStrategy.slice(0, 100)}..."` : ''}`,
      response_type: 'creation',
      agent: ZaraAgent.id,
      crew: 'social-campaign',
      confidence: 0.85,
      connectors_used: [],
      artifact: {
        type: 'content',
        format: 'launch_plan',
        title: `Launch Plan: ${product}`,
        content: {
          launch_date:       launchDateStr,
          target_audience:   audience,
          phases,
          distribution_plan: distributionPlan,
          success_metrics: {
            waitlist_target:     200,
            launch_week_signups: 500,
            activation_rate_pct: 40,
            week1_pr_hits:       3,
          },
        },
        findings: [
          `30-day launch plan with 3 phases and ${phases.reduce((s, p) => s + p.activities.length, 0)} specific activities`,
          `Distribution: owned + earned + paid channels activated in parallel`,
          `Launch date target: ${launchDateStr}`,
        ],
        insights: [
          'The biggest launch mistake is going wide before going deep — nail your first 50 customers before scaling spend',
          'Product Hunt works best on Tuesday mornings PST — time your launch post accordingly',
          'Email consistently outperforms social for launch day conversions in B2B — prioritise the list',
        ],
      },
      follow_ups: [
        'Write the launch announcement post for LinkedIn',
        'Build the launch landing page copy',
        'Create the waitlist nurture email sequence',
        'Set up the paid ad campaigns for launch week',
        'Draft the Product Hunt description and first comment',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'creation',
      agent: ZaraAgent.id,
      crew: 'social-campaign',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'content', format: 'social_strategy', title: '', content: {} },
      follow_ups: [],
    };
  }
}

module.exports = ZaraAgent;
