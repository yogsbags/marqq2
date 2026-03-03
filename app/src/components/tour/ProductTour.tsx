import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface TourStep {
  /** CSS selector value for data-tour attribute, or null for a centered welcome card */
  target: string | null
  title: string
  description: string
  placement: 'center' | 'right' | 'top' | 'bottom'
}

const STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to Torqq AI',
    description: 'Your AI-powered marketing intelligence platform is ready. Let us show you the key areas in 4 quick steps.',
    placement: 'center',
  },
  {
    target: 'chat-input',
    title: 'Your AI Command Center',
    description: 'Type any marketing task here — "create a LinkedIn post", "analyze our SEO" — or use /commands like /leads, /content, /seo.',
    placement: 'top',
  },
  {
    target: 'nav-company-intel',
    title: 'Company Intelligence',
    description: 'Start here. Analyze your company, benchmark competitors, and generate your full GTM strategy with one click.',
    placement: 'right',
  },
  {
    target: 'nav-dashboard',
    title: 'AI Team Dashboard',
    description: 'Monitor your 6 autonomous agents — Zara, Maya, Riya, Arjun, Dev, and Priya — running in the background for you.',
    placement: 'right',
  },
  {
    target: 'nav-settings',
    title: 'Settings & Workspace',
    description: 'Invite teammates, connect integrations, and manage billing. Your workspace auto-provisioned when you signed up.',
    placement: 'right',
  },
]

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

function computeTooltipStyle(
  spotlight: SpotlightRect | null,
  placement: TourStep['placement'],
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
  // left
  return {
    position: 'fixed',
    top: Math.max(8, top + height / 2 - TOOLTIP_H_EST / 2),
    right: window.innerWidth - left + GAP,
    width: TOOLTIP_W,
  }
}

interface Props {
  onDone: () => void
}

export function ProductTour({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const current = STEPS[step]
  const total = STEPS.length

  // Measure target element and recompute on resize
  useEffect(() => {
    if (!current.target) {
      setSpotlight(null)
      return
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`)
      if (!el) { setSpotlight(null); return }
      const r = el.getBoundingClientRect()
      setSpotlight({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, current.target])

  const finish = () => {
    localStorage.setItem('torqq_tour_done', '1')
    onDone()
  }

  const next = () => {
    if (step >= total - 1) { finish(); return }
    setStep(s => s + 1)
  }
  const prev = () => setStep(s => Math.max(0, s - 1))

  const tooltipStyle = computeTooltipStyle(spotlight, current.placement)

  return (
    <>
      {/* Full-screen click-through backdrop — clicking outside skips */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: spotlight ? 'transparent' : 'rgba(0,0,0,0.55)' }}
        onClick={finish}
      />

      {/* Spotlight cutout using box-shadow trick */}
      {spotlight && (
        <div
          className="fixed z-[61] rounded-lg pointer-events-none"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
            transition: 'top 0.25s, left 0.25s, width 0.25s, height 0.25s',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[62] rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-5"
        style={tooltipStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Close / skip */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-orange-500'
                  : i < step
                  ? 'w-2 bg-orange-300'
                  : 'w-2 bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base mb-1.5">
          {current.title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
          {current.description}
        </p>

        {/* Footer: skip + prev/next */}
        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={prev}
                className="h-8 w-8 p-0"
                aria-label="Previous step"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={next}
              className="h-8 px-4 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {step === total - 1 ? (
                'Done'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
