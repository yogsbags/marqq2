import { AgentModuleShell } from '@/components/agent/AgentModuleShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ActionPlanFlow() {
  return (
    <AgentModuleShell
      moduleId="action-plan"
      title="Goal → Action Plan"
      description="Tell your agents your goal, timeline, budget, and target audience. Get a prioritised marketing plan with channel strategy and budget split."
      preAgentContent={
        <Card className="border-border/70 bg-muted/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 1</div>
              <div className="mt-1 text-sm font-medium text-foreground">State your goal</div>
              <div className="mt-1 text-xs text-muted-foreground">Tell Neel the outcome you need — leads, revenue, or awareness — with your timeline and budget.</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 2</div>
              <div className="mt-1 text-sm font-medium text-foreground">Get the strategy</div>
              <div className="mt-1 text-xs text-muted-foreground">Neel returns the top 5 prioritised actions, channel mix, and what to do first.</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 3</div>
              <div className="mt-1 text-sm font-medium text-foreground">Drill into the budget</div>
              <div className="mt-1 text-xs text-muted-foreground">Dev breaks down the 30/60/90-day budget split with expected CAC, CPL, and ROAS per channel.</div>
            </div>
          </CardContent>
        </Card>
      }
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
      secondaryAgentsCollapsed
      secondaryAgentsTitle="Budget breakdown"
    />
  )
}
