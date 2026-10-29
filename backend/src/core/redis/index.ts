import Redis from 'ioredis';
import { logger } from '../logger/index.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

export { redis };

export async function testRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error({ error }, 'Redis connection test failed');
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
