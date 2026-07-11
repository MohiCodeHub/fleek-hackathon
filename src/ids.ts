import { randomUUID } from 'node:crypto';

/** Short prefixed id, e.g. mnd_a1b2c3d4. */
export function id(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
