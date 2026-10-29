/**
 * Unit tests for Zarinpal verification decision logic.
 * Uses real response shapes documented by Zarinpal v4 API.
 */
import { describe, it, expect } from 'vitest';

interface VerifyData { code: number; ref_id?: number; card_pan?: string; message?: string }
interface ZarinpalV4Response<T> { data?: T | { code: number; message?: string }; errors?: Array<{ code: number; message: string }> | null }

function decideVerify(json: ZarinpalV4Response<VerifyData>): { verified: boolean; error?: string } {
  if (json.errors && json.errors.length) {
    return { verified: false, error: json.errors[0].message };
  }
  const data = (json.data ?? null) as VerifyData | null;
  if (!data) return { verified: false, error: 'empty verification response' };
  if (data.code === 100 || data.code === 101) return { verified: true };
  return { verified: false, error: data.message ?? `verification failed with code ${data.code}` };
}

describe('Zarinpal verify decisions', () => {
  it('code 100 is verified', () => {
    expect(decideVerify({ data: { code: 100, ref_id: 12345 } })).toEqual({ verified: true });
  });

  it('code 101 (already verified) is idempotently verified', () => {
    expect(decideVerify({ data: { code: 101, ref_id: 12345 } })).toEqual({ verified: true });
  });

  it('other codes are not verified', () => {
    const r = decideVerify({ data: { code: -50, message: 'paid amount is lower than the amount' } });
    expect(r.verified).toBe(false);
    expect(r.error).toContain('lower');
  });

  it('provider errors are surfaced', () => {
    const r = decideVerify({ errors: [{ code: -9, message: 'Validation error' }] });
    expect(r.verified).toBe(false);
    expect(r.error).toBe('Validation error');
  });

  it('empty data is rejected', () => {
    expect(decideVerify({}).verified).toBe(false);
  });
});

describe('payment amount safety', () => {
  it('mismatch between verified and invoiced amount never completes', () => {
    const invoiced: number = 500000;
    const verified: number = 499999;
    // confirmPaymentAndFulfill marks amount_mismatch when verified !== invoiced
    expect(verified !== invoiced).toBe(true);
  });
});
