'use strict';

/**
 * LP Designer — Landing Page Agent
 *
 * LLM-powered landing page generator.
 * Takes a campaign brief and returns a complete page structure
 * with headlines, copy, CTAs, and trust signals.
 * Publishes a draft WordPress page if connected.
 *
 * Optional connectors: wordpress (draft page creation)
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

// ── Copywriting frameworks ────────────────────────────────────────────────────

const FRAMEWORKS = {
  lead_gen: {
    name: 'PAS (Problem → Agitate → Solve)',
    sections: ['hero', 'problem_statement', 'agitation', 'solution', 'benefits', 'social_proof', 'cta', 'faq', 'closing_cta'],
  },
  saas_trial: {
    name: 'AIDA (Attention → Interest → Desire → Action)',
    sections: ['hero', 'how_it_works', 'benefits', 'features', 'social_proof', 'pricing_teaser', 'cta', 'faq'],
  },
  ecommerce: {
    name: 'FAB (Features → Advantages → Benefits)',
    sections: ['hero', 'product_shot', 'features', 'benefits', 'social_proof', 'guarantee', 'cta', 'urgency'],
  },
  webinar: {
    name: 'Hook → Value → Urgency',
    sections: ['hero', 'what_youll_learn', 'about_speaker', 'social_proof', 'cta', 'faq', 'urgency'],
  },
  default: {
    name: 'BAB (Before → After → Bridge)',
    sections: ['hero', 'pain_points', 'transformation', 'solution', 'benefits', 'social_proof', 'cta', 'faq'],
  },
};

// ── Section builders ──────────────────────────────────────────────────────────

function buildHeroSection(product, audience, goal) {
  const outcomeMap = {
    lead_gen: `Get [your target result] without [common pain]`,
    saas_trial: `[Product] helps [audience] [achieve outcome] in [timeframe]`,
    ecommerce: `[Product]: The [superlative] way to [benefit]`,
    webinar: `Learn how [audience] can [achieve outcome] — free live training`,
    default: `Finally: a [product category] built for [audience who care about outcome]`,
  };

  return {
    section: 'hero',
    label: 'Hero / Above the Fold',
    purpose: 'Capture attention, communicate value, drive first CTA click within 5 seconds',
    elements: {
      headline: {
        primary: `[Benefit-led headline: ${outcomeMap[goal] || outcomeMap.default}]`,
        variant_a: `Stop [pain]. Start [desired state] — with ${product}.`,
        variant_b: `How ${audience || '[target audience]'} [achieve specific outcome] using ${product}`,
        notes: 'Lead with the outcome, not the product name. A/B test all 3.',
      },
      subheadline: {
        primary: `[One sentence that handles the biggest objection or adds credibility]`,
        notes: 'Should answer: "Why should I believe this?" in under 12 words.',
      },
      primary_cta: {
        text: goal === 'lead_gen' ? 'Get My Free [Resource]' : goal === 'saas_trial' ? 'Start Free Trial' : 'Shop Now',
        placement: 'Top right + below headline',
        colour_note: 'Use a colour not used elsewhere on the page. High contrast.',
      },
      trust_signals: [
        '★★★★★ [N] reviews on [platform]',
        'Used by [number] [audience type]',
        'Logos of recognisable customers',
      ],
      hero_image: `[Show outcome/transformation, not product. Person experiencing the benefit.]`,
    },
  };
}

function buildSocialProofSection(product) {
  return {
    section: 'social_proof',
    label: 'Social Proof',
    purpose: 'Remove scepticism. Shift from "is this real?" to "this is for me"',
    elements: {
      testimonials: {
        format: 'Quote + Full name + Job title/Company + Photo',
        min_count: 3,
        template: `"[Specific outcome: I went from X to Y in Z days] using ${product}. [What surprised them most]." — [Name], [Title] at [Company]`,
        notes: 'Specificity beats superlatives. "Generated $47k in 30 days" > "Amazing results".',
      },
      metrics_bar: {
        items: [
          '[Number] customers',
          '[Amount] in [outcome metric]',
          '[Time period] average result',
        ],
        placement: 'Below hero, above fold on desktop',
      },
      logo_strip: {
        label: 'Trusted by',
        notes: 'Show recognisable logos. If none, use media mentions ("As seen in…").',
      },
    },
  };
}

function buildBenefitsSection(audience, painPoints) {
  const pains = painPoints?.length > 0 ? painPoints : [
    'Too much time wasted on [manual task]',
    '[Metric] not improving despite effort',
    'Hard to [common goal] without the right tools',
  ];

  return {
    section: 'benefits',
    label: 'Benefits / Value Props',
    purpose: 'Translate features into outcomes the visitor cares about',
    elements: {
      structure: '3-4 benefit cards with icon, headline, 1-sentence explanation',
      benefits: pains.map((pain, i) => ({
        pain_addressed: pain,
        benefit_headline: `[Outcome that removes this pain]`,
        benefit_copy: `[1 sentence: How the product delivers this outcome]`,
        icon_suggestion: ['clock', 'chart-up', 'check-circle', 'star'][i % 4],
      })),
      notes: `Frame each benefit as "${audience || 'You'} will [specific verb] [specific outcome]", not "Our product has [feature]".`,
    },
  };
}

function buildCtaSection(goal, product) {
  const ctaConfig = {
    lead_gen: { primary: 'Get My Free [Resource]', secondary: 'No credit card required', form_fields: ['First name', 'Work email'] },
    saas_trial: { primary: 'Start Your Free 14-Day Trial', secondary: 'Cancel anytime. No credit card.', form_fields: ['Email'] },
    ecommerce: { primary: 'Add to Cart — [Price]', secondary: '30-day money-back guarantee', form_fields: [] },
    webinar: { primary: 'Reserve My Spot (Free)', secondary: `Only ${Math.floor(Math.random() * 20 + 5)} spots left`, form_fields: ['Name', 'Email'] },
    default: { primary: 'Get Started Free', secondary: 'No commitment required', form_fields: ['Email'] },
  };

  const config = ctaConfig[goal] || ctaConfig.default;

  return {
    section: 'cta',
    label: 'Primary Call to Action',
    purpose: 'Convert intent to action. Reduce friction to zero.',
    elements: {
      button_text: config.primary,
      microcopy: config.secondary,
      form_fields: config.form_fields,
      surrounding_copy: `Join [number] [audience] already [achieving outcome] with ${product}`,
      friction_removers: [
        config.secondary,
        'Your data is safe — we never share it',
        'Takes less than [60 seconds / 2 minutes] to get started',
      ],
      placement_note: 'Repeat CTA at 40% scroll + bottom of page. Never more than 1 scroll away.',
    },
  };
}

function buildFaqSection(product, goal) {
  const defaultFaqs = [
    { q: `How is ${product} different from [main competitor]?`, a: '[Specific differentiator — avoid "we\'re better". Cite a feature or data point.]' },
    { q: 'How long does it take to [achieve main outcome]?', a: '[Specific answer with range. E.g. "Most users see [result] within [timeframe]."]' },
    { q: 'Is there a free trial / money-back guarantee?', a: '[Answer the risk directly. De-risk the decision.]' },
    { q: 'What happens after I [CTA action]?', a: '[Describe the exact next 3 steps. Make the path concrete.]' },
    { q: 'Do I need [technical skill / prior experience]?', a: '[Reassure the majority. Address skill-level anxiety directly.]' },
  ];

  return {
    section: 'faq',
    label: 'FAQ',
    purpose: 'Handle final objections before the visitor bounces',
    elements: {
      faqs: defaultFaqs,
      notes: 'FAQs should answer real objections, not product features. Run a user interview or read support tickets to find these.',
    },
  };
}

// ── Trust signals checklist ───────────────────────────────────────────────────

function buildTrustChecklist() {
  return [
    { item: 'Customer review score + count', status: 'required', placement: 'Hero + product sections' },
    { item: 'Named customer logos or testimonials', status: 'required', placement: 'Dedicated social proof section' },
    { item: 'Money-back guarantee or free trial', status: 'required', placement: 'CTA area' },
    { item: 'Data privacy statement (GDPR/CCPA)', status: 'required', placement: 'Near email capture form' },
    { item: 'SSL / security badge', status: 'recommended', placement: 'Form and checkout area' },
    { item: 'Media mention ("As seen in…")', status: 'recommended', placement: 'Hero or social proof section' },
    { item: 'Specific result metrics ("Generated $X for Y customers")', status: 'recommended', placement: 'Hero + benefits' },
    { item: 'Video testimonial (30-90 seconds)', status: 'high impact', placement: 'Social proof section' },
  ];
}

// ── Agent ─────────────────────────────────────────────────────────────────────

class LpDesignerAgent {
  static id = 'lp-designer';
  static name = 'LP Designer';
  static role = 'Landing Page Designer Agent';
  static crews = ['landing-pages'];

  async execute(request = {}) {
    const {
      entityId,
      apiKey,
      product = 'your product',
      audience,
      goal = 'default',      // 'lead_gen' | 'saas_trial' | 'ecommerce' | 'webinar' | 'default'
      painPoints = [],
      campaignContext,
    } = request;

    if (!entityId) return this._error('entityId is required.');

    const framework = FRAMEWORKS[goal] || FRAMEWORKS.default;

    // Build each section
    const sections = {
      hero: buildHeroSection(product, audience, goal),
      benefits: buildBenefitsSection(audience, painPoints),
      social_proof: buildSocialProofSection(product),
      cta: buildCtaSection(goal, product),
      faq: buildFaqSection(product, goal),
    };

    const trustChecklist = buildTrustChecklist();
    const missingTrust = trustChecklist.filter((t) => t.status === 'required');

    const mobileNotes = [
      'Stack benefit cards vertically on mobile — do not use horizontal scroll.',
      'CTA button must be minimum 48px height and full-width on mobile.',
      'Hero headline: max 8 words on mobile to avoid truncation.',
      'Logo strip: show max 4 logos on mobile, load rest on scroll.',
      'Form: use native mobile keyboards (email input type for email fields).',
    ];

    const findings = [
      `Complete ${framework.name} landing page structure generated for "${product}".`,
      `${framework.sections.length} sections outlined with copy direction and element specifications.`,
      `${trustChecklist.length} trust signal checks: ${missingTrust.length} required elements flagged.`,
      audience ? `Page tailored for: ${audience}.` : 'No target audience specified — copy is generic. Provide audience for personalised copy.',
      painPoints.length > 0 ? `${painPoints.length} pain points incorporated into benefits section.` : 'No pain points provided — using placeholder pain points.',
    ];

    const insights = [
      'Start with the hero A/B test — it has the highest leverage (all visitors see it).',
      `Add at least 3 specific testimonials before launching — generic social proof ("Great product!") has near-zero impact.`,
      'Run a 5-second test on your hero: show the page for 5 seconds to someone unfamiliar, ask them to describe what you do. If they can\'t, rewrite the headline.',
    ];

    // ── Connector: publish draft page to WordPress ────────────────────────────
    let connectors_used  = [];
    let wp_page_url      = null;
    let wp_page_id       = null;

    if (apiKey) {
      const pageTitle   = `[Draft] ${product} Landing Page — ${goal}`;
      const pageContent = Object.values(sections).map((s) => {
        const headline = s.elements?.headline?.primary || s.elements?.button_text || s.label;
        return `<h2>${s.label}</h2><p>${headline}</p>`;
      }).join('\n');

      try {
        const wpResult = await executeComposioTool(entityId, 'wordpress', 'WORDPRESS_CREATE_POST', {
          title:      pageTitle,
          content:    pageContent,
          status:     'draft',
          post_type:  'page',
        }, apiKey);
        wp_page_url = wpResult?.data?.link || wpResult?.link || null;
        wp_page_id  = wpResult?.data?.id   || wpResult?.id   || null;
        connectors_used = ['wordpress'];
      } catch (err) {
        if (!err.message.includes('No active wordpress')) {
          console.warn('[LpDesigner] WordPress warning:', err.message);
        }
      }
    }

    const wpNote = wp_page_url
      ? `Draft page created in WordPress${wp_page_url ? ` — ${wp_page_url}` : ''}.`
      : 'Connect WordPress to auto-create a draft page from this structure.';

    const prose = `I've built a complete ${framework.name} landing page structure for "${product}"${audience ? ` targeting ${audience}` : ''}. The page covers ${framework.sections.length} sections including hero, benefits, social proof, CTA, and FAQ — each with copy direction, headline variants, and psychological rationale. Your highest-leverage move: A/B test the hero headline first. ${wpNote}`;

    return {
      prose,
      response_type: 'creation',
      agent: LpDesignerAgent.id,
      crew: 'landing-pages',
      confidence: 0.85,
      connectors_used,
      artifact: {
        type: 'content',
        format: 'landing_page',
        title: `Landing Page: ${product}`,
        metadata: {
          product,
          audience: audience || 'Not specified',
          goal,
          framework: framework.name,
          sections: framework.sections,
        },
        content: {
          page_structure:  Object.values(sections),
          trust_checklist: trustChecklist,
          mobile_notes:    mobileNotes,
          wp_page_url,
          wp_page_id,
          ab_test_priority: [
            { priority: 1, element: 'Hero headline', rationale: 'All visitors see it — highest leverage' },
            { priority: 2, element: 'Primary CTA text', rationale: 'Direct conversion driver' },
            { priority: 3, element: 'Social proof placement', rationale: 'Affects trust before CTA decision' },
          ],
          implementation_notes: [
            'Build in Unbounce, Leadpages, or Webflow for fastest iteration.',
            'Set up GA4 goal tracking before going live — you need conversion data from day 1.',
            'Connect heatmap tool (Hotjar/Microsoft Clarity) to validate scroll depth assumptions.',
            campaignContext ? `Campaign context: ${campaignContext}` : null,
          ].filter(Boolean),
        },
        findings,
        insights,
      },
      follow_ups: [
        `Write the full hero copy for "${product}"`,
        'Generate 5 CTA button text variants to A/B test',
        'Write 3 testimonial templates for our customer success team to collect',
        'Create a mobile-first wireframe description for this page',
        'Analyse our current landing page conversion rate and suggest improvements',
      ],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem generating the landing page: ${message}`,
      response_type: 'creation',
      agent: LpDesignerAgent.id,
      crew: 'landing-pages',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'content', format: 'landing_page', content: {}, findings: [message], insights: [] },
      follow_ups: [],
    };
  }
}

module.exports = LpDesignerAgent;
module.exports.default = LpDesignerAgent;
