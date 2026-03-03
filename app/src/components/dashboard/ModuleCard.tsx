import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { ModuleStats } from '@/types/dashboard';
import { cn } from '@/lib/utils';

interface ModuleCardProps {
  module: ModuleStats;
  onViewDetails: (moduleId: string) => void;
}

export function ModuleCard({ module, onViewDetails }: ModuleCardProps) {
  return (
    <Card className="transition-all duration-200 hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-800/50 group cursor-pointer">
      <CardHeader>
        <CardTitle className="text-lg">{module.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-gray-700 dark:text-gray-300">
        <div className="grid gap-3">
          {module.metrics.map((metric, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{metric.label}</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">{metric.value}</span>
                {metric.change && (
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    metric.change > 0 
                      ? "bg-green-100 text-green-700" 
                      : "bg-red-100 text-red-700"
                  )}>
                    {metric.change > 0 ? '+' : ''}{metric.change}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <Button 
          variant="outline" 
          className="w-full group-hover:bg-orange-50 group-hover:border-orange-200 transition-colors"
          onClick={() => onViewDetails(module.id)}
        >
          View Details
          <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </CardContent>
    </Card>
  );
}