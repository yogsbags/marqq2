import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Users, TrendingUp, BarChart3, Settings } from 'lucide-react';
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
import { EnhancedBulkGenerator } from './EnhancedBulkGenerator';
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
import { ABTestFlow } from './ABTestFlow';

interface ModuleDetailProps {
  module: ModuleStats;
  onBack: () => void;
  onModuleSelect?: (moduleId: string) => void;
  autoStart?: boolean;
}

type GuidedGoal = 'leads' | 'roi' | 'content' | null;

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

export function ModuleDetail({ module, onBack, onModuleSelect, autoStart = false }: ModuleDetailProps) {
  const [shouldAutoStart, setShouldAutoStart] = useState(autoStart);
  const [guidedGoal, setGuidedGoal] = useState<GuidedGoal>(() => parseGuidedGoalFromHash());

  // Reset auto-start after first use
  useEffect(() => {
    if (autoStart) {
      setShouldAutoStart(true);
      // Reset after component mounts
      setTimeout(() => setShouldAutoStart(false), 100);
    }
  }, [autoStart]);

  useEffect(() => {
    const handleHashChange = () => setGuidedGoal(parseGuidedGoalFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Special handling for Lead Intelligence module
  if (module.id === 'lead-intelligence') {
    return (
      <div className="space-y-6">
        {/* Lead Intelligence Flow */}
        <LeadIntelligenceFlow autoStart={shouldAutoStart} />
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
        <UserEngagementFlow />
      </div>
    );
  }

  // Special handling for Budget Optimization module
  if (module.id === 'budget-optimization') {
    return (
      <div className="space-y-6">
        <BudgetOptimizationFlow />
      </div>
    );
  }

  // Special handling for Performance Scorecard module
  if (module.id === 'performance-scorecard') {
    return (
      <div className="space-y-6">
        <PerformanceScorecard />
      </div>
    );
  }

  // Special handling for AI Content module
  if (module.id === 'ai-content') {
    return (
      <div className="space-y-6">
        {/* AI Content should use the Social Media workflow */}
        <SocialMediaFlow />
      </div>
    );
  }

  // Special handling for SEO/LLMO module
  if (module.id === 'seo-llmo') {
    return (
      <div className="space-y-6">
        {/* SEO/LLMO should use the Enhanced Bulk Generator experience */}
        <EnhancedBulkGenerator />
      </div>
    );
  }

  // Special handling for Unified Customer View module
  if (module.id === 'unified-customer-view') {
    return (
      <div className="space-y-6">
        <UnifiedCustomerViewFlow />
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
  if (module.id === 'market-signals') return <MarketSignalsFlow />;
  if (module.id === 'audience-profiles') return <AudienceProfilesFlow />;
  if (module.id === 'positioning') return <PositioningFlow />;
  if (module.id === 'offer-design') return <OfferDesignFlow />;
  if (module.id === 'messaging') return <MessagingFlow />;
  if (module.id === 'channel-health') return <ChannelHealthFlow />;
  if (module.id === 'landing-pages') return <LandingPagesFlow />;
  if (module.id === 'social-calendar') return <SocialCalendarFlow />;
  if (module.id === 'ai-content') return <AIContentFlow />;
  if (module.id === 'seo-llmo') return <SEOLLMOFlow />;
  if (module.id === 'industry-intelligence') return <IndustryIntelligenceFlow />;
  if (module.id === 'action-plan') return <ActionPlanFlow />;
  if (module.id === 'ad-creative') return <AdCreativeFlow />;
  if (module.id === 'email-sequence') return <EmailSequenceFlow />;
  if (module.id === 'lead-outreach') return <LeadOutreachFlow />;
  if (module.id === 'cro-audit') return <CROAuditFlow />;
  if (module.id === 'ab-test') return <ABTestFlow />;

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
