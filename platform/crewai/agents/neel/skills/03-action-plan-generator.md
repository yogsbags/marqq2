# Action Plan Generator

Use this skill when the user provides a goal, timeline, budget, and target audience and asks for a marketing plan.

## Trigger Inputs

Required from user before starting:
- **Goal** — leads, revenue, awareness, or signups (and a number if possible)
- **Timeline** — in weeks or months
- **Budget** — in ₹ or $
- **Target audience** — ICP description (role, company size, industry, geography)

If any of these are missing, ask for them before generating the plan.

## Process

1. Restate the goal as a specific, measurable outcome (e.g., "500 MQLs in 8 weeks at ₹1,200 CPL").
2. Select the top 5 actions ranked by: ICP fit, speed to first result, and budget efficiency.
3. Assign each action a channel, budget slice, timeline window, and expected outcome.
4. Build a week-by-week milestone schedule. Group into: Foundation (weeks 1–2), Launch (weeks 3–4), Scale (weeks 5+).
5. If the goal includes lead generation, recommend ICP search criteria for Arjun to run a lead fetch.
6. Apply India B2B benchmarks throughout:
   - CPL: ₹800–3,000 (LinkedIn higher, Google lower)
   - CPA: ₹8,000–40,000 depending on ACV
   - LinkedIn ROAS: 2–3x
   - Google ROAS: 3–6x

## Output

Use this exact structure:

---

## Marketing Action Plan
**Goal**: [restate goal with number]   **Timeline**: X weeks   **Budget**: ₹Y

### Top 5 Priorities (in order)
| # | Action | Channel | Budget | Timeline | Expected Outcome |
|---|--------|---------|--------|----------|-----------------|
| 1 | ... | ... | ₹X | Week 1–2 | ... |
| 2 | ... | ... | ₹X | Week 3–4 | ... |
| 3 | ... | ... | ₹X | Week 3–6 | ... |
| 4 | ... | ... | ₹X | Week 5–8 | ... |
| 5 | ... | ... | ₹X | Week 6–8 | ... |

### Week-by-Week Milestones
**Week 1–2 (Foundation)**: [tracking setup, audience build, creative brief, landing page live]
**Week 3–4 (Launch)**: [first campaigns live, initial data, early signal review]
**Week 5–6 (Optimize)**: [double down on what works, pause what does not]
**Week 7–8 (Scale)**: [push budget to winners, retargeting active]

### Lead Fetch Recommendation
[Only include if goal contains leads. State: ICP criteria Arjun should use — job titles, company size range, industries, geography, seniority level. Keep it to 3–5 criteria.]

---

Keep the plan to one scroll. Do not explain what each channel is. Assume the user knows marketing basics.
