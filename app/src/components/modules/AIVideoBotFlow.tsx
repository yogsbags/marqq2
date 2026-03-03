import { VideoGenFlow } from './VideoGenFlow';

interface AIVideoBotFlowProps {
  autoStart?: boolean;
}

export function AIVideoBotFlow({ autoStart = false }: AIVideoBotFlowProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          AI Video Bot
        </h1>
        <p className="text-sm text-muted-foreground">
          Create, refine, and generate AI video content in one place.
        </p>
      </div>

      <VideoGenFlow />
    </div>
  );
}
