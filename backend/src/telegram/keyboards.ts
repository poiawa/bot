/**
 * Telegram keyboards: customer menus + admin panel.
 *
 * Main customer menu uses a REPLY keyboard (persistent custom keyboard at the
 * bottom of the chat, like Faoxima) — selecting a key sends its text, which we
 * route through bot.hears(). Sub-flows (products, admin) use inline keyboards
 * because they are contextual.
 */
import { Markup } from 'telegraf';
import { fa } from './texts.js';

// ---------- CUSTOMER (reply keyboard = persistent menu) ----------
export function mainMenuKeyboard() {
  return Markup.keyboard([
    [Markup.button.text(fa.mainMenu.buy), Markup.button.text(fa.mainMenu.mySubs)],
    [Markup.button.text(fa.mainMenu.wallet), Markup.button.text(fa.mainMenu.renew)],
    [Markup.button.text(fa.mainMenu.trial), Markup.button.text(fa.mainMenu.referral)],
    [Markup.button.text(fa.mainMenu.guide), Markup.button.text(fa.mainMenu.support)],
  ]).resize();
}

/** Inline back button shown under contextual messages (product detail, …). */
export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به منوی اصلی', 'menu:main')]]);
}

/** The text labels of the reply menu — used by bot.hears() routing. */
export const mainMenuLabels = [
  fa.mainMenu.buy,
  fa.mainMenu.mySubs,
  fa.mainMenu.wallet,
  fa.mainMenu.renew,
  fa.mainMenu.trial,
  fa.mainMenu.referral,
  fa.mainMenu.guide,
  fa.mainMenu.support,
];

export function productKeyboard(products: Array<{ id: string; name: string; price: number }>) {
  const rows = products.map((p) => [
    Markup.button.callback(`${p.name} — ${p.price.toLocaleString('fa-IR')} تومان`, `product:${p.id}`),
  ]);
  rows.push([Markup.button.callback('🔙 بازگشت', 'menu:main')]);
  return Markup.inlineKeyboard(rows);
}

export function paymentMethodKeyboard(enabled: string[]) {
  const names: Record<string, string> = {
    zarinpal: '💳 درگاه پرداخت آنلاین',
    card_to_card: '🏦 کارت به کارت',
    wallet: '💰 پرداخت از کیف پول',
  };
  const rows = enabled.map((m) => [Markup.button.callback(names[m] ?? m, `pay:${m}`)]);
  rows.push([Markup.button.callback('🔙 بازگشت', 'menu:buy')]);
  return Markup.inlineKeyboard(rows);
}

/** Since the main menu is now a reply keyboard, product detail uses a small
 *  inline keyboard only for its own actions (buy / back). */
export function productDetailKeyboard(productId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 خرید این پلن', `buy:${productId}`)],
    [Markup.button.callback('🔙 بازگشت', 'menu:main')],
  ]);
}

// ---------- ADMIN (inline panel inside Telegram) ----------
export function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 داشبورد', 'admin:dash')],
    [Markup.button.callback('📋 اشتراک‌ها', 'admin:subs'), Markup.button.callback('👥 کاربران', 'admin:users')],
    [Markup.button.callback('📦 محصولات', 'admin:products'), Markup.button.callback('🔌 پنل‌ها', 'admin:panels')],
    [Markup.button.callback('📈 گزارش‌ها', 'admin:reports'), Markup.button.callback('⚙️ وضعیت سیستم', 'admin:system')],
    [Markup.button.callback('🔒 بستن پنل', 'admin:close')],
  ]);
}

export function adminBackKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به پنل', 'admin:menu')]]);
}

export function adminConfirmKeyboard(payload: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ بله، تأیید', `${payload}:yes`)],
    [Markup.button.callback('❌ خیر، انصراف', 'admin:menu')],
  ]);
}

/** Panel listing — one row per panel + add + back. */
export function panelListKeyboard(
  panels: Array<{ id: string; name: string; isEnabled: boolean }>
) {
  const rows = panels.map((p) => [
    Markup.button.callback(`${p.isEnabled ? '🟢' : '🔴'} ${p.name}`, `adminpanel:view:${p.id}`),
  ]);
  rows.push([Markup.button.callback('➕ افزودن پنل', 'adminpanel:add')]);
  rows.push([Markup.button.callback('🔙 بازگشت به پنل', 'admin:menu')]);
  return Markup.inlineKeyboard(rows);
}

/** Single panel actions. */
export function panelActionsKeyboard(panelId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔌 تست اتصال', `adminpanel:test:${panelId}`)],
    [Markup.button.callback('🔄 فعال/غیرفعال', `adminpanel:toggle:${panelId}`)],
    [Markup.button.callback('🗑 حذف پنل', `adminpanel:del:${panelId}`)],
    [Markup.button.callback('🔙 لیست پنل‌ها', 'admin:panels')],
  ]);
}
