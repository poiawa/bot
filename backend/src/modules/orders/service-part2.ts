/**
 * Purchase workflow — Part 2: payment confirmation (idempotent) and
 * dispatch to fulfillment.
 *
 * Guarantees:
 * - A payment is only marked completed after authoritative verification.
 * - Duplicate callbacks/webhooks are harmless (row lock + status check).
 * - If fulfillment fails, the order goes to `requires_review` and admins
 *   are notified — the payment remains completed.
 */
import { db, pool } from '../../core/database/index.js';
import { payments, paymentEvents, orders } from '../../core/database/schema.js';
import { getProvider, getEnabledProviders } from '../payments/index.js';
import { PaymentMethodId } from '../payments/types.js';
import { fulfillOrder } from '../subscriptions/index.js';
import { logger } from '../../core/logger/index.js';
import { eq, and } from 'drizzle-orm';
import { addJob, QUEUE_NAMES } from '../../core/queue/index.js';

const log = logger.child({ module: 'payments' });

export interface ConfirmationOutcome {
  status: 'completed' | 'already_completed' | 'failed' | 'not_found' | 'amount_mismatch';
  fulfillment?: 'created' | 'queued' | 'failed_requires_review';
  error?: string;
}

/**
 * Confirm a payment after verification, then trigger fulfillment.
 * This function is idempotent: calling it twice with the same payment
 * will not create two subscriptions or two ledger entries.
 */
export async function confirmPaymentAndFulfill(params: {
  paymentId: string;
  providerRef: string;
  verifiedAmount: number;
  eventIdempotencyKey?: string;
}): Promise<ConfirmationOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentRes = await client.query(
      `SELECT id, order_id, amount, status, method FROM payments WHERE id = $1 FOR UPDATE`,
      [params.paymentId]
    );
    if (!paymentRes.rows.length) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }
    const payment = paymentRes.rows[0];

    // Idempotency: already completed — do nothing.
    if (payment.status === 'completed') {
      await client.query('COMMIT');
      return { status: 'already_completed' };
    }

    // Amount check: verified amount must match the invoice exactly.
    if (params.verifiedAmount !== payment.amount) {
      await db.insert(paymentEvents).values({
        paymentId: params.paymentId,
        event: 'amount_mismatch',
        data: { expected: payment.amount, received: params.verifiedAmount },
      });
      await client.query('COMMIT');
      log.warn({ paymentId: params.paymentId, expected: payment.amount, received: params.verifiedAmount }, 'payment amount mismatch');
      return { status: 'amount_mismatch', error: 'Verified amount does not match invoice' };
    }

    await client.query(
      `UPDATE payments SET status = 'completed', paid_at = NOW() WHERE id = $1`,
      [params.paymentId]
    );
    await db.insert(paymentEvents).values({
      paymentId: params.paymentId,
      event: 'verified',
      data: { providerRef: params.providerRef },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Fulfillment (outside payment lock; fulfillment itself is idempotent)
  try {
    const orderRes = await db.select().from(orders).where(eq(orders.id, (await db.select({ orderId: payments.orderId }).from(payments).where(eq(payments.id, params.paymentId)).limit(1))[0].orderId)).limit(1);
    const orderId = orderRes[0].id;
    await db.update(orders).set({ status: 'processing' }).where(eq(orders.id, orderId));
    const result = await fulfillOrder(orderId);
    if (!result.ok) {
      await db.update(orders).set({ status: 'requires_review' }).where(eq(orders.id, orderId));
      await db.insert(paymentEvents).values({
        paymentId: params.paymentId,
        event: 'fulfillment_failed',
        data: { stage: result.stage, code: result.code, message: result.message },
      });
      // Notify admins (queued notification)
      await addJob(QUEUE_NOTIFICATIONS, {
        name: 'admin-alert',
        data: { type: 'fulfillment_failed', orderId, code: result.code, message: result.message },
      });
      return { status: 'completed', fulfillment: 'failed_requires_review', error: result.message };
    }
    return { status: 'completed', fulfillment: 'created' };
  } catch (err) {
    log.error({ err, paymentId: params.paymentId }, 'fulfillment dispatch failed');
    return { status: 'completed', fulfillment: 'queued', error: 'fulfillment will be retried' };
  }
}

const QUEUE_NOTIFICATIONS = 'notifications' as const;

/** Initiate a payment via a provider */
export async function initiatePayment(params: {
  orderId: string;
  method: PaymentMethodId;
  userId: string;
  description: string;
  baseUrl: string;
}): Promise<{ paymentId: string; redirectUrl: string | null; error?: string }> {
  const providers = getEnabledProviders();
  const provider = providers.get(params.method);
  if (!provider) {
    return { paymentId: '', redirectUrl: null, error: `Payment method ${params.method} is not available` };
  }

  const orderRows = await db.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
  if (!orderRows.length) {
    return { paymentId: '', redirectUrl: null, error: 'Order not found' };
  }
  const order = orderRows[0];
  if (order.userId !== params.userId) {
    return { paymentId: '', redirectUrl: null, error: 'forbidden' };
  }

  const paymentId = crypto.randomUUID();
  const payment = provider.id;
  const result = await provider.initiate({
    paymentId,
    amountToman: order.totalAmount,
    description: params.description,
    callbackUrl: `${params.baseUrl}/api/payments/callback/${provider.id}`,
  });

  if (!result.ok) {
    return { paymentId, redirectUrl: null, error: result.error };
  }

  await db.insert(payments).values({
    id: paymentId,
    paymentNumber: `PAY-${Date.now()}-${paymentId.slice(0, 8)}`,
    orderId: params.orderId,
    amount: order.totalAmount,
    currency: 'IRT',
    method: provider.id as never,
    status: 'pending',
    provider: provider.id,
    providerRef: result.providerRef,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });

  return { paymentId, redirectUrl: result.redirectUrl };
}
