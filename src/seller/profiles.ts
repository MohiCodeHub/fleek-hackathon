import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../log.js';

/**
 * The "context layer": AM-Brain buyer + supplier profiles under
 * `am-brain-hackathon/profiles/`. The supply-side agent reads these to ground
 * its counteroffer recommendation to the seller (buyer's converting behaviour,
 * the seller's own stock/pricing history and recent variance).
 */

const here = dirname(fileURLToPath(import.meta.url));
const profilesDir = join(here, '..', '..', 'am-brain-hackathon', 'profiles');

/**
 * Map the demo's seeded suppliers/buyers onto AM-Brain profile files. Overridable
 * per-run via env (SELLER_PROFILE / BUYER_PROFILE) for other pairings.
 */
const SUPPLIER_PROFILE: Record<string, string> = {
  sup_raghouse_atlas: 'mumbai-mills-vintage-supplier',
  'atlas rag house': 'mumbai-mills-vintage-supplier',
  sup_baler_nord: 'second-spin-supply-supplier',
  sup_wholesale_meridian: 'the-thread-archive-supplier',
  sup_bulk_kappa: 'kavya-exports-supplier',
};

const BUYER_PROFILE: Record<string, string> = {
  '+14155550101': '9900000000102-jasmine-okafor',
};

const DEFAULT_SUPPLIER_PROFILE = 'mumbai-mills-vintage-supplier';
const DEFAULT_BUYER_PROFILE = '9900000000102-jasmine-okafor';

/** Budget per profile excerpt (chars) — enough grounding, small token cost. */
const EXCERPT_BUDGET = 2600;

function readProfile(kind: 'buyers' | 'suppliers', slug: string): string | null {
  try {
    return readFileSync(join(profilesDir, kind, `${slug}.md`), 'utf8');
  } catch {
    return null;
  }
}

/** Frontmatter block + the narrative Headline — the highest-signal grounding. */
function excerpt(markdown: string): string {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fm?.[1] ?? '';
  const headlineMatch = markdown.match(
    /##?\s*(?:Headline|[^\n]*Headline)[^\n]*\n([\s\S]*?)(?:\n##?\s|\n---|\n$)/i,
  );
  const headline = headlineMatch?.[1]?.trim() ?? '';
  const combined = `${frontmatter}\n\nHEADLINE\n${headline}`.trim();
  return combined.length > EXCERPT_BUDGET ? `${combined.slice(0, EXCERPT_BUDGET)}…` : combined;
}

export interface ProfileContext {
  buyerSlug: string | null;
  supplierSlug: string | null;
  buyer: string;
  supplier: string;
  /** Display names pulled from the profile frontmatter, so the agent's copy
   * matches the context layer it's reasoning over. */
  buyerName: string | null;
  supplierName: string | null;
}

/** Read a single frontmatter field (e.g. `name:` / `shop_name:`). */
function frontmatterField(markdown: string, field: string): string | null {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fm?.[1];
  if (!frontmatter) return null;
  const m = frontmatter.match(new RegExp(`^${field}:\\s*(.+?)\\s*(?:#.*)?$`, 'm'));
  return m?.[1]?.trim() || null;
}

/**
 * Load grounding excerpts for a buyer (by phone) and supplier (by seeded id or
 * name). Missing files degrade gracefully to empty strings.
 */
export function loadProfileContext(buyerKey: string, supplierKey: string): ProfileContext {
  const supplierSlug =
    process.env.SELLER_PROFILE ||
    SUPPLIER_PROFILE[supplierKey.toLowerCase()] ||
    SUPPLIER_PROFILE[supplierKey] ||
    DEFAULT_SUPPLIER_PROFILE;
  const buyerSlug = process.env.BUYER_PROFILE || BUYER_PROFILE[buyerKey] || DEFAULT_BUYER_PROFILE;

  const buyerMd = readProfile('buyers', buyerSlug);
  const supplierMd = readProfile('suppliers', supplierSlug);
  if (!buyerMd) log.warn('seller.profile_missing', { kind: 'buyer', slug: buyerSlug });
  if (!supplierMd) log.warn('seller.profile_missing', { kind: 'supplier', slug: supplierSlug });

  return {
    buyerSlug: buyerMd ? buyerSlug : null,
    supplierSlug: supplierMd ? supplierSlug : null,
    buyer: buyerMd ? excerpt(buyerMd) : '',
    supplier: supplierMd ? excerpt(supplierMd) : '',
    buyerName: buyerMd ? frontmatterField(buyerMd, 'name') : null,
    supplierName: supplierMd
      ? (frontmatterField(supplierMd, 'shop_name') ?? frontmatterField(supplierMd, 'entity_id'))
      : null,
  };
}
