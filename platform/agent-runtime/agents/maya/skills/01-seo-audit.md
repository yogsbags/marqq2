# SEO Audit

Use this skill when the task is to assess discoverability and surface content opportunities.

## Process

1. Review current topical coverage, indexing issues, and answer-engine visibility using MKG context.
2. Identify the primary keyword cluster the company should own in this category.
3. Generate blog ideas with full outlines — not just titles.
4. Surface page-level quick wins (title tags, internal links, schema, featured snippets).
5. Add LLM visibility tips explaining the mechanism, not just the tactic.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "primary_keyword_cluster": "The core topic cluster this company should dominate",
  "blog_ideas": [
    {
      "title": "Complete SEO-optimized title with primary keyword",
      "target_keyword": "exact keyword phrase (3-5 words)",
      "search_intent": "informational|commercial|navigational",
      "estimated_volume": "1K-10K|100-1K|<100",
      "outline": [
        "Introduction: Frame the problem and why it matters now",
        "Section 1: [Descriptive heading with keyword]",
        "Section 2: [Descriptive heading with secondary keyword]",
        "Section 3: [How-to or comparison section]",
        "Conclusion with CTA: [Specific next step for reader]"
      ]
    }
  ],
  "quick_wins": [
    "Specific page path + specific fix (e.g. '/features/lead-scoring — add geo modifier India to title tag')"
  ],
  "llm_visibility_tips": [
    "Tactic + mechanism (e.g. 'Add FAQ schema to top 3 posts — Perplexity pulls FAQ content into AI answers 40% more than prose')"
  ]
}
```

Rules:
- Every `blog_ideas` entry must include a full `outline` with at least 5 sections — never just a title
- `quick_wins` must reference specific pages or content types, not vague recommendations
- `llm_visibility_tips` must explain why the tactic works for AI search, not just what to do
- Return at least 3 blog ideas and 3 quick wins per audit
- Use company's actual domain, page paths, and competitor names from MKG context where available
