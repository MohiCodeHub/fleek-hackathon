import type { DealTerms, Mandate, MandateContract } from './types.js';
import { gradeRank, isGrade } from './types.js';

/** The buyer's contract that bounds autonomous negotiation. */
export function contractOf(mandate: Mandate): MandateContract {
  return {
    priceCeiling: mandate.priceCeiling,
    gradeFloor: mandate.gradeFloor,
    quantity: mandate.quantity,
  };
}

function finiteNonNeg(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/** True iff the terms sit inside the mandate (<= price, >= grade, >= quantity). */
export function insideContract(terms: DealTerms, c: MandateContract): boolean {
  if (!finiteNonNeg(terms.pricePerUnit) || !finiteNonNeg(c.priceCeiling)) return false;
  if (
    typeof terms.quantity !== 'number' ||
    !Number.isFinite(terms.quantity) ||
    terms.quantity <= 0 ||
    typeof c.quantity !== 'number' ||
    !Number.isFinite(c.quantity) ||
    c.quantity <= 0
  ) {
    return false;
  }
  if (!isGrade(terms.grade) || !isGrade(c.gradeFloor)) return false;
  const termRank = gradeRank(terms.grade);
  const floorRank = gradeRank(c.gradeFloor);
  if (termRank === null || floorRank === null) return false;

  return (
    terms.pricePerUnit <= c.priceCeiling && termRank >= floorRank && terms.quantity >= c.quantity
  );
}

/** Human-readable note describing how `terms` fall outside the contract. */
export function escalationNote(terms: DealTerms, c: MandateContract): string {
  const gaps: string[] = [];
  if (!finiteNonNeg(terms.pricePerUnit) || terms.pricePerUnit > c.priceCeiling) {
    gaps.push(`price $${terms.pricePerUnit} is above the $${c.priceCeiling} ceiling`);
  }
  const termRank = gradeRank(terms.grade);
  const floorRank = gradeRank(c.gradeFloor);
  if (termRank === null || floorRank === null || termRank < floorRank) {
    gaps.push(`grade ${terms.grade} is below the ${c.gradeFloor} floor`);
  }
  if (
    typeof terms.quantity !== 'number' ||
    !Number.isFinite(terms.quantity) ||
    terms.quantity < c.quantity
  ) {
    gaps.push(`only ${terms.quantity} units vs ${c.quantity} needed`);
  }
  const best = `best available: $${terms.pricePerUnit}/unit, grade ${terms.grade}, ${terms.quantity} units`;
  return gaps.length ? `Outside the mandate — ${gaps.join('; ')}. ${best}.` : `Escalated. ${best}.`;
}

/** True when accept_deal terms match the latest supplier structured counter. */
export function termsMatchSupplier(
  claimed: DealTerms,
  supplier: DealTerms,
  priceTolerance = 0.02,
): boolean {
  if (!isGrade(claimed.grade) || claimed.grade !== supplier.grade) return false;
  if (claimed.quantity !== supplier.quantity) return false;
  return Math.abs(claimed.pricePerUnit - supplier.pricePerUnit) <= priceTolerance;
}
