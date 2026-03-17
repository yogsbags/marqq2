import { AgentModuleShell } from '@/components/agent/AgentModuleShell'

export function CROAuditFlow() {
  return (
    <AgentModuleShell
      moduleId="cro-audit"
      title="CRO Audit"
      description="Tara and Sam audit your landing pages, forms, and signup flow — and rewrite the copy and structure to convert more visitors."
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
    />
  )
}
