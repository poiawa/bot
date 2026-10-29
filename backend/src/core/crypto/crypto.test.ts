/**
 * Unit tests for the crypto core.
 * These run without a database; ENCRYPTION_KEY is set per test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, generateSecureToken } from './index.js';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-key-never-use-in-production-0123456789';
});

describe('encrypt/decrypt roundtrip', () => {
  it('roundtrips a normal string', () => {
    const secret = 'panel-password-123';
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it('roundtrips unicode', () => {
    const secret = 'رمز عبور ۱۲۳ 🔐';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const enc1 = encrypt('same');
    const enc2 = encrypt('same');
    expect(enc1).not.toBe(enc2);
  });

  it('rejects tampered ciphertext', () => {
    const enc = encrypt('secret');
    const parts = enc.split(':');
    parts[2] = 'ff' + parts[2].slice(2);
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decrypt('not-valid')).toThrow();
  });
});

describe('token generation', () => {
  it('generates hex tokens of requested length', () => {
    const t = generateSecureToken(16);
    expect(t).toHaveLength(32);
    expect(t).toMatch(/^[0-9a-f]+$/);
  });

  it('generates unique tokens', () => {
    expect(generateSecureToken()).not.toBe(generateSecureToken());
  });
});
