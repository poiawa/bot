/**
 * Telegram identity resolution — idempotent, race-safe find-or-create.
 *
 * Guarantees:
 * - A given telegram_id maps to exactly ONE identity and ONE user, even under
 *   concurrent /start requests (the DB unique constraint is the final arbiter).
 * - No orphan users: user + identity are created in one transaction, so if the
 *   identity insert conflicts, the whole transaction (including the user row)
 *   rolls back and we re-read the winner.
 * - Never recreates or rewrites an existing user's data.
 */
import { db } from '../../core/database/index.js';
import { users, wallets, telegramIdentities } from '../../core/database/schema.js';
import { eq } from 'drizzle-orm';

export interface TelegramProfile {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/** Data-access seam so the resolution logic is unit-testable without a DB. */
export interface IdentityRepo {
  findIdentityByTelegramId(tgId: string): Promise<{ userId: string } | null>;
  /** Must throw a duplicate-key error (code '23505') on telegram_id conflict. */
  createUserAndIdentity(profile: TelegramProfile): Promise<string>;
  ensureWallet(userId: string): Promise<void>;
}

/** Detect unique-violation errors from node-postgres (survives Drizzle wrapping). */
export function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Detect "bot was blocked by the user" (403). Never throws. */
export function isBlockedByUserError(err: unknown): boolean {
  const e = err as { code?: number; description?: string; message?: string };
  const code = e?.code;
  const msg = e?.description ?? (err instanceof Error ? err.message : String(err));
  if (code === 403) return true;
  return typeof msg === 'string' && /blocked by the user|forbidden: bot was blocked/i.test(msg);
}

/**
 * Resolve the platform user behind a Telegram account.
 *
 * Fast path: existing identity -> return its userId.
 * Slow path: create user+identity in one transaction; on duplicate (a
 * concurrent request won the race) re-read the existing identity and return
 * ITS userId — never a fresh one. Bounded retry; other errors rethrow.
 */
export async function findOrCreateUserFromTelegram(
  repo: IdentityRepo,
  profile: TelegramProfile
): Promise<string> {
  const tgId = String(profile.id);

  const existing = await repo.findIdentityByTelegramId(tgId);
  if (existing) {
    await repo.ensureWallet(existing.userId);
    return existing.userId;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const userId = await repo.createUserAndIdentity(profile);
      await repo.ensureWallet(userId);
      return userId;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // A concurrent request created the identity first. Re-read the winner.
      const winner = await repo.findIdentityByTelegramId(tgId);
      if (winner) {
        await repo.ensureWallet(winner.userId);
        return winner.userId;
      }
      // Transient: identity missing between rollback and re-read — retry once more.
    }
  }
  throw new Error('Could not resolve Telegram identity after 3 attempts');
}

/** Production repo backed by the real database (transactional create). */
export const identityRepo: IdentityRepo = {
  async findIdentityByTelegramId(tgId) {
    const rows = await db
      .select({ userId: telegramIdentities.userId })
      .from(telegramIdentities)
      .where(eq(telegramIdentities.telegramId, tgId))
      .limit(1);
    return rows.length ? rows[0] : null;
  },

  async createUserAndIdentity(profile) {
    return db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          firstName: profile.first_name,
          lastName: profile.last_name,
        })
        .returning({ id: users.id });
      // If this conflicts (23505), the transaction rolls back the user insert too.
      await tx.insert(telegramIdentities).values({
        userId: user.id,
        telegramId: String(profile.id),
        username: profile.username,
        firstName: profile.first_name,
        lastName: profile.last_name,
      });
      return user.id;
    });
  },

  async ensureWallet(userId) {
    await db.insert(wallets).values({ userId }).onConflictDoNothing();
  },
};
