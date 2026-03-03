import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { HiSparkles as Sparkles, HiX as X } from 'react-icons/hi';
import type { GtmDeployContext } from '@/lib/gtmContext';

interface GtmContextBannerProps {
  context: GtmDeployContext;
  onDismiss: () => void;
}

export function GtmContextBanner({ context, onDismiss }: GtmContextBannerProps) {
  return (
    <Alert className="border-orange-200 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-900/10">
      <Sparkles className="h-4 w-4 text-orange-600" />
      <AlertTitle className="flex items-center justify-between">
        <span>GTM Strategy Context</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-orange-100 dark:hover:bg-orange-900/20"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <p>
            Pre-populated from GTM strategy: <strong>{context.sectionTitle}</strong>
          </p>
          {context.summary && (
            <p className="text-xs text-muted-foreground">{context.summary}</p>
          )}
          {context.bullets && context.bullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {context.bullets.slice(0, 3).map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
              {context.bullets.length > 3 && (
                <li className="text-xs italic">+ {context.bullets.length - 3} more...</li>
              )}
            </ul>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
