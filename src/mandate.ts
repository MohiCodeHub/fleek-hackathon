import { insertMandate } from './db/index.js';
import { id } from './ids.js';
import { generateJSON, type JSONSchema } from './llm.js';
import { log } from './log.js';
import { type Grade, isGrade, type Mandate } from './types.js';

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

const MISSING_FIELDS = new Set<MissingField>(['quantity', 'priceCeiling', 'category']);

/** Reconcile model-reported missing[] with actual values (code is source of truth). */
export function reconcileMissing(ex: {
  category: string;
  quantity: number;
  priceCeiling: number;
  missing?: unknown;
}): MissingField[] {
  const missing = new Set<MissingField>();
  const reported = Array.isArray(ex.missing) ? ex.missing : [];
  for (const m of reported) {
    if (typeof m === 'string' && MISSING_FIELDS.has(m as MissingField)) {
      missing.add(m as MissingField);
    }
  }
  if (!ex.category?.trim()) missing.add('category');
  else missing.delete('category');
  if (!(typeof ex.quantity === 'number' && Number.isFinite(ex.quantity) && ex.quantity > 0)) {
    missing.add('quantity');
  } else {
    missing.delete('quantity');
  }
  if (
    !(
      typeof ex.priceCeiling === 'number' &&
      Number.isFinite(ex.priceCeiling) &&
      ex.priceCeiling > 0
    )
  ) {
    missing.add('priceCeiling');
  } else {
    missing.delete('priceCeiling');
  }
  return [...missing];
}

/** Null if mandate is ready to match/negotiate; otherwise a refusal message. */
export function mandateReadyMessage(mandate: Mandate): string | null {
  const missing = reconcileMissing({
    category: mandate.category,
    quantity: mandate.quantity,
    priceCeiling: mandate.priceCeiling,
  });
  if (!isGrade(mandate.gradeFloor)) {
    return 'Mandate has an invalid grade floor. Re-run extract_mandate.';
  }
  if (missing.length > 0) {
    return `Mandate is incomplete (missing: ${missing.join(', ')}). Ask the buyer for those fields and call extract_mandate again before matching or negotiating.`;
  }
  return null;
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

  const gradeFloor: Grade = isGrade(ex.gradeFloor) ? ex.gradeFloor : 'C';
  const quantity =
    typeof ex.quantity === 'number' && Number.isFinite(ex.quantity) ? Math.max(0, ex.quantity) : 0;
  const priceCeiling =
    typeof ex.priceCeiling === 'number' && Number.isFinite(ex.priceCeiling)
      ? Math.max(0, ex.priceCeiling)
      : 0;
  const category = typeof ex.category === 'string' ? ex.category.trim() : '';
  const style = typeof ex.style === 'string' ? ex.style.trim() : '';
  const missing = reconcileMissing({
    category,
    quantity,
    priceCeiling,
    missing: ex.missing,
  });

  const mandate: Mandate = {
    id: id('mnd'),
    buyerPhone,
    category: category || 'unspecified',
    style: style || 'unspecified',
    quantity,
    gradeFloor,
    priceCeiling,
    rawText: demand,
    status: 'open',
  };
  await insertMandate(mandate);
  log.info('mandate.extract', {
    mandateId: mandate.id,
    missing,
    quantity: mandate.quantity,
    priceCeiling: mandate.priceCeiling,
    gradeFloor: mandate.gradeFloor,
  });
  return { mandate, missing };
}
