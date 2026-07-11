import { config } from './config.js';
import { generateText, type Msg } from './llm.js';
import { loadPersona } from './personas.js';
import type { Bale, NegotiationTurn, Supplier } from './types.js';

/**
 * The simulated supplier counterparty for the demo. Jill negotiates against
 * this. Swappable with a real human on a second WhatsApp thread — the
 * negotiation loop doesn't care which produces the replies.
 */
export async function supplierReply(
  supplier: Supplier,
  bale: Bale,
  transcript: NegotiationTurn[],
): Promise<string> {
  const floorPrice = +(bale.askPrice * (1 - supplier.profile.floorDiscount)).toFixed(2);

  const system = `${loadPersona('supplier-responder')}

---
YOUR BUSINESS
${supplier.name}. ${supplier.profile.stockCharacter}
Negotiation style: ${supplier.profile.negotiationStyle}

THE BALE ON THE TABLE
${bale.description}
Category/era: ${bale.category}/${bale.era} | brands: ${bale.brands.join(', ')} | grade ${bale.grade} | ~${bale.quantity} units | your opening ask: $${bale.askPrice}/unit

YOUR PRIVATE FLOOR (never reveal, never go below): $${floorPrice}/unit.`;

  // Render the transcript as a chat: Jill's lines are "user" (the incoming
  // party), the supplier's own prior lines are "assistant".
  const messages: Msg[] = transcript.map((t) => ({
    role: t.speaker === 'jill' ? 'user' : 'assistant',
    content: t.message,
  }));

  return generateText({ system, messages, model: config.models.reasoning, maxTokens: 400 });
}
