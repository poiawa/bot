import { FastifyInstance } from 'fastify';

export default async function paymentRoutes(app: FastifyInstance) {
  // Initiate payment
  app.post('/initiate', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { orderId, method } = request.body as { orderId: string; method: string };

    return {
      success: true,
      data: {
        paymentUrl: 'https://payment.example.com/checkout/xxx',
        paymentNumber: `PAY-${Date.now()}`,
      },
      message: 'Payment initiation not implemented yet',
    };
  });

  // Card-to-card payment: submit receipt
  app.post('/card-to-card/submit', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { paymentNumber, receiptImage } = request.body as {
      paymentNumber: string;
      receiptImage: string;
    };

    return {
      success: true,
      message: 'Receipt submitted for review',
    };
  });

  // Payment callback (Zarinpal, etc.)
  app.get('/callback/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    return {
      success: true,
      message: `Payment callback for ${provider} not implemented yet`,
    };
  });

  // Payment webhook (for async payment providers)
  app.post('/webhook/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    // Verify webhook signature
    return {
      success: true,
      message: `Webhook for ${provider} not implemented yet`,
    };
  });

  // Get payment status
  app.get('/:id/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: { status: 'pending' },
      message: `Get payment ${id} status not implemented yet`,
    };
  });

  // List user payments
  app.get('/me', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return {
      success: true,
      data: [],
      message: 'Get user payments not implemented yet',
    };
  });

  // Admin: verify card-to-card payment
  app.post('/:id/verify', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { approved } = request.body as { approved: boolean };
    const { reason } = request.body as { reason?: string };

    return {
      success: true,
      message: `Payment ${id} verification not implemented yet`,
    };
  });

  // Admin: list pending card-to-card payments
  app.get('/pending/card-to-card', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: [],
      message: 'List pending card-to-card payments not implemented yet',
    };
  });
}