import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pause, Play, Square, RefreshCw } from 'lucide-react'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import type { ArtifactRecord } from '../api'
import { fetchJson } from '../api'
import { clampDisplayScore } from '../ui/ArtifactScoreCards'

type Props = {
  artifact: ArtifactRecord | null
  companyId?: string
  companyName?: string
  websiteUrl?: string | null
}

type DeploymentInfo = {
  id: string
  status: string        // active | running | paused | stopped | failed
  lastRunAt?: string | null
  scheduledFor?: string | null
  runCount?: number
  error?: string | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : {}
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, '-')
}

function monitorKey(competitor: any, index: number) {
  const name = String(competitor?.name || `Competitor ${index + 1}`).trim()
  const site = String(competitor?.website || '').trim()
  return `${name}::${site || 'no-site'}`
}

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function formatFuture(iso: string | null | undefined): string | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'soon'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `in ${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `in ${hr}h`
  return `in ${Math.floor(hr / 24)}d`
}

export function CompetitorIntelligencePage({ artifact, companyId, companyName, websiteUrl }: Props) {
  const data = asObj(artifact?.data)

  // Server-backed deployment state keyed by normalizeKey(agentTarget)
  const [deployments, setDeployments] = useState<Record<string, DeploymentInfo>>({})
  const [deployingKey, setDeployingKey] = useState<string | null>(null)

  // Deploy-confirm dialog
  const [deployCompetitor, setDeployCompetitor] = useState<any | null>(null)
  const [deployCompetitorIndex, setDeployCompetitorIndex] = useState<number | null>(null)
  const [deployPlan, setDeployPlan] = useState<{ tasks?: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>; executionPrompt?: string } | null>(null)
  const [isPreparingDeploy, setIsPreparingDeploy] = useState(false)

  const loadDeployments = useCallback(async () => {
    if (!companyId) return
    try {
      const response = await fetchJson<{ deployments?: Array<Record<string, unknown>> }>('/api/agents/deployments')
      const next: Record<string, DeploymentInfo> = {}
      for (const dep of Array.isArray(response.deployments) ? response.deployments : []) {
        if (String(dep?.source || '') !== 'company-intelligence') continue
        if (String(dep?.companyId || '') !== companyId) continue
        if (String(dep?.sectionId || '') !== 'competitor_intelligence') continue
        if (String(dep?.scheduleMode || '') !== 'monitor') continue
        const target = String(dep?.agentTarget || '').trim()
        if (!target) continue
        const status = String(dep?.status || '')
        if (['stopped', 'failed', 'completed'].includes(status) && !dep?.lastRunAt) continue
        next[normalizeKey(target)] = {
          id: String(dep?.id || ''),
          status,
          lastRunAt: dep?.lastRunAt ? String(dep.lastRunAt) : null,
          scheduledFor: dep?.scheduledFor ? String(dep.scheduledFor) : null,
          runCount: typeof dep?.runCount === 'number' ? dep.runCount : undefined,
          error: dep?.error ? String(dep.error) : null,
        }
      }
      setDeployments(next)
    } catch {
      // non-blocking
    }
  }, [companyId])

  useEffect(() => {
    void loadDeployments()
  }, [loadDeployments])

  function buildMonitorRequest(competitor: any, index: number) {
    const name = String(competitor?.name || `Competitor ${index + 1}`).trim()
    const site = String(competitor?.website || '').trim()
    return [
      companyName ? `Company: ${companyName}.` : null,
      websiteUrl ? `Company website: ${websiteUrl}.` : null,
      `Monitor competitor ${name}.`,
      site ? `Website: ${site}.` : null,
      'Track positioning, messaging, offer changes, pricing signals, content themes, and campaign moves.',
      'Break this into actionable recurring monitoring tasks for the taskboard.',
    ].filter(Boolean).join(' ')
  }

  async function openMonitorDeploy(competitor: any, index: number) {
    const key = monitorKey(competitor, index)
    if (deployingKey === key || deployments[normalizeKey(key)]) return

    setDeployCompetitor(competitor)
    setDeployCompetitorIndex(index)
    setDeployPlan(null)
    setIsPreparingDeploy(true)

    try {
      const plan = await fetchJson<{ tasks?: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>; executionPrompt?: string }>(
        '/api/agents/priya/plan',
        {
          method: 'POST',
          body: JSON.stringify({
            task: buildMonitorRequest(competitor, index),
            marketingContext: { companyId, companyName, websiteUrl, competitorIntelligence: data },
          }),
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

  async function startMonitoring(competitor: any, index: number) {
    const name = String(competitor?.name || `Competitor ${index + 1}`).trim()
    const key = monitorKey(competitor, index)
    setDeployingKey(key)

    try {
      const plan = deployPlan || await fetchJson<{ tasks?: Array<{ label: string; horizon: 'day' | 'week' | 'month' }>; executionPrompt?: string }>(
        '/api/agents/priya/plan',
        {
          method: 'POST',
          body: JSON.stringify({
            task: buildMonitorRequest(competitor, index),
            marketingContext: { companyId, companyName, websiteUrl, competitorIntelligence: data },
          }),
        }
      )

      // Register as a scheduled monitor deployment (server-persisted, survives browser refresh)
      await fetchJson('/api/agents/deployments', {
        method: 'POST',
        body: JSON.stringify({
          agentName: 'priya',
          agentTarget: key,
          companyId: companyId || null,
          sectionId: 'competitor_intelligence',
          sectionTitle: `Competitor Monitor: ${name}`,
          summary: `Recurring competitor monitoring for ${name}.`,
          bullets: ['Track positioning changes', 'Monitor messaging and offer updates', 'Catch campaign moves'],
          tasks: (Array.isArray(plan.tasks) ? plan.tasks : []).map((t) => ({ label: t.label, horizon: t.horizon })),
          scheduleMode: 'monitor',
          runPrompt: String(plan.executionPrompt || '').trim() || buildMonitorRequest(competitor, index),
          source: 'company-intelligence',
        }),
      })

      await loadDeployments()
      toast.success(`Priya is now monitoring ${name}. Tasks added to the taskboard.`)
      setDeployCompetitor(null)
      setDeployCompetitorIndex(null)
      setDeployPlan(null)
    } catch {
      toast.error(`Failed to start monitoring for ${name}.`)
    } finally {
      setDeployingKey(null)
    }
  }

  async function handleDeploymentAction(deploymentId: string, action: 'pause' | 'resume' | 'stop') {
    try {
      await fetchJson(`/api/agents/deployments/${deploymentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      await loadDeployments()
    } catch {
      toast.error(`Failed to ${action} monitoring.`)
    }
  }

  if (!artifact || !asObj(artifact?.data)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">No competitor analysis yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to see competitors, differentiators, and messaging gaps.</CardContent>
      </Card>
    )
  }

  const top: any[] = Array.isArray(data.topCompetitors) ? data.topCompetitors : []
  const comparison = asObj(data.comparison)
  const aiScores = asObj(data.scores)

  const hasContent =
    top.length > 0 ||
    (Array.isArray(comparison.yourDifferentiators) && comparison.yourDifferentiators.length > 0) ||
    (Array.isArray(comparison.messagingGaps) && comparison.messagingGaps.length > 0) ||
    (Array.isArray(comparison.opportunities) && comparison.opportunities.length > 0)

  if (!hasContent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">Competitor analysis is empty</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Generation completed but no usable competitor data was returned. Try regenerating after refreshing the company profile.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Score cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-orange-600 dark:text-orange-400">Competitor Coverage</div>
            <div className="text-2xl font-bold">
              {Number.isFinite(Number(aiScores?.competitorCoverage))
                ? clampDisplayScore(aiScores.competitorCoverage)
                : clampDisplayScore(
                    (Math.min(top.length, 5) / 5) * 70 +
                    (top.filter((c) => String(c?.website || '').trim()).length / Math.max(top.length, 1)) * 30
                  )}
              /100
            </div>
            <div className="text-xs text-muted-foreground mt-1">How complete the competitor set and source coverage are.</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-orange-600 dark:text-orange-400">Differentiation Strength</div>
            <div className="text-2xl font-bold">
              {Number.isFinite(Number(aiScores?.differentiationStrength))
                ? clampDisplayScore(aiScores.differentiationStrength)
                : clampDisplayScore(
                    Math.min((Array.isArray(comparison.yourDifferentiators) ? comparison.yourDifferentiators.length : 0) * 18, 72) +
                    Math.min((Array.isArray(comparison.messagingGaps) ? comparison.messagingGaps.length : 0) * 7, 28)
                  )}
              /100
            </div>
            <div className="text-xs text-muted-foreground mt-1">How clearly your edge vs competitors is articulated.</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-orange-600 dark:text-orange-400">Whitespace Opportunity</div>
            <div className="text-2xl font-bold">
              {Number.isFinite(Number(aiScores?.whitespaceOpportunity))
                ? clampDisplayScore(aiScores.whitespaceOpportunity)
                : clampDisplayScore(
                    Math.min((Array.isArray(comparison.opportunities) ? comparison.opportunities.length : 0) * 20, 80) +
                    Math.min((Array.isArray(comparison.messagingGaps) ? comparison.messagingGaps.length : 0) * 10, 20)
                  )}
              /100
            </div>
            <div className="text-xs text-muted-foreground mt-1">How much actionable room the analysis found in the market.</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Competitor list */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base text-orange-600 dark:text-orange-400">Top Competitors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {top.length ? (
                top.map((c, idx) => {
                  const key = monitorKey(c, idx)
                  const dep = deployments[normalizeKey(key)]
                  const isActive = dep && ['active', 'running'].includes(dep.status)
                  const isPaused = dep?.status === 'paused'
                  const isMonitored = isActive || isPaused
                  const isStarting = deployingKey === key

                  return (
                    <div key={idx} className="border rounded-md p-3 space-y-2">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm">{String(c.name || `Competitor ${idx + 1}`)}</div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.website ? (
                            <a className="text-xs text-orange-600 underline dark:text-orange-300 hidden sm:block" href={String(c.website)} target="_blank" rel="noreferrer">
                              {String(c.website).replace(/^https?:\/\//, '')}
                            </a>
                          ) : null}

                          {!isMonitored ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 bg-gradient-to-r from-orange-500 to-amber-500 px-3 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
                              disabled={isStarting}
                              onClick={() => void openMonitorDeploy(c, idx)}
                            >
                              {isStarting ? 'Starting…' : 'Monitor'}
                            </Button>
                          ) : (
                            <div className="flex items-center gap-1">
                              {isPaused ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  title="Resume monitoring"
                                  onClick={() => dep?.id && void handleDeploymentAction(dep.id, 'resume')}
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  title="Pause monitoring"
                                  onClick={() => dep?.id && void handleDeploymentAction(dep.id, 'pause')}
                                >
                                  <Pause className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-red-500 hover:text-red-600"
                                title="Stop monitoring"
                                onClick={() => dep?.id && void handleDeploymentAction(dep.id, 'stop')}
                              >
                                <Square className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Monitor status bar */}
                      {dep && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                          <span className={[
                            'inline-flex items-center gap-1 font-medium',
                            isActive ? 'text-green-600 dark:text-green-400' :
                            isPaused ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-gray-500'
                          ].join(' ')}>
                            <span className={[
                              'h-1.5 w-1.5 rounded-full',
                              isActive ? 'bg-green-500 animate-pulse' :
                              isPaused ? 'bg-yellow-500' :
                              'bg-gray-400'
                            ].join(' ')} />
                            {dep.status === 'running' ? 'Running now' : isPaused ? 'Paused' : 'Monitoring'}
                          </span>
                          {dep.lastRunAt && (
                            <span>Last run: {formatRelative(dep.lastRunAt)}</span>
                          )}
                          {isActive && dep.scheduledFor && dep.scheduledFor !== 'next_cron_run' && (
                            <span>Next: {formatFuture(dep.scheduledFor)}</span>
                          )}
                          {typeof dep.runCount === 'number' && dep.runCount > 0 && (
                            <span>{dep.runCount} run{dep.runCount !== 1 ? 's' : ''}</span>
                          )}
                          {dep.error && (
                            <span className="text-red-500 truncate max-w-[160px]" title={dep.error}>
                              Error: {dep.error}
                            </span>
                          )}
                          <button
                            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                            title="Refresh status"
                            onClick={() => void loadDeployments()}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        </div>
                      )}

                      {/* Content */}
                      <div className="text-xs text-muted-foreground">{String(c.whyRelevant || '')}</div>
                      <div className="text-sm text-foreground">{String(c.positioningSnapshot || '')}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
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
                  )
                })
              ) : (
                <div className="text-sm text-muted-foreground">—</div>
              )}
            </CardContent>
          </Card>

          {/* Your edge */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-orange-600 dark:text-orange-400">Your Edge</CardTitle>
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

      {/* Deploy confirm dialog */}
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
              Priya will track competitor moves on a recurring schedule. Tasks will be added to the taskboard and results surface in notifications.
            </DialogDescription>
          </DialogHeader>

          {deployCompetitor && (
            <div className="space-y-4">
              <Card className="border-orange-200/70 bg-orange-50/70 dark:border-orange-900/40 dark:bg-orange-950/10">
                <CardContent className="flex items-start gap-4 p-4">
                  <AgentAvatar name="priya" size="lg" className="h-12 w-12 rounded-full" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">Priya · Brand Intelligence</div>
                    <div className="text-sm text-muted-foreground">
                      Tracks positioning, messaging, pricing, and campaign moves. Runs on a recurring schedule and pushes updates to notifications.
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-orange-600 dark:text-orange-400">Monitoring Target</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="font-semibold text-foreground">
                    {String(deployCompetitor.name || (deployCompetitorIndex !== null ? `Competitor ${deployCompetitorIndex + 1}` : 'Competitor'))}
                  </div>
                  {deployCompetitor.website && (
                    <div className="break-all text-muted-foreground">{String(deployCompetitor.website)}</div>
                  )}
                  {deployCompetitor.whyRelevant && (
                    <div className="pt-1 text-muted-foreground">{String(deployCompetitor.whyRelevant)}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-orange-600 dark:text-orange-400">Tasks Priya will add to the taskboard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {isPreparingDeploy ? (
                    <div className="text-muted-foreground">Preparing monitoring plan…</div>
                  ) : Array.isArray(deployPlan?.tasks) && deployPlan.tasks.length ? (
                    deployPlan.tasks.slice(0, 6).map((task, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                        <div className="text-foreground">{task.label}</div>
                        <div className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{task.horizon}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">No task breakdown yet — Priya will generate tasks on first run.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setDeployCompetitor(null)
              setDeployCompetitorIndex(null)
              setDeployPlan(null)
              setIsPreparingDeploy(false)
            }}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
              disabled={isPreparingDeploy || !deployCompetitor || deployCompetitorIndex === null}
              onClick={() => {
                if (!deployCompetitor || deployCompetitorIndex === null) return
                void startMonitoring(deployCompetitor, deployCompetitorIndex)
              }}
            >
              Deploy & Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
