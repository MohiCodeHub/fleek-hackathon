import type { Order } from '../../types.js';
import { Layout, SiteFooter, SiteHeader } from '../layout.js';
import { whatsAppHref } from '../whatsapp.js';

/** Orders carry their own currency, unlike the GBP-only catalog. */
function money(value: number, currency: string): string {
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '';
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}

function OrderSummary(props: { order: Order }) {
  const { order } = props;
  return (
    <div class="checkout-card">
      {order.imageUrl ? (
        <img
          class="checkout-image"
          src={order.imageUrl}
          alt={order.productName}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div class="checkout-image checkout-image-empty" aria-hidden="true" />
      )}

      <div class="checkout-body">
        <h2 class="checkout-product">{order.productName}</h2>

        <dl class="checkout-lines">
          <div class="checkout-line">
            <dt>Quantity</dt>
            <dd>{order.quantity} pcs</dd>
          </div>
          <div class="checkout-line">
            <dt>Price per piece</dt>
            <dd>{money(order.pricePerPiece, order.currency)}</dd>
          </div>
          {order.grade ? (
            <div class="checkout-line">
              <dt>Grade</dt>
              <dd>{order.grade}</dd>
            </div>
          ) : null}
          <div class="checkout-line checkout-total">
            <dt>Total</dt>
            <dd>{money(order.total, order.currency)}</dd>
          </div>
        </dl>

        {order.productUrl ? (
          <p class="checkout-source">
            <a class="quiet-link" href={order.productUrl}>
              View this lot on Fleek
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CheckoutPage(props: { order: Order }) {
  const { order } = props;
  const confirmed = order.status === 'confirmed';

  // Back to the one thread that matters — Abhi handles everything after this.
  const prefill = confirmed
    ? `Hi Abhi — I've confirmed order ${order.id}. What happens next?`
    : `Hi Abhi — a question about order ${order.id}.`;

  return (
    <Layout
      title={`Checkout — ${order.productName}`}
      description="Confirm your order sourced with Abhi on WhatsApp."
    >
      <SiteHeader />

      <main class="checkout-main">
        <header class="checkout-head">
          <p class="checkout-eyebrow">{confirmed ? 'Order confirmed' : 'Confirm your order'}</p>
          <h1>{confirmed ? 'You’re all set.' : 'Review and confirm'}</h1>
          <p class="checkout-lede">
            {confirmed
              ? 'Abhi has your confirmation and will take it from here on WhatsApp.'
              : 'Abhi agreed these terms with you on WhatsApp. Confirm to lock them in — no payment is taken here.'}
          </p>
        </header>

        <OrderSummary order={order} />

        {confirmed ? (
          <section class="checkout-actions" aria-label="Confirmed">
            <p class="checkout-confirmed-note">
              Confirmed{order.confirmedAt ? ` on ${order.confirmedAt.slice(0, 10)}` : ''}. Reference{' '}
              <code>{order.id}</code>
            </p>
            <a class="cta" href={whatsAppHref(prefill)}>
              Back to Abhi on WhatsApp
            </a>
          </section>
        ) : (
          <form class="checkout-actions" method="post" action={`/checkout/${order.id}/confirm`}>
            <button class="cta" type="submit">
              Confirm order
            </button>
            <p class="checkout-fineprint">
              No card details are taken. Confirming tells Abhi to proceed; he’ll settle payment and
              shipping with you in the thread.
            </p>
            <a class="quiet-link" href={whatsAppHref(prefill)}>
              Something look wrong? Message Abhi
            </a>
          </form>
        )}
      </main>

      <SiteFooter />
    </Layout>
  );
}

/** Shown when a checkout id is unknown or expired. */
export function CheckoutNotFoundPage() {
  return (
    <Layout title="Checkout not found" description="This checkout link is not valid.">
      <SiteHeader />
      <main class="checkout-main">
        <header class="checkout-head">
          <p class="checkout-eyebrow">Checkout</p>
          <h1>This link isn’t valid.</h1>
          <p class="checkout-lede">
            The order may have been cancelled, or the link mistyped. Abhi can raise a fresh one for
            you.
          </p>
        </header>
        <section class="checkout-actions">
          <a class="cta" href={whatsAppHref('Hi Abhi — my checkout link didn’t work.')}>
            Message Abhi on WhatsApp
          </a>
        </section>
      </main>
      <SiteFooter />
    </Layout>
  );
}
