import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import type {
  Buyer,
  Supplier,
  Bale,
  Mandate,
  Match,
  Negotiation,
  Deal,
} from './types.js';

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const dir = dirname(config.dbPath);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  _db = new Database(config.dbPath);
  _db.pragma('journal_mode = WAL');
  migrate(_db);
  return _db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS buyers (
      phone        TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      profile_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id           TEXT PRIMARY KEY,
      phone        TEXT,
      name         TEXT NOT NULL,
      profile_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_bales (
      id          TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      description TEXT NOT NULL,
      category    TEXT NOT NULL,
      era         TEXT NOT NULL,
      brands_json TEXT NOT NULL,
      grade       TEXT NOT NULL,
      quantity    INTEGER NOT NULL,
      ask_price   REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mandates (
      id            TEXT PRIMARY KEY,
      buyer_phone   TEXT NOT NULL,
      category      TEXT NOT NULL,
      style         TEXT NOT NULL,
      quantity      INTEGER NOT NULL,
      grade_floor   TEXT NOT NULL,
      price_ceiling REAL NOT NULL,
      raw_text      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS matches (
      mandate_id TEXT NOT NULL,
      bale_id    TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      score      REAL NOT NULL,
      rationale  TEXT NOT NULL,
      rank       INTEGER NOT NULL,
      PRIMARY KEY (mandate_id, bale_id)
    );

    CREATE TABLE IF NOT EXISTS negotiations (
      id                 TEXT PRIMARY KEY,
      mandate_id         TEXT NOT NULL,
      bale_id            TEXT NOT NULL,
      supplier_id        TEXT NOT NULL,
      state              TEXT NOT NULL,
      current_offer_json TEXT,
      transcript_json    TEXT NOT NULL DEFAULT '[]',
      outcome            TEXT
    );

    CREATE TABLE IF NOT EXISTS deals (
      id              TEXT PRIMARY KEY,
      negotiation_id  TEXT NOT NULL,
      terms_json      TEXT NOT NULL,
      status          TEXT NOT NULL
    );

    -- Idempotency for Wassist webhook deliveries (X-Wassist-Delivery).
    CREATE TABLE IF NOT EXISTS processed_deliveries (
      delivery_id TEXT PRIMARY KEY,
      seen_at     TEXT NOT NULL
    );

    -- Per-counterparty WhatsApp thread: durable conversation state for the
    -- stateless webhook. Keyed by the counterparty phone number.
    CREATE TABLE IF NOT EXISTS threads (
      phone           TEXT PRIMARY KEY,
      role            TEXT NOT NULL,           -- 'buyer' | 'supplier'
      conversation_id TEXT,                    -- Wassist conversation id for outbound
      history_json    TEXT NOT NULL DEFAULT '[]'
    );
  `);
}

// ---------------------------------------------------------------------------
// Threads (WhatsApp conversation state)
// ---------------------------------------------------------------------------

export interface Thread {
  phone: string;
  role: 'buyer' | 'supplier';
  conversationId: string | null;
  history: unknown[];
}

export function getThread(phone: string): Thread | null {
  const row = db().prepare(`SELECT * FROM threads WHERE phone = ?`).get(phone) as
    | { phone: string; role: string; conversation_id: string | null; history_json: string }
    | undefined;
  if (!row) return null;
  return {
    phone: row.phone,
    role: row.role as Thread['role'],
    conversationId: row.conversation_id,
    history: JSON.parse(row.history_json),
  };
}

export function saveThread(t: Thread): void {
  db()
    .prepare(
      `INSERT INTO threads (phone, role, conversation_id, history_json)
       VALUES (@phone, @role, @conversationId, @history)
       ON CONFLICT(phone) DO UPDATE SET
         role=@role, conversation_id=@conversationId, history_json=@history`,
    )
    .run({
      phone: t.phone,
      role: t.role,
      conversationId: t.conversationId,
      history: JSON.stringify(t.history),
    });
}

// ---------------------------------------------------------------------------
// Buyers
// ---------------------------------------------------------------------------

export function upsertBuyer(b: Buyer): void {
  db()
    .prepare(
      `INSERT INTO buyers (phone, name, profile_json) VALUES (@phone, @name, @profile)
       ON CONFLICT(phone) DO UPDATE SET name = @name, profile_json = @profile`,
    )
    .run({ phone: b.phone, name: b.name, profile: JSON.stringify(b.profile) });
}

export function getBuyer(phone: string): Buyer | null {
  const row = db().prepare(`SELECT * FROM buyers WHERE phone = ?`).get(phone) as
    | { phone: string; name: string; profile_json: string }
    | undefined;
  if (!row) return null;
  return { phone: row.phone, name: row.name, profile: JSON.parse(row.profile_json) };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export function upsertSupplier(s: Supplier): void {
  db()
    .prepare(
      `INSERT INTO suppliers (id, phone, name, profile_json) VALUES (@id, @phone, @name, @profile)
       ON CONFLICT(id) DO UPDATE SET phone = @phone, name = @name, profile_json = @profile`,
    )
    .run({ id: s.id, phone: s.phone, name: s.name, profile: JSON.stringify(s.profile) });
}

export function getSupplier(id: string): Supplier | null {
  const row = db().prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id) as
    | { id: string; phone: string; name: string; profile_json: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, phone: row.phone, name: row.name, profile: JSON.parse(row.profile_json) };
}

export function getSupplierByPhone(phone: string): Supplier | null {
  const row = db().prepare(`SELECT * FROM suppliers WHERE phone = ?`).get(phone) as
    | { id: string; phone: string; name: string; profile_json: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, phone: row.phone, name: row.name, profile: JSON.parse(row.profile_json) };
}

export function allSuppliers(): Supplier[] {
  const rows = db().prepare(`SELECT * FROM suppliers`).all() as Array<{
    id: string;
    phone: string;
    name: string;
    profile_json: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    profile: JSON.parse(r.profile_json),
  }));
}

// ---------------------------------------------------------------------------
// Bales
// ---------------------------------------------------------------------------

export function insertBale(b: Bale): void {
  db()
    .prepare(
      `INSERT INTO inventory_bales (id, supplier_id, description, category, era, brands_json, grade, quantity, ask_price)
       VALUES (@id, @supplierId, @description, @category, @era, @brands, @grade, @quantity, @askPrice)
       ON CONFLICT(id) DO UPDATE SET
         supplier_id=@supplierId, description=@description, category=@category, era=@era,
         brands_json=@brands, grade=@grade, quantity=@quantity, ask_price=@askPrice`,
    )
    .run({
      id: b.id,
      supplierId: b.supplierId,
      description: b.description,
      category: b.category,
      era: b.era,
      brands: JSON.stringify(b.brands),
      grade: b.grade,
      quantity: b.quantity,
      askPrice: b.askPrice,
    });
}

function rowToBale(r: {
  id: string;
  supplier_id: string;
  description: string;
  category: string;
  era: string;
  brands_json: string;
  grade: string;
  quantity: number;
  ask_price: number;
}): Bale {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    description: r.description,
    category: r.category,
    era: r.era,
    brands: JSON.parse(r.brands_json),
    grade: r.grade as Bale['grade'],
    quantity: r.quantity,
    askPrice: r.ask_price,
  };
}

export function allBales(): Bale[] {
  const rows = db().prepare(`SELECT * FROM inventory_bales`).all() as Parameters<typeof rowToBale>[0][];
  return rows.map(rowToBale);
}

export function getBale(id: string): Bale | null {
  const row = db().prepare(`SELECT * FROM inventory_bales WHERE id = ?`).get(id) as
    | Parameters<typeof rowToBale>[0]
    | undefined;
  return row ? rowToBale(row) : null;
}

// ---------------------------------------------------------------------------
// Mandates
// ---------------------------------------------------------------------------

export function insertMandate(m: Mandate): void {
  db()
    .prepare(
      `INSERT INTO mandates (id, buyer_phone, category, style, quantity, grade_floor, price_ceiling, raw_text, status)
       VALUES (@id, @buyerPhone, @category, @style, @quantity, @gradeFloor, @priceCeiling, @rawText, @status)`,
    )
    .run(m as unknown as Record<string, unknown>);
}

export function setMandateStatus(id: string, status: Mandate['status']): void {
  db().prepare(`UPDATE mandates SET status = ? WHERE id = ?`).run(status, id);
}

export function getMandate(id: string): Mandate | null {
  const row = db().prepare(`SELECT * FROM mandates WHERE id = ?`).get(id) as
    | {
        id: string;
        buyer_phone: string;
        category: string;
        style: string;
        quantity: number;
        grade_floor: string;
        price_ceiling: number;
        raw_text: string;
        status: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    buyerPhone: row.buyer_phone,
    category: row.category,
    style: row.style,
    quantity: row.quantity,
    gradeFloor: row.grade_floor as Mandate['gradeFloor'],
    priceCeiling: row.price_ceiling,
    rawText: row.raw_text,
    status: row.status as Mandate['status'],
  };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export function saveMatches(matches: Match[]): void {
  const stmt = db().prepare(
    `INSERT INTO matches (mandate_id, bale_id, supplier_id, score, rationale, rank)
     VALUES (@mandateId, @baleId, @supplierId, @score, @rationale, @rank)
     ON CONFLICT(mandate_id, bale_id) DO UPDATE SET
       supplier_id=@supplierId, score=@score, rationale=@rationale, rank=@rank`,
  );
  const tx = db().transaction((rows: Match[]) => rows.forEach((m) => stmt.run(m)));
  tx(matches);
}

// ---------------------------------------------------------------------------
// Negotiations & deals
// ---------------------------------------------------------------------------

export function saveNegotiation(n: Negotiation): void {
  db()
    .prepare(
      `INSERT INTO negotiations (id, mandate_id, bale_id, supplier_id, state, current_offer_json, transcript_json, outcome)
       VALUES (@id, @mandateId, @baleId, @supplierId, @state, @currentOffer, @transcript, @outcome)
       ON CONFLICT(id) DO UPDATE SET
         state=@state, current_offer_json=@currentOffer, transcript_json=@transcript, outcome=@outcome`,
    )
    .run({
      id: n.id,
      mandateId: n.mandateId,
      baleId: n.baleId,
      supplierId: n.supplierId,
      state: n.state,
      currentOffer: n.currentOffer ? JSON.stringify(n.currentOffer) : null,
      transcript: JSON.stringify(n.transcript),
      outcome: n.outcome,
    });
}

export function saveDeal(deal: Deal): void {
  db()
    .prepare(
      `INSERT INTO deals (id, negotiation_id, terms_json, status)
       VALUES (@id, @negotiationId, @terms, @status)
       ON CONFLICT(id) DO UPDATE SET terms_json=@terms, status=@status`,
    )
    .run({
      id: deal.id,
      negotiationId: deal.negotiationId,
      terms: JSON.stringify(deal.terms),
      status: deal.status,
    });
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

/** Returns true if this delivery is new (and records it); false if already seen. */
export function markDelivery(deliveryId: string, nowIso: string): boolean {
  const res = db()
    .prepare(`INSERT OR IGNORE INTO processed_deliveries (delivery_id, seen_at) VALUES (?, ?)`)
    .run(deliveryId, nowIso);
  return res.changes > 0;
}

export function resetDb(): void {
  const d = db();
  d.exec(`
    DELETE FROM deals; DELETE FROM negotiations; DELETE FROM matches;
    DELETE FROM mandates; DELETE FROM inventory_bales; DELETE FROM suppliers;
    DELETE FROM buyers; DELETE FROM processed_deliveries;
  `);
}
