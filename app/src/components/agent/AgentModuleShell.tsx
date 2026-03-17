import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Play, RotateCcw, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from './AgentRunPanel'
import { OfferSelector, type Offer } from './OfferSelector'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export interface AgentConfig {
  name: string        // agent key e.g. "isha"
  label: string       // display name e.g. "Isha — Market Intelligence"
  taskType: string
  defaultQuery: string
  badge?: string      // optional badge color class
}

interface AgentModuleShellProps {
  moduleId?: string
  title: string
  description: string
  agents: AgentConfig[]                                       // 1 or 2 agents
  renderArtifact?: (agent: string, artifact: Record<string, unknown>) => React.ReactNode
  children?: React.ReactNode                                  // optional extra UI below
}

function SingleAgentCard({
  cfg,
  moduleId,
  companyId,
  selectedOffer,
  renderArtifact,
  shouldAutoRun = false,
}: {
  cfg: AgentConfig
  moduleId?: string
  companyId: string
  selectedOffer: Offer | null
  renderArtifact?: (agent: string, artifact: Record<string, unknown>) => React.ReactNode
  shouldAutoRun?: boolean
}) {
  const [query, setQuery] = useState(cfg.defaultQuery)
  const persistenceKey = moduleId
    ? [
        'marqq_agent_run',
        moduleId,
        cfg.name,
        cfg.taskType,
        companyId || 'no-company',
        selectedOffer?.name || 'all-offers',
      ].join(':')
    : undefined
  const agentRun = useAgentRun(undefined, persistenceKey)
  const isIdle = !agentRun.streaming && !agentRun.text && !agentRun.artifact && !agentRun.error
  const autoRunTriggeredRef = useRef(false)

  useEffect(() => {
    if (!shouldAutoRun || autoRunTriggeredRef.current) return
    autoRunTriggeredRef.current = true
    void agentRun.run(cfg.name, query, cfg.taskType, companyId || undefined, selectedOffer)
  }, [agentRun, cfg.name, cfg.taskType, companyId, query, selectedOffer, shouldAutoRun])

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{cfg.name}</Badge>
            {cfg.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isIdle && (
            <Textarea
              className="min-h-[140px] whitespace-pre-wrap break-words text-sm leading-6 resize-y"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={agentRun.streaming || !query.trim()}
              onClick={() => agentRun.run(cfg.name, query, cfg.taskType, companyId || undefined, selectedOffer)}
              className="h-auto min-h-9 max-w-full whitespace-normal text-left leading-5 gap-1"
            >
              <Play className="h-3 w-3" />
              {agentRun.streaming ? 'Running…' : 'Run'}
            </Button>
            {!isIdle && (
              <Button size="sm" variant="ghost" onClick={agentRun.reset} className="h-auto min-h-9 whitespace-normal text-left leading-5 gap-1">
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AgentRunPanel
        agentName={cfg.name}
        label={cfg.label}
        {...agentRun}
        renderArtifact={
          renderArtifact ? (a) => renderArtifact(cfg.name, a) : undefined
        }
      />
    </div>
  )
}

export function AgentModuleShell({
  moduleId,
  title,
  description,
  agents,
  renderArtifact,
  children,
}: AgentModuleShellProps) {
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id ?? ''
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null)
  const [autoRunAgentName, setAutoRunAgentName] = useState<string | null>(null)
  const [intelRefreshing, setIntelRefreshing] = useState(false)
  const [intelMeta, setIntelMeta] = useState<{ generated_at: string; source?: string; search_query?: string } | null>(null)

  // Load existing industry intel metadata on mount
  useEffect(() => {
    if (!companyId) return
    fetch(`/api/industry-intel/${companyId}`)
      .then(r => r.json())
      .then(d => {
        if (d.generated_at) setIntelMeta({ generated_at: d.generated_at, source: d.source, search_query: d.search_query })
      })
      .catch(() => {})
  }, [companyId])

  const refreshIndustryIntel = useCallback(async () => {
    if (!companyId) return
    setIntelRefreshing(true)
    try {
      const resp = await fetch(`/api/industry-intel/${companyId}/refresh`, { method: 'POST' })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setIntelMeta({ generated_at: data.generated_at, source: data.source, search_query: data.search_query })
      const src = data.source === 'last30days' ? 'last30days (Reddit/YouTube/HN)' : 'AI synthesis'
      toast.success(`Industry intel refreshed via ${src}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIntelRefreshing(false)
    }
  }, [companyId])

  useEffect(() => { setSelectedOffer(null) }, [activeWorkspace?.id])

  useEffect(() => {
    if (!moduleId) return
    try {
      const raw = sessionStorage.getItem('marqq_agent_module_autorun')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.moduleId === moduleId && typeof parsed?.agentName === 'string') {
        setAutoRunAgentName(parsed.agentName)
        sessionStorage.removeItem('marqq_agent_module_autorun')
      }
    } catch {
      // ignore malformed autorun payloads
    }
  }, [moduleId])

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="space-y-2">
        {activeWorkspace ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Running for:</span>
            <Badge variant="outline">{activeWorkspace.name}</Badge>
          </div>
        ) : (
          <p className="text-sm text-amber-500">
            Select or create a workspace in Settings to run agents.
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <OfferSelector
              companyId={companyId}
              value={selectedOffer?.name ?? ''}
              onChange={(_name, offer) => setSelectedOffer(offer)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshIndustryIntel}
            disabled={intelRefreshing || !companyId}
            title={intelMeta
              ? `Last refreshed: ${new Date(intelMeta.generated_at).toLocaleString()} via ${intelMeta.source ?? 'unknown'}${intelMeta.search_query ? ` · query: "${intelMeta.search_query}"` : ''}`
              : 'Fetch last-30-days industry intelligence from Reddit, YouTube, HN — injected into every agent run'}
            className="shrink-0"
          >
            <TrendingUp className={`h-3.5 w-3.5 mr-1.5 ${intelRefreshing ? 'animate-pulse' : ''}`} />
            {intelRefreshing ? 'Refreshing…' : 'Industry Intel'}
            {intelMeta && !intelRefreshing && (
              <span className={`ml-1.5 text-xs ${intelMeta.source === 'last30days' ? 'text-green-500' : 'text-amber-500'}`}>●</span>
            )}
          </Button>
        </div>
      </div>

      <div className={agents.length > 1 ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
        {agents.map(cfg => (
          <SingleAgentCard
            key={cfg.name}
            cfg={cfg}
            moduleId={moduleId}
            companyId={companyId}
            selectedOffer={selectedOffer}
            renderArtifact={renderArtifact}
            shouldAutoRun={autoRunAgentName === cfg.name}
          />
        ))}
      </div>

      {children}
    </div>
  )
}
