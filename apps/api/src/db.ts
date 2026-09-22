import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from './config.js';
export type Row = Record<string, any>;
export interface DB {
  query<T extends Row = Row>(sql: string, params?: any[]): Promise<T[]>;
}
const url = process.env.DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 20 }) : null;
const dataDir = process.env.DATA_DIR || './data/pace';
if (!url && !config.test) await mkdir(dataDir, { recursive: true });
const local = !url ? new PGlite(config.test ? undefined : dataDir) : null;
let tail: Promise<any> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work, work);
  tail = next.catch(() => {});
  return next;
}
const localDB: DB = {
  query: async <T extends Row>(sql: string, params: any[] = []) =>
    (await local!.query<T>(sql, params)).rows,
};
export const db: DB = {
  query: async <T extends Row>(sql: string, params: any[] = []) =>
    pool
      ? ((await pool.query(sql, params)).rows as T[])
      : exclusive(() => localDB.query<T>(sql, params)),
};
export async function tx<T>(work: (connection: DB) => Promise<T>): Promise<T> {
  if (local)
    return exclusive(async () => {
      await localDB.query('BEGIN');
      try {
        const result = await work(localDB);
        await localDB.query('COMMIT');
        return result;
      } catch (e) {
        await localDB.query('ROLLBACK');
        throw e;
      }
    });
  const client = await pool!.connect();
  const connection: DB = { query: async (sql, params) => (await client.query(sql, params)).rows };
  try {
    await client.query('BEGIN');
    const result = await work(connection);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export async function migrate() {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const dir = resolve('migrations');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if ((await db.query('SELECT version FROM schema_migrations WHERE version=$1', [file])).length)
      continue;
    const sql = await readFile(resolve(dir, file), 'utf8');
    await tx(async (c) => {
      for (const statement of splitSQL(sql)) await c.query(statement);
      await c.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
    });
  }
}
function splitSQL(sql: string) {
  return sql
    .split(/;(?=(?:[^$]*\$\$[^$]*\$\$)*[^$]*$)/)
    .map((x) => x.trim())
    .filter(Boolean);
}
export async function closeDB() {
  await pool?.end();
  await local?.close();
}
