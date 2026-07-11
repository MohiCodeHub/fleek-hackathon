import {
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  BuyerProfile,
  DealTerms,
  Grade,
  NegotiationState,
  NegotiationTurn,
  SupplierProfile,
} from '../types.js';

/** Money stored as numeric; mapped to JS number in accessors. */
const money = (name: string) => numeric(name, { precision: 12, scale: 4, mode: 'number' });

export const buyers = pgTable('buyers', {
  phone: text('phone').primaryKey(),
  name: text('name').notNull(),
  company: text('company'),
  onboardedAt: text('onboarded_at'),
  profileJson: jsonb('profile_json').$type<BuyerProfile>().notNull(),
});

export const suppliers = pgTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    phone: text('phone'),
    name: text('name').notNull(),
    profileJson: jsonb('profile_json').$type<SupplierProfile>().notNull(),
  },
  (t) => [uniqueIndex('suppliers_phone_uidx').on(t.phone)],
);

export const inventoryBales = pgTable('inventory_bales', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  description: text('description').notNull(),
  category: text('category').notNull(),
  era: text('era').notNull(),
  brandsJson: jsonb('brands_json').$type<string[]>().notNull(),
  grade: text('grade').$type<Grade>().notNull(),
  quantity: integer('quantity').notNull(),
  askPrice: money('ask_price').notNull(),
});

export const mandates = pgTable('mandates', {
  id: text('id').primaryKey(),
  buyerPhone: text('buyer_phone').notNull(),
  category: text('category').notNull(),
  style: text('style').notNull(),
  quantity: integer('quantity').notNull(),
  gradeFloor: text('grade_floor').$type<Grade>().notNull(),
  priceCeiling: money('price_ceiling').notNull(),
  rawText: text('raw_text').notNull(),
  status: text('status').notNull().default('open'),
});

export const matches = pgTable(
  'matches',
  {
    mandateId: text('mandate_id').notNull(),
    baleId: text('bale_id').notNull(),
    supplierId: text('supplier_id').notNull(),
    score: integer('score').notNull(),
    rationale: text('rationale').notNull(),
    rank: integer('rank').notNull(),
  },
  (t) => [primaryKey({ columns: [t.mandateId, t.baleId] })],
);

export const negotiations = pgTable('negotiations', {
  id: text('id').primaryKey(),
  mandateId: text('mandate_id').notNull(),
  baleId: text('bale_id').notNull(),
  supplierId: text('supplier_id').notNull(),
  state: text('state').$type<NegotiationState>().notNull(),
  currentOfferJson: jsonb('current_offer_json').$type<DealTerms | null>(),
  transcriptJson: jsonb('transcript_json').$type<NegotiationTurn[]>().notNull().default([]),
  outcome: text('outcome'),
});

export const deals = pgTable('deals', {
  id: text('id').primaryKey(),
  negotiationId: text('negotiation_id').notNull(),
  termsJson: jsonb('terms_json').$type<DealTerms>().notNull(),
  status: text('status').notNull(),
});

export const processedDeliveries = pgTable('processed_deliveries', {
  deliveryId: text('delivery_id').primaryKey(),
  seenAt: text('seen_at').notNull(),
});

/** Demo web-catalog products (the /collections funnel), not agent bale inventory. */
export const products = pgTable(
  'products',
  {
    id: integer('id').notNull(),
    collection: text('collection').notNull(),
    name: text('name').notNull(),
    price: money('price').notNull(),
    originalPrice: money('original_price'),
    currency: text('currency').notNull(),
    pricePerPiece: money('price_per_piece').notNull(),
    units: integer('units'),
    imageUrl: text('image_url'),
    url: text('url').notNull(),
  },
  (t) => [primaryKey({ columns: [t.collection, t.id] })],
);

export const threads = pgTable('threads', {
  phone: text('phone').primaryKey(),
  role: text('role').notNull(),
  conversationId: text('conversation_id'),
  historyJson: jsonb('history_json').$type<unknown[]>().notNull().default([]),
});
