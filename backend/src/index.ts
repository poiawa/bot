import Fastify from 'fastify';
import crypto from 'crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { logger } from './core/logger/index.js';
import { testConnection, closePool } from './core/database/index.js';
import { testRedisConnection, closeRedis } from './core/redis/index.js';
import { closeQueues } from './core/queue/index.js';
import { startBotPolling } from './telegram/bot.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import subscriptionRoutes from './routes/subscriptions.js';
import walletRoutes from './routes/wallet.js';
import panelRoutes from './routes/panels.js';
import serverRoutes from './routes/servers.js';
import resellerRoutes from './routes/resellers.js';
import supportRoutes from './routes/support.js';
import adminRoutes from './routes/admin.js';

const app = Fastify({
  logger: logger,
  genReqId: () => crypto.randomUUID(),
});

async function buildApp() {
  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'VPN Bot API',
        description: 'VPN Subscription Sales Platform API',
        version: '1.0.0',
      },
      servers: [
        { url: process.env.APP_URL || 'http://localhost:3000', description: 'Development' },
      ],
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Users', description: 'User management' },
        { name: 'Products', description: 'Product catalog' },
        { name: 'Orders', description: 'Order management' },
        { name: 'Payments', description: 'Payment processing' },
        { name: 'Subscriptions', description: 'VPN subscriptions' },
        { name: 'Wallet', description: 'Wallet and transactions' },
        { name: 'Panels', description: 'VPN panel integration' },
        { name: 'Servers', description: 'Server management' },
        { name: 'Resellers', description: 'Reseller management' },
        { name: 'Support', description: 'Support tickets' },
        { name: 'Admin', description: 'Administration' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: process.env.APP_URL || 'http://localhost:3000',
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
  });

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
  });

  // Decorate with authenticate method
  (app as any).decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  // Decorate with adminOnly method
  (app as any).decorate('adminOnly', async (request: any, reply: any) => {
    await app.authenticate(request, reply);
    const userRole = request.user?.role;
    const adminRoles = ['system_owner', 'super_admin', 'finance_admin', 'support_admin', 'server_admin'];
    if (!adminRoles.includes(userRole)) {
      reply.status(403).send({ success: false, error: 'Forbidden' });
    }
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(productRoutes, { prefix: '/api/products' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
  await app.register(walletRoutes, { prefix: '/api/wallet' });
  await app.register(panelRoutes, { prefix: '/api/panels' });
  await app.register(serverRoutes, { prefix: '/api/servers' });
  await app.register(resellerRoutes, { prefix: '/api/resellers' });
  await app.register(supportRoutes, { prefix: '/api/support' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error({
      err: error,
      requestId: request.id,
      url: request.url,
      method: request.method,
    });

    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Error',
        details: error.validation,
      });
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
    });
  });

  return app;
}

async function start() {
  try {
    // Test connections
    logger.info('Testing database connection...');
    const dbOk = await testConnection();
    if (!dbOk) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection OK');

    logger.info('Testing Redis connection...');
    const redisOk = await testRedisConnection();
    if (!redisOk) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connection OK');

    // Build and start app
    const app = await buildApp();

    const port = parseInt(process.env.APP_PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    logger.info(`Server listening on http://${host}:${port}`);
    logger.info(`API Documentation available at http://${host}:${port}/docs`);

    // --- Telegram bot: start only when TELEGRAM_POLLING=true and token is valid ---
    let tgBot: import('telegraf').Telegraf | null = null;
    let tgStopped: Promise<void> | null = null;
    const pollingEnabled = process.env.TELEGRAM_POLLING === 'true';
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (pollingEnabled) {
      if (!botToken || !botToken.trim() || botToken.startsWith('your-') || botToken.startsWith('your_')) {
        logger.warn('TELEGRAM_POLLING=true but TELEGRAM_BOT_TOKEN is missing or placeholder — bot NOT started. Set a valid token in .env to enable the Telegram bot.');
      } else {
        try {
          const result = await startBotPolling(botToken);
          tgBot = result.bot;
          tgStopped = result.stopped;
        } catch (err) {
          // Error already logged inside startBotPolling with masked token
          logger.warn('Telegram bot NOT started due to launch error (see above).');
        }
      }
    } else {
      logger.info('TELEGRAM_POLLING=false — Telegram bot is disabled (set true in .env to enable polling mode).');
    }

    // Graceful shutdown — one place, handles bot + app + infra
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      if (tgBot) {
        tgBot.stop(signal);
        if (tgStopped) await tgStopped;
      }
      await app.close();
      await closeQueues();
      await closeRedis();
      await closePool();
      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { buildApp };
