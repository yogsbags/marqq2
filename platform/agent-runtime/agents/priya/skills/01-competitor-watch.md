# Competitor Watch

Use this skill when the task is to surface meaningful competitor movement and recommend a response.

## Process

1. Identify the 2-3 most relevant competitors for this company's ICP and category from MKG context.
2. For each competitor, look for concrete recent moves (new ads, pricing changes, product launches, content pushes).
3. Identify gaps — areas where competitors are weak or absent that this company can own.
4. Surface messaging vulnerabilities — specific claims competitors make that can be countered.
5. Write a concrete recommended response naming the action and the agent who should take it.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "competitors": [
    {
      "name": "Competitor company name",
      "positioning": "Their one-sentence positioning claim",
      "strengths": ["Specific strength 1", "Specific strength 2"],
      "weaknesses": ["Specific weakness 1", "Specific weakness 2"],
      "recent_moves": "Concrete observed action in past 30 days (ad campaign, product update, pricing change, content push)",
      "threat_level": "high|medium|low"
    }
  ],
  "competitive_gaps": [
    "Specific opportunity: what is underserved and why this company can own it"
  ],
  "messaging_vulnerabilities": [
    "Competitor claim + our counter-narrative (e.g. 'Clevertap claims AI personalization but no B2B case studies — counter: show ICP-specific scoring results')"
  ],
  "recommended_response": "Specific action + owner agent (e.g. 'Riya should publish comparison page this week; Neel should review channel shift toward LinkedIn')"
}
```

Rules:
- Never return an empty `competitors` array — if MKG lacks competitor data, infer from ICP category and search patterns
- `recent_moves` must describe a concrete action, not a trend or general observation
- `competitive_gaps` must name actionable opportunities, not just describe the competitor's weakness
- `messaging_vulnerabilities` must pair each competitor claim with a specific counter-narrative
- `recommended_response` must name both the action and the responsible agent
- `threat_level` must be justified by the specifics in that competitor's entry
