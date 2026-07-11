import { and, asc, count, desc, eq } from 'drizzle-orm';
import type {
  Bale,
  Buyer,
  Deal,
  Mandate,
  Match,
  Negotiation,
  Product,
  ProductPage,
  Supplier,
} from '../types.js';
import { db } from './client.js';
import {
  buyers,
  deals,
  inventoryBales,
  mandates,
  matches,
  negotiations,
  processedDeliveries,
  products,
  suppliers,
  threads,
} from './schema.js';

export interface Thread {
  phone: string;
  role: 'buyer' | 'supplier';
  conversationId: string | null;
  history: unknown[];
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function getThread(phone: string): Promise<Thread | null> {
  const rows = await db().select().from(threads).where(eq(threads.phone, phone)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    phone: row.phone,
    role: row.role as Thread['role'],
    conversationId: row.conversationId,
    history: row.historyJson ?? [],
  };
}

export async function saveThread(t: Thread): Promise<void> {
  await db()
    .insert(threads)
    .values({
      phone: t.phone,
      role: t.role,
      conversationId: t.conversationId,
      historyJson: t.history,
    })
    .onConflictDoUpdate({
      target: threads.phone,
      set: {
        role: t.role,
        conversationId: t.conversationId,
        historyJson: t.history,
      },
    });
}

// ---------------------------------------------------------------------------
// Buyers
// ---------------------------------------------------------------------------

export async function upsertBuyer(b: Buyer): Promise<void> {
  await db()
    .insert(buyers)
    .values({
      phone: b.phone,
      name: b.name,
      company: b.company,
      onboardedAt: b.onboardedAt,
      profileJson: b.profile,
    })
    .onConflictDoUpdate({
      target: buyers.phone,
      set: { name: b.name, company: b.company, onboardedAt: b.onboardedAt, profileJson: b.profile },
    });
}

export async function getBuyer(phone: string): Promise<Buyer | null> {
  const rows = await db().select().from(buyers).where(eq(buyers.phone, phone)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    phone: row.phone,
    name: row.name,
    company: row.company,
    onboardedAt: row.onboardedAt,
    profile: row.profileJson,
  };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function upsertSupplier(s: Supplier): Promise<void> {
  await db()
    .insert(suppliers)
    .values({ id: s.id, phone: s.phone, name: s.name, profileJson: s.profile })
    .onConflictDoUpdate({
      target: suppliers.id,
      set: { phone: s.phone, name: s.name, profileJson: s.profile },
    });
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const rows = await db().select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, phone: row.phone ?? '', name: row.name, profile: row.profileJson };
}

export async function getSupplierByPhone(phone: string): Promise<Supplier | null> {
  const rows = await db().select().from(suppliers).where(eq(suppliers.phone, phone)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, phone: row.phone ?? '', name: row.name, profile: row.profileJson };
}

export async function allSuppliers(): Promise<Supplier[]> {
  const rows = await db().select().from(suppliers);
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone ?? '',
    name: r.name,
    profile: r.profileJson,
  }));
}

// ---------------------------------------------------------------------------
// Bales
// ---------------------------------------------------------------------------

export async function insertBale(b: Bale): Promise<void> {
  await db()
    .insert(inventoryBales)
    .values({
      id: b.id,
      supplierId: b.supplierId,
      description: b.description,
      category: b.category,
      era: b.era,
      brandsJson: b.brands,
      grade: b.grade,
      quantity: b.quantity,
      askPrice: b.askPrice,
    })
    .onConflictDoUpdate({
      target: inventoryBales.id,
      set: {
        supplierId: b.supplierId,
        description: b.description,
        category: b.category,
        era: b.era,
        brandsJson: b.brands,
        grade: b.grade,
        quantity: b.quantity,
        askPrice: b.askPrice,
      },
    });
}

function asMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function rowToBale(r: typeof inventoryBales.$inferSelect): Bale {
  return {
    id: r.id,
    supplierId: r.supplierId,
    description: r.description,
    category: r.category,
    era: r.era,
    brands: r.brandsJson,
    grade: r.grade,
    quantity: r.quantity,
    askPrice: asMoney(r.askPrice),
  };
}

export async function allBales(): Promise<Bale[]> {
  const rows = await db().select().from(inventoryBales);
  return rows.map(rowToBale);
}

export async function getBale(id: string): Promise<Bale | null> {
  const rows = await db().select().from(inventoryBales).where(eq(inventoryBales.id, id)).limit(1);
  const row = rows[0];
  return row ? rowToBale(row) : null;
}

// ---------------------------------------------------------------------------
// Mandates
// ---------------------------------------------------------------------------

export async function insertMandate(m: Mandate): Promise<void> {
  await db().insert(mandates).values({
    id: m.id,
    buyerPhone: m.buyerPhone,
    category: m.category,
    style: m.style,
    quantity: m.quantity,
    gradeFloor: m.gradeFloor,
    priceCeiling: m.priceCeiling,
    rawText: m.rawText,
    status: m.status,
  });
}

export async function setMandateStatus(id: string, status: Mandate['status']): Promise<void> {
  await db().update(mandates).set({ status }).where(eq(mandates.id, id));
}

export async function getMandate(id: string): Promise<Mandate | null> {
  const rows = await db().select().from(mandates).where(eq(mandates.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    buyerPhone: row.buyerPhone,
    category: row.category,
    style: row.style,
    quantity: row.quantity,
    gradeFloor: row.gradeFloor,
    priceCeiling: asMoney(row.priceCeiling),
    rawText: row.rawText,
    status: row.status as Mandate['status'],
  };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export async function saveMatches(rows: Match[]): Promise<void> {
  if (rows.length === 0) return;
  for (const m of rows) {
    await db()
      .insert(matches)
      .values({
        mandateId: m.mandateId,
        baleId: m.baleId,
        supplierId: m.supplierId,
        score: m.score,
        rationale: m.rationale,
        rank: m.rank,
      })
      .onConflictDoUpdate({
        target: [matches.mandateId, matches.baleId],
        set: {
          supplierId: m.supplierId,
          score: m.score,
          rationale: m.rationale,
          rank: m.rank,
        },
      });
  }
}

// ---------------------------------------------------------------------------
// Negotiations & deals
// ---------------------------------------------------------------------------

export async function saveNegotiation(n: Negotiation): Promise<void> {
  await db()
    .insert(negotiations)
    .values({
      id: n.id,
      mandateId: n.mandateId,
      baleId: n.baleId,
      supplierId: n.supplierId,
      state: n.state,
      currentOfferJson: n.currentOffer,
      transcriptJson: n.transcript,
      outcome: n.outcome,
    })
    .onConflictDoUpdate({
      target: negotiations.id,
      set: {
        state: n.state,
        currentOfferJson: n.currentOffer,
        transcriptJson: n.transcript,
        outcome: n.outcome,
      },
    });
}

export async function saveDeal(deal: Deal): Promise<void> {
  await db()
    .insert(deals)
    .values({
      id: deal.id,
      negotiationId: deal.negotiationId,
      termsJson: deal.terms,
      status: deal.status,
    })
    .onConflictDoUpdate({
      target: deals.id,
      set: { termsJson: deal.terms, status: deal.status },
    });
}

// ---------------------------------------------------------------------------
// Demo catalog products
// ---------------------------------------------------------------------------

function rowToProduct(r: typeof products.$inferSelect): Product {
  return {
    id: r.id,
    collection: r.collection as Product['collection'],
    name: r.name,
    price: asMoney(r.price),
    originalPrice: r.originalPrice == null ? null : asMoney(r.originalPrice),
    currency: r.currency,
    pricePerPiece: asMoney(r.pricePerPiece),
    units: r.units,
    imageUrl: r.imageUrl,
    url: r.url,
  };
}

export async function insertProduct(p: Product): Promise<void> {
  await db()
    .insert(products)
    .values({
      id: p.id,
      collection: p.collection,
      name: p.name,
      price: p.price,
      originalPrice: p.originalPrice,
      currency: p.currency,
      pricePerPiece: p.pricePerPiece,
      units: p.units,
      imageUrl: p.imageUrl,
      url: p.url,
    })
    .onConflictDoUpdate({
      target: [products.collection, products.id],
      set: {
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        currency: p.currency,
        pricePerPiece: p.pricePerPiece,
        units: p.units,
        imageUrl: p.imageUrl,
        url: p.url,
      },
    });
}

/** List demo products with the old website API semantics (sort, then slice). */
export async function listProducts(opts: {
  collection?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<ProductPage> {
  const where = opts.collection ? eq(products.collection, opts.collection) : undefined;

  const totalRows = await db().select({ total: count() }).from(products).where(where);
  const total = totalRows[0]?.total ?? 0;

  const order =
    opts.sort === 'price-asc'
      ? [asc(products.price)]
      : opts.sort === 'price-desc'
        ? [desc(products.price)]
        : opts.sort === 'name'
          ? [asc(products.name)]
          : [asc(products.collection), asc(products.id)];

  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? total;
  const rows = await db()
    .select()
    .from(products)
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);

  return { total, offset, limit, data: rows.map(rowToProduct) };
}

export async function getProduct(collection: string, id: number): Promise<Product | null> {
  const rows = await db()
    .select()
    .from(products)
    .where(and(eq(products.collection, collection), eq(products.id, id)))
    .limit(1);
  const row = rows[0];
  return row ? rowToProduct(row) : null;
}

/** Product counts per collection slug (for the catalog index page). */
export async function productCounts(): Promise<Record<string, number>> {
  const rows = await db()
    .select({ collection: products.collection, total: count() })
    .from(products)
    .groupBy(products.collection);
  return Object.fromEntries(rows.map((r) => [r.collection, r.total]));
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

/** Claim a delivery id (lock). Returns true if new; false if already claimed. */
export async function claimDelivery(deliveryId: string, nowIso: string): Promise<boolean> {
  const inserted = await db()
    .insert(processedDeliveries)
    .values({ deliveryId, seenAt: nowIso })
    .onConflictDoNothing({ target: processedDeliveries.deliveryId })
    .returning({ deliveryId: processedDeliveries.deliveryId });
  return inserted.length > 0;
}

/** @deprecated Use claimDelivery — kept for tests that still import the old name. */
export const markDelivery = claimDelivery;

/** Release a claimed delivery so Wassist can retry after a failed process/deliver. */
export async function releaseDelivery(deliveryId: string): Promise<void> {
  await db().delete(processedDeliveries).where(eq(processedDeliveries.deliveryId, deliveryId));
}

export async function resetDb(): Promise<void> {
  await db().delete(products);
  await db().delete(deals);
  await db().delete(negotiations);
  await db().delete(matches);
  await db().delete(mandates);
  await db().delete(inventoryBales);
  await db().delete(suppliers);
  await db().delete(buyers);
  await db().delete(threads);
  await db().delete(processedDeliveries);
}
