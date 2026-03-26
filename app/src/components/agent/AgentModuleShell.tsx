import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ChevronDown, Play, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from './AgentRunPanel'
import { ReportDeliveryCard } from './ReportDeliveryCard'
import { OfferSelector, type Offer } from './OfferSelector'
import { AnalyticsDataInput, type AnalyticsResult } from './AnalyticsDataInput'
import { useWorkspace } from '@/contexts/WorkspaceContext'

// Agents that support campaign analytics data input
const ANALYTICS_AGENT_NAMES = ['dev', 'arjun']

function getRecentConversation(): Array<{ role: 'user' | 'assistant'; content: string }> {
  try {
    const raw = localStorage.getItem('marqq_conversations')
    if (!raw) return []
    const convs = JSON.parse(raw)
    const latest = convs[0]
    if (!latest?.messages) return []
    return latest.messages.slice(-6).map((m: { sender: string; content: string }) => ({
      role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }))
  } catch { return [] }
}

export interface AgentConfig {
  name: string        // agent key e.g. "isha"
  label: string       // display name e.g. "Isha — Market Intelligence"
  taskType: string
  defaultQuery: string
  badge?: string      // optional badge color class
  placeholder?: string  // textarea hint text shown before user types
  tags?: string[]       // extra Langfuse trace tags for this agent run
}

interface AgentModuleShellProps {
  moduleId?: string
  title: string
  description: string
  agents: AgentConfig[]                                       // 1 or 2 agents
  renderArtifact?: (agent: string, artifact: Record<string, unknown>) => React.ReactNode
  children?: React.ReactNode                                  // optional extra UI below
  preAgentContent?: React.ReactNode
  hideHeader?: boolean                                        // suppress the Goal Workspace header (use when the flow has its own hero section)
  hideMarketSignals?: boolean                                 // hide the Market Signals button (e.g. on outreach screens)
  collapseSetupControls?: boolean
  disabledReason?: string | null
  resourceContextLabel?: string
  resourceContextPlaceholder?: string
  resourceContextHint?: string
  buildResourceContext?: (value: string, agent: AgentConfig) => string
  resourceContextPlacement?: 'setup' | 'primary'
  secondaryAgentsCollapsed?: boolean
  secondaryAgentsTitle?: string
  enableReportActions?: boolean
}

function SingleAgentCard({
  cfg,
  moduleId,
  companyId,
  selectedOffer,
  renderArtifact,
  shouldAutoRun = false,
  chainedInput,
  onOutputReady,
  conversationHistory,
  disabledReason,
  resourceContext,
  buildResourceContext,
  enableReportActions,
  moduleTitle,
}: {
  cfg: AgentConfig
  moduleId?: string
  companyId: string
  selectedOffer: Offer | null
  renderArtifact?: (agent: string, artifact: Record<string, unknown>) => React.ReactNode
  shouldAutoRun?: boolean
  chainedInput?: string | null
  onOutputReady?: (text: string) => void
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  disabledReason?: string | null
  resourceContext?: string
  buildResourceContext?: (value: string, agent: AgentConfig) => string
  enableReportActions?: boolean
  moduleTitle: string
}) {
  const [query, setQuery] = useState(cfg.defaultQuery)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResult | null>(null)
  // Fix 10: expandable chained-context banner
  const [chainExpanded, setChainExpanded] = useState(false)

  // Fix 1: when chained input arrives, append to query
  useEffect(() => {
    if (chainedInput) {
      setQuery(prev => `${prev}\n\n--- Context from previous agent ---\n${chainedInput}`)
    }
  }, [chainedInput])

  const showAnalyticsInput = ANALYTICS_AGENT_NAMES.includes(cfg.name.toLowerCase())

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

  const buildFinalQuery = (baseQuery: string) => {
    const parts = [baseQuery]
    if (resourceContext?.trim()) {
      parts.push(buildResourceContext ? buildResourceContext(resourceContext.trim(), cfg) : `Use this exact resource context if needed: ${resourceContext.trim()}`)
    }
    if (analyticsData?.summary) {
      parts.push(analyticsData.summary)
    }
    return parts.filter(Boolean).join('\n\n')
  }

  useEffect(() => {
    if (!shouldAutoRun || autoRunTriggeredRef.current) return
    autoRunTriggeredRef.current = true
    void agentRun.run(cfg.name, buildFinalQuery(query), cfg.taskType, companyId || undefined, selectedOffer, cfg.tags, conversationHistory)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoRun])

  return (
    <div className="space-y-3">
      {/* Fix 10: expandable "Context injected" banner */}
      {chainedInput && (
        <div className="rounded-md border border-orange-200 bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-950/20 px-3 py-2 text-xs text-orange-700 dark:text-orange-400">
          <div className="flex items-start gap-2">
            <span className="shrink-0 font-semibold">↓ Context injected</span>
            <button
              type="button"
              onClick={() => setChainExpanded(p => !p)}
              aria-label={chainExpanded ? "Collapse injected context" : "Expand injected context"}
              className="flex-1 text-left text-muted-foreground hover:text-foreground transition-colors"
            >
              {chainExpanded
                ? chainedInput
                : chainedInput.slice(0, 80) + (chainedInput.length > 80 ? '…' : '')}
            </button>
            {chainedInput.length > 80 && (
              <button
                type="button"
                onClick={() => setChainExpanded(p => !p)}
                aria-label={chainExpanded ? "Show less context" : "Show full context"}
                className="shrink-0 underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {chainExpanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span>{cfg.label}</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Run
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Fix 1: textarea visible when idle; collapsed read-only summary after run starts */}
          {isIdle ? (
            <Textarea
              className="min-h-[80px] sm:min-h-[140px] whitespace-pre-wrap break-words text-sm leading-6 resize-y"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={cfg.placeholder}
            />
          ) : (
            <div
              className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground line-clamp-3 cursor-default select-none"
            >
              {query.split('\n\n--- Context from previous agent ---')[0].trim()}
            </div>
          )}
          {isIdle && showAnalyticsInput && (
            <AnalyticsDataInput value={analyticsData} onChange={setAnalyticsData} />
          )}
          {/* Fix 2: only Run button here — Reset lives in AgentRunPanel */}
          <Button
            size="sm"
            disabled={Boolean(disabledReason) || agentRun.streaming || !query.trim()}
            onClick={() => agentRun.run(cfg.name, buildFinalQuery(query), cfg.taskType, companyId || undefined, selectedOffer, cfg.tags, conversationHistory)}
            className="h-auto min-h-9 max-w-full whitespace-normal text-left leading-5 gap-1"
            title={disabledReason || undefined}
          >
            <Play className="h-3 w-3" />
            {agentRun.streaming ? 'Running…' : 'Run'}
          </Button>
          {disabledReason ? (
            <div className="text-xs text-amber-700 dark:text-amber-300">
              {disabledReason}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Fix 2: pass onReset so AgentRunPanel owns the Reset/Retry button */}
      <AgentRunPanel
        agentName={cfg.name}
        label={cfg.label}
        {...agentRun}
        onReset={agentRun.reset}
        onUseAsInput={onOutputReady}
        renderArtifact={
          renderArtifact ? (a) => renderArtifact(cfg.name, a) : undefined
        }
      />
      {enableReportActions && !agentRun.streaming && (agentRun.text || agentRun.artifact) ? (
        <ReportDeliveryCard
          moduleTitle={moduleTitle}
          analysisLabel={cfg.label}
          companyId={companyId}
          sourceText={agentRun.text}
          sourceArtifact={agentRun.artifact}
        />
      ) : null}
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
  preAgentContent,
  hideHeader = false,
  hideMarketSignals = false,
  collapseSetupControls = false,
  disabledReason = null,
  resourceContextLabel,
  resourceContextPlaceholder,
  resourceContextHint,
  buildResourceContext,
  resourceContextPlacement = 'setup',
  secondaryAgentsCollapsed = false,
  secondaryAgentsTitle = 'Next steps',
  enableReportActions = false,
}: AgentModuleShellProps) {
  const { activeWorkspace } = useWorkspace()
  const companyId = activeWorkspace?.id ?? ''
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null)
  const [resourceContext, setResourceContext] = useState('')
  const [autoRunAgentName, setAutoRunAgentName] = useState<string | null>(null)
  const [chainedContext, setChainedContext] = useState<string | null>(null)
  const [intelRefreshing, setIntelRefreshing] = useState(false)
  const [intelMeta, setIntelMeta] = useState<{ generated_at: string; source?: string; search_query?: string } | null>(null)
  const [optionalContextOpen, setOptionalContextOpen] = useState(false)
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  // Read the last 6 messages from the most recent chat conversation so agents have context
  const conversationHistory = useMemo(() => getRecentConversation(), [])

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
    } catch {
      toast.error('Failed to refresh industry intelligence. Please try again.')
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

        // If there's a chained input from the previous module, inject it into chainedContext
        // so the first agent card picks it up as pre-filled context
        try {
          const chainInput = sessionStorage.getItem('marqq_agent_chain_input')
          if (chainInput) {
            setChainedContext(chainInput)
            sessionStorage.removeItem('marqq_agent_chain_input')
          }
        } catch { /* non-blocking */ }
      }
    } catch {
      // ignore malformed autorun payloads
    }
  }, [moduleId])

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="rounded-[28px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.04] px-5 py-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-500">
            Goal Workspace
          </div>
          <div className="mt-2 space-y-1">
            <h1 className="font-brand-syne text-2xl font-semibold tracking-tight text-foreground md:text-[2.05rem]">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {!activeWorkspace ? (
          <p className="text-sm text-amber-500">
            Select or create a workspace in Settings to run agents.
          </p>
        ) : null}
        {resourceContextLabel && resourceContextPlacement === 'primary' ? (
          <Card className="border-border/70 bg-muted/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{resourceContextLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={resourceContext}
                onChange={(event) => setResourceContext(event.target.value)}
                placeholder={resourceContextPlaceholder}
              />
              {resourceContextHint ? <div className="text-xs text-muted-foreground">{resourceContextHint}</div> : null}
            </CardContent>
          </Card>
        ) : null}
        {(collapseSetupControls || activeWorkspace) ? (
          <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
            <button
              type="button"
              aria-expanded={optionalContextOpen}
              onClick={() => setOptionalContextOpen(p => !p)}
              className="flex w-full items-center justify-between text-sm font-medium text-foreground hover:text-foreground/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded"
            >
              <span>Optional context</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${optionalContextOpen ? 'rotate-180' : ''}`} />
            </button>
            {optionalContextOpen && (
              <>
                <div className="mt-1 text-xs text-muted-foreground">
                  Add business context only if it will materially improve the result.
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <OfferSelector
                        companyId={companyId}
                        value={selectedOffer?.name ?? ''}
                        onChange={(_name, offer) => setSelectedOffer(offer)}
                      />
                    </div>
                    {!hideMarketSignals && <Button
                      size="sm"
                      variant="outline"
                      onClick={refreshIndustryIntel}
                      disabled={intelRefreshing || !companyId}
                      title={intelMeta
                        ? `Agents have market context from ${new Date(intelMeta.generated_at).toLocaleString()} · source: ${intelMeta.source ?? 'unknown'}${intelMeta.search_query ? ` · "${intelMeta.search_query}"` : ''}\nClick to pull fresh signals from Reddit, YouTube & HN`
                        : 'Give agents fresh market context — pulls last-30-day signals from Reddit, YouTube & HN and injects them into every agent run'}
                      className="shrink-0"
                    >
                      <TrendingUp className={`h-3.5 w-3.5 mr-1.5 ${intelRefreshing ? 'animate-pulse' : ''}`} />
                      {intelRefreshing ? 'Pulling signals…' : intelMeta ? 'Refresh market context' : 'Add market context'}
                      {intelMeta && !intelRefreshing && (
                        <span
                          aria-label={intelMeta.source === 'last30days' ? 'Fresh signals — agents have live context' : 'Stale — refresh for latest signals'}
                          className={`ml-1.5 text-xs ${intelMeta.source === 'last30days' ? 'text-green-500' : 'text-amber-500'}`}
                        >●</span>
                      )}
                    </Button>}
                  </div>
                  {resourceContextLabel && resourceContextPlacement !== 'primary' ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-foreground">{resourceContextLabel}</div>
                      <Input
                        value={resourceContext}
                        onChange={(event) => setResourceContext(event.target.value)}
                        placeholder={resourceContextPlaceholder}
                      />
                      {resourceContextHint ? <div className="text-xs text-muted-foreground">{resourceContextHint}</div> : null}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {preAgentContent}

      {/* Fix 9: vertical stack instead of 2-column grid — avoids asymmetric heights */}
      <div className="flex flex-col gap-6">
        {agents.length > 0 ? (
          <SingleAgentCard
            key={agents[0].name}
            cfg={agents[0]}
            moduleId={moduleId}
            companyId={companyId}
            selectedOffer={selectedOffer}
            renderArtifact={renderArtifact}
            shouldAutoRun={autoRunAgentName === agents[0].name}
            chainedInput={null}
            onOutputReady={agents.length > 1 ? setChainedContext : undefined}
            conversationHistory={conversationHistory}
            disabledReason={disabledReason}
            resourceContext={resourceContext}
            buildResourceContext={buildResourceContext}
            enableReportActions={enableReportActions}
            moduleTitle={title}
          />
        ) : null}
        {agents.length > 1 ? (
          secondaryAgentsCollapsed ? (
            <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
              <button
                type="button"
                aria-expanded={secondaryOpen}
                onClick={() => setSecondaryOpen(p => !p)}
                className="flex w-full items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded"
              >
                <span>{secondaryAgentsTitle}</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${secondaryOpen ? 'rotate-180' : ''}`} />
              </button>
              {secondaryOpen && (
                <div className="mt-4 flex flex-col gap-6">
                  {agents.slice(1).map((cfg, idx) => (
                    <SingleAgentCard
                      key={cfg.name}
                      cfg={cfg}
                      moduleId={moduleId}
                      companyId={companyId}
                      selectedOffer={selectedOffer}
                      renderArtifact={renderArtifact}
                      shouldAutoRun={autoRunAgentName === cfg.name}
                      chainedInput={chainedContext}
                      onOutputReady={idx === 0 && agents.length > 2 ? setChainedContext : undefined}
                      conversationHistory={conversationHistory}
                      disabledReason={disabledReason}
                      resourceContext={resourceContext}
                      buildResourceContext={buildResourceContext}
                      enableReportActions={enableReportActions}
                      moduleTitle={title}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            agents.slice(1).map((cfg, idx) => (
              <SingleAgentCard
                key={cfg.name}
                cfg={cfg}
                moduleId={moduleId}
                companyId={companyId}
                selectedOffer={selectedOffer}
                renderArtifact={renderArtifact}
                shouldAutoRun={autoRunAgentName === cfg.name}
                chainedInput={chainedContext}
                onOutputReady={idx === 0 && agents.length > 2 ? setChainedContext : undefined}
                conversationHistory={conversationHistory}
                disabledReason={disabledReason}
                resourceContext={resourceContext}
                buildResourceContext={buildResourceContext}
                enableReportActions={enableReportActions}
                moduleTitle={title}
              />
            ))
          )
        ) : null}
      </div>

      {children}
    </div>
  )
}
