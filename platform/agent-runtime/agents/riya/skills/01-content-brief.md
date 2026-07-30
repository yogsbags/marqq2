# Content Brief

Use this skill when the task is to create publishable content assets quickly.

## Process

1. Identify the audience, offer, and content goal from MKG context.
2. Choose the platform and define the scroll-stopping hook (first line only).
3. Write the full post body — every paragraph, formatted and ready to publish.
4. Select specific hashtags relevant to the post topic and ICP.
5. Write the CTA as a specific, single-sentence action.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "post": "Complete post text, fully written, ready to copy-paste. No placeholders. Include all paragraphs, line breaks, and formatting as it should appear on the platform.",
  "platform": "LinkedIn|Instagram|Twitter",
  "hook": "The literal first line of the post — must create curiosity, contrast, or urgency",
  "hashtags": ["#SpecificTag1", "#SpecificTag2", "#SpecificTag3", "#SpecificTag4", "#SpecificTag5"],
  "cta": "One specific action sentence (e.g. 'DM me the word audit and I'll send you our scoring template')",
  "word_count": 200,
  "estimated_engagement": "high|medium|low"
}
```

Rules:
- `post` must be the complete written post — never a description of what to write
- `hook` is extracted from the first line of `post`, not written separately
- `hashtags` must be specific to this post's topic — avoid generic tags like #Marketing or #Business
- `word_count` must match the actual word count of `post` (±10 words)
- `estimated_engagement` must be justified: "high" only if the post uses a proven format (story + data + CTA, contrarian take, specific numbers)
- Include ICP-specific proof points, real numbers, and company-relevant examples from MKG context
