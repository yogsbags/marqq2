import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchJson, type ArtifactRecord } from '../api'
import type { CompanyIntelPageId } from '../pages'
import { ArtifactScoreCards, clampDisplayScore, type ArtifactScoreCard } from '../ui/ArtifactScoreCards'
import { CompanyIntelActionButton } from '../ui/CompanyIntelActionButton'

type Props = {
  title: string
  pageId: CompanyIntelPageId
  artifact: ArtifactRecord | null
  companyId?: string
  companyName?: string
  websiteUrl?: string | null
}

type JsonLike = Record<string, unknown>
type DeploymentState = {
  id: string
  status: string
  agentTarget?: string | null
}
type ActionConfig = {
  label: string
  agentName: string
  taskPrefix: string
  taskRequest: string
  marketingContext?: Record<string, unknown>
  successMessage: string
  dialogTitle: string
  dialogDescription: string
  deploymentMode?: 'run_now' | 'scheduled'
  scheduleMode?: string | null
  recurrenceMinutes?: number
  agentTarget?: string
  sectionId?: string
  sectionTitle?: string
  summary?: string
  bullets?: string[]
  navigateModuleId?: string
  moduleWorkflowParams?: Record<string, string>
  chatHandoff?: boolean
}
type EditorTarget =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'item'; key: string; index: number; label: string }

function isObject(value: unknown): value is JsonLike {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function startCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value)
}

function formatPrimitive(value: string | number | boolean) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function extractScoreCards(data: JsonLike): ArtifactScoreCard[] {
  const scores = isObject(data.scores) ? data.scores : null
  if (!scores) return []

  return Object.entries(scores)
    .filter(([key, value]) => key !== 'rubric' && typeof value === 'number')
    .slice(0, 3)
    .map(([key, value]) => ({
      label: startCase(key),
      value: clampDisplayScore(value),
      description: `${startCase(key)} score derived from the latest company intelligence output.`
    }))
}

function renderPrimitiveList(items: Array<string | number | boolean>) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${String(item)}-${index}`} className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm">
          {formatPrimitive(item)}
        </div>
      ))}
    </div>
  )
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function cohortMarketType(cohort: Record<string, unknown>): 'b2b' | 'b2c' | 'mixed' {
  const explicit = String(cohort.marketType || cohort.market_type || '').toLowerCase()
  if (explicit === 'b2b' || explicit === 'b2c' || explicit === 'mixed') return explicit

  const recommended = asStringArray(cohort.recommendedChannels || cohort.recommended_channels)
  const blocked = asStringArray(cohort.blockedChannels || cohort.blocked_channels)
  if (recommended.includes('apollo_outreach')) return 'b2b'
  if (blocked.includes('apollo_outreach')) return 'b2c'

  const text = [
    cohort.name,
    cohort.title,
    cohort.definition,
    cohort.description,
    cohort.messagingAngle,
    cohort.messaging_angle,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
  const consumerSignals = ['adult', 'women', 'men', 'person', 'people', 'users', 'consumer', 'patient', 'diagnosed', 'diabetes', 'pcos', 'thyroid', 'pregnant', 'fitness enthusiasts', 'meal', 'lab reports']
  const businessSignals = ['companies', 'businesses', 'clinics', 'labs', 'agencies', 'teams', 'founders', 'owners', 'operators', 'buyers', 'decision makers', 'partners', 'hospitals']
  const hasConsumer = consumerSignals.some((signal) => text.includes(signal))
  const hasBusiness = businessSignals.some((signal) => text.includes(signal))
  if (hasBusiness && !hasConsumer) return 'b2b'
  if (hasBusiness && hasConsumer) return 'mixed'
  return 'b2c'
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase()
}

function pickExecutionAgent(text: string, fallback = 'zara') {
  const normalized = text.toLowerCase()
  if (normalized.includes('competitor') || normalized.includes('pricing') || normalized.includes('monitor')) return 'priya'
  if (normalized.includes('icp') || normalized.includes('segment') || normalized.includes('audience')) return 'isha'
  if (normalized.includes('content') || normalized.includes('brief') || normalized.includes('repurpos')) return 'riya'
  if (normalized.includes('position') || normalized.includes('messag') || normalized.includes('strateg')) return 'neel'
  return fallback
}

function createAction(config: ActionConfig | null, companyId?: string, companyName?: string, websiteUrl?: string | null) {
  if (!config) return null

  return (
    <CompanyIntelActionButton
      label={config.label}
      agentName={config.agentName}
      companyId={companyId}
      companyName={companyName}
      websiteUrl={websiteUrl}
      agentTarget={config.agentTarget}
      sectionId={config.sectionId}
      sectionTitle={config.sectionTitle}
      summary={config.summary}
      bullets={config.bullets}
      taskPrefix={config.taskPrefix}
      taskRequest={config.taskRequest}
      marketingContext={config.marketingContext}
      successMessage={config.successMessage}
      dialogTitle={config.dialogTitle}
      dialogDescription={config.dialogDescription}
      deploymentMode={config.deploymentMode}
      scheduleMode={config.scheduleMode}
      recurrenceMinutes={config.recurrenceMinutes}
      navigateModuleId={config.navigateModuleId}
      moduleWorkflowParams={config.moduleWorkflowParams}
      chatHandoff={config.chatHandoff}
      className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/40 dark:text-orange-300"
    />
  )
}

function buildItemAction(
  pageId: CompanyIntelPageId,
  sectionKey: string,
  item: JsonLike,
  index: number,
  data: JsonLike,
  companyName?: string,
  websiteUrl?: string | null,
): ActionConfig | null {
  const name = String(item.title || item.name || item.label || `${startCase(sectionKey)} ${index + 1}`)

  if (pageId === 'competitor_intelligence' && sectionKey === 'topCompetitors') {
    const competitorWebsite = String(item.website || '').trim()
    return {
      label: 'Monitor',
      agentName: 'priya',
      taskPrefix: `Competitor Monitor • ${name}`,
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Company website: ${websiteUrl}.` : null,
        `Monitor competitor ${name}.`,
        competitorWebsite ? `Website: ${competitorWebsite}.` : null,
        'Use the current company-intelligence context for this company as the source of truth.',
        'Track positioning, messaging, offer changes, pricing signals, content themes, and campaign moves.',
        'Break this into actionable recurring monitoring tasks for the taskboard.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'competitor_intelligence', competitor: item, competitorIntelligence: data },
      successMessage: `Priya is now monitoring ${name}.`,
      dialogTitle: 'Deploy Priya for Competitor Monitoring',
      dialogDescription: 'This will create competitor monitoring tasks and schedule recurring Priya runs for the selected competitor.',
      deploymentMode: 'scheduled' as any,
      scheduleMode: 'monitor',
      recurrenceMinutes: 1440,
      agentTarget: name,
      sectionId: pageId,
      sectionTitle: 'Competitor Intelligence',
      summary: `Recurring competitor monitoring for ${name}.`,
      bullets: [
        `Track ${name} for positioning changes`,
        'Watch offer, pricing, and messaging shifts',
        'Create recurring competitor monitoring tasks',
      ],
    }
  }

  if (pageId === 'opportunities' && sectionKey === 'quickWins') {
    const combined = `${String(item.category || '')} ${name}`
    return {
      label: 'Run Now',
      agentName: pickExecutionAgent(combined, 'zara'),
      taskPrefix: `Quick Win • ${name}`,
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Website: ${websiteUrl}.` : null,
        `Execute this quick win now: ${name}.`,
        String(item.description || ''),
        `Expected impact: ${String(item.expectedImpact || 'unknown')}.`,
        `Time to value: ${String(item.timeToValue || 'unknown')}.`,
        'Break this into immediate action items for the taskboard and execute the first-pass recommendation.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'opportunities', quickWin: item, opportunities: data },
      successMessage: `Quick-win action started for ${name}.`,
      dialogTitle: 'Deploy Quick Win',
      dialogDescription: 'This will create the immediate tasks needed to execute this quick win and start the first-pass agent run.'
    }
  }

  if (pageId === 'opportunities' && sectionKey === 'opportunities') {
    const combined = `${String(item.category || '')} ${name}`
    return {
      label: 'Create Playbook',
      agentName: pickExecutionAgent(combined, 'zara'),
      taskPrefix: `Opportunity • ${name}`,
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Website: ${websiteUrl}.` : null,
        `Create an execution playbook for this opportunity: ${name}.`,
        `Category: ${String(item.category || 'General')}.`,
        `Expected impact: ${String(item.expectedImpact || 'unknown')}.`,
        `Effort: ${String(item.effort || 'unknown')}.`,
        `Next steps: ${asStringArray(item.nextSteps).join(' | ') || 'none listed'}.`,
        'Break this into a staged taskboard playbook with concrete deliverables and run the first step.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'opportunities', opportunity: item, opportunities: data },
      successMessage: `Playbook deployed for ${name}.`,
      dialogTitle: 'Deploy Opportunity Playbook',
      dialogDescription: 'This will create a staged taskboard playbook for this opportunity and start the first execution step.'
    }
  }

  if (pageId === 'opportunities' && sectionKey === '90DayPlan') {
    return {
      label: 'Schedule',
      agentName: 'zara',
      taskPrefix: `90 Day Plan • ${name}`,
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Website: ${websiteUrl}.` : null,
        `Schedule this 90-day plan item: ${name}.`,
        `Week: ${String(item.week || index + 1)}.`,
        `Focus: ${String(item.focus || name)}.`,
        `Key activities: ${asStringArray(item.keyActivities).join(' | ') || 'none listed'}.`,
        'Convert this into scheduled taskboard items with the right order and due dates.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'opportunities', planItem: item, opportunities: data },
      successMessage: `Plan item scheduled for ${name}.`,
      dialogTitle: 'Schedule 90-Day Plan Item',
      dialogDescription: 'This will create scheduled execution tasks for this 90-day plan item.'
    }
  }

  if (pageId === 'icps' && sectionKey === 'icps') {
    const slug = normalizeKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `icp-${index + 1}`
    return {
      label: 'Activate ICP',
      agentName: 'isha',
      taskPrefix: `ICP • ${name}`,
      sectionId: `icp-activate-${slug}`,
      sectionTitle: `Activate ICP · ${name}`,
      summary: `Activate ${name} for GTM targeting and qualification.`,
      bullets: [
        String(item.who || '').trim(),
        String(item.hook || '').trim() ? `Hook: ${String(item.hook)}` : '',
        asStringArray(item.channels).length ? `Channels: ${asStringArray(item.channels).join(', ')}` : '',
      ].filter(Boolean),
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        `Activate this ICP for GTM execution: ${name}.`,
        `Who: ${String(item.who || '')}.`,
        `Hook: ${String(item.hook || '')}.`,
        `Channels: ${asStringArray(item.channels).join(', ') || 'none'}.`,
        `Qualifiers: ${asStringArray(item.qualifiers).join(' | ') || 'none'}.`,
        `Disqualifiers: ${asStringArray(item.disqualifiers).join(' | ') || 'none'}.`,
        'Create targeting, qualification, and activation tasks for the taskboard and start the first analysis pass.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'icps', icp: item, icps: data },
      navigateModuleId: 'audience-profiles',
      moduleWorkflowParams: {
        question: [
          companyName ? `Company: ${companyName}.` : null,
          `Activate this ICP for GTM execution: ${name}.`,
          `Who: ${String(item.who || '')}.`,
          `Hook: ${String(item.hook || '')}.`,
          `Channels: ${asStringArray(item.channels).join(', ') || 'none'}.`,
          'Build targeting, qualification, and activation guidance for this ICP.',
        ].filter(Boolean).join(' '),
        scope: 'icp',
        buyer: name,
        goal: 'activation',
      },
      chatHandoff: false,
      successMessage: `ICP activation queued for ${name} — opening #audiences.`,
      dialogTitle: 'Activate ICP',
      dialogDescription: 'Adds ICP targeting tasks to Upcoming Tasks, then opens #audiences with this profile preloaded. Does not send outreach by itself.'
    }
  }

  if (pageId === 'icps' && sectionKey === 'cohorts') {
    const slug = normalizeKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `cohort-${index + 1}`
    const marketType = cohortMarketType(item)
    if (marketType !== 'b2b') {
      const recommended = asStringArray(item.recommendedChannels || item.recommended_channels).filter((channel) => channel !== 'apollo_outreach')
      const primary = recommended.includes('social_posts')
        ? { label: 'Generate Social Posts', moduleId: 'social-media', agentName: 'kiran', title: 'Social Posts' }
        : recommended.includes('seo_article')
          ? { label: 'Write Article', moduleId: 'ai-content', agentName: 'riya', title: 'SEO Article' }
          : { label: 'Create Paid Ads', moduleId: 'paid-ads', agentName: 'zara', title: 'Paid Ads' }
      return {
        label: primary.label,
        agentName: primary.agentName,
        taskPrefix: `${primary.title} • ${name}`,
        sectionId: `cohort-${primary.moduleId}-${slug}`,
        sectionTitle: `${primary.title} · ${name}`,
        summary: `Create ${primary.title.toLowerCase()} acquisition for B2C cohort ${name}.`,
        bullets: [
          String(item.definition || '').trim(),
          String(item.messagingAngle || '').trim() ? `Angle: ${String(item.messagingAngle)}` : '',
          `Channel fit: ${marketType.toUpperCase()} — Apollo outreach blocked`,
        ].filter(Boolean),
        taskRequest: [
          companyName ? `Company: ${companyName}.` : null,
          `Create ${primary.title.toLowerCase()} acquisition tasks for B2C cohort: ${name}.`,
          `Definition: ${String(item.definition || '')}.`,
          `Messaging angle: ${String(item.messagingAngle || '')}.`,
          'Do not use Apollo outreach for this consumer/persona cohort.'
        ].filter(Boolean).join(' '),
        marketingContext: { module: 'icps', cohort: item, icps: data },
        navigateModuleId: primary.moduleId,
        moduleWorkflowParams: {
          question: `Create ${primary.title.toLowerCase()} acquisition for B2C cohort ${name}. Angle: ${String(item.messagingAngle || '')}.`,
        },
        chatHandoff: false,
        successMessage: `${primary.title} queued for ${name}.`,
        dialogTitle: primary.label,
        dialogDescription: `Creates ${primary.title.toLowerCase()} tasks for this consumer cohort. Apollo outreach is disabled because this cohort is not B2B-searchable.`
      }
    }
    return {
      label: 'Launch Outreach',
      agentName: 'sam',
      taskPrefix: `Cohort • ${name}`,
      sectionId: `cohort-outreach-${slug}`,
      sectionTitle: `Launch Outreach · ${name}`,
      summary: `Prepare outreach for cohort ${name} (priority ${String(item.priority ?? index + 1)}).`,
      bullets: [
        String(item.definition || '').trim(),
        String(item.messagingAngle || '').trim() ? `Angle: ${String(item.messagingAngle)}` : '',
        `Priority: ${String(item.priority ?? index + 1)}`,
      ].filter(Boolean),
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        `Prepare and schedule B2B outreach for this lead-data-searchable cohort: ${name}.`,
        `Definition: ${String(item.definition || '')}.`,
        `Messaging angle: ${String(item.messagingAngle || '')}.`,
        `Priority: ${String(item.priority ?? index + 1)}.`,
        `Target industries: ${asStringArray(item.apolloTargetIndustries || item.apollo_target_industries).join(', ') || 'derive only from business/professional buyer context'}.`,
        `Buyer titles: ${asStringArray(item.apolloBuyerTitles || item.apollo_buyer_titles).join(', ') || 'decision makers'}.`,
        'Create outreach and distribution tasks for the taskboard and prepare the first launch step. Use Apollo or Hunter only for companies/professional decision makers; never for consumers, patients, demographics, or sensitive traits.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'icps', cohort: item, icps: data },
      navigateModuleId: 'lead-outreach',
      moduleWorkflowParams: {
        question: [
          companyName ? `Company: ${companyName}.` : null,
          `Launch an outreach campaign for cohort: ${name}.`,
          `Definition: ${String(item.definition || '')}.`,
          `Messaging angle: ${String(item.messagingAngle || '')}.`,
          `Priority: ${String(item.priority ?? index + 1)}.`,
          `Target industries: ${asStringArray(item.apolloTargetIndustries || item.apollo_target_industries).join(', ') || 'not provided'}.`,
          `Buyer titles: ${asStringArray(item.apolloBuyerTitles || item.apollo_buyer_titles).join(', ') || 'decision makers'}.`,
          'Build the outreach sequence arc, personalization logic, first touch, and follow-ups only for B2B/professional buyers. Do not use lead-data providers for consumer traits.',
        ].filter(Boolean).join(' '),
        channel: 'email',
        contact_channels: 'email',
        target: 'decision',
        goal: 'reply',
        delivery: 'draft',
      },
      chatHandoff: false,
      successMessage: `Outreach campaign queued for ${name} — opening #outreach.`,
      dialogTitle: 'Launch Outreach Campaign',
      dialogDescription: 'Adds outreach tasks to Upcoming Tasks, then opens #outreach with this cohort preloaded. Does not send live LinkedIn or email by itself.'
    }
  }

  if (pageId === 'content_strategy' && sectionKey === 'contentPillars') {
    return {
      label: 'Generate Briefs',
      agentName: 'riya',
      taskPrefix: `Content Pillar • ${name}`,
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Website: ${websiteUrl}.` : null,
        `Generate content briefs for this pillar: ${name}.`,
        `Purpose: ${String(item.purpose || '')}.`,
        `Example topics: ${asStringArray(item.exampleTopics).join(' | ') || 'none listed'}.`,
        'Create a taskboard queue of content briefs and start with the highest-leverage brief.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'content_strategy', contentPillar: item, contentStrategy: data },
      successMessage: `Content brief generation started for ${name}.`,
      dialogTitle: 'Generate Content Briefs',
      dialogDescription: 'This will create content brief tasks for the selected pillar and start the first brief.'
    }
  }

  return null
}

function buildSectionAction(
  pageId: CompanyIntelPageId,
  sectionKey: string,
  value: unknown,
  data: JsonLike,
  companyName?: string,
  websiteUrl?: string | null,
): ActionConfig | null {
  if (pageId === 'content_strategy' && sectionKey === 'distributionRules' && Array.isArray(value)) {
    return {
      label: 'Deploy Distribution',
      agentName: 'zara',
      taskPrefix: 'Distribution Rules',
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Website: ${websiteUrl}.` : null,
        'Deploy the current distribution rules from content strategy.',
        `Rules: ${asStringArray(value).join(' | ') || 'none listed'}.`,
        'Create channel execution tasks for the taskboard and prepare the first rollout step.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'content_strategy', distributionRules: value, contentStrategy: data },
      successMessage: 'Distribution deployment prepared.',
      dialogTitle: 'Deploy Distribution Rules',
      dialogDescription: 'This will create channel execution tasks from the current distribution rules and start the rollout.'
    }
  }

  if (pageId === 'content_strategy' && sectionKey === 'repurposingPlan' && Array.isArray(value)) {
    return {
      label: 'Automate Repurposing',
      agentName: 'riya',
      taskPrefix: 'Repurposing Plan',
      taskRequest: [
        companyName ? `Company: ${companyName}.` : null,
        websiteUrl ? `Website: ${websiteUrl}.` : null,
        'Automate the current content repurposing plan.',
        `Plan: ${asStringArray(value).join(' | ') || 'none listed'}.`,
        'Create repurposing workflow tasks for the taskboard and start the first asset adaptation step.'
      ].filter(Boolean).join(' '),
      marketingContext: { module: 'content_strategy', repurposingPlan: value, contentStrategy: data },
      successMessage: 'Repurposing workflow prepared.',
      dialogTitle: 'Automate Repurposing',
      dialogDescription: 'This will create repurposing workflow tasks and start the first asset adaptation step.'
    }
  }

  return null
}

function renderObjectGrid(
  items: JsonLike[],
  pageId?: CompanyIntelPageId,
  sectionKey = '',
  data: JsonLike = {},
  companyId?: string,
  companyName?: string,
  websiteUrl?: string | null,
  deploymentStates?: Record<string, DeploymentState>,
  onDeploymentAction?: (deploymentId: string, action: 'pause' | 'resume' | 'stop') => void,
  onEditItem?: (sectionKey: string, index: number, label: string) => void,
  onDeleteItem?: (sectionKey: string, index: number, label: string) => void,
) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {items.map((item, index) => {
        const itemName = String(item.title || item.name || item.label || `Item ${index + 1}`)
        const deployment = pageId === 'competitor_intelligence' && sectionKey === 'topCompetitors'
          ? deploymentStates?.[normalizeKey(itemName)] || null
          : null
        const itemActionConfig =
          deployment && ['active', 'running', 'paused'].includes(String(deployment.status))
            ? null
            : pageId
              ? buildItemAction(pageId, sectionKey, item, index, data, companyName, websiteUrl)
              : null
        const action = pageId ? createAction(itemActionConfig, companyId, companyName, websiteUrl) : null

        return (
          <Card key={index} className="border-border/60 bg-background/70">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">
                  {startCase(itemName)}
                </CardTitle>
                <div className="shrink-0 flex items-center gap-2">
                  {deployment && deployment.status === 'paused' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="font-bold"
                      onClick={() => deployment.id && onDeploymentAction?.(deployment.id, 'resume')}
                    >
                      Resume
                    </Button>
                  ) : null}
                  {deployment && ['active', 'running'].includes(deployment.status) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="font-bold"
                      onClick={() => deployment.id && onDeploymentAction?.(deployment.id, 'pause')}
                    >
                      Pause
                    </Button>
                  ) : null}
                  {deployment && ['active', 'running', 'paused'].includes(deployment.status) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="font-bold"
                      onClick={() => deployment.id && onDeploymentAction?.(deployment.id, 'stop')}
                    >
                      Stop
                    </Button>
                  ) : null}
                  {action ? <div>{action}</div> : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Object.entries(item).map(([key, value]) => {
                if (value == null || key === 'title' || key === 'name' || key === 'label') return null
                return <FieldRenderer key={key} label={startCase(key)} value={value} compact />
              })}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-orange-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-orange-300"
                  title={`Edit ${itemName}`}
                  onClick={() => onEditItem?.(sectionKey, index, itemName)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950/20 dark:hover:text-red-300"
                  title={`Delete ${itemName}`}
                  onClick={() => onDeleteItem?.(sectionKey, index, itemName)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function FieldRenderer({
  label,
  value,
  compact = false,
  showLabel = true,
}: {
  label: string
  value: unknown
  compact?: boolean
  showLabel?: boolean
}) {
  if (value == null) return null

  if (isPrimitive(value)) {
    return (
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {showLabel ? <div className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">{label}</div> : null}
        <div className="text-sm text-foreground leading-6">{formatPrimitive(value)}</div>
      </div>
    )
  }

  if (Array.isArray(value)) {
    if (!value.length) return null

    const primitives = value.filter(isPrimitive)
    if (primitives.length === value.length) {
      return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {showLabel ? <div className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">{label}</div> : null}
          {renderPrimitiveList(primitives)}
        </div>
      )
    }

    const objects = value.filter(isObject)
    if (objects.length === value.length) {
      return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {showLabel ? <div className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">{label}</div> : null}
          {renderObjectGrid(objects)}
        </div>
      )
    }

    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {showLabel ? <div className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">{label}</div> : null}
        <div className="space-y-2">
          {value.map((item, index) => (
            <div key={index} className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm">
              {isPrimitive(item)
            ? formatPrimitive(item)
            : isObject(item)
              ? Object.values(item as Record<string, unknown>).filter(isPrimitive).map(String).join(' · ') || '—'
              : String(item ?? '—')
          }
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isObject(value)) {
    const entries = Object.entries(value).filter(([, nested]) => nested != null)
    if (!entries.length) return null

    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {showLabel ? <div className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">{label}</div> : null}
        <Card className="border-border/60 bg-background/70">
          <CardContent className="space-y-3 p-4">
            {entries.map(([nestedKey, nestedValue]) => (
              <FieldRenderer key={nestedKey} label={startCase(nestedKey)} value={nestedValue} compact />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}

export function GenericArtifactPage({ title, pageId, artifact, companyId, companyName, websiteUrl }: Props) {
  const [data, setData] = useState<JsonLike | null>(isObject(artifact?.data) ? deepClone(artifact.data) : null)
  const [deploymentStates, setDeploymentStates] = useState<Record<string, DeploymentState>>({})
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const [editedValue, setEditedValue] = useState<unknown>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const loadDeploymentStates = useCallback(async () => {
    if (pageId !== 'competitor_intelligence' || !companyId) {
      setDeploymentStates({})
      return
    }

    let workspaceId: string | null = null
    try {
      const raw = localStorage.getItem('marqq_active_workspace')
      const parsed = raw ? JSON.parse(raw) : null
      workspaceId = typeof parsed?.id === 'string' ? parsed.id : null
    } catch {
      workspaceId = null
    }
    if (!workspaceId) {
      setDeploymentStates({})
      return
    }

    const response = await fetchJson<{ deployments?: Array<Record<string, unknown>> }>(
      `/api/workspaces/${workspaceId}/agent-deployments`,
    )
    const next: Record<string, DeploymentState> = {}

    for (const deployment of Array.isArray(response.deployments) ? response.deployments : []) {
      if (String(deployment?.source || '') !== 'company-intelligence') continue
      if (String(deployment?.companyId || '') !== companyId) continue
      if (String(deployment?.sectionId || '') !== pageId) continue
      if (String(deployment?.scheduleMode || '') !== 'monitor') continue
      const status = String(deployment?.status || '')
      if (!['active', 'running', 'paused'].includes(status)) continue
      const target = String(deployment?.agentTarget || '').trim()
      if (!target) continue
      next[normalizeKey(target)] = {
        id: String(deployment?.id || ''),
        status,
        agentTarget: target,
      }
    }

    setDeploymentStates(next)
  }, [companyId, pageId])

  useEffect(() => {
    setData(isObject(artifact?.data) ? deepClone(artifact.data) : null)
  }, [artifact])

  const persistArtifact = useCallback(async (nextData: JsonLike) => {
    if (!companyId || !artifact?.type) {
      setData(nextData)
      return
    }

    await fetchJson<{ artifact: ArtifactRecord }>(`/api/company-intel/companies/${companyId}/artifacts`, {
      method: 'PATCH',
      body: JSON.stringify({
        artifactType: artifact.type,
        data: nextData,
      }),
    })
    setData(nextData)
  }, [artifact?.type, companyId])

  const openEditor = useCallback((target: EditorTarget) => {
    if (!data) return
    let value: unknown = null
    if (target.kind === 'section') {
      value = data[target.key]
    } else {
      const section = data[target.key]
      value = Array.isArray(section) ? section[target.index] : null
    }
    setEditorTarget(target)
    setEditedValue(deepClone(value))
  }, [data])

  const handleSaveEdit = useCallback(async () => {
    if (!data || !editorTarget) return
    setIsSavingEdit(true)
    try {
      const next = deepClone(data)
      if (editorTarget.kind === 'section') {
        next[editorTarget.key] = deepClone(editedValue)
      } else {
        const section = next[editorTarget.key]
        if (!Array.isArray(section)) throw new Error('This card is no longer editable.')
        section[editorTarget.index] = deepClone(editedValue)
      }
      await persistArtifact(next)
      setEditorTarget(null)
      toast.success(`${editorTarget.label} was updated.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save changes.')
    } finally {
      setIsSavingEdit(false)
    }
  }, [data, editorTarget, editedValue, persistArtifact])

  const handleDeleteTarget = useCallback(async (target: EditorTarget) => {
    if (!data) return
    const confirmed = window.confirm(`Delete ${target.label}?`)
    if (!confirmed) return

    try {
      const next = deepClone(data)
      if (target.kind === 'section') {
        delete next[target.key]
      } else {
        const section = next[target.key]
        if (!Array.isArray(section)) throw new Error('This card is no longer deletable.')
        section.splice(target.index, 1)
      }
      await persistArtifact(next)
      toast.success(`${target.label} was deleted.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete card.')
    }
  }, [data, persistArtifact])

  const renderEditorField = useCallback((
    value: unknown,
    onChange: (next: unknown) => void,
    fieldLabel?: string,
  ): ReactNode => {
    if (typeof value === 'string') {
      const multiline = value.length > 100 || value.includes('\n')
      return (
        <div className="space-y-2">
          {fieldLabel ? <Label>{fieldLabel}</Label> : null}
          {multiline ? (
            <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={6} />
          ) : (
            <Input value={value} onChange={(event) => onChange(event.target.value)} />
          )}
        </div>
      )
    }

    if (typeof value === 'number') {
      return (
        <div className="space-y-2">
          {fieldLabel ? <Label>{fieldLabel}</Label> : null}
          <Input
            type="number"
            value={Number.isFinite(value) ? String(value) : ''}
            onChange={(event) => onChange(Number(event.target.value || 0))}
          />
        </div>
      )
    }

    if (typeof value === 'boolean') {
      return (
        <div className="space-y-2">
          {fieldLabel ? <Label>{fieldLabel}</Label> : null}
          <select
            value={String(value)}
            onChange={(event) => onChange(event.target.value === 'true')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      )
    }

    if (Array.isArray(value)) {
      const primitiveOnly = value.every((item) => item == null || isPrimitive(item))
      if (primitiveOnly) {
        const text = value.map((item) => String(item ?? '')).join('\n')
        return (
          <div className="space-y-2">
            {fieldLabel ? <Label>{fieldLabel}</Label> : null}
            <Textarea
              value={text}
              onChange={(event) => onChange(event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))}
              rows={Math.max(4, Math.min(10, value.length + 1))}
            />
          </div>
        )
      }

      return (
        <div className="space-y-3">
          {fieldLabel ? <Label>{fieldLabel}</Label> : null}
          {value.map((item, index) => (
            <Card key={index} className="border-border/60 bg-background/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600 dark:text-orange-400">
                  Item {index + 1}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renderEditorField(item, (next) => {
                  const copy = deepClone(value)
                  copy[index] = next
                  onChange(copy)
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )
    }

    if (isObject(value)) {
      return (
        <div className="space-y-3">
          {fieldLabel ? <Label>{fieldLabel}</Label> : null}
          {Object.entries(value).map(([key, nested]) => (
            <div key={key}>
              {renderEditorField(nested, (next) => {
                onChange({
                  ...value,
                  [key]: next,
                })
              }, startCase(key))}
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {fieldLabel ? <Label>{fieldLabel}</Label> : null}
        <Input value={value == null ? '' : String(value)} onChange={(event) => onChange(event.target.value)} />
      </div>
    )
  }, [])

  useEffect(() => {
    void loadDeploymentStates()
    if (pageId !== 'competitor_intelligence' || !companyId) return

    const interval = window.setInterval(() => {
      void loadDeploymentStates()
    }, 15000)
    const onCreated = () => void loadDeploymentStates()
    window.addEventListener('marqq:deployment-created', onCreated)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('marqq:deployment-created', onCreated)
    }
  }, [companyId, loadDeploymentStates, pageId])

  const handleDeploymentAction = useCallback(async (deploymentId: string, action: 'pause' | 'resume' | 'stop') => {
    await fetchJson(`/api/agents/deployments/${deploymentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    })
    await loadDeploymentStates()
  }, [loadDeploymentStates])

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-orange-600 dark:text-orange-400">No output yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Generate to populate this dashboard.</CardContent>
      </Card>
    )
  }

  const scoreCards = extractScoreCards(data)
  const summary = typeof data.summary === 'string' ? data.summary : null
  const sections = Object.entries(data).filter(([key]) => key !== 'scores' && key !== 'summary')

  const shareUrl = `${window.location.origin}${window.location.pathname}#company-intel:${pageId}`
  const handleShare = () => {
    navigator.clipboard.writeText(shareUrl).then(() => toast.success('Link copied to clipboard'))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border"
          title={`Copy link to this ${title} page`}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
      </div>
      {scoreCards.length ? <ArtifactScoreCards items={scoreCards} /> : null}

      {summary ? (
        <Card className="border-border/60 bg-background/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-orange-600 dark:text-orange-400">{title} Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-foreground">{summary}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {sections.map(([key, value]) => {
          const action = createAction(buildSectionAction(pageId, key, value, data, companyName, websiteUrl), companyId, companyName, websiteUrl)

          return (
            <Card key={key} className="border-border/60 bg-background/80">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base text-orange-600 dark:text-orange-400">{startCase(key)}</CardTitle>
                  <div className="shrink-0 flex items-center gap-2">
                    {action ? <div>{action}</div> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.isArray(value) && value.length > 0 && value.every(isObject)
                  ? renderObjectGrid(
                    value as JsonLike[],
                    pageId,
                    key,
                    data,
                    companyId,
                    companyName,
                    websiteUrl,
                    deploymentStates,
                    handleDeploymentAction,
                    (sectionKey, index, label) => openEditor({ kind: 'item', key: sectionKey, index, label }),
                    (sectionKey, index, label) => void handleDeleteTarget({ kind: 'item', key: sectionKey, index, label }),
                  )
                  : <FieldRenderer label={startCase(key)} value={value} showLabel={false} />}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-orange-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-orange-300"
                    title={`Edit ${startCase(key)}`}
                    onClick={() => openEditor({ kind: 'section', key, label: startCase(key) })}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950/20 dark:hover:text-red-300"
                    title={`Delete ${startCase(key)}`}
                    onClick={() => void handleDeleteTarget({ kind: 'section', key, label: startCase(key) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={Boolean(editorTarget)} onOpenChange={(open) => { if (!open) setEditorTarget(null) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editorTarget ? `Edit ${editorTarget.label}` : 'Edit card'}</DialogTitle>
            <DialogDescription>
              Edit the selected company intelligence card and save the structured changes back to the artifact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Edit this card using readable fields. Changes are saved back into the Company Intelligence artifact.
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              {renderEditorField(editedValue, setEditedValue)}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorTarget(null)} disabled={isSavingEdit}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveEdit()} disabled={isSavingEdit}>
              {isSavingEdit ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
