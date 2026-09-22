import Stripe from 'stripe';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { HttpError, requireValue, verifyHmac } from './security.js';
export type CheckoutInput = {
  id: string;
  total_minor: number;
  currency: string;
  title: string;
  email: string;
  expires_at: string;
};
export type ProviderEvent = {
  id: string;
  reference: string;
  bookingId: string;
  amount: number;
  currency: string;
  paid: boolean;
};
export interface PaymentProvider {
  name: string;
  checkout(b: CheckoutInput): Promise<{ reference: string; url: string }>;
  refund(
    reference: string,
    amount: number,
    key: string,
  ): Promise<{ reference: string; complete: boolean }>;
  webhook(raw: string, signature: string): Promise<ProviderEvent>;
}
class SandboxProvider implements PaymentProvider {
  name = 'sandbox';
  async checkout(b: CheckoutInput) {
    requireValue(!config.production, 503, 'Sandbox is disabled');
    return { reference: `sandbox_${b.id}`, url: `${config.apiUrl}/sandbox/checkout/${b.id}` };
  }
  async refund(reference: string, _amount: number, key: string) {
    requireValue(!config.production, 503, 'Sandbox is disabled');
    return { reference: `sandbox_refund_${key}`, complete: true };
  }
  async webhook(): Promise<ProviderEvent> {
    throw new HttpError(404, 'Sandbox has no external webhook');
  }
}
class StripeProvider implements PaymentProvider {
  name = 'stripe';
  private client: Stripe;
  constructor() {
    requireValue(process.env.STRIPE_SECRET_KEY, 503, 'Stripe is not configured');
    this.client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  async checkout(b: CheckoutInput) {
    const session = await this.client.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: b.email,
        client_reference_id: b.id,
        metadata: { booking_id: b.id },
        payment_intent_data: { metadata: { booking_id: b.id } },
        line_items: [
          {
            price_data: {
              currency: b.currency.toLowerCase(),
              unit_amount: b.total_minor,
              product_data: { name: b.title },
            },
            quantity: 1,
          },
        ],
        success_url: `${config.appUrl}/?booking=${b.id}`,
        cancel_url: `${config.appUrl}/?booking=${b.id}&cancelled=1`,
        expires_at: Math.floor(new Date(b.expires_at).getTime() / 1000),
      },
      { idempotencyKey: `checkout:${b.id}` },
    );
    return { reference: session.id, url: session.url! };
  }
  async refund(reference: string, amount: number, key: string) {
    const session = await this.client.checkout.sessions.retrieve(reference);
    requireValue(session.payment_intent, 409, 'Payment has not settled');
    const created = await this.client.refunds.create(
      { payment_intent: String(session.payment_intent), amount },
      { idempotencyKey: key },
    );
    const result = await this.client.refunds.retrieve(created.id);
    requireValue(
      result.status !== 'failed' && result.status !== 'canceled',
      502,
      'Provider refund failed; finance review required',
    );
    return { reference: result.id, complete: result.status === 'succeeded' };
  }
  async webhook(raw: string, signature: string) {
    requireValue(process.env.STRIPE_WEBHOOK_SECRET, 503, 'Webhook secret is missing');
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(
        raw,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new HttpError(400, 'Invalid webhook signature');
    }
    requireValue(
      ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
        event.type,
      ),
      422,
      'Ignored webhook event',
    );
    const session = event.data.object as Stripe.Checkout.Session;
    const verified = await this.client.checkout.sessions.retrieve(session.id);
    return {
      id: event.id,
      reference: verified.id,
      bookingId: verified.metadata?.booking_id || '',
      amount: verified.amount_total || 0,
      currency: verified.currency!.toUpperCase(),
      paid: verified.payment_status === 'paid',
    };
  }
}
/** Contract for a contracted regional hosted gateway. Documented in docs/PAYMENTS.md. */
class HostedGateway implements PaymentProvider {
  name = 'gateway';
  async request(path: string, body: any, key: string) {
    requireValue(
      process.env.GATEWAY_URL && process.env.GATEWAY_API_KEY,
      503,
      'Local payment gateway is not configured',
    );
    const url = new URL(path, process.env.GATEWAY_URL);
    requireValue(url.protocol === 'https:', 503, 'Gateway requires HTTPS');
    const raw = JSON.stringify(body);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        'X-Pace-Signature': createHmac('sha256', process.env.GATEWAY_API_KEY)
          .update(raw)
          .digest('hex'),
      },
      body: raw,
      signal: AbortSignal.timeout(20000),
    });
    requireValue(response.ok, 502, 'Payment provider is temporarily unavailable');
    return response.json();
  }
  async checkout(b: CheckoutInput) {
    const result = z
      .object({ reference: z.string(), url: z.url().refine((v) => v.startsWith('https://')) })
      .parse(
        await this.request(
          '/v1/checkouts',
          {
            ...b,
            return_url: `${config.appUrl}/?booking=${b.id}`,
            webhook_url: `${config.apiUrl}/webhooks/gateway`,
          },
          `checkout:${b.id}`,
        ),
      );
    return result;
  }
  async refund(reference: string, amount: number, key: string) {
    return z
      .object({ reference: z.string(), complete: z.boolean() })
      .parse(await this.request('/v1/refunds', { reference, amount_minor: amount }, key));
  }
  async webhook(raw: string, signature: string) {
    requireValue(process.env.GATEWAY_WEBHOOK_SECRET, 503, 'Gateway webhook is not configured');
    const envelope = signature.split(',');
    const timestamp = envelope.find((x) => x.startsWith('t='))?.slice(2) || '';
    const mac = envelope.find((x) => x.startsWith('v1='))?.slice(3) || '';
    requireValue(
      Math.abs(Date.now() / 1000 - Number(timestamp)) < 300 &&
        verifyHmac(`${timestamp}.${raw}`, mac, process.env.GATEWAY_WEBHOOK_SECRET),
      400,
      'Invalid webhook signature',
    );
    return z
      .object({
        id: z.string(),
        reference: z.string(),
        bookingId: z.string().uuid(),
        amount: z.number().int().nonnegative(),
        currency: z.string().length(3),
        paid: z.boolean(),
      })
      .parse(JSON.parse(raw));
  }
}
export function providerByName(name: string): PaymentProvider {
  if (name === 'sandbox' && !config.production) return new SandboxProvider();
  if (name === 'stripe') return new StripeProvider();
  if (name === 'gateway') return new HostedGateway();
  throw new HttpError(503, 'No payment provider is configured');
}
export function providerForCountry(country: string) {
  if (config.payments === 'sandbox' && !config.production) return providerByName('sandbox');
  if ((process.env.GATEWAY_COUNTRIES || '').split(',').includes(country))
    return providerByName('gateway');
  if ((process.env.STRIPE_COUNTRIES || '').split(',').includes(country))
    return providerByName('stripe');
  throw new HttpError(503, 'Paid bookings are not available in this country yet');
}
