/**
 * conversationPersistence.ts
 *
 * Dual-write strategy for chat conversations:
 *  - localStorage  → instant reads/writes (no latency)
 *  - Supabase      → cross-device sync, survives localStorage clear
 *
 * The localStorage layer is always the primary cache; Supabase writes are
 * fire-and-forget so they never block the UI.
 */

import { supabase } from './supabase';
import type { Conversation, Message } from '@/types/chat';

export type ConversationScope = 'main' | 'veena-dm';

// ── localStorage helpers ──────────────────────────────────────────────────────

const CONV_KEY_PREFIX = 'marqq_conversations';

function getConvKey(workspaceId: string | undefined, scope: ConversationScope = 'main'): string {
  if (!workspaceId) return scope === 'main' ? CONV_KEY_PREFIX : `${CONV_KEY_PREFIX}_${scope}`;
  return scope === 'main'
    ? `${CONV_KEY_PREFIX}_${workspaceId}`
    : `${CONV_KEY_PREFIX}_${workspaceId}_${scope}`;
}

function deserialiseConversations(raw: string): Conversation[] {
  const parsed = JSON.parse(raw) as any[];
  return parsed.map((c) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    lastMessageAt: new Date(c.lastMessageAt),
    messages: (c.messages ?? []).map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    })),
  }));
}

export function loadConversationsLocal(workspaceId?: string, scope: ConversationScope = 'main'): Conversation[] {
  try {
    const raw = localStorage.getItem(getConvKey(workspaceId, scope));
    if (!raw) return [];
    return deserialiseConversations(raw);
  } catch {
    return [];
  }
}

export function saveConversationsLocal(convs: Conversation[], workspaceId?: string, scope: ConversationScope = 'main'): void {
  try {
    localStorage.setItem(getConvKey(workspaceId, scope), JSON.stringify(convs));
  } catch {
    // localStorage quota exceeded – silently ignore
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

/** Set `VITE_DISABLE_CONVERSATION_SUPABASE_SYNC=true` in `.env` to skip remote sync (e.g. before migrations). */
function isConversationSyncOptedOut(): boolean {
  return import.meta.env.VITE_DISABLE_CONVERSATION_SUPABASE_SYNC === 'true';
}

/** After first "table missing / not exposed" response, skip further sync calls (stops 404 spam in Network). */
let conversationRemoteSyncDisabled = false;

/**
 * Missing `conversations` / `messages` tables, or PostgREST schema cache out of date — not an app bug.
 * PostgREST may use PGRST205; HTTP layer surfaces 404 without a Postgres code.
 */
function isConversationInfraUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const code = String(e.code ?? '');
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST204') return true;
  const status = Number(e.status ?? e.statusCode ?? 0);
  if (status === 404 || status === 406) return true;
  const msg = String(e.message ?? '').toLowerCase();
  if (msg.includes('schema cache') || msg.includes('could not find') || msg.includes('does not exist')) return true;
  return false;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Write a single conversation (with its messages) to Supabase.
 * Called fire-and-forget after every localStorage write.
 */
export async function syncConversationToSupabase(
  conv: Conversation,
  workspaceId: string,
): Promise<void> {
  try {
    if (isConversationSyncOptedOut() || conversationRemoteSyncDisabled) return;

    // Skip sync if conversation ID is not a valid UUID (e.g., "conv-123456789")
    // These IDs are fine for localStorage but Supabase requires UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(conv.id)) {
      console.debug('[ConvSync] skipping sync for non-UUID conversation ID:', conv.id);
      return;
    }

    const userId = await getCurrentUserId();
    if (!userId) return;

    // Upsert conversation row
    const { error: convErr } = await supabase.from('conversations').upsert(
      {
        id: conv.id,
        workspace_id: workspaceId,
        user_id: userId,
        name: conv.name,
        created_at: conv.createdAt.toISOString(),
        last_message_at: conv.lastMessageAt.toISOString(),
      },
      { onConflict: 'id' },
    );
    if (convErr) {
      if (isConversationInfraUnavailableError(convErr)) {
        conversationRemoteSyncDisabled = true;
        return;
      }
      console.warn('[ConvSync] conversation upsert error:', convErr.message);
      return;
    }

    // Delete existing messages for this conversation (full replace)
    const { error: delErr } = await supabase.from('messages').delete().eq('conversation_id', conv.id);
    if (delErr && isConversationInfraUnavailableError(delErr)) {
      conversationRemoteSyncDisabled = true;
      return;
    }

    // Insert all messages
    if (conv.messages.length === 0) return;
    const rows = conv.messages.map((m) => ({
      id: m.id,
      conversation_id: conv.id,
      workspace_id: workspaceId,
      user_id: userId,
      content: m.content,
      reasoning: m.reasoning ?? null,
      sender: m.sender,
      file_name: m.file?.name ?? null,
      file_size: m.file?.size ?? null,
      file_type: m.file?.type ?? null,
      file_url: m.file?.url ?? null,
      agent_name: m.agentName ?? null,
      agent_role: m.agentRole ?? null,
      agent_id: m.agentId ?? null,
      tool_status: m.toolStatus ?? null,
      created_at: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
    }));

    const { error: msgErr } = await supabase.from('messages').insert(rows);
    if (msgErr) {
      if (isConversationInfraUnavailableError(msgErr)) {
        conversationRemoteSyncDisabled = true;
        return;
      }
      console.warn('[ConvSync] messages insert error:', msgErr.message);
    }
  } catch (err) {
    if (isConversationInfraUnavailableError(err)) {
      conversationRemoteSyncDisabled = true;
      return;
    }
    console.warn('[ConvSync] unexpected error:', err);
  }
}

/**
 * Load all conversations for a workspace from Supabase.
 * Used on first load when localStorage is empty (e.g. new device).
 */
export async function loadConversationsFromSupabase(
  workspaceId: string,
  scope: ConversationScope = 'main',
): Promise<Conversation[]> {
  try {
    if (isConversationSyncOptedOut() || conversationRemoteSyncDisabled) return [];
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data: convRows, error: convErr } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (convErr) {
      if (isConversationInfraUnavailableError(convErr)) {
        conversationRemoteSyncDisabled = true;
        return [];
      }
      console.warn('[ConvSync] load conversations error:', convErr.message);
      return [];
    }
    if (!convRows || convRows.length === 0) return [];

    // Load messages for all conversations
    const convIds = convRows.map((c: any) => c.id);
    const { data: msgRows, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });

    if (msgErr) {
      console.warn('[ConvSync] load messages error:', msgErr.message);
    }

    const messagesByConv: Record<string, Message[]> = {};
    for (const row of msgRows ?? []) {
      if (!messagesByConv[row.conversation_id]) {
        messagesByConv[row.conversation_id] = [];
      }
      messagesByConv[row.conversation_id].push({
        id: row.id,
        content: row.content,
        reasoning: row.reasoning ?? undefined,
        sender: row.sender as 'user' | 'ai',
        timestamp: new Date(row.created_at),
        file: row.file_name
          ? { name: row.file_name, size: row.file_size, type: row.file_type, url: row.file_url ?? undefined }
          : undefined,
        agentName: row.agent_name ?? undefined,
        agentRole: row.agent_role ?? undefined,
        agentId: row.agent_id ?? undefined,
        toolStatus: row.tool_status ?? undefined,
      });
    }

    return convRows.map((c: any) => ({
      id: c.id,
      name: c.name,
      createdAt: new Date(c.created_at),
      lastMessageAt: new Date(c.last_message_at),
      messages: messagesByConv[c.id] ?? [],
      channelId: c.channel_id ?? undefined,
    })).filter((conversation) => (conversation.channelId ?? 'main') === scope);
  } catch (err) {
    console.warn('[ConvSync] unexpected load error:', err);
    return [];
  }
}

// ── Public API (drop-in replacements for old localStorage-only functions) ─────

/**
 * Load conversations from localStorage; if empty and workspaceId is provided,
 * also tries Supabase and populates the local cache.
 */
export async function loadConversations(workspaceId?: string, scope: ConversationScope = 'main'): Promise<Conversation[]> {
  const local = loadConversationsLocal(workspaceId, scope);
  if (local.length > 0) return local;

  if (!workspaceId) return [];

  // No local data — try fetching from Supabase (cross-device scenario)
  const remote = await loadConversationsFromSupabase(workspaceId, scope);
  if (remote.length > 0) {
    saveConversationsLocal(remote, workspaceId, scope);
  }
  return remote;
}

/**
 * Save conversations to localStorage and fire-and-forget sync to Supabase.
 */
export function saveConversations(
  convs: Conversation[],
  workspaceId?: string,
  changedConvId?: string,
  scope: ConversationScope = 'main',
): void {
  saveConversationsLocal(convs, workspaceId, scope);

  if (workspaceId) {
    const conv = changedConvId ? convs.find((c) => c.id === changedConvId) : convs[0];
    if (conv) {
      // Fire and forget
      syncConversationToSupabase(conv, workspaceId).catch(() => {});
    }
  }
}

/**
 * Delete a conversation from localStorage and Supabase.
 */
export async function deleteConversation(
  convId: string,
  workspaceId?: string,
  scope: ConversationScope = 'main',
): Promise<void> {
  // localStorage
  const convs = loadConversationsLocal(workspaceId, scope).filter((c) => c.id !== convId);
  saveConversationsLocal(convs, workspaceId, scope);

  // Supabase (cascade deletes messages too)
  if (workspaceId && !isConversationSyncOptedOut() && !conversationRemoteSyncDisabled) {
    try {
      const { error } = await supabase.from('conversations').delete().eq('id', convId);
      if (error && isConversationInfraUnavailableError(error)) conversationRemoteSyncDisabled = true;
    } catch {
      // Non-fatal
    }
  }
}
