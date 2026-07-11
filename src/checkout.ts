/**
 * Checkout: turn what Abhi agreed on WhatsApp into a link the buyer can open
 * and confirm on the web.
 *
 * The order snapshots its own terms (name, price, quantity, image). Abhi may
 * quote a negotiated price that differs from the catalog list price, and a
 * re-scrape of the catalog must never silently rewrite an order a buyer has
 * already been shown.
 */
import { config } from './config.js';
import { createOrder, getProduct } from './db/index.js';
import { id } from './ids.js';
import type { Grade, Order, Product } from './types.js';

export interface CheckoutRequest {
  buyerPhone: string;
  /** Catalog provenance. When given, the lot's photo/name/link are snapshotted. */
  collection?: Product['collection'];
  productId?: number;
  /** Required when there is no catalog product to take the name from. */
  productName?: string;
  quantity: number;
  /** Agreed price per piece. Defaults to the catalog price when omitted. */
  pricePerPiece?: number;
  currency?: string;
  grade?: Grade;
}

export interface CheckoutResult {
  order: Order;
  url: string;
}

/** Absolute link to an order's checkout page. */
export function checkoutUrl(orderId: string): string {
  return `${config.publicBaseUrl}/checkout/${orderId}`;
}

/** Money is stored to the penny; avoid float dust in the total. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Create an order and return its checkout link.
 * Throws on nonsense input so Abhi gets a tool error he can recover from,
 * rather than silently minting an order for 0 units.
 */
export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  if (!Number.isFinite(req.quantity) || req.quantity <= 0) {
    throw new Error('quantity must be a positive number of pieces');
  }

  const product =
    req.collection && req.productId != null
      ? await getProduct(req.collection, req.productId)
      : null;

  if (req.collection && req.productId != null && !product) {
    throw new Error(`No such catalog lot: ${req.collection}#${req.productId}`);
  }

  const productName = req.productName ?? product?.name;
  if (!productName) {
    throw new Error('productName is required when the order is not for a catalog lot');
  }

  const pricePerPiece = req.pricePerPiece ?? product?.pricePerPiece;
  if (pricePerPiece == null || !Number.isFinite(pricePerPiece) || pricePerPiece <= 0) {
    throw new Error('pricePerPiece must be a positive amount');
  }

  const order: Order = {
    id: id('ord'),
    buyerPhone: req.buyerPhone,
    collection: product?.collection ?? req.collection ?? null,
    productId: product?.id ?? req.productId ?? null,
    productName,
    imageUrl: product?.imageUrl ?? null,
    productUrl: product?.url ?? null,
    quantity: req.quantity,
    pricePerPiece: round2(pricePerPiece),
    currency: req.currency ?? product?.currency ?? 'GBP',
    total: round2(pricePerPiece * req.quantity),
    grade: req.grade ?? null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    confirmedAt: null,
  };

  await createOrder(order);
  return { order, url: checkoutUrl(order.id) };
}
