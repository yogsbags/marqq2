# Budget Planner

Use this skill when the user wants to allocate a marketing budget prospectively — deciding how to spend money going forward, not analyzing what was spent.

This is NOT the same as KPI Diagnostic (01) or Baseline Analysis (02). Those are retrospective. This skill is forward-looking.

## Trigger Inputs

Required from user before starting:
- **Goal** — what the budget is trying to achieve (leads, pipeline, signups, revenue)
- **Timeline** — 30 days, 60 days, 90 days, or a fixed campaign window
- **Total budget** — in ₹ or $
- **Current channels** — which channels are already active (optional but helpful)

## Process

1. Identify the goal type and match it to the channels with the best CPL/CPA profile for that goal.
2. Allocate budget across channels as percentages, then convert to ₹ amounts.
3. Prioritize channels with fastest signal (Meta, Google Search) at the start; brand-building channels (LinkedIn, content) later.
4. Build a 30/60/90-day ramp that starts conservative and scales winners.
5. Apply guard rails: stop-loss and scale trigger thresholds for each channel.

India B2B benchmarks to use:
- LinkedIn CPL: ₹2,000–5,000 (top of funnel) | CPA: ₹20,000–40,000
- Google Search CPL: ₹800–2,000 | CPA: ₹8,000–20,000
- Meta CPL: ₹500–1,500 (SMB) | CPA: ₹5,000–15,000
- Content/SEO: 3–6 month payback window, low direct CPA

## Output

Use this exact structure:

---

## Budget Allocation Plan — [timeframe]
**Total Budget**: ₹X   **Goal**: [restate]   **Timeline**: [dates or window]

| Channel | Allocation % | ₹ Amount | Goal Metric | Expected CPL/CPA |
|---------|-------------|----------|-------------|-----------------|
| Google Search | X% | ₹X | X leads | ₹Y CPL |
| LinkedIn | X% | ₹X | X MQLs | ₹Y CPL |
| Meta | X% | ₹X | X leads | ₹Y CPL |
| Content / SEO | X% | ₹X | X sessions | — |
| Reserve / Test | X% | ₹X | Experimentation | — |

### 30/60/90-Day Ramp
**Days 1–30**: Start at 60% of allocated budget. Prioritize Google Search and Meta for fast signal. Do not scale LinkedIn until conversion data exists.
**Days 31–60**: Review CPL by channel. Move budget from underperformers to top-2 channels. Activate retargeting.
**Days 61–90**: Scale top channels to full allocation. Kill any channel above 1.5x target CPA with no improving trend.

### Budget Guard Rails
- **Stop-loss**: Pause any channel spending more than 2x target CPA after 2 consecutive weeks without improvement.
- **Scale trigger**: Double budget on any channel hitting less than 0.8x target CPL for 2 consecutive weeks.
- **Reserve rule**: Keep 10–15% unallocated for tests, retargeting audiences, or emergency reallocation.

---

Do not recommend channels the user has already ruled out. Do not include brand-only channels (PR, events) unless the user's goal is awareness.
