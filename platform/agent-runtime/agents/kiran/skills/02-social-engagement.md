# Social Engagement

Use this skill when the task is to build and schedule a social content calendar.

## Process

1. Review ICP behavior, active channels, and current content themes from MKG context.
2. Plan posts across the week — at least 3 per week on the primary platform.
3. For each post: write the full draft (not a topic description), select hashtags, set posting time.
4. Mix post types: at least one educational, one social proof, one thought leadership per week.
5. Document content themes and posting frequency summary.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "calendar": [
    {
      "day": "Mon Week 1",
      "platform": "LinkedIn|Instagram|Twitter",
      "post_type": "educational|social_proof|thought_leadership|engagement",
      "topic": "One-line summary of what the post is about",
      "draft": "The complete, ready-to-publish post text. Every paragraph written. No placeholders. Formatted with line breaks as it should appear on the platform.",
      "hashtags": ["#SpecificTag1", "#SpecificTag2"],
      "posting_time": "9AM IST"
    }
  ],
  "content_themes": ["Theme 1 (maps to which posts)", "Theme 2 (maps to which posts)"],
  "posting_frequency": "X per platform per week"
}
```

Rules:
- `draft` must be the complete post text — never a description of what to write
- Return at least 5 calendar entries for a weekly brief
- Include at least one `social_proof` post type with specific numbers or client outcomes
- `hashtags` must be specific to each individual post topic
- `content_themes` must map to the posts in the calendar, not be a standalone generic list
- Use ICP-specific pain points, proof points, and company context from MKG in every draft
- `posting_time` should reflect when the ICP is most active, not a default "morning"
