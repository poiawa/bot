/**
 * Purchase workflow — Part 1: order creation and pricing.
 *
 * Payment confirmation flow:
 *   initiate payment -> provider redirect -> callback/webhook ->
 *   server-side verification -> mark payment completed (idempotent) ->
 *   enqueue fulfillment
 */
import { db, pool } from '../../core/database/index.js';
import { orders, payments, paymentEvents } from '../../core/database/schema.js';
import { logger } from '../../core/logger/index.js';
import { eq } from 'drizzle-orm';

const log = logger.child({ module: 'payments' });

export function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export function generatePaymentNumber(): string {
  return `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Create an order for the current user with server-side pricing only.
 *  Prices are ALWAYS computed from the database product price — never
 *  from client-supplied amounts. */
export async function createOrder(userId: string, items: Array<{ productId: string; quantity: number }>): Promise<string> {
  const { products, productPrices } = await import('../../core/database/schema.js');
  let total = 0;
  const orderItems: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const rows = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
    if (!rows.length || !rows[0].isActive || !rows[0].isVisible) {
      throw new Error(`Product ${item.productId} is not available`);
    }
    const priceRows = await db.select().from(productPrices).where(eq(productPrices.productId, item.productId)).limit(1);
    if (!priceRows.length) {
      throw new Error(`Product ${item.productId} has no price configured`);
    }
    const unitPrice = priceRows[0].finalPrice; // integer Toman
    const quantity = Math.max(1, Math.min(10, item.quantity));
    total += unitPrice * quantity;
    orderItems.push({ productId: item.productId, quantity, unitPrice });
  }

  const orderId = crypto.randomUUID();
  await db.insert(orders).values({
    id: orderId,
    orderNumber: generateOrderNumber(),
    userId,
    status: 'pending',
    totalAmount: total,
    currency: 'IRT',
    items: orderItems,
  });
  return orderId;
}
