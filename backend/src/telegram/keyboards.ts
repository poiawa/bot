/**
 * Telegram inline keyboards for the customer bot.
 */
import { Markup } from 'telegraf';
import { fa } from './texts.js';

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(fa.mainMenu.buy, 'menu:buy'), Markup.button.callback(fa.mainMenu.mySubs, 'menu:mysubs')],
    [Markup.button.callback(fa.mainMenu.wallet, 'menu:wallet'), Markup.button.callback(fa.mainMenu.renew, 'menu:renew')],
    [Markup.button.callback(fa.mainMenu.trial, 'menu:trial'), Markup.button.callback(fa.mainMenu.referral, 'menu:referral')],
    [Markup.button.callback(fa.mainMenu.support, 'menu:support'), Markup.button.callback(fa.mainMenu.guide, 'menu:guide')],
  ]);
}

export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به منوی اصلی', 'menu:main')]]);
}

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
