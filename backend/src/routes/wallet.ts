import { FastifyInstance } from 'fastify';

export default async function walletRoutes(app: FastifyInstance) {
  // Get wallet balance
  app.get('/balance', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return {
      success: true,
      data: {
        balance: 0,
        currency: 'IRT',
        creditLimit: 0,
      },
    };
  });

  // Get transaction history
  app.get('/transactions', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { page, limit, type } = request.query as {
      page?: number;
      limit?: number;
      type?: string;
    };

    return {
      success: true,
      data: {
        items: [],
        total: 0,
        page: page || 1,
        limit: limit || 20,
        totalPages: 0,
      },
      message: 'Get transactions not implemented yet',
    };
  });

  // Deposit funds
  app.post('/deposit', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { amount, paymentMethod } = request.body as {
      amount: number;
      paymentMethod: string;
    };

    return {
      success: true,
      data: {
        depositId: `DEP-${Date.now()}`,
        amount,
        paymentUrl: 'https://payment.example.com/deposit/xxx',
      },
      message: 'Deposit not implemented yet',
    };
  });

  // Transfer to another user
  app.post('/transfer', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { toUserId, amount, description } = request.body as {
      toUserId: string;
      amount: number;
      description?: string;
    };

    return {
      success: true,
      data: null,
      message: 'Transfer not implemented yet',
    };
  });

  // Gift code redemption
  app.post('/redeem', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { code } = request.body as { code: string };

    return {
      success: true,
      data: {
        amount: 0,
        message: 'Gift code redeemed successfully',
      },
    };
  });

  // Admin: get any user's wallet
  app.get('/user/:userId', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    return {
      success: true,
      data: null,
      message: `Get user ${userId} wallet not implemented yet`,
    };
  });

  // Admin: adjust balance
  app.post('/adjust', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { userId, amount, reason } = request.body as {
      userId: string;
      amount: number;
      reason: string;
    };

    return {
      success: true,
      data: null,
      message: 'Adjust balance not implemented yet',
    };
  });

  // Admin: ledger report
  app.get('/ledger', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { fromDate, toDate, userId, type } = request.query as {
      fromDate?: string;
      toDate?: string;
      userId?: string;
      type?: string;
    };

    return {
      success: true,
      data: {
        entries: [],
        summary: {
          totalCredits: 0,
          totalDebits: 0,
          netBalance: 0,
        },
      },
      message: 'Get ledger not implemented yet',
    };
  });
}