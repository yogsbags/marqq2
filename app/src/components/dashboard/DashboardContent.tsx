import { MetricsOverview } from './MetricsOverview';
import { ModuleCard } from './ModuleCard';
import { dashboardData } from '@/data/dashboardData';
import { cn } from '@/lib/utils';

interface DashboardContentProps {
  onViewDetails: (moduleId: string) => void;
}

const JOURNEY_STAGES = [
  {
    label: 'Intelligence',
    description: 'Understand your market, competitors, and audience before anything else.',
    ids: ['company-intelligence', 'market-signals', 'audience-profiles'],
  },
  {
    label: 'Strategy',
    description: 'Turn insights into positioning, offers, and messaging that convert.',
    ids: ['positioning', 'offer-design', 'messaging'],
  },
  {
    label: 'Content',
    description: 'Produce content, videos, and social posts at scale.',
    ids: ['ai-content', 'social-calendar', 'ai-video-bot', 'seo-llmo'],
  },
  {
    label: 'Distribution',
    description: 'Get content in front of the right buyers through the right channels.',
    ids: ['channel-health', 'landing-pages', 'lead-intelligence', 'ai-voice-bot'],
  },
  {
    label: 'Analytics',
    description: 'Measure, optimize, and retain customers over time.',
    ids: ['user-engagement', 'budget-optimization', 'performance-scorecard', 'unified-customer-view'],
  },
] as const;

export function DashboardContent({ onViewDetails }: DashboardContentProps) {
  const moduleById = Object.fromEntries(dashboardData.modules.map(m => [m.id, m]));

  return (
    <div className="space-y-10">
      {/* Welcome Section */}
      <div className="space-y-1 animate-in fade-in-50 slide-in-from-top-5 duration-700">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Marketing Intelligence Platform
        </h1>
        <p className="text-base text-muted-foreground">
          Start with Intelligence → build Strategy → create Content → distribute → measure.
        </p>
      </div>

      {/* Metrics Overview */}
      <MetricsOverview metrics={dashboardData.overallMetrics} />

      {/* Journey Stages */}
      {JOURNEY_STAGES.map((stage, stageIdx) => {
        const modules = stage.ids.map(id => moduleById[id]).filter(Boolean);
        if (modules.length === 0) return null;

        return (
          <div key={stage.label} className="space-y-3 animate-in fade-in-50 slide-in-from-bottom-4" style={{ animationDelay: `${stageIdx * 80}ms` }}>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white">
                {stageIdx + 1}
              </span>
              <div>
                <h2 className="text-lg font-semibold leading-none">{stage.label}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{stage.description}</p>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
              {modules.map((module, idx) => (
                <div
                  key={module.id}
                  className={cn(
                    "animate-in fade-in-50 slide-in-from-bottom-4",
                    idx === 0 ? "md:col-span-2" : "md:col-span-1"
                  )}
                  style={{ animationDelay: `${stageIdx * 80 + idx * 60}ms` }}
                >
                  <ModuleCard module={module} onViewDetails={onViewDetails} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
