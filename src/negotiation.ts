import { buildAgent } from './agent/factory.js';
import { contractOf, escalationNote } from './contract.js';
import { getBale, getMandate, getSupplier, saveNegotiation, setMandateStatus } from './db/index.js';
import { id } from './ids.js';
import { log } from './log.js';
import type { Bale, DealTerms, Mandate, MandateContract, Negotiation, Supplier } from './types.js';

/**
 * Mutable state shared between Sanket's tools for one bale negotiation. The tools
 * (make_offer / accept_deal / escalate) close over this and mutate it as they
 * run; `negotiateBale` reads the final state after the agent loop settles.
 */
export interface NegotiationRuntime {
  neg: Negotiation;
  contract: MandateContract;
  bale: Bale;
  supplier: Supplier;
  /** Number of offers made so far (incremented by make_offer). */
  rounds: number;
  /** True once accept_deal or escalate has fired. */
  done: boolean;
  /** Latest structured counter from the supplier sim. */
  lastSupplierTerms: DealTerms | null;
}

/** Negotiate a single bale for a mandate. Autonomous within the contract. */
export async function negotiateBale(
  mandate: Mandate,
  bale: Bale,
  supplier: Supplier,
): Promise<Negotiation> {
  const contract = contractOf(mandate);

  const neg: Negotiation = {
    id: id('neg'),
    mandateId: mandate.id,
    baleId: bale.id,
    supplierId: supplier.id,
    state: 'OPEN',
    currentOffer: null,
    transcript: [],
    outcome: null,
  };

  const runtime: NegotiationRuntime = {
    neg,
    contract,
    bale,
    supplier,
    rounds: 0,
    done: false,
    lastSupplierTerms: null,
  };

  await setMandateStatus(mandate.id, 'negotiating');

  const session = await buildAgent({ persona: 'sanket', sanketRuntime: runtime });
  try {
    await session.prompt(
      'Begin negotiating the bale above for the buyer. Make your opening offer to the supplier using make_offer, then converge. The moment the supplier terms are inside the contract, call accept_deal with those exact supplier numbers. If their best-and-final is outside the contract, call escalate.',
    );
  } finally {
    session.dispose();
  }

  // If the agent loop ended without Sanket explicitly closing or escalating
  // (e.g. it ran out of internal steps), force an escalation with the last
  // supplier terms when present so the buyer always gets a clear outcome.
  if (!runtime.done) {
    const terms = runtime.lastSupplierTerms ?? neg.currentOffer;
    neg.state = 'ESCALATED';
    neg.currentOffer = terms;
    const source = runtime.lastSupplierTerms ? 'last supplier counter' : 'Sanket last offer';
    neg.outcome = `${
      terms
        ? `No agreement inside the contract (${source}). ${escalationNote(terms, contract)}`
        : 'No agreement reached.'
    } (Sanket did not explicitly conclude.)`;
    await saveNegotiation(neg);
    log.info('sanket.done', { baleId: bale.id, state: 'ESCALATED', reason: 'force' });
  }

  return neg;
}

export interface NegotiationOutcome {
  supplier: string;
  baleId: string;
  state: Negotiation['state'];
  terms: DealTerms | null;
  outcome: string | null;
}

/** Negotiate one or more selected bales for a mandate (used by Abhi). */
export async function negotiateSelections(
  mandateId: string,
  baleIds: string[],
): Promise<NegotiationOutcome[]> {
  const mandate = await getMandate(mandateId);
  if (!mandate) throw new Error('Unknown mandateId');

  const outcomes: NegotiationOutcome[] = [];
  for (const baleId of baleIds) {
    const bale = await getBale(baleId);
    if (!bale) {
      log.warn('negotiate.unknown_bale', { mandateId, baleId });
      outcomes.push({
        supplier: '?',
        baleId,
        state: 'ESCALATED',
        terms: null,
        outcome: `Unknown baleId "${baleId}". Use exact baleId from find_matches.`,
      });
      continue;
    }
    const supplier = await getSupplier(bale.supplierId);
    if (!supplier) {
      outcomes.push({
        supplier: '?',
        baleId,
        state: 'ESCALATED',
        terms: null,
        outcome: 'Unknown supplier.',
      });
      continue;
    }
    log.info('negotiate.start', { mandateId, baleId, supplier: supplier.name });
    const neg = await negotiateBale(mandate, bale, supplier);
    log.info('negotiate.outcome', {
      mandateId,
      baleId,
      state: neg.state,
      price: neg.currentOffer?.pricePerUnit,
    });
    outcomes.push({
      supplier: supplier.name,
      baleId,
      state: neg.state,
      terms: neg.currentOffer,
      outcome: neg.outcome,
    });
  }
  return outcomes;
}
