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

// ── localStorage helpers ──────────────────────────────────────────────────────

const CONV_KEY_PREFIX = 'marqq_conversations';

function getConvKey(workspaceId: string | undefined): string {
  return workspaceId ? `${CONV_KEY_PREFIX}_${workspaceId}` : CONV_KEY_PREFIX;
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

export function loadConversationsLocal(workspaceId?: string): Conversation[] {
  try {
    const raw = localStorage.getItem(getConvKey(workspaceId));
    if (!raw) return [];
    return deserialiseConversations(raw);
  } catch {
    return [];
  }
}

export function saveConversationsLocal(convs: Conversation[], workspaceId?: string): void {
  try {
    localStorage.setItem(getConvKey(workspaceId), JSON.stringify(convs));
  } catch {
    // localStorage quota exceeded – silently ignore
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

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
      // Table might not exist yet — skip silently
      if ((convErr as any).code === 'PGRST205' || (convErr as any).code === '42P01') return;
      console.warn('[ConvSync] conversation upsert error:', convErr.message);
      return;
    }

    // Delete existing messages for this conversation (full replace)
    await supabase.from('messages').delete().eq('conversation_id', conv.id);

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
    if (msgErr && (msgErr as any).code !== 'PGRST205' && (msgErr as any).code !== '42P01') {
      console.warn('[ConvSync] messages insert error:', msgErr.message);
    }
  } catch (err) {
    // Never throw — sync is fire-and-forget
    console.warn('[ConvSync] unexpected error:', err);
  }
}

/**
 * Load all conversations for a workspace from Supabase.
 * Used on first load when localStorage is empty (e.g. new device).
 */
export async function loadConversationsFromSupabase(
  workspaceId: string,
): Promise<Conversation[]> {
  try {
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
      if ((convErr as any).code === 'PGRST205' || (convErr as any).code === '42P01') return [];
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
    }));
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
export async function loadConversations(workspaceId?: string): Promise<Conversation[]> {
  const local = loadConversationsLocal(workspaceId);
  if (local.length > 0) return local;

  if (!workspaceId) return [];

  // No local data — try fetching from Supabase (cross-device scenario)
  const remote = await loadConversationsFromSupabase(workspaceId);
  if (remote.length > 0) {
    saveConversationsLocal(remote, workspaceId);
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
): void {
  saveConversationsLocal(convs, workspaceId);

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
): Promise<void> {
  // localStorage
  const convs = loadConversationsLocal(workspaceId).filter((c) => c.id !== convId);
  saveConversationsLocal(convs, workspaceId);

  // Supabase (cascade deletes messages too)
  if (workspaceId) {
    try {
      await supabase.from('conversations').delete().eq('id', convId);
    } catch {
      // Non-fatal
    }
  }
}
