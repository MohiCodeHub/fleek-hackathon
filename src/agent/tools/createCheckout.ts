import { StringEnum } from '@earendil-works/pi-ai';
import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createCheckout } from '../../checkout.js';
import { log } from '../../log.js';
import type { Grade, Product } from '../../types.js';

/**
 * create_checkout: raise an order for what the buyer agreed to, and hand back a
 * link they can open and confirm.
 *
 * The buyer's phone is closed over — the model must not be able to raise an
 * order against someone else's number.
 */
export function makeCreateCheckoutTool(buyerPhone: string) {
  return defineTool({
    name: 'create_checkout',
    label: 'Create Checkout',
    description:
      'Raise a checkout link for a lot the buyer has agreed to buy. Call this once the buyer has confirmed WHAT they want, HOW MANY pieces, and AT WHAT price — not before. For a catalog lot, pass collection and productId so the photo and listing link come through. Returns a checkout URL to send the buyer; they confirm the order on that page.',
    promptSnippet: 'Raises an order and returns a checkout link for the buyer.',
    parameters: Type.Object({
      collection: Type.Optional(
        StringEnum(['mens-unisex', 'womens'] as const, {
          description: 'Catalog collection, when ordering a listed lot.',
        }),
      ),
      productId: Type.Optional(
        Type.Integer({ description: 'Catalog product id, when ordering a listed lot.' }),
      ),
      productName: Type.Optional(
        Type.String({
          description:
            'What is being bought. Required only when this is not a catalog lot; otherwise the catalog name is used.',
        }),
      ),
      quantity: Type.Integer({
        description: 'Number of pieces the buyer is ordering.',
        minimum: 1,
      }),
      pricePerPiece: Type.Optional(
        Type.Number({
          description:
            'Agreed price per piece. Omit to use the catalog list price. Pass the negotiated figure when it differs.',
        }),
      ),
      currency: Type.Optional(Type.String({ description: 'ISO currency, e.g. GBP. Default GBP.' })),
      grade: Type.Optional(
        StringEnum(['A', 'B', 'C', 'D'] as const satisfies readonly Grade[], {
          description: 'Agreed grade, when one was agreed.',
        }),
      ),
    }),
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      try {
        const { order, url } = await createCheckout({
          buyerPhone,
          collection: params.collection as Product['collection'] | undefined,
          productId: params.productId,
          productName: params.productName,
          quantity: params.quantity,
          pricePerPiece: params.pricePerPiece,
          currency: params.currency,
          grade: params.grade as Grade | undefined,
        });

        log.info('checkout.created', {
          orderId: order.id,
          quantity: order.quantity,
          total: order.total,
        });

        const text =
          `Checkout raised for ${order.quantity} pcs of "${order.productName}" at ` +
          `${order.currency} ${order.pricePerPiece}/pc — total ${order.currency} ${order.total}.\n` +
          `Send the buyer this link: ${url}`;

        return {
          content: [{ type: 'text' as const, text }],
          details: { orderId: order.id, url, order },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: 'text' as const, text: `Could not raise checkout: ${message}` }],
          details: { error: message },
        };
      }
    },
  });
}
