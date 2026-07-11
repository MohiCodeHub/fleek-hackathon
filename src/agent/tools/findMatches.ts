import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { getMandate } from '../../db/index.js';
import { llmMatcher } from '../../matching.js';

/**
 * find_matches: score and rank supplier inventory (messy bulk bales) against a
 * mandate. Returns ranked options across suppliers, each with a fit rationale.
 */
export const findMatchesTool = defineTool({
  name: 'find_matches',
  label: 'Find Matches',
  description:
    'Score and rank supplier inventory (messy bulk bales) against a mandate. Call after extract_mandate returns a complete mandate. Returns ranked options across suppliers, each labelled with its exact bale id (e.g. bale_atlas_sport90) plus a fit rationale. When the buyer picks an option, pass that exact bale id to negotiate.',
  promptSnippet: 'Ranks supplier bales against a mandate with fit rationale.',
  parameters: Type.Object({
    mandateId: Type.String({ description: 'The mandate id from extract_mandate.' }),
  }),
  execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
    const mandate = await getMandate(params.mandateId);
    if (!mandate) {
      return {
        content: [
          { type: 'text' as const, text: 'Unknown mandateId. Call extract_mandate first.' },
        ],
        details: { error: 'Unknown mandateId' },
      };
    }
    const ranked = await llmMatcher.rank(mandate);
    const matches = ranked.map((m) => ({
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
    }));
    const text = ranked
      .map(
        (m) =>
          `${m.rank}. ${m.supplierName} — ${m.bale.description}\n   bale id: ${m.baleId} | ${m.bale.category}/${m.bale.era} | brands: ${m.bale.brands.join(', ')} | grade ${m.bale.grade} | ~${m.bale.quantity} units | ask $${m.bale.askPrice}/unit | fit ${m.score}/100\n   ${m.rationale}`,
      )
      .join('\n\n');
    return {
      content: [{ type: 'text' as const, text: text || 'No plausible matches found.' }],
      details: { mandateId: mandate.id, matches },
    };
  },
});
