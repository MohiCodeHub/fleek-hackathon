import { StringEnum } from '@earendil-works/pi-ai';
import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { saveNegotiation } from '../../db/index.js';
import { log } from '../../log.js';
import type { NegotiationRuntime } from '../../negotiation.js';
import { supplierReply } from '../../supplier-sim.js';
import type { DealTerms, Grade } from '../../types.js';

export const MAX_ROUNDS = 7;

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
      if (state.rounds >= MAX_ROUNDS) {
        state.done = true;
        state.neg.state = 'ESCALATED';
        const last = state.lastSupplierTerms ?? state.neg.currentOffer;
        state.neg.currentOffer = last;
        state.neg.outcome = last
          ? `Reached the ${MAX_ROUNDS}-offer limit without closing. Best available: $${last.pricePerUnit}/unit, grade ${last.grade}, ${last.quantity} units.`
          : `Reached the ${MAX_ROUNDS}-offer limit without closing.`;
        await saveNegotiation(state.neg);
        log.info('sanket.done', {
          baleId: state.bale.id,
          reason: 'out_of_rounds',
          rounds: state.rounds,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: `You've reached the ${MAX_ROUNDS}-offer limit. Negotiation auto-escalated. Do not call more tools.`,
            },
          ],
          details: { outOfRounds: true, done: true },
        };
      }

      const terms: DealTerms = {
        pricePerUnit: params.pricePerUnit,
        grade: params.grade,
        quantity: params.quantity,
      };

      if (
        !Number.isFinite(terms.pricePerUnit) ||
        terms.pricePerUnit > state.contract.priceCeiling
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Refused — your offer $${terms.pricePerUnit}/unit is above the $${state.contract.priceCeiling} ceiling. Re-offer at or below the ceiling.`,
            },
          ],
          details: { refused: true, reason: 'above_ceiling', terms },
        };
      }

      state.rounds += 1;
      state.neg.transcript.push({ speaker: 'sanket', message: params.message, offer: terms });
      state.neg.currentOffer = terms;
      state.neg.state = 'COUNTERING';
      await saveNegotiation(state.neg);

      const reply = await supplierReply(state.supplier, state.bale, state.neg.transcript);
      state.neg.transcript.push({
        speaker: 'supplier',
        message: reply.message,
        offer: reply.terms ?? undefined,
      });
      if (reply.terms) {
        state.lastSupplierTerms = reply.terms;
        state.neg.currentOffer = reply.terms;
      }
      await saveNegotiation(state.neg);

      log.debug('sanket.round', {
        baleId: state.bale.id,
        round: state.rounds,
        offered: terms.pricePerUnit,
        supplierPrice: reply.terms?.pricePerUnit,
      });

      const termsLine = reply.terms
        ? `\n[supplier terms: $${reply.terms.pricePerUnit}/unit, grade ${reply.terms.grade}, qty ${reply.terms.quantity}]`
        : '';
      return {
        content: [
          {
            type: 'text' as const,
            text: `Supplier replied: ${reply.message}${termsLine}`,
          },
        ],
        details: {
          supplierReply: reply.message,
          supplierTerms: reply.terms,
          yourTerms: terms,
          round: state.rounds,
        },
      };
    },
  });
}
