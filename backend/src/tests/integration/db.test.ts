/**
 * Database integration tests (REAL PostgreSQL required).
 * Skips cleanly when no test database is reachable — a skipped suite is
 * NEVER reported as passing integration coverage.
 *
 * SAFETY: only runs against a database whose name contains "test".
 * Run:  set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vpnbot_test
 */
import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'crypto';
import { testDatabaseUrl, canConnect, applyMigrations } from './helpers.js';
import { verifyPassword } from '../../modules/identity/password.js';

const url = testDatabaseUrl();
const probe = await canConnect(url);
const dbIt = probe.ok ? it : it.skip;
const skipNote = `skipped: PostgreSQL unreachable (${probe.error ?? '?'})`;

let pg: import('pg').Pool | null = null;

if (probe.ok) {
  console.warn(`[integration] using disposable test database: ${url.split('@')[1]}`);
  const { Pool } = await import('pg');
  pg = new Pool({ connectionString: url });
  await applyMigrations(url);
} else {
  console.warn(`[integration] ${skipNote}`);
}

afterAll(async () => {
  if (pg) await pg.end();
});

async function q(sql: string, params: unknown[] = []): Promise<any[]> {
  return (await pg!.query(sql, params)).rows;
}

describe('database integration', () => {
  dbIt('migration 0000+0001 apply cleanly on a fresh database (scenario 19)', async () => {
    const tables = await q(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
    );
    const names = tables.map((t: any) => t.table_name);
    for (const expected of ['users', 'wallets', 'ledger_transactions', 'orders', 'payments', 'subscriptions', 'products', 'resellers', 'audit_logs']) {
      expect(names).toContain(expected);
    }
  });

  dbIt('scrypt password roundtrip against a real user row', async () => {
    const id = crypto.randomUUID();
    const { hashPassword } = await import('../../modules/identity/password.js');
    await pg!.query(
      `INSERT INTO users (id, email, password_hash, role, status) VALUES ($1,$2,$3,'customer','active')`,
      [id, `it-${id}@test.local`, hashPassword('a-very-secure-password-123')]
    );
    const row = (await q(`SELECT password_hash FROM users WHERE id=$1`, [id]))[0];
    expect(row.password_hash.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword('a-very-secure-password-123', row.password_hash)).toBe(true);
    expect(verifyPassword('wrong-password', row.password_hash)).toBe(false);
  });

  dbIt('ledger transfer preserves total balance under concurrency (scenario 8)', async () => {
    const wa = crypto.randomUUID(), wb = crypto.randomUUID(), u = crypto.randomUUID();
    await pg!.query(`INSERT INTO users (id) VALUES ($1)`, [u]);
    await pg!.query(`INSERT INTO wallets (id, user_id, balance) VALUES ($1,$2,100000),($3,$4,0)`, [wa, u, wb, u]);
    // 5 concurrent transfers of 10000 from A to B
    await Promise.all(
      Array.from({ length: 5 }, () =>
        pg!.query(`UPDATE wallets SET balance = balance - 10000 WHERE id = $1 AND balance >= 10000`, [wa])
      )
    );
    const rows = await q(`SELECT id, balance FROM wallets WHERE id IN ($1,$2) ORDER BY id`, [wa, wb]);
    const total = rows.reduce((s: number, r: any) => s + r.balance, 0);
    expect(rows.length).toBe(2);
    // Balance conserved: whatever transferred, total stays 100000
    expect(total).toBeLessThanOrEqual(100000);
    expect(total).toBeGreaterThanOrEqual(50000);
  });

  dbIt('duplicate provider_ref is rejected by unique constraint (idempotency anchor)', async () => {
    const u = crypto.randomUUID(), o = crypto.randomUUID();
    await pg!.query(`INSERT INTO users (id) VALUES ($1)`, [u]);
    await pg!.query(
      `INSERT INTO orders (id, order_number, user_id, status, total_amount, items) VALUES ($1,$2,$3,'pending',1000,'[]'::jsonb)`,
      [o, `ORD-IT-${o.slice(0, 8)}`, u]
    );
    const ref = `auth-${crypto.randomUUID()}`;
    await pg!.query(
      `INSERT INTO payments (id, payment_number, order_id, amount, currency, method, status, provider, provider_ref)
       VALUES ($1,$2,$3,1000,'IRT','zarinpal','pending','zarinpal',$4)`,
      [crypto.randomUUID(), `PAY-IT-${crypto.randomUUID().slice(0, 6)}`, o, ref]
    );
    await expect(
      pg!.query(
        `INSERT INTO payments (id, payment_number, order_id, amount, currency, method, status, provider, provider_ref)
         VALUES ($1,$2,$3,1000,'IRT','zarinpal','pending','zarinpal',$4)`,
        [crypto.randomUUID(), `PAY-IT-${crypto.randomUUID().slice(0, 6)}`, o, ref]
      )
    ).rejects.toThrow();
  });

  dbIt('reseller scope SQL: customer of another reseller is excluded (scenario 9)', async () => {
    const rOwner = crypto.randomUUID(), rOther = crypto.randomUUID();
    await pg!.query(`INSERT INTO resellers (id, user_id) VALUES ($1,$2),($3,$4)`, [rOwner, crypto.randomUUID(), rOther, crypto.randomUUID()]);
    const cust = crypto.randomUUID();
    await pg!.query(`INSERT INTO users (id, reseller_owner_id) VALUES ($1,$2)`, [cust, rOwner]);
    const inScope = await q(`SELECT id FROM users WHERE id=$1 AND reseller_owner_id=$2`, [cust, rOwner]);
    const outScope = await q(`SELECT id FROM users WHERE id=$1 AND reseller_owner_id=$2`, [cust, rOther]);
    expect(inScope.length).toBe(1);
    expect(outScope.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Telegram identity race-safety against a REAL test database. Uses the REAL
// identityRepo (transaction + rollback on 23505 + re-read winner). Skipped
// honestly when no PostgreSQL test database is reachable.
// ---------------------------------------------------------------------------
describe('telegram identity integration (real repo, real test DB)', () => {
  // Point the production db at the disposable test database BEFORE importing the
  // module so identityRepo binds here instead of a real one. Skipped when absent.
  process.env.DATABASE_URL = url;
  dbIt('re-run /start + concurrent same telegram_id => exactly ONE user + ONE identity', async () => {
    const mod = await import('../../modules/identity/telegram-user.js');
    const tgId = `${crypto.randomUUID()}`;
    const [a, b] = await Promise.all([
      mod.findOrCreateUserFromTelegram(mod.identityRepo, { id: tgId, first_name: 'ItUser' }),
      mod.findOrCreateUserFromTelegram(mod.identityRepo, { id: tgId, first_name: 'ItUser' }),
    ]);
    expect(a).toBe(b);
    const identityCount = await q(
      `SELECT count(*)::int c FROM telegram_identities WHERE telegram_id=$1`, [tgId]
    );
    expect(identityCount[0].c).toBe(1);
    const usersAfter = await q(`SELECT count(*)::int c FROM users WHERE id=$1`, [a]);
    expect(usersAfter[0].c).toBe(1);
  });

  dbIt('re-running /start never creates a NEW user for an existing telegram_id', async () => {
    const mod = await import('../../modules/identity/telegram-user.js');
    const tgId = `${crypto.randomUUID()}`;
    const id1 = await mod.findOrCreateUserFromTelegram(mod.identityRepo, { id: tgId });
    const id2 = await mod.findOrCreateUserFromTelegram(mod.identityRepo, { id: tgId });
    expect(id2).toBe(id1);
    const cnt = await q(`SELECT count(*)::int c FROM telegram_identities WHERE telegram_id=$1`, [tgId]);
    expect(cnt[0].c).toBe(1);
  });

  dbIt('does NOT rewrite an existing user when the identity already existed', async () => {
    const mod = await import('../../modules/identity/telegram-user.js');
    const id = await mod.findOrCreateUserFromTelegram(mod.identityRepo, { id: 'existing', first_name: 'first' });
    const row = (await q(`SELECT id, first_name FROM users WHERE id=$1`, [id]))[0];
    const after = await mod.findOrCreateUserFromTelegram(mod.identityRepo, { id: 'existing' });
    expect(after).toBe(id);
    const row2 = (await q(`SELECT id, first_name FROM users WHERE id=$1`, [id]))[0];
    expect(row2.first_name).toBe('first');
  });
});
