/**
 * Background worker: subscription expiry checks, expiration reminders,
 * and reservation activation. Runs independently of the API process.
 */
import { db, pool } from './core/database/index.js';
import { subscriptions } from './core/database/schema.js';
import { createWorker, addRepeatableJob, QUEUE_NAMES } from './core/queue/index.js';
import { eq, lt, and } from 'drizzle-orm';
import { logger } from './core/logger/index.js';

const log = logger.child({ module: 'worker' });

const DAY_MS = 86400_000;

async function checkSubscriptionExpiry(): Promise<void> {
  const now = new Date();
  // Mark expired subscriptions
  const expired = await db
    .update(subscriptions)
    .set({ status: 'expired' })
    .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.expiresAt, now)))
    .returning({ id: subscriptions.id, userId: subscriptions.userId });
  if (expired.length) {
    log.info({ count: expired.length }, 'subscriptions marked expired');
  }
}

async function sendExpirationReminders(): Promise<void> {
  // Remind users whose subscriptions expire within 3 days
  const soon = new Date(Date.now() + 3 * DAY_MS);
  const rows = await db
    .select({
      subId: subscriptions.id,
      userId: subscriptions.userId,
      expiresAt: subscriptions.expiresAt,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.expiresAt, soon)))
    .limit(500);
  log.info({ count: rows.length }, 'expiration reminders due');
  // Delivery of reminders via notification queue is handled in Phase 9.
}

export function startWorker() {
  const expiryWorker = createWorker(QUEUE_NAMES.SUBSCRIPTION_EXPIRY, async (job) => {
    switch (job.name) {
      case 'expiry-check':
        await checkSubscriptionExpiry();
        break;
      case 'expiry-reminder':
        await sendExpirationReminders();
        break;
      default:
        log.warn({ name: job.name }, 'unknown job in subscription queue');
    }
  });

  // Schedule recurring jobs
  (async () => {
    await addRepeatableJob(QUEUE_NAMES.SUBSCRIPTION_EXPIRY, { name: 'expiry-check', data: {} }, { every: 5 * 60_000 });
    await addRepeatableJob(QUEUE_NAMES.SUBSCRIPTION_EXPIRY, { name: 'expiry-reminder', data: {} }, { every: 60 * 60_000 });
    log.info('repeatable jobs scheduled');
  })().catch((err) => log.error({ err }, 'failed to schedule jobs'));

  log.info('worker started');
  return expiryWorker;
}

async function shutdown() {
  log.info('worker shutting down...');
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startWorker();
