-- database/migrations/user-plans.sql
-- Per-user subscription plan and monthly credit balance.
-- Backend seeds a row on first agent run; plan controls module access.

CREATE TABLE IF NOT EXISTS public.user_plans (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                TEXT        NOT NULL DEFAULT 'growth'
                                  CHECK (plan IN ('growth', 'scale', 'agency')),
  credits_remaining   INTEGER     NOT NULL DEFAULT 500,
  credits_total       INTEGER     NOT NULL DEFAULT 500,
  credits_reset_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_plans_user
  ON public.user_plans (user_id);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.user_plans_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_plans_updated_at ON public.user_plans;
CREATE TRIGGER user_plans_updated_at
  BEFORE UPDATE ON public.user_plans
  FOR EACH ROW EXECUTE FUNCTION public.user_plans_set_updated_at();

-- RLS
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend seeds and updates credits)
CREATE POLICY "service_role_all" ON public.user_plans
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can read their own plan (frontend billing UI)
CREATE POLICY "users_select_own" ON public.user_plans
  FOR SELECT USING (auth.uid() = user_id);

-- Users cannot directly modify plans (backend-only writes)
