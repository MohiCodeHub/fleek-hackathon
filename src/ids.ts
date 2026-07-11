import { randomUUID } from 'node:crypto';

/** Prefixed id, e.g. mnd_<full-uuid>. */
export function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
