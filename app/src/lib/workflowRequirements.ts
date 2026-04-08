/**
 * workflowRequirements.ts
 * Defines what each orchestrated module needs before it can run:
 * - required connector IDs (Composio tool IDs)
 * - input fields to gather from the user via in-chat form
 */

import type { WorkflowFormData } from '@/types/chat';

// ── Connector requirements per module ────────────────────────────────────────
export const WORKFLOW_CONNECTOR_REQUIREMENTS: Record<string, string[]> = {
  'revenue-ops':        [],
  'seo-llmo':           [],
  'budget-optimization': [],
  'lead-intelligence':  [],
  'email-sequence':     [],
  'lead-magnets':       [],
  'launch-strategy':    [],
  'messaging':          [],
  'offer-design':       [],
  'ab-test':            [],
  'sales-enablement':   [],
  'positioning':        [],
  'user-engagement':    [],
  'lead-outreach':      [],
  'ad-creative':        [],
  'paid-ads':           [],
  'marketing-audit':    [],
  'audience-profiles':  [],
  'referral-program':   [],
  'unified-customer-view': [],
};

// ── Input form definitions per module ────────────────────────────────────────
export const WORKFLOW_FORMS: Record<string, WorkflowFormData> = {

  // ── Revenue Operations ──────────────────────────────────────────────────────
  'revenue-ops': {
    moduleId: 'revenue-ops',
    moduleName: 'Revenue Operations',
    prompt: "To get the most from Revenue Ops, answer a couple of quick questions:",
    fields: [
      {
        id: 'question',
        label: 'What do you want to diagnose?',
        type: 'text',
        placeholder: 'e.g. Why is our conversion rate dropping at the demo stage?',
      },
      {
        id: 'problem',
        label: 'Which area is the problem in?',
        type: 'select',
        options: [
          { value: 'routing',       label: 'Lead routing and assignment' },
          { value: 'qualification', label: 'Qualification and stage quality' },
          { value: 'pipeline',      label: 'Pipeline hygiene and forecast confidence' },
        ],
      },
      {
        id: 'breakdown',
        label: 'Where does it break down?',
        type: 'select',
        options: [
          { value: 'marketing_to_sales', label: 'Marketing-to-sales handoff' },
          { value: 'sales_process',      label: 'Sales process and stage movement' },
          { value: 'full_funnel',        label: 'Full funnel and lifecycle orchestration' },
        ],
      },
      {
        id: 'systems',
        label: 'What data do you have?',
        type: 'select',
        options: [
          { value: 'crm',       label: 'CRM (HubSpot / Salesforce)' },
          { value: 'analytics', label: 'Analytics and spreadsheet exports' },
          { value: 'combined',  label: 'CRM plus analytics together' },
        ],
      },
    ],
  },

  // ── SEO / LLMO ──────────────────────────────────────────────────────────────
  'seo-llmo': {
    moduleId: 'seo-llmo',
    moduleName: 'SEO / LLMO',
    prompt: "Quick setup for SEO & LLMO — this helps me focus the right analysis:",
    fields: [
      {
        id: 'question',
        label: 'What do you want to improve?',
        type: 'text',
        placeholder: 'e.g. Why are we losing rankings for our core keywords?',
      },
      {
        id: 'focus',
        label: 'Which channel?',
        type: 'select',
        options: [
          { value: 'rankings', label: 'Search rankings (Google / Bing)' },
          { value: 'llm',      label: 'AI answer engine visibility (ChatGPT, Perplexity)' },
          { value: 'both',     label: 'Both — search + AI answer engines' },
        ],
      },
      {
        id: 'surface',
        label: 'What surface are you fixing?',
        type: 'select',
        options: [
          { value: 'homepage', label: 'Homepage and core landing pages' },
          { value: 'content',  label: 'Blog and content hub' },
          { value: 'offer',    label: 'Product or pricing pages' },
        ],
      },
      {
        id: 'goal',
        label: 'What is the goal?',
        type: 'select',
        options: [
          { value: 'traffic',   label: 'Increase organic traffic' },
          { value: 'coverage',  label: 'Improve AI answer engine coverage' },
          { value: 'authority', label: 'Build domain authority and backlinks' },
        ],
      },
    ],
  },

  // ── Email Sequence ──────────────────────────────────────────────────────────
  'email-sequence': {
    moduleId: 'email-sequence',
    moduleName: 'Email Sequences',
    prompt: "Set up your email sequence in seconds:",
    fields: [
      {
        id: 'question',
        label: 'What do you want this sequence to achieve?',
        type: 'text',
        placeholder: 'e.g. Onboard new trial users and get them to their first activation event',
      },
      {
        id: 'type',
        label: 'Sequence type',
        type: 'select',
        options: [
          { value: 'nurture',    label: 'Nurture' },
          { value: 'onboarding', label: 'Onboarding' },
          { value: 'outbound',   label: 'Outbound' },
        ],
      },
      {
        id: 'audience',
        label: 'Who is it for?',
        type: 'select',
        options: [
          { value: 'new_leads',    label: 'New leads' },
          { value: 'trial_users',  label: 'Trial or new users' },
          { value: 'customers',    label: 'Existing customers' },
        ],
      },
      {
        id: 'goal',
        label: 'Primary goal',
        type: 'select',
        options: [
          { value: 'activate', label: 'Activate and educate' },
          { value: 'convert',  label: 'Drive conversion' },
          { value: 'reengage', label: 'Re-engage' },
        ],
      },
    ],
  },

  // ── Lead Magnets ────────────────────────────────────────────────────────────
  'lead-magnets': {
    moduleId: 'lead-magnets',
    moduleName: 'Lead Magnets',
    prompt: "Let me design the right lead magnet for you:",
    fields: [
      {
        id: 'question',
        label: 'What should the lead magnet do?',
        type: 'text',
        placeholder: 'e.g. Capture mid-funnel buyers who are comparing us to competitors',
      },
      {
        id: 'type',
        label: 'Format',
        type: 'select',
        options: [
          { value: 'guide',      label: 'Guide or playbook' },
          { value: 'checklist',  label: 'Checklist or template' },
          { value: 'calculator', label: 'Framework or tool' },
        ],
      },
      {
        id: 'audience',
        label: 'Target audience',
        type: 'select',
        options: [
          { value: 'top_funnel',    label: 'Top-of-funnel audience' },
          { value: 'consideration', label: 'In-market buyers' },
          { value: 'high_intent',   label: 'High-intent prospects' },
        ],
      },
      {
        id: 'goal',
        label: 'Primary goal',
        type: 'select',
        options: [
          { value: 'capture', label: 'Capture more leads' },
          { value: 'qualify', label: 'Improve lead quality' },
          { value: 'nurture', label: 'Support nurture' },
        ],
      },
    ],
  },

  // ── Launch Strategy ─────────────────────────────────────────────────────────
  'launch-strategy': {
    moduleId: 'launch-strategy',
    moduleName: 'Launch Strategy',
    prompt: "Tell me about your launch and I'll build the plan:",
    fields: [
      {
        id: 'question',
        label: 'What are you launching?',
        type: 'text',
        placeholder: 'e.g. A new pricing tier targeting mid-market companies',
      },
      {
        id: 'type',
        label: 'Launch type',
        type: 'select',
        options: [
          { value: 'product',  label: 'Product or feature' },
          { value: 'campaign', label: 'Campaign or offer' },
          { value: 'brand',    label: 'Brand or positioning move' },
        ],
      },
      {
        id: 'audience',
        label: 'Primary audience',
        type: 'select',
        options: [
          { value: 'customers', label: 'Existing customers' },
          { value: 'pipeline',  label: 'Leads and pipeline' },
          { value: 'market',    label: 'New market audience' },
        ],
      },
      {
        id: 'horizon',
        label: 'Planning horizon',
        type: 'select',
        options: [
          { value: 'week',    label: '1 week' },
          { value: 'month',   label: '1 month' },
          { value: 'quarter', label: 'Quarter' },
        ],
      },
    ],
  },

  // ── Messaging ───────────────────────────────────────────────────────────────
  'messaging': {
    moduleId: 'messaging',
    moduleName: 'Messaging & Copy',
    prompt: "Help me sharpen the right message for you:",
    fields: [
      {
        id: 'question',
        label: 'What messaging problem are you solving?',
        type: 'text',
        placeholder: 'e.g. Our homepage doesn\'t convert because the value prop is vague',
      },
      {
        id: 'surface',
        label: 'Where is the messaging?',
        type: 'select',
        options: [
          { value: 'website', label: 'Website or landing page' },
          { value: 'email',   label: 'Email or lifecycle' },
          { value: 'ads',     label: 'Ads and campaigns' },
        ],
      },
      {
        id: 'problem',
        label: 'Main problem',
        type: 'select',
        options: [
          { value: 'unclear',    label: 'Unclear value' },
          { value: 'weak',       label: 'Weak differentiation' },
          { value: 'conversion', label: 'Poor conversion pull' },
        ],
      },
      {
        id: 'goal',
        label: 'Desired outcome',
        type: 'select',
        options: [
          { value: 'clarify',      label: 'Clarify the message' },
          { value: 'differentiate', label: 'Differentiate more strongly' },
          { value: 'convert',      label: 'Drive more action' },
        ],
      },
    ],
  },

  // ── Offer Design ────────────────────────────────────────────────────────────
  'offer-design': {
    moduleId: 'offer-design',
    moduleName: 'Offer Design',
    prompt: "Let me identify the right lever to strengthen your offer:",
    fields: [
      {
        id: 'question',
        label: 'What is the offer problem?',
        type: 'text',
        placeholder: 'e.g. Our trial-to-paid conversion is under 5% despite strong activation',
      },
      {
        id: 'problem',
        label: 'Main friction',
        type: 'select',
        options: [
          { value: 'clarity', label: 'Weak clarity' },
          { value: 'pricing', label: 'Pricing friction' },
          { value: 'cta',     label: 'Weak CTA pull' },
        ],
      },
      {
        id: 'lever',
        label: 'Priority lever',
        type: 'select',
        options: [
          { value: 'message', label: 'Offer message' },
          { value: 'package', label: 'Packaging' },
          { value: 'action',  label: 'Call to action' },
        ],
      },
      {
        id: 'goal',
        label: 'Desired outcome',
        type: 'select',
        options: [
          { value: 'leads', label: 'More leads' },
          { value: 'sales', label: 'Better close rate' },
          { value: 'value', label: 'Higher perceived value' },
        ],
      },
    ],
  },

  // ── A/B Test ────────────────────────────────────────────────────────────────
  'ab-test': {
    moduleId: 'ab-test',
    moduleName: 'A/B Tests',
    prompt: "Set up your experiment quickly:",
    fields: [
      {
        id: 'question',
        label: 'What do you want to test?',
        type: 'text',
        placeholder: 'e.g. Whether a benefit-led headline outperforms our current pain-led one',
      },
      {
        id: 'surface',
        label: 'Test surface',
        type: 'select',
        options: [
          { value: 'page',  label: 'Landing page' },
          { value: 'email', label: 'Email' },
          { value: 'ads',   label: 'Ads' },
        ],
      },
      {
        id: 'goal',
        label: 'Primary goal',
        type: 'select',
        options: [
          { value: 'conversion', label: 'Conversion rate' },
          { value: 'quality',    label: 'Lead quality' },
          { value: 'learning',   label: 'Learning speed' },
        ],
      },
      {
        id: 'mode',
        label: 'What do you need?',
        type: 'select',
        options: [
          { value: 'hypothesis', label: 'Build hypotheses' },
          { value: 'evaluation', label: 'Evaluate existing results' },
          { value: 'both',       label: 'Both' },
        ],
      },
    ],
  },

  // ── Sales Enablement ────────────────────────────────────────────────────────
  'sales-enablement': {
    moduleId: 'sales-enablement',
    moduleName: 'Sales Enablement',
    prompt: "Build the right enablement asset for your team:",
    fields: [
      {
        id: 'question',
        label: 'What does the sales team need?',
        type: 'text',
        placeholder: 'e.g. A one-pager to use in competitive deals against our main rival',
      },
      {
        id: 'asset',
        label: 'Asset type',
        type: 'select',
        options: [
          { value: 'one_pager',  label: 'Buyer-facing one-pager' },
          { value: 'battlecard', label: 'Competitive battle card' },
          { value: 'sequence',   label: 'Seller-ready outreach sequence' },
        ],
      },
      {
        id: 'audience',
        label: 'Who uses this?',
        type: 'select',
        options: [
          { value: 'sellers',    label: 'Sales reps' },
          { value: 'buyers',     label: 'Buyers and prospects' },
          { value: 'leadership', label: 'Sales leadership' },
        ],
      },
      {
        id: 'motion',
        label: 'Sales motion',
        type: 'select',
        options: [
          { value: 'discovery',   label: 'Early discovery' },
          { value: 'competitive', label: 'Competitive deal' },
          { value: 'late_stage',  label: 'Late-stage close' },
        ],
      },
    ],
  },

  // ── Positioning ─────────────────────────────────────────────────────────────
  'positioning': {
    moduleId: 'positioning',
    moduleName: 'Positioning & Strategy',
    prompt: "Let me sharpen your positioning in the right direction:",
    fields: [
      {
        id: 'question',
        label: 'What is the positioning problem?',
        type: 'text',
        placeholder: 'e.g. Prospects keep comparing us to cheaper tools that do less',
      },
      {
        id: 'focus',
        label: 'Positioning goal',
        type: 'select',
        options: [
          { value: 'differentiate', label: 'Differentiate more clearly' },
          { value: 'clarify',       label: 'Clarify value' },
          { value: 'reframe',       label: 'Reframe the category story' },
        ],
      },
      {
        id: 'buyer',
        label: 'Primary buyer',
        type: 'select',
        options: [
          { value: 'execs',     label: 'Executive buyers' },
          { value: 'operators', label: 'Operators and functional users' },
          { value: 'technical', label: 'Technical evaluators' },
        ],
      },
      {
        id: 'outcome',
        label: 'Desired outcome',
        type: 'select',
        options: [
          { value: 'pipeline', label: 'More pipeline' },
          { value: 'sales',    label: 'Better sales motion' },
          { value: 'category', label: 'Stronger market story' },
        ],
      },
    ],
  },

  // ── User Engagement ─────────────────────────────────────────────────────────
  'user-engagement': {
    moduleId: 'user-engagement',
    moduleName: 'User Engagement',
    prompt: "Help me focus the engagement work on the right users:",
    fields: [
      {
        id: 'question',
        label: 'What engagement problem are you solving?',
        type: 'text',
        placeholder: 'e.g. New users are not reaching their first value moment within 7 days',
      },
      {
        id: 'segment',
        label: 'Which users?',
        type: 'select',
        options: [
          { value: 'new_users',     label: 'New users' },
          { value: 'active_users',  label: 'Active users' },
          { value: 'dormant_users', label: 'Dormant users' },
        ],
      },
      {
        id: 'problem',
        label: 'Engagement friction',
        type: 'select',
        options: [
          { value: 'activation', label: 'Low activation' },
          { value: 'habit',      label: 'Weak repeat usage' },
          { value: 'dropoff',    label: 'Usage drop-off' },
        ],
      },
      {
        id: 'motion',
        label: 'Engagement motion',
        type: 'select',
        options: [
          { value: 'onboarding',    label: 'Onboarding journey' },
          { value: 'lifecycle',     label: 'Lifecycle messaging' },
          { value: 'reactivation',  label: 'Reactivation play' },
        ],
      },
    ],
  },

  // ── Lead Outreach ───────────────────────────────────────────────────────────
  'lead-outreach': {
    moduleId: 'lead-outreach',
    moduleName: 'Lead Outreach',
    prompt: "Build the right outreach sequence:",
    fields: [
      {
        id: 'question',
        label: 'What should the outreach achieve?',
        type: 'text',
        placeholder: 'e.g. Book demos with VP-level buyers at Series B SaaS companies',
      },
      {
        id: 'channel',
        label: 'Outreach channel',
        type: 'select',
        options: [
          { value: 'email',    label: 'Email-first' },
          { value: 'linkedin', label: 'LinkedIn-first' },
          { value: 'multi',    label: 'Multitouch' },
        ],
      },
      {
        id: 'target',
        label: 'Primary target',
        type: 'select',
        options: [
          { value: 'decision',  label: 'Decision makers' },
          { value: 'champions', label: 'Internal champions' },
          { value: 'warm',      label: 'Warm accounts' },
        ],
      },
      {
        id: 'goal',
        label: 'Primary goal',
        type: 'select',
        options: [
          { value: 'meeting',       label: 'Book meetings' },
          { value: 'reply',         label: 'Earn replies' },
          { value: 'qualification', label: 'Qualify interest' },
        ],
      },
    ],
  },

  // ── Ad Creative ─────────────────────────────────────────────────────────────
  'ad-creative': {
    moduleId: 'ad-creative',
    moduleName: 'Ad Creative',
    prompt: "Generate the right creative for your campaign:",
    fields: [
      {
        id: 'question',
        label: 'What do you need the creative to do?',
        type: 'text',
        placeholder: 'e.g. Test 3 angles for our retargeting campaign on Meta',
      },
      {
        id: 'format',
        label: 'Creative format',
        type: 'select',
        options: [
          { value: 'copy',    label: 'Ad copy' },
          { value: 'angles',  label: 'Creative angles' },
          { value: 'variants', label: 'Test variants' },
        ],
      },
      {
        id: 'platform',
        label: 'Platform',
        type: 'select',
        options: [
          { value: 'meta',     label: 'Meta Ads' },
          { value: 'google',   label: 'Google Ads' },
          { value: 'linkedin', label: 'LinkedIn Ads' },
        ],
      },
    ],
  },

  // ── Paid Ads ────────────────────────────────────────────────────────────────
  'paid-ads': {
    moduleId: 'paid-ads',
    moduleName: 'Paid Ads',
    prompt: "Configure your paid ads strategy:",
    fields: [
      {
        id: 'question',
        label: 'What do you want from paid ads?',
        type: 'text',
        placeholder: 'e.g. Scale our lead volume from Google without blowing the CPL',
      },
      {
        id: 'objective',
        label: 'Campaign objective',
        type: 'select',
        options: [
          { value: 'leads',     label: 'Generate leads' },
          { value: 'traffic',   label: 'Drive traffic' },
          { value: 'awareness', label: 'Build awareness' },
        ],
      },
      {
        id: 'channel',
        label: 'Priority channel',
        type: 'select',
        options: [
          { value: 'google',   label: 'Google Ads' },
          { value: 'meta',     label: 'Meta Ads' },
          { value: 'linkedin', label: 'LinkedIn Ads' },
        ],
      },
    ],
  },

  // ── Marketing Audit ─────────────────────────────────────────────────────────
  'marketing-audit': {
    moduleId: 'marketing-audit',
    moduleName: 'Marketing Audit',
    prompt: "Set the scope for your marketing audit:",
    fields: [
      {
        id: 'question',
        label: 'What specifically needs auditing?',
        type: 'text',
        placeholder: 'e.g. Why is our CAC 3x higher than last quarter',
      },
      {
        id: 'scope',
        label: 'Audit scope',
        type: 'select',
        options: [
          { value: 'full',    label: 'Full stack' },
          { value: 'website', label: 'Website and funnel' },
          { value: 'growth',  label: 'Growth channels' },
        ],
      },
      {
        id: 'priority',
        label: 'Priority output',
        type: 'select',
        options: [
          { value: 'quickwins', label: 'Quick wins' },
          { value: 'roadmap',   label: 'Roadmap' },
          { value: 'score',     label: 'Score and diagnosis' },
        ],
      },
      {
        id: 'context',
        label: 'Guiding context',
        type: 'select',
        options: [
          { value: 'analytics', label: 'Analytics and performance' },
          { value: 'messaging', label: 'Messaging and funnel' },
          { value: 'operating', label: 'Operating model' },
        ],
      },
    ],
  },

  // ── Audience Profiles ───────────────────────────────────────────────────────
  'audience-profiles': {
    moduleId: 'audience-profiles',
    moduleName: 'Audience Profiles',
    prompt: "Define who we should focus on first:",
    fields: [
      {
        id: 'question',
        label: 'What audience problem are you solving?',
        type: 'text',
        placeholder: 'e.g. We get great trial signups but terrible conversion — who is actually worth targeting?',
      },
      {
        id: 'scope',
        label: 'Audience scope',
        type: 'select',
        options: [
          { value: 'icp',        label: 'Core ICPs' },
          { value: 'segments',   label: 'Segments' },
          { value: 'lookalikes', label: 'Lookalikes' },
        ],
      },
      {
        id: 'buyer',
        label: 'Buyer layer',
        type: 'select',
        options: [
          { value: 'decision',  label: 'Decision makers' },
          { value: 'operators', label: 'Operators' },
          { value: 'champions', label: 'Internal champions' },
        ],
      },
      {
        id: 'goal',
        label: 'Primary use',
        type: 'select',
        options: [
          { value: 'outbound',    label: 'Outbound and lead gen' },
          { value: 'positioning', label: 'Messaging and positioning' },
          { value: 'ads',         label: 'Paid targeting' },
        ],
      },
    ],
  },

  // ── Referral Program ────────────────────────────────────────────────────────
  'referral-program': {
    moduleId: 'referral-program',
    moduleName: 'Referral Program',
    prompt: "Design your referral loop:",
    fields: [
      {
        id: 'question',
        label: 'What should the referral program achieve?',
        type: 'text',
        placeholder: 'e.g. Turn our happiest enterprise customers into a repeatable intro channel',
      },
      {
        id: 'who',
        label: 'Who are your advocates?',
        type: 'select',
        options: [
          { value: 'customers', label: 'Happy customers' },
          { value: 'champions', label: 'Product champions' },
          { value: 'partners',  label: 'Partners or affiliates' },
        ],
      },
      {
        id: 'play',
        label: 'Referral play',
        type: 'select',
        options: [
          { value: 'invite_loop',    label: 'Invite loop' },
          { value: 'post_purchase',  label: 'Post-purchase ask' },
          { value: 'win_back',       label: 'Win-back referrals' },
        ],
      },
      {
        id: 'incentive',
        label: 'Reward type',
        type: 'select',
        options: [
          { value: 'double_sided',   label: 'Double-sided reward' },
          { value: 'advocate_only',  label: 'Advocate-only reward' },
          { value: 'non_cash',       label: 'Non-cash perk' },
        ],
      },
    ],
  },

  // ── Unified Customer View ───────────────────────────────────────────────────
  'unified-customer-view': {
    moduleId: 'unified-customer-view',
    moduleName: 'Customer View',
    prompt: "Help me focus the customer analysis:",
    fields: [
      {
        id: 'question',
        label: 'What customer question are you answering?',
        type: 'text',
        placeholder: 'e.g. Who are our most likely churn risks in the next 30 days?',
      },
      {
        id: 'viewType',
        label: 'What view do you need?',
        type: 'select',
        options: [
          { value: 'segments',     label: 'Customer segments' },
          { value: 'risk',         label: 'Risk and churn signals' },
          { value: 'opportunities', label: 'Expansion and growth' },
        ],
      },
      {
        id: 'viewQuestion',
        label: 'Key question',
        type: 'select',
        options: [
          { value: 'what_changed', label: 'What changed?' },
          { value: 'who_matters',  label: 'Who matters most?' },
          { value: 'what_next',    label: 'What should we do next?' },
        ],
      },
      {
        id: 'systems',
        label: 'Data sources available',
        type: 'select',
        options: [
          { value: 'crm_lifecycle', label: 'CRM + lifecycle' },
          { value: 'analytics',     label: 'Analytics + usage' },
          { value: 'full_view',     label: 'Full customer picture' },
        ],
      },
    ],
  },

};

// ── Module → GoalPreset param key mapping ─────────────────────────────────────
// Maps workflow form field IDs to GoalPreset keys used in ModuleDetail.
// Used to drive the module-aware merger in ModuleDetail.tsx.
export const WORKFLOW_PARAM_KEYS: Record<string, Record<string, string>> = {
  'revenue-ops': {
    question:  'question',
    problem:   'revopsProblem',
    breakdown: 'revopsBreakdown',
    systems:   'revopsSystems',
  },
  'seo-llmo': {
    question: 'question',
    focus:    'seoFocus',
    surface:  'seoSurface',
    goal:     'seoGoal',
  },
  'email-sequence': {
    question: 'question',
    type:     'emailSequenceType',
    audience: 'emailSequenceAudience',
    goal:     'emailSequenceGoal',
  },
  'lead-magnets': {
    question: 'question',
    type:     'magnetType',
    audience: 'magnetAudience',
    goal:     'magnetGoal',
  },
  'launch-strategy': {
    question: 'question',
    type:     'launchType',
    audience: 'launchAudience',
    horizon:  'launchHorizon',
  },
  'messaging': {
    question: 'question',
    surface:  'messagingSurface',
    problem:  'messagingProblem',
    goal:     'messagingGoal',
  },
  'offer-design': {
    question: 'question',
    problem:  'offerProblem',
    lever:    'offerLever',
    goal:     'offerGoal',
  },
  'ab-test': {
    question: 'question',
    surface:  'testSurface',
    goal:     'testGoal',
    mode:     'testMode',
  },
  'sales-enablement': {
    question: 'question',
    asset:    'salesAsset',
    audience: 'salesAudience',
    motion:   'salesMotion',
  },
  'positioning': {
    question: 'question',
    focus:    'positioningFocus',
    buyer:    'positioningBuyer',
    outcome:  'positioningOutcome',
  },
  'user-engagement': {
    question: 'question',
    segment:  'engagementSegment',
    problem:  'engagementProblem',
    motion:   'engagementMotion',
    channel:  'engagementChannel',
  },
  'lead-outreach': {
    question: 'question',
    channel:  'outreachChannel',
    target:   'outreachTarget',
    goal:     'outreachGoal',
  },
  'ad-creative': {
    question: 'question',
    format:   'adFormat',
    platform: 'adPlatform',
  },
  'paid-ads': {
    question:  'question',
    objective: 'paidObjective',
    channel:   'paidChannel',
  },
  'marketing-audit': {
    question: 'question',
    scope:    'auditScope',
    priority: 'auditPriority',
    context:  'auditContext',
  },
  'audience-profiles': {
    question: 'question',
    scope:    'audienceScope',
    buyer:    'audienceBuyer',
    goal:     'audienceGoal',
  },
  'referral-program': {
    question:  'question',
    who:       'referralWho',
    play:      'referralPlay',
    incentive: 'referralIncentive',
    channel:   'referralChannel',
  },
  'unified-customer-view': {
    question:     'question',
    viewType:     'customerViewType',
    viewQuestion: 'customerViewQuestion',
    systems:      'customerViewSystems',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasWorkflowForm(moduleId: string): boolean {
  return moduleId in WORKFLOW_FORMS;
}

export function buildWorkflowSummary(moduleId: string, params: Record<string, string>): string {
  const form = WORKFLOW_FORMS[moduleId];
  if (!form) return '';
  const lines: string[] = [];
  for (const field of form.fields) {
    const val = params[field.id];
    if (!val) continue;
    const label = field.options?.find(o => o.value === val)?.label ?? val;
    lines.push(`**${field.label}** ${label}`);
  }
  if (lines.length === 0) return `Opening ${form.moduleName} now.`;
  return `Opening ${form.moduleName} with:\n${lines.join('\n')}`;
}

// Convert raw workflowParams to GoalPreset-compatible keys for a given module.
// Used by ModuleDetail to merge chat-gathered params into the module state.
export function mapWorkflowParamsToGoalPreset(
  moduleId: string,
  params: Record<string, string>
): Record<string, string | null> {
  const keyMap = WORKFLOW_PARAM_KEYS[moduleId];
  if (!keyMap) return {};
  const result: Record<string, string | null> = {};
  for (const [formKey, presetKey] of Object.entries(keyMap)) {
    result[presetKey] = params[formKey] ?? null;
  }
  return result;
}
