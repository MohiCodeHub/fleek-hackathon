import { getBale, getBuyer, upsertBuyer } from './db/index.js';

/**
 * The memory brain (deterministic v1). After each Jack interaction, distil
 * revealed preferences into the buyer's profile — brands actually pursued,
 * mandates raised, deals closed — so future matching and conversation sharpen
 * over time. Mirrors Fleek's data-flywheel thesis.
 */

interface Executed {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
}

function pushUnique(arr: string[], value: string, cap = 12): void {
  if (value && !arr.includes(value)) {
    arr.push(value);
    if (arr.length > cap) arr.shift();
  }
}

export async function learnFromInteraction(
  buyerPhone: string,
  executed: Executed[],
): Promise<void> {
  const buyer = await getBuyer(buyerPhone);
  if (!buyer) return;
  let changed = false;

  for (const call of executed) {
    const out = call.output as Record<string, unknown> | undefined;
    if (!out) continue;

    if (call.name === 'extract_mandate' && out.category) {
      const note =
        `Wants ${out.style ?? ''} ${out.category} (~${out.quantity} units, grade ≥ ${out.gradeFloor}, ≤ $${out.priceCeiling}/unit)`
          .replace(/\s+/g, ' ')
          .trim();
      pushUnique(buyer.profile.notes, note, 8);
      changed = true;
    }

    if (call.name === 'negotiate' && Array.isArray(out.outcomes)) {
      for (const o of out.outcomes as Array<Record<string, unknown>>) {
        if (o.state === 'CLOSED') {
          const bale = o.baleId ? await getBale(String(o.baleId)) : null;
          if (bale) for (const brand of bale.brands) pushUnique(buyer.profile.brandsPursued, brand);
          const terms = o.terms as
            | { pricePerUnit?: number; grade?: string; quantity?: number }
            | undefined;
          if (terms) {
            pushUnique(
              buyer.profile.notes,
              `Closed with ${o.supplier} at $${terms.pricePerUnit}/unit (grade ${terms.grade}, ${terms.quantity} units)`,
              8,
            );
          }
          changed = true;
        }
      }
    }
  }

  if (changed) await upsertBuyer(buyer);
}
