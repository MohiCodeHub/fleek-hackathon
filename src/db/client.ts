import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { requireDatabaseUrl } from '../config.js';
import * as schema from './schema.js';

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function pool(): pg.Pool {
  if (_pool) return _pool;
  _pool = new Pool({ connectionString: requireDatabaseUrl() });
  return _pool;
}

/** Shared Drizzle client bound to Railway Postgres. */
export function db() {
  if (_db) return _db;
  _db = drizzle(pool(), { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
