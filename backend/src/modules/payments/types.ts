/**
 * Payment Provider Interface
 *
 * A payment is only "confirmed" after server-side verification against
 * the provider. Reaching a success page or uploading a receipt is NEVER
 * sufficient.
 */

export type PaymentMethodId =
  | 'zarinpal'
  | 'aqayepardakht'
  | 'aban'
  | 'card_to_card'
  | 'wallet'
  | 'telegram_stars'
  | 'crypto';

export interface PaymentInitiationRequest {
  /** Unique payment record ID (internal) */
  paymentId: string;
  /** Amount in Toman (IRR/10) */
  amountToman: number;
  description: string;
  customerPhone?: string;
  customerEmail?: string;
  callbackUrl: string;
}

export interface PaymentInitiationResult {
  ok: boolean;
  /** Provider's unique reference/authority */
  providerRef: string | null;
  /** URL to redirect the customer to */
  redirectUrl: string | null;
  error?: string;
}

export interface VerificationRequest {
  providerRef: string;
  amountToman: number;
  /** Provider-specific params from callback query/body */
  callbackParams: Record<string, string>;
}

export interface VerificationResult {
  ok: boolean;
  /** true only after authoritative server-side verification */
  verified: boolean;
  providerRef: string;
  /** Card mask or RRN if provider returns it */
  cardMask?: string;
  refId?: string;
  error?: string;
  /** Whether a server-side status inquiry is available/recommended */
  requiresStatusInquiry?: boolean;
}

export interface PaymentProviderCapabilities {
  sandbox: boolean;
  serverSideInquiry: boolean;
  webhooks: boolean;
  refund: boolean;
  supportedCurrencies: string[];
}

export interface PaymentProvider {
  readonly id: PaymentMethodId;
  readonly displayName: string;
  readonly capabilities: PaymentProviderCapabilities;

  /** Create the invoice at the provider and get the redirect URL */
  initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResult>;

  /** Authoritative verification of a callback/webhook */
  verify(req: VerificationRequest): Promise<VerificationResult>;

  /** Optional: server-side status inquiry by provider reference */
  inquire?(providerRef: string): Promise<VerificationResult>;
}

export class PaymentError extends Error {
  constructor(message: string, public readonly code: 'CONFIG_MISSING' | 'PROVIDER_ERROR' | 'VERIFICATION_FAILED' | 'AMOUNT_MISMATCH' | 'INVALID_REFERENCE' | 'NETWORK_ERROR') {
    super(message);
    this.name = 'PaymentError';
  }
}
