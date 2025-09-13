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
      name: '',
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
      id: 'unified-customer-view',
      name: 'Unified Customer View',
      color: '#EC4899',
      metrics: [
        { label: 'Profiles Unified', value: '45K', change: 22 },
        { label: 'Targeting Accuracy', value: '91.3%', change: 6 },
        { label: 'Campaign CTR', value: '4.8%', change: 14 },
      ],
    },
  ],
};