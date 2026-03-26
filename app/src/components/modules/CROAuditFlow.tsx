import { AgentModuleShell } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CROAuditFlow() {
  return (
    <AgentModuleShell
      moduleId="cro-audit"
      title="CRO Audit"
      description="Tara and Sam audit your landing pages, forms, and signup flow — and rewrite the copy and structure to convert more visitors."
      preAgentContent={
        <Card className="border-border/70 bg-muted/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Audit workflow</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tara — CRO Audit</div>
              <div className="mt-1 text-sm font-medium text-foreground">Find the conversion blockers</div>
              <div className="mt-1 text-xs text-muted-foreground">Identifies the top 5 issues on your page or flow, scores each by impact and effort, and tells you exactly what to change.</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sam — CRO Copy</div>
              <div className="mt-1 text-sm font-medium text-foreground">Rewrite for conversion</div>
              <div className="mt-1 text-xs text-muted-foreground">Rewrites hero copy, CTAs, and value props — with 3 headline variants and 2 CTA variants optimised for your ICP.</div>
            </div>
          </CardContent>
        </Card>
      }
      agents={[
        {
          name: 'tara',
          label: 'Tara — CRO Audit',
          taskType: 'cro_audit',
          defaultQuery:
            'Audit our landing page / signup flow / pricing page at [URL or paste content]. Identify the top 5 conversion blockers. For each: what\'s wrong, why it\'s losing conversions, and exactly what to change. Score each fix by impact (High/Med/Low) and effort (Easy/Hard).',
        },
        {
          name: 'sam',
          label: 'Sam — CRO Copy',
          taskType: 'cro_copy',
          defaultQuery:
            'Rewrite the hero section, CTA buttons, and key value props of our [page type]. Current copy: [paste existing copy]. Optimise for: clarity, ICP resonance, urgency. Output 3 headline variants, 2 CTA variants, and revised value props.',
        },
      ]}
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Rewrite copy"
      resourceContextLabel="Page URL or pasted content"
      resourceContextPlaceholder="https://yoursite.com/pricing or paste your page copy here"
      resourceContextHint="Optional. Paste the page copy or URL directly here so both Tara and Sam work from the same source."
      resourceContextPlacement="primary"
    />
  )
}
