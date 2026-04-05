import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Users, TrendingUp, BarChart3, Settings } from 'lucide-react';
import { usePlan, canAccessModule, requiredPlanForModule } from '@/hooks/usePlan';
import { LockedModuleGate } from './LockedModuleGate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ModuleStats } from '@/types/dashboard';
import { LeadIntelligenceFlow } from './LeadIntelligenceFlow';
import { AIVoiceBotFlow } from './AIVoiceBotFlow';
import { AIVideoBotFlow } from './AIVideoBotFlow';
import { UserEngagementFlow } from './UserEngagementFlow';
import { BudgetOptimizationFlow } from './BudgetOptimizationFlow';
import { PerformanceScorecard } from './PerformanceScorecard';
import { SocialMediaFlow, SocialCalendarFlow } from './SocialMediaFlow';
import { UnifiedCustomerViewFlow } from './UnifiedCustomerViewFlow';
import { CompanyIntelligenceFlow } from './CompanyIntelligenceFlow';
import { GuidedFlowShell } from './GuidedFlowShell';
import { MarketSignalsFlow } from './MarketSignalsFlow';
import { AudienceProfilesFlow } from './AudienceProfilesFlow';
import { PositioningFlow } from './PositioningFlow';
import { OfferDesignFlow } from './OfferDesignFlow';
import { MessagingFlow } from './MessagingFlow';
import { ChannelHealthFlow } from './ChannelHealthFlow';
import { LandingPagesFlow } from './LandingPagesFlow';
import { AIContentFlow } from './AIContentFlow';
import { SEOLLMOFlow } from './SEOLLMOFlow';
import { IndustryIntelligenceFlow } from './IndustryIntelligenceFlow';
import { ActionPlanFlow } from './ActionPlanFlow';
import { AdCreativeFlow } from './AdCreativeFlow';
import { EmailSequenceFlow } from './EmailSequenceFlow';
import { LeadOutreachFlow } from './LeadOutreachFlow';
import { CROAuditFlow } from './CROAuditFlow';
import { CROFlow } from './CROFlow';
import { ABTestFlow } from './ABTestFlow';
import { MarketingAuditFlow } from './MarketingAuditFlow';
import { SetupFlow } from './SetupFlow';
import { LaunchStrategyFlow } from './LaunchStrategyFlow';
import { RevenueOpsFlow } from './RevenueOpsFlow';
import { LeadMagnetsFlow } from './LeadMagnetsFlow';
import { SalesEnablementFlow } from './SalesEnablementFlow';
import { PaidAdsFlow } from './PaidAdsFlow';
import { ReferralProgramFlow } from './ReferralProgramFlow';
import { ChurnPreventionFlow } from './ChurnPreventionFlow';

interface ModuleDetailProps {
  module: ModuleStats;
  onBack: () => void;
  onModuleSelect?: (moduleId: string) => void;
  autoStart?: boolean;
}

type GuidedGoal = 'leads' | 'roi' | 'content' | null;
type GoalPreset = {
  tab?: string | null;
  question?: string | null;
  mode?: string | null;
  timeframe?: string | null;
  connectors?: string | null;
  contentType?: string | null;
  contentChannel?: string | null;
  contentObjective?: string | null;
  contentDeliverable?: string | null;
  adFormat?: string | null;
  adPlatform?: string | null;
  socialChannels?: string | null;
  socialObjective?: string | null;
  socialFormat?: string | null;
  socialHorizon?: string | null;
  referralWho?: string | null;
  referralPlay?: string | null;
  referralIncentive?: string | null;
  referralChannel?: string | null;
  engagementSegment?: string | null;
  engagementProblem?: string | null;
  engagementMotion?: string | null;
  engagementChannel?: string | null;
  customerViewType?: string | null;
  customerViewQuestion?: string | null;
  customerViewSystems?: string | null;
  revopsProblem?: string | null;
  revopsBreakdown?: string | null;
  revopsSystems?: string | null;
  marketFocus?: string | null;
  marketShift?: string | null;
  marketScope?: string | null;
  positioningFocus?: string | null;
  positioningBuyer?: string | null;
  positioningOutcome?: string | null;
  offerProblem?: string | null;
  offerLever?: string | null;
  offerGoal?: string | null;
  pageType?: string | null;
  pageGoal?: string | null;
  pageSource?: string | null;
  testSurface?: string | null;
  testGoal?: string | null;
  testMode?: string | null;
  seoFocus?: string | null;
  seoSurface?: string | null;
  seoGoal?: string | null;
  audienceScope?: string | null;
  audienceBuyer?: string | null;
  audienceGoal?: string | null;
  outreachChannel?: string | null;
  outreachTarget?: string | null;
  outreachGoal?: string | null;
  magnetType?: string | null;
  magnetAudience?: string | null;
  magnetGoal?: string | null;
  auditScope?: string | null;
  auditPriority?: string | null;
  auditContext?: string | null;
  channelScope?: string | null;
  channelProblem?: string | null;
  channelHorizon?: string | null;
  calendarChannels?: string | null;
  calendarMotion?: string | null;
  calendarHorizon?: string | null;
  messagingSurface?: string | null;
  messagingProblem?: string | null;
  messagingGoal?: string | null;
  launchType?: string | null;
  launchAudience?: string | null;
  launchHorizon?: string | null;
  salesAsset?: string | null;
  salesAudience?: string | null;
  salesMotion?: string | null;
  emailSequenceType?: string | null;
  emailSequenceAudience?: string | null;
  emailSequenceGoal?: string | null;
  paidObjective?: string | null;
  paidChannel?: string | null;
  leadType?: string | null;
  priority?: string | null;
  source?: string | null;
  missingFields?: string | null;
};

function parseGuidedGoalFromHash(): GuidedGoal {
  const raw = window.location.hash || '';
  if (!raw.startsWith('#')) return null;
  const value = raw.slice(1);
  if (!value) return null;

  const params = new URLSearchParams(value.replace(/^(\?|&)/, ''));
  const goal = params.get('goal');
  if (goal === 'leads' || goal === 'roi' || goal === 'content') return goal;
  return null;
}

function parseGoalPresetFromHash(): GoalPreset {
  const raw = window.location.hash || '';
  if (!raw.startsWith('#')) return {};
  const value = raw.slice(1);
  if (!value) return {};

  const params = new URLSearchParams(value.replace(/^(\?|&)/, ''));
  return {
    tab: params.get('tab'),
    question: params.get('question'),
    mode: params.get('mode'),
    timeframe: params.get('timeframe'),
    connectors: params.get('connectors'),
    contentType: params.get('content_type'),
    contentChannel: params.get('content_channel'),
    contentObjective: params.get('content_objective'),
    contentDeliverable: params.get('content_deliverable'),
    adFormat: params.get('ad_format'),
    adPlatform: params.get('ad_platform'),
    socialChannels: params.get('social_channels'),
    socialObjective: params.get('social_objective'),
    socialFormat: params.get('social_format'),
    socialHorizon: params.get('social_horizon'),
    referralWho: params.get('referral_who'),
    referralPlay: params.get('referral_play'),
    referralIncentive: params.get('referral_incentive'),
    referralChannel: params.get('referral_channel'),
    engagementSegment: params.get('engagement_segment'),
    engagementProblem: params.get('engagement_problem'),
    engagementMotion: params.get('engagement_motion'),
    engagementChannel: params.get('engagement_channel'),
    customerViewType: params.get('customer_view_type'),
    customerViewQuestion: params.get('customer_view_question'),
    customerViewSystems: params.get('customer_view_systems'),
    revopsProblem: params.get('revops_problem'),
    revopsBreakdown: params.get('revops_breakdown'),
    revopsSystems: params.get('revops_systems'),
    marketFocus: params.get('market_focus'),
    marketShift: params.get('market_shift'),
    marketScope: params.get('market_scope'),
    positioningFocus: params.get('positioning_focus'),
    positioningBuyer: params.get('positioning_buyer'),
    positioningOutcome: params.get('positioning_outcome'),
    offerProblem: params.get('offer_problem'),
    offerLever: params.get('offer_lever'),
    offerGoal: params.get('offer_goal'),
    pageType: params.get('page_type'),
    pageGoal: params.get('page_goal'),
    pageSource: params.get('page_source'),
    testSurface: params.get('test_surface'),
    testGoal: params.get('test_goal'),
    testMode: params.get('test_mode'),
    seoFocus: params.get('seo_focus'),
    seoSurface: params.get('seo_surface'),
    seoGoal: params.get('seo_goal'),
    audienceScope: params.get('audience_scope'),
    audienceBuyer: params.get('audience_buyer'),
    audienceGoal: params.get('audience_goal'),
    outreachChannel: params.get('outreach_channel'),
    outreachTarget: params.get('outreach_target'),
    outreachGoal: params.get('outreach_goal'),
    magnetType: params.get('magnet_type'),
    magnetAudience: params.get('magnet_audience'),
    magnetGoal: params.get('magnet_goal'),
    auditScope: params.get('audit_scope'),
    auditPriority: params.get('audit_priority'),
    auditContext: params.get('audit_context'),
    channelScope: params.get('channel_scope'),
    channelProblem: params.get('channel_problem'),
    channelHorizon: params.get('channel_horizon'),
    calendarChannels: params.get('calendar_channels'),
    calendarMotion: params.get('calendar_motion'),
    calendarHorizon: params.get('calendar_horizon'),
    messagingSurface: params.get('messaging_surface'),
    messagingProblem: params.get('messaging_problem'),
    messagingGoal: params.get('messaging_goal'),
    launchType: params.get('launch_type'),
    launchAudience: params.get('launch_audience'),
    launchHorizon: params.get('launch_horizon'),
    salesAsset: params.get('sales_asset'),
    salesAudience: params.get('sales_audience'),
    salesMotion: params.get('sales_motion'),
    emailSequenceType: params.get('email_sequence_type'),
    emailSequenceAudience: params.get('email_sequence_audience'),
    emailSequenceGoal: params.get('email_sequence_goal'),
    paidObjective: params.get('paid_objective'),
    paidChannel: params.get('paid_channel'),
    leadType: params.get('lead_type'),
    priority: params.get('priority'),
    source: params.get('source'),
    missingFields: params.get('missing_fields'),
  };
}

export function ModuleDetail({ module, onBack, onModuleSelect, autoStart = false }: ModuleDetailProps) {
  const [shouldAutoStart, setShouldAutoStart] = useState(autoStart);
  const [guidedGoal, setGuidedGoal] = useState<GuidedGoal>(() => parseGuidedGoalFromHash());
  const [goalPreset, setGoalPreset] = useState<GoalPreset>(() => parseGoalPresetFromHash());
  const { plan } = usePlan();

  // Reset auto-start after first use
  useEffect(() => {
    if (autoStart) {
      setShouldAutoStart(true);
      // Reset after component mounts
      setTimeout(() => setShouldAutoStart(false), 100);
    }
  }, [autoStart]);

  useEffect(() => {
    const handleHashChange = () => {
      setGuidedGoal(parseGuidedGoalFromHash());
      setGoalPreset(parseGoalPresetFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Gate locked modules — checked AFTER all hooks
  if (!canAccessModule(plan, module.id)) {
    return (
      <LockedModuleGate
        moduleName={module.name}
        requiredPlan={requiredPlanForModule(module.id)}
        currentPlan={plan}
      />
    );
  }

  // Special handling for Lead Intelligence module
  if (module.id === 'lead-intelligence') {
    return (
      <div className="space-y-6">
        {/* Lead Intelligence Flow */}
        <LeadIntelligenceFlow
          autoStart={shouldAutoStart}
          initialTab={goalPreset.tab ?? undefined}
          initialLeadPreset={{
            leadType: goalPreset.leadType ?? undefined,
            priority: goalPreset.priority ?? undefined,
            source: goalPreset.source ?? undefined,
            missingFields: goalPreset.missingFields ?? undefined,
          }}
        />
      </div>
    );
  }

  // Special handling for AI Voice Bot module
  if (module.id === 'ai-voice-bot') {
    return (
      <div className="space-y-6">
        <AIVoiceBotFlow autoStart={shouldAutoStart} />
      </div>
    );
  }

  // Special handling for AI Video Bot module
  if (module.id === 'ai-video-bot') {
    return (
      <div className="space-y-6">
        <AIVideoBotFlow autoStart={shouldAutoStart} />
      </div>
    );
  }

  // Special handling for User Engagement module
  if (module.id === 'user-engagement') {
    return (
      <div className="space-y-6">
        <UserEngagementFlow
          initialQuestion={goalPreset.question ?? undefined}
          initialSegment={goalPreset.engagementSegment ?? undefined}
          initialProblem={goalPreset.engagementProblem ?? undefined}
          initialMotion={goalPreset.engagementMotion ?? undefined}
          initialChannel={goalPreset.engagementChannel ?? undefined}
        />
      </div>
    );
  }

  // Special handling for Budget Optimization module
  if (module.id === 'budget-optimization') {
    return (
      <div className="space-y-6">
        <BudgetOptimizationFlow
          initialQuestion={goalPreset.question ?? undefined}
          initialMode={goalPreset.mode ?? undefined}
          initialTimeframe={goalPreset.timeframe ?? undefined}
          initialConnectors={goalPreset.connectors ? goalPreset.connectors.split(',').filter(Boolean) : undefined}
        />
      </div>
    );
  }

  // Special handling for Performance Scorecard module
  if (module.id === 'performance-scorecard') {
    return (
      <PerformanceScorecard onModuleSelect={onModuleSelect} />
    );
  }

  // Special handling for Unified Customer View module
  if (module.id === 'unified-customer-view') {
    return (
      <div className="space-y-6">
        <UnifiedCustomerViewFlow
          initialQuestion={goalPreset.question ?? undefined}
          initialViewType={goalPreset.customerViewType ?? undefined}
          initialViewQuestion={goalPreset.customerViewQuestion ?? undefined}
          initialSystems={goalPreset.customerViewSystems ?? undefined}
        />
      </div>
    );
  }

  // Special handling for Company Intelligence module
  if (module.id === 'company-intelligence') {
    if (!guidedGoal) {
      return (
        <div className="space-y-6">
          <CompanyIntelligenceFlow onModuleSelect={onModuleSelect} />
        </div>
      );
    }

    const goalMeta = {
      leads: {
        label: 'Generate more qualified leads',
        title: 'Lead Growth Guided Flow',
      },
      roi: {
        label: 'Improve campaign ROI',
        title: 'ROI Improvement Guided Flow',
      },
      content: {
        label: 'Launch monthly content pipeline',
        title: 'Content Launch Guided Flow',
      },
    } as const;

    return (
      <div className="space-y-6">
        <GuidedFlowShell
          title={goalMeta[guidedGoal].title}
          description="Follow these simple steps. You can switch to Advanced mode anytime."
          goalLabel={goalMeta[guidedGoal].label}
          steps={[
            { id: 'company', title: 'Pick company', description: 'Select or ingest the company you are working on.' },
            { id: 'focus', title: 'Choose focus', description: 'Open the recommended analysis page for this goal.' },
            { id: 'generate', title: 'Generate output', description: 'Use one-click generation with guided defaults.' },
            { id: 'act', title: 'Take action', description: 'Review output and execute the suggested plan.' },
          ]}
        >
          {({ isAdvancedMode }) => (
            <CompanyIntelligenceFlow guidedGoal={guidedGoal} advancedMode={isAdvancedMode} onModuleSelect={onModuleSelect} />
          )}
        </GuidedFlowShell>
      </div>
    );
  }

  // New agent-driven modules
  if (module.id === 'market-signals') {
    return (
      <MarketSignalsFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialFocus={goalPreset.marketFocus ?? undefined}
        initialShift={goalPreset.marketShift ?? undefined}
        initialScope={goalPreset.marketScope ?? undefined}
      />
    );
  }
  if (module.id === 'industry-intelligence') return <IndustryIntelligenceFlow />;
  if (module.id === 'audience-profiles') {
    return (
      <AudienceProfilesFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialScope={goalPreset.audienceScope ?? undefined}
        initialBuyer={goalPreset.audienceBuyer ?? undefined}
        initialGoal={goalPreset.audienceGoal ?? undefined}
      />
    );
  }
  if (module.id === 'positioning') {
    return (
      <PositioningFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialFocus={goalPreset.positioningFocus ?? undefined}
        initialBuyer={goalPreset.positioningBuyer ?? undefined}
        initialOutcome={goalPreset.positioningOutcome ?? undefined}
      />
    );
  }
  if (module.id === 'action-plan') return <ActionPlanFlow />;
  if (module.id === 'offer-design') {
    return (
      <OfferDesignFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialProblem={goalPreset.offerProblem ?? undefined}
        initialLever={goalPreset.offerLever ?? undefined}
        initialGoal={goalPreset.offerGoal ?? undefined}
      />
    );
  }
  if (module.id === 'messaging') {
    return (
      <MessagingFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialSurface={goalPreset.messagingSurface ?? undefined}
        initialProblem={goalPreset.messagingProblem ?? undefined}
        initialGoal={goalPreset.messagingGoal ?? undefined}
      />
    );
  }
  if (module.id === 'channel-health') {
    return (
      <ChannelHealthFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialScope={goalPreset.channelScope ?? undefined}
        initialProblem={goalPreset.channelProblem ?? undefined}
        initialHorizon={goalPreset.channelHorizon ?? undefined}
      />
    );
  }
  if (module.id === 'landing-pages') {
    return (
      <LandingPagesFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialType={goalPreset.pageType ?? undefined}
        initialGoal={goalPreset.pageGoal ?? undefined}
        initialSource={goalPreset.pageSource ?? undefined}
      />
    );
  }
  if (module.id === 'social-calendar') {
    return (
      <SocialCalendarFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialChannels={goalPreset.calendarChannels ?? undefined}
        initialMotion={goalPreset.calendarMotion ?? undefined}
        initialHorizon={goalPreset.calendarHorizon ?? undefined}
      />
    );
  }
  if (module.id === 'social-media') {
    return (
      <SocialMediaFlow
        initialPlatforms={goalPreset.socialChannels ? goalPreset.socialChannels.split(',').filter(Boolean) : undefined}
        initialObjective={goalPreset.socialObjective ?? undefined}
        initialFormat={goalPreset.socialFormat ?? undefined}
        initialHorizon={goalPreset.socialHorizon ?? undefined}
      />
    );
  }
  if (module.id === 'ai-content') {
    return (
      <AIContentFlow
        initialContentType={(goalPreset.contentType as 'post' | 'image' | 'video-faceless' | 'video-avatar' | 'email' | null) ?? undefined}
        initialChannel={goalPreset.contentChannel ?? undefined}
        initialObjective={goalPreset.contentObjective ?? undefined}
        initialDeliverable={goalPreset.contentDeliverable ?? undefined}
      />
    );
  }
  if (module.id === 'seo-llmo') {
    return (
      <SEOLLMOFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialFocus={goalPreset.seoFocus ?? undefined}
        initialSurface={goalPreset.seoSurface ?? undefined}
        initialGoal={goalPreset.seoGoal ?? undefined}
      />
    );
  }
  if (module.id === 'ad-creative') {
    return (
      <AdCreativeFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialFormat={goalPreset.adFormat ?? undefined}
        initialPlatform={goalPreset.adPlatform ?? undefined}
      />
    );
  }
  if (module.id === 'email-sequence') {
    return (
      <EmailSequenceFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialType={goalPreset.emailSequenceType ?? undefined}
        initialAudience={goalPreset.emailSequenceAudience ?? undefined}
        initialGoal={goalPreset.emailSequenceGoal ?? undefined}
      />
    );
  }
  if (module.id === 'lead-outreach') {
    return (
      <LeadOutreachFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialChannel={goalPreset.outreachChannel ?? undefined}
        initialTarget={goalPreset.outreachTarget ?? undefined}
        initialGoal={goalPreset.outreachGoal ?? undefined}
      />
    );
  }
  if (module.id === 'cro-audit') return <CROAuditFlow />;
  if (module.id === 'cro') return <CROFlow initialTab={goalPreset.tab ?? undefined} initialQuestion={goalPreset.question ?? undefined} />;
  if (module.id === 'ab-test') {
    return (
      <ABTestFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialSurface={goalPreset.testSurface ?? undefined}
        initialGoal={goalPreset.testGoal ?? undefined}
        initialMode={goalPreset.testMode ?? undefined}
      />
    );
  }
  if (module.id === 'marketing-audit') {
    return (
      <MarketingAuditFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialScope={goalPreset.auditScope ?? undefined}
        initialPriority={goalPreset.auditPriority ?? undefined}
        initialContext={goalPreset.auditContext ?? undefined}
      />
    );
  }
  if (module.id === 'setup') return <SetupFlow />;
  if (module.id === 'launch-strategy') {
    return (
      <LaunchStrategyFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialType={goalPreset.launchType ?? undefined}
        initialAudience={goalPreset.launchAudience ?? undefined}
        initialHorizon={goalPreset.launchHorizon ?? undefined}
      />
    );
  }
  if (module.id === 'revenue-ops') {
    return (
      <RevenueOpsFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialProblem={goalPreset.revopsProblem ?? undefined}
        initialBreakdown={goalPreset.revopsBreakdown ?? undefined}
        initialSystems={goalPreset.revopsSystems ?? undefined}
      />
    );
  }
  if (module.id === 'lead-magnets') {
    return (
      <LeadMagnetsFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialType={goalPreset.magnetType ?? undefined}
        initialAudience={goalPreset.magnetAudience ?? undefined}
        initialGoal={goalPreset.magnetGoal ?? undefined}
      />
    );
  }
  if (module.id === 'sales-enablement') {
    return (
      <SalesEnablementFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialAsset={goalPreset.salesAsset ?? undefined}
        initialAudience={goalPreset.salesAudience ?? undefined}
        initialMotion={goalPreset.salesMotion ?? undefined}
      />
    );
  }
  if (module.id === 'paid-ads') {
    return (
      <PaidAdsFlow
        initialTab={goalPreset.tab ?? undefined}
        initialQuestion={goalPreset.question ?? undefined}
        initialObjective={goalPreset.paidObjective ?? undefined}
        initialChannel={goalPreset.paidChannel ?? undefined}
      />
    );
  }
  if (module.id === 'referral-program') {
    return (
      <ReferralProgramFlow
        initialQuestion={goalPreset.question ?? undefined}
        initialWho={goalPreset.referralWho ?? undefined}
        initialPlay={goalPreset.referralPlay ?? undefined}
        initialIncentive={goalPreset.referralIncentive ?? undefined}
        initialChannel={goalPreset.referralChannel ?? undefined}
      />
    );
  }
  if (module.id === 'churn-prevention') return <ChurnPreventionFlow initialQuestion={goalPreset.question ?? undefined} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          className="transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{module.name}</h1>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {module.metrics.map((metric, index) => (
          <Card key={index} className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{metric.value}</div>
                {metric.change && (
                  <Badge
                    variant={metric.change > 0 ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {metric.change > 0 ? '+' : ''}{metric.change}%
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Performance Trends</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Efficiency</span>
                    <span>85%</span>
                  </div>
                  <Progress value={85} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Quality Score</span>
                    <span>92%</span>
                  </div>
                  <Progress value={92} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>User Satisfaction</span>
                    <span>78%</span>
                  </div>
                  <Progress value={78} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Recent Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-green-500 rounded-full" />
                    <span className="text-sm">Campaign optimization completed</span>
                    <span className="text-xs text-muted-foreground ml-auto">2h ago</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-blue-500 rounded-full" />
                    <span className="text-sm">New leads processed</span>
                    <span className="text-xs text-muted-foreground ml-auto">4h ago</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-orange-500 rounded-full" />
                    <span className="text-sm">Performance report generated</span>
                    <span className="text-xs text-muted-foreground ml-auto">6h ago</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Dashboard</CardTitle>
              <CardDescription>Detailed analytics and insights for this module</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <BarChart3 className="h-10 w-10 mx-auto" />
                  <p>Analytics dashboard would be rendered here</p>
                  <p className="text-sm">Charts, graphs, and detailed metrics</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Module Settings</CardTitle>
              <CardDescription>Configure and customize this module</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <Settings className="h-10 w-10 mx-auto" />
                  <p>Settings panel would be rendered here</p>
                  <p className="text-sm">Configuration options and preferences</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Reports & Exports</span>
              </CardTitle>
              <CardDescription>Generate and download reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Monthly Performance Report</h4>
                    <p className="text-sm text-muted-foreground">Comprehensive monthly analysis</p>
                  </div>
                  <Button variant="outline" size="sm">Download</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
