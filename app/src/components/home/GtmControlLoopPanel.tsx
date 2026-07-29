/**
 * GTM Control Loop panel — Measure → Diagnose → Recommend → Approve
 * Renders on strategy view after North Star is locked.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Loader2, Activity, AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import type { GtmControlLoopState, GtmStrategyGoalAlignment } from '@/types/gtm'
import {
  decideGtmIntervention,
  diagnoseGtmControlLoop,
  getGtmControlLoop,
  measureGtmControlLoop,
  proposeGtmInterventions,
} from '@/services/gtmModuleService'

type Props = {
  moduleId: string
  goalAlignment?: GtmStrategyGoalAlignment | null
}

function statusColor(status?: string) {
  switch (status) {
    case 'green':
      return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30'
    case 'amber':
      return 'text-amber-700 bg-amber-500/10 border-amber-500/30'
    case 'red':
      return 'text-red-600 bg-red-500/10 border-red-500/30'
    case 'critical':
      return 'text-red-700 bg-red-600/15 border-red-600/40'
    default:
      return 'text-muted-foreground bg-muted/40 border-border/60'
  }
}

export function GtmControlLoopPanel({ moduleId, goalAlignment }: Props) {
  const [loop, setLoop] = useState<GtmControlLoopState | null>(null)
  const [goalSystem, setGoalSystem] = useState<GtmStrategyGoalAlignment | null>(goalAlignment || null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actualInput, setActualInput] = useState('')
  const [periodInput, setPeriodInput] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getGtmControlLoop(moduleId)
      setLoop(data.controlLoop)
      setGoalSystem(data.goalSystem)
      const cur = data.controlLoop.currentPeriod
      if (cur?.period) setPeriodInput(String(cur.period))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load control loop')
    } finally {
      setLoading(false)
    }
  }, [moduleId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onMeasure = async () => {
    const actual = Number(actualInput)
    if (!Number.isFinite(actual)) {
      toast.error('Enter a numeric actual for this period')
      return
    }
    setBusy(true)
    try {
      const period = periodInput ? Number(periodInput) : undefined
      const data = await measureGtmControlLoop(moduleId, { actual, period })
      setLoop(data.controlLoop)
      setActualInput('')
      toast.success('Measurement recorded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Measure failed')
    } finally {
      setBusy(false)
    }
  }

  const onDiagnose = async () => {
    setBusy(true)
    try {
      const data = await diagnoseGtmControlLoop(moduleId)
      setLoop(data.controlLoop)
      toast.success('Bottleneck diagnosed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Diagnose failed')
    } finally {
      setBusy(false)
    }
  }

  const onPropose = async () => {
    setBusy(true)
    try {
      const data = await proposeGtmInterventions(moduleId)
      setLoop(data.controlLoop)
      toast.success(`${data.interventions.length} interventions proposed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Propose failed')
    } finally {
      setBusy(false)
    }
  }

  const onDecide = async (id: string, decision: 'approved' | 'rejected' | 'executing' | 'done') => {
    setBusy(true)
    try {
      const data = await decideGtmIntervention(moduleId, id, decision)
      setLoop(data.controlLoop)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading control loop…
      </div>
    )
  }

  if (!loop) return null

  const checkpoints = loop.checkpointPlan?.checkpoints || []
  const openInterventions = (loop.interventions || []).filter((i) =>
    ['proposed', 'approved', 'executing'].includes(String(i.status))
  )

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-orange-500" />
            Control loop
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Measure → Diagnose → Recommend → Approve → Execute → Re-measure. North Star stays locked unless a human
            changes it.
          </p>
        </div>
        <span
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-wide',
            statusColor(loop.status)
          )}
        >
          {loop.status || 'pending'}
          {loop.currentPeriod?.attainmentPct != null ? ` · ${loop.currentPeriod.attainmentPct}%` : ''}
        </span>
      </div>

      {(goalSystem?.north_star_metric || goalSystem?.quantified_target) && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {goalSystem.north_star_metric || 'North Star'}
          </span>
          {goalSystem.quantified_target ? ` — ${goalSystem.quantified_target}` : ''}
        </p>
      )}

      {/* Checkpoints */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {checkpoints.map((c) => (
            <div
              key={c.period}
              className={cn(
                'w-28 rounded-lg border px-2 py-2 text-center',
                statusColor(c.status)
              )}
            >
              <p className="text-[10px] uppercase tracking-wide opacity-70">{c.label}</p>
              <p className="mt-1 text-sm font-semibold">{c.target ?? '—'}</p>
              <p className="text-[11px] opacity-80">
                actual {c.actual ?? '—'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Measure */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</label>
          <Input
            className="h-8 w-20"
            value={periodInput}
            onChange={(e) => setPeriodInput(e.target.value)}
            placeholder="1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual</label>
          <Input
            className="h-8 w-28"
            value={actualInput}
            onChange={(e) => setActualInput(e.target.value)}
            placeholder="e.g. 34"
          />
        </div>
        <Button type="button" size="sm" disabled={busy} onClick={() => void onMeasure()}>
          Record
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onDiagnose()}>
          Diagnose
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onPropose()}>
          Propose fixes
        </Button>
      </div>

      {/* Recovery */}
      {loop.recovery?.recommendation && loop.recovery.recommendation !== 'on_track' ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Recovery needed: {loop.recovery.recommendation.replace(/_/g, ' ')}</p>
            <p className="mt-0.5 text-muted-foreground">
              Shortfall {loop.recovery.shortfall ?? '—'} · need ~{loop.recovery.requiredPerPeriod ?? '—'} / period.
              Choices: {(loop.recovery.choices || []).join(', ') || 'n/a'} — never silently change the target.
            </p>
          </div>
        </div>
      ) : null}

      {/* Diagnosis */}
      {loop.lastDiagnosis ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <p className="font-medium">
            Bottleneck: {loop.lastDiagnosis.bottleneck_stage || '—'}
          </p>
          <p className="mt-1 text-muted-foreground">{loop.lastDiagnosis.summary}</p>
          {loop.lastDiagnosis.reallocation ? (
            <p className="mt-1 text-muted-foreground">Reallocate: {loop.lastDiagnosis.reallocation}</p>
          ) : null}
        </div>
      ) : null}

      {/* Interventions */}
      {openInterventions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Interventions
          </p>
          {openInterventions.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-lg border border-border/60 px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{item.intervention || item.problem}</p>
                <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{item.status}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {item.affected_metric}: {item.current_value ?? '—'} → {item.target_value ?? '—'} · {item.duration} ·{' '}
                {item.owner}
              </p>
              {item.expected_impact ? (
                <p className="mt-0.5 text-muted-foreground">Impact: {item.expected_impact}</p>
              ) : null}
              {item.requires_human_approval ? (
                <p className="mt-1 text-[11px] text-amber-700">Requires human approval</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.status === 'proposed' ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7"
                      disabled={busy}
                      onClick={() => void onDecide(item.id, 'approved')}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={busy}
                      onClick={() => void onDecide(item.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {item.status === 'approved' ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    disabled={busy}
                    onClick={() => void onDecide(item.id, 'executing')}
                  >
                    Mark executing
                  </Button>
                ) : null}
                {item.status === 'executing' ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    disabled={busy}
                    onClick={() => void onDecide(item.id, 'done')}
                  >
                    Mark done
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No open interventions. Record an actual, diagnose, then propose fixes.
        </p>
      )}

      {/* Weekly cycle */}
      <div className="grid gap-1 sm:grid-cols-2">
        {(loop.weeklyCycle || []).map((row) => (
          <div key={row.day} className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Circle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-orange-400" />
            <span>
              <span className="font-medium text-foreground">{row.day}:</span> {row.focus}
            </span>
          </div>
        ))}
      </div>

      {/* Tiered cadence */}
      {loop.cadence ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Review cadence
          </p>
          {loop.cadence.principle ? (
            <p className="text-xs text-muted-foreground">{loop.cadence.principle}</p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['Real time', loop.cadence.real_time_monitoring],
                ['Daily', loop.cadence.daily_review],
                ['Weekly', loop.cadence.weekly_course_correction],
                ['Biweekly', loop.cadence.biweekly_experiment_review],
                ['Monthly', loop.cadence.monthly_resource_review],
                ['Quarterly', loop.cadence.quarterly_strategy_review],
              ] as const
            ).map(([label, items]) =>
              items?.length ? (
                <div key={label} className="text-[11px]">
                  <p className="font-medium text-foreground">{label}</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-3.5 text-muted-foreground">
                    {items.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>
          {(loop.cadence.metric_review_windows || []).length > 0 ? (
            <div className="pt-1 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground">Metric review windows</p>
              <ul className="mt-0.5 space-y-0.5">
                {loop.cadence.metric_review_windows!.slice(0, 5).map((w) => (
                  <li key={w.metric_class}>
                    {w.metric_class}: {w.review_after}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
