/**
 * Create the initial administrator securely.
 * Usage: npm run create-admin -- --username <email> --password <pass>
 *
 * The password is never logged. scrypt is used for hashing.
 * Run on the server: docker compose exec backend npm run create-admin
 */
import crypto from 'crypto';
import { db, pool } from '../core/database/index.js';
import { users } from '../core/database/schema.js';
import { eq } from 'drizzle-orm';

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const username = getArg('username');
  const password = getArg('password');

  if (!username) {
    console.error('Usage: npm run create-admin -- --username <email> --password <secure-password>');
    process.exit(1);
  }
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters. Use a strong, unique password.');
    process.exit(1);
  }

  const existing = await db.select().from(users).where(eq(users.email, username)).limit(1);
  if (existing.length) {
    await db.update(users).set({ passwordHash: hashPassword(password), role: 'system_owner' }).where(eq(users.id, existing[0].id));
    console.log(`Existing user "${username}" promoted to system_owner.`);
  } else {
    await db.insert(users).values({
      email: username,
      passwordHash: hashPassword(password),
      role: 'system_owner',
      status: 'active',
    });
    console.log(`Admin "${username}" created with role system_owner.`);
  }
  console.log('IMPORTANT: store this password in your password manager. It is not recoverable.');
}

main()
  .catch((err) => {
    console.error('create-admin failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
