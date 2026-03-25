import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { ModuleStats } from '@/types/dashboard';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface ModuleCardProps {
  module: ModuleStats;
  onViewDetails: (moduleId: string) => void;
}

export function ModuleCard({ module, onViewDetails }: ModuleCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
    <Card className="transition-all duration-200 hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-800/50 group cursor-pointer">
      <CardHeader>
        <CardTitle className="text-lg">{module.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-foreground">
        <div className="grid gap-3">
          {module.metrics.map((metric, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{metric.label}</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-foreground">{metric.value}</span>
                {metric.change && (
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-xs",
                    metric.change > 0 
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" 
                      : "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300"
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
          className="w-full transition-colors group-hover:border-orange-200 group-hover:bg-orange-50 dark:group-hover:border-orange-800/60 dark:group-hover:bg-orange-950/20"
          onClick={() => onViewDetails(module.id)}
        >
          View Details
          <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </CardContent>
    </Card>
    </motion.div>
  );
}
