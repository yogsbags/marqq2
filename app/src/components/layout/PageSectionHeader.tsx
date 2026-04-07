import type { ReactNode } from 'react'

type PageSectionHeaderProps = {
  eyebrow: string
  title: string
  description: string
  meta?: ReactNode
  actions?: ReactNode
}

export function PageSectionHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: PageSectionHeaderProps) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] px-5 py-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">{eyebrow}</div>
          <h1 className="mt-2 font-brand-syne text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
