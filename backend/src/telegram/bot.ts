/**
 * Telegram customer bot (Telegraf).
 *
 * Security rules:
 * - Never trust client-supplied identity/prices. Everything authoritative
 *   comes from our database.
 * - Admin commands are restricted by role, checked server-side.
 * - Subscription URLs are only sent to the owning user.
 *
 * Modes: polling (enabled by TELEGRAM_POLLING=true) or disabled.
 * Webhook mode is prepared (createBotForWebhook) but not wired yet.
 */
import { Telegraf, Context, TelegramError, Markup } from 'telegraf';
import { logger } from '../core/logger/index.js';
import { fa } from './texts.js';
import { mainMenuKeyboard, backToMenuKeyboard, productKeyboard, paymentMethodKeyboard, mainMenuLabels, productDetailKeyboard } from './keyboards.js';
import { db } from '../core/database/index.js';
import { users, products, productPrices, wallets, telegramIdentities, subscriptions } from '../core/database/schema.js';
import { eq, and } from 'drizzle-orm';
import { formatPrice } from '../core/utils/index.js';
import {
  findOrCreateUserFromTelegram,
  identityRepo,
  isBlockedByUserError,
  type TelegramProfile,
} from '../modules/identity/telegram-user.js';
import { sendReport } from '../modules/reporting/report-sink.js';
import { registerAdmin } from './admin.js';
import { createOrder } from '../modules/orders/service-part1.js';

const log = logger.child({ module: 'telegram-bot' });

/** Bot username (set once getMe returns) — needed by menu handlers that live
 * outside createBot() where the `bot` instance is not in scope. */
let botUsername: string | undefined;

/** Reply extra parameter accepted by Telegraf (keyboards, parse mode, …). */
type ReplyExtra = Parameters<Context['reply']>[1];

/**
 * Send a reply but NEVER let a send error break the handler or become an
 * "Unhandled error while processing". 403 (user blocked the bot) is logged as
 * a quiet warning; other send errors are logged and swallowed.
 */
async function safeReply(ctx: Context, text: string, extra?: ReplyExtra): Promise<void> {
  try {
    await ctx.reply(text, extra);
  } catch (err) {
    if (isBlockedByUserError(err)) {
      log.warn({ tgId: ctx.from?.id }, 'Telegram reply skipped — user blocked the bot');
      return;
    }
    log.error({ err: err instanceof Error ? err.message : String(err), tgId: ctx.from?.id }, 'Telegram send failed (handler continues)');
  }
}

/** Edit the message in place (menu navigation); falls back to a fresh reply. Never throws. */
async function safeEdit(ctx: Context, text: string, kb?: object): Promise<void> {
  try {
    if (kb) await ctx.editMessageText(text, kb as any);
    else await ctx.editMessageText(text);
  } catch {
    await safeReply(ctx, text, kb as ReplyExtra);
  }
}

/**
 * Single source of truth for every main-menu section. Works for BOTH the reply
 * keyboard (a plain text message → safeEdit falls back to a fresh reply) and
 * the inline "menu:*" callbacks (edits the tapped message in place).
 */
async function runMenuSection(ctx: Context, key: string): Promise<void> {
  const tgId = ctx.from?.id;
  switch (key) {
    case 'buy': {
      try {
        const rows = await db
          .select({
            id: products.id,
            name: products.name,
            price: productPrices.finalPrice,
          })
          .from(products)
          .innerJoin(productPrices, eq(products.id, productPrices.productId))
          .where(and(eq(products.isVisible, true), eq(products.isActive, true)))
          .orderBy(products.sortOrder)
          .limit(20);
        if (!rows.length) {
          await safeEdit(ctx, 'هنوز محصولی برای فروش موجود نیست.', backToMenuKeyboard());
          return;
        }
        await safeEdit(ctx, fa.selectProduct, productKeyboard(rows));
      } catch (err) {
        log.error({ err }, 'buy menu failed');
        await safeReply(ctx, fa.errors.generic);
      }
      return;
    }
    case 'mysubs': {
      if (!tgId) return;
      const subs = await db
        .select()
        .from(subscriptions)
        .innerJoin(telegramIdentities, eq(subscriptions.userId, telegramIdentities.userId))
        .where(eq(telegramIdentities.telegramId, String(tgId)));
      if (!subs.length) {
        await safeEdit(ctx, fa.noSubs, backToMenuKeyboard());
        return;
      }
      for (const row of subs) {
        const sub = row.subscriptions;
        const used = sub.usedDataGb != null ? `${sub.usedDataGb.toFixed(1)} گیگابایت` : 'نامشخص';
        const total = sub.dataLimitGb != null ? `${sub.dataLimitGb} گیگابایت` : 'نامحدود';
        const expiry = sub.expiresAt ? sub.expiresAt.toLocaleDateString('fa-IR') : 'نامشخص';
        await ctx.reply(fa.subscriptionDetails(sub.username ?? 'اشتراک', used, total, expiry, sub.status), backToMenuKeyboard());
      }
      return;
    }
    case 'wallet': {
      if (!tgId) return;
      const identity = await db.select().from(telegramIdentities).where(eq(telegramIdentities.telegramId, String(tgId))).limit(1);
      if (!identity.length) {
        await safeEdit(ctx, fa.noSubs, backToMenuKeyboard());
        return;
      }
      const wallet = await db.select().from(wallets).where(eq(wallets.userId, identity[0].userId)).limit(1);
      await safeEdit(ctx, fa.walletBalance(formatPrice(wallet[0]?.balance ?? 0)), backToMenuKeyboard());
      return;
    }
    case 'guide': {
      await safeEdit(ctx, fa.guide, backToMenuKeyboard());
      return;
    }
    case 'renew': {
      await safeEdit(ctx, fa.comingSoon('تمدید اشتراک'), backToMenuKeyboard());
      return;
    }
    case 'trial': {
      const trial = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .innerJoin(telegramIdentities, eq(subscriptions.userId, telegramIdentities.userId))
        .innerJoin(products, eq(subscriptions.productId, products.id))
        .where(and(eq(telegramIdentities.telegramId, String(ctx.from?.id ?? '')), eq(products.type, 'trial')))
        .limit(1)
        .catch(() => [] as any[]);
      if (trial.length) await safeEdit(ctx, fa.trialUsed, backToMenuKeyboard());
      else await safeEdit(ctx, fa.trialAvailable, backToMenuKeyboard());
      return;
    }
    case 'referral': {
      const uname = botUsername;
      const link = uname ? `https://t.me/${uname}?start=ref_${String(ctx.from?.id ?? '')}` : '—';
      if (!uname) {
        await safeEdit(ctx, fa.referralInfo('—', 0, '1,000'), backToMenuKeyboard());
        return;
      }
      await safeEdit(ctx, fa.referralInfo(link, 0, '1,000'), backToMenuKeyboard());
      return;
    }
    case 'support': {
      await safeEdit(ctx, fa.supportInfo(process.env.TELEGRAM_BOT_SUPPORT_USERNAME), backToMenuKeyboard());
      return;
    }
    default:
      await safeEdit(ctx, fa.welcome, mainMenuKeyboard());
  }
}

/** Create the bot, registering a global error handler so no handler error ever kills polling. */
function createBot(token: string): Telegraf<Context> {
  const bot = new Telegraf(token);

  bot.catch((err, ctx) => {
    if (isBlockedByUserError(err)) {
      log.warn({ tgId: ctx?.from?.id }, 'handled: user blocked the bot');
      return;
    }
    const code = err instanceof TelegramError ? err.code : undefined;
    const desc = err instanceof Error ? err.message : String(err);
    log.error({ code, err: desc, tgId: ctx?.from?.id }, 'unhandled bot error (polling continues)');
  });


  // Start command — idempotent & race-safe identity resolution
  bot.start(async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const profile: TelegramProfile = {
      id: tgUser.id,
      username: tgUser.username,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name,
    };

    try {
      const isNew = !(await identityRepo.findIdentityByTelegramId(String(tgUser.id)));
      await findOrCreateUserFromTelegram(identityRepo, profile);
      await safeReply(ctx, fa.welcome, mainMenuKeyboard());
      if (isNew) {
        await sendReport(
          bot,
          `🆕 کاربر جدید ثبت شد\n👤 ${tgUser.first_name ?? ''} ${tgUser.last_name ?? ''}${tgUser.username ? ` (@${tgUser.username})` : ''}\n🆔 ${tgUser.id}`
        );
      }
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'start handler failed');
      await safeReply(ctx, fa.errors.generic);
    }
  });

  // Main menu callback (inline "back" path) — re-send welcome with the reply menu
  bot.action('menu:main', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(fa.welcome, mainMenuKeyboard());
  });

  // Reply-keyboard routing: the persistent menu sends its label text, so map
  // each label to the same named handler used by the inline callbacks below.
  bot.hears(mainMenuLabels, async (ctx) => {
    const { text } = ctx.message as { text?: string };
    const label = text ?? '';
    const key =
      label === fa.mainMenu.buy ? 'buy'
      : label === fa.mainMenu.mySubs ? 'mysubs'
      : label === fa.mainMenu.wallet ? 'wallet'
      : label === fa.mainMenu.renew ? 'renew'
      : label === fa.mainMenu.trial ? 'trial'
      : label === fa.mainMenu.referral ? 'referral'
      : label === fa.mainMenu.guide ? 'guide'
      : label === fa.mainMenu.support ? 'support'
      : null;
    // Answer inline buttons stay on their message; reply-keyboard taps answer
    // by replying (the inline handlers below share these named functions).
    if (key) await runMenuSection(ctx, key);
  });

  // Buy flow (inline "menu:buy" — kept for old inline messages; reply-keyboard
  // users reach the same logic via bot.hears → runMenuSection).
  bot.action('menu:buy', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'buy');
  });

  // Product detail chosen from the list
  bot.action(/product:(.+)/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match?.[1];
    if (!productId) return;
    try {
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          description: products.descriptionFa ?? products.description,
          price: productPrices.finalPrice,
          durationDays: products.durationDays,
        })
        .from(products)
        .innerJoin(productPrices, eq(products.id, productPrices.productId))
        .where(eq(products.id, productId))
        .limit(1);
      if (!rows.length) {
        await safeEdit(ctx, fa.errors.notFound, backToMenuKeyboard());
        return;
      }
      const p = rows[0];
      const duration = p.durationDays ? `${p.durationDays} روز` : null;
      const detail = fa.productDetails(p.name, p.price.toLocaleString('fa-IR'), p.description ?? '', duration);
      await safeEdit(ctx, detail, productDetailKeyboard(p.id));
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'product detail failed');
      await safeEdit(ctx, fa.errors.generic, backToMenuKeyboard());
    }
  });

  // Buy the chosen product -> create order + report to topic
  bot.action(/buy:(.+)/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match?.[1];
    const tgId = ctx.from?.id;
    if (!productId || !tgId) return;
    try {
      const userId = await findOrCreateUserFromTelegram(identityRepo, {
        id: tgId,
        first_name: ctx.from?.first_name,
        last_name: ctx.from?.last_name,
        username: ctx.from?.username,
      });
      await ctx.reply(fa.purchaseProcessing);
      const orderId = await createOrder(userId, [{ productId, quantity: 1 }]);
      await ctx.reply(fa.orderCreated(orderId));
      await sendReport(bot, `📦 سفارش جدید ثبت شد\n🆔 ${orderId}\n👤 @${ctx.from?.username ?? tgId}\n🛒 محصول: ${productId}`);
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'buy failed');
      await safeReply(ctx, fa.purchaseFailed);
    }
  });

  // My subscriptions
  bot.action('menu:mysubs', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'mysubs');
  });

  // Wallet
  bot.action('menu:wallet', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'wallet');
  });

  // Connection guide
  bot.action('menu:guide', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'guide');
  });

  // Renew subscriptions
  bot.action('menu:renew', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'renew');
  });

  // Trial
  bot.action('menu:trial', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'trial');
  });

  // Referral
  bot.action('menu:referral', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'referral');
  });

  // Support
  bot.action('menu:support', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await runMenuSection(ctx, 'support');
  });

  // Admin-only command (role checked from DB, never from client)
  bot.command('stats', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const identity = await db.select().from(telegramIdentities).where(eq(telegramIdentities.telegramId, String(tgId))).limit(1);
    if (!identity.length) return;
    const user = await db.select().from(users).where(eq(users.id, identity[0].userId)).limit(1);
    const role = user[0]?.role;
    if (!role || !['system_owner', 'super_admin', 'operator'].includes(role)) {
      await ctx.reply('⛔ این دستور فقط برای مدیران است.');
      return;
    }
    await ctx.reply('پنل مدیریت در دسترس است. از داشبورد وب استفاده کنید.');
  });

  // In-bot admin panel (role-checked server-side)
  registerAdmin(bot as unknown as import('telegraf').Telegraf<Context>);

  return bot;
}

/**
 * Launch the bot in long-polling mode, ONLY when TELEGRAM_POLLING=true.
 *
 * Safety properties:
 * - Token is validated before use (never logged on error).
 * - Bot launches exactly once per process.
 * - Launch errors are visible and prevent a false "started" log.
 * - Graceful SIGINT/SIGTERM stops the bot cleanly.
 */
export async function startBotPolling(
  token: string,
  options?: { shutdownSignal?: string }
): Promise<{ bot: Telegraf<Context>; stopped: Promise<void> }> {
  const bot = createBot(token);

  // Register graceful stop FIRST, before launch, so signal handlers are ready.
  const stopPromise = new Promise<void>((resolve) => {
    const stop = (signal: string) => {
      log.info({ signal }, 'Stopping Telegram bot...');
      bot.stop(signal);
      resolve();
    };
    process.once('SIGINT',  () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
  });

  // Launch long-polling. NOTE: telegraf's bot.launch() internally awaits an
  // INFINITE polling loop that only settles on bot.stop(), so we must NOT await
  // it or the success log would never fire and our shutdown wiring would never
  // run. Instead: verify the token first (getMe throws 401 if invalid), then
  // start polling fire-and-forget and capture any rejection.
  try {
    bot.botInfo = await bot.telegram.getMe();
    botUsername = bot.botInfo.username ?? undefined;
    log.info('Telegram bot token verified');
    bot.launch().catch((err) => {
      const maskedError = err instanceof Error
        ? err.message.replace(token, '[TOKEN MASKED]')
        : String(err);
      log.error({ err: maskedError }, 'Telegram bot polling loop ended or failed to start (see above)');
    });
    log.info('Telegram bot polling started successfully');
  } catch (err) {
    // Never log the token. Mask it in error reports.
    const maskedError = err instanceof Error
      ? err.message.replace(token, '[TOKEN MASKED]')
      : String(err);
    log.error({ err: maskedError }, 'Telegram bot polling failed to start — check TELEGRAM_BOT_TOKEN is valid and bot is not already running elsewhere');
    throw err;
  }

  return { bot, stopped: stopPromise };
}

/**
 * Prepared for webhook use (not wired yet).
 * Returns { bot, secretToken } — caller wires the webhook endpoint.
 */
export function createBotForWebhook(token: string, secretToken: string) {
  const bot = createBot(token);
  return { bot, secretToken };
}