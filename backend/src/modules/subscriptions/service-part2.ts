/**
 * Subscription lifecycle — Part 2: fulfillment (creation on panel).
 *
 * Idempotency: before calling the panel, we check whether a subscription
 * row already exists for the order. If it does, we return it instead of
 * creating a duplicate on the panel.
 */
import { db, pool } from '../../core/database/index.js';
import { orders, subscriptions, subscriptionEvents, panelConnections, products } from '../../core/database/schema.js';
import { createAdapter, StoredPanelConnection } from '../panel-adapters/index.js';
import { PanelError } from '../panel-adapters/types.js';
import { logger } from '../../core/logger/index.js';
import { eq } from 'drizzle-orm';
import { selectServerForProduct, FulfillmentResult } from './service-part1.js';

const log = logger.child({ module: 'subscriptions' });

/**
 * Fulfill a paid order by creating the subscription on the assigned panel.
 *
 * Safe to retry: if a subscription for this order already exists, it is
 * returned without touching the panel again.
 */
export async function fulfillOrder(orderId: string): Promise<FulfillmentResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the order row
    const orderRes = await client.query(
      `SELECT id, user_id, status, items FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (!orderRes.rows.length) {
      return { ok: false, stage: 'panel_error', code: 'ORDER_NOT_FOUND', message: 'Order not found' };
    }
    const order = orderRes.rows[0];

    if (order.status === 'completed') {
      // Already fulfilled — idempotent no-op
      const existing = await client.query(
        `SELECT id FROM subscriptions WHERE order_id = $1 LIMIT 1`,
        [orderId]
      );
      if (existing.rows.length) {
        await client.query('COMMIT');
        return { ok: true, subscriptionId: existing.rows[0].id, subscription: null as never };
      }
    }

    const items = order.items as Array<{ productId: string; quantity?: number }>;
    const firstItem = items?.[0];
    if (!firstItem?.productId) {
      throw new PanelError('Order has no valid items', 'API_ERROR');
    }

    // 2. Verify capacity / select server
    await client.query('COMMIT'); // release lock before slow panel I/O
    const selection = await selectServerForProduct(firstItem.productId);
    if (!selection) {
      return { ok: false, stage: 'no_capacity', code: 'NO_CAPACITY', message: 'No healthy server with capacity available' };
    }

    // Check for existing subscription for this order (idempotency)
    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orderId, orderId))
      .limit(1);
    if (existingSub.length && existingSub[0].providerSubscriptionId) {
      log.info({ orderId, subscriptionId: existingSub[0].id }, 'subscription already fulfilled for order');
      return {
        ok: true,
        subscriptionId: existingSub[0].id,
        subscription: {
          providerId: existingSub[0].providerSubscriptionId ?? existingSub[0].username ?? '',
          username: existingSub[0].username ?? '',
          status: 'active',
          dataLimitGb: existingSub[0].dataLimitGb ?? null,
          usedDataGb: null,
          expiresAt: existingSub[0].expiresAt ?? null,
          subscriptionUrl: existingSub[0].configData ?? null,
          raw: null,
        },
      };
    }

    // 3. Create via panel adapter
    const panelRows = await db.select().from(panelConnections).where(eq(panelConnections.id, selection.panelId)).limit(1);
    if (!panelRows.length) {
      return { ok: false, stage: 'no_panel', code: 'PANEL_NOT_FOUND', message: 'Panel connection not found' };
    }
    const panel = panelRows[0] as unknown as StoredPanelConnection;

    const adapter = createAdapter(panel);
    const productRows = await db.select().from(products).where(eq(products.id, firstItem.productId)).limit(1);
    const product = productRows[0];

    const username = `u_${orderId.slice(0, 8)}_${Date.now().toString(36).slice(-4)}`;
    const expireAt = product?.durationDays
      ? new Date(Date.now() + product.durationDays * 86400_000)
      : undefined;

    let info;
    try {
      info = await adapter.createSubscription({
        username,
        dataLimitGb: product?.dataLimitGb ?? undefined,
        expireAt,
      });
    } catch (err) {
      const code = err instanceof PanelError ? err.code : 'UNKNOWN';
      const message = err instanceof Error ? err.message : 'unknown panel error';
      log.error({ orderId, code, message }, 'subscription creation failed');
      return { ok: false, stage: 'panel_error', code, message };
    }

    // 4/5. Persist subscription + event history
    const subId = crypto.randomUUID();
    await db.insert(subscriptions).values({
      id: subId,
      subscriptionNumber: `SUB-${Date.now()}-${subId.slice(0, 8)}`,
      userId: order.user_id,
      orderId,
      productId: firstItem.productId,
      serverId: selection.serverId,
      panelId: selection.panelId,
      providerSubscriptionId: info.providerId,
      username: info.username,
      status: 'active',
      dataLimitGb: info.dataLimitGb != null ? Math.ceil(info.dataLimitGb) : null,
      usedDataGb: info.usedDataGb != null ? Math.ceil(info.usedDataGb) : null,
      expiresAt: info.expiresAt,
      configData: info.subscriptionUrl,
    });
    await db.insert(subscriptionEvents).values({
      subscriptionId: subId,
      event: 'created',
      data: { orderId, panelId: selection.panelId, serverId: selection.serverId },
    });
    await db.update(orders).set({ status: 'completed', completedAt: new Date() }).where(eq(orders.id, orderId));

    log.info({ orderId, subscriptionId: subId, username: info.username }, 'subscription created');
    return { ok: true, subscription: info, subscriptionId: subId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
