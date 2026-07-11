import type { Child } from 'hono/jsx';
import { CTA_LABEL, whatsAppHref } from './whatsapp.js';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap';

export function Layout(props: { title: string; description: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <meta name="description" content={props.description} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        <link rel="stylesheet" href="/web.css?v=catalog-2" />
      </head>
      <body>{props.children}</body>
    </html>
  );
}

export function SiteHeader() {
  return (
    <header class="site-header">
      <a class="wordmark" href="/">
        Abhi <span class="wordmark-amp">&amp;</span> Sanket
        <span class="wordmark-for">for Fleek</span>
      </a>
      <nav aria-label="Site">
        <a class="nav-link" href="/collections">
          Catalog
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer class="site-footer">
      <p>
        Abhi &amp; Sanket — sourcing agents for{' '}
        <a class="quiet-link" href="https://joinfleek.com">
          Fleek
        </a>
        . Built for the a16z × Fleek hackathon.
      </p>
      <p class="footer-note">WhatsApp sandbox: +44 7424 845871</p>
    </footer>
  );
}

/** The one green CTA. Same label everywhere; only the prefill varies. */
export function WhatsAppCta(props: { prefill?: string }) {
  return (
    <a class="cta" href={whatsAppHref(props.prefill)}>
      {CTA_LABEL}
    </a>
  );
}
