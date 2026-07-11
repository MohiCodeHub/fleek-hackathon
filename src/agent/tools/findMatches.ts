import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { searchCatalogProducts } from '../../catalogSearch.js';
import { getMandate, setMandateStatus } from '../../db/index.js';
import { log } from '../../log.js';
import { mandateReadyMessage } from '../../mandate.js';
import { llmMatcher } from '../../matching.js';

/**
 * find_matches: score and rank supplier inventory (messy bulk bales) against a
 * mandate, plus matching Fleek catalog lots with product page URLs and images.
 * Catalog lots are delivered to WhatsApp by the handler (image + caption); Abhi
 * should present negotiable bales only.
 */
export function makeFindMatchesTool(buyerPhone: string) {
  return defineTool({
    name: 'find_matches',
    label: 'Find Matches',
    description:
      'Score and rank supplier inventory (messy bulk bales) against a mandate, and return matching Fleek catalog lots. Call after extract_mandate returns a complete mandate. Present the supplier bales to the buyer (exact baleId for negotiate). Do NOT paste catalog URLs — the system sends Fleek product photos with links automatically. Never invent ids and never pass catalog productId values to negotiate.',
    promptSnippet:
      'Ranks supplier bales (with exact baleId); catalog lots are delivered as product photos automatically — do not paste catalog URLs.',
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

      const ranked = await llmMatcher.rank(mandate);
      await setMandateStatus(mandate.id, 'matched');

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

      type CatalogMatch = {
        rank: number;
        collection: string;
        productId: number;
        name: string;
        price: number;
        currency: string;
        pricePerPiece: number;
        url: string;
        imageUrl: string | null;
        fitScore: number;
      };
      let catalogMatches: CatalogMatch[] = [];
      let catalogError: string | undefined;
      try {
        const catalog = await searchCatalogProducts(mandate);
        catalogMatches = catalog.map((p, i) => ({
          rank: i + 1,
          collection: p.collection,
          productId: p.id,
          name: p.name,
          price: p.price,
          currency: p.currency,
          pricePerPiece: p.pricePerPiece,
          url: p.url,
          imageUrl: p.imageUrl,
          fitScore: p.fitScore,
        }));
      } catch (err) {
        catalogError = err instanceof Error ? err.message : String(err);
      }

      const baleText = ranked
        .map(
          (m) =>
            `${m.rank}. [${m.baleId}] ${m.supplierName} — ${m.bale.description}\n   ${m.bale.category}/${m.bale.era} | brands: ${m.bale.brands.join(', ')} | grade ${m.bale.grade} | ~${m.bale.quantity} units | ask $${m.bale.askPrice}/unit | fit ${m.score}/100\n   ${m.rationale}`,
        )
        .join('\n\n');

      const catalogText = catalogMatches
        .map(
          (p) =>
            `Catalog ${p.rank}. ${p.name}\n   ${p.currency} ${p.price} lot (${p.currency} ${p.pricePerPiece}/pc) | fit ${p.fitScore}\n   ${p.url}${p.imageUrl ? `\n   image: ${p.imageUrl}` : ''}`,
        )
        .join('\n\n');

      const sections: string[] = [
        `mandateId: ${mandate.id}`,
        baleText
          ? `Supplier bales (negotiable — copy the exact baleId in [brackets] for negotiate):\n\n${baleText}`
          : 'Supplier bales:\n\nNo plausible bale matches found.',
      ];
      if (catalogText) {
        sections.push(
          `Fleek catalog lots (browse-only — the system will send these as product photos with links; do NOT paste URLs in your reply; NOT valid negotiate baleIds):\n\n${catalogText}`,
        );
      } else if (catalogError) {
        sections.push(
          'Fleek catalog lots unavailable (database error). Do not invent product URLs. Supplier bale matches above are still valid.',
        );
      }

      log.info('matches.rank', {
        mandateId: mandate.id,
        baleCount: matches.length,
        baleIds: matches.map((m) => m.baleId),
        catalogCount: catalogMatches.length,
        ...(catalogError ? { catalogError } : {}),
      });

      return {
        content: [{ type: 'text' as const, text: sections.join('\n\n') }],
        details: {
          mandateId: mandate.id,
          matches,
          catalogMatches,
          ...(catalogError ? { error: catalogError } : {}),
        },
      };
    },
  });
}
