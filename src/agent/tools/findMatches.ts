import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { searchCatalogProducts } from '../../catalogSearch.js';
import { getMandate } from '../../db/index.js';
import { llmMatcher } from '../../matching.js';

/**
 * find_matches: score and rank supplier inventory (messy bulk bales) against a
 * mandate, plus matching Fleek catalog lots with product page URLs.
 */
export const findMatchesTool = defineTool({
  name: 'find_matches',
  label: 'Find Matches',
  description:
    'Score and rank supplier inventory (messy bulk bales) against a mandate, and return matching Fleek catalog lots with product page links. Call after extract_mandate returns a complete mandate.',
  promptSnippet:
    'Ranks supplier bales against a mandate; also returns Fleek catalog lots with urls.',
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

    const catalog = await searchCatalogProducts(mandate);
    const catalogMatches = catalog.map((p, i) => ({
      rank: i + 1,
      collection: p.collection,
      productId: p.id,
      name: p.name,
      price: p.price,
      currency: p.currency,
      pricePerPiece: p.pricePerPiece,
      url: p.url,
      fitScore: p.fitScore,
    }));

    const baleText = ranked
      .map(
        (m) =>
          `${m.rank}. ${m.supplierName} — ${m.bale.description}\n   ${m.bale.category}/${m.bale.era} | brands: ${m.bale.brands.join(', ')} | grade ${m.bale.grade} | ~${m.bale.quantity} units | ask $${m.bale.askPrice}/unit | fit ${m.score}/100\n   ${m.rationale}`,
      )
      .join('\n\n');

    const catalogText = catalogMatches
      .map(
        (p) =>
          `${p.rank}. ${p.name}\n   ${p.currency} ${p.price} lot (${p.currency} ${p.pricePerPiece}/pc) | fit ${p.fitScore}\n   ${p.url}`,
      )
      .join('\n\n');

    const sections: string[] = [];
    sections.push(
      baleText
        ? `Supplier bales:\n\n${baleText}`
        : 'Supplier bales:\n\nNo plausible bale matches found.',
    );
    if (catalogText) {
      sections.push(
        `Fleek catalog lots (share these product links with the buyer):\n\n${catalogText}`,
      );
    }

    return {
      content: [{ type: 'text' as const, text: sections.join('\n\n') }],
      details: { mandateId: mandate.id, matches, catalogMatches },
    };
  },
});
