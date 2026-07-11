import { StringEnum } from '@earendil-works/pi-ai';
import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { escalationNote, insideContract } from '../../contract.js';
import { saveNegotiation, setMandateStatus } from '../../db/index.js';
import { log } from '../../log.js';
import type { NegotiationRuntime } from '../../negotiation.js';
import type { DealTerms, Grade } from '../../types.js';

/**
 * escalate: stop negotiating and hand back to the buyer (via Abhi) with the
 * best available terms. Use only when the supplier's genuine best-and-final is
 * still outside the contract.
 */
export function escalateTool(state: NegotiationRuntime) {
  return defineTool({
    name: 'escalate',
    label: 'Escalate',
    description:
      "Stop negotiating and hand back to the buyer (via Abhi) with the supplier's best available terms. Use only when the supplier's genuine best-and-final is still outside the contract (price above ceiling, grade below floor, or quantity short) after real back-and-forth. If terms are inside the contract, call accept_deal instead.",
    promptSnippet:
      'Escalates to the buyer with best available terms when the contract cannot be met.',
    parameters: Type.Object({
      message: Type.String({
        description:
          'A brief note for the buyer (via Abhi) explaining the gap. Not sent to the supplier.',
      }),
      pricePerUnit: Type.Number({
        description: "Supplier's best available price per unit in USD.",
      }),
      grade: StringEnum(['A', 'B', 'C', 'D'] as const satisfies readonly Grade[], {
        description: "Supplier's best available grade.",
      }),
      quantity: Type.Integer({ description: "Supplier's best available quantity." }),
    }),
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      if (state.done) {
        return {
          content: [{ type: 'text' as const, text: 'Negotiation already concluded.' }],
          details: { concluded: true },
        };
      }
      const terms: DealTerms = {
        pricePerUnit: params.pricePerUnit,
        grade: params.grade,
        quantity: params.quantity,
      };

      if (insideContract(terms, state.contract)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Refused — those terms are inside the contract. Call accept_deal instead of escalate.',
            },
          ],
          details: { refused: true, reason: 'inside_contract', terms },
        };
      }

      state.neg.state = 'ESCALATED';
      state.neg.currentOffer = terms;
      state.neg.transcript.push({ speaker: 'sanket', message: params.message, offer: terms });
      state.neg.outcome = `${params.message} ${escalationNote(terms, state.contract)}`.trim();
      state.done = true;
      await saveNegotiation(state.neg);
      await setMandateStatus(state.neg.mandateId, 'negotiating');
      log.info('sanket.done', { baleId: state.bale.id, state: 'ESCALATED', terms });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Escalated to the buyer. Best available: $${terms.pricePerUnit}/unit, grade ${terms.grade}, ${terms.quantity} units.`,
          },
        ],
        details: { escalated: true, terms, outcome: state.neg.outcome },
      };
    },
  });
}
