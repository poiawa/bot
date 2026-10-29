import { FastifyInstance } from 'fastify';

export default async function panelRoutes(app: FastifyInstance) {
  // List all panels
  app.get('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: [],
      message: 'List panels not implemented yet',
    };
  });

  // Add new panel
  app.post('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { name, type, apiUrl, username, password } = request.body as {
      name: string;
      type: string;
      apiUrl: string;
      username?: string;
      password?: string;
    };

    return {
      success: true,
      data: null,
      message: 'Add panel not implemented yet',
    };
  });

  // Test panel connection
  app.post('/:id/test', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: {
        connected: false,
        version: null,
        latency: null,
        error: 'Test not implemented yet',
      },
    };
  });

  // Get panel info
  app.get('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Get panel ${id} not implemented yet`,
    };
  });

  // Update panel
  app.patch('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Update panel ${id} not implemented yet`,
    };
  });

  // Delete panel
  app.delete('/:id', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      message: `Delete panel ${id} not implemented yet`,
    };
  });

  // Sync panel data
  app.post('/:id/sync', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Sync panel ${id} not implemented yet`,
    };
  });

  // Get panel capabilities
  app.get('/:id/capabilities', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: {
        canCreateSubscription: true,
        canRenewSubscription: true,
        canChangeDataLimit: true,
        canChangeExpiry: true,
        canResetUsage: true,
        canChangeUsername: true,
        canDisableSubscription: true,
        canDeleteSubscription: true,
        canGetSubscriptionUrls: true,
        canChangeSubscriptionUrls: false,
        canTransferSubscription: false,
        canGetUsage: true,
        supportedProtocols: ['vmess', 'vless', 'trojan', 'shadowsocks'],
        supportedTransports: ['tcp', 'ws', 'grpc', 'h2'],
      },
    };
  });
}