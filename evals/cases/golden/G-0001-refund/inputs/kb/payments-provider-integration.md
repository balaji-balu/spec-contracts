---
kb_doc: payments-provider-integration
version: 7
owner: Payments platform team
---
# Payment provider integration notes

- Refund API: `POST /v2/refunds` with `payment_id` and an optional `amount` (full refund if omitted).
- Idempotency: send an `Idempotency-Key` header. A repeated key within 24 h returns the original result.
- Rate limit: **20 refund requests per second** per merchant account. Excess calls get HTTP 429.
- Typical rejection reasons: `card_expired`, `payment_not_captured`, `insufficient_merchant_balance`.
- Peak observed cancellation volume (last sale event): about 2,000 order cancellations in 10 minutes.
