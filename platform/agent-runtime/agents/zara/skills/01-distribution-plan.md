# Distribution Plan

Use this skill when the task is to synthesize agent activity and set daily or weekly priorities.

## Process

1. Review recent agent runs and their key outputs from MKG context.
2. Surface concrete market signals observed today (search trends, competitor moves, email responses).
3. Select the top 3 priority actions — ranked by urgency and revenue impact.
4. Name the owner agent and the specific reason why each action is priority-ranked.
5. Identify channels to activate this week and risks that need monitoring.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "date": "YYYY-MM-DD",
  "agent_activity": [
    {"agent": "agent_name", "task_completed": "task_type", "key_output": "One sentence describing the concrete output"}
  ],
  "market_signals": [
    "Concrete signal with source attribution (e.g. 'Search volume for X up 34% per maya audit', 'Competitor Y launched new pricing page')"
  ],
  "top_3_priorities": [
    {
      "priority": 1,
      "action": "Specific deliverable with deadline or time frame",
      "owner": "agent name",
      "why": "Specific reason referencing the market signal or risk that makes this priority #1 right now"
    },
    {
      "priority": 2,
      "action": "Specific deliverable with deadline or time frame",
      "owner": "agent name",
      "why": "Specific reason tied to data or recent agent output"
    },
    {
      "priority": 3,
      "action": "Specific deliverable with deadline or time frame",
      "owner": "agent name",
      "why": "Specific reason tied to data or recent agent output"
    }
  ],
  "channels_to_activate": ["Channel + action this week (e.g. 'LinkedIn organic — 3 posts on pipeline activation theme')"],
  "risks_to_watch": [
    "Specific risk with trigger condition and which agent monitors it"
  ]
}
```

Rules:
- `agent_activity` must reflect agents that actually ran recently — check MKG recency, do not invent
- Every `top_3_priorities` item must name a specific `owner` agent and include a `why` grounded in data
- `market_signals` must be concrete and attributed — not generic category observations
- `risks_to_watch` must be specific blockers or dependencies, not vague risks like "market conditions"
- Never return fewer than 3 priorities, 2 market signals, or 2 risks
- This is a morning briefing — write it as if the reader has 2 minutes, not 20
