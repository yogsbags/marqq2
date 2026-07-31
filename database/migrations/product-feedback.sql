-- Product feedback and usefulness signals for Marqq outcomes.
CREATE TABLE IF NOT EXISTS public.product_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id TEXT,
  artifact_id TEXT,
  surface TEXT NOT NULL DEFAULT 'main_chat',
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative', '1', '2', '3', '4', '5')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workspace_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_product_feedback_workspace_created
  ON public.product_feedback (workspace_id, created_at DESC);

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_feedback_own ON public.product_feedback;
CREATE POLICY product_feedback_own ON public.product_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Make competitor alerts workspace-safe as well. Existing rows are assigned to
-- the user's first workspace; future writers should provide workspace_id.
ALTER TABLE public.competitor_alerts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

UPDATE public.competitor_alerts AS alerts
SET workspace_id = members.workspace_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, workspace_id
  FROM public.workspace_members
  ORDER BY user_id, joined_at ASC
) AS members
WHERE alerts.user_id = members.user_id AND alerts.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_competitor_alerts_workspace_created
  ON public.competitor_alerts (workspace_id, created_at DESC);
