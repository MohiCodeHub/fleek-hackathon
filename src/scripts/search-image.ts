/**
 * Search the catalog by image from the CLI — the same path Abhi takes when a
 * buyer sends a photo on WhatsApp.
 *
 * Usage:
 *   tsx src/scripts/search-image.ts <image-url-or-path> [limit]
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { indexSize, searchByImage } from '../image-search.js';

/** Local files must be inlined as data: URIs; URLs pass straight through. */
function toImageRef(arg: string): string {
  if (/^https?:\/\//.test(arg) || arg.startsWith('data:')) return arg;
  if (!existsSync(arg)) throw new Error(`No such image: ${arg}`);
  const ext = extname(arg).slice(1).toLowerCase() || 'jpeg';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${readFileSync(arg).toString('base64')}`;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx src/scripts/search-image.ts <image-url-or-path> [limit]');
    process.exit(1);
  }
  const limit = Number(process.argv[3]) || 5;

  console.log(`Searching ${indexSize()} indexed catalog images...\n`);
  const { query, matches } = await searchByImage(toImageRef(arg), { limit });

  console.log('READ FROM THE PHOTO');
  console.log(`  garments: ${query.garments.join(', ')}`);
  console.log(`  style:    ${query.style}  |  era: ${query.era}`);
  console.log(`  brands:   ${query.brands.length ? query.brands.join(', ') : '(none legible)'}`);
  console.log(`  colours:  ${query.colours.join(', ')}  |  print: ${query.print}`);
  console.log(`  ${query.summary}\n`);

  console.log(`TOP ${matches.length} VISUAL MATCHES`);
  matches.forEach((m, i) => {
    console.log(`\n${i + 1}. [${m.score.toFixed(3)}] ${m.name}`);
    console.log(`   ${m.collection}#${m.id}  ${m.imageUrl}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
