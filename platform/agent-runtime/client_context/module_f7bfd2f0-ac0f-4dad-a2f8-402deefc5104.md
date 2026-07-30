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
    "metric_definition": "A user who (1) uploads a lab report, (2) subscribes to a paid plan (monthly or yearly), and (3) logs at least two meals within the first 7 days of subscription.",
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
      "positioning: {\"statement\":\"Food that fits your lab work, not just your macros.\",\"unique_value\":\"The first nutrition app that reads your lab report and knows your medical conditions.\"}",
      "icp: {\"company_size\":null,\"industry\":[\"nutrition\",\"healthtech\",\"wellness\"],\"geography\":[\"worldwide\"],\"role\":[\"individual consumers\",\"patients with chronic conditions\",\"health‑conscious adults\"]}",
      "competitors: [{\"name\":\"Nourli\",\"positioning\":\"AI‑photo nutrition tracker that emphasizes transparent pricing, confidence‑rated estimates, a personal coach, and a fasting timer, positioning itself as an “honest” alternative to pure calorie counters.\"},{\"name\":\"MyFitnessPal\",\"positioning\":\"Budget‑friendly calorie‑tracking app focused on extensive food database, barcode scanning, social motivation features and deep fitness‑device integrations, targeting users who want a simple, low‑cost solution.\"},{\"name\":\"Noom\",\"positioning\":\"Psychology‑driven weight‑loss platform that pairs human coaching with behavioral‑change programs (and optional telehealth/GLP‑1 support), positioning itself as a premium, guidance‑heavy alternative.\"},{\"name\":\"Cronometer\",\"positioning\":\"Highly detailed micronutrient‑focused tracker with a verified, lab‑analyzed food database, marketed toward health‑conscious users, athletes, and patients needing precise nutrient data.\"},{\"name\":\"Fay Nutrition\",\"positioning\":\"AI‑powered, insurance‑covered virtual nutrition care service that pairs dietitians with AI health agents for personalized, reimbursable nutrition counseling.\"}]",
      "offers: [{\"name\":\"Nouriva AI\",\"price_signal\":\"$9.99 / month\",\"tier\":\"Monthly\"},{\"name\":\"Nouriva AI\",\"price_signal\":\"$49.99 / year\",\"tier\":\"Yearly\"}]",
      "messaging: {\"headline\":\"Food that fits your lab work, not just your macros.\",\"tagline\":\"The first nutrition app that reads your lab report and knows your medical conditions.\",\"key_messages\":[\"Personalised meal scores for diabetes, PCOS, thyroid, hypertension, and 30+ more\",\"Lab report parsing integrated into meal guidance\",\"Organ‑level impact analysis for each meal\"]}",
      "channels: [{\"channel\":\"App Store\",\"evidence\":\"Download on theApp Store\"},{\"channel\":\"Google Play\",\"evidence\":\"Get it onGoogle Play\"}]",
      "funnel: {\"entry_points\":[\"App Store\",\"Google Play\",\"website\"],\"cta_primary\":\"Try everything. Pay if you stay.\"}",
      "content_pillars: [{\"topic\":\"Lab Reports\",\"evidence\":\"Your blood work, in the loop.\"},{\"topic\":\"Conditions\",\"evidence\":\"Scores that know your body.\"},{\"topic\":\"Organs\",\"evidence\":\"Beyond macros. See your organs.\"}]"
    ]
  },
  "goal_system": {
    "target": null,
    "baseline": null,
    "guardrails": [
      "Do not count users who subscribe but never upload a lab report",
      "Exclude users who churn before logging two meals",
      "Require a minimum of two distinct meal logs within 7 days to qualify as activated"
    ],
    "channel_bet": null,
    "metric_tree": [
      "Activated Paid Users",
      "Lab Report Uploads",
      "Subscription Conversions",
      "First‑Week Meal Logs",
      "30‑Day Retention"
    ],
    "primary_loop": [
      "Acquisition → Lab Upload → Subscription → Activation → Retention"
    ],
    "priority_90d": "Acquire and activate paid users from the lab‑upload funnel",
    "rejects_as_nsm": [
      "App downloads",
      "App installs",
      "Sign‑ups without lab upload",
      "Raw paid‑media clicks",
      "Impressions",
      "Leads",
      "Discovery calls"
    ],
    "sectionTargets": [],
    "timeline_target": "90 days",
    "metric_definition": "A user who (1) uploads a lab report, (2) subscribes to a paid plan (monthly or yearly), and (3) logs at least two meals within the first 7 days of subscription.",
    "north_star_metric": "Activated Paid Users (APU)",
    "quantified_target": "500 Activated Paid Users within 90 days",
    "business_archetype": "consumer_product",
    "measurement_period": null,
    "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) from paying users"
  },
  "control_loop": {
    "status": "pending",
    "cadence": {
      "principle": "Monitor continuously, optimize weekly, evaluate experiments biweekly, reallocate resources monthly, and rethink strategy quarterly.",
      "daily_review": [
        "Signups / installs",
        "Subscription Conversions",
        "First‑Week Meal Logs",
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
        "Do not count users who subscribe but never upload a lab report",
        "Exclude users who churn before logging two meals",
        "Require a minimum of two distinct meal logs within 7 days to qualify as activated",
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
        "Lab Report Uploads",
        "Subscription Conversions",
        "First‑Week Meal Logs",
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
    "updatedAt": "2026-07-30T10:44:32.290Z",
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
        "stage": "Activated Paid Users",
        "actual": null,
        "target": null,
        "finding": null
      },
      {
        "stage": "Lab Report Uploads",
        "actual": null,
        "target": null,
        "finding": null
      },
      {
        "stage": "Subscription Conversions",
        "actual": null,
        "target": null,
        "finding": null
      },
      {
        "stage": "First‑Week Meal Logs",
        "actual": null,
        "target": null,
        "finding": null
      },
      {
        "stage": "30‑Day Retention",
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
      "quantified_target": "500 Activated Paid Users within 90 days"
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
      "body": "The team should allocate the ₹5–20 L budget to paid acquisition that directly reaches individuals who have recent lab results, because they are primed for a lab‑report‑driven nutrition solution. Once users land on the app, the onboarding experience must lock them into a three‑step activation loop—upload, subscribe, and log two meals within the first week—to qualify as an Activated Paid User (APU). Guardrails must be enforced in real time to exclude subscriptions without lab uploads or users who churn before the two‑meal threshold, preserving metric integrity. Weekly dashboards should break the NSM into Lab Uploads, Subscription Conversions, First‑Week Meal Logs, and 30‑Day Retention, enabling rapid diagnosis and resource reallocation. A dedicated Growth Owner will track progress, with each APU contributing 0.2 % toward the 500‑user goal, and will trigger corrective actions if weekly attainment falls below 80 % of the plan. Continuous A/B testing of ad creative, landing‑page copy, and in‑app prompts will keep acquisition cost efficient while improving activation rates. Finally, a retention layer—weekly health insights, organ‑impact summaries, and a discounted yearly upgrade—will convert activated users into long‑term revenue, feeding the ultimate outcome metric of MRR.",
      "title": "Customer success & retention",
      "bullets": [
        "Launch targeted paid‑media campaigns aimed at recent lab‑report patients to feed the lab‑upload funnel.",
        "Optimize the onboarding flow to enforce a three‑step sequence: lab upload → subscription offer → two meal logs within 7 days.",
        "Deploy in‑app and email nudges that trigger when a user stalls at any step, reducing drop‑off.",
        "Implement real‑time dashboards that surface the NSM and its leading drivers, applying guardrails to exclude low‑quality users.",
        "Assign a Growth Owner to monitor weekly APU attainment; each activation represents 0.2 % of the 500‑user target.",
        "Run bi‑weekly experiments on creative, pricing prompts, and onboarding copy, iterating only after statistical significance.",
        "Establish a 30‑day retention program (weekly health insights, organ‑impact reports, upgrade incentives) to lift long‑term MRR."
      ],
      "channel": "#customer-success",
      "summary": "Focus on converting lab‑report owners into paying, engaged users and retaining them beyond the first month to drive sustainable MRR.",
      "subsections": [
        {
          "body": "Leverage Meta and Google paid‑media to target health‑conscious adults who have recently completed lab work. Creative assets should highlight the unique lab‑report parsing capability and the $9.99 / month price point.",
          "title": "Acquisition Strategy",
          "bullets": [
            "Target look‑alike audiences based on existing health‑app users",
            "Use carousel ads showcasing condition‑specific meal scores",
            "Allocate 60 % of budget to prospecting, 40 % to retargeting lab‑upload visitors"
          ]
        },
        {
          "body": "Redesign the onboarding funnel into three measurable steps: (1) Lab report upload, (2) Subscription offer, (3) First‑week meal logging. Each step must be completed before a user is counted as an Activated Paid User.",
          "title": "Activation Flow Optimization",
          "bullets": [
            "Add a progress bar indicating “Upload → Subscribe → Log Meals”",
            "Offer a 7‑day free trial that converts to paid after two logged meals",
            "Trigger push/email reminders if a user stalls after upload"
          ]
        },
        {
          "body": "After activation, keep users engaged through weekly health insights, organ‑level impact reports, and a premium yearly plan that bundles personalized coaching.",
          "title": "Retention & Upsell",
          "bullets": [
            "Send weekly organ‑impact newsletters",
            "Introduce a 20 % discount for yearly upgrades after 30 days of active use",
            "Track 30‑day retention as a leading indicator of long‑term MRR"
          ]
        },
        {
          "body": "Deploy a real‑time dashboard that breaks down the NSM into its leading drivers and enforces guardrails to prevent low‑quality counting.",
          "title": "Metrics & Governance",
          "bullets": [
            "North Star: Activated Paid Users (APU)",
            "Leading drivers: Lab Uploads, Subscription Conversions, First‑Week Meal Logs, 30‑Day Retention",
            "Guardrails: exclude users who churn <7 days or never log a meal"
          ]
        }
      ],
      "proposedNorthStar": "500 Activated Paid Users within 90 days",
      "proposedGoalSystem": {
        "target": null,
        "baseline": null,
        "guardrails": [
          "Do not count users who subscribe but never upload a lab report",
          "Exclude users who churn before logging two meals",
          "Require a minimum of two distinct meal logs within 7 days to qualify as activated"
        ],
        "channel_bet": "Paid acquisition",
        "metric_tree": [
          "Activated Paid Users",
          "Lab Report Uploads",
          "Subscription Conversions",
          "First‑Week Meal Logs",
          "30‑Day Retention"
        ],
        "primary_loop": [
          "Acquisition → Lab Upload → Subscription → Activation → Retention"
        ],
        "priority_90d": "Acquire and activate paid users from the lab‑upload funnel",
        "rejects_as_nsm": [
          "App downloads",
          "App installs",
          "Sign‑ups without lab upload",
          "Raw paid‑media clicks",
          "Impressions",
          "Leads",
          "Discovery calls"
        ],
        "sectionTargets": [],
        "timeline_target": "90 days",
        "metric_definition": "A user who (1) uploads a lab report, (2) subscribes to a paid plan (monthly or yearly), and (3) logs at least two meals within the first 7 days of subscription.",
        "north_star_metric": "Activated Paid Users (APU)",
        "quantified_target": "500 Activated Paid Users within 90 days",
        "business_archetype": "consumer_product",
        "measurement_period": null,
        "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) from paying users"
      }
    },
    {
      "id": "operations_execution",
      "body": "Marqq should coordinate acquisition, activation, and retention agents around the single North Star Metric of Activated Paid Users. The metric definition requires a lab report upload, a paid subscription, and at least two meal logs within the first week, ensuring true product value adoption. Agents must focus on the metric tree—Lab Report Uploads, Subscription Conversions, First‑Week Meal Logs, and 30‑Day Retention—while respecting guardrails that exclude low‑quality counts. Weekly dashboards will break down performance by each driver, enabling rapid diagnosis and resource reallocation. The Growth Owner will track each APU’s 0.2 % share of the 500‑user target and enforce weekly corrective loops. Retention initiatives (weekly health insights, organ‑impact reports, yearly upgrade incentives) will convert activated users into sustainable MRR, the ultimate outcome metric.",
      "title": "Operations & execution",
      "bullets": [
        "Launch paid‑media campaigns targeting recent lab‑report patients to feed the lab‑upload funnel",
        "Redesign onboarding into three measurable steps: lab upload → subscription → two meal logs in 7 days",
        "Implement real‑time dashboards that surface APU and its leading drivers with strict guardrails",
        "Assign a Growth Owner to monitor weekly APU contribution (0.2 % per user) and trigger corrective actions if weekly attainment < 80 % of plan"
      ],
      "channel": "#operations-execution",
      "summary": "Align all Marqq agents to drive Activated Paid Users (APU) through a disciplined acquisition‑activation‑retention loop that directly fuels revenue growth.",
      "subsections": [
        {
          "body": "Deploy Meta and Google paid‑media to reach health‑conscious adults who have recently completed lab work. Creative should spotlight the unique lab‑report parsing capability and the $9.99 / month price point.",
          "title": "Acquisition Engine",
          "bullets": [
            "Target look‑alike audiences based on health‑app users and recent lab‑test keywords",
            "Use carousel ads showing condition‑specific meal scores",
            "Allocate 60 % budget to prospecting, 40 % to retargeting lab‑upload visitors"
          ]
        },
        {
          "body": "Re‑engineer the onboarding flow into a three‑step, measurable sequence: (1) Lab report upload, (2) Subscription offer, (3) First‑week meal logging. Each step must be completed before a user counts as an APU.",
          "title": "Activation Funnel Optimization",
          "bullets": [
            "Add a progress bar visualizing “Upload → Subscribe → Log Meals”",
            "Offer a 7‑day free trial that auto‑converts after two logged meals",
            "Trigger push/email nudges if a user stalls after upload"
          ]
        },
        {
          "body": "After activation, keep users engaged with weekly organ‑impact insights, personalized health tips, and a discounted yearly plan that bundles coaching.",
          "title": "Retention & Revenue Upsell",
          "bullets": [
            "Send weekly organ‑impact newsletters tied to logged meals",
            "Introduce a 20 % discount for yearly upgrades after 30 days of active use",
            "Track 30‑day retention as a leading indicator for MRR growth"
          ]
        },
        {
          "body": "Deploy a real‑time dashboard that breaks down the North Star into its leading drivers and enforces strict eligibility rules to prevent metric inflation.",
          "title": "Metrics Governance & Guardrails",
          "bullets": [
            "North Star: Activated Paid Users (APU)",
            "Leading drivers: Lab Uploads, Subscription Conversions, First‑Week Meal Logs, 30‑Day Retention",
            "Guardrails: exclude users who churn < 7 days or never log a meal; require two distinct meal logs within 7 days"
          ]
        }
      ],
      "proposedNorthStar": "500 Activated Paid Users within 90 days",
      "proposedGoalSystem": {
        "target": null,
        "baseline": null,
        "guardrails": [
          "Do not count users who subscribe but never upload a lab report",
          "Exclude users who churn before logging two meals",
          "Require a minimum of two distinct meal logs within 7 days to qualify as activated"
        ],
        "channel_bet": null,
        "metric_tree": [
          "Activated Paid Users",
          "Lab Report Uploads",
          "Subscription Conversions",
          "First‑Week Meal Logs",
          "30‑Day Retention"
        ],
        "primary_loop": [
          "Acquisition → Lab Upload → Subscription → Activation → Retention"
        ],
        "priority_90d": "Acquire and activate paid users from the lab‑upload funnel",
        "rejects_as_nsm": [
          "App downloads",
          "App installs",
          "Sign‑ups without lab upload",
          "Raw paid‑media clicks",
          "Impressions",
          "Leads",
          "Discovery calls"
        ],
        "sectionTargets": [],
        "timeline_target": "90 days",
        "metric_definition": "A user who (1) uploads a lab report, (2) subscribes to a paid plan (monthly or yearly), and (3) logs at least two meals within the first 7 days of subscription.",
        "north_star_metric": "Activated Paid Users (APU)",
        "quantified_target": "500 Activated Paid Users within 90 days",
        "business_archetype": "consumer_product",
        "measurement_period": null,
        "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) from paying users"
      }
    },
    {
      "id": "financial_plan",
      "body": "Nouriva AI’s core value is delivering medically‑personalised nutrition guidance, which only materialises when a user uploads a lab report, pays for the service, and actively uses the meal‑scoring engine. The North Star Metric (NSM) therefore tracks “Activated Paid Users” – a high‑intent, high‑value cohort that validates the product‑market fit. Over the next 90 days the team will allocate the ₹5–20 L budget to paid acquisition, optimise the onboarding flow, and enforce quality guardrails so that every counted user demonstrates genuine engagement. Success will be measured against a concrete target of 500 APU, with leading‑indicator dashboards for lab uploads, subscription conversions, and first‑week meal logs. Continuous iteration on ad creatives, landing‑page copy, and in‑app prompts will keep the funnel efficient while protecting against low‑quality volume. The ultimate financial health will be reflected in rising MRR and 30‑day retention, which are tracked as longer‑term outcome metrics.",
      "title": "Financial plan",
      "bullets": [
        "Launch a paid‑media acquisition campaign focused on lab‑report owners",
        "Implement a 2‑step onboarding: lab upload → subscription offer",
        "Require two meal logs within 7 days to count as an activated user",
        "Deploy in‑app nudges and email sequences to boost first‑week usage",
        "Set up real‑time dashboards to monitor each funnel stage and enforce guardrails"
      ],
      "channel": "#financial-plan",
      "summary": "Drive 500 activated paid users in 90 days by tightening the lab‑upload‑to‑subscription funnel and ensuring early product engagement.",
      "subsections": [
        {
          "body": "Leverage Meta and Google paid‑media to reach health‑conscious adults who have recently completed lab work. Creative assets should spotlight the unique lab‑report parsing capability and the $9.99/month price point.",
          "title": "Acquisition Tactics",
          "bullets": [
            "Target look‑alike audiences based on existing health‑app users",
            "Use carousel ads that showcase condition‑specific meal scores",
            "Allocate 60% of budget to prospecting, 40% to retargeting lab‑upload visitors"
          ]
        },
        {
          "body": "Redesign the onboarding funnel into three measurable steps: (1) Lab report upload, (2) Subscription offer, (3) First‑week meal logging. Each step must be completed before a user is counted as an Activated Paid User.",
          "title": "Activation Flow Optimization",
          "bullets": [
            "Add a progress bar indicating “Upload → Subscribe → Log Meals”",
            "Offer a 7‑day free trial that converts to paid after two logged meals",
            "Trigger push/email reminders if a user stalls after upload"
          ]
        },
        {
          "body": "After activation, keep users engaged through weekly health insights, organ‑level impact reports, and a premium yearly plan that bundles personalized coaching.",
          "title": "Retention & Upsell",
          "bullets": [
            "Send weekly organ‑impact newsletters",
            "Introduce a 20% discount for yearly upgrades after 30 days of active use",
            "Track 30‑day retention as a leading indicator of long‑term MRR"
          ]
        },
        {
          "body": "Deploy a real‑time dashboard that breaks down the NSM into its leading drivers and enforces guardrails to prevent low‑quality counting.",
          "title": "Metrics & Reporting",
          "bullets": [
            "North Star: Activated Paid Users (APU)",
            "Leading drivers: Lab Uploads, Subscription Conversions, First‑Week Meal Logs, 30‑Day Retention",
            "Guardrails: exclude users who churn <7 days or never log a meal"
          ]
        }
      ],
      "proposedNorthStar": "500 Activated Paid Users within 90 days",
      "proposedGoalSystem": {
        "target": null,
        "baseline": null,
        "guardrails": [
          "Do not count users who subscribe but never upload a lab report",
          "Exclude users who churn before logging two meals",
          "Require a minimum of two distinct meal logs within 7 days to qualify as activated"
        ],
        "channel_bet": null,
        "metric_tree": [
          "Activated Paid Users",
          "Lab Report Uploads",
          "Subscription Conversions",
          "First‑Week Meal Logs",
          "30‑Day Retention"
        ],
        "primary_loop": [
          "Acquisition → Lab Upload → Subscription → Activation → Retention"
        ],
        "priority_90d": "Acquire and activate paid users from the lab-upload funnel",
        "rejects_as_nsm": [
          "App downloads",
          "App installs",
          "Sign‑ups without lab upload",
          "Raw paid‑media clicks",
          "Impressions",
          "Leads",
          "Discovery calls"
        ],
        "sectionTargets": [],
        "timeline_target": "90 days",
        "metric_definition": "A user who (1) uploads a lab report, (2) subscribes to a paid plan (monthly or yearly), and (3) logs at least two meals within the first 7 days of subscription.",
        "north_star_metric": "Activated Paid Users (APU)",
        "quantified_target": "500 Activated Paid Users within 90 days",
        "business_archetype": "consumer_product",
        "measurement_period": null,
        "ultimate_outcome_metric": "Monthly Recurring Revenue (MRR) from paying users"
      }
    }
  ]
}
```
