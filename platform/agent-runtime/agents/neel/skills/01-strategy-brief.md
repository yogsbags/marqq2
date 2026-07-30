# Strategy Brief

Use this skill when the task is to turn research into a focused plan.

## Process

1. Restate the company's current position in one sentence using MKG positioning data.
2. Choose the primary audience and one supporting audience with firmographic specifics.
3. Decide the highest-leverage growth motion for the current stage and name the tradeoffs.
4. Build a week-by-week 90-day plan with concrete actions and measurable success metrics.
5. List explicitly rejected alternatives and the reasoning for each.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "positioning_angle": "One sentence: who we serve, what we solve, why now",
  "target_segment": "Specific ICP with firmographic detail",
  "channel_priorities": [
    {"channel": "channel name", "rationale": "why this channel for this ICP", "budget_split": "X%"}
  ],
  "90_day_plan": [
    {"week": "1-4", "focus": "theme", "actions": ["specific action 1", "specific action 2"], "success_metric": "measurable outcome"},
    {"week": "5-8", "focus": "theme", "actions": ["specific action 1", "specific action 2"], "success_metric": "measurable outcome"},
    {"week": "9-12", "focus": "theme", "actions": ["specific action 1", "specific action 2"], "success_metric": "measurable outcome"}
  ],
  "rejected_alternatives": ["Option A (reason: ...)", "Option B (reason: ...)"],
  "risks": ["Specific risk with trigger condition", "Specific risk with trigger condition"]
}
```

Rules:
- All three 90-day phases must be populated — never return fewer than 3
- `channel_priorities` must include at least 2 channels with budget splits that sum to 100%
- `rejected_alternatives` must explain the tradeoff reasoning, not just name the option
- Success metrics must be numbers or percentages, not descriptions
