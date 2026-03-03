# Torqq AI — Platform Architecture, Infrastructure & Pricing Design

**Date**: 2026-02-24
**Status**: Living Document — decisions locked, implementation pending
**Scope**: Business model, multi-tenant architecture, infrastructure stack, credits-based billing

---

## 1. Business Model — 3-Tier White-Label SaaS

### Entity Structure

```
productverse.in          ← Owner / Operator (you)
    │
    ├── torqq.ai         ← White-label Partner A
    │       └── End Clients (torqq sells to)
    │
    ├── elevate.co.in    ← White-label Partner B
    │       └── End Clients (elevate sells to)
    │
    └── productverse.in  ← Also sells direct to End Clients
```

### Role Definitions

| Role | Who | Relationship |
|---|---|---|
| **Owner** | productverse.in (you) | Operates platform, sets master pricing, manages partner onboarding |
| **Partner** | torqq.ai, elevate.co.in | White-label resellers — buy credits/seats in bulk, sell to end clients under their brand |
| **End Client** | SMBs, startups, agencies | Pay partners (or productverse directly) for access to the martech platform |

### Revenue Flows

```
End Client → pays Partner (torqq/elevate)     [partner sets own price]
Partner    → pays productverse.in             [wholesale credits rate]
End Client → pays productverse.in directly    [retail credits rate]
```

**Partner margin example**: You sell credits to partners at ₹0.08/credit. Partners sell to end clients at ₹0.15/credit. Partner keeps ₹0.07/credit margin. You keep ₹0.08 regardless.

---

## 2. Multi-Tenant Architecture

### Database Isolation Strategy

**Recommended: Shared Supabase per partner tier** (not one global Supabase)

```
productverse Supabase (owner DB)
├── partners table           ← torqq, elevate records
├── partner_credits table    ← bulk credit pool per partner
└── audit_log table          ← cross-partner visibility

torqq.ai Supabase (partner DB — separate project)
├── end_clients table        ← torqq's end clients only
├── user_plans table
├── credits_wallet table
├── credits_ledger table
└── all feature tables

elevate.co.in Supabase (partner DB — separate project)
└── same schema as torqq DB
```

**Why separate Supabase per partner:**
- Full data isolation (financial/martech compliance)
- Partners can't see each other's client data
- Each partner gets their own Supabase dashboard
- Cost: ~$25/month per partner Supabase project (pass-through to partner)
- Productverse owner DB is free tier (low volume, just partner management)

### Workspace Isolation (Filesystem / Storage)

All AI agent workspaces and generated content scoped by:
```
/workspace/{partner_id}/{client_id}/
    ├── memory/
    ├── agents/
    └── output/
```

### Tenant Scoping in Code

Every API call and DB query must include tenant context:
```typescript
// All queries scoped to current user's partner
const { data } = await supabase
  .from('credits_wallet')
  .select('*')
  .eq('user_id', auth.user.id)  // RLS handles this automatically
```

Supabase Row Level Security (RLS) enforces tenant boundaries at DB level — no data leaks possible even with code bugs.

---

## 3. Infrastructure Stack

### Current Stack (0–5 tenants / MVP phase)

```
Frontend (React/Vite)     → Railway          ~$5–10/month
Backend (Node.js)         → Railway          ~$10–20/month
Supabase                  → Free/Pro tier    $0–25/month
Groq API                  → Pay-per-token    $10–30/month (all agents)
Domain/CDN                → Cloudflare       Free
```

**Total MVP infra cost**: ~$25–85/month

### Railway Pricing Reference

| Resource | Rate | Monthly estimate |
|---|---|---|
| vCPU | $0.00000772/vCPU/sec | ~$20/vCPU |
| RAM | $0.00000386/GB/sec | ~$10/GB |
| 1 Railway service (0.5vCPU, 512MB) | — | ~$12–15/month |

For MVP: 2 services (frontend + backend) ≈ $25–30/month Railway bill.

### Scale-Out Stack (5+ partners / Production phase)

```
Frontend (React/Vite)     → Cloudflare Pages    Free (unlimited bandwidth)
Edge Routing (multi-brand)→ Cloudflare Workers  ~$5/month (100M req/month free)
Backend (Node.js)         → Coolify (self-host)  ~€13/month (Hetzner CX31)
DB per partner            → Supabase (per proj)  $25/partner/month
Groq API                  → Pay-per-token        ~$10–30/month per tenant
```

**Why Cloudflare Pages over Vercel for frontend:**
- No Next.js migration needed (app is Vite/React)
- Unlimited bandwidth free
- Cloudflare Workers handle multi-tenant routing (one deployment, N domains)
- No seat-based pricing like Vercel Pro ($20/seat/month)

**Why Coolify over Railway at scale:**
- Open-source self-hosted PaaS (free forever)
- Runs on Hetzner CX31 (€13/month = ~₹1,200/month)
- Handles Docker + env vars + deployments like Railway
- Break-even vs Railway at ~2–3 active tenants

### Multi-Brand Frontend Routing (Cloudflare Workers)

```javascript
// Cloudflare Worker — routes by hostname to right partner config
addEventListener('fetch', event => {
  const hostname = new URL(event.request.url).hostname;
  const partner = PARTNER_MAP[hostname]; // { torqq.ai: 'torqq', elevate.co.in: 'elevate' }
  // Injects partner theme + Supabase URL into the same Vite build
  event.respondWith(handleRequest(event.request, partner));
});
```

One Vite build, N partner brands — no separate deployments per partner.

---

## 4. AI Running Costs

### Groq Pricing Reference

| Model | Input | Output | Blended |
|---|---|---|---|
| llama-3.3-70b-versatile | $0.59/M tokens | $0.79/M tokens | ~$0.67/M |
| llama-3.1-8b-instant | $0.05/M tokens | $0.08/M tokens | ~$0.06/M |

### 6-Agent Autonomous System — Monthly Token Estimate

| Agent | Schedule | Tokens/run | Monthly tokens |
|---|---|---|---|
| SEO Monitor | Daily | ~4,000 | ~120K |
| Content Planner | 3×/week | ~6,000 | ~78K |
| Lead Scout | Daily | ~5,000 | ~150K |
| Campaign Analyzer | Weekly | ~8,000 | ~32K |
| Competitor Watcher | Daily | ~4,000 | ~120K |
| GTM Advisor | On-demand | ~6,000 | ~60K est. |
| **Total** | | | **~560K/month** |

**Conservative Groq cost**: 560K × $0.67/M = **~$0.37/month baseline**
**With 3–5× buffer** (richer prompts, tool calls, retries): **$5–15/tenant/month**

### Cost Clarification
The $10–30/month Groq estimate is the **total monthly bill across all agents combined** — not per agent run.
A single agent run costs roughly $0.001–$0.004 (1,500–6,000 tokens at blended rate).

---

## 5. Credits-Based Billing System (Approach A — Credits-First)

### Core Concept

Everything is credits. Plans define how many credits a user starts with and at what price. There is no separate "feature access" gate — if you have credits, you can use any feature.

```
User signs up → assigned free credits (e.g., 500)
User upgrades → purchases plan → granted credit pool
User runs out → tops up via wallet recharge
Lifetime user → one-time payment → large non-expiring credit grant
```

### Credit Economy

**Credit costs per feature** (example values — adjust for margin):

| Feature | Credits consumed |
|---|---|
| Chat / AI query | 2 credits |
| GTM Strategy generation | 20 credits |
| Content piece (bulk gen) | 10 credits |
| Lead enrichment (1 lead) | 5 credits |
| Budget optimization analysis | 15 credits |
| Video generation (1 clip) | 50 credits |
| Social media campaign plan | 10 credits |
| Company intelligence report | 8 credits |

**Credit packs / Plans** (example pricing in INR):

| Plan | Type | Price | Credits | Notes |
|---|---|---|---|---|
| Free | Free | ₹0 | 500 credits | On signup, no expiry |
| Starter | Monthly | ₹999/mo | 5,000 credits/mo | Razorpay subscription |
| Pro | Monthly | ₹2,499/mo | 15,000 credits/mo | Razorpay subscription |
| Growth | Annual | ₹19,999/yr | 20,000 credits/mo | ~33% savings vs monthly |
| **Lifetime** | One-time | ₹14,999 | 1,00,000 credits | Never expires, one Razorpay order |
| Top-up S | Add-on | ₹499 | 2,500 credits | Wallet recharge, never expires |
| Top-up M | Add-on | ₹999 | 6,000 credits | 20% bonus vs S |
| Top-up L | Add-on | ₹1,999 | 15,000 credits | 25% bonus vs S |

**Lifetime deal logic**: 1,00,000 credits at ₹14,999 = ₹0.15/credit. Your Groq cost per credit is roughly ₹0.04–0.06. ~3× margin. Sustainable.

### Razorpay Integration Points

```
1. Monthly Plan    → Razorpay Subscription (auto-renew)
                     → Webhook: subscription.charged → refill credits

2. Annual Plan     → Razorpay Subscription (annual)
                     → Webhook: subscription.charged → grant 12mo credits

3. Lifetime Deal   → Razorpay Order (one-time)
                     → Webhook: payment.captured → grant lifetime credits

4. Top-up / Wallet → Razorpay Order (one-time)
                     → Webhook: payment.captured → add credits to wallet
```

All payments verified via **Razorpay signature verification** before credits are granted (never trust frontend).

### Database Schema (Supabase)

```sql
-- Tracks which plan a user is on
CREATE TABLE user_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL, -- 'free' | 'starter' | 'pro' | 'growth' | 'lifetime'
  billing_cycle TEXT,       -- 'monthly' | 'annual' | 'lifetime' | null (free)
  credits_per_cycle INTEGER, -- credits granted each renewal
  razorpay_subscription_id TEXT,  -- null for lifetime/free/topup
  razorpay_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'cancelled' | 'expired'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ, -- null for lifetime
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_active_plan UNIQUE (user_id)
);

-- Current credit balance per user
CREATE TABLE credits_wallet (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Every credit event (append-only ledger)
CREATE TABLE credits_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount INTEGER NOT NULL,        -- positive = credit in, negative = debit out
  balance_after INTEGER NOT NULL, -- wallet balance after this transaction
  type TEXT NOT NULL,             -- 'signup_grant' | 'plan_grant' | 'topup' | 'usage' | 'refund' | 'bonus'
  description TEXT,               -- human-readable: "GTM Strategy generation"
  feature TEXT,                   -- feature key: "gtm_strategy" | "content_gen" | "lead_enrich"
  reference_id TEXT,              -- Razorpay payment_id or internal run_id
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Razorpay payment records
CREATE TABLE razorpay_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount_paise INTEGER NOT NULL,  -- amount in paise (₹1 = 100 paise)
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_type TEXT NOT NULL,     -- 'lifetime' | 'topup' | 'subscription'
  plan_type TEXT,                 -- which plan/pack was purchased
  credits_granted INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed' | 'refunded'
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit cost config (editable without deploys)
CREATE TABLE credit_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature TEXT NOT NULL UNIQUE,   -- 'gtm_strategy' | 'content_gen' | etc.
  credits INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies

All tables get RLS: users can only see/write their own rows. Admin service-role key used server-side for webhook handlers (bypasses RLS safely).

```sql
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE razorpay_payments ENABLE ROW LEVEL SECURITY;

-- Users read own data
CREATE POLICY "own_data" ON user_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON credits_wallet FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON credits_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON razorpay_payments FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE from client — all writes via service-role server
```

### API Routes (Backend)

```
POST /api/billing/create-order
  body: { type: 'lifetime' | 'topup' | 'plan', pack: 'topup_m' }
  → Creates Razorpay order, returns { order_id, amount, currency, key_id }

POST /api/billing/verify-payment
  body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
  → Verifies HMAC signature, updates DB, grants credits

POST /api/billing/webhook
  → Razorpay webhook handler (subscription events)
  → Handles: subscription.charged, payment.captured, subscription.cancelled

GET /api/billing/wallet
  → Returns { balance, lifetime_earned, lifetime_spent, plan_type }

POST /api/billing/deduct
  body: { feature: 'gtm_strategy', description: 'GTM Strategy generated' }
  → Server-side credit deduction (never from client)
  → Returns { success, balance_after, credits_deducted }

GET /api/billing/history?page=1&limit=20
  → Returns paginated credits_ledger for the user
```

### Frontend Components Needed

```
src/components/billing/
├── PricingPage.tsx          ← Plans grid + lifetime card + comparison table
├── WalletPanel.tsx          ← Balance display + top-up button + transaction history
├── CreditBadge.tsx          ← Header badge showing current balance
├── TopUpModal.tsx           ← Pack selection + Razorpay checkout
├── UsageHistoryTable.tsx    ← Paginated ledger view
└── PlanUpgradeModal.tsx     ← Plan comparison + upgrade CTA
```

### Credit Guard Pattern (Feature Gating)

```typescript
// hooks/useCredits.ts
export function useCredits() {
  const deduct = async (feature: string, description: string) => {
    const res = await fetch('/api/billing/deduct', {
      method: 'POST',
      body: JSON.stringify({ feature, description })
    });
    if (!res.ok) throw new InsufficientCreditsError();
    return res.json(); // { balance_after, credits_deducted }
  };

  return { deduct };
}

// Usage in any feature component:
const { deduct } = useCredits();

const handleGenerateGTM = async () => {
  await deduct('gtm_strategy', 'GTM Strategy generation');  // deducts first
  await generateGtmStrategy(answers);                        // then runs AI
};
```

**Key rule**: Always deduct credits server-side before running the AI call. If AI fails, refund via a `refund` ledger entry.

---

## 6. Lifetime Deal — Implementation Notes

### Why Lifetime Works at This Stage

- Pre-sells infrastructure before you hit scale costs
- Builds committed user base for feedback loop
- At ₹14,999 × 50 users = ₹7.5L revenue upfront
- 1,00,000 credits / user ÷ avg 500 credits/month usage = 200 months of usage
- Your real cost: 200 months × ₹3–5/month Groq = ₹600–1,000 per lifetime user
- Margin at ₹14,999: ~93%

### Limiting Lifetime Deal Risk

- Cap lifetime deal to first N users (e.g., 200 slots) — creates urgency + controls liability
- Store `lifetime_slots_remaining` in a config table
- Show countdown on pricing page

### Razorpay Lifetime Order Flow

```
1. User clicks "Get Lifetime" on PricingPage
2. Frontend: POST /api/billing/create-order { type: 'lifetime' }
3. Backend: razorpay.orders.create({ amount: 1499900, currency: 'INR' })
4. Frontend: Opens Razorpay checkout widget with order_id
5. User pays (UPI / card / net banking)
6. Razorpay: calls webhook → payment.captured
7. Backend: verifies signature → inserts razorpay_payments record
8. Backend: upserts user_plans { plan_type: 'lifetime', status: 'active' }
9. Backend: adds 100000 to credits_wallet
10. Backend: inserts credits_ledger { type: 'plan_grant', amount: 100000 }
11. Frontend: polls /api/billing/wallet → shows updated balance
```

---

## 7. Partner Credits System (Wholesale)

Partners (torqq, elevate) purchase credits in bulk from productverse at wholesale rate.

```sql
-- In productverse owner DB
CREATE TABLE partner_credit_pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id TEXT NOT NULL,        -- 'torqq' | 'elevate'
  balance INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER DEFAULT 0,
  total_distributed INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE partner_credit_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id TEXT NOT NULL,
  end_client_user_id UUID,         -- user in partner's Supabase
  credits_granted INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Partners have a dashboard to:
1. See their bulk credit pool balance
2. Assign credits to their end clients
3. Set per-client credit limits

---

## 8. Implementation Priority

### Phase 1 — Billing Foundation (2–3 days)
- [ ] Supabase migration: all 5 billing tables + RLS
- [ ] Backend: Razorpay SDK setup + `/api/billing/create-order` + `/api/billing/verify-payment`
- [ ] Backend: `/api/billing/deduct` + `/api/billing/wallet`
- [ ] Seed `credit_costs` table with feature rates

### Phase 2 — Frontend Billing UI (2 days)
- [ ] `PricingPage.tsx` — plans grid + lifetime card
- [ ] `WalletPanel.tsx` — balance + top-up + history
- [ ] `CreditBadge.tsx` — header balance display
- [ ] `TopUpModal.tsx` — Razorpay checkout

### Phase 3 — Credit Gates on Features (1–2 days)
- [ ] `useCredits` hook
- [ ] Gate GTM Strategy, Content Gen, Lead Enrich, Budget Optimization
- [ ] Refund logic on AI failure

### Phase 4 — Webhook + Subscriptions (1 day)
- [ ] Razorpay webhook handler (signature verify)
- [ ] subscription.charged → monthly credit refill
- [ ] subscription.cancelled → plan status update

### Phase 5 — Partner Portal (separate milestone)
- [ ] Partner bulk credit purchase
- [ ] Partner → end client credit distribution dashboard

---

## 9. Open Questions / Decisions Pending

| Question | Status | Notes |
|---|---|---|
| Exact credit pricing per feature | Pending | Validate with beta users |
| Lifetime deal slot cap | Pending | Suggest 200 slots max |
| Partner wholesale credit rate | Pending | Suggest 50% of retail |
| GST on Razorpay payments | Pending | Razorpay handles collection; check if you need GST registration |
| Free plan credit reset | Pending | One-time 500 credits or monthly refill of 100? |
| Credit expiry for top-ups | Pending | Recommend: no expiry (keeps goodwill) |

---

*Document owner: productverse.in*
*Related files: SUPABASE_SCHEMA.sql, RUNNING_COSTS.md, ARCHITECTURE_PLAN.md*
