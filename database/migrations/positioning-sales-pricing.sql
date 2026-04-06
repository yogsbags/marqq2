-- database/migrations/positioning-sales-pricing.sql
-- GTM-related persistence tables used by app/src/lib/persistence.ts
-- One row per user for each table (upserted on save).

-- ============================================================================
-- POSITIONING & MESSAGING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.positioning_messaging (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  value_proposition    TEXT,
  messaging_pillars    JSONB       NOT NULL DEFAULT '[]',
  differentiators      JSONB       NOT NULL DEFAULT '[]',
  brand_voice_tone     JSONB       NOT NULL DEFAULT '[]',
  brand_voice_dos      JSONB       NOT NULL DEFAULT '[]',
  brand_voice_donts    JSONB       NOT NULL DEFAULT '[]',
  elevator_pitch_short TEXT,
  elevator_pitch_medium TEXT,
  elevator_pitch_long  TEXT,
  gtm_context          JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.positioning_messaging_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS positioning_messaging_updated_at ON public.positioning_messaging;
CREATE TRIGGER positioning_messaging_updated_at
  BEFORE UPDATE ON public.positioning_messaging
  FOR EACH ROW EXECUTE FUNCTION public.positioning_messaging_set_updated_at();

ALTER TABLE public.positioning_messaging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own" ON public.positioning_messaging
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all" ON public.positioning_messaging
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- SALES ENABLEMENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sales_enablement (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  battlecards       JSONB       NOT NULL DEFAULT '[]',
  demo_scripts      JSONB       NOT NULL DEFAULT '{}',
  objection_handlers JSONB      NOT NULL DEFAULT '[]',
  pricing_guidance  JSONB       NOT NULL DEFAULT '{}',
  gtm_context       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.sales_enablement_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sales_enablement_updated_at ON public.sales_enablement;
CREATE TRIGGER sales_enablement_updated_at
  BEFORE UPDATE ON public.sales_enablement
  FOR EACH ROW EXECUTE FUNCTION public.sales_enablement_set_updated_at();

ALTER TABLE public.sales_enablement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own" ON public.sales_enablement
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all" ON public.sales_enablement
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- PRICING INTELLIGENCE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pricing_intelligence (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  competitive_matrix JSONB      NOT NULL DEFAULT '[]',
  value_metrics     JSONB       NOT NULL DEFAULT '[]',
  recommendations   JSONB,
  elasticity_data   JSONB       NOT NULL DEFAULT '[]',
  gtm_context       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.pricing_intelligence_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS pricing_intelligence_updated_at ON public.pricing_intelligence;
CREATE TRIGGER pricing_intelligence_updated_at
  BEFORE UPDATE ON public.pricing_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.pricing_intelligence_set_updated_at();

ALTER TABLE public.pricing_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own" ON public.pricing_intelligence
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all" ON public.pricing_intelligence
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
