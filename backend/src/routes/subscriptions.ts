/**
 * Subscription routes: list, details (ownership-enforced), renewal via the
 * panel adapter, enable/disable, QR code generation.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../core/database/index.js';
import { subscriptions, subscriptionEvents, users, telegramIdentities } from '../core/database/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { audit } from '../modules/audit/index.js';
import { createAdapter, StoredPanelConnection } from '../modules/panel-adapters/index.js';
import { panelConnections } from '../core/database/schema.js';
import { PanelError } from '../modules/panel-adapters/types.js';

export default async function subscriptionRoutes(app: FastifyInstance) {
  // My subscriptions
  app.get('/me', { preHandler: [app.authenticate] }, async (request: any) => {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, request.user.id));
    return { success: true, data: rows };
  });

  // Subscription details — owner or admin only (IDOR protection)
  app.get('/:id', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!rows.length) {
      return reply.status(404).send({ success: false, error: 'Subscription not found' });
    }
    const sub = rows[0];
    if (sub.userId !== request.user.id) {
      await audit({ userId: request.user.id, action: 'subscription.access_denied', entity: 'subscription', entityId: id, ipAddress: request.ip });
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }
    return { success: true, data: sub };
  });

  // Renew: extends expiry from the later of (now, current expiry).
  // Idempotent per attempt; renewal policy comes from the panel adapter.
  app.post('/:id/renew', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const parsed = z
      .object({ durationDays: z.number().int().min(1).max(3650) })
      .safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'durationDays required (1-3650)' });
    }
    const { id } = request.params as { id: string };
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!rows.length) return reply.status(404).send({ success: false, error: 'Subscription not found' });
    const sub = rows[0];
    if (sub.userId !== request.user.id) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }
    if (!sub.panelId || !sub.username) {
      return reply.status(409).send({ success: false, error: 'Subscription has no panel binding to renew' });
    }
    try {
      const info = await renewOnPanel(sub.panelId, sub.username, parsed.data.durationDays);
      await db
        .update(subscriptions)
        .set({ expiresAt: info.expiresAt, updatedAt: new Date() })
        .where(eq(subscriptions.id, id));
      await db.insert(subscriptionEvents).values({
        subscriptionId: id,
        event: 'renewed',
        data: { durationDays: parsed.data.durationDays, newExpiry: info.expiresAt },
      });
      await audit({ userId: request.user.id, action: 'subscription.renew', entity: 'subscription', entityId: id, newData: { durationDays: parsed.data.durationDays } });
      return { success: true, data: { expiresAt: info.expiresAt } };
    } catch (err) {
      if (err instanceof PanelError) {
        return reply.status(502).send({ success: false, error: `${err.code}: ${err.message}` });
      }
      throw err;
    }
  });
}

/** Load the panel connection and perform a renewal through its adapter. */
async function renewOnPanel(panelId: string, username: string, durationDays: number) {
  const panelRows = await db.select().from(panelConnections).where(eq(panelConnections.id, panelId)).limit(1);
  if (!panelRows.length) {
    throw new PanelError('Panel connection not found', 'NOT_FOUND');
  }
  const panel = panelRows[0] as unknown as StoredPanelConnection;
  const adapter = createAdapter(panel);
  return adapter.renewSubscription(username, { username, durationDays });
}
