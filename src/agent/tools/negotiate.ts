import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { getMandate } from '../../db/index.js';
import { negotiateSelections } from '../../negotiation.js';

/**
 * negotiate: dispatch Sanket to negotiate the buyer's chosen bale(s) with the
 * supplier(s), autonomously within the mandate. Returns, per option, whether
 * it CLOSED (with final terms) or ESCALATED (terms fell outside the mandate).
 */
export const negotiateTool = defineTool({
  name: 'negotiate',
  label: 'Negotiate',
  description:
    "Dispatch Sanket behind the scenes to negotiate the buyer's chosen option(s) with the supplier, autonomously within the mandate (<= price ceiling, >= grade floor, >= quantity). The buyer stays in this WhatsApp thread with Abhi. Call this once the buyer picks which match(es) to pursue. Returns, per option, whether it CLOSED (with final terms) or ESCALATED (terms fell outside the mandate — needs the buyer's call).",
  promptSnippet: 'Autonomously negotiates chosen bales within the mandate via Sanket.',
  parameters: Type.Object({
    mandateId: Type.String({ description: 'The mandate id.' }),
    baleIds: Type.Array(Type.String(), {
      description:
        'The exact bale id(s) of the option(s) the buyer chose, copied verbatim from the "bale id:" field in find_matches (e.g. bale_atlas_sport90). Do not invent or use rank numbers.',
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
    if (params.baleIds.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No baleIds provided.' }],
        details: { error: 'No baleIds' },
      };
    }
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
