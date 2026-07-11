import { runAbhi } from '../agent/abhi.js';
import { closeDb } from '../db/client.js';
import { getBuyer } from '../db/index.js';
import type { Msg } from '../llm.js';

/**
 * Scripted end-to-end demo: buyer -> Abhi -> ranked matches -> buyer picks ->
 * Abhi dispatches Sanket to negotiate -> closed deal / escalation, all in-thread.
 * The money-shot without WhatsApp — run repeatedly to rehearse.
 */
const BUYER_PHONE = process.env.BUYER_PHONE ?? '+14155550101';

const SCRIPT = [
  'Hey Abhi — I need around 300 units of 90s branded sportswear, Grade B or better, and I want to stay under $5 a unit. What can you find?',
  'Nice. Go ahead and pursue option 1. Also try the mixed 90s bale from Nord for me.',
];

async function main(): Promise<void> {
  const buyer = await getBuyer(BUYER_PHONE);
  if (!buyer) {
    console.error(`No buyer ${BUYER_PHONE}. Run: npm run seed`);
    process.exit(1);
  }

  console.log(`\n=== Abhi & Sanket demo — buyer: ${buyer.name} ===\n`);
  let history: Msg[] = [];

  for (const line of SCRIPT) {
    console.log(`\x1b[36myou  ›\x1b[0m ${line}\n`);
    const res = await runAbhi(BUYER_PHONE, history, line);
    history = res.history;
    console.log(`\x1b[32mabhi ›\x1b[0m ${res.reply}\n`);
    console.log('─'.repeat(72));
  }
  console.log('\n=== demo complete ===\n');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
