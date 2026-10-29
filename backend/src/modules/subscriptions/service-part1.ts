/**
 * Subscription lifecycle service — Part 1: core types and helpers.
 *
 * Purchase-to-delivery workflow (after payment is DEFINITIVELY confirmed):
 *  1. Lock / verify order
 *  2. Verify capacity or inventory
 *  3. Create subscription via panel adapter
 *  4. Verify creation result via panel API
 *  5. Persist provider subscription ID + metadata
 *  6. Deliver subscription URL/QR to customer
 *  7. Record full history
 *
 * If creation fails: order moves to `requires_review`, payment success is
 * preserved, duplicates are prevented, retries are safe, admins notified.
 */
import { db, pool } from '../../core/database/index.js';
import { orders, subscriptions, subscriptionEvents, serverNodes, panelConnections, products } from '../../core/database/schema.js';
import { createAdapter, StoredPanelConnection } from '../panel-adapters/index.js';
import { PanelError, SubscriptionInfo } from '../panel-adapters/types.js';
import { logger } from '../../core/logger/index.js';
import { eq, sql, and } from 'drizzle-orm';

const log = logger.child({ module: 'subscriptions' });

export type FulfillmentResult =
  | { ok: true; subscription: SubscriptionInfo; subscriptionId: string }
  | { ok: false; stage: 'no_panel' | 'no_capacity' | 'panel_error'; code: string; message: string };

function generateSubscriptionNumber(): string {
  return `SUB-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Select the best available server for a product.
 * - Only enabled panels with enabled healthy servers
 * - Skips servers at capacity
 * - Prefers lowest priority number among healthy servers
 */
export async function selectServerForProduct(productId: string): Promise<{ serverId: string; panelId: string } | null> {
  const rows = await db
    .select({
      serverId: serverNodes.id,
      panelId: panelConnections.id,
      priority: serverNodes.priority,
      capacity: serverNodes.capacity,
      currentUsage: serverNodes.currentUsage,
    })
    .from(serverNodes)
    .innerJoin(panelConnections, eq(serverNodes.panelId, panelConnections.id))
    .where(and(eq(serverNodes.isEnabled, true), eq(panelConnections.isEnabled, true), eq(serverNodes.status, 'online')))
    .orderBy(serverNodes.priority);

  for (const row of rows) {
    if (row.capacity == null || row.currentUsage == null || row.currentUsage < row.capacity) {
      return { serverId: row.serverId, panelId: row.panelId };
    }
  }
  return null;
}
