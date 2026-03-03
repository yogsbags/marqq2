# Martech AI Platform – Running Cost Estimates

**Last updated:** February 2026
**Currency:** USD (monthly unless noted)
**Scope:** Per-module cost estimates for external APIs, hosting, and storage. Does not include labor, licenses, or one-time setup.

---

## Assumptions

| Assumption                                | Low                               | Medium     | High         |
| ----------------------------------------- | --------------------------------- | ---------- | ------------ |
| **Monthly active users (MAU)**            | 500                               | 5,000      | 25,000       |
| **LLM calls (Groq/Gemini)**               | ~2M input + 0.5M output tokens/mo | ~15M + 4M  | ~60M + 15M   |
| **Video minutes (HeyGen/Fal/Veo)**        | 30 min/mo                         | 200 min/mo | 1,000 min/mo |
| **Voice bot minutes (LiveKit + STT/TTS)** | 100 min/mo                        | 500 min/mo | 2,500 min/mo |
| **Budget optimization analyses**          | 50/mo                             | 300/mo     | 1,200/mo     |
| **Content workflow runs**                 | 5 full runs/mo                    | 25/mo      | 100/mo       |

Pricing below uses **Medium** as the baseline; Low/High are proportional where usage-based.

---

## Shared Platform Costs (apply across modules)

| Service               | Purpose                              | Low   | Medium | High     | Notes                                                           |
| --------------------- | ------------------------------------ | ----- | ------ | -------- | --------------------------------------------------------------- |
| **Supabase**          | Auth, DB, realtime                   | $0–25 | $25–75 | $75–200  | Pro $25 base; overage for storage/egress/compute                |
| **Railway**           | Backend (Node API, workflow)         | $5–15 | $20–50 | $50–150  | Hobby $5 min; Pro $20 min; usage-based CPU/RAM/egress           |
| **Netlify / static**  | Frontend hosting                     | $0–19 | $19–99 | $99+     | Free tier for static; Pro for serverless/bandwidth              |
| **Groq (baseline)**   | Primary LLM (chat, agents, analysis) | $5–15 | $30–80 | $120–350 | ~$0.59/1M in, $0.79/1M out (Llama 3.3 70B); compound may differ |
| **Gemini (fallback)** | Fallback LLM, some video             | $2–10 | $15–60 | $80–250  | ~$1.25/1M in, $10/1M out (Gemini 2.5 Pro); Veo separate         |

**Shared subtotal (Medium):** ~\$110–320/mo (before module-specific usage).

---

## Per-Module Cost Estimates

### 1. Lead Intelligence Flow

| Cost driver          | Service                   | Low      | Medium      | High        |
| -------------------- | ------------------------- | -------- | ----------- | ----------- |
| Lead scoring / ICP   | Groq                      | $2–8     | $10–30      | $40–120     |
| Enrichment (planned) | Apollo / Apify / LinkedIn | $0       | $50–150     | $200–500    |
| **Module subtotal**  |                           | **$2–8** | **$10–180** | **$40–620** |

_Note: Apollo/Apify/LinkedIn are documented but not yet implemented; costs are placeholder for when enabled._

---

### 2. Social Media Flow

| Cost driver          | Service      | Low         | Medium       | High           |
| -------------------- | ------------ | ----------- | ------------ | -------------- |
| Content ideas / copy | Groq         | $3–10       | $15–40       | $60–160        |
| Video (avatars)      | HeyGen       | $30–99      | $99–330      | $330–500       |
| Video (clip gen)     | Fal AI / Veo | $20–90      | $100–400     | $500–1,500     |
| **Module subtotal**  |              | **$53–199** | **$214–770** | **$890–2,160** |

_HeyGen ~\$0.50–1/min (Scale/Pro); Fal/Veo ~\$0.10–0.75/sec depending on model/resolution._

---

### 3. Video Generation Flow

| Cost driver           | Service              | Low         | Medium         | High             |
| --------------------- | -------------------- | ----------- | -------------- | ---------------- |
| Long-form video       | Google Veo 3.1 / Fal | $30–150     | $150–600       | $600–2,000       |
| Avatar / spokesperson | HeyGen               | $30–99      | $99–330        | $330–500         |
| Editing / compositing | Shotstack            | $10–40      | $40–150        | $150–400         |
| Enhancement           | Replicate            | $5–25       | $25–100        | $100–300         |
| **Module subtotal**   |                      | **$75–314** | **$314–1,180** | **$1,180–3,200** |

_Veo/Fal per-second pricing; Shotstack/Replicate per render._

---

### 4. AI Voice Bot Flow

| Cost driver         | Service           | Low        | Medium      | High         |
| ------------------- | ----------------- | ---------- | ----------- | ------------ |
| Real-time room      | LiveKit Cloud     | $5–20      | $20–80      | $80–250      |
| Speech-to-text      | Deepgram          | $5–15      | $15–50      | $50–150      |
| Text-to-speech      | Cartesia / OpenAI | $2–10      | $10–40      | $40–120      |
| **Module subtotal** |                   | **$12–45** | **$45–170** | **$170–520** |

_LiveKit: usage-based bandwidth + compute; Deepgram/Cartesia: per minute._

---

### 5. Company Intelligence Flow

| Cost driver                 | Service                       | Low      | Medium      | High         |
| --------------------------- | ----------------------------- | -------- | ----------- | ------------ |
| Company / firmographic data | Clearbit / LinkedIn (planned) | $0       | $50–200     | $200–600     |
| LLM summarization           | Groq                          | $2–8     | $10–30      | $40–100      |
| **Module subtotal**         |                               | **$2–8** | **$60–230** | **$240–700** |

_External enrichment is planned; actual cost depends on provider and volume._

---

### 6. Unified Customer View

| Cost driver         | Service                       | Low      | Medium    | High       |
| ------------------- | ----------------------------- | -------- | --------- | ---------- |
| DB / storage        | Supabase (included in shared) | —        | —         | —          |
| Aggregation logic   | Groq (light)                  | $1–5     | $5–20     | $20–80     |
| **Module subtotal** |                               | **$1–5** | **$5–20** | **$20–80** |

_Most cost is Supabase (shared); LLM only if used for insights/summaries._

---

### 7. Budget Optimization Flow

| Cost driver                            | Service | Low       | Medium     | High         |
| -------------------------------------- | ------- | --------- | ---------- | ------------ |
| Analyze (RCA, plan, creative insights) | Groq    | $5–15     | $25–75     | $100–300     |
| **Module subtotal**                    |         | **$5–15** | **$25–75** | **$100–300** |

_One Groq call per analysis; ~2–4K tokens out per run. Cache reduces repeat cost._

---

### 8. Performance Scorecard

| Cost driver                  | Service                   | Low      | Medium     | High        |
| ---------------------------- | ------------------------- | -------- | ---------- | ----------- |
| Connectors (GA4, Meta, etc.) | Own APIs / no direct cost | $0       | $0         | $0          |
| LLM summarization (if used)  | Groq                      | $2–8     | $10–30     | $40–100     |
| **Module subtotal**          |                           | **$2–8** | **$10–30** | **$40–100** |

_Scorecard is mostly connector + UI; LLM only if narrative/summaries are generated._

---

### 9. AI Content / SEO (Enhanced Bulk Generator)

| Cost driver                | Service                      | Low         | Medium       | High           |
| -------------------------- | ---------------------------- | ----------- | ------------ | -------------- |
| Research (Stage 1–3)       | Groq, optional Gemini/OpenAI | $15–50      | $80–250      | $300–800       |
| Content creation (Stage 4) | Groq, GPT-4o fallback        | $20–80      | $100–400     | $400–1,200     |
| SEO / validation           | Groq                         | $5–20       | $25–100      | $100–300       |
| **Module subtotal**        |                              | **$40–150** | **$205–750** | **$800–2,300** |

_Assumes multiple full 7-stage runs; Groq is primary, fallbacks add cost._

---

### 10. SEO/LLMO Module

| Cost driver             | Service                     | Low       | Medium     | High        |
| ----------------------- | --------------------------- | --------- | ---------- | ----------- |
| Keyword / SERP analysis | Groq + optional search APIs | $3–12     | $15–50     | $50–150     |
| **Module subtotal**     |                             | **$3–12** | **$15–50** | **$50–150** |

---

## Summary: Total Estimated Monthly Run Cost

| Tier       | Shared platform | Modules (sum) | **Total (approx)** |
| ---------- | --------------- | ------------- | ------------------ |
| **Low**    | $12–69          | $155–764      | **$170–830**       |
| **Medium** | $110–320        | $658–2,325    | **$770–2,650**     |
| **High**   | $325–1,000      | $2,970–8,530  | **$3,300–9,500**   |

_Shared platform includes Supabase, Railway, Netlify, baseline Groq/Gemini. Module sums are from the tables above; overlap (e.g. Groq used by multiple modules) is included once in shared or in the module that drives the bulk of that usage._

---

## Cost Optimization Tips

1. **Groq** – Primary LLM; keep high-volume flows on Groq and use Gemini/OpenAI only as fallback to cap cost.
2. **Caching** – Budget Optimization and repeat analyses already use response cache; extend caching for research/content where inputs repeat.
3. **Video** – Use HeyGen for avatar minutes; use Fal/Veo for short clips only; set caps per campaign or user.
4. **Voice bot** – Set session limits and timeouts; use LiveKit’s usage dashboard to catch spikes.
5. **Supabase** – Stay on Pro and monitor storage/egress; add compute only if needed.
6. **Railway** – Right-size backend (single service often fits Hobby/Pro); scale only if workflow concurrency grows.

---

## Pricing Sources (reference)

| Provider | Source                    | Notes                                     |
| -------- | ------------------------- | ----------------------------------------- |
| Groq     | groq.com/pricing          | Llama 3.3 70B: input/output per 1M tokens |
| Gemini   | ai.google.dev/pricing     | Gemini 2.5 Pro; Veo priced separately     |
| HeyGen   | heygen.com/api-pricing    | Credit-based; ~1 credit = 1 min video     |
| Fal AI   | fal.ai/pricing            | Per-second video; model-dependent         |
| LiveKit  | livekit.io/pricing        | Usage-based bandwidth + compute           |
| Supabase | supabase.com/docs/billing | Pro $25 + overages                        |
| Railway  | railway.app/pricing       | Hobby $5 / Pro $20 min + usage            |

_Rates may change; confirm on provider sites before budgeting._

---

_This document is for planning only. Actual costs depend on usage, region, and provider pricing at the time of use._
