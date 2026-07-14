import { cn } from '@/lib/utils'

type Props = {
  options: string[]
  onSelect: (option: string) => void
  title?: string
  className?: string
}

/**
 * Exactly-four follow-up option cards (same interaction grammar as GTM wizard).
 */
export function AgentFollowUpOptions({
  options,
  onSelect,
  title = 'Choose your next move',
  className,
}: Props) {
  const four = [...options, '', '', '', ''].slice(0, 4).map((o, i) => o || `Option ${i + 1}`)

  return (
    <div className={cn('mt-3 space-y-2', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {four.map((opt, i) => (
          <button
            key={`${i}-${opt.slice(0, 24)}`}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              'group rounded-xl border border-border/70 bg-background/90 px-3 py-3 text-left transition',
              'hover:border-orange-500/50 hover:bg-orange-500/[0.06]',
              'active:scale-[0.99]',
              i === 0 && 'border-orange-500/40 shadow-[0_0_0_1px_rgba(255,101,33,0.12)]',
            )}
          >
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-orange-500/80">
              {i === 0 ? 'Recommended' : `Option ${i + 1}`}
            </span>
            <span className="text-sm leading-snug text-foreground group-hover:text-orange-700 dark:group-hover:text-orange-300">
              {opt}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
