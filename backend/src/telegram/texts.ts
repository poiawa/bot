/**
 * Persian message texts for the Telegram customer bot.
 * All user-facing bot texts live here for easy customization/white-labeling.
 */
export const fa = {
  welcome: '👋 به فروشگاه خوش آمدید!\n\nبرای مشاهده پلن‌ها و خرید اشتراک، از دکمه‌های زیر استفاده کنید.',
  mainMenu: {
    buy: '🛒 خرید اشتراک',
    mySubs: '📋 اشتراک‌های من',
    wallet: '💰 کیف پول',
    renew: '🔄 تمدید اشتراک',
    trial: '🎁 اشتراک آزمایشی',
    referral: '👥 معرفی دوستان',
    support: '🎧 پشتیبانی',
    guide: '📖 راهنمای اتصال',
    account: '👤 حساب کاربری',
  },
  noSubs: 'شما هنوز اشتراک فعالی ندارید. برای خرید از منوی خرید استفاده کنید.',
  walletBalance: (balance: string) => `موجودی کیف پول شما: ${balance} تومان`,
  selectProduct: 'لطفاً یکی از پلن‌های زیر را انتخاب کنید:',
  paymentMethod: 'روش پرداخت را انتخاب کنید:',
  purchaseSuccess: '✅ اشتراک شما با موفقیت ایجاد شد!',
  purchaseFailed: '❌ متأسفانه در ایجاد اشتراک مشکلی پیش آمد. پرداخت شما ثبت شده است و کارشناسان ما به‌زودی بررسی می‌کنند.',
  subscriptionDetails: (name: string, used: string, total: string, expiry: string) =>
    `📊 ${name}\n\n` +
    `👥 حجم مصرفی: ${used}\n` +
    `📦 حجم کل: ${total}\n` +
    `⏰ انقضا: ${expiry}`,
  configLink: '🔗 لینک اشتراک شما (برای کپی کلیک کنید):',
  guide: 'برای اتصال، ابتدا یک برنامه مناسب (مثل v2rayNG یا Streisand) نصب کنید و سپس لینک اشتراک را در آن وارد کنید.',
  referralInfo: (link: string, count: number, reward: string) =>
    `👥 با معرفی ما به دوستانتان پاداش بگیرید!\n\nلینک شما:\n${link}\n\nتعداد معرفی موفق: ${count}\nپاداش هر معرفی: ${reward} تومان`,
  ticketCreated: '✅ تیکت شما با موفقیت ایجاد شد. کارشناسان ما به‌زودی پاسخ می‌دهند.',
  trialUsed: 'شما قبلاً اشتراک آزمایشی استفاده کرده‌اید.',
  errors: {
    generic: 'خطایی رخ داد. لطفاً دوباره تلاش کنید.',
    paymentNotAvailable: 'در حال حاضر روش پرداخت انتخابی در دسترس نیست.',
  },
};

export type FaTexts = typeof fa;
