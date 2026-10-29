/**
 * Unit tests for the race-safe Telegram identity resolution.
 * These NEVER touch a database or the network — they drive the logic
 * through a fake IdentityRepo that emulates the production constraint
 * (unique telegram_id) and the 23505 duplicates seen under concurrency.
 */
import { describe, it, expect } from 'vitest';
import {
  findOrCreateUserFromTelegram,
  isDuplicateKeyError,
  isBlockedByUserError,
  type IdentityRepo,
  type TelegramProfile,
} from '../modules/identity/telegram-user.js';

/** In-memory repo that enforces the unique constraint like PostgreSQL. */
function makeRepo() {
  const identities = new Map<string, string>(); // telegramId -> userId
  const usersCreated: string[] = [];
  let cursor = 0;

  const repo: IdentityRepo = {
    async findIdentityByTelegramId(tgId) {
      const userId = identities.get(tgId);
      return userId ? { userId } : null;
    },
    async createUserAndIdentity(profile) {
      const tgId = String(profile.id);
      // Simulate the real DB: user is "created", then the identity insert
      // violates the unique constraint -> throw 23505. Callers must treat the
      // transaction as rolled back (no orphan user in the real DB).
      if (identities.has(tgId)) {
        throw { code: '23505', message: 'duplicate key value violates unique constraint "telegram_identities_telegram_id_unique"' };
      }
      const userId = `user-${++cursor}`;
      identities.set(tgId, userId);
      usersCreated.push(userId);
      return userId;
    },
    async ensureWallet() {
      /* no-op in-memory */
    },
  };

  return { repo, identities, usersCreated };
}

const profile: TelegramProfile = { id: 123456789, username: 'alice', first_name: 'Alice' };

describe('findOrCreateUserFromTelegram', () => {
  it('creates the user+identity on first /start', async () => {
    const { repo, identities, usersCreated } = makeRepo();
    const userId = await findOrCreateUserFromTelegram(repo, profile);

    expect(userId).toBe('user-1');
    expect(identities.get('123456789')).toBe('user-1');
    expect(usersCreated).toEqual(['user-1']);
  });

  it('reuses the existing identity on a re-run of /start — no duplicate user', async () => {
    const { repo, usersCreated } = makeRepo();
    const first = await findOrCreateUserFromTelegram(repo, profile);
    const second = await findOrCreateUserFromTelegram(repo, profile);
    const third = await findOrCreateUserFromTelegram(repo, profile);

    expect(second).toBe(first);
    expect(third).toBe(first);
    // Fast-path: no create attempted for the repeats.
    expect(usersCreated).toEqual(['user-1']);
  });

  it('two concurrent /start for the SAME telegram_id yield one user + one identity', async () => {
    const { repo, identities, usersCreated } = makeRepo();

    const [a, b] = await Promise.all([
      findOrCreateUserFromTelegram(repo, profile),
      findOrCreateUserFromTelegram(repo, profile),
    ]);

    // Both resolved to the SAME user (the loser read back the winner).
    expect(a).toBe(b);
    expect(usersCreated.length).toBe(1);
    expect(identities.size).toBe(1);
    expect(identities.get('123456789')).toBe(a);
  });

  it('does not create orphan users: failed (23505) attempt never leaves a user', async () => {
    const { repo, usersCreated } = makeRepo();
    // First request wins.
    await findOrCreateUserFromTelegram(repo, profile);
    // Second request hits 23505 then reads back the winner.
    await findOrCreateUserFromTelegram(repo, profile);

    expect(usersCreated.length).toBe(1);

    // Different telegram_id -> separate user, allowed.
    await findOrCreateUserFromTelegram(repo, { ...profile, id: 999 });
    expect(usersCreated.length).toBe(2);
    expect(usersCreated[1]).toBe('user-2');
  });

  it('rethrows non-duplicate errors instead of swallowing them', async () => {
    const failing: IdentityRepo = {
      async findIdentityByTelegramId() {
        return null;
      },
      async createUserAndIdentity() {
        throw new Error('connection reset');
      },
      async ensureWallet() {},
    };

    await expect(findOrCreateUserFromTelegram(failing, profile)).rejects.toThrow('connection reset');
  });
});

describe('isDuplicateKeyError', () => {
  it('detects pg 23505 directly and when wrapped', () => {
    expect(isDuplicateKeyError({ code: '23505' })).toBe(true);
    expect(isDuplicateKeyError({ cause: { code: '23505' } })).toBe(true);
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false);
    expect(isDuplicateKeyError({})).toBe(false);
  });
});

describe('isBlockedByUserError', () => {
  it('detects 403 code', () => {
    expect(isBlockedByUserError({ code: 403, description: 'Forbidden: bot was blocked by the user' })).toBe(true);
  });

  it('detects the blocked message in a plain Error or string', () => {
    expect(isBlockedByUserError(new Error('403: Forbidden: bot was blocked by the user'))).toBe(true);
    expect(isBlockedByUserError('Forbidden: bot was blocked by the user')).toBe(true);
  });

  it('does NOT flag other send errors', () => {
    expect(isBlockedByUserError({ code: 400, description: 'Bad Request: message is too long' })).toBe(false);
    expect(isBlockedByUserError(new Error('500: Internal Server Error'))).toBe(false);
  });
});
