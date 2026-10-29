import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../core/database/index.js';
import { users } from '../core/database/schema.js';
import { eq } from 'drizzle-orm';

const createUserSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(['customer', 'reseller']).default('customer'),
});

export default async function userRoutes(app: FastifyInstance) {
  // Get current user profile
  app.get('/me', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, request.user.id),
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    };
  });

  // Update profile
  app.patch('/me', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const updates = request.body;
    // Implement profile update
    return { success: true, message: 'Profile update not implemented yet' };
  });

  // Get user subscriptions
  app.get('/me/subscriptions', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return {
      success: true,
      data: [],
      message: 'Fetch user subscriptions not implemented yet',
    };
  });

  // Get user orders
  app.get('/me/orders', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return { success: true, data: [], message: 'Fetch user orders not implemented yet' };
  });

  // Get user tickets
  app.get('/me/tickets', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return { success: true, data: [], message: 'Fetch user tickets not implemented yet' };
  });

  // List users (admin only)
  app.get('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [], message: 'List users not implemented yet' };
  });

  // Get user by ID (admin only)
  app.get('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return { success: true, data: null, message: 'Get user not implemented yet' };
  });

  // Create user (admin only)
  app.post('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    return { success: true, data: null, message: 'Create user not implemented yet' };
  });

  // Update user (admin only)
  app.patch('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return { success: true, data: null, message: 'Update user not implemented yet' };
  });

  // Delete user (admin only)
  app.delete('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return { success: true, message: 'Delete user not implemented yet' };
  });
}