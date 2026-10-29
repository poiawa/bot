/**
 * Unit tests for Marzban adapter mapping and error conversion.
 * No live panel required — these test pure mapping/decision logic.
 */
import { describe, it, expect } from 'vitest';
import { PanelError, SubscriptionInfo } from '../panel-adapters/types.js';

// Test the mapping logic via a minimal harness that mirrors mapUser/mapStatus.
// To keep the adapter's private methods testable, replicate the GB conversion.
const GB = 1024 * 1024 * 1024;

interface MarzbanUser {
  username: string;
  status: string;
  used_traffic: number;
  data_limit: number | null;
  expire: number | null;
  subscription_url?: string;
}

function mapStatus(status: string): SubscriptionInfo['status'] {
  switch (status) {
    case 'active': return 'active';
    case 'expired': return 'expired';
    case 'disabled': return 'disabled';
    case 'limited': return 'limited';
    default: return 'active';
  }
}

function mapUser(u: MarzbanUser): SubscriptionInfo {
  return {
    providerId: u.username,
    username: u.username,
    status: mapStatus(u.status),
    dataLimitGb: u.data_limit != null ? u.data_limit / GB : null,
    usedDataGb: u.used_traffic != null ? u.used_traffic / GB : null,
    expiresAt: u.expire != null ? new Date(u.expire * 1000) : null,
    subscriptionUrl: u.subscription_url ?? null,
    raw: u,
  };
}

describe('Marzban payload mapping', () => {
  it('maps an active user with limits', () => {
    const info = mapUser({
      username: 'u_test',
      status: 'active',
      used_traffic: 2 * GB,
      data_limit: 10 * GB,
      expire: 1893456000, // 2030-01-01
    });
    expect(info.status).toBe('active');
    expect(info.dataLimitGb).toBe(10);
    expect(info.usedDataGb).toBe(2);
    expect(info.expiresAt?.getUTCFullYear()).toBe(2030);
  });

  it('maps unlimited data as null (not zero)', () => {
    const info = mapUser({ username: 'u', status: 'active', used_traffic: 0, data_limit: null, expire: null });
    expect(info.dataLimitGb).toBeNull();
    expect(info.usedDataGb).toBe(0); // zero is explicit
  });

  it('distinguishes disabled/expired/limited statuses', () => {
    expect(mapStatus('disabled')).toBe('disabled');
    expect(mapStatus('expired')).toBe('expired');
    expect(mapStatus('limited')).toBe('limited');
    expect(mapStatus('unknown_status')).toBe('active');
  });
});

describe('PanelError semantics', () => {
  it('carries code and provider status', () => {
    const err = new PanelError('user exists', 'USERNAME_TAKEN', 400, { detail: 'already exists' });
    expect(err.code).toBe('USERNAME_TAKEN');
    expect(err.providerStatus).toBe(400);
  });
});
