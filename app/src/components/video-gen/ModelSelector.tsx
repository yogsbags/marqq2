import { clsx } from 'clsx';

export type ModelType = 'wan-2.5' | 'kling-2.6' | 'omnihuman-1.5' | 'runway-gen-4' | 'ovi';

interface ModelSelectorProps {
  selectedModel: ModelType;
  onSelect: (model: ModelType) => void;
}

const MODELS: { id: ModelType; label: string; badge?: string; cost: string; features: string }[] = [
  { id: 'wan-2.5', label: 'Wan 2.5', badge: '4K Charts', cost: '~$0.05/s', features: 'Best for Text & Data' },
  { id: 'kling-2.6', label: 'Kling 2.6', badge: 'Audio', cost: 'Credit', features: 'Cinematic Motion + SFX' },
  { id: 'omnihuman-1.5', label: 'OmniHuman 1.5', badge: 'Lip-Sync', cost: '~$0.16/s', features: 'Talking Advisor' },
  { id: 'ovi', label: 'OVI', badge: 'Native Audio', cost: '~$0.12/s', features: 'AI Voice + Emotion' },
  { id: 'runway-gen-4', label: 'Runway Gen-4', cost: 'Premium', features: 'Consistent Characters' },
];

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {MODELS.map((model) => (
        <button
          key={model.id}
          onClick={() => onSelect(model.id)}
          className={clsx(
            "flex min-w-[200px] items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all",
            selectedModel === model.id
              ? "border-purple-500 bg-purple-50 text-purple-700 shadow-md dark:bg-purple-950/30 dark:text-purple-200"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-500"
          )}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{model.label}</span>
              {model.badge && (
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  {model.badge}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">{model.features}</div>
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{model.cost}</div>
        </button>
      ))}
    </div>
  );
}
