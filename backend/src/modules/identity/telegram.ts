/**
 * Telegram WebApp initData validation (official algorithm).
 *
 * secret = HMAC_SHA256(bot_token, "WebAppData")
 * hash   = hex(HMAC_SHA256(secret, data_check_string))
 *
 * Pure function — unit tested without network access.
 */
import crypto from 'crypto';

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; user: Record<string, unknown> | null } {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, user: null };

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const valid = computed === hash;
  if (valid) {
    const raw = params.get('user');
    if (raw) {
      try {
        return { valid: true, user: JSON.parse(raw) as Record<string, unknown> };
      } catch {
        return { valid: false, user: null };
      }
    }
    return { valid: true, user: null };
  }
  return { valid: false, user: null };
}
