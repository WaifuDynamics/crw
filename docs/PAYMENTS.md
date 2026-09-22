# Payment operations

Money is stored in integer minor units. A reservation snapshots ticket amount, service fee and currency; later fee configuration changes cannot change that reservation. Fee calculation is `fixed_minor + round(ticket_minor * basis_points / 10000)`. Free activities have no fee. Reservations last 35 minutes, allowing Stripe's minimum hosted-checkout expiry.

`PaymentProvider` in `apps/api/src/payments.ts` defines hosted checkout, refunds and verified webhooks. Routing uses the event city’s country. Provider secrets never enter the app. The app handles neither card numbers nor card security codes.

## Available adapters

| Adapter | State | Configuration |
|---|---|---|
| Sandbox | Executable local development only; never charges money | `PAYMENT_PROVIDER=sandbox` |
| Stripe Checkout | Implemented hosted checkout, signed webhooks, server retrieval and idempotent refunds; live credentials untested | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, explicit `STRIPE_COUNTRIES` |
| Regional hosted gateway | Implemented signed HTTP integration contract; needs a contracted provider or bridge implementing the protocol below | `GATEWAY_URL`, `GATEWAY_API_KEY`, `GATEWAY_WEBHOOK_SECRET`, `GATEWAY_COUNTRIES` |

Do not route Lebanon to Stripe merely by setting a country list. Merchant eligibility, settlement currency, local payment methods, acquiring, contracts and onboarding must be established with a provider before enabling a country. No live Lebanese acquiring integration has been certified in this repository.

## Regional gateway protocol

CRW+ sends `POST /v1/checkouts` to `GATEWAY_URL` with a bearer API key, JSON content type, `Idempotency-Key: checkout:<booking UUID>`, and `X-Pace-Signature` equal to hex HMAC-SHA256 of the raw JSON using `GATEWAY_API_KEY`.

```json
{
  "id": "booking UUID",
  "total_minor": 1100,
  "currency": "USD",
  "title": "Activity name",
  "email": "customer@example.com",
  "expires_at": "ISO-8601 expiry",
  "return_url": "https://app.example.com/?booking=...",
  "webhook_url": "https://api.example.com/webhooks/gateway"
}
```

The gateway returns `{ "reference": "provider-checkout-id", "url": "https://hosted-checkout..." }`.

`POST /v1/refunds` accepts `{ "reference": "provider-checkout-id", "amount_minor": 1100 }` with the same bearer/signature pattern and `Idempotency-Key: refund:<refund UUID>`. Return `{ "reference": "refund-id", "complete": true }` only after completion. Repeated calls with the same key must refer to the original operation and report its current settlement status.

Webhooks use `Content-Type: application/json`, `X-Gateway-Signature: t=<Unix seconds>,v1=<hex HMAC>`. Sign `<timestamp>.<raw body>` using `GATEWAY_WEBHOOK_SECRET`. The maximum accepted timestamp drift is five minutes.

```json
{"id":"unique-webhook-id","reference":"provider-checkout-id","bookingId":"booking UUID","amount":1100,"currency":"USD","paid":true}
```

## Guarantees

- Event row locks serialize reservations against capacity. Active reservations and confirmed bookings occupy inventory.
- Only trusted, verified provider confirmation creates a paid ticket. Redirects never confirm payment.
- Webhook IDs are deduplicated in the same transaction as settlement. Reference, country-selected provider, amount and currency must match stored payment data.
- A late payment after cancellation/expiry queues a full refund and cannot reclaim another person's spot.
- Cancellation revokes tickets immediately. Workers process refund jobs using provider idempotency keys and audit outcomes.
- Organizer earnings equal ticket proceeds; platform revenue equals snapshotted fees. Refunded bookings are excluded from confirmed revenue.

## Payouts

The implemented settlement rail is an **audited manual bank transfer workflow**. Admin selects a community/currency; only paid bookings seven days past the event and not already assigned to a payout are eligible. `payout_items.booking_id` is unique. Admin performs a transfer through the contracted bank/provider and records its actual external reference. CRW+ does not automatically move organizer funds or collect bank credentials.

Refunds of bookings already assigned to a payout are blocked until finance resolves recovery. A production operator must establish reconciliation, maker/checker procedures and exception handling with their settlement partner. Automated provider payouts and Connect onboarding are future integrations, not represented as completed transfers.

## Webhook endpoints

- `POST /webhooks/stripe`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`; raw body signature verification and session retrieval.
- `POST /webhooks/gateway`: protocol above.
- The sandbox has no public webhook. Authenticated development checkout invokes the same settlement service.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe webhook signature requirements](https://docs.stripe.com/webhooks).
