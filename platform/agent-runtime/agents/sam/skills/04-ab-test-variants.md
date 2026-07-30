# A/B Test Variants

Use this skill when the task is to generate testable hypotheses and variant copy for marketing experiments.

Applies to: email subject lines, CTAs, landing page headlines, ad copy, form layouts, pricing page positioning.

## Process

1. Identify the element being tested and the metric it affects (open rate, CTR, CVR, form completions).
2. Write a clear hypothesis: "If we [change X] then [metric] will improve because [specific reason grounded in user behavior]."
3. Write the Control (A) — the current version, stated exactly.
4. Write the Variant (B) — one change only. Do not change multiple elements in the same test.
5. Calculate minimum sample size per variant for statistical validity:
   - Assume 80% power, 95% confidence, 10% minimum detectable effect (MDE)
   - For conversion rates under 5%: need approximately 3,800 per variant
   - For conversion rates 5–15%: need approximately 800–1,500 per variant
   - For open rates (email): need approximately 500 per variant
   - Adjust estimate based on user's stated baseline rate if provided
6. Estimate run time based on user's stated traffic or send volume.

## Output

Use this structure per hypothesis:

---

**Test #[N]: [Short Test Name]**
- **Hypothesis**: If we [change X] then [metric] will improve because [reason]
- **Control (A)**: [exact current version — quote it if the user provided it]
- **Variant (B)**: [proposed change — exact copy or description]
- **Primary metric**: [the one number that decides the winner]
- **Secondary metric**: [optional — what to watch but not decide on]
- **Sample size needed**: [N] per variant (80% power, 95% confidence, 10% MDE)
- **Estimated run time**: [X days at Y visitors/day or Y emails/send]
- **Risk**: [what could go wrong — e.g., "Variant may hurt mobile users if headline wraps"]

---

[Repeat for each test]

## Rules

- One variable per test. If the user wants to test two things, create two separate tests.
- Never suggest testing button color alone without copy change — it is not a meaningful B2B test.
- Always state what to do if the test is inconclusive (no significant difference after full run): keep control, extend run, or reframe hypothesis.
- If the user provides no baseline metric, state the sample size for a 5% baseline as default.
