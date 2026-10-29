/**
 * Product catalog routes.
 * Prices are always read from product_prices — never accepted from clients.
 */
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../core/database/index.js';
import { products, productPrices, productCategories } from '../core/database/schema.js';
import { eq, and, asc, desc } from 'drizzle-orm';
import { audit } from '../modules/audit/index.js';

const createProductSchema = z.object({
  name: z.string().min(1).max(191),
  nameFa: z.string().max(191).optional(),
  description: z.string().max(4000).optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['time', 'data', 'combined', 'device_limit', 'trial', 'inventory', 'manual']),
  durationDays: z.number().int().min(1).max(3650).optional(),
  dataLimitGb: z.number().int().min(1).max(10240).optional(),
  deviceLimit: z.number().int().min(1).max(50).optional(),
  basePrice: z.number().int().min(0),
  finalPrice: z.number().int().min(0),
  imageUrl: z.string().url().max(500).optional(),
  isVisible: z.boolean().default(true),
  labels: z.array(z.string().max(32)).max(5).default([]),
  allowedPanels: z.array(z.string().uuid()).max(20).default([]),
  allowedServers: z.array(z.string().uuid()).max(50).default([]),
});

export default async function productRoutes(app: FastifyInstance) {
  // Public list: visible + active products with their current prices
  app.get('/', async (request, reply) => {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        imageUrl: products.imageUrl,
        type: products.type,
        durationDays: products.durationDays,
        dataLimitGb: products.dataLimitGb,
        deviceLimit: products.deviceLimit,
        labels: products.labels,
        finalPrice: productPrices.finalPrice,
        basePrice: productPrices.basePrice,
      })
      .from(products)
      .leftJoin(productPrices, eq(products.id, productPrices.productId))
      .where(and(eq(products.isVisible, true), eq(products.isActive, true)))
      .orderBy(asc(products.sortOrder))
      .limit(50);
    return { success: true, data: rows };
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return reply.status(400).send({ success: false, error: 'Invalid product ID' });
    }
    const rows = await db
      .select()
      .from(products)
      .leftJoin(productPrices, eq(products.id, productPrices.productId))
      .where(eq(products.id, id))
      .limit(1);
    if (!rows.length || !rows[0].products.isVisible) {
      return reply.status(404).send({ success: false, error: 'Product not found' });
    }
    const row = rows[0];
    return {
      success: true,
      data: { ...row.products, price: row.product_prices ? row.product_prices : null },
    };
  });

  // Admin: create product with price
  app.post('/', { preHandler: [app.adminOnly] }, async (request: any, reply) => {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid input', details: parsed.error.flatten() });
    }
    const p = parsed.data;
    const id = crypto.randomUUID();
    await db.insert(products).values({
      id,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      type: p.type,
      durationDays: p.durationDays,
      dataLimitGb: p.dataLimitGb,
      deviceLimit: p.deviceLimit,
      isVisible: p.isVisible,
      labels: p.labels as never,
      allowedPanels: p.allowedPanels as never,
      allowedServers: p.allowedServers as never,
    });
    await db.insert(productPrices).values({
      productId: id,
      basePrice: p.basePrice,
      finalPrice: p.finalPrice,
      currency: 'IRT',
    });
    await audit({
      userId: request.user.id,
      action: 'product.create',
      entity: 'product',
      entityId: id,
      newData: { name: p.name, finalPrice: p.finalPrice },
      ipAddress: request.ip,
    });
    return { success: true, data: { id } };
  });

  app.patch('/:id', { preHandler: [app.adminOnly] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const allowed = ['name', 'description', 'isVisible', 'sortOrder'] as const;
    const body = request.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if ((allowed as readonly string[]).includes(key)) updates[key] = (body as Record<string, unknown>)[key];
    }
    if (!Object.keys(updates).length) {
      return reply.status(400).send({ success: false, error: 'No valid fields to update' });
    }
    const existing = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing.length) {
      return reply.status(404).send({ success: false, error: 'Product not found' });
    }
    await db.update(products).set(updates).where(eq(products.id, id));
    await audit({ userId: request.user.id, action: 'product.update', entity: 'product', entityId: id, oldData: existing[0], newData: updates, ipAddress: request.ip });
    return { success: true };
  });

  // Categories (public)
  app.get('/categories/list', async () => {
    const rows = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.isActive, true))
      .orderBy(asc(productCategories.sortOrder));
    return { success: true, data: rows };
  });

  app.post('/categories', { preHandler: [app.adminOnly] }, async (request: any, reply) => {
    const { name, nameFa } = request.body as { name?: string; nameFa?: string };
    if (!name) return reply.status(400).send({ success: false, error: 'name required' });
    const created = await db.insert(productCategories).values({ name, nameFa }).returning({ id: productCategories.id });
    await audit({ userId: request.user.id, action: 'category.create', entity: 'product_category', entityId: created[0].id });
    return { success: true, data: { id: created[0].id } };
  });
}
