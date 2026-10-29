/**
 * Integration test helpers.
 *
 * SAFETY RULES:
 * - Only runs against a database whose name contains "test".
 * - Resets the schema (destructive) ONLY after that check passes.
 * - Applies the project's own drizzle migrations — this validates that
 *   migration 0000 + 0001 run cleanly on a fresh database (scenario 19).
 * - If PostgreSQL is unreachable, the suite skips with a clear reason.
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/vpnbot_test';
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run integration tests: database name "${dbName}" does not contain "test". ` +
      `Set TEST_DATABASE_URL to a disposable test database.`
    );
  }
  return url;
}

export async function canConnect(url: string): Promise<{ ok: boolean; error?: string }> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  } finally {
    await pool.end();
  }
}

/** Drop and recreate the public schema, then apply all drizzle migrations in order. */
export async function applyMigrations(url: string): Promise<string[]> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
    return files;
  } finally {
    await pool.end();
  }
}
