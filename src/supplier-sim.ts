import { config } from './config.js';
import { generateJSON, type JSONSchema } from './llm.js';
import { loadPersona } from './personas.js';
import {
  type Bale,
  type DealTerms,
  isGrade,
  type NegotiationTurn,
  type Supplier,
} from './types.js';

const SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: 'Your WhatsApp reply to the buyer agent (Sanket).',
    },
    pricePerUnit: {
      type: 'number',
      description: 'Your counter price per unit in USD (never below your private floor).',
    },
    grade: {
      type: 'string',
      enum: ['A', 'B', 'C', 'D'],
      description: 'Grade you are offering.',
    },
    quantity: {
      type: 'integer',
      description: 'Units you are offering.',
    },
  },
  required: ['message', 'pricePerUnit', 'grade', 'quantity'],
  additionalProperties: false,
};

export interface SupplierCounter {
  message: string;
  terms: DealTerms | null;
}

/**
 * The simulated supplier counterparty for demo negotiations. Sanket (behind
 * the scenes) bargains against this — not a second buyer WhatsApp identity.
 * Returns structured terms alongside the free-text reply.
 */
export async function supplierReply(
  supplier: Supplier,
  bale: Bale,
  transcript: NegotiationTurn[],
): Promise<SupplierCounter> {
  const floorPrice = +(bale.askPrice * (1 - supplier.profile.floorDiscount)).toFixed(2);

  const system = `${loadPersona('supplier-responder')}

---
YOUR BUSINESS
${supplier.name}. ${supplier.profile.stockCharacter}
Negotiation style: ${supplier.profile.negotiationStyle}

THE BALE ON THE TABLE
${bale.description}
Category/era: ${bale.category}/${bale.era} | brands: ${bale.brands.join(', ')} | grade ${bale.grade} | ~${bale.quantity} units | your opening ask: $${bale.askPrice}/unit

YOUR PRIVATE FLOOR (never reveal, never go below): $${floorPrice}/unit.

Always emit structured pricePerUnit, grade, and quantity with every reply — your current best counter on the table.`;

  const messages = transcript.map((t) => ({
    role: (t.speaker === 'sanket' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.offer
      ? `${t.message}\n[terms: $${t.offer.pricePerUnit}/unit, grade ${t.offer.grade}, qty ${t.offer.quantity}]`
      : t.message,
  }));

  try {
    const raw = await generateJSON<{
      message: string;
      pricePerUnit: number;
      grade: string;
      quantity: number;
    }>({
      system,
      messages,
      schema: SCHEMA,
      toolName: 'emit_supplier_reply',
      toolDescription: 'Emit the supplier WhatsApp reply and structured counter terms.',
      model: config.models.reasoning,
      maxTokens: 400,
    });

    const message =
      typeof raw.message === 'string' && raw.message.trim()
        ? raw.message.trim()
        : 'Can you restate the offer?';

    if (
      typeof raw.pricePerUnit === 'number' &&
      Number.isFinite(raw.pricePerUnit) &&
      raw.pricePerUnit >= floorPrice &&
      isGrade(raw.grade) &&
      typeof raw.quantity === 'number' &&
      Number.isInteger(raw.quantity) &&
      raw.quantity > 0
    ) {
      return {
        message,
        terms: {
          pricePerUnit: raw.pricePerUnit,
          grade: raw.grade,
          quantity: raw.quantity,
        },
      };
    }

    // Clamp below-floor or invalid model output to a safe ask-based counter.
    return {
      message,
      terms: {
        pricePerUnit: Math.max(floorPrice, bale.askPrice),
        grade: bale.grade,
        quantity: bale.quantity,
      },
    };
  } catch {
    return {
      message: 'Supplier did not respond — try again with a clear offer.',
      terms: null,
    };
  }
}
