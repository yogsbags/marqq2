import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, Link2, Mail, Send, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useAgentRun } from '@/hooks/useAgentRun'
import { AgentRunPanel } from './AgentRunPanel'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { addIntegrationConnectedListener, connectComposioConnector } from '@/lib/composio'
import { toast } from 'sonner'

type ReportDeliveryCardProps = {
  moduleTitle: string
  analysisLabel: string
  companyId?: string | null
  sourceText?: string | null
  sourceArtifact?: Record<string, unknown> | null
  sourceHtml?: string | null
}

type ConnectorState = {
  id: string
  name: string
  status: 'active' | 'expired' | 'initiated' | 'not_connected' | string
  connected?: boolean
}

type PreflightAction = 'create' | 'send'

const REPORT_CREATION_CONNECTORS = ['google_docs', 'google_drive', 'one_drive'] as const
const REPORT_DELIVERY_CONNECTORS = ['gmail', 'outlook', 'zoho_mail', 'slack'] as const

const CONNECTOR_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  zoho_mail: 'Zoho Mail',
  slack: 'Slack',
  google_docs: 'Google Docs',
  google_drive: 'Google Drive',
  one_drive: 'OneDrive',
}

function buildSnapshot(sourceText?: string | null, sourceArtifact?: Record<string, unknown> | null, sourceHtml?: string | null) {
  const parts: string[] = []
  if (sourceText?.trim()) {
    parts.push(`Analysis narrative:\n${sourceText.trim().slice(0, 12000)}`)
  }
  if (sourceArtifact && Object.keys(sourceArtifact).length) {
    parts.push(`Structured analysis data:\n${JSON.stringify(sourceArtifact, null, 2).slice(0, 12000)}`)
  }
  if (sourceHtml?.trim()) {
    parts.push(`Existing report HTML:\n${sourceHtml.trim().slice(0, 12000)}`)
  }
  return parts.join('\n\n')
}

export function ReportDeliveryCard({
  moduleTitle,
  analysisLabel,
  companyId,
  sourceText,
  sourceArtifact,
  sourceHtml,
}: ReportDeliveryCardProps) {
  const { activeWorkspace } = useWorkspace()
  const reportRun = useAgentRun()
  const deliveryRun = useAgentRun()
  const [reportTitle, setReportTitle] = useState(`${moduleTitle} Report`)
  const [destinations, setDestinations] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [connectors, setConnectors] = useState<ConnectorState[]>([])
  const [loadingConnectors, setLoadingConnectors] = useState(false)
  const [connectorActionId, setConnectorActionId] = useState<string | null>(null)
  const [preflightAction, setPreflightAction] = useState<PreflightAction | null>(null)

  const snapshot = useMemo(() => buildSnapshot(sourceText, sourceArtifact, sourceHtml), [sourceArtifact, sourceHtml, sourceText])
  const hasSource = Boolean(snapshot.trim())

  const loadConnectors = useCallback(async () => {
    if (!activeWorkspace?.id) {
      setConnectors([])
      return
    }
    setLoadingConnectors(true)
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(activeWorkspace.id)}`)
      const json = await res.json().catch(() => ({}))
      setConnectors(json?.connectors ?? [])
    } catch {
      setConnectors([])
    } finally {
      setLoadingConnectors(false)
    }
  }, [activeWorkspace?.id])

  useEffect(() => {
    void loadConnectors()
  }, [loadConnectors])

  useEffect(() => {
    return addIntegrationConnectedListener(({ companyId, connectorId }) => {
      if (companyId !== activeWorkspace?.id) return
      setConnectorActionId(null)
      toast.success(`${connectorId ? CONNECTOR_LABELS[connectorId] || connectorId : 'Integration'} connected successfully`)
      void loadConnectors()
    })
  }, [activeWorkspace?.id, loadConnectors])

  const connectorStatus = useMemo(() => {
    const map = new Map<string, ConnectorState>()
    for (const connector of connectors) map.set(connector.id, connector)
    return map
  }, [connectors])

  const hasActiveConnector = useCallback((connectorId: string) => {
    const connector = connectorStatus.get(connectorId)
    return Boolean(connector?.connected || connector?.status === 'active')
  }, [connectorStatus])

  const createReadyConnectors = useMemo(
    () => REPORT_CREATION_CONNECTORS.filter((id) => hasActiveConnector(id)),
    [hasActiveConnector]
  )
  const sendReadyConnectors = useMemo(
    () => REPORT_DELIVERY_CONNECTORS.filter((id) => hasActiveConnector(id)),
    [hasActiveConnector]
  )

  const createMissingConnectors = useMemo(
    () => REPORT_CREATION_CONNECTORS.filter((id) => !hasActiveConnector(id)),
    [hasActiveConnector]
  )
  const sendMissingConnectors = useMemo(
    () => REPORT_DELIVERY_CONNECTORS.filter((id) => !hasActiveConnector(id)),
    [hasActiveConnector]
  )

  const createReportQuery = [
    `Create a polished executive report for the ${moduleTitle} workflow.`,
    `Source analysis: ${analysisLabel}.`,
    `Preferred report title: ${reportTitle.trim() || `${moduleTitle} Report`}.`,
    'Write a clean client-ready report with an executive summary, key findings, evidence, risks, and next actions.',
    'If Google Docs is connected, create the report there. If Google Drive or OneDrive is connected, store or share the resulting document or file there too.',
    'In artifact.data, return these keys when possible: report_title, executive_summary, report_markdown, report_html, doc_url, file_url, recommended_subject.',
    snapshot,
  ].join('\n\n')

  const generatedReportContext = [
    reportRun.text?.trim() ? `Generated report narrative:\n${reportRun.text.trim().slice(0, 12000)}` : '',
    reportRun.artifact ? `Generated report artifact:\n${JSON.stringify(reportRun.artifact, null, 2).slice(0, 12000)}` : '',
  ].filter(Boolean).join('\n\n')

  const sendReportQuery = [
    `Distribute the ${moduleTitle} report.`,
    `Destination details: ${destinations.trim() || 'Use the connected default channel only if it is obvious; otherwise explain what destination is still needed.'}`,
    deliveryNote.trim() ? `Delivery note: ${deliveryNote.trim()}` : '',
    'Prefer Gmail first, then Outlook, then Zoho Mail for email delivery when multiple email connectors are available.',
    'If a Slack destination is provided and Slack is connected, also post a concise summary there.',
    'Use the generated report as the source of truth. If a Google Doc, Drive file, or OneDrive file exists, share that link in the email or Slack delivery.',
    'In artifact.data, return these keys when possible: sent_via, recipients, slack_targets, subject_line, doc_url, file_url, delivery_status.',
    generatedReportContext,
  ].filter(Boolean).join('\n\n')

  const connectConnector = useCallback(async (connectorId: string) => {
    if (!activeWorkspace?.id) {
      toast.error('Select a workspace to connect integrations')
      return
    }
    setConnectorActionId(connectorId)
    try {
      toast.info('Complete the connection in the popup window')
      const result = await connectComposioConnector({
        companyId: activeWorkspace.id,
        connectorId,
        onConnected: async () => {
          await loadConnectors()
        },
      })
      if (result.status === 'closed') {
        setConnectorActionId(null)
        void loadConnectors()
      }
    } catch (err: any) {
      toast.error(err?.message || 'Connect failed')
      setConnectorActionId(null)
    }
  }, [activeWorkspace?.id, loadConnectors])

  const handleCreateReport = useCallback(() => {
    if (!companyId || !hasSource || reportRun.streaming) return
    if (!createReadyConnectors.length) {
      setPreflightAction('create')
      return
    }
    reportRun.run('sam', createReportQuery, 'marketing_report', companyId || undefined, null, ['reporting'])
  }, [companyId, createReadyConnectors.length, createReportQuery, hasSource, reportRun])

  const handleSendReport = useCallback(() => {
    if (!companyId || !generatedReportContext || deliveryRun.streaming || !destinations.trim()) return
    if (!sendReadyConnectors.length) {
      setPreflightAction('send')
      return
    }
    deliveryRun.run('sam', sendReportQuery, 'report_delivery', companyId || undefined, null, ['reporting', 'delivery'])
  }, [companyId, deliveryRun, destinations, generatedReportContext, sendReadyConnectors.length, sendReportQuery])

  const preflightConfig = preflightAction === 'create'
    ? {
        title: 'Connect Report Creation Apps',
        description: 'Create Report needs at least one document or file app so Sam can save the generated report somewhere real.',
        required: createMissingConnectors,
        ready: createReadyConnectors,
        primaryLabel: 'Create Report',
      }
    : preflightAction === 'send'
      ? {
          title: 'Connect Delivery Apps',
          description: 'Send Report needs at least one active email or Slack app so Sam can deliver the report outside the workspace.',
          required: sendMissingConnectors,
          ready: sendReadyConnectors,
          primaryLabel: 'Send Report',
        }
      : null

  const connectedReportApps = Array.from(new Set<string>([...createReadyConnectors, ...sendReadyConnectors]))
  const createdDocUrl =
    (reportRun.artifact?.doc_url as string | undefined) ||
    ((reportRun.artifact?.data as Record<string, unknown> | undefined)?.doc_url as string | undefined) ||
    ''
  const deliveredTo =
    ((deliveryRun.artifact?.data as Record<string, unknown> | undefined)?.recipients as string[] | undefined) ||
    []
  const deliveryStatus =
    ((deliveryRun.artifact?.data as Record<string, unknown> | undefined)?.delivery_status as string | undefined) ||
    ''

  return (
    <>
      <Card className="border-border/70 bg-gradient-to-br from-orange-500/[0.06] via-background to-background">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Report Center
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">
              After analysis
            </div>
            <div className="mt-2 text-sm text-foreground">
              Turn the latest result into a clean client-facing report, then send the link through email or Slack.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Connected</span>
              {connectedReportApps.length ? (
                connectedReportApps.map((id) => (
                  <Badge key={id} variant="secondary" className="gap-1">
                    <Link2 className="h-3 w-3" />
                    {CONNECTOR_LABELS[id]}
                  </Badge>
                ))
              ) : loadingConnectors ? (
                <span>Checking integrations…</span>
              ) : (
                <span>No report apps connected yet.</span>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[11px] font-semibold text-orange-600 dark:bg-orange-950/30 dark:text-orange-300">
                  1
                </div>
                <div className="text-sm font-semibold text-foreground">Create the report</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Use the latest analysis to generate a polished report doc. The title can be edited before generation.
              </div>
              <Input
                value={reportTitle}
                onChange={(event) => setReportTitle(event.target.value)}
                placeholder="Executive report title"
              />
              <Button
                className="h-auto min-h-9 whitespace-normal text-left leading-5 gap-2"
                disabled={!companyId || !hasSource || reportRun.streaming}
                onClick={handleCreateReport}
              >
                <FileText className="h-4 w-4" />
                {reportRun.streaming ? 'Creating Report…' : 'Create Report'}
              </Button>
              {createdDocUrl ? (
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-3 text-sm dark:border-emerald-900/30 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Report ready
                  </div>
                  <a
                    href={createdDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
                  >
                    Open Google Doc
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : null}
              <details className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Creation details
                </summary>
                <div className="mt-3">
                  <AgentRunPanel
                    agentName="sam"
                    label="Sam — Report Builder"
                    {...reportRun}
                    onReset={reportRun.reset}
                    hideNextActions
                  />
                </div>
              </details>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[11px] font-semibold text-orange-600 dark:bg-orange-950/30 dark:text-orange-300">
                  2
                </div>
                <div className="text-sm font-semibold text-foreground">Send the report</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Deliver the latest report link to a recipient or Slack target. Keep the note short and human-readable.
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">Recipients</div>
                <Input
                  value={destinations}
                  onChange={(event) => setDestinations(event.target.value)}
                  placeholder="Emails and/or Slack targets, e.g. founder@company.com, #marketing"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">Delivery note</div>
                <Textarea
                  value={deliveryNote}
                  onChange={(event) => setDeliveryNote(event.target.value)}
                  placeholder="Optional short note for the message"
                  className="min-h-[88px]"
                />
              </div>
              <Button
                variant="outline"
                className="h-auto min-h-9 w-full whitespace-normal text-left leading-5 gap-2"
                disabled={!companyId || !generatedReportContext || deliveryRun.streaming || !destinations.trim()}
                onClick={handleSendReport}
              >
                <Send className="h-4 w-4" />
                {deliveryRun.streaming ? 'Sending Report…' : 'Send Report'}
              </Button>
              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    Uses the connected delivery stack in this order for email: Gmail, Outlook, Zoho Mail. Slack is used when a Slack target is provided.
                  </div>
                </div>
              </div>
              {deliveryStatus === 'sent' ? (
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-3 text-sm dark:border-emerald-900/30 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Report sent
                  </div>
                  <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                    {deliveredTo.length ? `Delivered to ${deliveredTo.join(', ')}` : 'Delivery confirmed.'}
                  </div>
                </div>
              ) : null}
              <details className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Delivery details
                </summary>
                <div className="mt-3">
                  <AgentRunPanel
                    agentName="sam"
                    label="Sam — Report Delivery"
                    {...deliveryRun}
                    onReset={deliveryRun.reset}
                    hideNextActions
                  />
                </div>
              </details>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(preflightConfig)} onOpenChange={(open) => !open && setPreflightAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{preflightConfig?.title}</DialogTitle>
            <DialogDescription>{preflightConfig?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {preflightConfig?.ready.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Already connected</div>
                <div className="flex flex-wrap gap-2">
                  {preflightConfig.ready.map((id) => (
                    <Badge key={id} variant="secondary">{CONNECTOR_LABELS[id]}</Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">
                {preflightConfig?.primaryLabel} works best with one of these apps
              </div>
              <div className="space-y-2">
                {preflightConfig?.required.map((id) => {
                  const connector = connectorStatus.get(id)
                  const isConnected = hasActiveConnector(id)
                  const isBusy = connectorActionId === id
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground">{CONNECTOR_LABELS[id]}</div>
                        <div className="text-xs text-muted-foreground">
                          {isConnected
                            ? 'Connected'
                            : connector?.status === 'expired'
                              ? 'Connection expired. Reconnect to use it for reporting.'
                              : connector?.status === 'initiated'
                                ? 'Connection started but not completed yet.'
                                : 'Not connected yet.'}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isConnected ? 'secondary' : 'default'}
                        disabled={isConnected || isBusy}
                        onClick={() => void connectConnector(id)}
                      >
                        {isConnected ? 'Connected' : isBusy ? 'Connecting…' : connector?.status === 'expired' ? 'Reconnect' : 'Connect'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreflightAction(null)}>
              Not now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
