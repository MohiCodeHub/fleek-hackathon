import { generateJSON, type JSONSchema } from './llm.js';
import { loadPersona } from './personas.js';
import { supplierReply } from './supplier-sim.js';
import { saveNegotiation, saveDeal, getBale, getSupplier, getMandate } from './db/index.js';
import { id } from './ids.js';
import { contractOf, insideContract, escalationNote } from './contract.js';
import type {
  Mandate,
  Bale,
  Supplier,
  Negotiation,
  NegotiationTurn,
  DealTerms,
  MandateContract,
  Grade,
} from './types.js';

const MAX_ROUNDS = 7;

type JillAction = 'offer' | 'accept' | 'escalate';

interface JillDecision {
  action: JillAction;
  message: string;
  terms: { pricePerUnit: number; grade: Grade; quantity: number };
  reasoning: string;
}

const DECISION_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['offer', 'accept', 'escalate'],
      description:
        "'offer' = send a price/terms proposal to the supplier. 'accept' = the supplier's current terms are inside the contract, close now. 'escalate' = best available terms fall outside the contract; stop and hand back to the buyer.",
    },
    message: {
      type: 'string',
      description:
        "For 'offer': your next WhatsApp line to the supplier. For 'accept': your closing confirmation. For 'escalate': a brief note (not sent to the supplier).",
    },
    terms: {
      type: 'object',
      description: 'The concrete terms this action refers to (your proposed terms, or the terms being accepted/escalated).',
      properties: {
        pricePerUnit: { type: 'number' },
        grade: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
        quantity: { type: 'integer' },
      },
      required: ['pricePerUnit', 'grade', 'quantity'],
      additionalProperties: false,
    },
    reasoning: { type: 'string', description: 'One line: your check against the contract.' },
  },
  required: ['action', 'message', 'terms', 'reasoning'],
  additionalProperties: false,
};

function renderTranscript(transcript: NegotiationTurn[]): string {
  if (transcript.length === 0) return '(no messages yet — make your opening offer)';
  return transcript
    .map((t) => `${t.speaker === 'jill' ? 'YOU (Jill)' : 'SUPPLIER'}: ${t.message}`)
    .join('\n');
}

async function jillDecide(
  contract: MandateContract,
  bale: Bale,
  supplier: Supplier,
  transcript: NegotiationTurn[],
): Promise<JillDecision> {
  const system = `${loadPersona('jill')}

---
YOUR CONTRACT (hard limits — never break)
Price ceiling: $${contract.priceCeiling}/unit (never agree above)
Grade floor: ${contract.gradeFloor} (never accept below)
Quantity: at least ${contract.quantity} units (never close short)

THE BALE
${bale.description}
Category/era: ${bale.category}/${bale.era} | brands: ${bale.brands.join(', ')} | stated grade ${bale.grade} | ~${bale.quantity} units | supplier's opening ask: $${bale.askPrice}/unit
Supplier: ${supplier.name}`;

  const prompt = `NEGOTIATION SO FAR
${renderTranscript(transcript)}

Decide your next action against the contract.`;

  return generateJSON<JillDecision>({
    system,
    messages: [{ role: 'user', content: prompt }],
    schema: DECISION_SCHEMA,
    toolName: 'decide',
    toolDescription: 'Decide the next negotiation action.',
  });
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

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const decision = await jillDecide(contract, bale, supplier, neg.transcript);
    const terms: DealTerms = {
      pricePerUnit: decision.terms.pricePerUnit,
      grade: decision.terms.grade,
      quantity: decision.terms.quantity,
    };

    // Round 0 must be an opening offer — there's nothing to accept yet.
    const action: JillAction = round === 0 && decision.action !== 'offer' ? 'offer' : decision.action;

    if (action === 'accept') {
      neg.transcript.push({ speaker: 'jill', message: decision.message, offer: terms });
      if (insideContract(terms, contract)) {
        neg.state = 'CLOSED';
        neg.currentOffer = terms;
        neg.outcome = `Closed at $${terms.pricePerUnit}/unit, grade ${terms.grade}, ${terms.quantity} units.`;
        await saveNegotiation(neg);
        await saveDeal({ id: id('deal'), negotiationId: neg.id, terms, status: 'closed' });
        return neg;
      }
      // Guardrail: Jill tried to accept terms outside the contract — escalate instead.
      neg.state = 'ESCALATED';
      neg.currentOffer = terms;
      neg.outcome = escalationNote(terms, contract);
      await saveNegotiation(neg);
      return neg;
    }

    if (action === 'escalate') {
      neg.state = 'ESCALATED';
      neg.currentOffer = terms;
      neg.transcript.push({ speaker: 'jill', message: decision.message, offer: terms });
      neg.outcome = escalationNote(terms, contract);
      await saveNegotiation(neg);
      return neg;
    }

    // action === 'offer': send to supplier, get their reply, continue.
    neg.transcript.push({ speaker: 'jill', message: decision.message, offer: terms });
    neg.currentOffer = terms;
    neg.state = 'COUNTERING';
    const reply = await supplierReply(supplier, bale, neg.transcript);
    neg.transcript.push({ speaker: 'supplier', message: reply });
  }

  // Ran out of rounds without closing — escalate with the last terms on the table.
  neg.state = 'ESCALATED';
  neg.outcome = `No agreement inside the contract after ${MAX_ROUNDS} rounds. ${
    neg.currentOffer ? escalationNote(neg.currentOffer, contract) : ''
  }`.trim();
  await saveNegotiation(neg);
  return neg;
}

export interface NegotiationOutcome {
  supplier: string;
  baleId: string;
  state: Negotiation['state'];
  terms: DealTerms | null;
  outcome: string | null;
}

/** Negotiate one or more selected bales for a mandate (used by Jack). */
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
      outcomes.push({ supplier: '?', baleId, state: 'ESCALATED', terms: null, outcome: 'Unknown bale.' });
      continue;
    }
    const supplier = await getSupplier(bale.supplierId);
    if (!supplier) {
      outcomes.push({ supplier: '?', baleId, state: 'ESCALATED', terms: null, outcome: 'Unknown supplier.' });
      continue;
    }
    const neg = await negotiateBale(mandate, bale, supplier);
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
