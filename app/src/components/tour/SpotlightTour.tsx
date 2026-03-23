import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface SpotlightTourStep {
  /** data-tour attribute value, or null for centered card */
  target: string | null
  title: string
  description: string
  placement: 'center' | 'right' | 'top' | 'bottom' | 'left'
}

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 6
const TOOLTIP_W = 304
const TOOLTIP_H_EST = 188
const GAP = 14

/** Dim + blur around a rectangular hole (rest of screen stays sharp under the hole only). */
function SpotlightShroud({ rect, onDismiss }: { rect: SpotlightRect; onDismiss: () => void }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const { top, left, width, height } = rect
  const bottom = top + height
  const right = left + width

  const panelClass =
    'fixed z-[60] bg-slate-950/80 backdrop-blur-md dark:bg-slate-950/88 supports-[backdrop-filter]:bg-slate-950/70 dark:supports-[backdrop-filter]:bg-slate-950/78'

  return (
    <>
      {/* Top */}
      {top > 0 ? (
        <div
          className={panelClass}
          style={{ top: 0, left: 0, width: vw, height: top }}
          onClick={onDismiss}
          aria-hidden
        />
      ) : null}
      {/* Left */}
      {left > 0 && height > 0 ? (
        <div
          className={panelClass}
          style={{ top, left: 0, width: left, height }}
          onClick={onDismiss}
          aria-hidden
        />
      ) : null}
      {/* Right */}
      {right < vw && height > 0 ? (
        <div
          className={panelClass}
          style={{ top, left: right, width: Math.max(0, vw - right), height }}
          onClick={onDismiss}
          aria-hidden
        />
      ) : null}
      {/* Bottom */}
      {bottom < vh ? (
        <div
          className={panelClass}
          style={{ top: bottom, left: 0, width: vw, height: Math.max(0, vh - bottom) }}
          onClick={onDismiss}
          aria-hidden
        />
      ) : null}
    </>
  )
}

function computeTooltipStyle(
  spotlight: SpotlightRect | null,
  placement: SpotlightTourStep['placement'],
): React.CSSProperties {
  if (!spotlight || placement === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: TOOLTIP_W,
    }
  }

  const { top, left, width, height } = spotlight

  if (placement === 'right') {
    return {
      position: 'fixed',
      top: Math.max(8, top + height / 2 - TOOLTIP_H_EST / 2),
      left: left + width + GAP,
      width: TOOLTIP_W,
    }
  }
  if (placement === 'left') {
    return {
      position: 'fixed',
      top: Math.max(8, top + height / 2 - TOOLTIP_H_EST / 2),
      right: Math.max(8, window.innerWidth - left + GAP),
      width: TOOLTIP_W,
    }
  }
  if (placement === 'top') {
    const l = Math.max(8, Math.min(left + width / 2 - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 8))
    return {
      position: 'fixed',
      top: Math.max(8, top - TOOLTIP_H_EST - GAP),
      left: l,
      width: TOOLTIP_W,
    }
  }
  if (placement === 'bottom') {
    const l = Math.max(8, Math.min(left + width / 2 - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 8))
    return {
      position: 'fixed',
      top: top + height + GAP,
      left: l,
      width: TOOLTIP_W,
    }
  }
  return {
    position: 'fixed',
    top: Math.max(8, top + height / 2 - TOOLTIP_H_EST / 2),
    right: window.innerWidth - left + GAP,
    width: TOOLTIP_W,
  }
}

export interface SpotlightTourProps {
  steps: SpotlightTourStep[]
  /** If set, written to localStorage when tour completes or skips */
  storageKey: string
  onDone: () => void
  /** Shown in progress area, e.g. "Home" vs "App" */
  tourLabel?: string
}

export function SpotlightTour({ steps, storageKey, onDone, tourLabel }: SpotlightTourProps) {
  const [step, setStep] = useState(0)
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const current = steps[step]
  const total = steps.length

  useEffect(() => {
    if (!current.target) {
      setSpotlight(null)
      return
    }
    let debounceTimer: number | undefined
    const measure = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null
      if (!el) {
        setSpotlight(null)
        return
      }
      try {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      } catch {
        el.scrollIntoView({ block: 'nearest' })
      }
      const apply = () => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 && r.height < 2) {
          setSpotlight(null)
          return
        }
        setSpotlight({
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
        })
      }
      apply()
      if (debounceTimer) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(apply, 320)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      if (debounceTimer) window.clearTimeout(debounceTimer)
    }
  }, [step, current.target])

  const finish = () => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    onDone()
  }

  const next = () => {
    if (step >= total - 1) {
      finish()
      return
    }
    setStep((s) => s + 1)
  }
  const prev = () => setStep((s) => Math.max(0, s - 1))

  const tooltipStyle = computeTooltipStyle(spotlight, current.placement)

  /** Intro / no-target steps: keep the page (e.g. Home) visible; only a light veil + soft blur. */
  const centerBackdropClass =
    'fixed inset-0 z-[60] cursor-auto bg-black/25 backdrop-blur-[2px] dark:bg-black/45 dark:backdrop-blur-sm supports-[backdrop-filter]:bg-black/20 dark:supports-[backdrop-filter]:bg-black/38'

  return (
    <>
      {/* Light scrim for centered intro so underlying UI (Home) stays readable */}
      {!spotlight ? (
        <div className={centerBackdropClass} onClick={finish} aria-hidden />
      ) : (
        <SpotlightShroud rect={spotlight} onDismiss={finish} />
      )}

      {/* Highlight ring — only the target area stays undimmed and unblurred */}
      {spotlight ? (
        <div
          className="pointer-events-none fixed z-[61] rounded-xl border-2 border-orange-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_28px_6px_rgba(249,115,22,0.35)] transition-[top,left,width,height] duration-300 ease-out dark:border-orange-400 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_0_32px_8px_rgba(249,115,22,0.28)]"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      ) : null}

      <div
        ref={tooltipRef}
        className="fixed z-[62] max-h-[min(90vh,420px)] overflow-y-auto rounded-[1.25rem] border border-orange-200/70 bg-background/98 p-5 shadow-2xl dark:border-orange-900/40 dark:bg-zinc-950/96"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="spotlight-tour-title"
        aria-describedby="spotlight-tour-desc"
      >
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {tourLabel ? (
            <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              {tourLabel}
            </span>
          ) : null}
          <span className="text-[10px] text-muted-foreground">
            Step {step + 1} of {total}
          </span>
        </div>

        <div className="mb-3 flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-orange-500'
                  : i < step
                    ? 'w-2 bg-orange-300'
                    : 'w-2 bg-orange-100 dark:bg-white/10'
              }`}
            />
          ))}
        </div>

        <h3 id="spotlight-tour-title" className="mb-1.5 text-base font-semibold text-foreground">
          {current.title}
        </h3>
        <p id="spotlight-tour-desc" className="mb-5 text-sm leading-relaxed text-muted-foreground">
          {current.description}
        </p>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={prev}
                className="h-8 w-8 p-0"
                aria-label="Previous step"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={next}
              className="h-8 bg-orange-500 px-4 text-white hover:bg-orange-600"
            >
              {step === total - 1 ? (
                'Done'
              ) : (
                <>
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
