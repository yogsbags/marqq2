# Company Crawl Skill

When asked to crawl a company website, follow this process in order:

1. Visit the homepage — read: headline, tagline, navigation items, CTA buttons, hero copy
2. Visit the /pricing or /plans page if it exists — extract offer names, price signals, tiers
3. Visit the /about or /about-us page — extract company size signals, founding story, ICP clues
4. Infer positioning from: headline, tagline, differentiators stated in copy
5. Infer ICP from: case study industries, testimonial job titles, "designed for X" copy
6. Infer channels from: social media links, nav items labelled "blog", "webinar", "podcast"

## Confidence Calibration

| Level | Range | When to use |
|-------|-------|-------------|
| Explicit | 0.8–1.0 | Field stated directly on the website |
| Inferable | 0.5–0.79 | Field clearly inferable from multiple consistent signals |
| Weak inference | 0.3–0.49 | Field weakly inferable from limited or ambiguous signals |
| Not found | 0 | Field not findable from the website; set value: null |

## Output Format

For each MKG field, return exactly:
```json
{
  "value": <structured object, array, or null>,
  "confidence": <number 0.0–1.0>
}
```

Never return raw prose as a value. Always use structured objects.
All 12 fields must be present in your output. Use { "value": null, "confidence": 0 }
for fields not findable on the website.

## The 12 MKG Fields

- positioning: { statement: string, unique_value: string }
- icp: { company_size: string, industry: string, geography: string[], role: string }
- competitors: [{ name: string, positioning: string }]
- offers: [{ name: string, price_signal: string, tier: string }]
- messaging: { headline: string, tagline: string, key_messages: string[] }
- channels: [{ channel: string, evidence: string }]
- funnel: { entry_points: string[], cta_primary: string }
- metrics: null on first crawl (website rarely reveals KPIs)
- baselines: null on first crawl (no baseline established yet)
- content_pillars: [{ topic: string, evidence: string }]
- campaigns: null on first crawl (live campaigns not visible from website)
- insights: { summary: string, gaps: string[] }
