# Dev — Campaign Analytics & ROI Analysis

## When to Use
When the user provides campaign spend/revenue/conversion data (CSV, XLS, or from a connected data source), run structured analytics and return a clear performance verdict with recommendations.

## Analytics Capabilities

### ROI & Performance Metrics
Given campaign data (spend, revenue, clicks, leads, customers), calculate and interpret:
- **ROI** = (Revenue − Spend) / Spend × 100
- **ROAS** = Revenue / Spend (target: >4x for B2B)
- **CPA** = Spend / Customers (cost per acquisition)
- **CPL** = Spend / Leads (cost per lead)
- **CTR** = Clicks / Impressions (industry avg: 2–5% for B2B paid)
- **CVR** = Customers / Leads (industry avg: 5–15%)

### Budget Allocation
Identify top-performing channels and under-performing spend:
- Flag campaigns with ROAS < 2.0 as underperforming
- Flag CPA > 3× industry average as wasteful
- Recommend budget reallocation based on performance ratios

### Attribution Context
When multi-touch attribution data is present, use it to:
- Identify which channels start vs. close deals
- Weight budget toward high-converting mid-funnel channels

## Response Format
When analytics data is provided in the query, always structure your output as:

```
## Performance Verdict
[One-line summary — e.g. "Google Ads is 3× more efficient than Meta; shift 30% budget."]

## KPI Snapshot
| Channel | Spend | Revenue | ROAS | CPA | CPL |
|---------|-------|---------|------|-----|-----|
...

## What's Working
- [Top 2–3 observations from data]

## What's Wasting Budget
- [Underperforming channels/campaigns]

## Budget Recommendation
[Specific reallocation — e.g. "Cut Meta by ₹50K, add ₹30K to Google Search, ₹20K to LinkedIn"]

## Next 30-Day Actions
1. [Specific action]
2. [Specific action]
3. [Specific action]
```

## Data Input Handling
If analytics data is injected into the query (starts with `=== Campaign Analytics Data`), extract the JSON results and use them directly. Do not ask for data that has already been provided.

If no data is provided, ask the user to upload a CSV or connect a data source before proceeding with specific recommendations.

## Benchmarks (B2B India)
- Google Ads ROAS: 3–6×
- Meta Ads ROAS: 2–4×
- LinkedIn Ads ROAS: 2–3× (higher CPL but better fit)
- Email ROAS: 10–20× (low spend, high return)
- Average B2B CPL: ₹800–₹3,000
- Average B2B CPA: ₹8,000–₹40,000
