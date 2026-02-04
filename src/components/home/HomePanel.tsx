import { GtmStrategyAssistant, type DeployRequest } from '@/components/home/GtmStrategyAssistant';
import type { AgentTarget } from '@/types/gtm';

interface HomePanelProps {
  onModuleSelect: (moduleId: string | null) => void;
}

export function HomePanel({ onModuleSelect }: HomePanelProps) {
  const deployAgent = (req: DeployRequest) => {
    const target = req.target;

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
      company_intel_marketing_strategy: { moduleId: 'company-intelligence', hash: 'ci=marketing_strategy' },
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Home</h2>
        <p className="text-sm text-muted-foreground">
          Chat with Torqq AI to generate a guided Go-To-Market strategy, then deploy the right agents to execute.
        </p>
      </div>

      <GtmStrategyAssistant onDeployAgent={deployAgent} />
    </div>
  );
}
