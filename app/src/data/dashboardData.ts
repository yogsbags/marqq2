import { DashboardData } from '@/types/dashboard';

export const dashboardData: DashboardData = {
  overallMetrics: {
    totalLeads: 24567,
    conversionRate: 18.5,
    roiImprovement: 34,
    activeUsers: 1892,
  },
  modules: [
    {
      id: 'lead-intelligence',
      name: 'Lead Intelligence',
      color: '#3B82F6',
      metrics: [
        { label: 'Leads Scored', value: '12.4K', change: 15 },
        { label: 'Conversion Rate', value: '22.3%', change: 8 },
        { label: 'ROI Increase', value: '+45%', change: 12 },
      ],
    },
    {
      id: 'ai-voice-bot',
      name: 'AI Voice Bot Automation',
      color: '#10B981',
      metrics: [
        { label: 'Conversations', value: '8.9K', change: 23 },
        { label: 'Success Rate', value: '89.2%', change: 5 },
        { label: 'Time Saved', value: '340hrs', change: 18 },
      ],
    },
    {
      id: 'ai-video-bot',
      name: 'AI Video Bot & Digital Avatar',
      color: '#F59E0B',
      metrics: [
        { label: 'Videos Created', value: '2.4K', change: 35 },
        { label: 'Engagement Rate', value: '78.9%', change: 12 },
        { label: 'Conversion Rate', value: '15.2%', change: 18 },
      ],
    },
    {
      id: 'social-media',
      name: 'Social Media Campaigns',
      color: '#EC4899',
      metrics: [
        { label: 'Agents', value: 'kiran + maya' },
        { label: 'Platforms', value: 'LinkedIn · Instagram · X' },
        { label: 'Output', value: 'Content + schedule' },
      ],
    },
    {
      id: 'user-engagement',
      name: 'User Engagement & Lifecycle',
      color: '#F59E0B',
      metrics: [
        { label: 'Active Journeys', value: '156', change: 12 },
        { label: 'Engagement Rate', value: '67.8%', change: 9 },
        { label: 'Conversions', value: '2.1K', change: 15 },
      ],
    },
    {
      id: 'budget-optimization',
      name: 'Campaign Budget Optimization',
      color: '#EF4444',
      metrics: [
        { label: 'Budget Optimized', value: '$125K', change: 20 },
        { label: 'Cost Reduction', value: '18.5%', change: 7 },
        { label: 'ROAS', value: '3.2x', change: 11 },
      ],
    },
    {
      id: 'performance-scorecard',
      name: 'Performance Scorecard',
      color: '#8B5CF6',
      metrics: [
        { label: 'KPIs Tracked', value: '24', change: 0 },
        { label: 'Score Improvement', value: '+12%', change: 12 },
        { label: 'Forecasts', value: '89', change: 25 },
      ],
    },
    {
      id: 'ai-content',
      name: 'AI Content Generation',
      color: '#06B6D4',
      metrics: [
        { label: 'Content Created', value: '1.2K', change: 45 },
        { label: 'Engagement Rate', value: '24.7%', change: 18 },
        { label: 'Time Saved', value: '120hrs', change: 30 },
      ],
    },
    {
      id: 'seo-llmo',
      name: 'SEO & LLMO Optimization',
      color: '#10B981',
      metrics: [
        { label: 'Keywords Optimized', value: '3.2K', change: 28 },
        { label: 'Search Ranking', value: 'Top 3', change: 15 },
        { label: 'Organic Traffic', value: '+67%', change: 22 },
      ],
    },
    {
      id: 'crm',
      name: 'CRM',
      color: '#FF7A59',
      metrics: [
        { label: 'Contacts', value: '—', change: 0 },
        { label: 'Connectors', value: 'HubSpot · Zoho', change: 0 },
        { label: 'Voice sync', value: 'Push to CRM', change: 0 },
      ],
    },
    {
      id: 'unified-customer-view',
      name: 'Unified Customer View',
      color: '#EC4899',
      metrics: [
        { label: 'Profiles Unified', value: '45K', change: 22 },
        { label: 'Targeting Accuracy', value: '91.3%', change: 6 },
        { label: 'Campaign CTR', value: '4.8%', change: 14 },
      ],
    },
    {
      id: 'company-intelligence',
      name: 'Company Intelligence',
      color: '#0EA5E9',
      metrics: [
        { label: 'Companies', value: '—' },
        { label: 'Artifacts', value: '—' },
        { label: 'Calendars', value: '—' },
      ],
    },
    {
      id: 'industry-intelligence',
      name: 'Industry Intelligence',
      color: '#F97316',
      metrics: [
        { label: 'Source', value: 'Reddit · YouTube · HN' },
        { label: 'Window', value: 'Last 30 days' },
        { label: 'Injection', value: 'Every agent run' },
      ],
    },
    {
      id: 'market-signals',
      name: 'Market Signals',
      color: '#6366F1',
      metrics: [
        { label: 'Agent', value: 'isha + priya' },
        { label: 'Cadence', value: 'Daily' },
        { label: 'Coverage', value: 'Category + Competitor' },
      ],
    },
    {
      id: 'audience-profiles',
      name: 'Audience Profiles',
      color: '#8B5CF6',
      metrics: [
        { label: 'Agent', value: 'isha' },
        { label: 'Output', value: 'ICP cards' },
        { label: 'Depth', value: 'Firmographic + Psychographic' },
      ],
    },
    {
      id: 'positioning',
      name: 'Positioning & Strategy',
      color: '#0EA5E9',
      metrics: [
        { label: 'Agent', value: 'neel' },
        { label: 'Cadence', value: 'Weekly' },
        { label: 'Output', value: 'Strategy brief' },
      ],
    },
    {
      id: 'offer-design',
      name: 'Offer Design',
      color: '#F59E0B',
      metrics: [
        { label: 'Agent', value: 'tara' },
        { label: 'Cadence', value: 'Daily' },
        { label: 'Focus', value: 'CTA + Friction' },
      ],
    },
    {
      id: 'messaging',
      name: 'Messaging & Copy',
      color: '#10B981',
      metrics: [
        { label: 'Agent', value: 'sam' },
        { label: 'Cadence', value: 'Weekly' },
        { label: 'Output', value: 'Copy review' },
      ],
    },
    {
      id: 'social-calendar',
      name: 'Social Calendar',
      color: '#EC4899',
      metrics: [
        { label: 'Agent', value: 'kiran' },
        { label: 'Cadence', value: 'Daily' },
        { label: 'Output', value: '30-day calendar' },
      ],
    },
    {
      id: 'channel-health',
      name: 'Channel Health',
      color: '#14B8A6',
      metrics: [
        { label: 'Agent', value: 'zara' },
        { label: 'Cadence', value: 'Daily' },
        { label: 'Focus', value: 'Distribution mix' },
      ],
    },
    {
      id: 'landing-pages',
      name: 'Landing Pages',
      color: '#F43F5E',
      metrics: [
        { label: 'Agents', value: 'tara + sam' },
        { label: 'Output', value: 'Audit + Copy' },
        { label: 'Publish', value: 'WordPress / Sanity' },
      ],
    },
    {
      id: 'action-plan',
      name: 'Goal → Action Plan',
      color: '#F97316',
      metrics: [
        { label: 'Agents', value: 'neel + dev' },
        { label: 'Output', value: 'Prioritised plan' },
        { label: 'Includes', value: 'Budget split' },
      ],
    },
    {
      id: 'ad-creative',
      name: 'Ad Creative',
      color: '#EC4899',
      metrics: [
        { label: 'Agents', value: 'maya + sam' },
        { label: 'Platforms', value: 'Meta · Google · LinkedIn' },
        { label: 'Variants', value: '5 per brief' },
      ],
    },
    {
      id: 'email-sequence',
      name: 'Email Sequences',
      color: '#6366F1',
      metrics: [
        { label: 'Agents', value: 'sam + maya' },
        { label: 'Types', value: 'Nurture · Cold · Onboarding' },
        { label: 'Output', value: 'Full sequence' },
      ],
    },
    {
      id: 'lead-outreach',
      name: 'Lead Outreach',
      color: '#0EA5E9',
      metrics: [
        { label: 'Agent', value: 'arjun' },
        { label: 'Output', value: 'Personalised messages' },
        { label: 'Channels', value: 'LinkedIn · Email' },
      ],
    },
    {
      id: 'cro-audit',
      name: 'CRO Audit',
      color: '#14B8A6',
      metrics: [
        { label: 'Agents', value: 'tara + sam' },
        { label: 'Covers', value: 'Pages · Forms · Funnels' },
        { label: 'Output', value: 'Score + rewrites' },
      ],
    },
    {
      id: 'ab-test',
      name: 'A/B Tests',
      color: '#8B5CF6',
      metrics: [
        { label: 'Agents', value: 'dev + sam' },
        { label: 'Output', value: 'Hypotheses + variants' },
        { label: 'Declares', value: 'Winners at 95% CI' },
      ],
    },
    {
      id: 'marketing-audit',
      name: 'Marketing Audit',
      color: '#F59E0B',
      metrics: [
        { label: 'Score', value: '0-100' },
        { label: 'Dimensions', value: '6 categories' },
        { label: 'Output', value: 'Audit + Roadmap' },
      ],
    },
    // ── Context ──────────────────────────────────
    {
      id: 'setup',
      name: 'Setup — Company Context',
      color: '#6366F1',
      metrics: [
        { label: 'Agent', value: 'veena + neel' },
        { label: 'Output', value: 'Knowledge graph' },
        { label: 'Populates', value: '9 MKG fields' },
      ],
    },
    // ── Plan ─────────────────────────────────────
    {
      id: 'launch-strategy',
      name: 'Launch Strategy',
      color: '#0EA5E9',
      metrics: [
        { label: 'Agents', value: 'neel + sam' },
        { label: 'Output', value: 'GTM plan + launch copy' },
        { label: 'Covers', value: 'Pre · Launch · Post' },
      ],
    },
    {
      id: 'revenue-ops',
      name: 'Revenue Operations',
      color: '#14B8A6',
      metrics: [
        { label: 'Agents', value: 'dev + arjun' },
        { label: 'Output', value: 'Lead lifecycle + pipeline' },
        { label: 'Covers', value: 'Scoring · SLAs · Forecast' },
      ],
    },
    // ── Collateral ───────────────────────────────
    {
      id: 'lead-magnets',
      name: 'Lead Magnets',
      color: '#F97316',
      metrics: [
        { label: 'Agents', value: 'sam + tara' },
        { label: 'Output', value: 'Magnet + opt-in CRO' },
        { label: 'Covers', value: 'Content · Distribution' },
      ],
    },
    {
      id: 'sales-enablement',
      name: 'Sales Enablement',
      color: '#8B5CF6',
      metrics: [
        { label: 'Agents', value: 'sam + arjun' },
        { label: 'Output', value: 'Deck · battle card · sequence' },
        { label: 'Covers', value: 'Collateral · Outreach' },
      ],
    },
    // ── Execution ────────────────────────────────
    {
      id: 'paid-ads',
      name: 'Paid Ads',
      color: '#EC4899',
      metrics: [
        { label: 'Agents', value: 'maya + sam' },
        { label: 'Output', value: 'Strategy + ad copy' },
        { label: 'Platforms', value: 'Meta · Google · LinkedIn' },
      ],
    },
    {
      id: 'referral-program',
      name: 'Referral Program',
      color: '#10B981',
      metrics: [
        { label: 'Agents', value: 'tara + sam' },
        { label: 'Output', value: 'Mechanics + full copy set' },
        { label: 'Target', value: 'K-factor > 1' },
      ],
    },
    // ── Analytics ────────────────────────────────
    {
      id: 'cro',
      name: 'CRO',
      color: '#14B8A6',
      metrics: [
        { label: 'Agents', value: 'tara + sam' },
        { label: 'Covers', value: 'Page · Signup · Forms · Paywall' },
        { label: 'Output', value: 'Score + rewrites' },
      ],
    },
    {
      id: 'churn-prevention',
      name: 'Churn Prevention',
      color: '#EF4444',
      metrics: [
        { label: 'Agents', value: 'tara + sam' },
        { label: 'Output', value: 'Analysis + retention copy' },
        { label: 'Covers', value: 'Cancel · Win-back · Pause' },
      ],
    },
  ],
};
