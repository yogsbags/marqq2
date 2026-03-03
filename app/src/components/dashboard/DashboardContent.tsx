import { MetricsOverview } from './MetricsOverview';
import { ModuleCard } from './ModuleCard';
import { dashboardData } from '@/data/dashboardData';

interface DashboardContentProps {
  onViewDetails: (moduleId: string) => void;
}

export function DashboardContent({ onViewDetails }: DashboardContentProps) {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="text-center space-y-2 animate-in fade-in-50 slide-in-from-top-5 duration-700">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
          Marketing Intelligence Platform
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Your unified platform for advanced marketing solutions and analytics
        </p>
      </div>

      {/* Metrics Overview */}
      <MetricsOverview metrics={dashboardData.overallMetrics} />

      {/* Modules Grid */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Solution Modules</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {dashboardData.modules.map((module, index) => (
            <div
              key={module.id}
              className="animate-in fade-in-50 slide-in-from-bottom-5"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <ModuleCard
                module={module}
                onViewDetails={onViewDetails}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}