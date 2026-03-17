import { AgentModuleShell } from '@/components/agent/AgentModuleShell'

export function ABTestFlow() {
  return (
    <AgentModuleShell
      moduleId="ab-test"
      title="A/B Tests"
      description="Design, track, and interpret A/B tests across your pages, emails, and ads — with Dev declaring winners based on your data."
      agents={[
        {
          name: 'dev',
          label: 'Dev — A/B Test',
          taskType: 'ab_test',
          defaultQuery:
            "I'm running an A/B test on [what]. Variant A: [describe]. Variant B: [describe]. Results so far: [paste metrics — impressions, clicks, conversions, revenue]. Declare a winner or tell me how much longer to run it. Significance threshold: 95%.",
        },
        {
          name: 'sam',
          label: 'Sam — A/B Variants',
          taskType: 'ab_variants',
          defaultQuery:
            'Generate 3 test hypotheses for [landing page / email subject / CTA / pricing page]. For each hypothesis: what to test, the control (A), the variant (B), the metric to measure, and the minimum sample size needed to detect a 10% lift.',
        },
      ]}
    />
  )
}
