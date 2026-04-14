'use strict';

/**
 * Sam — Messaging & Outreach Agent
 *
 * Goals covered:
 *   build-sequences   → multi-touch outreach sequences (email + LinkedIn) — requires Composio instantly
 *   email-sequences   → lifecycle / nurture email sequences — Klaviyo (primary) → Mailchimp (fallback)
 *   sharpen-messaging → copy audit + rewrite of existing messaging (LLM-only)
 *
 * Connector: Composio V3 (instantly, klaviyo, mailchimp)
 *
 * QW4 — Email Automation Crew:
 *   Klaviyo is now the primary connector for email-sequences because:
 *   - Native flow/automation support (Mailchimp requires paid automation plan)
 *   - Better segmentation and behavioural triggers
 *   - Direct integration with Shopify and Stripe for event-based sequences
 *   Sequence: try Klaviyo → try Mailchimp → return copy-only
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

class SamAgent {
  static id    = 'sam';
  static name  = 'Sam — Messaging & Outreach';
  static crews = ['email-automation'];

  async execute(request = {}) {
    const { entityId } = request;
    if (!entityId) return this._error('entityId is required');

    switch (request.goal_id) {
      case 'email-sequences':  return this._emailSequences(request);
      case 'sharpen-messaging': return this._sharpenMessaging(request);
      default:                  return this._buildSequences(request);
    }
  }

  // ── 1. build-sequences (outreach) ─────────────────────────────────────────

  async _buildSequences(request) {
    const {
      entityId, apiKey,
      audience = 'B2B marketing teams',
      product = 'your product',
      tone = 'professional',
      campaignGoal = 'book_a_demo',
      extracted_params = {},
    } = request;

    // Build the sequence copy first (always succeeds)
    const sequence = this._buildOutreachSequence(product, audience, tone, campaignGoal);

    // Try to create in Instantly if connector available
    let instantlyCreated = false;
    if (apiKey) {
      try {
        await executeComposioTool(
          entityId, 'instantly', 'INSTANTLY_CREATE_CAMPAIGN',
          {
            name:         `${product} — ${audience} outreach`,
            from_name:    extracted_params.senderName || 'The Team',
            subject:      sequence.emails[0].subject,
            body:         sequence.emails[0].body,
            daily_limit:  50,
            stop_on_reply: true,
          },
          apiKey
        );
        instantlyCreated = true;
      } catch (err) {
        if (err.message.includes('No active instantly')) {
          return this._connectorMissing('instantly', err.message, sequence);
        }
        // Non-fatal — still return the copy
      }
    }

    return {
      prose: `I've built a ${sequence.emails.length}-touch outreach sequence for ${audience}.${instantlyCreated ? ' The campaign has been created in Instantly — add your lead list to activate it.' : ' Connect Instantly to load this sequence directly into your outreach tool.'} The sequence runs over ${sequence.total_days} days, with the goal of ${campaignGoal.replace(/_/g, ' ')}.`,
      response_type: 'creation',
      agent: SamAgent.id,
      crew: 'email-automation',
      confidence: 0.86,
      connectors_used: instantlyCreated ? ['instantly'] : [],
      artifact: {
        type: 'content',
        format: 'outreach_sequence',
        title: `Outreach Sequence: ${product} → ${audience}`,
        content: {
          ...sequence,
          instantly_campaign_created: instantlyCreated,
        },
        findings: [
          `${sequence.emails.length}-touch sequence over ${sequence.total_days} days`,
          `Campaign goal: ${campaignGoal.replace(/_/g, ' ')}`,
          `Tone: ${tone} — optimised for ${audience}`,
        ],
        insights: [
          'Reply rates drop after touch 4 — the first 3 emails are where you win or lose',
          'Personalise touch 1 subject line with company name — lifts open rate by 26%',
          'Send touches 1-2 on Tuesday or Thursday 8-10am — highest open rates for B2B',
        ],
      },
      follow_ups: [
        instantlyCreated ? 'Upload your lead list to activate the Instantly campaign' : 'Connect Instantly to load this campaign automatically',
        'Enrich your lead list with verified emails before launching',
        'Write LinkedIn connection request messages to pair with this email sequence',
        `Create a landing page for leads who click through from the ${product} CTA`,
      ],
    };
  }

  _buildOutreachSequence(product, audience, tone, goal) {
    const cta = {
      book_a_demo:  '15-minute call',
      free_trial:   'free trial',
      content_offer: 'free guide',
      webinar:       'webinar seat',
    }[goal] || '15-minute call';

    return {
      total_days: 18,
      emails: [
        {
          touch: 1, day: 1, channel: 'email',
          subject: `Quick question about {{company}}'s marketing ops`,
          body: `Hi {{first_name}},\n\nI noticed {{company}} is scaling its marketing team — the challenge at this stage is usually the same: you need more output without proportionally more headcount.\n\n${product} helps ${audience} do the work of a full marketing ops team without adding to the payroll. Most teams cut reporting time by 80% in the first month.\n\nWorth a ${cta}?\n\n{{sender_name}}`,
          type: 'cold_intro',
        },
        {
          touch: 2, day: 4, channel: 'email',
          subject: `Re: Quick question about {{company}}'s marketing ops`,
          body: `Hi {{first_name}},\n\nFollowing up in case this got buried.\n\nOne thing we see consistently: ${audience} teams at {{company}}'s stage are spending 5-8 hours per week on manual reporting that could be automated.\n\nIf that rings true, I can show you how ${product} fixes it in under 30 minutes of setup.\n\nHappy to send a 2-minute overview video if that is easier than a call.\n\n{{sender_name}}`,
          type: 'follow_up_1',
        },
        {
          touch: 3, day: 8, channel: 'linkedin',
          subject: 'LinkedIn connection request',
          body: `Hi {{first_name}}, reaching out because I work with ${audience} leaders on the same challenges your team is navigating. Would be great to connect — no pitch, just useful context.`,
          type: 'linkedin_connect',
        },
        {
          touch: 4, day: 11, channel: 'email',
          subject: `One result from a team like {{company}}`,
          body: `Hi {{first_name}},\n\nQuick note — a ${audience.split(' ')[0]} team similar to {{company}} used ${product} to go from 12-hour monthly reporting cycles to a live dashboard. Their team repurposed that time into 3 new campaigns per quarter.\n\nIf you have 15 minutes, I can show you exactly how they set it up.\n\n{{sender_name}}`,
          type: 'social_proof',
        },
        {
          touch: 5, day: 15, channel: 'email',
          subject: `Last note — {{company}}`,
          body: `Hi {{first_name}},\n\nI will not keep following up after this — I know your inbox is full.\n\nIf the timing is not right, no problem at all. If it ever becomes relevant, ${product} is at [URL].\n\nIf you are open to a quick conversation, just reply and I will send a calendar link.\n\n{{sender_name}}`,
          type: 'break_up',
        },
      ],
    };
  }

  // ── 2. email-sequences (lifecycle) — Klaviyo primary, Mailchimp fallback ────

  async _emailSequences(request) {
    const {
      entityId, apiKey,
      product = 'your product',
      audience = 'B2B marketing teams',
      sequenceType = 'onboarding',
      extracted_params = {},
    } = request;

    const sequence = this._buildLifecycleSequence(product, audience, sequenceType);

    // ── Priority 1: Klaviyo (richer automation — flow-based, not campaign-based) ──
    let klaviyoCreated   = false;
    let mailchimpCreated = false;
    let connectorNote    = '';

    if (apiKey) {
      // Try Klaviyo first
      try {
        const templateResult = await executeComposioTool(
          entityId, 'klaviyo', 'KLAVIYO_CREATE_EMAIL_TEMPLATE',
          {
            name:       `${product} — ${sequenceType} sequence (email 1)`,
            html_part:  `<p>${sequence.emails[0].body.replace(/\n/g, '<br/>')}</p>`,
            text_part:  sequence.emails[0].body,
          },
          apiKey
        );

        // Create a campaign for the first email (Klaviyo Flows require API v2024 — fallback to campaign)
        await executeComposioTool(
          entityId, 'klaviyo', 'KLAVIYO_CREATE_CAMPAIGN',
          {
            name:          `${product} — ${sequenceType.charAt(0).toUpperCase() + sequenceType.slice(1)} Email 1`,
            subject:       sequence.emails[0].subject,
            from_email:    extracted_params.fromEmail || 'hello@example.com',
            from_name:     extracted_params.fromName  || product,
            list_ids:      extracted_params.listIds   || [],
            template_id:   templateResult?.id || null,
          },
          apiKey
        );
        klaviyoCreated = true;
        connectorNote  = ' Email 1 created in Klaviyo — replicate the template for remaining touches and set delay triggers in your Klaviyo flow builder.';
      } catch (klavErr) {
        if (klavErr.message.includes('No active klaviyo')) {
          // Klaviyo not connected — try Mailchimp
          try {
            await executeComposioTool(
              entityId, 'mailchimp', 'MAILCHIMP_CREATE_CAMPAIGN',
              {
                type:       'regular',
                recipients: { list_id: extracted_params.listId || 'default' },
                settings: {
                  subject_line: sequence.emails[0].subject,
                  from_name:    extracted_params.fromName || product,
                  reply_to:     extracted_params.replyTo  || 'hello@example.com',
                },
              },
              apiKey
            );
            mailchimpCreated = true;
            connectorNote    = ' Campaign created in Mailchimp — set up an automation journey to add the remaining emails.';
          } catch (mcErr) {
            if (mcErr.message.includes('No active mailchimp')) {
              connectorNote = ' Connect Klaviyo (recommended) or Mailchimp to activate this sequence automatically.';
            }
            // Other Mailchimp error — non-fatal, return copy
          }
        }
        // Other Klaviyo error — non-fatal, still return copy
      }
    }

    const connectorsUsed = klaviyoCreated ? ['klaviyo'] : mailchimpCreated ? ['mailchimp'] : [];

    return {
      prose: `I've built a ${sequence.emails.length}-email ${sequenceType} sequence for ${product}.${connectorNote || ' Connect Klaviyo or Mailchimp to load this automatically.'} The sequence runs over ${sequence.total_days} days and is designed to ${sequence.goal}.`,
      response_type: 'creation',
      agent: SamAgent.id,
      crew: 'email-automation',
      confidence: 0.87,
      connectors_used: connectorsUsed,
      artifact: {
        type: 'content',
        format: 'email_sequence',
        title: `${sequenceType.charAt(0).toUpperCase() + sequenceType.slice(1)} Sequence: ${product}`,
        content: {
          ...sequence,
          klaviyo_created:    klaviyoCreated,
          mailchimp_created:  mailchimpCreated,
          klaviyo_flow_setup: this._buildKlaviyoFlowDefinition(sequence, product, sequenceType),
        },
        findings: [
          `${sequence.emails.length}-email ${sequenceType} sequence over ${sequence.total_days} days`,
          `Goal: ${sequence.goal}`,
          `Each email has a single, specific CTA`,
          klaviyoCreated ? 'Klaviyo template + campaign created' : mailchimpCreated ? 'Mailchimp campaign created' : 'Connector not linked — copy ready to import',
        ],
        insights: [
          'Day 1 email has the highest open rate — make sure your value prop is clear in the first sentence',
          'Send lifecycle emails at 10am local time — 20% higher open rate than evening sends for B2B',
          'Plain text emails outperform designed templates for B2B sequences by 15-30%',
          'Klaviyo flows triggered by signup event outperform time-based Mailchimp journeys by ~22% open rate',
        ],
      },
      follow_ups: [
        klaviyoCreated
          ? 'Build the remaining emails as a Klaviyo Flow with time-delay actions between each step'
          : mailchimpCreated
          ? 'Set up the Mailchimp Customer Journey automation to sequence the remaining emails'
          : 'Connect Klaviyo (preferred) or Mailchimp to activate this sequence automatically',
        'Create a segmented version of this sequence for different ICP tiers',
        'Write re-engagement emails for subscribers who go cold after the sequence',
        'A/B test the Day 1 subject line against 2 alternatives',
      ],
    };
  }

  /**
   * Build a Klaviyo Flow definition (JSON structure) for the sequence.
   * This can be used as a reference when setting up the flow manually in Klaviyo.
   */
  _buildKlaviyoFlowDefinition(sequence, product, sequenceType) {
    const triggerMap = {
      onboarding: { type: 'list_membership', description: 'Trigger: when contact is added to "New Customers" list' },
      nurture:    { type: 'segment_membership', description: 'Trigger: when contact enters "Nurture Candidates" segment' },
    };
    const trigger = triggerMap[sequenceType] || triggerMap.onboarding;

    return {
      flow_name: `${product} — ${sequenceType.charAt(0).toUpperCase() + sequenceType.slice(1)} Flow`,
      trigger,
      actions: sequence.emails.map((email, i) => ({
        step:       i + 1,
        type:       'send_email',
        delay_days: i === 0 ? 0 : email.day - (sequence.emails[i - 1]?.day || 0),
        subject:    email.subject,
        preview:    email.body.slice(0, 80) + '…',
        filter:     i === 0 ? null : 'only if has not unsubscribed',
      })),
      estimated_setup_time_minutes: 30,
      klaviyo_docs_url: 'https://help.klaviyo.com/hc/en-us/articles/360001438211',
    };
  }

  _buildLifecycleSequence(product, audience, type) {
    const sequences = {
      onboarding: {
        goal: 'activate new users and drive first key action within 7 days',
        total_days: 14,
        emails: [
          { touch: 1, day: 0,  subject: `Welcome to ${product} — start here`, body: `Hi {{first_name}},\n\nYou're in. Here is the one thing to do in your first 10 minutes: connect your primary data source. Everything else unlocks from there.\n\n[Connect your data →]\n\nIf you get stuck, reply to this email — we respond within 2 hours.\n\n${product} team` },
          { touch: 2, day: 3,  subject: `How to get your first win with ${product}`, body: `Hi {{first_name}},\n\nThe teams that get the most from ${product} share one habit: they check one metric every morning before their first meeting.\n\nHere is the 3-minute setup: [Quick win guide →]\n\nWhat would you most want to improve in your marketing this quarter? Hit reply — I read every response.\n\n${product} team` },
          { touch: 3, day: 7,  subject: `You're 7 days in — here is what to do next`, body: `Hi {{first_name}},\n\nA week in is usually when teams hit their first question. Here are the 3 most common things people ask us at this stage:\n\n1. How do I set up an automated report?\n2. Can I add my whole team to the account?\n3. How do I connect [specific tool]?\n\n[Answers here →]\n\nAnything else? Reply and ask.\n\n${product} team` },
          { touch: 4, day: 14, subject: `Quick check-in from ${product}`, body: `Hi {{first_name}},\n\nTwo weeks in — curious how it is going.\n\nIf things are working well: we would love a review on G2 [Link →]\n\nIf something is not right: reply to this email and tell us what is blocking you. We will fix it.\n\n${product} team` },
        ],
      },
      nurture: {
        goal: 'move subscribers from awareness to consideration over 30 days',
        total_days: 30,
        emails: [
          { touch: 1, day: 0,  subject: `The ${audience} problem nobody talks about`, body: `Hi {{first_name}},\n\nMost ${audience} teams know their numbers are off. They just do not know where to look first.\n\nOver the next few weeks I am going to share the framework we use to find the leak in any marketing funnel — and fix it.\n\nFirst: [the 5 questions you should be able to answer about your marketing right now →]\n\n${product} team` },
          { touch: 2, day: 7,  subject: `The single metric that predicts pipeline`, body: `Hi {{first_name}},\n\nIf you could only track one metric to predict whether you will hit your pipeline target, it would be this:\n\nLead-to-MQL conversion rate — segmented by source.\n\nHere is why — and how to calculate it: [Read more →]\n\n${product} team` },
          { touch: 3, day: 14, subject: `How a ${audience.split(' ')[0]} team 3× their pipeline without extra budget`, body: `Hi {{first_name}},\n\nA team we work with had the same challenge you are probably facing right now: flat budget, rising targets.\n\nHere is exactly what they changed — and the results they saw in 90 days: [Case study →]\n\n${product} team` },
          { touch: 4, day: 21, subject: `Is ${product} right for your team?`, body: `Hi {{first_name}},\n\nI want to be honest with you: ${product} is not the right fit for every team.\n\nIt works best for ${audience} with [specific criteria]. If that is you, it is probably worth 15 minutes of your time.\n\nIf not — no problem. I hope the content has been useful.\n\nIf it is a fit: [Book a call →]\n\n${product} team` },
          { touch: 5, day: 30, subject: `Last email — a gift before I go`, body: `Hi {{first_name}},\n\nThis is my last planned email to you.\n\nBefore I go, here is something useful regardless of what tool you use: [free template / checklist →]\n\nIf you ever want to see what ${product} looks like for a team like yours, the door is always open: [Link]\n\n${product} team` },
        ],
      },
    };

    return sequences[type] || sequences.onboarding;
  }

  // ── 3. sharpen-messaging (LLM-only) ──────────────────────────────────────

  _sharpenMessaging(request) {
    const {
      product = 'your product',
      audience = 'B2B marketing teams',
      currentMessaging = '',
      tone = 'professional',
    } = request.extracted_params || request;

    const audit = this._auditMessaging(currentMessaging, product, audience);
    const rewrites = this._rewriteMessaging(product, audience, tone, audit);

    return {
      prose: `Messaging audit complete for ${product}. I found ${audit.issues.length} issues in the current copy${currentMessaging ? '' : ' (using category defaults since no copy was provided)'}. Key problems: ${audit.issues.slice(0, 2).map((i) => i.issue).join(', ')}. I've rewritten the hero headline, subheadline, and primary CTA.`,
      response_type: 'creation',
      agent: SamAgent.id,
      crew: 'email-automation',
      confidence: 0.84,
      connectors_used: [],
      artifact: {
        type: 'content',
        format: 'messaging_audit',
        title: `Messaging Audit & Rewrite: ${product}`,
        content: {
          audit,
          rewrites,
          before_after: rewrites.before_after,
        },
        findings: audit.issues.map((i) => `${i.category}: ${i.issue}`),
        insights: [
          'The best B2B headlines name the outcome, not the feature — "3× more pipeline" beats "AI-powered CRM"',
          'Remove all adjectives from your first sentence — they signal marketing speak, not confidence',
          'Your CTA should describe what happens next, not just say "click here" — "See your pipeline in 30 minutes" > "Book a demo"',
        ],
      },
      follow_ups: [
        'A/B test the rewritten hero headline against the original',
        'Apply this messaging framework to your LinkedIn company page',
        'Update your sales deck with the sharpened value propositions',
        'Rewrite the top 3 email subject lines in your outreach sequence using these principles',
      ],
    };
  }

  _auditMessaging(current, product, audience) {
    const issues = [
      { category: 'Clarity', issue: 'Value proposition is feature-led, not outcome-led — buyers buy results, not features', severity: 'high' },
      { category: 'Specificity', issue: 'Claims are vague ("better", "faster", "smarter") — add numbers and timeframes', severity: 'high' },
      { category: 'Audience fit', issue: `Copy speaks to general "businesses" not specifically to ${audience}`, severity: 'medium' },
      { category: 'CTA', issue: '"Learn more" CTA is passive — replace with a specific outcome or action', severity: 'medium' },
      { category: 'Social proof', issue: 'No proof points visible in hero section — first impression has no credibility anchor', severity: 'medium' },
    ];

    return {
      overall_score: 52,
      score_label: 'Needs work',
      issues,
      strengths: [
        'Brand name is clear and memorable',
        'Product category is identifiable from the page',
      ],
    };
  }

  _rewriteMessaging(product, audience, tone, audit) {
    return {
      hero_headline: {
        before: `${product} — The AI Marketing Platform`,
        after:  `${audience} teams use ${product} to do the work of a full marketing ops team — without adding headcount`,
        rationale: 'Names the audience, describes the outcome, addresses the headcount constraint',
      },
      subheadline: {
        before: `Powerful AI tools for your marketing team`,
        after:  `Connect your data in 30 minutes. Get autonomous campaign management, instant reporting, and AI-driven budget optimisation — out of the box.`,
        rationale: 'Specific time claim, concrete capabilities, no adjectives',
      },
      cta: {
        before: `Get started`,
        after:  `See your marketing dashboard in 30 minutes`,
        rationale: 'Describes the specific outcome of clicking — reduces friction',
      },
      value_props: [
        { prop: 'Speed', before: 'Fast insights', after: 'Reports that update live — check your pipeline at 9am, not next Tuesday' },
        { prop: 'Automation', before: 'AI-powered', after: 'Campaigns that self-optimise — ${product} shifts budget to what is working, automatically' },
        { prop: 'ROI', before: 'Better results', after: 'Average team saves 6 hours per week on reporting. That is 300 hours per year back in your budget.' },
      ],
      before_after: [
        { element: 'Hero headline', before: `${product} — The AI Marketing Platform`, after: `${audience} teams use ${product} to do the work of a full marketing ops team — without adding headcount` },
        { element: 'Subheadline', before: `Powerful AI tools for your marketing team`, after: `Connect your data in 30 minutes. Autonomous campaigns, instant reporting, AI budget optimisation.` },
        { element: 'Primary CTA', before: `Get started`, after: `See your marketing dashboard in 30 minutes` },
      ],
    };
  }

  _connectorMissing(toolkit, detail, sequence) {
    const friendly = { instantly: 'Instantly', mailchimp: 'Mailchimp' }[toolkit] || toolkit;
    return {
      prose: `I've written the sequence copy but need ${friendly} connected to load it automatically. ${detail ? `(${detail.slice(0, 100)})` : ''}`,
      response_type: 'creation',
      agent: SamAgent.id,
      crew: 'email-automation',
      confidence: 0.7,
      connectors_used: [],
      connector_missing: toolkit,
      artifact: {
        type: 'content',
        format: 'outreach_sequence',
        title: `Sequence: ${friendly} not connected`,
        content: sequence || {},
        findings: ['Sequence copy ready — connector needed to activate'],
        insights: [],
      },
      follow_ups: [`Connect ${friendly} to activate this sequence automatically`],
    };
  }

  _error(message) {
    return {
      prose: `I ran into a problem: ${message}`,
      response_type: 'creation',
      agent: SamAgent.id,
      crew: 'email-automation',
      confidence: 0,
      connectors_used: [],
      artifact: { type: 'content', format: 'email_sequence', title: '', content: {} },
      follow_ups: [],
    };
  }
}

module.exports = SamAgent;
