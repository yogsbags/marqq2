export interface GoalCard {
  id: string
  title: string
  description: string
  bestFor: string
  kind?: string
  color: string
  moduleId: string
  hashParams?: Record<string, string>
}

export type GoalTarget = {
  title: string
  description: string
  moduleId: string
  hashParams?: Record<string, string>
  bestFor?: string
}

export type GoalQuestion = {
  id: string
  prompt: string
  options: Array<{
    id: string
    label: string
    description: string
  }>
}

export type GoalIntakeConfig = {
  intro: string
  questions: GoalQuestion[]
  connectors?: string[]
  launchTitle: string
  firstAction: string
}

export function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const GOAL_CARDS: GoalCard[] = [
  {
    id: 'get-leads',
    title: 'Get More Leads',
    description: 'Find, enrich, and score high-fit prospects for your ICP',
    bestFor: 'Best for pipeline building',
    kind: 'Acquire',
    color: 'from-blue-500/10 to-blue-600/5 border-blue-200 dark:border-blue-800',
    moduleId: 'lead-intelligence',
    hashParams: { tab: 'fetch' },
  },
  {
    id: 'run-paid-ads',
    title: 'Run Paid Ads',
    description: 'Plan targeting, creatives, and budget allocation for ad campaigns',
    bestFor: 'Best for campaign launch',
    kind: 'Paid',
    color: 'from-orange-500/10 to-orange-600/5 border-orange-200 dark:border-orange-800',
    moduleId: 'paid-ads',
    hashParams: { tab: 'create' },
  },
  {
    id: 'create-content',
    title: 'Create Content',
    description: 'Generate posts, emails, videos, and articles grounded in your brand',
    bestFor: 'Best for ongoing content',
    kind: 'Content',
    color: 'from-purple-500/10 to-purple-600/5 border-purple-200 dark:border-purple-800',
    moduleId: 'ai-content',
  },
  {
    id: 'run-social-media',
    title: 'Run Social Media',
    description: 'Plan channel-ready social campaigns, content mix, and publishing rhythm',
    bestFor: 'Best for social campaigns',
    kind: 'Campaign',
    color: 'from-fuchsia-500/10 to-pink-600/5 border-fuchsia-200 dark:border-fuchsia-800',
    moduleId: 'social-media',
  },
  {
    id: 'improve-conversion',
    title: 'Improve Conversion',
    description: 'Audit your funnel, identify drop-off points, and design experiments',
    bestFor: 'Best for funnel fixes',
    kind: 'Funnel',
    color: 'from-green-500/10 to-green-600/5 border-green-200 dark:border-green-800',
    moduleId: 'cro',
  },
  {
    id: 'retain-customers',
    title: 'Retain Customers',
    description: 'Prevent churn, save at-risk accounts, and win back customers who are slipping away',
    bestFor: 'Best for churn and save plays',
    kind: 'Save',
    color: 'from-rose-500/10 to-rose-600/5 border-rose-200 dark:border-rose-800',
    moduleId: 'churn-prevention',
  },
  {
    id: 'user-engagement',
    title: 'Improve User Engagement',
    description: 'Increase activation, repeat usage, and habit-building across the customer journey',
    bestFor: 'Best for activation and repeat usage',
    kind: 'Usage',
    color: 'from-emerald-500/10 to-teal-600/5 border-emerald-200 dark:border-emerald-800',
    moduleId: 'user-engagement',
  },
  {
    id: 'unified-customer-view',
    title: 'Understand Customer Behavior',
    description: 'Unify CRM, lifecycle, and analytics signals into a clearer view of segments, risk, and opportunities',
    bestFor: 'Best for customer intelligence',
    kind: 'Intelligence',
    color: 'from-violet-500/10 to-indigo-600/5 border-violet-200 dark:border-violet-800',
    moduleId: 'unified-customer-view',
  },
  {
    id: 'revenue-ops',
    title: 'Improve Revenue Ops',
    description: 'Tighten lifecycle stages, routing rules, CRM hygiene, and handoffs from marketing to sales',
    bestFor: 'Best for lead lifecycle ops',
    kind: 'Ops',
    color: 'from-slate-500/10 to-slate-700/5 border-slate-200 dark:border-slate-800',
    moduleId: 'revenue-ops',
  },
  {
    id: 'referral-program',
    title: 'Launch Referral Program',
    description: 'Turn happy customers, champions, or partners into a repeatable acquisition loop',
    bestFor: 'Best for referral growth',
    kind: 'Referral',
    color: 'from-cyan-500/10 to-sky-600/5 border-cyan-200 dark:border-cyan-800',
    moduleId: 'referral-program',
  },
  {
    id: 'understand-performance',
    title: 'Diagnose Performance',
    description: 'See what is working across web, search, and social and decide what to do next',
    bestFor: 'Best for cross-channel analysis',
    kind: 'Analysis',
    color: 'from-amber-500/10 to-amber-600/5 border-amber-200 dark:border-amber-800',
    moduleId: 'performance-scorecard',
    hashParams: {
      question: 'What is working across our connected channels, what is underperforming, and what should we do next?',
    },
  },
]

export const ANALYZE_GOAL_IDS = new Set(['understand-performance'])

export const WORKFLOW_GOAL_GROUPS: Array<{ title: string; description: string; goalIds: string[] }> = [
  {
    title: 'Acquire',
    description: 'Bring in demand through outbound, paid, and customer-led growth.',
    goalIds: ['get-leads', 'run-paid-ads', 'referral-program'],
  },
  {
    title: 'Create',
    description: 'Produce the assets and campaigns that keep distribution moving.',
    goalIds: ['create-content', 'run-social-media'],
  },
  {
    title: 'Convert',
    description: 'Improve user-facing funnel performance and internal revenue mechanics.',
    goalIds: ['improve-conversion', 'revenue-ops'],
  },
  {
    title: 'Retain',
    description: 'Reduce churn, deepen usage, and understand the customers worth acting on.',
    goalIds: ['retain-customers', 'user-engagement', 'unified-customer-view'],
  },
  {
    title: 'Analyze',
    description: 'Read cross-channel performance before changing strategy or spend.',
    goalIds: ['understand-performance'],
  },
]

export const CONNECTOR_LABEL_TO_ID: Record<string, string> = {
  Apollo: 'apollo',
  Hunter: 'hunter',
  'CSV import': 'google_sheets',
  'Google Ads': 'google_ads',
  'Meta Ads': 'meta_ads',
  'LinkedIn Ads': 'linkedin_ads',
  LinkedIn: 'linkedin',
  Facebook: 'facebook',
  Instagram: 'instagram',
  YouTube: 'youtube',
  HubSpot: 'hubspot',
  'Zoho CRM': 'zoho_crm',
  Mailchimp: 'mailchimp',
  Klaviyo: 'klaviyo',
  Instantly: 'instantly',
  SendGrid: 'sendgrid',
  Canva: 'canva',
  HeyGen: 'heygen',
  ElevenLabs: 'elevenlabs',
  Veo: 'veo',
  Semrush: 'semrush',
  Ahrefs: 'ahrefs',
  GA4: 'ga4',
  'TikTok Ads': 'tiktok_ads',
  WordPress: 'wordpress',
  Sanity: 'google_docs',
  CRM: 'hubspot',
  'Email platform': 'mailchimp',
  'Product analytics': 'mixpanel',
}

export const GOAL_CATALOG_GROUPS: Array<{
  title: string
  goals: Array<{ title: string; description: string; moduleId: string; hashParams?: Record<string, string> }>
}> = [
  {
    title: 'Acquire',
    goals: [
      { title: 'Find qualified leads', description: 'Source, enrich, and score accounts that match your ICP.', moduleId: 'lead-intelligence', hashParams: { tab: 'fetch' } },
      { title: 'Enrich existing leads', description: 'Fill in missing emails, phones, and profile data for your current lead list.', moduleId: 'lead-intelligence', hashParams: { tab: 'enrich' } },
      { title: 'Build outreach sequences', description: 'Prepare personalized email and LinkedIn outreach for prospects.', moduleId: 'lead-outreach' },
      { title: 'Create lead magnets', description: 'Launch opt-ins and downloadable assets to capture demand.', moduleId: 'lead-magnets' },
      { title: 'Launch a referral loop', description: 'Turn customers into a repeatable acquisition channel.', moduleId: 'referral-program' },
    ],
  },
  {
    title: 'Advertise',
    goals: [
      { title: 'Run paid ads', description: 'Plan campaign structure, budget, and targeting by channel.', moduleId: 'paid-ads', hashParams: { tab: 'create' } },
      { title: 'Generate ad creatives', description: 'Create copy and variants for Meta, Google, and LinkedIn.', moduleId: 'ad-creative', hashParams: { tab: 'copy' } },
      { title: 'Optimize ROAS (Return on Ad Spend)', description: 'Improve return by reallocating spend toward stronger channels and campaigns.', moduleId: 'budget-optimization', hashParams: { question: 'How can we improve ROAS across our current ad channels? Give a channel-by-channel diagnosis and budget reallocation plan.' } },
    ],
  },
  {
    title: 'Create',
    goals: [
      { title: 'Produce brand content', description: 'Generate articles, posts, and campaign assets in your voice.', moduleId: 'ai-content' },
      { title: 'Run social media', description: 'Plan a social campaign, content mix, and publishing rhythm by channel.', moduleId: 'social-media' },
      { title: 'Plan your social calendar', description: 'Build a repeatable publishing schedule for social channels.', moduleId: 'social-calendar' },
      { title: 'Write email sequences', description: 'Create nurture, outbound, or onboarding sequences.', moduleId: 'email-sequence' },
      { title: 'Improve organic visibility', description: 'Optimize for SEO and LLM search discovery.', moduleId: 'seo-llmo' },
    ],
  },
  {
    title: 'Convert',
    goals: [
      { title: 'Increase conversion rate', description: 'Audit your funnel and identify the biggest drop-off points.', moduleId: 'cro' },
      { title: 'Test new variants', description: 'Generate A/B test hypotheses and creative variations.', moduleId: 'ab-test' },
      { title: 'Build landing pages', description: 'Create focused pages for offers and campaigns.', moduleId: 'landing-pages' },
      { title: 'Strengthen your offer', description: 'Refine CTA, packaging, and offer clarity.', moduleId: 'offer-design' },
      { title: 'Sharpen messaging', description: 'Improve copy and positioning across customer touchpoints.', moduleId: 'messaging' },
    ],
  },
  {
    title: 'Retain',
    goals: [
      { title: 'Reduce churn', description: 'Identify churn risks, save at-risk users, and build win-back plays.', moduleId: 'churn-prevention' },
      { title: 'Improve lifecycle engagement', description: 'Increase activation, repeat usage, and habit-building before churn sets in.', moduleId: 'user-engagement' },
      { title: 'Understand customer behavior', description: 'Unify customer signals into a clearer view of retention drivers.', moduleId: 'unified-customer-view' },
    ],
  },
  {
    title: 'Analyze',
    goals: [
      { title: 'Measure marketing performance', description: 'See what is working and where to shift budget.', moduleId: 'performance-scorecard' },
      { title: 'Audit your overall marketing', description: 'Review the stack, gaps, and highest-leverage fixes.', moduleId: 'marketing-audit' },
      { title: 'Check channel health', description: 'Understand where execution is strong or underperforming.', moduleId: 'channel-health' },
    ],
  },
]

export function getGoalIntakeConfig(goal: GoalTarget): GoalIntakeConfig {
  const goalKey = `${goal.moduleId}:${goal.title}`

  switch (goalKey) {
    case 'lead-intelligence:Get More Leads':
    case 'lead-intelligence:Find qualified leads':
      return {
        intro: 'I will set up Lead Intelligence so you land on the right starting point instead of a generic screen.',
        questions: [
          {
            id: 'lead_type',
            prompt: 'What kind of leads should we focus on first?',
            options: [
              { id: 'companies', label: 'Target companies', description: 'Find ICP-fit accounts first.' },
              { id: 'buyers', label: 'Decision-makers', description: 'Prioritize contacts inside target accounts.' },
              { id: 'existing', label: 'Existing list', description: 'Work from a list you already have.' },
            ],
          },
          {
            id: 'priority',
            prompt: 'What matters most for this run?',
            options: [
              { id: 'quality', label: 'Lead quality', description: 'Bias toward higher-fit prospects.' },
              { id: 'volume', label: 'Lead volume', description: 'Bias toward more total results.' },
              { id: 'speed', label: 'Speed', description: 'Get to a usable list quickly.' },
            ],
          },
        ],
        connectors: ['Apollo', 'Hunter'],
        launchTitle: 'Lead Intelligence',
        firstAction: 'Start with ICP Fetch and review the suggested lead set.',
      }
    case 'lead-intelligence:Enrich existing leads':
      return {
        intro: 'I will prepare Lead Intelligence for enrichment so you can go straight to the correct step.',
        questions: [
          {
            id: 'source',
            prompt: 'What are you enriching today?',
            options: [
              { id: 'csv', label: 'CSV or spreadsheet', description: 'Upload or paste an existing lead list.' },
              { id: 'crm', label: 'CRM export', description: 'Bring in records from your current system.' },
              { id: 'mixed', label: 'Mixed source list', description: 'Use a manually compiled lead set.' },
            ],
          },
          {
            id: 'missing_fields',
            prompt: 'Which fields matter most?',
            options: [
              { id: 'contact', label: 'Email and phone', description: 'Prioritize contactability.' },
              { id: 'firmographic', label: 'Company data', description: 'Fill in role, company, and fit context.' },
              { id: 'both', label: 'Both', description: 'Enrich contact and company details together.' },
            ],
          },
        ],
        connectors: ['Apollo'],
        launchTitle: 'Lead Intelligence',
        firstAction: 'Open Enrich and load the list you want to complete.',
      }
    case 'paid-ads:Run Paid Ads':
      return {
        intro: 'I will stage Paid Ads so you land in campaign planning with the right framing.',
        questions: [
          {
            id: 'objective',
            prompt: 'What is the campaign objective?',
            options: [
              { id: 'leads', label: 'Generate leads', description: 'Focus on pipeline and form fills.' },
              { id: 'traffic', label: 'Drive traffic', description: 'Focus on visits and landing-page sessions.' },
              { id: 'awareness', label: 'Build awareness', description: 'Focus on reach and message exposure.' },
            ],
          },
          {
            id: 'channel',
            prompt: 'Which channel should we prioritize?',
            options: [
              { id: 'google', label: 'Google Ads', description: 'Intent-led search and demand capture.' },
              { id: 'meta', label: 'Meta Ads', description: 'Paid social and creative testing.' },
              { id: 'linkedin', label: 'LinkedIn Ads', description: 'B2B audience targeting and lead gen.' },
            ],
          },
        ],
        connectors: ['Google Ads', 'Meta Ads', 'LinkedIn Ads', 'GA4'],
        launchTitle: 'Paid Ads',
        firstAction: 'Use the create flow to set campaign structure, targeting, and budget.',
      }
    case 'ad-creative:Generate ad creatives':
      return {
        intro: 'I will take you into Paid Ads with the creative tab ready so you can skip the generic setup.',
        questions: [
          {
            id: 'format',
            prompt: 'What creative do you need first?',
            options: [
              { id: 'copy', label: 'Ad copy', description: 'Generate headlines, descriptions, and body copy.' },
              { id: 'angles', label: 'Creative angles', description: 'Explore hooks and positioning directions.' },
              { id: 'variants', label: 'Test variants', description: 'Create multiple options for experimentation.' },
            ],
          },
          {
            id: 'platform',
            prompt: 'Where will this run?',
            options: [
              { id: 'google', label: 'Google', description: 'Search and performance-driven copy.' },
              { id: 'meta', label: 'Meta', description: 'Social-first creative messaging.' },
              { id: 'linkedin', label: 'LinkedIn', description: 'B2B audience-focused creative.' },
            ],
          },
        ],
        connectors: ['Google Ads', 'Meta Ads', 'LinkedIn Ads'],
        launchTitle: 'Paid Ads',
        firstAction: 'Start in the creative workspace and generate the first set of variants.',
      }
    case 'budget-optimization:Optimize ROAS (Return on Ad Spend)':
      return {
        intro: 'I will tee up Budget Optimization so the analysis opens with a ROAS-first framing.',
        questions: [
          {
            id: 'channel',
            prompt: 'Which ad channels should we optimize first?',
            options: [
              { id: 'meta', label: 'Meta Ads', description: 'Focus on paid social performance and wasted spend.' },
              { id: 'google', label: 'Google Ads', description: 'Focus on search and intent-driven efficiency.' },
              { id: 'both', label: 'Both', description: 'Compare and rebalance across Meta and Google.' },
            ],
          },
          {
            id: 'focus',
            prompt: 'What matters most right now?',
            options: [
              { id: 'waste', label: 'Lower wasted spend', description: 'Find inefficient spend and where to cut first.' },
              { id: 'conversions', label: 'Increase conversions', description: 'Preserve scale while improving return.' },
              { id: 'top_campaigns', label: 'Improve top campaigns', description: 'Push more return from the campaigns already working.' },
            ],
          },
          {
            id: 'timeframe',
            prompt: 'What time horizon should we use?',
            options: [
              { id: 'last_7_days', label: 'Last 7 days', description: 'Use the latest performance signal.' },
              { id: 'last_30_days', label: 'Last 30 days', description: 'Balance recency with more stable data.' },
              { id: 'month_to_date', label: 'This month', description: 'Optimize against the current month view.' },
            ],
          },
        ],
        connectors: ['Google Ads', 'Meta Ads', 'GA4', 'TikTok Ads'],
        launchTitle: 'Budget Optimization',
        firstAction: 'Review the ROAS diagnosis and shift budget toward higher-return channels.',
      }
    case 'performance-scorecard:Diagnose Performance':
    case 'performance-scorecard:Measure marketing performance':
      return {
        intro: 'I will stage the analytics view around the channels and timeframe that matter, so you land on diagnosis instead of a generic dashboard.',
        questions: [
          {
            id: 'performance_scope',
            prompt: 'Which performance sources should we analyze first?',
            options: [
              { id: 'full_funnel', label: 'Full funnel', description: 'Combine web, search, video, and social signals.' },
              { id: 'web_search', label: 'Web + search', description: 'Focus on GA4, Search Console, and website traffic.' },
              { id: 'social_video', label: 'Social + video', description: 'Focus on YouTube and social publishing channels.' },
            ],
          },
          {
            id: 'performance_focus',
            prompt: 'What do you need from this analysis?',
            options: [
              { id: 'winners', label: 'Find winners', description: 'Surface top-performing channels and content quickly.' },
              { id: 'dropoffs', label: 'Find drop-offs', description: 'See what is underperforming and why.' },
              { id: 'next_moves', label: 'Decide next moves', description: 'Turn channel signals into a clear action plan.' },
            ],
          },
          {
            id: 'performance_timeframe',
            prompt: 'What timeframe should we use?',
            options: [
              { id: 'last_7_days', label: 'Last 7 days', description: 'Spot recent shifts fast.' },
              { id: 'last_30_days', label: 'Last 30 days', description: 'Use a balanced operating window.' },
              { id: 'last_90_days', label: 'Last 90 days', description: 'Look for more durable channel patterns.' },
            ],
          },
        ],
        connectors: ['GA4', 'GSC', 'YouTube', 'Facebook', 'Instagram', 'LinkedIn', 'Reddit'],
        launchTitle: 'Performance Scorecard',
        firstAction: 'Review the channel diagnosis, top-performing content, and next actions.',
      }
    case 'cro:Improve Conversion':
    case 'cro:Increase conversion rate':
      return {
        intro: 'I will guide you into CRO with the right optimization lens already in place.',
        questions: [
          {
            id: 'surface',
            prompt: 'What should we improve first?',
            options: [
              { id: 'landing', label: 'Landing page', description: 'Audit page clarity and conversion flow.' },
              { id: 'form', label: 'Lead form', description: 'Reduce friction in form completion.' },
              { id: 'signup', label: 'Signup flow', description: 'Improve trial or account creation.' },
            ],
          },
          {
            id: 'goal',
            prompt: 'What is the main outcome?',
            options: [
              { id: 'more_conversions', label: 'More conversions', description: 'Increase total completion rate.' },
              { id: 'better_quality', label: 'Better quality', description: 'Improve lead or signup quality.' },
              { id: 'faster_learning', label: 'Faster learning', description: 'Set up clear experiments quickly.' },
            ],
          },
        ],
        launchTitle: 'CRO',
        firstAction: 'Start with the priority surface and review the highest-friction drop-off points.',
      }
    case 'ai-content:Create Content':
    case 'ai-content:Produce brand content':
      return {
        intro: 'I will take you into content creation with the right content type and distribution focus.',
        questions: [
          {
            id: 'format',
            prompt: 'What format should we create first?',
            options: [
              { id: 'text', label: 'Blog or text', description: 'Create written content such as posts, blogs, emails, or page copy.' },
              { id: 'image', label: 'Image creative', description: 'Create graphics and visual assets for campaigns or social.' },
              { id: 'video', label: 'Video', description: 'Create motion content for social, YouTube, or campaign use.' },
            ],
          },
          {
            id: 'channel',
            prompt: 'Where will this content go first?',
            options: [
              { id: 'website_blog', label: 'Website or blog', description: 'Prepare content for pages, blogs, or SEO-driven publishing.' },
              { id: 'linkedin', label: 'LinkedIn', description: 'Create content tailored to LinkedIn distribution.' },
              { id: 'facebook_instagram', label: 'Facebook + Instagram', description: 'Create social-first content for Meta surfaces.' },
              { id: 'youtube', label: 'YouTube', description: 'Create video content for YouTube publishing.' },
              { id: 'email', label: 'Email', description: 'Create campaign or nurture content for email.' },
            ],
          },
          {
            id: 'objective',
            prompt: 'What should this content do?',
            options: [
              { id: 'awareness', label: 'Drive awareness', description: 'Introduce the brand or message to more people.' },
              { id: 'leads', label: 'Generate leads', description: 'Move readers or viewers into pipeline.' },
              { id: 'offer', label: 'Explain the offer', description: 'Clarify value, proof, and why someone should care.' },
              { id: 'seo', label: 'Improve SEO', description: 'Target discoverability and search demand.' },
            ],
          },
          {
            id: 'deliverable',
            prompt: 'What should we make first?',
            options: [
              { id: 'draft', label: 'Core draft', description: 'Start with the main draft for this channel.' },
              { id: 'variant', label: 'Variant set', description: 'Create multiple options for testing or adaptation.' },
            ],
          },
        ],
        launchTitle: 'AI Content',
        firstAction: 'Choose the first asset type and generate a draft grounded in your current brand context.',
      }
    case 'email-sequence:Write email sequences':
      return {
        intro: 'I will open Email Sequences with the right lifecycle motion already framed, so you start from a real sequence brief instead of a blank draft.',
        questions: [
          {
            id: 'sequence_type',
            prompt: 'What kind of email sequence should we build first?',
            options: [
              { id: 'nurture', label: 'Nurture', description: 'Warm leads or subscribers toward a next step.' },
              { id: 'onboarding', label: 'Onboarding', description: 'Help new users activate and reach value faster.' },
              { id: 'outbound', label: 'Outbound', description: 'Write direct outreach for target accounts or prospects.' },
            ],
          },
          {
            id: 'sequence_audience',
            prompt: 'Who is this sequence for?',
            options: [
              { id: 'new_leads', label: 'New leads', description: 'People who have just entered the funnel.' },
              { id: 'trial_users', label: 'Trial or new users', description: 'People who need activation and early momentum.' },
              { id: 'customers', label: 'Existing customers', description: 'People who need expansion, retention, or re-engagement.' },
            ],
          },
          {
            id: 'sequence_goal',
            prompt: 'What should this sequence accomplish?',
            options: [
              { id: 'activate', label: 'Activate', description: 'Educate, build trust, and move people into action.' },
              { id: 'convert', label: 'Convert', description: 'Drive reply, demo, signup, or purchase.' },
              { id: 'reengage', label: 'Re-engage', description: 'Bring quiet users or leads back into motion.' },
            ],
          },
        ],
        connectors: ['Mailchimp', 'Klaviyo', 'Instantly', 'SendGrid', 'HubSpot', 'Google Sheets'],
        launchTitle: 'Email Sequences',
        firstAction: 'Generate the first lifecycle sequence and review the message arc, CTA flow, and send plan.',
      }
    case 'messaging:Sharpen messaging':
      return {
        intro: 'I will open Messaging with the right surface and copy problem already framed, so you start from a real messaging brief instead of a generic audit.',
        questions: [
          {
            id: 'messaging_surface',
            prompt: 'Where should we sharpen messaging first?',
            options: [
              { id: 'website', label: 'Website or landing page', description: 'Improve headlines, value prop, and CTA clarity.' },
              { id: 'email', label: 'Email or lifecycle', description: 'Improve nurture, onboarding, or campaign messaging.' },
              { id: 'ads', label: 'Ads and campaigns', description: 'Tighten hooks, claims, and conversion-focused copy.' },
            ],
          },
          {
            id: 'messaging_problem',
            prompt: 'What is the main copy problem?',
            options: [
              { id: 'unclear', label: 'Unclear value', description: 'The message does not explain why someone should care.' },
              { id: 'weak', label: 'Weak differentiation', description: 'The copy sounds generic or interchangeable.' },
              { id: 'conversion', label: 'Poor conversion pull', description: 'The copy does not push people clearly toward action.' },
            ],
          },
          {
            id: 'messaging_goal',
            prompt: 'What should the sharper messaging achieve?',
            options: [
              { id: 'clarify', label: 'Clarify the message', description: 'Make the offer and value proposition easier to understand.' },
              { id: 'differentiate', label: 'Differentiate more strongly', description: 'Create a stronger reason to choose us.' },
              { id: 'convert', label: 'Drive more action', description: 'Increase reply, click, signup, or conversion intent.' },
            ],
          },
        ],
        launchTitle: 'Messaging',
        firstAction: 'Generate the sharper message architecture and review the strongest rewrites first.',
      }
    case 'launch-strategy:Plan a launch':
      return {
        intro: 'I will open Launch Strategy with the right launch motion already framed, so you start from a real launch brief instead of a generic planning screen.',
        questions: [
          {
            id: 'launch_type',
            prompt: 'What are we launching?',
            options: [
              { id: 'product', label: 'Product or feature', description: 'Plan a product, feature, or major release launch.' },
              { id: 'campaign', label: 'Campaign or offer', description: 'Plan a GTM push for an offer, promotion, or campaign.' },
              { id: 'brand', label: 'Brand or positioning move', description: 'Plan a broader messaging, brand, or category push.' },
            ],
          },
          {
            id: 'launch_audience',
            prompt: 'Who is the first audience?',
            options: [
              { id: 'customers', label: 'Existing customers', description: 'Focus on activation, adoption, or expansion from the current base.' },
              { id: 'pipeline', label: 'Leads and pipeline', description: 'Focus on prospects, pipeline, and demand already in motion.' },
              { id: 'market', label: 'New market audience', description: 'Focus on net-new awareness and demand creation.' },
            ],
          },
          {
            id: 'launch_horizon',
            prompt: 'What planning window should we use?',
            options: [
              { id: 'week', label: '1 week', description: 'Prepare a short, fast launch sprint.' },
              { id: 'month', label: '1 month', description: 'Plan a fuller pre-launch, launch, and post-launch arc.' },
              { id: 'quarter', label: 'Quarter', description: 'Structure a broader GTM program with more runway.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Mailchimp', 'Klaviyo', 'LinkedIn', 'Facebook', 'Instagram', 'Google Sheets'],
        launchTitle: 'Launch Strategy',
        firstAction: 'Generate the launch plan, then review the rollout phases, channels, and core launch assets.',
      }
    case 'sales-enablement:Support the sales team':
      return {
        intro: 'I will open Sales Enablement with the right sales motion already framed, so you start from a concrete asset brief instead of a generic writing workspace.',
        questions: [
          {
            id: 'sales_asset',
            prompt: 'What should we build first?',
            options: [
              { id: 'one_pager', label: 'One-pager', description: 'Create a concise buyer-facing leave-behind or summary asset.' },
              { id: 'battlecard', label: 'Battle card', description: 'Prepare objection handling and competitor response for sales calls.' },
              { id: 'sequence', label: 'Outbound sequence', description: 'Create a seller-ready outreach or follow-up sequence.' },
            ],
          },
          {
            id: 'sales_audience',
            prompt: 'Who needs this asset most?',
            options: [
              { id: 'sellers', label: 'Sales reps', description: 'Arm reps with practical talk tracks and buyer-facing material.' },
              { id: 'buyers', label: 'Buyers and prospects', description: 'Create an asset the buyer can read or receive directly.' },
              { id: 'leadership', label: 'Sales leadership', description: 'Prepare material that helps managers guide deals and messaging.' },
            ],
          },
          {
            id: 'sales_motion',
            prompt: 'What deal motion matters most?',
            options: [
              { id: 'discovery', label: 'Early discovery', description: 'Support first calls, qualification, and problem framing.' },
              { id: 'competitive', label: 'Competitive deal', description: 'Support active deals with objections and comparison pressure.' },
              { id: 'late_stage', label: 'Late-stage close', description: 'Support proof, urgency, and final decision movement.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Zoho CRM', 'Mailchimp', 'Klaviyo', 'Google Sheets'],
        launchTitle: 'Sales Enablement',
        firstAction: 'Generate the enablement brief, then review the core asset and the first seller-ready copy.',
      }
    case 'positioning:Clarify your positioning':
      return {
        intro: 'I will open Positioning with the right strategic question already framed, so you start from a clear positioning brief instead of a raw strategy workspace.',
        questions: [
          {
            id: 'positioning_focus',
            prompt: 'What positioning problem is most urgent?',
            options: [
              { id: 'differentiate', label: 'Differentiate', description: 'Stand apart from competitors and generic alternatives.' },
              { id: 'clarify', label: 'Clarify value', description: 'Explain the value and category fit more clearly.' },
              { id: 'reframe', label: 'Reframe category', description: 'Own a sharper angle or reposition the company in the market.' },
            ],
          },
          {
            id: 'positioning_buyer',
            prompt: 'Who should this positioning land with first?',
            options: [
              { id: 'execs', label: 'Executives', description: 'Position the product for strategic or budget-owning decision makers.' },
              { id: 'operators', label: 'Operators', description: 'Position it for day-to-day users and functional teams.' },
              { id: 'technical', label: 'Technical buyers', description: 'Position it for technical evaluators or implementation stakeholders.' },
            ],
          },
          {
            id: 'positioning_outcome',
            prompt: 'What should the sharper positioning unlock?',
            options: [
              { id: 'pipeline', label: 'More pipeline', description: 'Make demand generation and conversion easier.' },
              { id: 'sales', label: 'Better sales motion', description: 'Help the team win deals with clearer differentiation.' },
              { id: 'category', label: 'Stronger market story', description: 'Create a clearer category narrative and strategic direction.' },
            ],
          },
        ],
        connectors: ['GA4', 'HubSpot', 'Google Sheets', 'LinkedIn'],
        launchTitle: 'Positioning',
        firstAction: 'Generate the positioning brief, then review the sharper angle, message hierarchy, and next strategic moves.',
      }
    case 'offer-design:Strengthen your offer':
      return {
        intro: 'I will open Offer Design with the right conversion pressure already framed, so you start from a concrete offer brief instead of a generic audit shell.',
        questions: [
          {
            id: 'offer_problem',
            prompt: 'What is the biggest offer problem?',
            options: [
              { id: 'clarity', label: 'Weak clarity', description: 'People do not quickly understand the value or promise.' },
              { id: 'pricing', label: 'Pricing friction', description: 'Packaging, tiers, or price structure is creating hesitation.' },
              { id: 'cta', label: 'Weak CTA pull', description: 'The next action is generic, soft, or not outcome-focused enough.' },
            ],
          },
          {
            id: 'offer_lever',
            prompt: 'What should we improve first?',
            options: [
              { id: 'message', label: 'Offer message', description: 'Strengthen the promise, outcome, and buyer-facing articulation.' },
              { id: 'package', label: 'Packaging', description: 'Restructure the entry offer, core offer, or upsell path.' },
              { id: 'action', label: 'Call to action', description: 'Make the next step more specific, compelling, and conversion-ready.' },
            ],
          },
          {
            id: 'offer_goal',
            prompt: 'What should the stronger offer unlock?',
            options: [
              { id: 'leads', label: 'More leads', description: 'Increase form fills, demos, or inbound interest.' },
              { id: 'sales', label: 'Better close rate', description: 'Help prospects move through sales with less friction.' },
              { id: 'value', label: 'Higher perceived value', description: 'Make the offer feel more premium and worth acting on.' },
            ],
          },
        ],
        connectors: ['GA4', 'HubSpot', 'Google Sheets'],
        launchTitle: 'Offer Design',
        firstAction: 'Generate the stronger offer structure, then review the promise, pricing friction, and CTA direction first.',
      }
    case 'landing-pages:Build landing pages':
      return {
        intro: 'I will open Landing Pages with the right page brief already framed, so you start from a conversion page direction instead of a generic CRO workspace.',
        questions: [
          {
            id: 'page_type',
            prompt: 'What page should we build first?',
            options: [
              { id: 'offer', label: 'Offer page', description: 'Create a page focused on one offer, service, or package.' },
              { id: 'campaign', label: 'Campaign page', description: 'Build a landing page for ads, launches, or campaign traffic.' },
              { id: 'signup', label: 'Signup page', description: 'Build a page optimized to capture signups, demos, or requests.' },
            ],
          },
          {
            id: 'page_goal',
            prompt: 'What should the page do best?',
            options: [
              { id: 'convert', label: 'Drive conversions', description: 'Maximize form fills, demos, or signups from focused traffic.' },
              { id: 'qualify', label: 'Qualify buyers', description: 'Attract better-fit prospects and reduce weak intent.' },
              { id: 'explain', label: 'Explain the offer', description: 'Clarify the value proposition and remove confusion.' },
            ],
          },
          {
            id: 'page_source',
            prompt: 'Where will the traffic come from?',
            options: [
              { id: 'ads', label: 'Paid campaigns', description: 'Build around ad traffic and focused message match.' },
              { id: 'email', label: 'Email or lifecycle', description: 'Build for warmer demand coming from email or nurture.' },
              { id: 'social', label: 'Social and content', description: 'Build for top- or mid-funnel audience traffic.' },
            ],
          },
        ],
        connectors: ['GA4', 'HubSpot', 'Google Sheets'],
        launchTitle: 'Landing Pages',
        firstAction: 'Generate the page brief, then review the structure, conversion logic, and the first copy direction.',
      }
    case 'ab-test:Test new variants':
      return {
        intro: 'I will open Experiment Studio with the right test pressure already framed, so you start from a real experiment brief instead of a generic significance prompt.',
        questions: [
          {
            id: 'test_surface',
            prompt: 'What should we test first?',
            options: [
              { id: 'page', label: 'Landing page', description: 'Test page structure, headlines, or CTA flow.' },
              { id: 'email', label: 'Email', description: 'Test subject lines, messaging, or CTA progression.' },
              { id: 'ads', label: 'Ads', description: 'Test creative angles, copy, or ad hooks.' },
            ],
          },
          {
            id: 'test_goal',
            prompt: 'What should the experiment improve?',
            options: [
              { id: 'conversion', label: 'Conversion rate', description: 'Increase clicks, signups, demos, or form completion.' },
              { id: 'quality', label: 'Lead quality', description: 'Improve fit and reduce weak-intent responses.' },
              { id: 'learning', label: 'Learning speed', description: 'Learn which angle or message works fastest.' },
            ],
          },
          {
            id: 'test_mode',
            prompt: 'What do you need right now?',
            options: [
              { id: 'hypothesis', label: 'Hypotheses', description: 'Generate test ideas and the best first variants.' },
              { id: 'evaluation', label: 'Evaluate results', description: 'Judge a test that is already running.' },
              { id: 'both', label: 'Both', description: 'Design the experiment and define how to read the result.' },
            ],
          },
        ],
        connectors: ['GA4', 'Google Sheets', 'HubSpot'],
        launchTitle: 'Experiment Studio',
        firstAction: 'Generate the experiment brief, then review the strongest variants and the evaluation logic.',
      }
    case 'seo-llmo:Improve organic visibility':
      return {
        intro: 'I will open Organic Visibility with the right search brief already framed, so you start from a real visibility question instead of a blank SEO prompt.',
        questions: [
          {
            id: 'seo_focus',
            prompt: 'What should we improve first?',
            options: [
              { id: 'rankings', label: 'Search rankings', description: 'Focus on SEO performance, keyword gaps, and content opportunities.' },
              { id: 'llm', label: 'LLM visibility', description: 'Focus on answer-engine discoverability and AI citation readiness.' },
              { id: 'both', label: 'Both', description: 'Unify classic SEO and LLM discoverability into one visibility plan.' },
            ],
          },
          {
            id: 'seo_surface',
            prompt: 'Where should we focus first?',
            options: [
              { id: 'homepage', label: 'Homepage', description: 'Improve the primary page that frames the company and offer.' },
              { id: 'content', label: 'Content library', description: 'Improve blog, educational, or topical content visibility.' },
              { id: 'offer', label: 'Offer pages', description: 'Improve service, solution, or conversion-page visibility.' },
            ],
          },
          {
            id: 'seo_goal',
            prompt: 'What outcome matters most?',
            options: [
              { id: 'traffic', label: 'More traffic', description: 'Grow qualified organic sessions and visibility.' },
              { id: 'coverage', label: 'Better topic coverage', description: 'Close keyword and intent gaps across the content footprint.' },
              { id: 'authority', label: 'Stronger authority', description: 'Improve trust, citations, and search relevance signals.' },
            ],
          },
        ],
        connectors: ['GA4', 'GSC', 'Google Sheets'],
        launchTitle: 'Organic Visibility',
        firstAction: 'Generate the visibility brief, then review the search gaps, LLM opportunities, and the first content or page moves.',
      }
    case 'audience-profiles:Define target audiences':
      return {
        intro: 'I will open Audience Profiles with the right buyer framing already set, so you start from a real audience brief instead of a blank ICP prompt.',
        questions: [
          {
            id: 'audience_scope',
            prompt: 'What audience work do you need first?',
            options: [
              { id: 'icp', label: 'Core ICPs', description: 'Define the primary customer profiles the business should focus on.' },
              { id: 'segments', label: 'Segments', description: 'Break the market into sharper buyer or company segments.' },
              { id: 'lookalikes', label: 'Lookalikes', description: 'Define adjacent audiences worth testing beyond the core ICP.' },
            ],
          },
          {
            id: 'audience_buyer',
            prompt: 'Which buyer layer matters most?',
            options: [
              { id: 'decision', label: 'Decision makers', description: 'Focus on budget owners and strategic buyers.' },
              { id: 'operators', label: 'Operators', description: 'Focus on end users, teams, and day-to-day functional buyers.' },
              { id: 'champions', label: 'Internal champions', description: 'Focus on the people who influence or carry the deal internally.' },
            ],
          },
          {
            id: 'audience_goal',
            prompt: 'What should the profiles help with?',
            options: [
              { id: 'outbound', label: 'Outbound and lead gen', description: 'Support targeting, prospecting, and acquisition.' },
              { id: 'positioning', label: 'Messaging and positioning', description: 'Clarify who the story should land with first.' },
              { id: 'ads', label: 'Paid and audience targeting', description: 'Support campaign audience definition and creative targeting.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Zoho CRM', 'Google Sheets', 'LinkedIn'],
        launchTitle: 'Audience Profiles',
        firstAction: 'Generate the audience brief, then review the ICPs, segment logic, and messaging implications.',
      }
    case 'lead-outreach:Build outreach sequences':
      return {
        intro: 'I will open Outreach with the right prospecting brief already framed, so you start from a real outreach motion instead of a blank sales prompt.',
        questions: [
          {
            id: 'outreach_channel',
            prompt: 'Which outreach motion matters most?',
            options: [
              { id: 'email', label: 'Email-first', description: 'Prioritize outbound email sequences and follow-ups.' },
              { id: 'linkedin', label: 'LinkedIn-first', description: 'Prioritize social-first outreach and connection messages.' },
              { id: 'multi', label: 'Multitouch', description: 'Combine LinkedIn and email into one coordinated sequence.' },
            ],
          },
          {
            id: 'outreach_target',
            prompt: 'Who are we reaching out to first?',
            options: [
              { id: 'decision', label: 'Decision makers', description: 'Target budget owners and primary decision makers.' },
              { id: 'champions', label: 'Champions', description: 'Target the people who will carry the deal internally.' },
              { id: 'warm', label: 'Warm accounts', description: 'Target warmer prospects already showing interest or engagement.' },
            ],
          },
          {
            id: 'outreach_goal',
            prompt: 'What should the sequence do?',
            options: [
              { id: 'meeting', label: 'Book meetings', description: 'Optimize the sequence to land first calls or demos.' },
              { id: 'reply', label: 'Earn replies', description: 'Optimize for response rate and conversation starts.' },
              { id: 'qualification', label: 'Qualify interest', description: 'Use outreach to surface intent and fit faster.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Zoho CRM', 'Instantly', 'Mailchimp', 'Google Sheets', 'LinkedIn'],
        launchTitle: 'Lead Outreach',
        firstAction: 'Generate the outreach brief, then review the sequence arc, personalization logic, and first-touch messages.',
      }
    case 'lead-magnets:Create lead magnets':
      return {
        intro: 'I will open Lead Magnets with the right demand-capture brief already framed, so you start from a concrete opt-in concept instead of a blank content workspace.',
        questions: [
          {
            id: 'magnet_type',
            prompt: 'What should we create first?',
            options: [
              { id: 'guide', label: 'Guide or playbook', description: 'Create a deeper educational asset with clear takeaways.' },
              { id: 'checklist', label: 'Checklist or template', description: 'Create a fast, practical asset people can use immediately.' },
              { id: 'calculator', label: 'Framework or tool', description: 'Create a value-driven resource built around decision support.' },
            ],
          },
          {
            id: 'magnet_audience',
            prompt: 'Who should this magnet pull in?',
            options: [
              { id: 'top_funnel', label: 'Top-of-funnel audience', description: 'Capture colder demand and educate new visitors.' },
              { id: 'consideration', label: 'In-market buyers', description: 'Capture people already evaluating solutions or approaches.' },
              { id: 'high_intent', label: 'High-intent prospects', description: 'Capture people close to a demo, call, or commercial conversation.' },
            ],
          },
          {
            id: 'magnet_goal',
            prompt: 'What should the magnet do best?',
            options: [
              { id: 'capture', label: 'Capture more leads', description: 'Maximize opt-ins and form completions.' },
              { id: 'qualify', label: 'Improve lead quality', description: 'Attract better-fit prospects with clearer intent.' },
              { id: 'nurture', label: 'Support nurture', description: 'Give the team a stronger asset to warm and educate leads.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Mailchimp', 'Klaviyo', 'Google Sheets'],
        launchTitle: 'Lead Magnets',
        firstAction: 'Generate the lead-magnet brief, then review the concept, structure, and opt-in conversion logic.',
      }
    case 'marketing-audit:Audit your overall marketing':
      return {
        intro: 'I will open Marketing Audit with the right operating lens already framed, so you start from a real audit brief instead of a generic scorecard workspace.',
        questions: [
          {
            id: 'audit_scope',
            prompt: 'What should the audit focus on first?',
            options: [
              { id: 'full', label: 'Full stack', description: 'Review the overall marketing system and the main gaps across channels.' },
              { id: 'website', label: 'Website and funnel', description: 'Focus on site, conversion flow, and trust or message issues.' },
              { id: 'growth', label: 'Growth channels', description: 'Focus on acquisition, content, email, and demand generation mechanics.' },
            ],
          },
          {
            id: 'audit_priority',
            prompt: 'What kind of answer do you need most?',
            options: [
              { id: 'quickwins', label: 'Quick wins', description: 'Find the fastest high-leverage improvements to ship first.' },
              { id: 'roadmap', label: 'Roadmap', description: 'Build a clearer 30-60-90 day plan with priorities.' },
              { id: 'score', label: 'Score and diagnosis', description: 'Get the clearest diagnostic view of what is weak or missing.' },
            ],
          },
          {
            id: 'audit_context',
            prompt: 'What should guide the audit?',
            options: [
              { id: 'analytics', label: 'Analytics and performance', description: 'Lean on actual performance signals and measurable issues.' },
              { id: 'messaging', label: 'Messaging and funnel', description: 'Lean on message clarity, offer, and conversion mechanics.' },
              { id: 'operating', label: 'Operating model', description: 'Lean on system gaps, process weaknesses, and channel execution.' },
            ],
          },
        ],
        connectors: ['GA4', 'Google Sheets', 'HubSpot', 'Zoho CRM', 'Mailchimp', 'Klaviyo', 'Shopify'],
        launchTitle: 'Marketing Audit',
        firstAction: 'Generate the audit brief, then review the score, the core gaps, and the highest-leverage next actions.',
      }
    case 'channel-health:Check channel health':
      return {
        intro: 'I will open Channel Health with the right distribution lens already framed, so you start from a real channel brief instead of a generic ops prompt.',
        questions: [
          {
            id: 'channel_scope',
            prompt: 'Which channel set should we review first?',
            options: [
              { id: 'paid', label: 'Paid channels', description: 'Focus on Google, Meta, LinkedIn, and paid distribution.' },
              { id: 'owned', label: 'Owned channels', description: 'Focus on site, lifecycle, and content-driven distribution.' },
              { id: 'all', label: 'Full mix', description: 'Review the full channel mix and where momentum is weak or strong.' },
            ],
          },
          {
            id: 'channel_problem',
            prompt: 'What do you need to understand most?',
            options: [
              { id: 'winners', label: 'What is working', description: 'Identify the strongest channels and where momentum is real.' },
              { id: 'gaps', label: 'What is weak', description: 'Identify underperforming channels and execution gaps.' },
              { id: 'allocation', label: 'Where to shift focus', description: 'Decide which channels to back, fix, or deprioritize.' },
            ],
          },
          {
            id: 'channel_horizon',
            prompt: 'What horizon should guide the review?',
            options: [
              { id: 'today', label: 'Today', description: 'Focus on immediate priorities and the next distribution moves.' },
              { id: 'week', label: 'This week', description: 'Focus on near-term channel actions and execution priorities.' },
              { id: 'month', label: 'This month', description: 'Focus on broader allocation and channel performance direction.' },
            ],
          },
        ],
        connectors: ['Google Ads', 'Meta Ads', 'LinkedIn Ads', 'GA4', 'Google Sheets'],
        launchTitle: 'Channel Health',
        firstAction: 'Generate the channel brief, then review the strongest channels, weak spots, and the reallocation moves first.',
      }
    case 'social-calendar:Plan your social calendar':
      return {
        intro: 'I will open a dedicated calendar-planning workspace so you land on a real publishing rhythm instead of a generic content shell.',
        questions: [
          {
            id: 'calendar_channels',
            prompt: 'Which channels should the calendar cover first?',
            options: [
              { id: 'linkedin', label: 'LinkedIn first', description: 'Build around B2B thought leadership and campaign amplification.' },
              { id: 'instagram', label: 'Instagram first', description: 'Plan a more visual feed, reel, and story rhythm.' },
              { id: 'multi', label: 'Multi-channel mix', description: 'Coordinate one calendar across the main social channels together.' },
            ],
          },
          {
            id: 'calendar_motion',
            prompt: 'What should this calendar do most?',
            options: [
              { id: 'education', label: 'Educate and build trust', description: 'Bias toward authority, clarity, and repeated value.' },
              { id: 'campaign', label: 'Support a campaign', description: 'Align the calendar to one active offer, launch, or push.' },
              { id: 'engagement', label: 'Drive engagement', description: 'Bias toward interaction, conversation, and community response.' },
            ],
          },
          {
            id: 'calendar_horizon',
            prompt: 'How far out should we plan?',
            options: [
              { id: 'two_weeks', label: 'Next 2 weeks', description: 'Build a short, near-term publishing plan.' },
              { id: 'month', label: 'This month', description: 'Plan a fuller monthly rhythm and coverage.' },
              { id: 'quarter', label: 'Quarter arc', description: 'Create a broader campaign rhythm and content-pillar view.' },
            ],
          },
        ],
        connectors: ['LinkedIn', 'Instagram', 'Facebook', 'YouTube', 'Canva', 'Google Sheets'],
        launchTitle: 'Social Calendar',
        firstAction: 'Generate the first calendar draft, then review the publishing rhythm, channel mix, and content priorities.',
      }
    case 'social-media:Run Social Media':
      return {
        intro: 'I will set up the social campaign workspace so you land on the right channels, format mix, and campaign brief instead of a generic builder.',
        questions: [
          {
            id: 'social_channels',
            prompt: 'Which channel mix should we plan first?',
            options: [
              { id: 'linkedin', label: 'LinkedIn', description: 'Focus on a LinkedIn-native campaign and publishing rhythm.' },
              { id: 'meta', label: 'Facebook + Instagram', description: 'Plan a Meta social campaign across feed, carousel, or reels.' },
              { id: 'youtube', label: 'YouTube', description: 'Plan longer-form or short-form YouTube publishing.' },
              { id: 'multi', label: 'Multichannel', description: 'Coordinate one campaign across multiple social channels.' },
            ],
          },
          {
            id: 'social_objective',
            prompt: 'What should this social campaign do?',
            options: [
              { id: 'awareness', label: 'Build awareness', description: 'Increase reach, recall, and message exposure.' },
              { id: 'leads', label: 'Generate leads', description: 'Turn social activity into inbound interest or pipeline.' },
              { id: 'engagement', label: 'Increase engagement', description: 'Drive more interaction, response, and audience activity.' },
              { id: 'nurture', label: 'Nurture the audience', description: 'Educate and warm existing followers over time.' },
            ],
          },
          {
            id: 'social_format',
            prompt: 'What content mix should we prepare first?',
            options: [
              { id: 'posts', label: 'Posts and captions', description: 'Start with text-first social publishing.' },
              { id: 'visuals', label: 'Visual posts', description: 'Prioritise graphics, carousels, and social visuals.' },
              { id: 'video', label: 'Video campaign', description: 'Prioritise short-form or channel-native video assets.' },
            ],
          },
          {
            id: 'social_horizon',
            prompt: 'What planning horizon should we use?',
            options: [
              { id: 'week', label: '1 week', description: 'Prepare the immediate next publishing sprint.' },
              { id: 'two_weeks', label: '2 weeks', description: 'Build a fuller campaign sequence with room to iterate.' },
              { id: 'month', label: '1 month', description: 'Plan a broader campaign calendar and asset mix.' },
            ],
          },
        ],
        connectors: ['LinkedIn', 'Facebook', 'Instagram', 'YouTube', 'Reddit', 'Canva', 'HeyGen', 'Veo', 'ElevenLabs'],
        launchTitle: 'Social Media',
        firstAction: 'Review the campaign brief, channel mix, and first asset set before publishing.',
      }
    case 'churn-prevention:Retain Customers':
    case 'churn-prevention:Reduce churn':
      return {
        intro: 'I will set up the retention flow so you start with the right churn scenario and intervention.',
        questions: [
          {
            id: 'segment',
            prompt: 'Which customers are most urgent?',
            options: [
              { id: 'new', label: 'New customers', description: 'Improve activation and early retention.' },
              { id: 'at_risk', label: 'At-risk accounts', description: 'Recover users showing churn signals.' },
              { id: 'churned', label: 'Already churned', description: 'Focus on win-back opportunities.' },
            ],
          },
          {
            id: 'play',
            prompt: 'What kind of retention play do you need?',
            options: [
              { id: 'messaging', label: 'Better messaging', description: 'Rewrite lifecycle and save-touch copy.' },
              { id: 'offers', label: 'Offers and saves', description: 'Test incentives, pauses, or downgrades.' },
              { id: 'journeys', label: 'Lifecycle journeys', description: 'Activate the right retention sequence.' },
            ],
          },
        ],
        connectors: ['CRM', 'Email platform', 'Product analytics'],
        launchTitle: 'Churn Prevention',
        firstAction: 'Review the highest-risk segment and launch the recommended retention play.',
      }
    case 'user-engagement:Improve User Engagement':
    case 'user-engagement:Improve lifecycle engagement':
      return {
        intro: 'I will set up the engagement workflow so you start with the right user segment, engagement problem, and lifecycle motion.',
        questions: [
          {
            id: 'engagement_segment',
            prompt: 'Which users need engagement help first?',
            options: [
              { id: 'new_users', label: 'New users', description: 'Focus on activation, early value, and first habit formation.' },
              { id: 'active_users', label: 'Active users', description: 'Increase repeat usage, depth, and feature adoption.' },
              { id: 'dormant_users', label: 'Dormant users', description: 'Re-engage users who have gone quiet or are losing momentum.' },
            ],
          },
          {
            id: 'engagement_problem',
            prompt: 'What problem is most visible right now?',
            options: [
              { id: 'activation', label: 'Low activation', description: 'Users sign up but do not reach value quickly enough.' },
              { id: 'habit', label: 'Weak repeat usage', description: 'Users are not building a strong ongoing usage habit.' },
              { id: 'dropoff', label: 'Usage drop-off', description: 'Previously engaged users are becoming less active.' },
            ],
          },
          {
            id: 'engagement_motion',
            prompt: 'What engagement motion should we improve first?',
            options: [
              { id: 'onboarding', label: 'Onboarding journey', description: 'Tighten activation and the first-run experience.' },
              { id: 'lifecycle', label: 'Lifecycle messaging', description: 'Improve email, prompts, and nurture touchpoints.' },
              { id: 'reactivation', label: 'Reactivation play', description: 'Bring dormant users back with the right sequence and offer.' },
            ],
          },
          {
            id: 'engagement_channel',
            prompt: 'Which channels are available for this run?',
            options: [
              { id: 'email', label: 'Email', description: 'Use lifecycle email and nurture systems first.' },
              { id: 'product', label: 'In-product', description: 'Use in-app prompts, checklists, and usage triggers.' },
              { id: 'mixed', label: 'Email + product', description: 'Coordinate engagement across lifecycle and in-product touchpoints.' },
            ],
          },
        ],
        connectors: ['GA4', 'HubSpot', 'Zoho CRM', 'Mailchimp', 'Klaviyo', 'Product analytics'],
        launchTitle: 'User Engagement',
        firstAction: 'Review the engagement diagnosis and launch the first activation or re-engagement play.',
      }
    case 'unified-customer-view:Understand Customer Behavior':
    case 'unified-customer-view:Understand customer behavior':
      return {
        intro: 'I will set up the customer-view workflow so you start with the right question, customer lens, and data sources.',
        questions: [
          {
            id: 'customer_view_type',
            prompt: 'What kind of customer view do you need first?',
            options: [
              { id: 'segments', label: 'Customer segments', description: 'Understand how customers cluster by behaviour, value, and lifecycle state.' },
              { id: 'risk', label: 'Risk and churn signals', description: 'Find at-risk profiles, weak engagement patterns, and save opportunities.' },
              { id: 'opportunities', label: 'Expansion and growth', description: 'Surface upsell, referral, and lifecycle opportunities across customer groups.' },
            ],
          },
          {
            id: 'customer_view_question',
            prompt: 'What question should this answer?',
            options: [
              { id: 'what_changed', label: 'What changed?', description: 'Explain shifts in behaviour, engagement, or lifecycle state.' },
              { id: 'who_matters', label: 'Who matters most?', description: 'Identify the segments to prioritise now.' },
              { id: 'what_next', label: 'What should we do next?', description: 'Turn the customer view into concrete actions by segment.' },
            ],
          },
          {
            id: 'customer_view_systems',
            prompt: 'Which systems should we trust most for this run?',
            options: [
              { id: 'crm_lifecycle', label: 'CRM + lifecycle', description: 'Lean on CRM, email, and lifecycle signals first.' },
              { id: 'analytics', label: 'Analytics + usage', description: 'Lean on web, product, and usage signals first.' },
              { id: 'full_view', label: 'Full customer picture', description: 'Combine CRM, lifecycle, analytics, and sheet context together.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Zoho CRM', 'Mailchimp', 'Klaviyo', 'GA4', 'CSV import'],
        launchTitle: 'Unified Customer View',
        firstAction: 'Review the key customer segments, risk signals, and next actions by segment.',
      }
    case 'revenue-ops:Improve Revenue Ops':
    case 'revenue-ops:Improve revenue ops':
      return {
        intro: 'I will set up the revenue-ops workflow so you start with the right breakdown, systems, and funnel question.',
        questions: [
          {
            id: 'revops_problem',
            prompt: 'What revenue-ops problem is most urgent?',
            options: [
              { id: 'routing', label: 'Lead routing', description: 'Fix who gets leads, when, and under what rules.' },
              { id: 'qualification', label: 'Qualification and stages', description: 'Tighten MQL, SQL, stage definitions, and scoring logic.' },
              { id: 'pipeline', label: 'Pipeline hygiene', description: 'Fix stale stages, bad data, and weak handoff discipline.' },
            ],
          },
          {
            id: 'revops_breakdown',
            prompt: 'Where is the breakdown happening?',
            options: [
              { id: 'marketing_to_sales', label: 'Marketing to sales', description: 'The handoff from marketing to sales is unclear or weak.' },
              { id: 'sales_process', label: 'Inside the sales process', description: 'Deals are stalling or moving through stages inconsistently.' },
              { id: 'full_funnel', label: 'Across the full funnel', description: 'The lifecycle needs a top-to-bottom revops review.' },
            ],
          },
          {
            id: 'revops_systems',
            prompt: 'Which systems should we trust most?',
            options: [
              { id: 'crm', label: 'CRM first', description: 'Use CRM stages, owners, and deal/contact data as the main source of truth.' },
              { id: 'analytics', label: 'Analytics first', description: 'Use funnel metrics and conversion signals as the main source of truth.' },
              { id: 'combined', label: 'Combined view', description: 'Combine CRM, analytics, and spreadsheets for the clearest answer.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Zoho CRM', 'GA4', 'CSV import'],
        launchTitle: 'Revenue Operations',
        firstAction: 'Review the lifecycle diagnosis, handoff gaps, and the highest-priority system fixes.',
      }
    case 'market-signals:Understand Your Market':
    case 'market-signals:Understand your market':
      return {
        intro: 'I will frame the market-intelligence workflow so you start with the right competitive and demand question.',
        questions: [
          {
            id: 'market_focus',
            prompt: 'What do you need to understand first?',
            options: [
              { id: 'competitors', label: 'Competitor moves', description: 'Track what direct competitors are changing or launching.' },
              { id: 'demand', label: 'Demand shifts', description: 'Look for buyer pain, demand change, and category momentum.' },
              { id: 'positioning', label: 'Positioning gaps', description: 'Find messaging gaps and openings we can own.' },
            ],
          },
          {
            id: 'market_shift',
            prompt: 'Which shift matters most right now?',
            options: [
              { id: 'new_moves', label: 'New moves', description: 'Watch launches, campaigns, pricing changes, and visible pushes.' },
              { id: 'buyer_change', label: 'Buyer change', description: 'Look for changes in buyer concerns, language, or urgency.' },
              { id: 'white_space', label: 'White space', description: 'Find under-served angles and market gaps to exploit.' },
            ],
          },
          {
            id: 'market_scope',
            prompt: 'How broad should the scan be?',
            options: [
              { id: 'direct_market', label: 'Direct market', description: 'Keep the scan close to direct competitors and the core category.' },
              { id: 'category', label: 'Category view', description: 'Include broader market signals and adjacent players.' },
              { id: 'full_landscape', label: 'Full landscape', description: 'Combine direct competitors, category shifts, and buyer signals.' },
            ],
          },
        ],
        connectors: ['Semrush', 'Ahrefs', 'LinkedIn', 'Reddit'],
        launchTitle: 'Market Intelligence',
        firstAction: 'Review the main market shifts, competitor moves, and the response your team should make next.',
      }
    case 'referral-program:Launch Referral Program':
    case 'referral-program:Launch a referral loop':
      return {
        intro: 'I will set up the referral workflow so you land on the right advocate segment, incentive shape, and launch path.',
        questions: [
          {
            id: 'referral_who',
            prompt: 'Who should drive referrals first?',
            options: [
              { id: 'customers', label: 'Happy customers', description: 'Start with customers who already see value and are most likely to refer.' },
              { id: 'champions', label: 'Product champions', description: 'Focus on highly engaged power users, community members, or promoters.' },
              { id: 'partners', label: 'Partners or affiliates', description: 'Design a more structured partner-led referral motion.' },
            ],
          },
          {
            id: 'referral_play',
            prompt: 'What kind of referral play do you want?',
            options: [
              { id: 'invite_loop', label: 'Invite loop', description: 'Launch a classic refer-a-friend or customer invite motion.' },
              { id: 'post_purchase', label: 'Post-purchase ask', description: 'Ask for referrals after a successful milestone, purchase, or activation.' },
              { id: 'win_back', label: 'Win-back referrals', description: 'Use referrals as part of expansion, reactivation, or comeback offers.' },
            ],
          },
          {
            id: 'referral_incentive',
            prompt: 'How should the reward work?',
            options: [
              { id: 'double_sided', label: 'Double-sided reward', description: 'Reward both the advocate and the referred user.' },
              { id: 'advocate_only', label: 'Advocate-only reward', description: 'Keep the reward simple and focused on the referrer.' },
              { id: 'non_cash', label: 'Non-cash perk', description: 'Use credits, upgrades, access, or recognition instead of cash.' },
            ],
          },
          {
            id: 'referral_channel',
            prompt: 'Where should this launch first?',
            options: [
              { id: 'email', label: 'Email and lifecycle', description: 'Launch through customer email, nurture, or win-back touchpoints.' },
              { id: 'in_product', label: 'In-product', description: 'Put the referral ask inside the product journey or account area.' },
              { id: 'social', label: 'Social sharing', description: 'Make it easy to share publicly on social channels.' },
              { id: 'crm', label: 'CRM-led outreach', description: 'Run a more targeted referral motion from CRM segments or CSM outreach.' },
            ],
          },
        ],
        connectors: ['HubSpot', 'Zoho CRM', 'Mailchimp', 'Klaviyo', 'LinkedIn', 'Facebook', 'Instagram'],
        launchTitle: 'Referral Program',
        firstAction: 'Review the referral brief, choose the launch mechanism, and generate the first referral assets.',
      }
    default:
      return {
        intro: 'I will collect the minimum setup choices first so the next screen is easier to understand.',
        questions: [
          {
            id: 'focus',
            prompt: 'How should we frame this goal?',
            options: [
              { id: 'speed', label: 'Get started fast', description: 'Open with practical defaults.' },
              { id: 'quality', label: 'Prioritize quality', description: 'Bias toward a more tailored setup.' },
              { id: 'guided', label: 'Show me the right path', description: 'Use the most guided starting point.' },
            ],
          },
        ],
        launchTitle: goal.title,
        firstAction: 'Follow the highlighted first step on the destination screen.',
      }
  }
}
