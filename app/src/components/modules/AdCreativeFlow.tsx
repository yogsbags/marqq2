import { AgentModuleShell } from '@/components/agent/AgentModuleShell'

export function AdCreativeFlow() {
  return (
    <AgentModuleShell
      moduleId="ad-creative"
      title="Ad Creative"
      description="Generate platform-specific ad copy and creative briefs for Meta, Google, and LinkedIn campaigns — aligned to your offer and ICP."
      agents={[
        {
          name: 'maya',
          label: 'Maya — Ad Creative',
          taskType: 'ad_creative',
          defaultQuery:
            'Create 5 ad creative concepts for [Meta Ads / Google Ads / LinkedIn Ads]. Include: headline (under 40 chars), primary text (under 125 chars), description, visual brief (what the image/video should show), and CTA. Target audience: [ICP]. Offer: [product/service].',
        },
        {
          name: 'sam',
          label: 'Sam — Ad Copy',
          taskType: 'ad_copy',
          defaultQuery:
            'Write 3 ad copy variants (A/B/C) for our best-performing offer. Each variant should test a different angle: pain-focused, outcome-focused, and social-proof-focused. Format for [platform].',
        },
      ]}
    />
  )
}
