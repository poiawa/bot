/**
 * Zarinpal payment provider adapter.
 *
 * Implements the documented Zarinpal REST API (v4, payment.zarinpal.com).
 * Requires a real merchant ID configured via ZARINPAL_MERCHANT_ID.
 *
 * API notes (official docs, sandbox: sandbox.zarinpal.com):
 * - POST /pg/v4/payment/request.json  -> { data: { authority } }
 * - Redirect: https://payment.zarinpal.com/pg/StartPay/{authority}
 * - POST /pg/v4/payment/verify.json   -> { data: { code, ref_id, card_pan } }
 *   code 100 = verified, code 101 = already verified (idempotent)
 *
 * NOTE: Requires a real merchant ID. Without credentials configured the
 * provider must refuse to initiate payments (CONFIG_MISSING).
 */
import { PaymentProvider, PaymentInitiationRequest, PaymentInitiationResult, VerificationRequest, VerificationResult, PaymentProviderCapabilities, PaymentError } from './types.js';

interface ZarinpalV4Response<T> {
  data?: T | { code: number; message?: string };
  errors?: Array<{ code: number; message: string }> | null;
}

const SANDBOX_BASE = 'https://sandbox.zarinpal.com';

export class ZarinpalProvider implements PaymentProvider {
  readonly id = 'zarinpal' as const;
  readonly displayName = 'زرین‌پال';
  readonly capabilities = {
    sandbox: true,
    serverSideInquiry: false,
    webhooks: false,
    refund: false,
    supportedCurrencies: ['IRT', 'IRR'],
  };

  private readonly baseUrl: string;

  constructor(
    private readonly merchantId: string | undefined,
    sandbox = false
  ) {
    this.baseUrl = sandbox ? SANDBOX_BASE : 'https://payment.zarinpal.com';
  }

  private assertConfigured(): string {
    if (!this.merchantId) {
      throw new PaymentError(
        'ZARINPAL_MERCHANT_ID is not configured. Set it in the environment to enable Zarinpal payments.',
        'CONFIG_MISSING'
      );
    }
    return this.merchantId;
  }

  async initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    try {
      const merchantId = this.assertConfigured();
      const res = await fetch(`${this.baseUrl}/pg/v4/payment/request.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: req.amountToman, // Zarinpal v4 accepts Toman
          description: req.description,
          callback_url: req.callbackUrl,
          metadata: {
            payment_id: req.paymentId,
            ...(req.customerPhone ? { mobile: req.customerPhone } : {}),
            ...(req.customerEmail ? { email: req.customerEmail } : {}),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      const json = (await res.json()) as ZarinpalV4Response<{ authority: string; fee?: number; code: number }>;
      if (json.errors && json.errors.length) {
        return { ok: false, providerRef: null, redirectUrl: null, error: json.errors[0].message ?? 'provider error' };
      }
      const data = json.data as { authority: string; code: number };
      if (!data || data.code !== 100 || !data.authority) {
        return { ok: false, providerRef: null, redirectUrl: null, error: `Unexpected provider response (code ${data?.code ?? 'unknown'})` };
      }
      return {
        ok: true,
        providerRef: data.authority,
        redirectUrl: `${this.baseUrl}/pg/StartPay/${data.authority}`,
      };
    } catch (err) {
      return {
        ok: false,
        providerRef: null,
        redirectUrl: null,
        error: err instanceof Error ? err.message : 'network error',
      };
    }
  }

  async verify(req: VerificationRequest): Promise<VerificationResult> {
    try {
      const merchantId = this.assertConfigured();
      // Zarinpal callback sends ?Authority=...&Status=OK|NOK
      const authority = req.providerRef;
      const status = req.callbackParams.Status ?? req.callbackParams.status;
      if (status && status.toUpperCase() !== 'OK') {
        return { ok: true, verified: false, providerRef: authority, error: 'Customer cancelled or payment failed at gateway' };
      }

      const res = await fetch(`${this.baseUrl}/pg/v4/payment/verify.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: req.amountToman,
          authority: authority,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const json = (await res.json()) as ZarinpalV4Response<{ code: number; ref_id?: number; card_pan?: string; message?: string }>;
      if (json.errors && json.errors.length) {
        return { ok: false, verified: false, providerRef: authority, error: json.errors[0].message };
      }
      const data = (json.data ?? null) as { code: number; ref_id?: number; card_pan?: string; message?: string } | null;
      if (!data) {
        return { ok: false, verified: false, providerRef: authority, error: 'empty verification response' };
      }
      // 100 = verified, 101 = already verified (treat both as success, idempotent)
      if (data.code === 100 || data.code === 101) {
        return {
          ok: true,
          verified: true,
          providerRef: authority,
          refId: data.ref_id ? String(data.ref_id) : undefined,
          cardMask: data.card_pan,
        };
      }
      return {
        ok: true,
        verified: false,
        providerRef: authority,
        error: data.message ?? `verification failed with code ${data.code}`,
      };
    } catch (err) {
      return {
        ok: false,
        verified: false,
        providerRef: req.providerRef,
        error: err instanceof Error ? err.message : 'network error',
      };
    }
  }
}
