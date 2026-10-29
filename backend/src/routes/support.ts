import { FastifyInstance } from 'fastify';

export default async function supportRoutes(app: FastifyInstance) {
  // Create ticket
  app.post('/', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const { subject, department, priority, message } = request.body as {
      subject: string;
      department?: string;
      priority?: string;
      message: string;
    };

    return {
      success: true,
      data: {
        ticketNumber: `TKT-${Date.now()}`,
        message: 'Ticket created successfully',
      },
    };
  });

  // Get user's tickets
  app.get('/me', { preHandler: [app.authenticate] }, async (request: any, reply) => {
    return { success: true, data: [] };
  });

  // Get ticket details
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: null,
      message: `Get ticket ${id} not implemented yet`,
    };
  });

  // Reply to ticket
  app.post('/:id/reply', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { message, attachments } = request.body as {
      message: string;
      attachments?: string[];
    };

    return { success: true, message: 'Reply added' };
  });

  // Close ticket
  app.post('/:id/close', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { rating } = request.body as { rating?: number };
    return { success: true, message: 'Ticket closed' };
  });

  // Reopen ticket
  app.post('/:id/reopen', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return { success: true, message: 'Ticket reopened' };
  });

  // Admin: List all tickets
  app.get('/', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { status, priority, assignedTo } = request.query as {
      status?: string;
      priority?: string;
      assignedTo?: string;
    };
    return { success: true, data: [] };
  });

  // Admin: Assign ticket
  app.post('/:id/assign', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { assignedTo } = request.body as { assignedTo: string };
    return { success: true, message: 'Ticket assigned' };
  });

  // Admin: Set internal note
  app.post('/:id/internal-note', { preHandler: [app.adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { message } = request.body as { message: string };
    return { success: true, message: 'Internal note added' };
  });
}
