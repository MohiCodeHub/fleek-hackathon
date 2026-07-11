import { config } from './config.js';

/**
 * Client for the seller chat platform (chat-app/). Relays Sanket's offer to a
 * real human seller and waits for their reply. This is the real-supplier swap-in
 * for `supplierReply` (the LLM sim) — the negotiation loop doesn't care which
 * produces the counter.
 */

/** True when a seller platform is configured (else negotiation uses the sim). */
export function sellerPlatformEnabled(): boolean {
  return !!config.sellerPlatformUrl;
}

interface Message {
  id: number;
  role: 'agent' | 'seller';
  text: string;
  ts: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // human seller — wait up to 5 min per turn
const DEFAULT_POLL_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Post Sanket's message to the seller's conversation, then poll until the human
 * replies. Returns the reply text, or null if the seller doesn't respond within
 * the timeout (Sanket should then escalate).
 */
export async function relayToSellerAndAwait(
  conversationId: string,
  label: string,
  message: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string | null> {
  const base = config.sellerPlatformUrl;
  if (!base) throw new Error('SELLER_PLATFORM_URL is not set.');

  const posted = await fetch(`${base}/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'agent', text: message, label }),
  });
  if (!posted.ok) {
    const detail = await posted.text().catch(() => '');
    throw new Error(`Seller platform send failed (${posted.status}): ${detail.slice(0, 200)}`);
  }
  const { message: sent } = (await posted.json()) as { message: Message };
  let after = sent.id;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const res = await fetch(
      `${base}/api/conversations/${encodeURIComponent(conversationId)}/messages?after=${after}`,
    );
    if (!res.ok) continue;
    const { messages } = (await res.json()) as { messages: Message[] };
    for (const m of messages) {
      after = Math.max(after, m.id);
      if (m.role === 'seller') return m.text;
    }
  }
  return null;
}
