/**
 * Order routes: create (server-side pricing), list own orders.
 * Prices come exclusively from product_prices — client amounts ignored.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../core/database/index.js';
import { orders } from '../core/database/schema.js';
import { eq, desc } from 'drizzle-orm';
import { createOrder } from '../modules/orders/service-part1.js';
import { audit } from '../modules/audit/index.js';

export default async function orderRoutes(app: FastifyInstance) {
  // Create a new order for the authenticated user
  app.post('/', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const parsed = z
      .object({
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().min(1).max(10).default(1),
            })
          )
          .min(1)
          .max(10),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid input' });
    }
    try {
      const orderId = await createOrder(request.user.id, parsed.data.items);
      await audit({ userId: request.user.id, action: 'order.create', entity: 'order', entityId: orderId, ipAddress: request.ip });
      return { success: true, data: { orderId } };
    } catch (err) {
      return reply.status(409).send({ success: false, error: err instanceof Error ? err.message : 'Order failed' });
    }
  });

  // List my orders
  app.get('/me', { preHandler: [app.authenticate] }, async (request: any) => {
    const rows = await db.select().from(orders).where(eq(orders.userId, request.user.id)).limit(100);
    return { success: true, data: rows };
  });

  // Order details — owner or admin only
  app.get('/:id', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!rows.length) return reply.status(404).send({ success: false, error: 'Order not found' });
    if (rows[0].userId !== request.user.id) {
      await audit({ userId: request.user.id, action: 'order.access_denied', entity: 'order', entityId: id, ipAddress: request.ip });
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }
    return { success: true, data: rows[0] };
  });
}
