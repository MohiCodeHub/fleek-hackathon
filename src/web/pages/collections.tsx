import type { Product } from '../../types.js';
import { Layout, SiteFooter, SiteHeader, WhatsAppCta } from '../layout.js';
import {
  COLLECTIONS,
  type CollectionSlug,
  isSortValue,
  SORT_OPTIONS,
  type SortValue,
} from '../products.js';
import { whatsAppHref } from '../whatsapp.js';

function formatPrice(value: number): string {
  return `£${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function lotLabel(count: number): string {
  return count === 1 ? '1 lot' : `${count} lots`;
}

function ProductCard(props: { product: Product }) {
  const { product } = props;
  const prefill = `Hi Abhi — I'm interested in "${product.name}" (${formatPrice(product.price)}). Can you source it?\n${product.url}`;
  return (
    <li class="product-card">
      {product.imageUrl ? (
        <img
          class="product-image"
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div class="product-image product-image-empty" aria-hidden="true" />
      )}
      <div class="product-body">
        <h3 class="product-name">
          <a class="product-name-link" href={product.url} target="_blank" rel="noopener noreferrer">
            {product.name}
          </a>
        </h3>
        <p class="product-price">
          <span class="product-price-main">{formatPrice(product.price)}</span>
          {product.originalPrice != null && product.originalPrice > product.price ? (
            <span class="product-price-was">{formatPrice(product.originalPrice)}</span>
          ) : null}
          <span class="product-per-piece">{formatPrice(product.pricePerPiece)} / pc</span>
        </p>
      </div>
      <a class="product-cta" href={whatsAppHref(prefill)}>
        Source with Abhi
      </a>
    </li>
  );
}

function CollectionTabs(props: {
  active: CollectionSlug;
  counts: Record<string, number>;
  sort: SortValue;
}) {
  return (
    <nav class="collection-tabs" aria-label="Collections">
      {Object.entries(COLLECTIONS).map(([slug, col]) => {
        const href =
          props.sort === 'name'
            ? `/collections/${slug}`
            : `/collections/${slug}?sort=${props.sort}`;
        return (
          <a
            class={`collection-tab${slug === props.active ? ' is-active' : ''}`}
            href={href}
            aria-current={slug === props.active ? 'page' : undefined}
          >
            {col.title}
            <span class="collection-tab-count">{props.counts[slug] ?? 0}</span>
          </a>
        );
      })}
    </nav>
  );
}

function SortBar(props: { slug: CollectionSlug; sort: SortValue }) {
  return (
    <fieldset class="sort-bar">
      <legend class="sort-label">Sort</legend>
      {SORT_OPTIONS.map((option) => {
        const href =
          option.value === 'name'
            ? `/collections/${props.slug}`
            : `/collections/${props.slug}?sort=${option.value}`;
        return (
          <a
            class={`sort-option${option.value === props.sort ? ' is-active' : ''}`}
            href={href}
            aria-current={option.value === props.sort ? 'true' : undefined}
          >
            {option.label}
          </a>
        );
      })}
    </fieldset>
  );
}

export function CollectionsIndexPage(props: { counts: Record<string, number> }) {
  const total = Object.values(props.counts).reduce((sum, n) => sum + n, 0);
  return (
    <Layout
      title="Catalog — Abhi & Sanket"
      description="Browse graded vintage wholesale bales. Pick a lot and source it with Abhi on WhatsApp."
    >
      <SiteHeader />
      <main class="page catalog-index">
        <header class="page-header">
          <h1>Catalog</h1>
          <p class="page-lede">
            {total} graded lots from verified suppliers. Open a collection, pick what you need, and
            Abhi handles the rest on WhatsApp.
          </p>
        </header>

        <ul class="collection-tiles">
          {Object.entries(COLLECTIONS).map(([slug, col]) => (
            <li>
              <a class="collection-tile" href={`/collections/${slug}`}>
                <span class="collection-tile-title">{col.title}</span>
                <span class="collection-tile-meta">{lotLabel(props.counts[slug] ?? 0)}</span>
                <span class="collection-tile-blurb">{col.blurb}</span>
                <span class="collection-tile-action">Browse</span>
              </a>
            </li>
          ))}
        </ul>

        <div class="page-cta">
          <WhatsAppCta prefill="Hi Abhi — I want to source vintage stock from the catalog." />
          <p class="cta-note">Or message Abhi with what you need — no browsing required.</p>
        </div>
      </main>
      <SiteFooter />
    </Layout>
  );
}

export function CollectionPage(props: {
  slug: CollectionSlug;
  products: Product[];
  counts: Record<string, number>;
  sort: SortValue;
}) {
  const collection = COLLECTIONS[props.slug];
  const sort = isSortValue(props.sort) ? props.sort : 'name';
  return (
    <Layout
      title={`${collection.title} — Catalog — Abhi & Sanket`}
      description={`${collection.title} vintage wholesale bales. Source any lot with Abhi on WhatsApp.`}
    >
      <SiteHeader />
      <main class="page catalog-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a class="quiet-link" href="/collections">
            Catalog
          </a>
          <span class="breadcrumb-sep" aria-hidden="true">
            /
          </span>
          <span>{collection.title}</span>
        </nav>

        <header class="page-header">
          <h1>{collection.title}</h1>
          <p class="page-lede">{collection.blurb}</p>
        </header>

        <CollectionTabs active={props.slug} counts={props.counts} sort={sort} />

        <div class="catalog-toolbar">
          <p class="catalog-count">
            <strong>{props.products.length}</strong> {props.products.length === 1 ? 'lot' : 'lots'}
          </p>
          <SortBar slug={props.slug} sort={sort} />
        </div>

        {props.products.length === 0 ? (
          <p class="empty-state">
            No lots in this collection yet.{' '}
            <a class="quiet-link" href={whatsAppHref('Hi Abhi — looking for stock.')}>
              Message Abhi
            </a>{' '}
            with what you need.
          </p>
        ) : (
          <ul class="product-grid">
            {props.products.map((product) => (
              <ProductCard product={product} />
            ))}
          </ul>
        )}
      </main>

      <section class="sticky-cta" aria-label="Source with Abhi">
        <p class="sticky-cta-copy">Ready to source? Abhi negotiates in one WhatsApp thread.</p>
        <WhatsAppCta prefill={`Hi Abhi — I'm browsing the ${collection.title} collection.`} />
      </section>
      <SiteFooter />
    </Layout>
  );
}
