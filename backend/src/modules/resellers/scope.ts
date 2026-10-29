/**
 * Reseller scope service.
 * HARD RULE: a reseller may only ever access customers/resources that are
 * explicitly assigned to their own reseller record. Every reseller-scoped
 * query must pass through these helpers.
 */
import { db } from '../../core/database/index.js';
import { resellers, users } from '../../core/database/schema.js';
import { eq } from 'drizzle-orm';

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeError';
  }
}

/** Resolve the reseller record for a user; throws if not an active reseller. */
export async function requireActiveReseller(userId: string) {
  const rows = await db.select().from(resellers).where(eq(resellers.userId, userId)).limit(1);
  if (!rows.length) throw new ScopeError('Not a reseller');
  if (!rows[0].isActive) throw new ScopeError('Reseller account is suspended');
  return rows[0];
}

/**
 * Verify a customer belongs to the reseller's scope.
 * Customers belong to a reseller when users.reseller_owner_id points at it.
 */
export async function assertCustomerInScope(resellerRecordId: string, customerId: string): Promise<void> {
  const rows = await db
    .select({ id: users.id, owner: users.resellerOwnerId })
    .from(users)
    .where(eq(users.id, customerId))
    .limit(1);
  if (!rows.length) throw new ScopeError('Customer not found');
  if (!customerBelongsToReseller(rows[0].owner, resellerRecordId)) {
    throw new ScopeError('Customer does not belong to this reseller');
  }
}

/** Pure decision function — unit tested without a database. */
export function customerBelongsToReseller(ownerId: string | null | undefined, resellerRecordId: string): boolean {
  return ownerId != null && ownerId === resellerRecordId;
}
