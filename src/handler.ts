import { runJack } from './agent/jack.js';
import { config } from './config.js';
import { getBuyer, getSupplierByPhone, getThread, saveThread, upsertBuyer } from './db/index.js';
import type { Msg } from './llm.js';
import { type InboundMessage, sendMessage } from './wassist.js';

/**
 * Resolve persona by counterparty and process one inbound WhatsApp message.
 * Buyer -> Jack. Supplier -> Jill (real-supplier relay; the demo uses in-process
 * Jill, so this path is the optional hybrid). Unknown -> new buyer (Jack).
 */
export async function processInbound(inbound: InboundMessage): Promise<string> {
  const { from, conversationId, body } = inbound;

  const supplier = await getSupplierByPhone(from);
  const isSupplier = !!supplier;
  if (!isSupplier && !(await getBuyer(from))) {
    // First contact — onboard as a buyer.
    await upsertBuyer({
      phone: from,
      name: 'WhatsApp buyer',
      profile: { brandsPursued: [], notes: [] },
    });
  }

  const role: 'buyer' | 'supplier' = isSupplier ? 'supplier' : 'buyer';
  const thread = (await getThread(from)) ?? { phone: from, role, conversationId, history: [] };
  const history = thread.history as Msg[];

  let reply: string;
  if (role === 'buyer') {
    const res = await runJack(from, history, body);
    reply = res.reply;
    await saveThread({ phone: from, role, conversationId, history: res.history });
  } else {
    // Real-supplier inbound (optional hybrid mode). In the core demo, Jill runs
    // in-process during Jack's negotiate tool, so suppliers never text in.
    reply =
      "Thanks — this line is handled by Fleek's sourcing agent. A live negotiation will reach you here when a buyer's mandate matches your stock.";
    await saveThread({ phone: from, role, conversationId, history });
  }

  await deliver(conversationId, reply);
  return reply;
}

/** Send the reply over WhatsApp, or log it if Wassist isn't configured (local dev). */
async function deliver(conversationId: string, reply: string): Promise<void> {
  if (!reply) return;
  if (!config.wassist.apiKey) {
    console.log(`\n[no WASSIST_API_KEY — would send to ${conversationId}]\n${reply}\n`);
    return;
  }
  await sendMessage(conversationId, reply);
}
