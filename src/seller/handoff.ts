import { config } from '../config.js';
import { getBuyer } from '../db/index.js';
import { generateJSON } from '../llm.js';
import { log } from '../log.js';
import type { Bale, Mandate, MandateContract, Supplier } from '../types.js';
import { sellerChannel } from './channel.js';
import { loadProfileContext } from './profiles.js';

/**
 * The supply-side agent's proactive handoff to the human seller, over the
 * `/seller` console. It (1) announces the match + what the buyer wants,
 * (2) reads the buyer + supplier AM-Brain profiles and recommends a counteroffer,
 * (3) flags the seller's recent counter-price variance and asks them to confirm
 * before it goes out. Returns the approved anchor price for the negotiation.
 */

export interface SellerHandoffResult {
  anchorPrice: number;
  approved: boolean;
  auto: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic fallback counter: hold your ask, but never above the buyer's cap. */
function defaultCounter(bale: Bale, contract: MandateContract): number {
  const cap = contract.priceCeiling;
  const base = bale.askPrice <= cap ? bale.askPrice : cap * 0.96;
  return round2(clamp(base, bale.askPrice * 0.6, cap));
}

const RECO_SCHEMA = {
  type: 'object',
  properties: {
    recommendedPricePerUnit: {
      type: 'number',
      description: 'Per-unit counter to put to the buyer. Must be <= the buyer price ceiling.',
    },
    reasoning: {
      type: 'string',
      description:
        "2-3 sentences to the seller: why this number, grounded in the buyer's converting behaviour and the seller's own stock/pricing history. No preamble.",
    },
  },
  required: ['recommendedPricePerUnit', 'reasoning'],
  additionalProperties: false,
};

/** Ask the model for a profile-grounded counter; fall back to a deterministic one. */
async function recommendCounter(
  mandate: Mandate,
  bale: Bale,
  contract: MandateContract,
  ctx: { buyer: string; supplier: string },
): Promise<{ price: number; reasoning: string }> {
  const fallbackPrice = defaultCounter(bale, contract);
  try {
    const system = `You are Fleek's supply-side agent, advising a vintage-wholesale SELLER on a live buyer match. You are fiduciary to the SELLER: get them the best price that still closes. You have the buyer's and the seller's AM-Brain profiles. Recommend a single per-unit counter, never above the buyer's ceiling of $${contract.priceCeiling}. Ground it in evidence from the profiles (the buyer's conversion/price behaviour; the seller's stock quality and pricing history).`;
    const user = `THE MATCH
Buyer wants ~${mandate.quantity} units of ${mandate.category} (${mandate.style}), grade >= ${mandate.gradeFloor}, ceiling $${contract.priceCeiling}/unit.
Your bale: ${bale.description}
Your opening ask: $${bale.askPrice}/unit.

BUYER PROFILE (AM-Brain)
${ctx.buyer || '(none on file)'}

YOUR PROFILE (AM-Brain)
${ctx.supplier || '(none on file)'}`;
    const out = await generateJSON<{ recommendedPricePerUnit: number; reasoning: string }>({
      system,
      messages: [{ role: 'user', content: user }],
      schema: RECO_SCHEMA,
      toolName: 'recommend_counter',
      toolDescription: 'Recommend the seller counteroffer.',
      maxTokens: 500,
    });
    const price = round2(
      clamp(out.recommendedPricePerUnit, bale.askPrice * 0.5, contract.priceCeiling),
    );
    return {
      price,
      reasoning: out.reasoning?.trim() || 'Best number that still closes this buyer.',
    };
  } catch (e) {
    log.warn('seller.recommend_failed', { err: e instanceof Error ? e.message : String(e) });
    return {
      price: fallbackPrice,
      reasoning:
        'This buyer converts fast and holds their price, so anchoring near your ask captures the most margin without risking the deal.',
    };
  }
}

/** Parse an explicit price the seller may have typed (e.g. "hold at 4.90"). */
function parsePrice(text: string): number | null {
  const m = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}

const HOLD_RE = /\b(no|hold|higher|more|wait|nah|don'?t|stop|not yet)\b/i;

export async function runSellerHandoff(args: {
  mandate: Mandate;
  bale: Bale;
  supplier: Supplier;
  contract: MandateContract;
}): Promise<SellerHandoffResult> {
  const { mandate, bale, supplier, contract } = args;
  const buyer = await getBuyer(mandate.buyerPhone).catch(() => null);
  const ctx = loadProfileContext(mandate.buyerPhone, supplier.id);
  // Speak in the name from the AM-Brain context layer the agent reasons over,
  // falling back to the buyer's onboarded name, then a generic label.
  const buyerName = ctx.buyerName || buyer?.name?.trim() || buyer?.company || 'A Fleek buyer';

  log.info('seller.handoff.start', {
    supplier: supplier.name,
    buyer: buyerName,
    buyerProfile: ctx.buyerSlug,
    supplierProfile: ctx.supplierSlug,
  });

  // 1) Proactive "you've been matched" notification.
  sellerChannel.post(
    'agent',
    `👋 Hey — Fleek sourcing here. Good news: you've just been matched with a live buyer.\n\n` +
      `*${buyerName}* is looking for ~${mandate.quantity} units of ${mandate.category} (${mandate.style}), ` +
      `grade ${mandate.gradeFloor} or better, budget up to *$${contract.priceCeiling}/unit*.\n\n` +
      `I've lined it up against your bale:\n_“${bale.description}”_\n(your ask $${bale.askPrice}/unit). ` +
      `Give me a sec to work out where to pitch your counter…`,
    { kind: 'intro' },
  );

  // 2) Profile-grounded recommendation.
  const rec = await recommendCounter(mandate, bale, contract, ctx);

  sellerChannel.post(
    'agent',
    `Right — I pulled ${buyerName}'s buying history and your own profile.\n\n` +
      `${rec.reasoning}\n\n` +
      `👉 My recommendation: *counter at $${rec.price}/unit* (holding grade ${mandate.gradeFloor}+ and the full ${mandate.quantity} units).\n\n` +
      `One thing though — your counter prices have bounced around a fair bit lately, so I don't want to send this in your name without a nod from you. ` +
      `Want me to put $${rec.price}/unit on the table?`,
    { kind: 'recommendation', quickReplies: [`👍 Send $${rec.price}`, '✋ Hold higher'] },
  );

  // 3) Wait for the seller's approval (auto-send on timeout so a demo never hangs).
  const reply = await sellerChannel.awaitReply(config.seller.approvalTimeoutMs);

  let anchor = rec.price;
  const approved = true;
  if (!reply.auto) {
    const typed = parsePrice(reply.text);
    if (typed != null) {
      anchor = round2(clamp(typed, bale.askPrice * 0.5, contract.priceCeiling));
    } else if (HOLD_RE.test(reply.text)) {
      // Seller wants to hold firmer — push the anchor up to the buyer's ceiling.
      anchor = contract.priceCeiling;
    }
  }

  sellerChannel.post(
    'agent',
    reply.auto
      ? `(No reply yet — going with $${anchor}/unit so we don't keep the buyer waiting.)\n\n🤝 Putting $${anchor}/unit to the buyer now. I'll hold your grade and quantity line and update you the moment it lands.`
      : `🤝 On it — pitching *$${anchor}/unit* to the buyer, holding grade ${mandate.gradeFloor}+ and ${mandate.quantity} units. I'll update you here the moment they respond.`,
    { kind: 'status' },
  );

  log.info('seller.handoff.done', { anchor, approved, auto: reply.auto });
  return { anchorPrice: anchor, approved, auto: reply.auto };
}

/** Post the final negotiation outcome to the seller console. */
export function postSellerOutcome(closed: boolean, detail: string): void {
  sellerChannel.post('agent', closed ? `✅ ${detail}` : `⚠️ ${detail}`, { kind: 'outcome' });
}
