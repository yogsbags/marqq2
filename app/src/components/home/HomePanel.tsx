import { GtmStrategyAssistant, type DeployRequest } from '@/components/home/GtmStrategyAssistant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AgentTarget } from '@/types/gtm';
import { storeGtmContext } from '@/lib/gtmContext';
import { ArrowRight, BarChart3, FileText, Users } from 'lucide-react';

interface HomePanelProps {
  onModuleSelect: (moduleId: string | null) => void;
}

export function HomePanel({ onModuleSelect }: HomePanelProps) {
  const startGuidedGoal = (goal: 'leads' | 'roi' | 'content') => {
    const destinationByGoal = {
      leads: 'icps',
      roi: 'opportunities',
      content: 'content_strategy',
    } as const;

    window.location.hash = `goal=${goal}&ci=${destinationByGoal[goal]}`;
    onModuleSelect('company-intelligence');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deployAgent = (req: DeployRequest) => {
    const target = req.target;

    // Store GTM context if provided
    if (req.context) {
      storeGtmContext(target, {
        sectionId: req.context.sectionId || '',
        sectionTitle: req.context.sectionTitle || '',
        summary: req.context.summary || '',
        bullets: req.context.bullets || [],
      });
    }

    const navigate = (moduleId: string, options?: { hash?: string }) => {
      if (options?.hash) {
        window.location.hash = options.hash.startsWith('#') ? options.hash : `#${options.hash}`;
      } else if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      onModuleSelect(moduleId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const map: Record<AgentTarget, { moduleId: string; hash?: string }> = {
      company_intel_icp: { moduleId: 'company-intelligence', hash: 'ci=icps' },
      company_intel_competitors: { moduleId: 'company-intelligence', hash: 'ci=competitor_intelligence' },
      company_intel_marketing_strategy: { moduleId: 'company-intelligence', hash: 'ci=positioning_messaging' },
      company_intel_sales_enablement: { moduleId: 'company-intelligence', hash: 'ci=sales_enablement' },
      company_intel_pricing: { moduleId: 'company-intelligence', hash: 'ci=pricing_intelligence' },
      company_intel_content_strategy: { moduleId: 'company-intelligence', hash: 'ci=content_strategy' },
      company_intel_channel_strategy: { moduleId: 'company-intelligence', hash: 'ci=channel_strategy' },
      company_intel_social_calendar: { moduleId: 'company-intelligence', hash: 'ci=social_calendar' },
      company_intel_lead_magnets: { moduleId: 'company-intelligence', hash: 'ci=lead_magnets' },
      lead_intelligence: { moduleId: 'lead-intelligence' },
      budget_optimization: { moduleId: 'budget-optimization' },
      performance_scorecard: { moduleId: 'performance-scorecard' },
      user_engagement: { moduleId: 'user-engagement' },
    };

    const destination = map[target];
    if (!destination) return;
    navigate(destination.moduleId, { hash: destination.hash });
  };

  const openWorkflow = ({ nextStep }: { nextStep?: string } = {}) => {
    onModuleSelect('company-intelligence');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (nextStep) {
      window.location.hash = '#ci=overview';
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marketing Copilot Home</h2>
        <p className="text-sm text-muted-foreground">
          Pick your business goal and follow a guided flow designed for non-technical marketing teams.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">
            Start Here
          </Badge>
          <p className="text-sm text-muted-foreground">Goal-based setup with defaults and plain-language steps.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-cyan-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-blue-600" />
                Get More Leads
              </CardTitle>
              <CardDescription>Build best-fit customer profiles and competitor-informed outreach.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => startGuidedGoal('leads')}>
                Start Lead Flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-lime-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-emerald-700" />
                Improve Campaign ROI
              </CardTitle>
              <CardDescription>Identify high-impact opportunities and prioritize budget-efficient actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => startGuidedGoal('roi')}>
                Start ROI Flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-amber-700" />
                Launch Monthly Content
              </CardTitle>
              <CardDescription>Generate content strategy, channels, and calendar with one guided setup.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => startGuidedGoal('content')}>
                Start Content Flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <GtmStrategyAssistant onDeployAgent={deployAgent} onOpenWorkflow={openWorkflow} />
    </div>
  );
}
