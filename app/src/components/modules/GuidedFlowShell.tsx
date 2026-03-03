import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type GuidedFlowStep = {
  id: string;
  title: string;
  description: string;
};

interface GuidedFlowShellProps {
  title: string;
  description: string;
  goalLabel: string;
  steps: GuidedFlowStep[];
  defaultAdvancedMode?: boolean;
  children: (mode: { isAdvancedMode: boolean }) => React.ReactNode;
}

export function GuidedFlowShell({
  title,
  description,
  goalLabel,
  steps,
  defaultAdvancedMode = false,
  children,
}: GuidedFlowShellProps) {
  const [isAdvancedMode, setIsAdvancedMode] = useState(defaultAdvancedMode);

  return (
    <div className="space-y-4">
      <Card className="border-orange-200/80 bg-gradient-to-r from-orange-50 via-amber-50 to-white">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                Guided Workflow
              </Badge>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>

            <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
              <Switch id="guided-mode-toggle" checked={isAdvancedMode} onCheckedChange={setIsAdvancedMode} />
              <Label htmlFor="guided-mode-toggle" className="text-sm font-medium">
                {isAdvancedMode ? 'Advanced mode' : 'Simple mode'}
              </Label>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-xs text-gray-600">
            Goal: <span className="font-semibold text-gray-900">{goalLabel}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  'rounded-md border bg-white/80 p-3',
                  index === 0 ? 'border-orange-300' : 'border-gray-200'
                )}
              >
                <div className="text-xs font-semibold text-orange-700">Step {index + 1}</div>
                <div className="text-sm font-medium text-gray-900">{step.title}</div>
                <div className="mt-1 text-xs text-gray-600">{step.description}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {children({ isAdvancedMode })}
    </div>
  );
}
