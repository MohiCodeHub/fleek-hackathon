/**
 * In-memory conversation store for the seller chat platform. Fine for a live
 * demo — no DB to provision on Render. State resets on restart.
 */

export type Role = 'agent' | 'seller';

export interface Message {
  id: number;
  role: Role;
  text: string;
  ts: number;
}

export interface Conversation {
  id: string;
  label: string;
  createdAt: number;
  messages: Message[];
}

const conversations = new Map<string, Conversation>();
let seq = 0;

/** Append a message, creating the conversation on first contact. */
export function appendMessage(
  conversationId: string,
  role: Role,
  text: string,
  label?: string,
): Message {
  let conv = conversations.get(conversationId);
  if (!conv) {
    conv = {
      id: conversationId,
      label: label || conversationId,
      createdAt: Date.now(),
      messages: [],
    };
    conversations.set(conversationId, conv);
  } else if (label && conv.label === conv.id) {
    // Backfill a human label once the agent supplies one.
    conv.label = label;
  }
  const message: Message = { id: ++seq, role, text, ts: Date.now() };
  conv.messages.push(message);
  return message;
}

export function getConversation(conversationId: string): Conversation | undefined {
  return conversations.get(conversationId);
}

/** Messages in a conversation with id greater than `after` (0 = all). */
export function messagesSince(conversationId: string, after: number): Message[] {
  const conv = conversations.get(conversationId);
  if (!conv) return [];
  return conv.messages.filter((m) => m.id > after);
}

export interface ConversationSummary {
  id: string;
  label: string;
  lastMessage: string;
  lastRole: Role | null;
  lastTs: number;
  count: number;
}

/** Conversation list for the seller inbox, most-recently-active first. */
export function listConversations(): ConversationSummary[] {
  return [...conversations.values()]
    .map((c) => {
      const last = c.messages[c.messages.length - 1];
      return {
        id: c.id,
        label: c.label,
        lastMessage: last?.text ?? '',
        lastRole: last?.role ?? null,
        lastTs: last?.ts ?? c.createdAt,
        count: c.messages.length,
      };
    })
    .sort((a, b) => b.lastTs - a.lastTs);
}
