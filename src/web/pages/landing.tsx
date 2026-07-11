import { Layout, SiteFooter, SiteHeader, WhatsAppCta } from '../layout.js';

const HERO_PREFILL = "Hi Abhi — I'm looking to source vintage stock for my shop.";

function ConversationVignette() {
  return (
    <figure class="vignette" aria-label="Example WhatsApp conversation with Abhi">
      <div class="vignette-thread" role="log">
        <p class="bubble bubble-buyer">
          Need 300 vintage band tees for my shop. Grade A/B, under £9 a piece.
        </p>
        <p class="bubble bubble-abhi">
          On it. Two matches from verified graders:
          <br />
          1. Vintage Mix Branded Tees — £9/pc, Grade A/B, 15pc bales
          <br />
          2. 90s Band Tee Bundle — £8.50/pc, Grade B, 20pc bales
          <br />
          Want me to push on price?
        </p>
        <p class="bubble bubble-buyer">Yes — go.</p>
        <p class="bubble bubble-abhi">
          Sanket is negotiating behind the scenes. Best so far: £8.40/pc, freight included.
        </p>
      </div>
      <figcaption class="vignette-caption">One thread. Abhi does the rest.</figcaption>
    </figure>
  );
}

export function LandingPage() {
  return (
    <Layout
      title="Abhi & Sanket — your Fleek sourcing agent on WhatsApp"
      description="Tell Abhi the vintage stock you need on WhatsApp. He matches graded bales from verified Fleek suppliers and negotiates the deal for you — in one thread."
    >
      <SiteHeader />
      <main>
        <section class="hero">
          <div class="hero-copy">
            <h1>Your Fleek sourcing agent lives on WhatsApp.</h1>
            <p class="hero-support">
              Tell Abhi the bales you need. He matches graded stock from verified suppliers and
              negotiates the deal for you — in one thread.
            </p>
            <div class="cta-group">
              <WhatsAppCta prefill={HERO_PREFILL} />
              <span class="cta-note">Sandbox number — replies in seconds</span>
            </div>
          </div>
          <ConversationVignette />
        </section>

        <section class="steps" aria-labelledby="steps-heading">
          <h2 id="steps-heading">How it works</h2>
          <ol class="steps-list">
            <li>
              <strong>Tell Abhi what you need.</strong> Category, grade, quantity, price — plain
              WhatsApp messages, no forms.
            </li>
            <li>
              <strong>He matches graded bales.</strong> Ranked picks from verified wholesalers, rag
              houses, and grading hubs, with the fit explained.
            </li>
            <li>
              <strong>Sanket negotiates behind the scenes.</strong> Price, grade, and quantity
              inside your mandate — you just get the closed deal.
            </li>
          </ol>
        </section>

        <section class="closing">
          <p class="closing-lede">
            Prefer to browse first? Open the <a href="/collections">catalog</a>, pick a lot, and
            source it with Abhi.
          </p>
          <div class="cta-group">
            <WhatsAppCta prefill={HERO_PREFILL} />
            <a class="cta-secondary" href="/collections">
              Browse catalog
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </Layout>
  );
}
