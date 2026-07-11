import { allBales, allSuppliers, saveMatches } from './db/index.js';
import { generateJSON, type JSONSchema } from './llm.js';
import type { Bale, Mandate, Match } from './types.js';

/** A match enriched with its bale + supplier, for presentation & negotiation. */
export interface RankedMatch extends Match {
  bale: Bale;
  supplierName: string;
  supplierStock: string;
}

interface RawMatch {
  baleId: string;
  score: number;
  rationale: string;
}

const SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      description:
        'Best-fitting bales, best first. Include only genuinely plausible options (score >= 30).',
      items: {
        type: 'object',
        properties: {
          baleId: { type: 'string' },
          score: { type: 'integer', description: 'Overall fit, 0-100.' },
          rationale: {
            type: 'string',
            description:
              'One sentence: why it fits (style/era/brand/grade/qty/price), and any caveat (e.g. ask over ceiling, count short, grade mixed).',
          },
        },
        required: ['baleId', 'score', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
};

const SYSTEM = `You match a B2B secondhand-fashion buyer's mandate against messy wholesale bulk bales (not clean SKUs — inference over fuzzy descriptions).

Score each candidate 0-100 on overall fit, weighing:
- Style / era / brand alignment with the mandate (most important).
- Grade vs the buyer's grade floor (below floor is a serious penalty, but a bale can still be worth negotiating if close).
- Quantity vs needed (short counts are a caveat, not always a dealbreaker — suppliers can add units).
- Ask price vs the buyer's ceiling (over ceiling lowers score but is negotiable — flag it as a caveat, don't discard).

Return the plausible options ranked best-first, each with a crisp fit rationale that a buyer would find useful. Do not invent bales; only use the provided candidates.`;

function candidateBlock(bales: Bale[], supplierName: (id: string) => string): string {
  return bales
    .map(
      (b) =>
        `- ${b.id} | supplier: ${supplierName(b.supplierId)} | ${b.category}/${b.era} | brands: ${b.brands.join(', ')} | grade ${b.grade} | qty ~${b.quantity} | ask $${b.askPrice}/unit\n  "${b.description}"`,
    )
    .join('\n');
}

export interface Matcher {
  rank(mandate: Mandate): Promise<RankedMatch[]>;
}

/** LLM semantic matcher (v1). Swappable if Fleek reveals real inventory structure. */
export const llmMatcher: Matcher = {
  async rank(mandate: Mandate): Promise<RankedMatch[]> {
    const bales = await allBales();
    const suppliers = new Map((await allSuppliers()).map((s) => [s.id, s]));
    const bySupplier = (id: string) => suppliers.get(id)?.name ?? id;

    const prompt = `MANDATE
category: ${mandate.category}
style: ${mandate.style}
quantity needed: ${mandate.quantity}
grade floor: ${mandate.gradeFloor}
price ceiling: $${mandate.priceCeiling}/unit

CANDIDATE BALES
${candidateBlock(bales, bySupplier)}`;

    const { matches } = await generateJSON<{ matches: RawMatch[] }>({
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      schema: SCHEMA,
      toolName: 'emit_matches',
      toolDescription: 'Emit the ranked matches.',
    });

    const baleById = new Map(bales.map((b) => [b.id, b]));
    const ranked: RankedMatch[] = [];
    let rank = 1;
    for (const m of matches) {
      const bale = baleById.get(m.baleId);
      if (!bale) continue; // guard against hallucinated ids
      const supplier = suppliers.get(bale.supplierId);
      ranked.push({
        mandateId: mandate.id,
        baleId: bale.id,
        supplierId: bale.supplierId,
        score: m.score,
        rationale: m.rationale,
        rank: rank++,
        bale,
        supplierName: supplier?.name ?? bale.supplierId,
        supplierStock: supplier?.profile.stockCharacter ?? '',
      });
    }

    await saveMatches(
      ranked.map(({ mandateId, baleId, supplierId, score, rationale, rank }) => ({
        mandateId,
        baleId,
        supplierId,
        score,
        rationale,
        rank,
      })),
    );

    return ranked;
  },
};
