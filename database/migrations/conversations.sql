-- database/migrations/conversations.sql
-- Persists chat conversations and messages in Supabase.
-- Replaces localStorage-only storage so conversations survive re-login
-- and are accessible across devices.

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL DEFAULT 'New Chat',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_user
  ON public.conversations (workspace_id, user_id, last_message_at DESC);

-- ============================================================================
-- MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id    UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL DEFAULT '',
  reasoning       TEXT,
  sender          TEXT        NOT NULL CHECK (sender IN ('user', 'ai')),
  -- File attachment metadata (optional)
  file_name       TEXT,
  file_size       BIGINT,
  file_type       TEXT,
  file_url        TEXT,
  -- Subagent metadata (optional)
  agent_name      TEXT,
  agent_role      TEXT,
  agent_id        TEXT,
  tool_status     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_user
  ON public.messages (workspace_id, user_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "service_role_all" ON public.conversations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can manage their own conversations
CREATE POLICY "users_manage_own_conversations" ON public.conversations
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can manage messages in their conversations
CREATE POLICY "users_manage_own_messages" ON public.messages
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
