import { FastifyInstance } from 'fastify';
import { testConnection } from '../core/database/index.js';
import { testRedisConnection } from '../core/redis/index.js';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/ready', async (request, reply) => {
    const dbOk = await testConnection();
    const redisOk = await testRedisConnection();

    if (!dbOk || !redisOk) {
      return reply.status(503).send({
        status: 'not ready',
        database: dbOk ? 'ok' : 'failed',
        redis: redisOk ? 'ok' : 'failed',
      });
    }

    return {
      status: 'ready',
      database: 'ok',
      redis: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
}
