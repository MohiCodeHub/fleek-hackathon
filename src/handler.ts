import { runJack } from './agent/jack.js';
import { getBuyer, getSupplierByPhone, getThread, saveThread, upsertBuyer } from './db/index.js';
import type { Msg } from './llm.js';
import { type InboundMessage, replyViaCallback } from './wassist.js';

/**
 * Resolve persona by counterparty and process one inbound WhatsApp message.
 * Buyer -> Jack. Supplier -> Jill (real-supplier relay; the demo uses in-process
 * Jill, so this path is the optional hybrid). Unknown -> new buyer (Jack).
 *
 * Final text is delivered via Wassist `reply_callback` (async BYOA path).
 */
export async function processInbound(inbound: InboundMessage): Promise<string> {
  const { from, body, replyCallback } = inbound;

  const supplier = await getSupplierByPhone(from);
  const isSupplier = !!supplier;
  if (!isSupplier && !(await getBuyer(from))) {
    await upsertBuyer({
      phone: from,
      name: 'WhatsApp buyer',
      profile: { brandsPursued: [], notes: [] },
    });
  }

  const role: 'buyer' | 'supplier' = isSupplier ? 'supplier' : 'buyer';
  const thread = (await getThread(from)) ?? {
    phone: from,
    role,
    conversationId: null,
    history: [],
  };
  const history = thread.history as Msg[];

  let reply: string;
  if (role === 'buyer') {
    const res = await runJack(from, history, body);
    reply = res.reply;
    await saveThread({
      phone: from,
      role,
      conversationId: thread.conversationId,
      history: res.history,
    });
  } else {
    reply =
      "Thanks — this line is handled by Fleek's sourcing agent. A live negotiation will reach you here when a buyer's mandate matches your stock.";
    await saveThread({
      phone: from,
      role,
      conversationId: thread.conversationId,
      history,
    });
  }

  await deliver(replyCallback, reply);
  return reply;
}

/** POST the final reply to Wassist reply_callback (or log in local/dev). */
async function deliver(replyCallback: string, reply: string): Promise<void> {
  if (!reply) return;
  if (!replyCallback.startsWith('http')) {
    console.log(`\n[no reply_callback URL — would send]\n${reply}\n`);
    return;
  }
  await replyViaCallback(replyCallback, reply);
}
