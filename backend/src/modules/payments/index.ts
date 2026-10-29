/**
 * Payment provider registry.
 * Providers are instantiated from environment config; each is independently
 * enableable. A provider without required config is NOT usable and must
 * never be offered at checkout.
 */
import { PaymentProvider, PaymentMethodId, PaymentError } from './types.js';
import { ZarinpalProvider } from './zarinpal.js';
import { CardToCardProvider } from './card-to-card.js';

export function getEnabledProviders(): Map<PaymentMethodId, PaymentProvider> {
  const map = new Map<PaymentMethodId, PaymentProvider>();

  if (process.env.ZARINPAL_MERCHANT_ID) {
    const sandbox = process.env.ZARINPAL_SANDBOX === 'true';
    map.set('zarinpal', new ZarinpalProvider(process.env.ZARINPAL_MERCHANT_ID, sandbox));
  }

  if (process.env.CARD_TO_CARD_ENABLED === 'true') {
    map.set('card_to_card', new CardToCardProvider({
      cardNumber: process.env.CARD_TO_CARD_NUMBER,
      cardHolderName: process.env.CARD_TO_CARD_HOLDER_NAME,
    }));
  }

  // Aqayepardakht / Aban / crypto / Telegram Stars: NOT YET IMPLEMENTED.
  // Do not register them until real adapters with credentials exist.

  return map;
}

export function getProvider(id: PaymentMethodId): PaymentProvider {
  const provider = getEnabledProviders().get(id);
  if (!provider) {
    throw new PaymentError(`Payment provider "${id}" is not configured or not implemented`, 'CONFIG_MISSING');
  }
  return provider;
}
