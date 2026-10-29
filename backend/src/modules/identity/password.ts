/**
 * Identity service: password hashing (scrypt with constant-time comparison),
 * registration and login. Authorization is always re-checked server-side.
 */
import crypto from 'crypto';
import { db, pool } from '../../core/database/index.js';
import { users, wallets } from '../../core/database/schema.js';
import { eq, or } from 'drizzle-orm';

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(pw, parts[1], expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export type AuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; reason: 'invalid_credentials' | 'suspended' };

/** Login by email or phone. Generic failure reason — never reveals which. */
export async function loginWithPassword(emailOrPhone: string, password: string): Promise<AuthResult> {
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.email, emailOrPhone), eq(users.phone, emailOrPhone)))    .limit(1);
  if (!rows.length || !rows[0].passwordHash) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  const user = rows[0];
  const storedHash = user.passwordHash as string;
  if (user.status !== 'active') {
    return { ok: false, reason: 'suspended' };
  }
  if (!verifyPassword(password, storedHash)) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { ok: true, userId: user.id, role: user.role };
}

/** Register a new customer account (idempotent wallet creation). */
export async function registerUser(params: {
  email?: string;
  phone?: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ ok: true; userId: string } | { ok: false; reason: 'already_exists' }> {
  const conditions = [];
  if (params.email) conditions.push(eq(users.email, params.email));
  if (params.phone) conditions.push(eq(users.phone, params.phone));
  if (conditions.length) {
    const existing = await db.select().from(users).where(or(...conditions)).limit(1);
    if (existing.length) return { ok: false, reason: 'already_exists' };
  }
  const created = await db
    .insert(users)
    .values({
      email: params.email,
      phone: params.phone,
      passwordHash: hashPassword(params.password),
      firstName: params.firstName,
      lastName: params.lastName,
      role: 'customer',
      status: 'active',
    })
    .returning({ id: users.id });
  const userId = created[0].id;
  await db.insert(wallets).values({ userId }).onConflictDoNothing();
  return { ok: true, userId };
}
