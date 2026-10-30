/**
 * Telegram admin panel (in-bot) — management for fine, precise control.
 * Sensitive actions use a two-step confirm. Never trusts client role claims;
 * role is always re-read from the DB.
 */
import { Telegraf, Context } from 'telegraf';
import { logger } from '../core/logger/index.js';
import { fa } from './texts.js';
import { adminMenuKeyboard, adminBackKeyboard } from './keyboards.js';
import { db } from '../core/database/index.js';
import { users, telegramIdentities, products, productPrices, subscriptions } from '../core/database/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getDashboardStats } from '../modules/reporting/dashboard.js';
import { setReportTarget, sendReport, reportTargetStatus } from '../modules/reporting/report-sink.js';
import { adminPanelList, registerPanelActions, isPanelWizardActive, adminPanelWizardInput } from './admin-panels.js';

const log = logger.child({ module: 'telegram-admin' });
const ADMIN_ROLES = new Set(['system_owner', 'super_admin', 'operator']);

export async function getAdminUser(ctx: Context) {
  const tgId = ctx.from?.id;
  if (!tgId) return null;
  try {
    const identity = await db
      .select({ userId: telegramIdentities.userId })
      .from(telegramIdentities)
      .where(eq(telegramIdentities.telegramId, String(tgId)))
      .limit(1);
    if (!identity.length) return null;
    const row = await db
      .select({ id: users.id, role: users.role, status: users.status, firstName: users.firstName })
      .from(users)
      .where(eq(users.id, identity[0].userId))
      .limit(1);
    const u = row[0];
    if (!u || !ADMIN_ROLES.has(u.role) || u.status !== 'active') return null;
    return u;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'getAdminUser failed');
    return null;
  }
}

/** Edit in place; fall back to a fresh reply (e.g. when the panel was sent as a new message). */
async function show(ctx: Context, text: string, kb?: object) {
  try {
    if (kb) await ctx.editMessageText(text, kb as any);
    else await ctx.editMessageText(text);
  } catch {
    try {
      if (kb) await ctx.reply(text, kb as any);
      else await ctx.reply(text);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'admin show failed');
    }
  }
}

async function adminDashboard(ctx: Context) {
  await ctx.answerCbQuery().catch(() => {});
  const stats = await getDashboardStats();
  const f = (n: number) => n.toLocaleString('fa-IR');
  const text =
    '📊 **داشبورد**\n\n' +
    `👥 کاربران کل: ${f(stats.totalUsers)}\n` +
    `✅ اشتراک فعال: ${f(stats.activeSubscriptions)}\n` +
    `⏰ اشتراک منقضی: ${f(stats.expiredSubscriptions)}\n` +
    `💵 درآمد کل: ${f(stats.totalRevenueToman)} تومان\n` +
    `⏳ پرداخت در انتظار: ${f(stats.pendingPaymentsToman)} تومان\n` +
    `📦 سفارش امروز: ${f(stats.ordersToday)}\n` +
    `📦 سفارش هفته: ${f(stats.ordersThisWeek)}\n` +
    `📦 سفارش ماه: ${f(stats.ordersThisMonth)}\n` +
    `🎫 تیکت‌های باز: ${f(stats.openTickets)}`;
  await show(ctx, text, adminBackKeyboard());
}

async function adminSubs(ctx: Context) {
  await ctx.answerCbQuery().catch(() => {});
  const rows = await db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      status: subscriptions.status,
      expiresAt: subscriptions.expiresAt,
    })
    .from(subscriptions)
    .orderBy(desc(subscriptions.createdAt))
    .limit(10);
  if (!rows.length) {
    await show(ctx, '📋 اشتراک‌هایی یافت نشد.', adminBackKeyboard());
    return;
  }
  const lines = rows.map(
    (s, i) =>
      `${i + 1}. ${s.name ?? '(بدون نام)'} — ${s.status}` +
      (s.expiresAt ? ` — انقضا ${s.expiresAt.toLocaleDateString('fa-IR')}` : '')
  );
  await show(ctx, '📋 **آخرین اشتراک‌ها**\n\n' + lines.join('\n'), adminBackKeyboard());
}

async function adminUsers(ctx: Context) {
  await ctx.answerCbQuery().catch(() => {});
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, role: users.role, status: users.status })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(10);
  if (!rows.length) {
    await show(ctx, '👥 کاربری یافت نشد.', adminBackKeyboard());
    return;
  }
  const lines = rows.map(
    (u, i) => `${i + 1}. ${u.firstName ?? '(بی‌نام)'} — ${u.role} — ${u.status}`
  );
  await show(ctx, '👥 **آخرین کاربران**\n\n' + lines.join('\n'), adminBackKeyboard());
}

async function adminProducts(ctx: Context) {
  await ctx.answerCbQuery().catch(() => {});
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      isVisible: products.isVisible,
      isActive: products.isActive,
      price: productPrices.finalPrice,
    })
    .from(products)
    .innerJoin(productPrices, eq(products.id, productPrices.productId))
    .limit(10);
  if (!rows.length) {
    await show(ctx, '📦 محصولی یافت نشد.', adminBackKeyboard());
    return;
  }
  const lines = rows.map(
    (p, i) =>
      `${i + 1}. ${p.name} — ${p.price.toLocaleString('fa-IR')} تومان — ` +
      `${p.isActive ? 'فعال' : 'غیرفعال'}/${p.isVisible ? 'نمایش' : 'مخفی'}`
  );
  await show(ctx, '📦 **محصولات**\n\n' + lines.join('\n'), adminBackKeyboard());
}

async function adminReports(ctx: Context) {
  await ctx.answerCbQuery().catch(() => {});
  const status = await reportTargetStatus();
  await show(
    ctx,
    `📈 **گزارش‌ها به تاپیک**\n\n${status}\n\n` +
      'برای تنظیم مقصد، از این دستور استفاده کنید:\n`/setreports <chat_id> [thread_id]`\n' +
      'یا `/setreports off` برای غیرفعال‌سازی.',
    adminBackKeyboard()
  );
}

async function adminSystem(ctx: Context) {
  await ctx.answerCbQuery().catch(() => {});
  const text = '⚙️ وضعیت سیستم در گزارش‌های پنل نمایش داده می‌شود. برای جزئیات کامل از داشبورد وب استفاده کنید.';
  await show(ctx, text, adminBackKeyboard());
}

/** Register the whole in-bot admin panel on the given bot. */
export function registerAdmin(bot: Telegraf<Context>) {
  const guard = async (ctx: Context, next: (admin: NonNullable<Awaited<ReturnType<typeof getAdminUser>>>) => Promise<void>) => {
    await ctx.answerCbQuery().catch(() => {});
    const admin = await getAdminUser(ctx);
    if (!admin) {
      await show(ctx, fa.admin.notAdmin, adminBackKeyboard());
      return;
    }
    await next(admin);
  };

  // Entry point
  bot.command('admin', async (ctx) => {
    const admin = await getAdminUser(ctx);
    if (!admin) {
      await ctx.reply(fa.admin.notAdmin);
      return;
    }
    await ctx.reply(fa.admin.entry, adminMenuKeyboard());
  });

  bot.action('admin:menu', (ctx) => guard(ctx, () => show(ctx, fa.admin.entry, adminMenuKeyboard())));
  bot.action('admin:close', (ctx) => ctx.deleteMessage().catch(() => {}));
  bot.action('admin:dash', (ctx) => guard(ctx, () => adminDashboard(ctx)));
  bot.action('admin:subs', (ctx) => guard(ctx, () => adminSubs(ctx)));
  bot.action('admin:users', (ctx) => guard(ctx, () => adminUsers(ctx)));
  bot.action('admin:products', (ctx) => guard(ctx, () => adminProducts(ctx)));
  bot.action('admin:panels', (ctx) => guard(ctx, () => adminPanelList(ctx)));
  bot.action('admin:reports', (ctx) => guard(ctx, () => adminReports(ctx)));
  bot.action('admin:system', (ctx) => guard(ctx, () => adminSystem(ctx)));

  // Reports sink configuration: /setreports <chat_id> [thread_id]  |  /setreports off
  bot.command('setreports', async (ctx) => {
    const admin = await getAdminUser(ctx);
    if (!admin) {
      await ctx.reply(fa.admin.notAdmin);
      return;
    }
    const argv = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    if (!argv.length || argv[0] === 'off') {
      await setReportTarget({ chatId: 0, enabled: false });
      await ctx.reply('✅ گزارش‌ها غیرفعال شدند.');
      return;
    }
    const chatId = Number(argv[0]);
    if (!Number.isFinite(chatId)) {
      await ctx.reply('❗chat_id نامعتبر است. فرمت: /setreports <chat_id> [thread_id]');
      return;
    }
    const threadId = argv[1] ? Number(argv[1]) : undefined;
    await setReportTarget({ chatId, threadId: Number.isFinite(threadId) ? threadId : undefined, enabled: true });
    await ctx.reply(
      `✅ مقصد گزارش تنظیم شد:\nچت: ${chatId}${Number.isFinite(threadId) ? `\nتاپیک: ${threadId}` : ''}\n` +
        'چند لحظه دیگر یک پیام تست ارسال می‌شود.'
    );
    await sendReport(bot, '✅ گزارش‌ها به اینجا متصل شدند. از این پس رویدادهای مهم این‌جا ثبت می‌شوند.');
  });

  // Hook a convenience command: admin can see who they are / say hello
  bot.command('adminping', async (ctx) => {
    const admin = await getAdminUser(ctx);
    await ctx.reply(admin ? '✅ شما مدیر هستید.' : fa.admin.notAdmin);
  });

  // Panel management (list / add wizard / test / toggle / delete)
  registerPanelActions(bot);

  // Route free text into the add-panel wizard when it's active for this chat.
  bot.on('text', async (ctx) => {
    if (!isPanelWizardActive(ctx)) return;
    const admin = await getAdminUser(ctx);
    if (!admin) {
      await ctx.reply(fa.admin.notAdmin);
      return;
    }
    await adminPanelWizardInput(ctx, ctx.message.text);
  });
}
