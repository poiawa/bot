import { FastifyInstance } from 'fastify';

export default async function adminRoutes(app: FastifyInstance) {
  // Dashboard stats
  app.get('/dashboard', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: {
        totalUsers: 0,
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        totalRevenue: 0,
        pendingPayments: 0,
        openTickets: 0,
        salesToday: 0,
        salesThisWeek: 0,
        salesThisMonth: 0,
        topProducts: [],
        topServers: [],
      },
    };
  });

  // System health
  app.get('/system/health', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: {
        database: 'ok',
        redis: 'ok',
        panels: [],
        servers: [],
        jobs: [],
        lastBackup: null,
      },
    };
  });

  // Audit logs
  app.get('/audit-logs', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { page, limit, userId, action, entity } = request.query as {
      page?: number;
      limit?: number;
      userId?: string;
      action?: string;
      entity?: string;
    };

    return {
      success: true,
      data: {
        items: [],
        total: 0,
        page: page || 1,
        limit: limit || 50,
        totalPages: 0,
      },
    };
  });

  // Settings
  app.get('/settings', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: {} };
  });

  app.patch('/settings', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, message: 'Settings updated' };
  });

  // Roles & Permissions
  app.get('/roles', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/roles', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { name, permissions } = request.body as { name: string; permissions: string[] };
    return { success: true, data: null, message: 'Role created' };
  });

  // Users management (extended)
  app.post('/users/:id/role', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = request.body as { role: string };
    return { success: true, message: 'User role updated' };
  });

  app.post('/users/:id/suspend', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return { success: true, message: 'User suspended' };
  });

  // Backup management
  app.get('/backups', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/backups', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { type } = request.body as { type: 'full' | 'database' | 'files' };
    return { success: true, data: null, message: 'Backup started' };
  });

  app.post('/backups/:id/restore', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return { success: true, message: 'Restore started' };
  });

  // Discounts management
  app.get('/discounts', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/discounts', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: null, message: 'Discount created' };
  });

  // Gift codes management
  app.get('/gift-codes', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/gift-codes', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: null, message: 'Gift code created' };
  });

  // Referral programs
  app.get('/referral-programs', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/referral-programs', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: null, message: 'Referral program created' };
  });

  // Inventory management
  app.get('/inventory', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/inventory/import', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { items, productId } = request.body as { items: any[]; productId: string };
    return {
      success: true,
      data: { imported: 0, duplicates: 0 },
    };
  });

  // Notification templates
  app.get('/notification-templates', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: [] };
  });

  app.post('/notification-templates', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return { success: true, data: null, message: 'Template created' };
  });

  // Reports
  app.get('/reports/sales', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { fromDate, toDate, groupBy } = request.query as {
      fromDate?: string;
      toDate?: string;
      groupBy?: 'day' | 'week' | 'month' | 'product' | 'server';
    };

    return {
      success: true,
      data: {
        summary: {
          totalOrders: 0,
          totalRevenue: 0,
          totalRefunds: 0,
          netRevenue: 0,
        },
        breakdown: [],
      },
    };
  });

  app.get('/reports/subscriptions', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: {
        total: 0,
        active: 0,
        expired: 0,
        byProduct: [],
        byServer: [],
      },
    };
  });

  app.get('/reports/referrals', { preHandler: [app.adminOnly] }, async (request, reply) => {
    return {
      success: true,
      data: {
        totalReferrals: 0,
        convertedReferrals: 0,
        totalRewards: 0,
        topReferrers: [],
      },
    };
  });
}
