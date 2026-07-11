import { StringEnum } from '@earendil-works/pi-ai';
import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { escalationNote, insideContract, termsMatchSupplier } from '../../contract.js';
import { saveDeal, saveNegotiation, setMandateStatus } from '../../db/index.js';
import { id } from '../../ids.js';
import { log } from '../../log.js';
import type { NegotiationRuntime } from '../../negotiation.js';
import type { DealTerms, Grade } from '../../types.js';

/**
 * accept_deal: accept the supplier's current terms and close. Enforces the
 * contract in code: only closes when the terms are inside the mandate; refuses
 * (returns an error) otherwise, so Sanket must escalate or keep negotiating.
 */
export function acceptDealTool(state: NegotiationRuntime) {
  return defineTool({
    name: 'accept_deal',
    label: 'Accept Deal',
    description:
      "Accept the supplier's current terms and close the deal. Pass the exact supplier terms from the latest counter. The tool checks the terms against the contract and against the latest supplier structured counter. It closes only when price <= ceiling, grade >= floor, quantity >= needed, and terms match the supplier. If refused, escalate or keep negotiating.",
    promptSnippet: 'Closes the deal if terms match supplier and sit inside the mandate.',
    parameters: Type.Object({
      message: Type.String({ description: 'Your closing confirmation line to the supplier.' }),
      pricePerUnit: Type.Number({ description: 'The price per unit in USD you are accepting.' }),
      grade: StringEnum(['A', 'B', 'C', 'D'] as const satisfies readonly Grade[], {
        description: 'The grade being accepted.',
      }),
      quantity: Type.Integer({ description: 'The number of units being accepted.' }),
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

      if (!state.lastSupplierTerms) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Refused — no structured supplier counter on the table yet. Call make_offer first and wait for their terms.',
            },
          ],
          details: { refused: true, reason: 'no_supplier_terms', terms },
        };
      }

      if (!termsMatchSupplier(terms, state.lastSupplierTerms)) {
        const s = state.lastSupplierTerms;
        return {
          content: [
            {
              type: 'text' as const,
              text: `Refused — those terms do not match the supplier's latest counter ($${s.pricePerUnit}/unit, grade ${s.grade}, ${s.quantity} units). Accept the supplier's numbers, or keep negotiating.`,
            },
          ],
          details: {
            refused: true,
            reason: 'mismatch_supplier',
            terms,
            supplierTerms: state.lastSupplierTerms,
          },
        };
      }

      if (!insideContract(terms, state.contract)) {
        const note = escalationNote(terms, state.contract);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Refused — those terms are outside the contract: ${note}. Do not accept outside terms. Keep negotiating, or call escalate if this is the supplier's best-and-final.`,
            },
          ],
          details: { refused: true, reason: 'outside_contract', terms, gap: note },
        };
      }

      state.neg.transcript.push({ speaker: 'sanket', message: params.message, offer: terms });
      state.neg.currentOffer = terms;
      state.neg.state = 'CLOSED';
      state.neg.outcome = `Closed at $${terms.pricePerUnit}/unit, grade ${terms.grade}, ${terms.quantity} units.`;
      state.done = true;
      await saveNegotiation(state.neg);
      await saveDeal({ id: id('deal'), negotiationId: state.neg.id, terms, status: 'closed' });
      await setMandateStatus(state.neg.mandateId, 'closed');
      log.info('sanket.done', { baleId: state.bale.id, state: 'CLOSED', terms });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Deal closed at $${terms.pricePerUnit}/unit, grade ${terms.grade}, ${terms.quantity} units.`,
          },
        ],
        details: { closed: true, terms },
      };
    },
  });
}
