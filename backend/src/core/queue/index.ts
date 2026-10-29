import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis/index.js';
import { logger } from '../logger/index.js';

// Queue names
export const QUEUE_NAMES = {
  SUBSCRIPTION_EXPIRY: 'subscription-expiry',
  PAYMENT_PROCESSING: 'payment-processing',
  PANEL_SYNC: 'panel-sync',
  NOTIFICATIONS: 'notifications',
  BACKUP: 'backup',
  REPORTING: 'reporting',
  RESERVATION_ACTIVATION: 'reservation-activation',
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

interface QueueJob {
  name: string;
  data: Record<string, unknown>;
  options?: {
    delay?: number;
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay?: number;
    };
  };
}

function createQueue(name: QueueName): Queue {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 86400,
        count: 5000,
      },
    },
  });
}

export const queues = {
  subscriptionExpiry: createQueue(QUEUE_NAMES.SUBSCRIPTION_EXPIRY),
  paymentProcessing: createQueue(QUEUE_NAMES.PAYMENT_PROCESSING),
  panelSync: createQueue(QUEUE_NAMES.PANEL_SYNC),
  notifications: createQueue(QUEUE_NAMES.NOTIFICATIONS),
  backup: createQueue(QUEUE_NAMES.BACKUP),
  reporting: createQueue(QUEUE_NAMES.REPORTING),
  reservationActivation: createQueue(QUEUE_NAMES.RESERVATION_ACTIVATION),
};

export async function addJob<T extends Record<string, unknown>>(
  queueName: QueueName,
  job: QueueJob
): Promise<Job> {
  const queue = queues[queueName as keyof typeof queues] as Queue;
  return queue.add(job.name, job.data, job.options);
}

export async function addRepeatableJob(
  queueName: QueueName,
  job: QueueJob,
  repeatOptions: {
    every?: number;
    cron?: string;
  }
): Promise<Job> {
  const queue = queues[queueName as keyof typeof queues] as Queue;
  return queue.add(job.name, job.data, {
    ...job.options,
    repeat: repeatOptions,
  });
}

export function createWorker(
  queueName: QueueName,
  processor: (job: Job) => Promise<void>
): Worker {
  return new Worker(queueName, processor, {
    connection: redis,
    concurrency: 5,
  });
}

export async function closeQueues(): Promise<void> {
  const queueList = Object.values(queues);
  await Promise.all(queueList.map((q) => q.close()));
}

export { Queue, Job };
