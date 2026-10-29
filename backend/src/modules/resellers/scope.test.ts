/**
 * Reseller scope isolation tests.
 * Pure-logic unit tests (no DB required). DB-backed integration tests for
 * the full assertCustomerInScope path are deferred to the integration suite.
 */
import { describe, it, expect } from 'vitest';
import { customerBelongsToReseller } from './scope.js';

describe('customerBelongsToReseller (scenario 9)', () => {
  it('accepts a customer owned by the requesting reseller', () => {
    expect(customerBelongsToReseller('reseller-A', 'reseller-A')).toBe(true);
  });

  it('rejects a customer owned by a different reseller', () => {
    expect(customerBelongsToReseller('reseller-B', 'reseller-A')).toBe(false);
  });

  it('rejects customers with no owning reseller', () => {
    expect(customerBelongsToReseller(null, 'reseller-A')).toBe(false);
    expect(customerBelongsToReseller(undefined, 'reseller-A')).toBe(false);
  });
});
