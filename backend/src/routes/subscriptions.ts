import { FastifyInstance } from 'fastify';

export default async function subscriptionRoutes(app: FastifyInstance) {
  // Get user's subscriptions
  app.get('/me', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return {
      success: true,
      data: [],
      message: 'Get user subscriptions not implemented yet',
    };
  });

  // Get subscription details
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Get subscription ${id} not implemented yet`,
    };
  });

  // Get subscription QR code
  app.get('/:id/qrcode', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: { qrCodeUrl: `/api/subscriptions/${id}/qrcode` },
      message: `Get subscription ${id} QR code not implemented yet`,
    };
  });

  // Renew subscription
  app.post('/:id/renew', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { durationDays } = request.body as { durationDays?: number };

    return {
      success: true,
      data: null,
      message: `Renew subscription ${id} not implemented yet`,
    };
  });

  // Add data to subscription
  app.post('/:id/add-data', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { dataGb } = request.body as { dataGb: number };

    return {
      success: true,
      data: null,
      message: `Add data to subscription ${id} not implemented yet`,
    };
  });

  // Change subscription username
  app.patch('/:id/username', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { username } = request.body as { username: string };

    return {
      success: true,
      data: null,
      message: `Change subscription ${id} username not implemented yet`,
    };
  });

  // Enable subscription
  app.post('/:id/enable', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      message: `Enable subscription ${id} not implemented yet`,
    };
  });

  // Disable subscription
  app.post('/:id/disable', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      message: `Disable subscription ${id} not implemented yet`,
    };
  });

  // Delete subscription
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      message: `Delete subscription ${id} not implemented yet`,
    };
  });

  // Reserve renewal subscription
  app.post('/me/reserve', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { currentSubscriptionId, newProductId, newServerId } = request.body as {
      currentSubscriptionId: string;
      newProductId: string;
      newServerId?: string;
    };

    return {
      success: true,
      data: null,
      message: 'Reserve subscription not implemented yet',
    };
  });

  // Admin: list all subscriptions
  app.get('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: [],
      message: 'List subscriptions not implemented yet',
    };
  });

  // Admin: create subscription manually
  app.post('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: null,
      message: 'Create subscription not implemented yet',
    };
  });
}