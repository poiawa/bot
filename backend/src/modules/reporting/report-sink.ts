/**
 * Report sink + bot configuration (persisted in `system_settings`).
 *
 * Drives the admin "reports to topic" feature:
 * - `bot_reports_target`  → { chatId, threadId?, enabled } where the bot posts
 *   operational reports (new user, new order, errors).
 * - `bot_admin_chat`      → the chat id of approved bot admins (safety net so a
 *   single /admin entry cannot be exploited). Optional.
 */
import { db } from '../../core/database/index.js';
import { systemSettings } from '../../core/database/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../core/logger/index.js';
import type { Telegraf } from 'telegraf';

const log = logger.child({ module: 'report-sink' });

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return rows.length ? (rows[0].value as T) : null;
}

export async function setSetting(key: string, value: unknown, description?: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, description })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, description, updatedAt: new Date() },
    });
}

export interface ReportTarget {
  chatId: number | string;
  threadId?: number;
  enabled: boolean;
}

export async function getReportTarget(): Promise<ReportTarget | null> {
  return getSetting<ReportTarget>('bot_reports_target');
}

export async function setReportTarget(target: ReportTarget): Promise<void> {
  await setSetting('bot_reports_target', target, 'Telegram bot reports sink (chat + optional forum topic)');
}

/**
 * Post an operational message to the configured report target.
 * Silently no-ops when reports are disabled or not configured — administrative
 * reports are best-effort and must NEVER break business logic.
 */
export async function sendReport(bot: Telegraf, text: string): Promise<void> {
  const target = await getReportTarget().catch(() => null);
  if (!target?.enabled) return;
  const extra: Record<string, unknown> = {};
  if (target.threadId) extra.message_thread_id = target.threadId;
  await bot.telegram.sendMessage(target.chatId, text, extra).catch((err: unknown) => {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'report send failed');
  });
}

/** Human readable status of the reports sink, for the admin UI. */
export async function reportTargetStatus(): Promise<string> {
  const t = await getReportTarget().catch(() => null);
  if (!t) return 'گزارش‌ها فعال نیستند و مقصدی تنظیم نشده است.';
  if (!t.enabled) return 'گزارش‌ها غیرفعال‌اند (مقصد ذخیره شده: چت ' + t.chatId + (t.threadId ? ` / پست ${t.threadId}` : '') + ').';
  return 'فعال — چت: ' + t.chatId + (t.threadId ? ` / تاپیک: ${t.threadId}` : ' / کل چت') + '';
}
