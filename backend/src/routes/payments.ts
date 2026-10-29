/**
 * Payment routes: initiation via configured providers, provider callbacks
 * with server-side verification, and card-to-card receipt submission
 * (manual approval — never auto-completed).
 */
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../core/database/index.js';
import { payments, paymentEvents, orders } from '../core/database/schema.js';
import { eq, and } from 'drizzle-orm';
import { getEnabledProviders } from '../modules/payments/index.js';
import type { PaymentMethodId } from '../modules/payments/types.js';
import { confirmPaymentAndFulfill } from '../modules/orders/service-part2.js';
import { audit } from '../modules/audit/index.js';
import { logger } from '../core/logger/index.js';

const log = logger.child({ module: 'routes.payments' });

const initiateSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(['zarinpal', 'card_to_card', 'wallet']),
});

export default async function paymentRoutes(app: FastifyInstance) {
  // List available payment methods (only configured ones)
  app.get('/methods', async () => {
    const enabled = [...getEnabledProviders().keys()];
    return { success: true, data: enabled };
  });

  // Initiate payment for an order
  app.post('/initiate', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const parsed = z
      .object({ orderId: z.string().uuid(), method: z.string() })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid input' });
    }
    const { orderId, method } = parsed.data;
    const providers = getEnabledProviders();
    const provider = providers.get(method as PaymentMethodId);
    if (!provider) {
      return reply.status(400).send({ success: false, error: `Payment method "${method}" is not available` });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!orderRows.length) return reply.status(404).send({ success: false, error: 'Order not found' });
    const order = orderRows[0];
    if (order.userId !== request.user.id) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }
    if (order.status !== 'pending') {
      return reply.status(409).send({ success: false, error: `Order is ${order.status}` });
    }

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const paymentId = crypto.randomUUID();
    const result = await provider.initiate({
      paymentId,
      amountToman: order.totalAmount,
      description: `Order ${order.orderNumber}`,
      callbackUrl: `${baseUrl}/api/payments/callback/${provider.id}`,
    });

    if (!result.ok) {
      log.warn({ orderId, method, error: result.error }, 'payment initiation failed');
      return reply.status(502).send({ success: false, error: result.error ?? 'Payment provider error' });
    }

    await db.insert(payments).values({
      id: paymentId,
      paymentNumber: `PAY-${Date.now()}-${paymentId.slice(0, 8)}`,
      orderId,
      amount: order.totalAmount,
      currency: 'IRT',
      method: provider.id as never,
      status: 'pending',
      provider: provider.id,
      providerRef: result.providerRef,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    await db.insert(paymentEvents).values({
      paymentId,
      event: 'initiated',
      data: { provider: provider.id, amount: order.totalAmount },
    });
    return { success: true, data: { paymentId, redirectUrl: result.redirectUrl } };
  });

  // Provider callback: verify server-side, then confirm + fulfill (idempotent)
  app.get('/callback/:provider', async (request, reply) => {
    const { provider: providerId } = request.params as { provider: string };
    const params = request.query as Record<string, string>;
    const providers = getEnabledProviders();
    const provider = providers.get(providerId as PaymentMethodId);
    if (!provider) {
      return reply.status(400).send({ success: false, error: 'Unknown provider' });
    }

    // Locate the pending payment by provider reference
    const providerRef = params.Authority ?? params.authority ?? params.provider_ref ?? '';
    if (!providerRef) {
      return reply.status(400).send({ success: false, error: 'Missing provider reference' });
    }
    const paymentRows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.providerRef, providerRef), eq(payments.status, 'pending')))
      .limit(1);
    if (!paymentRows.length) {
      // Unknown or already-processed reference — respond neutrally
      return reply.status(404).send({ success: false, error: 'Payment not found or already processed' });
    }
    const payment = paymentRows[0];

    const verification = await provider.verify({
      providerRef,
      amountToman: payment.amount,
      callbackParams: params as Record<string, string>,
    });

    await db.insert(paymentEvents).values({
      paymentId: payment.id,
      event: 'callback',
      data: { provider: providerId, verified: verification.verified, error: verification.error },
    });

    if (!verification.verified) {
      log.warn({ paymentId: payment.id, error: verification.error }, 'payment verification failed');
      return { success: false, error: verification.error ?? 'Payment verification failed' };
    }

    const outcome = await confirmPaymentAndFulfill({
      paymentId: payment.id,
      providerRef,
      verifiedAmount: payment.amount,
    });
    await audit({
      userId: null,
      action: 'payment.verified',
      entity: 'payment',
      entityId: payment.id,
      newData: { provider: providerId, providerRef, outcome: outcome.status },
    });
    return { success: true, data: outcome };
  });
}
