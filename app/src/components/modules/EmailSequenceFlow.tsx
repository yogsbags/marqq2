import { AgentModuleShell } from '@/components/agent/AgentModuleShell'

export function EmailSequenceFlow() {
  return (
    <AgentModuleShell
      moduleId="email-sequence"
      title="Email Sequences"
      description="Build full email sequences for onboarding, nurture, and outreach — written in your brand voice and mapped to your funnel stage."
      agents={[
        {
          name: 'sam',
          label: 'Sam — Email Sequence',
          taskType: 'email_sequence',
          defaultQuery:
            'Build a [5/7/10]-email nurture sequence for [new leads / trial users / churned users]. Each email should have: subject line, preview text, body copy (150-300 words), and CTA. Tone: direct and value-first. Brand: Marqq AI.',
        },
        {
          name: 'maya',
          label: 'Maya — Email Content',
          taskType: 'email_content',
          defaultQuery:
            'Write a [3-email / 5-email] cold outreach sequence for [ICP]. Email 1: awareness. Email 2: proof/case study. Email 3: direct ask. Keep each under 200 words. Personalisation tokens: {{company}}, {{name}}, {{pain_point}}.',
        },
      ]}
    />
  )
}
