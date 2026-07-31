import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CheckCheck, ChevronDown, Send, ShieldCheck, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from './AgentRunPanel'
import { ReportDeliveryCard } from './ReportDeliveryCard'
import { OfferSelector, type Offer } from './OfferSelector'
import { AnalyticsDataInput, type AnalyticsResult } from './AnalyticsDataInput'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { outcomeKindFromPlatform, requestOutcomeGoLive } from '@/components/outcome-previews'

// Agents that support campaign analytics data input
const ANALYTICS_AGENT_NAMES = ['dev', 'arjun']

type SectionChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

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
  /** Prefer these connectors when injecting Composio tools (e.g. paid channel). */
  connectors?: string[]
  /** Paid-ads channel hint for backend tool scoping. */
  paidChannel?: string
  /** draft = save in connector tools; live = allow send/activate tools */
  deliveryMode?: 'draft' | 'live'
  /** Forces the backend contract to emit the matching asset automation trigger. */
  outputMode?: 'text' | 'image' | 'video' | 'avatar_video' | 'email_html' | 'seo_article'
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
  /** Called when an agent run finishes with an artifact (e.g. carry plan → Launch). */
  onArtifactReady?: (agent: string, artifact: Record<string, unknown>) => void
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
  onArtifactReady,
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
  onArtifactReady?: (agent: string, artifact: Record<string, unknown>) => void
}) {
  const [composer, setComposer] = useState(cfg.defaultQuery)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResult | null>(null)
  const [deliveryMode, setDeliveryMode] = useState<'draft' | 'live'>(cfg.deliveryMode ?? 'draft')
  const [messages, setMessages] = useState<SectionChatMessage[]>([])
  const [pendingLivePrompt, setPendingLivePrompt] = useState<string | null>(null)
  // Fix 10: expandable chained-context banner
  const [chainExpanded, setChainExpanded] = useState(false)

  // Fix 1: when chained input arrives, append to query
  useEffect(() => {
    if (chainedInput) {
      setComposer(prev => `${prev}\n\n--- Context from previous agent ---\n${chainedInput}`)
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
  const autoRunTriggeredRef = useRef(false)
  const lastArtifactRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (agentRun.streaming || !agentRun.artifact || !onArtifactReady) return
    if (lastArtifactRef.current === agentRun.artifact) return
    lastArtifactRef.current = agentRun.artifact
    onArtifactReady(cfg.name, agentRun.artifact)
  }, [agentRun.artifact, agentRun.streaming, cfg.name, onArtifactReady])

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

  const runPrompt = (baseQuery: string, isAutomatic = false) => {
    const trimmed = baseQuery.trim()
    if (!trimmed || agentRun.streaming || disabledReason) return
    const finalQuery = buildFinalQuery(trimmed)
    setMessages(prev => [...prev, { id: `${Date.now()}-user`, role: 'user', content: trimmed }])

    // Live work always gets a draft/preview pass first. The user must explicitly
    // approve the same request before the connector is allowed to send/publish.
    const runMode = deliveryMode === 'live' ? 'draft' : 'draft'
    if (deliveryMode === 'live' && !isAutomatic) setPendingLivePrompt(finalQuery)
    const sectionHistory = [
      ...(conversationHistory || []),
      ...messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })),
    ].slice(-12)
    void agentRun.run(cfg.name, finalQuery, cfg.taskType, companyId || undefined, selectedOffer, cfg.tags, sectionHistory, moduleId, runMode, cfg.outputMode, cfg.connectors, cfg.paidChannel)
    setComposer('')
  }

  const approveLiveExecution = () => {
    if (!pendingLivePrompt || agentRun.streaming || !agentRun.artifact) return
    const artifact = agentRun.artifact
    const nestedEmail = artifact.generate_email_html as Record<string, unknown> | undefined
    const nestedArticle = artifact.create_seo_article as Record<string, unknown> | undefined
    const nestedLandingPage = artifact.create_landing_page as Record<string, unknown> | undefined
    const publishable = nestedEmail?.html
      ? { kind: 'newsletter' as const, payload: nestedEmail }
      : nestedArticle?.html
        ? { kind: 'blog' as const, payload: nestedArticle }
        : nestedLandingPage?.html || nestedLandingPage?.page_structure
          ? { kind: 'landing_page' as const, payload: nestedLandingPage }
          : typeof artifact.post === 'string'
            ? { kind: outcomeKindFromPlatform(String(artifact.platform || artifact.channel)), payload: artifact }
            : typeof artifact.body === 'string'
              ? { kind: 'email' as const, payload: artifact }
              : typeof artifact.headline === 'string' || typeof artifact.ad_headline === 'string' || typeof artifact.primary_headline === 'string'
                ? { kind: 'paid_ads' as const, payload: artifact }
                : null
    if (!publishable) {
      toast.error('This result is not a publishable channel asset. Use draft mode or the dedicated execution workspace.')
      return
    }
    setPendingLivePrompt(null)
    setMessages(prev => [...prev, { id: `${Date.now()}-approval`, role: 'system', content: 'Approved — executing the live action now.' }])
    void requestOutcomeGoLive({ kind: publishable.kind, workspaceId: companyId, companyId, payload: publishable.payload })
      .then((result) => {
        if (!result.ok) throw new Error(result.error || 'Live execution failed')
        setMessages(prev => [...prev, { id: `${Date.now()}-success`, role: 'system', content: 'Live execution completed successfully.' }])
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Live execution failed'
        setMessages(prev => [...prev, { id: `${Date.now()}-error`, role: 'system', content: `Live execution failed: ${message}` }])
        toast.error(message)
      })
  }

  useEffect(() => {
    if (!shouldAutoRun || autoRunTriggeredRef.current) return
    autoRunTriggeredRef.current = true
    runPrompt(composer, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoRun])

  useEffect(() => {
    if (agentRun.streaming || !agentRun.text) return
    const runId = agentRun.runId || agentRun.text.slice(0, 48)
    if (messages.some(message => message.id === `assistant-${runId}`)) return
    setMessages(prev => [...prev, { id: `assistant-${runId}`, role: 'assistant', content: agentRun.text }])
  }, [agentRun.streaming, agentRun.text, agentRun.runId, messages])

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
              Agent chat
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-3" aria-live="polite">
              {messages.map(message => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-5 whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-orange-500 text-white'
                      : message.role === 'system'
                        ? 'border border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'
                        : 'bg-background text-foreground border border-border/60'
                  }`}>
                    {message.content}
                  </div>
                </div>
              ))}
              {agentRun.streaming && (
                <div className="text-xs text-muted-foreground">{cfg.label} is working with the connected tools…</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-muted-foreground">Ask, revise, or instruct this agent</span>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Mode</span>
              <select
                value={deliveryMode}
                onChange={(event) => setDeliveryMode(event.target.value as 'draft' | 'live')}
                className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                aria-label="Agent delivery mode"
              >
                <option value="draft">Draft / preview</option>
                <option value="live">Live with approval</option>
              </select>
            </label>
          </div>
          <Textarea
            className="min-h-[80px] whitespace-pre-wrap break-words text-sm leading-6 resize-y"
            value={composer}
            onChange={e => setComposer(e.target.value)}
            placeholder={cfg.placeholder || 'Ask this agent a question or give it an execution instruction…'}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                runPrompt(composer)
              }
            }}
          />
          {showAnalyticsInput && (
            <AnalyticsDataInput value={analyticsData} onChange={setAnalyticsData} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={Boolean(disabledReason) || agentRun.streaming || !composer.trim()}
              onClick={() => runPrompt(composer)}
              className="h-auto min-h-9 max-w-full whitespace-normal text-left leading-5 gap-1"
              title={disabledReason || undefined}
            >
              <Send className="h-3 w-3" />
              {agentRun.streaming ? 'Working…' : 'Send to agent'}
            </Button>
            <span className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
          </div>
          {pendingLivePrompt && agentRun.artifact && !agentRun.streaming && !agentRun.error && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 px-3 py-3 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="flex-1">Preview ready. Approve this action to allow the connected channel to send, publish, or activate it.</span>
              <Button size="sm" onClick={approveLiveExecution} className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <CheckCheck className="h-3.5 w-3.5" /> Approve & execute live
              </Button>
            </div>
          )}
          {disabledReason ? (
            <div className="text-xs text-amber-700 dark:text-amber-300">
              {disabledReason}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Detailed tool calls, artifacts, connector errors, and execution results */}
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
  onArtifactReady,
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
            onArtifactReady={onArtifactReady}
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
                      onArtifactReady={onArtifactReady}
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
                onArtifactReady={onArtifactReady}
              />
            ))
          )
        ) : null}
      </div>

      {children}
    </div>
  )
}
