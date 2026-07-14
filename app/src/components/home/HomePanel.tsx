import { GtmModuleWizard } from '@/components/home/GtmModuleWizard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GtmDeployRequest } from '@/types/gtm';
import { deployGtmTask } from '@/lib/deployGtmTask';
import { BRAND } from '@/lib/brand';
import { ArrowRight, BarChart3, FileText, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface HomePanelProps {
  onModuleSelect: (moduleId: string | null) => void;
}

export function HomePanel({ onModuleSelect }: HomePanelProps) {
  const [forceNewModule, setForceNewModule] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('marqq_gtm_force_new_module') === '1') {
      sessionStorage.removeItem('marqq_gtm_force_new_module');
      setForceNewModule(true);
    }
  }, []);

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

  const deployAgent = (req: GtmDeployRequest) => {
    deployGtmTask(req, onModuleSelect);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className={`${BRAND.wordmarkFontClass} text-3xl leading-none tracking-[0.08em] text-foreground uppercase sm:text-4xl`}>
          {BRAND.name.toUpperCase()}
        </p>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marketing Copilot Home</h2>
        <p className="text-sm text-muted-foreground">
          Complete your GTM wizard below. Agents only run when you lock sections and choose a task.
        </p>
      </div>

      <GtmModuleWizard
        onDeployAgent={deployAgent}
        forceNewModule={forceNewModule}
        onForceNewConsumed={() => setForceNewModule(false)}
      />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">
            Shortcuts
          </Badge>
          <p className="text-sm text-muted-foreground">
            Optional jumps after your module profile is ready.
          </p>
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
                Open Lead Flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                Improve ROI
              </CardTitle>
              <CardDescription>Find opportunities, pricing levers, and sales enablement moves.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => startGuidedGoal('roi')}>
                Open ROI Flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-violet-600" />
                Content Pipeline
              </CardTitle>
              <CardDescription>Ship channel + content strategy with a 30-day calendar starter.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => startGuidedGoal('content')}>
                Open Content Flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
