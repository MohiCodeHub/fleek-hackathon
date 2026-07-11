import { closeDb } from '../db/client.js';
import { insertBale, insertProduct, resetDb, upsertBuyer, upsertSupplier } from '../db/index.js';
import type { Bale, Buyer, Product, Supplier } from '../types.js';
import mensProductsJson from './fixtures/mens-unisex.json';
import womensProductsJson from './fixtures/womens.json';

/**
 * Seed fuzzy, messy bulk-bale inventory — the shape of real wholesale
 * secondhand stock ("~400 mixed 90s branded, Grade B"), NOT clean SKUs.
 * Swappable once Fleek confirms the real inventory structure.
 */

const buyers: Buyer[] = [
  {
    phone: '+14155550101',
    name: 'Jordan Marlowe',
    company: 'Marlowe Vintage',
    onboardedAt: new Date().toISOString(),
    profile: { brandsPursued: [], notes: [] },
  },
];

const suppliers: Supplier[] = [
  {
    id: 'sup_raghouse_atlas',
    phone: '+14155550201',
    name: 'Atlas Rag House',
    profile: {
      stockCharacter:
        'High-volume UK rag house. Strong in 90s/00s branded sportswear and streetwear, sorted to Grade A/B. Reliable counts.',
      floorDiscount: 0.18, // will go ~18% below ask
      negotiationStyle:
        'Professional, moves on price for volume, protects grade claims. Concedes in ~5% steps.',
      notes: [],
    },
  },
  {
    id: 'sup_baler_nord',
    phone: '+14155550202',
    name: 'Nord Textile Baler',
    profile: {
      stockCharacter:
        'Scandinavian grading hub. Mixed vintage bales, inconsistent grade (B/C), good prices, counts run light.',
      floorDiscount: 0.1,
      negotiationStyle:
        'Blunt, price is already low so resists discounts; flexible on adding units from the next bale.',
      notes: [],
    },
  },
  {
    id: 'sup_wholesale_meridian',
    phone: '+14155550203',
    name: 'Meridian Wholesale',
    profile: {
      stockCharacter:
        'Premium curated wholesaler. Grade A Y2K and designer-adjacent branded pieces. Prices high, holds firm.',
      floorDiscount: 0.07,
      negotiationStyle: 'Premium positioning, small concessions only, emphasises quality.',
      notes: [],
    },
  },
  {
    id: 'sup_bulk_kappa',
    phone: '+14155550204',
    name: 'Kappa Bulk Traders',
    profile: {
      stockCharacter:
        'Cheap unsorted bulk. Mostly denim/workwear with some branded mixed in. Grade C/D. Cheap, high variance.',
      floorDiscount: 0.22,
      negotiationStyle: 'Eager to move stock, discounts fast, but quality and counts are a gamble.',
      notes: [],
    },
  },
];

const bales: Bale[] = [
  {
    id: 'bale_atlas_sport90',
    supplierId: 'sup_raghouse_atlas',
    description:
      '~420 mixed 90s branded sportswear — Nike, adidas, Reebok, Champion. Tees, crews, track tops. Graded B, some A. Original wholesale bale.',
    category: 'sportswear',
    era: '90s',
    brands: ['Nike', 'adidas', 'Reebok', 'Champion'],
    grade: 'B',
    quantity: 420,
    askPrice: 5.5,
  },
  {
    id: 'bale_atlas_streetA',
    supplierId: 'sup_raghouse_atlas',
    description:
      '~180 premium 90s/00s branded streetwear, Grade A. Hoodies and outerwear, heavier pieces, strong labels.',
    category: 'streetwear',
    era: '90s-00s',
    brands: ['Nike', 'Ralph Lauren', 'Tommy Hilfiger'],
    grade: 'A',
    quantity: 180,
    askPrice: 8.0,
  },
  {
    id: 'bale_nord_mixed90',
    supplierId: 'sup_baler_nord',
    description:
      '~250 mixed 90s vintage, includes branded sportswear and tees but also plain/unbranded. Grade B/C, count approximate.',
    category: 'mixed vintage',
    era: '90s',
    brands: ['Nike', 'Umbro', 'assorted'],
    grade: 'C',
    quantity: 250,
    askPrice: 4.0,
  },
  {
    id: 'bale_nord_tees',
    supplierId: 'sup_baler_nord',
    description:
      '~600 bulk single-stitch and graphic tees, era mixed 80s-00s, Grade B. Cheap per unit.',
    category: 'tees',
    era: 'mixed',
    brands: ['assorted'],
    grade: 'B',
    quantity: 600,
    askPrice: 2.5,
  },
  {
    id: 'bale_meridian_y2k',
    supplierId: 'sup_wholesale_meridian',
    description:
      '~300 curated Y2K branded pieces, Grade A. Clean, resale-ready, strong 2000s labels. Premium ask.',
    category: 'branded vintage',
    era: 'y2k',
    brands: ['Nike', 'Diesel', 'Von Dutch', 'Ed Hardy'],
    grade: 'A',
    quantity: 300,
    askPrice: 7.0,
  },
  {
    id: 'bale_meridian_designer',
    supplierId: 'sup_wholesale_meridian',
    description: '~90 designer-adjacent 90s pieces, Grade A. Low volume, high value.',
    category: 'designer vintage',
    era: '90s',
    brands: ['Burberry', 'Moschino'],
    grade: 'A',
    quantity: 90,
    askPrice: 22.0,
  },
  {
    id: 'bale_kappa_denim',
    supplierId: 'sup_bulk_kappa',
    description: '~800 mixed vintage denim, mostly Levi/Wrangler, Grade C/D, unsorted. Very cheap.',
    category: 'denim',
    era: 'mixed',
    brands: ['Levi', 'Wrangler', 'assorted'],
    grade: 'D',
    quantity: 800,
    askPrice: 3.0,
  },
  {
    id: 'bale_kappa_sportmix',
    supplierId: 'sup_bulk_kappa',
    description:
      '~350 unsorted bulk, "some branded 90s sportswear mixed in" per supplier, mostly Grade C. High variance, cheap.',
    category: 'mixed',
    era: '90s-mixed',
    brands: ['assorted', 'Nike', 'adidas'],
    grade: 'C',
    quantity: 350,
    askPrice: 3.2,
  },
];

/** Demo web-catalog products for /collections and /api/products (raw JSON fixtures). */
interface ProductFixture {
  id: number;
  name: string;
  price: number;
  original_price?: number;
  currency: string;
  price_per_piece: number;
  collection: string;
  url: string;
}

const productFixtures = [
  ...(mensProductsJson as ProductFixture[]),
  ...(womensProductsJson as ProductFixture[]),
];

const catalogProducts: Product[] = productFixtures.map((p) => ({
  id: p.id,
  collection: p.collection as Product['collection'],
  name: p.name,
  price: p.price,
  originalPrice: p.original_price ?? null,
  currency: p.currency,
  pricePerPiece: p.price_per_piece,
  url: p.url,
}));

async function seed(): Promise<void> {
  await resetDb();
  for (const b of buyers) await upsertBuyer(b);
  for (const s of suppliers) await upsertSupplier(s);
  for (const b of bales) await insertBale(b);
  for (const p of catalogProducts) await insertProduct(p);
  console.log(
    `Seeded ${buyers.length} buyer(s), ${suppliers.length} suppliers, ${bales.length} bales, ` +
      `${catalogProducts.length} catalog products.`,
  );
  await closeDb();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
