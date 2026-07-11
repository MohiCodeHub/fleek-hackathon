import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { runJack } from '../agent/jack.js';
import { getBuyer } from '../db/index.js';
import type { Msg } from '../llm.js';

/**
 * Interactive CLI to chat with Jack as a buyer — the demo money-shot without
 * WhatsApp. Uses the seeded buyer by default.
 */
const BUYER_PHONE = process.env.BUYER_PHONE ?? '+14155550101';

async function main(): Promise<void> {
  const buyer = await getBuyer(BUYER_PHONE);
  if (!buyer) {
    console.error(`No buyer ${BUYER_PHONE}. Run: npm run seed`);
    process.exit(1);
  }
  console.log(`\n💬  Chatting with Jack as ${buyer.name} (${BUYER_PHONE}).`);
  console.log('    Type your sourcing request. Ctrl+C to quit.\n');

  const rl = createInterface({ input: stdin, output: stdout });
  let history: Msg[] = [];

  while (true) {
    const line = (await rl.question('you › ')).trim();
    if (!line) continue;
    process.stdout.write('\njack › ');
    const res = await runJack(BUYER_PHONE, history, line);
    history = res.history;
    console.log(res.reply || '(…)');
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
