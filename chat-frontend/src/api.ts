/** Chat-app API client. Base URL comes from VITE_API_BASE_URL (Vercel); empty in
 *  dev so requests hit the Vite proxy → local chat-app on :4000. */
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface Message {
  id: number;
  role: 'agent' | 'seller';
  text: string;
  ts: number;
}

export interface ConversationSummary {
  id: string;
  label: string;
  lastMessage: string;
  lastRole: 'agent' | 'seller' | null;
  lastTs: number;
  count: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const d = await json<{ conversations: ConversationSummary[] }>(
    await fetch(`${BASE}/api/conversations`),
  );
  return d.conversations;
}

export async function getMessages(
  id: string,
  after: number,
): Promise<{ label: string; messages: Message[] }> {
  return json(
    await fetch(`${BASE}/api/conversations/${encodeURIComponent(id)}/messages?after=${after}`),
  );
}

export async function sendSellerMessage(id: string, text: string): Promise<void> {
  await fetch(`${BASE}/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'seller', text }),
  });
}
