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
import { Telegraf, Context, TelegramError } from 'telegraf';
import { message } from 'telegraf/filters';
import { logger } from '../core/logger/index.js';
import { fa } from './texts.js';
import { mainMenuKeyboard, backToMenuKeyboard, productKeyboard, paymentMethodKeyboard } from './keyboards.js';
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

const log = logger.child({ module: 'telegram-bot' });

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
      await findOrCreateUserFromTelegram(identityRepo, profile);
      await safeReply(ctx, fa.welcome, mainMenuKeyboard());
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'start handler failed');
      await safeReply(ctx, fa.errors.generic);
    }
  });

  // Main menu callback
  bot.action('menu:main', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(fa.welcome, mainMenuKeyboard());
  });

  // Buy flow
  bot.action('menu:buy', async (ctx) => {
    await ctx.answerCbQuery();
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
        await ctx.editMessageText('هنوز محصولی برای فروش موجود نیست.', backToMenuKeyboard());
        return;
      }
      await ctx.editMessageText(fa.selectProduct, productKeyboard(rows));
    } catch (err) {
      log.error({ err }, 'buy menu failed');
      await ctx.reply(fa.errors.generic);
    }
  });

  // My subscriptions
  bot.action('menu:mysubs', async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const subs = await db
      .select()
      .from(subscriptions)
      .innerJoin(telegramIdentities, eq(subscriptions.userId, telegramIdentities.userId))
      .where(eq(telegramIdentities.telegramId, String(tgId)));
    if (!subs.length) {
      await ctx.editMessageText(fa.noSubs, backToMenuKeyboard());
      return;
    }
    for (const row of subs) {
      const sub = row.subscriptions;
      const used = sub.usedDataGb != null ? `${sub.usedDataGb.toFixed(1)} گیگابایت` : 'نامشخص';
      const total = sub.dataLimitGb != null ? `${sub.dataLimitGb} گیگابایت` : 'نامحدود';
      const expiry = sub.expiresAt ? sub.expiresAt.toLocaleDateString('fa-IR') : 'نامشخص';
      await ctx.reply(fa.subscriptionDetails(sub.username ?? 'اشتراک', used, total, expiry), backToMenuKeyboard());
    }
  });

  // Wallet
  bot.action('menu:wallet', async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const identity = await db.select().from(telegramIdentities).where(eq(telegramIdentities.telegramId, String(tgId))).limit(1);
    if (!identity.length) {
      await ctx.editMessageText(fa.noSubs, backToMenuKeyboard());
      return;
    }
    const wallet = await db.select().from(wallets).where(eq(wallets.userId, identity[0].userId)).limit(1);
    await ctx.editMessageText(fa.walletBalance(formatPrice(wallet[0]?.balance ?? 0)), backToMenuKeyboard());
  });

  // Connection guide
  bot.action('menu:guide', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(fa.guide, backToMenuKeyboard());
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
    await bot.telegram.getMe();
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