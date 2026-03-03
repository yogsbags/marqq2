import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { addAiTasks } from '@/lib/taskStore'
import type { ArtifactRecord } from '../api'
import { fetchJson } from '../api'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

export function CompetitorIntelligencePage({ artifact }: Props) {
  const data = asObj(artifact?.data)
  const [monitoringCompetitors, setMonitoringCompetitors] = useState<Record<string, boolean>>({})
  const [monitoredCompetitors, setMonitoredCompetitors] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('torqq_monitored_competitors')
      const parsed = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)) : [])
    } catch {
      return new Set<string>()
    }
  })
  const [deployCompetitor, setDeployCompetitor] = useState<any | null>(null)
  const [deployCompetitorIndex, setDeployCompetitorIndex] = useState<number | null>(null)
  const [deployPlan, setDeployPlan] = useState<{ tasks?: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>; executionPrompt?: string } | null>(null)
  const [isPreparingDeploy, setIsPreparingDeploy] = useState(false)

  function getMonitorKey(competitor: any, index: number) {
    const competitorName = String(competitor?.name || `Competitor ${index + 1}`).trim()
    const competitorWebsite = String(competitor?.website || '').trim()
    return `${competitorName}::${competitorWebsite || 'no-site'}`
  }

  function buildMonitorRequest(competitor: any, index: number) {
    const competitorName = String(competitor?.name || `Competitor ${index + 1}`).trim()
    const competitorWebsite = String(competitor?.website || '').trim()
    return [
      `Monitor competitor ${competitorName}.`,
      competitorWebsite ? `Website: ${competitorWebsite}.` : null,
      'Track positioning, messaging, offer changes, pricing signals, content themes, and campaign moves.',
      'Break this into actionable recurring monitoring tasks for the taskboard.'
    ]
      .filter(Boolean)
      .join(' ')
  }

  async function openMonitorDeploy(competitor: any, index: number) {
    const monitorKey = getMonitorKey(competitor, index)
    if (monitoringCompetitors[monitorKey] || monitoredCompetitors.has(monitorKey)) return

    setDeployCompetitor(competitor)
    setDeployCompetitorIndex(index)
    setDeployPlan(null)
    setIsPreparingDeploy(true)

    try {
      const plan = await fetchJson<{ tasks?: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>; executionPrompt?: string }>(
        '/api/agents/priya/plan',
        {
          method: 'POST',
          body: JSON.stringify({ task: buildMonitorRequest(competitor, index) })
        }
      )
      setDeployPlan(plan)
    } catch {
      toast.error('Failed to prepare competitor monitoring deployment.')
      setDeployCompetitor(null)
      setDeployCompetitorIndex(null)
    } finally {
      setIsPreparingDeploy(false)
    }
  }

  async function monitorCompetitor(competitor: any, index: number) {
    const competitorName = String(competitor?.name || `Competitor ${index + 1}`).trim()
    const monitorKey = getMonitorKey(competitor, index)

    if (monitoringCompetitors[monitorKey] || monitoredCompetitors.has(monitorKey)) return

    setMonitoringCompetitors((prev) => ({ ...prev, [monitorKey]: true }))

    try {
      const plan =
        deployPlan ||
        (await fetchJson<{ tasks?: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>; executionPrompt?: string }>(
          '/api/agents/priya/plan',
          {
            method: 'POST',
            body: JSON.stringify({ task: buildMonitorRequest(competitor, index) })
          }
        ))

      addAiTasks(
        (Array.isArray(plan.tasks) ? plan.tasks : []).map((task) => ({
          label: `[Priya • Competitor Monitor • ${competitorName}] ${task.label}`,
          horizon: task.horizon || 'week'
        }))
      )

      await fetchJson(`/api/agents/priya/run`, {
        method: 'POST',
        body: JSON.stringify({
          query:
            String(plan.executionPrompt || '').trim() ||
            `Monitor competitor ${competitorName} and report notable changes in positioning, messaging, offers, pricing, and campaigns.`
        })
      })

      try {
        const existing = localStorage.getItem('torqq_monitored_competitors')
        const parsed = existing ? JSON.parse(existing) : []
        const next = new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)) : [])
        next.add(monitorKey)
        localStorage.setItem('torqq_monitored_competitors', JSON.stringify(Array.from(next)))
        setMonitoredCompetitors(next)
      } catch {
        // ignore storage errors
      }

      toast.success(`Priya is now monitoring ${competitorName}. Tasks were added to the taskboard.`)
      setDeployCompetitor(null)
      setDeployCompetitorIndex(null)
      setDeployPlan(null)
    } catch {
      toast.error(`Failed to start monitoring for ${competitorName}.`)
    } finally {
      setMonitoringCompetitors((prev) => ({ ...prev, [monitorKey]: false }))
    }
  }

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No competitor analysis yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see competitors, differentiators, and messaging gaps.</CardContent>
      </Card>
    )
  }

  const top: any[] = Array.isArray(data.topCompetitors) ? data.topCompetitors : []
  const comparison = asObj(data.comparison) || {}
  const hasContent =
    top.length > 0 ||
    (Array.isArray(comparison.yourDifferentiators) && comparison.yourDifferentiators.length > 0) ||
    (Array.isArray(comparison.messagingGaps) && comparison.messagingGaps.length > 0) ||
    (Array.isArray(comparison.opportunities) && comparison.opportunities.length > 0)

  if (!hasContent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Competitor analysis is empty</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Generation completed, but no usable competitor data was returned. Try generating again after refreshing the company profile context.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Top Competitors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {top.length ? (
                top.map((c, idx) => (
                  <div key={idx} className="border rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{String(c.name || `Competitor ${idx + 1}`)}</div>
                      <div className="flex items-center gap-2">
                        {c.website ? (
                          <a className="text-xs text-orange-600 underline break-all dark:text-orange-300" href={String(c.website)} target="_blank" rel="noreferrer">
                            {String(c.website)}
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 bg-gradient-to-r from-orange-500 to-amber-500 px-3 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
                          disabled={monitoringCompetitors[getMonitorKey(c, idx)] || monitoredCompetitors.has(getMonitorKey(c, idx))}
                          onClick={() => {
                            void openMonitorDeploy(c, idx)
                          }}
                        >
                          {monitoredCompetitors.has(getMonitorKey(c, idx))
                            ? 'Monitoring'
                            : monitoringCompetitors[getMonitorKey(c, idx)]
                              ? 'Starting...'
                              : 'Monitor'}
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{String(c.whyRelevant || '')}</div>
                    <div className="text-sm text-foreground mt-2">{String(c.positioningSnapshot || '')}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      <div className="text-xs text-muted-foreground">
                        <div className="font-semibold mb-1">Strengths</div>
                        {(Array.isArray(c.strengths) ? c.strengths : []).slice(0, 6).map((s: string, i: number) => (
                          <div key={i}>• {s}</div>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <div className="font-semibold mb-1">Weaknesses</div>
                        {(Array.isArray(c.weaknesses) ? c.weaknesses : []).slice(0, 6).map((s: string, i: number) => (
                          <div key={i}>• {s}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">—</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Edge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="font-semibold text-xs text-muted-foreground mb-1">Differentiators</div>
                {(Array.isArray(comparison.yourDifferentiators) ? comparison.yourDifferentiators : []).slice(0, 10).map((d: string, i: number) => (
                  <div key={i}>• {d}</div>
                ))}
              </div>
              <div>
                <div className="font-semibold text-xs text-muted-foreground mb-1">Messaging Gaps</div>
                {(Array.isArray(comparison.messagingGaps) ? comparison.messagingGaps : []).slice(0, 10).map((d: string, i: number) => (
                  <div key={i}>• {d}</div>
                ))}
              </div>
              <div>
                <div className="font-semibold text-xs text-muted-foreground mb-1">Opportunities</div>
                {(Array.isArray(comparison.opportunities) ? comparison.opportunities : []).slice(0, 10).map((d: string, i: number) => (
                  <div key={i}>• {d}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!deployCompetitor}
        onOpenChange={(open) => {
          if (!open) {
            setDeployCompetitor(null)
            setDeployCompetitorIndex(null)
            setDeployPlan(null)
            setIsPreparingDeploy(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deploy Priya for Competitor Monitoring</DialogTitle>
            <DialogDescription>
              Priya will track competitor moves, create recurring monitoring tasks, and start a brand-intelligence run for this competitor.
            </DialogDescription>
          </DialogHeader>

          {deployCompetitor ? (
            <div className="space-y-4">
              <Card className="border-orange-200/70 bg-orange-50/70 dark:border-orange-900/40 dark:bg-orange-950/10">
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-semibold text-white shadow-sm">
                    P
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">Priya · Brand Intelligence</div>
                    <div className="text-sm text-muted-foreground">
                      Research-led, positioning-aware, and strong at turning market changes into actionable brand decisions.
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monitoring Target</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="font-semibold text-foreground">
                    {String(deployCompetitor.name || (deployCompetitorIndex !== null ? `Competitor ${deployCompetitorIndex + 1}` : 'Competitor'))}
                  </div>
                  {deployCompetitor.website ? (
                    <div className="break-all text-muted-foreground">{String(deployCompetitor.website)}</div>
                  ) : null}
                  {deployCompetitor.whyRelevant ? (
                    <div className="pt-1 text-muted-foreground">{String(deployCompetitor.whyRelevant)}</div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tasks Priya will add to the taskboard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {isPreparingDeploy ? (
                    <div className="text-muted-foreground">Preparing monitoring plan...</div>
                  ) : Array.isArray(deployPlan?.tasks) && deployPlan.tasks.length ? (
                    deployPlan.tasks.slice(0, 6).map((task, index) => (
                      <div key={`${task.label}-${index}`} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                        <div className="text-foreground">{task.label}</div>
                        <div className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{task.horizon}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">No monitoring tasks were prepared yet.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeployCompetitor(null)
                setDeployCompetitorIndex(null)
                setDeployPlan(null)
                setIsPreparingDeploy(false)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
              disabled={isPreparingDeploy || !deployCompetitor || deployCompetitorIndex === null}
              onClick={() => {
                if (!deployCompetitor || deployCompetitorIndex === null) return
                void monitorCompetitor(deployCompetitor, deployCompetitorIndex)
              }}
            >
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
