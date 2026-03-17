import { AgentModuleShell } from '@/components/agent/AgentModuleShell'

export function ActionPlanFlow() {
  return (
    <AgentModuleShell
      moduleId="action-plan"
      title="Goal → Action Plan"
      description="Tell your agents your goal, timeline, budget, and target audience. Get a prioritised marketing plan with channel strategy and budget split."
      agents={[
        {
          name: 'neel',
          label: 'Neel — Strategy',
          taskType: 'action_plan',
          defaultQuery:
            'My goal is [X leads / Y revenue / Z awareness] in [N weeks/months] with a budget of [₹ amount]. My target audience is [ICP]. What are the top 5 things I should do right now, in priority order, with budget allocation per channel?',
        },
        {
          name: 'dev',
          label: 'Dev — Budget Plan',
          taskType: 'budget_plan',
          defaultQuery:
            'Based on our goal and strategy, give me a detailed budget split across channels for the next 30/60/90 days. Include expected CAC, CPL, and ROAS per channel.',
        },
      ]}
    />
  )
}
