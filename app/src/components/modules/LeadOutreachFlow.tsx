import { AgentModuleShell } from '@/components/agent/AgentModuleShell'

export function LeadOutreachFlow() {
  return (
    <AgentModuleShell
      moduleId="lead-outreach"
      title="Lead Outreach"
      description="Turn your ICP-matched leads into pipeline — Arjun fetches, scores, and enrolls leads in personalised outreach sequences."
      agents={[
        {
          name: 'arjun',
          label: 'Arjun — Lead Outreach',
          taskType: 'lead_outreach',
          defaultQuery:
            'Find and prioritise [N] leads matching our ICP: [industry, company size, role, geography]. For the top 10, write personalised outreach messages — 1 LinkedIn connection request (under 300 chars) + 1 follow-up email. Reference their specific context: [recent funding / hiring / product launch / content they published].',
        },
      ]}
    />
  )
}
