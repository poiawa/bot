# Payment Configuration Guide

## Zarinpal (implemented — requires merchant ID)

**Status**: Adapter implemented against Zarinpal v4 API. NOT yet tested with real/sandbox credentials.

### Required configuration
```
ZARINPAL_MERCHANT_ID=your-merchant-guid
ZARINPAL_SANDBOX=false   # true for sandbox testing
```

Without `ZARINPAL_MERCHANT_ID`, the provider is not registered and Zarinpal is not offered at checkout.

### Verification rules
- Payment is verified ONLY via server-side `POST /pg/v4/payment/verify.json`.
- Code 100 (verified) and 101 (already verified) both complete the payment — duplicate callbacks are harmless.
- Amount sent to verification must equal the internal invoice amount, otherwise `amount_mismatch` is recorded and the payment is NOT completed.

## Card-to-Card (implemented, manual workflow)

```
CARD_TO_CARD_ENABLED=true
CARD_TO_CARD_NUMBER=6037-99xx-xxxx-xxxx   # placeholder — set your card
CARD_TO_CARD_HOLDER_NAME=نام صاحب کارت
```

- Submitting a receipt NEVER completes a payment; an administrator must approve it.
- Invoices auto-expire (30 minutes default).
- Optional unique-amount suffixes for unambiguous matching.

## Not yet implemented
- Aqayepardakht, Aban Gateway, crypto providers, Telegram Stars — require merchant credentials and official API documentation before implementation.
