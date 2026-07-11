import { insertMandate } from './db/index.js';
import { id } from './ids.js';
import { generateJSON, type JSONSchema } from './llm.js';
import type { Grade, Mandate } from './types.js';

/** Critical fields a mandate needs before matching is worthwhile. */
export type MissingField = 'quantity' | 'priceCeiling' | 'category';

interface Extraction {
  category: string;
  style: string;
  quantity: number;
  gradeFloor: Grade;
  priceCeiling: number;
  missing: MissingField[];
}

const SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      description: 'Product category, e.g. "sportswear", "denim", "streetwear", "mixed vintage".',
    },
    style: {
      type: 'string',
      description: 'Style/era descriptors, e.g. "90s branded", "Y2K", "vintage graphic tees".',
    },
    quantity: {
      type: 'integer',
      description: 'Units the buyer wants. Use 0 if not stated (and list "quantity" in missing).',
    },
    gradeFloor: {
      type: 'string',
      enum: ['A', 'B', 'C', 'D'],
      description: 'Minimum acceptable grade. Default "C" if the buyer gave no quality bar.',
    },
    priceCeiling: {
      type: 'number',
      description:
        'Max price per unit in USD. Use 0 if not stated (and list "priceCeiling" in missing).',
    },
    missing: {
      type: 'array',
      items: { type: 'string', enum: ['quantity', 'priceCeiling', 'category'] },
      description: 'Critical fields the buyer did NOT specify.',
    },
  },
  required: ['category', 'style', 'quantity', 'gradeFloor', 'priceCeiling', 'missing'],
  additionalProperties: false,
};

const SYSTEM = `You extract a structured sourcing mandate from a B2B secondhand-fashion buyer's natural-language demand. Be faithful to what they said; do not invent constraints they didn't state. Quantities like "around 300" -> 300. Budgets like "under $5/unit" -> 5. If they gave no quality bar, default gradeFloor to "C". Flag genuinely-unstated critical fields in "missing".`;

export interface ExtractResult {
  mandate: Mandate;
  missing: MissingField[];
}

/** Extract a structured mandate from the buyer's demand and persist it. */
export async function extractMandate(buyerPhone: string, demand: string): Promise<ExtractResult> {
  const ex = await generateJSON<Extraction>({
    system: SYSTEM,
    messages: [{ role: 'user', content: demand }],
    schema: SCHEMA,
    toolName: 'emit_mandate',
    toolDescription: 'Emit the structured sourcing mandate.',
  });

  const mandate: Mandate = {
    id: id('mnd'),
    buyerPhone,
    category: ex.category,
    style: ex.style,
    quantity: ex.quantity,
    gradeFloor: ex.gradeFloor,
    priceCeiling: ex.priceCeiling,
    rawText: demand,
    status: 'open',
  };
  await await insertMandate(mandate);
  return { mandate, missing: ex.missing ?? [] };
}
