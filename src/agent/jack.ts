import { runAgent, type Tool } from './harness.js';
import type { Msg } from '../llm.js';
import { loadPersona } from '../personas.js';
import { extractMandate } from '../mandate.js';
import { llmMatcher } from '../matching.js';
import { negotiateSelections } from '../negotiation.js';
import { learnFromInteraction } from '../memory.js';
import { getBuyer, getMandate } from '../db/index.js';
import type { Buyer } from '../types.js';

/** Build Jack's dynamic system prompt: persona + buyer context. */
function jackSystem(buyer: Buyer | null): string {
  const persona = loadPersona('jack');
  const ctx = buyer
    ? `\n\n---\nBUYER CONTEXT\nName: ${buyer.name}\nKnown preferences: ${
        buyer.profile.brandsPursued.length
          ? buyer.profile.brandsPursued.join(', ')
          : '(none yet — this may be a new buyer)'
      }${buyer.profile.notes.length ? `\nNotes: ${buyer.profile.notes.join('; ')}` : ''}`
    : '\n\n---\nBUYER CONTEXT\nNew buyer, no profile yet.';
  return persona + ctx;
}

/** extract_mandate tool: NL demand -> structured mandate (+ missing fields). */
function extractMandateTool(buyerPhone: string): Tool {
  return {
    def: {
      name: 'extract_mandate',
      description:
        "Turn the buyer's natural-language demand into a structured sourcing mandate. Call this once you have (or have asked for) the key details. Returns the mandate id, the parsed fields, and any critical fields the buyer still hasn't specified.",
      parameters: {
        type: 'object',
        properties: {
          demand: {
            type: 'string',
            description:
              "The buyer's full demand in their own words, combining everything they've said so far (category/style, quantity, grade, budget).",
          },
        },
        required: ['demand'],
        additionalProperties: false,
      },
    },
    handler: async (input) => {
      const { mandate, missing } = await extractMandate(buyerPhone, String(input.demand ?? ''));
      return {
        mandateId: mandate.id,
        category: mandate.category,
        style: mandate.style,
        quantity: mandate.quantity,
        gradeFloor: mandate.gradeFloor,
        priceCeiling: mandate.priceCeiling,
        missing,
      };
    },
  };
}

/** find_matches tool: rank supplier bales against a mandate. */
const findMatchesTool: Tool = {
  def: {
    name: 'find_matches',
    description:
      'Score and rank supplier inventory (messy bulk bales) against a mandate. Call after extract_mandate returns a complete mandate. Returns ranked options across suppliers, each with a fit rationale.',
    parameters: {
      type: 'object',
      properties: {
        mandateId: { type: 'string', description: 'The mandate id from extract_mandate.' },
      },
      required: ['mandateId'],
      additionalProperties: false,
    },
  },
  handler: async (input) => {
    const mandate = await getMandate(String(input.mandateId ?? ''));
    if (!mandate) return { error: 'Unknown mandateId. Call extract_mandate first.' };
    const ranked = await llmMatcher.rank(mandate);
    return {
      mandateId: mandate.id,
      matches: ranked.map((m) => ({
        rank: m.rank,
        baleId: m.baleId,
        supplier: m.supplierName,
        summary: m.bale.description,
        category: m.bale.category,
        era: m.bale.era,
        brands: m.bale.brands,
        grade: m.bale.grade,
        quantity: m.bale.quantity,
        askPricePerUnit: m.bale.askPrice,
        fitScore: m.score,
        rationale: m.rationale,
      })),
    };
  },
};

/** negotiate tool: dispatch Jill to negotiate the buyer's chosen bale(s). */
const negotiateTool: Tool = {
  def: {
    name: 'negotiate',
    description:
      "Dispatch Jill to negotiate the buyer's chosen option(s) with the supplier, autonomously within the mandate (<= price ceiling, >= grade floor, >= quantity). Call this once the buyer picks which match(es) to pursue. Returns, per option, whether it CLOSED (with final terms) or ESCALATED (terms fell outside the mandate — needs the buyer's call).",
    parameters: {
      type: 'object',
      properties: {
        mandateId: { type: 'string', description: 'The mandate id.' },
        baleIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'The bale id(s) of the option(s) the buyer chose to pursue.',
        },
      },
      required: ['mandateId', 'baleIds'],
      additionalProperties: false,
    },
  },
  handler: async (input) => {
    const mandateId = String(input.mandateId ?? '');
    const baleIds = Array.isArray(input.baleIds) ? input.baleIds.map(String) : [];
    if (!(await getMandate(mandateId))) return { error: 'Unknown mandateId.' };
    if (baleIds.length === 0) return { error: 'No baleIds provided.' };
    const outcomes = await negotiateSelections(mandateId, baleIds);
    return { outcomes };
  },
};

/** Jack's full tool set for a given buyer. */
export function jackTools(buyerPhone: string): Tool[] {
  return [extractMandateTool(buyerPhone), findMatchesTool, negotiateTool];
}

/**
 * Run Jack for one inbound buyer message. Returns his reply and the updated
 * history to persist for the next turn.
 */
export async function runJack(
  buyerPhone: string,
  history: Msg[],
  userMessage: string,
): Promise<{ reply: string; history: Msg[] }> {
  const buyer = await getBuyer(buyerPhone);
  const withUser: Msg[] = [...history, { role: 'user', content: userMessage }];
  const result = await runAgent({
    system: jackSystem(buyer),
    history: withUser,
    tools: jackTools(buyerPhone),
  });
  // Memory brain: distil revealed preferences into the buyer's profile.
  await learnFromInteraction(buyerPhone, result.toolCalls);
  return { reply: result.reply, history: result.history };
}
