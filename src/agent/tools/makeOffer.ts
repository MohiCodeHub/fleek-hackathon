import { StringEnum } from '@earendil-works/pi-ai';
import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { saveNegotiation } from '../../db/index.js';
import type { NegotiationRuntime } from '../../negotiation.js';
import { relayToSellerAndAwait, sellerPlatformEnabled } from '../../seller-channel.js';
import { supplierReply } from '../../supplier-sim.js';
import type { DealTerms, Grade } from '../../types.js';

/** Sentinel returned when a real human seller doesn't reply in time. */
const NO_SELLER_REPLY = '__NO_SELLER_REPLY__';

/**
 * Get the supplier's counter to Sanket's message. Routes to the real human
 * seller via the chat platform when configured; otherwise the LLM sim. Returns
 * NO_SELLER_REPLY if a human seller stays silent past the timeout.
 */
async function getSupplierReply(state: NegotiationRuntime, message: string): Promise<string> {
  if (sellerPlatformEnabled()) {
    const label = `${state.supplier.name} — ${state.bale.description}`;
    const reply = await relayToSellerAndAwait(state.neg.id, label, message);
    return reply ?? NO_SELLER_REPLY;
  }
  return supplierReply(state.supplier, state.bale, state.neg.transcript);
}

const MAX_ROUNDS = 7;

const termsSchema = Type.Object({
  pricePerUnit: Type.Number({ description: 'Price per unit in USD you are offering.' }),
  grade: StringEnum(['A', 'B', 'C', 'D'] as const satisfies readonly Grade[], {
    description: 'The grade you are offering for.',
  }),
  quantity: Type.Integer({ description: 'Number of units you are offering for.' }),
});

/**
 * make_offer: send a price/terms proposal to the supplier and get their counter.
 * The supplier's reply is returned. Capped at MAX_ROUNDS offers — after that the
 * agent must accept or escalate.
 */
export function makeOfferTool(state: NegotiationRuntime) {
  return defineTool({
    name: 'make_offer',
    label: 'Make Offer',
    description:
      'Send a price/terms proposal to the supplier and receive their counter-reply. Use to anchor and converge. Your offer must stay at or below the price ceiling. After too many rounds you must accept or escalate instead.',
    promptSnippet: 'Sends an offer to the supplier and returns their counter.',
    parameters: Type.Object({
      message: Type.String({
        description: 'Your WhatsApp line to the supplier proposing these terms.',
      }),
      ...termsSchema.properties,
    }),
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      if (state.done) {
        return {
          content: [{ type: 'text' as const, text: 'Negotiation already concluded.' }],
          details: { concluded: true },
        };
      }
      state.rounds += 1;
      if (state.rounds > MAX_ROUNDS) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `You've reached the ${MAX_ROUNDS}-offer limit. You must now call accept_deal (if the supplier's current terms are inside the contract) or escalate (if they cannot meet the contract).`,
            },
          ],
          details: { outOfRounds: true },
        };
      }
      const terms: DealTerms = {
        pricePerUnit: params.pricePerUnit,
        grade: params.grade,
        quantity: params.quantity,
      };
      state.neg.transcript.push({ speaker: 'sanket', message: params.message, offer: terms });
      state.neg.currentOffer = terms;
      state.neg.state = 'COUNTERING';
      await saveNegotiation(state.neg);

      const reply = await getSupplierReply(state, params.message);

      if (reply === NO_SELLER_REPLY) {
        return {
          content: [
            {
              type: 'text' as const,
              text: "The seller hasn't replied. If their last terms are inside the contract, call accept_deal; otherwise call escalate — do not keep waiting.",
            },
          ],
          details: { noSellerReply: true, yourTerms: terms, round: state.rounds },
        };
      }

      state.neg.transcript.push({ speaker: 'supplier', message: reply });
      await saveNegotiation(state.neg);

      return {
        content: [{ type: 'text' as const, text: `Supplier replied: ${reply}` }],
        details: { supplierReply: reply, yourTerms: terms, round: state.rounds },
      };
    },
  });
}
