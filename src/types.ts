/** Shared domain types for Abhi & Sanket. */

export type Grade = 'A' | 'B' | 'C' | 'D';

/** Grade quality ordering — higher index = better quality. */
export const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A'];

export function gradeRank(g: Grade): number {
  return GRADE_ORDER.indexOf(g);
}

/** A buyer's revealed-preference profile, accreted by the memory brain. */
export interface BuyerProfile {
  brandsPursued: string[];
  priceSensitivity?: 'low' | 'medium' | 'high';
  gradeTolerance?: string;
  notes: string[];
}

/** A supplier's profile — public stock character + private negotiation behaviour. */
export interface SupplierProfile {
  /** Free-text description of what they typically hold. */
  stockCharacter: string;
  /** Private: reservation (walk-away) discount off ask, 0..1. Never revealed to the buyer. */
  floorDiscount: number;
  /** Private: haggling style, drives the simulated responder. */
  negotiationStyle: string;
  notes: string[];
}

export interface Buyer {
  phone: string;
  name: string;
  company: string | null;
  /** ISO timestamp once onboarding (name + company captured) is complete; null until then. */
  onboardedAt: string | null;
  profile: BuyerProfile;
}

export interface Supplier {
  id: string;
  phone: string;
  name: string;
  profile: SupplierProfile;
}

/** A messy bulk bale — the fuzzy inventory unit we match against. */
export interface Bale {
  id: string;
  supplierId: string;
  description: string;
  category: string;
  era: string;
  brands: string[];
  grade: Grade;
  quantity: number;
  /** Supplier's opening ask, per unit, in USD. */
  askPrice: number;
}

/** Demo web-catalog product (the /collections funnel), not agent bale inventory. */
export interface Product {
  id: number;
  collection: 'mens-unisex' | 'womens';
  name: string;
  price: number;
  originalPrice: number | null;
  currency: string;
  pricePerPiece: number;
  /** Canonical joinfleek.com product page. */
  url: string;
}

/** One page of demo catalog products. */
export interface ProductPage {
  total: number;
  offset: number;
  limit: number;
  data: Product[];
}

/** Structured demand extracted from a buyer's natural-language message. */
export interface Mandate {
  id: string;
  buyerPhone: string;
  category: string;
  style: string;
  quantity: number;
  gradeFloor: Grade;
  priceCeiling: number;
  rawText: string;
  status: 'open' | 'matched' | 'negotiating' | 'closed';
}

/** One ranked match of a bale against a mandate. */
export interface Match {
  mandateId: string;
  baleId: string;
  supplierId: string;
  /** 0..100 fit score. */
  score: number;
  rationale: string;
  rank: number;
}

export type NegotiationState = 'OPEN' | 'COUNTERING' | 'CLOSED' | 'ESCALATED';

/** One turn in a negotiation transcript. */
export interface NegotiationTurn {
  speaker: 'sanket' | 'supplier';
  message: string;
  /** Optional structured terms attached to this turn. */
  offer?: DealTerms;
}

/** Concrete terms on the table. */
export interface DealTerms {
  pricePerUnit: number;
  grade: Grade;
  quantity: number;
}

export interface Negotiation {
  id: string;
  mandateId: string;
  baleId: string;
  supplierId: string;
  state: NegotiationState;
  currentOffer: DealTerms | null;
  transcript: NegotiationTurn[];
  outcome: string | null;
}

export interface Deal {
  id: string;
  negotiationId: string;
  terms: DealTerms;
  status: 'closed' | 'pending_buyer';
}

/** The buyer's contract that bounds autonomous negotiation. */
export interface MandateContract {
  priceCeiling: number;
  gradeFloor: Grade;
  quantity: number;
}
