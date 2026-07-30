# Client Context — GTM Module

**Module**: Nouriva AI
**Type**: product
**Company**: Nouriva AI
**Website**: https://nouriva.tech
**Industry**: Consumer health technology and AI nutrition
**Target ICP**: Health-conscious adults with recent lab reports who want practical personalized nutrition guidance
**Target timeline**: —
**Pricing strategy**: —
**Positioning**: —
**Elevator pitch**: —
**Distribution**: —
**Marketing assets**: —
**Content strategy**: —
**Social strategy**: —
**Lead mgmt**: —
**Lead scoring**: —
**TAT / outreach segment**: —
**Lead qualification**: —
**Competitors**: —
**Primary Goal**: Acquire and activate paid users from the lab-upload funnel
**Key Goals**: Acquire and activate paid users from the lab-upload funnel | Target: 500 activated paid users within 90 days | Timeline: 90 days | Paid acquisition | Budget: ₹5–20L / $6–25k

## Locked GTM Profile
```json
{
  "goals": {
    "budget_band": "₹5–20L / $6–25k",
    "channel_bet": "Paid acquisition",
    "priority_90d": "Acquire and activate paid users from the lab-upload funnel",
    "strategy_depth": "Practical 90-day execution plan",
    "timeline_target": "90 days",
    "success_baseline": "0 confirmed baseline; establish the baseline in week one",
    "metric_definition": "One APU = a user who (1) uploads a verified lab‑report, (2) pays for a Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
    "north_star_metric": "Activated Paid Users (APU)",
    "quantified_target": "500 activated paid users within 90 days"
  },
  "module": {
    "name": "Nouriva AI",
    "type": "product"
  },
  "inferences": {
    "confidence": 0.7,
    "from_crawl": [
      "positioning: {\"statement\":\"The first nutrition app that reads your lab report and knows your medical conditions.\",\"unique_value\":\"Personalised meal scores for diabetes, PCOS, thyroid, and 30+ more — worldwide.\"}",
      "icp: {\"company_size\":null,\"industry\":[\"health and wellness\",\"nutrition\",\"medical\"],\"geography\":[\"worldwide\"],\"role\":[\"health‑conscious individuals\",\"patients with medical conditions\"]}",
      "competitors: [{\"name\":\"Nourli\",\"positioning\":\"A photo‑first AI nutrition tracker that emphasizes transparency and honesty, offering a personal coach, fasting timer, confidence‑rated estimates, and clear, upfront pricing.\"},{\"name\":\"MyFitnessPal\",\"positioning\":\"A widely‑used calorie‑tracking app focused on packaged‑food barcode scanning, deep fitness‑device integrations, and a strong social‑accountability community.\"},{\"name\":\"Noom\",\"positioning\":\"A behavior‑change platform that combines psychology‑based weight‑loss programs with human coaching and optional telehealth/GLP‑1 support.\"},{\"name\":\"Cronometer\",\"positioning\":\"A nutrition‑tracking solution prized for its exhaustive micronutrient database and lab‑verified food data, targeting users who need precise nutrient detail.\"},{\"name\":\"Fay Nutrition\",\"positioning\":\"A virtual nutrition‑care provider backed by significant funding, delivering AI‑augmented dietitian services and insurance‑covered nutrition plans.\"}]",
      "offers: [{\"name\":\"Nouriva AI\",\"price_signal\":\"$9.99 / month and $49.99 / year\",\"tier\":\"Monthly and Yearly\"}]",
      "messaging: {\"headline\":\"Food that fits your lab work, not just your macros.\",\"tagline\":\"The first nutrition app that reads your lab report and knows your medical conditions.\",\"key_messages\":[\"Personalised meal scores\",\"Lab report analysis\",\"Organ‑level impact analysis\"]}",
      "channels: [{\"channel\":\"Website\",\"evidence\":\"Nouriva AI\"},{\"channel\":\"App Store\",\"evidence\":\"Download on the App Store\"},{\"channel\":\"Google Play\",\"evidence\":\"Get it on Google Play\"}]",
      "funnel: {\"entry_points\":[\"Website\",\"App Store\",\"Google Play\"],\"cta_primary\":\"Try everything. Pay if you stay.\"}",
      "content_pillars: [{\"topic\":\"Lab Reports\",\"evidence\":\"Your blood work, in the loop.\"},{\"topic\":\"Conditions\",\"evidence\":\"Scores that know your body.\"},{\"topic\":\"Organs\",\"evidence\":\"Beyond macros. See your organs.\"}]"
    ]
  },
  "goal_system": {
    "target": null,
    "baseline": null,
    "guardrails": [
      "Count only users with a verified lab‑report upload",
      "Subscription must be active (payment captured)",
      "User must record at least one meal or view a personalised score within 7 days",
      "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts"
    ],
    "channel_bet": null,
    "metric_tree": [
      "Activated Paid Users (APU) – North Star",
      "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage"
    ],
    "primary_loop": [
      "Acquire → Lab Upload → Personalised Score → Subscribe → Ongoing Meal Logging"
    ],
    "priority_90d": "Acquire and activate paid users from the lab‑upload funnel",
    "rejects_as_nsm": [
      "App downloads",
      "Free trial sign‑ups without payment",
      "Raw ad impressions or clicks",
      "Number of lab uploads without subsequent subscription",
      "Total revenue without activation context"
    ],
    "sectionTargets": [],
    "timeline_target": "90 days",
    "metric_definition": "One APU = a user who (1) uploads a verified lab‑report, (2) pays for a Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
    "north_star_metric": "Activated Paid Users (APU)",
    "quantified_target": "500 activated paid users",
    "business_archetype": "consumer_product",
    "measurement_period": null,
    "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) of $5,000 (≈500 users × $10) by month 6"
  },
  "control_loop": {
    "status": "pending",
    "cadence": {
      "principle": "Monitor continuously, optimize weekly, evaluate experiments biweekly, reallocate resources monthly, and rethink strategy quarterly.",
      "daily_review": [
        "Signups / installs",
        "Activated Paid Users (North Star)",
        "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage",
        "Activation errors",
        "Crash / scan failures"
      ],
      "practical_rules": [
        "Review high-frequency operational metrics daily.",
        "Course-correct tactical execution weekly.",
        "Evaluate experiments only after their predefined duration.",
        "Reallocate agent priorities monthly.",
        "Change strategy or North Star only quarterly, unless a major external event occurs.",
        "Escalate trust, safety, security, or compliance issues immediately.",
        "Prefer two consecutive underperforming periods before major changes, unless severe.",
        "Do not overreact to a single day of retention or late-funnel data."
      ],
      "real_time_monitoring": [
        "Count only users with a verified lab‑report upload.",
        "Subscription must be active (payment captured).",
        "User must record at least one meal or view a personalised score within 7 days.",
        "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts.",
        "System / delivery failures",
        "Compliance or trust incidents"
      ],
      "metric_review_windows": [
        {
          "metric_class": "Acquisition CTR / install rate",
          "review_after": "3–7 days"
        },
        {
          "metric_class": "Profile / onboarding completion",
          "review_after": "3–7 days"
        },
        {
          "metric_class": "First activation event",
          "review_after": "7 days"
        },
        {
          "metric_class": "7-day retention / repeat loop",
          "review_after": "7–14 days"
        },
        {
          "metric_class": "30-day retention",
          "review_after": "30–45 days"
        },
        {
          "metric_class": "Subscription / monetization",
          "review_after": "30–90 days"
        },
        {
          "metric_class": "Long-horizon outcome metrics",
          "review_after": "Research cycle — not weekly GTM"
        }
      ],
      "monthly_resource_review": [
        "CAC / efficiency of activated outcomes",
        "Retention or repeat quality",
        "Conversion to paid / committed outcome",
        "Agent contribution to North Star",
        "Resource reallocation across constraints"
      ],
      "weekly_course_correction": [
        "Activated Paid Users (APU)",
        "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage",
        "Checkpoint attainment vs plan",
        "Open intervention impact"
      ],
      "quarterly_strategy_review": [
        "ICP and beachhead",
        "Positioning",
        "Pricing / packaging",
        "North Star target feasibility",
        "Product / offer priorities"
      ],
      "biweekly_experiment_review": [
        "Messaging / creative experiments",
        "Onboarding or funnel experiments",
        "Channel mix tests",
        "Recommendation / activation tests"
      ]
    },
    "version": 1,
    "recovery": {
      "choices": [
        "increase_resources",
        "reduce_scope",
        "extend_deadline"
      ],
      "endTarget": 500,
      "shortfall": 130,
      "actualToDate": 0,
      "expectedToDate": 130,
      "recommendation": "increase_resources_or_reduce_scope",
      "remainingToGoal": 500,
      "remainingPeriods": 2,
      "requiredPerPeriod": 250
    },
    "updatedAt": "2026-07-30T10:55:38.122Z",
    "weeklyCycle": [
      {
        "day": "Monday",
        "focus": "Analytics reports actuals vs target"
      },
      {
        "day": "Tuesday",
        "focus": "Diagnose largest bottleneck on metric tree"
      },
      {
        "day": "Wednesday",
        "focus": "Agents propose quantified interventions"
      },
      {
        "day": "Thursday",
        "focus": "Owner approves or rejects interventions"
      },
      {
        "day": "Friday",
        "focus": "Execution agents launch approved actions"
      },
      {
        "day": "Next week",
        "focus": "Measure impact and reallocate priorities"
      }
    ],
    "currentPeriod": {
      "label": "Month 1",
      "actual": null,
      "period": 1,
      "status": "pending",
      "target": 130,
      "attainment": null
    },
    "funnelActuals": [
      {
        "stage": "Activated Paid Users (North Star)",
        "actual": null,
        "target": null,
        "finding": null
      },
      {
        "stage": "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage",
        "actual": null,
        "target": null,
        "finding": null
      }
    ],
    "interventions": [],
    "lastDiagnosis": null,
    "checkpointPlan": {
      "unit": "Activated Paid Users (APU)",
      "periods": 3,
      "baseline": 0,
      "endTarget": 500,
      "checkpoints": [
        {
          "label": "Month 1",
          "actual": null,
          "period": 1,
          "status": "pending",
          "target": 130,
          "attainment": null
        },
        {
          "label": "Month 2",
          "actual": null,
          "period": 2,
          "status": "pending",
          "target": 370,
          "attainment": null
        },
        {
          "label": "Month 3",
          "actual": null,
          "period": 3,
          "status": "pending",
          "target": 500,
          "attainment": null
        }
      ],
      "timeline_target": "90 days",
      "quantified_target": "500 activated paid users"
    },
    "autoAdjustAllowed": [
      "priorities",
      "recommendations",
      "campaign_mix",
      "experiment_allocation",
      "alert_frequency"
    ],
    "varianceThresholds": {
      "amber": 0.8,
      "green": 0.95
    },
    "humanApprovalRequired": [
      "north_star_metric",
      "deadline",
      "financial_targets",
      "compliance_rules",
      "eligibility_rules",
      "external_campaigns_above_budget_threshold",
      "quarterly_strategy_changes"
    ]
  },
  "locked_sections": [
    "goals",
    "module"
  ],
  "auto_strategy_sections": [
    {
      "id": "customer_success",
      "body": "The North Star Metric (NSM) for Nouriva AI is Activated Paid Users (APU), a composite outcome that directly reflects product value and revenue. Agents should concentrate on three sequential levers—lab‑report uploads, subscription conversion, and first‑week active usage—each of which is fully controllable within a 90‑day horizon. Guardrails must be enforced to prevent metric gaming, ensuring only verified, paying users who engage within seven days count toward the NSM. Ownership of the NSM is split across acquisition, onboarding, and analytics teams, with clear share‑of‑target responsibilities. Weekly cadence should review funnel health, surface bottlenecks, and trigger rapid experiments on the weakest link. Success is measured against a concrete target of 500 APUs, which translates to an MRR of roughly $5 k by month 6, providing a clear bridge from short‑term activation to long‑term business health.",
      "title": "Customer success & retention",
      "bullets": [
        "Launch paid‑acquisition campaigns targeting recent lab‑report owners",
        "Streamline the three‑step activation funnel: upload → subscribe → first‑week usage",
        "Instrument GA4 and backend to capture the APU definition in real‑time",
        "Apply strict guardrails to filter bots, free‑trials and low‑quality sign‑ups",
        "Allocate ownership: acquisition (40 %), onboarding (35 %), analytics (25 %)",
        "Run weekly funnel diagnostics and iterate on the weakest stage",
        "Tie early‑stage activation to the longer‑term MRR goal"
      ],
      "channel": "#customer-success",
      "summary": "Focus the first 90 days on converting lab‑report upload prospects into paying, active users – the core value loop for Nouriva AI.",
      "subsections": [
        {
          "body": "One Activated Paid User (APU) equals a user who (1) uploads a verified lab‑report, (2) completes a paid Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
          "title": "North Star Definition",
          "bullets": [
            "Outcome‑focused, revenue‑linked, and measurable via GA4/backend",
            "Excludes free‑trial‑only sign‑ups and duplicate accounts"
          ]
        },
        {
          "body": "The NSM is driven by three sequential levers that Marqq agents can optimise.",
          "title": "Metric Tree & Leading Drivers",
          "bullets": [
            "Lab‑Report Uploads → improve upload UX and reduce friction",
            "Subscription Conversions → optimise pricing page, checkout flow, and paid‑ad targeting",
            "First‑Week Active Usage → push onboarding nudges, meal‑logging reminders, and personalised score notifications"
          ]
        },
        {
          "body": "To keep the metric honest, the following constraints must be enforced.",
          "title": "Guardrails & Anti‑Gaming",
          "bullets": [
            "Count only users with a verified lab‑report upload",
            "Subscription must be active (payment captured)",
            "User must record a meal or view a score within 7 days",
            "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts",
            "Device‑fingerprinting to filter fraudulent accounts"
          ]
        },
        {
          "body": "All growth‑related agents share responsibility for the NSM with defined shares of the 500‑user target.",
          "title": "Contribution to Goal & Ownership",
          "bullets": [
            "Paid‑Acquisition Lead – 40 % (200 APUs) – by day 30",
            "Onboarding Product Manager – 35 % (175 APUs) – by day 60",
            "Data Analyst – 25 % (125 APUs) – by day 90"
          ]
        }
      ],
      "proposedNorthStar": "500 activated paid users within 90 days",
      "proposedGoalSystem": {
        "target": null,
        "baseline": null,
        "guardrails": [
          "Count only users with a verified lab‑report upload",
          "Subscription must be active (payment captured)",
          "User must record at least one meal or view a personalised score within 7 days",
          "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts"
        ],
        "channel_bet": "Paid acquisition",
        "metric_tree": [
          "Activated Paid Users (North Star)",
          "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage"
        ],
        "primary_loop": [
          "Acquire → Lab Upload → Personalised Score → Subscribe → Ongoing Meal Logging"
        ],
        "priority_90d": "Acquire and activate paid users from the lab‑upload funnel",
        "rejects_as_nsm": [
          "App downloads",
          "Free trial sign‑ups without payment",
          "Raw ad impressions or clicks",
          "Number of lab uploads without subsequent subscription",
          "Total revenue without activation context"
        ],
        "sectionTargets": [],
        "timeline_target": "90 days",
        "metric_definition": "One APU = a user who (1) uploads a lab‑report, (2) pays for a Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
        "north_star_metric": "Activated Paid Users (APU)",
        "quantified_target": "500 activated paid users",
        "business_archetype": "consumer_product",
        "measurement_period": null,
        "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) of $5,000 (≈500 users × $10) by month 6"
      }
    },
    {
      "id": "operations_execution",
      "body": "Marqq agents should align all activities to the Activated Paid Users (APU) North Star, a composite outcome that directly reflects product value and revenue. The metric is tightly defined, measurable within the 90‑day horizon, and fully controllable through three sequential levers: lab‑report uploads, subscription conversions, and first‑week active usage. Guardrails prevent gaming by counting only verified, paying users who engage within seven days. Ownership is split across acquisition (40 % of the target), onboarding (35 %), and analytics (25 %), each with explicit milestones. Weekly reviews must track the metric tree, diagnose bottlenecks, and trigger rapid experiments on the weakest link. Success is measured against a concrete target of 500 APUs, which translates to an MRR of ~$5 k by month 6, linking short‑term activation to long‑term business health.",
      "title": "Operations & Execution",
      "bullets": [
        "Launch paid‑acquisition campaigns targeting users who have recent lab reports",
        "Optimize the three‑step activation funnel: upload → subscribe → first‑week usage",
        "Instrument analytics to capture the APU definition in real‑time and enforce guardrails",
        "Allocate clear ownership and share‑of‑target across acquisition, onboarding, and analytics teams",
        "Run weekly funnel diagnostics, surface the weakest stage, and iterate experiments rapidly"
      ],
      "channel": "#operations-execution",
      "summary": "Focus the first 90 days on converting lab‑report upload prospects into paying, active users—the core value loop that drives both short‑term activation and long‑term revenue for Nouriva AI.",
      "subsections": [
        {
          "body": "One Activated Paid User (APU) equals a user who (1) uploads a verified lab‑report, (2) completes a paid Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
          "title": "North Star Definition",
          "bullets": [
            "Outcome‑focused, revenue‑linked, and measurable via GA4/backend",
            "Excludes free‑trial‑only sign‑ups and duplicate/bot accounts"
          ]
        },
        {
          "body": "The NSM is driven by three sequential levers that Marqq agents can optimise to move users through the activation funnel.",
          "title": "Metric Tree & Leading Drivers",
          "bullets": [
            "Lab‑Report Uploads – improve upload UX and reduce friction",
            "Subscription Conversions – optimise pricing page, checkout flow, and paid‑ad targeting",
            "First‑Week Active Usage – push onboarding nudges, meal‑logging reminders, and personalised score notifications"
          ]
        },
        {
          "body": "To keep the metric honest, strict constraints must be enforced at every stage of the funnel.",
          "title": "Guardrails & Anti‑Gaming",
          "bullets": [
            "Count only users with a verified lab‑report upload",
            "Subscription must be active (payment captured)",
            "User must record a meal or view a score within 7 days",
            "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts",
            "Device‑fingerprinting and fraud detection to filter fraudulent accounts"
          ]
        },
        {
          "body": "All growth‑related agents share responsibility for the NSM with defined shares of the 500‑user target and clear deadlines.",
          "title": "Contribution to Goal & Ownership",
          "bullets": [
            "Paid‑Acquisition Lead – 40 % (200 APUs) – by day 30",
            "Onboarding Product Manager – 35 % (175 APUs) – by day 60",
            "Data Analyst – 25 % (125 APUs) – by day 90"
          ]
        }
      ],
      "proposedNorthStar": "500 activated paid users within 90 days",
      "proposedGoalSystem": {
        "target": null,
        "baseline": null,
        "guardrails": [
          "Count only users with a verified lab‑report upload",
          "Subscription must be active (payment captured)",
          "User must record at least one meal or view a personalised score within 7 days",
          "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts"
        ],
        "channel_bet": null,
        "metric_tree": [
          "Activated Paid Users (APU) – North Star",
          "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage"
        ],
        "primary_loop": [
          "Acquire → Lab Upload → Personalised Score → Subscribe → Ongoing Meal Logging"
        ],
        "priority_90d": "Acquire and activate paid users from the lab‑upload funnel",
        "rejects_as_nsm": [
          "App downloads",
          "Free trial sign‑ups without payment",
          "Raw ad impressions or clicks",
          "Number of lab uploads without subsequent subscription",
          "Total revenue without activation context"
        ],
        "sectionTargets": [],
        "timeline_target": "90 days",
        "metric_definition": "One APU = a user who (1) uploads a verified lab‑report, (2) pays for a Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
        "north_star_metric": "Activated Paid Users (APU)",
        "quantified_target": "500 activated paid users",
        "business_archetype": "consumer_product",
        "measurement_period": null,
        "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) of $5,000 (≈500 users × $10) by month 6"
      }
    },
    {
      "id": "financial_plan",
      "body": "Nouriva AI’s growth engine should be anchored to the number of Activated Paid Users (APU). An APU is a user who uploads a lab report, pays for a subscription, and logs at least one meal or views a personalised score within seven days. By measuring this composite outcome, agents can influence acquisition spend, onboarding flow, and early‑stage product engagement, all of which are directly controllable in a 90‑day horizon. The ultimate business health will be reflected in sustained MRR, but the short‑term North Star provides a clear, actionable target for the growth team.",
      "title": "Financial plan",
      "bullets": [
        "Launch a paid‑acquisition campaign targeting health‑conscious adults with recent lab reports.",
        "Implement a three‑step activation funnel: lab upload → subscription → first‑week usage.",
        "Instrument GA4 to capture the activation definition and feed data to Marqq agents.",
        "Apply guardrails to exclude low‑quality sign‑ups and prevent metric gaming."
      ],
      "channel": "#financial-plan",
      "summary": "Focus the first 90 days on converting lab‑report upload prospects into paying, active users – the core value loop for Nouriva AI.",
      "subsections": [
        {
          "body": "The North Star Metric is Activated Paid Users (APU). One APU equals a user who (1) successfully uploads a lab report, (2) completes a paid subscription (monthly or yearly), and (3) records at least one meal or views a personalised meal score within the first 7 days of subscription.",
          "title": "North Star Definition",
          "bullets": [
            "Clear, outcome‑focused, and tied to product value.",
            "Fully measurable via GA4 and the app’s backend.",
            "Directly linked to revenue and long‑term retention."
          ]
        },
        {
          "body": "The APU metric is driven by three sequential levers that Marqq agents can optimise:",
          "title": "Metric Tree & Leading Drivers",
          "bullets": [
            "Lab‑Report Uploads → improve upload UX and reduce friction.",
            "Subscription Conversions → optimise pricing page, checkout flow, and paid‑ad targeting.",
            "First‑Week Active Usage → push onboarding nudges, meal‑logging reminders, and personalised score notifications."
          ]
        },
        {
          "body": "To keep the metric honest, the following constraints must be enforced:",
          "title": "Guardrails & Anti‑Gaming",
          "bullets": [
            "Only count users with a verified lab‑report file (PDF or API import).",
            "Subscription must be active (payment captured); free trials are excluded.",
            "User must log at least one meal or view a personalised score within 7 days; otherwise the record is discarded.",
            "Duplicate accounts or bots are filtered out by device‑fingerprinting."
          ]
        },
        {
          "body": "All growth‑related agents (Paid‑Acquisition Lead, Onboarding Product Manager, Data Analyst) share responsibility for the North Star.",
          "title": "Contribution to Goal & Ownership",
          "bullets": [
            "Paid‑Acquisition Lead – 40 % of the 500‑user target (200 APUs) – by day 30.",
            "Onboarding PM – 35 % (175 APUs) – by day 60, by improving upload & first‑week flow.",
            "Data Analyst – 25 % (125 APUs) – by day 90, through measurement, segmentation, and iterative optimisation."
          ]
        }
      ],
      "proposedNorthStar": "500 activated paid users within 90 days",
      "proposedGoalSystem": {
        "target": null,
        "baseline": null,
        "guardrails": [
          "Count only users with a verified lab‑report upload.",
          "Subscription must be active (payment captured).",
          "User must record at least one meal or view a personalised score within 7 days.",
          "Exclude free‑trial‑only sign‑ups and duplicate/bot accounts."
        ],
        "channel_bet": null,
        "metric_tree": [
          "Activated Paid Users (North Star)",
          "Lab‑Report Uploads → Subscription Conversions → First‑Week Active Usage"
        ],
        "primary_loop": [
          "Acquire → Lab Upload → Personalised Score → Subscribe → Ongoing Meal Logging"
        ],
        "priority_90d": "Acquire and activate paid users from the lab-upload funnel",
        "rejects_as_nsm": [
          "App downloads",
          "Free trial sign‑ups without payment",
          "Raw ad impressions or clicks",
          "Number of lab uploads without subsequent subscription",
          "Total revenue without activation context"
        ],
        "sectionTargets": [],
        "timeline_target": "90 days",
        "metric_definition": "One APU = a user who (1) uploads a lab‑report, (2) pays for a Nouriva AI subscription (monthly or yearly), and (3) logs at least one meal or views a personalised meal score within 7 days of subscription.",
        "north_star_metric": "Activated Paid Users (APU)",
        "quantified_target": "500 activated paid users",
        "business_archetype": "consumer_product",
        "measurement_period": null,
        "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) of $5,000 (≈500 users × $10) by month 6"
      }
    }
  ]
}
```
