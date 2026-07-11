import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const personaDir = join(here, '..', 'personas');

const cache = new Map<string, string>();

export type PersonaName = 'abhi' | 'sanket' | 'supplier-responder';

/** Load a persona system prompt from personas/<name>.md (cached). */
export function loadPersona(name: PersonaName): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const text = readFileSync(join(personaDir, `${name}.md`), 'utf8');
  cache.set(name, text);
  return text;
}
