import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { serve } from '@hono/node-server';
import { buildAgent, lastAssistantText, type ToolExec } from '../agent/factory.js';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { getBuyer } from '../db/index.js';
import { learnFromInteraction } from '../memory.js';
import { sellerChannel } from '../seller/channel.js';

/**
 * Fully-local two-POV demo in ONE process:
 *   • Terminal  = the BUYER talking to Abhi.
 *   • Browser   = the SELLER's WhatsApp console at http://localhost:<port>/seller,
 *                 where the supply-side agent proactively hands off the match,
 *                 recommends a counter, and waits for the seller to approve.
 *
 * Run with SELLER_MODE=1 (the `npm run seller-demo` script sets it). No Wassist,
 * no second device. Pick a buyer that maps to an AM-Brain profile (see
 * src/seller/profiles.ts); the seeded buyer works out of the box.
 */
const BUYER_PHONE = process.env.BUYER_PHONE ?? '+14155550101';

async function main(): Promise<void> {
  if (!config.seller.enabled) {
    console.warn('⚠️  SELLER_MODE is not on — run `npm run seller-demo` (it sets SELLER_MODE=1).');
  }

  const buyer = await getBuyer(BUYER_PHONE);
  if (!buyer) {
    console.error(`No buyer ${BUYER_PHONE}. Run: npm run seed`);
    process.exit(1);
  }

  sellerChannel.reset();
  const app = createApp();
  serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' });

  console.log(`\n🟢  Seller console:  http://localhost:${config.port}/seller`);
  console.log('    Open it in a browser — this is the supplier phone.\n');
  console.log(`💬  You are the BUYER, ${buyer.name}. Ask Abhi to source something, then`);
  console.log('    pick an option to pursue — the seller console will light up. Ctrl+C to quit.\n');
  console.log(
    '    Try:  I need ~300 units of 90s branded sportswear, Grade B+, under $5/unit. What can you find?\n',
  );

  const rl = createInterface({ input: stdin, output: stdout });
  let history: AgentSession['messages'] = [];

  while (true) {
    const line = (await rl.question('you › ')).trim();
    if (!line) continue;
    process.stdout.write('\nabhi › ');

    const toolExecs: ToolExec[] = [];
    const session = await buildAgent({
      persona: 'abhi',
      buyerPhone: BUYER_PHONE,
      history,
      onToolResult: (exec) => toolExecs.push(exec),
    });
    try {
      await session.prompt(line);
      const reply = lastAssistantText(session);
      history = session.messages;
      await learnFromInteraction(BUYER_PHONE, toolExecs);
      console.log(reply || '(…)');
    } finally {
      session.dispose();
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
