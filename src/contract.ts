import type { DealTerms, Mandate, MandateContract } from './types.js';
import { gradeRank } from './types.js';

/** The buyer's contract that bounds autonomous negotiation. */
export function contractOf(mandate: Mandate): MandateContract {
  return {
    priceCeiling: mandate.priceCeiling,
    gradeFloor: mandate.gradeFloor,
    quantity: mandate.quantity,
  };
}

/** True iff the terms sit inside the mandate (<= price, >= grade, >= quantity). */
export function insideContract(terms: DealTerms, c: MandateContract): boolean {
  return (
    terms.pricePerUnit <= c.priceCeiling &&
    gradeRank(terms.grade) >= gradeRank(c.gradeFloor) &&
    terms.quantity >= c.quantity
  );
}

/** Human-readable note describing how `terms` fall outside the contract. */
export function escalationNote(terms: DealTerms, c: MandateContract): string {
  const gaps: string[] = [];
  if (terms.pricePerUnit > c.priceCeiling)
    gaps.push(`price $${terms.pricePerUnit} is above the $${c.priceCeiling} ceiling`);
  if (gradeRank(terms.grade) < gradeRank(c.gradeFloor))
    gaps.push(`grade ${terms.grade} is below the ${c.gradeFloor} floor`);
  if (terms.quantity < c.quantity)
    gaps.push(`only ${terms.quantity} units vs ${c.quantity} needed`);
  const best = `best available: $${terms.pricePerUnit}/unit, grade ${terms.grade}, ${terms.quantity} units`;
  return gaps.length ? `Outside the mandate — ${gaps.join('; ')}. ${best}.` : `Escalated. ${best}.`;
}
