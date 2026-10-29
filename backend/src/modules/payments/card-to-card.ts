/**
 * Card-to-Card payment provider.
 *
 * This is a MANUAL payment method: a receipt is submitted by the customer
 * and an administrator must approve or reject it. A submitted receipt is
 * NEVER treated as a successful payment.
 *
 * Anti-fraud: unique invoice amounts are supported — the platform may add
 * a small transparent, rule-compliant suffix to the amount to make matching
 * unambiguous. The customer is always shown the exact amount to pay.
 */
import { PaymentProvider, PaymentInitiationRequest, PaymentInitiationResult, VerificationRequest, VerificationResult, PaymentProviderCapabilities, PaymentError } from './types.js';

export interface CardToCardSettings {
  cardNumber: string;
  cardHolderName: string;
  bank: string;
  /** If true, unique cents/rials are added to invoice amounts for matching */
  useUniqueAmounts: boolean;
  invoiceExpiryMinutes: number;
}

export const DEFAULT_CARD_SETTINGS: CardToCardSettings = {
  cardNumber: '',
  cardHolderName: '',
  bank: '',
  useUniqueAmounts: true,
  invoiceExpiryMinutes: 30,
};

export class CardToCardProvider implements PaymentProvider {
  readonly id = 'card_to_card' as const;
  readonly displayName = 'کارت به کارت';
  readonly capabilities = {
    sandbox: false,
    serverSideInquiry: false,
    webhooks: false,
    refund: false,
    supportedCurrencies: ['IRT'],
  };

  constructor(private settings: Partial<CardToCardSettings> = {}) {}

  async initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    const s = { ...DEFAULT_CARD_SETTINGS, ...this.settings };
    if (!s.cardNumber || !s.cardHolderName) {
      throw new PaymentError(
        'Card-to-card destination details are not configured (CARD_TO_CARD_NUMBER, CARD_TO_CARD_HOLDER_NAME).',
        'CONFIG_MISSING'
      );
    }
    // No provider integration: the "redirect" is an internal instruction page.
    return {
      ok: true,
      providerRef: `ctc_${req.paymentId}`,
      redirectUrl: null,
    };
  }

  /**
   * Card-to-card verification is ALWAYS manual. The provider-level verify
   * returns verified=false so the workflow routes it to admin review.
   */
  async verify(req: VerificationRequest): Promise<VerificationResult> {
    return {
      ok: true,
      verified: false,
      providerRef: req.providerRef,
      error: 'card_to_card requires manual administrator verification',
      requiresStatusInquiry: false,
    };
  }
}
