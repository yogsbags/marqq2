import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  agentWorkSteps,
  resolveAgentProfile,
} from '@/lib/agentProfiles'
import { Activity, Radio, Sparkles, Target, Zap } from 'lucide-react'

export type TaskAgentRunState = 'idle' | 'running' | 'ready' | 'error'

type Props = {
  agentName?: string | null
  taskTitle: string
  channelTitle?: string
  companyName?: string | null
  marketingSkills?: string[]
  runState: TaskAgentRunState
  summary?: string | null
  onOpenHub?: () => void
  className?: string
}

const STATE_COPY: Record<TaskAgentRunState, { label: string; pulse: string }> = {
  idle: { label: 'STANDBY', pulse: 'bg-zinc-400' },
  running: { label: 'LIVE · EXECUTING', pulse: 'bg-emerald-400' },
  ready: { label: 'DELIVERABLE READY', pulse: 'bg-orange-400' },
  error: { label: 'NEEDS ATTENTION', pulse: 'bg-rose-400' },
}

export function TaskAgentCommandDeck({
  agentName,
  taskTitle,
  channelTitle,
  companyName,
  marketingSkills,
  runState,
  summary,
  onOpenHub,
  className,
}: Props) {
  const profile = resolveAgentProfile(agentName)
  const steps = useMemo(() => agentWorkSteps(taskTitle), [taskTitle])
  const [activeStep, setActiveStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (runState !== 'running') {
      setActiveStep(runState === 'ready' ? steps.length - 1 : 0)
      return
    }
    setActiveStep(0)
    const id = window.setInterval(() => {
      setActiveStep((s) => (s + 1) % steps.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [runState, steps.length])

  useEffect(() => {
    if (runState !== 'running') return
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(id)
  }, [runState])

  const stateMeta = STATE_COPY[runState]
  const progressPct =
    runState === 'ready' ? 100 : runState === 'running' ? Math.min(92, 12 + activeStep * 18 + (elapsed % 7)) : 8

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-orange-500/25 bg-zinc-950 text-zinc-50 shadow-[0_0_0_1px_rgba(255,101,33,0.08),0_24px_80px_-32px_rgba(255,101,33,0.55)]',
        className,
      )}
      style={{ '--agent-accent': profile.accent } as CSSProperties}
      aria-label={`${profile.displayName} command deck`}
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: `
            radial-gradient(ellipse 70% 60% at 12% 20%, color-mix(in srgb, var(--agent-accent) 28%, transparent), transparent 55%),
            radial-gradient(ellipse 50% 40% at 88% 10%, rgba(255,101,33,0.18), transparent 50%),
            linear-gradient(165deg, #09090b 0%, #0c0c0f 45%, #121215 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--agent-accent), #FF6521, transparent)',
        }}
      />

      <div className="relative grid gap-6 p-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-6 lg:gap-8">
        {/* Agent identity */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <div
              className={cn(
                'absolute -inset-2 rounded-[22px] opacity-70',
                runState === 'running' && 'animate-[agent-orbit_3.2s_linear_infinite]',
              )}
              style={{
                background: `conic-gradient(from 0deg, transparent 0%, var(--agent-accent) 18%, transparent 32%, transparent 68%, #FF6521 82%, transparent 100%)`,
              }}
            />
            <div className="relative rounded-[18px] border border-white/10 bg-zinc-900/90 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <AgentAvatar name={profile.id} size="lg" className="!h-16 !w-16 !rounded-[14px]" />
            </div>
            <span
              className={cn(
                'absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-zinc-950',
                stateMeta.pulse,
                runState === 'running' && 'animate-pulse',
              )}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.18em] text-orange-300">
                <Radio className="h-3 w-3" aria-hidden />
                {stateMeta.label}
              </span>
              {channelTitle ? (
                <span className="rounded-full border border-white/10 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-zinc-400">
                  #{channelTitle}
                </span>
              ) : null}
            </div>

            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">Active agent</p>
              <h2 className="mt-1 font-brand-syne text-3xl font-semibold tracking-tight text-white md:text-[2.15rem]">
                {profile.displayName}
              </h2>
              <p className="mt-0.5 text-sm font-medium" style={{ color: profile.accent }}>
                {profile.title}
              </p>
            </div>

            <p className="max-w-xl text-sm leading-relaxed text-zinc-400">{profile.personality}</p>

            <div className="flex flex-wrap gap-2">
              {(marketingSkills?.length ? marketingSkills : profile.executes.slice(0, 3)).map((item) => (
                <span
                  key={item}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] leading-snug text-zinc-300"
                >
                  {marketingSkills?.length ? `skill · ${item}` : item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Mission telemetry */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  <Target className="h-3 w-3 text-orange-400" aria-hidden />
                  Mission
                </p>
                <p className="mt-1 text-base font-semibold text-white">{taskTitle}</p>
                {companyName ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Target · <span className="text-zinc-300">{companyName}</span>
                  </p>
                ) : null}
              </div>
              {onOpenHub ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenHub}
                  className="shrink-0 border-white/15 bg-transparent text-zinc-200 hover:bg-white/10 hover:text-white"
                >
                  All intel
                </Button>
              ) : null}
            </div>

            {summary ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">{summary}</p>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3" aria-hidden />
                  Neural pass
                </span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700 ease-out',
                    runState === 'running' && 'animate-[agent-shimmer_1.8s_ease_infinite]',
                  )}
                  style={{
                    width: `${progressPct}%`,
                    background: `linear-gradient(90deg, ${profile.accent}, #FF6521)`,
                  }}
                />
              </div>
            </div>

            <ul className="space-y-1.5">
              {steps.map((step, i) => {
                const done = runState === 'ready' || i < activeStep
                const current = runState === 'running' && i === activeStep
                return (
                  <li
                    key={step}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
                      current ? 'bg-white/5 text-white' : done ? 'text-zinc-400' : 'text-zinc-600',
                    )}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        current ? 'animate-pulse bg-orange-400' : done ? 'bg-emerald-400/80' : 'bg-zinc-700',
                      )}
                    />
                    <span className="truncate">{step}</span>
                    {current ? (
                      <Zap className="ml-auto h-3 w-3 shrink-0 text-orange-400" aria-hidden />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Sparkles className="h-3.5 w-3.5 text-orange-400" aria-hidden />
              {runState === 'running'
                ? `Elapsed ${elapsed}s`
                : runState === 'ready'
                  ? 'Ready for review'
                  : 'Awaiting ignition'}
            </div>
            <div className="ml-auto flex gap-3 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              <span>CPU · synth</span>
              <span>CTX · gtm</span>
              <span>MKG · live</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes agent-orbit {
          to { transform: rotate(360deg); }
        }
        @keyframes agent-shimmer {
          0% { filter: brightness(1); }
          50% { filter: brightness(1.35); }
          100% { filter: brightness(1); }
        }
      `}</style>
    </section>
  )
}
