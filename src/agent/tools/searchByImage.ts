import { type AgentToolResult, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { searchByImage } from '../../image-search.js';
import type { Product } from '../../types.js';

/**
 * search_by_image: find catalog lots that look like the photo the buyer just
 * sent on WhatsApp.
 *
 * The image is closed over rather than passed as a parameter — the model cannot
 * hand us an image through tool args, and we want the *actual* inbound photo
 * searched, not the model's paraphrase of it.
 */
export function makeSearchByImageTool(image: string) {
  return defineTool({
    name: 'search_by_image',
    label: 'Search by Image',
    description:
      'Find catalog lots that visually match the photo the buyer just sent. Call this whenever the buyer sends a photo of something they want to source. Returns the closest lots with a visual-similarity score, plus what was read off their photo.',
    promptSnippet: "Finds catalog lots that look like the buyer's photo.",
    parameters: Type.Object({
      collection: Type.Optional(
        Type.Union([Type.Literal('mens-unisex'), Type.Literal('womens')], {
          description: 'Restrict to one collection. Omit to search the whole catalog.',
        }),
      ),
      limit: Type.Optional(
        Type.Integer({
          description: 'How many lots to return. Default 5.',
          minimum: 1,
          maximum: 20,
        }),
      ),
    }),
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const { query, matches } = await searchByImage(image, {
        limit: params.limit ?? 5,
        collection: params.collection as Product['collection'] | undefined,
      });

      if (matches.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No visually similar lots in the catalog.' }],
          details: { query, matches: [] },
        };
      }

      const read =
        `Read from the photo: ${query.garments.join(', ')} | ${query.style} | ${query.era} | ` +
        `brands: ${query.brands.length ? query.brands.join(', ') : 'none legible'} | ` +
        `colours: ${query.colours.join(', ')} | print: ${query.print}`;

      const lines = matches.map(
        (m, i) =>
          `${i + 1}. ${m.name}\n   ${m.collection}#${m.id} | visual match ${(m.score * 100).toFixed(0)}%\n   ${m.imageUrl}`,
      );

      return {
        content: [{ type: 'text' as const, text: `${read}\n\nCLOSEST LOTS\n${lines.join('\n')}` }],
        details: { query, matches },
      };
    },
  });
}
