/**
 * Audit service: every sensitive operation is recorded here.
 * Never fails the calling operation — audit failures are logged, not thrown.
 */
import { db } from '../../core/database/index.js';
import { auditLogs } from '../../core/database/schema.js';
import { logger } from '../../core/logger/index.js';

const log = logger.child({ module: 'audit' });

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Redact obviously sensitive keys before persisting */
function redact(data: unknown): unknown {
  if (data == null || typeof data !== 'object') return data;
  const clone: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/pass|secret|token|key|password/i.test(key)) {
      clone[key] = '[REDACTED]';
    }
  }
  return clone;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      oldData: redact(entry.oldData) as never,
      newData: redact(entry.newData) as never,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    log.error({ err, action: entry.action }, 'audit write failed (operation continues)');
  }
}
