/**
 * In-bot panel management (admin) — list, add, test, toggle, delete panel
 * connections. Mirrors the "add panel" management of Faoxima-style bots.
 *
 * Credentials are encrypted at rest via encryptForStorage and only decrypted
 * in memory by the adapter. The add flow is a small conversational wizard
 * (type → name → apiUrl → username → password) tracked per chat id.
 */
import { Telegraf, Context } from 'telegraf';
import { logger } from '../core/logger/index.js';
import { db } from '../core/database/index.js';
import { panelConnections } from '../core/database/schema.js';
import { eq, desc } from 'drizzle-orm';
import { encryptForStorage } from '../core/crypto/index.js';
import { createAdapter, StoredPanelConnection } from '../modules/panel-adapters/index.js';
import { panelListKeyboard, panelActionsKeyboard } from './keyboards.js';

const log = logger.child({ module: 'telegram-admin-panels' });

/** In-memory add-panel wizard state (per chat id). Lost on restart — fine. */
interface PanelWizard {
  step: 'type' | 'name' | 'apiUrl' | 'username' | 'password';
  type: string;
  name?: string;
  apiUrl?: string;
  username?: string;
}
const wizards = new Map<string, PanelWizard>();

const SUPPORTED_TYPES: Array<{ id: string; label: string }> = [
  { id: 'marzban', label: 'مرزبان (Marzban)' },
  { id: 'pasarguard', label: 'پاسارگارد (PasarGuard)' },
  { id: '3x_ui', label: '3x-ui' },
  { id: 'remnawave', label: 'Remnawave' },
];

function listText(panels: Array<{ id: string; name: string; type: string; isEnabled: boolean }>): string {
  const f = (b: boolean) => (b ? 'فعال' : 'غیرفعال');
  if (!panels.length) return '🔌 هنوز پنلی اضافه نشده است.\nبرای اتصال، دکمه «➕ افزودن پنل» را بزنید.';
  return (
    '🔌 **پنل‌های متصل**\n\n' +
    panels
      .map((p, i) => `${i + 1}. ${p.isEnabled ? '🟢' : '🔴'} ${p.name} — ${p.type} (${f(p.isEnabled)})`)
      .join('\n') +
    '\n\nروی هر پنل بزنید تا جزئیات و اکشن‌ها را ببینید.'
  );
}

/** Show the panel list (with inline keyboard). */
export async function adminPanelList(ctx: Context): Promise<void> {
  await ctx.answerCbQuery().catch(() => {});
  const rows = await db
    .select({ id: panelConnections.id, name: panelConnections.name, type: panelConnections.type, isEnabled: panelConnections.isEnabled })
    .from(panelConnections)
    .orderBy(desc(panelConnections.createdAt))
    .limit(30);
  const kb = panelListKeyboard(rows.map((r) => ({ id: r.id, name: r.name, isEnabled: r.isEnabled })));
  await showPanel(ctx, listText(rows), kb);
}

async function showPanel(ctx: Context, text: string, kb: object) {
  try {
    await ctx.editMessageText(text, kb as any);
  } catch {
    try {
      await ctx.reply(text, kb as any);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'panel show failed');
    }
  }
}

/** View a single panel with its action keyboard. */
export async function adminPanelView(ctx: Context, panelId: string): Promise<void> {
  await ctx.answerCbQuery().catch(() => {});
  const rows = await db.select().from(panelConnections).where(eq(panelConnections.id, panelId)).limit(1);
  if (!rows.length) {
    await showPanel(ctx, 'پنل پیدا نشد.', panelListKeyboard([]));
    return;
  }
  const p = rows[0];
  const text =
    `🔌 **${p.name}**\n\n` +
    `نوع: ${p.type}\n` +
    `آدرس: ${p.apiUrl}\n` +
    `وضعیت: ${p.isEnabled ? '🟢 فعال' : '🔴 غیرفعال'}\n` +
    (p.lastTestAt ? `آخرین تست: ${p.lastTestAt.toLocaleString('fa-IR')}\n` : '') +
    (p.lastTestResult
      ? `نتیجه تست: ${(p.lastTestResult as { ok?: boolean }).ok ? '✅ متصل' : '❌ خطا'}`
      : 'نتیجه تست: هنوز تست نشده');
  await showPanel(ctx, text, panelActionsKeyboard(panelId));
}

/** Begin the add-panel wizard. */
export async function adminPanelAddStart(ctx: Context): Promise<void> {
  await ctx.answerCbQuery().catch(() => {});
  const chatId = String(ctx.from?.id ?? '');
  wizards.set(chatId, { step: 'type', type: 'marzban' });
  const kb = {
    reply_markup: {
      inline_keyboard: [
        ...SUPPORTED_TYPES.map((t) => [{ text: t.label, callback_data: `adminpanel:type:${t.id}` }]),
        [{ text: '🔙 انصراف', callback_data: 'admin:panels' }],
      ],
    },
  };
  await showPanel(ctx, '➕ افزودن پنل\n\nابتدا نوع پنل را انتخاب کنید:', kb as any);
}

/** Advance the wizard. Validated values are stored in wizards then the next
 *  prompt is shown. Returning the keyboard keeps the flow in the chat. */
export async function adminPanelWizardInput(ctx: Context, text: string): Promise<void> {
  const chatId = String(ctx.from?.id ?? '');
  const w = wizards.get(chatId);
  if (!w) return;
  const value = text.trim();
  switch (w.step) {
    case 'type':
      return; // type is only set via inline button, never free text
    case 'name':
      if (!value) {
        await ctx.reply('❗نام نمی‌تواند خالی باشد. دوباره بنویسید.');
        return;
      }
      w.name = value;
      w.step = 'apiUrl';
      await ctx.reply('🌐 آدرس پنل را وارد کنید (مثل https://panel.example.com) — بدون اسلش انتهایی:');
      return;
    case 'apiUrl':
      if (!/^https?:\/\//i.test(value)) {
        await ctx.reply('❗آدرس باید با http:// یا https:// شروع شود. دوباره بنویسید.');
        return;
      }
      w.apiUrl = value.replace(/\/+$/, '');
      w.step = 'username';
      await ctx.reply('👤 نام کاربری (username) ادمین پنل را وارد کنید:');
      return;
    case 'username':
      if (!value) {
        await ctx.reply('❗نام کاربری نمی‌تواند خالی باشد. دوباره بنویسید.');
        return;
      }
      w.username = value;
      w.step = 'password';
      await ctx.reply('🔑 رمز عبور ادمین پنل را وارد کنید:\n\n⚠️ این پیام در تاریخچه چت تلگرام باقی می‌ماند. توصیه می‌شود پس از اتصال، این پیام را حذف کنید. برای ادامه «بستن» را بزنید یا همین‌جا بنویسید.');
      return;
    case 'password':
      if (!value) {
        await ctx.reply('❗رمز عبور نمی‌تواند خالی باشد. دوباره بنویسید.');
        return;
      }
      await finishAddPanel(ctx, w, value);
      wizards.delete(chatId);
      return;
  }
}

async function finishAddPanel(ctx: Context, w: PanelWizard, password: string): Promise<void> {
  try {
    await db
      .insert(panelConnections)
      .values({
        name: w.name!,
        type: w.type as never,
        apiUrl: w.apiUrl!,
        username: encryptForStorage(w.username!),
        passwordHash: encryptForStorage(password),
        isEnabled: true,
      })
      .returning({ id: panelConnections.id });
    await ctx.reply('✅ پنل ذخیره شد. حالا اتصال را تست می‌کنیم…');
    await adminPanelTest(ctx, '');
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'add panel failed');
    await ctx.reply('❌ ذخیره پنل موفق نبود. لطفاً دوباره تلاش کنید یا به توسعه‌دهنده پیام دهید.');
  }
}

/** Test a panel connection (uses only implemented adapters). */
export async function adminPanelTest(ctx: Context, panelIdRaw: string): Promise<void> {
  await ctx.answerCbQuery().catch(() => {});
  let panelId = panelIdRaw;
  if (!panelId) {
    // just saved → find the newest panel for this context
    const chatId = String(ctx.from?.id ?? '');
    void chatId; // saving is done via finishAdd; find newest by type+name
    const rows = await db
      .select({ id: panelConnections.id })
      .from(panelConnections)
      .orderBy(desc(panelConnections.createdAt))
      .limit(1);
    panelId = rows[0]?.id ?? '';
  }
  if (!panelId) return;
  const rows = await db.select().from(panelConnections).where(eq(panelConnections.id, panelId)).limit(1);
  if (!rows.length) return;
  const panel = rows[0] as unknown as StoredPanelConnection;
  try {
    const adapter = createAdapter(panel);
    const result = await adapter.testConnection();
    const ok = result.ok;
    const summary = ok
      ? { ok: true, version: result.ok ? (result as { version: string | null }).version : null }
      : { ok: false, error: !ok ? (result as { error: string }).error : null };
    await db
      .update(panelConnections)
      .set({ lastTestAt: new Date(), lastTestResult: summary, isEnabled: ok })
      .where(eq(panelConnections.id, panelId));
    await ctx.reply(
      ok
        ? `✅ اتصال موفق بود${summary.version ? ` (نسخه ${summary.version})` : ''}. پنل فعال شد.`
        : `❌ اتصال موفق نبود: ${summary.error}\nپنل غیرفعال شد.`
    );
    await adminPanelList(ctx);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'panel test failed');
    await ctx.reply('❌ اتصال موفق نبود (خطای زیرساختی). پنل غیرفعال شد.');
    await db
      .update(panelConnections)
      .set({ lastTestAt: new Date(), lastTestResult: { ok: false, error: 'infra error' }, isEnabled: false })
      .where(eq(panelConnections.id, panelId))
      .catch(() => {});
  }
}

export async function adminPanelToggle(ctx: Context, panelId: string): Promise<void> {
  await ctx.answerCbQuery().catch(() => {});
  const rows = await db.select({ id: panelConnections.id, isEnabled: panelConnections.isEnabled }).from(panelConnections).where(eq(panelConnections.id, panelId)).limit(1);
  if (!rows.length) return;
  const next = !rows[0].isEnabled;
  await db.update(panelConnections).set({ isEnabled: next }).where(eq(panelConnections.id, panelId));
  await ctx.reply(next ? '✅ پنل فعال شد.' : '⏸ پنل غیرفعال شد.');
  await adminPanelView(ctx, panelId);
}

export async function adminPanelDelete(ctx: Context, panelId: string): Promise<void> {
  await ctx.answerCbQuery().catch(() => {});
  await db.delete(panelConnections).where(eq(panelConnections.id, panelId));
  await ctx.reply('🗑 پنل حذف شد. سرورهای وابسته نیز حذف خواهند شد (cascade).');
  await adminPanelList(ctx);
}

/** Wire the panel actions into the given bot. */
export function registerPanelActions(bot: Telegraf<Context>) {
  bot.action('admin:panels', (ctx) => {
    void adminPanelList(ctx);
  });
  bot.action('adminpanel:add', (ctx) => {
    void adminPanelAddStart(ctx);
  });
  bot.action(/adminpanel:type:(.+)/, (ctx) => {
    const type = (ctx as any).match?.[1] as string;
    const chatId = String(ctx.from?.id ?? '');
    const w = wizards.get(chatId);
    if (!w) return;
    w.type = type;
    w.step = 'name';
    void ctx.answerCbQuery('نوع ثبت شد. حالا نام را بفرستید.').catch(() => {});
    void ctx.reply('🏷 نام پنل را وارد کنید (مثل «سرور تهران»):');
  });
  bot.action(/adminpanel:view:(.+)/, (ctx) => {
    void adminPanelView(ctx, (ctx as any).match?.[1] as string);
  });
  bot.action(/adminpanel:test:(.+)/, (ctx) => {
    void adminPanelTest(ctx, (ctx as any).match?.[1] as string);
  });
  bot.action(/adminpanel:toggle:(.+)/, (ctx) => {
    void adminPanelToggle(ctx, (ctx as any).match?.[1] as string);
  });
  bot.action(/adminpanel:del:(.+)/, (ctx) => {
    void adminPanelDelete(ctx, (ctx as any).match?.[1] as string);
  });
}

/** Text message handler for the panel wizard (called from the bot's on('text')). */
export function isPanelWizardActive(ctx: Context): boolean {
  return wizards.has(String(ctx.from?.id ?? ''));
}
