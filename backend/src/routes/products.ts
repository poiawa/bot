import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(1),
  nameFa: z.string().optional(),
  description: z.string().optional(),
  descriptionFa: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['time', 'data', 'combined', 'device_limit', 'trial']),
  durationDays: z.number().int().positive().optional(),
  dataLimitGb: z.number().int().positive().optional(),
  deviceLimit: z.number().int().positive().optional(),
  basePrice: z.number().int().positive(),
  finalPrice: z.number().int().positive(),
  imageUrl: z.string().url().optional(),
  isVisible: z.boolean().default(true),
  labels: z.array(z.string()).default([]),
  allowedPanels: z.array(z.string()).default([]),
  allowedServers: z.array(z.string()).default([]),
  supportedProtocols: z.array(z.string()).default([]),
});

export default async function productRoutes(app: FastifyInstance) {
  // List all visible products
  app.get('/', async (request, reply) => {
    return {
      success: true,
      data: [],
      message: 'List products not implemented yet',
    };
  });

  // List products (admin)
  app.get('/all', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: [],
      message: 'List all products not implemented yet',
    };
  });

  // Get product by ID
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Get product ${id} not implemented yet`,
    };
  });

  // Create product (admin only)
  app.post('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const body = createProductSchema.parse(request.body);
    return {
      success: true,
      data: null,
      message: 'Create product not implemented yet',
    };
  });

  // Update product (admin only)
  app.patch('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Update product ${id} not implemented yet`,
    };
  });

  // Delete product (admin only)
  app.delete('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      message: `Delete product ${id} not implemented yet`,
    };
  });

  // Product categories
  app.get('/categories/list', async (request, reply) => {
    return {
      success: true,
      data: [],
      message: 'List categories not implemented yet',
    };
  });

  app.post('/categories', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: null,
      message: 'Create category not implemented yet',
    };
  });
}