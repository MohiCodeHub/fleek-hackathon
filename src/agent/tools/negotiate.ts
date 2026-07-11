import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { getMandate } from '../../db/index.js';
import { log } from '../../log.js';
import { mandateReadyMessage } from '../../mandate.js';
import { negotiateSelections } from '../../negotiation.js';

/**
 * negotiate: dispatch Sanket to negotiate the buyer's chosen bale(s) with the
 * supplier(s), autonomously within the mandate. Returns, per option, whether
 * it CLOSED (with final terms) or ESCALATED (terms fell outside the mandate).
 */
export function makeNegotiateTool(buyerPhone: string) {
  return defineTool({
    name: 'negotiate',
    label: 'Negotiate',
    description:
      "Dispatch Sanket behind the scenes to negotiate the buyer's chosen option(s) with the supplier, autonomously within the mandate (<= price ceiling, >= grade floor, >= quantity). Pass exact baleId values from find_matches (the ids in [brackets]) — never invent ids and never pass catalog productId values. Returns, per option, whether it CLOSED (with final terms) or ESCALATED.",
    promptSnippet:
      'Autonomously negotiates chosen bales (exact baleId from find_matches) via Sanket.',
    parameters: Type.Object({
      mandateId: Type.String({ description: 'The mandate id.' }),
      baleIds: Type.Array(Type.String(), {
        description:
          'Exact baleId string(s) from find_matches (e.g. bale_atlas_sport90). Never invent; never use catalog productId.',
      }),
    }),
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const mandate = await getMandate(params.mandateId);
      if (!mandate) {
        return {
          content: [{ type: 'text' as const, text: 'Unknown mandateId.' }],
          details: { error: 'Unknown mandateId' },
        };
      }
      if (mandate.buyerPhone !== buyerPhone) {
        return {
          content: [{ type: 'text' as const, text: 'That mandate belongs to a different buyer.' }],
          details: { error: 'Mandate ownership mismatch' },
        };
      }
      const notReady = mandateReadyMessage(mandate);
      if (notReady) {
        return {
          content: [{ type: 'text' as const, text: notReady }],
          details: { error: 'Incomplete mandate', mandateId: mandate.id },
        };
      }
      if (params.baleIds.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No baleIds provided.' }],
          details: { error: 'No baleIds' },
        };
      }
      log.info('negotiate.start', {
        mandateId: params.mandateId,
        baleIds: params.baleIds,
      });
      const outcomes = await negotiateSelections(params.mandateId, params.baleIds);
      const text = outcomes
        .map((o) => {
          if (o.state === 'CLOSED' && o.terms) {
            return `${o.supplier} (${o.baleId}): CLOSED at $${o.terms.pricePerUnit}/unit, grade ${o.terms.grade}, ${o.terms.quantity} units.`;
          }
          return `${o.supplier} (${o.baleId}): ESCALATED — ${o.outcome ?? 'no agreement inside the mandate.'}`;
        })
        .join('\n\n');
      return {
        content: [{ type: 'text' as const, text }],
        details: { mandateId: params.mandateId, outcomes },
      };
    },
  });
}
