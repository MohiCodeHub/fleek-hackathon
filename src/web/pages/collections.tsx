import type { Product } from '../../types.js';
import { Layout, SiteFooter, SiteHeader, WhatsAppCta } from '../layout.js';
import { COLLECTIONS, type CollectionSlug } from '../products.js';
import { whatsAppHref } from '../whatsapp.js';

function formatPrice(value: number): string {
  return `£${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function ProductCard(props: { product: Product }) {
  const { product } = props;
  const prefill = `Hi Abhi — I'm interested in "${product.name}" (${formatPrice(product.price)}). Can you source it?`;
  return (
    <li class="product-card">
      <h3 class="product-name">{product.name}</h3>
      <p class="product-price">
        {formatPrice(product.price)}
        <span class="product-per-piece"> · {formatPrice(product.pricePerPiece)}/pc</span>
      </p>
      <a class="quiet-link product-ask" href={whatsAppHref(prefill)}>
        Ask Abhi about this bale
      </a>
    </li>
  );
}

export function CollectionsIndexPage(props: { counts: Record<string, number> }) {
  return (
    <Layout
      title="Demo catalog — Abhi & Sanket"
      description="A sample of the graded vintage bales Abhi sources on Fleek. Pick a collection, or just message Abhi on WhatsApp."
    >
      <SiteHeader />
      <main class="page">
        <h1>Demo catalog</h1>
        <p class="page-lede">
          A sample of the kind of stock Abhi sources — the real inventory lives in the WhatsApp
          conversation.
        </p>
        <ul class="collection-list">
          {Object.entries(COLLECTIONS).map(([slug, col]) => (
            <li>
              <a class="collection-link" href={`/collections/${slug}`}>
                {col.title} <span class="collection-count">{props.counts[slug] ?? 0} bales</span>
              </a>
            </li>
          ))}
        </ul>
        <div class="page-cta">
          <WhatsAppCta prefill="Hi Abhi — I browsed the catalog and want to source vintage stock." />
        </div>
      </main>
      <SiteFooter />
    </Layout>
  );
}

export function CollectionPage(props: { slug: CollectionSlug; products: Product[] }) {
  const collection = COLLECTIONS[props.slug];
  return (
    <Layout
      title={`${collection.title} — demo catalog — Abhi & Sanket`}
      description={`${collection.title} vintage wholesale bales Abhi can source on Fleek — message him on WhatsApp to negotiate.`}
    >
      <SiteHeader />
      <main class="page">
        <nav aria-label="Breadcrumb">
          <a class="quiet-link" href="/collections">
            ← Demo catalog
          </a>
        </nav>
        <h1>{collection.title}</h1>
        <p class="page-lede">
          {props.products.length} sample bales. Ask Abhi about any of them — Sanket handles the
          negotiation.
        </p>
        <ul class="product-grid">
          {props.products.map((product) => (
            <ProductCard product={product} />
          ))}
        </ul>
        <div class="page-cta">
          <WhatsAppCta prefill={`Hi Abhi — I'm browsing the ${collection.title} collection.`} />
        </div>
      </main>
      <SiteFooter />
    </Layout>
  );
}
